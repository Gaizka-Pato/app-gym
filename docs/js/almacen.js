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
  var ESPERA = { historial: 150000, plan: 60000, progreso: 60000 };

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
  function plan() {
    var p = leer(clavePersona('plan'), null);
    if (p && p.entrenos && typeof p.entrenos === 'object') return p;
    return null;
  }

  function actualizarPlan() {
    return llamar('plan', {}, 'entrenos').then(function (r) {
      escribir(clavePersona('plan'), {
        entrenos: r.entrenos, ultimaSesion: r.ultimaSesion, grupos: r.grupos || [], rms: r.rms || {}, excel: r.excel || null,
        puedeEditar: !!r.puedeEditar,
        actualizado: Date.now(),
      });
      avisar();
      return plan();
    });
  }

  // Un historial guardado sin ejercicios no vale: se trata como si no hubiera nada para que se vuelva a pedir.
  function historial() {
    var h = leer(clavePersona('historial'), null);
    if (h && h.ejercicios && Object.keys(h.ejercicios).length) return h;
    return null;
  }

  function actualizarHistorial() {
    return llamar('historial', {}, 'ejercicios').then(function (r) {
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
  function progreso() {
    return leer(clavePersona('progreso'), null);
  }

  function actualizarProgreso() {
    return llamar('progreso', {}, 'filas').then(function (r) {
      escribir(clavePersona('progreso'), { ejercicios: r.ejercicios || [], filas: r.filas || [], actualizado: Date.now() });
      avisar();
      return progreso();
    });
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
      if (antes && antes.pasos === d.pasos && antes.kcal === d.kcal) return;
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
      dias: pendientesPasos.map(function (d) { return { fecha: d.fecha, pasos: d.pasos, km: d.km, kcal: d.kcal, objetivo: d.objetivo }; }),
    }, 'guardados').then(function () {
      marcar('pasosSubidos', Date.now());
      var enviados = {};
      pendientesPasos.forEach(function (d) { enviados[d.fecha] = d; });
      var porFecha = {};
      pasos().forEach(function (d) {
        var e = enviados[d.fecha];
        porFecha[d.fecha] = e && e.pasos === d.pasos && e.objetivo === d.objetivo ? Object.assign({}, d, { subida: true }) : d;
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
    actualizarPlan: actualizarPlan,
    historial: historial,
    actualizarHistorial: actualizarHistorial,
    progreso: progreso,
    actualizarProgreso: actualizarProgreso,
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
    guardarPasos: guardarPasos,
    actualizarPasos: actualizarPasos,
    objetivoPasos: objetivoPasos,
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
