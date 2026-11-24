// Pestañas Historial y Ajustes de Ares.
(function () {
  var h = App.h;
  var formato = App.formato;
  var abierto = null;      // ejercicio abierto en el historial
  var busqueda = '';
  var diasVisibles = 30;
  var apartado = null;          // null = el menú; "ciclo", "ejercicios", "fuerza", "actividad" o "salud"
  var apartadoPedido = false;   // abrirEstado / abrirSalud: al entrar, esa sección y no el menú
  var periodo = 'mes';           // gráfica de pasos: "semana", "mes" o "tres"
  var periodoKcal = 'mes';       // gráfica de calorías: igual, sin "anio" (siempre una barra por día)
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
    // Los pasos ya no van aquí: están en Historial → Actividad.
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

  // El icono de Ciclo: una línea que sube con sus puntos, del color del acento (como los iconos suyos).
  function iconoCiclo() {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icono-ciclo');
    svg.innerHTML = '<path d="M3 20h18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M4 16l5-5 4 3 7-8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="9" cy="11" r="1.8" fill="currentColor"/><circle cx="13" cy="14" r="1.8" fill="currentColor"/><circle cx="20" cy="6" r="1.8" fill="currentColor"/>';
    return svg;
  }

  // El menú de Historial: una fila grande por sección, con su icono y un resumen de cómo va.
  function pintarMenu(cont, todos) {
    var resumen = {};
    var intenta = function (f) { try { return f(); } catch (e) { return ''; } };
    var hoy = Almacen.hoyISO();
    var grande = function (n) {
      return n >= 1e6 ? String(Math.round(n / 1e5) / 10).replace('.', ',') + ' M' : Grafica.miles(Math.round(n));
    };
    // Ciclo: el número y una frase según cómo van los ejercicios frente a lo previsto (él, 2026-11-08: "si vas bien,
    // camino a la gloria; si vas mal, otro mensaje"). La cuenta sale de pintar el ciclo (fuera de la vista si hace falta).
    resumen.ciclo = intenta(function () {
      if (!cuentaCiclo || cuentaCiclo.dia !== hoy || cuentaCiclo.series !== Almacen.series().length) {
        var guardado = cicloElegido;
        cicloElegido = null;
        try { pintarCiclo(h('div')); } finally { cicloElegido = guardado; }
      }
      if (!cuentaCiclo) return 'Lo previsto frente a lo hecho';
      var c = cuentaCiclo.cuenta, total = c.encima + c.previsto + c.debajo;
      var bien = total ? (c.encima + c.previsto) / total : null;
      var frase = bien == null ? 'aún sin entrenos' : bien >= 0.8 ? '¡camino a la gloria!' : bien >= 0.6 ? 'vas por buen camino'
        : bien >= 0.4 ? 'regular, toca apretar' : 'por detrás de lo previsto, a remontar';
      return cuentaCiclo.ciclo + ' · ' + frase;
    });
    // Ejercicios: los que tienen series y cuántos van por encima de su media (la última sesión frente a la media de
    // todas, con 3 sesiones o más y alguna en los últimos 60 días; sin los de tiempo ni los asistidos).
    resumen.ejercicios = intenta(function () {
      var conSeries = todos.filter(function (e) { return e.dias.length; });
      var encima = conSeries.filter(function (e) {
        if (e.tiempo || e.dias.length < 3 || (!e.corporal && Grupos.esAsistido(e.nombre))) return false;
        if (Calendario.sumarDias(e.dias[e.dias.length - 1].f, 60) < hoy) return false;
        var vals = e.dias.map(function (d) { return e.corporal ? d.reps : d.rm; }).filter(function (v) { return v > 0; });
        if (vals.length < 3) return false;
        var media = vals.reduce(function (t, v) { return t + v; }, 0) / vals.length;
        return vals[vals.length - 1] > media;
      }).length;
      return conSeries.length + ' ejercicios · ' + encima + ' por encima de su media';
    });
    resumen.fuerza = intenta(function () {
      var r = Almacen.cuerpo() ? Estado.actual() : null;
      return r && r.total > 0 ? Grafica.num(r.total) + ' · ' + Fuerza.nivel(r.total).nombre : 'Tu nivel en los básicos';
    });
    // Actividad: lo de siempre sumado (él): pasos, calorías quemadas moviéndote (andar + gym) y horas dormidas.
    resumen.actividad = intenta(function () {
      var dias = Almacen.pasos();
      var pasos = dias.reduce(function (t, d) { return t + (d.pasos || 0); }, 0);
      var gym = Pasos.kcalEntrenoPorDia() || {};
      var kcal = dias.reduce(function (t, d) { return t + (d.kcal || 0); }, 0) +
        Object.keys(gym).reduce(function (t, f) { return t + gym[f]; }, 0);
      var noches = typeof AvisosApp !== 'undefined' && AvisosApp.descansos ? AvisosApp.descansos() : null;
      var horas = noches ? Math.round(noches.reduce(function (t, n) { return t + (n.minutos || 0); }, 0) / 60) : null;
      return grande(pasos) + ' pasos · ' + grande(kcal) + ' kcal' + (horas ? ' · ' + Grafica.miles(horas) + ' h dormidas' : '');
    });
    // Salud: el peso y lo que ha cambiado en la semana (frente al último pesaje de hace 7 días o más; si no hay, el
    // primero de esta semana).
    resumen.salud = intenta(function () {
      var pesos = Almacen.tablaComida('pesos').filter(function (x) { return x.fecha && x.kg > 0; })
        .sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
      var u = pesos[pesos.length - 1];
      if (!u) return 'Peso, grasa, músculo y agua';
      var hace = Calendario.sumarDias(u.fecha, -7);
      var antes = pesos.filter(function (x) { return x.fecha <= hace; }).pop() ||
        pesos.filter(function (x) { return x.fecha > hace && x.fecha < u.fecha; })[0];
      var kg = function (v) { return Number(v).toFixed(2).replace('.', ','); };
      if (!antes) return kg(u.kg) + ' kg · primer pesaje de la semana';
      var d = Number(u.kg) - Number(antes.kg);
      return kg(u.kg) + ' kg · ' + (Math.abs(d) < 0.05 ? 'igual' : (d > 0 ? '+' : '−') + kg(Math.abs(d)) + ' kg') + ' esta semana';
    });
    var ICONOS = { ejercicios: '🏋️', fuerza: '🏆', salud: '⚖️' };
    cont.appendChild(h('div', { class: 'historial-menu' }, APARTADOS.map(function (a) {
      var icono = a[0] === 'actividad' ? Iconos.pasos() : a[0] === 'ciclo' ? iconoCiclo() : h('span', { class: 'historial-emoji', texto: ICONOS[a[0]] });
      return h('button', { type: 'button', class: 'tarjeta historial-opcion', onclick: function () {
        apartado = a[0];
        if (a[0] === 'fuerza') Estado.desplegar();
        App.mostrar('historial', 'izquierda');
      } }, [
        h('span', { class: 'historial-icono' }, [icono]),
        h('span', { class: 'historial-texto' }, [
          h('strong', { texto: a[1] }),
          h('span', { class: 'detalle', texto: resumen[a[0]] || '' }),
        ]),
        h('span', { class: 'historial-flecha', texto: '›' }),
      ]);
    })));
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
    // Al entrar, un menú con las secciones (él, 2026-11-08: "los tipos de historial arriba quedan feos"); al tocar
    // una se abre con "‹ Historial" arriba para volver (también con el atrás del móvil).
    if (!apartado) {
      pintarMenu(cont, todos);
      return;
    }
    var seccion = APARTADOS.filter(function (a) { return a[0] === apartado; })[0];
    cont.appendChild(h('div', { class: 'historial-cabecera' }, [
      h('button', { type: 'button', class: 'discreto historial-volver', texto: '‹ Historial', onclick: function () {
        apartado = null;
        App.mostrar('historial', 'derecha');
      } }),
      h('h2', { texto: seccion ? seccion[1] : '' }),
    ]));
    if (apartado === 'ejercicios') pintarLista(cont, todos);
    else if (apartado === 'fuerza') Estado.pintar(cont);
    else if (apartado === 'actividad') pintarActividad(cont);
    else if (apartado === 'salud') pintarSalud(cont);
    else pintarCiclo(cont);
  };

  // Salud (él, 2026-11-07): peso, grasa, músculo, agua y el descanso, cada uno frente a lo que pide el plan.
  var APARTADOS = [['ciclo', 'Ciclo'], ['ejercicios', 'Ejercicios'], ['fuerza', 'Fuerza'], ['actividad', 'Actividad'], ['salud', 'Salud']];

  // ↑ subiendo / → estancado / ↓ bajando (él, 2026-11-05): las 3 últimas sesiones frente a las 3 de antes, con el
  // 1RM estimado (con su peso, las reps; con ayuda, la ayuda al revés). Sin flecha con menos de 4 sesiones o si
  // hace más de 45 días que no se hace.
  function tendencia(e) {
    if (e.tiempo || e.dias.length < 4) return null;
    var ultimo = e.dias[e.dias.length - 1].f;
    if (Calendario.sumarDias(ultimo, 45) < Almacen.hoyISO()) return null;
    var asistido = !e.corporal && Grupos.esAsistido(e.nombre);
    var valor = function (d) {
      if (e.corporal) return d.reps;
      if (asistido) {
        var ayudas = d.s.map(function (x) { return Number(x[0]) || 0; }).filter(function (v) { return v > 0; });
        return ayudas.length ? -Math.min.apply(null, ayudas) : null;
      }
      return d.rm;
    };
    var vals = e.dias.slice(-6).map(valor).filter(function (v) { return v != null && !isNaN(v); });
    if (vals.length < 4) return null;
    var media = function (l) { return l.reduce(function (t, v) { return t + v; }, 0) / l.length; };
    var ahora = media(vals.slice(-3)), antes = media(vals.slice(0, vals.length - 3));
    var base = Math.abs(antes) || 1;
    var dif = (ahora - antes) / base;
    return dif > 0.02 ? 'sube' : dif < -0.02 ? 'baja' : 'igual';
  }
  var FLECHAS = { sube: ['↑', 'Subiendo'], igual: ['→', 'Estancado'], baja: ['↓', 'Bajando'] };

  // "4 sesiones con 16 kg sin sumar reps" de los ejercicios de la rutina con doble progresión (antes solo en la ℹ️).
  function estancados() {
    var plan = Almacen.plan();
    var avisos = {};
    if (!plan || !plan.entrenos) return avisos;
    var columna = Calendario.porCalendario(Almacen.hoyISO()).columna;
    Calendario.ORDEN.forEach(function (entreno) {
      (plan.entrenos[entreno] || []).forEach(function (ej) {
        if (ej.tipo === 'principal' || Grupos.esCorporal(ej.nombre) || Grupos.porTiempo(ej.nombre)) return;
        var p = null;
        try { p = Ajuste.secundario(ej.nombre, ej.columnas[columna - 1] || ej.columnas[0], entreno); } catch (er) { p = null; }
        if (p && p.aviso) avisos[Grupos.normalizar(ej.nombre)] = p.aviso;
      });
    });
    return avisos;
  }

  function pintarLista(cont, todos) {
    var lista = h('div', { class: 'grupos-historial' });
    var avisos = estancados();
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
        var t = tendencia(e);
        var aviso = avisos[Grupos.normalizar(e.nombre)];
        return h('button', { type: 'button', class: e.enCiclo ? 'en-ciclo' : '', onclick: function () {
          abrir(e);
        } }, [
          h('span', { class: 'nombre-tendencia' }, [
            t ? h('span', { class: 'tendencia ' + t, title: FLECHAS[t][1], 'aria-label': FLECHAS[t][1], texto: FLECHAS[t][0] }) : null,
            h('span', { texto: etiqueta || e.nombre }),
            aviso ? h('span', { class: 'aviso-estancado', title: aviso, texto: '⚠' }) : null,
          ]),
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

    function abrir(e) {
      abierto = e;
      diasVisibles = 30;
      App.mostrar('historial');
    }

    buscador.addEventListener('input', function () {
      busqueda = buscador.value;
      rellenar();
    });
    rellenar();
    // Los que llevan 4 sesiones sin subir, a la vista arriba.
    var parados = todos.filter(function (e) { return avisos[Grupos.normalizar(e.nombre)]; });
    if (parados.length) {
      cont.appendChild(h('div', { class: 'tarjeta aviso-estancados' }, [
        h('h3', { texto: '⚠ Sin mejorar'}),
        h('div', { class: 'lista-historial' }, parados.map(function (e) {
          return h('button', { type: 'button', onclick: function () { abrir(e); } }, [
            h('span', { texto: e.nombre }),
            h('span', { class: 'detalle', texto: avisos[Grupos.normalizar(e.nombre)].replace(/^4 sesiones con /, '').replace(/ sin sumar reps$/, '') + ' · 4 sesiones igual' }),
          ]);
        })),
      ]));
    }
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
    if (e.tiempo) return pintarDetalleTiempo(cont, e);
    // En los de peso corporal los kg del histórico son el peso del cuerpo, que es lo que apuntaba FitNotes,
    // no una carga: se quitan para que récords, tabla y gráfica vayan solo por repeticiones.
    // Con asistencia los kg son la ayuda: menos es mejor, sin 1RM, y del día cuenta la menor.
    var asistido = !e.corporal && Grupos.esAsistido(e.nombre);
    var dias = e.corporal ? e.dias.map(function (d) {
      return Object.assign({}, d, { kg: 0, rm: 0, s: d.s.map(function (s) { return [0, s[1]]; }) });
    }) : asistido ? e.dias.map(function (d) {
      var ayudas = d.s.map(function (s) { return Number(s[0]) || 0; }).filter(function (v) { return v > 0; });
      return Object.assign({}, d, { rm: 0, kg: ayudas.length ? Math.min.apply(null, ayudas) : 0 });
    }) : e.dias;
    var analisis = Records.analizar(dias, asistido);
    // En los de peso corporal todo va en repeticiones: no hay 1RM ni peso máximo que mirar.
    var opciones = e.corporal
      ? [['reps', 'Repeticiones máximas'], ['total', 'Repeticiones del día']]
      : asistido ? [['kg', 'Ayuda'], ['reps', 'Repeticiones máximas']]
        : [['rm', '1RM estimado'], ['kg', 'Peso máximo'], ['reps', 'Repeticiones máximas']];
    var metrica = opciones.some(function (o) { return o[0] === abierto.metrica; })
      ? abierto.metrica
      : asistido ? 'kg' : e.corporal || !analisis.mejorRm ? 'reps' : 'rm';
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
      records.appendChild(h('p', { texto: (asistido ? '🏋️ Menos ayuda: ' : '🏋️ Peso máximo: ') + formato(analisis.pesoMax.kg) + ' kg × ' + analisis.pesoMax.reps +
        ' (' + Grafica.fechaCorta(analisis.pesoMax.f) + ')' }));
    }
    if (!e.corporal && analisis.repsPorPeso.length) {
      var tablaPesos = h('table', { class: 'tabla-dias' }, [h('tr', {}, [h('td', { texto: asistido ? 'Ayuda' : 'Peso' }), h('td', { texto: 'Máx. reps' }), h('td', { texto: 'Fecha' })])]);
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
      // Si se hace con ayuda: lo pone cada uno, no es de la lista común.
      App.interruptorAsistido(e.nombre, App.repintar),
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

  // Pasos y Calorías, siempre una barra por día (él, 2026-11-07: fuera "12 meses", que iba una barra por mes).
  var PERIODOS = [['semana', '7 días'], ['mes', '30 días'], ['tres', '90 días']];

  // soloDias: el de Calorías, con su propio periodo.
  function selectorPeriodo(soloDias) {
    var periodos = PERIODOS;
    var actual = soloDias ? periodoKcal : periodo;
    return h('select', { 'aria-label': 'Periodo', onchange: function (ev) {
      if (soloDias) periodoKcal = ev.target.value; else periodo = ev.target.value;
      App.repintar();
    } }, periodos.map(function (p) { return h('option', { value: p[0], selected: actual === p[0], texto: p[1] }); }));
  }

  // Barras del periodo elegido, un día por barra. campo: "pasos" o "kcal". Devuelve los días del periodo con pasos,
  // para las cuentas de debajo.
  function barrasPeriodo(contenedor, campo, opciones) {
    var hoy = Almacen.hoyISO();
    var lista = Almacen.pasos();
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

  // Historial → Actividad (él, 2026-11-05): pasos y calorías juntos (los pasos estaban en Ejercicios → Cardio).
  // Pasos y Calorías se pasan con el dedo, como las gráficas del ciclo (él, 2026-11-07); debajo, "Todos los días"
  // plegado. El descanso se fue a Salud.
  function pintarActividad(cont) {
    var caja = h('div');
    var dias = pintarPasos(caja);
    var pasos = Array.prototype.slice.call(caja.childNodes);
    caja = h('div');
    pintarCalorias(caja);
    var calorias = Array.prototype.slice.call(caja.childNodes);
    carruselConPuntos(cont, [['Pasos', pasos], ['Calorías', calorias]], 'actividad');
    // La lista de todos los días, plegada: es larga.
    if (dias) {
      var tabla = dias.lastChild;
      plegable(cont, 'Todos los días', null, [tabla], abiertoTodosDias).addEventListener('toggle', function (ev) {
        abiertoTodosDias = ev.target.open;
      });
    }
  }
  var abiertoTodosDias = false;

  // Un carrusel de tarjetas que se pasan con el dedo y, debajo, un puntito por tarjeta (Actividad y Salud).
  // diapositivas: [[titulo, [nodos]]]; las que no traen nada se quitan.
  function carruselConPuntos(cont, lista, clave) {
    var diapositivas = lista
      .filter(function (d) { return d[1].length; })
      .map(function (d) {
        // Cada una, una sola tarjeta: la de dentro deja de serlo para no ir con doble marco.
        d[1].forEach(function (n) { if (n.classList) n.classList.remove('tarjeta'); });
        return { titulo: d[0], nodo: h('div', { class: 'tarjeta diapositiva actividad-diapositiva' }, d[1]) };
      });
    if (!diapositivas.length) return;
    var puntos = h('div', { class: 'carrusel-puntos', 'aria-hidden': 'true' }, diapositivas.map(function (d) {
      return h('span', { class: 'carrusel-punto', title: d.titulo });
    }));
    carrusel(cont, diapositivas, clave, true);
    var pista = cont.lastChild;
    function marcarPunto() {
      var mejor = 0;
      diapositivas.forEach(function (d, i) {
        if (Math.abs(d.nodo.offsetLeft - pista.scrollLeft) < Math.abs(diapositivas[mejor].nodo.offsetLeft - pista.scrollLeft)) mejor = i;
      });
      Array.prototype.forEach.call(puntos.children, function (p, i) { p.classList.toggle('activo', i === mejor); });
    }
    pista.addEventListener('scroll', function () { requestAnimationFrame(marcarPunto); });
    if (diapositivas.length > 1) cont.appendChild(puntos);
    marcarPunto();
    requestAnimationFrame(marcarPunto);
  }

  // ---- Historial → Salud (él, 2026-11-07: "una gráfica del estilo ciclo que indique cómo vamos en cada aspecto") ----
  // Peso, Grasa, Músculo y Agua de los pesajes (Comida.salud) frente a lo que pide el plan de comida de cada uno, y el
  // Descanso (lo que era de Actividad). El periodo: este ciclo, 3 meses o 1 año.
  var periodoSalud = 'ciclo';
  var ASPECTOS_SALUD = [
    { id: 'kg', titulo: '⚖️ Peso', unidad: ' kg', corta: 'kg' },
    { id: 'grasa', titulo: 'Grasa', unidad: ' %', corta: '%' },
    { id: 'musculo', titulo: 'Músculo', unidad: ' kg', corta: 'kg' },
    { id: 'agua', titulo: 'Agua', unidad: ' %', corta: '%' },
  ];

  function pintarSalud(cont) {
    var hoy = Almacen.hoyISO();
    var plan = typeof App.planComida === 'function' ? App.planComida() : 'mantenimiento';
    var desdes = {
      ciclo: typeof Progreso !== 'undefined' && Progreso.inicioCiclo ? Progreso.inicioCiclo(hoy) : Calendario.sumarDias(hoy, -63),
      meses: Calendario.sumarDias(hoy, -91),
      ano: Calendario.sumarDias(hoy, -365),
    };
    var desde = desdes[periodoSalud] || desdes.ciclo;
    // Cada pesaje con su grasa, agua y músculo (lo guardado o, con la impedancia, calculado).
    var pesajes = Almacen.tablaComida('pesos').filter(function (p) { return p.fecha && p.kg > 0; }).map(function (p) {
      var c = typeof App.composicionDe === 'function' ? App.composicionDe(p) || {} : {};
      return { fecha: p.fecha, kg: Number(p.kg), grasa: c.grasa, agua: c.agua, musculo: c.musculo };
    });

    cont.appendChild(h('div', { class: 'salud-arriba' }, [
      h('select', { class: 'selector-ciclo', 'aria-label': 'Periodo', onchange: function (e) {
        periodoSalud = e.target.value;
        App.repintar();
      } }, [['ciclo', 'Este ciclo'], ['meses', '3 meses'], ['ano', '1 año']].map(function (o) {
        return h('option', { value: o[0], selected: periodoSalud === o[0], texto: o[1] });
      })),
    ]));

    var diapositivas = ASPECTOS_SALUD.map(function (a) {
      return [a.titulo.replace(/^\S+ /, ''), tarjetaSalud(a, Comida.salud(pesajes, a.id, plan, desde), plan, pesajes.length > 0, pesajes)];
    });
    // El descanso de cada noche (app de Android 1.9 con la notificación de los pasos).
    var descanso = typeof AvisosApp !== 'undefined' ? AvisosApp.tarjetaDescanso() : null;
    if (descanso) diapositivas.push(['Descanso', [descanso]]);
    carruselConPuntos(cont, diapositivas, 'salud');
    cont.appendChild(h('button', { type: 'button', class: 'principal', texto: '⚖️ Apuntar peso', onclick: function () { App.apuntarPeso(hoy); } }));
  }

  // Los rangos de la báscula (Comida.rangoSalud) con el color de cada tramo.
  var TONOS = { azul: 'var(--debil)', celeste: 'var(--pasos)', verde: 'var(--ok)', naranja: 'var(--rm)', rojo: 'var(--error)' };
  function rangoSalud(aspecto, fecha) {
    var r = Comida.rangoSalud(aspecto, Almacen.cuerpo(), fecha);
    if (r) r.colores = r.tonos.map(function (t) { return TONOS[t]; });
    return r;
  }
  function tramoDe(rango, v) { return Comida.tramoSalud(rango, v); }

  // La barra de colores de Zepp: tramos iguales de ancho, los cortes encima, los nombres debajo (el de ahora en su
  // color) y un aro donde cae el valor dentro de su tramo.
  function barraRango(rango, v) {
    var cortes = rango.cortes, tramos = cortes.length + 1;
    var i = tramoDe(rango, v);
    var paso = (cortes[cortes.length - 1] - cortes[0]) / Math.max(1, cortes.length - 1) || cortes[0] * 0.2;
    var lo = i === 0 ? cortes[0] - paso : cortes[i - 1];
    var hi = i === tramos - 1 ? cortes[i - 1] + paso : cortes[i];
    var pos = (i + Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1)))) / tramos * 100;
    return h('div', { class: 'rango' }, [
      h('div', { class: 'rango-cortes' }, cortes.map(function (x, k) {
        return h('span', { style: 'left:' + ((k + 1) / tramos * 100) + '%', texto: Number(x).toFixed(1).replace('.', ',') + (rango.unidad || '') });
      })),
      h('div', { class: 'rango-barra' }, rango.colores.map(function (col) {
        return h('span', { style: 'background:' + col });
      }).concat([h('i', { class: 'rango-aro', style: 'left:' + pos + '%;border-color:' + rango.colores[i] })])),
      h('div', { class: 'rango-nombres' }, rango.nombres.map(function (nom, k) {
        return h('span', { style: k === i ? 'color:' + rango.colores[i] : '', texto: nom });
      })),
    ]);
  }

  // La tarjeta de una cosa, como la del peso de Zepp Life (él, 2026-11-08): el número grande del pesaje elegido con
  // su tramo ("IMC 24,7 Equilibrado"), la curva de los pesajes (tocar un punto lo elige), "Cambios recientes" (desde
  // el anterior y desde el principio del periodo, en verde si va hacia donde quiere el plan) y la barra de rangos.
  // Debajo, en pequeño, cómo va frente al plan. Antes era una gráfica del estilo del ciclo con lo que tocaría.
  function tarjetaSalud(a, datos, plan, hayPesos, pesajes) {
    var nodos = [h('div', { class: 'ejercicio-cabecera' }, [h('h2', { texto: a.titulo })])];
    if (!datos) {
      nodos.push(h('p', { class: 'vacio', texto: a.id === 'kg'
        ? (hayPesos ? 'No hay pesajes en este periodo.' : 'Aún no te has pesado. Apunta tu peso o súbete a la báscula.')
        : 'Para tener este dato pésate descalzo en la báscula y quédate quieto hasta que acabe.' }));
      return nodos;
    }
    var p = datos.puntos;
    var dec = a.id === 'kg' ? 2 : 1;
    var cifra = function (v) { return Number(v).toFixed(dec).replace('.', ','); };
    var corto = function (v) { return Math.abs(Number(v)).toFixed(dec).replace('.', ','); };
    // Si el cambio va hacia donde quiere el plan: verde; al revés, rojo; casi quieto, gris.
    var quiere = datos.quiero;
    var claseCambio = function (d) {
      if (Math.abs(d) < (a.id === 'kg' ? 0.05 : 0.1)) return 'igual';
      if (quiere === 'sube' || quiere === 'noBaja') return d > 0 ? 'bien' : 'mal';
      if (quiere === 'baja' || quiere === 'noSube') return d < 0 ? 'bien' : 'mal';
      // Mantenimiento: verde si se mueve menos de un 0,5 %, naranja si más.
      return Math.abs(d) / p[p.length - 1].valor <= 0.005 ? 'bien' : 'medio';
    };

    var numero = h('div', { class: 'salud-numero' });
    var fecha = h('p', { class: 'salud-fecha' });
    var tramo = h('p', { class: 'salud-tramo' });
    var rangoCaja = h('div', { class: 'salud-rango' });
    function pintarElegido(i) {
      var x = p[i];
      numero.innerHTML = '';
      numero.appendChild(document.createTextNode(cifra(x.valor)));
      numero.appendChild(h('small', { texto: a.corta }));
      fecha.textContent = Grafica.fechaCorta(x.fecha);
      var rango = rangoSalud(a.id, x.fecha);
      tramo.innerHTML = '';
      rangoCaja.innerHTML = '';
      if (rango) {
        var t = tramoDe(rango, x.valor), nota = '';
        if (a.id === 'kg') {
          var alto = Number((Almacen.cuerpo() || {}).altura) / 100;
          tramo.appendChild(document.createTextNode('IMC ' + Grafica.num(x.valor / (alto * alto)) + '  '));
          // Con la grasa de ese pesaje: IMC alto con grasa normal es Equilibrado (Comida.tramoPeso).
          var pz = (pesajes || []).filter(function (q) { return q.fecha === x.fecha; })[0] || { fecha: x.fecha, kg: x.valor };
          var tp = Comida.tramoPeso(pz, Almacen.cuerpo());
          if (tp) { t = tp.tramo; nota = tp.nota; }
        }
        tramo.appendChild(h('span', { style: 'color:' + rango.colores[t], texto: rango.nombres[t] }));
        if (nota) tramo.appendChild(h('small', { class: 'salud-nota', texto: nota }));
        rangoCaja.appendChild(barraRango(rango, x.valor));
      } else if (a.id === 'kg') {
        tramo.textContent = 'Pon tu altura en Tus datos para ver tu IMC';
      }
    }
    nodos.push(h('div', { class: 'salud-cabeza' }, [fecha, numero, tramo]));
    var grafica = h('div', { class: 'salud-curva' });
    Grafica.curva(grafica, p.map(function (x) { return { fecha: x.fecha, valor: x.valor }; }), { alElegir: pintarElegido });
    nodos.push(grafica);

    // Cambios recientes: desde el pesaje de antes y desde el primero del periodo.
    if (p.length > 1) {
      var ultimo = p[p.length - 1];
      var cambio = function (d, texto) {
        return h('div', { class: 'salud-cambio cambio-' + claseCambio(d) }, [
          h('strong', {}, [document.createTextNode(corto(d)), h('small', { texto: a.corta })]),
          h('span', {}, [h('i', { class: 'flecha ' + (d > 0 ? 'sube' : d < 0 ? 'baja' : 'quieto') }), document.createTextNode(texto)]),
        ]);
      };
      nodos.push(h('div', { class: 'salud-cambios' }, [
        h('h3', { texto: 'Cambios recientes' }),
        h('div', { class: 'salud-cambios-dos' }, [
          cambio(ultimo.valor - p[p.length - 2].valor, 'Desde el ' + Grafica.fechaCorta(p[p.length - 2].fecha)),
          cambio(ultimo.valor - p[0].valor, 'Desde el principio (' + Grafica.fechaCorta(p[0].fecha) + ')'),
        ]),
      ]));
    }
    nodos.push(rangoCaja);
    // Fuera la línea del plan ("Mantenimiento: que no baje…", él, 2026-11-08): el plan solo decide el color de los
    // cambios recientes.
    return nodos;
  }

  function pintarPasos(cont) {
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
      h('div', { class: 'ejercicio-cabecera' }, [h('h2', { texto: 'Pasos' }), selectorPeriodo()]),
      h('p', { class: 'detalle', texto: 'Objetivo ' + Grafica.miles(objetivo) + ' al día' }),
      records,
      grafica,
    ].concat(cuentas(textos))));
    if (!todos.length) {
      cont.appendChild(h('p', { class: 'vacio', texto: 'Los pasos se leen en la app de Android.' }));
      return null;
    }
    return h('div', { class: 'tarjeta' }, [h('h3', { texto: 'Todos los días' }), tablaPasos(Almacen.pasos())]);
  }

  // Calorías, siempre una barra por día (lo pidió él), con su propio periodo (periodoKcal).
  function pintarCalorias(cont) {
    var grafica = h('div');
    // Cada barra, andando (naranja, abajo) + entrenando (encima): la altura es el total (él, 2026-10-06). Las del
    // entreno salen de las series (Pasos.kcalEntrenoPorDia: 3 s por rep y el descanso del plan).
    var hoy = Almacen.hoyISO();
    var n = { semana: 7, mes: 30, tres: 90 }[periodoKcal] || 30;
    var entreno = Pasos.kcalEntrenoPorDia() || {};
    var ultimosDias = Pasos.ultimos(Almacen.pasos(), n, hoy);
    // Debajo, en otro color, lo que gasta el cuerpo en reposo (él, 2026-11-07); sin altura en Tus datos no sale.
    var reposoPorDia = Pasos.kcalReposoPorDia(ultimosDias.map(function (d) { return d.fecha; }));
    var dias = ultimosDias.map(function (d) {
      var andando = d.kcal || 0, entrenando = entreno[d.fecha] || 0, reposo = reposoPorDia[d.fecha] || 0;
      return { fecha: d.fecha, andando: andando, entrenando: entrenando, reposo: reposo, total: reposo + andando + entrenando };
    });
    Grafica.barras(grafica, dias.map(function (d) {
      return {
        etiqueta: n === 7 ? Pasos.diaSemana(d.fecha) : d.fecha.slice(8) + '/' + d.fecha.slice(5, 7),
        v: d.total, partes: [d.reposo, d.andando, d.entrenando],
        titulo: Grafica.fechaCorta(d.fecha) + ': ' + Grafica.miles(d.total) + ' kcal' +
          Grafica.textoPartes(d.reposo, d.andando, d.entrenando),
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
    var reposoTotal = conAlgo.reduce(function (t, d) { return t + d.reposo; }, 0);
    cont.appendChild(h('div', { class: 'tarjeta' }, [
      h('div', { class: 'ejercicio-cabecera' }, [h('h2', { texto: 'Calorías quemadas' }), selectorPeriodo(true)]),
      cifras,
      grafica,
      conAlgo.length ? h('p', { class: 'leyenda' }, [
        reposoTotal ? h('span', { class: 'muestra-punto kcal-reposo' }) : null, reposoTotal ? 'En reposo ' + Grafica.miles(reposoTotal) : null,
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

  // Historial → Ciclo (él, 2026-11-05): arriba cómo va ("Columna 3 de 8 · por encima en 5…"), el selector de ciclo y
  // un carrusel por ejercicio con lo previsto al empezar frente a lo hecho. Los ciclos pasados, con su resumen:
  // de dónde partía cada ejercicio (el final del ciclo anterior), dónde acabó y lo previsto.
  // Lo último que se vio del ciclo en curso, para el menú de Historial (se rehace si cambia el día o las series).
  var cuentaCiclo = null;

  function pintarCiclo(cont) {
    var datos = Almacen.progreso();
    if (!datos) {
      var caja = h('div', { class: 'tarjeta' }, [h('p', { texto: 'Cargando el ciclo…' })]);
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
    var hoy = Almacen.hoyISO();
    var propio = typeof Progreso !== 'undefined' ? Progreso.calcular() : null;
    var inicioActual = Progreso.inicioCiclo(hoy);
    var numero = function (n) { return Number((String(n).match(/(\d+)/) || [])[1]) || 0; };
    var fijos = Almacen.ciclosFijos();
    var ciclos = [];
    var anadir = function (c) { if (c && ciclos.indexOf(c) < 0) ciclos.push(c); };
    datos.filas.forEach(function (f) { anadir(f.ciclo); });
    Object.keys(fijos).forEach(function (k) { anadir(fijos[k].ciclo); });
    var actual = propio ? propio.ciclo : ciclos[ciclos.length - 1];
    anadir(actual);
    ciclos.sort(function (a, b) { return numero(a) - numero(b); });
    if (!ciclos.length) {
      cont.appendChild(h('p', { class: 'vacio', texto: 'Todavía no hay datos del ciclo. Apunta un entreno y vuelve aquí.' }));
      return;
    }
    var nombre = cicloElegido && ciclos.indexOf(cicloElegido) >= 0 ? cicloElegido : actual || ciclos[ciclos.length - 1];
    var esActual = nombre === actual;
    // Sus días: los guardados con su foto o, si no, contando ciclos de 64 días hacia atrás desde el de ahora.
    var fijo = Object.keys(fijos).map(function (k) { return fijos[k]; }).filter(function (x) { return x.ciclo === nombre; })[0];
    var inicio = esActual ? inicioActual : fijo ? fijo.inicio
      : Calendario.sumarDias(inicioActual, -Progreso.DIAS_CICLO * Math.max(1, numero(actual) - numero(nombre)));
    var ciclo = { nombre: nombre, inicio: inicio, fin: Calendario.sumarDias(inicio, Progreso.DIAS_CICLO), actual: esActual };

    cont.appendChild(h('select', { class: 'selector-ciclo selector-ciclo-social', 'aria-label': 'Ciclo', onchange: function (e) {
      cicloElegido = e.target.value;
      App.repintar();
    } }, ciclos.map(function (c) { return h('option', { value: c, selected: c === nombre, texto: c === actual ? c + ' (ahora)' : c }); })));
    var linea = h('p', { class: 'resumen-ciclo' });
    cont.appendChild(linea);
    var resumenCaja = h('div');
    cont.appendChild(resumenCaja);

    var hayPrincipales = datos.filas.some(function (f) { return f.ciclo === nombre && Object.keys(f.valores).length; });
    var principales = hayPrincipales ? graficasCiclo(cont, datos, nombre, 'historial', true, true) || [] : [];
    var secundarios = graficasSecundarios(cont, 'historial', ciclo, !!cont.querySelector('.diapositiva'));
    var todos = principales.concat(secundarios);

    var cuenta = { encima: 0, previsto: 0, debajo: 0 };
    todos.forEach(function (r) { if (r.estado) cuenta[r.estado]++; });
    if (esActual) cuentaCiclo = { ciclo: nombre, cuenta: cuenta, dia: hoy, series: Almacen.series().length };
    var partes = [];
    if (cuenta.encima) partes.push('por encima en ' + cuenta.encima);
    if (cuenta.previsto) partes.push('en lo previsto en ' + cuenta.previsto);
    if (cuenta.debajo) partes.push('por debajo en ' + cuenta.debajo);
    var columna = Calendario.porCalendario(hoy).columna;
    var cabeza = esActual ? Almacen.nombreColumna(columna, hoy) + (columna < Calendario.COLUMNAS ? ' de ' + Calendario.COLUMNAS : ' (la última)')
      : 'Del ' + Grafica.fechaCorta(inicio) + ' al ' + Grafica.fechaCorta(Calendario.sumarDias(ciclo.fin, -1));
    linea.textContent = cabeza + (partes.length ? ' · ' + partes.join(', ') : esActual ? ' · aún sin entrenos en este ciclo' : '');

    if (!cont.querySelector('.diapositiva')) {
      cont.appendChild(h('p', { class: 'vacio', texto: esActual ? 'Cuando apuntes el primer entreno del ciclo, aquí verás cómo va cada ejercicio.'
        : 'No hay datos de ese ciclo en este móvil.' }));
    }
    // El resumen de un ciclo terminado: cuánto subió cada ejercicio frente al ciclo anterior y frente a lo previsto.
    if (!esActual && todos.length) resumenCiclo(resumenCaja, todos);
  }

  function resumenCiclo(cont, lista) {
    var signo = function (v, u) { return (v > 0 ? '+' : v < 0 ? '−' : '±') + formato(Math.abs(Math.round(v * 10) / 10)) + u; };
    cont.appendChild(h('div', { class: 'tarjeta resumen-ciclo-tarjeta' }, [h('h3', { texto: 'Cómo acabó' })].concat(lista.map(function (r) {
      var u = r.unidad || ' kg';
      var subida = r.desde > 0 && r.hasta > 0 ? (r.hasta - r.desde) * (r.alReves ? -1 : 1) : null;
      var frente = r.previsto > 0 && r.hasta > 0 ? (r.hasta - r.previsto) * (r.alReves ? -1 : 1) : null;
      return h('div', { class: 'fila-resumen ' + (r.estado || '') }, [
        h('span', { class: 'fila-resumen-nombre', texto: r.titulo }),
        h('span', { class: 'fila-resumen-dato', texto: (r.desde > 0 ? formato(r.desde) + ' → ' : '') + formato(r.hasta) + u +
          (subida != null ? ' (' + signo(subida, u) + ')' : '') }),
        frente != null ? h('span', { class: 'fila-resumen-previsto', texto: frente === 0 ? 'lo previsto' : signo(frente, u) + ' frente a lo previsto' }) : null,
      ]);
    }))));
  }

  // Ejercicio a la vista en cada carrusel ('historial', 'social-<persona>'), para no perderlo al repintar.
  var carruselVisto = {};

  // Una gráfica por ejercicio con lo proyectado frente a lo hecho en un ciclo, en un carrusel que se pasa de lado,
  // con buscador para saltar a un ejercicio. También la usa la pestaña Social, con soloGrafica: sin buscador ni
  // flechas, solo el carrusel (él, 2026-10-06: "solo la gráfica y el selector de ciclos").
  // Devuelve, por ejercicio, cómo va (para la línea de arriba y el resumen del ciclo): [{ titulo, estado, desde,
  // hasta, previsto, unidad }]. callado: sin el "Ningún ejercicio…" (en Historial pueden ir solo secundarios).
  function graficasCiclo(cont, datos, ciclo, clave, soloGrafica, callado) {
    clave = clave || 'historial';
    var filas = datos.filas.filter(function (f) { return f.ciclo === ciclo; });
    var resumenes = [];
    // Las del ciclo de antes, para el "frente al ciclo anterior" del resumen.
    var ordenCiclos = [];
    datos.filas.forEach(function (f) { if (ordenCiclos.indexOf(f.ciclo) < 0) ordenCiclos.push(f.ciclo); });
    var cicloAntes = ordenCiclos[ordenCiclos.indexOf(ciclo) - 1];
    var filasAntes = datos.filas.filter(function (f) { return cicloAntes && f.ciclo === cicloAntes; });
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

      // Cómo va: la última columna hecha frente a lo que tocaba en ella (un día cambiado, lo que cuenta aquí).
      var ultima = -1;
      realizado.forEach(function (v, i) { if (v != null) ultima = i; });
      var antes = null;
      filasAntes.forEach(function (f) { var v = (f.valores[nombre] || [])[1]; if (v != null) antes = v; });
      if (ultima >= 0) {
        var hecho = marcas[ultima] && marcas[ultima].valor != null ? marcas[ultima].valor : marcas[ultima] ? null : realizado[ultima];
        resumenes.push({ titulo: titulo, estado: comoVa(hecho, estimado[ultima], false), desde: antes,
          hasta: realizado[ultima], previsto: estimado[ultima], unidad: unidad });
      }
    });

    if (!diapositivas.length) {
      if (!callado) cont.appendChild(h('p', { class: 'vacio', texto: 'Ningún ejercicio tiene datos en este ciclo.' }));
      return resumenes;
    }
    carrusel(cont, diapositivas, clave, soloGrafica);
    return resumenes;
  }

  // 'encima', 'previsto' o 'debajo' de lo que tocaba (con ayuda, menos es mejor); null si no se puede saber.
  function comoVa(hecho, previsto, alReves) {
    if (!(hecho > 0) || !(previsto > 0)) return null;
    var dif = (hecho - previsto) / previsto * (alReves ? -1 : 1);
    return dif > 0.005 ? 'encima' : dif < -0.005 ? 'debajo' : 'previsto';
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

  // ---- Secundarios en la evolución del ciclo (él, 2026-10-06; fijo por ciclo desde el 2026-11-06) ----
  // Una gráfica por secundario, weak point o jump del plan (no los de su peso ni los de tiempo), con las 8
  // columnas del ciclo: lo previsto al empezar (Ajuste.proyeccion desde las sesiones de antes del ciclo) frente al
  // peso de trabajo que hiciste. El punto, verde si llegaste arriba del rango (o a lo que pedía el escalón),
  // dorado dentro del rango y rojo si te quedaste corto. Solo con lo de este móvil.
  // Lo previsto y la lista de ejercicios se guardan el primer día con series del ciclo (Almacen.guardarCicloFijo):
  // así no se mueven a mitad de ciclo y los ciclos pasados se ven con su rutina de entonces.
  // ciclo: { inicio, fin, nombre, actual }. Devuelve [{ titulo, estado, desde, hasta, previsto, unidad }].

  // Lo que se guarda de un ejercicio del plan: solo lo que hace falta para pintar su gráfica.
  function columnasFijas(columnas) {
    return (columnas || []).map(function (c) { return { series: (c || {}).series || [], objetivo: (c || {}).objetivo || '' }; });
  }

  // Los secundarios del plan de ahora con su proyección desde el inicio del ciclo.
  function secundariosDelPlan(inicio) {
    var plan = Almacen.plan();
    if (!plan || !plan.entrenos) return null;
    var lista = [];
    Calendario.ORDEN.forEach(function (entreno) {
      (plan.entrenos[entreno] || []).forEach(function (ej) {
        if (ej.tipo === 'principal' || Grupos.esCorporal(ej.nombre) || Grupos.porTiempo(ej.nombre)) return;
        var proyeccion = null;
        try { proyeccion = Ajuste.proyeccion(ej.nombre, ej.columnas, entreno, inicio); } catch (er) { proyeccion = null; }
        lista.push({ entreno: entreno, nombre: ej.nombre, corto: ej.nombreCorto || ej.nombre, columnas: columnasFijas(ej.columnas),
          proyeccion: proyeccion ? proyeccion.map(function (p) { return p ? { kg: p.kg, series: p.series } : null; }) : null });
      });
    });
    return lista;
  }

  // La foto del ciclo: la guardada o, en el ciclo en curso, la del plan de ahora (y se guarda en cuanto hay series).
  function fotoDelCiclo(ciclo, hayseries) {
    var fija = Almacen.ciclosFijos()[ciclo.inicio];
    if (fija) return fija;
    if (!ciclo.actual) return null;
    var ejercicios = secundariosDelPlan(ciclo.inicio);
    if (!ejercicios) return null;
    var foto = { ciclo: ciclo.nombre, inicio: ciclo.inicio, ejercicios: ejercicios };
    // Antes de la primera serie el plan puede ser aún el de la rutina de antes (la nueva empieza el día del A1).
    if (hayseries) Almacen.guardarCicloFijo(foto);
    return foto;
  }

  function graficasSecundarios(cont, clave, ciclo, conTitulo) {
    var resumenes = [];
    if (typeof Progreso === 'undefined') return resumenes;
    var inicio = ciclo.inicio;
    var delCiclo = Almacen.series().filter(function (s) { return s.fecha >= inicio && s.fecha < ciclo.fin && s.entreno && s.columna; });
    var foto = fotoDelCiclo(ciclo, delCiclo.length > 0);
    if (!foto) return resumenes;
    // La columna 8 de una rutina sin AMRAP es la semana suave: sin dorado ni "RM".
    var ultimoDia = Calendario.sumarDias(ciclo.fin, -1);
    var etiquetas = [];
    for (var c = 1; c <= Calendario.COLUMNAS; c++) {
      etiquetas.push(c === Calendario.COLUMNAS && !Almacen.sinAmrap(ultimoDia) ? 'AMRAP' : String(c));
    }
    var cuantos = {};
    foto.ejercicios.forEach(function (ej) { cuantos[ej.corto] = (cuantos[ej.corto] || 0) + 1; });
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
      // Con ayuda, el peso de trabajo es la menor ayuda.
      var cual = Grupos.esAsistido(nombreEj) ? Math.min : Math.max;
      var objetivos = deCol.map(function (s) { return Number(s.kgObjetivo); }).filter(function (v) { return v > 0; });
      var toco = objetivos.length ? cual.apply(null, objetivos) : null;
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
        trabajo: cual.apply(null, deCol.map(function (s) { return Number(s.kg); })),
        estado: corto ? 'mal' : arriba ? 'bien' : 'medio',
        hiciste: deCol.map(function (s) { return formato(s.kg) + '×' + s.reps; }).join(', '),
      };
    }

    // El peso de trabajo con el que llegó al ciclo: el de la última sesión de antes.
    function pesoDeAntes(nombreEj, entreno) {
      var ses = [];
      try { ses = Ajuste.sesionesDe ? Ajuste.sesionesDe(nombreEj, entreno, inicio) : []; } catch (er) { ses = []; }
      var ultima = ses[ses.length - 1];
      if (!ultima) return null;
      var kgs = ultima.series.map(function (s) { return Number(s.kg) || 0; }).filter(function (v) { return v > 0; });
      return kgs.length ? Math[Grupos.esAsistido(nombreEj) ? 'min' : 'max'].apply(null, kgs) : null;
    }

    var diapositivas = [];
    foto.ejercicios.forEach(function (ej) {
      var entreno = ej.entreno;
      var nombre = ej.corto;
      var clave2 = Grupos.normalizar(ej.nombre);
      var asistido = Grupos.esAsistido(ej.nombre);
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
      var proyectado = ej.proyeccion;
      var linea = etiquetas.map(function (e, i) { return proyectado && proyectado[i] ? proyectado[i].kg : null; });
      var tocaba = [], hecho = [], estados = [], textos = [], marcas = [];
      var ultimaHecha = -1, ultimaSuya = -1;
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
          ultimaSuya = i;
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
      // Sin proyección: la discontinua es lo que tocó cada día y, en el ciclo en curso, en la siguiente columna lo que te toca.
      if (!proyectado) {
        linea = tocaba.slice();
        var sig = ultimaHecha + 1;
        if (ciclo.actual && sig < etiquetas.length) {
          var p = null;
          try { p = Ajuste.secundario(ej.nombre, ej.columnas[sig], entreno); } catch (er) { p = null; }
          if (p && p.kg) {
            linea[sig] = p.kg;
            textos[sig] = nombreCol(etiquetas[sig]) + ' · te toca ' + textoSeries(p.series);
          }
        }
      }
      // Cómo va: la última columna hecha con él frente a lo previsto (o lo que tocaba); corto con el mismo peso, debajo.
      if (ultimaSuya >= 0) {
        var previsto = linea[ultimaSuya] != null ? linea[ultimaSuya] : tocaba[ultimaSuya];
        var estado = comoVa(hecho[ultimaSuya], previsto, asistido);
        if (estado === 'previsto' && estados[ultimaSuya] === 'mal') estado = 'debajo';
        resumenes.push({ titulo: nombre + (cuantos[nombre] > 1 ? ' ' + entreno : ''), estado: estado,
          desde: pesoDeAntes(ej.nombre, entreno), hasta: hecho[ultimaSuya], previsto: previsto, unidad: ' kg', alReves: asistido });
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
          var pro = null;
          try { pro = Ajuste.proyeccion(con, ej.columnas, entreno, inicio); } catch (er) { pro = null; }
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
    if (!diapositivas.length) return resumenes;
    if (conTitulo) cont.appendChild(h('h2', { class: 'titulo-seccion', texto: 'Secundarios' }));
    carrusel(cont, diapositivas, clave + '-secundarios', true);
    return resumenes;
  }
  // Desde Inicio: Historial → Fuerza, con el estado de fuerza desplegado.
  App.nuevoEjercicio = nuevoEjercicio;

  // Desde app.js: al entrar en Historial desde otra pantalla, el menú (salvo que se haya pedido una sección).
  App.alEntrarHistorial = function () {
    if (apartadoPedido) { apartadoPedido = false; return; }
    apartado = null;
    abierto = null;
  };
  // El atrás del móvil en Historial: primero cierra el ejercicio abierto, luego vuelve al menú.
  App.atrasHistorial = function () {
    if (abierto) { abierto = null; App.mostrar('historial', 'derecha'); return true; }
    if (apartado) { apartado = null; App.mostrar('historial', 'derecha'); return true; }
    return false;
  };
  App.abrirEstado = function () {
    apartado = 'fuerza';
    apartadoPedido = true;
    abierto = null;
    Estado.desplegar();
    App.mostrar('historial', 'izquierda');
  };
  App.abrirSalud = function () {
    apartado = 'salud';
    apartadoPedido = true;
    abierto = null;
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
            if (!cambiaNombre) return null;
            if (Almacen.sinExcel()) {
              Almacen.renombrarLocal(e.nombre, n);
              Almacen.guardarEjercicioPropio([n, grupoElegido, '', materialElegido || '', deQuien.value || ''], e.nombre);
              return null;
            }
            return Almacen.llamar('renombrar', { cambios: [[e.nombre, n]], aplicar: true })
              .then(function () { Almacen.renombrarLocal(e.nombre, n); });
          })
          .then(function () {
            return Grupos.guardarGrupo(n, grupoElegido, materialElegido, deQuien.value, !!base && !deQuien.value);
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
        (Almacen.sinExcel() ? Promise.resolve(quitarSinExcel(e.nombre)) : Almacen.llamar('quitarEjercicios', { nombres: [e.nombre], aplicar: true }))
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

  // Sin Excel: lo mismo que hace la API (no se quita si está en un entreno de la rutina o si tiene variantes).
  function quitarSinExcel(nombre) {
    var k = Grupos.normalizar(nombre);
    var r = Almacen.rutina();
    var enRutina = r && (r.entrenos || []).some(function (en) { return (en.ejercicios || []).some(function (x) { return Grupos.normalizar(x.nombre) === k; }); });
    if (enRutina || Grupos.variantes(nombre).length) return { quitados: [], protegidos: [nombre] };
    Almacen.quitarEjercicioPropio(nombre);
    return { quitados: [nombre] };
  }

  // Crea un ejercicio nuevo: queda en la pestaña común "Ejercicios" con su grupo.
  // opciones (desde Entreno): { nombre, grupo: el que sale marcado, alCrear(nombre): en vez de ir a Historial }.
  function nuevoEjercicio(opciones) {
    var op = opciones && !opciones.target ? opciones : {};
    var nombre = h('input', { placeholder: 'Nombre del ejercicio', 'aria-label': 'Nombre del ejercicio', value: op.nombre || '' });
    var grupoElegido = op.grupo || null;
    var botones = Grupos.todos().map(function (g) {
      return h('button', { type: 'button', class: op.grupo && Grupos.normalizar(g) === Grupos.normalizar(op.grupo) ? 'actual' : '', texto: g, onclick: function (ev) {
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
    // Con asistencia: los kg serán la ayuda de la máquina (solo para quien lo crea).
    var asistido = false;
    var bola = h('span', { class: 'interruptor', 'aria-hidden': 'true' }, [h('span', { class: 'interruptor-bola' })]);
    var conAyuda = h('button', { type: 'button', class: 'fila-ajuste interruptor-tema fila-asistido', role: 'switch',
      'aria-checked': 'false', 'aria-label': 'Con asistencia', onclick: function () {
        asistido = !asistido;
        bola.classList.toggle('encendido', asistido);
        conAyuda.setAttribute('aria-checked', asistido ? 'true' : 'false');
      } }, [h('span', { class: 'fila-ajuste-titulo', texto: 'Con asistencia (los kg son ayuda)' }), bola]);
    function crearlo(n, g) {
      crear(n, g, materialElegido, asistido, op.alCrear);
    }
    App.abrirSelector('Nuevo ejercicio', [
      nombre,
      h('p', { class: 'detalle', texto: 'Grupo muscular' }),
      h('div', { class: 'opciones' }, botones),
      otroGrupo,
      h('p', { class: 'detalle', texto: '¿Con qué se hace?' }),
      h('div', { class: 'opciones' }, materiales),
      conAyuda,
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
        if (!parecidos.length) return crearlo(n, g);
        App.abrirSelector('¿Es alguno de estos?', [
          h('p', { class: 'detalle', texto: 'Ya hay ejercicios con un nombre parecido. Si es uno de ellos, usa ese.' }),
          h('div', { class: 'opciones' }, parecidos.map(function (p) { return h('span', { class: 'chip', texto: p }); })),
          h('button', { type: 'button', class: 'principal', texto: 'Crear "' + n + '" igualmente', onclick: function () { crearlo(n, g); } }),
          h('button', { type: 'button', texto: 'Cancelar', onclick: App.cerrarSelector }),
        ]);
      } }),
    ]);
  }

  function crear(n, g, material, asistido, alCrear) {
    App.cerrarSelector();
    Grupos.guardarGrupo(n, g, material)
      .then(function () {
        if (asistido) Grupos.ponerAsistido(n, true);
        App.avisar('Ejercicio creado');
        if (alCrear) alCrear(n); else App.mostrar('historial');
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
    return [cuerpo.sexo === 'mujer' ? 'Mujer' : 'Hombre', edad ? edad + ' años' : null, formato(cuerpo.peso) + ' kg', cuerpo.altura ? cuerpo.altura + ' cm' : null]
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
        // Tu perfil tal como lo ven los de tus grupos (él, 2026-11-08): el minititulo bajo el nombre.
        (function () {
          var t = Tarjeta.titulo();
          return t.length ? h('div', { class: 'minititulo perfil-minititulo' }, t.map(function (x) {
            return h('span', { class: 'minititulo-dato' + (x.tipo === 'record' ? ' record' : ''), style: x.color ? 'color:' + x.color : '' },
              [x.tipo === 'record' ? Iconos.trofeo() : null, x.texto]);
          })) : null;
        })(),
        // Igual que te ven en tus grupos (él, 2026-11-08): nombre y minititulo; tus datos del cuerpo, en "Editar datos".
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
          // Perfil público (él, 2026-11-08): lo que ven los de tus grupos, dentro de tu perfil.
          h('button', { type: 'button', class: 'chip con-icono', onclick: perfilPublico }, [Iconos.privacidad(), 'Perfil público']),
          miFoto ? h('button', { type: 'button', class: 'chip con-icono', onclick: function () { guardarFoto('', 'Foto quitada'); } },
            [Iconos.borrar(), 'Quitar foto']) : null,
        ]),
      ]),
    ]));
  }

  // Qué ven los de tus grupos en Social (él, 2026-11-08): lo que sale bajo tu nombre (hasta tres cosas: fuerza,
  // equilibrio, récords) y lo que se ve al tocar tu perfil. Al cambiarlo se publica ya en todos tus grupos.
  function perfilPublico() {
    var masRecords = false;
    function publicar() {
      if (typeof Nube !== 'undefined' && Nube.uid()) Equipos.deGym().forEach(function (g) { SocialNube.publicar(g._id).catch(function () {}); });
    }
    function pintar() {
      var publico = Tarjeta.publico();
      var elegidos = Tarjeta.elegidosTitulo();
      var opciones = Tarjeta.opcionesTitulo();
      var records = opciones.filter(function (o) { return o.grupo === 'Récords'; });
      function elegirRecords() {
        var marcados = Tarjeta.elegidosTitulo();
        App.abrirSelector('Tus récords', [
          h('p', { class: 'detalle', texto: 'Elige hasta ' + Tarjeta.MAX_TITULO + '. El color es tu nivel de fuerza.' }),
          h('div', { class: 'titulo-lista' }, records.map(function (o) {
            var si = marcados.indexOf(o.id) >= 0;
            return h('button', { type: 'button', class: 'titulo-record' + (si ? ' actual' : ''), 'aria-pressed': si ? 'true' : 'false', onclick: function () {
              var lista = si ? marcados.filter(function (x) { return x !== o.id; }) : marcados.concat([o.id]);
              if (lista.length > Tarjeta.MAX_TITULO) return App.avisar('Como mucho ' + Tarjeta.MAX_TITULO + ': quita otro antes', true);
              Tarjeta.ponerTitulo(lista);
              publicar();
              elegirRecords();
            } }, [
              h('span', { class: 'titulo-check', texto: si ? '✓' : '' }),
              h('span', { class: 'titulo-record-texto', style: o.color ? 'color:' + o.color : '', texto: o.texto }),
            ]);
          })),
          h('button', { type: 'button', class: 'principal', texto: 'Listo', onclick: pintar }),
        ]);
      }
      function alternar(o, si) {
        var lista = si ? elegidos.filter(function (x) { return x !== o.id; }) : elegidos.concat([o.id]);
        if (lista.length > Tarjeta.MAX_TITULO) return App.avisar('Como mucho ' + Tarjeta.MAX_TITULO + ': quita otra antes', true);
        Tarjeta.ponerTitulo(lista);
        publicar();
        pintar();
      }
      function chipOpcion(o) {
        var si = elegidos.indexOf(o.id) >= 0;
        if (o.falta) return h('button', { type: 'button', class: 'apagada', onclick: function () { App.avisar(o.falta); } }, [o.texto + ' · ' + o.falta]);
        return h('button', { type: 'button', class: si ? 'actual' : '', 'aria-pressed': si ? 'true' : 'false', onclick: function () { alternar(o, si); } },
          [o.grupo === 'Récords' ? Iconos.trofeo() : null, o.texto]);
      }
      var c = Almacen.config() || {};
      var vista = h('div', { class: 'tarjeta miembro perfil-vista' }, [
        h('span', { class: 'miembro-foto sin-foto' }, [Iconos.perfil()]),
        h('div', { class: 'miembro-texto' }, [
          h('strong', { class: 'miembro-nombre', texto: c.nombre || 'Tú' }),
          h('div', { class: 'minititulo' }, Tarjeta.titulo().map(function (t) {
            return h('span', { class: 'minititulo-dato' + (t.tipo === 'record' ? ' record' : ''), style: t.color ? 'color:' + t.color : '' },
              [t.tipo === 'record' ? Iconos.trofeo() : null, t.texto]);
          })),
        ]),
      ]);
      var foto = Almacen.foto(c.persona);
      if (foto) vista.replaceChild(h('span', { class: 'miembro-foto', style: 'background-image:url("' + foto + '")' }), vista.firstChild);
      App.abrirSelector('Perfil público', [
        h('p', { class: 'ajustes-sub', texto: 'Así te ven en tus grupos' }),
        vista,
        h('p', { class: 'ajustes-sub', texto: 'Tus récords · hasta ' + Tarjeta.MAX_TITULO }),
        h('p', { class: 'detalle perfil-publico-nota', texto: 'Tu fuerza y tu equilibrio salen siempre, primero.' }),
        // Un solo botón (él, 2026-11-08): abre su propia ventana con la lista para marcar; aquí no se repiten los elegidos.
        records.length ? h('button', { type: 'button', class: 'fila-ajuste titulo-records-fila', onclick: elegirRecords }, [
          h('span', { class: 'fila-ajuste-icono' }, [Iconos.trofeo()]),
          h('span', { class: 'fila-ajuste-titulo', texto: 'Récords' }),
          h('span', { class: 'fila-ajuste-valor', texto: elegidos.length ? elegidos.length + ' de ' + Tarjeta.MAX_TITULO : 'Elegir' }),
          h('span', { class: 'fila-ajuste-flecha', 'aria-hidden': 'true', texto: '›' }),
        ]) : h('p', { class: 'detalle', texto: 'Cuando tengas series saldrán aquí tus récords.' }),
        h('p', { class: 'ajustes-sub', texto: 'Al tocar tu perfil' }),
        h('div', { class: 'perfil-publico' }, Tarjeta.PARTES.map(function (x) {
          var si = publico[x[0]];
          return h('button', { type: 'button', class: 'fila-ajuste interruptor-tema', role: 'switch', 'aria-checked': si ? 'true' : 'false',
            'aria-label': x[1], onclick: function () {
              Tarjeta.ponerPublico(x[0], !si);
              publicar();
              pintar();
            } }, [
            h('span', { class: 'fila-ajuste-titulo', texto: x[1] }),
            h('span', { class: 'interruptor' + (si ? ' encendido' : ''), 'aria-hidden': 'true' }, [h('span', { class: 'interruptor-bola' })]),
          ]);
        })),
        h('p', { class: 'detalle perfil-publico-nota', texto: 'Tus series y lo que comes no se comparten nunca.' }),
      ]);
    }
    pintar();
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
      paradasNotificacion(),
    ]);
  }

  // Las últimas veces que Android paró la notificación: ese rato el móvil no contó pasos (2026-10-19).
  function paradasNotificacion() {
    var lista = [];
    try {
      if (window.AndroidPasos && typeof window.AndroidPasos.paradasPasos === 'function') lista = JSON.parse(window.AndroidPasos.paradasPasos()) || [];
    } catch (e) { lista = []; }
    if (!lista.length) return null;
    var hora = function (ms) { var d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    var dia = function (ms) { var d = new Date(ms); return d.getDate() + '/' + (d.getMonth() + 1); };
    return h('div', { class: 'detalle' }, [h('p', { texto: 'Se paró y no contó pasos:' })].concat(lista.slice(-3).reverse().map(function (p) {
      return h('p', { texto: dia(p.desde) + ' ' + hora(p.desde) + ' → ' + (dia(p.hasta) !== dia(p.desde) ? dia(p.hasta) + ' ' : '') + hora(p.hasta) });
    })));
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
        // Para que Android no la quite al rato (2026-10-13): fuera del ahorro de batería y, en Samsung y Vivo, sus permisos propios.
        if (r.activa && (r.fabricante === 'samsung' || r.fabricante === 'vivo' || r.sinAhorroBateria === false)) consejoBateria(r);
      }).catch(function (e) {
        boton.disabled = false;
        App.avisar((e && e.message) || String(e), true);
      });
    } });
    return boton;
  }

  // Qué tocar en el móvil para que la notificación no se quite sola.
  function consejoBateria(r) {
    var pasos = [];
    if (r.sinAhorroBateria === false) pasos.push('Ajustes del móvil → Aplicaciones → Ares → Batería → "Sin restricciones".');
    if (r.fabricante === 'samsung') pasos.push('Ajustes → Batería → Límites de uso en segundo plano: que Ares no esté en "Apps en suspensión" ni en "Apps en suspensión profunda".');
    // Vivo no deja que la app se despierte sola sin "Inicio automático": se paraba hasta abrirla (2026-10-26).
    if (r.fabricante === 'vivo') {
      pasos.push('Ajustes → Aplicaciones → Permisos → Inicio automático: activa Ares.');
      pasos.push('Ajustes → Batería → Consumo de energía en segundo plano → Ares: "Permitir alto consumo en segundo plano".');
      pasos.push('En las apps recientes, baja la tarjeta de Ares para ponerle el candado.');
    }
    App.abrirSelector('Para que no se quite', pasos.map(function (t) { return h('p', { texto: t }); }).concat([
      h('button', { type: 'button', class: 'principal', texto: 'Entendido', onclick: App.cerrarSelector }),
    ]));
  }

  // Lo técnico: la conexión con la API, el enlace de configuración y los últimos fallos. Casi nunca hace falta.
  // Primera vez sin Excel (él, 2026-11-08: "que se la descargue quien sea"): tus datos y con qué rutina empiezas.
  // Todo se queda en el móvil (Almacen.empezarSinExcel).
  function bienvenida(cont) {
    var sexo = null;
    var plantilla = Inicial.PLANTILLAS[0].id;
    var nombre = h('input', { autocomplete: 'given-name', placeholder: 'Cómo te llamas', 'aria-label': 'Nombre' });
    var botonesSexo = [['hombre', 'Hombre'], ['mujer', 'Mujer']].map(function (s) {
      return h('button', { type: 'button', texto: s[1], onclick: function (ev) {
        sexo = s[0];
        botonesSexo.forEach(function (b) { b.classList.toggle('actual', b === ev.currentTarget); });
      } });
    });
    var nacimiento = h('input', { type: 'date', max: Almacen.hoyISO(), 'aria-label': 'Fecha de nacimiento' });
    var peso = h('input', { type: 'number', inputmode: 'decimal', step: '0.1', min: '30', 'aria-label': 'Peso corporal' });
    var altura = h('input', { type: 'number', inputmode: 'numeric', step: '1', min: '120', max: '230', 'aria-label': 'Altura' });
    var opciones = Inicial.PLANTILLAS.map(function (p) { return [p.id, p.nombre, p.detalle]; })
      .concat([[null, 'Empezar de cero', 'Creas tu rutina en Ajustes → Tus rutinas']]);
    var botonesRutina = opciones.map(function (o) {
      return h('button', { type: 'button', class: 'bienvenida-rutina' + (o[0] === plantilla ? ' actual' : ''), onclick: function (ev) {
        plantilla = o[0];
        botonesRutina.forEach(function (b) { b.classList.toggle('actual', b === ev.currentTarget); });
      } }, [h('span', { class: 'bienvenida-rutina-nombre', texto: o[1] }), h('span', { class: 'detalle', texto: o[2] })]);
    });
    cont.appendChild(h('div', { class: 'tarjeta bienvenida' }, [
      h('h2', { texto: 'Bienvenido a Ares' }),
      h('p', { class: 'detalle', texto: 'Apunta tus series, sigue tu rutina y mira cómo progresas. Todo se guarda en tu móvil.' }),
      h('label', { class: 'campo' }, [h('span', { texto: 'Nombre' }), nombre]),
      h('div', { class: 'opciones dos' }, botonesSexo),
      h('label', { class: 'campo' }, [h('span', { texto: 'Fecha de nacimiento' }), nacimiento]),
      h('label', { class: 'campo' }, [h('span', { texto: 'Peso (kg)' }), peso]),
      h('label', { class: 'campo' }, [h('span', { texto: 'Altura (cm)' }), altura]),
      h('h3', { texto: '¿Con qué rutina empiezas?' }),
      h('div', { class: 'bienvenida-rutinas' }, botonesRutina),
      h('button', { type: 'button', class: 'principal grande', texto: 'Empezar', onclick: function () {
        var n = nombre.value.trim();
        var kg = App.numero(peso.value);
        var cm = App.numero(altura.value);
        if (!n) return App.avisar('Pon tu nombre', true);
        if (!sexo || !(kg >= 30 && kg <= 250) || !Fuerza.edadEn(nacimiento.value, Almacen.hoyISO())) {
          return App.avisar('Pon el sexo, la fecha de nacimiento y el peso', true);
        }
        Almacen.empezarSinExcel({ nombre: n, sexo: sexo, nacimiento: nacimiento.value, peso: kg, altura: cm >= 120 && cm <= 230 ? Math.round(cm) : null }, plantilla);
        App.avisar('¡Listo, ' + n + '!');
        App.mostrar(plantilla ? 'inicio' : 'rutina');
        Juntos.invitacionPendiente();
      } }),
    ]));
  }

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
    // Sin configurar: la bienvenida (empezar sin Excel) y, plegado, el enlace de configuración de siempre.
    if (!Almacen.config()) {
      bienvenida(cont);
      avanzado(cont, c, false);
      return;
    }

    perfil(cont, c);

    var rutina = Almacen.rutina();
    grupo(cont, 'Entreno', [
      fila(Iconos.entreno(), 'Tus rutinas', rutina ? rutina.nombre : 'Crear', function () {
        App.mostrar('rutina');
      }),
      fila(Iconos.pasos(), 'Objetivo de pasos', Grafica.miles(Almacen.objetivoPasos()) + ' al día', editarObjetivoPasos),
      // Compartir la casa (hogar en Firestore, 2026-11-08).
      fila('🏠', 'Tu hogar', Equipos.hogar() ? Equipos.hogar().nombre : 'Compartir la casa', Juntos.hogar),
      // Traer el historial de otra app (él, 2026-11-08): de momento FitNotes.
      fila(Iconos.importar(), 'Traer historial de FitNotes', '', Importar.abrir),
      // Agua, compra y moverse: solo en la app de Android 1.9 (salen con la app cerrada).
      typeof AvisosApp !== 'undefined' && AvisosApp.disponible() ? fila('🔔', 'Avisos', AvisosApp.resumen(), AvisosApp.abrir) : null,
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
      // Con su icono del Excel (él, 2026-11-08: fuera el ✅/❌; lo que queda por copiar ya sale arriba, "N por subir").
      fila('📊', 'Tu Excel', excel ? 'Abrir o cambiar' : 'Elegir', function () { elegirExcel(excel); }),
    ];
    if (trae.trayendo || trae.fallo || !trae.traido) {
      filas.push(h('div', { class: 'traer-excel' + (trae.trayendo ? ' trayendo' : '') }, [
        h('span', { class: 'fila-ajuste-icono', 'aria-hidden': 'true', texto: trae.trayendo ? '⏳' : trae.fallo ? '⚠️' : '·' }),
        h('span', { class: 'detalle', texto: textoTraer }),
        reintentar,
      ]));
    }
    grupo(cont, 'Privacidad', [fila(Iconos.privacidad(), 'Tus datos y tu privacidad', '', Juntos.privacidad)]);

    // Sin Excel no hay copia todavía (llegará con "Conectar con Google").
    if (Almacen.conExcel()) grupo(cont, 'Copia de seguridad', filas);
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
