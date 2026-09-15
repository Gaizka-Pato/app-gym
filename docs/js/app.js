// Interfaz de GymApp: arranque, pestaña "Hoy" (qué toca, grupos musculares, apuntar series, cambiar o añadir ejercicios,
// récords), descanso y 1RM. Las pestañas Historial y Ajustes están en vistas.js.
var App = (function () {
  var vista = document.getElementById('vista');
  var botonEstado = document.getElementById('estado');
  var estado = { vista: 'hoy', entreno: null, columna: null, elegidoAMano: false };
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

  function mostrar(nombre) {
    estado.vista = nombre;
    document.querySelectorAll('.pestanas button').forEach(function (b) {
      b.classList.toggle('activa', b.dataset.vista === nombre);
    });
    vista.innerHTML = '';
    vistas[nombre](vista);
    window.scrollTo(0, 0);
  }

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
    return Almacen.sincronizar()
      .then(function (r) {
        if (r.error) throw new Error(r.error);
        return Promise.all([Almacen.actualizarPlan(), Almacen.actualizarHistorial()]);
      })
      .then(function () {
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

    var toca = Calendario.siguiente(Almacen.ultimaSesion(), Almacen.hoyISO());
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

  function cabeceraHoy(toca, lista) {
    var etiqueta = estado.elegidoAMano ? 'Elegido a mano' : toca.enCurso ? 'Sesión en curso' : toca.descanso ? 'Hoy descansas · próximo entreno' : 'Te toca';
    var selEntreno = h('select', { 'aria-label': 'Entreno', onchange: function (e) { elegir(e.target.value, estado.columna); } },
      Calendario.ORDEN.map(function (e) { return h('option', { value: e, selected: e === estado.entreno, texto: 'Entreno ' + e }); }));
    var columnas = [];
    for (var c = 1; c <= Calendario.COLUMNAS; c++) {
      columnas.push(h('option', { value: c, selected: c === estado.columna, texto: Calendario.nombreColumna(c) }));
    }
    var selColumna = h('select', { 'aria-label': 'Columna', onchange: function (e) { elegir(estado.entreno, Number(e.target.value)); } }, columnas);
    var grupos = Grupos.delDia(lista.map(nombreHoy));

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
      h('div', { class: 'selectores' }, [selEntreno, selColumna]),
      h('div', { class: 'acciones-cabecera' }, [
        h('button', { type: 'button', texto: '⏱ Cronómetro', onclick: function () { Descanso.cronometro(); } }),
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
    var grupo = Grupos.grupoDe(nombre);
    var ultima = Almacen.ultimaVez(nombre);
    var detalle = col.detalle && col.detalle !== 'Normal' ? col.detalle : '';
    var obligatorias = col.series.filter(function (s) { return !s.opcional; }).length;
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
        col.descanso ? h('button', { type: 'button', class: 'chip', texto: '⏱ ' + reloj(col.descanso), 'aria-label': 'Empezar descanso',
          onclick: function () { Descanso.iniciar(col.descanso, sinPrefijo(nombre)); } }) : null,
      ]),
      h('p', { class: 'objetivo', texto: col.objetivo + (col.kg ? ' · ' + formato(col.kg) + ' kg' : '') }),
      detalle ? h('p', { class: 'detalle', texto: detalle }) : null,
      ultima ? h('p', { class: 'ultima-vez', texto: 'Última vez (' + Grafica.fechaCorta(ultima.fecha) + '): ' +
        ultima.series.map(function (s) { return formato(s[0]) + '×' + s[1]; }).join(' · ') }) : null,
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

    if (estado.columna === Calendario.COLUMNAS && ej.tipo === 'principal' && (!cambiado || rmPropio != null) && hechas.length) {
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
    var kgSugerido = hecha ? hecha.kg : ej.tipo === 'principal' && col.kg != null ? col.kg : anterior ? anterior[0] : '';
    var repsPlan = parseInt(plan.reps, 10);
    var repsSugeridas = hecha ? hecha.reps : !isNaN(repsPlan) ? repsPlan : anterior ? anterior[1] : '';

    var kg = h('input', { inputmode: 'decimal', 'aria-label': 'Kg serie ' + (i + 1), value: formato(kgSugerido), placeholder: 'kg', disabled: !!hecha });
    var reps = h('input', { inputmode: 'numeric', 'aria-label': 'Reps serie ' + (i + 1), value: repsSugeridas, placeholder: plan.reps || 'reps', disabled: !!hecha });
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
        var peso = numero(kg.value) || 0;
        var record = comprobarRecord(nombre, peso, r);
        Almacen.apuntar({
          entreno: estado.entreno, columna: estado.columna, ejercicio: nombre, ejercicioId: ej.id,
          tipo: ej.tipo, serie: i + 1, kg: peso, reps: r, sustituye: cambiado ? ej.nombre : '', record: record,
        });
        // En un jump set se descansa después del segundo ejercicio, no entre los dos.
        var primeroDeJump = ej.tipo === 'jump' && siguienteEj && siguienteEj.grupo === ej.grupo;
        if (!primeroDeJump && col.descanso) Descanso.iniciar(col.descanso, sinPrefijo(nombre));
        if (record) avisar(textoRecord(record, peso, r));
      }
      repintar();
    });

    return h('div', { class: 'serie' + (plan.opcional ? ' opcional' : '') + (hecha ? ' hecha' : '') + (hecha && hecha.record ? ' record' : '') }, [
      h('span', { class: 'numero', texto: String(i + 1) }), kg, reps, boton,
      hecha && !hecha.subida ? h('span', { class: 'subida', 'data-id': hecha.id, texto: 'Pendiente de subir al Excel' }) : null,
    ]);
  }

  // Compara la serie con todo lo hecho antes en ese ejercicio: historial del Excel y FitNotes y series del móvil.
  function comprobarRecord(nombre, kg, reps) {
    var clave = Almacen.normalizar(nombre);
    var anteriores = [];
    (((Almacen.historial() || {}).ejercicios || {})[clave] || []).forEach(function (d) {
      d.s.forEach(function (s) { anteriores.push(s); });
    });
    Almacen.series().forEach(function (s) {
      if (Almacen.normalizar(s.ejercicio) === clave) anteriores.push([s.kg, s.reps]);
    });
    var c = Records.comparar(anteriores, kg, reps);
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
        lista.appendChild(h('button', { type: 'button', class: 'principal', texto: 'Crear "' + nuevo + '"', onclick: function () {
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

  // ---- Arranque ----

  function iniciar() {
    document.querySelectorAll('.pestanas button').forEach(function (b) {
      b.addEventListener('click', function () { mostrar(b.dataset.vista); });
    });
    Almacen.alCambiar(pintarEstado);
    window.addEventListener('online', pintarEstado);
    window.addEventListener('offline', pintarEstado);
    pintarEstado();
    mostrar(Almacen.config() ? 'hoy' : 'ajustes');
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
      capa.classList.add('terminado');
      cerrar.textContent = 'Seguir';
      if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]);
      pitar();
    }
  }

  function pitar() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.35, 0.7].forEach(function (t) {
        var osc = ctx.createOscillator();
        var vol = ctx.createGain();
        osc.frequency.value = 880;
        vol.gain.value = 0.25;
        osc.connect(vol).connect(ctx.destination);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.2);
      });
    } catch (e) { /* sin sonido */ }
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
  }

  function iniciar(segundos, ejercicio) {
    modo = 'cuenta';
    fin = Date.now() + segundos * 1000;
    cerrar.textContent = 'Saltar';
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
    if (bloqueo) bloqueo.release().catch(function () {});
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
