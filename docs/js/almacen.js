// Datos de la app en el móvil: configuración, plan e historial guardados para usarlos sin cobertura,
// y las series apuntadas, que se suben al Excel en cuanto hay conexión.
var Almacen = (function () {
  var PREFIJO = 'gymapp.';
  var oyentes = [];
  var sincronizando = null;

  // El historial son 310 KB y el plan no es pequeño: deshacer su JSON cuesta, y hay pantallas que los piden
  // cientos de veces (Historial pedía el historial 348 veces y el plan 894, y tardaba 0,7 s en salir). Se guarda
  // lo ya leído hasta que se escriba esa misma clave.
  // Ojo: se devuelve siempre el mismo objeto, así que nadie debe cambiarlo por su cuenta sin guardarlo después
  // (el único sitio que lo hace, actualizarUltimaSesion, escribe justo detrás y con eso se olvida lo guardado).
  var memoria = {};

  function leer(clave, porDefecto) {
    if (clave in memoria) return memoria[clave] === undefined ? porDefecto : memoria[clave];
    try {
      var v = localStorage.getItem(PREFIJO + clave);
      memoria[clave] = v ? JSON.parse(v) : undefined;
      return memoria[clave] === undefined ? porDefecto : memoria[clave];
    } catch (e) {
      return porDefecto;
    }
  }

  function escribir(clave, valor) {
    delete memoria[clave];
    try {
      localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
    } catch (e) {
      console.warn('No se pudo guardar en el móvil', e);
    }
  }

  // Si la app está abierta dos veces (dos pestañas), lo guardado aquí se queda viejo: se tira entero.
  window.addEventListener('storage', function () { memoria = {}; });

  function avisar() {
    oyentes.forEach(function (f) { f(); });
  }

  function config() {
    return leer('config', null);
  }

  function guardarConfig(c) {
    escribir('config', c);
    avisar();
  }

  function clavePersona(nombre) {
    var c = config();
    return nombre + '.' + (c ? c.persona : 'nadie');
  }

  // Cuánto se espera a cada acción. El historial de años de FitNotes tarda más de medio minuto la primera vez,
  // porque Google lo monta entero; después lo tiene en su caché y contesta en unos segundos.
  var ESPERA = { historial: 150000, plan: 60000, progreso: 60000, exportar: 150000, ponerExcel: 180000 };

  // Un dato falta si no viene o si es una tabla vacía (las listas sí pueden venir vacías de verdad,
  // como las filas del ciclo cuando todavía no hay nada apuntado).
  function falta(valor) {
    if (valor == null) return true;
    return typeof valor === 'object' && !Array.isArray(valor) && !Object.keys(valor).length;
  }

  // campo: dato que tiene que traer la respuesta. Google devuelve de vez en cuando una página de error
  // o la respuesta del doGet ({ok, app}) sin datos; en ese caso se reintenta y, si sigue igual, se avisa
  // en vez de guardar nada (una vez se quedó guardado un historial vacío y todo salía "sin series").
  function llamar(accion, datos, campo) {
    var c = config();
    if (!c || !c.url) return Promise.reject(new Error('Falta configurar la app'));
    var cuerpo = JSON.stringify(Object.assign({ clave: c.clave, persona: c.persona, accion: accion }, datos || {}));

    function intento(quedan) {
      var controlador = new AbortController();
      var espera = setTimeout(function () { controlador.abort(); }, ESPERA[accion] || 45000);
      // text/plain evita la petición previa de CORS, que Apps Script no contesta.
      return fetch(c.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: cuerpo,
        signal: controlador.signal,
      })
        .then(function (r) { return r.json(); })
        .then(function (r) {
          if (r.ok === false) throw new Error(r.error || 'Error de la API');
          if (campo && falta(r[campo])) {
            if (quedan > 0) return intento(quedan - 1);
            throw new Error('Google no ha devuelto los datos; prueba otra vez');
          }
          return r;
        })
        .catch(function (e) {
          // Una página de error de Google llega como JSON roto; se vuelve a intentar.
          if (quedan > 0 && (e.name === 'AbortError' || e.name === 'SyntaxError')) return intento(quedan - 1);
          throw e;
        })
        .finally(function () { clearTimeout(espera); });
    }

    return intento(2);
  }

  function hoyISO(fecha) {
    var d = fecha || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function horaActual() {
    var d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
  }

  function nuevoId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function normalizar(nombre) {
    return String(nombre || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // ---- Plan e historial (se refrescan con conexión y se usan guardados sin ella) ----

  // Un plan guardado sin entrenos (la primera versión guardaba lo que viniera de Google) no vale: se vuelve a pedir.
  // El plan que usa la app. Los entrenos salen de la rutina en uso (él, 2026-10-10: "que todo funcione sin el
  // Excel"); el resto (lista de ejercicios, 1RM del Recopilatorio…) de lo último que dio la API. Sin rutina, o con
  // una cuyos entrenos no son los del calendario de los dos (A1…B2), los del Excel como antes.
  var montadoPlan = { p: null, r: null, rms: null, tipos: null, valor: null };
  function plan() {
    var p = leer(clavePersona('plan'), null);
    if (!(p && p.entrenos && typeof p.entrenos === 'object')) return null;
    var r = rutina();
    var propiosRM = rmsPropios();
    var propiosTipos = tiposPropios();
    if (montadoPlan.p === p && montadoPlan.r === r && montadoPlan.rms === propiosRM && montadoPlan.tipos === propiosTipos) return montadoPlan.valor;
    // Manda el móvil (él, 2026-11-06: "el Excel es solo una tabla"): los 1RM y el tipo de cada ejercicio que había en
    // el Excel se traen una vez (traerRMsYTipos) y desde entonces solo cuentan los del móvil. Hasta que se traigan, los
    // del móvil mandan sobre los del Excel.
    var traidos = !!leer(clavePersona('rmsYTiposTraidos'), null);
    var valor = Object.assign({}, p, { rms: traidos ? propiosRM : Object.assign({}, p.rms || {}, propiosRM) });
    if ((traidos || Object.keys(propiosTipos).length) && Array.isArray(p.grupos) && typeof Grupos !== 'undefined') {
      valor.grupos = p.grupos.map(function (f) {
        var t = propiosTipos[Grupos.normalizar(f[0])];
        if (!t && !traidos) return f;
        var fila = f.slice();
        fila[2] = t ? t.tipo : '';
        return fila;
      });
    }
    if (r && typeof Rutina !== 'undefined' && rutinaDelCalendario(r)) {
      var entrenos = Rutina.aPlan(r);
      Object.keys(entrenos).forEach(function (id) {
        entrenos[id].forEach(function (ej) {
          // Del plan del Excel solo se coge dónde va la copia del 1RM (su casilla amarilla), nunca un dato.
          var original = (p.entrenos[id] || []).filter(function (x) { return x.id === ej.id; })[0];
          if (original) ['celdaRM', 'entreno', 'fila'].forEach(function (k) { if (!(k in ej) && original[k] != null) ej[k] = original[k]; });
          if (ej.tipo !== 'principal' || typeof Grupos === 'undefined') return;
          // Lo que el Excel calcula con otra fórmula: las asistidas (la ayuda va al revés) y las de su peso (sin kg).
          var clase = Grupos.claseSinPlan(ej.nombreCorto || ej.nombre, ej.rm, valor.grupos);
          if (clase === 'asistido') ej.columnas.forEach(function (c) { c.kg = Grupos.kgAsistido(ej.rm, c.detalle); });
          if (clase === 'corporal') ej.columnas.forEach(function (c) { c.kg = null; });
        });
      });
      valor.entrenos = entrenos;
      valor.rutina = r.id;
    }
    montadoPlan = { p: p, r: r, rms: propiosRM, tipos: propiosTipos, valor: valor };
    return valor;
  }

  // ---- 1RM en el móvil (él, 2026-10-10) ----
  // El AMRAP, el máximo de reps de las de su peso, la ayuda de las asistidas y el 1RM de una variante nueva se
  // guardan aquí y mandan; al Excel (casilla amarilla y Recopilatorio) van de copia por la cola de abajo, que se
  // reintenta en cada refresco si no hay conexión. Un principal de la rutina en uso lleva el 1RM nuevo.
  function rmsPropios() {
    return leer(clavePersona('rms'), {});
  }

  function guardarRMPropio(nombre, valor, ejercicioId) {
    var clave = typeof Grupos !== 'undefined' ? Grupos.normalizar(nombre) : normalizar(nombre);
    var lista = Object.assign({}, rmsPropios());
    lista[clave] = { rm: valor, fecha: hoyISO(), nombre: nombre };
    escribir(clavePersona('rms'), lista);
    var r = rutina();
    if (r && ejercicioId) {
      var cambiada = JSON.parse(JSON.stringify(r));
      var tocada = false;
      cambiada.entrenos.forEach(function (e) {
        e.ejercicios.forEach(function (ej) {
          if (ej.tipo === 'principal' && (ej.id === ejercicioId || Grupos.normalizar(ej.nombre) === clave)) { ej.rm = valor; tocada = true; }
        });
      });
      if (tocada) guardarRutina(cambiada);
    }
    avisar();
  }

  // ---- Tipo de cada ejercicio en el móvil (él, 2026-10-26: "el usuario debe poder poner si es asistido o no") ----
  // { clave: { tipo: 'asistida' | 'normal' | '' | lo que hubiera, nombre } }. Manda sobre la columna "Tipo <persona>"
  // del Excel común, que recibe la copia con la acción `tipos`.
  // Siempre el mismo objeto vacío, para que plan() no se vuelva a montar en cada lectura.
  var SIN_TIPOS = {};
  function tiposPropios() {
    return leer(clavePersona('tipos'), null) || SIN_TIPOS;
  }

  function guardarTipo(nombre, tipo) {
    var lista = Object.assign({}, tiposPropios());
    lista[Grupos.normalizar(nombre)] = { tipo: tipo, nombre: nombre };
    escribir(clavePersona('tipos'), lista);
    var tipos = {};
    tipos[nombre] = tipo;
    avisar();
    return copiarAlExcel('tipos', { tipos: tipos });
  }

  // ---- Cambiar el nombre de un ejercicio en lo guardado en el móvil ----
  // La acción `renombrar` lo cambia en los Excel, pero desde que manda la app el historial sale de aquí: sin esto,
  // las series se quedaban con el nombre viejo. Series (y "Sustituye a"), histórico traído, 1RM, tipos y rutinas.
  function renombrarLocal(viejo, nuevo) {
    var G = typeof Grupos !== 'undefined' ? Grupos.normalizar : normalizar;
    var kv = G(viejo);
    function es(n) { return n && G(n) === kv; }
    function conPrefijo(n) {   // respeta "WEAK POINT: "
      var m = String(n).match(/^WEAK POINT:\s*/i);
      return (m ? m[0] : '') + nuevo;
    }
    var lista = series();
    var tocadas = false;
    var cambiadas = lista.map(function (s) {
      if (!es(s.ejercicio) && !es(s.sustituye)) return s;
      tocadas = true;
      var c = Object.assign({}, s);
      if (es(c.ejercicio)) c.ejercicio = conPrefijo(c.ejercicio);
      if (es(c.sustituye)) c.sustituye = conPrefijo(c.sustituye);
      return c;
    });
    if (tocadas) escribir(clavePersona('series'), cambiadas);
    var propios = datosPropios();
    if (propios) {
      var nv = normalizar(nuevo);
      var copia = Object.assign({}, propios, { historico: Object.assign({}, propios.historico), info: Object.assign({}, propios.info || {}) });
      var cambio = false;
      Object.keys(copia.historico).forEach(function (k) {
        if (!es(k) || k === nv) return;
        copia.historico[nv] = (copia.historico[nv] || []).concat(copia.historico[k]).sort(function (a, b) { return a.f < b.f ? -1 : a.f > b.f ? 1 : 0; });
        delete copia.historico[k];
        cambio = true;
      });
      Object.keys(copia.info).forEach(function (k) {
        if (!es(k) && !es((copia.info[k] || {}).nombre)) return;
        var i = Object.assign({}, copia.info[k], { nombre: nuevo });
        delete copia.info[k];
        copia.info[nv] = i;
        cambio = true;
      });
      if (cambio) escribir(clavePersona('propios'), copia);
    }
    ['rms', 'tipos'].forEach(function (cual) {
      var t = leer(clavePersona(cual), null);
      if (!t || !t[kv]) return;
      var c = Object.assign({}, t);
      c[G(nuevo)] = Object.assign({}, c[kv], { nombre: nuevo });
      delete c[kv];
      escribir(clavePersona(cual), c);
    });
    var r = rutinas();
    var cambiaRutina = false;
    var otras = r.lista.map(function (x) {
      var y = JSON.parse(JSON.stringify(x));
      (y.entrenos || []).forEach(function (e) {
        (e.ejercicios || []).forEach(function (ej) {
          if (es(ej.nombre)) { ej.nombre = conPrefijo(ej.nombre); cambiaRutina = true; }
        });
      });
      return y;
    });
    if (cambiaRutina) {
      escribir(clavePersona('rutinas'), Object.assign({}, r, { lista: otras }));
      subirRutina();
    }
    avisar();
  }

  // Copia al Excel: se apunta y se intenta ya; lo que no llega se reintenta en refrescarTodo (copiarPendientes).
  function copiarAlExcel(accion, datos) {
    var cola = leer(clavePersona('porCopiar'), []).concat([{ accion: accion, datos: datos, id: nuevoId() }]);
    escribir(clavePersona('porCopiar'), cola);
    return copiarPendientes();
  }

  function porCopiar() {
    return leer(clavePersona('porCopiar'), []).length;
  }

  var copiando = null;
  function copiarPendientes() {
    if (copiando) return copiando;
    var cola = leer(clavePersona('porCopiar'), []);
    if (!cola.length || !config()) return Promise.resolve(0);
    copiando = cola.reduce(function (cadena, t) {
      return cadena.then(function () {
        return llamar(t.accion, t.datos).then(function () {
          escribir(clavePersona('porCopiar'), leer(clavePersona('porCopiar'), []).filter(function (x) { return x.id !== t.id; }));
        }, function (e) {
          // Las filas de la comida van cada una por su id: si una no llega, las demás copias siguen (con una API
          // que aún no tenga la acción no se frenan los 1RM). El resto sí espera, porque el orden importa.
          if (t.accion !== 'guardarTabla') throw e;
        });
      });
    }, Promise.resolve()).then(function () { return cola.length; }, function () { return 0; })
      .then(function (n) { copiando = null; return n; });
    return copiando;
  }

  // La rutina manda si tiene los entrenos del calendario que compartís (A1, B1, A2, B2).
  function rutinaDelCalendario(r) {
    var ids = (r.entrenos || []).map(function (e) { return e.id; });
    return typeof Calendario !== 'undefined' && Calendario.ORDEN.every(function (id) { return ids.indexOf(id) >= 0; });
  }

  // El plan tal como lo dio la API (los entrenos del Excel), para importarlo a una rutina.
  function planDelExcel() {
    var p = leer(clavePersona('plan'), null);
    return p && p.entrenos && typeof p.entrenos === 'object' ? p : null;
  }

  // El 1RM con el que la fórmula del Excel (ROUND(1RM × % / 2,5) × 2,5) da los kg de todas sus columnas, o null
  // si ya cuadran con ninguno. Se prueba de medio en medio kilo alrededor de lo que sale de cada columna.
  function rmQueDaLosKg(columnas, rmActual) {
    var conKg = (columnas || []).map(function (c) {
      var m = String(c.detalle || '').match(/(\d+(?:[.,]\d+)?)\s*%/);
      return m && c.kg > 0 ? { kg: c.kg, pct: Number(m[1].replace(',', '.')) } : null;
    }).filter(Boolean);
    if (!conKg.length) return null;
    var cuadra = function (rm) { return conKg.every(function (c) { return Rutina.kgDesdeRM(rm, c.pct) === c.kg; }); };
    if (rmActual > 0 && cuadra(rmActual)) return null;
    var base = conKg[0].kg / (conKg[0].pct / 100);
    for (var d = 0; d <= 10; d += 0.5) {
      if (cuadra(Math.round((base - d) * 2) / 2)) return Math.round((base - d) * 2) / 2;
      if (cuadra(Math.round((base + d) * 2) / 2)) return Math.round((base + d) * 2) / 2;
    }
    return null;
  }

  // La primera vez, el plan del Excel pasa a ser tu rutina ("Mi plan") y desde ahí se cambia en la app.
  function importarRutinaSiFalta() {
    if (rutinas().lista.length || typeof Rutina === 'undefined') return null;
    var p = planDelExcel();
    if (!p || !Calendario.ORDEN.every(function (id) { return p.entrenos[id]; })) return null;
    var r = Rutina.desdePlan(p.entrenos, {
      orden: Calendario.ORDEN,
      // Uno sí, uno no son dos semanas que se alternan; empezando el 08/09/2026 la rotación es la de siempre.
      patron: 'DEDEDEDEDEDEDE', inicio: '2026-09-08', fin: '2026-11-09',
    });
    r.entrenos.forEach(function (e) {
      e.ejercicios.forEach(function (ej) {
        if (ej.tipo !== 'principal') return;
        if (ej.rm == null && p.rms && p.rms[Grupos.normalizar(ej.nombre)]) ej.rm = p.rms[Grupos.normalizar(ej.nombre)].rm;
        // Si los kg del Excel no salen de su casilla amarilla (al Converging Press le pasaba: casilla 70,5 y kg de
        // ~88), el 1RM que da exactamente esos kg: así al pasar a la rutina no cambia ni un kilo.
        var original = (p.entrenos[e.id] || []).filter(function (x) { return x.id === ej.id; })[0];
        if (original && Grupos.claseSinPlan(ej.nombre, ej.rm, p.grupos) === '') {
          var rm = rmQueDaLosKg(original.columnas, ej.rm);
          if (rm && rm !== ej.rm) ej.rm = rm;
        }
      });
    });
    r.id = 'R1';
    r.nombre = 'Mi plan';
    return guardarRutina(r);
  }

  // Una sola vez: los 1RM del Recopilatorio y el Tipo de la lista común que aún no estén en el móvil pasan a él. Desde
  // entonces el Excel no se lee para esto (plan() solo usa los del móvil) y solo recibe las copias.
  function traerRMsYTipos() {
    if (leer(clavePersona('rmsYTiposTraidos'), null)) return;
    var p = planDelExcel();
    if (!p || typeof Grupos === 'undefined') return;
    var rms = Object.assign({}, rmsPropios());
    Object.keys(p.rms || {}).forEach(function (k) {
      var x = p.rms[k];
      if (!rms[k] && x && x.rm > 0) rms[k] = { rm: x.rm, fecha: x.fecha || hoyISO(), nombre: x.nombre || k, delExcel: true };
    });
    var tipos = Object.assign({}, tiposPropios());
    (p.grupos || []).forEach(function (f) {
      var k = Grupos.normalizar(f[0]);
      if (k && f[2] && !tipos[k]) tipos[k] = { tipo: String(f[2]), nombre: f[0], delExcel: true };
    });
    escribir(clavePersona('rms'), rms);
    escribir(clavePersona('tipos'), tipos);
    escribir(clavePersona('rmsYTiposTraidos'), hoyISO());
  }

  function actualizarPlan() {
    return llamar('plan', {}, 'entrenos').then(function (r) {
      escribir(clavePersona('plan'), {
        entrenos: r.entrenos, ultimaSesion: r.ultimaSesion, grupos: r.grupos || [], rms: r.rms || {}, excel: r.excel || null,
        puedeEditar: !!r.puedeEditar,
        actualizado: Date.now(),
      });
      try { importarRutinaSiFalta(); } catch (e) { /* sin rutina se sigue con el plan del Excel */ }
      try { traerRMsYTipos(); } catch (e) { /* se reintenta en el siguiente refresco */ }
      avisar();
      return plan();
    });
  }

  // Un historial guardado sin ejercicios no vale: se trata como si no hubiera nada para que se vuelva a pedir.
  // Con los datos ya traídos del Excel, el historial lo monta la app con sus series (ver datosPropios).
  function historial() {
    var propios = datosPropios();
    if (propios) return historialPropio(propios);
    var h = leer(clavePersona('historial'), null);
    if (h && h.ejercicios && Object.keys(h.ejercicios).length) return h;
    return null;
  }

  function actualizarHistorial() {
    if (datosPropios()) return Promise.resolve(historial());
    return llamar('historial', {}, 'ejercicios').then(function (r) {
      escribir(clavePersona('historial'), { ejercicios: r.ejercicios, info: r.info || {}, actualizado: Date.now() });
      avisar();
      return historial();
    });
  }

  // ---- Los datos son de la app ----
  // Todas las series se quedan en el móvil para siempre, con su entreno y su columna. Lo de antes (el Registro,
  // los 1RM de cada ciclo del Recopilatorio y el histórico de FitNotes) se trae del Excel una vez con
  // traerDelExcel; desde entonces el historial y las gráficas salen de aquí y el Excel solo es una copia.
  // propios = { traido, historico: { clave: [{ f, s }] }, info: { clave: { nombre, grupo } }, recopilatorio: [{ ciclo, fecha, rms }] }

  function datosPropios() {
    var p = leer(clavePersona('propios'), null);
    return p && p.historico ? p : null;
  }

  // Lo montado se guarda mientras no cambien ni las series ni lo traído (leer devuelve el mismo objeto hasta
  // que se escribe esa clave): la app pide el historial cientos de veces.
  var montado = { propios: null, series: null, valor: null };

  function historialPropio(propios) {
    var lista = series();
    if (montado.propios === propios && montado.series === lista) return montado.valor;
    var ejercicios = {};
    var info = {};
    Object.keys(propios.historico).forEach(function (k) {
      ejercicios[k] = propios.historico[k].map(function (d) { return { f: d.f, s: d.s.slice() }; });
    });
    Object.keys(propios.info || {}).forEach(function (k) { info[k] = propios.info[k]; });
    var ordenadas = lista.slice().sort(function (a, b) {
      return (a.fecha + ' ' + a.hora).localeCompare(b.fecha + ' ' + b.hora) || (a.serie || 0) - (b.serie || 0);
    });
    ordenadas.forEach(function (s) {
      if (!s.ejercicio || !s.fecha) return;
      var k = normalizar(s.ejercicio);
      var dias = ejercicios[k] || (ejercicios[k] = []);
      var dia = null;
      for (var i = dias.length - 1; i >= 0 && dias[i].f >= s.fecha; i--) if (dias[i].f === s.fecha) { dia = dias[i]; break; }
      if (!dia) {
        dia = { f: s.fecha, s: [] };
        dias.push(dia);
      }
      var serie = [Number(s.kg) || 0, Number(s.reps) || 0];
      if (s.seg || s.km) serie.push(Number(s.seg) || 0, Math.round((Number(s.km) || 0) * 100) / 100);
      dia.s.push(serie);
      if (!info[k]) {
        var nombre = String(s.ejercicio).replace(/^WEAK POINT:\s*/i, '').trim();
        info[k] = { nombre: nombre, grupo: (typeof Grupos !== 'undefined' && Grupos.grupoDe(nombre)) || 'Sin grupo' };
      }
    });
    Object.keys(ejercicios).forEach(function (k) { ejercicios[k].sort(function (a, b) { return a.f < b.f ? -1 : a.f > b.f ? 1 : 0; }); });
    montado = { propios: propios, series: lista, valor: { ejercicios: ejercicios, info: info, actualizado: propios.traido, propio: true } };
    return montado.valor;
  }

  // Trae del Excel lo que había antes de que la app guardara todo. Las series del Registro entran como ya subidas
  // (están en el Excel); las que ya estaban en el móvil no se repiten (mismo id).
  // La primera vez se trae todo (con el histórico de FitNotes); después, cada poco, solo el Registro, para que lo
  // apuntado desde otro sitio (otro móvil, el ordenador) también esté aquí. Una serie ya guardada no se repite:
  // por su id o, si no tiene, por fecha, hora, ejercicio y número de serie.
  function claveSerie(s) {
    return s.id ? 'id:' + s.id : [s.fecha, s.hora, normalizar(s.ejercicio), s.serie].join('|');
  }

  // Para enseñarlo: si está trayendo ahora, desde cuándo, y si la última vez falló.
  var trayendo = null;       // Date.now() de cuando empezó, o null
  var falloAlTraer = null;   // texto del último fallo, o null

  function estadoTraer() {
    return { trayendo: trayendo, fallo: falloAlTraer, traido: (datosPropios() || {}).traido || null, primeraVez: !datosPropios() };
  }

  function traerDelExcel() {
    if (trayendo) return Promise.resolve(null);
    var antes = datosPropios();
    trayendo = Date.now();
    falloAlTraer = null;
    avisar();
    return llamar('exportar', antes ? { soloRegistro: true } : {}, 'registro').then(function (r) {
      var lista = series();
      var vistas = {};
      lista.forEach(function (s) { vistas[claveSerie(s)] = true; if (s.id) vistas[[s.fecha, s.hora, normalizar(s.ejercicio), s.serie].join('|')] = true; });
      var nuevas = (r.registro || []).filter(function (s) { return !vistas[claveSerie(s)]; }).map(function (s) {
        return Object.assign({ id: s.id || nuevoId() }, s, { subida: true });
      });
      // Con solo el Registro, el histórico de FitNotes se queda el que ya estaba (no cambia).
      var historico = antes && !Object.keys(r.historico || {}).length ? antes.historico : r.historico || {};
      var info = antes && !Object.keys(r.info || {}).length ? antes.info : r.info || {};
      escribir(clavePersona('propios'), {
        traido: Date.now(), historico: historico, info: info, recopilatorio: r.recopilatorio || (antes || {}).recopilatorio || [],
      });
      guardarSeries(lista.concat(nuevas));
      trayendo = null;
      avisar();
      return { series: nuevas.length, total: lista.length + nuevas.length, ciclos: (r.recopilatorio || []).length };
    }).catch(function (e) {
      trayendo = null;
      falloAlTraer = (e && e.message) || 'No se pudo';
      avisar();
      throw e;
    });
  }

  // ---- Series apuntadas ----

  function series() {
    return leer(clavePersona('series'), []);
  }

  // Antes de traer los datos del Excel solo se guardaban las de los últimos 21 días o las que faltaban por subir
  // (el resto venía del historial de Google); desde entonces se guardan todas.
  function guardarSeries(lista) {
    if (!datosPropios()) {
      var limite = hoyISO(new Date(Date.now() - 21 * 86400000));
      lista = lista.filter(function (s) { return !s.subida || s.fecha >= limite; });
    }
    escribir(clavePersona('series'), lista);
    avisar();
  }

  function apuntar(datos) {
    var s = Object.assign({ id: nuevoId(), fecha: hoyISO(), hora: horaActual(), subida: false }, datos);
    var lista = series();
    lista.push(s);
    guardarSeries(lista);
    sincronizar();
    return s;
  }

  function quitar(id) {
    var lista = series();
    var s = lista.find(function (x) { return x.id === id; });
    if (!s) return;
    if (s.subida) {
      var borrar = leer(clavePersona('borrar'), []);
      borrar.push(id);
      escribir(clavePersona('borrar'), borrar);
    }
    guardarSeries(lista.filter(function (x) { return x.id !== id; }));
    sincronizar();
  }

  function pendientes() {
    return series().filter(function (s) { return !s.subida; }).length + leer(clavePersona('borrar'), []).length;
  }

  function sincronizar() {
    if (sincronizando) return sincronizando;
    if (!config()) return Promise.resolve({ pendientes: 0 });
    var subir = series().filter(function (s) { return !s.subida; });
    var borrar = leer(clavePersona('borrar'), []);
    if (!subir.length && !borrar.length) return Promise.resolve({ pendientes: 0 });

    var campos = ['id', 'fecha', 'hora', 'entreno', 'columna', 'ejercicio', 'tipo', 'serie', 'kg', 'reps', 'sustituye', 'seg', 'km'];
    sincronizando = Promise.resolve()
      .then(function () {
        if (!subir.length) return null;
        // Si Google contesta sin "guardadas" (su página de error o la respuesta del doGet), las series
        // no se dan por subidas: siguen pendientes y se reintenta más tarde.
        return llamar('guardar', {
          series: subir.map(function (s) {
            var limpio = {};
            campos.forEach(function (k) { limpio[k] = s[k]; });
            return limpio;
          }),
        }, 'guardadas');
      })
      .then(function (r) {
        var ids = {};
        subir.forEach(function (s) { ids[s.id] = true; });
        guardarSeries(series().map(function (s) { return ids[s.id] ? Object.assign({}, s, { subida: true }) : s; }));
        if (r) escribir(clavePersona('rehacerHojas'), true);
        if (r) actualizarUltimaSesion(r.ultimaSesion);
        return borrar.length ? llamar('borrar', { ids: borrar }, 'borradas') : null;
      })
      .then(function (r) {
        if (r) {
          var quedan = leer(clavePersona('borrar'), []).filter(function (id) { return borrar.indexOf(id) < 0; });
          escribir(clavePersona('borrar'), quedan);
          actualizarUltimaSesion(r.ultimaSesion);
        }
        return { pendientes: pendientes() };
      })
      .catch(function (err) {
        return { pendientes: pendientes(), error: err.message };
      })
      .finally(function () {
        sincronizando = null;
        avisar();
      });
    return sincronizando;
  }

  // "Estimado vs realizado" y "Sesiones" se rehacen con las series del Registro: tras subir series hay que
  // pedirlo. Antes solo se pedía si al actualizar quedaban series pendientes, y como se suben al pulsar "Hecha",
  // casi nunca: la gráfica de la evolución del ciclo se quedaba atrasada (2026-09-29). Sin apunte todavía (la
  // primera vez con esta versión), se rehacen una vez.
  function hojasPorRehacer() {
    return leer(clavePersona('rehacerHojas'), true) === true;
  }

  function hojasRehechas() {
    escribir(clavePersona('rehacerHojas'), false);
  }

  function actualizarUltimaSesion(ultima) {
    var p = plan();
    if (!p) return;
    p.ultimaSesion = ultima;
    escribir(clavePersona('plan'), p);
  }

  // Última sesión conocida: la del Excel o la última serie apuntada en el móvil, la que sea más reciente.
  function ultimaSesion() {
    var p = plan();
    var mejor = p && p.ultimaSesion ? { clave: p.ultimaSesion.fecha + ' 99', sesion: p.ultimaSesion } : null;
    series().forEach(function (s) {
      var clave = s.fecha + ' ' + s.hora;
      if (!mejor || clave > mejor.clave) mejor = { clave: clave, sesion: { fecha: s.fecha, entreno: s.entreno, columna: s.columna } };
    });
    return mejor ? mejor.sesion : null;
  }

  // Series de la última vez que se hizo un ejercicio antes de hoy: primero en el móvil, si no en el historial.
  function ultimaVez(nombre) {
    var hoy = hoyISO();
    var clave = normalizar(nombre);
    var locales = series().filter(function (s) { return normalizar(s.ejercicio) === clave && s.fecha < hoy; });
    var dias = ((historial() || {}).ejercicios || {})[clave] || [];
    var ultimoHistorial = dias.filter(function (d) { return d.f < hoy; }).pop();
    var ultimaLocal = locales.reduce(function (m, s) { return !m || s.fecha > m ? s.fecha : m; }, null);
    if (ultimaLocal && (!ultimoHistorial || ultimaLocal >= ultimoHistorial.f)) {
      return {
        fecha: ultimaLocal,
        series: locales.filter(function (s) { return s.fecha === ultimaLocal; })
          .sort(function (a, b) { return a.serie - b.serie; })
          // Las series por tiempo llevan además segundos y km, como en el historial.
          .map(function (s) { return s.seg || s.km ? [s.kg, s.reps, s.seg || 0, s.km || 0] : [s.kg, s.reps]; }),
      };
    }
    return ultimoHistorial ? { fecha: ultimoHistorial.f, series: ultimoHistorial.s } : null;
  }

  // Lo proyectado y lo hecho en cada columna del ciclo, de la pestaña "Estimado vs realizado".
  // Con los datos en el móvil, el ciclo en curso lo calcula la app (Progreso.calcular); los ciclos anteriores salen
  // de lo que ya había en el Excel.
  // En el ciclo en curso, casilla a casilla:
  // - lo que tocaba: el del Excel, que se guardó con el 1RM del principio del ciclo; si no hay, el primero que
  //   calculó la app, que se queda fijo (el 1RM no se toca a mitad de ciclo);
  // - lo hecho: lo que calcula la app con sus series; si no tiene (series que ya no están en el Registro), el Excel.
  var progresoMontado = { excel: null, propio: null, valor: null };

  function progreso() {
    var excel = leer(clavePersona('progreso'), null);
    var propio = typeof Progreso !== 'undefined' ? Progreso.calcular() : null;
    if (!propio) return excel;
    if (progresoMontado.excel === excel && progresoMontado.propio === propio) return progresoMontado.valor;
    var fijados = leer(clavePersona('estimadosFijados'), {});
    var nuevosFijados = false;
    var filasExcel = (excel || {}).filas || [];
    var filas = propio.filas.map(function (f) {
      var x = filasExcel.filter(function (g) { return g.ciclo === f.ciclo && g.columna === f.columna; })[0] || { valores: {} };
      var valores = {};
      propio.ejercicios.concat(Object.keys(x.valores)).forEach(function (n) {
        var a = f.valores[n] || [], b = x.valores[n] || [];
        var clave = f.ciclo + '|' + f.columna + '|' + n;
        // Lo que tocaba se fija la primera vez que se sabe (el del Excel solo si ya estaba, para no mover lo de este
        // ciclo) y desde ahí no se mueve, cambie lo que cambie en el Excel o a mitad de ciclo.
        var estimado = fijados[clave] != null ? fijados[clave] : b[0] != null ? b[0] : a[0] != null ? a[0] : null;
        if (estimado != null && fijados[clave] == null) { fijados[clave] = estimado; nuevosFijados = true; }
        var realizado = a[1] != null ? a[1] : b[1] != null ? b[1] : null;
        var cambio = a[1] != null ? a[2] : b[2];
        if (estimado == null && realizado == null) return;
        valores[n] = cambio ? [estimado, realizado, cambio] : [estimado, realizado];
      });
      return Object.assign({}, f, { valores: valores });
    });
    if (nuevosFijados) escribir(clavePersona('estimadosFijados'), fijados);
    // El ciclo en curso se guarda en el móvil tal cual se ve: cuando termine, sigue saliendo de aquí y no del Excel.
    var ciclosApp = leer(clavePersona('ciclosApp'), {});
    var esteCiclo = { ejercicios: propio.ejercicios, filas: filas };
    if (JSON.stringify(ciclosApp[propio.ciclo]) !== JSON.stringify(esteCiclo)) {
      ciclosApp = Object.assign({}, ciclosApp);
      ciclosApp[propio.ciclo] = esteCiclo;
      escribir(clavePersona('ciclosApp'), ciclosApp);
    }
    // Los anteriores: los guardados por la app y, de los que no tiene (los de antes de la app), el archivo del Excel.
    var viejas = filasExcel.filter(function (f) { return f.ciclo !== propio.ciclo && !ciclosApp[f.ciclo]; });
    Object.keys(ciclosApp).forEach(function (c) { if (c !== propio.ciclo) viejas = viejas.concat(ciclosApp[c].filas); });
    var numero = function (c) { return Number((String(c).match(/(\d+)/) || [])[1]) || 0; };
    viejas.sort(function (x, y) { return numero(x.ciclo) - numero(y.ciclo); });
    var nombres = propio.ejercicios.slice();
    ((excel || {}).ejercicios || []).forEach(function (n) { if (nombres.indexOf(n) < 0) nombres.push(n); });
    Object.keys(ciclosApp).forEach(function (c) { ciclosApp[c].ejercicios.forEach(function (n) { if (nombres.indexOf(n) < 0) nombres.push(n); }); });
    progresoMontado = { excel: leer(clavePersona('progreso'), null), propio: propio,
      valor: { ejercicios: nombres, filas: viejas.concat(filas), actualizado: Date.now(), propio: true } };
    return progresoMontado.valor;
  }

  // Lo previsto de cada ciclo, fijo desde el primer día que se mira (él, 2026-11-05): { inicio: { ciclo, inicio,
  // ejercicios: [{ entreno, nombre, corto, columnas, proyeccion }] } }. Así no se mueve si cambia algo a mitad de ciclo,
  // y los ciclos pasados se pueden ver con su rutina de entonces.
  function ciclosFijos() {
    return leer(clavePersona('ciclosFijos'), {});
  }

  function guardarCicloFijo(datos) {
    var todos = Object.assign({}, ciclosFijos());
    todos[datos.inicio] = datos;
    escribir(clavePersona('ciclosFijos'), todos);
  }

  // "Estimado vs realizado" del Excel se lee una sola vez, como archivo de los ciclos de antes de la app: desde
  // entonces lo calcula y lo guarda la app (progreso, ciclosApp) y el Excel solo recibe la copia.
  function actualizarProgreso() {
    if (leer(clavePersona('progreso'), null)) return Promise.resolve(progreso());
    return llamar('progreso', {}, 'filas').then(function (r) {
      escribir(clavePersona('progreso'), { ejercicios: r.ejercicios || [], filas: r.filas || [], actualizado: Date.now() });
      avisar();
      return progreso();
    });
  }

  // ---- Comida (2026-11-06) ----
  // Seis tablas con una fila por id (ver TABLAS_COMIDA en la API). Manda el móvil: se guarda aquí al momento y va al
  // Excel de copia por la cola de siempre (copiarAlExcel → guardarTabla), que se reintenta sin cobertura.
  // Las comunes (alimentos, platos, despensa) se vuelven a leer en cada refresco para ver lo que puso el otro; las de
  // cada uno (comidas, agua, pesos) solo se leen una vez, para recuperar lo que hubiera en el Excel.
  var TABLAS_COMUNES = ['alimentos', 'platos', 'despensa'];
  var TABLAS_PROPIAS = ['comidas', 'agua', 'pesos'];
  var SIN_FILAS = [];

  // Todas las filas de una tabla, también las borradas (borrado: 'sí').
  function filasComida(tabla) {
    return leer(clavePersona('comida.' + tabla), null) || SIN_FILAS;
  }

  // Las que valen (sin las borradas).
  function tablaComida(tabla) {
    return filasComida(tabla).filter(function (f) { return f.borrado !== 'sí'; });
  }

  function guardarFilaComida(tabla, fila) {
    var nueva = Object.assign({ id: nuevoId() }, fila);
    var lista = filasComida(tabla).filter(function (f) { return f.id !== nueva.id; }).concat([nueva]);
    escribir(clavePersona('comida.' + tabla), lista);
    avisar();
    // Si esa fila ya esperaba en la cola (sin cobertura), solo se manda la última versión.
    escribir(clavePersona('porCopiar'), leer(clavePersona('porCopiar'), []).filter(function (t) {
      return !(t.accion === 'guardarTabla' && t.datos && t.datos.tabla === tabla && (t.datos.filas || []).length === 1 && t.datos.filas[0].id === nueva.id);
    }));
    copiarAlExcel('guardarTabla', { tabla: tabla, filas: [nueva] }).catch(function () {});
    return nueva;
  }

  function borrarFilaComida(tabla, id) {
    var fila = filasComida(tabla).filter(function (f) { return f.id === id; })[0];
    if (fila) guardarFilaComida(tabla, Object.assign({}, fila, { borrado: 'sí' }));
  }

  // Ids de esa tabla que aún están en la cola para el Excel: lo del móvil manda sobre lo que se lea.
  function porCopiarDe(tabla) {
    var ids = {};
    leer(clavePersona('porCopiar'), []).forEach(function (t) {
      if (t.accion === 'guardarTabla' && t.datos && t.datos.tabla === tabla) (t.datos.filas || []).forEach(function (f) { ids[f.id] = true; });
    });
    return ids;
  }

  function mezclarComida(tabla, remotas) {
    var pendientes = porCopiarDe(tabla);
    var porId = {};
    filasComida(tabla).forEach(function (f) { porId[f.id] = f; });
    (remotas || []).forEach(function (f) { if (f && f.id && !pendientes[f.id]) porId[f.id] = f; });
    var lista = Object.keys(porId).map(function (k) { return porId[k]; });
    if (JSON.stringify(lista) !== JSON.stringify(filasComida(tabla))) escribir(clavePersona('comida.' + tabla), lista);
  }

  function actualizarComida() {
    if (!config()) return Promise.resolve();
    var tablas = TABLAS_COMUNES.concat(TABLAS_PROPIAS.filter(function (t) { return !leer(clavePersona('comidaTraida.' + t), null); }));
    return Promise.all(tablas.map(function (tabla) {
      return llamar('leerTabla', { tabla: tabla }, 'filas').then(function (r) {
        mezclarComida(tabla, r.filas);
        if (TABLAS_PROPIAS.indexOf(tabla) >= 0) escribir(clavePersona('comidaTraida.' + tabla), hoyISO());
      }, function () { /* con una API sin la acción todavía, se queda lo del móvil */ });
    })).then(function () { avisar(); });
  }

  // ---- Estado de fuerza: datos del cuerpo y fotos mensuales ----

  // { sexo: 'hombre' | 'mujer', edad, peso } para el cálculo; si el móvil no los tiene, los de la última foto.
  function cuerpo() {
    var c = leer(clavePersona('cuerpo'), null);
    if (c && c.peso > 0) return c;
    var ultima = estados().slice(-1)[0];
    return ultima && ultima.persona && ultima.persona.peso > 0 ? ultima.persona : null;
  }

  function guardarCuerpo(c) {
    escribir(clavePersona('cuerpo'), c);
    avisar();
  }

  // Fotos del estado, una por mes ('aaaa-mm') y en orden. Las que aún no están en el Excel llevan subida: false.
  function estados() {
    return leer(clavePersona('estados'), []);
  }

  function escribirEstados(porMes) {
    escribir(clavePersona('estados'), Object.keys(porMes).sort().map(function (m) { return porMes[m]; }));
  }

  function guardarEstados(lista) {
    var porMes = {};
    estados().forEach(function (e) { porMes[e.mes] = e; });
    lista.forEach(function (e) { porMes[e.mes] = Object.assign({}, e, { subida: false }); });
    escribirEstados(porMes);
    avisar();
    return subirEstados();
  }

  // Sube las fotos pendientes. Con una API antigua (sin "guardarEstados") se quedan en el móvil y se reintenta luego.
  function subirEstados() {
    var pendientesEstado = estados().filter(function (e) { return !e.subida; });
    if (!pendientesEstado.length) return Promise.resolve();
    return llamar('guardarEstados', {
      estados: pendientesEstado.map(function (e) {
        var limpio = Object.assign({}, e);
        delete limpio.subida;
        return limpio;
      }),
    }, 'meses').then(function () {
      var subidas = {};
      pendientesEstado.forEach(function (e) { subidas[e.mes] = true; });
      var porMes = {};
      estados().forEach(function (e) { porMes[e.mes] = subidas[e.mes] ? Object.assign({}, e, { subida: true }) : e; });
      escribirEstados(porMes);
    });
  }

  // Trae las fotos del Excel; las del móvil que aún no se han subido mandan sobre las de allí.
  function actualizarEstados() {
    return llamar('estados', {}, 'estados').then(function (r) {
      var porMes = {};
      (r.estados || []).forEach(function (e) { porMes[e.mes] = Object.assign({}, e, { subida: true }); });
      estados().forEach(function (e) { if (!e.subida || !porMes[e.mes]) porMes[e.mes] = e; });
      escribirEstados(porMes);
      return subirEstados().catch(function () {});
    }).then(function () {
      avisar();
      return estados();
    });
  }

  // ---- Pasos ----
  // [{ fecha, pasos, km, kcal, objetivo, subida }] ordenados por fecha. Los lee la app de Android (js/inicio.js) y
  // se suben a la pestaña "Pasos" del Excel para tener el histórico y que el otro los vea en Social.
  var OBJETIVO_PASOS = 10000;
  var subiendoPasos = null;

  function pasos() {
    return leer(clavePersona('pasos'), []);
  }

  function escribirPasos(porFecha) {
    escribir(clavePersona('pasos'), Object.keys(porFecha).sort().map(function (f) { return porFecha[f]; }));
  }

  function objetivoPasos() {
    return leer(clavePersona('objetivoPasos'), OBJETIVO_PASOS);
  }

  // La rutina creada en la app (src/rutina.js): días, semanas del ciclo, entrenos y ejercicios.
  // Puede haber varias guardadas, cada una con su nombre; manda la que está en uso.
  // { lista: [rutina con id y nombre…], activa: id }. La primera versión guardaba una sola en 'rutina'.
  function rutinas() {
    var r = leer(clavePersona('rutinas'), null);
    if (r && r.lista) return r;
    var vieja = leer(clavePersona('rutina'), null);
    if (vieja && vieja.entrenos && vieja.dias) {
      var una = Object.assign({ id: 'R1', nombre: 'Mi rutina' }, vieja);
      return { lista: [una], activa: una.id };
    }
    return { lista: [], activa: null };
  }

  function rutinaPorId(r, id) {
    return r.lista.filter(function (x) { return x.id === id; })[0] || null;
  }

  // Una rutina elegida que empieza más adelante (la del ciclo que viene, 2026-11-01) no manda hasta su día: hasta
  // entonces sigue la de antes (`antes`).
  function empiezaLuego(x) {
    return !!(x && x.dias && x.dias.inicio > hoyISO());
  }

  function rutina() {
    var r = rutinas();
    var activa = rutinaPorId(r, r.activa);
    if (empiezaLuego(activa) && r.antes) return rutinaPorId(r, r.antes) || activa;
    return activa;
  }

  // La elegida para más adelante, si la hay: { rutina, desde }.
  function rutinaProxima() {
    var r = rutinas();
    var activa = rutinaPorId(r, r.activa);
    return empiezaLuego(activa) && r.antes && rutinaPorId(r, r.antes) ? { rutina: activa, desde: activa.dias.inicio } : null;
  }

  // Guarda (o cambia) una rutina; si no hay ninguna en uso, esta pasa a estarlo.
  function guardarRutina(nueva) {
    var r = rutinas();
    var guardada = Object.assign({}, nueva, { actualizada: Date.now() });
    var i = r.lista.map(function (x) { return x.id; }).indexOf(guardada.id);
    var lista = r.lista.slice();
    if (i >= 0) lista[i] = guardada; else lista.push(guardada);
    escribir(clavePersona('rutinas'), Object.assign({}, r, { lista: lista, activa: r.activa || guardada.id }));
    if (guardada.id === (r.activa || guardada.id)) subirRutina();
    avisar();
    return guardada;
  }

  function usarRutina(id) {
    var r = rutinas();
    var enCurso = rutina();
    var antes = empiezaLuego(rutinaPorId(r, id)) && enCurso && enCurso.id !== id ? enCurso.id : null;
    escribir(clavePersona('rutinas'), { lista: r.lista, activa: id, antes: antes });
    subirRutina();
    avisar();
  }

  function borrarRutina(id) {
    var r = rutinas();
    var lista = r.lista.filter(function (x) { return x.id !== id; });
    var activa = r.activa === id ? (r.antes && r.antes !== id ? r.antes : lista[0] ? lista[0].id : null) : r.activa;
    escribir(clavePersona('rutinas'), { lista: lista, activa: activa, antes: r.antes === id || activa === r.antes ? null : r.antes });
    avisar();
  }

  // Para la asistencia (Social y faltas) la API mira qué ejercicios tiene cada entreno: con una rutina de la app
  // se le mandan los suyos y el día desde el que valen (el de su inicio, o hoy si ya empezó). Va aparte de la cola
  // de copias para no frenarla con una API que aún no tenga la acción; se reintenta en cada refresco.
  function subirRutina() {
    var x = rutinaPorId(rutinas(), rutinas().activa);
    if (x && typeof Rutina !== 'undefined' && rutinaDelCalendario(x)) {
      var entrenos = {};
      x.entrenos.forEach(function (e) { entrenos[e.id] = e.ejercicios.map(function (ej) { return ej.nombre; }); });
      var desde = x.dias && x.dias.inicio > hoyISO() ? x.dias.inicio : hoyISO();
      var pendiente = leer(clavePersona('rutinaPorSubir'), null);
      // Ya subida igual: no hace falta volver a mandarla.
      var subida = leer(clavePersona('rutinaSubida'), null);
      var datos = { desde: pendiente && pendiente.desde < desde && iguales(pendiente.entrenos, entrenos) ? pendiente.desde : desde, entrenos: entrenos };
      if (!(subida && iguales(subida.entrenos, entrenos) && subida.desde <= datos.desde)) escribir(clavePersona('rutinaPorSubir'), datos);
    }
    var porSubir = leer(clavePersona('rutinaPorSubir'), null);
    if (!porSubir || !config()) return Promise.resolve(false);
    return llamar('ponerRutina', porSubir).then(function () {
      escribir(clavePersona('rutinaSubida'), porSubir);
      if (iguales(leer(clavePersona('rutinaPorSubir'), null), porSubir)) escribir(clavePersona('rutinaPorSubir'), null);
      return true;
    }, function () { return false; });
  }

  function iguales(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // Si la rutina que manda ese día (hoy, si no se dice) no tiene AMRAP: entonces la última columna del calendario
  // es una más (la semana suave) y no se llama AMRAP.
  function sinAmrap(fecha) {
    var dia = fecha || hoyISO();
    var proxima = rutinaProxima();
    var r = proxima && dia >= proxima.desde ? proxima.rutina : rutina();
    return !!(r && !r.amrap && rutinaDelCalendario(r) && !(r.dias && dia < r.dias.inicio));
  }

  function nombreColumna(c, fecha) {
    return c === Calendario.COLUMNAS && sinAmrap(fecha) ? 'Columna ' + c : Calendario.nombreColumna(c);
  }

  function guardarObjetivoPasos(n) {
    escribir(clavePersona('objetivoPasos'), n);
    // El de hoy cambia ya; los días pasados se quedan con el que tenían.
    var porFecha = {};
    pasos().forEach(function (d) { porFecha[d.fecha] = d; });
    var hoy = porFecha[hoyISO()];
    if (hoy) {
      porFecha[hoy.fecha] = Object.assign({}, hoy, { objetivo: n, subida: false });
      escribirPasos(porFecha);
      subirPasos(true).catch(function () {});
    }
    avisar();
  }

  // dias: [{ fecha, pasos, km, kcal }] leídos en el móvil. Solo se marcan para subir los que han cambiado.
  function guardarPasos(dias) {
    var porFecha = {};
    pasos().forEach(function (d) { porFecha[d.fecha] = d; });
    var cambia = false;
    dias.forEach(function (d) {
      var antes = porFecha[d.fecha];
      if (antes && antes.pasos === d.pasos && antes.kcal === d.kcal && antes.kcalEntreno === d.kcalEntreno && antes.kcalReposo === d.kcalReposo) return;
      porFecha[d.fecha] = Object.assign({}, d, { objetivo: antes && antes.objetivo ? antes.objetivo : objetivoPasos(), subida: false });
      cambia = true;
    });
    if (!cambia) return Promise.resolve();
    escribirPasos(porFecha);
    avisar();
    return subirPasos(false);
  }

  // Los pasos de hoy cambian a cada rato: si solo falta hoy, se sube como mucho cada 10 minutos.
  function subirPasos(yaMismo) {
    var pendientesPasos = pasos().filter(function (d) { return !d.subida; });
    if (!pendientesPasos.length || subiendoPasos) return subiendoPasos || Promise.resolve();
    var soloHoy = pendientesPasos.every(function (d) { return d.fecha === hoyISO(); });
    if (!yaMismo && soloHoy && Date.now() - (marca('pasosSubidos') || 0) < 600000) return Promise.resolve();
    subiendoPasos = llamar('guardarPasos', {
      dias: pendientesPasos.map(function (d) { return { fecha: d.fecha, pasos: d.pasos, km: d.km, kcal: d.kcal, objetivo: d.objetivo, kcalEntreno: d.kcalEntreno, kcalReposo: d.kcalReposo }; }),
    }, 'guardados').then(function () {
      marcar('pasosSubidos', Date.now());
      var enviados = {};
      pendientesPasos.forEach(function (d) { enviados[d.fecha] = d; });
      var porFecha = {};
      pasos().forEach(function (d) {
        var e = enviados[d.fecha];
        porFecha[d.fecha] = e && e.pasos === d.pasos && e.objetivo === d.objetivo && e.kcalEntreno === d.kcalEntreno && e.kcalReposo === d.kcalReposo ? Object.assign({}, d, { subida: true }) : d;
      });
      escribirPasos(porFecha);
    }).finally(function () { subiendoPasos = null; });
    return subiendoPasos;
  }

  // Los del Excel (los de otro móvil, o de antes de borrar datos) más los de aquí que aún no se han subido.
  function actualizarPasos() {
    return llamar('pasos', {}, 'pasos').then(function (r) {
      var porFecha = {};
      (r.pasos || []).forEach(function (d) { porFecha[d.fecha] = Object.assign({}, d, { subida: true }); });
      pasos().forEach(function (d) { if (!d.subida || !porFecha[d.fecha]) porFecha[d.fecha] = d; });
      escribirPasos(porFecha);
      avisar();
      return subirPasos(false).catch(function () {});
    });
  }

  // Faltas de los dos: { personas: { <persona>: { nombre, dias: [{ fecha, entreno, columna, resultado, motivo }] } } }.
  function faltas() {
    return leer(clavePersona('faltas'), null);
  }

  function actualizarFaltas() {
    return llamar('faltas', {}, 'personas').then(function (r) {
      escribir(clavePersona('faltas'), { personas: r.personas, actualizado: Date.now() });
      return faltas();
    });
  }

  function justificar(fecha, motivo) {
    return llamar('justificar', { fecha: fecha, motivo: motivo }, 'dias').then(function (r) {
      var yo = config().persona;
      guardarDiasCerrados(yo, r.dias);
      return faltas();
    });
  }

  // Tras justificar o contestar un justificante: la lista de faltas y los días de Social guardados.
  function guardarDiasCerrados(persona, dias) {
    var f = faltas();
    if (f && f.personas[persona]) {
      f.personas[persona].dias = dias;
      escribir(clavePersona('faltas'), f);
    }
    var s = social(persona);
    if (s) {
      var porFecha = {};
      dias.forEach(function (d) { porFecha[d.fecha] = d; });
      s.dias.forEach(function (d) {
        if (porFecha[d.fecha]) Object.assign(d, { resultado: porFecha[d.fecha].resultado, motivo: porFecha[d.fecha].motivo });
      });
      escribir(clavePersona('social.' + persona), s);
    }
  }

  // El otro contesta un justificante.
  function revisar(de, fecha, aceptar) {
    return llamar('revisar', { de: de, fecha: fecha, aceptar: aceptar }, 'dias').then(function (r) {
      guardarDiasCerrados(de, r.dias);
      return faltas();
    });
  }

  // ---- Social: lo de cada persona (días de gym, estado, ciclo, likes y comentarios) ----

  function social(de) {
    return leer(clavePersona('social.' + de), null);
  }

  function actualizarSocial(de) {
    return llamar('social', { de: de }, 'dias').then(function (r) {
      escribir(clavePersona('social.' + de), {
        de: r.de, nombre: r.nombre, hoy: r.hoy, dias: r.dias, estado: r.estado, estados: r.estados || [],
        progreso: r.progreso || { ejercicios: [], filas: [] }, reacciones: r.reacciones || [], pasos: r.pasos || [], actualizado: Date.now(),
      });
      avisar();
      return social(de);
    });
  }

  function guardarReacciones(de, reacciones) {
    var s = social(de);
    if (s) {
      s.reacciones = reacciones;
      escribir(clavePersona('social.' + de), s);
    }
    avisar();
    return social(de);
  }

  // Like (se quita si ya estaba) o comentario sobre algo de "para": sobre = 'dia:…', 'estado:…' o 'ciclo:…'.
  function reaccionar(para, sobre, tipo, texto) {
    return llamar('reaccionar', { para: para, sobre: sobre, tipo: tipo, texto: texto || '', id: nuevoId() }, 'reacciones')
      .then(function (r) { return guardarReacciones(para, r.reacciones); });
  }

  function borrarComentario(para, id) {
    return llamar('borrarComentario', { para: para, id: id }, 'reacciones')
      .then(function (r) { return guardarReacciones(para, r.reacciones); });
  }

  // Sube el estado de fuerza de ahora para que lo vea el otro; solo si ha cambiado desde la última vez.
  function subirEstadoActual(r) {
    var texto = JSON.stringify(r);
    if (leer(clavePersona('estadoSubido'), null) === texto) return Promise.resolve();
    return llamar('guardarEstadoActual', { estado: r }, 'guardado').then(function () {
      escribir(clavePersona('estadoSubido'), texto);
    });
  }

  // Ayer tocaba gym y en este móvil no está completo: hoy, que es descanso, se puede recuperar.
  function pendienteAyer() {
    var ayer = Calendario.sumarDias(hoyISO(), -1);
    var c = Calendario.porCalendario(ayer);
    if (ayer < Calendario.INICIO_FALTAS || c.descanso) return false;
    var ejercicios = ((plan() || {}).entrenos || {})[c.entreno] || [];
    var hechos = {};
    series().forEach(function (s) { if (s.fecha === ayer && s.entreno === c.entreno) hechos[s.ejercicioId] = true; });
    return ejercicios.some(function (ej) { return !hechos[ej.id]; });
  }

  // Dirección del Excel abierta en la pestaña de un entreno, o null si la API aún no la da.
  function enlaceExcel(entreno) {
    var e = (plan() || {}).excel;
    var gid = e && e.pestanas ? e.pestanas[entreno] : null;
    if (!e || !e.url) return null;
    var base = String(e.url).replace(/\/edit.*$/, '') + '/edit';
    return gid != null ? base + '?gid=' + gid + '#gid=' + gid : base;
  }

  // Últimos fallos de la app, guardados en el móvil para poder verlos en Ajustes.
  function anotarFallo(texto) {
    var lista = leer('fallos', []);
    lista.push({ cuando: hoyISO() + ' ' + horaActual(), texto: String(texto).slice(0, 300) });
    escribir('fallos', lista.slice(-10));
  }

  function fallos() {
    return leer('fallos', []);
  }

  function alCambiar(f) {
    oyentes.push(f);
  }

  // ---- Fotos ----
  // La foto de cada uno sale arriba en vez del nombre. Están en el Excel común, así que valen para los dos móviles;
  // aquí se guardan para verlas sin cobertura. La clave no lleva persona: son las de los dos.

  function fotos() {
    return leer('fotos', {});
  }

  function foto(persona) {
    return fotos()[normalizar(persona || (config() || {}).persona)] || null;
  }

  function actualizarFotos() {
    return llamar('fotos', {}).then(function (r) {
      // Sin "fotos" en la respuesta (una API vieja o una página de error de Google) se dejan las guardadas.
      if (!r.fotos) return fotos();
      escribir('fotos', r.fotos);
      avisar();
      return fotos();
    });
  }

  // Cambia la tuya (o la quita con ''). Necesita conexión: no tiene sentido dejarla a medias en el móvil.
  function guardarFoto(imagen) {
    return llamar('guardarFoto', { foto: imagen || '' }).then(function (r) {
      escribir('fotos', r.fotos || {});
      avisar();
      return fotos();
    });
  }

  // ---- Entrenos terminados y cómo se acabaron (las caras) ----
  // { 'aaaa-mm-dd|A1': { fecha, entreno, columna, terminado: 'hh:mm', cara, subida } }. Solo los de 60 días.
  // La cara va a la pestaña "Sensaciones" del Excel común; sin conexión se queda aquí y se sube después.

  function terminados() {
    return leer(clavePersona('terminados'), {});
  }

  function guardarTerminados(t) {
    var limite = hoyISO(new Date(Date.now() - 60 * 86400000));
    var limpio = {};
    Object.keys(t).forEach(function (k) { if (t[k].fecha >= limite || (t[k].cara && !t[k].subida)) limpio[k] = t[k]; });
    escribir(clavePersona('terminados'), limpio);
    avisar();
  }

  function terminado(fecha, entreno) {
    return terminados()[fecha + '|' + entreno] || null;
  }

  function terminar(entreno, columna) {
    var t = Object.assign({}, terminados());
    var fecha = hoyISO();
    t[fecha + '|' + entreno] = { fecha: fecha, entreno: entreno, columna: columna, terminado: horaActual().slice(0, 5), cara: null, subida: false };
    guardarTerminados(t);
  }

  function guardarCara(fecha, entreno, cara) {
    var t = Object.assign({}, terminados());
    var clave = fecha + '|' + entreno;
    if (!t[clave]) return Promise.resolve();
    t[clave] = Object.assign({}, t[clave], { cara: cara, subida: false });
    guardarTerminados(t);
    return subirCaras();
  }

  // Sube las caras que falten, una a una (son pocas). Con una API sin "guardarSensacion" se quedan para luego.
  var subiendoCaras = null;
  function subirCaras() {
    if (subiendoCaras) return subiendoCaras;
    var faltan = Object.keys(terminados()).filter(function (k) { var x = terminados()[k]; return x.cara && !x.subida; });
    if (!faltan.length || !config()) return Promise.resolve();
    subiendoCaras = faltan.reduce(function (cadena, clave) {
      return cadena.then(function () {
        var x = terminados()[clave];
        return llamar('guardarSensacion', { fecha: x.fecha, entreno: x.entreno, columna: x.columna, cara: x.cara, terminado: x.terminado }, 'guardada')
          .then(function () {
            var t = Object.assign({}, terminados());
            if (t[clave] && t[clave].cara === x.cara) t[clave] = Object.assign({}, t[clave], { subida: true });
            guardarTerminados(t);
          });
      });
    }, Promise.resolve()).finally(function () { subiendoCaras = null; });
    return subiendoCaras;
  }

  // Marcas sueltas del móvil, por persona: por ejemplo el 1RM ya ajustado hoy en un ejercicio.
  function marca(clave) {
    return leer(clavePersona('marca.' + clave), null);
  }

  function marcar(clave, valor) {
    escribir(clavePersona('marca.' + clave), valor);
  }

  window.addEventListener('online', function () { sincronizar(); });
  setInterval(function () { if (pendientes()) sincronizar(); }, 60000);

  return {
    config: config,
    guardarConfig: guardarConfig,
    llamar: llamar,
    hoyISO: hoyISO,
    normalizar: normalizar,
    plan: plan,
    planDelExcel: planDelExcel,
    rmsPropios: rmsPropios,
    guardarRMPropio: guardarRMPropio,
    copiarAlExcel: copiarAlExcel,
    guardarTipo: guardarTipo,
    renombrarLocal: renombrarLocal,
    copiarPendientes: copiarPendientes,
    porCopiar: porCopiar,
    importarRutinaSiFalta: importarRutinaSiFalta,
    actualizarPlan: actualizarPlan,
    historial: historial,
    actualizarHistorial: actualizarHistorial,
    datosPropios: datosPropios,
    traerDelExcel: traerDelExcel,
    estadoTraer: estadoTraer,
    progreso: progreso,
    actualizarProgreso: actualizarProgreso,
    ciclosFijos: ciclosFijos,
    guardarCicloFijo: guardarCicloFijo,
    hojasPorRehacer: hojasPorRehacer,
    hojasRehechas: hojasRehechas,
    series: series,
    apuntar: apuntar,
    quitar: quitar,
    pendientes: pendientes,
    sincronizar: sincronizar,
    ultimaSesion: ultimaSesion,
    ultimaVez: ultimaVez,
    alCambiar: alCambiar,
    marca: marca,
    marcar: marcar,
    cuerpo: cuerpo,
    guardarCuerpo: guardarCuerpo,
    estados: estados,
    guardarEstados: guardarEstados,
    actualizarEstados: actualizarEstados,
    faltas: faltas,
    actualizarFaltas: actualizarFaltas,
    justificar: justificar,
    revisar: revisar,
    social: social,
    actualizarSocial: actualizarSocial,
    reaccionar: reaccionar,
    borrarComentario: borrarComentario,
    subirEstadoActual: subirEstadoActual,
    pendienteAyer: pendienteAyer,
    pasos: pasos,
    filasComida: filasComida,
    tablaComida: tablaComida,
    guardarFilaComida: guardarFilaComida,
    borrarFilaComida: borrarFilaComida,
    actualizarComida: actualizarComida,
    guardarPasos: guardarPasos,
    actualizarPasos: actualizarPasos,
    objetivoPasos: objetivoPasos,
    rutina: rutina,
    rutinas: rutinas,
    rutinaProxima: rutinaProxima,
    subirRutina: subirRutina,
    sinAmrap: sinAmrap,
    nombreColumna: nombreColumna,
    guardarRutina: guardarRutina,
    usarRutina: usarRutina,
    borrarRutina: borrarRutina,
    guardarObjetivoPasos: guardarObjetivoPasos,
    fotos: fotos,
    foto: foto,
    actualizarFotos: actualizarFotos,
    guardarFoto: guardarFoto,
    terminado: terminado,
    terminar: terminar,
    guardarCara: guardarCara,
    subirCaras: subirCaras,
    enlaceExcel: enlaceExcel,
    anotarFallo: anotarFallo,
    fallos: fallos,
  };
})();
