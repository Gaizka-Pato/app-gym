// Traer el historial de otra app (él, 2026-11-08: "en Ajustes que se traiga el histórico de FitNotes, como hicimos
// Lore y yo"). Vale la copia de seguridad de FitNotes (.fitnotes, que es una base SQLite: se lee con sql.js, que
// solo se descarga al importar) y su exportación CSV. Cada ejercicio de FitNotes se empareja con uno de tu lista o
// se crea; lo traído va al histórico del móvil (Almacen.importarHistorico), como el FitNotes de antes.
var Importar = (function () {
  // ---- Leer (sin DOM: se prueba en Node) ----

  // Filas de un CSV con comillas ("a, b" y "" dentro).
  function filasCSV(texto) {
    var filas = [];
    var fila = [];
    var campo = '';
    var dentro = false;
    var t = String(texto || '').replace(/^﻿/, '');
    for (var i = 0; i < t.length; i++) {
      var c = t.charAt(i);
      if (dentro) {
        if (c === '"' && t.charAt(i + 1) === '"') { campo += '"'; i++; }
        else if (c === '"') dentro = false;
        else campo += c;
      } else if (c === '"') dentro = true;
      else if (c === ',' || c === ';') { fila.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && t.charAt(i + 1) === '\n') i++;
        fila.push(campo); campo = '';
        if (fila.some(function (x) { return x.trim() !== ''; })) filas.push(fila);
        fila = [];
      } else campo += c;
    }
    fila.push(campo);
    if (fila.some(function (x) { return x.trim() !== ''; })) filas.push(fila);
    return filas;
  }

  function numero(t) {
    var n = parseFloat(String(t == null ? '' : t).replace(',', '.'));
    return isFinite(n) ? n : 0;
  }

  // "1:30:00", "12:05" o segundos.
  function segundos(t) {
    var s = String(t || '').trim();
    if (!s) return 0;
    if (s.indexOf(':') < 0) return Math.round(numero(s));
    return s.split(':').reduce(function (acc, p) { return acc * 60 + numero(p); }, 0);
  }

  // "2026-09-14", "14/09/2026" o "2026-09-14 18:03:00" → "2026-09-14".
  function fecha(t) {
    var s = String(t || '').trim();
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
    if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return null;
  }

  function normal(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  // Lo leído: { ejercicios: { nombre: { categoria, dias: { fecha: [[kg, reps, seg, km]] }, series } }, series, desde, hasta }
  function vacio() { return { ejercicios: {}, series: 0, desde: null, hasta: null }; }

  function anadir(r, nombre, categoria, f, kg, reps, seg, km) {
    nombre = String(nombre || '').trim();
    if (!nombre || !f) return;
    var e = r.ejercicios[nombre] || (r.ejercicios[nombre] = { categoria: String(categoria || '').trim(), dias: {}, series: 0 });
    var serie = [Math.round(kg * 100) / 100, Math.round(reps)];
    if (seg || km) serie.push(Math.round(seg), Math.round(km * 100) / 100);
    (e.dias[f] || (e.dias[f] = [])).push(serie);
    e.series++;
    r.series++;
    if (!r.desde || f < r.desde) r.desde = f;
    if (!r.hasta || f > r.hasta) r.hasta = f;
  }

  // El CSV que exporta FitNotes (Date, Exercise, Category, Weight (kgs), Reps, Distance, Distance Unit, Time…), en
  // inglés o en castellano. Las columnas se buscan por el nombre.
  function leerCSV(texto) {
    var filas = filasCSV(texto);
    if (filas.length < 2) throw new Error('El archivo está vacío');
    var cab = filas[0].map(normal);
    function col() {
      var nombres = Array.prototype.slice.call(arguments);
      return cab.findIndex(function (c) { return nombres.some(function (n) { return c === n || c.indexOf(n) === 0; }); });
    }
    var cFecha = col('date', 'fecha');
    var cEj = col('exercise', 'ejercicio');
    var cCat = col('category', 'categoria');
    var cKg = col('weight', 'peso');
    var cUnidad = col('weight unit', 'unidad de peso');
    var cReps = col('reps', 'repeticiones');
    var cDist = col('distance', 'distancia');
    var cDistU = col('distance unit', 'unidad de distancia');
    var cTiempo = col('time', 'duration', 'tiempo', 'duracion');
    if (cFecha < 0 || cEj < 0) throw new Error('No parece un CSV de FitNotes (faltan Fecha y Ejercicio)');
    var enLibras = cKg >= 0 && /lb/.test(cab[cKg]);
    var r = vacio();
    filas.slice(1).forEach(function (f) {
      var kg = cKg >= 0 ? numero(f[cKg]) : 0;
      var libras = enLibras || (cUnidad >= 0 && /lb/.test(normal(f[cUnidad])));
      if (libras) kg = kg * 0.45359237;
      var km = cDist >= 0 ? numero(f[cDist]) : 0;
      var uDist = cDistU >= 0 ? normal(f[cDistU]) : 'km';
      if (/^m$|metro/.test(uDist)) km = km / 1000;
      else if (/mi/.test(uDist)) km = km * 1.609344;
      anadir(r, f[cEj], cCat >= 0 ? f[cCat] : '', fecha(f[cFecha]), kg, cReps >= 0 ? numero(f[cReps]) : 0,
        cTiempo >= 0 ? segundos(f[cTiempo]) : 0, km);
    });
    if (!r.series) throw new Error('No hay series en el archivo');
    return r;
  }

  // La copia de seguridad (.fitnotes): una base SQLite. db: la de sql.js (con exec).
  function leerBase(db) {
    var filas = db.exec('SELECT e.name, c.name, t.date, t.metric_weight, t.reps, t.distance, t.duration_seconds, t.unit ' +
      'FROM training_log t JOIN exercise e ON e._id = t.exercise_id LEFT JOIN Category c ON c._id = e.category_id ORDER BY t.date, t._id');
    var r = vacio();
    ((filas[0] || {}).values || []).forEach(function (f) {
      // FitNotes guarda la distancia en metros (y el peso siempre en kg, aunque enseñe libras).
      anadir(r, f[0], f[1], fecha(f[2]), Number(f[3]) || 0, Number(f[4]) || 0, Number(f[6]) || 0, (Number(f[5]) || 0) / 1000);
    });
    if (!r.series) throw new Error('No hay series en la copia');
    return r;
  }

  // Categoría de FitNotes → grupo muscular de Ares.
  var CATEGORIAS = [
    [/shoulder|hombro/, 'Hombro'], [/tricep/, 'Tríceps'], [/bicep/, 'Bíceps'], [/chest|pecho/, 'Pecho'],
    [/back|espalda/, 'Espalda'], [/leg|pierna/, 'Cuádriceps'], [/abs|abdom|core/, 'Abdomen'], [/cardio/, 'Cardio'],
    [/glute|gluteo|femoral|hamstring/, 'Femoral y glúteo'], [/calf|calves|gemelo/, 'Gemelo'],
  ];
  function grupoDeCategoria(cat) {
    var c = normal(cat);
    var x = CATEGORIAS.filter(function (p) { return p[0].test(c); })[0];
    return x ? x[1] : (String(cat || '').trim() || 'Otros');
  }

  // El ejercicio de tu lista que más se parece: el mismo nombre sin tildes ni mayúsculas o, si no, el que comparte
  // todas sus palabras con el de FitNotes (o al revés) y más palabras que ningún otro. Con un empate, ninguno.
  function palabras(t) {
    return normal(t).replace(/[()]/g, ' ').split(/\s+/).filter(function (p) { return p.length > 2; });
  }
  function emparejar(nombre, lista) {
    var n = palabras(nombre);
    var igual = lista.filter(function (x) { return palabras(x).join(' ') === n.join(' '); })[0];
    if (igual) return igual;
    var mejor = null, puntos = 0, empate = false;
    lista.forEach(function (x) {
      var m = palabras(x);
      if (!m.length || !n.length) return;
      var comunes = m.filter(function (p) { return n.indexOf(p) >= 0; }).length;
      var encaja = comunes === m.length || comunes === n.length;
      if (!encaja) return;
      if (comunes > puntos) { mejor = x; puntos = comunes; empate = false; }
      else if (comunes === puntos) empate = true;
    });
    return empate ? null : mejor;
  }

  // Lo que se guarda: { nombreDestino: [{ f, s }] } juntando los de FitNotes que van al mismo. corporales: nombres
  // de destino de peso corporal (FitNotes apunta el peso del cuerpo en sus kg: van a 0).
  function porDestino(leido, destinos, corporales) {
    var salida = {};
    Object.keys(leido.ejercicios).forEach(function (nombre) {
      var d = destinos[nombre];
      if (!d) return;
      var corp = (corporales || []).indexOf(d) >= 0;
      var dias = salida[d] || (salida[d] = {});
      Object.keys(leido.ejercicios[nombre].dias).forEach(function (f) {
        var series = leido.ejercicios[nombre].dias[f].map(function (s) { var c = s.slice(); if (corp) c[0] = 0; return c; });
        dias[f] = (dias[f] || []).concat(series);
      });
    });
    var lista = {};
    Object.keys(salida).forEach(function (d) {
      lista[d] = Object.keys(salida[d]).sort().map(function (f) { return { f: f, s: salida[d][f] }; });
    });
    return lista;
  }

  // ---- Pantalla ----

  function h(etiqueta, atributos, hijos) {
    var n = document.createElement(etiqueta);
    Object.keys(atributos || {}).forEach(function (k) {
      if (k === 'texto') n.textContent = atributos[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), atributos[k]);
      else if (atributos[k] != null && atributos[k] !== false) n.setAttribute(k, atributos[k] === true ? '' : atributos[k]);
    });
    (hijos || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  var SQL_JS = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/';
  var cargandoSQL = null;
  function sqljs() {
    if (cargandoSQL) return cargandoSQL;
    cargandoSQL = new Promise(function (ok, mal) {
      var s = document.createElement('script');
      s.src = SQL_JS + 'sql-wasm.js';
      s.onload = function () { window.initSqlJs({ locateFile: function (f) { return SQL_JS + f; } }).then(ok, mal); };
      s.onerror = function () { cargandoSQL = null; mal(new Error('Hace falta conexión para leer la copia de FitNotes')); };
      document.head.appendChild(s);
    });
    return cargandoSQL;
  }

  function leerArchivo(archivo) {
    if (/\.csv$/i.test(archivo.name) || /csv|text/.test(archivo.type)) {
      return archivo.text().then(leerCSV);
    }
    return Promise.all([sqljs(), archivo.arrayBuffer()]).then(function (r) {
      var db;
      try { db = new r[0].Database(new Uint8Array(r[1])); } catch (e) { throw new Error('No es una copia de FitNotes ni un CSV'); }
      try { return leerBase(db); } catch (e) { throw new Error(e.message && /no such table/.test(e.message) ? 'No es una copia de FitNotes' : e.message); }
      finally { db.close(); }
    });
  }

  function abrir() {
    var archivo = h('input', { type: 'file', accept: '.fitnotes,.csv,text/csv,application/octet-stream', 'aria-label': 'Archivo de FitNotes' });
    var estado = h('p', { class: 'detalle' });
    archivo.addEventListener('change', function () {
      var f = archivo.files && archivo.files[0];
      if (!f) return;
      estado.textContent = 'Leyendo ' + f.name + '…';
      leerArchivo(f).then(emparejarPantalla, function (e) { estado.textContent = ''; App.avisar(e.message || 'No se pudo leer', true); });
    });
    App.abrirSelector('Traer de FitNotes', [
      h('ol', { class: 'importar-pasos' }, [
        h('li', { texto: 'En FitNotes: Ajustes → Copia de seguridad → Crear copia (o Exportar a CSV).' }),
        h('li', { texto: 'Guárdala en el móvil y elígela aquí.' }),
      ]),
      h('label', { class: 'principal importar-elegir' }, [h('span', { texto: 'Elegir archivo' }), archivo]),
      estado,
    ]);
  }

  function emparejarPantalla(leido) {
    var lista = ((Almacen.plan() || {}).grupos || []).map(function (f) { return f[0]; });
    var nombres = Object.keys(leido.ejercicios).sort(function (a, b) { return leido.ejercicios[b].series - leido.ejercicios[a].series; });
    var elegidos = {};
    var CREAR = '__crear__';
    var NADA = '__nada__';
    var filas = nombres.map(function (n) {
      var e = leido.ejercicios[n];
      var dias = Object.keys(e.dias).length;
      var auto = emparejar(n, lista);
      elegidos[n] = auto || CREAR;
      var select = h('select', { 'aria-label': 'Con qué ejercicio va ' + n, onchange: function () { elegidos[n] = select.value; } },
        [h('option', { value: CREAR, texto: '+ Crear "' + n + '"' }), h('option', { value: NADA, texto: 'No traer' })]
          .concat(lista.slice().sort(function (a, b) { return a.localeCompare(b, 'es'); }).map(function (x) { return h('option', { value: x, texto: x }); })));
      select.value = elegidos[n];
      return h('div', { class: 'importar-fila' }, [
        h('div', {}, [h('span', { class: 'importar-nombre', texto: n }), h('span', { class: 'detalle', texto: dias + (dias === 1 ? ' día' : ' días') + ' · ' + grupoDeCategoria(e.categoria) })]),
        select,
      ]);
    });
    App.abrirSelector('Traer de FitNotes', [
      h('p', { class: 'detalle', texto: leido.series + ' series de ' + nombres.length + ' ejercicios, del ' + Grafica.fechaCorta(leido.desde) + ' al ' + Grafica.fechaCorta(leido.hasta) + '. Elige con qué ejercicio de tu lista va cada uno.' }),
      h('div', { class: 'importar-lista' }, filas),
      h('button', { type: 'button', class: 'principal', texto: 'Traer historial', onclick: function () {
        var destinos = {};
        nombres.forEach(function (n) {
          var v = elegidos[n];
          if (v === NADA) return;
          if (v === CREAR) {
            var e = leido.ejercicios[n];
            var grupo = grupoDeCategoria(e.categoria);
            // Sin kg en ninguna serie y con reps: de peso corporal; con segundos: por tiempo.
            var series = [].concat.apply([], Object.keys(e.dias).map(function (f) { return e.dias[f]; }));
            var tiempo = series.some(function (s) { return s[2] > 0; }) && !series.some(function (s) { return s[1] > 0; });
            Grupos.guardarGrupo(n, grupo, '', '');
            if (tiempo || grupo === 'Cardio') Almacen.guardarTipo(n, 'tiempo');
            destinos[n] = n;
          } else destinos[n] = v;
        });
        var corporales = Object.keys(destinos).map(function (k) { return destinos[k]; }).filter(function (d) { return Grupos.esCorporal(d); });
        var n = Almacen.importarHistorico(porDestino(leido, destinos, corporales));
        App.cerrarSelector();
        App.avisar('Traídos ' + n + ' días de FitNotes');
        App.repintar();
      } }),
    ]);
  }

  return {
    filasCSV: filasCSV,
    leerCSV: leerCSV,
    leerBase: leerBase,
    grupoDeCategoria: grupoDeCategoria,
    emparejar: emparejar,
    porDestino: porDestino,
    abrir: abrir,
    revisar: emparejarPantalla,
  };
})();

if (typeof module !== 'undefined') module.exports = Importar;
