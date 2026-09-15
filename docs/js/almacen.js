// Datos de la app en el móvil: configuración, plan e historial guardados para usarlos sin cobertura,
// y las series apuntadas, que se suben al Excel en cuanto hay conexión.
var Almacen = (function () {
  var PREFIJO = 'gymapp.';
  var oyentes = [];
  var sincronizando = null;

  function leer(clave, porDefecto) {
    try {
      var v = localStorage.getItem(PREFIJO + clave);
      return v ? JSON.parse(v) : porDefecto;
    } catch (e) {
      return porDefecto;
    }
  }

  function escribir(clave, valor) {
    try {
      localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
    } catch (e) {
      console.warn('No se pudo guardar en el móvil', e);
    }
  }

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

  function llamar(accion, datos) {
    var c = config();
    if (!c || !c.url) return Promise.reject(new Error('Falta configurar la app'));
    var controlador = new AbortController();
    var espera = setTimeout(function () { controlador.abort(); }, 30000);
    // text/plain evita la petición previa de CORS, que Apps Script no contesta.
    return fetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ clave: c.clave, persona: c.persona, accion: accion }, datos || {})),
      signal: controlador.signal,
    })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.error || 'Error de la API');
        return r;
      })
      .finally(function () { clearTimeout(espera); });
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

  function plan() {
    return leer(clavePersona('plan'), null);
  }

  function actualizarPlan() {
    return llamar('plan').then(function (r) {
      escribir(clavePersona('plan'), {
        entrenos: r.entrenos, ultimaSesion: r.ultimaSesion, grupos: r.grupos || [], rms: r.rms || {}, actualizado: Date.now(),
      });
      avisar();
      return plan();
    });
  }

  function historial() {
    return leer(clavePersona('historial'), null);
  }

  function actualizarHistorial() {
    return llamar('historial').then(function (r) {
      escribir(clavePersona('historial'), { ejercicios: r.ejercicios, info: r.info || {}, actualizado: Date.now() });
      avisar();
      return historial();
    });
  }

  // ---- Series apuntadas ----

  function series() {
    return leer(clavePersona('series'), []);
  }

  function guardarSeries(lista) {
    // Solo se guardan en el móvil las de los últimos 21 días o las que faltan por subir.
    var limite = hoyISO(new Date(Date.now() - 21 * 86400000));
    escribir(clavePersona('series'), lista.filter(function (s) { return !s.subida || s.fecha >= limite; }));
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

    var campos = ['id', 'fecha', 'hora', 'entreno', 'columna', 'ejercicio', 'tipo', 'serie', 'kg', 'reps', 'sustituye'];
    sincronizando = Promise.resolve()
      .then(function () {
        if (!subir.length) return null;
        return llamar('guardar', {
          series: subir.map(function (s) {
            var limpio = {};
            campos.forEach(function (k) { limpio[k] = s[k]; });
            return limpio;
          }),
        });
      })
      .then(function (r) {
        var ids = {};
        subir.forEach(function (s) { ids[s.id] = true; });
        guardarSeries(series().map(function (s) { return ids[s.id] ? Object.assign({}, s, { subida: true }) : s; }));
        if (r) actualizarUltimaSesion(r.ultimaSesion);
        return borrar.length ? llamar('borrar', { ids: borrar }) : null;
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
          .map(function (s) { return [s.kg, s.reps]; }),
      };
    }
    return ultimoHistorial ? { fecha: ultimoHistorial.f, series: ultimoHistorial.s } : null;
  }

  function alCambiar(f) {
    oyentes.push(f);
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
    actualizarPlan: actualizarPlan,
    historial: historial,
    actualizarHistorial: actualizarHistorial,
    series: series,
    apuntar: apuntar,
    quitar: quitar,
    pendientes: pendientes,
    sincronizar: sincronizar,
    ultimaSesion: ultimaSesion,
    ultimaVez: ultimaVez,
    alCambiar: alCambiar,
  };
})();
