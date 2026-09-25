// Pasos del día: solo en la app de Android (movil/), que los lee de Health Connect y los da con window.AndroidPasos.
// Se guardan en el móvil y en la pestaña "Pasos" del Excel (Almacen.pasos), así que el histórico y los de Social
// se ven también en el navegador. Las calorías se calculan con los pasos y el peso del cuerpo.
var Pasos = (function () {
  var h = App.h;
  var CLAVE = 'gymapp.pasos';
  // Zancada media al andar (m). No se guarda la altura, así que va por sexo.
  var ZANCADA = { hombre: 0.76, mujer: 0.67 };
  // Andando se gastan unos 0,5 kcal por kilo de peso y kilómetro.
  var KCAL_KG_KM = 0.5;
  var DIAS_LEIDOS = 30;
  var SEMANA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  var leyendo = null;
  var esperando = {};
  var siguienteId = 1;

  // La app de Android contesta más tarde llamando a window.__pasosNativo(id, datos).
  window.__pasosNativo = function (id, datos) {
    var p = esperando[id];
    delete esperando[id];
    if (!p) return;
    if (datos && datos.error) p.fallo(new Error(datos.error));
    else p.bien(datos);
  };

  function llamar(metodo, args) {
    return new Promise(function (bien, fallo) {
      var id = String(siguienteId++);
      esperando[id] = { bien: bien, fallo: fallo };
      window.AndroidPasos[metodo].apply(window.AndroidPasos, [id].concat(args || []));
    });
  }

  function disponible() {
    return !!window.AndroidPasos;
  }

  // Cómo fue la última lectura en este móvil: { estado: 'ok' | 'sinPermiso' | 'sinHealthConnect', leido }.
  function lectura() {
    try {
      return JSON.parse(localStorage.getItem(CLAVE)) || null;
    } catch (e) {
      return null;
    }
  }

  function km(pasos, cuerpo) {
    return Math.round(pasos * (ZANCADA[(cuerpo || {}).sexo] || ZANCADA.hombre) / 100) / 10;
  }

  // null sin peso del cuerpo.
  function kcal(pasos, cuerpo) {
    if (!cuerpo || !(cuerpo.peso > 0)) return null;
    return Math.round(KCAL_KG_KM * cuerpo.peso * pasos * (ZANCADA[cuerpo.sexo] || ZANCADA.hombre) / 1000);
  }

  // Lee los pasos de los últimos 30 días y los guarda (y sube) con sus km y kcal.
  function leer() {
    if (!disponible()) return Promise.resolve(null);
    if (!leyendo) {
      leyendo = llamar('leer', [DIAS_LEIDOS])
        .then(function (r) {
          try { localStorage.setItem(CLAVE, JSON.stringify({ estado: r.estado, leido: Date.now() })); } catch (e) { /* sin espacio */ }
          if (r.estado !== 'ok') return r;
          var cuerpo = Almacen.cuerpo();
          Almacen.guardarPasos((r.dias || []).map(function (d) {
            return { fecha: d.fecha, pasos: d.pasos, km: km(d.pasos, cuerpo), kcal: kcal(d.pasos, cuerpo) };
          })).catch(function () { /* sin conexión: se sube más tarde */ });
          return r;
        })
        .finally(function () { leyendo = null; });
    }
    return leyendo;
  }

  function pedirPermiso() {
    return disponible() ? llamar('pedirPermiso') : Promise.resolve({ concedido: false });
  }

  // Los últimos n días hasta hoy, con 0 en los que no hay dato.
  function ultimos(lista, n, hoy) {
    var porFecha = {};
    (lista || []).forEach(function (d) { porFecha[d.fecha] = d; });
    var dias = [];
    for (var i = n - 1; i >= 0; i--) {
      var f = Calendario.sumarDias(hoy, -i);
      dias.push(porFecha[f] || { fecha: f, pasos: 0, km: 0, kcal: 0 });
    }
    return dias;
  }

  function diaSemana(iso) {
    var p = iso.split('-').map(Number);
    return SEMANA[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
  }

  // Cara del fuego de las calorías: cómo va la semana (de lunes a hoy) frente al objetivo semanal (el de pasos
  // de cada día × 7). Mira cuánto haría falta andar cada día que queda, hoy incluido, para llegar: si basta con el
  // objetivo normal, contento; cuanto más haya que apretar, más triste. El lunes empieza siempre contento.
  // Va con los pasos (las kcal son los pasos por el peso), así que sale igual aunque no haya peso puesto.
  function animoSemana(lista, hoy, objetivo) {
    var p = hoy.split('-').map(Number);
    var pasados = (new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay() + 6) % 7; // días de la semana antes de hoy
    var dias = ultimos(lista, pasados + 1, hoy);
    var hecho = dias.reduce(function (t, d) { return t + (d.pasos || 0); }, 0);
    var kcalSemana = dias.reduce(function (t, d) { return t + (d.kcal || 0); }, 0);
    var meta = objetivo * 7;
    var falta = Math.max(0, meta - hecho);
    var porDia = falta / (7 - pasados);
    var r = objetivo > 0 ? porDia / objetivo : 0;
    var animo = r <= 1 ? 'feliz' : r <= 1.25 ? 'normal' : r <= 1.6 ? 'preocupado' : 'triste';
    var texto = !falta ? '¡Objetivo de la semana hecho!'
      : animo === 'feliz' ? 'Vas bien para la semana'
        : 'Te quedan ' + Grafica.miles(Math.round(porDia / 100) * 100) + ' pasos al día';
    return { animo: animo, kcal: kcalSemana, texto: texto, ratio: r };
  }

  // Las dos tarjetas de Inicio y Social: anillo con los pasos de hoy y barras con las kcal de la semana.
  // otro: nombre de la otra persona (en Social), para los textos.
  // compacto: las dos una al lado de la otra (Inicio), en vez de una debajo de la otra.
  function tarjetas(cont, lista, hoy, objetivo, otro, compacto) {
    var deHoy = (lista || []).find(function (d) { return d.fecha === hoy; }) || { pasos: 0, km: 0, kcal: 0 };
    var semana = ultimos(lista, 7, hoy);
    var anteriores = semana.slice(0, 6).filter(function (d) { return d.pasos > 0; });
    var media = anteriores.length ? Math.round(anteriores.reduce(function (t, d) { return t + d.pasos; }, 0) / anteriores.length) : null;
    var meta = deHoy.objetivo || objetivo;
    var caja = compacto ? h('div', { class: 'inicio-dos' }) : cont;
    if (compacto) cont.appendChild(caja);

    var pasos = h('div', { class: 'tarjeta inicio-pasos' + (compacto ? ' compacta' : '') }, [
      h('h3', { texto: compacto ? 'Pasos' : 'Pasos de hoy' }),
      h('div', { class: 'anillo-caja' }, [Grafica.anillo(deHoy.pasos, meta)]),
      h('p', { class: 'inicio-resumen', texto: App.formato(deHoy.km || 0) + ' km' + (compacto ? '' : ' · ' + (deHoy.kcal != null ? deHoy.kcal : '—') + ' kcal') }),
      media != null && !compacto ? h('p', { class: 'detalle centrado', texto: 'Media de los días anteriores: ' + Grafica.miles(media) + ' pasos' }) : null,
    ]);
    caja.appendChild(pasos);

    var grafica = h('div');
    var total = semana.reduce(function (t, d) { return t + (d.kcal || 0); }, 0);
    var animo = compacto ? animoSemana(lista, hoy, objetivo) : null;
    caja.appendChild(h('div', { class: 'tarjeta inicio-kcal' + (compacto ? ' compacta' : '') }, compacto ? [
      h('h3', { texto: 'Calorías' }),
      h('div', { class: 'fuego-caja' }, [Grafica.fuego(animo.animo)]),
      h('p', { class: 'kcal-hoy', texto: (deHoy.kcal != null ? deHoy.kcal : 0) + ' kcal' }),
      h('p', { class: 'detalle centrado', texto: 'Semana: ' + Grafica.miles(animo.kcal) + ' kcal' }),
      h('p', { class: 'kcal-animo', texto: animo.texto }),
    ] : [
      h('div', { class: 'ejercicio-cabecera' }, [
        h('h3', { texto: 'Calorías andando' }),
        h('span', { class: 'tipo', texto: (deHoy.kcal != null ? deHoy.kcal : 0) + ' kcal hoy' }),
      ]),
      grafica,
      h('p', { class: 'detalle', texto: 'Esta semana: ' + Grafica.miles(total) + ' kcal' + (otro ? '' : ' · calculadas con los pasos y tu peso') }),
    ]));
    // En Inicio la tarjeta es solo el fuego y el número; las barras de la semana se quedan para Social.
    if (!compacto) {
      Grafica.barras(grafica, semana.map(function (d) {
        return { etiqueta: diaSemana(d.fecha), v: d.kcal || 0, titulo: Grafica.fechaCorta(d.fecha) + ': ' + (d.kcal || 0) + ' kcal' };
      }), { clase: 'kcal', valores: true });
    }
    return pasos;
  }

  return {
    disponible: disponible, lectura: lectura, leer: leer, pedirPermiso: pedirPermiso, km: km, kcal: kcal,
    ultimos: ultimos, diaSemana: diaSemana, tarjetas: tarjetas, animoSemana: animoSemana,
  };
})();

// Pestaña "Inicio": qué toca hoy y el botón para empezar, los pasos y calorías del día y el estado de fuerza.
(function () {
  var h = App.h;

  function enInicio() {
    return !!document.querySelector('.pestanas .activa[data-vista="inicio"]');
  }

  // ---- Qué toca hoy ----

  function tarjetaHoy(cont) {
    var plan = Almacen.plan();
    var hoy = Almacen.hoyISO();
    var toca = Calendario.siguiente(Almacen.ultimaSesion(), hoy, plan ? Almacen.pendienteAyer() : false);
    var lista = ((plan || {}).entrenos || {})[toca.entreno] || [];
    var hechos = {};
    Almacen.series().forEach(function (s) { if (s.fecha === hoy && s.entreno === toca.entreno) hechos[s.ejercicioId] = true; });
    var cuantos = lista.filter(function (ej) { return hechos[ej.id]; }).length;

    // Solo el título y el botón (lo pidió él): ni la línea de detalle ni la lista de ejercicios, que ya están en
    // Entreno. Lo único que se guarda es por cuántos ejercicios vas, que va dentro del propio título.
    var titulo, boton, pedirCara = false;
    var fin = Almacen.terminado(hoy, toca.entreno);
    if (fin || (toca.enCurso && lista.length && cuantos >= lista.length)) {
      titulo = '✅ ' + toca.entreno + ' finalizado';
      boton = 'Ver entreno';
      pedirCara = fin && !fin.cara; // terminado pero se cerró la app antes de elegir cara
    } else if (toca.enCurso) {
      titulo = '🏋️ ' + toca.entreno + ' en marcha' + (lista.length ? ' · ' + cuantos + ' de ' + lista.length : '');
      boton = 'Seguir entreno';
    } else if (toca.recuperar) {
      titulo = '😴 Hoy es descanso';
      boton = 'Recuperar ' + toca.entreno;
    } else if (toca.descanso) {
      titulo = '😴 Hoy toca descanso';
      boton = null;
    } else {
      titulo = 'Hoy toca ' + toca.entreno;
      boton = 'Empezar entreno';
    }

    cont.appendChild(h('div', { class: 'tarjeta inicio-hoy' }, [
      h('h2', { texto: titulo }),
      pedirCara ? h('p', { class: 'detalle', texto: '¿Cómo has terminado?' }) : null,
      pedirCara ? App.caras(hoy, toca.entreno, function () { App.mostrar('inicio'); }) : null,
      boton
        ? h('button', { type: 'button', class: 'principal grande', texto: boton, onclick: App.abrirEntreno })
        : h('button', { type: 'button', class: 'discreto', texto: 'Entrenar igualmente', onclick: App.abrirEntreno }),
    ]));
  }

  // ---- Pasos y calorías ----

  function aviso(cont, texto, boton) {
    cont.appendChild(h('div', { class: 'tarjeta inicio-pasos' }, [h('h3', { texto: 'Pasos de hoy' }), h('p', { class: 'detalle', texto: texto }), boton]));
  }

  function tarjetasPasos(cont) {
    var hoy = Almacen.hoyISO();
    var lista = Almacen.pasos();
    if (Pasos.disponible()) {
      var l = Pasos.lectura();
      // Relee al pintar si lo leído tiene más de un minuto (al volver a la app, por ejemplo).
      if (!l || Date.now() - l.leido > 60000) {
        Pasos.leer().then(function () { if (enInicio()) App.mostrar('inicio'); }).catch(function (e) {
          App.avisar('No se pudieron leer los pasos: ' + ((e && e.message) || e), true);
        });
      }
      if (!l) return aviso(cont, 'Leyendo…');
      if (l.estado === 'sinHealthConnect') return aviso(cont, 'Hace falta la app Health Connect de Google (en Android 14 o más ya viene).');
      if (l.estado === 'sinPermiso') {
        return aviso(cont, 'Dale permiso para leer los pasos.', h('button', { type: 'button', class: 'principal', texto: 'Dar permiso', onclick: function () {
          Pasos.pedirPermiso().then(function () { return Pasos.leer(); }).then(function () { App.mostrar('inicio'); })
            .catch(function (e) { App.avisar((e && e.message) || String(e), true); });
        } }));
      }
    } else if (!lista.some(function (d) { return d.fecha >= Calendario.sumarDias(hoy, -6); })) {
      return aviso(cont, 'Los pasos se leen en la app de Android.');
    }
    var tarjeta = Pasos.tarjetas(cont, lista, hoy, Almacen.objetivoPasos(), null, true);
    if (!Almacen.cuerpo() || !(Almacen.cuerpo().peso > 0)) {
      tarjeta.appendChild(h('button', { type: 'button', class: 'discreto', texto: 'Pon tu peso para ver las calorías', onclick: function () { App.mostrar('ajustes'); } }));
    }
  }

  // ---- Estado de fuerza ----

  function tarjetaEstado(cont) {
    if (!Almacen.cuerpo()) {
      cont.appendChild(h('div', { class: 'tarjeta' }, [
        h('h3', { texto: 'Estado actual' }),
        h('p', { class: 'detalle', texto: 'Pon tu sexo, fecha de nacimiento y peso para ver tu nivel de fuerza.' }),
        h('button', { type: 'button', class: 'discreto', texto: '✏️ Tus datos', onclick: function () { App.mostrar('ajustes'); } }),
      ]));
      return;
    }
    var r = Estado.actual();
    if (!r) {
      cont.appendChild(h('div', { class: 'tarjeta' }, [
        h('h3', { texto: 'Estado actual' }),
        h('p', { class: 'detalle', texto: Almacen.historial() ? 'Sin series de los ejercicios que cuentan en los últimos 6 meses.' : 'Cargando historial…' }),
      ]));
      return;
    }
    var fotos = Almacen.estados();
    var tarjeta = Estado.resumen(cont, r, null, fotos.length ? fotos[fotos.length - 1] : null, false, true);
    tarjeta.appendChild(h('button', { type: 'button', class: 'discreto', texto: 'Ver estado completo', onclick: function () { App.mostrar('estado'); } }));
  }

  App.vistas.inicio = function (cont) {
    if (!Almacen.config()) {
      cont.appendChild(h('div', { class: 'tarjeta' }, [
        h('p', { texto: 'Primero configura la app.' }),
        h('button', { class: 'principal', texto: 'Ir a Ajustes', onclick: function () { App.mostrar('ajustes'); } }),
      ]));
      return;
    }
    tarjetasPasos(cont);
    tarjetaHoy(cont);
    tarjetaEstado(cont);
  };

  // Al volver a la app, los pasos han cambiado.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && enInicio() && Pasos.disponible()) {
      Pasos.leer().then(function () { if (enInicio()) App.mostrar('inicio'); }).catch(function () {});
    }
  });
})();
