// Interfaz de GymApp: arranque, pestaña "Hoy" (qué toca, grupos musculares, apuntar series, cambiar o añadir ejercicios,
// récords), descanso y 1RM. Las pestañas Historial y Ajustes están en vistas.js; Estado, en estado.js.
var App = (function () {
  var vista = document.getElementById('vista');
  var botonEstado = document.getElementById('estado');
  var estado = { vista: 'inicio', entreno: null, columna: null, elegidoAMano: false };
  var vistas = {};
  var TIPOS = { debil: 'Weak point', principal: 'Principal', secundario: 'Secundario', jump: 'Jump set', extra: 'Extra' };

  // ---- Utilidades ----

  function h(etiqueta, atributos, hijos) {
    var n = document.createElement(etiqueta);
    Object.keys(atributos || {}).forEach(function (k) {
      if (k === 'texto') n.textContent = atributos[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), atributos[k]);
      else if (atributos[k] !== false && atributos[k] != null) n.setAttribute(k, atributos[k] === true ? '' : atributos[k]);
    });
    (hijos || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  function formato(n) {
    return n == null || n === '' ? '' : String(Math.round(Number(n) * 100) / 100).replace('.', ',');
  }

  function numero(t) {
    var v = parseFloat(String(t).replace(',', '.'));
    return isNaN(v) ? null : v;
  }

  function reloj(segundos) {
    return Math.floor(segundos / 60) + ':' + String(segundos % 60).padStart(2, '0');
  }

  function sinPrefijo(nombre) {
    return String(nombre).replace(/^WEAK POINT:\s*/i, '');
  }

  var temporizadorAviso = null;
  function avisar(texto, esError) {
    var aviso = document.getElementById('aviso');
    aviso.textContent = texto;
    aviso.className = 'aviso' + (esError ? ' error' : '');
    aviso.hidden = false;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(function () { aviso.hidden = true; }, 3500);
  }

  function rmEstimado(kg, reps) {
    return Records.rm(kg, reps) || null;
  }

  // ---- Hoja inferior para elegir (ejercicio alternativo, extra, grupo muscular) ----

  var selector = document.getElementById('selector');
  function abrirSelector(titulo, hijos) {
    document.getElementById('selector-titulo').textContent = titulo;
    var contenido = document.getElementById('selector-contenido');
    contenido.innerHTML = '';
    hijos.forEach(function (c) { if (c) contenido.appendChild(c); });
    selector.hidden = false;
  }
  function cerrarSelector() {
    selector.hidden = true;
  }
  document.getElementById('selector-cerrar').addEventListener('click', cerrarSelector);
  selector.addEventListener('click', function (e) { if (e.target === selector) cerrarSelector(); });

  // ---- Navegación y estado de sincronización ----

  // Ajustes se abre con el engranaje de arriba; al cerrarlo se vuelve a la pestaña de antes.
  var vistaAnterior = 'inicio';
  function mostrar(nombre) {
    if (nombre !== 'ajustes') vistaAnterior = nombre;
    estado.vista = nombre;
    document.querySelectorAll('button[data-vista]').forEach(function (b) {
      b.classList.toggle('activa', b.dataset.vista === nombre);
    });
    vista.innerHTML = '';
    try {
      vistas[nombre](vista);
      if (nombre === 'ajustes') {
        vista.insertBefore(h('div', { class: 'ajustes-cabecera' }, [
          h('h2', { texto: 'Ajustes' }),
          Almacen.config() ? h('button', { class: 'discreto', texto: '✕ Cerrar', onclick: function () { mostrar(vistaAnterior); } }) : null,
        ]), vista.firstChild);
      }
    } catch (e) {
      // Nunca una pantalla vacía: se enseña el fallo y se puede volver a intentar.
      fallo(e);
      vista.innerHTML = '';
      vista.appendChild(h('div', { class: 'tarjeta' }, [
        h('p', { texto: 'Algo ha fallado al enseñar esta pantalla. Las series apuntadas están guardadas.' }),
        h('p', { class: 'detalle', texto: String((e && e.message) || e) }),
        h('button', { class: 'principal', texto: 'Reintentar', onclick: function () { mostrar(nombre); } }),
      ]));
    }
    window.scrollTo(0, 0);
  }

  // Guarda el fallo en el móvil (se ve en Ajustes) y lo avisa.
  function fallo(e) {
    var texto = (e && e.message) || String(e);
    try {
      Almacen.anotarFallo(texto + (e && e.stack ? ' · ' + String(e.stack).split('\n').slice(1, 3).join(' ').trim() : ''));
    } catch (e2) { /* sin espacio en el móvil */ }
    avisar('Algo ha fallado: ' + texto, true);
  }
  window.addEventListener('error', function (e) { fallo(e.error || e.message); });
  window.addEventListener('unhandledrejection', function (e) { fallo(e.reason); });

  function pintarEstado() {
    var c = Almacen.config();
    document.getElementById('titulo').textContent = c ? 'GymApp · ' + (c.nombre || c.persona) : 'GymApp';
    var pendientes = Almacen.pendientes();
    botonEstado.className = 'estado' + (pendientes ? ' pendiente' : '');
    botonEstado.textContent = !navigator.onLine ? 'Sin conexión' + (pendientes ? ' · ' + pendientes : '')
      : pendientes ? pendientes + ' por subir' : 'Al día';
  }

  function refrescarTodo() {
    if (!Almacen.config()) return Promise.resolve();
    var habiaPendientes = Almacen.pendientes() > 0;
    return Almacen.sincronizar()
      .then(function (r) {
        if (r.error) throw new Error(r.error);
        return Promise.all([
          Almacen.actualizarPlan(),
          Almacen.actualizarHistorial(),
          // Con una API antigua esta acción aún no existe: no pasa nada.
          Almacen.actualizarProgreso().catch(function () {}),
          Almacen.actualizarEstados().catch(function () {}),
          Almacen.actualizarPasos().catch(function () {}),
        ]);
      })
      .then(function () {
        // La foto del estado de fuerza del mes que acaba de terminar, si aún no está (pestaña Estado).
        Estado.fotoDelMes();
        // Si se han subido series, las hojas de seguimiento se rehacen en segundo plano.
        if (habiaPendientes) {
          Almacen.llamar('vsRealizado', {}).catch(function () {});
          Almacen.llamar('sesiones', {}).catch(function () {});
        }
        // No repinta si se está escribiendo en un campo, para no borrar lo tecleado.
        if (!vista.contains(document.activeElement) || document.activeElement === document.body) mostrar(estado.vista);
      });
  }

  botonEstado.addEventListener('click', function () {
    botonEstado.textContent = 'Actualizando…';
    refrescarTodo()
      .then(function () { avisar('Datos actualizados'); })
      .catch(function (e) { avisar(navigator.onLine ? e.message : 'Sin conexión: se subirá luego', true); })
      .finally(pintarEstado);
  });

  // ---- Pestaña Hoy ----

  vistas.hoy = function (cont) {
    if (!Almacen.config()) {
      cont.appendChild(h('div', { class: 'tarjeta' }, [
        h('p', { texto: 'Primero configura la app.' }),
        h('button', { class: 'principal', texto: 'Ir a Ajustes', onclick: function () { mostrar('ajustes'); } }),
      ]));
      return;
    }
    var plan = Almacen.plan();
    if (!plan) {
      var caja = h('div', { class: 'tarjeta' }, [h('p', { texto: 'Cargando tus entrenos del Excel…' })]);
      cont.appendChild(caja);
      Almacen.actualizarPlan()
        .then(function () { if (estado.vista === 'hoy') mostrar('hoy'); })
        .catch(function (e) {
          caja.innerHTML = '';
          caja.appendChild(h('p', { texto: 'No se pudo cargar el Excel: ' + e.message }));
          caja.appendChild(h('button', { texto: 'Reintentar', onclick: function () { mostrar('hoy'); } }));
        });
      return;
    }

    var toca = Calendario.siguiente(Almacen.ultimaSesion(), Almacen.hoyISO(), Almacen.pendienteAyer());
    if (!estado.elegidoAMano) {
      estado.entreno = toca.entreno;
      estado.columna = toca.columna;
    }

    var lista = plan.entrenos[estado.entreno] || [];
    var extras = Grupos.extrasDe(estado.entreno, estado.columna).map(ejercicioExtra);
    cont.appendChild(cabeceraHoy(toca, lista.concat(extras)));
    if (!lista.length) cont.appendChild(h('p', { class: 'vacio', texto: 'No encuentro la pestaña "Entreno ' + estado.entreno + '" en el Excel.' }));
    lista.forEach(function (ej, i) { cont.appendChild(tarjetaEjercicio(ej, lista[i + 1])); });
    extras.forEach(function (ej) { cont.appendChild(tarjetaEjercicio(ej, null)); });
    cont.appendChild(h('button', { type: 'button', class: 'anadir-ejercicio', texto: '+ Añadir ejercicio', onclick: elegirExtra }));
  };

  // Nombre del ejercicio que se hace hoy en ese hueco: el del Excel o el que se ha elegido en su lugar.
  function nombreHoy(ej) {
    return Grupos.cambioDe(estado.entreno, estado.columna, ej.id) || ej.nombre;
  }

  // Tiempo de la sesión de hoy: de la primera serie marcada a la última.
  function textoSesion() {
    var horas = Almacen.series().filter(function (s) { return s.fecha === Almacen.hoyISO(); })
      .map(function (s) { return String(s.hora); }).sort();
    if (!horas.length) return '';
    function segundos(hora) {
      var p = hora.split(':').map(Number);
      return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
    }
    var minutos = Math.round((segundos(horas[horas.length - 1]) - segundos(horas[0])) / 60);
    return 'Sesión de hoy: ' + (minutos < 1 ? 'acabas de empezar' : minutos + ' min') + ' · ' + horas.length + ' series';
  }

  function cabeceraHoy(toca, lista) {
    var etiqueta = estado.elegidoAMano ? 'Elegido a mano' : toca.enCurso ? 'Sesión en curso' : toca.recuperar ? 'Ayer no lo completaste · recupéralo hoy' : toca.descanso ? 'Hoy descansas · próximo entreno' : 'Te toca';
    var selEntreno = h('select', { 'aria-label': 'Entreno', onchange: function (e) { elegir(e.target.value, estado.columna); } },
      Calendario.ORDEN.map(function (e) { return h('option', { value: e, selected: e === estado.entreno, texto: 'Entreno ' + e }); }));
    var columnas = [];
    for (var c = 1; c <= Calendario.COLUMNAS; c++) {
      columnas.push(h('option', { value: c, selected: c === estado.columna, texto: Calendario.nombreColumna(c) }));
    }
    var selColumna = h('select', { 'aria-label': 'Columna', onchange: function (e) { elegir(estado.entreno, Number(e.target.value)); } }, columnas);
    var grupos = Grupos.delDia(lista.map(nombreHoy));
    var sesion = textoSesion();

    return h('div', { class: 'tarjeta' }, [
      h('div', { class: 'toca' }, [
        h('span', { class: 'etiqueta', texto: etiqueta }),
        h('h2', { texto: estado.entreno + ' · ' + Calendario.nombreColumna(estado.columna) }),
        estado.elegidoAMano ? h('button', { class: 'discreto', texto: 'Volver a lo que toca', onclick: function () {
          estado.elegidoAMano = false;
          mostrar('hoy');
        } }) : null,
      ]),
      grupos.length ? h('div', { class: 'grupos-dia', 'aria-label': 'Grupos musculares' },
        grupos.map(function (g) { return h('span', { class: 'chip grupo', texto: g }); })) : null,
      h('p', { class: 'detalle', id: 'sesion-hoy', texto: sesion }),
      h('div', { class: 'selectores' }, [selEntreno, selColumna]),
      h('div', { class: 'acciones-cabecera' }, [
        h('button', { type: 'button', texto: '⏱ Cronómetro', onclick: function () { Descanso.cronometro(); } }),
        Almacen.enlaceExcel(estado.entreno)
          ? h('a', { class: 'boton', href: Almacen.enlaceExcel(estado.entreno), target: '_blank', rel: 'noopener', texto: '📊 Excel ' + estado.entreno })
          : null,
      ]),
      estado.columna === Calendario.COLUMNAS
        ? h('p', { class: 'detalle', texto: 'Columna AMRAP: al apuntar los principales te calculo el nuevo 1RM.' }) : null,
    ]);
  }

  function elegir(entreno, columna) {
    estado.entreno = entreno;
    estado.columna = columna;
    estado.elegidoAMano = true;
    mostrar('hoy');
  }

  function seriesDeHoy(ej) {
    var hoy = Almacen.hoyISO();
    return Almacen.series().filter(function (s) {
      return s.fecha === hoy && s.entreno === estado.entreno && s.columna === estado.columna && s.ejercicioId === ej.id;
    });
  }

  // Ejercicio añadido a mano a la sesión: sin objetivo del Excel, 3 series libres y 1:30 de descanso.
  function ejercicioExtra(nombre) {
    var columna = {
      objetivo: 'Series libres', detalle: '', kg: null, descanso: 90, descansoTexto: '1.30 minutos',
      series: [{ reps: '', opcional: false }, { reps: '', opcional: false }, { reps: '', opcional: false }],
    };
    var columnas = [];
    for (var i = 0; i < Calendario.COLUMNAS; i++) columnas.push(columna);
    return { id: 'extra-' + Grupos.normalizar(nombre), tipo: 'extra', nombre: nombre, nombreCorto: nombre, columnas: columnas };
  }

  function tarjetaEjercicio(ej, siguienteEj) {
    var col = ej.columnas[estado.columna - 1];
    var hechas = seriesDeHoy(ej);
    var nombre = nombreHoy(ej);
    var cambiado = nombre !== ej.nombre;
    // Un principal cambiado por un ejercicio con 1RM propio en el Recopilatorio (p. ej. Press Banca por Converging)
    // calcula sus kg con ese 1RM y la fórmula del Excel. Sin 1RM propio no se usan los kg del ejercicio original.
    var rmPropio = cambiado && ej.tipo === 'principal' ? Grupos.rmDe(nombre) : null;
    if (cambiado) col = Object.assign({}, col, { kg: rmPropio != null ? Grupos.kgDesdeRM(rmPropio, col.detalle) : null });
    // Con el peso del cuerpo no hay kg que calcular ni % del 1RM: se progresa sumando repeticiones.
    var corporal = Grupos.esCorporal(nombre);
    if (corporal) col = Object.assign({}, col, { kg: null });
    // Principal con el peso del cuerpo: la base es el máximo de repeticiones en una serie y el % de la columna se aplica
    // a ese número. En el AMRAP (o sin máximo conocido) las series van al máximo.
    var alMaximo = corporal && ej.tipo === 'principal';
    var amrap = estado.columna === Calendario.COLUMNAS;
    var maximo = alMaximo ? Grupos.maximoReps(nombre) : null;
    var repsExcel = maximo && !amrap ? Grupos.repsDesdeMaximo(maximo.reps, col.detalle) : null;
    // Si la última vez no salieron, hoy se pide según el máximo de aquel día (el del Excel no se toca).
    var rebajaReps = repsExcel ? Ajuste.maximoDeHoy(nombre, maximo.reps) : null;
    var repsColumna = rebajaReps ? Math.min(repsExcel, Grupos.repsDesdeMaximo(rebajaReps.maximo, col.detalle)) : repsExcel;
    if (rebajaReps && repsColumna >= repsExcel) rebajaReps = null;
    if (alMaximo) col = Object.assign({}, col, { repsCorporal: repsColumna });
    if (maximo && !maximo.guardado) sembrarMaximo(nombre, maximo.reps);
    // Con asistencia los kg son ayuda: más % del Excel es menos ayuda. Sin rebajas automáticas (irían al revés).
    var asistido = !corporal && !cambiado && Grupos.esAsistido(nombre);
    if (asistido) col = Object.assign({}, col, { kg: Grupos.kgAsistido(ej.rm, col.detalle) });
    // Si la última vez faltaron repeticiones, hoy los kg salen rebajados; el 1RM del ciclo no cambia.
    var rebaja = !corporal && !asistido && ej.tipo === 'principal' && estado.columna !== Calendario.COLUMNAS ? Ajuste.deHoy(nombre, col) : null;
    if (rebaja) col = Object.assign({}, col, { kg: rebaja.kg });
    // Por tiempo (plancha, cinta…) se apuntan minutos y segundos en vez de kg y repeticiones.
    var tiempo = Grupos.porTiempo(nombre);
    // Secundarios: el peso de la última vez, con un paso más si salieron todas las reps y rebajado si faltaron.
    var sugerencia = !corporal && !tiempo && ej.tipo !== 'principal' && ej.tipo !== 'extra' ? Ajuste.secundario(nombre, col) : null;
    if (sugerencia) col = Object.assign({}, col, { kg: sugerencia.kg });
    var grupo = Grupos.grupoDe(nombre);
    var ultima = Almacen.ultimaVez(nombre);
    var detalle = col.detalle && col.detalle !== 'Normal' ? col.detalle : '';
    if (corporal && /%/.test(detalle)) detalle = '';
    var mejorAnterior = corporal && !alMaximo && ultima ? Math.max.apply(null, ultima.series.map(function (s) { return s[1]; })) : null;
    var totalAnterior = alMaximo && !maximo && ultima ? ultima.series.reduce(function (t, s) { return t + (Number(s[1]) || 0); }, 0) : 0;
    var obligatorias = col.series.filter(function (s) { return !s.opcional; }).length;
    var numSeries = obligatorias === col.series.length ? String(obligatorias) : obligatorias + ' o ' + col.series.length;
    var pct = (String(col.detalle || '').match(/(\d+(?:[.,]\d+)?)\s*%/) || [])[1];
    var objetivo = alMaximo
      ? (repsColumna ? numSeries + ' x ' + repsColumna : numSeries + ' series al máximo') + ' · con tu peso'
      : col.objetivo + (col.kg ? ' · ' + formato(col.kg) + ' kg' + (asistido ? ' de ayuda' : '') : corporal ? ' · con tu peso' : '');
    var tarjeta;

    function repintar() {
      tarjeta.replaceWith(tarjetaEjercicio(ej, siguienteEj));
    }

    tarjeta = h('section', { class: 'tarjeta ejercicio ' + ej.tipo + (hechas.length >= obligatorias ? ' hecho' : '') }, [
      h('div', { class: 'ejercicio-cabecera' }, [
        h('h3', { texto: sinPrefijo(nombre) }),
        h('span', { class: 'tipo', texto: TIPOS[ej.tipo] }),
      ]),
      cambiado ? h('p', { class: 'cambiado', texto: 'Hoy en lugar de ' + ej.nombreCorto }) : null,
      h('div', { class: 'ejercicio-info' }, [
        grupo ? h('span', { class: 'chip grupo', texto: grupo })
          : h('button', { type: 'button', class: 'chip', texto: '+ Grupo muscular', onclick: function () { elegirGrupo(nombre, repintar); } }),
        corporal ? h('span', { class: 'chip corporal', texto: 'Peso corporal' }) : null,
        col.descanso ? h('button', { type: 'button', class: 'chip', texto: '⏱ ' + reloj(col.descanso), 'aria-label': 'Empezar descanso',
          onclick: function () { Descanso.iniciar(col.descanso, sinPrefijo(nombre)); } }) : null,
        col.kg ? h('button', { type: 'button', class: 'chip', texto: '🏋️ ' + Discos.texto(col.kg, Discos.barraActual()),
          'aria-label': 'Discos por lado', onclick: function () { Discos.abrirCalculadora(col.kg); } }) : null,
      ]),
      h('p', { class: 'objetivo', texto: objetivo }),
      asistido ? h('p', { class: 'detalle', texto: 'Asistidas: cuanto más intensa la columna, menos ayuda' }) : null,
      totalAnterior ? h('p', { class: 'detalle', texto: 'Objetivo: ' + (totalAnterior + 1) + ' reps en total (la última vez ' + totalAnterior + ')' }) : null,
      maximo ? h('p', { class: 'detalle', texto: 'Tu máximo: ' + maximo.reps + ' reps' + (maximo.guardado ? '' : ' (de tu historial)') +
        (repsExcel && pct ? ' · ' + pct + ' % → ' + repsExcel + ' por serie' : amrap ? ' · hoy toca superarlo' : '') }) : null,
      rebajaReps ? h('p', { class: 'detalle', texto: 'Ajustado de ' + numSeries + 'x' + repsExcel + ': el ' +
        Grafica.fechaCorta(rebajaReps.fecha) + ' faltaron repeticiones' }) : null,
      detalle ? h('p', { class: 'detalle', texto: detalle }) : null,
      rebaja ? h('p', { class: 'detalle', texto: 'Rebajado de ' + formato(rebaja.kgExcel) + ' kg: el ' +
        Grafica.fechaCorta(rebaja.fecha) + ' faltaron repeticiones' }) : null,
      sugerencia && sugerencia.cambio ? h('p', { class: 'detalle', texto: (sugerencia.cambio === 'sube' ? 'Sube' : 'Baja') + ' de ' +
        formato(sugerencia.antes) + ' a ' + formato(sugerencia.kg) + ' kg: la última vez ' +
        (sugerencia.cambio === 'sube' ? 'salieron todas las repeticiones' : 'faltaron repeticiones') }) : null,
      mejorAnterior ? h('p', { class: 'detalle', texto: 'Objetivo: ' + (mejorAnterior + 1) + ' reps, una más que la última vez' }) : null,
      ultima ? h('p', { class: 'ultima-vez', texto: 'Última vez (' + Grafica.fechaCorta(ultima.fecha) + '): ' +
        ultima.series.map(function (s) { return tiempo ? Grupos.textoSerieTiempo(s) : corporal ? String(s[1]) : formato(s[0]) + '×' + s[1]; }).join(' · ') +
        (corporal ? ' reps' : '') }) : null,
    ]);

    var filas = h('div', { class: 'series' });
    var total = Math.max(col.series.length, hechas.length ? Math.max.apply(null, hechas.map(function (s) { return s.serie; })) : 0);
    for (var i = 0; i < total; i++) filas.appendChild(filaSerie(ej, nombre, col, i, hechas, ultima, siguienteEj, repintar));
    tarjeta.appendChild(filas);

    var acciones = [
      h('button', { type: 'button', class: 'discreto', texto: '+ Serie', onclick: function () {
        filas.appendChild(filaSerie(ej, nombre, col, filas.children.length, hechas, ultima, siguienteEj, repintar));
      } }),
    ];
    if (ej.tipo === 'extra') {
      acciones.push(h('button', { type: 'button', class: 'discreto', texto: '✕ Quitar', onclick: function () {
        if (hechas.length) {
          avisar('Ya hay series apuntadas: quítalas antes de quitar el ejercicio', true);
          return;
        }
        Grupos.quitarExtra(estado.entreno, estado.columna, ej.nombre);
        mostrar('hoy');
      } }));
    } else {
      acciones.push(h('button', { type: 'button', class: 'discreto', texto: '⇄ Cambiar', onclick: function () {
        if (hechas.length) {
          avisar('Ya hay series apuntadas: quítalas antes de cambiar el ejercicio', true);
          return;
        }
        elegirAlternativa(ej, nombre, repintar);
      } }));
    }
    tarjeta.appendChild(h('div', { class: 'ejercicio-acciones' }, acciones));

    // Los de peso corporal no tienen 1RM: ni se apunta en el AMRAP ni se reajusta.
    // Con el peso del cuerpo, el AMRAP deja el máximo de repeticiones para el ciclo siguiente.
    if (alMaximo && amrap && hechas.length) tarjeta.appendChild(bloqueMaximo(nombre, hechas, maximo, obligatorias));
    // Asistidas: en el AMRAP, pasar de 12 repeticiones baja la ayuda del ciclo siguiente.
    if (asistido && amrap && hechas.length) tarjeta.appendChild(bloqueAyuda(ej, hechas, col, obligatorias));
    // Con asistencia tampoco: más reps con más ayuda no es más fuerza.
    if (!corporal && !asistido && estado.columna === Calendario.COLUMNAS && ej.tipo === 'principal' && (!cambiado || rmPropio != null) && hechas.length) {
      tarjeta.appendChild(bloqueRM(ej, hechas, cambiado ? { nombre: nombre, rm: rmPropio } : null));
    }
    return tarjeta;
  }

  function filaSerie(ej, nombre, col, i, hechas, ultima, siguienteEj, repintar) {
    var plan = col.series[i] || { reps: '', opcional: true };
    var hecha = hechas.find(function (s) { return s.serie === i + 1; });
    var cambiado = nombre !== ej.nombre;
    // Si la última vez se hicieron menos series, se usa la última que hubo.
    var anterior = ultima && ultima.series.length ? ultima.series[Math.min(i, ultima.series.length - 1)] : null;
    if (Grupos.porTiempo(nombre)) return filaTiempo(ej, nombre, col, i, hecha, anterior, repintar);
    var corporal = Grupos.esCorporal(nombre);
    // Tras una serie corta, las siguientes proponen el peso con el que salen sus repeticiones (con el peso del
    // cuerpo no: hacer menos no cuesta más).
    var enElDia = !hecha && !corporal && ej.tipo !== 'extra' && (cambiado || !Grupos.esAsistido(nombre))
      ? Ajuste.kgEnElDia(hechas, col.series, i) : null;
    // Principal con el peso del cuerpo: cada serie al máximo; se propone lo de la última vez en esa serie.
    var alMaximo = corporal && ej.tipo === 'principal';
    var kgSugerido = hecha ? hecha.kg : enElDia != null ? enElDia
      : col.kg != null ? col.kg : anterior ? anterior[0] : '';
    var repsPlan = parseInt(plan.reps, 10);
    // Con el peso del cuerpo la progresión es una repetición más que la última vez en esa misma serie.
    var repsSugeridas = hecha ? hecha.reps
      : alMaximo ? (Ajuste.repsEnElDia(hechas, col.repsCorporal, i) || col.repsCorporal || '')
      : corporal ? (anterior ? anterior[1] + 1 : !isNaN(repsPlan) ? repsPlan : '')
        : !isNaN(repsPlan) ? repsPlan : anterior ? anterior[1] : '';

    var kg = corporal
      ? h('span', { class: 'peso-corporal', texto: 'tu peso' })
      : h('input', { inputmode: 'decimal', 'aria-label': 'Kg serie ' + (i + 1), value: formato(kgSugerido), placeholder: 'kg', disabled: !!hecha });
    var reps = h('input', { inputmode: 'numeric', 'aria-label': 'Reps serie ' + (i + 1), value: repsSugeridas, placeholder: alMaximo ? 'máx' : plan.reps || 'reps', disabled: !!hecha });
    var boton = h('button', { type: 'button', texto: hecha ? (hecha.record ? '🏆' : '✓') : 'Hecha' });

    boton.addEventListener('click', function () {
      if (hecha) {
        Almacen.quitar(hecha.id);
      } else {
        var r = numero(reps.value);
        if (!(r > 0)) {
          avisar('Pon las repeticiones', true);
          reps.focus();
          return;
        }
        var peso = corporal ? 0 : numero(kg.value) || 0;
        var record = null;
        try {
          record = comprobarRecord(nombre, peso, r);
        } catch (e) {
          fallo(e);
        }
        Almacen.apuntar({
          entreno: estado.entreno, columna: estado.columna, ejercicio: nombre, ejercicioId: ej.id,
          tipo: ej.tipo, serie: i + 1, kg: peso, reps: r, sustituye: cambiado ? ej.nombre : '', record: record,
        });
        // La serie ya está guardada: si falla el descanso (sonido, aviso del sistema…) se sigue igual.
        try {
          // En un jump set se descansa después del segundo ejercicio, no entre los dos.
          var primeroDeJump = ej.tipo === 'jump' && siguienteEj && siguienteEj.grupo === ej.grupo;
          if (!primeroDeJump && col.descanso) Descanso.iniciar(col.descanso, sinPrefijo(nombre));
          if (record) avisar(textoRecord(record, peso, r));
        } catch (e) {
          Descanso.parar();
          fallo(e);
        }
      }
      try {
        repintar();
      } catch (e) {
        fallo(e);
        mostrar('hoy');
      }
      var contador = document.getElementById('sesion-hoy');
      if (contador) contador.textContent = textoSesion();
    });

    return h('div', { class: 'serie' + (plan.opcional ? ' opcional' : '') + (hecha ? ' hecha' : '') + (hecha && hecha.record ? ' record' : '') }, [
      h('span', { class: 'numero', texto: String(i + 1) }), kg, reps, boton,
      hecha && !hecha.subida ? h('span', { class: 'subida', 'data-id': hecha.id, texto: 'Pendiente de subir al Excel' }) : null,
    ]);
  }

  // Serie por tiempo: minutos y segundos y, en el cardio, también km. Propone lo de la última vez.
  function filaTiempo(ej, nombre, col, i, hecha, anterior, repintar) {
    var plan = col.series[i] || { reps: '', opcional: true };
    var cardio = Grupos.esCardio(nombre);
    var previa = hecha ? [0, 0, hecha.seg, hecha.km] : anterior;
    var tiempo = h('input', { inputmode: 'text', 'aria-label': 'Tiempo serie ' + (i + 1), placeholder: cardio ? 'min' : 'seg',
      value: previa && previa[2] > 0 ? Grupos.textoTiempo(previa[2]) : '', disabled: !!hecha });
    var km = cardio
      ? h('input', { inputmode: 'decimal', 'aria-label': 'Km serie ' + (i + 1), placeholder: 'km',
        value: previa && previa[3] > 0 ? formato(previa[3]) : '', disabled: !!hecha })
      : h('span');
    var boton = h('button', { type: 'button', texto: hecha ? '✓' : 'Hecha' });

    boton.addEventListener('click', function () {
      if (hecha) {
        Almacen.quitar(hecha.id);
      } else {
        var seg = Grupos.leerTiempo(tiempo.value, cardio);
        var distancia = cardio ? numero(km.value) || 0 : 0;
        if (!(seg > 0) && !(distancia > 0)) {
          avisar(cardio ? 'Pon el tiempo o los km' : 'Pon el tiempo', true);
          tiempo.focus();
          return;
        }
        Almacen.apuntar({
          entreno: estado.entreno, columna: estado.columna, ejercicio: nombre, ejercicioId: ej.id,
          tipo: ej.tipo, serie: i + 1, kg: 0, reps: 0, seg: seg, km: distancia, sustituye: nombre !== ej.nombre ? ej.nombre : '',
        });
        try {
          if (!cardio && col.descanso) Descanso.iniciar(col.descanso, sinPrefijo(nombre));
        } catch (e) {
          Descanso.parar();
          fallo(e);
        }
      }
      try {
        repintar();
      } catch (e) {
        fallo(e);
        mostrar('hoy');
      }
      var contador = document.getElementById('sesion-hoy');
      if (contador) contador.textContent = textoSesion();
    });

    return h('div', { class: 'serie' + (plan.opcional ? ' opcional' : '') + (hecha ? ' hecha' : '') }, [
      h('span', { class: 'numero', texto: String(i + 1) }), tiempo, km, boton,
      hecha && !hecha.subida ? h('span', { class: 'subida', 'data-id': hecha.id, texto: 'Pendiente de subir al Excel' }) : null,
    ]);
  }

  // Compara la serie con todo lo hecho antes en ese ejercicio: historial del Excel y FitNotes y series del móvil.
  // En los de peso corporal se miran solo las repeticiones: los kg del histórico de FitNotes son el peso del cuerpo.
  function comprobarRecord(nombre, kg, reps) {
    var clave = Almacen.normalizar(nombre);
    var corporal = Grupos.esCorporal(nombre);
    var anteriores = [];
    (((Almacen.historial() || {}).ejercicios || {})[clave] || []).forEach(function (d) {
      d.s.forEach(function (s) { anteriores.push(s); });
    });
    Almacen.series().forEach(function (s) {
      if (Almacen.normalizar(s.ejercicio) === clave) anteriores.push([s.kg, s.reps]);
    });
    if (corporal) anteriores = anteriores.map(function (s) { return [0, s[1]]; });
    var c = Records.comparar(anteriores, corporal ? 0 : kg, reps);
    return c.rm || c.reps ? { rm: c.rm, reps: c.reps } : null;
  }

  function textoRecord(record, kg, reps) {
    var partes = [];
    if (record.rm) partes.push('1RM estimado ' + formato(record.rm) + ' kg');
    if (record.reps) partes.push(reps + ' reps con ' + (kg > 0 ? formato(kg) + ' kg' : 'tu peso'));
    return '🏆 ¡Récord! ' + partes.join(' · ');
  }

  function elegirAlternativa(ej, nombreActual, repintar) {
    var grupo = Grupos.grupoDe(ej.nombre);
    if (!grupo) {
      elegirGrupo(ej.nombre, function () { elegirAlternativa(ej, nombreActual, repintar); });
      return;
    }
    function usar(nombre) {
      Grupos.cambiar(estado.entreno, estado.columna, ej.id, nombre === ej.nombre ? null : nombre);
      cerrarSelector();
      mostrar('hoy');
    }
    var opciones = Grupos.alternativas(ej.nombre).map(function (n) {
      return h('button', { type: 'button', class: n === nombreActual ? 'actual' : '', texto: n, onclick: function () { usar(n); } });
    });
    var otro = h('input', { placeholder: 'Otro ejercicio', 'aria-label': 'Otro ejercicio' });
    abrirSelector('Cambiar ' + ej.nombreCorto, [
      h('p', { class: 'detalle', texto: 'Solo para hoy. Ejercicios de ' + grupo + ' (se editan en la pestaña "Grupos musculares" del Excel).' }),
      nombreActual !== ej.nombre ? h('button', { type: 'button', class: 'principal', texto: 'Volver a ' + ej.nombreCorto, onclick: function () { usar(ej.nombre); } }) : null,
      opciones.length ? h('div', { class: 'opciones' }, opciones) : h('p', { class: 'vacio', texto: 'No hay más ejercicios de ' + grupo + '.' }),
      h('div', { class: 'otro' }, [otro, h('button', { type: 'button', texto: 'Usar', onclick: function () {
        var n = otro.value.trim();
        if (!n) return;
        usar(n);
        // Queda guardado en el Excel para que la próxima vez salga en la lista.
        Grupos.guardarGrupo(n, grupo).catch(function () {});
      } })]),
    ]);
  }

  // Añadir a la sesión de hoy un ejercicio de "Grupos musculares" o uno nuevo (se crea con su grupo).
  function elegirExtra() {
    var buscar = h('input', { type: 'search', placeholder: 'Buscar o escribir uno nuevo', 'aria-label': 'Buscar ejercicio' });
    var lista = h('div');
    function usar(nombre) {
      Grupos.anadirExtra(estado.entreno, estado.columna, nombre);
      cerrarSelector();
      mostrar('hoy');
    }
    function rellenar() {
      lista.innerHTML = '';
      var texto = Grupos.normalizar(buscar.value);
      var tabla = (Almacen.plan() || {}).grupos || [];
      var nuevo = buscar.value.trim();
      if (nuevo && !tabla.some(function (f) { return Grupos.normalizar(f[0]) === texto; })) {
        // La lista es la de los dos: antes de crear uno, los que se llaman parecido (puede que el otro ya lo creara).
        var parecidos = Grupos.parecidos(nuevo);
        if (parecidos.length) {
          lista.appendChild(h('p', { class: 'detalle', texto: '¿Es alguno de estos?' }));
          lista.appendChild(h('div', { class: 'opciones' }, parecidos.map(function (n) {
            return h('button', { type: 'button', texto: n, onclick: function () { usar(n); } });
          })));
        }
        lista.appendChild(h('button', { type: 'button', class: 'principal', texto: 'Crear "' + nuevo + '"' + (parecidos.length ? ' igualmente' : ''), onclick: function () {
          elegirGrupo(nuevo, function () { usar(nuevo); });
        } }));
      }
      var porGrupo = {};
      tabla.forEach(function (f) {
        if (texto && Grupos.normalizar(f[0]).indexOf(texto) < 0) return;
        (porGrupo[f[1]] = porGrupo[f[1]] || []).push(f[0]);
      });
      Object.keys(porGrupo).sort(function (a, b) { return a.localeCompare(b, 'es'); }).forEach(function (g) {
        lista.appendChild(h('p', { class: 'detalle', texto: g }));
        lista.appendChild(h('div', { class: 'opciones' }, porGrupo[g].map(function (n) {
          return h('button', { type: 'button', texto: n, onclick: function () { usar(n); } });
        })));
      });
    }
    buscar.addEventListener('input', rellenar);
    rellenar();
    abrirSelector('Añadir ejercicio', [buscar, lista]);
  }

  function elegirGrupo(nombre, despues) {
    function guardar(grupo) {
      cerrarSelector();
      Grupos.guardarGrupo(nombre, grupo)
        .then(function () {
          avisar('Grupo guardado en el Excel');
          despues();
        })
        .catch(function (e) { avisar(navigator.onLine ? e.message : 'Necesitas conexión para guardar el grupo', true); });
    }
    var nuevo = h('input', { placeholder: 'Otro grupo', 'aria-label': 'Otro grupo' });
    abrirSelector('Grupo muscular de ' + sinPrefijo(nombre), [
      h('div', { class: 'opciones' }, Grupos.todos().map(function (g) {
        return h('button', { type: 'button', texto: g, onclick: function () { guardar(g); } });
      })),
      h('div', { class: 'otro' }, [nuevo, h('button', { type: 'button', texto: 'Guardar', onclick: function () {
        if (nuevo.value.trim()) guardar(nuevo.value.trim());
      } })]),
    ]);
  }

  // propio: { nombre, rm } si hoy se hace un ejercicio cuyo 1RM solo está en el Recopilatorio (sin casilla amarilla).
  function bloqueRM(ej, hechas, propio) {
    var mejorSerie = null;
    var mejor = hechas.reduce(function (m, s) {
      var rm = rmEstimado(s.kg, s.reps) || 0;
      if (rm > m) mejorSerie = [s.kg, s.reps];
      return Math.max(m, rm);
    }, 0);
    if (!mejor) {
      return h('div', { class: 'rm' }, [h('p', { texto: 'Con más de 12 repeticiones el 1RM estimado no es fiable.' })]);
    }
    var rmActual = propio ? propio.rm : ej.rm;
    // Si el 1RM guardado ya es este valor, ya está guardado.
    if (rmActual === mejor) {
      return h('div', { class: 'rm' }, [h('p', { texto: '✓ Nuevo 1RM guardado: ' + formato(mejor) + ' kg, en ' + (propio ? 'el Recopilatorio.' : 'el Excel y en el Recopilatorio.') })]);
    }
    var datos = propio
      ? { sinCasilla: true, entreno: estado.entreno, ejercicio: propio.nombre, valor: mejor, serie: mejorSerie }
      : { entreno: estado.entreno, celda: ej.celdaRM, ejercicio: ej.nombre, valor: mejor, serie: mejorSerie };
    var boton = h('button', { class: 'principal', texto: 'Guardar ' + formato(mejor) + ' kg en el Excel' });
    boton.addEventListener('click', function () {
      boton.disabled = true;
      Almacen.llamar('guardarRM', datos)
        .then(function () {
          avisar(propio ? '1RM guardado en el Recopilatorio' : '1RM guardado en el Excel y en el Recopilatorio');
          return Almacen.actualizarPlan();
        })
        .then(function () { mostrar('hoy'); })
        .catch(function (e) {
          boton.disabled = false;
          avisar(navigator.onLine ? e.message : 'Necesitas conexión para guardar el 1RM', true);
        });
    });
    return h('div', { class: 'rm' }, [
      h('p', { texto: 'Nuevo 1RM estimado: ' + formato(mejor) + ' kg (ahora: ' + (rmActual != null ? formato(rmActual) + ' kg' : '—') + ')' }),
      propio || ej.celdaRM ? boton : null,
    ]);
  }

  // Máximo de repeticiones sacado del historial: se apunta una vez en el Recopilatorio como base del ciclo en curso.
  var sembrando = {};
  function sembrarMaximo(nombre, reps) {
    var clave = Grupos.nombreReps(nombre);
    if (sembrando[clave] || !navigator.onLine) return;
    sembrando[clave] = true;
    Almacen.llamar('anadirRM', { ejercicio: clave, valor: reps })
      .then(function () { return Almacen.actualizarPlan(); })
      .catch(function () { /* se reintenta la próxima vez que se abra la app */ });
  }

  // AMRAP con el peso del cuerpo: la mejor serie es el máximo de repeticiones del ciclo siguiente. Si lo supera se
  // guarda solo al acabar las series; si no, se puede guardar a mano (por ejemplo tras una mala racha).
  var guardandoMaximo = {};
  function bloqueMaximo(nombre, hechas, maximo, obligatorias) {
    var mejor = Math.max.apply(null, hechas.map(function (s) { return Number(s.reps) || 0; }));
    var actual = maximo ? maximo.reps : null;
    if (maximo && maximo.guardado && actual === mejor) {
      return h('div', { class: 'rm' }, [h('p', { texto: '✓ Máximo para el próximo ciclo: ' + mejor + ' reps' })]);
    }
    function guardar() {
      var clave = Grupos.nombreReps(nombre);
      if (guardandoMaximo[clave + mejor]) return;
      guardandoMaximo[clave + mejor] = true;
      Almacen.llamar('guardarRM', { sinCasilla: true, entreno: estado.entreno, ejercicio: clave, valor: mejor, serie: [0, mejor] })
        .then(function () {
          avisar('Máximo guardado: ' + mejor + ' reps');
          return Almacen.actualizarPlan();
        })
        .then(function () { mostrar('hoy'); })
        .catch(function (e) {
          guardandoMaximo[clave + mejor] = false;
          avisar(navigator.onLine ? e.message : 'Sin conexión: el máximo se guardará al volver', true);
        });
    }
    var terminado = hechas.length >= obligatorias;
    if (terminado && mejor > (actual || 0) && navigator.onLine) {
      guardar();
      return h('div', { class: 'rm' }, [h('p', { texto: '¡Nuevo máximo! ' + mejor + ' reps (antes ' + (actual || '—') + '). Guardando…' })]);
    }
    return h('div', { class: 'rm' }, [
      h('p', { texto: 'Mejor serie: ' + mejor + ' reps (tu máximo: ' + (actual || '—') + ')' }),
      terminado ? h('button', { class: 'principal', texto: 'Usar ' + mejor + ' como máximo', onclick: guardar }) : null,
    ]);
  }

  // AMRAP de las asistidas (dominadas con máquina de asistencia): si la mejor serie pasa de REPS_BAJAR_AYUDA con la ayuda que tocaba
  // o con menos, el ciclo siguiente lleva 2,5 kg menos de ayuda en todas las columnas, siempre 2,5 aunque la hiciera
  // con menos ayuda. Con más ayuda de la que tocaba no cuenta. Una vez por día y ejercicio.
  // Como la ayuda de cada columna se redondea a 2,5, la base no baja 2,5 sino lo justo para que bajen todas
  // (Grupos.ayudaMenos: 41 → 37).
  var REPS_BAJAR_AYUDA = 12;
  var BAJADA_AYUDA = 2.5;
  function bloqueAyuda(ej, hechas, col, obligatorias) {
    var validas = hechas.filter(function (s) { return col.kg == null || s.kg <= col.kg; });
    var mejor = validas.length ? Math.max.apply(null, validas.map(function (s) { return Number(s.reps) || 0; })) : 0;
    var marca = 'ayuda|' + Almacen.hoyISO() + '|' + ej.id;
    var hecha = Almacen.marca(marca);
    if (hecha) {
      return h('div', { class: 'rm' }, [h('p', { texto: '✓ El próximo ciclo, ' + formato(BAJADA_AYUDA) + ' kg menos de ayuda en cada columna (base ' + formato(hecha) + ')' })]);
    }
    var terminado = hechas.length >= obligatorias;
    var nueva = Grupos.ayudaMenos(ej.rm, ej.columnas.map(function (c) { return c.detalle; }), BAJADA_AYUDA);
    if (mejor <= REPS_BAJAR_AYUDA || !terminado || !nueva) {
      return h('div', { class: 'rm' }, [h('p', { texto: mejor > REPS_BAJAR_AYUDA
        ? mejor + ' reps: al acabar las series, el próximo ciclo lleva ' + formato(BAJADA_AYUDA) + ' kg menos de ayuda.'
        : 'Mejor serie: ' + mejor + ' reps. Si pasas de ' + REPS_BAJAR_AYUDA + ' con esta ayuda o menos, el próximo ciclo lleva ' +
          formato(BAJADA_AYUDA) + ' kg menos de ayuda.' })]);
    }
    var mejorSerie = validas.filter(function (s) { return Number(s.reps) === mejor; })[0];
    if (navigator.onLine && !guardandoMaximo[marca]) {
      guardandoMaximo[marca] = true;
      Almacen.llamar('guardarRM', { entreno: estado.entreno, celda: ej.celdaRM, ejercicio: ej.nombre, valor: nueva, serie: [mejorSerie.kg, mejor] })
        .then(function () {
          Almacen.marcar(marca, nueva);
          avisar('Próximo ciclo: ' + formato(BAJADA_AYUDA) + ' kg menos de ayuda');
          return Almacen.actualizarPlan();
        })
        .then(function () { mostrar('hoy'); })
        .catch(function (e) {
          guardandoMaximo[marca] = false;
          avisar(navigator.onLine ? e.message : 'Sin conexión: la ayuda se bajará al volver', true);
        });
    }
    return h('div', { class: 'rm' }, [h('p', { texto: '¡' + mejor + ' reps! El próximo ciclo, ' + formato(BAJADA_AYUDA) +
      ' kg menos de ayuda en cada columna. Guardando…' })]);
  }

  // ---- Arranque ----

  function iniciar() {
    document.querySelectorAll('button[data-vista]').forEach(function (b) {
      b.addEventListener('click', function () {
        // El engranaje abre y cierra Ajustes.
        mostrar(b.dataset.vista === 'ajustes' && estado.vista === 'ajustes' ? vistaAnterior : b.dataset.vista);
      });
    });
    Almacen.alCambiar(pintarEstado);
    window.addEventListener('online', pintarEstado);
    window.addEventListener('offline', pintarEstado);
    pintarEstado();
    mostrar(Almacen.config() ? 'inicio' : 'ajustes');
    if (navigator.onLine) refrescarTodo().catch(function () {}).finally(pintarEstado);
  }

  window.addEventListener('DOMContentLoaded', iniciar);

  return {
    vistas: vistas, mostrar: mostrar, avisar: avisar, h: h, formato: formato, numero: numero, rmEstimado: rmEstimado,
    refrescarTodo: refrescarTodo, abrirSelector: abrirSelector, cerrarSelector: cerrarSelector,
  };
})();

// Descanso: cuenta atrás (tras cada serie o con los botones rápidos) o cronómetro que cuenta hacia arriba.
// Usa la hora real, así que sigue bien aunque el móvil congele la pestaña un rato.
var Descanso = (function () {
  var capa = document.getElementById('temporizador');
  var tiempo = document.getElementById('temporizador-tiempo');
  var nombre = document.getElementById('temporizador-ejercicio');
  var cerrar = document.getElementById('temporizador-cerrar');
  var modo = 'cuenta';
  var fin = 0;
  var inicio = 0;
  var intervalo = null;
  var avisado = false;
  var bloqueo = null;
  var audio = null;
  var silencio = null;
  var pitidos = [];

  function formatear(s) {
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function pintar() {
    if (modo === 'cronometro') {
      tiempo.textContent = formatear(Math.floor((Date.now() - inicio) / 1000));
      return;
    }
    var resta = Math.ceil((fin - Date.now()) / 1000);
    tiempo.textContent = formatear(Math.max(0, resta));
    if (resta <= 0 && !avisado) {
      avisado = true;
      acabar();
    }
  }

  function acabar() {
    capa.classList.add('terminado');
    if (navigator.vibrate) navigator.vibrate([600, 150, 200, 150, 600]);
    try {
      if (window.Notification && Notification.permission === 'granted') {
        new Notification('¡Descanso terminado!', { body: nombre.textContent, tag: 'gymapp-descanso' });
      }
    } catch (e) { /* sin aviso del sistema */ }
    // Se cierra solo cuando acaba el pitido: no hay que tocar nada para seguir entrenando.
    setTimeout(parar, 1800);
  }

  function contexto() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume().catch(function () {});
      return audio;
    } catch (e) {
      return null;
    }
  }

  // El aviso se programa al empezar el descanso, así suena a su hora aunque el móvil deje la app
  // en segundo plano. Para que el audio no se duerma, mientras cuenta hay un tono inaudible de fondo.
  // Es un pitido largo de 1000 Hz para que se oiga bien en el gimnasio.
  function programarPitidos(segundos) {
    var ctx = contexto();
    if (!ctx) return;
    cancelarPitidos();
    var t0 = ctx.currentTime + Math.max(0, segundos);

    // Un solo pitido largo y fuerte.
    var osc = ctx.createOscillator();
    var vol = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1000;
    vol.gain.setValueAtTime(0.0001, t0);
    vol.gain.exponentialRampToValueAtTime(0.9, t0 + 0.02);
    vol.gain.setValueAtTime(0.9, t0 + 1.1);
    vol.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.25);
    osc.connect(vol).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 1.3);
    pitidos.push(osc);

    var fondo = ctx.createOscillator();
    var volumen = ctx.createGain();
    fondo.frequency.value = 40;
    volumen.gain.value = 0.0001;
    fondo.connect(volumen).connect(ctx.destination);
    fondo.start();
    fondo.stop(ctx.currentTime + segundos + 3);
    pararSilencio();
    silencio = fondo;
  }

  function cancelarPitidos() {
    pitidos.forEach(function (osc) {
      try {
        osc.stop();
      } catch (e) { /* ya había sonado */ }
    });
    pitidos = [];
  }

  function pararSilencio() {
    try {
      if (silencio) silencio.stop();
    } catch (e) { /* ya estaba parado */ }
    silencio = null;
  }

  function pedirPermisoAviso() {
    try {
      if (window.Notification && Notification.permission === 'default') Notification.requestPermission();
    } catch (e) { /* el navegador no avisa */ }
  }

  function abrir(texto) {
    avisado = false;
    nombre.textContent = texto;
    capa.classList.remove('terminado');
    capa.hidden = false;
    clearInterval(intervalo);
    intervalo = setInterval(pintar, 250);
    pintar();
    // Mantiene la pantalla encendida mientras cuenta.
    if (navigator.wakeLock && !bloqueo) navigator.wakeLock.request('screen').then(function (b) { bloqueo = b; }).catch(function () {});
    // En la app de Android lo hace ella (su navegador interno no deja).
    if (window.AndroidPasos && window.AndroidPasos.pantallaEncendida) window.AndroidPasos.pantallaEncendida(true);
  }

  function iniciar(segundos, ejercicio) {
    modo = 'cuenta';
    fin = Date.now() + segundos * 1000;
    cerrar.textContent = 'Saltar';
    pedirPermisoAviso();
    programarPitidos(segundos);
    abrir(ejercicio ? 'Descanso · ' + ejercicio : 'Descanso');
  }

  function cronometro() {
    modo = 'cronometro';
    inicio = Date.now();
    cerrar.textContent = 'Cerrar';
    abrir('Cronómetro');
  }

  function parar() {
    clearInterval(intervalo);
    capa.hidden = true;
    // Si el descanso ya ha acabado, el pitido está sonando y se le deja terminar.
    if (!avisado) cancelarPitidos();
    pararSilencio();
    if (bloqueo) bloqueo.release().catch(function () {});
    if (window.AndroidPasos && window.AndroidPasos.pantallaEncendida) window.AndroidPasos.pantallaEncendida(false);
    bloqueo = null;
  }

  cerrar.addEventListener('click', parar);
  capa.querySelectorAll('[data-tiempo]').forEach(function (b) {
    b.addEventListener('click', function () {
      var ms = Number(b.dataset.tiempo) * 1000;
      if (modo === 'cronometro') {
        inicio = Math.min(Date.now(), inicio - ms);
      } else {
        fin = Math.max(Date.now(), fin + ms);
        if (fin > Date.now()) {
          avisado = false;
          capa.classList.remove('terminado');
          cerrar.textContent = 'Saltar';
        }
        programarPitidos((fin - Date.now()) / 1000);
      }
      pintar();
    });
  });
  capa.querySelectorAll('[data-cuenta]').forEach(function (b) {
    b.addEventListener('click', function () {
      var segundos = Number(b.dataset.cuenta);
      if (segundos) iniciar(segundos, '');
      else cronometro();
    });
  });
  document.addEventListener('visibilitychange', function () { if (!capa.hidden) pintar(); });

  return { iniciar: iniciar, cronometro: cronometro, parar: parar };
})();
