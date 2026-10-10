// Calendario de entrenos (como el de FitNotes, lo pidió él el 2026-10-05): cada día con un punto de color por zona
// del cuerpo entrenada, y los días de gym con un aro verde (hecho) o rojo (falta). Al tocar un día: qué tocaba, qué
// se hizo, y desde ahí ir al entreno de hoy o recuperar ese día aunque haya pasado tiempo (las series van a ese día).
// En Inicio va la semana en curso; al tocarla se abre el mes entero (vista "calendario").
var Mes = (function () {
  var h = App.h;
  var formato = App.formato;
  var DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  // Un color por zona del cuerpo (son datos, como los niveles de fuerza: igual en los dos aspectos).
  var COLORES = {
    Pecho: '#e5534b', Espalda: '#3b8eea', Hombro: '#f0a020', Brazo: '#a15bd8', Pierna: '#2fb36b',
    Abdomen: '#22b8b0', Cardio: '#e8579b', Otros: '#8a8f98',
  };
  var ORDEN = ['Pecho', 'Espalda', 'Hombro', 'Brazo', 'Pierna', 'Abdomen', 'Cardio', 'Otros'];

  function sumarDias(f, n) {
    return Calendario.sumarDias(f, n);
  }

  function diaSemana(f) {
    var p = f.split('-').map(Number);
    return (new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay() + 6) % 7;
  }

  // Lo hecho cada día: { 'aaaa-mm-dd': { zonas: {Pecho: true…}, ejercicios: [{ nombre, series: [[kg, reps]…] }] } }.
  // Se monta una vez por historial (el mismo objeto mientras no cambie).
  var montado = { hist: null, valor: null };
  function porDia() {
    var hist = Almacen.historial() || { ejercicios: {}, info: {} };
    if (montado.hist === hist) return montado.valor;
    var dias = {};
    Object.keys(hist.ejercicios || {}).forEach(function (clave) {
      var info = (hist.info || {})[clave] || {};
      var nombre = info.nombre || clave;
      var zona = Grupos.zonaDe(info.grupo || Grupos.grupoDe(nombre) || '');
      hist.ejercicios[clave].forEach(function (d) {
        var x = dias[d.f] || (dias[d.f] = { zonas: {}, ejercicios: [] });
        x.zonas[zona] = true;
        x.ejercicios.push({ nombre: nombre, zona: zona, series: d.s });
      });
    });
    montado = { hist: hist, valor: dias };
    return dias;
  }

  // Cómo quedó cada día de gym (de la API: Hecho, Recuperado, Falta, Justificada…), si se sabe.
  function resultados() {
    var f = Almacen.faltas();
    var c = Almacen.config();
    var dias = (f && c && f.personas && f.personas[c.persona] && f.personas[c.persona].dias) || [];
    var r = {};
    dias.forEach(function (d) { r[d.fecha] = d; });
    return r;
  }

  function claseResultado(res) {
    if (!res) return '';
    if (/^(Hecho|Recuperado|Terminado)$/.test(res.resultado)) return ' hecho';
    if (/^(Falta|Pendiente|Rechazada)$/.test(res.resultado)) return ' falta';
    if (res.resultado === 'Justificada') return ' justificada';
    return '';
  }

  // Puntos de las zonas: rellenos lo hecho; de contorno lo que toca (un día de gym aún sin hacer).
  function puntos(zonas, previsto) {
    var lista = ORDEN.filter(function (z) { return zonas && zonas[z]; });
    return h('span', { class: 'mes-puntos' + (previsto ? ' previsto' : ''), 'aria-hidden': 'true' }, lista.map(function (z) {
      return h('span', { class: 'mes-punto', style: previsto ? 'border-color:' + COLORES[z] : 'background:' + COLORES[z] });
    }));
  }

  // Zonas de los ejercicios de un entreno del plan (para los puntos de los días que tocan).
  function zonasDelEntreno(entreno) {
    var zonas = {};
    (((Almacen.plan() || {}).entrenos || {})[entreno] || []).forEach(function (ej) {
      zonas[Grupos.zonaDe(Grupos.grupoDe(ej.nombre) || '')] = true;
    });
    return zonas;
  }

  // Botón que abre el calendario (va en la tarjeta de "Hoy toca…" de Inicio).
  function boton() {
    var b = h('button', { type: 'button', class: 'boton-calendario', 'aria-label': 'Abrir el calendario', onclick: function () { App.mostrar('calendario'); } });
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
      '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>' +
      '<circle cx="8.5" cy="14.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="14.5" r="1.1" fill="currentColor" stroke="none"/>' +
      '<circle cx="15.5" cy="14.5" r="1.1" fill="currentColor" stroke="none"/></svg>';
    b.appendChild(document.createTextNode('Calendario'));
    return b;
  }

  // Lo que tocaba ese día según el calendario (solo desde que la app lleva la cuenta).
  function tocaba(fecha) {
    if (fecha < Calendario.INICIO_FALTAS) return null;
    var c = Calendario.porCalendario(fecha);
    return c.descanso ? null : c;
  }

  // Días de RM (la columna AMRAP): los del calendario y, antes de que contaran las faltas, los que tienen series
  // apuntadas en esa columna. Se marcan de otro color (él, 2026-10-05).
  var rmMontado = { series: null, valor: null };
  function diasRM() {
    var series = Almacen.series();
    if (rmMontado.series === series) return rmMontado.valor;
    var dias = {};
    series.forEach(function (s) { if (Number(s.columna) === Calendario.COLUMNAS) dias[s.fecha] = true; });
    rmMontado = { series: series, valor: dias };
    return dias;
  }

  function esRM(fecha, t) {
    return t ? t.columna === Calendario.COLUMNAS : !!diasRM()[fecha];
  }

  function celda(fecha, hechos, res, hoy, alTocar) {
    var x = hechos[fecha];
    var t = tocaba(fecha);
    var rm = esRM(fecha, t);
    return h('button', {
      type: 'button',
      class: 'mes-dia' + (fecha === hoy ? ' hoy' : '') + (fecha > hoy ? ' futuro' : '') + claseResultado(res[fecha]) + (t ? ' de-gym' : '') + (rm ? ' rm' : ''),
      'aria-label': fechaLarga(fecha) + (rm ? ', día de RM' : '') + (x ? ', entrenaste ' + ORDEN.filter(function (z) { return x.zonas[z]; }).join(', ') : ''),
      onclick: function () { alTocar(fecha); },
    }, [
      h('span', { class: 'mes-numero', texto: String(Number(fecha.slice(8))) }),
      x ? puntos(x.zonas) : t ? puntos(zonasDelEntreno(t.entreno), true) : h('span', { class: 'mes-puntos' }),
    ]);
  }

  // Un ejercicio de la ficha: plegado, el nombre y cuántas series; al tocarlo, una línea por serie con su peso y
  // sus reps (él, 2026-10-05); manteniendo el dedo en una, su 1RM. filas: [{ kg: texto, reps: texto, opcional, dato }].
  function ejercicioPlegable(nombre, punto, aviso, filas) {
    var lista = App.listaSeries(filas);
    lista.hidden = true;
    var flecha = h('span', { class: 'mes-flecha', 'aria-hidden': 'true', texto: '›' });
    var cabeza = h('button', { type: 'button', class: 'mes-ejercicio-cabeza', 'aria-expanded': 'false', onclick: function () {
      lista.hidden = !lista.hidden;
      cabeza.setAttribute('aria-expanded', lista.hidden ? 'false' : 'true');
      cabeza.classList.toggle('abierto', !lista.hidden);
    } }, [
      h('strong', { class: 'con-icono' }, [punto, nombre]),
      h('span', { class: 'detalle', texto: filas.length + (filas.length === 1 ? ' serie' : ' series') }),
      flecha,
    ]);
    return h('div', { class: 'mes-ejercicio' }, [cabeza, aviso ? h('span', { class: 'detalle', texto: aviso }) : null, lista]);
  }

  // Lo hecho, serie a serie.
  function filasHechas(series, nombre) {
    var corporal = Grupos.esCorporal(nombre);
    var asistido = Grupos.esAsistido(nombre);
    return series.map(function (s) {
      if (s[2] || s[3]) return { kg: Grupos.textoSerieTiempo(s), reps: '' };
      // Con el peso del cuerpo, los kg de FitNotes son el peso del cuerpo, no una carga.
      if (corporal || !(s[0] > 0)) return { kg: 'tu peso', reps: s[1] + ' reps' };
      return { kg: formato(s[0]) + ' kg', reps: s[1] + ' reps', dato: App.textoRM(s[0], s[1], asistido ? 'Asistidas: sin 1RM' : '') };
    });
  }

  // Lo que toca, serie a serie: los kg de esa semana en los principales; en el resto, lo que propondría la app.
  function filasPrevistas(ej, col, entreno) {
    var corporal = Grupos.esCorporal(ej.nombre);
    var kg = col.kg;
    var porSerie = null;   // secundarios con subida escalonada: cada serie su peso y sus reps
    if (kg == null && !corporal && typeof Ajuste !== 'undefined') {
      var p = null;
      try { p = Ajuste.secundario(ej.nombreCorto || ej.nombre, col, entreno); } catch (e) { p = null; }
      if (p && p.kg) kg = p.kg;
      if (p && p.series) porSerie = p.series;
    }
    var asistido = Grupos.esAsistido(ej.nombre);
    return (col.series || []).map(function (s, i) {
      var p = porSerie && porSerie[i];
      var kgSerie = p && p.kg ? p.kg : kg;
      var repsTexto = p && p.reps ? String(p.reps) : s.reps;
      // En un rango ("8-10") el 1RM sale con las reps de abajo.
      var reps = parseInt(repsTexto, 10);
      return {
        kg: corporal ? 'tu peso' : kgSerie ? formato(kgSerie) + ' kg' : '— kg',
        reps: (repsTexto || '?') + (/^\d/.test(repsTexto || '') ? ' reps' : ''),
        opcional: s.opcional,
        dato: corporal || !kgSerie || !(reps > 0) ? null : App.textoRM(kgSerie, reps, asistido ? 'Asistidas: sin 1RM' : ''),
      };
    });
  }

  function textoSerie(s) {
    return s[2] || s[3] ? Grupos.textoSerieTiempo(s) : s[0] > 0 ? formato(s[0]) + ' kg × ' + s[1] : s[1] + ' reps';
  }

  function fechaLarga(f) {
    var t = new Date(f + 'T12:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // La ficha de un día: qué tocaba, cómo quedó, qué se hizo, y los botones.
  function abrirDia(fecha) {
    if (document.querySelector('.mes-lista')) foco = fecha.slice(0, 7);
    var hoy = Almacen.hoyISO();
    var x = porDia()[fecha];
    var res = resultados()[fecha];
    var t = tocaba(fecha);
    var hijos = [];
    if (t) {
      hijos.push(h('p', { class: 'mes-ficha-toca' }, [
        h('strong', { texto: (fecha >= hoy ? 'Toca ' : 'Tocaba ') + t.entreno + ' · ' + Calendario.nombreColumna(t.columna) }),
        res ? h('span', { class: 'chip resultado' + (claseResultado(res) === ' hecho' ? ' bien' : claseResultado(res) === ' falta' ? ' mal' : ' neutro'),
          texto: res.resultado }) : null,
      ]));
    } else if (fecha >= Calendario.INICIO_FALTAS) {
      hijos.push(h('p', { class: 'detalle', texto: 'Día de descanso.' }));
    }
    // Hecho con la app: el entreno completo en el orden en que se hizo, cada ejercicio con sus pesos.
    var apuntadas = Almacen.series().filter(function (s) { return s.fecha === fecha; })
      .sort(function (a, b) { return String(a.hora).localeCompare(String(b.hora)) || (a.serie || 0) - (b.serie || 0); });
    var plan = ((Almacen.plan() || {}).entrenos || {});
    if (apuntadas.length) {
      var orden = [];
      var porEjercicio = {};
      apuntadas.forEach(function (s) {
        var k = Grupos.normalizar(s.ejercicio);
        if (!porEjercicio[k]) { porEjercicio[k] = { nombre: s.ejercicio, sustituye: s.sustituye, series: [] }; orden.push(k); }
        porEjercicio[k].series.push(s.seg || s.km ? [s.kg, s.reps, s.seg || 0, s.km || 0] : [s.kg, s.reps]);
      });
      hijos.push(h('p', { class: 'mes-titulo', texto: 'Lo que hiciste' + (apuntadas[0].entreno ? ' · ' + apuntadas[0].entreno : '') }));
      orden.forEach(function (k) {
        var e = porEjercicio[k];
        var zona = Grupos.zonaDe(Grupos.grupoDe(e.nombre) || '');
        hijos.push(ejercicioPlegable(String(e.nombre).replace(/^WEAK POINT:\s*/i, ''),
          h('span', { class: 'mes-punto', style: 'background:' + COLORES[zona] }),
          e.sustituye ? 'En lugar de ' + e.sustituye : null, filasHechas(e.series, e.nombre)));
      });
    } else if (t && !x) {
      // Sin hacer: lo que toca, con los kg de esa semana del ciclo.
      hijos.push(h('p', { class: 'mes-titulo', texto: fecha > hoy ? 'Lo que te toca' : 'Lo que tocaba' }));
      (plan[t.entreno] || []).forEach(function (ej) {
        var col = (ej.columnas || [])[t.columna - 1] || {};
        var zona = Grupos.zonaDe(Grupos.grupoDe(ej.nombre) || '');
        hijos.push(ejercicioPlegable(ej.nombreCorto || ej.nombre,
          h('span', { class: 'mes-punto previsto', style: 'border-color:' + COLORES[zona] }),
          col.detalle && col.detalle !== 'Normal' ? col.detalle : null, filasPrevistas(ej, col, t.entreno)));
      });
    }
    if (!apuntadas.length && x) {
      // Días de antes de la app (FitNotes): lo hecho por zona.
      ORDEN.forEach(function (z) {
        var deZona = x.ejercicios.filter(function (e) { return e.zona === z; });
        if (!deZona.length) return;
        hijos.push(h('p', { class: 'mes-zona' }, [h('span', { class: 'mes-punto', style: 'background:' + COLORES[z] }), z]));
        deZona.forEach(function (e) {
          hijos.push(ejercicioPlegable(e.nombre, h('span', { class: 'mes-punto', style: 'background:' + COLORES[z] }), null, filasHechas(e.series, e.nombre)));
        });
      });
    } else if (!apuntadas.length && !t && fecha <= hoy) {
      hijos.push(h('p', { class: 'vacio', texto: 'Ese día no hay nada apuntado.' }));
    }
    // Ir al entreno: hoy, el de hoy; un día pasado de gym sin completar, recuperarlo (las series van a ese día).
    if (fecha === hoy) {
      hijos.push(h('button', { type: 'button', class: 'principal', texto: 'Ir al entreno de hoy', onclick: function () {
        App.cerrarSelector();
        App.abrirEntreno();
      } }));
    } else if (t && fecha < hoy && !/^(Hecho|Recuperado|Justificada)$/.test((res || {}).resultado || '')) {
      hijos.push(h('button', { type: 'button', class: 'principal con-icono', onclick: function () {
        App.cerrarSelector();
        App.abrirEntreno({ fecha: fecha, entreno: t.entreno, columna: t.columna });
      } }, [Iconos.recuperar(), 'Recuperar ' + t.entreno + ' de ese día']));
      hijos.push(h('p', { class: 'detalle', texto: 'Lo que apuntes se guarda en ese día y cuenta como hecho.' }));
    } else if (t && fecha < hoy) {
      hijos.push(h('button', { type: 'button', texto: 'Abrir el ' + t.entreno + ' de ese día', onclick: function () {
        App.cerrarSelector();
        App.abrirEntreno({ fecha: fecha, entreno: t.entreno, columna: t.columna });
      } }));
    }
    App.abrirSelector(fechaLarga(fecha), hijos);
  }

  // ---- En Inicio: la semana en curso ----

  function semana(cont) {
    refrescarResultados();
    var hoy = Almacen.hoyISO();
    var lunes = sumarDias(hoy, -diaSemana(hoy));
    var hechos = porDia();
    var res = resultados();
    var celdas = [];
    for (var i = 0; i < 7; i++) celdas.push(celda(sumarDias(lunes, i), hechos, res, hoy, abrirDia));
    cont.appendChild(h('div', { class: 'tarjeta inicio-calendario' }, [
      h('button', { type: 'button', class: 'inicio-calendario-cabecera', onclick: function () { App.mostrar('calendario'); } }, [
        h('h3', { texto: 'Calendario' }),
        h('span', { class: 'detalle', texto: 'Ver el mes ›' }),
      ]),
      h('div', { class: 'mes-rejilla mes-semana' }, DIAS.map(function (d) { return h('span', { class: 'mes-cabecera', texto: d }); }).concat(celdas)),
    ]));
  }

  // ---- Pantalla del calendario: un mes ----

  var foco = null;   // 'aaaa-mm' del último día abierto: al volver al calendario se enseña ese mes

  function sumarMes(mes, n) {
    var p = mes.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1 + n, 1)).toISOString().slice(0, 7);
  }

  // Cómo quedó cada día (hecho / falta) sale de la API; se vuelve a pedir si lo guardado tiene más de 10 minutos.
  function refrescarResultados() {
    var f = Almacen.faltas();
    if (f && Date.now() - (f.actualizado || 0) < 600000) return;
    Almacen.actualizarFaltas().then(function () {
      if (document.querySelector('.mes-lista')) repintarCalendario();
      else if (document.querySelector('.inicio-calendario')) App.mostrar('inicio');
    }).catch(function () {});
  }

  // Un mes entero: título con los días entrenados y la rejilla.
  function bloqueMes(mes, hechos, res, hoy) {
    var primero = mes + '-01';
    var siguiente = sumarMes(mes, 1) + '-01';
    var celdas = DIAS.map(function (d) { return h('span', { class: 'mes-cabecera', texto: d }); });
    for (var i = 0; i < diaSemana(primero); i++) celdas.push(h('span'));
    var entrenados = 0;
    for (var f = primero; f < siguiente; f = sumarDias(f, 1)) {
      if (hechos[f]) entrenados++;
      celdas.push(celda(f, hechos, res, hoy, abrirDia));
    }
    var nombre = new Date(primero + 'T12:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    return h('section', { class: 'tarjeta mes-bloque', 'data-mes': mes }, [
      h('div', { class: 'cal-mes' }, [
        h('strong', { texto: nombre.charAt(0).toUpperCase() + nombre.slice(1) }),
        entrenados ? h('span', { class: 'detalle', texto: entrenados + (entrenados === 1 ? ' día' : ' días') }) : null,
      ]),
      h('div', { class: 'mes-rejilla' }, celdas),
    ]);
  }

  // Los meses van uno debajo de otro (él, 2026-10-05): hacia arriba los de antes, hacia abajo los que vienen. Se
  // empieza en el mes de hoy y se van añadiendo más al acercarse a un extremo.
  var rango = null;            // { desde, hasta } meses pintados
  var volverA = null;          // scroll que hay que recuperar al repintar
  var MAS = 3;

  function primerMes() {
    var dias = Object.keys(porDia()).sort();
    var hoy = Almacen.hoyISO().slice(0, 7);
    return dias.length && dias[0].slice(0, 7) < hoy ? dias[0].slice(0, 7) : sumarMes(hoy, -12);
  }

  function anadirMeses(lista, haciaArriba) {
    var hechos = porDia(), res = resultados(), hoy = Almacen.hoyISO();
    if (haciaArriba) {
      var minimo = primerMes();
      if (rango.desde <= minimo) return;
      var alto = document.documentElement.scrollHeight;
      for (var i = 0; i < MAS && rango.desde > minimo; i++) {
        rango.desde = sumarMes(rango.desde, -1);
        lista.insertBefore(bloqueMes(rango.desde, hechos, res, hoy), lista.firstChild);
      }
      window.scrollBy(0, document.documentElement.scrollHeight - alto);
    } else {
      var maximo = sumarMes(hoy.slice(0, 7), 12);
      for (var j = 0; j < MAS && rango.hasta < maximo; j++) {
        rango.hasta = sumarMes(rango.hasta, 1);
        lista.appendChild(bloqueMes(rango.hasta, hechos, res, hoy));
      }
    }
  }

  var escuchando = false;
  function vigilarScroll() {
    if (escuchando) return;
    escuchando = true;
    var pendiente = false;
    window.addEventListener('scroll', function () {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(function () {
        pendiente = false;
        var lista = document.querySelector('.mes-lista');
        if (!lista || !rango) return;
        if (window.scrollY < 500) anadirMeses(lista, true);
        else if (window.scrollY + window.innerHeight > document.documentElement.scrollHeight - 500) anadirMeses(lista, false);
      });
    }, { passive: true });
  }

  App.vistas.calendario = function (cont) {
    refrescarResultados();
    vigilarScroll();
    var hoy = Almacen.hoyISO();
    var hechos = porDia();
    var res = resultados();
    var actual = foco || hoy.slice(0, 7);
    if (!rango || volverA == null) rango = { desde: sumarMes(actual, -2), hasta: sumarMes(actual, 2) };
    var minimo = primerMes() < actual ? primerMes() : actual;
    if (rango.desde < minimo) rango.desde = minimo;
    var meses = [];
    for (var m = rango.desde; m <= rango.hasta; m = sumarMes(m, 1)) meses.push(bloqueMes(m, hechos, res, hoy));
    // Título, Cerrar y leyenda se quedan a la vista mientras se pasan los meses.
    var arriba = h('div', { class: 'mes-arriba' }, [
      h('div', { class: 'ajustes-cabecera' }, [
        h('h2', { texto: 'Calendario' }),
        h('button', { class: 'discreto', texto: '✕ Cerrar', onclick: function () { rango = null; foco = null; App.mostrar('inicio'); } }),
      ]),
      h('div', { class: 'mes-leyenda' }, ORDEN.filter(function (z) { return z !== 'Otros'; }).map(function (z) {
        return h('span', {}, [h('span', { class: 'mes-punto', style: 'background:' + COLORES[z] }), z]);
      }).concat([
        h('span', {}, [h('span', { class: 'mes-aro hecho' }), 'Hecho']),
        h('span', {}, [h('span', { class: 'mes-aro falta' }), 'Falta']),
        h('span', {}, [h('span', { class: 'mes-rm-muestra' }), 'Día de RM']),
      ])),
    ]);
    cont.appendChild(arriba);
    var lista = h('div', { class: 'mes-lista' }, meses);
    cont.appendChild(lista);
    var destino = volverA;
    volverA = null;
    // En cuanto esté pintado, el mes de hoy (o el del día abierto) justo debajo de la leyenda, o donde se estaba.
    requestAnimationFrame(function () {
      var superior = document.querySelector('.superior');
      var alto = superior ? superior.offsetHeight : 0;
      arriba.style.top = alto + 'px';
      if (destino != null) { window.scrollTo(0, destino); return; }
      var deHoy = lista.querySelector('[data-mes="' + actual + '"]');
      if (deHoy) window.scrollTo(0, deHoy.getBoundingClientRect().top + window.scrollY - alto - arriba.offsetHeight - 8);
    });
  };

  // Repintar el calendario sin perder por dónde se iba (al volver de recuperar un día o al llegar los resultados).
  function repintarCalendario() {
    if (rango) volverA = window.scrollY;
    App.mostrar('calendario');
  }

  return { semana: semana, abrirDia: abrirDia, boton: boton };
})();
