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
  function barrasKcal(dias, conValores) {
    var NS = 'http://www.w3.org/2000/svg';
    function el(t, a, texto) {
      var n = document.createElementNS(NS, t);
      Object.keys(a).forEach(function (k) { n.setAttribute(k, a[k]); });
      if (texto != null) n.textContent = texto;
      return n;
    }
    var ancho = 160, alto = 112, arriba = conValores ? 16 : 6, abajo = 16;
    var max = Math.max(1, Math.max.apply(null, dias.map(function (d) { return Math.max(d.comidas, d.quemadas); })));
    var hueco = ancho / dias.length;
    var barra = Math.min(dias.length === 1 ? 34 : 22, hueco * 0.34);
    var svg = el('svg', { viewBox: '0 0 ' + ancho + ' ' + alto, class: 'grafica kcal-pareja', role: 'img',
      'aria-label': dias.map(function (d) { return d.etiqueta + ': ' + d.comidas + ' consumidas, ' + d.quemadas + ' quemadas'; }).join('; ') });
    dias.forEach(function (d, i) {
      var centro = hueco * (i + 0.5);
      [['comidas', -1], ['quemadas', 1]].forEach(function (s) {
        var v = d[s[0]];
        var h = (alto - arriba - abajo) * v / max;
        var separa = dias.length === 1 ? 7 : 1;
        var x = centro + (s[1] < 0 ? -barra - separa : separa);
        if (v > 0 && s[0] === 'quemadas') {
          // Quemadas apiladas como en Historial: abajo en reposo, luego andando y encima entrenando.
          var base = alto - abajo;
          [['reposo', d.reposo], ['andando', d.andando], ['entreno', d.entrenando]].forEach(function (p) {
            var hp = (alto - arriba - abajo) * Math.max(0, p[1] || 0) / max;
            if (hp <= 0) return;
            svg.appendChild(el('rect', { x: x, y: base - hp, width: barra, height: Math.max(hp, 1), class: 'kcal-' + p[0] }));
            base -= hp;
          });
        } else if (v > 0) svg.appendChild(el('rect', { x: x, y: alto - abajo - h, width: barra, height: Math.max(h, 1), rx: 2, class: 'kcal-' + s[0] }));
        if (conValores && v > 0) svg.appendChild(el('text', { x: x + barra / 2, y: alto - abajo - h - 3, 'text-anchor': 'middle', class: 'kcal-valor' }, Grafica.miles(v)));
      });
      // Un solo día: debajo de cada barra lo que es; la semana: la letra del día.
      if (dias.length === 1) {
        svg.appendChild(el('text', { x: centro - barra / 2 - 7, y: alto - 3, 'text-anchor': 'middle', class: 'eje' }, 'Comido'));
        svg.appendChild(el('text', { x: centro + barra / 2 + 7, y: alto - 3, 'text-anchor': 'middle', class: 'eje' }, 'Quemado'));
      } else svg.appendChild(el('text', { x: centro, y: alto - 3, 'text-anchor': 'middle', class: 'eje' }, d.etiqueta));
    });
    return svg;
  }

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

  // Inicio: hoy, consumidas y quemadas lado a lado con su número; la semana (de lunes a domingo), una pareja por día.
  // Debajo, el balance (solo si las quemadas son todo el gasto, con la altura puesta).
  function tarjetaKcal(semanal, hoy, lista) {
    var entreno = kcalEntrenoPorDia() || {};
    var p = hoy.split('-').map(Number);
    var lunes = Calendario.sumarDias(hoy, -((new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay() + 6) % 7));
    var dias = semanal
      ? [0, 1, 2, 3, 4, 5, 6].map(function (i) { var f = Calendario.sumarDias(lunes, i); return Object.assign(kcalDelDia(f, hoy, lista, entreno), { etiqueta: diaSemana(f).charAt(0) }); })
      : [Object.assign(kcalDelDia(hoy, hoy, lista, entreno), { etiqueta: '' })];
    var suma = function (k) { return dias.filter(function (d) { return d.fecha <= hoy; }).reduce(function (t, d) { return t + d[k]; }, 0); };
    var comidas = suma('comidas'), quemadas = suma('quemadas');
    var completo = dias.every(function (d) { return d.fecha > hoy || d.completo; });
    var balance = comidas - quemadas;
    return [
      h('h3', { texto: 'Calorías' }),
      h('span', { class: 'cuando', texto: semanal ? 'Semana' : 'Hoy' }),
      h('div', { class: 'kcal-pareja-caja' }, [barrasKcal(dias, !semanal)]),
      h('p', { class: 'kcal-leyenda' }, [
        h('span', { class: 'muestra-punto kcal-comidas' }), Grafica.miles(comidas) + ' ',
        h('span', { class: 'muestra-punto kcal-quemadas' }), Grafica.miles(quemadas),
      ]),
      // De qué color es cada trozo de lo quemado.
      h('p', { class: 'kcal-partes' }, [
        completo ? h('span', { class: 'muestra-punto kcal-reposo' }) : null, completo ? 'Reposo ' : null,
        h('span', { class: 'muestra-punto kcal-andando' }), 'Andar ',
        h('span', { class: 'muestra-punto kcal-entreno' }), 'Gym',
      ]),
      completo && comidas > 0 ? h('p', { class: 'kcal-balance ' + (balance > 0 ? 'mas' : 'menos'), texto: (balance > 0 ? '+' : '−') + Grafica.miles(Math.abs(balance)) + ' kcal' }) : null,
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
    // El calendario se abre con su botón en esta tarjeta. Inicio cabe en la pantalla sin desplazarse (él,
    // 2026-10-05), así que el estado de fuerza va en pequeño y "Ver más" lo abre entero en Historial.
    tarjetaHoy(cont);
    tarjetaEstado(cont);
  };

  function tarjetaEstado(cont) {
    var r = Almacen.cuerpo() ? Estado.actual() : null;
    if (!r) {
      cont.appendChild(h('button', { type: 'button', class: 'tarjeta inicio-estado-vacio', onclick: App.abrirEstado }, [
        h('h2', { texto: 'Estado actual' }),
        h('span', { class: 'detalle', texto: !Almacen.cuerpo() ? 'Pon tus datos en Ajustes para ver tu nivel.' : 'Sin series que cuenten aún.' }),
      ]));
      return;
    }
    var fotos = Almacen.estados();
    var tarjeta = Estado.resumen(cont, r, null, fotos.length ? fotos[fotos.length - 1] : null, false, true);
    tarjeta.classList.add('inicio-estado');
    var masInfo = tarjeta.querySelector('.ejercicio-cabecera button');
    if (masInfo) masInfo.replaceWith(h('button', { type: 'button', class: 'discreto', texto: 'Ver más ›', onclick: App.abrirEstado }));
  }

  // Al volver a la app, los pasos han cambiado.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && enInicio() && Pasos.disponible()) {
      Pasos.leer().then(function () { if (enInicio()) App.mostrar('inicio'); }).catch(function () {});
    }
  });
})();
