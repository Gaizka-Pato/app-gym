// Pestañas Historial y Ajustes de Ares.
(function () {
  var h = App.h;
  var formato = App.formato;
  var abierto = null;      // ejercicio abierto en el historial
  var busqueda = '';
  var diasVisibles = 30;
  var apartado = 'ejercicios';   // "ejercicios", "ciclo" o "calorias"
  var periodo = 'mes';           // gráficas de pasos y calorías: "semana", "mes", "tres" o "anio"
  var cicloElegido = null;

  // Enlace de configuración rápida: …/#config=<base64 de {url, clave, persona, nombre}>. Devuelve la config o null.
  function configDeEnlace(texto) {
    var m = String(texto || '').match(/config=([^&\s]+)/);
    if (!m) return null;
    try {
      var c = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
      return c.url && c.clave && c.persona ? c : null;
    } catch (e) {
      console.warn('Enlace de configuración no válido', e);
      return null;
    }
  }
  (function configDesdeEnlace() {
    if (!/config=/.test(location.hash)) return;
    var c = configDeEnlace(location.hash);
    if (c) Almacen.guardarConfig(c);
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

  // "1 día" / "7 días".
  function enDias(n) {
    return n + (n === 1 ? ' día' : ' días');
  }

  function sinPrefijo(nombre) {
    return String(nombre || '').replace(/^WEAK POINT:\s*/i, '').trim();
  }

  // Todos los ejercicios: los que tienen historial (Excel y FitNotes), los de las pestañas de entreno y los de
  // de la lista común aunque aún no tengan series. Se juntan por nombre (sin acentos ni "WEAK POINT").
  function catalogo() {
    var hist = Almacen.historial() || {};
    var info = hist.info || {};
    var plan = Almacen.plan();
    var porNombre = {};

    function anadir(nombre, grupo, claveHistorial, enCiclo) {
      var clave = Grupos.normalizar(nombre);
      if (!clave) return;
      var e = porNombre[clave] || (porNombre[clave] = { nombre: sinPrefijo(nombre), grupo: null, claves: [], enCiclo: false });
      if (!e.grupo && grupo) e.grupo = grupo;
      if (enCiclo) e.enCiclo = true;
      if (claveHistorial && e.claves.indexOf(claveHistorial) < 0) e.claves.push(claveHistorial);
    }

    Object.keys(hist.ejercicios || {}).forEach(function (clave) {
      var nombre = (info[clave] && info[clave].nombre) || clave;
      anadir(nombre, Grupos.grupoDe(nombre) || (info[clave] && info[clave].grupo), clave);
    });
    // Los ejercicios de las cuatro pestañas de entreno son los que se están haciendo en este ciclo.
    Calendario.ORDEN.forEach(function (entreno) {
      ((plan && plan.entrenos[entreno]) || []).forEach(function (ej) {
        anadir(ej.nombre, Grupos.grupoDe(ej.nombre), Almacen.normalizar(ej.nombre), true);
      });
    });
    ((plan && plan.grupos) || []).forEach(function (f) { anadir(f[0], f[1], Almacen.normalizar(f[0])); });
    var series = Almacen.series();
    series.forEach(function (s) { anadir(s.ejercicio, Grupos.grupoDe(s.ejercicio), Almacen.normalizar(s.ejercicio)); });

    var lista = Object.keys(porNombre).map(function (k) {
      var e = porNombre[k];
      e.grupo = e.grupo || 'Sin grupo';
      e.corporal = Grupos.esCorporal(e.nombre);
      e.tiempo = Grupos.porTiempo(e.nombre);
      e.dias = diasDe(e.claves, hist.ejercicios || {}, series);
      return e;
    });
    // Los pasos van en Cardio como un ejercicio más (se leen en la app de Android, ver js/inicio.js).
    var pasos = Almacen.pasos().filter(function (d) { return d.pasos > 0; });
    if (pasos.length || Pasos.disponible()) {
      lista.push({ nombre: 'Pasos', grupo: 'Cardio', claves: [], pasos: true, dias: pasos.map(function (d) { return { f: d.fecha }; }) });
    }
    return lista;
  }

  // Días del historial (juntando todas las claves del ejercicio) más las series del móvil que aún no se han subido.
  // El historial y las series vienen ya leídos: son 310 KB y esto se llama una vez por ejercicio (unas 170).
  function diasDe(claves, ejercicios, series) {
    var dias = {};
    // Las series por tiempo traen además segundos y km: [kg, reps, seg, km].
    function anotar(f, kg, reps, seg, km) {
      var d = dias[f] || (dias[f] = { f: f, kg: 0, rm: 0, reps: 0, total: 0, min: 0, km: 0, s: [] });
      d.s.push(seg || km ? [kg, reps, seg || 0, km || 0] : [kg, reps]);
      d.min = Math.max(d.min, Math.round((seg || 0) / 6) / 10);
      d.km = Math.max(d.km, km || 0);
      d.kg = Math.max(d.kg, kg);
      d.reps = Math.max(d.reps, reps);
      d.total += Number(reps) || 0;
      d.rm = Math.max(d.rm, Records.rm(kg, reps));
    }
    claves.forEach(function (clave) {
      (ejercicios[clave] || []).forEach(function (d) {
        d.s.forEach(function (s) { anotar(d.f, s[0], s[1], s[2], s[3]); });
      });
    });
    series.forEach(function (s) {
      if (!s.subida && claves.indexOf(Almacen.normalizar(s.ejercicio)) >= 0) anotar(s.fecha, s.kg, s.reps, s.seg, s.km);
    });
    return Object.keys(dias).sort().map(function (f) { return dias[f]; });
  }

  App.vistas.historial = function (cont) {
    if (!Almacen.config()) {
      cont.appendChild(h('p', { class: 'vacio', texto: 'Configura la app en Ajustes.' }));
      return;
    }
    if (!Almacen.historial()) {
      var caja = h('div', { class: 'tarjeta' }, [
        h('p', { texto: 'Cargando historial…' }),
        h('p', { class: 'detalle', texto: 'La primera vez del día puede tardar un minuto.' }),
      ]);
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
    // Dos apartados: todos los ejercicios, o la evolución del ciclo (proyectado frente a realizado).
    cont.appendChild(h('div', { class: 'segmentos' }, [
      h('button', { type: 'button', class: apartado === 'ejercicios' ? 'activa' : '', texto: 'Ejercicios', onclick: function () {
        apartado = 'ejercicios';
        App.mostrar('historial');
      } }),
      h('button', { type: 'button', class: apartado === 'ciclo' ? 'activa' : '', texto: 'Evolución del ciclo', onclick: function () {
        apartado = 'ciclo';
        App.mostrar('historial');
      } }),
      h('button', { type: 'button', class: apartado === 'calorias' ? 'activa' : '', texto: 'Calorías', onclick: function () {
        apartado = 'calorias';
        App.mostrar('historial');
      } }),
    ]));
    if (apartado === 'ciclo') pintarProgreso(cont);
    else if (apartado === 'calorias') pintarCalorias(cont);
    else pintarLista(cont, todos);
  };

  function pintarLista(cont, todos) {
    var lista = h('div', { class: 'grupos-historial' });
    var buscador = h('input', { type: 'search', placeholder: 'Buscar ejercicio', value: busqueda, 'aria-label': 'Buscar ejercicio' });

    function rellenar() {
      lista.innerHTML = '';
      var texto = Grupos.normalizar(busqueda);
      // Dos niveles: zona del cuerpo (Pecho, Espalda, Pierna…) y dentro cada músculo (Cuádriceps, Gemelo…).
      var porZona = {};
      todos.forEach(function (e) {
        if (texto && Grupos.normalizar(e.nombre).indexOf(texto) < 0) return;
        var zona = Grupos.zonaDe(e.grupo);
        var grupos = porZona[zona] = porZona[zona] || {};
        (grupos[e.grupo] = grupos[e.grupo] || []).push(e);
      });
      var zonas = Object.keys(porZona).sort(function (a, b) {
        return Grupos.ordenZona(a) - Grupos.ordenZona(b) || a.localeCompare(b, 'es');
      });
      if (!zonas.length) lista.appendChild(h('p', { class: 'vacio', texto: 'No hay ejercicios con ese nombre.' }));
      zonas.forEach(function (zona) {
        var grupos = porZona[zona];
        // El grupo que se llama como la zona (los genéricos de FitNotes: "Pierna", "Espalda") va el último.
        var nombres = Object.keys(grupos).sort(function (a, b) {
          var ga = Grupos.normalizar(a) === Grupos.normalizar(zona) || a === 'Sin grupo';
          var gb = Grupos.normalizar(b) === Grupos.normalizar(zona) || b === 'Sin grupo';
          return ga - gb || a.localeCompare(b, 'es');
        });
        var total = nombres.reduce(function (n, g) { return n + grupos[g].length; }, 0);
        // Con un solo músculo en la zona (Pecho, Hombro) no hace falta el segundo nivel.
        var contenido = nombres.length === 1
          ? [listaEjercicios(grupos[nombres[0]])]
          : nombres.map(function (grupo) {
            var titulo = Grupos.normalizar(grupo) === Grupos.normalizar(zona) ? 'General' : grupo;
            return h('details', { class: 'grupo-historial musculo', open: !!texto }, [
              h('summary', {}, [h('span', { texto: titulo }), h('span', { class: 'tipo', texto: String(grupos[grupo].length) })]),
              listaEjercicios(grupos[grupo]),
            ]);
          });
        lista.appendChild(h('details', { class: 'grupo-historial', open: !!texto }, [
          h('summary', {}, [h('span', { texto: zona }), h('span', { class: 'tipo', texto: String(total) })]),
          h('div', { class: nombres.length === 1 ? '' : 'musculos' }, contenido),
        ]));
      });
    }

    function listaEjercicios(ejercicios) {
      ejercicios.sort(function (a, b) {
        var fa = a.dias.length ? a.dias[a.dias.length - 1].f : '';
        var fb = b.dias.length ? b.dias[b.dias.length - 1].f : '';
        return fb.localeCompare(fa) || a.nombre.localeCompare(b.nombre, 'es');
      });

      function boton(e, etiqueta) {
        var ultimo = e.dias[e.dias.length - 1];
        return h('button', { type: 'button', class: e.enCiclo ? 'en-ciclo' : '', onclick: function () {
          abierto = e;
          diasVisibles = 30;
          App.mostrar('historial');
        } }, [
          h('span', { texto: etiqueta || e.nombre }),
          h('span', { class: 'tipo', texto: ultimo ? Grafica.fechaCorta(ultimo.f) + ' · ' + enDias(e.dias.length) : 'sin series' }),
        ]);
      }

      // Tercer nivel: las variantes cuelgan del ejercicio del que son (Curl de Bíceps → (Barra Z), (Mancuerna)).
      var porBase = {};
      var orden = [];
      ejercicios.forEach(function (e) {
        var base = Grupos.varianteDe(e.nombre) || e.nombre;
        var clave = Grupos.normalizar(base);
        var caja = porBase[clave];
        if (!caja) {
          caja = porBase[clave] = { nombre: base, principal: null, variantes: [] };
          orden.push(caja);
        }
        if (Grupos.normalizar(e.nombre) === clave) caja.principal = e;
        else caja.variantes.push(e);
      });

      return h('div', { class: 'lista-historial' }, orden.map(function (caja) {
        // El nombre de familia ("Press Banca") no se hace: si no tiene series propias, solo da título al grupo.
        var conSeries = caja.principal && (caja.principal.dias.length || !caja.variantes.length);
        var todos = (conSeries ? [caja.principal] : []).concat(caja.variantes);
        if (!todos.length) return null;
        if (todos.length === 1) return boton(todos[0]);
        var total = todos.reduce(function (n, e) { return n + e.dias.length; }, 0);
        return h('details', { class: 'grupo-historial variantes', open: !!Grupos.normalizar(busqueda) }, [
          h('summary', {}, [h('span', { texto: caja.nombre }), h('span', { class: 'tipo', texto: enDias(total) })]),
          h('div', { class: 'lista-historial' }, todos.map(function (e) {
            // Dentro ya se sabe de qué ejercicio son: basta el paréntesis, "(Barra Z)".
            var corto = Grupos.normalizar(e.nombre).indexOf(Grupos.normalizar(caja.nombre)) === 0
              ? e.nombre.slice(caja.nombre.length).trim() : '';
            return boton(e, corto || e.nombre);
          })),
        ]);
      }));
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
    if (e.pasos) return pintarDetallePasos(cont, e);
    if (e.tiempo) return pintarDetalleTiempo(cont, e);
    // En los de peso corporal los kg del histórico son el peso del cuerpo, que es lo que apuntaba FitNotes,
    // no una carga: se quitan para que récords, tabla y gráfica vayan solo por repeticiones.
    var dias = !e.corporal ? e.dias : e.dias.map(function (d) {
      return Object.assign({}, d, { kg: 0, rm: 0, s: d.s.map(function (s) { return [0, s[1]]; }) });
    });
    var analisis = Records.analizar(dias);
    // En los de peso corporal todo va en repeticiones: no hay 1RM ni peso máximo que mirar.
    var opciones = e.corporal
      ? [['reps', 'Repeticiones máximas'], ['total', 'Repeticiones del día']]
      : [['rm', '1RM estimado'], ['kg', 'Peso máximo'], ['reps', 'Repeticiones máximas']];
    var metrica = opciones.some(function (o) { return o[0] === abierto.metrica; })
      ? abierto.metrica
      : e.corporal || !analisis.mejorRm ? 'reps' : 'rm';
    var grafica = h('div');
    var selector = h('select', { 'aria-label': 'Qué mostrar', onchange: function (ev) {
      abierto.metrica = ev.target.value;
      App.mostrar('historial');
    } }, opciones.map(function (o) {
      return h('option', { value: o[0], selected: metrica === o[0], texto: o[1] });
    }));

    var records = h('div', { class: 'records' });
    if (e.corporal && analisis.repsPorPeso.length) {
      var mejorReps = analisis.repsPorPeso[0];
      records.appendChild(h('p', { texto: '🏆 Máximo de repeticiones: ' + mejorReps.reps +
        ' (' + Grafica.fechaCorta(mejorReps.f) + ')' }));
    }
    if (!e.corporal && analisis.mejorRm) {
      records.appendChild(h('p', { texto: '🏆 Mejor 1RM estimado: ' + formato(analisis.mejorRm.rm) + ' kg (' +
        formato(analisis.mejorRm.kg) + ' × ' + analisis.mejorRm.reps + ', ' + Grafica.fechaCorta(analisis.mejorRm.f) + ')' }));
    }
    if (analisis.pesoMax && analisis.pesoMax.kg > 0) {
      records.appendChild(h('p', { texto: '🏋️ Peso máximo: ' + formato(analisis.pesoMax.kg) + ' kg × ' + analisis.pesoMax.reps +
        ' (' + Grafica.fechaCorta(analisis.pesoMax.f) + ')' }));
    }
    if (!e.corporal && analisis.repsPorPeso.length) {
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
    var recientes = dias.slice().reverse();
    recientes.slice(0, diasVisibles).forEach(function (d) {
      historialDias.appendChild(h('div', { class: 'dia' }, [
        h('span', { class: 'dia-fecha', texto: Grafica.fechaCorta(d.f) }),
        h('span', {}, d.s.map(function (s, i) {
          var marca = analisis.marcas[d.f + '|' + i];
          return h('span', { class: 'serie-hist' + (marca ? ' record' : ''), title: marca ? 'Récord de ' + marca.map(function (t) {
            return t === 'rm' ? '1RM estimado' : e.corporal ? 'repeticiones' : 'repeticiones con ese peso';
          }).join(' y ') : null, texto: (marca ? '🏆 ' : '') + (e.corporal ? String(s[1]) : formato(s[0]) + '×' + s[1]) });
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
      h('div', { class: 'ejercicio-cabecera' }, [
        h('h2', { texto: e.nombre }),
        h('span', { class: 'chip grupo', texto: e.grupo }),
        e.corporal ? h('span', { class: 'chip corporal', texto: 'Peso corporal' }) : null,
      ]),
      h('p', { class: 'detalle', texto: e.dias.length ? enDias(e.dias.length) + ' entrenados desde el ' + Grafica.fechaCorta(e.dias[0].f) : 'Todavía no hay series.' }),
      botonesEjercicio(e),
      selector,
      grafica,
    ]));
    if (e.dias.length) {
      cont.appendChild(h('div', { class: 'tarjeta' }, [h('h3', { texto: 'Récords' }), records]));
      cont.appendChild(h('div', { class: 'tarjeta' }, [h('h3', { texto: 'Todas las sesiones' }), historialDias]));
    }
    Grafica.dibujar(grafica, dias.map(function (d) { return { f: d.f, v: d[metrica] }; }),
      metrica === 'reps' || metrica === 'total' ? 'reps' : 'kg');
  }

  // Ejercicios por tiempo (plancha, cinta…): sin kg ni 1RM; se sigue el tiempo y, si los hay, los km.
  // ---- Pasos y calorías ----

  var PERIODOS = [['semana', '7 días'], ['mes', '30 días'], ['tres', '90 días'], ['anio', '12 meses']];
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  function selectorPeriodo() {
    return h('select', { 'aria-label': 'Periodo', onchange: function (ev) {
      periodo = ev.target.value;
      App.mostrar('historial');
    } }, PERIODOS.map(function (p) { return h('option', { value: p[0], selected: periodo === p[0], texto: p[1] }); }));
  }

  // Barras del periodo elegido: un día por barra, o un mes por barra en "12 meses" (media diaria de pasos o total de
  // kcal del mes). campo: "pasos" o "kcal". Devuelve los días del periodo con pasos, para las cuentas de debajo.
  function barrasPeriodo(contenedor, campo, opciones) {
    var hoy = Almacen.hoyISO();
    var lista = Almacen.pasos();
    if (periodo === 'anio') {
      var porMes = {};
      lista.forEach(function (d) {
        var m = d.fecha.slice(0, 7);
        var x = porMes[m] || (porMes[m] = { total: 0, dias: 0 });
        x.total += d[campo] || 0;
        if (d.pasos > 0) x.dias++;
      });
      var meses = [];
      var mes = hoy.slice(0, 7);
      for (var i = 0; i < 12; i++) {
        meses.unshift(mes);
        mes = Fuerza.mesAnterior(mes);
      }
      Grafica.barras(contenedor, meses.map(function (m) {
        var x = porMes[m] || { total: 0, dias: 0 };
        var v = campo === 'pasos' ? (x.dias ? Math.round(x.total / x.dias) : 0) : Math.round(x.total);
        return { etiqueta: MESES[Number(m.slice(5)) - 1], v: v,
          titulo: Fuerza.nombreMes(m) + ': ' + Grafica.miles(v) + (campo === 'pasos' ? ' pasos de media' : ' kcal') };
      }), { clase: opciones.clase, objetivo: opciones.objetivo });
      var desde = meses[0] + '-01';
      return lista.filter(function (d) { return d.fecha >= desde && d.pasos > 0; });
    }
    var n = { semana: 7, mes: 30, tres: 90 }[periodo] || 30;
    var dias = Pasos.ultimos(lista, n, hoy);
    Grafica.barras(contenedor, dias.map(function (d) {
      var v = d[campo] || 0;
      return {
        etiqueta: n === 7 ? Pasos.diaSemana(d.fecha) : d.fecha.slice(8) + '/' + d.fecha.slice(5, 7),
        v: v, titulo: Grafica.fechaCorta(d.fecha) + ': ' + Grafica.miles(v) + (campo === 'pasos' ? ' pasos' : ' kcal'),
      };
    }), { clase: opciones.clase, objetivo: opciones.objetivo, valores: n === 7 });
    return dias.filter(function (d) { return d.pasos > 0; });
  }

  function tablaPasos(lista) {
    var recientes = lista.filter(function (d) { return d.pasos > 0; }).slice().reverse();
    var tabla = h('div', { class: 'dias-historial' });
    recientes.slice(0, diasVisibles).forEach(function (d) {
      var llega = d.objetivo && d.pasos >= d.objetivo;
      tabla.appendChild(h('div', { class: 'dia' }, [
        h('span', { class: 'dia-fecha', texto: Grafica.fechaCorta(d.fecha) }),
        h('span', {}, [
          h('span', { class: 'serie-hist', texto: (llega ? '✓ ' : '') + Grafica.miles(d.pasos) + ' pasos' }),
          h('span', { class: 'serie-hist', texto: formato(d.km || 0) + ' km' }),
          d.kcal != null ? h('span', { class: 'serie-hist', texto: d.kcal + ' kcal' }) : null,
        ]),
      ]));
    });
    if (recientes.length > diasVisibles) {
      tabla.appendChild(h('button', { type: 'button', class: 'discreto', texto: 'Ver más (' + (recientes.length - diasVisibles) + ' días)', onclick: function () {
        diasVisibles += 60;
        App.mostrar('historial');
      } }));
    }
    return tabla;
  }

  function cuentas(textos) {
    return textos.map(function (t) { return h('p', { class: 'detalle', texto: t }); });
  }

  function pintarDetallePasos(cont, e) {
    var objetivo = Almacen.objetivoPasos();
    var grafica = h('div');
    var dias = barrasPeriodo(grafica, 'pasos', { clase: 'pasos', objetivo: objetivo });
    var todos = Almacen.pasos().filter(function (d) { return d.pasos > 0; });
    var records = h('div', { class: 'records' });
    var mejor = todos.reduce(function (m, d) { return !m || d.pasos > m.pasos ? d : m; }, null);
    if (mejor) records.appendChild(h('p', { texto: '🏆 Mejor día: ' + Grafica.miles(mejor.pasos) + ' pasos (' + Grafica.fechaCorta(mejor.fecha) + ')' }));
    var textos = [];
    if (dias.length) {
      var total = dias.reduce(function (t, d) { return t + d.pasos; }, 0);
      var llegan = dias.filter(function (d) { return d.pasos >= (d.objetivo || objetivo); }).length;
      var km = dias.reduce(function (t, d) { return t + (d.km || 0); }, 0);
      textos.push('Media: ' + Grafica.miles(total / dias.length) + ' pasos al día');
      textos.push('Objetivo cumplido ' + llegan + ' de ' + dias.length + ' días');
      textos.push(formato(Math.round(km * 10) / 10) + ' km en total');
    }
    cont.appendChild(h('div', { class: 'tarjeta' }, [
      h('button', { class: 'discreto', texto: '← Todos', onclick: function () {
        abierto = null;
        App.mostrar('historial');
      } }),
      h('div', { class: 'ejercicio-cabecera' }, [h('h2', { texto: e.nombre }), h('span', { class: 'tipo', texto: 'Objetivo ' + Grafica.miles(objetivo) })]),
      h('div', { class: 'grupos-dia' }, [h('span', { class: 'chip grupo', texto: 'Cardio' })]),
      records,
      selectorPeriodo(),
      grafica,
      periodo === 'anio' ? h('p', { class: 'detalle', texto: 'Media de pasos al día de cada mes.' }) : null,
    ].concat(cuentas(textos))));
    if (!todos.length) {
      cont.appendChild(h('p', { class: 'vacio', texto: 'Los pasos se leen en la app de Android.' }));
      return;
    }
    cont.appendChild(h('div', { class: 'tarjeta' }, [h('h3', { texto: 'Todos los días' }), tablaPasos(Almacen.pasos())]));
  }

  function pintarCalorias(cont) {
    var grafica = h('div');
    var dias = barrasPeriodo(grafica, 'kcal', { clase: 'kcal' });
    var textos = [];
    if (dias.length) {
      var total = dias.reduce(function (t, d) { return t + (d.kcal || 0); }, 0);
      var mejor = dias.reduce(function (m, d) { return !m || (d.kcal || 0) > (m.kcal || 0) ? d : m; }, null);
      textos.push('Total: ' + Grafica.miles(total) + ' kcal');
      textos.push('Media: ' + Grafica.miles(total / dias.length) + ' kcal al día');
      if (mejor && mejor.kcal) textos.push('🏆 Mejor día: ' + mejor.kcal + ' kcal (' + Grafica.fechaCorta(mejor.fecha) + ')');
    }
    cont.appendChild(h('div', { class: 'tarjeta' }, [
      h('h2', { texto: 'Calorías andando' }),
      h('p', { class: 'detalle', texto: 'Calculadas con los pasos y tu peso: unos 0,5 kcal por kilo y kilómetro. Son una aproximación.' }),
      selectorPeriodo(),
      grafica,
      periodo === 'anio' ? h('p', { class: 'detalle', texto: 'Total de cada mes.' }) : null,
    ].concat(cuentas(textos))));
    if (!Almacen.pasos().length) cont.appendChild(h('p', { class: 'vacio', texto: 'Los pasos se leen en la app de Android.' }));
  }

  function pintarDetalleTiempo(cont, e) {
    var conKm = e.dias.some(function (d) { return d.km > 0; });
    var opciones = [['min', 'Tiempo máximo (min)']].concat(conKm ? [['km', 'Distancia máxima (km)']] : []);
    var metrica = opciones.some(function (o) { return o[0] === abierto.metrica; }) ? abierto.metrica : 'min';
    var grafica = h('div');
    var selector = h('select', { 'aria-label': 'Qué mostrar', onchange: function (ev) {
      abierto.metrica = ev.target.value;
      App.mostrar('historial');
    } }, opciones.map(function (o) {
      return h('option', { value: o[0], selected: metrica === o[0], texto: o[1] });
    }));

    var records = h('div', { class: 'records' });
    var mejorTiempo = null;
    var mejorKm = null;
    e.dias.forEach(function (d) {
      d.s.forEach(function (s) {
        if (s[2] > 0 && (!mejorTiempo || s[2] > mejorTiempo.s[2])) mejorTiempo = { f: d.f, s: s };
        if (s[3] > 0 && (!mejorKm || s[3] > mejorKm.s[3])) mejorKm = { f: d.f, s: s };
      });
    });
    if (mejorTiempo) records.appendChild(h('p', { texto: '🏆 Más tiempo: ' + Grupos.textoSerieTiempo(mejorTiempo.s) + ' (' + Grafica.fechaCorta(mejorTiempo.f) + ')' }));
    if (mejorKm) records.appendChild(h('p', { texto: '🏆 Más distancia: ' + Grupos.textoSerieTiempo(mejorKm.s) + ' (' + Grafica.fechaCorta(mejorKm.f) + ')' }));

    var historialDias = h('div', { class: 'dias-historial' });
    var recientes = e.dias.slice().reverse();
    recientes.slice(0, diasVisibles).forEach(function (d) {
      historialDias.appendChild(h('div', { class: 'dia' }, [
        h('span', { class: 'dia-fecha', texto: Grafica.fechaCorta(d.f) }),
        h('span', {}, d.s.map(function (s) { return h('span', { class: 'serie-hist', texto: Grupos.textoSerieTiempo(s) }); })),
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
      h('div', { class: 'ejercicio-cabecera' }, [
        h('h2', { texto: e.nombre }),
        h('span', { class: 'chip grupo', texto: e.grupo }),
        h('span', { class: 'chip corporal', texto: 'Por tiempo' }),
      ]),
      h('p', { class: 'detalle', texto: e.dias.length ? e.dias.length + ' días entrenados desde el ' + Grafica.fechaCorta(e.dias[0].f) : 'Todavía no hay series.' }),
      selector,
      grafica,
    ]));
    if (e.dias.length) {
      cont.appendChild(h('div', { class: 'tarjeta' }, [h('h3', { texto: 'Récords' }), records]));
      cont.appendChild(h('div', { class: 'tarjeta' }, [h('h3', { texto: 'Todas las sesiones' }), historialDias]));
    }
    Grafica.dibujar(grafica, e.dias.map(function (d) { return { f: d.f, v: d[metrica] }; }), metrica);
  }

  // Evolución del ciclo: lo que proyectaba el Excel en cada columna frente a lo que se ha hecho.
  function pintarProgreso(cont) {
    var datos = Almacen.progreso();
    if (!datos) {
      var caja = h('div', { class: 'tarjeta' }, [h('p', { texto: 'Cargando la evolución del ciclo…' })]);
      cont.appendChild(caja);
      Almacen.actualizarProgreso()
        .then(function () { App.mostrar('historial'); })
        .catch(function (e) {
          caja.innerHTML = '';
          caja.appendChild(h('p', { texto: 'No se pudo cargar: ' + e.message }));
          caja.appendChild(h('button', { texto: 'Reintentar', onclick: function () { App.mostrar('historial'); } }));
        });
      return;
    }

    var ciclos = [];
    datos.filas.forEach(function (f) { if (ciclos.indexOf(f.ciclo) < 0) ciclos.push(f.ciclo); });
    if (!ciclos.length) {
      cont.appendChild(h('p', { class: 'vacio', texto: 'Todavía no hay datos del ciclo. Apunta un entreno y vuelve aquí.' }));
      return;
    }
    var ciclo = cicloElegido && ciclos.indexOf(cicloElegido) >= 0 ? cicloElegido : ciclos[ciclos.length - 1];

    cont.appendChild(h('div', { class: 'tarjeta' }, [
      // Sin título: ya lo dice el botón de arriba.
      h('select', { class: 'selector-ciclo', 'aria-label': 'Ciclo', onchange: function (e) {
        cicloElegido = e.target.value;
        App.mostrar('historial');
      } }, ciclos.map(function (c) { return h('option', { value: c, selected: c === ciclo, texto: c }); })),
      h('p', { class: 'detalle', texto: 'Línea discontinua: lo que proyectaba el Excel. Línea amarilla: lo que has hecho.' }),
    ]));

    graficasCiclo(cont, datos, ciclo);
  }

  // Ejercicio a la vista en cada carrusel ('historial', 'social-<persona>'), para no perderlo al repintar.
  var carruselVisto = {};

  // Una gráfica por ejercicio con lo proyectado frente a lo hecho en un ciclo, en un carrusel que se pasa de lado,
  // con buscador para saltar a un ejercicio. También la usa la pestaña Social.
  function graficasCiclo(cont, datos, ciclo, clave) {
    clave = clave || 'historial';
    var filas = datos.filas.filter(function (f) { return f.ciclo === ciclo; });
    var etiquetas = filas.map(function (f) { return f.columna.replace('col ', ''); });
    var diapositivas = [];
    // Ejercicios hechos en el hueco de otro con "⇄ Cambiar": llevan su propia gráfica al final, con lo que les
    // tocaba ese día (lo que calcula la app con su 1RM) frente a lo que se hizo.
    var sustitutos = {};
    // Los de peso corporal van en repeticiones, en la columna "<ejercicio> (reps)": el par antiguo en kg, que
    // quedó a ceros porque no tienen 1RM, no es una gráfica, es ruido.
    var tieneReps = {};
    datos.ejercicios.forEach(function (n) {
      if (/ \(reps\)$/.test(n)) tieneReps[n.replace(/ \(reps\)$/, '')] = true;
    });

    datos.ejercicios.forEach(function (nombre) {
      if (tieneReps[nombre]) return;
      var estimado = filas.map(function (f) { return (f.valores[nombre] || [])[0] != null ? f.valores[nombre][0] : null; });
      var realizado = filas.map(function (f) { return (f.valores[nombre] || [])[1] != null ? f.valores[nombre][1] : null; });
      // Columnas hechas con otro ejercicio ("⇄ Cambiar"): { con, toco }. Se comparan con lo que tocaba en ese
      // ejercicio, no con el 1RM del que manda el Excel: 60 de Converging y 60 de press banca no son lo mismo.
      var cambios = filas.map(function (f) { return (f.valores[nombre] || [])[2] || null; });
      // Los ejercicios de peso corporal llevan "(reps)" en el título: su gráfica va en repeticiones, no en kg.
      var enReps = / \(reps\)$/.test(nombre);
      var titulo = nombre.replace(/ \(reps\)$/, '');
      var unidad = enReps ? ' reps' : ' kg';
      // En el primer ciclo de un ejercicio corporal no hay nada previsto todavía: vale con lo realizado.
      var hayEstimado = estimado.some(function (v) { return v > 0; });
      var hayRealizado = realizado.some(function (v) { return v > 0; });
      if (!hayEstimado && !(enReps && hayRealizado)) return;

      // Lo que cuenta aquí un día que cambiaste: lo que te tocaba en este ejercicio, en la proporción de lo que
      // cumpliste en el que hiciste (le tocaban 60 e hiciste 60 → entero; 50 de 60 → un 83 %).
      var marcas = cambios.map(function (c, i) {
        if (!c) return null;
        var parte = c.toco > 0 && realizado[i] > 0 ? realizado[i] / c.toco : null;
        var valor = parte != null && estimado[i] > 0 ? Math.round(estimado[i] * parte * 10) / 10 : null;
        return {
          con: c.con,
          valor: valor,
          suelto: realizado[i],
          texto: c.con + (realizado[i] != null ? ' · ' + formato(realizado[i]) + unidad : '') +
            (c.toco != null ? ' de ' + formato(c.toco) + unidad + ' que tocaban' : '') +
            (valor != null ? ' · cuenta como ' + formato(valor) + unidad : ''),
        };
      });

      var hechas = realizado.filter(function (v) { return v != null; }).length;
      var diferencias = [];
      filas.forEach(function (f, i) {
        var hecho = marcas[i] ? marcas[i].valor : realizado[i];
        if (estimado[i] != null && hecho != null) diferencias.push(hecho - estimado[i]);
      });
      var media = diferencias.length
        ? Math.round((diferencias.reduce(function (a, b) { return a + b; }, 0) / diferencias.length) * 10) / 10
        : null;
      var grafica = h('div');
      var nodo = h('div', { class: 'tarjeta progreso-ejercicio diapositiva' }, [
        h('div', { class: 'ejercicio-cabecera' }, [
          h('h3', { texto: titulo }),
          enReps ? h('span', { class: 'chip corporal', texto: 'Peso corporal' }) : null,
        ]),
        h('p', { class: 'progreso-resumen', texto: hechas + ' de ' + filas.length + ' columnas hechas' +
          (media != null ? ' · diferencia media ' + (media > 0 ? '+' : '') + formato(media) + unidad : '') }),
        grafica,
      ]);
      // Debajo, una línea por columna cambiada y un botón para ver la gráfica de ese ejercicio.
      var otros = [];
      marcas.forEach(function (m, i) {
        if (!m) return;
        nodo.appendChild(h('p', { class: 'detalle cambio-ciclo', texto: '✕ ' + etiquetas[i] + ': ' + m.texto }));
        if (otros.indexOf(m.con) < 0) otros.push(m.con);
      });
      if (otros.length) {
        nodo.appendChild(h('div', { class: 'ver-otro' }, otros.map(function (o) {
          return h('button', { type: 'button', texto: 'Ver ' + o + ' ›', onclick: function () { irA(o); } });
        })));
      }
      cambios.forEach(function (c, i) {
        if (!c) return;
        var s = sustitutos[c.con] = sustitutos[c.con] || { tocaban: [], hechos: [], desde: [] };
        s.tocaban[i] = c.toco != null ? c.toco : null;
        s.hechos[i] = realizado[i] != null ? realizado[i] : null;
        if (s.desde.indexOf(titulo) < 0) s.desde.push(titulo);
      });
      Grafica.comparar(grafica, etiquetas, estimado, realizado, marcas);
      diapositivas.push({ titulo: titulo, nodo: nodo });
    });

    // Gráfica propia de cada ejercicio que se usó en el hueco de otro, solo los días que se hizo: lo que le
    // tocaba ese día frente a lo que hizo.
    Object.keys(sustitutos).forEach(function (nombre) {
      if (diapositivas.some(function (d) { return d.titulo === nombre; })) return;
      var s = sustitutos[nombre];
      if (!s.hechos.some(function (v) { return v > 0; })) return;
      var tocaban = filas.map(function (f, i) { return s.tocaban[i] != null ? s.tocaban[i] : null; });
      var hechos = filas.map(function (f, i) { return s.hechos[i] != null ? s.hechos[i] : null; });
      var grafica = h('div');
      var nodo = h('div', { class: 'tarjeta progreso-ejercicio diapositiva' }, [
        h('div', { class: 'ejercicio-cabecera' }, [
          h('h3', { texto: nombre }),
          h('span', { class: 'chip corporal', texto: 'Cambio' }),
        ]),
        h('p', { class: 'progreso-resumen', texto: 'En el hueco de ' + s.desde.join(', ') + ' · ' +
          hechos.filter(function (v) { return v > 0; }).length + ' de ' + filas.length + ' columnas' }),
        grafica,
        h('div', { class: 'ver-otro' }, s.desde.map(function (d) {
          return h('button', { type: 'button', texto: '‹ Volver a ' + d, onclick: function () { irA(d); } });
        })),
      ]);
      Grafica.comparar(grafica, etiquetas, tocaban, hechos, []);
      diapositivas.push({ titulo: nombre, nodo: nodo });
    });

    if (!diapositivas.length) {
      cont.appendChild(h('p', { class: 'vacio', texto: 'Ningún ejercicio tiene datos en este ciclo.' }));
      return;
    }

    // Salta a la gráfica de un ejercicio por su nombre (botones "Ver …" y "Volver a …").
    function irA(titulo) {
      var i = diapositivas.findIndex(function (d) { return d.titulo === titulo; });
      if (i >= 0) ir(i, true);
    }

    var pista = h('div', { class: 'carrusel', 'aria-label': 'Gráficas por ejercicio' }, diapositivas.map(function (d) { return d.nodo; }));
    var contador = h('span', { class: 'carrusel-contador' });
    var idLista = 'ejercicios-' + clave;
    var buscador = h('input', { type: 'search', list: idLista, placeholder: '🔍 Buscar ejercicio', 'aria-label': 'Buscar ejercicio' });
    var actual = 0;

    function marcar(i) {
      actual = i;
      contador.textContent = (i + 1) + ' / ' + diapositivas.length;
      carruselVisto[clave] = diapositivas[i].titulo;
    }
    function ir(i, suave) {
      i = Math.max(0, Math.min(diapositivas.length - 1, i));
      pista.scrollTo({ left: diapositivas[i].nodo.offsetLeft, behavior: suave ? 'smooth' : 'auto' });
      marcar(i);
    }
    // Al pasar con el dedo: la diapositiva más cerca del borde izquierdo es la que se ve.
    var esperando = false;
    pista.addEventListener('scroll', function () {
      if (esperando) return;
      esperando = true;
      requestAnimationFrame(function () {
        esperando = false;
        var mejor = 0;
        diapositivas.forEach(function (d, i) {
          if (Math.abs(d.nodo.offsetLeft - pista.scrollLeft) < Math.abs(diapositivas[mejor].nodo.offsetLeft - pista.scrollLeft)) mejor = i;
        });
        if (mejor !== actual) marcar(mejor);
      });
    });
    buscador.addEventListener('input', function () {
      var buscado = Grupos.normalizar(buscador.value);
      if (!buscado) return;
      var i = diapositivas.findIndex(function (d) { return Grupos.normalizar(d.titulo).indexOf(buscado) >= 0; });
      if (i >= 0) ir(i, true);
    });

    cont.appendChild(h('div', { class: 'carrusel-barra' }, [
      buscador,
      h('datalist', { id: idLista }, diapositivas.map(function (d) { return h('option', { value: d.titulo }); })),
      h('button', { type: 'button', class: 'carrusel-flecha', 'aria-label': 'Anterior', texto: '‹', onclick: function () { ir(actual - 1, true); } }),
      contador,
      h('button', { type: 'button', class: 'carrusel-flecha', 'aria-label': 'Siguiente', texto: '›', onclick: function () { ir(actual + 1, true); } }),
    ]));
    cont.appendChild(pista);
    var inicio = diapositivas.findIndex(function (d) { return d.titulo === carruselVisto[clave]; });
    marcar(Math.max(0, inicio));
    // Hay que esperar a que esté pintado para saber dónde queda cada gráfica.
    if (inicio > 0) requestAnimationFrame(function () { ir(inicio, false); });
  }
  App.graficasCiclo = graficasCiclo;

  // Cambiar o quitar un ejercicio toca la lista de los dos, así que solo sale en el móvil de quien manda.
  function botonesEjercicio(e) {
    if (!(Almacen.plan() || {}).puedeEditar || e.pasos) return null;
    return h('div', { class: 'acciones-ejercicio' }, [
      h('button', { type: 'button', class: 'discreto', texto: '✏️ Editar', onclick: function () { editarEjercicio(e); } }),
      h('button', { type: 'button', class: 'discreto', texto: '🗑 Quitar', onclick: function () { quitarEjercicio(e); } }),
    ]);
  }

  // Nombre, grupo, con qué se hace y de qué ejercicio es variante. El nombre se cambia en todo (pestañas de
  // entreno, Registro, Recopilatorio…) para no perder el historial.
  function editarEjercicio(e) {
    var nombre = h('input', { value: e.nombre, 'aria-label': 'Nombre del ejercicio' });
    var grupoElegido = e.grupo;
    var botones = Grupos.todos().map(function (g) {
      return h('button', { type: 'button', class: Grupos.normalizar(g) === Grupos.normalizar(e.grupo) ? 'actual' : '', texto: g, onclick: function (ev) {
        grupoElegido = g;
        botones.forEach(function (b) { b.classList.toggle('actual', b === ev.currentTarget); });
      } });
    });
    var materialElegido = Grupos.materialDe(e.nombre);
    var materiales = Grupos.MATERIALES.map(function (m) {
      return h('button', { type: 'button', class: m[0] === materialElegido ? 'actual' : '', texto: m[1], onclick: function (ev) {
        materialElegido = m[0];
        materiales.forEach(function (b) { b.classList.toggle('actual', b === ev.currentTarget); });
      } });
    });
    // De qué ejercicio es variante: solo valen los que no son variantes de otro.
    var base = Grupos.varianteDe(e.nombre);
    var principales = ((Almacen.plan() || {}).grupos || []).filter(function (f) {
      return !f[4] && Grupos.normalizar(f[0]) !== Grupos.normalizar(e.nombre);
    }).map(function (f) { return f[0]; }).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    var deQuien = h('select', { 'aria-label': 'Variante de' }, [h('option', { value: '', texto: 'No es una variante' })]
      .concat(principales.map(function (n) { return h('option', { value: n, selected: Grupos.normalizar(n) === Grupos.normalizar(base), texto: n }); })));

    App.abrirSelector('Editar ' + e.nombre, [
      nombre,
      h('p', { class: 'detalle', texto: 'Grupo muscular' }),
      h('div', { class: 'opciones' }, botones),
      h('p', { class: 'detalle', texto: '¿Con qué se hace?' }),
      h('div', { class: 'opciones' }, materiales),
      h('p', { class: 'detalle', texto: 'Variante de' }),
      deQuien,
      h('button', { type: 'button', class: 'principal', texto: 'Guardar', onclick: function () {
        var n = nombre.value.trim();
        if (!n || !grupoElegido) {
          App.avisar('Pon el nombre y el grupo', true);
          return;
        }
        App.cerrarSelector();
        var cambiaNombre = Grupos.normalizar(n) !== Grupos.normalizar(e.nombre) || n !== e.nombre;
        Promise.resolve()
          .then(function () {
            return cambiaNombre ? Almacen.llamar('renombrar', { cambios: [[e.nombre, n]], aplicar: true }) : null;
          })
          .then(function () {
            return Grupos.guardarGrupo(n, grupoElegido, materialElegido, deQuien.value);
          })
          .then(function () { return Almacen.actualizarPlan(); })
          .then(function () { return cambiaNombre ? Almacen.actualizarHistorial() : null; })
          .then(function () {
            abierto = { nombre: n };
            App.avisar('Guardado');
            App.mostrar('historial');
          })
          .catch(function (err) { App.avisar(navigator.onLine ? err.message : 'Necesitas conexión para cambiarlo', true); });
      } }),
    ]);
  }

  // Quitarlo de la lista: deja de salir para elegirlo, pero sus series y su historial se quedan.
  function quitarEjercicio(e) {
    App.abrirSelector('Quitar ' + e.nombre, [
      h('p', { texto: 'Deja de salir en la lista de ejercicios.' }),
      h('p', { class: 'detalle', texto: 'Sus series y su historial se quedan como están. No se puede quitar si está en un entreno o si tiene variantes.' }),
      h('button', { type: 'button', class: 'principal', texto: 'Quitar de la lista', onclick: function () {
        App.cerrarSelector();
        Almacen.llamar('quitarEjercicios', { nombres: [e.nombre], aplicar: true })
          .then(function (r) {
            if (!(r.quitados || []).length) throw new Error((r.protegidos || []).length ? e.nombre + ' está en un entreno o tiene variantes' : 'No se ha podido quitar');
            return Almacen.actualizarPlan();
          })
          .then(function () {
            abierto = null;
            App.avisar(e.nombre + ' fuera de la lista');
            App.mostrar('historial');
          })
          .catch(function (err) { App.avisar(navigator.onLine ? err.message : 'Necesitas conexión para quitarlo', true); });
      } }),
    ]);
  }

  // Crea un ejercicio nuevo: queda en la pestaña común "Ejercicios" con su grupo.
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
    // Con qué se hace: los de barra son los únicos que enseñan los discos, y la barra Z pesa 10 kg.
    var materialElegido = null;
    var materiales = Grupos.MATERIALES.map(function (m) {
      return h('button', { type: 'button', texto: m[1], onclick: function (ev) {
        materialElegido = m[0];
        materiales.forEach(function (b) { b.classList.toggle('actual', b === ev.currentTarget); });
      } });
    });
    App.abrirSelector('Nuevo ejercicio', [
      nombre,
      h('p', { class: 'detalle', texto: 'Grupo muscular' }),
      h('div', { class: 'opciones' }, botones),
      otroGrupo,
      h('p', { class: 'detalle', texto: '¿Con qué se hace?' }),
      h('div', { class: 'opciones' }, materiales),
      h('button', { type: 'button', class: 'principal', texto: 'Crear', onclick: function () {
        var n = nombre.value.trim();
        var g = otroGrupo.value.trim() || grupoElegido;
        if (!n || !g || !materialElegido) {
          App.avisar('Pon el nombre, el grupo y con qué se hace', true);
          return;
        }
        // La lista es la de los dos: si ya hay uno igual o parecido (puede que lo creara el otro), se pregunta antes.
        var parecidos = Grupos.parecidos(n);
        if (parecidos.some(function (p) { return Grupos.normalizar(p) === Grupos.normalizar(n); })) {
          App.avisar('Ya existe: ' + parecidos[0], true);
          return;
        }
        if (!parecidos.length) return crear(n, g, materialElegido);
        App.abrirSelector('¿Es alguno de estos?', [
          h('p', { class: 'detalle', texto: 'Ya hay ejercicios con un nombre parecido. Si es uno de ellos, usa ese.' }),
          h('div', { class: 'opciones' }, parecidos.map(function (p) { return h('span', { class: 'chip', texto: p }); })),
          h('button', { type: 'button', class: 'principal', texto: 'Crear "' + n + '" igualmente', onclick: function () { crear(n, g, materialElegido); } }),
          h('button', { type: 'button', texto: 'Cancelar', onclick: App.cerrarSelector }),
        ]);
      } }),
    ]);
  }

  function crear(n, g, material) {
    App.cerrarSelector();
    Grupos.guardarGrupo(n, g, material)
      .then(function () {
        App.avisar('Ejercicio creado');
        App.mostrar('historial');
      })
      .catch(function (err) { App.avisar(navigator.onLine ? err.message : 'Necesitas conexión para crear el ejercicio', true); });
  }

  // ---- Ajustes ----

  // Cada bloque de Ajustes se abre al tocarlo: así la pantalla no es una lista larga de formularios.
  // pista: lo que se ve sin abrirlo (el usuario, el objetivo…).
  function plegable(cont, titulo, pista, hijos, abierto) {
    var caja = h('details', { class: 'tarjeta plegable', open: !!abierto }, [
      h('summary', {}, [
        h('span', { class: 'plegable-titulo', texto: titulo }),
        pista ? h('span', { class: 'plegable-pista', texto: pista }) : null,
      ]),
      h('div', { class: 'plegable-cuerpo' }, hijos),
    ]);
    cont.appendChild(caja);
    return caja;
  }

  // Deja la foto cuadrada y pequeña (recortada por el centro) para que quepa en una celda del Excel:
  // se prueba con menos calidad hasta que ocupa poco. Devuelve un data:image/jpeg.
  function reducirFoto(archivo) {
    return new Promise(function (listo, fallo) {
      var lector = new FileReader();
      lector.onerror = function () { fallo(new Error('No se ha podido leer la foto')); };
      lector.onload = function () {
        var img = new Image();
        img.onerror = function () { fallo(new Error('Ese archivo no es una foto')); };
        img.onload = function () {
          var lado = Math.min(img.width, img.height);
          var lienzo = document.createElement('canvas');
          lienzo.width = 256;
          lienzo.height = 256;
          lienzo.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 256, 256);
          var calidades = [0.8, 0.65, 0.5, 0.35];
          for (var i = 0; i < calidades.length; i++) {
            var datos = lienzo.toDataURL('image/jpeg', calidades[i]);
            if (datos.length <= 45000) return listo(datos);
          }
          fallo(new Error('La foto pesa demasiado; prueba con otra'));
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  // Convierte en plegable una tarjeta que pinta otro módulo (Estado.formulario): le quita el título y se queda el resto.
  function plegableDeTarjeta(cont, pintar, titulo, pista, abierto) {
    var caja = h('div');
    pintar(caja);
    var tarjeta = caja.firstChild;
    if (!tarjeta) return null;
    var h2 = tarjeta.querySelector('h2');
    if (h2) tarjeta.removeChild(h2);
    return plegable(cont, titulo, pista, Array.prototype.slice.call(tarjeta.childNodes), abierto);
  }

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
          App.mostrar('inicio');
        })
        .catch(function (e) {
          App.avisar(e.message, true);
          guardar.disabled = false;
          guardar.textContent = 'Guardar y probar';
        });
    });

    // En la app de Android el enlace de configuración se abre en el navegador, no en ella: se pega aquí.
    if (window.AndroidPasos || !Almacen.config()) {
      var enlace = h('input', { type: 'url', placeholder: 'https://…#config=…', autocomplete: 'off', 'aria-label': 'Enlace de configuración' });
      plegable(cont, 'Enlace de configuración', null, [
        h('p', { class: 'detalle', texto: 'Mantén pulsado el enlace, cópialo y pégalo aquí.' }),
        h('div', { class: 'otro' }, [enlace, h('button', { type: 'button', class: 'principal', texto: 'Usar', onclick: function () {
          var nueva = configDeEnlace(enlace.value);
          if (!nueva) {
            App.avisar('Ese no es un enlace de configuración', true);
            return;
          }
          if (Almacen.config() && Almacen.config().persona !== nueva.persona && Almacen.pendientes()) {
            App.avisar('Antes de cambiar de persona sube las series pendientes', true);
            return;
          }
          Almacen.guardarConfig(nueva);
          App.refrescarTodo()
            .then(function () {
              App.avisar('Conectado con el Excel de ' + Almacen.config().nombre);
              App.mostrar('inicio');
            })
            .catch(function (e) { App.avisar(e.message, true); App.mostrar('ajustes'); });
        } })]),
      ], !Almacen.config());
    }

    var plan = Almacen.plan();
    var hist = Almacen.historial();
    plegable(cont, 'Conexión con el Excel', c.persona ? 'Conectado · ' + (c.nombre || c.persona) : 'Sin configurar', [
      h('label', { class: 'campo' }, [h('span', { texto: 'Dirección de la API (Apps Script)' }), url]),
      h('label', { class: 'campo' }, [h('span', { texto: 'Clave' }), clave]),
      h('label', { class: 'campo' }, [h('span', { texto: 'Usuario' }), persona]),
      guardar,
    ], !Almacen.config() && !window.AndroidPasos);
    // Sexo, cumpleaños y peso para la pestaña Estado (js/estado.js).
    if (Almacen.config()) {
      var cuerpo = Almacen.cuerpo();
      plegableDeTarjeta(cont, function (caja) {
        Estado.formulario(caja, cuerpo, function () { App.mostrar('ajustes'); });
      }, 'Tus datos', cuerpo
        ? (cuerpo.sexo === 'mujer' ? 'Mujer' : 'Hombre') + ' · ' + formato(cuerpo.peso) + ' kg'
        : 'Sin poner');
    }
    if (Almacen.config()) {
      var objetivo = h('input', { type: 'number', inputmode: 'numeric', step: '500', min: '500', value: Almacen.objetivoPasos(), 'aria-label': 'Pasos al día' });
      plegable(cont, 'Objetivo de pasos', Grafica.miles(Almacen.objetivoPasos()) + ' pasos al día', [
        h('label', { class: 'campo' }, [h('span', { texto: 'Pasos al día' }), objetivo]),
        h('button', { type: 'button', class: 'principal', texto: 'Guardar', onclick: function () {
          var n = Math.round(App.numero(objetivo.value));
          if (!(n >= 500 && n <= 100000)) {
            App.avisar('Pon un número de pasos entre 500 y 100.000', true);
            return;
          }
          Almacen.guardarObjetivoPasos(n);
          App.avisar('Objetivo guardado: ' + Grafica.miles(n) + ' pasos');
          App.mostrar('ajustes');
        } }),
      ]);
    }
    // La foto que sale arriba en vez del nombre. Se reduce aquí (una celda del Excel no aguanta más),
    // se guarda en el Excel común y así la ve también el otro móvil.
    if (Almacen.config()) {
      var miFoto = Almacen.foto(c.persona);
      var muestra = h('div', { class: 'foto-grande' });
      if (miFoto) muestra.style.backgroundImage = 'url("' + miFoto + '")';
      var archivo = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Elegir foto' });
      var quitar = h('button', { type: 'button', class: 'discreto', texto: 'Quitar foto' });
      if (!miFoto) quitar.hidden = true;

      var guardarFoto = function (imagen, hecho) {
        archivo.disabled = true;
        quitar.disabled = true;
        Almacen.guardarFoto(imagen)
          .then(function () {
            App.avisar(hecho);
            App.mostrar('ajustes');
          })
          .catch(function (e) {
            App.avisar(e.message, true);
            archivo.disabled = false;
            quitar.disabled = false;
          });
      };

      archivo.addEventListener('change', function () {
        var f = archivo.files && archivo.files[0];
        if (!f) return;
        App.avisar('Preparando la foto…');
        reducirFoto(f)
          .then(function (imagen) { guardarFoto(imagen, 'Foto guardada'); })
          .catch(function (e) { App.avisar(e.message, true); });
      });
      quitar.addEventListener('click', function () { guardarFoto('', 'Foto quitada'); });

      plegable(cont, 'Tu foto', miFoto ? 'Puesta' : 'Sin poner', [
        h('p', { class: 'detalle', texto: 'Sale arriba, en vez de tu nombre.' }),
        h('div', { class: 'foto-fila' }, [
          muestra,
          h('div', {}, [
            // El campo de archivo de verdad se esconde: el botón es la etiqueta que lo abre.
            h('label', { class: 'foto-elegir' }, [h('span', { texto: miFoto ? 'Cambiar foto' : 'Elegir foto' }), archivo]),
            quitar,
          ]),
        ]),
      ]);
    }
    // Aspecto: el oscuro (negro y naranja) o el claro (blanco y verde), cada uno con su icono.
    plegable(cont, 'Aspecto', Tema.TEMAS[Tema.actual()].nombre + ' · ' + Tema.TEMAS[Tema.actual()].pista,
      [h('div', { class: 'temas' }, Object.keys(Tema.TEMAS).map(function (t) {
        var d = Tema.TEMAS[t];
        return h('button', { type: 'button', class: 'tema' + (Tema.actual() === t ? ' actual' : ''), onclick: function () {
          Tema.poner(t);
          App.avisar('Aspecto ' + d.nombre.toLowerCase());
          App.mostrar('ajustes');
        } }, [
          h('img', { class: 'tema-icono', src: d.icono, alt: '', width: '56', height: '56' }),
          h('span', { class: 'tema-nombre', texto: d.nombre }),
          h('span', { class: 'detalle', texto: d.pista }),
        ]);
      }))]);
    plegable(cont, 'Datos', Almacen.pendientes() ? Almacen.pendientes() + ' series por subir' : 'Todo subido', [
      h('p', { class: 'detalle', texto: 'Series por subir: ' + Almacen.pendientes() }),
      h('p', { class: 'detalle', texto: 'Plan actualizado: ' + (plan ? new Date(plan.actualizado).toLocaleString('es-ES') : 'nunca') }),
      h('p', { class: 'detalle', texto: 'Historial actualizado: ' + (hist ? new Date(hist.actualizado).toLocaleString('es-ES') : 'nunca') }),
      h('button', { texto: 'Actualizar ahora', onclick: function () {
        App.refrescarTodo()
          .then(function () { App.avisar('Datos actualizados'); App.mostrar('ajustes'); })
          .catch(function (e) { App.avisar(e.message, true); });
      } }),
    ]);
    // Si algo se rompe en el móvil, aquí queda escrito qué fue.
    var fallos = Almacen.fallos();
    if (fallos.length) {
      plegable(cont, 'Últimos fallos', fallos.length + (fallos.length === 1 ? ' fallo' : ' fallos'), fallos.slice().reverse().map(function (f) {
        return h('p', { class: 'detalle', texto: f.cuando + ' · ' + f.texto });
      }));
    }
  };
})();
