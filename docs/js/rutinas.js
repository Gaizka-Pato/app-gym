// Pantalla "Tus entrenos": crear la rutina desde la app (días, semanas del ciclo, entrenos y sus ejercicios).
// Se edita un borrador y solo se guarda en el móvil al pulsar "Guardar". El cálculo está en src/rutina.js.
(function () {
  var h = App.h;
  var formato = App.formato;
  var borrador = null;
  var abiertos = {};   // entrenos desplegados
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
    // Lunes, miércoles y viernes, y un ciclo de 8 semanas desde el lunes que viene.
    var inicio = proximoLunes();
    return { version: 1, dias: { patron: 'EDEDEDD', inicio: inicio, fin: inicio }, semanas: 8, amrap: true, progresiones: [], entrenos: [] };
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

  function repintar() {
    App.mostrar('rutina');
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
    var n = patron.split('E').length - 1;
    cont.appendChild(h('section', { class: 'tarjeta' }, [
      h('h2', { texto: 'Días de entreno' }),
      h('p', { class: 'detalle', texto: 'Toca los días que entrenas; el resto es descanso.' }),
      filaSemana(patron, 0, dos ? 'Semana 1' : ''),
      dos ? filaSemana(patron, 7, 'Semana 2') : null,
      h('p', { class: 'detalle', texto: dos
        ? n + ' días de entreno cada dos semanas: se van alternando.'
        : n + (n === 1 ? ' día' : ' días') + ' de entreno a la semana.' }),
      h('button', { type: 'button', class: 'enlace', texto: dos ? 'Quitar la semana 2' : '+ Otra semana distinta (se alternan)', onclick: function () {
        borrador.dias.patron = dos ? patron.slice(0, 7) : patron + patron;
        repintar();
      } }),
    ]));
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

  function tarjetaProgresiones(cont) {
    var lista = borrador.progresiones || (borrador.progresiones = []);
    var tarjeta = h('section', { class: 'tarjeta' }, [
      h('h2', { texto: 'Progresiones' }),
      h('p', { class: 'detalle', texto: 'Lo que cambia de una semana a otra (series y %). Se pone una vez y la usan varios ejercicios; cada ejercicio pone su 1RM o sus reps.' }),
    ]);
    lista.forEach(function (p, i) {
      var usan = usanProgresion(p.id);
      var nombre = h('input', { value: p.nombre, 'aria-label': 'Nombre de la progresión', onchange: function () { p.nombre = nombre.value.trim() || p.nombre; } });
      var porKg = p.sube != null;
      var modo = h('div', { class: 'segmentos' }, [['pct', '% cada semana'], ['kg', '+ kg cada semana']].map(function (m) {
        return h('button', { type: 'button', class: (m[0] === 'kg') === porKg ? 'activa' : '', texto: m[1], onclick: function () {
          if (m[0] === 'kg') p.sube = p.sube != null ? p.sube : 2.5; else delete p.sube;
          if (m[0] === 'kg' && p.semanas[0].pct == null) p.semanas[0].pct = 70;
          repintar();
        } });
      }));
      var sube = h('input', { type: 'number', inputmode: 'decimal', step: '0.5', value: porKg ? p.sube : '', 'aria-label': 'Kg que sube cada semana', onchange: function () {
        var v = App.numero(sube.value);
        if (v != null) p.sube = v;
        repintar();
      } });
      var filas = [h('span', { class: 'tipo' }), h('span', { class: 'tipo', texto: 'Series' }), h('span', { class: 'tipo', texto: 'Reps' }), h('span', { class: 'tipo', texto: porKg ? 'Peso' : '% 1RM' })];
      p.semanas.forEach(function (s, k) {
        var entrada = function (campoS, extra) {
          return h('input', Object.assign({ value: s[campoS] != null ? s[campoS] : '', autocomplete: 'off', 'aria-label': campoS + ' semana ' + (k + 1), onchange: function (ev) {
            var v = ev.target.value.trim();
            if (campoS === 'pct') v = App.numero(v);
            if (v === '' || v == null) delete s[campoS]; else s[campoS] = v;
          } }, extra || {}));
        };
        filas.push(h('span', { class: 'progresion-semana', texto: Rutina.esAmrap(borrador, k + 1) ? 'AMRAP' : 'S' + (k + 1) }));
        filas.push(entrada('series', { placeholder: '3' }));
        filas.push(entrada('reps', { placeholder: '—' }));
        if (porKg && k > 0) {
          var paso = Rutina.esAmrap(borrador, k + 1) ? k - 1 : k;
          filas.push(h('span', { class: 'progresion-mas', texto: paso ? '+' + formato(p.sube * paso) + ' kg' : '= S1' }));
        } else {
          filas.push(entrada('pct', { type: 'number', inputmode: 'decimal', placeholder: '—' }));
        }
      });
      // Para no escribir el % semana a semana: desde cuánto y cuánto sube cada semana.
      var desde = h('input', { type: 'number', inputmode: 'decimal', placeholder: '70', 'aria-label': 'Primer %' });
      var sube = h('input', { type: 'number', inputmode: 'decimal', placeholder: '3', 'aria-label': 'Sube cada semana' });
      tarjeta.appendChild(h('details', { class: 'progresion', open: !!abiertos[p.id], ontoggle: function (ev) { abiertos[p.id] = ev.target.open; } }, [
        h('summary', {}, [
          h('span', { class: 'plegable-titulo', texto: p.nombre }),
          h('span', { class: 'plegable-pista', texto: usan.length ? usan.length + (usan.length === 1 ? ' ejercicio' : ' ejercicios') : 'Sin usar' }),
        ]),
        h('div', { class: 'plegable-cuerpo' }, [
          campo('Nombre', nombre),
          usan.length ? h('p', { class: 'detalle', texto: 'La usan: ' + usan.join(', ') }) : null,
          modo,
          porKg ? h('div', { class: 'selectores' }, [campo('Sube cada semana (kg)', sube),
            h('p', { class: 'detalle', texto: 'La semana 1 va al % del 1RM de cada ejercicio; el AMRAP, con el peso de la anterior.' })]) : null,
          h('div', { class: 'progresion-tabla' }, filas),
          porKg ? null : h('div', { class: 'progresion-rellenar' }, [
            h('span', { class: 'detalle', texto: '% desde' }), desde, h('span', { class: 'detalle', texto: 'sube' }), sube,
            h('button', { type: 'button', texto: 'Rellenar', onclick: function () {
              var a = App.numero(desde.value), b = App.numero(sube.value) || 0;
              if (a == null) { App.avisar('Pon el primer %', true); return; }
              p.semanas.forEach(function (s, k) { s.pct = Math.round((a + b * k) * 10) / 10; });
              repintar();
            } }),
          ]),
          usan.length ? null : h('button', { type: 'button', class: 'discreto con-icono', onclick: function () {
            lista.splice(i, 1);
            repintar();
          } }, [Iconos.borrar(), 'Quitar progresión']),
        ]),
      ]));
    });
    tarjeta.appendChild(h('button', { type: 'button', class: 'anadir-entreno', texto: '+ Nueva progresión', onclick: function () {
      nuevaProgresion();
      repintar();
    } }));
    cont.appendChild(tarjeta);
  }

  function nuevaProgresion() {
    var lista = borrador.progresiones || (borrador.progresiones = []);
    var ids = {};
    lista.forEach(function (p) { ids[p.id] = true; });
    var id = Rutina.idNuevo('P', ids);
    var semanas = [];
    for (var k = 0; k < borrador.semanas; k++) {
      semanas.push(borrador.amrap && k === borrador.semanas - 1 && k > 0 ? { series: '2', reps: 'AMRAP' } : { series: '3', reps: '8' });
    }
    semanas[0].pct = 70;
    lista.push({ id: id, nombre: 'Progresión ' + (lista.length + 1), semanas: semanas, sube: 2.5 });
    abiertos[id] = true;
    return id;
  }

  // ---- Entrenos ----

  function resumenEjercicio(ej) {
    var p = ej.progresion ? Rutina.progresionDe(borrador, ej.progresion) : null;
    if (p) return p.nombre + (ej.reps ? ' · ' + ej.reps + ' reps' : '');
    var s = (ej.semanas || [])[0] || {};
    var texto = textoSemana(s);
    if (ej.semanas && ej.semanas.length > 1) texto += ' · cambia cada semana';
    return texto;
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

    e.ejercicios.forEach(function (ej, k) {
      var enJump = ej.junto || (k > 0 && e.ejercicios[k - 1].junto);
      var marcas = [TIPOS.filter(function (t) { return t.id === ej.tipo; })[0].nombre];
      if (enJump) marcas.push('Jump set');
      if (ej.dropset) marcas.push('Drop set');
      cuerpo.appendChild(h('div', { class: 'fila-ejercicio' + (enJump ? ' en-jump' : '') }, [
        h('button', { type: 'button', class: 'fila-ejercicio-datos', onclick: function () { editarEjercicio(e, k); } }, [
          h('strong', { texto: (k + 1) + '. ' + (ej.nombre || 'Sin nombre') }),
          h('span', { class: 'tipo', texto: marcas.join(' · ') + (ej.tipo === 'principal' && ej.rm != null ? ' · 1RM ' + formato(ej.rm) : '') }),
          h('span', { class: 'detalle', texto: resumenEjercicio(ej) }),
        ]),
        h('div', { class: 'flechas' }, [
          h('button', { type: 'button', texto: '↑', 'aria-label': 'Subir', disabled: k === 0, onclick: function () { mover(e.ejercicios, k, -1); } }),
          h('button', { type: 'button', texto: '↓', 'aria-label': 'Bajar', disabled: k === e.ejercicios.length - 1, onclick: function () { mover(e.ejercicios, k, 1); } }),
        ]),
      ]));
    });
    cuerpo.appendChild(h('button', { type: 'button', class: 'principal con-icono', onclick: function () { editarEjercicio(e, -1); } }, [Iconos.nuevoEjercicio(), 'Añadir ejercicio']));
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
    borrador.entrenos.push({ id: id, nombre: 'Entreno ' + (borrador.entrenos.length + 1), ejercicios: [] });
    abiertos[id] = true;
    repintar();
  }

  // ---- Editor de un ejercicio (en la ventana de abajo) ----

  function campo(texto, control) {
    return h('label', { class: 'campo' }, [h('span', { texto: texto }), control]);
  }

  function editarEjercicio(e, k) {
    var nuevo = k < 0;
    var ej = nuevo
      ? { id: Rutina.idNuevo(e.id + '-', usados()), nombre: '', tipo: 'secundario', descanso: 90, semanas: [{ series: '3', reps: '10-12' }] }
      : copia(e.ejercicios[k]);
    // Los que vienen semana a semana por su cuenta se quedan así; lo normal es "iguales" o una progresión.
    var propias = ej.semanas && ej.semanas.length > 1 ? ej.semanas : null;
    var una = (ej.semanas && ej.semanas[0]) || { series: '3', reps: ej.reps || '10-12' };

    var lista = h('datalist', { id: 'ejercicios-conocidos' }, (((Almacen.plan() || {}).grupos) || []).map(function (f) {
      return h('option', { value: f[0] });
    }));
    var nombre = h('input', { value: ej.nombre, list: 'ejercicios-conocidos', placeholder: 'Press Banca', autocomplete: 'off' });
    var tipos = h('div', { class: 'segmentos' });
    var rm = h('input', { type: 'number', inputmode: 'decimal', step: '0.5', value: ej.rm != null ? ej.rm : '', placeholder: 'kg' });
    var cajaRM = campo('1RM (kg que levantas una vez)', rm);
    var semanas = h('select', { 'aria-label': 'Semanas' });
    var cajaSemanas = campo('Cómo va cada semana', semanas);
    var series = h('input', { name: 'series', value: una.series || '', placeholder: '3 o 4', autocomplete: 'off' });
    var reps = h('input', { name: 'reps', value: (ej.progresion ? ej.reps : una.reps) || '', placeholder: '10-12', autocomplete: 'off' });
    var pct = h('input', { name: 'pct', type: 'number', inputmode: 'decimal', value: una.pct != null ? una.pct : '', placeholder: '75' });
    var cajaSeries = campo('Series', series);
    var cajaReps = campo('Reps', reps);
    var cajaPct = campo('% 1RM', pct);
    var fila = h('div', { class: 'semana-campos' }, [cajaSeries, cajaReps, cajaPct]);
    var vista = h('p', { class: 'detalle vista-semanas' });
    var descanso = h('select', { 'aria-label': 'Descanso' }, DESCANSOS.map(function (d) {
      return h('option', { value: d, selected: d === (ej.descanso || 90), texto: App.reloj(d) });
    }));
    var nota = h('input', { value: ej.nota || '', placeholder: 'RIR 2, 1 y 1/2…', autocomplete: 'off' });
    var jump = h('input', { type: 'checkbox', checked: !!ej.junto });
    var drop = h('input', { type: 'checkbox', checked: !!ej.dropset });
    var bajadas = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '5', value: ej.dropset ? ej.dropset.bajadas : 2 });
    var pctDrop = h('input', { type: 'number', inputmode: 'numeric', min: '5', max: '50', step: '5', value: ej.dropset ? ej.dropset.porcentaje : 20 });
    var cajaDrop = h('div', { class: 'selectores' }, [campo('Bajadas', bajadas), campo('% que baja', pctDrop)]);

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
        var s = { series: series.value.trim() };
        if (reps.value.trim()) s.reps = reps.value.trim();
        if (ej.tipo === 'principal' && App.numero(pct.value) != null) s.pct = App.numero(pct.value);
        ej.semanas = [s];
        delete ej.progresion;
        delete ej.reps;
      } else {
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
      var elegido = semanas.value || (ej.progresion ? ej.progresion : propias ? 'propias' : 'iguales');
      semanas.innerHTML = '';
      var opciones = [['iguales', 'Iguales todas las semanas']];
      (borrador.progresiones || []).forEach(function (p) { opciones.push([p.id, 'Progresión: ' + p.nombre]); });
      if (propias) opciones.push(['propias', 'Las suyas, semana a semana']);
      opciones.push(['nueva', '+ Nueva progresión…']);
      opciones.forEach(function (o) { semanas.appendChild(h('option', { value: o[0], selected: o[0] === elegido, texto: o[1] })); });
      cajaSemanas.hidden = borrador.semanas <= 1 && !ej.progresion;
      var iguales = elegido === 'iguales';
      cajaSeries.hidden = !iguales;
      cajaPct.hidden = !iguales || !principal;
      // En una progresión, las reps son las del ejercicio (los principales ya las llevan en la progresión: "4x6").
      cajaReps.hidden = elegido === 'propias' || (!iguales && principal);
      fila.className = 'semana-campos' + (cajaSeries.hidden ? ' uno' : '');
      leer();
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
        App.avisar('Progresión creada: rellénala en "Progresiones"');
        ej.progresion = id;
        semanas.value = '';
        pintar();
        semanas.value = id;
      }
      pintar();
    });
    [rm, series, reps, pct].forEach(function (c) { c.addEventListener('change', pintar); });
    drop.addEventListener('change', function () { cajaDrop.hidden = !drop.checked; });
    pintar();

    var guardar = h('button', { type: 'button', class: 'principal', texto: nuevo ? 'Añadir' : 'Guardar', onclick: function () {
      leer();
      if (!ej.nombre) { App.avisar('Ponle nombre al ejercicio', true); return; }
      var lasSemanas = Rutina.semanasDe(borrador, ej);
      if (!lasSemanas.length || !lasSemanas.every(function (s) { return Plan.seriesPlan(s.series, s.reps).length; })) {
        App.avisar(ej.progresion ? 'Pon las reps (o rellena la progresión)' : 'Pon las series, por ejemplo 3 y 10-12', true);
        return;
      }
      if (ej.tipo === 'principal' && lasSemanas.some(function (s) { return s.pct == null; })) {
        App.avisar(ej.progresion ? 'A la progresión le falta el %' : 'Pon el % del 1RM', true);
        return;
      }
      // Descanso y nota puestos a mano valen para todas las semanas.
      if (ej.descansos && Number(descanso.value) !== (e.ejercicios[k] || {}).descanso) delete ej.descansos;
      if (ej.notas && nota.value.trim()) delete ej.notas;
      if (jump.checked) ej.junto = true; else delete ej.junto;
      if (drop.checked) {
        ej.dropset = { bajadas: Math.round(App.numero(bajadas.value)) || 2, porcentaje: App.numero(pctDrop.value) || 20 };
      } else delete ej.dropset;
      if (nuevo) e.ejercicios.push(ej); else e.ejercicios[k] = ej;
      App.cerrarSelector();
      repintar();
    } });

    var hijos = [
      lista,
      campo('Ejercicio', nombre),
      tipos,
      cajaRM,
      cajaSemanas,
      fila,
      vista,
      h('div', { class: 'selectores' }, [campo('Descanso', descanso), campo('Nota', nota)]),
      ej.notas ? h('p', { class: 'detalle', texto: 'La nota cambia cada semana: ' + ej.notas.filter(Boolean).join(' → ') + '. Si escribes una, vale para todas.' }) : null,
      h('label', { class: 'casilla' }, [jump, h('span', { texto: 'Jump set con el siguiente ejercicio' })]),
      h('label', { class: 'casilla' }, [drop, h('span', { texto: 'Drop set: tras la última serie, bajar el peso sin descanso' })]),
      cajaDrop,
      guardar,
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

  // ---- Pantalla ----

  function importarDelExcel() {
    var plan = Almacen.plan();
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
    if (!guardadas.lista.length && !recibidaPendiente) {
      cont.appendChild(h('p', { class: 'vacio', texto: 'Todavía no tienes ninguna. Crea la primera: tus entrenos, tus días y tu ciclo.' }));
    }
    guardadas.lista.forEach(function (r) {
      var enUso = r.id === guardadas.activa;
      cont.appendChild(h('section', { class: 'tarjeta rutina-guardada' + (enUso ? ' en-uso' : '') }, [
        h('div', { class: 'ejercicio-cabecera' }, [
          h('h3', { texto: r.nombre }),
          enUso ? h('span', { class: 'chip resultado bien', texto: 'En uso' }) : null,
        ]),
        h('p', { class: 'detalle', texto: resumenRutina(r) }),
        h('div', { class: 'acciones-cabecera' }, [
          enUso ? null : h('button', { type: 'button', class: 'principal', texto: 'Usar esta', onclick: function () {
            Almacen.usarRutina(r.id);
            App.avisar('Ahora entrenas con ' + r.nombre);
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
    cont.appendChild(h('button', { type: 'button', class: 'anadir-entreno', texto: '+ Nueva rutina', onclick: function () {
      borrador = vacia();
      abiertos = {};
      repintar();
    } }));
    var plan = Almacen.plan();
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
          // Empieza el lunes que viene: la fecha de quien la mandó no le vale a nadie más.
          nueva.dias = Object.assign({}, r.dias, { inicio: proximoLunes() });
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

  App.vistas.rutina = function (cont) {
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
    tarjetaCiclo(cont);
    tarjetaProgresiones(cont);
    cont.appendChild(h('h2', { class: 'titulo-seccion', texto: 'Entrenos, en orden' }));
    if (!borrador.entrenos.length) cont.appendChild(h('p', { class: 'vacio', texto: 'Todavía no hay entrenos. Crea el primero (Push, Pierna…).' }));
    borrador.entrenos.forEach(function (e, i) { tarjetaEntreno(cont, e, i); });
    cont.appendChild(h('button', { type: 'button', class: 'anadir-entreno', texto: '+ Añadir entreno', onclick: nuevoEntreno }));

    var mal = Rutina.errores(borrador);
    cont.appendChild(h('div', { class: 'guardar-rutina' }, [
      mal.length && borrador.entrenos.length ? h('p', { class: 'detalle', texto: mal[0] + (mal.length > 1 ? ' (y ' + (mal.length - 1) + ' más)' : '') }) : null,
      h('button', { type: 'button', class: 'principal', texto: cambios ? 'Guardar' : 'Guardado', disabled: !cambios || !!mal.length, onclick: pedirNombreYGuardar }),
    ]));
  };
})();
