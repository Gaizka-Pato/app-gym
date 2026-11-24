// Correr, andar o bici con la ubicación (él, 2026-11-08): la ruta en el mapa, km y tiempo exactos, pausa y reanudar,
// y "¿Sigues?" tras 10 min sin moverse (sin respuesta en 2 min, o con "No", se termina). En el APK 2.3 lo graba
// ServicioRuta con la pantalla apagada; en el navegador, mientras la página está abierta. Al terminar: guardar (la
// serie con sus km y su tiempo) y, si se quiere, compartirla en los grupos sin los primeros y últimos 200 m.
var Ruta = (function () {
  var h = App.h;
  var EXTERIOR = /correr|carrera|running|andar|caminar|caminata|paseo|senderismo|trail|bici|ciclismo|mtb|patinar|patines/;
  var INTERIOR = /cinta|estatica|eliptica|spinning|rodillo|remo/;
  var QUIETO_MS = 10 * 60000;
  var SIN_RESPUESTA_MS = 2 * 60000;
  var PRIVADO_M = 200;
  var CTX = 'gymapp.ruta.ctx';
  var NAV = 'gymapp.ruta.nav';
  var GUARDADAS = 'gymapp.rutas';

  function normal(t) { return typeof Grupos !== 'undefined' ? Grupos.normalizar(t) : String(t || '').toLowerCase(); }
  function esExterior(nombre) { var n = normal(nombre); return EXTERIOR.test(n) && !INTERIOR.test(n); }
  function esBici(nombre) { return /bici|ciclismo|mtb/.test(normal(nombre)); }

  function leerJSON(clave, defecto) {
    try { var v = JSON.parse(localStorage.getItem(clave) || 'null'); return v == null ? defecto : v; } catch (e) { return defecto; }
  }
  function escribirJSON(clave, v) {
    try { if (v == null) localStorage.removeItem(clave); else localStorage.setItem(clave, JSON.stringify(v)); } catch (e) { /* lleno */ }
  }

  // ---- Distancias ----
  function metrosEntre(a, b) {
    var R = 6371000, rad = Math.PI / 180;
    var dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }

  // ---- En el navegador (sin el APK): lo mismo que ServicioRuta, mientras la página está abierta ----
  var vigilante = null;
  function navEstado() { return leerJSON(NAV, { estado: '' }); }
  function navGuardar(e) { escribirJSON(NAV, e); }
  function navSegundos(e, ahora) {
    var fin = e.estado === 'terminada' ? e.fin : ahora;
    var enPausa = e.estado === 'pausada' ? ahora - e.pausaDesde : 0;
    return Math.max(0, Math.round((fin - e.inicio - (e.pausado || 0) - enPausa) / 1000));
  }
  function navPosicion(p) {
    var e = navEstado();
    if (e.estado !== 'grabando') return;
    if (p.coords.accuracy > 30) return;
    var punto = [p.coords.latitude, p.coords.longitude, p.timestamp, e.tramo || 0];
    var antes = e.puntos[e.puntos.length - 1];
    if (e.cortar) { e.tramo = (e.tramo || 0) + 1; punto[3] = e.tramo; e.cortar = false; }
    else if (antes && antes[3] === punto[3]) {
      var d = metrosEntre(antes, punto), dt = (punto[2] - antes[2]) / 1000;
      if (d >= 3 && (dt <= 0 || d / dt < 15)) e.metros += d;
    }
    e.puntos.push(punto);
    if (!e.ancla || metrosEntre(e.ancla, punto) > 25) { e.ancla = punto; e.movido = Date.now(); e.preguntado = 0; }
    navGuardar(e);
  }
  function navVigilar() {
    if (vigilante != null || !navigator.geolocation) return;
    vigilante = navigator.geolocation.watchPosition(navPosicion, function () { /* sin permiso o sin señal: se sigue intentando */ },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
  }
  function navDejar() {
    if (vigilante != null) navigator.geolocation.clearWatch(vigilante);
    vigilante = null;
  }

  var nav = {
    empezar: function (ejercicio) {
      var ahora = Date.now();
      navGuardar({ estado: 'grabando', ejercicio: ejercicio, inicio: ahora, movido: ahora, pausado: 0, metros: 0, puntos: [], tramo: 0 });
      navVigilar();
      return Promise.resolve(true);
    },
    pausar: function () { var e = navEstado(); if (e.estado !== 'grabando') return; e.estado = 'pausada'; e.pausaDesde = Date.now(); navGuardar(e); },
    reanudar: function () {
      var e = navEstado(); if (e.estado !== 'pausada') return;
      var ahora = Date.now();
      e.pausado = (e.pausado || 0) + ahora - e.pausaDesde; e.estado = 'grabando'; e.movido = ahora; e.cortar = true; delete e.pausaDesde;
      navGuardar(e);
    },
    terminar: function (fin, motivo) {
      var e = navEstado(); if (e.estado !== 'grabando' && e.estado !== 'pausada') return;
      fin = fin || Date.now();
      if (e.estado === 'pausada') { e.pausado = (e.pausado || 0) + fin - e.pausaDesde; delete e.pausaDesde; }
      e.estado = 'terminada'; e.fin = fin; e.motivo = motivo || 'usuario';
      navGuardar(e);
      navDejar();
    },
    estado: function () {
      var e = navEstado();
      return { estado: e.estado || '', ejercicio: e.ejercicio || '', inicio: e.inicio || 0, fin: e.fin || 0, seg: e.estado ? navSegundos(e, Date.now()) : 0,
        metros: e.metros || 0, motivo: e.motivo || '', puntos: e.puntos || [], movido: e.movido, preguntado: e.preguntado };
    },
    limpiar: function () { navGuardar(null); navDejar(); },
  };

  // ---- En el APK ----
  function hayNativo() { return !!(window.AndroidPasos && typeof window.AndroidPasos.rutaEstado === 'function'); }
  var esperando = {};
  var anterior = window.__pasosNativo;
  window.__pasosNativo = function (id, d) {
    if (esperando[id]) { var f = esperando[id]; delete esperando[id]; f(d); return; }
    if (anterior) anterior(id, d);
  };
  var nativo = {
    empezar: function (ejercicio) {
      return new Promise(function (bien) {
        var id = 'ruta' + Date.now();
        esperando[id] = function (d) { bien(!!(d && d.concedido)); };
        window.AndroidPasos.rutaEmpezar(id, ejercicio);
      });
    },
    pausar: function () { window.AndroidPasos.rutaPausar(); },
    reanudar: function () { window.AndroidPasos.rutaReanudar(); },
    terminar: function () { window.AndroidPasos.rutaTerminar(); },
    estado: function () { try { return JSON.parse(window.AndroidPasos.rutaEstado()); } catch (e) { return { estado: '' }; } },
    limpiar: function () { window.AndroidPasos.rutaLimpiar(); },
  };

  function fuente() { return hayNativo() ? nativo : nav; }
  function estado() { return fuente().estado(); }
  function activa() { var e = estado().estado; return e === 'grabando' || e === 'pausada' || e === 'terminada'; }

  // ---- Empezar (desde la tarjeta de Entreno) ----
  function empezar(ctx) {
    if (activa()) { App.mostrar('ruta'); return; }
    if (!hayNativo() && !navigator.geolocation) { App.avisar('Este dispositivo no tiene ubicación', true); return; }
    App.abrirSelector(ctx.ejercicio + ' con ubicación', [
      h('p', { class: 'detalle', texto: 'Ares grabará tu ruta en el mapa, los km y el tiempo, también con la pantalla apagada. Puedes pausar cuando quieras. Si pasas 10 minutos sin moverte te preguntará si sigues.' }),
      h('button', { type: 'button', class: 'principal grande', texto: 'Activar ubicación y empezar', onclick: function (ev) {
        ev.currentTarget.disabled = true;
        escribirJSON(CTX, ctx);
        fuente().empezar(ctx.ejercicio).then(function (ok) {
          App.cerrarSelector();
          if (!ok) { escribirJSON(CTX, null); App.avisar('Sin permiso de ubicación no se puede grabar la ruta', true); return; }
          App.mostrar('ruta');
        });
      } }),
    ]);
  }

  // ---- El mapa (Leaflet, se carga solo al abrir la ruta) ----
  var cargando = null;
  function leaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (cargando) return cargando;
    cargando = new Promise(function (bien, mal) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(css);
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload = function () { bien(window.L); };
      s.onerror = function () { cargando = null; mal(new Error('Sin conexión: el mapa saldrá luego, la ruta se graba igual')); };
      document.head.appendChild(s);
    });
    return cargando;
  }

  // Tramos de la ruta (cada pausa empieza otro): [[[lat, lon], …], …].
  function tramos(puntos) {
    var lista = [];
    var actual = null, cual = null;
    (puntos || []).forEach(function (p) {
      if (p[3] !== cual) { actual = []; lista.push(actual); cual = p[3]; }
      actual.push([p[0], p[1]]);
    });
    return lista.filter(function (t) { return t.length; });
  }

  function pintarMapa(caja, lineas, seguir) {
    return leaflet().then(function (L) {
      var mapa = caja._mapa;
      if (!mapa) {
        mapa = caja._mapa = L.map(caja, { zoomControl: false, attributionControl: true });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa);
        caja._capa = L.layerGroup().addTo(mapa);
        mapa.setView([40.4168, -3.7038], 5);
      }
      caja._capa.clearLayers();
      var todos = [];
      lineas.forEach(function (t) {
        L.polyline(t, { color: '#fb6204', weight: 5, opacity: .9 }).addTo(caja._capa);
        todos = todos.concat(t);
      });
      if (!todos.length) return;
      var ultimo = todos[todos.length - 1];
      L.circleMarker(ultimo, { radius: 7, color: '#fff', weight: 3, fillColor: '#fb6204', fillOpacity: 1 }).addTo(caja._capa);
      if (seguir) mapa.setView(ultimo, Math.max(mapa.getZoom(), 16));
      else mapa.fitBounds(L.latLngBounds(todos), { padding: [24, 24] });
    }).catch(function (e) {
      if (!caja.querySelector('.ruta-sin-mapa')) caja.appendChild(h('p', { class: 'detalle ruta-sin-mapa', texto: e.message }));
    });
  }

  // ---- Números ----
  function reloj(seg) {
    seg = Math.max(0, Math.round(seg));
    var hh = Math.floor(seg / 3600), m = Math.floor(seg % 3600 / 60), x = seg % 60;
    return (hh ? hh + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  }
  function kmTexto(metros) { return (Math.round(metros / 10) / 100).toFixed(2).replace('.', ','); }
  // sinUnidad: para las cifras grandes de la pantalla, que llevan la unidad debajo.
  function ritmoTexto(seg, metros, bici, sinUnidad) {
    if (!(metros > 50) || !(seg > 0)) return '—';
    if (bici) return String(Math.round(metros / seg * 3.6 * 10) / 10).replace('.', ',') + (sinUnidad ? '' : ' km/h');
    return reloj(seg / (metros / 1000)) + (sinUnidad ? '' : ' /km');
  }

  // ---- La pantalla de la ruta (en marcha o terminada) ----
  var cuenta = null;
  var preguntaAbierta = false;

  App.vistas.ruta = function (cont) {
    clearInterval(cuenta);
    var e = estado();
    var ctx = leerJSON(CTX, {}) || {};
    if (!e.estado) {
      cont.appendChild(h('div', { class: 'tarjeta' }, [h('p', { texto: 'No hay ninguna ruta en marcha.' }),
        h('button', { type: 'button', class: 'principal', texto: '‹ Volver', onclick: volver })]));
      return;
    }
    var bici = esBici(e.ejercicio);
    var mapa = h('div', { class: 'ruta-mapa' });
    var cifraTiempo = h('strong', { texto: reloj(e.seg) });
    var cifraKm = h('strong', { texto: kmTexto(e.metros) });
    var cifraRitmo = h('strong', { texto: ritmoTexto(e.seg, e.metros, bici, true) });
    var cifras = h('div', { class: 'ruta-cifras' }, [
      h('div', {}, [cifraTiempo, h('span', { texto: 'tiempo' })]),
      h('div', {}, [cifraKm, h('span', { texto: 'km' })]),
      h('div', {}, [cifraRitmo, h('span', { texto: bici ? 'km/h' : 'min/km' })]),
    ]);
    if (e.estado === 'terminada') return resumen(cont, e, ctx, mapa, cifras);

    var pausada = e.estado === 'pausada';
    cont.appendChild(h('div', { class: 'ruta-cabecera' }, [
      h('h2', { texto: e.ejercicio }),
      h('span', { class: 'chip resultado ' + (pausada ? 'espera' : 'bien'), texto: pausada ? 'En pausa' : 'Grabando' }),
    ]));
    cont.appendChild(mapa);
    cont.appendChild(cifras);
    cont.appendChild(h('div', { class: 'ruta-botones' }, [
      h('button', { type: 'button', class: pausada ? 'principal grande' : 'grande', texto: pausada ? '▶ Reanudar' : '❚❚ Pausar', onclick: function () {
        if (pausada) fuente().reanudar(); else fuente().pausar();
        App.repintar();
      } }),
      h('button', { type: 'button', class: 'grande ruta-terminar', texto: '■ Terminar', onclick: function (ev) {
        var b = ev.currentTarget;
        if (b.dataset.seguro !== 'sí') { b.dataset.seguro = 'sí'; b.textContent = '¿Terminar? Toca otra vez'; return; }
        fuente().terminar();
        App.repintar();
      } }),
    ]));
    cont.appendChild(h('button', { type: 'button', class: 'discreto ruta-volver', texto: '‹ Volver al entreno (sigue grabando)', onclick: volver }));
    pintarMapa(mapa, tramos(e.puntos), true);

    // Cada 2 s: números y mapa al día; en el navegador, además, el "¿Sigues?".
    var vistos = (e.puntos || []).length;
    cuenta = setInterval(function () {
      if (!document.body.contains(cifras)) { clearInterval(cuenta); return; }
      var x = estado();
      if (x.estado !== e.estado) { clearInterval(cuenta); App.repintar(); return; }
      cifraTiempo.textContent = reloj(x.seg);
      cifraKm.textContent = kmTexto(x.metros);
      cifraRitmo.textContent = ritmoTexto(x.seg, x.metros, bici, true);
      if ((x.puntos || []).length !== vistos) { vistos = x.puntos.length; pintarMapa(mapa, tramos(x.puntos), true); }
      if (!hayNativo()) revisarQuieto(x);
    }, 2000);
  };

  // En el navegador: tras 10 min quieto, "¿Sigues?" (el APK lo hace con una notificación).
  function revisarQuieto(x) {
    if (x.estado !== 'grabando') return;
    var ahora = Date.now();
    var e = navEstado();
    if (e.preguntado && ahora - e.preguntado > SIN_RESPUESTA_MS) {
      preguntaAbierta = false;
      App.cerrarSelector();
      nav.terminar(e.movido, 'quieto');
      App.repintar();
      return;
    }
    if (!e.preguntado && ahora - e.movido > QUIETO_MS && !preguntaAbierta) {
      e.preguntado = ahora;
      navGuardar(e);
      preguntaAbierta = true;
      App.abrirSelector('¿Sigues?', [
        h('p', { class: 'detalle', texto: 'Llevas 10 minutos sin moverte. Si no, se dará por terminado: ' + e.ejercicio + '.' }),
        h('button', { type: 'button', class: 'principal', texto: 'Sí, sigo', onclick: function () {
          var y = navEstado(); y.movido = Date.now(); y.preguntado = 0; navGuardar(y);
          preguntaAbierta = false;
          App.cerrarSelector();
        } }),
        h('button', { type: 'button', class: 'discreto', texto: 'No, terminar', onclick: function () {
          preguntaAbierta = false;
          App.cerrarSelector();
          nav.terminar(navEstado().movido, 'quieto');
          App.repintar();
        } }),
      ]);
    }
  }

  function volver() {
    clearInterval(cuenta);
    var ctx = leerJSON(CTX, {}) || {};
    App.mostrar(ctx.entreno ? 'hoy' : 'inicio');
  }

  // ---- Al terminar ----

  // Menos puntos (Douglas-Peucker, ~5 m) para guardar y compartir.
  function simplificar(t, tolerancia) {
    if (t.length < 3) return t.slice();
    function distSeg(p, a, b) {
      var x = metrosEntre(a, p), y = metrosEntre(b, p), z = metrosEntre(a, b);
      if (z < 1) return x;
      var s = (x + y + z) / 2;
      return 2 * Math.sqrt(Math.max(0, s * (s - x) * (s - y) * (s - z))) / z;
    }
    var maxD = 0, idx = 0;
    for (var i = 1; i < t.length - 1; i++) { var d = distSeg(t[i], t[0], t[t.length - 1]); if (d > maxD) { maxD = d; idx = i; } }
    if (maxD <= tolerancia) return [t[0], t[t.length - 1]];
    return simplificar(t.slice(0, idx + 1), tolerancia).slice(0, -1).concat(simplificar(t.slice(idx), tolerancia));
  }

  // Sin los primeros y los últimos 200 m (para no enseñar dónde vives).
  function recortar(lineas) {
    var todos = [];
    lineas.forEach(function (t, i) { t.forEach(function (p) { todos.push([p[0], p[1], i]); }); });
    var hecho = 0, desde = 0;
    for (var i = 1; i < todos.length && hecho < PRIVADO_M; i++) { hecho += metrosEntre(todos[i - 1], todos[i]); desde = i; }
    hecho = 0;
    var hasta = todos.length - 1;
    for (var j = todos.length - 1; j > desde && hecho < PRIVADO_M; j--) { hecho += metrosEntre(todos[j], todos[j - 1]); hasta = j - 1; }
    var resto = todos.slice(desde, hasta + 1);
    var salida = [];
    var cual = null;
    resto.forEach(function (p) { if (p[2] !== cual) { salida.push([]); cual = p[2]; } salida[salida.length - 1].push([p[0], p[1]]); });
    return salida.filter(function (t) { return t.length > 1; });
  }

  // Para Firestore (no admite listas dentro de listas): [lat, lon, lat, lon…] y dónde empieza cada tramo.
  function plano(lineas) {
    var coords = [], cortes = [];
    lineas.forEach(function (t) {
      cortes.push(coords.length / 2);
      t.forEach(function (p) { coords.push(Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5); });
    });
    return { coords: coords, cortes: cortes };
  }
  function desdePlano(r) {
    var lineas = [];
    var c = r.coords || [], cortes = (r.cortes || [0]).concat([c.length / 2]);
    for (var i = 0; i < cortes.length - 1; i++) {
      var t = [];
      for (var k = cortes[i]; k < cortes[i + 1]; k++) t.push([c[2 * k], c[2 * k + 1]]);
      if (t.length) lineas.push(t);
    }
    return lineas;
  }

  function resumen(cont, e, ctx, mapa, cifras) {
    var grupos = typeof Equipos !== 'undefined' ? Equipos.deGym() : [];
    var compartir = false;
    var quieto = e.motivo === 'quieto';
    var interruptor = grupos.length ? h('button', { type: 'button', class: 'fila-ajuste interruptor-tema', role: 'switch', 'aria-checked': 'false', onclick: function () {
      compartir = !compartir;
      interruptor.setAttribute('aria-checked', compartir ? 'true' : 'false');
      interruptor.querySelector('.interruptor').classList.toggle('encendido', compartir);
    } }, [
      h('span', { class: 'fila-ajuste-titulo', texto: 'Compartir en ' + (grupos.length === 1 ? grupos[0].nombre : 'tus grupos') }),
      h('span', { class: 'interruptor', 'aria-hidden': 'true' }, [h('span', { class: 'interruptor-bola' })]),
    ]) : null;
    cont.appendChild(h('div', { class: 'ruta-cabecera' }, [h('h2', { texto: e.ejercicio + ' terminado' })]));
    if (quieto) cont.appendChild(h('p', { class: 'detalle', texto: 'Se terminó al llevar 10 minutos sin moverte; el tiempo acaba en el último movimiento.' }));
    cont.appendChild(mapa);
    cont.appendChild(cifras);
    if (interruptor) {
      cont.appendChild(interruptor);
      cont.appendChild(h('p', { class: 'detalle ruta-privado', texto: 'Al compartir no se ven los primeros ni los últimos 200 m, para no enseñar dónde vives.' }));
    }
    cont.appendChild(h('button', { type: 'button', class: 'principal grande', texto: 'Guardar', onclick: function (ev) {
      ev.currentTarget.disabled = true;
      guardar(e, ctx, compartir).then(function () {
        App.avisar(e.ejercicio + ' guardado: ' + kmTexto(e.metros) + ' km en ' + reloj(e.seg));
        volver();
      });
    } }));
    cont.appendChild(h('button', { type: 'button', class: 'discreto ruta-volver', texto: 'Descartar', onclick: function (ev) {
      var b = ev.currentTarget;
      if (b.dataset.seguro !== 'sí') { b.dataset.seguro = 'sí'; b.textContent = '¿Seguro? Se pierde la ruta'; return; }
      fuente().limpiar();
      escribirJSON(CTX, null);
      volver();
    } }));
    pintarMapa(mapa, tramos(e.puntos), false);
  }

  function guardar(e, ctx, compartir) {
    var inicio = new Date(e.inicio || Date.now());
    var hora = String(inicio.getHours()).padStart(2, '0') + ':' + String(inicio.getMinutes()).padStart(2, '0') + ':00';
    var fecha = ctx.fecha || Almacen.hoyISO(inicio);
    var km = Math.round(e.metros / 10) / 100;
    Almacen.apuntar({
      fecha: fecha, hora: hora, entreno: ctx.entreno || '', columna: ctx.columna || '', ejercicio: e.ejercicio, ejercicioId: ctx.ejercicioId,
      tipo: ctx.tipo || 'extra', serie: ctx.serie || 1, kg: 0, reps: 0, seg: e.seg, km: km, sustituye: ctx.sustituye || '',
    });
    var lineas = tramos(e.puntos).map(function (t) { return simplificar(t, 5); });
    var id = 'r' + (e.inicio || Date.now()).toString(36);
    var ruta = Object.assign({ id: id, ejercicio: e.ejercicio, fecha: fecha, hora: hora.slice(0, 5), km: km, seg: e.seg }, plano(lineas));
    var lista = leerJSON(GUARDADAS, []).filter(function (r) { return r.id !== id; }).concat([ruta]).slice(-50);
    escribirJSON(GUARDADAS, lista);
    fuente().limpiar();
    escribirJSON(CTX, null);
    if (!compartir) return Promise.resolve();
    var publica = Object.assign({ de: Nube.uid(), ejercicio: e.ejercicio, fecha: fecha, hora: hora.slice(0, 5), km: km, seg: e.seg }, plano(recortar(lineas)));
    return Promise.all(Equipos.deGym().map(function (g) {
      return Nube.escribir('grupos/' + g._id + '/rutas/' + id, publica).catch(function () { App.avisar('No se pudo compartir en ' + g.nombre, true); });
    }));
  }

  // ---- Para Social: una ruta en pequeño (sin mapa de fondo, solo el trazo) y en grande (con el mapa) ----
  function miniatura(r) {
    var lineas = desdePlano(r);
    var todos = [].concat.apply([], lineas);
    if (todos.length < 2) return h('span', { class: 'ruta-mini' });
    var lats = todos.map(function (p) { return p[0]; }), lons = todos.map(function (p) { return p[1]; });
    var minLa = Math.min.apply(null, lats), maxLa = Math.max.apply(null, lats), minLo = Math.min.apply(null, lons), maxLo = Math.max.apply(null, lons);
    var k = Math.cos((minLa + maxLa) / 2 * Math.PI / 180);
    var ancho = Math.max((maxLo - minLo) * k, 1e-6), alto = Math.max(maxLa - minLa, 1e-6);
    var escala = 52 / Math.max(ancho, alto);
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('class', 'ruta-mini');
    lineas.forEach(function (t) {
      var d = t.map(function (p, i) {
        var x = 6 + ((p[1] - minLo) * k) * escala + (52 - ancho * escala) / 2;
        var y = 58 - (p[0] - minLa) * escala - (52 - alto * escala) / 2;
        return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      }).join(' ');
      var camino = document.createElementNS(ns, 'path');
      camino.setAttribute('d', d);
      svg.appendChild(camino);
    });
    return svg;
  }

  function abrirEnGrande(r) {
    var mapa = h('div', { class: 'ruta-mapa' });
    App.abrirSelector(r.ejercicio + ' · ' + kmTexto(r.km * 1000) + ' km', [
      mapa,
      h('p', { class: 'detalle', texto: reloj(r.seg) + ' · ' + ritmoTexto(r.seg, r.km * 1000, esBici(r.ejercicio)) }),
    ]);
    setTimeout(function () { pintarMapa(mapa, desdePlano(r), false).then(function () { if (mapa._mapa) mapa._mapa.invalidateSize(); }); }, 60);
  }

  function texto(r) {
    return kmTexto(r.km * 1000) + ' km · ' + reloj(r.seg) + ' · ' + ritmoTexto(r.seg, r.km * 1000, esBici(r.ejercicio));
  }

  // Al volver a la app con una ruta en marcha (o terminada sin guardar), directa a ella.
  function alAbrir() {
    if (activa() && document.body.classList.contains('vista-inicio')) App.mostrar('ruta');
  }
  window.addEventListener('hashchange', function () {
    if (location.hash !== '#ruta') return;
    history.replaceState(null, '', location.pathname);
    App.mostrar('ruta');
  });
  window.addEventListener('load', function () {
    if (location.hash === '#ruta') { history.replaceState(null, '', location.pathname); setTimeout(function () { App.mostrar('ruta'); }, 600); return; } setTimeout(alAbrir, 800); if (!hayNativo() && navEstado().estado === 'grabando') navVigilar(); });

  return {
    esExterior: esExterior, empezar: empezar, activa: activa, estado: estado,
    guardadas: function () { return leerJSON(GUARDADAS, []); },
    miniatura: miniatura, abrirEnGrande: abrirEnGrande, texto: texto, reloj: reloj,
    // Para las pruebas.
    simplificar: simplificar, recortar: recortar, plano: plano, desdePlano: desdePlano, metrosEntre: metrosEntre,
  };
})();
