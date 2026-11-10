// Lo que cada uno enseña en sus grupos (la "tarjeta", plan del 2026-11-08): lo mismo que Social sacaba de la API de
// los Excel (accionSocial), pero calculado en su móvil con sus series, su rutina y su calendario. Así cada uno
// publica su resumen y nadie lee los datos de nadie.
//   { nombre, hoy, desde, dias: [{ fecha, entreno, columna, resultado, total, hechos, conSiguiente, series, minutos,
//     ultima }] (de hoy hacia atrás), pasos: [...60 días], estado, progreso: { ejercicios, filas } }
var Tarjeta = (function () {
  var MINUTOS_EN_EL_GYM = 40;     // como la API: "En el gym" solo si la última serie es de hace menos
  var DIAS = 60;                   // días de gym que se publican

  function normal(t) {
    return typeof Grupos !== 'undefined' ? Grupos.normalizar(t) : String(t || '').toLowerCase().trim();
  }

  // Desde cuándo cuentan los días: el día que empezó en la app (sin Excel) o el de siempre (los dos del Excel).
  function desde(hoy) {
    var c = Almacen.config() || {};
    var inicio = c.desde || Calendario.INICIO_FALTAS;
    var tope = Calendario.sumarDias(hoy, -DIAS);
    return inicio > tope ? inicio : tope;
  }

  // Lo apuntado por día: { fecha: { nombres: { ejercicio normalizado: true }, series, horas: [] } }.
  function porDia() {
    var dias = {};
    Almacen.series().forEach(function (s) {
      if (!s.fecha) return;
      var d = dias[s.fecha] || (dias[s.fecha] = { nombres: {}, series: 0, horas: [] });
      d.nombres[normal(s.ejercicio)] = true;
      if (s.sustituye) d.nombres[normal(s.sustituye)] = true;
      var familia = typeof Grupos !== 'undefined' ? Grupos.familiaDe(s.ejercicio) : '';
      if (familia) d.nombres[normal(familia)] = true;
      d.series++;
      if (s.hora) d.horas.push(String(s.hora));
    });
    return dias;
  }

  function minutos(h) {
    var p = String(h).split(':').map(Number);
    return (p[0] || 0) * 60 + (p[1] || 0) + (p[2] || 0) / 60;
  }

  function progresoDia(fecha, entreno, dias, plan) {
    var ejercicios = ((plan && plan.entrenos && plan.entrenos[entreno]) || []).map(function (e) { return normal(e.nombre); });
    var mismo = dias[fecha];
    var siguiente = dias[Calendario.sumarDias(fecha, 1)];
    function hechos(lista) {
      return ejercicios.filter(function (n) { return lista.some(function (d) { return d && d.nombres[n]; }); }).length;
    }
    var horas = mismo ? mismo.horas.slice().sort() : [];
    return {
      total: ejercicios.length,
      hechos: hechos([mismo]),
      conSiguiente: hechos([mismo, siguiente]),
      series: (mismo ? mismo.series : 0) + (siguiente ? siguiente.series : 0),
      minutos: horas.length > 1 ? Math.round(minutos(horas[horas.length - 1]) - minutos(horas[0])) : 0,
      ultima: horas.length ? horas[horas.length - 1].slice(0, 5) : '',
    };
  }

  function resultado(fecha, hoy, entreno, p) {
    if (p.total > 0 && p.hechos === p.total) return 'Hecho';
    if (fecha <= Calendario.sumarDias(hoy, -2)) return p.total > 0 && p.conSiguiente === p.total ? 'Recuperado' : 'Falta';
    if (fecha === hoy) {
      if (!p.series) return 'Toca hoy';
      if (Almacen.terminado(fecha, entreno)) return 'Terminado';
      var ahora = new Date();
      return p.ultima && ahora.getHours() * 60 + ahora.getMinutes() - minutos(p.ultima) < MINUTOS_EN_EL_GYM ? 'En curso' : 'Sin terminar';
    }
    return p.total > 0 && p.conSiguiente === p.total ? 'Recuperado' : 'Puede recuperarlo hoy';
  }

  function diasDeGym(hoy) {
    var plan = Almacen.plan();
    var dias = porDia();
    var lista = [];
    for (var f = desde(hoy); f <= hoy; f = Calendario.sumarDias(f, 1)) {
      var c = Calendario.porCalendario(f);
      if (c.descanso || !c.entreno) continue;
      var p = progresoDia(f, c.entreno, dias, plan);
      lista.push(Object.assign({ fecha: f, entreno: c.entreno, columna: c.columna }, p, { resultado: resultado(f, hoy, c.entreno, p), motivo: '' }));
    }
    return lista.reverse();
  }

  function pasos() {
    var entreno = typeof Pasos !== 'undefined' && Pasos.kcalEntrenoPorDia ? Pasos.kcalEntrenoPorDia() || {} : {};
    return Almacen.pasos().slice(-DIAS).map(function (d) {
      return Object.assign({}, d, entreno[d.fecha] ? { kcalEntreno: entreno[d.fecha] } : {});
    });
  }

  // Perfil público (él, 2026-11-08): cada uno elige qué enseña en Social. Por defecto, todo. Se guarda en el móvil.
  var PARTES = [
    ['dias', 'Días de gym y faltas'],
    ['estado', 'Estado de fuerza'],
    ['equilibrio', 'Equilibrio (salud y fuerza)'],
    ['progreso', 'Evolución del ciclo'],
    ['pasos', 'Pasos y calorías'],
    ['recordsMes', 'Récords del mes'],
  ];
  var CLAVE = 'gymapp.perfilPublico';
  function publico() {
    var p = {};
    try { p = JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch (e) { p = {}; }
    var r = {};
    PARTES.forEach(function (x) { r[x[0]] = p[x[0]] !== false; });
    return r;
  }
  function ponerPublico(parte, si) {
    var p = {};
    try { p = JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch (e) { p = {}; }
    p[parte] = !!si;
    try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch (e) { /* sin almacenamiento */ }
  }

  // ---- El minititulo bajo tu nombre (él, 2026-11-08): hasta tres cosas que elige cada uno entre su estado de fuerza,
  // su equilibrio y sus récords. Se guarda en el perfil público (titulo: ['fuerza', 'equilibrio', 'record:press banca']).
  // Fuerza y equilibrio salen siempre, primero (él, 2026-11-08); los récords los elige cada uno: hasta 2.
  var MAX_TITULO = 2;
  var COLORES_EQUILIBRIO = ['#4cd08a', '#b5d334', '#f2c230', '#ff9b52', '#ff6b6b'];

  function elegidosTitulo() {
    var p = {};
    try { p = JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch (e) { p = {}; }
    return (Array.isArray(p.titulo) ? p.titulo : []).filter(function (id) { return /^record:/.test(id); }).slice(0, MAX_TITULO);
  }
  function ponerTitulo(lista) {
    var p = {};
    try { p = JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch (e) { p = {}; }
    p.titulo = lista.slice(0, MAX_TITULO);
    try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch (e) { /* sin almacenamiento */ }
  }

  function fuerza() {
    try {
      var r = Almacen.cuerpo() && typeof Estado !== 'undefined' ? Estado.actual() : null;
      return r && r.total > 0 ? r.total : null;
    } catch (e) { return null; }
  }

  function equilibrio() {
    var f = fuerza();
    var pesos = Almacen.tablaComida('pesos').filter(function (p) { return p.fecha && p.kg > 0; })
      .sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
    var p = pesos[pesos.length - 1];
    if (!p || !f) return null;
    var c = typeof App.composicionDe === 'function' ? App.composicionDe(p) || {} : {};
    var salud = Comida.puntuacionSalud({ fecha: p.fecha, kg: Number(p.kg), grasa: c.grasa, agua: c.agua, musculo: c.musculo }, Almacen.cuerpo());
    var e = salud ? Comida.equilibrio(salud.puntos, f) : null;
    return e ? Object.assign({ salud: salud.puntos, fuerzaTotal: f }, e) : null;
  }

  function reloj(seg) {
    seg = Math.round(seg);
    var h = Math.floor(seg / 3600), m = Math.floor(seg % 3600 / 60), x = seg % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  }

  // Correr y demás con distancia: la más larga (a igualdad, la más rápida) → "10 km en 52:10 · 5:13/km".
  // Sin distancia (plancha): el tiempo más largo → "2:30".
  function recordTiempo(dias) {
    var mejor = null;
    dias.forEach(function (d) {
      d.s.forEach(function (x) {
        var seg = Number(x[2]) || 0, km = Number(x[3]) || 0;
        if (!seg && !km) return;
        if (!mejor || km > mejor.km || (km === mejor.km && (km ? seg < mejor.seg : seg > mejor.seg))) mejor = { km: km, seg: seg };
      });
    });
    if (!mejor) return '';
    if (!mejor.km) return reloj(mejor.seg);
    var km = String(Math.round(mejor.km * 100) / 100).replace('.', ',') + ' km';
    return mejor.seg ? km + ' en ' + reloj(mejor.seg) + ' · ' + reloj(mejor.seg / mejor.km) + '/km' : km;
  }

  // La mejor serie de cada ejercicio: más kg (a igualdad, más reps); en los de su peso, más reps. { clave: { nombre, texto } }
  // El color de un récord es el de tu nivel de fuerza (él, 2026-11-08): el de ese ejercicio si cuenta en el estado de
  // fuerza (banca, sentadilla…) y, si no, el de tu nivel general.
  // Los puntos de fuerza que cuentan para un ejercicio: los suyos si es un levantamiento del estado, si no los totales.
  function puntosRecord(nombre, r) {
    if (!r || !r.total) return 0;
    var n = normal(nombre);
    var lev = r.levantamientos || {};
    var propio = Object.keys(lev).filter(function (id) { return lev[id] && normal(lev[id].ejercicio || '') === n; })[0];
    return propio ? lev[propio].puntos : r.total;
  }
  function colorRecord(nombre, r) {
    var p = puntosRecord(nombre, r);
    return p ? Fuerza.nivel(p).color : '';
  }

  function records() {
    var hist = Almacen.historial() || { ejercicios: {}, info: {} };
    var lista = {};
    var r = null;
    try { r = Almacen.cuerpo() && typeof Estado !== 'undefined' ? Estado.actual() : null; } catch (e) { r = null; }
    Object.keys(hist.ejercicios || {}).forEach(function (k) {
      var nombre = ((hist.info || {})[k] || {}).nombre || k;
      if (typeof Grupos !== 'undefined' && Grupos.porTiempo(nombre)) {
        var t = recordTiempo(hist.ejercicios[k]);
        if (t) lista[k] = { nombre: nombre, dias: hist.ejercicios[k].length, color: '', texto: nombre + ' ' + t };
        return;
      }
      var corporal = typeof Grupos !== 'undefined' && Grupos.esCorporal(nombre);
      // Asistidas: los kg son ayuda, así que el récord es con menos (a igualdad, más reps).
      var asistido = !corporal && typeof Grupos !== 'undefined' && Grupos.esAsistido && Grupos.esAsistido(nombre);
      var mejor = null;
      hist.ejercicios[k].forEach(function (d) {
        d.s.forEach(function (x) {
          var kg = corporal ? 0 : (asistido ? -1 : 1) * (Number(x[0]) || 0), reps = Number(x[1]) || 0;
          if (!reps) return;
          if (!mejor || kg > mejor[0] || (kg === mejor[0] && reps > mejor[1])) mejor = [kg, reps];
        });
      });
      if (!mejor || (!corporal && !asistido && !mejor[0])) return;
      var kgTexto = String(Math.round(Math.abs(mejor[0]) * 100) / 100).replace('.', ',');
      lista[k] = { nombre: nombre, dias: hist.ejercicios[k].length, color: colorRecord(nombre, r),
        texto: nombre + ' ' + (corporal ? mejor[1] + ' reps' : (asistido ? 'ayuda ' : '') + kgTexto + ' kg' + (mejor[1] > 1 ? ' × ' + mejor[1] : '')) };
    });
    return lista;
  }

  // Récords mes a mes (él, 2026-11-08): cada vez que se supera la mejor serie de un ejercicio (más kg o, con los mismos,
  // más reps; en los de su peso, más reps; corriendo, más distancia). Si se vuelve a superar en el mismo mes, se
  // reescribe: queda el último de cada ejercicio. La primera vez que se hace un ejercicio no cuenta.
  // [{ mes: 'aaaa-mm', lista: [{ ejercicio, texto, fecha, color }] }] de los últimos 6 meses, el más reciente primero.
  function recordsPorMes() {
    var hist = Almacen.historial() || { ejercicios: {}, info: {} };
    var r = null;
    try { r = Almacen.cuerpo() && typeof Estado !== 'undefined' ? Estado.actual() : null; } catch (e) { r = null; }
    var meses = {};
    Object.keys(hist.ejercicios || {}).forEach(function (k) {
      var nombre = ((hist.info || {})[k] || {}).nombre || k;
      var tiempo = typeof Grupos !== 'undefined' && Grupos.porTiempo(nombre);
      var corporal = typeof Grupos !== 'undefined' && Grupos.esCorporal(nombre);
      var asistido = !corporal && !tiempo && typeof Grupos !== 'undefined' && Grupos.esAsistido && Grupos.esAsistido(nombre);
      var mejor = null;
      hist.ejercicios[k].slice().sort(function (a, b) { return a.f < b.f ? -1 : a.f > b.f ? 1 : 0; }).forEach(function (d) {
        var delDia = null;
        d.s.forEach(function (x) {
          var v = tiempo ? [Number(x[3]) || 0, -(Number(x[2]) || 0)] : [corporal ? 0 : (asistido ? -1 : 1) * (Number(x[0]) || 0), Number(x[1]) || 0];
          if (tiempo ? !v[0] : !v[1] || (!corporal && !asistido && !v[0])) return;
          if (!delDia || v[0] > delDia.v[0] || (v[0] === delDia.v[0] && v[1] > delDia.v[1])) delDia = { v: v, x: x };
        });
        if (!delDia) return;
        var supera = mejor && (delDia.v[0] > mejor[0] || (delDia.v[0] === mejor[0] && delDia.v[1] > mejor[1]));
        if (!mejor || supera) {
          if (supera) {
            var x = delDia.x;
            var texto = tiempo ? String(Math.round((Number(x[3]) || 0) * 100) / 100).replace('.', ',') + ' km' + (x[2] ? ' en ' + reloj(x[2]) : '')
              : corporal ? (Number(x[1]) || 0) + ' reps'
                : asistido ? 'ayuda ' + String(Math.round((Number(x[0]) || 0) * 100) / 100).replace('.', ',') + ' kg × ' + (Number(x[1]) || 0)
                : String(Math.round((Number(x[0]) || 0) * 100) / 100).replace('.', ',') + ' kg' + (Number(x[1]) > 1 ? ' × ' + Number(x[1]) : '');
            var mes = d.f.slice(0, 7);
            (meses[mes] || (meses[mes] = {}))[k] = { ejercicio: nombre, texto: texto, fecha: d.f, color: tiempo ? '' : colorRecord(nombre, r),
              nivel: tiempo ? 0 : Math.round(puntosRecord(nombre, r) * 10) / 10 };
          }
          mejor = delDia.v;
        }
      });
    });
    return Object.keys(meses).sort().reverse().slice(0, 6).map(function (mes) {
      return { mes: mes, lista: Object.keys(meses[mes]).map(function (k) { return meses[mes][k]; })
        .sort(function (a, b) { return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0; }) };
    });
  }

  // Lo que se puede poner: [{ id, texto, color }]. Los récords, de los ejercicios que más se han hecho.
  function opcionesTitulo() {
    var lista = [];
    var f = fuerza();
    if (f) {
      var n = Fuerza.nivel(f);
      lista.push({ id: 'fuerza', grupo: 'Fuerza', texto: 'Fuerza ' + String(Math.round(f * 10) / 10).replace('.', ',') + ' · ' + n.nombre, color: n.color });
    }
    var e = equilibrio();
    if (e) lista.push({ id: 'equilibrio', grupo: 'Equilibrio', texto: 'Equilibrio ' + e.nombre, color: COLORES_EQUILIBRIO[e.tramo] });
    else lista.push({ id: 'equilibrio', grupo: 'Equilibrio', texto: 'Equilibrio', color: '', falta: f ? 'Pésate para tenerlo' : 'Necesitas tu fuerza y un pesaje' });
    var r = records();
    Object.keys(r).sort(function (a, b) { return r[b].dias - r[a].dias; }).forEach(function (k) {
      lista.push({ id: 'record:' + k, grupo: 'Récords', texto: r[k].texto, color: r[k].color || '' });
    });
    return lista;
  }

  function titulo() {
    var opciones = {};
    opcionesTitulo().forEach(function (o) { opciones[o.id] = o; });
    var fijos = ['fuerza', 'equilibrio'].map(function (id) {
      var o = opciones[id];
      if (o && !o.falta) return { tipo: id, texto: o.texto, color: o.color || '' };
      return { tipo: id, texto: (id === 'fuerza' ? 'Fuerza' : 'Equilibrio') + ' —', color: '' };
    });
    return fijos.concat(elegidosTitulo().map(function (id) { return opciones[id]; }).filter(function (o) { return o && !o.falta; })
      .map(function (o) { return { tipo: 'record', texto: o.texto, color: o.color || '' }; }));
  }

  // Solo si algún ejercicio tiene algo hecho en el ciclo (con la rutina de serie, sin principales, sale vacío).
  function conDatos(p) {
    return !!(p && p.filas && p.filas.some(function (f) {
      return Object.keys(f.valores || {}).some(function (n) { var v = f.valores[n] || []; return v[1] != null && v[1] !== '' && v[1] !== 0; });
    }));
  }

  function calcular() {
    var hoy = Almacen.hoyISO();
    var c = Almacen.config() || {};
    var estado = null, progreso = null;
    try { estado = typeof Estado !== 'undefined' ? Estado.actual() : null; } catch (e) { /* sin datos del cuerpo */ }
    try { progreso = Almacen.progreso(); } catch (e) { /* sin ciclo todavía */ }
    var ve = publico();
    var oculto = PARTES.map(function (x) { return x[0]; }).filter(function (k) { return !ve[k]; });
    return {
      nombre: String(c.nombre || 'Yo').slice(0, 40),
      hoy: hoy,
      desde: desde(hoy),
      dias: ve.dias ? diasDeGym(hoy) : [],
      pasos: ve.pasos ? pasos() : [],
      estado: ve.estado ? estado : null,
      progreso: ve.progreso && conDatos(progreso) ? { ejercicios: progreso.ejercicios || [], filas: progreso.filas } : null,
      oculto: oculto,
      titulo: titulo(),
      equilibrio: ve.equilibrio ? equilibrio() : null,
      recordsMes: ve.recordsMes ? recordsPorMes() : [],
    };
  }

  return {
    calcular: calcular, PARTES: PARTES, publico: publico, ponerPublico: ponerPublico,
    MAX_TITULO: MAX_TITULO, recordsPorMes: recordsPorMes, opcionesTitulo: opcionesTitulo, elegidosTitulo: elegidosTitulo, ponerTitulo: ponerTitulo, titulo: titulo,
  };
})();
