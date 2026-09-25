// Pestaña "Estado": el análisis de fuerza de symmetricstrength.com con las series del historial (js/fuerza.js)
// y la foto de cada mes, que se guarda al empezar el mes siguiente para ver la evolución.
var Estado = (function () {
  var h = App.h;
  var formato = App.formato;
  var elegido = 'ahora';   // 'ahora' o el mes ('aaaa-mm') de una foto

  // ---- Datos ----

  // Ejercicios del historial más las series del móvil que aún no se han subido.
  // En dominadas y fondos: "corporal" si van con el peso del cuerpo y "asistido" si los kg son la ayuda de la máquina.
  function ejercicios() {
    var hist = Almacen.historial() || {};
    var info = hist.info || {};
    var porClave = {};
    function ejercicio(clave, nombre) {
      if (!porClave[clave]) {
        var corporal = Grupos.esCorporal(nombre);
        // Qué ejercicio es de verdad, para el análisis de fuerza: su familia (si es variante, la del principal)
        // y con qué se hace. Lo que no esté en la lista va por el nombre, como el histórico de FitNotes.
        var familia = Grupos.familiaDe(nombre);
        porClave[clave] = {
          nombre: nombre, dias: [], corporal: corporal,
          familia: familia, material: familia ? Grupos.materialDe(nombre) : '',
          asistido: !corporal && !/lastr|con peso/.test(Grupos.normalizar(nombre)),
        };
      }
      return porClave[clave];
    }
    Object.keys(hist.ejercicios || {}).forEach(function (k) {
      var e = ejercicio(k, (info[k] && info[k].nombre) || k);
      e.dias = e.dias.concat(hist.ejercicios[k]);
    });
    Almacen.series().forEach(function (s) {
      if (s.subida) return;
      ejercicio(Almacen.normalizar(s.ejercicio), s.ejercicio).dias.push({ f: s.fecha, s: [[s.kg, s.reps]] });
    });
    return Object.keys(porClave).map(function (k) { return porClave[k]; });
  }

  // Los datos del cuerpo en una fecha: con fecha de nacimiento, la edad que se tenía ese día.
  function personaEn(cuerpo, fecha) {
    var edad = Fuerza.edadEn(cuerpo.nacimiento, fecha);
    return Object.assign({}, cuerpo, edad != null ? { edad: edad } : {});
  }

  function calcular(cuerpo, hasta, lista) {
    var p = personaEn(cuerpo, hasta);
    return Fuerza.calcular(p, Fuerza.mejores(lista || ejercicios(), p, hasta));
  }

  // Foto del mes que acaba de terminar. La primera vez rellena también los 12 meses anteriores con el historial
  // (con el peso de ahora, por eso van marcadas como reconstruidas). No hace nada sin datos del cuerpo.
  // Las fotos hechas con una versión anterior del cálculo (Fuerza.VERSION) se rehacen con el peso que tenían.
  function fotoDelMes() {
    var cuerpo = Almacen.cuerpo();
    if (!Almacen.config() || !cuerpo || !Almacen.historial()) return Promise.resolve();
    var objetivo = Fuerza.mesAnterior(Almacen.hoyISO().slice(0, 7));
    var hay = {};
    Almacen.estados().forEach(function (e) { hay[e.mes] = e; });
    var lista = ejercicios();
    var nuevas = [];
    Almacen.estados().forEach(function (e) {
      if ((e.calculo || 1) >= Fuerza.VERSION) return;
      // Con el peso que tenía la foto y la edad de ese mes si ya hay fecha de nacimiento.
      var antes = Object.assign({}, cuerpo, e.persona || {});
      if (cuerpo.nacimiento) antes.nacimiento = cuerpo.nacimiento;
      var r = calcular(antes, Fuerza.finDeMes(e.mes), lista);
      if (r) nuevas.push(Object.assign(r, { mes: e.mes, guardada: e.guardada, reconstruida: !!e.reconstruida, calculo: Fuerza.VERSION }));
    });
    var mes = objetivo;
    for (var i = 0; i < 12 && !hay[objetivo]; i++) {
      var r = hay[mes] ? null : calcular(cuerpo, Fuerza.finDeMes(mes), lista);
      if (r) nuevas.push(Object.assign(r, { mes: mes, guardada: Almacen.hoyISO(), reconstruida: mes !== objetivo, calculo: Fuerza.VERSION }));
      mes = Fuerza.mesAnterior(mes);
    }
    if (!nuevas.length) return Promise.resolve();
    return Almacen.guardarEstados(nuevas).catch(function () { /* sin conexión: se sube más tarde */ });
  }

  // ---- Piezas de la pantalla ----

  function chipNivel(puntos) {
    var n = Fuerza.nivel(puntos);
    return h('span', { class: 'chip nivel', style: 'background:' + n.color, texto: n.nombre });
  }

  function diferencia(a, b) {
    var d = Math.round((a - b) * 10) / 10;
    return (d > 0 ? '+' : '') + formato(d);
  }

  // Sexo, fecha de nacimiento y peso. Está en Ajustes y, si faltan, en la propia pestaña Estado.
  // alGuardar: qué hacer después (por defecto, volver a pintar la pestaña Estado).
  function formulario(cont, actual, alGuardar) {
    var sexo = (actual && actual.sexo) || null;
    var botones = [['hombre', 'Hombre'], ['mujer', 'Mujer']].map(function (s) {
      return h('button', { type: 'button', class: sexo === s[0] ? 'actual' : '', texto: s[1], onclick: function (ev) {
        sexo = s[0];
        botones.forEach(function (b) { b.classList.toggle('actual', b === ev.currentTarget); });
      } });
    });
    var peso = h('input', { type: 'number', inputmode: 'decimal', step: '0.1', min: '30', value: actual ? actual.peso : '', 'aria-label': 'Peso corporal' });
    var nacimiento = h('input', { type: 'date', value: (actual && actual.nacimiento) || '', max: Almacen.hoyISO(), 'aria-label': 'Fecha de nacimiento' });
    cont.appendChild(h('div', { class: 'tarjeta' }, [
      h('h2', { texto: 'Tus datos' }),
      h('p', { class: 'detalle', texto: 'Para la pestaña Estado: la fuerza se compara con gente de tu sexo, peso y edad. La edad cambia sola con tu cumpleaños.' }),
      h('div', { class: 'opciones dos' }, botones),
      h('label', { class: 'campo' }, [h('span', { texto: 'Fecha de nacimiento' }), nacimiento]),
      h('label', { class: 'campo' }, [h('span', { texto: 'Peso corporal (kg)' }), peso]),
      h('button', { type: 'button', class: 'principal', texto: 'Guardar', onclick: function () {
        var kg = App.numero(peso.value);
        var fecha = nacimiento.value;
        if (!sexo || !(kg >= 30 && kg <= 250) || !Fuerza.edadEn(fecha, Almacen.hoyISO())) {
          App.avisar('Pon el sexo, la fecha de nacimiento y el peso', true);
          return;
        }
        Almacen.guardarCuerpo({ sexo: sexo, peso: kg, nacimiento: fecha });
        App.avisar('Datos guardados');
        (alGuardar || function () { App.mostrar('estado'); })();
        fotoDelMes().then(function () { if (document.querySelector('.pestanas .activa[data-vista="estado"]')) App.mostrar('estado'); });
      } }),
    ]));
  }

  // ajeno: el estado es de otra persona (pestaña Social): sin botón de "Tus datos" ni avisos para uno mismo.
  // plegado: solo la puntuación y un "+ info" que despliega el resto (tarjeta.masInfo).
  // Devuelve la tarjeta para poder añadirle cosas debajo.
  function resumen(cont, r, foto, anterior, ajeno, plegado) {
    var cuerpo = r.persona || {};
    var comparacion = !anterior ? null
      : Math.round((r.total - anterior.total) * 10) === 0 ? 'Igual que en ' + Fuerza.nombreMes(anterior.mes)
        : diferencia(r.total, anterior.total) + ' desde ' + Fuerza.nombreMes(anterior.mes);
    var datosCuerpo = h('p', { class: 'detalle', texto: (cuerpo.sexo === 'mujer' ? 'Mujer' : 'Hombre') + ' · ' + formato(cuerpo.peso) + ' kg' +
      (cuerpo.edad ? ' · ' + cuerpo.edad + ' años' : '') +
      (!ajeno && !foto && !(Almacen.cuerpo() || {}).nacimiento ? ' · pon tu cumpleaños en Ajustes' : '') });
    var detalle = [
      h('table', { class: 'tabla-dias estado-categorias' }, Fuerza.CATEGORIAS.map(function (c) {
        var v = r.categorias[c.id];
        return h('tr', {}, [
          h('td', { texto: c.nombre }),
          h('td', { class: 'numero', texto: v != null ? formato(v) : '—' }),
          h('td', {}, [v != null ? chipNivel(v) : h('span', { class: 'detalle', texto: 'sin datos' })]),
        ]);
      })),
      h('p', { class: 'detalle', texto: ajeno ? 'Con su mejor serie de cada ejercicio en los últimos 6 meses.' : foto
        ? 'Tu mejor serie de cada ejercicio en los 6 meses anteriores' + (foto.reconstruida ? ', reconstruida con el historial.' : '.')
        : 'Con tu mejor serie de cada ejercicio en los últimos 6 meses.' }),
    ];
    var numero = h('div', { class: 'estado-total' }, [
      h('span', { class: 'estado-numero', texto: formato(r.total) }),
      h('div', {}, [
        chipNivel(r.total),
        comparacion ? h('p', { class: 'detalle', texto: comparacion }) : null,
      ]),
    ]);
    var tarjeta;
    if (plegado) {
      // Social: solo la puntuación; "+ info" despliega los datos, las categorías y (desde social.js) la figura.
      var mas = h('div', { class: 'estado-mas', hidden: true }, [datosCuerpo].concat(detalle));
      var boton = h('button', { type: 'button', class: 'discreto', texto: '+ info', onclick: function () {
        mas.hidden = !mas.hidden;
        boton.textContent = mas.hidden ? '+ info' : '− info';
      } });
      tarjeta = h('div', { class: 'tarjeta estado-resumen' }, [
        h('div', { class: 'ejercicio-cabecera' }, [h('h2', { texto: 'Estado actual' }), boton]),
        numero,
        mas,
      ]);
      tarjeta.masInfo = mas;
    } else {
      tarjeta = h('div', { class: 'tarjeta estado-resumen' }, [
        h('div', { class: 'ejercicio-cabecera' }, [
          h('h2', { texto: foto ? 'Foto de ' + Fuerza.nombreMes(foto.mes) : 'Estado actual' }),
          ajeno ? null : h('button', { type: 'button', class: 'discreto', texto: '✏️ Tus datos', onclick: function () { App.mostrar('ajustes'); } }),
        ]),
        datosCuerpo,
        numero,
      ].concat(detalle));
    }
    cont.appendChild(tarjeta);
    return tarjeta;
  }

  // Estado de fuerza de ahora con los datos de este móvil, o null si faltan datos del cuerpo o historial.
  function actual() {
    var cuerpo = Almacen.cuerpo();
    if (!Almacen.config() || !cuerpo || !Almacen.historial()) return null;
    return calcular(cuerpo, Almacen.hoyISO());
  }

  // Lo sube para que el otro lo vea en Social. Sin conexión o con una API antigua, se intenta la próxima vez.
  function compartir(r) {
    if (r) Almacen.subirEstadoActual(r).catch(function () {});
  }

  // Barras de "fuerzas y debilidades": cada ejercicio frente a lo normal para tu puntuación total.
  function fuerzas(cont, r) {
    var filas = Fuerza.LEVANTAMIENTOS.filter(function (l) { return r.levantamientos[l.id] && r.levantamientos[l.id].diferencia != null; });
    if (filas.length < 2) return;
    var maximo = Math.max(10, Math.max.apply(null, filas.map(function (l) { return Math.abs(r.levantamientos[l.id].diferencia); })));
    cont.appendChild(h('div', { class: 'tarjeta' }, [
      h('h3', { texto: 'Fuerzas y debilidades' }),
      h('p', { class: 'detalle', texto: 'Cada ejercicio frente a lo normal en gente con tu nivel.' }),
      h('div', { class: 'fd-barras' }, filas.map(function (l) {
        var d = r.levantamientos[l.id].diferencia;
        var ancho = (Math.abs(d) / maximo) * 50;
        return h('div', { class: 'fd-fila' }, [
          h('span', { class: 'fd-nombre', texto: l.nombre }),
          h('span', { class: 'fd-pista' }, [
            h('span', { class: 'fd-barra ' + (d >= 0 ? 'mas' : 'menos'),
              style: 'width:' + ancho.toFixed(1) + '%;' + (d >= 0 ? 'left:50%' : 'right:50%') }),
            h('span', { class: 'fd-valor ' + (d >= 0 ? 'mas' : 'menos'), texto: (d > 0 ? '+' : '') + d + '%' }),
          ]),
        ]);
      })),
    ]));
  }

  function musculos(cont, r) {
    var colores = {};
    var nombres = {};
    Fuerza.MUSCULOS.forEach(function (m) {
      var v = r.musculos[m[0]];
      colores[m[0]] = v ? Fuerza.nivel(v).color : null;
      nombres[m[0]] = m[1] + (v ? ': ' + formato(v) + ' · ' + Fuerza.nivel(v).nombre : ': sin datos');
    });
    var figura = h('div', { class: 'figuras' });
    figura.appendChild(Cuerpo.dibujar('delante', colores, nombres));
    figura.appendChild(Cuerpo.dibujar('detras', colores, nombres));
    var nombre = function (id) { return Fuerza.MUSCULOS.find(function (m) { return m[0] === id; })[1]; };
    cont.appendChild(h('div', { class: 'tarjeta' }, [
      h('h3', { texto: 'Fuerza por grupo muscular' }),
      h('p', { class: 'detalle', texto: 'Toca un músculo para ver su puntuación. En gris, los que no se pueden medir con los ejercicios de barra.' }),
      figura,
      h('div', { class: 'niveles' }, Fuerza.NIVELES.map(function (n) {
        return h('span', { class: 'nivel-leyenda' }, [h('span', { class: 'punto-nivel', style: 'background:' + n.color }), n.nombre]);
      })),
      // Las listas vienen ordenadas: la primera de cada una es la que más se separa de tu puntuación.
      r.musculosFuertes.length ? h('p', {}, [h('strong', { texto: 'Más fuerte: ' }), nombre(r.musculosFuertes[0])]) : null,
      r.musculosDebiles.length ? h('p', {}, [h('strong', { texto: 'Más débil: ' }), nombre(r.musculosDebiles[0])]) : null,
    ]));
  }

  function levantamientos(cont, r) {
    var tarjeta = h('div', { class: 'tarjeta' }, [h('h3', { texto: 'Ejercicios' })]);
    Fuerza.LEVANTAMIENTOS.forEach(function (l) {
      var x = r.levantamientos[l.id];
      if (!x) return;
      var serie = x.kg > 0 || !l.corporal ? formato(x.kg) + ' kg × ' + x.reps : x.reps + ' reps';
      tarjeta.appendChild(h('div', { class: 'progreso-ejercicio' }, [
        h('div', { class: 'ejercicio-cabecera' }, [h('h3', { texto: l.nombre }), chipNivel(x.puntos)]),
        h('p', { class: 'detalle', texto: x.ejercicio + ': ' + serie + ' el ' + Grafica.fechaCorta(x.f) }),
        h('p', {}, [
          '1RM ' + formato(x.rm) + ' kg' + (l.corporal ? ' (con el cuerpo)' : '') + ' · ',
          h('strong', { texto: formato(x.puntos) + ' puntos' }),
        ]),
        h('p', { class: 'detalle', texto: 'A tu nivel tocaría ' + formato(x.esperado) + ' kg' +
          (x.siguiente ? ' · para ' + x.siguiente.nivel + ': ' + formato(x.siguiente.kg) + ' kg' : '') }),
      ]));
    });
    cont.appendChild(tarjeta);
  }

  function masDatos(cont, r) {
    var filas = [];
    // La fórmula de la web (100 − varianza) baja de 0 si los ejercicios están muy descompensados.
    if (r.simetria != null) filas.push(['Simetría', formato(Math.max(0, r.simetria)) + ' / 100']);
    if (r.masFuerte) filas.push(['Ejercicio más fuerte', Fuerza.levantamiento(r.masFuerte).nombre]);
    if (r.masDebil) filas.push(['Ejercicio más flojo', Fuerza.levantamiento(r.masDebil).nombre]);
    if (r.totalPL) filas.push(['Total powerlifting', formato(r.totalPL) + ' kg']);
    if (r.wilks) filas.push(['Wilks', formato(r.wilks)]);
    if (!filas.length) return;
    cont.appendChild(h('div', { class: 'tarjeta' }, [
      h('h3', { texto: 'Más datos' }),
      h('table', { class: 'tabla-dias' }, filas.map(function (f) { return h('tr', {}, [h('td', { texto: f[0] }), h('td', { texto: f[1] })]); })),
    ]));
  }

  function evolucion(cont, fotos) {
    var grafica = h('div');
    var tabla = h('table', { class: 'tabla-dias fotos' });
    fotos.slice().reverse().forEach(function (e, i, lista) {
      var previa = lista[i + 1];
      tabla.appendChild(h('tr', { class: elegido === e.mes ? 'elegida' : '', onclick: function () {
        elegido = e.mes;
        App.mostrar('estado');
      } }, [
        h('td', { texto: Fuerza.nombreMes(e.mes) + (e.reconstruida ? ' *' : '') }),
        h('td', { class: 'numero', texto: formato(e.total) }),
        h('td', { class: 'numero detalle', texto: previa ? diferencia(e.total, previa.total) : '' }),
        h('td', {}, [chipNivel(e.total)]),
      ]));
    });
    cont.appendChild(h('div', { class: 'tarjeta' }, [
      h('h3', { texto: 'Evolución' }),
      grafica,
      fotos.length ? tabla : h('p', { class: 'detalle', texto: 'Todavía no hay fotos.' }),
    ]));
    Grafica.dibujar(grafica, fotos.map(function (e) { return { f: Fuerza.finDeMes(e.mes), v: e.total }; }), 'puntos');
  }

  // ---- Pantalla ----

  App.vistas.estado = function (cont) {
    if (!Almacen.config()) {
      cont.appendChild(h('p', { class: 'vacio', texto: 'Configura la app en Ajustes.' }));
      return;
    }
    var cuerpo = Almacen.cuerpo();
    if (!cuerpo) {
      formulario(cont, cuerpo);
      return;
    }
    if (!Almacen.historial()) {
      var caja = h('div', { class: 'tarjeta' }, [h('p', { texto: 'Cargando historial…' })]);
      cont.appendChild(caja);
      Almacen.actualizarHistorial()
        .then(function () { App.mostrar('estado'); })
        .catch(function (e) {
          caja.innerHTML = '';
          caja.appendChild(h('p', { texto: 'No se pudo cargar el historial: ' + e.message }));
          caja.appendChild(h('button', { texto: 'Reintentar', onclick: function () { App.mostrar('estado'); } }));
        });
      return;
    }

    var fotos = Almacen.estados();
    var foto = elegido === 'ahora' ? null : fotos.find(function (e) { return e.mes === elegido; });
    if (!foto) elegido = 'ahora';
    var ahora = calcular(cuerpo, Almacen.hoyISO());
    compartir(ahora);
    var r = foto || ahora;
    var indice = foto ? fotos.indexOf(foto) : fotos.length;
    var anterior = indice > 0 ? fotos[indice - 1] : null;

    if (fotos.length) {
      cont.appendChild(h('select', { class: 'estado-foto', 'aria-label': 'Qué foto ver', onchange: function (ev) {
        elegido = ev.target.value;
        App.mostrar('estado');
      } }, [h('option', { value: 'ahora', selected: elegido === 'ahora', texto: 'Ahora' })].concat(fotos.slice().reverse().map(function (e) {
        return h('option', { value: e.mes, selected: elegido === e.mes, texto: 'Foto de ' + Fuerza.nombreMes(e.mes) });
      }))));
    }
    if (!r) {
      cont.appendChild(h('div', { class: 'tarjeta' }, [
        h('p', { texto: 'No hay series de sentadilla, peso muerto, press banca, press militar, dominadas, fondos ni remo con barra en los últimos 6 meses.' }),
        h('button', { type: 'button', class: 'discreto', texto: '✏️ Tus datos', onclick: function () {
          App.mostrar('ajustes');
        } }),
      ]));
      return;
    }
    resumen(cont, r, foto, anterior);
    fuerzas(cont, r);
    musculos(cont, r);
    levantamientos(cont, r);
    masDatos(cont, r);
    evolucion(cont, fotos);
  };

  return {
    fotoDelMes: fotoDelMes, ejercicios: ejercicios, formulario: formulario, actual: actual, compartir: compartir,
    resumen: resumen, musculos: musculos,
  };
})();

// Figura del cuerpo por delante y por detrás con cada músculo coloreado. Solo se dibuja la mitad izquierda
// (x ≤ 50) y se refleja; el viewBox es de 100 × 210.
var Cuerpo = (function () {
  var NS = 'http://www.w3.org/2000/svg';
  var SILUETA = 'M50,20 L45,20 L45,26 Q38,28 32,29.5 Q23,31.5 22.5,42 L22,64 Q19,80 19,96 L18,108 Q17,116 21,118 ' +
    'Q25,116 24,108 L26,96 Q28,80 29.5,68 L31,52 L33,58 Q35,76 36,92 Q34,102 35.5,110 L35,150 Q34,160 36,168 ' +
    'Q34,182 37,196 L36,204 L46,204 L45,196 Q47,180 46,168 Q48,158 48,140 L49,114 L50,114 Z';
  var MUSCULOS = {
    delante: {
      upperTraps: 'M45,26 Q40,28 35,30 L45,30.5 Z',
      sideDelts: 'M31,30 Q24,31 23,40 L24,46 Q25.5,38 29.5,33 Z',
      frontDelts: 'M35,31 L31.5,30.5 Q26.5,35 25.5,45 Q30,44 33,39 Z',
      upperChest: 'M49,32 L36,32 Q34,36 34,40 L49,40 Z',
      lowerChest: 'M49,40.5 L34,40.5 Q34,48 38,51 Q44,53 49,51 Z',
      biceps: 'M24,47 Q22,55 23,64 L29,64 Q31,56 30.5,47 Z',
      forearms: 'M22.5,68 Q19.5,82 20,98 L25,98 Q28,82 29,68 Z',
      serratusAndObliques: 'M34,52 Q34,68 36,86 L40,86 Q39,70 39,53 Z',
      abdominals: 'M41,54 L49,54 L49,96 Q43,94 41,88 Q40,70 41,54 Z',
      hipFlexors: 'M37,93 Q41,99 46,107 L48,112 Q41,107 36,100 Z',
      quads: 'M36,112 Q34,132 36,160 L44,160 Q46,136 45,116 Z',
      hipAdductors: 'M46,114 L48.5,116 L47.5,146 Q45,132 46,114 Z',
      calves: 'M36,170 Q35,182 37,194 L40,194 Q40,182 39,170 Z',
    },
    detras: {
      upperTraps: 'M45,24 Q40,28 34,30 L42,31 L49,34 L49,24 Z',
      middleTraps: 'M49,34.5 L42,31.5 L35.5,31.5 Q38,37 49,42 Z',
      lowerTraps: 'M49,42.5 Q43,40.5 41,43.5 L49,62 Z',
      sideDelts: 'M31,30 Q24,31 23,40 L24,46 Q25.5,38 29.5,33 Z',
      rearDelts: 'M35,31 L31.5,30.5 Q26.5,35 25.5,45 Q30,44 33,39 Z',
      rotatorCuff: 'M34,38.5 Q35,45 40,47 L41,43.5 Q37,40.5 34,38.5 Z',
      latsAndTeresMajor: 'M34,46.5 Q34,62 39,78 L47,72 L47,64 Q40,58 35,47 Z',
      spinalErectors: 'M47.3,64 L49,64 L49,100 L44,100 Q46.3,84 47.3,64 Z',
      triceps: 'M24,47 Q22,55 23,64 L29,64 Q31,56 30.5,47 Z',
      forearms: 'M22.5,68 Q19.5,82 20,98 L25,98 Q28,82 29,68 Z',
      glutes: 'M36,99 Q34,110 38,118 Q45,120 49,116 L49,101 Q42,96 36,99 Z',
      hamstrings: 'M36,120 Q34,138 37,160 L45,160 Q46,140 45.5,121 Z',
      hipAdductors: 'M46.2,120 L48.5,120 L47.5,146 Q45.2,134 46.2,120 Z',
      calves: 'M36,166 Q34,178 37,192 L45,192 Q47,178 45,166 Z',
    },
  };

  function el(nombre, atributos) {
    var n = document.createElementNS(NS, nombre);
    Object.keys(atributos).forEach(function (k) { n.setAttribute(k, atributos[k]); });
    return n;
  }

  function mitad(lado, colores, nombres) {
    var g = el('g', {});
    g.appendChild(el('path', { d: SILUETA, class: 'silueta' }));
    Object.keys(MUSCULOS[lado]).forEach(function (id) {
      var p = el('path', { d: MUSCULOS[lado][id], class: 'musculo' + (colores[id] ? '' : ' sin-datos'), 'data-musculo': id });
      if (colores[id]) p.setAttribute('fill', colores[id]);
      var titulo = el('title', {});
      titulo.textContent = nombres[id];
      p.appendChild(titulo);
      p.addEventListener('click', function () { App.avisar(nombres[id]); });
      g.appendChild(p);
    });
    return g;
  }

  function dibujar(lado, colores, nombres) {
    var svg = el('svg', { viewBox: '12 0 76 216', class: 'figura', role: 'img', 'aria-label': lado === 'delante' ? 'Por delante' : 'Por detrás' });
    svg.appendChild(el('ellipse', { cx: 50, cy: 11, rx: 7.5, ry: 9.5, class: 'silueta' }));
    svg.appendChild(mitad(lado, colores, nombres));
    var reflejo = mitad(lado, colores, nombres);
    reflejo.setAttribute('transform', 'translate(100 0) scale(-1 1)');
    svg.appendChild(reflejo);
    var pie = el('text', { x: 50, y: 214, 'text-anchor': 'middle', class: 'eje' });
    pie.textContent = lado === 'delante' ? 'Delante' : 'Detrás';
    svg.appendChild(pie);
    return svg;
  }

  return { dibujar: dibujar };
})();
