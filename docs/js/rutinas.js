// Pantalla "Tus entrenos": crear la rutina desde la app (días, semanas del ciclo, entrenos y sus ejercicios).
// Se edita un borrador y solo se guarda en el móvil al pulsar "Guardar". El cálculo está en src/rutina.js.
(function () {
  var h = App.h;
  var formato = App.formato;
  var borrador = null;
  var abiertos = {};   // entrenos desplegados
  var semanaVista = {};   // por entreno, la sesión (semana) que se está mirando; sin ella, todas
  var DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  var DIAS_LARGOS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  var TIPOS = [
    { id: 'principal', nombre: 'Principal', pista: 'Con su 1RM: los kg salen solos' },
    { id: 'secundario', nombre: 'Secundario', pista: 'Los kg de la última vez' },
    { id: 'debil', nombre: 'Weak point', pista: 'Al empezar, para el punto débil' },
  ];
  var DESCANSOS = [30, 45, 60, 90, 120, 150, 180, 240];

  function copia(x) {
    return JSON.parse(JSON.stringify(x));
  }

  function hoy() {
    return Almacen.hoyISO();
  }

  // El lunes que viene (o hoy si es lunes): es lo que más se elige para empezar.
  function proximoLunes() {
    var d = Rutina.diaSemana(hoy());
    return Rutina.sumarDias(hoy(), d === 0 ? 0 : 7 - d);
  }

  function vacia() {
    // Lunes, miércoles y viernes, y un ciclo de 8 semanas desde el lunes que viene, sin AMRAP (se pone en "Más opciones").
    var inicio = proximoLunes();
    return { version: 1, dias: { patron: 'EDEDEDD', inicio: inicio, fin: inicio }, semanas: 8, amrap: false, progresiones: [], entrenos: [] };
  }

  function usados() {
    var u = {};
    borrador.entrenos.forEach(function (e) {
      u[e.id] = true;
      e.ejercicios.forEach(function (ej) { u[ej.id] = true; });
    });
    return u;
  }

  function fechaLarga(iso) {
    var p = iso.split('-').map(Number);
    var t = new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // Repinta sin subir arriba (él, 2026-10-09: "cada vez que hago algo se me sube la pantalla"). Solo vuelve
  // arriba al pasar de la lista de rutinas al editor o al revés.
  var pintadoModo = null;
  var paso = null;          // asistente de rutina nueva: 'empezar' | 'dias' | 'cuantos'; null = lista o editor
  var avanzado = false;     // "Más opciones" (ciclo, AMRAP, progresiones) desplegado
  var cuantos = 0;          // asistente: cuántos entrenos distintos
  function modo() {
    return paso ? 'asistente-' + paso : borrador ? 'editor' : 'lista';
  }
  function repintar() {
    if (pintadoModo === modo()) App.repintar();
    else App.mostrar('rutina');
  }

  // ---- Días: una semana de lunes a domingo (o dos que se alternan) ----

  function filaSemana(patron, desde, titulo) {
    return h('div', { class: 'semana-dias' }, [
      titulo ? h('p', { class: 'tipo', texto: titulo }) : null,
      h('div', { class: 'patron' }, DIAS.map(function (d, i) {
        var j = desde + i;
        var entreno = patron.charAt(j) === 'E';
        return h('button', {
          type: 'button', class: 'dia-patron' + (entreno ? ' entreno' : ''), 'aria-pressed': entreno ? 'true' : 'false',
          'aria-label': DIAS_LARGOS[i] + ': ' + (entreno ? 'entreno' : 'descanso'),
          onclick: function () {
            borrador.dias.patron = patron.slice(0, j) + (entreno ? 'D' : 'E') + patron.slice(j + 1);
            repintar();
          },
        }, [h('span', { class: 'dia-patron-num', texto: d }), entreno ? Iconos.entreno() : h('span', { texto: '·' })]);
      })),
    ]);
  }

  function tarjetaDias(cont) {
    var patron = borrador.dias.patron;
    var dos = patron.length === 14;
    cont.appendChild(h('section', { class: 'tarjeta' }, [
      h('h2', { texto: 'Qué días entrenas' }),
      filaSemana(patron, 0, dos ? 'Semana 1' : ''),
      dos ? filaSemana(patron, 7, 'Semana 2') : null,
      filaInicio(),
    ]));
  }

  // Cuándo empieza, sin calendario: hoy, el lunes u otro día (el calendario completo está en "Más opciones").
  function filaInicio() {
    var d = borrador.dias;
    var lunes = proximoLunes() === hoy() ? Rutina.sumarDias(hoy(), 7) : proximoLunes();
    var opciones = [[hoy(), 'Hoy'], [lunes, 'El lunes']];
    var otro = opciones.every(function (o) { return o[0] !== d.inicio; });
    return h('div', { class: 'inicio-rutina' }, [
      h('span', { class: 'tipo', texto: 'Empiezas' }),
      h('div', { class: 'segmentos' }, opciones.map(function (o) {
        return h('button', { type: 'button', class: d.inicio === o[0] ? 'activa' : '', texto: o[1], onclick: function () { ponerDia(o[0]); } });
      }).concat([h('button', { type: 'button', class: otro ? 'activa' : '', texto: otro ? fechaCorta(d.inicio) : 'Otro día', onclick: function () {
        var fecha = h('input', { type: 'date', value: d.inicio, 'aria-label': 'Día que empiezas' });
        App.abrirSelector('¿Qué día empiezas?', [fecha, h('button', { type: 'button', class: 'principal', texto: 'Listo', onclick: function () {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha.value)) { App.avisar('Elige un día', true); return; }
          App.cerrarSelector();
          ponerDia(fecha.value);
        } })]);
      } })])),
    ]);
  }

  // ---- Ciclo: cuántas semanas y el día que empieza; el calendario es para verlo ----

  var mesVisto = null;        // 'aaaa-mm' del mes que enseña el calendario

  function fechaCorta(iso) {
    var p = iso.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function sumarMes(mes, n) {
    var p = mes.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1 + n, 1)).toISOString().slice(0, 7);
  }

  // Tocar un día del calendario lo pone como el primero del ciclo.
  function ponerDia(f) {
    borrador.dias.inicio = f;
    repintar();
  }

  function calendario() {
    var d = borrador.dias;
    var mes = mesVisto || d.inicio.slice(0, 7);
    var primero = mes + '-01';
    var siguiente = sumarMes(mes, 1) + '-01';
    var ids = borrador.entrenos.map(function (e) { return e.id; });
    var celdas = DIAS.map(function (x) { return h('span', { class: 'cal-cabecera', texto: x }); });
    for (var i = 0; i < Rutina.diaSemana(primero); i++) celdas.push(h('span'));
    for (var f = primero; f < siguiente; f = Rutina.sumarDias(f, 1)) {
      var dentro = f >= d.inicio && f <= d.fin;
      var t = dentro && Rutina.esEntreno(borrador, f) ? Rutina.porCalendario(borrador, f) : null;
      var clase = 'cal-dia' + (dentro ? ' dentro' : '') + (t ? ' entreno' : '') +
        (t && Rutina.esAmrap(borrador, t.columna) ? ' amrap' : '') +
        (f === d.inicio ? ' inicio' : '') + (f === d.fin ? ' fin' : '') + (f === hoy() ? ' hoy' : '');
      var orden = t ? ids.indexOf(t.entreno) + 1 : 0;
      celdas.push(h('button', { type: 'button', class: clase, 'aria-label': fechaLarga(f), 'data-fecha': f, onclick: function () {
        ponerDia(this.dataset.fecha);
      } }, [
        h('span', { texto: String(Number(f.slice(8))) }),
        t ? h('span', { class: 'cal-entreno', texto: orden ? String(orden) : '•' }) : null,
        t && Rutina.esAmrap(borrador, t.columna) ? h('span', { class: 'cal-amrap', texto: 'AMRAP' }) : null,
      ]));
    }
    var nombreMes = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5)) - 1, 1))
      .toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return h('div', { class: 'calendario' }, [
      h('div', { class: 'cal-mes' }, [
        h('button', { type: 'button', texto: '‹', 'aria-label': 'Mes anterior', onclick: function () { mesVisto = sumarMes(mes, -1); repintar(); } }),
        h('strong', { texto: nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1) }),
        h('button', { type: 'button', texto: '›', 'aria-label': 'Mes siguiente', onclick: function () { mesVisto = sumarMes(mes, 1); repintar(); } }),
      ]),
      h('div', { class: 'cal-rejilla' }, celdas),
    ]);
  }

  function tarjetaCiclo(cont) {
    var d = borrador.dias;
    var amrap = h('input', { type: 'checkbox', checked: !!borrador.amrap, onchange: function () {
      borrador.amrap = amrap.checked;
      repintar();
    } });
    var poner = function (n) {
      n = Math.min(52, Math.max(1, n));
      if (n === borrador.semanas) return;
      cambiarSemanas(n);
      repintar();
    };
    var sesiones = borrador.semanas * borrador.entrenos.length;
    var leyenda = borrador.entrenos.map(function (e, i) { return (i + 1) + ' ' + (e.nombre || '…'); }).join(' · ');
    cont.appendChild(h('section', { class: 'tarjeta' }, [
      h('h2', { texto: 'Ciclo' }),
      h('div', { class: 'ciclo-datos' }, [
        h('div', { class: 'ciclo-dato' }, [
          h('span', { class: 'tipo', texto: 'Semanas' }),
          h('div', { class: 'contador' }, [
            h('button', { type: 'button', texto: '−', 'aria-label': 'Una semana menos', disabled: borrador.semanas <= 1, onclick: function () { poner(borrador.semanas - 1); } }),
            h('strong', { class: 'contador-numero', texto: String(borrador.semanas) }),
            h('button', { type: 'button', texto: '+', 'aria-label': 'Una semana más', onclick: function () { poner(borrador.semanas + 1); } }),
          ]),
        ]),
        h('div', { class: 'ciclo-dato' }, [
          h('span', { class: 'tipo', texto: 'Empieza' }),
          h('strong', { texto: fechaCorta(d.inicio) }),
          h('span', { class: 'detalle', texto: 'Termina ' + fechaCorta(d.fin) }),
        ]),
      ]),
      h('label', { class: 'casilla' }, [amrap, h('span', { texto: borrador.semanas > 1
        ? 'La semana ' + borrador.semanas + ' es AMRAP (al máximo, y recalcula el 1RM)'
        : 'Es AMRAP (al máximo, y recalcula el 1RM)' })]),
      h('p', { class: 'detalle', texto: 'Toca un día del calendario para empezar ese día.' }),
      calendario(),
      leyenda ? h('p', { class: 'detalle', texto: leyenda }) : null,
      borrador.amrap ? h('p', { class: 'detalle cal-leyenda' }, [h('span', { class: 'muestra-amrap' }),
        'AMRAP: un día de cada entreno']) : null,
      h('p', { class: 'resumen-ciclo', texto: borrador.semanas + (borrador.semanas === 1 ? ' semana · ' : ' semanas · ') +
        sesiones + ' entrenos' + (borrador.amrap ? ' · la última, AMRAP' : '') }),
      h('p', { class: 'detalle', texto: 'Cada semana es una vuelta a todos tus entrenos. Al acabar, empieza otro ciclo igual.' }),
      h('button', { type: 'button', class: 'enlace', texto: d.patron.length === 14 ? 'Quitar la semana 2 de días' : '+ Otra semana con días distintos (se alternan)', onclick: function () {
        d.patron = d.patron.length === 14 ? d.patron.slice(0, 7) : d.patron + d.patron;
        repintar();
      } }),
    ]));
  }

  // El fin sale de las semanas: el día del último entreno de la última vuelta.
  function sincronizarSemanas() {
    var d = borrador.dias;
    var dias = Rutina.proximos(borrador, d.inicio, borrador.semanas * Math.max(1, borrador.entrenos.length));
    d.fin = dias.length ? dias[dias.length - 1].fecha : d.inicio;
  }

  // Al cambiar el número de semanas, las progresiones (y los ejercicios que van semana a semana por su cuenta)
  // repiten su última semana o se recortan.
  function cambiarSemanas(n) {
    borrador.semanas = n;
    var ajustar = function (lista) {
      while (lista.length < n) lista.push(copia(lista[lista.length - 1]));
      lista.length = n;
    };
    (borrador.progresiones || []).forEach(function (p) { ajustar(p.semanas); });
    borrador.entrenos.forEach(function (e) {
      e.ejercicios.forEach(function (ej) {
        if (ej.semanas && ej.semanas.length > 1) ajustar(ej.semanas);
        ['descansos', 'notas'].forEach(function (k) { if (ej[k]) ajustar(ej[k]); });
      });
    });
  }

  // ---- Progresiones: lo que cambia de una semana a otra, puesto una vez para varios ejercicios ----

  function usanProgresion(id) {
    var lista = [];
    borrador.entrenos.forEach(function (e) {
      e.ejercicios.forEach(function (ej) { if (ej.progresion === id) lista.push(ej.nombre); });
    });
    return lista;
  }

  function textoSemana(s) {
    return Rutina.textoSeries(s) + (s.pct != null ? ' @' + formato(s.pct) + '%' : '');
  }

  // Un ciclo (por dentro, una "progresión"): por semana, series, reps y % del máximo (1RM). Se crea una vez y se
  // pone en los ejercicios de un día con "Añadir ciclo" (él, 2026-11-08: "que ponga las reps y el % según la semana").
  function resumenCiclo(p) {
    var s = p.semanas;
    if (!s.length) return '';
    var primera = textoSemana(s[0]);
    return s.length > 1 ? 'Semana 1: ' + primera + ' → ' + (Rutina.esAmrap(borrador, s.length) ? 'récord' : 'semana ' + s.length) + ': ' + textoSemana(s[s.length - 1]) : primera;
  }

  // Solo son ciclos los que van por % (o kg por semana); los de las plantillas ("3 series") son de por dentro.
  function esCiclo(p) {
    return p.sube != null || p.semanas.some(function (s) { return s.pct != null; });
  }

  function tarjetaProgresiones(cont) {
    var lista = (borrador.progresiones || (borrador.progresiones = [])).filter(esCiclo);
    cont.appendChild(h('section', { class: 'tarjeta' }, [
      h('h2', { texto: 'Ciclos' }),
      h('p', { class: 'detalle', texto: 'Las reps y el % del máximo de cada semana. Se ponen en un día con "Añadir ciclo".' }),
    ].concat(lista.map(function (p) {
      var usan = usanProgresion(p.id);
      return h('button', { type: 'button', class: 'tarjeta opcion-grande', onclick: function () { editarCiclo(p.id); } }, [
        h('strong', { texto: p.nombre }),
        h('span', { class: 'detalle', texto: resumenCiclo(p) }),
        h('span', { class: 'tipo', texto: usan.length ? 'Lo llevan: ' + usan.join(', ') : 'Sin usar' }),
      ]);
    })).concat([h('button', { type: 'button', class: 'anadir-entreno', texto: '+ Crear ciclo', onclick: function () { editarCiclo(null); } })])));
  }

  // Un ciclo nuevo de muestra: 3 x 8 del 70 % subiendo 2,5 cada semana (el récord, al máximo con el % de la anterior).
  function cicloNuevo() {
    var lista = borrador.progresiones || (borrador.progresiones = []);
    var ids = {};
    lista.forEach(function (p) { ids[p.id] = true; });
    var semanas = [];
    for (var k = 0; k < borrador.semanas; k++) {
      var amrap = borrador.amrap && k === borrador.semanas - 1 && k > 0;
      semanas.push(amrap ? { series: '2', reps: 'AMRAP', pct: 70 + 2.5 * (k - 1) } : { series: '3', reps: '8', pct: 70 + 2.5 * k });
    }
    var n = 1;
    while (lista.some(function (p) { return p.nombre === 'Ciclo ' + n; })) n++;
    return { id: Rutina.idNuevo('P', ids), nombre: 'Ciclo ' + n, semanas: semanas };
  }

  function nuevaProgresion() {
    var p = cicloNuevo();
    borrador.progresiones.push(p);
    return p.id;
  }

  // Hoja para crear o cambiar un ciclo. alGuardar(id) sigue con lo que se estaba haciendo (ponerlo en un día).
  function editarCiclo(id, alGuardar) {
    var original = id ? Rutina.progresionDe(borrador, id) : null;
    var p = original ? copia(original) : cicloNuevo();
    var porKg = p.sube != null;   // los de antes que suben kg por semana, se respetan
    var nombre = h('input', { value: p.nombre, autocomplete: 'off', 'aria-label': 'Nombre del ciclo' });
    nombre.addEventListener('input', function () { p.nombre = nombre.value; });

    function ajustar(n) {
      cambiarSemanas(n);
      while (p.semanas.length < n) p.semanas.push(copia(p.semanas[p.semanas.length - 1]));
      p.semanas.length = n;
      pintar();
    }

    function pintar() {
      var filas = [h('span'), h('span', { class: 'tipo', texto: 'Series' }), h('span', { class: 'tipo', texto: 'Reps' }),
        h('span', { class: 'tipo', texto: porKg ? 'Peso' : '% máx.' })];
      p.semanas.forEach(function (s, k) {
        var entrada = function (c, extra) {
          return h('input', Object.assign({ value: s[c] != null ? s[c] : '', autocomplete: 'off', 'aria-label': c + ' semana ' + (k + 1), oninput: function (ev) {
            var v = ev.target.value.trim();
            if (c === 'pct') v = App.numero(v);
            if (v === '' || v == null) delete s[c]; else s[c] = v;
          } }, extra || {}));
        };
        filas.push(h('span', { class: 'progresion-semana', texto: Rutina.esAmrap(borrador, k + 1) ? 'Récord' : 'Sem ' + (k + 1) }));
        filas.push(entrada('series', { inputmode: 'numeric', placeholder: '3' }));
        filas.push(entrada('reps', { placeholder: '8' }));
        if (porKg && k > 0) {
          var paso = Rutina.esAmrap(borrador, k + 1) ? k - 1 : k;
          filas.push(h('span', { class: 'progresion-mas', texto: paso ? '+' + formato(p.sube * paso) + ' kg' : '= S1' }));
        } else {
          filas.push(entrada('pct', { type: 'number', inputmode: 'decimal', placeholder: '70' }));
        }
      });
      var desde = h('input', { type: 'number', inputmode: 'decimal', placeholder: '70', 'aria-label': 'Primer %' });
      var hasta = h('input', { type: 'number', inputmode: 'decimal', placeholder: '85', 'aria-label': 'Último %' });
      var guardar = h('button', { type: 'button', class: 'principal', texto: original ? 'Guardar' : 'Crear ciclo', onclick: function () {
        p.nombre = nombre.value.trim();
        if (!p.nombre) { App.avisar('Ponle nombre al ciclo', true); return; }
        for (var k = 0; k < p.semanas.length; k++) {
          var s = p.semanas[k];
          if (!Plan.seriesPlan(s.series, s.reps).length) { App.avisar('Semana ' + (k + 1) + ': pon series y reps', true); return; }
          if (!porKg && s.pct == null) { App.avisar('Semana ' + (k + 1) + ': pon el %', true); return; }
        }
        var lista = borrador.progresiones || (borrador.progresiones = []);
        var i = lista.map(function (x) { return x.id; }).indexOf(p.id);
        if (i >= 0) lista[i] = p; else lista.push(p);
        App.cerrarSelector();
        repintar();
        if (alGuardar) alGuardar(p.id);
      } });
      var usan = original ? usanProgresion(p.id) : [];
      App.abrirSelector(original ? p.nombre : 'Nuevo ciclo', [
        campo('Nombre', nombre),
        h('div', { class: 'campo' }, [h('span', { texto: 'Semanas' }), h('div', { class: 'contador' }, [
          h('button', { type: 'button', texto: '−', 'aria-label': 'Una semana menos', disabled: p.semanas.length <= 1, onclick: function () { ajustar(p.semanas.length - 1); } }),
          h('strong', { class: 'contador-numero', texto: String(p.semanas.length) }),
          h('button', { type: 'button', texto: '+', 'aria-label': 'Una semana más', disabled: p.semanas.length >= 16, onclick: function () { ajustar(p.semanas.length + 1); } }),
        ])]),
        h('p', { class: 'detalle', texto: '% del máximo: con un 1RM de 100 kg, 70 % son 70 kg. Al acabar, el ciclo vuelve a empezar.' }),
        h('div', { class: 'progresion-tabla' }, filas),
        porKg ? null : h('div', { class: 'progresion-rellenar' }, [
          h('span', { class: 'detalle', texto: 'Del' }), desde, h('span', { class: 'detalle', texto: '% al' }), hasta,
          h('button', { type: 'button', texto: 'Rellenar', onclick: function () {
            var a = App.numero(desde.value), b = App.numero(hasta.value);
            if (a == null || b == null) { App.avisar('Pon el primer y el último %', true); return; }
            var n = p.semanas.length;
            p.semanas.forEach(function (s, k) { s.pct = n > 1 ? Math.round((a + (b - a) * k / (n - 1)) * 2) / 2 : a; });
            pintar();
          } }),
        ]),
        guardar,
        original && !usan.length ? h('button', { type: 'button', class: 'discreto con-icono', onclick: function () {
          borrador.progresiones = borrador.progresiones.filter(function (x) { return x.id !== p.id; });
          App.cerrarSelector();
          repintar();
        } }, [Iconos.borrar(), 'Borrar ciclo']) : null,
      ]);
    }
    pintar();
  }

  // "Añadir ciclo" de un día: se elige el ciclo (o se crea) y a qué ejercicios de ese día se pone.
  function anadirCiclo(e) {
    var lista = (borrador.progresiones || []).filter(esCiclo);
    App.abrirSelector('Añadir ciclo a ' + (e.nombre || 'este día'), [
      h('p', { class: 'detalle', texto: lista.length ? 'Elige el ciclo:' : 'Todavía no tienes ninguno. Créalo: las reps y el % de cada semana.' }),
    ].concat(lista.map(function (p) {
      return h('button', { type: 'button', class: 'tarjeta opcion-grande', onclick: function () { elegirParaCiclo(e, p.id); } }, [
        h('strong', { texto: p.nombre }),
        h('span', { class: 'detalle', texto: resumenCiclo(p) }),
      ]);
    })).concat([h('button', { type: 'button', class: lista.length ? 'anadir-entreno' : 'principal', texto: '+ Crear ciclo', onclick: function () {
      editarCiclo(null, function (id) { elegirParaCiclo(e, id); });
    } })]));
  }

  function rmConocido(nombre) {
    var rm = Grupos.rmDe(nombre);
    if (!(rm > 0) && typeof Grupos.rmParaCambio === 'function') {
      try { rm = Grupos.rmParaCambio(nombre); } catch (err) { rm = null; }
    }
    return rm > 0 ? Math.round(rm * 2) / 2 : null;
  }

  function elegirParaCiclo(e, id) {
    var p = Rutina.progresionDe(borrador, id);
    var marcados = {};
    e.ejercicios.forEach(function (ej) { if (ej.progresion === id) marcados[ej.id] = true; });
    var cuerpo = h('div', { class: 'elegir-ejercicios' });
    var boton = h('button', { type: 'button', class: 'principal fijo-abajo' });
    function pintar() {
      cuerpo.innerHTML = '';
      e.ejercicios.forEach(function (ej) {
        cuerpo.appendChild(h('button', { type: 'button', class: 'opcion-ejercicio' + (marcados[ej.id] ? ' marcado' : ''), onclick: function () {
          if (marcados[ej.id]) delete marcados[ej.id]; else marcados[ej.id] = true;
          pintar();
        } }, [h('span', { texto: ej.nombre }), h('span', { class: 'marca', texto: marcados[ej.id] ? '✓' : '' })]));
      });
      var n = Object.keys(marcados).length;
      boton.textContent = n ? 'Ponerlo en ' + n + (n === 1 ? ' ejercicio' : ' ejercicios') : 'Quitarlo de todos';
    }
    boton.addEventListener('click', function () {
      var faltan = [];
      e.ejercicios.forEach(function (ej) {
        if (marcados[ej.id]) {
          if (ej.progresion !== id) {
            ej.progresion = id;
            ej.tipo = 'principal';
            delete ej.semanas;
            delete ej.reps;
          }
          if (!(ej.rm > 0)) ej.rm = rmConocido(ej.nombre);
          if (!(ej.rm > 0)) faltan.push(ej);
        } else if (ej.progresion === id) {
          // Fuera del ciclo: vuelve a subir solo, con 3 x 10-12.
          delete ej.progresion;
          delete ej.rm;
          ej.tipo = 'secundario';
          ej.semanas = [{ series: '3', reps: '10-12' }];
        }
      });
      abiertos[e.id] = true;
      if (faltan.length) { pedirRMs(faltan); return; }
      App.cerrarSelector();
      App.avisar(Object.keys(marcados).length ? p.nombre + ' puesto. Los kg salen de tu máximo' : 'Ciclo quitado');
      repintar();
    });
    App.abrirSelector(p.nombre + ' en ' + (e.nombre || 'este día'), [
      h('p', { class: 'detalle', texto: '¿A qué ejercicios? Suelen ser los grandes (press, sentadilla, remo…). Los demás siguen subiendo solos.' }),
      cuerpo, boton,
    ]);
    pintar();
  }

  // Sin el máximo no hay kg: se pide para los que no lo tienen ni guardado ni en el historial.
  function pedirRMs(lista) {
    var campos = lista.map(function (ej) {
      return { ej: ej, input: h('input', { type: 'number', inputmode: 'decimal', step: '0.5', placeholder: 'kg', 'aria-label': '1RM de ' + ej.nombre }) };
    });
    App.abrirSelector('Tu máximo', [
      h('p', { class: 'detalle', texto: 'Los kg que levantas una sola vez. Con eso salen los kg de cada semana.' }),
    ].concat(campos.map(function (c) { return campo(c.ej.nombre, c.input); })).concat([
      h('button', { type: 'button', class: 'principal', texto: 'Guardar', onclick: function () {
        campos.forEach(function (c) {
          var v = App.numero(c.input.value);
          if (v > 0) c.ej.rm = v;
        });
        App.cerrarSelector();
        repintar();
      } }),
    ]));
  }

  // ---- Entrenos ----

  // Lo de una sesión: "4 x 6 @70% → 85 kg · 2:00 · RIR 2".
  function textoSesion(ej, semana) {
    var lista = Rutina.semanasDe(borrador, ej);
    var s = lista[Math.min(semana, lista.length) - 1] || {};
    var partes = [textoSemana(s) + (ej.tipo === 'principal' && ej.rm != null && s.pct != null ? ' → ' + formato(Rutina.kgDesdeRM(ej.rm, s.pct)) + ' kg' : '')];
    if (s.descanso) partes.push(App.reloj(s.descanso));
    if (s.nota) partes.push(s.nota);
    return partes.join(' · ');
  }

  // Para cambiar una sola semana, el ejercicio deja su progresión y se queda con sus semanas escritas una a una
  // (las de la progresión tal cual): las demás no cambian.
  function semanasPropias(ej) {
    var lista = Rutina.semanasDe(borrador, ej);
    var semanas = [], descansos = [], notas = [];
    for (var i = 0; i < borrador.semanas; i++) {
      var s = copia(lista[Math.min(i, lista.length - 1)] || { series: '3' });
      descansos.push(s.descanso || null);
      notas.push(s.nota || '');
      delete s.descanso;
      delete s.nota;
      if (ej.tipo !== 'principal') delete s.pct;
      semanas.push(s);
    }
    ej.semanas = semanas;
    ej.descansos = descansos;
    ej.notas = notas;
    delete ej.progresion;
    delete ej.reps;
    delete ej.descanso;
    delete ej.nota;
  }

  function editarSesion(e, k, semana) {
    var ej = e.ejercicios[k];
    var lista = Rutina.semanasDe(borrador, ej);
    var s = lista[Math.min(semana, lista.length) - 1] || {};
    var principal = ej.tipo === 'principal';
    var series = h('input', { value: s.series || '', placeholder: '3', autocomplete: 'off' });
    var reps = h('input', { value: s.reps || '', placeholder: '10-12', autocomplete: 'off' });
    var pct = h('input', { type: 'number', inputmode: 'decimal', value: s.pct != null ? s.pct : '', placeholder: '75' });
    var cajaPct = campo('% 1RM', pct);
    cajaPct.hidden = !principal;
    var kg = h('p', { class: 'detalle vista-semanas' });
    var mostrarKg = function () {
      var p = App.numero(pct.value);
      kg.textContent = principal && ej.rm != null && p != null ? '→ ' + formato(Rutina.kgDesdeRM(ej.rm, p)) + ' kg (1RM ' + formato(ej.rm) + ')' : '';
    };
    pct.addEventListener('input', mostrarKg);
    mostrarKg();
    var actual = s.descanso || 90;
    var opciones = DESCANSOS.indexOf(actual) < 0 ? DESCANSOS.concat([actual]).sort(function (a, b) { return a - b; }) : DESCANSOS;
    var descanso = h('select', { 'aria-label': 'Descanso' }, opciones.map(function (d) {
      return h('option', { value: d, selected: d === actual, texto: App.reloj(d) });
    }));
    var nota = h('input', { value: s.nota || '', placeholder: 'RIR 2…', autocomplete: 'off' });
    var p = ej.progresion ? Rutina.progresionDe(borrador, ej.progresion) : null;

    var guardar = h('button', { type: 'button', class: 'principal', texto: 'Guardar', onclick: function () {
      var nueva = { series: series.value.trim() };
      if (reps.value.trim()) nueva.reps = reps.value.trim();
      if (!Plan.seriesPlan(nueva.series, nueva.reps || '').length) { App.avisar('Pon las series, por ejemplo 3 y 10-12', true); return; }
      if (principal) {
        var v = App.numero(pct.value);
        if (v == null) { App.avisar('Pon el % del 1RM', true); return; }
        nueva.pct = v;
      }
      semanasPropias(ej);
      ej.semanas[semana - 1] = nueva;
      ej.descansos[semana - 1] = Number(descanso.value) || null;
      ej.notas[semana - 1] = nota.value.trim();
      App.cerrarSelector();
      repintar();
    } });

    App.abrirSelector(ej.nombre + ' · ' + Rutina.nombreColumna(borrador, semana), [
      h('p', { class: 'detalle', texto: (e.nombre || 'Entreno') + ', ' + Rutina.nombreColumna(borrador, semana).toLowerCase() +
        '. Cambia solo esta sesión' + (p ? '; deja de seguir "' + p.nombre + '" y se queda con sus semanas como están.' : '.') }),
      h('div', { class: 'semana-campos' }, [campo('Series', series), campo('Reps', reps), cajaPct]),
      kg,
      h('div', { class: 'selectores' }, [campo('Descanso', descanso), campo('Nota', nota)]),
      guardar,
      h('button', { type: 'button', class: 'discreto', texto: 'Todas las semanas de ' + ej.nombre + ' ›', onclick: function () {
        App.cerrarSelector();
        editarEjercicio(e, k);
      } }),
    ]);
  }

  function mover(lista, i, paso) {
    var j = i + paso;
    if (j < 0 || j >= lista.length) return;
    var x = lista[i];
    lista[i] = lista[j];
    lista[j] = x;
    repintar();
  }

  function tarjetaEntreno(cont, e, i) {
    var abierto = !!abiertos[e.id];
    var nombre = h('input', { value: e.nombre, placeholder: 'Push, Pierna…', 'aria-label': 'Nombre del entreno', onchange: function () {
      e.nombre = nombre.value.trim();
    } });
    var cuerpo = h('div', { class: 'entreno-cuerpo' });
    cuerpo.hidden = !abierto;

    // Ver una sesión (una semana de este entreno) con todos sus ejercicios y cambiarla sola (él, 2026-10-09).
    var semana = avanzado && borrador.semanas > 1 ? semanaVista[e.id] || 0 : 0;
    if (semana > borrador.semanas) semana = 0;
    if (avanzado && borrador.semanas > 1) {
      var botones = [h('button', { type: 'button', class: 'chip' + (semana ? '' : ' activa'), texto: 'Todas', onclick: function () {
        delete semanaVista[e.id];
        repintar();
      } })];
      for (var c = 1; c <= borrador.semanas; c++) {
        botones.push(h('button', { type: 'button', class: 'chip' + (semana === c ? ' activa' : '') + (Rutina.esAmrap(borrador, c) ? ' amrap' : ''),
          texto: Rutina.esAmrap(borrador, c) ? 'AMRAP' : 'S' + c, onclick: (function (c) { return function () {
            semanaVista[e.id] = c;
            repintar();
          }; })(c) }));
      }
      cuerpo.appendChild(h('div', { class: 'semanas-sesion', role: 'group', 'aria-label': 'Sesión' }, botones));
      if (semana) {
        cuerpo.appendChild(h('p', { class: 'detalle', texto: (e.nombre || 'Entreno') + ' · ' + Rutina.nombreColumna(borrador, semana) +
          '. Toca un ejercicio para cambiarlo solo en esta sesión.' }));
      }
    }

    e.ejercicios.forEach(function (ej, k) {
      var enJump = ej.junto || (k > 0 && e.ejercicios[k - 1].junto);
      // Solo se dice el tipo si no es el normal (secundario): así la fila queda en "3 x 10-12 · 1:30".
      var ciclo = ej.progresion && ej.tipo === 'principal' ? Rutina.progresionDe(borrador, ej.progresion) : null;
      var marcas = ciclo ? ['Ciclo: ' + ciclo.nombre] : ej.tipo === 'secundario' ? [] : [TIPOS.filter(function (t) { return t.id === ej.tipo; })[0].nombre];
      if (enJump) marcas.push('Jump set');
      if (ej.dropset) marcas.push('Drop set');
      var marcaTexto = marcas.join(' · ') + (ej.tipo === 'principal' ? (ej.rm > 0 ? ' · 1RM ' + formato(ej.rm) : ' · falta tu 1RM') : '');
      cuerpo.appendChild(h('div', { class: 'fila-ejercicio' + (enJump ? ' en-jump' : '') }, [
        h('button', { type: 'button', class: 'fila-ejercicio-datos', onclick: function () {
          if (semana) editarSesion(e, k, semana); else editarEjercicio(e, k);
        } }, [
          h('strong', { texto: (k + 1) + '. ' + (ej.nombre || 'Sin nombre') }),
          marcaTexto ? h('span', { class: 'tipo', texto: marcaTexto }) : null,
          h('span', { class: 'detalle', texto: semana ? textoSesion(ej, semana) : resumenSimple(ej) }),
        ]),
        h('div', { class: 'flechas' }, [
          h('button', { type: 'button', texto: '↑', 'aria-label': 'Subir', disabled: k === 0, onclick: function () { mover(e.ejercicios, k, -1); } }),
          h('button', { type: 'button', texto: '↓', 'aria-label': 'Bajar', disabled: k === e.ejercicios.length - 1, onclick: function () { mover(e.ejercicios, k, 1); } }),
        ]),
      ]));
    });
    if (!e.ejercicios.length) cuerpo.appendChild(h('p', { class: 'vacio', texto: 'Sin ejercicios todavía.' }));
    cuerpo.appendChild(h('button', { type: 'button', class: 'principal con-icono', onclick: function () { elegirEjercicios(e); } }, [Iconos.nuevoEjercicio(), 'Añadir ejercicios']));
    if (e.ejercicios.length) cuerpo.appendChild(h('button', { type: 'button', class: 'anadir-ciclo', texto: '+ Añadir ciclo', onclick: function () { anadirCiclo(e); } }));
    cuerpo.appendChild(h('div', { class: 'acciones-cabecera' }, [
      h('button', { type: 'button', texto: '↑ Antes', disabled: i === 0, onclick: function () { mover(borrador.entrenos, i, -1); } }),
      h('button', { type: 'button', texto: '↓ Después', disabled: i === borrador.entrenos.length - 1, onclick: function () { mover(borrador.entrenos, i, 1); } }),
      h('button', { type: 'button', class: 'discreto con-icono', onclick: function () { quitarEntreno(i); } }, [Iconos.borrar(), 'Quitar']),
    ]));

    cont.appendChild(h('section', { class: 'tarjeta entreno-rutina' }, [
      h('div', { class: 'entreno-cabecera' }, [
        h('span', { class: 'entreno-orden', texto: String(i + 1) }),
        nombre,
        h('button', { type: 'button', class: 'discreto', texto: abierto ? '▲' : '▼ ' + e.ejercicios.length,
          'aria-label': abierto ? 'Cerrar' : 'Ver ejercicios', onclick: function () {
            abiertos[e.id] = !abierto;
            repintar();
          } }),
      ]),
      cuerpo,
    ]));
  }

  function quitarEntreno(i) {
    var e = borrador.entrenos[i];
    App.abrirSelector('¿Quitar ' + (e.nombre || 'este entreno') + '?', [
      h('p', { class: 'detalle', texto: 'Se quitan sus ' + e.ejercicios.length + ' ejercicios de la rutina. Lo que ya hiciste sigue en el historial.' }),
      h('button', { type: 'button', class: 'principal', texto: 'Quitar', onclick: function () {
        borrador.entrenos.splice(i, 1);
        App.cerrarSelector();
        repintar();
      } }),
    ]);
  }

  function nuevoEntreno() {
    var id = Rutina.idNuevo('E', usados());
    var e = { id: id, nombre: 'Día ' + 'ABCDEFGHIJ'.charAt(borrador.entrenos.length), ejercicios: [] };
    borrador.entrenos.push(e);
    abiertos[id] = true;
    repintar();
    elegirEjercicios(e);
  }

  // ---- Editor de un ejercicio (en la ventana de abajo) ----

  function campo(texto, control) {
    return h('label', { class: 'campo' }, [h('span', { texto: texto }), control]);
  }

  // Series de una lista de semanas multiplicadas a otro número: la progresión "3 series" pasa a "2 series" con su
  // semana suave a escala (3 → 2, 2 → 1). Las que no son un número solo ("2x8 + 2x7") se quedan como están.
  function escalarSeries(semanas, antes, n) {
    return semanas.map(function (s) {
      var c = copia(s);
      var v = Number(String(s.series).trim());
      if (/^\d+$/.test(String(s.series).trim()) && antes > 0) c.series = String(Math.max(1, Math.round(v * n / antes)));
      return c;
    });
  }

  // Lo de la fila de un ejercicio: "3 x 10-12 · 1:30".
  function resumenSimple(ej) {
    var s = Rutina.semanasDe(borrador, ej)[0] || {};
    var partes = [textoSemana(s)];
    if (s.descanso) partes.push(App.reloj(s.descanso));
    return partes.join(' · ');
  }

  var REPS_RAPIDAS = ['6-8', '8-10', '10-12', '12-15'];
  var DESCANSOS_RAPIDOS = [60, 90, 120, 180];

  function editarEjercicio(e, k) {
    var nuevo = k < 0;
    var ej = nuevo
      ? { id: Rutina.idNuevo(e.id + '-', usados()), nombre: '', tipo: 'secundario', descanso: 90, semanas: [{ series: '3', reps: '10-12' }] }
      : copia(e.ejercicios[k]);
    var descansoInicial = ej.descanso || 90;
    // Los que vienen semana a semana por su cuenta se quedan así; lo normal es "iguales" o una progresión.
    var propias = ej.semanas && ej.semanas.length > 1 ? ej.semanas : null;
    var una = (ej.semanas && ej.semanas[0]) || { series: '3', reps: ej.reps || '10-12' };
    var forzar = null;   // progresión recién creada que el desplegable aún no tiene

    var lista = h('datalist', { id: 'ejercicios-conocidos' }, (((Almacen.plan() || {}).grupos) || []).map(function (f) {
      return h('option', { value: f[0] });
    }));
    var nombre = h('input', { value: ej.nombre, list: 'ejercicios-conocidos', placeholder: 'Press Banca', autocomplete: 'off' });
    var tipos = h('div', { class: 'segmentos' });
    var rm = h('input', { type: 'number', inputmode: 'decimal', step: '0.5', value: ej.rm != null ? ej.rm : '', placeholder: 'kg' });
    var cajaRM = campo('1RM (kg que levantas una vez)', rm);
    var semanas = h('select', { 'aria-label': 'Semanas' });
    var cajaSemanas = campo('Cómo va cada semana', semanas);
    var series = h('input', { name: 'series', value: una.series || '', autocomplete: 'off' });
    var reps = h('input', { name: 'reps', value: (ej.progresion ? ej.reps : una.reps) || '', placeholder: 'Otras: 5, 20…', autocomplete: 'off', 'aria-label': 'Repeticiones' });
    var pct = h('input', { name: 'pct', type: 'number', inputmode: 'decimal', value: una.pct != null ? una.pct : '', placeholder: '75' });
    var cajaPct = campo('% 1RM', pct);
    var vista = h('p', { class: 'detalle vista-semanas' });
    var opcionesDescanso = DESCANSOS.indexOf(descansoInicial) < 0
      ? DESCANSOS.concat([descansoInicial]).sort(function (a, b) { return a - b; }) : DESCANSOS;
    var descanso = h('select', { 'aria-label': 'Descanso' }, opcionesDescanso.map(function (d) {
      return h('option', { value: d, selected: d === descansoInicial, texto: App.reloj(d) });
    }));
    var nota = h('input', { value: ej.nota || '', placeholder: 'RIR 2, 1 y 1/2…', autocomplete: 'off' });
    var jump = h('input', { type: 'checkbox', checked: !!ej.junto });
    var drop = h('input', { type: 'checkbox', checked: !!ej.dropset });
    var bajadas = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '5', value: ej.dropset ? ej.dropset.bajadas : 2 });
    var pctDrop = h('input', { type: 'number', inputmode: 'numeric', min: '5', max: '50', step: '5', value: ej.dropset ? ej.dropset.porcentaje : 20 });
    var cajaDrop = h('div', { class: 'selectores' }, [campo('Bajadas', bajadas), campo('% que baja', pctDrop)]);

    // Lo simple, a la vista: series con − y +, reps y descanso con un toque.
    var numSeries = h('strong', { class: 'contador-numero' });
    var contSeries = h('div', { class: 'contador' }, [
      h('button', { type: 'button', texto: '−', 'aria-label': 'Una serie menos', onclick: function () { ponerSeries(seriesAhora() - 1); } }),
      numSeries,
      h('button', { type: 'button', texto: '+', 'aria-label': 'Una serie más', onclick: function () { ponerSeries(seriesAhora() + 1); } }),
    ]);
    var chipsReps = h('div', { class: 'segmentos' });
    var bloqueReps = h('div', { class: 'campo' }, [h('span', { texto: 'Repeticiones' }), chipsReps, reps]);
    var chipsDescanso = h('div', { class: 'segmentos' });

    function seriesAhora() {
      var n = parseInt((Rutina.semanasDe(borrador, ej)[0] || {}).series, 10);
      return n > 0 ? n : 3;
    }

    function ponerSeries(n) {
      n = Math.max(1, Math.min(10, n));
      leer();
      var antes = seriesAhora();
      if (n === antes) return;
      var elegido = semanas.value;
      if (elegido === 'iguales') {
        series.value = String(n);
      } else if (elegido === 'propias') {
        propias = escalarSeries(propias, antes, n);
      } else {
        // Con una progresión, se pasa a la que es igual con otro número de series; si no hay, se crea.
        var p = Rutina.progresionDe(borrador, elegido);
        if (!p) return;
        var quiero = escalarSeries(p.semanas, antes, n);
        var otra = (borrador.progresiones || []).filter(function (x) {
          return (x.sube == null) === (p.sube == null) && x.sube === p.sube && JSON.stringify(x.semanas) === JSON.stringify(quiero);
        })[0];
        if (!otra) {
          var ids = {};
          borrador.progresiones.forEach(function (x) { ids[x.id] = true; });
          otra = copia(p);
          otra.id = Rutina.idNuevo('P', ids);
          otra.nombre = n + ' series' + (borrador.progresiones.some(function (x) { return x.nombre === n + ' series'; }) ? ' (' + p.nombre + ')' : '');
          otra.semanas = quiero;
          borrador.progresiones.push(otra);
        }
        forzar = otra.id;
      }
      pintar();
    }

    // Lo que queda en cada semana con lo puesto ahora, para verlo antes de guardar.
    function leer() {
      ej.nombre = nombre.value.trim();
      if (ej.tipo === 'principal') ej.rm = App.numero(rm.value); else delete ej.rm;
      var elegido = semanas.value;
      if (elegido === 'propias') {
        ej.semanas = propias;
        delete ej.progresion;
        delete ej.reps;
      } else if (elegido === 'iguales') {
        var s = { series: series.value.trim() || '3' };
        if (reps.value.trim()) s.reps = reps.value.trim();
        if (ej.tipo === 'principal' && App.numero(pct.value) != null) s.pct = App.numero(pct.value);
        ej.semanas = [s];
        delete ej.progresion;
        delete ej.reps;
      } else if (elegido) {
        ej.progresion = elegido;
        delete ej.semanas;
        if (reps.value.trim()) ej.reps = reps.value.trim(); else delete ej.reps;
      }
      ej.descanso = Number(descanso.value) || null;
      if (nota.value.trim()) ej.nota = nota.value.trim(); else delete ej.nota;
    }

    function pintar() {
      tipos.innerHTML = '';
      TIPOS.forEach(function (t) {
        tipos.appendChild(h('button', { type: 'button', class: ej.tipo === t.id ? 'activa' : '', texto: t.nombre, onclick: function () {
          leer();
          ej.tipo = t.id;
          pintar();
        } }));
      });
      var principal = ej.tipo === 'principal';
      cajaRM.hidden = !principal;
      var elegido = forzar || semanas.value || (ej.progresion ? ej.progresion : propias ? 'propias' : 'iguales');
      forzar = null;
      semanas.innerHTML = '';
      var opciones = [['iguales', 'Sube solo (igual todas las semanas)']];
      (borrador.progresiones || []).forEach(function (p) { opciones.push([p.id, 'Ciclo: ' + p.nombre]); });
      if (propias) opciones.push(['propias', 'Las suyas, semana a semana']);
      opciones.push(['nueva', '+ Nuevo ciclo…']);
      opciones.forEach(function (o) { semanas.appendChild(h('option', { value: o[0], selected: o[0] === elegido, texto: o[1] })); });
      cajaSemanas.hidden = borrador.semanas <= 1 && !ej.progresion;
      var iguales = elegido === 'iguales';
      cajaPct.hidden = !iguales || !principal;
      // En una progresión, las reps son las del ejercicio (los principales ya las llevan en la progresión: "4x6").
      bloqueReps.hidden = elegido === 'propias' || (!iguales && principal);
      leer();
      numSeries.textContent = String(seriesAhora());
      chipsReps.innerHTML = '';
      REPS_RAPIDAS.forEach(function (r) {
        chipsReps.appendChild(h('button', { type: 'button', class: reps.value.trim() === r ? 'activa' : '', texto: r, onclick: function () {
          reps.value = r;
          pintar();
        } }));
      });
      var rapidos = DESCANSOS_RAPIDOS.slice();
      var actual = Number(descanso.value);
      if (actual && rapidos.indexOf(actual) < 0) rapidos = rapidos.concat([actual]).sort(function (a, b) { return a - b; });
      chipsDescanso.innerHTML = '';
      rapidos.forEach(function (d) {
        chipsDescanso.appendChild(h('button', { type: 'button', class: d === actual ? 'activa' : '', texto: App.reloj(d), onclick: function () {
          descanso.value = String(d);
          pintar();
        } }));
      });
      var lasSemanas = Rutina.semanasDe(borrador, ej);
      vista.textContent = borrador.semanas > 1 && lasSemanas.length
        ? lasSemanas.slice(0, borrador.semanas).map(function (s, i) {
          var kg = principal && ej.rm != null && s.pct != null ? ' → ' + formato(Rutina.kgDesdeRM(ej.rm, s.pct)) + ' kg' : '';
          return (Rutina.nombreColumna(borrador, i + 1) || '').replace('Semana ', 'S') + ': ' + textoSemana(s) + kg;
        }).join(' · ')
        : principal && ej.rm != null && lasSemanas[0] && lasSemanas[0].pct != null
          ? '→ ' + formato(Rutina.kgDesdeRM(ej.rm, lasSemanas[0].pct)) + ' kg' : '';
      cajaDrop.hidden = !drop.checked;
    }

    semanas.addEventListener('change', function () {
      if (semanas.value === 'nueva') {
        leer();
        var id = nuevaProgresion();
        App.avisar('Ciclo creado: cámbialo en "Más opciones" → Ciclos');
        forzar = id;
      }
      pintar();
    });
    [rm, reps, pct, descanso].forEach(function (c) { c.addEventListener('change', pintar); });
    drop.addEventListener('change', function () { cajaDrop.hidden = !drop.checked; });
    pintar();

    var guardar = h('button', { type: 'button', class: 'principal', texto: nuevo ? 'Añadir' : 'Guardar', onclick: function () {
      leer();
      if (!ej.nombre) { App.avisar('Ponle nombre al ejercicio', true); return; }
      var lasSemanas = Rutina.semanasDe(borrador, ej);
      if (!lasSemanas.length || !lasSemanas.every(function (s) { return Plan.seriesPlan(s.series, s.reps).length; })) {
        App.avisar(ej.progresion ? 'Pon las reps (o rellena la progresión)' : 'Elige las repeticiones', true);
        return;
      }
      if (ej.tipo === 'principal' && lasSemanas.some(function (s) { return s.pct == null; })) {
        App.avisar(ej.progresion ? 'A la progresión le falta el %' : 'Pon el % del 1RM', true);
        return;
      }
      // Descanso y nota puestos a mano valen para todas las semanas.
      if (ej.descansos && Number(descanso.value) !== descansoInicial) delete ej.descansos;
      if (ej.notas && nota.value.trim()) delete ej.notas;
      if (jump.checked) ej.junto = true; else delete ej.junto;
      if (drop.checked) {
        ej.dropset = { bajadas: Math.round(App.numero(bajadas.value)) || 2, porcentaje: App.numero(pctDrop.value) || 20 };
      } else delete ej.dropset;
      if (nuevo) e.ejercicios.push(ej); else e.ejercicios[k] = ej;
      App.cerrarSelector();
      repintar();
    } });

    // Lo de entrenador: tipo y 1RM, cómo cambia cada semana, nota, jump set y drop set. Abierto si ya se usa algo.
    var usaAlgo = ej.tipo !== 'secundario' || !!ej.junto || !!ej.dropset || !!ej.nota || !!ej.notas || !!propias;
    var mas = h('details', { class: 'plegable mas-ejercicio', open: usaAlgo }, [
      h('summary', {}, [
        h('span', { class: 'plegable-titulo', texto: 'Más opciones' }),
        h('span', { class: 'plegable-pista', texto: 'Principal y 1RM, semanas, jump set…' }),
      ]),
      h('div', { class: 'plegable-cuerpo' }, [
        tipos,
        cajaRM,
        cajaSemanas,
        cajaPct,
        vista,
        h('div', { class: 'selectores' }, [campo('Otro descanso', descanso), campo('Nota', nota)]),
        ej.notas ? h('p', { class: 'detalle', texto: 'La nota cambia cada semana: ' + ej.notas.filter(Boolean).join(' → ') + '. Si escribes una, vale para todas.' }) : null,
        h('label', { class: 'casilla' }, [jump, h('span', { texto: 'Jump set con el siguiente ejercicio' })]),
        h('label', { class: 'casilla' }, [drop, h('span', { texto: 'Drop set: tras la última serie, bajar el peso sin descanso' })]),
        cajaDrop,
      ]),
    ]);

    var hijos = [
      lista,
      campo('Ejercicio', nombre),
      h('div', { class: 'campo' }, [h('span', { texto: 'Series' }), contSeries]),
      bloqueReps,
      h('div', { class: 'campo' }, [h('span', { texto: 'Descanso' }), chipsDescanso]),
      guardar,
      mas,
    ];
    if (!nuevo) {
      hijos.push(h('button', { type: 'button', class: 'discreto con-icono', onclick: function () {
        e.ejercicios.splice(k, 1);
        App.cerrarSelector();
        repintar();
      } }, [Iconos.borrar(), 'Quitar ejercicio']));
    }
    App.abrirSelector(nuevo ? 'Nuevo ejercicio en ' + e.nombre : ej.nombre, hijos);
  }

  // ---- Elegir varios ejercicios de golpe (la forma normal de llenar un entreno) ----

  function clave(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();
  }

  function ejercicioNuevo(e, nombre) {
    return { id: Rutina.idNuevo(e.id + '-', usados()), nombre: nombre, tipo: 'secundario', descanso: 90, semanas: [{ series: '3', reps: '10-12' }] };
  }

  function elegirEjercicios(e) {
    var marcados = [];   // en el orden en que se tocan: es el orden en que se harán
    var ya = {};
    e.ejercicios.forEach(function (x) { ya[clave(x.nombre)] = true; });
    var vistos = {};
    var todos = [];
    (((Almacen.plan() || {}).grupos) || []).forEach(function (f) {
      var c = clave(f[0]);
      if (!f[0] || vistos[c]) return;
      vistos[c] = true;
      todos.push({ nombre: f[0], grupo: f[1] || 'Otros' });
    });
    var buscar = h('input', { type: 'search', placeholder: 'Buscar o escribir uno nuevo', autocomplete: 'off', 'aria-label': 'Buscar ejercicio' });
    var cuerpo = h('div', { class: 'elegir-ejercicios' });
    var boton = h('button', { type: 'button', class: 'principal fijo-abajo' });

    function marcado(nombre) {
      return marcados.indexOf(nombre) >= 0;
    }

    function opcion(nombre) {
      var esta = ya[clave(nombre)];
      var n = marcados.indexOf(nombre);
      return h('button', { type: 'button', class: 'opcion-ejercicio' + (n >= 0 ? ' marcado' : ''), disabled: !!esta, onclick: function () {
        if (marcado(nombre)) marcados.splice(marcados.indexOf(nombre), 1); else marcados.push(nombre);
        pintar();
      } }, [h('span', { texto: nombre }), h('span', { class: 'marca', texto: esta ? 'Ya está' : n >= 0 ? String(n + 1) : '' })]);
    }

    function pintar() {
      cuerpo.innerHTML = '';
      var q = clave(buscar.value);
      // Los escritos a mano (no están en tu lista), arriba.
      marcados.forEach(function (m) {
        if (!vistos[clave(m)]) cuerpo.appendChild(opcion(m));
      });
      if (q && !vistos[q] && !marcados.some(function (m) { return clave(m) === q; })) {
        var texto = buscar.value.trim();
        cuerpo.appendChild(h('button', { type: 'button', class: 'opcion-ejercicio nuevo', onclick: function () {
          marcados.push(texto);
          buscar.value = '';
          pintar();
        } }, [h('span', { texto: '+ Añadir «' + texto + '»' })]));
      }
      var grupos = [];
      var porGrupo = {};
      todos.forEach(function (x) {
        if (q && clave(x.nombre).indexOf(q) < 0 && clave(x.grupo).indexOf(q) < 0) return;
        if (!porGrupo[x.grupo]) { porGrupo[x.grupo] = []; grupos.push(x.grupo); }
        porGrupo[x.grupo].push(x.nombre);
      });
      grupos.forEach(function (g) {
        cuerpo.appendChild(h('p', { class: 'tipo grupo-elegir', texto: g }));
        porGrupo[g].forEach(function (n) { cuerpo.appendChild(opcion(n)); });
      });
      if (!grupos.length && !q) cuerpo.appendChild(h('p', { class: 'detalle', texto: 'Escribe el nombre del ejercicio arriba.' }));
      var n = marcados.length;
      boton.textContent = n ? 'Añadir ' + n + (n === 1 ? ' ejercicio' : ' ejercicios') : 'Toca los ejercicios que haces';
      boton.disabled = !n;
    }

    buscar.addEventListener('input', pintar);
    boton.addEventListener('click', function () {
      marcados.forEach(function (m) { e.ejercicios.push(ejercicioNuevo(e, m)); });
      abiertos[e.id] = true;
      App.cerrarSelector();
      App.avisar(marcados.length === 1 ? 'Añadido. Tócalo para cambiar series o reps' : 'Añadidos con 3 x 10-12. Toca uno para cambiarlo');
      repintar();
    });
    App.abrirSelector('Ejercicios de ' + (e.nombre || 'este entreno'), [
      h('p', { class: 'detalle', texto: 'Tócalos en el orden en que los haces.' }),
      buscar, cuerpo, boton,
    ]);
    pintar();
  }

  // ---- Rutina nueva paso a paso: plantilla o desde cero (días → cuántos entrenos → ejercicios) ----

  var DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  function usarPlantilla(id) {
    var r = Inicial.rutina(id, proximoLunes());
    delete r.id;
    borrador = r;
    abiertos = {};
    r.entrenos.forEach(function (x) { abiertos[x.id] = true; });
    paso = null;
    App.avisar('Cámbiala a tu gusto y pulsa Guardar');
    repintar();
  }

  function opcionesEmpezar(cont) {
    Inicial.PLANTILLAS.forEach(function (p) {
      cont.appendChild(h('button', { type: 'button', class: 'tarjeta opcion-grande', onclick: function () { usarPlantilla(p.id); } }, [
        h('strong', { texto: p.nombre }),
        h('span', { class: 'detalle', texto: p.detalle }),
        h('span', { class: 'tipo', texto: 'Ya hecha · la cambias a tu gusto' }),
      ]));
    });
    cont.appendChild(h('button', { type: 'button', class: 'tarjeta opcion-grande', onclick: function () {
      borrador = vacia();
      abiertos = {};
      paso = 'dias';
      cuantos = 0;
      repintar();
    } }, [
      h('strong', { texto: 'Desde cero' }),
      h('span', { class: 'detalle', texto: 'Eliges tus días y tus ejercicios' }),
    ]));
  }

  function crearEntrenos(k) {
    var letras = 'ABCDEF';
    borrador.entrenos = [];
    for (var i = 0; i < k; i++) {
      borrador.entrenos.push({ id: 'E' + (i + 1), nombre: k === 1 ? 'Cuerpo entero' : 'Día ' + letras.charAt(i), ejercicios: [] });
    }
    abiertos = {};
    borrador.entrenos.forEach(function (x) { abiertos[x.id] = true; });
    paso = null;
    repintar();
    elegirEjercicios(borrador.entrenos[0]);
  }

  function pintarAsistente(cont) {
    var atras = { empezar: null, dias: 'empezar', cuantos: 'dias' }[paso];
    cont.appendChild(h('div', { class: 'ajustes-cabecera' }, [
      h('h2', { texto: 'Nueva rutina' }),
      h('button', { class: 'discreto', texto: '‹ Atrás', onclick: function () {
        paso = atras;
        if (!atras) borrador = null;
        repintar();
      } }),
    ]));
    if (paso === 'empezar') {
      cont.appendChild(h('p', { class: 'pregunta-rutina', texto: '¿Cómo quieres empezar?' }));
      opcionesEmpezar(cont);
      return;
    }
    // Una semana, o dos que se alternan (día sí, día no, o semanas que cambian): el patrón tiene 7 o 14 días.
    var patron = borrador.dias.patron;
    var dos = patron.length === 14;
    var dias = [];
    for (var i = 0; i < patron.length; i++) if (patron.charAt(i) === 'E') dias.push(i);
    if (paso === 'dias') {
      cont.appendChild(h('p', { class: 'paso-rutina', texto: 'Paso 1 de 2' }));
      cont.appendChild(h('p', { class: 'pregunta-rutina', texto: '¿Qué días vas al gimnasio?' }));
      cont.appendChild(h('section', { class: 'tarjeta' }, [
        filaSemana(patron, 0, dos ? 'Semana 1' : ''),
        dos ? filaSemana(patron, 7, 'Semana 2') : null,
        h('p', { class: 'detalle', texto: !dias.length ? 'Toca al menos un día'
          : dos ? dias.length + ' días cada dos semanas: se van alternando'
            : dias.length + (dias.length === 1 ? ' día' : ' días') + ' a la semana' }),
        h('button', { type: 'button', class: 'semana-dos', texto: dos ? 'Quitar la semana 2' : '+ Semana 2 distinta', onclick: function () {
          borrador.dias.patron = dos ? patron.slice(0, 7) : patron + patron;
          repintar();
        } }),
      ]));
      cont.appendChild(h('button', { type: 'button', class: 'principal ancho', texto: 'Siguiente', disabled: !dias.length, onclick: function () {
        paso = 'cuantos';
        repintar();
      } }));
      return;
    }
    // paso === 'cuantos': un número con − y +, y debajo cómo queda la semana con ese número.
    var maximo = Math.min(dias.length, 6);
    if (!(cuantos >= 1)) cuantos = Math.min(2, maximo);
    if (cuantos > maximo) cuantos = maximo;
    var k = cuantos;
    var letras = 'ABCDEF';
    var texto = function (d, j) { return DIAS_CORTOS[d % 7] + ' ' + letras.charAt(j % k); };
    var lineas = dos
      ? [1, 2].map(function (s) {
        var partes = [];
        dias.forEach(function (d, j) { if ((d < 7) === (s === 1)) partes.push(texto(d, j)); });
        return 'Semana ' + s + ': ' + (partes.join(' · ') || 'descanso');
      })
      : [dias.map(texto).join(' · ')];
    var poner = function (n) {
      cuantos = Math.max(1, Math.min(maximo, n));
      repintar();
    };
    cont.appendChild(h('p', { class: 'paso-rutina', texto: 'Paso 2 de 2' }));
    cont.appendChild(h('p', { class: 'pregunta-rutina', texto: '¿Cuántos entrenos distintos?' }));
    cont.appendChild(h('section', { class: 'tarjeta' }, [
      h('div', { class: 'contador cuantos-entrenos' }, [
        h('button', { type: 'button', texto: '−', 'aria-label': 'Uno menos', disabled: k <= 1, onclick: function () { poner(k - 1); } }),
        h('strong', { class: 'contador-numero', texto: String(k) }),
        h('button', { type: 'button', texto: '+', 'aria-label': 'Uno más', disabled: k >= maximo, onclick: function () { poner(k + 1); } }),
      ]),
      h('p', { class: 'detalle centrado', texto: k === 1 ? 'Siempre el mismo entreno' : 'Se van turnando: ' + letras.slice(0, k).split('').join(', ') }),
    ].concat(k > 1 ? lineas.map(function (l) { return h('p', { class: 'detalle centrado', texto: l }); }) : [])));
    cont.appendChild(h('button', { type: 'button', class: 'principal ancho', texto: 'Siguiente', onclick: function () { crearEntrenos(k); } }));
  }

  // ---- Pantalla ----

  function importarDelExcel() {
    var plan = Almacen.planDelExcel();
    borrador = Rutina.desdePlan(plan.entrenos, {
      orden: ['A1', 'B1', 'A2', 'B2'].filter(function (id) { return plan.entrenos[id]; }),
      // Uno sí, uno no son dos semanas que se alternan (el lunes 07/09 descanso). El 14/09/2026 fue B2 de la
      // primera semana: empezando el 08/09 la rotación sigue igual que ahora. 8 semanas de 4 entrenos.
      patron: 'DEDEDEDEDEDEDE',
      inicio: '2026-09-08',
      fin: '2026-11-09',
    });
    borrador.entrenos.forEach(function (e) {
      e.ejercicios.forEach(function (ej) {
        if (ej.tipo === 'principal' && ej.rm == null) ej.rm = Grupos.rmDe(ej.nombre);
      });
    });
    borrador.nombre = 'Plan del Excel';
    abiertos = {};
    App.avisar('Cargado tu plan del Excel. Revísalo y pulsa Guardar.');
    repintar();
  }

  // ---- Lista de rutinas guardadas: la que está en uso, cambiar de una a otra, editar y borrar ----

  function resumenRutina(r) {
    var n = r.dias.patron.split('E').length - 1;
    var porSemana = r.dias.patron.length === 14 ? Math.round(n / 2 * 10) / 10 : n;
    return r.entrenos.map(function (e) { return e.nombre; }).join(' · ') + ' — ' + formato(porSemana) + ' días a la semana · ' +
      r.semanas + (r.semanas === 1 ? ' semana' : ' semanas') + (r.amrap ? ' con AMRAP' : '');
  }

  function borrarConfirmando(r) {
    App.abrirSelector('¿Borrar ' + r.nombre + '?', [
      h('p', { class: 'detalle', texto: 'Se borra la rutina. Lo que ya entrenaste con ella sigue en el historial.' }),
      h('button', { type: 'button', class: 'principal con-icono', onclick: function () {
        Almacen.borrarRutina(r.id);
        App.cerrarSelector();
        App.avisar('Rutina borrada');
        repintar();
      } }, [Iconos.borrar(), 'Borrar']),
    ]);
  }

  function pintarLista(cont) {
    var guardadas = Almacen.rutinas();
    cont.appendChild(h('div', { class: 'ajustes-cabecera' }, [
      h('h2', { texto: 'Tus rutinas' }),
      h('button', { class: 'discreto', texto: '✕ Cerrar', onclick: function () { App.mostrar('ajustes'); } }),
    ]));
    if (recibidaPendiente) tarjetaRecibida(cont);
    // Sin ninguna, directamente cómo empezar la primera (sin pasar por "+ Nueva rutina").
    if (!guardadas.lista.length && !recibidaPendiente) {
      cont.appendChild(h('p', { class: 'pregunta-rutina', texto: 'Crea tu rutina. ¿Cómo quieres empezar?' }));
      opcionesEmpezar(cont);
    }
    // La elegida para más adelante (el ciclo que viene) dice desde cuándo; la de ahora sigue "En uso" hasta entonces.
    var enCurso = Almacen.rutina();
    var proxima = Almacen.rutinaProxima();
    guardadas.lista.forEach(function (r) {
      var enUso = enCurso && r.id === enCurso.id;
      var luego = proxima && r.id === proxima.rutina.id;
      cont.appendChild(h('section', { class: 'tarjeta rutina-guardada' + (enUso ? ' en-uso' : '') }, [
        h('div', { class: 'ejercicio-cabecera' }, [
          h('h3', { texto: r.nombre }),
          enUso ? h('span', { class: 'chip resultado bien', texto: proxima ? 'En uso hasta el ' + fechaCorta(Rutina.sumarDias(proxima.desde, -1)) : 'En uso' }) : null,
          luego ? h('span', { class: 'chip resultado neutro', texto: 'Desde el ' + fechaCorta(proxima.desde) }) : null,
        ]),
        h('p', { class: 'detalle', texto: resumenRutina(r) }),
        h('div', { class: 'acciones-cabecera' }, [
          enUso || luego ? null : h('button', { type: 'button', class: 'principal', texto: 'Usar esta', onclick: function () {
            Almacen.usarRutina(r.id);
            var desde = Almacen.rutinaProxima();
            App.avisar(desde ? 'Entrenas con ' + r.nombre + ' desde el ' + fechaCorta(desde.desde) : 'Ahora entrenas con ' + r.nombre);
            repintar();
          } }),
          h('button', { type: 'button', class: 'con-icono', onclick: function () {
            borrador = copia(r);
            abiertos = {};
            repintar();
          } }, [Iconos.editar(), 'Editar']),
          h('button', { type: 'button', class: 'discreto con-icono', 'aria-label': 'Borrar ' + r.nombre, onclick: function () { borrarConfirmando(r); } },
            [Iconos.borrar()]),
        ]),
        h('button', { type: 'button', class: 'discreto con-icono compartir-rutina', onclick: function () { compartir(r); } },
          [Iconos.compartir(), 'Compartir']),
      ]));
    });
    if (guardadas.lista.length) {
      cont.appendChild(h('button', { type: 'button', class: 'anadir-entreno', texto: '+ Nueva rutina', onclick: function () {
        borrador = null;
        paso = 'empezar';
        repintar();
      } }));
    }
    var plan = Almacen.planDelExcel();
    if (plan && plan.entrenos && Object.keys(plan.entrenos).length) {
      cont.appendChild(h('button', { type: 'button', class: 'discreto anadir-entreno', texto: '+ Desde mi plan del Excel', onclick: importarDelExcel }));
    }
    cont.appendChild(h('button', { type: 'button', class: 'discreto anadir-entreno', texto: '+ Pegar rutina compartida', onclick: pegarEnlace }));
  }

  // ---- Compartir rutinas: un enlace con la rutina dentro (…/#rutina=…), sin servidor ----
  // La rutina va comprimida (deflate) y en base64 de URL; con un navegador sin CompressionStream, sin comprimir.

  function aBase64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function deBase64(texto) {
    var s = atob(texto.replace(/-/g, '+').replace(/_/g, '/'));
    var bytes = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  }

  function pasarPor(bytes, transformacion) {
    return new Response(new Blob([bytes]).stream().pipeThrough(transformacion)).arrayBuffer()
      .then(function (b) { return new Uint8Array(b); });
  }

  function codificar(rutina) {
    var bytes = new TextEncoder().encode(JSON.stringify(Rutina.paraCompartir(rutina)));
    if (typeof CompressionStream === 'undefined') return Promise.resolve('0' + aBase64(bytes));
    return pasarPor(bytes, new CompressionStream('deflate-raw')).then(function (b) { return '1' + aBase64(b); });
  }

  function decodificar(codigo) {
    return Promise.resolve().then(function () {
      var bytes = deBase64(codigo.slice(1));
      return codigo.charAt(0) === '1' ? pasarPor(bytes, new DecompressionStream('deflate-raw')) : bytes;
    }).then(function (b) {
      var r = Rutina.recibida(JSON.parse(new TextDecoder().decode(b)));
      if (!r) throw new Error('Ese enlace no trae una rutina');
      return r;
    });
  }

  // El código que va en el enlace (o el enlace entero pegado).
  function codigoDe(texto) {
    var m = String(texto || '').match(/rutina=([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
  }

  var recibidaPendiente = null;   // rutina que ha llegado por un enlace y está por añadir

  function recibir(texto) {
    var codigo = codigoDe(texto);
    if (!codigo) { App.avisar('Ese no es un enlace de rutina', true); return Promise.resolve(); }
    return decodificar(codigo)
      .then(function (r) {
        recibidaPendiente = r;
        borrador = null;
        App.cerrarSelector();
        App.mostrar('rutina');
      })
      .catch(function (e) { App.avisar(e.message || 'No se pudo leer la rutina', true); });
  }

  // Al abrir la app con un enlace de rutina (o si ya estaba abierta y solo cambia el #): se lee y se enseña.
  function rutinaDesdeEnlace() {
    if (!codigoDe(location.hash)) return;
    var hash = location.hash;
    history.replaceState(null, '', location.pathname);
    setTimeout(function () { recibir(hash); }, 300);
  }
  rutinaDesdeEnlace();
  window.addEventListener('hashchange', rutinaDesdeEnlace);

  function compartir(r) {
    codificar(r).then(function (codigo) {
      var url = location.origin + location.pathname + '#rutina=' + codigo;
      var texto = 'Mi rutina "' + r.nombre + '" en Ares. Ábrela y pulsa "Añadir a mis rutinas":';
      if (navigator.share) {
        return navigator.share({ title: r.nombre, text: texto, url: url }).catch(function (e) {
          if (e && e.name !== 'AbortError') mostrarEnlace(r, url);
        });
      }
      mostrarEnlace(r, url);
    }).catch(function (e) { App.avisar('No se pudo preparar el enlace: ' + e.message, true); });
  }

  // Sin menú de compartir (la app de Android, un ordenador): el enlace a la vista para copiarlo.
  function mostrarEnlace(r, url) {
    var campoEnlace = h('input', { value: url, readonly: true, 'aria-label': 'Enlace de la rutina' });
    App.abrirSelector('Compartir ' + r.nombre, [
      h('p', { class: 'detalle', texto: 'Mándale este enlace. Van tus entrenos, días y progresiones; tus 1RM no.' }),
      campoEnlace,
      h('button', { type: 'button', class: 'principal', texto: 'Copiar enlace', onclick: function () {
        campoEnlace.select();
        var hecho = function () { App.avisar('Enlace copiado'); App.cerrarSelector(); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(hecho).catch(function () { document.execCommand('copy'); hecho(); });
        } else {
          document.execCommand('copy');
          hecho();
        }
      } }),
    ]);
  }

  function pegarEnlace() {
    var campoEnlace = h('input', { type: 'url', placeholder: 'https://…#rutina=…', autocomplete: 'off', 'aria-label': 'Enlace de la rutina' });
    App.abrirSelector('Pegar rutina compartida', [
      h('p', { class: 'detalle', texto: 'Mantén pulsado el enlace que te han mandado, cópialo y pégalo aquí.' }),
      campoEnlace,
      h('button', { type: 'button', class: 'principal', texto: 'Ver rutina', onclick: function () { recibir(campoEnlace.value); } }),
    ]);
  }

  function tarjetaRecibida(cont) {
    var r = recibidaPendiente;
    var principales = [];
    r.entrenos.forEach(function (e) {
      e.ejercicios.forEach(function (ej) { if (ej.tipo === 'principal' && principales.indexOf(ej.nombre) < 0) principales.push(ej.nombre); });
    });
    cont.appendChild(h('section', { class: 'tarjeta rutina-guardada recibida' }, [
      h('p', { class: 'tipo', texto: 'Te han compartido' }),
      h('h3', { texto: r.nombre }),
      h('p', { class: 'detalle', texto: resumenRutina(r) }),
      principales.length ? h('p', { class: 'detalle', texto: 'Pon tus 1RM en: ' + principales.join(', ') + '.' }) : null,
      h('div', { class: 'acciones-cabecera' }, [
        h('button', { type: 'button', class: 'principal', texto: 'Añadir a mis rutinas', onclick: function () {
          var ids = {};
          Almacen.rutinas().lista.forEach(function (x) { ids[x.id] = true; });
          var nueva = Object.assign({}, r, { id: Rutina.idNuevo('R', ids) });
          // Empieza el lunes que viene: la fecha de quien la mandó ya pasó. Si aún no ha llegado (una rutina para el
          // ciclo que viene), se queda.
          if (!(r.dias.inicio > hoy())) nueva.dias = Object.assign({}, r.dias, { inicio: proximoLunes() });
          var primera = !Almacen.rutina();
          Almacen.guardarRutina(nueva);
          recibidaPendiente = null;
          App.avisar(primera ? r.nombre + ' añadida y en uso' : r.nombre + ' añadida');
          repintar();
        } }),
        h('button', { type: 'button', class: 'discreto', texto: 'Descartar', onclick: function () {
          recibidaPendiente = null;
          repintar();
        } }),
      ]),
    ]));
  }

  // Al guardar se pide el nombre (el que tenía, para cambiarlo si quiere).
  function pedirNombreYGuardar() {
    var nombre = h('input', { value: borrador.nombre || '', placeholder: 'Push / Pull, Fuerza 4 días…', autocomplete: 'off', 'aria-label': 'Nombre de la rutina' });
    var guardar = function () {
      var n = nombre.value.trim();
      if (!n) { App.avisar('Ponle un nombre', true); nombre.focus(); return; }
      borrador.nombre = n;
      if (!borrador.id) {
        var ids = {};
        Almacen.rutinas().lista.forEach(function (r) { ids[r.id] = true; });
        borrador.id = Rutina.idNuevo('R', ids);
      }
      var primera = !Almacen.rutina();
      Almacen.guardarRutina(borrador);
      App.cerrarSelector();
      App.avisar(primera ? n + ' guardada y en uso' : n + ' guardada');
      borrador = null;
      repintar();
    };
    nombre.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') guardar(); });
    App.abrirSelector('Nombre de la rutina', [
      campo('Nombre', nombre),
      h('button', { type: 'button', class: 'principal', texto: 'Guardar', onclick: guardar }),
    ]);
    setTimeout(function () { nombre.focus(); }, 50);
  }

  App.atrasRutina = function () {
    if (paso) {
      paso = { empezar: null, dias: 'empezar', cuantos: 'dias' }[paso];
      if (!paso) borrador = null;
    } else if (borrador) {
      borrador = null;
    } else {
      return false;
    }
    repintar();
    return true;
  };

  App.vistas.rutina = function (cont) {
    pintadoModo = modo();
    if (paso) {
      pintarAsistente(cont);
      return;
    }
    if (!borrador) {
      pintarLista(cont);
      return;
    }
    var guardada = borrador.id ? Almacen.rutinas().lista.filter(function (r) { return r.id === borrador.id; })[0] : null;
    sincronizarSemanas();
    var cambios = !guardada || JSON.stringify(borrador) !== JSON.stringify(guardada);

    cont.appendChild(h('div', { class: 'ajustes-cabecera' }, [
      h('h2', { texto: guardada ? guardada.nombre : 'Nueva rutina' }),
      h('button', { class: 'discreto', texto: '‹ Tus rutinas', onclick: function () {
        borrador = null;
        repintar();
      } }),
    ]));

    tarjetaDias(cont);
    cont.appendChild(h('h2', { class: 'titulo-seccion', texto: borrador.entrenos.length > 1 ? 'Tus entrenos (se van turnando)' : 'Tu entreno' }));
    if (!borrador.entrenos.length) cont.appendChild(h('p', { class: 'vacio', texto: 'Todavía no hay entrenos. Crea el primero.' }));
    borrador.entrenos.forEach(function (e, i) { tarjetaEntreno(cont, e, i); });
    cont.appendChild(h('button', { type: 'button', class: 'anadir-entreno', texto: '+ Otro entreno', onclick: nuevoEntreno }));

    // Lo de entrenador (ciclo de semanas, AMRAP, progresiones de % o kg), plegado: para una rutina normal no hace falta.
    var cuerpoMas = h('div', { class: 'plegable-cuerpo' });
    tarjetaCiclo(cuerpoMas);
    tarjetaProgresiones(cuerpoMas);
    cont.appendChild(h('details', { class: 'tarjeta plegable mas-opciones', open: avanzado, ontoggle: function (ev) {
      if (ev.target.open === avanzado) return;
      avanzado = ev.target.open;
      repintar();
    } }, [
      h('summary', {}, [
        h('span', { class: 'plegable-titulo', texto: 'Más opciones' }),
        h('span', { class: 'plegable-pista', texto: borrador.semanas + ' semanas · ciclo, AMRAP, progresiones' }),
      ]),
      cuerpoMas,
    ]));

    var mal = Rutina.errores(borrador);
    cont.appendChild(h('div', { class: 'guardar-rutina' }, [
      mal.length && borrador.entrenos.length ? h('p', { class: 'detalle', texto: mal[0] + (mal.length > 1 ? ' (y ' + (mal.length - 1) + ' más)' : '') }) : null,
      h('button', { type: 'button', class: 'principal', texto: cambios ? 'Guardar' : 'Guardado', disabled: !cambios || !!mal.length, onclick: pedirNombreYGuardar }),
    ]));
  };
})();
