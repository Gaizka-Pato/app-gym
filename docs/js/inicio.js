// Pasos del día: solo en la app de Android (movil/), que los cuenta ella sola con el sensor del móvil (sin Health
// Connect ni otras apps) y los da con window.AndroidPasos.
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

  // Cómo fue la última lectura en este móvil: { estado: 'ok' | 'sinPermiso' | 'sinSensor' | 'sinHealthConnect', leido }.
  // sinHealthConnect lo da el APK viejo, que solo leía Health Connect.
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

  // ---- Calorías del entreno (él, 2026-10-06): solo con estándares, sin pulsómetro ni crono ----
  // Cada serie: 3 s por repetición (o su tiempo, en las de tiempo) al MET del ejercicio, y después el descanso que
  // marca el plan para ese ejercicio (90 s si no se sabe) a MET 3: recuperarse de la serie también gasta.
  // kcal = MET × peso × horas. Es una estimación (±30 %), como las de andar.
  var SEG_POR_REP = 3;
  var MET_DESCANSO = 3;
  var GRANDES = /sentadilla|peso muerto|prensa|hip thrust|zancada|b[uú]lgara|squat/i;

  // MET del esfuerzo: pierna y compuestos grandes 6, principales y con barra 5, el resto (aislamiento) 3,5.
  function metDe(s) {
    var nombre = String(s.ejercicio || '');
    if (Grupos.porTiempo(nombre)) return Grupos.esCardio(nombre) ? 7 : 3.5;
    if (GRANDES.test(nombre)) return 6;
    if (s.tipo === 'principal' || Grupos.materialDe(nombre) === 'barra') return 5;
    return 3.5;
  }

  // El descanso que pedía el plan para esa serie (su entreno, columna y ejercicio), en segundos.
  function descansoDe(s, plan) {
    var ej = ((plan && plan.entrenos && plan.entrenos[s.entreno]) || []).filter(function (e) { return e.id === s.ejercicioId; })[0];
    var col = ej && ej.columnas[(s.columna || 1) - 1];
    var d = col && Number(col.descanso);
    return d > 0 ? Math.min(d, 300) : 90;
  }

  // { 'aaaa-mm-dd': kcal } de todos los días con series. null sin peso del cuerpo.
  var calculado = { series: null, plan: null, peso: null, valor: null };
  function kcalEntrenoPorDia() {
    var cuerpo = Almacen.cuerpo();
    if (!cuerpo || !(cuerpo.peso > 0)) return null;
    var series = Almacen.series();
    var plan = Almacen.plan();
    if (calculado.series === series && calculado.plan === plan && calculado.peso === cuerpo.peso) return calculado.valor;
    var dias = {};
    series.forEach(function (s) {
      if (!s.fecha) return;
      var esfuerzo = Number(s.seg) > 0 ? Number(s.seg) : (Number(s.reps) || 0) * SEG_POR_REP;
      if (!(esfuerzo > 0)) return;
      var horas = esfuerzo / 3600;
      var descanso = Grupos.porTiempo(s.ejercicio) && Grupos.esCardio(s.ejercicio) ? 0 : descansoDe(s, plan) / 3600;
      dias[s.fecha] = (dias[s.fecha] || 0) + cuerpo.peso * (metDe(s) * horas + MET_DESCANSO * descanso);
    });
    Object.keys(dias).forEach(function (f) { dias[f] = Math.round(dias[f]); });
    calculado = { series: series, plan: plan, peso: cuerpo.peso, valor: dias };
    return dias;
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
          pasarCopia(cuerpo);
          // Con las del entreno y las de reposo de cada día, para que en Social se vea en reposo + andando + entrenando.
          var entreno = kcalEntrenoPorDia() || {};
          var reposo = kcalReposoPorDia((r.dias || []).map(function (d) { return d.fecha; }));
          Almacen.guardarPasos((r.dias || []).map(function (d) {
            return { fecha: d.fecha, pasos: d.pasos, km: km(d.pasos, cuerpo), kcal: kcal(d.pasos, cuerpo), kcalEntreno: entreno[d.fecha] || 0,
              kcalReposo: reposo[d.fecha] != null ? reposo[d.fecha] : null };
          })).catch(function () { /* sin conexión: se sube más tarde */ });
          return r;
        })
        .finally(function () { leyendo = null; });
    }
    return leyendo;
  }

  // La app de Android sube sola los pasos al Excel cada noche a las 23:55, aunque esté cerrada: para eso necesita
  // la dirección de la API, la clave y los datos con los que salen los km y las kcal (los mismos de aquí).
  function pasarCopia(cuerpo) {
    var c = Almacen.config();
    if (!c || !c.url || typeof window.AndroidPasos.guardarCopia !== 'function') return;
    try {
      window.AndroidPasos.guardarCopia(JSON.stringify({ url: c.url, clave: c.clave, persona: c.persona,
        sexo: (cuerpo || {}).sexo || '', peso: (cuerpo || {}).peso || 0, objetivo: Almacen.objetivoPasos() }));
    } catch (e) { /* APK viejo */ }
  }

  function pedirPermiso() {
    return disponible() ? llamar('pedirPermiso') : Promise.resolve({ concedido: false });
  }

  // ---- Notificación fija con los pasos de hoy (Ajustes → "Pasos en notificación", solo la app de Android nueva) ----
  // La pone el móvil con su contador: son los mismos pasos que salen aquí, en las calorías y en el historial.
  function hayNotificacion() {
    return disponible() && typeof window.AndroidPasos.notificacion === 'function';
  }

  function notificacionActiva() {
    try {
      return hayNotificacion() && !!window.AndroidPasos.notificacionActiva();
    } catch (e) {
      return false;
    }
  }

  // Descargar e instalar la versión nueva de la app de Android (App.comprobarApk). Contesta con { estado } o falla.
  function actualizarApp(url) {
    return llamar('actualizar', [url]);
  }

  function ponerNotificacion(si) {
    if (!hayNotificacion()) return Promise.resolve({ activa: false });
    return llamar('notificacion', [!!si]);
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
    var kmSemana = dias.reduce(function (t, d) { return t + (d.km || 0); }, 0);
    return { animo: animo, kcal: kcalSemana, texto: texto, ratio: r, pasos: hecho, km: Math.round(kmSemana * 100) / 100, meta: meta };
  }

  // ---- Consumidas y quemadas (él, 2026-11-06: "en Inicio las calorías tienen que ser dos gráficas de barras") ----
  // Consumidas: lo apuntado en Comida. Quemadas: con la altura en Tus datos, todo el gasto (Comida.gasto: el cuerpo en
  // reposo, la vida diaria, andar, el entreno y la digestión), y hoy solo lo que va de día; sin altura, andar + entreno.
  function horasEntrenoDe(fecha) {
    var horas = Almacen.series().filter(function (s) { return s.fecha === fecha && s.hora; }).map(function (s) {
      var p = String(s.hora).split(':').map(Number);
      return p[0] + (p[1] || 0) / 60;
    });
    return horas.length > 1 ? Math.max.apply(null, horas) - Math.min.apply(null, horas) : 0;
  }

  function kcalDelDia(fecha, hoy, lista, entrenoPorDia) {
    var comidas = typeof Comida === 'undefined' ? 0 : Comida.sumar(Almacen.tablaComida('comidas').filter(function (a) { return a.fecha === fecha; })).kcal;
    var pasosDia = (lista || []).filter(function (d) { return d.fecha === fecha; })[0] || {};
    var andar = pasosDia.kcal || 0;
    var entreno = (entrenoPorDia || {})[fecha] || 0;
    var cuerpo = Almacen.cuerpo();
    var ahora = new Date();
    var g = typeof Comida === 'undefined' || fecha > hoy ? null : Comida.gasto(cuerpo, fecha, {
      andar: andar, entreno: entreno, horasEntreno: horasEntrenoDe(fecha), comido: comidas,
      parteDelDia: fecha === hoy ? (ahora.getHours() * 60 + ahora.getMinutes()) / 1440 : null,
    });
    // Las quemadas en tres: andando, entrenando (tal cual, como en Historial) y en reposo, que es el resto del gasto
    // (el cuerpo sin moverse, la vida diaria y la digestión, menos lo del reposo que ya va dentro del entreno).
    // Sin altura en Tus datos no hay reposo: solo andando + entrenando.
    var total = g ? g.total : andar + entreno;
    return { fecha: fecha, comidas: Math.round(comidas), quemadas: Math.round(total),
      andando: Math.round(andar), entrenando: Math.round(entreno), reposo: Math.max(0, Math.round(total - andar - entreno)),
      completo: !!g };
  }

  // { 'aaaa-mm-dd': kcal en reposo } de esos días (hoy, lo que va de día). Vacío sin altura en Tus datos.
  function kcalReposoPorDia(fechas) {
    var hoy = Almacen.hoyISO();
    var lista = Almacen.pasos();
    var entreno = kcalEntrenoPorDia() || {};
    var r = {};
    fechas.forEach(function (f) {
      if (f > hoy) return;
      var d = kcalDelDia(f, hoy, lista, entreno);
      if (d.completo) r[f] = d.reposo;
    });
    return r;
  }

  // Lo que se gasta en un día normal, para el objetivo de Comida (fijo cada día; el balance es lo real). Si hay pesos
  // y comidas de 2-3 semanas, lo que dice el peso (Comida.gastoReal); si no, la media del gasto estimado de los 14 días
  // antes de hoy (los que tienen pasos, si hay al menos 3). null sin altura o sin peso.
  function gastoMedio(hoy) {
    var cuerpo = Almacen.cuerpo();
    if (typeof Comida === 'undefined' || !cuerpo || !(cuerpo.peso > 0)) return null;
    var comidas = Almacen.tablaComida('comidas');
    var porDia = {};
    comidas.forEach(function (a) { if (a.fecha < hoy) porDia[a.fecha] = (porDia[a.fecha] || 0) + (Number(a.kcal) || 0); });
    var real = Comida.gastoReal(Almacen.tablaComida('pesos'), Object.keys(porDia).map(function (f) { return { fecha: f, kcal: porDia[f] }; }));
    if (real && real.kcal > 0) return { kcal: real.kcal, deLosPesos: true };
    var lista = Almacen.pasos();
    var entreno = kcalEntrenoPorDia() || {};
    var dias = ultimos(lista, 15, hoy).slice(0, 14);
    var conPasos = dias.filter(function (d) { return d.pasos > 0; });
    if (conPasos.length >= 3) dias = conPasos;
    var gastos = dias.map(function (d) {
      return Comida.gasto(cuerpo, d.fecha, { andar: d.kcal || 0, entreno: entreno[d.fecha] || 0, horasEntreno: horasEntrenoDe(d.fecha), comido: porDia[d.fecha] || 0 });
    }).filter(Boolean);
    if (!gastos.length) return null;
    return { kcal: Math.round(gastos.reduce(function (t, g) { return t + g.total; }, 0) / gastos.length), deLosPesos: false };
  }

  // Barras en pareja: por cada día, consumidas (verde) y quemadas (naranja), con el valor encima si caben.
  // Las dos tarjetas de Inicio y Social: anillo con los pasos de hoy y barras con las kcal de la semana.
  // otro: nombre de la otra persona (en Social), para los textos.
  // compacto: las dos una al lado de la otra (Inicio), en vez de una debajo de la otra.
  // En Inicio, tocar Pasos o Calorías cambia las dos entre hoy y la semana (de lunes a hoy). Solo para mirar.
  var verSemana = false;
  var recienCambiado = false;   // para animar el número solo al tocar, no cada vez que se abre Inicio

  function tarjetas(cont, lista, hoy, objetivo, otro, compacto) {
    var deHoy = (lista || []).find(function (d) { return d.fecha === hoy; }) || { pasos: 0, km: 0, kcal: 0 };
    var semana = ultimos(lista, 7, hoy);
    var anteriores = semana.slice(0, 6).filter(function (d) { return d.pasos > 0; });
    var media = anteriores.length ? Math.round(anteriores.reduce(function (t, d) { return t + d.pasos; }, 0) / anteriores.length) : null;
    var meta = deHoy.objetivo || objetivo;
    var caja = compacto ? h('div', { class: 'inicio-dos' }) : cont;
    if (compacto) cont.appendChild(caja);

    var animo = compacto ? animoSemana(lista, hoy, objetivo) : null;
    var semanal = compacto && verSemana;
    var cambiar = function () {
      verSemana = !verSemana;
      recienCambiado = true;
      App.mostrar('inicio');
    };
    var animar = recienCambiado ? ' cambiado' : '';
    recienCambiado = false;
    var tocable = compacto ? { role: 'button', tabindex: '0', 'aria-label': semanal ? 'Ver hoy' : 'Ver la semana', onclick: cambiar,
      onkeydown: function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); cambiar(); } } } : {};
    var cuando = compacto ? h('span', { class: 'cuando', texto: semanal ? 'Semana' : 'Hoy' }) : null;

    var pasos = h('div', Object.assign({ class: 'tarjeta inicio-pasos' + (compacto ? ' compacta tocable' : '') + (semanal ? ' semanal' : '') + animar }, tocable), [
      h('h3', { class: 'con-icono' }, [Iconos.pasos(), compacto ? 'Pasos' : 'Pasos de hoy']),
      cuando,
      h('div', { class: 'anillo-caja' }, [semanal ? Grafica.anillo(animo.pasos, animo.meta) : Grafica.anillo(deHoy.pasos, meta)]),
      h('p', { class: 'inicio-resumen', texto: App.formato(semanal ? animo.km : deHoy.km || 0) + ' km' +
        (compacto ? '' : ' · ' + (deHoy.kcal != null ? deHoy.kcal : '—') + ' kcal') }),
      media != null && !compacto ? h('p', { class: 'detalle centrado', texto: 'Media de los días anteriores: ' + Grafica.miles(media) + ' pasos' }) : null,
    ]);
    caja.appendChild(pasos);

    var grafica = h('div');
    // Social: cada barra, andando (abajo) + entrenando (encima), como en Historial → Calorías. Las tuyas del entreno
    // salen de tus series; las del otro, de las que subió su móvil con los pasos.
    var entrenoMio = !compacto && !otro ? (kcalEntrenoPorDia() || {}) : null;
    var entrenoDe = function (d) { return Math.round(entrenoMio ? (entrenoMio[d.fecha] || 0) : (d.kcalEntreno || 0)); };
    // En reposo (otro color, debajo): las tuyas se calculan aquí; las del otro, las que subió su móvil con los pasos.
    var reposoMio = !compacto && !otro ? kcalReposoPorDia(semana.map(function (d) { return d.fecha; })) : null;
    var reposoDe = function (d) { return Math.round(reposoMio ? (reposoMio[d.fecha] || 0) : (d.kcalReposo || 0)); };
    var andadoHoy = deHoy.kcal || 0, entrenoHoy = entrenoDe(Object.assign({ fecha: hoy }, deHoy));
    var reposoHoy = reposoDe(Object.assign({ fecha: hoy }, deHoy));
    var andadoSemana = semana.reduce(function (t, d) { return t + (d.kcal || 0); }, 0);
    var entrenoSemana = semana.reduce(function (t, d) { return t + entrenoDe(d); }, 0);
    var reposoSemana = semana.reduce(function (t, d) { return t + reposoDe(d); }, 0);
    var total = andadoSemana + entrenoSemana + reposoSemana;
    caja.appendChild(h('div', Object.assign({ class: 'tarjeta inicio-kcal' + (compacto ? ' compacta tocable' : '') + (semanal ? ' semanal' : '') + animar }, compacto ? tocable : {}), compacto
      ? tarjetaKcal(semanal, hoy, lista) : [
      h('div', { class: 'ejercicio-cabecera' }, [
        h('h3', { texto: 'Calorías quemadas' }),
        h('span', { class: 'tipo', texto: Grafica.miles(andadoHoy + entrenoHoy + reposoHoy) + ' kcal hoy' }),
      ]),
      grafica,
      h('p', { class: 'leyenda' }, [
        reposoSemana ? h('span', { class: 'muestra-punto kcal-reposo' }) : null, reposoSemana ? 'En reposo ' + Grafica.miles(reposoSemana) : null,
        h('span', { class: 'muestra-punto kcal-andando' }), 'Andando ' + Grafica.miles(andadoSemana),
        h('span', { class: 'muestra-punto kcal-entreno' }), 'Entrenando ' + Grafica.miles(entrenoSemana),
      ]),
      h('p', { class: 'detalle', texto: 'Esta semana: ' + Grafica.miles(total) + ' kcal' }),
    ]));
    // En Inicio la tarjeta es otra (tarjetaKcal); las barras de la semana son de Social.
    if (!compacto) {
      Grafica.barras(grafica, semana.map(function (d) {
        var andando = d.kcal || 0, entrenando = entrenoDe(d), reposo = reposoDe(d);
        return { etiqueta: diaSemana(d.fecha), v: reposo + andando + entrenando, partes: [reposo, andando, entrenando],
          titulo: Grafica.fechaCorta(d.fecha) + ': ' + Grafica.miles(reposo + andando + entrenando) + ' kcal' +
            Grafica.textoPartes(reposo, andando, entrenando) };
      }), { clase: 'kcal', valores: true });
    }
    return pasos;
  }

  // Inicio: lo quemado moviéndote (andar + gym) de hoy o de la semana (de lunes a hoy) en un anillo con su objetivo, y
  // lo comido debajo.
  function tarjetaKcal(semanal, hoy, lista) {
    var entreno = kcalEntrenoPorDia() || {};
    var p = hoy.split('-').map(Number);
    var lunes = Calendario.sumarDias(hoy, -((new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay() + 6) % 7));
    var dias = semanal
      ? [0, 1, 2, 3, 4, 5, 6].map(function (i) { var f = Calendario.sumarDias(lunes, i); return Object.assign(kcalDelDia(f, hoy, lista, entreno), { etiqueta: diaSemana(f).charAt(0) }); })
      : [Object.assign(kcalDelDia(hoy, hoy, lista, entreno), { etiqueta: '' })];
    var suma = function (k) { return dias.filter(function (d) { return d.fecha <= hoy; }).reduce(function (t, d) { return t + d[k]; }, 0); };
    var comidas = suma('comidas');
    // Un anillo como el de los pasos (él, 2026-11-08): lo quemado moviéndote (andar + gym, sin el reposo: "no las
    // pondría") frente a un objetivo, que es lo que se quema andando el objetivo de pasos (×7 en la semana).
    var andando = suma('andando'), gym = suma('entrenando');
    var objetivoDia = kcal(Almacen.objetivoPasos(), Almacen.cuerpo());
    var objetivo = objetivoDia ? objetivoDia * (semanal ? 7 : 1) : null;
    return [
      h('h3', { texto: 'Calorías' }),
      h('span', { class: 'cuando', texto: semanal ? 'Semana' : 'Hoy' }),
      h('div', { class: 'anillo-caja' }, [Grafica.anilloKcal([andando, gym], objetivo)]),
      // Lo comido, en la línea de debajo como los km de los pasos.
      h('p', { class: 'inicio-resumen', texto: '🍽 ' + Grafica.miles(comidas) + ' comidas' }),
      // De qué color es cada trozo de lo quemado, con su cifra.
      h('p', { class: 'kcal-partes' }, [
        h('span', { class: 'muestra-punto kcal-andando' }), 'Andar ' + Grafica.miles(andando) + ' ',
        h('span', { class: 'muestra-punto kcal-entreno' }), 'Gym ' + Grafica.miles(gym),
      ]),
    ];
  }

  return {
    disponible: disponible, lectura: lectura, leer: leer, pedirPermiso: pedirPermiso,
    hayNotificacion: hayNotificacion, notificacionActiva: notificacionActiva, ponerNotificacion: ponerNotificacion, actualizarApp: actualizarApp, km: km, kcal: kcal, kcalEntrenoPorDia: kcalEntrenoPorDia, kcalReposoPorDia: kcalReposoPorDia,
    ultimos: ultimos, diaSemana: diaSemana, tarjetas: tarjetas, animoSemana: animoSemana, gastoMedio: gastoMedio,
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
    var titulo, boton, pedirCara = false, mancuerna = false, acabado = false;
    var fin = Almacen.terminado(hoy, toca.entreno);
    if (fin || (toca.enCurso && lista.length && cuantos >= lista.length)) {
      acabado = true;
      titulo = toca.entreno + ' finalizado';
      boton = 'Ver entreno';
      pedirCara = fin && !fin.cara; // terminado pero se cerró la app antes de elegir cara
    } else if (toca.enCurso) {
      mancuerna = true;
      titulo = toca.entreno + ' en marcha' + (lista.length ? ' · ' + cuantos + ' de ' + lista.length : '');
      boton = 'Seguir entreno';
    } else if (toca.recuperar) {
      titulo = '😴 Hoy es descanso';
      boton = 'Recuperar ' + toca.entreno;
    } else if (toca.descanso) {
      titulo = '😴 Hoy toca descanso';
      boton = null;
    } else {
      mancuerna = true;
      titulo = 'Hoy toca ' + toca.entreno;
      boton = 'Empezar entreno';
    }

    cont.appendChild(h('div', { class: 'tarjeta inicio-hoy' }, [
      // Arriba a la derecha, el botón que abre el calendario (él, 2026-10-05).
      h('div', { class: 'inicio-hoy-cabecera' }, [
        h('h2', { class: 'con-icono' }, [mancuerna ? Iconos.entreno() : acabado ? Iconos.fin() : null, titulo]),
        Mes.boton(),
      ]),
      pedirCara ? h('p', { class: 'detalle', texto: '¿Cómo has terminado?' }) : null,
      pedirCara ? App.caras(hoy, toca.entreno, function () { App.mostrar('inicio'); }) : null,
      boton
        ? h('button', { type: 'button', class: 'principal grande con-icono', onclick: App.abrirEntreno },
          [toca.recuperar ? Iconos.recuperar() : null, boton])
        : h('button', { type: 'button', class: 'discreto', texto: 'Entrenar igualmente', onclick: App.abrirEntreno }),
    ]));
  }

  // ---- Pasos y calorías ----

  function aviso(cont, texto, boton) {
    cont.appendChild(h('div', { class: 'tarjeta inicio-pasos' }, [h('h3', { class: 'con-icono' }, [Iconos.pasos(), 'Pasos de hoy']), h('p', { class: 'detalle', texto: texto }), boton]));
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
      if (l.estado === 'sinSensor') return aviso(cont, 'Este móvil no cuenta pasos.');
      if (l.estado === 'sinHealthConnect') return aviso(cont, 'Instala la versión nueva de la app para contar los pasos.');
      if (l.estado === 'sinPermiso') {
        return aviso(cont, 'Dale permiso para contar los pasos.', h('button', { type: 'button', class: 'principal', texto: 'Dar permiso', onclick: function () {
          Pasos.pedirPermiso().then(function () { return Pasos.leer(); }).then(function () { App.mostrar('inicio'); })
            .catch(function (e) { App.avisar((e && e.message) || String(e), true); });
        } }));
      }
    }
    // En el navegador no se leen los pasos: salen los que subió el móvil (o cero), pero las dos tarjetas siempre.
    var tarjeta = Pasos.tarjetas(cont, lista, hoy, Almacen.objetivoPasos(), null, true);
    if (!Almacen.cuerpo() || !(Almacen.cuerpo().peso > 0)) {
      tarjeta.appendChild(h('button', { type: 'button', class: 'discreto', texto: 'Pon tu peso para ver las calorías', onclick: function () { App.mostrar('ajustes'); } }));
    }
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
    // Orden (él, 2026-11-08): pasos y calorías, el entreno de hoy (con su botón Calendario), el equilibrio entre
    // salud y fuerza, peso y salud con sus arcos y, al final, el estado de fuerza ("Ver más" lo abre entero en
    // Historial). Con todo esto Inicio ya no cabe sin desplazarse.
    tarjetaHoy(cont);
    lineaCompra(cont);
    var pesaje = ultimoPesaje();
    var salud = pesaje ? Comida.puntuacionSalud(pesaje, Almacen.cuerpo()) : null;
    tarjetaEquilibrio(cont, salud);
    tarjetaCuerpo(cont, pesaje, salud);
    tarjetaEstado(cont);
    encajar(cont);
  };

  // "🛒 N por comprar" (él, 2026-11-08): solo si falta algo; lleva a Comida → Casa (lo mismo que la pegatina, #compra).
  function lineaCompra(cont) {
    var n = Comida.lista(Comida.estadoDespensa(Almacen.filasComida('despensa'))).length;
    if (!n) return;
    cont.appendChild(h('button', { type: 'button', class: 'tarjeta inicio-compra', onclick: function () { location.hash = '#compra'; } }, [
      h('span', { texto: '🛒 ' + n + ' por comprar' }),
      h('span', { class: 'inicio-compra-ir', texto: 'Ver lista ›' }),
    ]));
  }

  // Inicio entero en la pantalla de cualquier móvil (él, 2026-11-08: en el suyo se cortaba "Te faltan N puntos…"):
  // todo va dentro de una caja y, si no cabe entre la cabecera y la barra de abajo, se reduce lo justo (zoom).
  function encajar(cont) {
    var caja = h('div', { class: 'inicio-encaje' });
    while (cont.firstChild) caja.appendChild(cont.firstChild);
    cont.appendChild(caja);
    var ajustar = function () {
      if (!caja.isConnected || !document.body.classList.contains('vista-inicio')) return;
      caja.style.zoom = '';
      var arriba = caja.getBoundingClientRect().top;
      var barra = document.querySelector('nav.pestanas');
      var abajo = barra && barra.offsetHeight ? barra.getBoundingClientRect().top : window.innerHeight;
      var cabe = abajo - arriba - 8;
      var alto = caja.scrollHeight;
      if (alto > cabe && cabe > 200) caja.style.zoom = String(Math.max(0.7, cabe / alto));
    };
    requestAnimationFrame(ajustar);
    setTimeout(ajustar, 300);   // por si las fuentes o las imágenes cambian la altura al cargar
    ajustarInicio = ajustar;
  }
  var ajustarInicio = null;
  window.addEventListener('resize', function () { if (ajustarInicio) ajustarInicio(); });

  function tarjetaEstado(cont) {
    var r = Almacen.cuerpo() ? Estado.actual() : null;
    if (!r) {
      cont.appendChild(h('button', { type: 'button', class: 'tarjeta inicio-estado-vacio', onclick: App.abrirEstado }, [
        h('h2', { texto: 'Estado de fuerza' }),
        h('span', { class: 'detalle', texto: !Almacen.cuerpo() ? 'Pon tus datos en Ajustes para ver tu nivel.' : 'Sin series que cuenten aún.' }),
      ]));
      return;
    }
    var fotos = Almacen.estados();
    var tarjeta = Estado.resumen(cont, r, null, fotos.length ? fotos[fotos.length - 1] : null, false, true);
    tarjeta.classList.add('inicio-estado');
    var masInfo = tarjeta.querySelector('.ejercicio-cabecera button');
    if (masInfo) masInfo.replaceWith(h('button', { type: 'button', class: 'discreto', texto: 'Ver más ›', onclick: App.abrirEstado }));
    // En Inicio se llama "Estado de fuerza" (él, 2026-11-08), no "Estado actual".
    var titulo = tarjeta.querySelector('.ejercicio-cabecera h2');
    if (titulo) titulo.textContent = 'Estado de fuerza';
  }

  // ---- Peso, salud y equilibrio (él, 2026-11-08, como las tarjetas de Zepp Life) ----
  var TONOS = { azul: 'var(--debil)', celeste: 'var(--pasos)', verde: 'var(--ok)', naranja: 'var(--rm)', rojo: 'var(--error)' };

  // El último pesaje con su grasa, agua y músculo (lo guardado o, con la impedancia, calculado).
  function ultimoPesaje() {
    var pesos = Almacen.tablaComida('pesos').filter(function (p) { return p.fecha && p.kg > 0; })
      .sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
    var p = pesos[pesos.length - 1];
    if (!p) return null;
    var c = typeof App.composicionDe === 'function' ? App.composicionDe(p) || {} : {};
    return { fecha: p.fecha, kg: Number(p.kg), grasa: c.grasa, agua: c.agua, musculo: c.musculo };
  }

  // Dónde cae un valor en una barra de tramos iguales (0-1), igual que la barra de Historial → Salud.
  function fraccionRango(r, v) {
    var cortes = r.cortes, tramos = cortes.length + 1, i = Comida.tramoSalud(r, v);
    var paso = (cortes[cortes.length - 1] - cortes[0]) / Math.max(1, cortes.length - 1);
    var lo = i === 0 ? cortes[0] - paso : cortes[i - 1];
    var hi = i === tramos - 1 ? cortes[i - 1] + paso : cortes[i];
    return (i + Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1)))) / tramos;
  }

  function fechaCorta(iso) {
    var p = iso.split('-');
    return Number(p[2]) + ' ' + ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(p[1]) - 1];
  }

  // Una mitad de la tarjeta: título, fecha, el arco con el número dentro y el nombre del tramo en su color.
  function indicador(titulo, fecha, arcoOpciones, numero, unidad, nombre, color) {
    return h('div', { class: 'indicador' }, [
      h('h3', { texto: titulo }),
      h('p', { class: 'indicador-fecha', texto: fecha || ' ' }),
      h('div', { class: 'indicador-arco' }, [
        Grafica.arco(arcoOpciones),
        h('div', { class: 'indicador-numero' }, [
          h('strong', { texto: numero }),
          unidad ? h('small', { texto: unidad }) : null,
        ]),
      ]),
      h('p', { class: 'indicador-nombre', style: color ? 'color:' + color : '', texto: nombre }),
    ]);
  }

  // Peso (el último pesaje y su tramo por el IMC) y Salud (Comida.puntuacionSalud), lado a lado. Tocarla abre
  // Historial → Salud.
  function tarjetaCuerpo(cont, pesaje, salud) {
    var cuerpo = Almacen.cuerpo() || {};
    var izq, der;
    if (!pesaje) {
      izq = indicador('Peso', '', { cortes: [0.25, 0.5, 0.75] }, '—', '', 'Sin pesajes');
      der = indicador('Salud', '', { cortes: [1 / 3, 1 / 2, 2 / 3, 5 / 6] }, '—', '', 'Súbete a la báscula');
    } else {
      // El tramo tiene en cuenta la grasa (Comida.tramoPeso): IMC alto con grasa normal es Equilibrado. Entonces el
      // triangulito va al final del tramo verde, no en el de sobrepeso.
      var tp = Comida.tramoPeso(pesaje, cuerpo);
      var rango = tp && tp.rango, t = tp && tp.tramo;
      var fr = rango ? (tp.nota ? (t + 0.95) / (rango.cortes.length + 1) : fraccionRango(rango, pesaje.kg)) : 0;
      izq = indicador('Peso', fechaCorta(pesaje.fecha),
        rango ? { cortes: [0.25, 0.5, 0.75], activo: t, color: TONOS[tp.tono], fraccion: fr } : { cortes: [0.25, 0.5, 0.75] },
        pesaje.kg.toFixed(2).replace('.', ','), 'kg',
        rango ? tp.nombre : 'Pon tu altura', rango ? TONOS[tp.tono] : '');
      if (salud) {
        var n = Comida.nivelSalud(salud.puntos);
        // El arco de la salud va de 40 a 100, con los tramos de nivelSalud (60, 70, 80, 90).
        var f = Math.min(1, Math.max(0, (salud.puntos - 40) / 60));
        var activo = salud.puntos >= 90 ? 4 : salud.puntos >= 80 ? 3 : salud.puntos >= 70 ? 2 : salud.puntos >= 60 ? 1 : 0;
        der = indicador('Salud', fechaCorta(pesaje.fecha), { cortes: [1 / 3, 1 / 2, 2 / 3, 5 / 6], activo: activo, color: TONOS[n.tono], fraccion: f },
          String(salud.puntos), '', n.nombre, TONOS[n.tono]);
      } else {
        der = indicador('Salud', '', { cortes: [1 / 3, 1 / 2, 2 / 3, 5 / 6] }, '—', '', 'Pon tu altura');
      }
    }
    // Sin altura no hay IMC ni salud: tocarla lleva a Ajustes a ponerla; si no, a Historial → Salud.
    var sinAltura = !(cuerpo.altura > 0);
    cont.appendChild(h('button', { type: 'button', class: 'tarjeta inicio-cuerpo', 'aria-label': sinAltura ? 'Poner la altura' : 'Ver Salud',
      onclick: sinAltura ? function () { App.mostrar('ajustes'); } : App.abrirSalud }, [izq, der]));
  }

  // Equilibrio entre salud y fuerza (Comida.equilibrio): la barra de cinco tramos de Zepp con el de ahora marcado y,
  // debajo, las dos cifras.
  var COLORES_EQUILIBRIO = ['var(--ok)', '#b5d334', 'var(--rm)', 'var(--kcal)', 'var(--error)'];
  var ORDEN_EQUILIBRIO = [4, 3, 2, 1, 0];   // tramos de Comida.equilibrio (0 = Muy bueno), pintados al revés
  function tarjetaEquilibrio(cont, salud) {
    var r = Almacen.cuerpo() ? Estado.actual() : null;
    var fuerza = r && r.total > 0 ? r.total : null;
    var e = salud ? Comida.equilibrio(salud.puntos, fuerza) : null;
    var cuerpo = Almacen.cuerpo();
    var falta = !cuerpo ? 'Pon tus datos en Ajustes' : !(cuerpo.altura > 0) ? 'Pon tu altura en Ajustes → Tus datos'
      : !salud ? 'Falta pesarte en la báscula' : !fuerza ? 'Faltan series que cuenten para la fuerza' : '';
    return pintarEquilibrio(cont, e, salud ? salud.puntos : null, fuerza, falta);
  }

  // También la usa Social con lo que comparte otro (su tarjeta trae { valor, tramo, nombre, salud, fuerza }).
  function pintarEquilibrio(cont, e, salud, fuerza, falta) {
    var nivel = fuerza ? Fuerza.nivel(fuerza) : null;
    var tarjeta = h('div', { class: 'tarjeta inicio-equilibrio' }, [
      // El nombre del tramo en la misma línea que el título: así cabe todo Inicio sin desplazarse (él, 2026-11-08).
      h('div', { class: 'ejercicio-cabecera' }, [
        h('h2', { texto: 'Equilibrio' }),
        h('span', { class: 'equilibrio-estado', style: e ? 'color:' + COLORES_EQUILIBRIO[e.tramo] : '', texto: e ? e.nombre : 'No se puede analizar' }),
      ]),
      // De malo a bueno, de izquierda a derecha (él, 2026-11-08): "Muy pobre" a la izquierda y "Muy bueno" a la derecha.
      h('div', { class: 'equilibrio-barra' }, ORDEN_EQUILIBRIO.map(function (i) {
        return h('span', { class: e && e.tramo === i ? 'activo' : '', style: 'background:' + COLORES_EQUILIBRIO[i] });
      })),
      h('div', { class: 'equilibrio-nombres' }, ORDEN_EQUILIBRIO.map(function (i) {
        return h('span', { class: e && e.tramo === i ? 'activo' : '', texto: Comida.EQUILIBRIO[i] });
      })),
      h('p', { class: 'detalle equilibrio-cifras' }, falta || !e ? [falta || ''] : [
        'Salud ', h('strong', { texto: String(salud) }),
        ' · Fuerza ', h('strong', { texto: String(Math.round(fuerza * 10) / 10).replace('.', ',') }),
        nivel ? h('span', { class: 'equilibrio-nivel', style: 'color:' + nivel.color, texto: ' ' + nivel.nombre }) : null,
      ]),
    ]);
    cont.appendChild(tarjeta);
    return tarjeta;
  }
  App.pintarEquilibrio = pintarEquilibrio;

  // Al volver a la app, los pasos han cambiado.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && enInicio() && Pasos.disponible()) {
      Pasos.leer().then(function () { if (enInicio()) App.mostrar('inicio'); }).catch(function () {});
    }
  });
})();
