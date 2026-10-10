// Interfaz de Ares: arranque, pestaña "Hoy" (qué toca, grupos musculares, apuntar series, cambiar o añadir ejercicios,
// récords), descanso y 1RM. Las pestañas Historial y Ajustes están en vistas.js; Estado, en estado.js.
var App = (function () {
  var vista = document.getElementById('vista');
  var botonEstado = document.getElementById('estado');
  var botonFoto = document.getElementById('foto');
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

  // ---- Mantener el dedo en una serie: su 1RM, solo como dato (él, 2026-10-06) ----

  // El texto del dato. sinRM: por qué no tiene sentido (con el peso del cuerpo, asistidas, por tiempo).
  function textoRM(kg, reps, sinRM) {
    if (sinRM) return sinRM;
    kg = Number(kg);
    reps = Number(reps);
    if (!(kg > 0) || !(reps > 0)) return 'Pon kg y reps para ver el 1RM';
    if (reps > 12) return 'Con más de 12 reps el 1RM no es fiable';
    return '1RM ≈ ' + formato(Records.rm(kg, reps)) + ' kg';
  }

  // Tras medio segundo con el dedo encima (sin moverlo), fn(el). Los botones de dentro siguen funcionando igual.
  function alMantener(el, fn) {
    var reloj = null, x0 = 0, y0 = 0;
    function cancelar() { clearTimeout(reloj); reloj = null; }
    el.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('button')) return;
      x0 = ev.clientX;
      y0 = ev.clientY;
      cancelar();
      reloj = setTimeout(function () {
        reloj = null;
        try { if (navigator.vibrate) navigator.vibrate(15); } catch (e) { /* sin vibración */ }
        fn(el);
      }, 450);
    });
    el.addEventListener('pointermove', function (ev) {
      if (reloj && Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 12) cancelar();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { el.addEventListener(n, cancelar); });
    // Sin el menú de copiar/pegar del móvil al mantener.
    el.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  }

  // Un globito encima del elemento que se va solo.
  function mostrarDato(el, texto) {
    var viejo = document.querySelector('.dato-flotante');
    if (viejo) viejo.remove();
    var r = el.getBoundingClientRect();
    var d = h('div', { class: 'dato-flotante', role: 'status', texto: texto });
    document.body.appendChild(d);
    var izq = r.left + r.width / 2 - d.offsetWidth / 2;
    d.style.left = Math.max(12, Math.min(window.innerWidth - d.offsetWidth - 12, izq)) + 'px';
    d.style.top = (r.top > d.offsetHeight + 16 ? r.top - d.offsetHeight - 8 : r.bottom + 8) + 'px';
    setTimeout(function () { d.classList.add('fuera'); }, 2200);
    setTimeout(function () { d.remove(); }, 2600);
  }

  // Lista de series bien puesta (número, kg, reps), con el 1RM al mantener el dedo en cada una.
  // filas: [{ kg: texto, reps: texto, opcional, dato }]; dato es lo que sale al mantener (o nada).
  function listaSeries(filas) {
    return h('ol', { class: 'lista-series' }, filas.map(function (f, i) {
      var li = h('li', {}, [
        h('span', { class: 'lista-series-num', texto: (i + 1) + (f.opcional ? '*' : '') }),
        h('span', { class: 'lista-series-kg', texto: f.kg }),
        h('span', { class: 'lista-series-reps', texto: f.reps }),
      ]);
      if (f.dato) alMantener(li, function () { mostrarDato(li, f.dato); });
      return li;
    }));
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

  // Orden de las pestañas de abajo: es el que sigue el dedo al deslizar. Entreno no está: se entra desde Inicio
  // (con un giro de página) y, una vez empezado, solo se sale terminándolo o cerrando la app.
  // Estado tampoco: va dentro de Historial → Evolución del ciclo.
  var PESTANAS = ['inicio', 'historial', 'social'];

  // Ajustes se abre con el engranaje de arriba; al cerrarlo se vuelve a la pestaña de antes.
  var vistaAnterior = 'inicio';
  // La pantalla que se va: se saca del sitio y se deja encima, quieta donde estaba, para que salga por un lado
  // mientras la nueva entra por el otro. Se quita sola al acabar.
  var saliendo = null;
  function sacarPantalla(direccion) {
    if (saliendo) { saliendo.remove(); saliendo = null; }
    if (!vista.firstChild) return;
    var r = vista.getBoundingClientRect();
    var capa = h('div', { class: 'saliendo sale-' + direccion + ' esperando', 'aria-hidden': 'true' });
    capa.style.top = r.top + 'px';
    capa.style.left = r.left + 'px';
    capa.style.width = r.width + 'px';
    while (vista.firstChild) capa.appendChild(vista.firstChild);
    document.body.appendChild(capa);
    saliendo = capa;
    var quitar = function () {
      capa.remove();
      if (saliendo === capa) saliendo = null;
    };
    capa.addEventListener('animationend', quitar);
    setTimeout(quitar, 600); // por si el móvil no llega a lanzar la animación
  }

  // La dirección para ir de una pestaña a otra: a la izquierda si la nueva está más a la derecha.
  function direccionEntre(desde, hasta) {
    var a = PESTANAS.indexOf(desde), b = PESTANAS.indexOf(hasta);
    return a < 0 || b < 0 || a === b ? null : (b > a ? 'izquierda' : 'derecha');
  }

  // Repinta la pantalla que se está viendo sin subir arriba: al cambiar un mes, un ciclo o un periodo (él,
  // 2026-10-05: "se vuelve hacia arriba, eso no debe pasar").
  function repintar() {
    var y = window.scrollY;
    mostrar(estado.vista, null, y);
  }

  function mostrar(nombre, direccion, quedarseEn) {
    if (nombre !== 'ajustes' && nombre !== 'rutina') vistaAnterior = nombre;
    estado.vista = nombre;
    // En Entreno no hay pestañas abajo ni engranaje: la pantalla es solo del entreno.
    document.body.classList.toggle('modo-entreno', nombre === 'hoy');
    // Inicio cabe en la pantalla y no se desplaza (él, 2026-10-05).
    document.body.classList.toggle('vista-inicio', nombre === 'inicio');
    vista.classList.remove('desliza-izquierda', 'desliza-derecha', 'desliza-flip', 'desliza-flip-vuelta', 'esperando');
    if (direccion) {
      sacarPantalla(direccion);
      void vista.offsetWidth; // reinicia la animación aunque se cambie dos veces seguidas
      // Las dos quedan paradas (la de antes donde estaba, la nueva fuera) mientras se construye la pantalla:
      // así no se ve un hueco en blanco y la animación no se gasta en construirla. Arrancan juntas más abajo.
      vista.classList.add('desliza-' + direccion, 'esperando');
    }
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
    window.scrollTo(0, quedarseEn > 0 ? quedarseEn : 0);
    if (direccion) arrancarAnimacion();
  }

  // Las dos pantallas empiezan a moverse a la vez, ya con la nueva montada y en un fotograma limpio.
  function arrancarAnimacion() {
    var capa = saliendo;
    var soltar = function () {
      vista.classList.remove('esperando');
      if (capa) capa.classList.remove('esperando');
    };
    requestAnimationFrame(function () { requestAnimationFrame(soltar); });
    setTimeout(soltar, 120); // si el móvil no da fotogramas (app en segundo plano), que no se quede fuera
  }

  // Guarda el fallo en el móvil (se ve en Ajustes) y lo avisa.
  function fallo(e) {
    var texto = (e && e.message) || String(e);
    try {
      Almacen.anotarFallo(texto + (e && e.stack ? ' · ' + String(e.stack).split('\n').slice(1, 3).join(' ').trim() : ''));
    } catch (e2) { /* sin espacio en el móvil */ }
    avisar('Algo ha fallado: ' + texto, true);
  }
  // ---- Deslizar de lado para cambiar de pestaña ----

  // No se cambia de pestaña si el dedo empieza en algo que ya se desplaza de lado (el carrusel de gráficas).
  function seDesplazaDeLado(nodo) {
    for (var n = nodo; n && n !== document.body; n = n.parentNode) {
      if (n.nodeType !== 1) continue;
      // En las gráficas del ciclo y de barras el dedo va de columna en columna: no es cambiar de pestaña.
      if (n.classList.contains('grafica') && (n.classList.contains('ciclo') || n.classList.contains('barras'))) return true;
      if (n.scrollWidth - n.clientWidth > 8 && getComputedStyle(n).overflowX !== 'visible') return true;
    }
    return false;
  }

  function prepararDeslizar() {
    var x0 = 0, y0 = 0, valido = false;
    document.body.addEventListener('touchstart', function (e) {
      valido = false;
      if (e.touches.length !== 1) return;
      if (PESTANAS.indexOf(estado.vista) < 0) return;            // en Ajustes no
      if (!document.getElementById('temporizador').hidden) return; // ni con el descanso o el selector abiertos
      if (!selector.hidden) return;
      if (seDesplazaDeLado(e.target)) return;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      valido = true;
    }, { passive: true });
    document.body.addEventListener('touchcancel', function () { valido = false; }, { passive: true });
    document.body.addEventListener('touchend', function (e) {
      if (!valido || !e.changedTouches.length) return;
      valido = false;
      var dx = e.changedTouches[0].clientX - x0;
      var dy = e.changedTouches[0].clientY - y0;
      // Tiene que ser claramente de lado: al menos 60 px y bastante más que lo que se ha movido en vertical.
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.7) return;
      var i = PESTANAS.indexOf(estado.vista) + (dx < 0 ? 1 : -1);
      if (i < 0 || i >= PESTANAS.length) return;
      mostrar(PESTANAS[i], dx < 0 ? 'izquierda' : 'derecha');
    }, { passive: true });
  }

  window.addEventListener('error', function (e) { fallo(e.error || e.message); });
  window.addEventListener('unhandledrejection', function (e) { fallo(e.reason); });

  function pintarEstado() {
    var c = Almacen.config();
    // Arriba va la foto, no el nombre. Mientras no haya foto guardada no se ve nada (ni el nombre).
    var suFoto = c ? Almacen.foto(c.persona) : null;
    // Sin foto, el icono de perfil (y nada si la app no está configurada).
    botonFoto.hidden = !c;
    botonFoto.style.backgroundImage = suFoto ? 'url("' + suFoto + '")' : '';
    botonFoto.classList.toggle('sin-foto', !suFoto);
    if (!suFoto && !botonFoto.firstChild) botonFoto.appendChild(Iconos.perfil());
    if (suFoto) botonFoto.innerHTML = '';
    botonFoto.setAttribute('aria-label', c ? (c.nombre || c.persona) : 'Tu foto');
    botonFoto.title = c ? (c.nombre || c.persona) : 'Tu foto';
    // Series por subir y 1RM por copiar al Excel: tocarlo los sube ya.
    var pendientes = Almacen.pendientes() + Almacen.porCopiar();
    botonEstado.className = 'estado' + (pendientes ? ' pendiente' : '');
    // Traer del Excel (la primera vez, un minuto largo) se ve aquí mientras dura.
    var trae = Almacen.estadoTraer();
    botonEstado.textContent = !navigator.onLine ? 'Sin conexión' + (pendientes ? ' · ' + pendientes : '')
      : pendientes ? pendientes + ' por subir'
        : trae.trayendo ? 'Trayendo datos…' : 'Al día';
    botonEstado.classList.toggle('trayendo', !!trae.trayendo);
  }

  // Traer del Excel todo lo de antes para que la app lo guarde ella (Almacen.traerDelExcel): una sola vez. Desde
  // entonces manda el móvil y el Excel es la copia (él, 2026-09-30: "no tiene sentido llamarle cada x tiempo").
  // Si hiciera falta otra vez, "Traer ahora" en Ajustes → Tus datos.
  var TRAER_DEL_EXCEL = true;

  function refrescarTodo() {
    if (!Almacen.config()) return Promise.resolve();
    return Almacen.sincronizar()
      .then(function (r) {
        if (r.error) throw new Error(r.error);
        return Promise.all([
          Almacen.actualizarPlan(),
          // Los 1RM guardados en el móvil que aún no llegaron al Excel.
          Almacen.copiarPendientes().catch(function () {}),
          Almacen.actualizarHistorial(),
          // Con una API antigua esta acción aún no existe: no pasa nada.
          Almacen.actualizarProgreso().catch(function () {}),
          Almacen.actualizarEstados().catch(function () {}),
          Almacen.actualizarPasos().catch(function () {}),
          Almacen.actualizarFotos().catch(function () {}),
          Almacen.subirCaras().catch(function () {}),
          // Una sola vez: lo que había en el Excel pasa a la app, y desde entonces todo sale del móvil.
          TRAER_DEL_EXCEL && !Almacen.datosPropios()
            ? Almacen.traerDelExcel().then(function () { if (estado.vista === 'historial') mostrar('historial'); }).catch(function () {}) : null,
        ]);
      })
      .then(function () {
        // La foto del estado de fuerza del mes que acaba de terminar, si aún no está (pestaña Estado).
        Estado.fotoDelMes();
        // Si se han subido series, las hojas de seguimiento se rehacen en segundo plano, y después se vuelve a leer
        // la evolución del ciclo para que la gráfica salga ya con lo de hoy.
        if (Almacen.hojasPorRehacer()) {
          Almacen.llamar('sesiones', {}).catch(function () {});
          Almacen.llamar('vsRealizado', {}, 'tabla')
            .then(function () {
              Almacen.hojasRehechas();
              return Almacen.actualizarProgreso();
            })
            .then(function () { if (estado.vista === 'historial') mostrar('historial'); })
            .catch(function () {});
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

    // Recuperando un día pasado (desde el calendario): manda lo elegido, y las series van a ese día.
    var toca = estado.fecha ? { entreno: estado.entreno, columna: estado.columna, pasado: true }
      : Calendario.siguiente(Almacen.ultimaSesion(), Almacen.hoyISO(), Almacen.pendienteAyer());
    if (!estado.elegidoAMano && !estado.fecha) {
      estado.entreno = toca.entreno;
      estado.columna = toca.columna;
    }

    var lista = plan.entrenos[estado.entreno] || [];
    var extras = Grupos.extrasDe(estado.entreno, estado.columna).map(ejercicioExtra);
    cont.appendChild(cabeceraHoy(toca));
    if (!lista.length) cont.appendChild(h('p', { class: 'vacio', texto: 'No encuentro la pestaña "Entreno ' + estado.entreno + '" en el Excel.' }));
    lista.forEach(function (ej, i) { cont.appendChild(tarjetaEjercicio(ej, lista[i + 1])); });
    extras.forEach(function (ej) { cont.appendChild(tarjetaEjercicio(ej, null)); });
    cont.appendChild(h('button', { type: 'button', class: 'anadir-ejercicio con-icono', onclick: elegirExtra }, [Iconos.nuevoEjercicio(), 'Añadir ejercicio']));
    cont.appendChild(botonSalida(lista));
  };

  // ---- Entrar y salir de Entreno ----

  // El día con el que trabaja Entreno: hoy, o el día pasado que se está recuperando desde el calendario.
  function diaEntreno() {
    return estado.fecha || Almacen.hoyISO();
  }

  // dia (opcional, desde el calendario): { fecha, entreno, columna } de un día pasado que se recupera.
  function abrirEntreno(dia) {
    if (dia && dia.fecha && dia.fecha !== Almacen.hoyISO()) {
      estado.fecha = dia.fecha;
      estado.entreno = dia.entreno;
      estado.columna = dia.columna;
    } else {
      estado.fecha = null;
    }
    mostrar('hoy', 'flip');
  }

  function volverAInicio() {
    var desdeCalendario = !!estado.fecha;
    estado.fecha = null;
    estado.elegidoAMano = false;
    mostrar(desdeCalendario ? 'calendario' : 'inicio', 'flip-vuelta');
    // Tras recuperar un día pasado: se suben las series, se rehacen los días en el Excel y se vuelve a leer cómo
    // quedó cada uno, para que el calendario lo enseñe ya en verde.
    if (desdeCalendario) {
      Almacen.sincronizar()
        .then(function () { return Almacen.llamar('sesiones', {}); })
        .then(function () { return Almacen.actualizarFaltas(); })
        .then(function () { if (estado.vista === 'calendario' || estado.vista === 'inicio') mostrar(estado.vista); })
        .catch(function () {});
    }
  }

  // Sin ninguna serie de hoy (o con el entreno ya terminado) se puede volver a Inicio; empezado, solo terminándolo.
  // Recuperando un día pasado no hay "Terminar": se vuelve al calendario cuando se quiera.
  function botonSalida(lista) {
    if (estado.fecha) {
      return h('button', { type: 'button', class: 'principal grande salir-entreno', texto: '‹ Listo, volver al calendario', onclick: volverAInicio });
    }
    var hoy = Almacen.hoyISO();
    var empezado = Almacen.series().some(function (s) { return s.fecha === hoy; });
    if (!empezado || Almacen.terminado(hoy, estado.entreno)) {
      return h('button', { type: 'button', class: 'salir-entreno', texto: '‹ Volver a Inicio', onclick: volverAInicio });
    }
    var boton = h('button', { type: 'button', class: 'principal grande terminar-entreno', texto: '🏁 Terminar entreno', onclick: function () {
      // Se cuenta al pulsar, no al pintar la pantalla: al apuntar una serie solo se repinta su tarjeta, y tras un
      // "⇄ Cambiar" el botón se quedaba con el ejercicio cambiado aún sin hacer.
      var faltan = lista.filter(function (ej) { return !seriesDeHoy(ej).length; }).length;
      // Con ejercicios sin hacer, la primera pulsación avisa y la segunda termina.
      if (faltan && !boton.classList.contains('confirmar')) {
        boton.classList.add('confirmar');
        boton.textContent = 'Te ' + (faltan === 1 ? 'falta 1 ejercicio' : 'faltan ' + faltan + ' ejercicios') + ' · ¿Terminar igualmente?';
        return;
      }
      Almacen.terminar(estado.entreno, estado.columna);
      celebrar(hoy, estado.entreno, !faltan);
    } });
    return boton;
  }

  var FRASES = [
    'Hoy has hecho algo que tu yo de mañana te va a agradecer.',
    'La constancia gana a la motivación. Y hoy has sido constante.',
    'Un entreno más en el bolsillo. Así se construye.',
    'No hace falta que sea perfecto: hace falta que lo hagas. Y lo has hecho.',
    'Cada serie cuenta. Hoy han contado todas.',
    'Lo difícil era venir. Lo demás ya es historia.',
    'Más fuerte que ayer, más flojo que mañana.',
    'El músculo se hace descansando: ahora a comer y a dormir bien.',
    'Disciplina es hacerlo también los días que no apetece.',
    'Ni un paso atrás: el siguiente entreno ya te está esperando.',
    'Sudor de hoy, fuerza de mañana.',
    'Te lo has ganado. Disfruta del descanso.',
  ];

  // Las tres caras de "¿Cómo has terminado?". Al elegir se guarda (y se sube al Excel común) y se llama a alElegir.
  function caras(fecha, entreno, alElegir) {
    // Las caras son dibujos suyos (web/iconos/cara-*.png): se usan de plantilla y se pintan con el color del aspecto.
    // Lo que se guarda (y va a "Sensaciones") sigue siendo reventado / normal / feliz; lo que se lee, Cansado / Normal / Bien.
    var opciones = [['reventado', 'Cansado'], ['normal', 'Normal'], ['feliz', 'Bien']];
    var elegida = (Almacen.terminado(fecha, entreno) || {}).cara;
    return h('div', { class: 'caras', role: 'group', 'aria-label': '¿Cómo has terminado?' }, opciones.map(function (o) {
      return h('button', { type: 'button', class: 'cara' + (elegida === o[0] ? ' elegida' : ''), onclick: function () {
        Almacen.guardarCara(fecha, entreno, o[0]).catch(function () { /* sin conexión: se sube luego */ });
        if (alElegir) alElegir(o[0]);
      } }, [h('span', { class: 'cara-dibujo cara-' + o[0], 'aria-hidden': 'true' }), h('span', { texto: o[1] })]);
    }));
  }

  // Al terminar: confeti, felicidades, una frase y las tres caras. Hasta elegir una no se cierra.
  function celebrar(fecha, entreno, completo) {
    var capa = h('div', { class: 'celebracion', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Entreno terminado' });
    var lienzo = h('canvas', { class: 'confeti', 'aria-hidden': 'true' });
    capa.appendChild(lienzo);
    capa.appendChild(h('div', { class: 'celebracion-tarjeta' }, [
      // Sin todo hecho, su dibujo de la mancuerna con el ✓ (web/iconos/terminado.png, en color: no va con máscara).
      completo ? h('div', { class: 'celebracion-trofeo', texto: '🏆' })
        : h('img', { class: 'celebracion-dibujo', src: 'iconos/terminado.png', alt: '' }),
      h('h2', { texto: completo ? '¡Felicidades!' : '¡Entreno terminado!' }),
      h('p', { class: 'celebracion-frase', texto: FRASES[Math.floor(Math.random() * FRASES.length)] }),
      h('p', { class: 'detalle', texto: '¿Cómo has terminado?' }),
      caras(fecha, entreno, function () {
        capa.remove();
        volverAInicio();
      }),
    ]));
    document.body.appendChild(capa);
    confeti(lienzo);
  }

  // Explosión de confeti desde el centro que cae con gravedad y se apaga en unos 4 s.
  function confeti(lienzo) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var ctx = lienzo.getContext('2d');
    if (!ctx) return;
    var ancho = lienzo.width = window.innerWidth;
    var alto = lienzo.height = window.innerHeight;
    var colores = ['#fb6204', '#ffd23f', '#3f8f3c', '#2ec4f0', '#e84393', '#ffffff'];
    var trozos = [];
    for (var i = 0; i < 160; i++) {
      var angulo = Math.random() * Math.PI * 2;
      var fuerza = 6 + Math.random() * 10;
      trozos.push({
        x: ancho / 2, y: alto * 0.4,
        vx: Math.cos(angulo) * fuerza, vy: Math.sin(angulo) * fuerza - 6,
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
        giro: Math.random() * Math.PI, vgiro: (Math.random() - 0.5) * 0.4,
        color: colores[i % colores.length],
      });
    }
    var inicio = performance.now();
    (function paso(t) {
      if (!lienzo.isConnected) return;
      var pasado = t - inicio;
      ctx.clearRect(0, 0, ancho, alto);
      ctx.globalAlpha = Math.max(0, Math.min(1, (4200 - pasado) / 800));
      trozos.forEach(function (p) {
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.35;
        p.x += p.vx;
        p.y += p.vy;
        p.giro += p.vgiro;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.giro);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.giro * 2)));
        ctx.restore();
      });
      if (pasado < 4200) requestAnimationFrame(paso);
      else ctx.clearRect(0, 0, ancho, alto);
    })(inicio);
  }

  // Nombre del ejercicio que se hace hoy en ese hueco: el del Excel o el que se ha elegido en su lugar.
  function nombreHoy(ej) {
    return Grupos.cambioDe(estado.entreno, estado.columna, ej.id) || ej.nombre;
  }

  // Tiempo de la sesión de hoy: de la primera serie marcada a la última.
  function textoSesion() {
    var horas = Almacen.series().filter(function (s) { return s.fecha === diaEntreno(); })
      .map(function (s) { return String(s.hora); }).sort();
    if (!horas.length) return '';
    function segundos(hora) {
      var p = hora.split(':').map(Number);
      return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
    }
    var minutos = Math.round((segundos(horas[horas.length - 1]) - segundos(horas[0])) / 60);
    return 'Sesión de hoy: ' + (minutos < 1 ? 'acabas de empezar' : minutos + ' min') + ' · ' + horas.length + ' series';
  }

  // Arriba de Entreno, una línea y nada más (él, 2026-10-06: "lo quitaría y pondría los ejercicios"): qué entreno
  // es, ⏱ y "Cambiar", que abre en una hoja los selectores y el Excel. Los grupos musculares ya no salen aquí.
  function cabeceraHoy(toca) {
    var aviso = toca.pasado ? 'Recuperando el ' + new Date(estado.fecha + 'T12:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) +
        ' · las series se guardan en ese día'
      : estado.elegidoAMano ? 'Elegido a mano' : toca.recuperar ? 'Ayer no lo completaste · recupéralo hoy'
        : toca.descanso && !toca.enCurso ? 'Hoy descansas · próximo entreno' : '';
    if (estado.columna === Calendario.COLUMNAS) aviso = (aviso ? aviso + ' · ' : '') + 'AMRAP: con los principales te calculo el nuevo 1RM';

    return h('div', { class: 'entreno-cabecera' }, [
      h('div', { class: 'entreno-titulo' }, [
        h('h2', { texto: estado.entreno + ' · ' + Calendario.nombreColumna(estado.columna) }),
        h('button', { type: 'button', class: 'chip', texto: '⏱', 'aria-label': 'Cronómetro', onclick: function () { Descanso.cronometro(); } }),
        h('button', { type: 'button', class: 'chip', texto: 'Cambiar', 'aria-label': 'Cambiar de entreno o columna', onclick: elegirEntreno }),
      ]),
      aviso ? h('p', { class: 'detalle entreno-aviso', texto: aviso }) : null,
      h('p', { class: 'detalle', id: 'sesion-hoy', texto: textoSesion() }),
    ]);
  }

  // Hoja para hacer otro entreno u otra columna que la que toca.
  function elegirEntreno() {
    var selEntreno = h('select', { 'aria-label': 'Entreno', onchange: function (e) { cerrarSelector(); elegir(e.target.value, estado.columna); } },
      Calendario.ORDEN.map(function (e) { return h('option', { value: e, selected: e === estado.entreno, texto: 'Entreno ' + e }); }));
    var columnas = [];
    for (var c = 1; c <= Calendario.COLUMNAS; c++) {
      columnas.push(h('option', { value: c, selected: c === estado.columna, texto: Calendario.nombreColumna(c) }));
    }
    var selColumna = h('select', { 'aria-label': 'Columna', onchange: function (e) { cerrarSelector(); elegir(estado.entreno, Number(e.target.value)); } }, columnas);
    abrirSelector('Qué entreno', [
      h('div', { class: 'selectores' }, [selEntreno, selColumna]),
      estado.elegidoAMano ? h('button', { type: 'button', class: 'principal', texto: 'Volver a lo que toca', onclick: function () {
        cerrarSelector();
        estado.elegidoAMano = false;
        mostrar('hoy');
      } }) : null,
      Almacen.enlaceExcel(estado.entreno)
        ? h('a', { class: 'boton', href: Almacen.enlaceExcel(estado.entreno), target: '_blank', rel: 'noopener', texto: '📊 Abrir el Excel ' + estado.entreno })
        : null,
    ]);
  }

  function elegir(entreno, columna) {
    estado.entreno = entreno;
    estado.columna = columna;
    estado.elegidoAMano = true;
    mostrar('hoy');
  }

  function seriesDeHoy(ej) {
    var hoy = diaEntreno();
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
    // Las mancuernas van de 2 en 2: los kg del Excel (de 2,5 en 2,5) se proponen en par.
    if (col.kg > 0 && !asistido && Grupos.materialDe(nombre) === 'mancuernas') {
      col = Object.assign({}, col, { kg: Ajuste.redondear(col.kg, 'mancuernas') });
    }
    // Por tiempo (plancha, cinta…) se apuntan minutos y segundos en vez de kg y repeticiones.
    var tiempo = Grupos.porTiempo(nombre);
    // Secundarios: doble progresión con subida escalonada (Ajuste.progresion). Cada serie puede llevar su peso y sus
    // reps (18 × 9 en la 1ª y 16 en el resto): van en col.porSerie y en las reps de col.series.
    var sugerencia = !corporal && !tiempo && ej.tipo !== 'principal' && ej.tipo !== 'extra' ? Ajuste.secundario(nombre, col, estado.entreno) : null;
    if (sugerencia) {
      col = Object.assign({}, col, {
        kg: sugerencia.kg,
        porSerie: sugerencia.series.map(function (s) { return s.kg; }),
        series: col.series.map(function (s, i) {
          var p = sugerencia.series[i];
          return p && p.reps ? Object.assign({}, s, { reps: String(p.reps) }) : s;
        }),
      });
    }
    var grupo = Grupos.grupoDe(nombre);
    var barra = Grupos.barraDe(nombre);   // kg de la barra (20 la recta, 10 la Z) o null si no lleva discos
    // Variantes: si hoy se hace una, el asterisco cuelga del ejercicio del que es variante.
    var base = Grupos.varianteDe(nombre) || sinPrefijo(nombre);
    var conVariantes = Grupos.variantes(base).length > 0;
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
      : sugerencia && sugerencia.resumen ? col.objetivo + ' · ' + sugerencia.resumen
        : col.objetivo + (col.kg ? ' · ' + formato(col.kg) + ' kg' + (asistido ? ' de ayuda' : '') : corporal ? ' · con tu peso' : '');
    var tarjeta;

    function repintar() {
      tarjeta.replaceWith(tarjetaEjercicio(ej, siguienteEj));
    }

    // De dónde salen los kg de hoy y qué se hizo la última vez: fuera estorba, va dentro de la ℹ️.
    var notas = [
      asistido ? h('p', { class: 'detalle', texto: 'Asistidas: cuanto más intensa la columna, menos ayuda' }) : null,
      totalAnterior ? h('p', { class: 'detalle', texto: 'Objetivo: ' + (totalAnterior + 1) + ' reps en total (la última vez ' + totalAnterior + ')' }) : null,
      maximo ? h('p', { class: 'detalle', texto: 'Tu máximo: ' + maximo.reps + ' reps' + (maximo.guardado ? '' : ' (de tu historial)') +
        (repsExcel && pct ? ' · ' + pct + ' % → ' + repsExcel + ' por serie' : amrap ? ' · hoy toca superarlo' : '') }) : null,
      rebajaReps ? h('p', { class: 'detalle', texto: 'Ajustado de ' + numSeries + 'x' + repsExcel + ': el ' +
        Grafica.fechaCorta(rebajaReps.fecha) + ' faltaron repeticiones' }) : null,
      rebaja ? h('p', { class: 'detalle', texto: 'Rebajado de ' + formato(rebaja.kgExcel) + ' kg: el ' +
        Grafica.fechaCorta(rebaja.fecha) + ' faltaron repeticiones' }) : null,
      sugerencia && sugerencia.texto ? h('p', { class: 'detalle', texto: sugerencia.texto }) : null,
      sugerencia && sugerencia.aviso ? h('p', { class: 'detalle aviso-progresion', texto: '⚠ ' + sugerencia.aviso }) : null,
      mejorAnterior ? h('p', { class: 'detalle', texto: 'Objetivo: ' + (mejorAnterior + 1) + ' reps, una más que la última vez' }) : null,
    ].filter(function (x) { return x; });
    // La última vez, serie a serie como en el calendario (él, 2026-10-06: "que lo muestre bien, no así cutre").
    var ultimaVez = ultima ? listaSeries(ultima.series.map(function (s) {
      if (tiempo) return { kg: Grupos.textoSerieTiempo(s), reps: '' };
      if (corporal) return { kg: 'tu peso', reps: s[1] + ' reps' };
      return { kg: formato(s[0]) + ' kg', reps: s[1] + ' reps', dato: textoRM(s[0], s[1], asistido ? 'Asistidas: sin 1RM' : '') };
    })) : null;
    // Cómo se hace, con los músculos que trabaja (Tecnica): la imagen parada con un ▶.
    var tecnica = Tecnica.bloque(sinPrefijo(nombre));
    var info = notas.length || ultimaVez || tecnica ? h('div', { class: 'ejercicio-notas', hidden: true }, [
      tecnica,
      notas.length ? h('div', { class: 'notas-bloque' }, [h('p', { class: 'notas-titulo', texto: 'Por qué estos kg' })].concat(notas)) : null,
      ultimaVez ? h('div', { class: 'notas-bloque' }, [
        h('p', { class: 'notas-titulo', texto: 'Última vez · ' + Grafica.fechaCorta(ultima.fecha) }),
        ultimaVez,
      ]) : null,
    ]) : null;
    var botonInfo = info ? h('button', { type: 'button', class: 'chip', texto: 'ℹ️ Info', 'aria-label': 'Cómo salen los kg y la última vez',
      onclick: function () {
        info.hidden = !info.hidden;
        botonInfo.classList.toggle('actual', !info.hidden);
      } }) : null;

    tarjeta = h('section', { class: 'tarjeta ejercicio ' + ej.tipo + (hechas.length >= obligatorias ? ' hecho' : '') }, [
      h('div', { class: 'ejercicio-cabecera' }, [
        // El círculo con la imagen del ejercicio: al tocarlo se abre en grande y se mueve.
        Tecnica.miniatura(sinPrefijo(nombre)),
        h('h3', {}, [sinPrefijo(nombre), conVariantes
          // El asterisco avisa de que ese ejercicio tiene otras formas de hacerlo, cada una con su 1RM.
          ? h('button', { type: 'button', class: 'asterisco', texto: '*', 'aria-label': 'Variantes',
            onclick: function () { elegirVariante(ej, nombre, base); } })
          : null]),
        h('span', { class: 'tipo', texto: TIPOS[ej.tipo] }),
      ]),
      cambiado ? h('p', { class: 'cambiado', texto: 'Hoy en lugar de ' + ej.nombreCorto }) : null,
      h('div', { class: 'ejercicio-info' }, [
        grupo ? h('span', { class: 'chip grupo', texto: grupo })
          : h('button', { type: 'button', class: 'chip', texto: '+ Grupo muscular', onclick: function () { elegirGrupo(nombre, repintar); } }),
        corporal ? h('span', { class: 'chip corporal', texto: 'Peso corporal' }) : null,
        // Mientras descansa de este ejercicio, el chip cuenta hacia atrás; tocarlo lo abre en grande.
        col.descanso ? h('button', { type: 'button', class: 'chip descanso-chip', 'data-descanso': sinPrefijo(nombre),
          'data-texto': '⏱ ' + reloj(col.descanso), texto: Descanso.textoChip(sinPrefijo(nombre)) || '⏱ ' + reloj(col.descanso),
          'aria-label': 'Descanso', onclick: function () {
            if (Descanso.activo()) Descanso.agrandar(this);
            else Descanso.iniciar(col.descanso, sinPrefijo(nombre), this);
          } }) : null,
        // Los discos solo en lo que se carga con barra: en máquinas, poleas y mancuernas no dicen nada.
        // Solo el icono (él, 2026-10-06): al tocarlo, la calculadora dice los discos de cada lado.
        col.kg && barra ? h('button', { type: 'button', class: 'chip chip-icono', 'aria-label': 'Discos por lado', title: 'Discos por lado',
          onclick: function () { Discos.abrirCalculadora(col.kg, barra); } }, [Iconos.peso()]) : null,
        botonInfo,
      ]),
      h('p', { class: 'objetivo', texto: objetivo }),
      detalle ? h('p', { class: 'detalle', texto: detalle }) : null,
      info,
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
      ? Ajuste.kgEnElDia(hechas, col.series, i, Grupos.materialDe(nombre)) : null;
    // Principal con el peso del cuerpo: cada serie al máximo; se propone lo de la última vez en esa serie.
    var alMaximo = corporal && ej.tipo === 'principal';
    var kgPropuesto = col.porSerie && col.porSerie[i] != null ? col.porSerie[i] : col.kg;
    var kgSugerido = hecha ? hecha.kg : enElDia != null ? enElDia
      : kgPropuesto != null ? kgPropuesto : anterior ? anterior[0] : '';
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
          fecha: diaEntreno(), entreno: estado.entreno, columna: estado.columna, ejercicio: nombre, ejercicioId: ej.id,
          tipo: ej.tipo, serie: i + 1, kg: peso, reps: r, sustituye: cambiado ? ej.nombre : '', record: record,
          // Lo que tocaba en esta serie: con eso la próxima vez se sabe si salió y en qué paso de la subida se está.
          kgObjetivo: typeof kgSugerido === 'number' ? kgSugerido : null, repsObjetivo: isNaN(repsPlan) ? null : repsPlan,
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

    var fila = h('div', { class: 'serie' + (plan.opcional ? ' opcional' : '') + (hecha ? ' hecha' : '') + (hecha && hecha.record ? ' record' : '') }, [
      h('span', { class: 'numero', texto: String(i + 1) }), kg, reps, boton,
      hecha && !hecha.subida ? h('span', { class: 'subida', 'data-id': hecha.id, texto: 'Pendiente de subir al Excel' }) : null,
    ]);
    // Manteniendo el dedo en la serie: el 1RM de esos kg y reps (lo apuntado o lo que haya escrito).
    alMantener(fila, function () {
      var sinRM = corporal ? 'Con tu peso no hay 1RM' : Grupos.esAsistido(nombre) && !cambiado ? 'Asistidas: sin 1RM' : '';
      mostrarDato(fila, sinRM || textoRM(hecha ? hecha.kg : numero(kg.value), hecha ? hecha.reps : numero(reps.value)));
    });
    return fila;
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
          fecha: diaEntreno(), entreno: estado.entreno, columna: estado.columna, ejercicio: nombre, ejercicioId: ej.id,
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
    var base = Grupos.varianteDe(ej.nombreCorto) || ej.nombreCorto;
    abrirSelector('Cambiar ' + ej.nombreCorto, [
      h('p', { class: 'detalle', texto: 'Solo para hoy. Ejercicios de ' + grupo + ' (se editan en la pestaña "Ejercicios" del Excel).' }),
      // Desde aquí se llega a las variantes del ejercicio, y a crear la primera.
      h('button', { type: 'button', texto: '✳ Variantes de ' + base, onclick: function () { elegirVariante(ej, nombreActual, base); } }),
      nombreActual !== ej.nombre ? h('button', { type: 'button', class: 'principal', texto: 'Volver a ' + ej.nombreCorto, onclick: function () { usar(ej.nombre); } }) : null,
      opciones.length ? h('div', { class: 'opciones' }, opciones) : h('p', { class: 'vacio', texto: 'No hay más ejercicios de ' + grupo + '.' }),
      // Otro de cualquier grupo: la biblioteca entera, con el grupo de este primero (él, 2026-10-01: elegir, no escribir).
      h('button', { type: 'button', class: 'biblioteca-abrir', texto: 'Otro ejercicio de la biblioteca ›', onclick: function () {
        biblioteca('Cambiar ' + ej.nombreCorto, usar, grupo);
      } }),
    ]);
  }

  // Variantes de un ejercicio (banca con mancuernas, dominadas lastradas…): otra forma de hacerlo, con su propio
  // 1RM, así que los kg salen de ese 1RM y no del principal. Como "⇄ Cambiar", vale solo para hoy.
  function elegirVariante(ej, nombreActual, base) {
    function usar(nombre) {
      Grupos.cambiar(estado.entreno, estado.columna, ej.id, nombre === ej.nombre ? null : nombre);
      cerrarSelector();
      mostrar('hoy');
    }
    var lista = Grupos.variantes(base);
    abrirSelector('Variantes de ' + base, [
      h('p', { class: 'detalle', texto: 'Solo para hoy. Cada variante lleva su propio 1RM.' }),
      Grupos.normalizar(nombreActual) !== Grupos.normalizar(ej.nombreCorto)
        ? h('button', { type: 'button', class: 'principal', texto: 'Volver a ' + ej.nombreCorto, onclick: function () { usar(ej.nombre); } }) : null,
      lista.length ? h('div', { class: 'opciones' }, lista.map(function (n) {
        return h('button', { type: 'button', class: Grupos.normalizar(n) === Grupos.normalizar(nombreActual) ? 'actual' : '',
          texto: n + (Grupos.rmDe(n) ? ' · 1RM ' + formato(Grupos.rmDe(n)) : ''), onclick: function () { usar(n); } });
      })) : h('p', { class: 'vacio', texto: 'Todavía no hay variantes de ' + base + '.' }),
      h('button', { type: 'button', texto: '+ Crear variante', onclick: function () { crearVariante(base); } }),
    ]);
  }

  // Crear una variante: cómo la haces, con qué y su 1RM (el del principal no vale: se levanta otro peso).
  // El nombre se monta solo, "Curl de Bíceps (Mancuerna)", para que en el historial cuelgue del principal.
  function crearVariante(base) {
    var nombre = h('input', { placeholder: 'Mancuerna, Polea, Smith…', 'aria-label': 'Cómo se hace la variante' });
    var comoSeLlama = h('p', { class: 'detalle', texto: 'Se llamará ' + base + ' (…)' });
    function nombreCompleto() {
      var etiqueta = nombre.value.trim().replace(/^\(|\)$/g, '').trim();
      if (!etiqueta) return '';
      return Grupos.normalizar(etiqueta).indexOf(Grupos.normalizar(base)) === 0 ? etiqueta : base + ' (' + etiqueta + ')';
    }
    nombre.oninput = function () { comoSeLlama.textContent = 'Se llamará ' + (nombreCompleto() || base + ' (…)'); };
    var rm = h('input', { inputmode: 'decimal', placeholder: 'kg', 'aria-label': '1RM de la variante' });
    var material = null;
    var botones = Grupos.MATERIALES.map(function (m) {
      return h('button', { type: 'button', texto: m[1], onclick: function (ev) {
        material = m[0];
        botones.forEach(function (b) { b.classList.toggle('actual', b === ev.currentTarget); });
      } });
    });
    abrirSelector('Variante de ' + base, [
      nombre,
      comoSeLlama,
      h('p', { class: 'detalle', texto: '¿Con qué se hace?' }),
      h('div', { class: 'opciones' }, botones),
      h('label', { class: 'campo' }, [h('span', { texto: '1RM de la variante (kg)' }), rm]),
      h('p', { class: 'detalle', texto: 'Con el peso del cuerpo, déjalo vacío.' }),
      h('button', { type: 'button', class: 'principal', texto: 'Crear', onclick: function () {
        var n = nombreCompleto();
        var kg = numero(rm.value);
        if (!n || !material) {
          avisar('Pon cómo la haces y con qué', true);
          return;
        }
        if (material !== 'corporal' && !(kg > 0)) {
          avisar('Pon el 1RM de la variante', true);
          return;
        }
        cerrarSelector();
        Grupos.guardarGrupo(n, Grupos.grupoDe(base) || 'Otros', material, base)
          // Si ya tenía 1RM en el Recopilatorio (la variante existía), se queda el que hay.
          .then(function () {
            if (!(kg > 0)) return null;
            // En el móvil, si no tenía ya uno; al Excel de copia.
            if (!Grupos.rmDe(n)) Almacen.guardarRMPropio(n, kg, null);
            return Almacen.copiarAlExcel('anadirRM', { ejercicio: n, valor: kg }).catch(function () {});
          })
          .then(function () { return Almacen.actualizarPlan(); })
          .then(function () {
            avisar('Variante creada');
            mostrar('hoy');
          })
          .catch(function (e) { avisar(navigator.onLine ? e.message : 'Necesitas conexión para crear la variante', true); });
      } }),
    ]);
  }

  // Añadir a la sesión de hoy un ejercicio de la lista común ("Ejercicios") o uno nuevo (se crea con su grupo).
  function elegirExtra() {
    biblioteca('Añadir ejercicio', function (nombre) {
      Grupos.anadirExtra(estado.entreno, estado.columna, nombre);
      cerrarSelector();
      mostrar('hoy');
    });
  }

  // La biblioteca: todos los ejercicios de la lista común por grupo muscular, con buscador; si no está, se crea.
  // primero: grupo que sale arriba del todo (al cambiar un ejercicio, el suyo).
  function biblioteca(titulo, usar, primero) {
    var buscar = h('input', { type: 'search', placeholder: 'Buscar o escribir uno nuevo', 'aria-label': 'Buscar ejercicio' });
    var lista = h('div');
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
      Object.keys(porGrupo).sort(function (a, b) {
        if (a === primero) return -1;
        if (b === primero) return 1;
        return a.localeCompare(b, 'es');
      }).forEach(function (g) {
        lista.appendChild(h('p', { class: 'biblioteca-grupo', texto: g }));
        lista.appendChild(h('div', { class: 'opciones' }, porGrupo[g].sort(function (a, b) { return a.localeCompare(b, 'es'); }).map(function (n) {
          return h('button', { type: 'button', texto: n, onclick: function () { usar(n); } });
        })));
      });
      if (!lista.firstChild) lista.appendChild(h('p', { class: 'vacio', texto: 'No hay ninguno con ese nombre.' }));
    }
    buscar.addEventListener('input', rellenar);
    rellenar();
    abrirSelector(titulo, [buscar, lista]);
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
      return h('div', { class: 'rm' }, [h('p', { texto: '✓ Nuevo 1RM guardado: ' + formato(mejor) + ' kg. El próximo ciclo sale con él.' })]);
    }
    var datos = propio
      ? { sinCasilla: true, entreno: estado.entreno, ejercicio: propio.nombre, valor: mejor, serie: mejorSerie }
      : { entreno: estado.entreno, celda: ej.celdaRM, ejercicio: ej.nombre, valor: mejor, serie: mejorSerie };
    // Se guarda en el móvil (manda, también sin conexión) y va al Excel de copia (2026-10-10).
    var boton = h('button', { class: 'principal', texto: 'Guardar ' + formato(mejor) + ' kg como 1RM' });
    boton.addEventListener('click', function () {
      Almacen.guardarRMPropio(propio ? propio.nombre : ej.nombre, mejor, propio ? null : ej.id);
      if (propio || ej.celdaRM) Almacen.copiarAlExcel('guardarRM', datos).catch(function () {});
      avisar('1RM guardado: ' + formato(mejor) + ' kg');
      mostrar('hoy');
    });
    return h('div', { class: 'rm' }, [
      h('p', { texto: 'Nuevo 1RM estimado: ' + formato(mejor) + ' kg (ahora: ' + (rmActual != null ? formato(rmActual) + ' kg' : '—') + ')' }),
      boton,
    ]);
  }

  // Máximo de repeticiones sacado del historial: se apunta una vez en el Recopilatorio como base del ciclo en curso.
  var sembrando = {};
  function sembrarMaximo(nombre, reps) {
    var clave = Grupos.nombreReps(nombre);
    if (sembrando[clave]) return;
    sembrando[clave] = true;
    Almacen.guardarRMPropio(clave, reps, null);
    Almacen.copiarAlExcel('anadirRM', { ejercicio: clave, valor: reps }).catch(function () { /* se reintenta luego */ });
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
      Almacen.guardarRMPropio(clave, mejor, null);
      Almacen.copiarAlExcel('guardarRM', { sinCasilla: true, entreno: estado.entreno, ejercicio: clave, valor: mejor, serie: [0, mejor] })
        .catch(function () { /* se reintenta luego */ });
      avisar('Máximo guardado: ' + mejor + ' reps');
      setTimeout(function () { mostrar('hoy'); }, 0);
    }
    var terminado = hechas.length >= obligatorias;
    if (terminado && mejor > (actual || 0)) {
      guardar();
      return h('div', { class: 'rm' }, [h('p', { texto: '¡Nuevo máximo! ' + mejor + ' reps (antes ' + (actual || '—') + ')' })]);
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
    if (!guardandoMaximo[marca]) {
      guardandoMaximo[marca] = true;
      // En el móvil (manda) y al Excel de copia.
      Almacen.marcar(marca, nueva);
      Almacen.guardarRMPropio(ej.nombre, nueva, ej.id);
      Almacen.copiarAlExcel('guardarRM', { entreno: estado.entreno, celda: ej.celdaRM, ejercicio: ej.nombre, valor: nueva, serie: [mejorSerie.kg, mejor] })
        .catch(function () { /* se reintenta luego */ });
      avisar('Próximo ciclo: ' + formato(BAJADA_AYUDA) + ' kg menos de ayuda');
      setTimeout(function () { mostrar('hoy'); }, 0);
    }
    return h('div', { class: 'rm' }, [h('p', { texto: '¡' + mejor + ' reps! El próximo ciclo, ' + formato(BAJADA_AYUDA) +
      ' kg menos de ayuda en cada columna. Guardando…' })]);
  }

  // ---- Arranque ----

  // ---- La app de Android se actualiza sola (2026-10-10) ----
  // Solo dentro de la app (la de Android nueva trae versionApp y actualizar): apk.json dice la última versión
  // publicada; si es más nueva que la instalada, un aviso con "Actualizar" la descarga y abre el instalador.
  // "Luego" lo esconde hasta que se vuelva a abrir la app.
  var avisoApkVisto = false;
  function comprobarApk() {
    var nativo = window.AndroidPasos;
    if (avisoApkVisto || !nativo || typeof nativo.versionApp !== 'function' || typeof nativo.actualizar !== 'function') return;
    fetch('apk.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !(Number(d.versionCode) > Number(nativo.versionApp())) || document.getElementById('aviso-apk')) return;
        avisoApkVisto = true;
        mostrarAvisoApk(d);
      })
      .catch(function () { /* sin conexión: otra vez será */ });
  }

  function mostrarAvisoApk(d) {
    var texto = h('span', { class: 'aviso-apk-texto', texto: 'Hay una versión nueva de la app' + (d.versionName ? ' (' + d.versionName + ')' : '') });
    var actualizar = h('button', { type: 'button', class: 'principal', texto: 'Actualizar' });
    var luego = h('button', { type: 'button', class: 'discreto', texto: 'Luego', onclick: function () { caja.remove(); } });
    var caja = h('div', { id: 'aviso-apk', class: 'aviso-apk', role: 'status' }, [texto, h('div', { class: 'aviso-apk-botones' }, [luego, actualizar])]);
    actualizar.addEventListener('click', function () {
      actualizar.disabled = true;
      texto.textContent = 'Descargando la versión nueva…';
      Pasos.actualizarApp(new URL(d.url || 'Ares.apk', location.href).href).then(function (r) {
        if (r && r.estado === 'permiso') texto.textContent = 'Permite instalar apps desde Ares y vuelve: se sigue sola';
        else if (r && r.estado === 'sinPermiso') { texto.textContent = 'Sin ese permiso no se puede actualizar'; actualizar.disabled = false; }
        else texto.textContent = 'Pulsa "Instalar" cuando lo pida el móvil';
      }).catch(function (e) {
        actualizar.disabled = false;
        texto.textContent = 'No se pudo: ' + ((e && e.message) || e);
      });
    });
    document.body.appendChild(caja);
  }

  function iniciar() {
    comprobarApk();
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') comprobarApk(); });
    document.querySelectorAll('button[data-vista]').forEach(function (b) {
      b.addEventListener('click', function () {
        // El engranaje abre y cierra Ajustes.
        var destino = b.dataset.vista === 'ajustes' && estado.vista === 'ajustes' ? vistaAnterior : b.dataset.vista;
        mostrar(destino, destino === 'hoy' ? 'flip' : direccionEntre(estado.vista, destino));
      });
    });
    prepararDeslizar();
    Almacen.alCambiar(pintarEstado);
    window.addEventListener('online', pintarEstado);
    window.addEventListener('offline', pintarEstado);
    pintarEstado();
    mostrar(Almacen.config() ? 'inicio' : 'ajustes');
    if (navigator.onLine) refrescarTodo().catch(function () {}).finally(pintarEstado);
  }

  window.addEventListener('DOMContentLoaded', iniciar);

  return {
    vistas: vistas, mostrar: mostrar, repintar: repintar, avisar: avisar, h: h, formato: formato, numero: numero, reloj: reloj, rmEstimado: rmEstimado,
    textoRM: textoRM, alMantener: alMantener, mostrarDato: mostrarDato, listaSeries: listaSeries,
    refrescarTodo: refrescarTodo, abrirSelector: abrirSelector, cerrarSelector: cerrarSelector,
    crearVariante: crearVariante, abrirEntreno: abrirEntreno, caras: caras, diaEntreno: diaEntreno,
  };
})();

// Descanso: cuenta atrás (tras cada serie o con los botones rápidos) o cronómetro que cuenta hacia arriba.
// Usa la hora real, así que sigue bien aunque el móvil congele la pestaña un rato.
var Descanso = (function () {
  var capa = document.getElementById('temporizador');
  var tiempo = document.getElementById('temporizador-tiempo');
  var nombre = document.getElementById('temporizador-ejercicio');
  var cerrar = document.getElementById('temporizador-cerrar');
  var mini = document.getElementById('descanso-mini');
  var activo = false; // hay un descanso o cronómetro en marcha
  var grande = false; // se ve en grande (si no, en el ⏱ de la tarjeta o en la pastilla de abajo)
  var ejercicio = ''; // de qué ejercicio es el descanso, para contar en su ⏱
  var fundido = null;
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
    var resta = 0;
    if (modo === 'cronometro') tiempo.textContent = formatear(Math.floor((Date.now() - inicio) / 1000));
    else {
      resta = Math.ceil((fin - Date.now()) / 1000);
      tiempo.textContent = formatear(Math.max(0, resta));
    }
    pintarPequeno();
    if (modo === 'cuenta' && resta <= 0 && !avisado) {
      avisado = true;
      acabar();
    }
  }

  // En pequeño: cuenta en el ⏱ de la tarjeta del ejercicio. Si esa tarjeta no se ve (se ha bajado a otro
  // ejercicio, está en Inicio o es el cronómetro), sale una pastilla flotante abajo con lo mismo.
  function chipsVisibles() {
    var visibles = [];
    document.querySelectorAll('[data-descanso]').forEach(function (b) {
      var r = b.getBoundingClientRect();
      if (r.width && r.bottom > 0 && r.top < window.innerHeight) visibles.push(b);
    });
    return visibles;
  }

  function pintarPequeno() {
    var texto = '⏱ ' + tiempo.textContent;
    var terminado = capa.classList.contains('terminado');
    var enChip = false;
    document.querySelectorAll('[data-descanso]').forEach(function (b) {
      var suyo = activo && modo === 'cuenta' && b.dataset.descanso === ejercicio;
      b.textContent = suyo ? texto : b.dataset.texto;
      b.classList.toggle('contando', suyo);
      b.classList.toggle('terminado', suyo && terminado);
    });
    if (activo && modo === 'cuenta') {
      chipsVisibles().forEach(function (b) { if (b.dataset.descanso === ejercicio) enChip = true; });
    }
    mini.textContent = texto;
    mini.classList.toggle('terminado', terminado);
    mini.hidden = !activo || grande || enChip;
  }

  function textoChip(nombreEj) {
    return activo && modo === 'cuenta' && nombreEj === ejercicio ? '⏱ ' + tiempo.textContent : '';
  }

  // Lo que se ve en pequeño y de dónde sale la animación al agrandar (y adónde vuelve al encoger).
  function origenPequeno() {
    if (!mini.hidden) return mini;
    var chip = null;
    chipsVisibles().forEach(function (b) { if (b.dataset.descanso === ejercicio) chip = b; });
    return chip;
  }

  function desdeHasta(el) {
    var caja = capa.querySelector('.temporizador-caja');
    if (!el) return null;
    var a = el.getBoundingClientRect();
    var b = caja.getBoundingClientRect();
    if (!a.width || !b.width) return null;
    return 'translate(' + (a.left + a.width / 2 - (b.left + b.width / 2)) + 'px,' + (a.top + a.height / 2 - (b.top + b.height / 2)) + 'px) scale(' +
      Math.max(0.08, a.width / b.width) + ')';
  }

  function sinMovimiento() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function agrandar(origen) {
    if (!activo) return;
    var el = origen || origenPequeno();
    grande = true;
    var caja = capa.querySelector('.temporizador-caja');
    if (caja.getAnimations) quitarFundido();
    capa.hidden = false;
    var desde = desdeHasta(el);
    pintarPequeno();
    if (!caja.animate || sinMovimiento()) return;
    capa.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    if (desde) caja.animate([{ transform: desde, opacity: 0.3 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  function encoger() {
    if (!grande) return;
    grande = false;
    var caja = capa.querySelector('.temporizador-caja');
    var cerrarCapa = function () {
      if (grande) return; // se volvió a abrir mientras encogía
      capa.hidden = true;
      pintarPequeno();
    };
    if (!caja.animate || sinMovimiento()) return cerrarCapa();
    // A qué se encoge: el ⏱ de la tarjeta si se ve; si no, la pastilla de abajo.
    var hasta = null;
    if (modo === 'cuenta') chipsVisibles().forEach(function (b) { if (b.dataset.descanso === ejercicio) hasta = b; });
    if (!hasta) {
      mini.hidden = false;
      mini.style.visibility = 'hidden';
      hasta = mini;
    }
    var destino = desdeHasta(hasta);
    mini.style.visibility = '';
    if (hasta === mini) mini.hidden = true;
    fundido = capa.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'ease-in', fill: 'forwards' });
    var anim = caja.animate([{ transform: 'none', opacity: 1 }, { transform: destino || 'scale(.6)', opacity: 0.3 }],
      { duration: 260, easing: 'cubic-bezier(.4,0,.8,.4)', fill: 'forwards' });
    var hecho = false;
    var terminar = function () {
      if (hecho) return;
      hecho = true;
      cerrarCapa();
      if (!grande) quitarFundido(anim);
    };
    anim.onfinish = terminar;
    setTimeout(terminar, 500);
  }

  function quitarFundido(anim) {
    if (fundido) fundido.cancel();
    fundido = null;
    if (anim) anim.cancel();
    else capa.querySelector('.temporizador-caja').getAnimations().forEach(function (a) { a.cancel(); });
  }

  function acabar() {
    capa.classList.add('terminado');
    pintarPequeno();
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

  // Tras "Hecha" empieza en pequeño; desde el ⏱, el cronómetro o los botones de la capa, en grande.
  function abrir(texto, enGrande, origen) {
    avisado = false;
    activo = true;
    nombre.textContent = texto;
    capa.classList.remove('terminado');
    clearInterval(intervalo);
    intervalo = setInterval(pintar, 250);
    pintar();
    if (enGrande && !grande) agrandar(origen);
    // Mantiene la pantalla encendida mientras cuenta.
    if (navigator.wakeLock && !bloqueo) navigator.wakeLock.request('screen').then(function (b) { bloqueo = b; }).catch(function () {});
    // En la app de Android lo hace ella (su navegador interno no deja).
    if (window.AndroidPasos && window.AndroidPasos.pantallaEncendida) window.AndroidPasos.pantallaEncendida(true);
  }

  // origen: el ⏱ que se ha tocado (se abre en grande desde él). Sin origen, en pequeño.
  function iniciar(segundos, deEjercicio, origen) {
    modo = 'cuenta';
    ejercicio = deEjercicio || '';
    fin = Date.now() + segundos * 1000;
    cerrar.textContent = 'Saltar';
    pedirPermisoAviso();
    programarPitidos(segundos);
    abrir(ejercicio ? 'Descanso · ' + ejercicio : 'Descanso', !!origen, origen);
  }

  function cronometro() {
    modo = 'cronometro';
    ejercicio = '';
    inicio = Date.now();
    cerrar.textContent = 'Cerrar';
    abrir('Cronómetro', true);
  }

  function parar() {
    clearInterval(intervalo);
    activo = false;
    grande = false;
    capa.hidden = true;
    if (capa.getAnimations) quitarFundido();
    pintarPequeno();
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
  // En grande, tocar cualquier cosa que no sea un botón lo vuelve a hacer pequeño.
  capa.addEventListener('click', function (e) {
    if (!e.target.closest('button')) encoger();
  });
  mini.addEventListener('click', function () { agrandar(mini); });
  window.addEventListener('scroll', function () { if (activo && !grande) pintarPequeno(); }, { passive: true });
  document.addEventListener('visibilitychange', function () { if (activo) pintar(); });

  return {
    iniciar: iniciar, cronometro: cronometro, parar: parar, agrandar: agrandar, encoger: encoger,
    activo: function () { return activo; }, textoChip: textoChip,
  };
})();
