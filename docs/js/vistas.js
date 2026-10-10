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
        .then(function () { App.repintar(); })
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
        h('button', { type: 'button', class: 'discreto con-icono', onclick: nuevoEjercicio }, [Iconos.nuevoEjercicio(), 'Nuevo']),
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
      App.repintar();
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
        App.repintar();
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

  // soloDias: sin "12 meses" (una barra por mes), para Calorías.
  function selectorPeriodo(soloDias) {
    var periodos = soloDias ? PERIODOS.filter(function (p) { return p[0] !== 'anio'; }) : PERIODOS;
    return h('select', { 'aria-label': 'Periodo', onchange: function (ev) {
      periodo = ev.target.value;
      App.repintar();
    } }, periodos.map(function (p) { return h('option', { value: p[0], selected: periodo === p[0], texto: p[1] }); }));
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
    }), { clase: opciones.clase, objetivo: opciones.objetivo, valores: n === 7, media: opciones.media && n > 7 });
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
        App.repintar();
      } }));
    }
    return tabla;
  }

  // El Excel donde va la copia de cada uno (2026-10-10): se abre o se cambia pegando el enlace de otro. La API
  // comprueba que puede escribir en él, le copia lo que tenías y desde entonces escribe ahí (ponerExcel).
  function elegirExcel(actual) {
    var enlace = h('input', { type: 'url', placeholder: 'https://docs.google.com/spreadsheets/d/…', 'aria-label': 'Enlace del Excel' });
    var estado = h('p', { class: 'detalle', texto: '' });
    var usar = h('button', { type: 'button', class: 'principal', texto: 'Usar este Excel', onclick: function () {
      if (!enlace.value.trim()) { App.avisar('Pega el enlace de tu Excel', true); return; }
      usar.disabled = true;
      estado.textContent = 'Copiando tus datos al Excel nuevo… (puede tardar un minuto)';
      Almacen.llamar('ponerExcel', { url: enlace.value.trim() }, 'url')
        .then(function (r) {
          return Almacen.actualizarPlan().then(function () { return r; });
        })
        .then(function (r) {
          App.cerrarSelector();
          App.avisar(r.cambiado ? 'Listo: tu copia va ahora a ese Excel' : 'Ya era tu Excel');
          App.repintar();
        })
        .catch(function (e) {
          usar.disabled = false;
          estado.textContent = '';
          App.avisar(navigator.onLine ? e.message : 'Necesitas conexión para cambiar de Excel', true);
        });
    } });
    App.abrirSelector('Tu Excel', [
      actual ? h('a', { class: 'boton', href: actual, target: '_blank', rel: 'noopener', texto: 'Abrir actual' }) : null,
      h('label', { class: 'campo' }, [h('span', { texto: 'Enlace del Excel nuevo' }), enlace]),
      estado,
      usar,
    ]);
  }

  // Una cifra en su cajita: título pequeño, el número grande y debajo la unidad (o la fecha).
  function cifra(titulo, valor, pie) {
    return h('div', { class: 'cifra' }, [
      h('span', { class: 'cifra-titulo', texto: titulo }),
      h('strong', { class: 'cifra-valor', texto: valor }),
      h('span', { class: 'cifra-pie', texto: pie }),
    ]);
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

  // Calorías, siempre una barra por día (lo pidió él): si venía de "12 meses" en Pasos, pasa a 30 días.
  function pintarCalorias(cont) {
    if (periodo === 'anio') periodo = 'mes';
    var grafica = h('div');
    // Cada barra, andando (naranja, abajo) + entrenando (encima): la altura es el total (él, 2026-10-06). Las del
    // entreno salen de las series (Pasos.kcalEntrenoPorDia: 3 s por rep y el descanso del plan).
    var hoy = Almacen.hoyISO();
    var n = { semana: 7, mes: 30, tres: 90 }[periodo] || 30;
    var entreno = Pasos.kcalEntrenoPorDia() || {};
    var dias = Pasos.ultimos(Almacen.pasos(), n, hoy).map(function (d) {
      var andando = d.kcal || 0, entrenando = entreno[d.fecha] || 0;
      return { fecha: d.fecha, andando: andando, entrenando: entrenando, total: andando + entrenando };
    });
    Grafica.barras(grafica, dias.map(function (d) {
      return {
        etiqueta: n === 7 ? Pasos.diaSemana(d.fecha) : d.fecha.slice(8) + '/' + d.fecha.slice(5, 7),
        v: d.total, partes: [d.andando, d.entrenando],
        titulo: Grafica.fechaCorta(d.fecha) + ': ' + Grafica.miles(d.total) + ' kcal' +
          (d.entrenando ? ' (' + Grafica.miles(d.andando) + ' andando + ' + Grafica.miles(d.entrenando) + ' entrenando)' : ''),
      };
    }), { clase: 'kcal', valores: n === 7, media: n > 7 });
    var conAlgo = dias.filter(function (d) { return d.total > 0; });
    // Tres cifras en cajitas en vez de líneas sueltas (él, 2026-10-06: "mejorar los títulos").
    var cifras = null;
    if (conAlgo.length) {
      var total = conAlgo.reduce(function (t, d) { return t + d.total; }, 0);
      var mejor = conAlgo.reduce(function (m, d) { return !m || d.total > m.total ? d : m; }, null);
      cifras = h('div', { class: 'cifras' }, [
        cifra('Total', Grafica.miles(total), 'kcal'),
        cifra('Media al día', Grafica.miles(total / conAlgo.length), 'kcal'),
        cifra('🏆 Mejor día', Grafica.miles(mejor.total), 'kcal · ' + Grafica.fechaCorta(mejor.fecha)),
      ]);
    }
    var andandoTotal = conAlgo.reduce(function (t, d) { return t + d.andando; }, 0);
    var entrenoTotal = conAlgo.reduce(function (t, d) { return t + d.entrenando; }, 0);
    cont.appendChild(h('div', { class: 'tarjeta' }, [
      h('div', { class: 'ejercicio-cabecera' }, [h('h2', { texto: 'Calorías quemadas' }), selectorPeriodo(true)]),
      cifras,
      grafica,
      conAlgo.length ? h('p', { class: 'leyenda' }, [
        h('span', { class: 'muestra-punto kcal-andando' }), 'Andando ' + Grafica.miles(andandoTotal),
        h('span', { class: 'muestra-punto kcal-entreno' }), 'Entrenando ' + Grafica.miles(entrenoTotal),
      ]) : null,
      Almacen.cuerpo() && Almacen.cuerpo().peso > 0 ? null
        : h('p', { class: 'detalle', texto: 'Pon tu peso en Ajustes para ver las calorías.' }),
    ]));
  }

  function pintarDetalleTiempo(cont, e) {
    var conKm = e.dias.some(function (d) { return d.km > 0; });
    var opciones = [['min', 'Tiempo máximo (min)']].concat(conKm ? [['km', 'Distancia máxima (km)']] : []);
    var metrica = opciones.some(function (o) { return o[0] === abierto.metrica; }) ? abierto.metrica : 'min';
    var grafica = h('div');
    var selector = h('select', { 'aria-label': 'Qué mostrar', onchange: function (ev) {
      abierto.metrica = ev.target.value;
      App.repintar();
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
        App.repintar();
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

  // Evolución del ciclo: arriba el estado de fuerza (antes una pestaña aparte) y debajo lo que proyectaba el
  // Excel en cada columna frente a lo que se ha hecho.
  function pintarProgreso(cont) {
    Estado.pintar(cont);
    var datos = Almacen.progreso();
    if (!datos) {
      var caja = h('div', { class: 'tarjeta' }, [h('p', { texto: 'Cargando la evolución del ciclo…' })]);
      cont.appendChild(caja);
      Almacen.actualizarProgreso()
        .then(function () { App.repintar(); })
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

    // Como en Social (él, 2026-10-06): el selector de ciclo y la gráfica, sin explicación, buscador ni flechas.
    cont.appendChild(h('select', { class: 'selector-ciclo selector-ciclo-social', 'aria-label': 'Ciclo', onchange: function (e) {
      cicloElegido = e.target.value;
      App.repintar();
    } }, ciclos.map(function (c) { return h('option', { value: c, selected: c === ciclo, texto: c }); })));

    graficasCiclo(cont, datos, ciclo, 'historial', true);
    // Los secundarios, debajo: solo del ciclo en curso (los anteriores no tienen fechas para saber qué series eran).
    if (ciclo === ciclos[ciclos.length - 1]) graficasSecundarios(cont, 'historial');
  }

  // Ejercicio a la vista en cada carrusel ('historial', 'social-<persona>'), para no perderlo al repintar.
  var carruselVisto = {};

  // Una gráfica por ejercicio con lo proyectado frente a lo hecho en un ciclo, en un carrusel que se pasa de lado,
  // con buscador para saltar a un ejercicio. También la usa la pestaña Social, con soloGrafica: sin buscador ni
  // flechas, solo el carrusel (él, 2026-10-06: "solo la gráfica y el selector de ciclos").
  function graficasCiclo(cont, datos, ciclo, clave, soloGrafica) {
    clave = clave || 'historial';
    var filas = datos.filas.filter(function (f) { return f.ciclo === ciclo; });
    var etiquetas = filas.map(function (f) { return f.columna.replace('col ', ''); });
    var diapositivas = [];
    // Lo que tocaba al ejercicio cambiado en las columnas que no se hizo solo se puede calcular con el plan y los
    // 1RM de este móvil: en Social, con lo de la otra persona, solo salen los días que lo hizo.
    var config = Almacen.config();
    var propio = !/^social-/.test(clave) || (config && clave === 'social-' + config.persona);
    // Las columnas del plan de un principal por su nombre (para la progresión del ejercicio cambiado).
    function principalDelPlan(titulo) {
      var plan = Almacen.plan();
      var encontrado = null;
      Object.keys((plan && plan.entrenos) || {}).forEach(function (en) {
        plan.entrenos[en].forEach(function (ej) {
          if (!encontrado && ej.tipo === 'principal' && (ej.nombreCorto || ej.nombre) === titulo) encontrado = ej;
        });
      });
      return encontrado;
    }
    function columnasDelPlan(titulo) {
      var ej = principalDelPlan(titulo);
      return ej ? ej.columnas : null;
    }
    // El 1RM del ejercicio cambiado: Recopilatorio, casilla amarilla o, si no, su historial (Grupos.rmParaCambio).
    function rmDe(nombre) {
      return Grupos.rmParaCambio(nombre);
    }
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
      // Lo que tocaba al ejercicio cambiado en la columna i: lo apuntado al cambiar o, si no se sabía (sin 1RM
      // entonces), su 1RM de ahora con el % de la columna de este principal.
      var columnas = propio && !enReps ? columnasDelPlan(titulo) : null;
      function tocoDe(con, i) {
        var c = cambios[i];
        if (c && c.con === con && c.toco != null) return c.toco;
        var e = etiquetas[i];
        var col = columnas && columnas[(e === 'AMRAP' ? Calendario.COLUMNAS : Number(e)) - 1];
        var rm = col ? rmDe(con) : null;
        return col && rm > 0 ? Grupos.kgDesdeRM(rm, col.detalle) : null;
      }
      var marcas = cambios.map(function (c, i) {
        if (!c) return null;
        c = Object.assign({}, c, { toco: tocoDe(c.con, i) });
        var parte = c.toco > 0 && realizado[i] > 0 ? realizado[i] / c.toco : null;
        var valor = parte != null && estimado[i] > 0 ? Math.round(estimado[i] * parte * 10) / 10 : null;
        return {
          con: c.con,
          valor: valor,
          suelto: realizado[i],
          toco: c.toco,
          texto: c.con + (realizado[i] != null ? ' · ' + formato(realizado[i]) + unidad : '') +
            (c.toco != null ? ' de ' + formato(c.toco) + unidad + ' que tocaban' : '') +
            (valor != null ? ' · cuenta como ' + formato(valor) + unidad : ''),
        };
      });

      // Sin la línea de "N de 8 columnas hechas · diferencia media" (él, 2026-10-06: fuera de todos lados).
      var grafica = h('div');
      var nodo = h('div', { class: 'tarjeta progreso-ejercicio diapositiva' }, [
        h('div', { class: 'ejercicio-cabecera' }, [
          h('h3', { texto: titulo }),
          enReps ? h('span', { class: 'chip corporal', texto: 'Peso corporal' }) : null,
        ]),
        grafica,
      ]);
      Grafica.comparar(grafica, etiquetas, estimado, realizado, marcas, unidad);

      // Justo debajo, la gráfica de cada ejercicio con el que se cambió (él, 2026-10-06): su progresión entera
      // en este ciclo (lo que le tocaba en cada columna con su 1RM y el % de la columna) frente a lo que hiciste
      // con él, para ver si la estás cumpliendo.
      var otros = [];
      marcas.forEach(function (m) {
        if (m && otros.indexOf(m.con) < 0) otros.push(m.con);
      });
      botonCambios(nodo, titulo, otros.map(function (con) {
        var tocaban = etiquetas.map(function (e, i) { return tocoDe(con, i); });
        var hechos = etiquetas.map(function (e, i) {
          return cambios[i] && cambios[i].con === con && realizado[i] != null ? realizado[i] : null;
        });
        return { con: con, pintar: function (g) { Grafica.comparar(g, etiquetas, tocaban, hechos, [], unidad); } };
      }));
      diapositivas.push({ titulo: titulo, nodo: nodo });
    });

    if (!diapositivas.length) {
      cont.appendChild(h('p', { class: 'vacio', texto: 'Ningún ejercicio tiene datos en este ciclo.' }));
      return;
    }
    carrusel(cont, diapositivas, clave, soloGrafica);
  }

  // Los ejercicios con los que se cambió: un botón "⇄ N" a la derecha del nombre (él, 2026-10-06: así todas las
  // tarjetas miden lo mismo). Al tocarlo, una hoja para elegir cuál (con uno solo, directamente) y su gráfica
  // en la misma hoja. cambios: [{ con, pintar(contenedor) }]. Lo pone en la cabecera de la tarjeta nodo.
  function botonCambios(nodo, titulo, cambios) {
    if (!cambios.length) return;
    function ver(c) {
      var g = h('div', { class: 'sustituto-hoja' });
      App.abrirSelector(c.con, [
        h('p', { class: 'detalle', texto: 'En lugar de ' + titulo }),
        g,
        cambios.length > 1 ? h('button', { type: 'button', class: 'discreto', texto: '‹ Otro ejercicio', onclick: elegir }) : null,
      ]);
      c.pintar(g);
    }
    function elegir() {
      if (cambios.length === 1) return ver(cambios[0]);
      App.abrirSelector('Cambios en ' + titulo, cambios.map(function (c) {
        return h('button', { type: 'button', class: 'opcion-cambio', texto: '⇄ ' + c.con, onclick: function () { ver(c); } });
      }));
    }
    var cabecera = nodo.querySelector('.ejercicio-cabecera');
    cabecera.appendChild(h('button', { type: 'button', class: 'chip chip-cambio', texto: '⇄ ' + cambios.length,
      'aria-label': 'Ejercicios con los que cambiaste: ' + cambios.map(function (c) { return c.con; }).join(', '), onclick: elegir }));
  }

  // Las gráficas una al lado de otra, que se pasan con el dedo (y, sin soloGrafica, buscador y flechas).
  // diapositivas: [{ titulo, nodo }]. Se recuerda la que se estaba viendo (carruselVisto[clave]).
  function carrusel(cont, diapositivas, clave, soloGrafica) {
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

    if (!soloGrafica) cont.appendChild(h('div', { class: 'carrusel-barra' }, [
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

  // ---- Secundarios en la evolución del ciclo (él, 2026-10-06) ----
  // Una gráfica por secundario, weak point o jump del plan (no los de su peso ni los de tiempo), con las 8
  // columnas del ciclo en curso: lo que tocaba (el peso que propuso la app ese día: guardado con cada serie o,
  // si es de antes, recalculado con Ajuste.secundario hasta ese día) frente al peso de trabajo que hiciste. El
  // punto, verde si llegaste arriba del rango (o a lo que pedía el escalón), dorado dentro del rango y rojo si te
  // quedaste corto. La siguiente columna sin hacer enseña lo que te toca. Solo con lo de este móvil.
  function graficasSecundarios(cont, clave) {
    var plan = Almacen.plan();
    if (!plan || !plan.entrenos || typeof Progreso === 'undefined') return;
    var inicio = Progreso.inicioCiclo(Almacen.hoyISO());
    var delCiclo = Almacen.series().filter(function (s) { return s.fecha >= inicio && s.entreno && s.columna; });
    var etiquetas = [];
    for (var c = 1; c <= Calendario.COLUMNAS; c++) etiquetas.push(c === Calendario.COLUMNAS ? 'AMRAP' : String(c));
    var cuantos = {};
    Calendario.ORDEN.forEach(function (entreno) {
      (plan.entrenos[entreno] || []).forEach(function (ej) {
        var n = ej.nombreCorto || ej.nombre;
        cuantos[n] = (cuantos[n] || 0) + 1;
      });
    });
    var nombreCol = function (e) { return e === 'AMRAP' ? 'RM' : 'Col ' + e; };
    var textoSeries = function (lista) { return lista.map(function (s) { return formato(s.kg) + (s.reps ? '×' + s.reps : ''); }).join(', '); };
    var LEYENDA = ' <span class="muestra real"></span> Hecho <span class="muestra-punto bien"></span> Arriba' +
      ' <span class="muestra-punto medio"></span> En el rango <span class="muestra-punto mal"></span> Corto';

    // Las series de una columna (la última vez que se hizo, si se repitió al recuperar), o [].
    function deColumna(lista, i) {
      var deCol = lista.filter(function (s) { return s.columna === i + 1; });
      var fecha = deCol.reduce(function (m, s) { return s.fecha > m ? s.fecha : m; }, '');
      return deCol.filter(function (s) { return s.fecha === fecha; }).sort(function (a, b) { return a.serie - b.serie; });
    }

    // Lo de una columna hecha: lo que tocaba (guardado con las series o recalculado hasta ese día), el peso de
    // trabajo (el mayor), cómo salió (bien: arriba del rango o escalón cumplido; medio: en el rango; mal: corto).
    function resumen(deCol, col, nombreEj, entreno) {
      var objetivos = deCol.map(function (s) { return Number(s.kgObjetivo); }).filter(function (v) { return v > 0; });
      var toco = objetivos.length ? Math.max.apply(null, objetivos) : null;
      if (toco == null) {
        try { var p = Ajuste.secundario(nombreEj, col, entreno, deCol[0].fecha); toco = p ? p.kg : null; } catch (er) { toco = null; }
      }
      var rMin = parseInt(((col.series || [])[0] || {}).reps, 10);
      var tope = Number((String(((col.series || [])[0] || {}).reps || '').match(/(\d+)\s*$/) || [])[1]) || rMin;
      var corto = deCol.some(function (s) { return s.reps < (Number(s.repsObjetivo) || rMin || 0); });
      var escalonado = deCol.some(function (s) { return Number(s.repsObjetivo) > 0 && rMin && Number(s.repsObjetivo) < rMin; });
      var arriba = deCol.every(function (s) {
        var ro = Number(s.repsObjetivo);
        if (ro > 0 && rMin && ro < rMin) return s.reps >= ro;
        return escalonado ? s.reps >= (rMin || 0) : s.reps >= tope - 1;
      });
      return {
        toco: toco,
        trabajo: Math.max.apply(null, deCol.map(function (s) { return Number(s.kg); })),
        estado: corto ? 'mal' : arriba ? 'bien' : 'medio',
        hiciste: deCol.map(function (s) { return formato(s.kg) + '×' + s.reps; }).join(', '),
      };
    }

    // La proyección del principio del ciclo de un ejercicio en el hueco de ej (la discontinua), o null.
    function proyectar(nombreEj, ej, entreno) {
      try { return Ajuste.proyeccion(nombreEj, ej.columnas, entreno, inicio); } catch (er) { return null; }
    }

    var diapositivas = [];
    Calendario.ORDEN.forEach(function (entreno) {
      (plan.entrenos[entreno] || []).forEach(function (ej) {
        if (ej.tipo === 'principal' || Grupos.esCorporal(ej.nombre) || Grupos.porTiempo(ej.nombre)) return;
        var nombre = ej.nombreCorto || ej.nombre;
        var clave2 = Grupos.normalizar(ej.nombre);
        var delEntreno = delCiclo.filter(function (s) { return s.entreno === entreno && s.kg > 0 && s.reps > 0; });
        // Las suyas, sin las que hizo en el hueco de otro (esas van en la gráfica de aquel).
        var suyas = delEntreno.filter(function (s) {
          return Grupos.normalizar(s.ejercicio) === clave2 && !(s.sustituye && Grupos.normalizar(s.sustituye) !== clave2);
        });
        // Hechas con otro ejercicio en su hueco ("⇄ Cambiar").
        var cambiadas = delEntreno.filter(function (s) {
          return s.sustituye && Grupos.normalizar(s.sustituye) === clave2 && Grupos.normalizar(s.ejercicio) !== clave2;
        });
        if (!suyas.length && !cambiadas.length) return;
        var proyectado = proyectar(ej.nombre, ej, entreno);
        var linea = etiquetas.map(function (e, i) { return proyectado && proyectado[i] ? proyectado[i].kg : null; });
        var tocaba = [], hecho = [], estados = [], textos = [], marcas = [];
        var ultimaHecha = -1;
        var otros = [];
        etiquetas.forEach(function (e, i) {
          var col = ej.columnas[i] || {};
          var cabeza = nombreCol(e) + (proyectado && proyectado[i] ? ' · previsto ' + textoSeries(proyectado[i].series) : '');
          var deCol = deColumna(suyas, i);
          var deCambio = deCol.length ? [] : deColumna(cambiadas, i);
          if (!deCol.length && !deCambio.length) {
            tocaba.push(null); hecho.push(null); estados.push(null); marcas.push(null);
            textos.push(proyectado && proyectado[i] ? cabeza : null);
            return;
          }
          ultimaHecha = i;
          if (deCol.length) {
            var r = resumen(deCol, col, ej.nombre, entreno);
            tocaba.push(r.toco); hecho.push(r.trabajo); estados.push(r.estado); marcas.push(null);
            textos.push(cabeza + '\nHiciste ' + r.hiciste +
              (r.toco && (!proyectado || !proyectado[i] || r.toco !== proyectado[i].kg) ? ' (te tocaban ' + formato(r.toco) + ')' : ''));
            return;
          }
          // Hecha con otro ejercicio: ✕ en la proporción de lo que cumpliste en el otro (como en los principales).
          var con = deCambio[0].ejercicio;
          if (otros.indexOf(con) < 0) otros.push(con);
          var rc = resumen(deCambio, col, con, entreno);
          var valor = rc.toco > 0 && linea[i] > 0 ? Math.round(linea[i] * rc.trabajo / rc.toco * 10) / 10 : null;
          tocaba.push(null); hecho.push(rc.trabajo); estados.push(rc.estado);
          marcas.push({ con: con, valor: valor, suelto: rc.trabajo, toco: rc.toco });
          textos.push(cabeza + '\n' + con + ': ' + rc.hiciste + (rc.toco ? ' (tocaban ' + formato(rc.toco) + ')' : ''));
        });
        // Sin proyección: la discontinua es lo que tocó cada día y, en la siguiente columna, lo que te toca.
        if (!proyectado) {
          linea = tocaba;
          var sig = ultimaHecha + 1;
          if (sig < etiquetas.length) {
            var p = null;
            try { p = Ajuste.secundario(ej.nombre, ej.columnas[sig], entreno); } catch (er) { p = null; }
            if (p && p.kg) {
              linea[sig] = p.kg;
              textos[sig] = nombreCol(etiquetas[sig]) + ' · te toca ' + textoSeries(p.series);
            }
          }
        }
        var grafica = h('div');
        var nodo = h('div', { class: 'tarjeta progreso-ejercicio diapositiva' }, [
          h('div', { class: 'ejercicio-cabecera' }, [
            h('h3', { texto: nombre }),
            h('span', { class: 'tipo', texto: (cuantos[nombre] > 1 ? entreno + ' · ' : '') + ((ej.columnas[0] || {}).objetivo || '') }),
          ]),
          grafica,
        ]);
        Grafica.comparar(grafica, etiquetas, linea, hecho, marcas, ' kg', {
          estados: estados, textos: textos,
          leyenda: '<span class="muestra estimado"></span> ' + (proyectado ? 'Previsto' : 'Tocaba') + LEYENDA +
            (otros.length ? ' <span class="muestra cambio">✕</span> Cambiado' : ''),
        });
        // Cada ejercicio con el que se cambió, tras el botón "⇄ N": su proyección y lo que hiciste con él.
        botonCambios(nodo, nombre, otros.map(function (con) {
          var susSeries = cambiadas.filter(function (s) { return s.ejercicio === con; });
          return { con: con, pintar: function (g) {
            var pro = proyectar(con, ej, entreno);
            var l2 = [], h2 = [], e2 = [], t2 = [];
            etiquetas.forEach(function (e, i) {
              var cab = nombreCol(e) + (pro && pro[i] ? ' · previsto ' + textoSeries(pro[i].series) : '');
              var dc = deColumna(susSeries, i);
              var r2 = dc.length ? resumen(dc, ej.columnas[i] || {}, con, entreno) : null;
              l2.push(pro && pro[i] ? pro[i].kg : r2 ? r2.toco : null);
              h2.push(r2 ? r2.trabajo : null);
              e2.push(r2 ? r2.estado : null);
              t2.push(r2 ? cab + '\nHiciste ' + r2.hiciste : pro && pro[i] ? cab : null);
            });
            Grafica.comparar(g, etiquetas, l2, h2, [], ' kg', {
              estados: e2, textos: t2,
              leyenda: '<span class="muestra estimado"></span> ' + (pro ? 'Previsto' : 'Tocaba') + LEYENDA,
            });
          } };
        }));
        diapositivas.push({ titulo: nombre + (cuantos[nombre] > 1 ? ' ' + entreno : ''), nodo: nodo });
      });
    });
    if (!diapositivas.length) return;
    cont.appendChild(h('h2', { class: 'titulo-seccion', texto: 'Secundarios' }));
    carrusel(cont, diapositivas, clave + '-secundarios', true);
  }
  // Desde Inicio: Historial → Evolución del ciclo con el estado de fuerza desplegado.
  App.abrirEstado = function () {
    apartado = 'ciclo';
    abierto = null;
    Estado.desplegar();
    App.mostrar('historial', 'izquierda');
  };

  // Cambiar o quitar un ejercicio toca la lista de los dos, así que solo sale en el móvil de quien manda.
  function botonesEjercicio(e) {
    if (!(Almacen.plan() || {}).puedeEditar || e.pasos) return null;
    return h('div', { class: 'acciones-ejercicio' }, [
      h('button', { type: 'button', class: 'discreto con-icono', onclick: function () { editarEjercicio(e); } }, [Iconos.editar(), 'Editar']),
      h('button', { type: 'button', class: 'discreto con-icono', onclick: function () { quitarEjercicio(e); } }, [Iconos.borrar(), 'Quitar']),
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

  // Una fila de Ajustes: icono, nombre, lo que tiene puesto y una flecha. Al tocarla se abre lo suyo.
  function fila(icono, titulo, valor, alTocar) {
    return h('button', { type: 'button', class: 'fila-ajuste', onclick: alTocar }, [
      typeof icono === 'string' ? h('span', { class: 'fila-ajuste-icono', 'aria-hidden': 'true', texto: icono })
        : h('span', { class: 'fila-ajuste-icono' }, [icono]),
      h('span', { class: 'fila-ajuste-titulo', texto: titulo }),
      h('span', { class: 'fila-ajuste-valor', texto: valor || '' }),
      h('span', { class: 'fila-ajuste-flecha', 'aria-hidden': 'true', texto: '›' }),
    ]);
  }

  function grupo(cont, titulo, hijos) {
    cont.appendChild(h('p', { class: 'ajustes-grupo-titulo', texto: titulo }));
    cont.appendChild(h('div', { class: 'tarjeta ajustes-grupo' }, hijos));
  }

  function resumenCuerpo(cuerpo) {
    if (!cuerpo) return 'Pon tu sexo, edad y peso';
    var edad = cuerpo.nacimiento ? Fuerza.edadEn(cuerpo.nacimiento, Almacen.hoyISO()) : cuerpo.edad;
    return [cuerpo.sexo === 'mujer' ? 'Mujer' : 'Hombre', edad ? edad + ' años' : null, formato(cuerpo.peso) + ' kg']
      .filter(Boolean).join(' · ');
  }

  // Arriba: la foto (se toca para cambiarla), el nombre y los datos del cuerpo.
  function perfil(cont, c) {
    var miFoto = Almacen.foto(c.persona);
    var cuerpo = Almacen.cuerpo();
    var archivo = h('input', { type: 'file', accept: 'image/*', 'aria-label': miFoto ? 'Cambiar foto' : 'Elegir foto' });
    var guardarFoto = function (imagen, hecho) {
      Almacen.guardarFoto(imagen)
        .then(function () { App.avisar(hecho); App.mostrar('ajustes'); })
        .catch(function (e) { App.avisar(e.message, true); });
    };
    // Se reduce aquí (una celda del Excel no aguanta más) y se guarda en el Excel común: la ve también el otro móvil.
    archivo.addEventListener('change', function () {
      var f = archivo.files && archivo.files[0];
      if (!f) return;
      App.avisar('Preparando la foto…');
      reducirFoto(f)
        .then(function (imagen) { guardarFoto(imagen, 'Foto guardada'); })
        .catch(function (e) { App.avisar(e.message, true); });
    });
    var foto = h('label', { class: 'perfil-foto' + (miFoto ? '' : ' sin-foto') }, [
      miFoto ? null : Iconos.perfil(),
      h('span', { class: 'perfil-foto-editar', 'aria-hidden': 'true' }, [Iconos.editar()]),
      archivo,
    ]);
    if (miFoto) foto.style.backgroundImage = 'url("' + miFoto + '")';

    cont.appendChild(h('section', { class: 'tarjeta perfil' }, [
      foto,
      h('div', { class: 'perfil-datos' }, [
        h('strong', { class: 'perfil-nombre', texto: c.nombre || c.persona }),
        h('span', { class: 'detalle', texto: resumenCuerpo(cuerpo) }),
        h('div', { class: 'perfil-botones' }, [
          h('button', { type: 'button', class: 'chip con-icono', onclick: function () {
            var caja = h('div');
            Estado.formulario(caja, cuerpo, function () {
              App.cerrarSelector();
              App.mostrar('ajustes');
            });
            var tarjeta = caja.firstChild;
            var h2 = tarjeta && tarjeta.querySelector('h2');
            if (h2) h2.remove();
            App.abrirSelector('Tus datos', tarjeta ? Array.prototype.slice.call(tarjeta.childNodes) : []);
          } }, [Iconos.editar(), 'Editar datos']),
          miFoto ? h('button', { type: 'button', class: 'chip con-icono', onclick: function () { guardarFoto('', 'Foto quitada'); } },
            [Iconos.borrar(), 'Quitar foto']) : null,
        ]),
      ]),
    ]));
  }

  function editarObjetivoPasos() {
    var objetivo = h('input', { type: 'number', inputmode: 'numeric', step: '500', min: '500', value: Almacen.objetivoPasos(), 'aria-label': 'Pasos al día' });
    App.abrirSelector('Objetivo de pasos', [
      h('label', { class: 'campo' }, [h('span', { texto: 'Pasos al día' }), objetivo]),
      h('button', { type: 'button', class: 'principal', texto: 'Guardar', onclick: function () {
        var n = Math.round(App.numero(objetivo.value));
        if (!(n >= 500 && n <= 100000)) {
          App.avisar('Pon un número de pasos entre 500 y 100.000', true);
          return;
        }
        Almacen.guardarObjetivoPasos(n);
        App.cerrarSelector();
        App.avisar('Objetivo guardado: ' + Grafica.miles(n) + ' pasos');
        App.mostrar('ajustes');
      } }),
      botonNotificacion(),
    ]);
  }

  // Notificación fija con los pasos de hoy, dentro de "Objetivo de pasos" (él, 2026-10-10). Solo en la app de
  // Android, que es quien la pone con su contador; en el navegador no sale.
  function botonNotificacion() {
    if (!Pasos.disponible()) return null;
    if (!Pasos.hayNotificacion()) {
      return h('button', { type: 'button', class: 'discreto', texto: '🔔 Activar notificación', onclick: function () {
        App.avisar('Hace falta la versión nueva de la app de Android', true);
      } });
    }
    var activa = Pasos.notificacionActiva();
    var boton = h('button', { type: 'button', class: 'discreto', texto: activa ? '🔕 Quitar notificación' : '🔔 Activar notificación', onclick: function () {
      boton.disabled = true;
      Pasos.ponerNotificacion(!activa).then(function (r) {
        if (!activa && !r.activa) {
          App.avisar(r.motivo === 'sinSensor' ? 'Este móvil no cuenta pasos'
            : r.motivo === 'sinNotificaciones' ? 'Dale permiso para enseñar notificaciones' : 'Dale permiso para contar los pasos', true);
        } else {
          App.avisar(r.activa ? 'Verás los pasos en la notificación' : 'Notificación quitada');
        }
        App.cerrarSelector();
        App.repintar();
      }).catch(function (e) {
        boton.disabled = false;
        App.avisar((e && e.message) || String(e), true);
      });
    } });
    return boton;
  }

  // Lo técnico: la conexión con la API, el enlace de configuración y los últimos fallos. Casi nunca hace falta.
  function avanzado(cont, c, abierto) {
    var url = h('input', { type: 'url', value: c.url, placeholder: 'https://script.google.com/macros/s/…/exec' });
    var clave = h('input', { type: 'password', value: c.clave, autocomplete: 'off' });
    // Sin nombres en el código publicado: el usuario y su nombre llegan con el enlace de configuración.
    var persona = h('input', { value: c.persona || '', autocomplete: 'off', autocapitalize: 'none' });
    var guardar = h('button', { class: 'principal', texto: 'Guardar y probar' });
    var conectar = function (nueva, boton) {
      if (Almacen.config() && Almacen.config().persona !== nueva.persona && Almacen.pendientes()) {
        App.avisar('Antes de cambiar de persona sube las series pendientes', true);
        return;
      }
      Almacen.guardarConfig(nueva);
      if (boton) { boton.disabled = true; boton.textContent = 'Probando…'; }
      App.refrescarTodo()
        .then(function () {
          App.avisar('Conectado · ' + Almacen.config().nombre);
          App.mostrar('inicio');
        })
        .catch(function (e) {
          App.avisar(e.message, true);
          App.mostrar('ajustes');
        });
    };
    guardar.addEventListener('click', function () {
      var p = persona.value.trim().toLowerCase();
      conectar({
        url: url.value.trim(), clave: clave.value.trim(), persona: p,
        nombre: c.persona === p && c.nombre ? c.nombre : persona.value.trim(),
      }, guardar);
    });

    // En la app de Android el enlace de configuración se abre en el navegador, no en ella: se pega aquí.
    var enlace = h('input', { type: 'url', placeholder: 'https://…#config=…', autocomplete: 'off', 'aria-label': 'Enlace de configuración' });
    var hijos = [
      h('p', { class: 'ajustes-sub', texto: 'Enlace de configuración' }),
      h('p', { class: 'detalle', texto: 'Mantén pulsado el enlace, cópialo y pégalo aquí.' }),
      h('div', { class: 'otro' }, [enlace, h('button', { type: 'button', class: 'principal', texto: 'Usar', onclick: function () {
        var nueva = configDeEnlace(enlace.value);
        if (!nueva) {
          App.avisar('Ese no es un enlace de configuración', true);
          return;
        }
        conectar(nueva, null);
      } })]),
      h('p', { class: 'ajustes-sub', texto: 'Conexión' }),
      h('label', { class: 'campo' }, [h('span', { texto: 'Dirección de la API (Apps Script)' }), url]),
      h('label', { class: 'campo' }, [h('span', { texto: 'Clave' }), clave]),
      h('label', { class: 'campo' }, [h('span', { texto: 'Usuario' }), persona]),
      guardar,
    ];
    // Si algo se rompe en el móvil, aquí queda escrito qué fue.
    var fallos = Almacen.fallos();
    if (fallos.length) {
      hijos.push(h('p', { class: 'ajustes-sub', texto: 'Últimos fallos' }));
      fallos.slice().reverse().forEach(function (f) { hijos.push(h('p', { class: 'detalle', texto: f.cuando + ' · ' + f.texto })); });
    }
    plegable(cont, 'Avanzado', c.persona ? 'Conectado' + (fallos.length ? ' · ' + fallos.length + (fallos.length === 1 ? ' fallo' : ' fallos') : '') : 'Sin configurar', hijos, abierto);
  }

  App.vistas.ajustes = function (cont) {
    var c = Almacen.config() || { url: '', clave: '', persona: '' };
    // Sin configurar solo hay una cosa que hacer: conectarse.
    if (!Almacen.config()) {
      avanzado(cont, c, true);
      return;
    }

    perfil(cont, c);

    var rutina = Almacen.rutina();
    grupo(cont, 'Entreno', [
      fila(Iconos.entreno(), 'Tus rutinas', rutina ? rutina.nombre : 'Crear', function () {
        App.mostrar('rutina');
      }),
      fila(Iconos.pasos(), 'Objetivo de pasos', Grafica.miles(Almacen.objetivoPasos()) + ' al día', editarObjetivoPasos),
    ]);

    // Aspecto: un interruptor que dice "Oscuro" o "Claro" (él, 2026-10-10: sin los iconos de antes).
    var oscuro = Tema.actual() === 'oscuro';
    grupo(cont, 'Aspecto', [h('button', { type: 'button', class: 'fila-ajuste interruptor-tema', role: 'switch',
      'aria-checked': oscuro ? 'true' : 'false', 'aria-label': 'Aspecto oscuro', onclick: function () {
        Tema.poner(oscuro ? 'claro' : 'oscuro');
        App.repintar();
      } }, [
      h('span', { class: 'fila-ajuste-titulo', texto: oscuro ? 'Oscuro' : 'Claro' }),
      h('span', { class: 'interruptor' + (oscuro ? ' encendido' : ''), 'aria-hidden': 'true' }, [h('span', { class: 'interruptor-bola' })]),
    ])]);

    // Todo vive en el móvil; el Excel es la copia por si acaso.
    // Lo que falta por copiar: series y 1RM guardados en el móvil que aún no llegaron al Excel.
    // Para copiar ya, el botón "Al día / N por subir" de arriba (él, 2026-10-10: la fila "Copia en el Excel" sobraba).
    var pendientes = Almacen.pendientes() + Almacen.porCopiar();
    // Traer del Excel: la primera vez trae todo (un minuto largo); después, cada 6 horas, lo nuevo.
    var trae = Almacen.estadoTraer();
    var hora = function (t) {
      var d = new Date(t);
      var hoy = new Date().toDateString() === d.toDateString();
      return (hoy ? 'hoy' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })) + ' a las ' +
        d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    };
    var textoTraer = trae.trayendo
      ? (trae.primeraVez ? 'Trayendo tus datos del Excel… (la primera vez tarda un minuto o dos)' : 'Trayendo lo nuevo del Excel…') +
        ' · desde las ' + new Date(trae.trayendo).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : trae.fallo ? 'No se pudo traer del Excel: ' + trae.fallo
        : trae.traido ? 'Traídos del Excel ' + hora(trae.traido) + ' · ' + Almacen.series().length + ' series en el móvil'
          : 'Todavía sin traer del Excel';
    var reintentar = !trae.trayendo && (trae.fallo || !trae.traido) ? h('button', { type: 'button', class: 'discreto', texto: 'Traer ahora', onclick: function () {
      Almacen.traerDelExcel().then(function () { App.avisar('Datos traídos del Excel'); }).catch(function (e) { App.avisar(e.message, true); })
        .then(function () { if (document.querySelector('.traer-excel')) App.mostrar('ajustes'); });
      App.mostrar('ajustes');
    } }) : null;
    // Copia de seguridad (él, 2026-10-10): la app funciona sola y el Excel de cada uno es solo la copia, así que aquí
    // solo va su Excel (para abrirlo) y cómo va la copia. Lo de traer del Excel solo sale si falta o falló.
    var excel = Almacen.enlaceExcel();
    var filas = [
      // ✅ si la copia está al día; ❌ si queda algo por copiar (él, 2026-10-10).
      fila(pendientes ? '❌' : '✅', 'Tu Excel', excel ? 'Abrir o cambiar' : 'Elegir', function () { elegirExcel(excel); }),
    ];
    if (trae.trayendo || trae.fallo || !trae.traido) {
      filas.push(h('div', { class: 'traer-excel' + (trae.trayendo ? ' trayendo' : '') }, [
        h('span', { class: 'fila-ajuste-icono', 'aria-hidden': 'true', texto: trae.trayendo ? '⏳' : trae.fallo ? '⚠️' : '·' }),
        h('span', { class: 'detalle', texto: textoTraer }),
        reintentar,
      ]));
    }
    grupo(cont, 'Copia de seguridad', filas);
    // Mientras trae, se repinta al acabar para que se vea el resultado (si se sigue en Ajustes).
    if (trae.trayendo) {
      var mirar = setInterval(function () {
        if (!document.querySelector('.traer-excel.trayendo')) { clearInterval(mirar); return; }
        if (!Almacen.estadoTraer().trayendo) { clearInterval(mirar); App.mostrar('ajustes'); }
      }, 1500);
    }

    // Lo técnico (enlace de configuración, conexión) ya no sale una vez configurada la app (él, 2026-10-10: "si el
    // usuario no lo necesita, quítalo"). Solo los fallos, plegados y si los hay, para saber qué pasó en un móvil.
    var fallos = Almacen.fallos();
    if (fallos.length) {
      plegable(cont, 'Fallos', String(fallos.length), fallos.slice().reverse().map(function (f) {
        return h('p', { class: 'detalle', texto: f.cuando + ' · ' + f.texto });
      }), false);
    }
  };
})();
