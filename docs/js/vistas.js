// Pestañas Historial y Ajustes de GymApp.
(function () {
  var h = App.h;
  var formato = App.formato;
  var abierto = null;      // ejercicio abierto en el historial
  var busqueda = '';
  var diasVisibles = 30;

  // Enlace de configuración rápida: …/#config=<base64 de {url, clave, persona, nombre}>.
  (function configDesdeEnlace() {
    var m = location.hash.match(/config=([^&]+)/);
    if (!m) return;
    try {
      var c = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
      if (c.url && c.clave && c.persona) Almacen.guardarConfig(c);
    } catch (e) {
      console.warn('Enlace de configuración no válido', e);
    }
    history.replaceState(null, '', location.pathname);
  })();

  // Quita el aviso "Pendiente de subir" de las series que ya están en el Excel.
  Almacen.alCambiar(function () {
    var subidas = {};
    Almacen.series().forEach(function (s) { if (s.subida) subidas[s.id] = true; });
    document.querySelectorAll('.serie .subida[data-id]').forEach(function (el) {
      if (subidas[el.dataset.id]) el.remove();
    });
  });

  // ---- Historial ----

  function sinPrefijo(nombre) {
    return String(nombre || '').replace(/^WEAK POINT:\s*/i, '').trim();
  }

  // Todos los ejercicios: los que tienen historial (Excel y FitNotes), los de las pestañas de entreno y los de
  // "Grupos musculares" aunque aún no tengan series. Se juntan por nombre (sin acentos ni "WEAK POINT").
  function catalogo() {
    var hist = Almacen.historial() || {};
    var info = hist.info || {};
    var plan = Almacen.plan();
    var porNombre = {};

    function anadir(nombre, grupo, claveHistorial) {
      var clave = Grupos.normalizar(nombre);
      if (!clave) return;
      var e = porNombre[clave] || (porNombre[clave] = { nombre: sinPrefijo(nombre), grupo: null, claves: [] });
      if (!e.grupo && grupo) e.grupo = grupo;
      if (claveHistorial && e.claves.indexOf(claveHistorial) < 0) e.claves.push(claveHistorial);
    }

    Object.keys(hist.ejercicios || {}).forEach(function (clave) {
      var nombre = (info[clave] && info[clave].nombre) || clave;
      anadir(nombre, Grupos.grupoDe(nombre) || (info[clave] && info[clave].grupo), clave);
    });
    Calendario.ORDEN.forEach(function (entreno) {
      ((plan && plan.entrenos[entreno]) || []).forEach(function (ej) {
        anadir(ej.nombre, Grupos.grupoDe(ej.nombre), Almacen.normalizar(ej.nombre));
      });
    });
    ((plan && plan.grupos) || []).forEach(function (f) { anadir(f[0], f[1], Almacen.normalizar(f[0])); });
    Almacen.series().forEach(function (s) { anadir(s.ejercicio, Grupos.grupoDe(s.ejercicio), Almacen.normalizar(s.ejercicio)); });

    return Object.keys(porNombre).map(function (k) {
      var e = porNombre[k];
      e.grupo = e.grupo || 'Sin grupo';
      e.dias = diasDe(e.claves);
      return e;
    });
  }

  // Días del historial (juntando todas las claves del ejercicio) más las series del móvil que aún no se han subido.
  function diasDe(claves) {
    var dias = {};
    function anotar(f, kg, reps) {
      var d = dias[f] || (dias[f] = { f: f, kg: 0, rm: 0, reps: 0, s: [] });
      d.s.push([kg, reps]);
      d.kg = Math.max(d.kg, kg);
      d.reps = Math.max(d.reps, reps);
      d.rm = Math.max(d.rm, Records.rm(kg, reps));
    }
    var ejercicios = (Almacen.historial() || {}).ejercicios || {};
    claves.forEach(function (clave) {
      (ejercicios[clave] || []).forEach(function (d) {
        d.s.forEach(function (s) { anotar(d.f, s[0], s[1]); });
      });
    });
    Almacen.series().forEach(function (s) {
      if (!s.subida && claves.indexOf(Almacen.normalizar(s.ejercicio)) >= 0) anotar(s.fecha, s.kg, s.reps);
    });
    return Object.keys(dias).sort().map(function (f) { return dias[f]; });
  }

  App.vistas.historial = function (cont) {
    if (!Almacen.config()) {
      cont.appendChild(h('p', { class: 'vacio', texto: 'Configura la app en Ajustes.' }));
      return;
    }
    if (!Almacen.historial()) {
      var caja = h('div', { class: 'tarjeta' }, [h('p', { texto: 'Cargando historial…' })]);
      cont.appendChild(caja);
      Almacen.actualizarHistorial()
        .then(function () { App.mostrar('historial'); })
        .catch(function (e) {
          caja.innerHTML = '';
          caja.appendChild(h('p', { texto: 'No se pudo cargar el historial: ' + e.message }));
          caja.appendChild(h('button', { texto: 'Reintentar', onclick: function () { App.mostrar('historial'); } }));
        });
      return;
    }
    var todos = catalogo();
    if (abierto) {
      var actual = todos.find(function (e) { return Grupos.normalizar(e.nombre) === Grupos.normalizar(abierto.nombre); });
      if (actual) {
        pintarDetalle(cont, actual);
        return;
      }
      abierto = null;
    }
    pintarLista(cont, todos);
  };

  function pintarLista(cont, todos) {
    var lista = h('div', { class: 'grupos-historial' });
    var buscador = h('input', { type: 'search', placeholder: 'Buscar ejercicio', value: busqueda, 'aria-label': 'Buscar ejercicio' });

    function rellenar() {
      lista.innerHTML = '';
      var texto = Grupos.normalizar(busqueda);
      var porGrupo = {};
      todos.forEach(function (e) {
        if (texto && Grupos.normalizar(e.nombre).indexOf(texto) < 0) return;
        (porGrupo[e.grupo] = porGrupo[e.grupo] || []).push(e);
      });
      var nombresGrupo = Object.keys(porGrupo).sort(function (a, b) {
        return a === 'Sin grupo' ? 1 : b === 'Sin grupo' ? -1 : a.localeCompare(b, 'es');
      });
      if (!nombresGrupo.length) lista.appendChild(h('p', { class: 'vacio', texto: 'No hay ejercicios con ese nombre.' }));
      nombresGrupo.forEach(function (grupo) {
        var ejercicios = porGrupo[grupo].sort(function (a, b) {
          var fa = a.dias.length ? a.dias[a.dias.length - 1].f : '';
          var fb = b.dias.length ? b.dias[b.dias.length - 1].f : '';
          return fb.localeCompare(fa) || a.nombre.localeCompare(b.nombre, 'es');
        });
        lista.appendChild(h('details', { class: 'grupo-historial', open: !!texto }, [
          h('summary', {}, [h('span', { texto: grupo }), h('span', { class: 'tipo', texto: String(ejercicios.length) })]),
          h('div', { class: 'lista-historial' }, ejercicios.map(function (e) {
            var ultimo = e.dias[e.dias.length - 1];
            return h('button', { type: 'button', onclick: function () {
              abierto = e;
              diasVisibles = 30;
              App.mostrar('historial');
            } }, [
              h('span', { texto: e.nombre }),
              h('span', { class: 'tipo', texto: ultimo ? Grafica.fechaCorta(ultimo.f) + ' · ' + e.dias.length + ' días' : 'sin series' }),
            ]);
          })),
        ]));
      });
    }

    buscador.addEventListener('input', function () {
      busqueda = buscador.value;
      rellenar();
    });
    rellenar();
    cont.appendChild(h('div', { class: 'tarjeta' }, [
      h('div', { class: 'ejercicio-cabecera' }, [
        h('h2', { texto: 'Tus ejercicios' }),
        h('button', { type: 'button', class: 'discreto', texto: '+ Nuevo', onclick: nuevoEjercicio }),
      ]),
      buscador,
      lista,
    ]));
  }

  function pintarDetalle(cont, e) {
    var analisis = Records.analizar(e.dias);
    var metrica = abierto.metrica || (analisis.mejorRm ? 'rm' : 'reps');
    var grafica = h('div');
    var selector = h('select', { 'aria-label': 'Qué mostrar', onchange: function (ev) {
      abierto.metrica = ev.target.value;
      App.mostrar('historial');
    } }, [
      h('option', { value: 'rm', selected: metrica === 'rm', texto: '1RM estimado' }),
      h('option', { value: 'kg', selected: metrica === 'kg', texto: 'Peso máximo' }),
      h('option', { value: 'reps', selected: metrica === 'reps', texto: 'Repeticiones máximas' }),
    ]);

    var records = h('div', { class: 'records' });
    if (analisis.mejorRm) {
      records.appendChild(h('p', { texto: '🏆 Mejor 1RM estimado: ' + formato(analisis.mejorRm.rm) + ' kg (' +
        formato(analisis.mejorRm.kg) + ' × ' + analisis.mejorRm.reps + ', ' + Grafica.fechaCorta(analisis.mejorRm.f) + ')' }));
    }
    if (analisis.pesoMax && analisis.pesoMax.kg > 0) {
      records.appendChild(h('p', { texto: '🏋️ Peso máximo: ' + formato(analisis.pesoMax.kg) + ' kg × ' + analisis.pesoMax.reps +
        ' (' + Grafica.fechaCorta(analisis.pesoMax.f) + ')' }));
    }
    if (analisis.repsPorPeso.length) {
      var tablaPesos = h('table', { class: 'tabla-dias' }, [h('tr', {}, [h('td', { texto: 'Peso' }), h('td', { texto: 'Máx. reps' }), h('td', { texto: 'Fecha' })])]);
      analisis.repsPorPeso.slice(0, 8).forEach(function (p) {
        tablaPesos.appendChild(h('tr', {}, [
          h('td', { texto: p.kg > 0 ? formato(p.kg) + ' kg' : 'Sin peso' }),
          h('td', { texto: String(p.reps) }),
          h('td', { texto: Grafica.fechaCorta(p.f) }),
        ]));
      });
      records.appendChild(tablaPesos);
    }

    var historialDias = h('div', { class: 'dias-historial' });
    var recientes = e.dias.slice().reverse();
    recientes.slice(0, diasVisibles).forEach(function (d) {
      historialDias.appendChild(h('div', { class: 'dia' }, [
        h('span', { class: 'dia-fecha', texto: Grafica.fechaCorta(d.f) }),
        h('span', {}, d.s.map(function (s, i) {
          var marca = analisis.marcas[d.f + '|' + i];
          return h('span', { class: 'serie-hist' + (marca ? ' record' : ''), title: marca ? 'Récord de ' + marca.map(function (t) {
            return t === 'rm' ? '1RM estimado' : 'repeticiones con ese peso';
          }).join(' y ') : null, texto: (marca ? '🏆 ' : '') + formato(s[0]) + '×' + s[1] });
        })),
      ]));
    });
    if (recientes.length > diasVisibles) {
      historialDias.appendChild(h('button', { type: 'button', class: 'discreto', texto: 'Ver más (' + (recientes.length - diasVisibles) + ' días)', onclick: function () {
        diasVisibles += 60;
        App.mostrar('historial');
      } }));
    }

    cont.appendChild(h('div', { class: 'tarjeta' }, [
      h('button', { class: 'discreto', texto: '← Todos', onclick: function () {
        abierto = null;
        App.mostrar('historial');
      } }),
      h('div', { class: 'ejercicio-cabecera' }, [h('h2', { texto: e.nombre }), h('span', { class: 'chip grupo', texto: e.grupo })]),
      h('p', { class: 'detalle', texto: e.dias.length ? e.dias.length + ' días entrenados desde el ' + Grafica.fechaCorta(e.dias[0].f) : 'Todavía no hay series.' }),
      selector,
      grafica,
    ]));
    if (e.dias.length) {
      cont.appendChild(h('div', { class: 'tarjeta' }, [h('h3', { texto: 'Récords' }), records]));
      cont.appendChild(h('div', { class: 'tarjeta' }, [h('h3', { texto: 'Todas las sesiones' }), historialDias]));
    }
    Grafica.dibujar(grafica, e.dias.map(function (d) { return { f: d.f, v: d[metrica] }; }), metrica === 'reps' ? 'reps' : 'kg');
  }

  // Crea un ejercicio nuevo: queda en la pestaña "Grupos musculares" con su grupo.
  function nuevoEjercicio() {
    var nombre = h('input', { placeholder: 'Nombre del ejercicio', 'aria-label': 'Nombre del ejercicio' });
    var grupoElegido = null;
    var botones = Grupos.todos().map(function (g) {
      return h('button', { type: 'button', texto: g, onclick: function (ev) {
        grupoElegido = g;
        botones.forEach(function (b) { b.classList.toggle('actual', b === ev.currentTarget); });
      } });
    });
    var otroGrupo = h('input', { placeholder: 'u otro grupo', 'aria-label': 'Otro grupo' });
    App.abrirSelector('Nuevo ejercicio', [
      nombre,
      h('p', { class: 'detalle', texto: 'Grupo muscular' }),
      h('div', { class: 'opciones' }, botones),
      otroGrupo,
      h('button', { type: 'button', class: 'principal', texto: 'Crear', onclick: function () {
        var n = nombre.value.trim();
        var g = otroGrupo.value.trim() || grupoElegido;
        if (!n || !g) {
          App.avisar('Pon el nombre y el grupo', true);
          return;
        }
        App.cerrarSelector();
        Grupos.guardarGrupo(n, g)
          .then(function () {
            App.avisar('Ejercicio creado');
            App.mostrar('historial');
          })
          .catch(function (err) { App.avisar(navigator.onLine ? err.message : 'Necesitas conexión para crear el ejercicio', true); });
      } }),
    ]);
  }

  // ---- Ajustes ----

  App.vistas.ajustes = function (cont) {
    var c = Almacen.config() || { url: '', clave: '', persona: '' };
    var url = h('input', { type: 'url', value: c.url, placeholder: 'https://script.google.com/macros/s/…/exec' });
    var clave = h('input', { type: 'password', value: c.clave, autocomplete: 'off' });
    // Sin nombres en el código publicado: el usuario y su nombre llegan con el enlace de configuración.
    var persona = h('input', { value: c.persona || '', autocomplete: 'off', autocapitalize: 'none' });
    var guardar = h('button', { class: 'principal', texto: 'Guardar y probar' });

    guardar.addEventListener('click', function () {
      var cambiaPersona = Almacen.config() && Almacen.config().persona !== persona.value;
      if (cambiaPersona && Almacen.pendientes()) {
        App.avisar('Antes de cambiar de persona sube las series pendientes', true);
        return;
      }
      Almacen.guardarConfig({
        url: url.value.trim(),
        clave: clave.value.trim(),
        persona: persona.value.trim().toLowerCase(),
        nombre: c.persona === persona.value.trim().toLowerCase() && c.nombre ? c.nombre : persona.value.trim(),
      });
      guardar.disabled = true;
      guardar.textContent = 'Probando…';
      App.refrescarTodo()
        .then(function () {
          App.avisar('Conectado con el Excel de ' + Almacen.config().nombre);
          App.mostrar('hoy');
        })
        .catch(function (e) {
          App.avisar(e.message, true);
          guardar.disabled = false;
          guardar.textContent = 'Guardar y probar';
        });
    });

    var plan = Almacen.plan();
    var hist = Almacen.historial();
    cont.appendChild(h('div', { class: 'tarjeta' }, [
      h('h2', { texto: 'Conexión con el Excel' }),
      h('label', { class: 'campo' }, [h('span', { texto: 'Dirección de la API (Apps Script)' }), url]),
      h('label', { class: 'campo' }, [h('span', { texto: 'Clave' }), clave]),
      h('label', { class: 'campo' }, [h('span', { texto: 'Usuario' }), persona]),
      guardar,
    ]));
    cont.appendChild(h('div', { class: 'tarjeta' }, [
      h('h2', { texto: 'Datos' }),
      h('p', { class: 'detalle', texto: 'Series por subir: ' + Almacen.pendientes() }),
      h('p', { class: 'detalle', texto: 'Plan actualizado: ' + (plan ? new Date(plan.actualizado).toLocaleString('es-ES') : 'nunca') }),
      h('p', { class: 'detalle', texto: 'Historial actualizado: ' + (hist ? new Date(hist.actualizado).toLocaleString('es-ES') : 'nunca') }),
      h('button', { texto: 'Actualizar ahora', onclick: function () {
        App.refrescarTodo()
          .then(function () { App.avisar('Datos actualizados'); App.mostrar('ajustes'); })
          .catch(function (e) { App.avisar(e.message, true); });
      } }),
    ]));
  };
})();
