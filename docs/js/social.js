// Pestaña "Social": faltas de los dos y justificantes, y lo de cada uno (días de gym, estado de fuerza y evolución
// del ciclo) con likes y comentarios. Los datos los da la acción "social" de la API; aquí se guardan en el móvil.
var Social = (function () {
  var h = App.h;
  var viendo = null;         // persona que se está viendo
  var pedido = {};           // peticiones en marcha, para no repetirlas
  var FRESCO = 60000;        // más viejo que esto, se vuelve a pedir al pintar
  var pintandoDentro = false; // repintado por un cambio de datos, no por entrar en la pestaña o cambiar de persona
  var abiertos = {};         // comentarios desplegados, por persona y "sobre"
  var justificando = null;   // fecha de la falta propia que se está justificando
  var faltasAbiertas = null; // persona cuyo contador de faltas se ha tocado para ver su lista
  var diasVisibles = 7;
  var cicloElegido = {};

  var CHIPS = {
    'Hecho': ['bien', 'Completado'],
    'Recuperado': ['bien', 'Recuperado'],
    'Falta': ['mal', 'Falta'],
    'Rechazada': ['mal', 'Falta · justificante rechazado'],
    'Pendiente': ['espera', 'Falta · justificante pendiente'],
    'Justificada': ['neutro', 'Justificada'],
    'En curso': ['espera', 'En el gym'],
    'Terminado': ['espera', 'Terminado sin completar'],
    'Sin terminar': ['espera', 'Sin terminar'],
    'Toca hoy': ['neutro', 'No ha entrado'],
    'Puede recuperarlo hoy': ['espera', 'Sin completar · puede recuperarlo hoy'],
  };
  // Las que suman en el marcador.
  var CUENTAN = ['Falta', 'Pendiente', 'Rechazada'];

  function yo() {
    return Almacen.config().persona;
  }

  function nombreDe(persona) {
    if (persona === yo()) return 'Tú';
    var f = Almacen.faltas();
    return (f && f.personas[persona] && f.personas[persona].nombre) || persona;
  }

  function viejo(guardado) {
    return !guardado || !(Date.now() - (guardado.actualizado || 0) < FRESCO);
  }

  function enSocial() {
    return !!document.querySelector('.pestanas .activa[data-vista="social"]');
  }

  // Repinta sin mover la pantalla (App.mostrar la sube arriba del todo).
  function repintar() {
    if (enSocial()) {
      var y = window.scrollY;
      pintandoDentro = true;
      App.mostrar('social');
      pintandoDentro = false;
      window.scrollTo(0, y);
    }
    actualizarPunto();
  }

  // ---- Datos al día: al entrar, cada CADA mientras se mira y al volver a la app ----

  var CADA = 30000;
  var sinActualizar = false;   // la última petición falló: se ve lo guardado
  var repintarLuego = false;   // llegó algo nuevo mientras se escribía

  function escribiendo() {
    var a = document.activeElement;
    return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !!a.closest('main');
  }

  // Lo guardado sin la hora de guardado, para saber si lo que llega trae algo nuevo.
  function huella(x) {
    if (!x) return '';
    var copia = Object.assign({}, x);
    delete copia.actualizado;
    return JSON.stringify(copia);
  }

  // Lo que llega por detrás solo repinta si ha cambiado, y nunca con un comentario o un motivo a medio escribir.
  function llega(cambiado) {
    if (cambiado) {
      if (escribiendo()) repintarLuego = true;
      else repintar();
    }
    pintarLinea();
    actualizarPunto();
  }

  function pedirDatos(quien) {
    if (!Almacen.config()) return;
    if (!pedido.faltas) {
      var antesFaltas = huella(Almacen.faltas());
      pedido.faltas = true;
      Almacen.actualizarFaltas().then(function (f) {
        pedido.faltas = false;
        sinActualizar = false;
        llega(huella(f) !== antesFaltas);
      }).catch(function () {
        pedido.faltas = false;
        sinActualizar = true;
        llega(!Almacen.faltas());
      });
    }
    if (quien && !pedido[quien]) {
      var antes = huella(Almacen.social(quien));
      pedido[quien] = true;
      Almacen.actualizarSocial(quien).then(function (s) {
        pedido[quien] = false;
        sinActualizar = false;
        llega(huella(s) !== antes);
      }).catch(function () {
        pedido[quien] = false;
        sinActualizar = true;
        llega(!Almacen.social(quien));
      });
    }
    pintarLinea();
  }

  // Línea pequeña de arriba: "Actualizando…" o, si falló, lo dice con un Reintentar.
  function pintarLinea() {
    var linea = document.querySelector('.social-linea');
    if (!linea) return;
    linea.innerHTML = '';
    if (pedido.faltas || pedido[viendo]) {
      linea.textContent = 'Actualizando…';
    } else if (sinActualizar) {
      linea.appendChild(document.createTextNode('No se pudo actualizar · '));
      linea.appendChild(h('button', { type: 'button', class: 'discreto', texto: 'Reintentar', onclick: function () { pedirDatos(viendo); } }));
    }
  }

  setInterval(function () {
    if (enSocial() && !document.hidden && navigator.onLine) pedirDatos(viendo);
  }, CADA);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && enSocial()) pedirDatos(viendo);
  });
  document.addEventListener('focusout', function () {
    setTimeout(function () {
      if (repintarLuego && !escribiendo()) {
        repintarLuego = false;
        repintar();
      }
    }, 300);
  });

  function fallo(e) {
    App.avisar(e.message, true);
  }

  function fechaCorta(iso) {
    var p = iso.split('-').map(Number);
    var dia = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
    return dia + ' ' + String(p[2]).padStart(2, '0') + '/' + String(p[1]).padStart(2, '0');
  }

  function chip(resultado, mio) {
    var c = CHIPS[resultado] || ['neutro', resultado];
    var texto = mio && resultado === 'Toca hoy' ? 'No has entrado' : c[1];
    return h('span', { class: 'chip resultado ' + c[0], texto: texto });
  }

  // ---- Punto en la pestaña: justificantes por contestar o likes y comentarios nuevos en lo tuyo ----

  function claveVisto() {
    return 'gymapp.socialVisto.' + yo();
  }

  function visto() {
    try {
      return localStorage.getItem(claveVisto()) || '';
    } catch (e) {
      return '';
    }
  }

  function marcarVisto() {
    var mias = (Almacen.social(yo()) || {}).reacciones || [];
    var ultima = mias.reduce(function (m, r) { return r.fecha > m ? r.fecha : m; }, visto());
    try {
      localStorage.setItem(claveVisto(), ultima);
    } catch (e) { /* sin almacenamiento: el punto vuelve a salir */ }
  }

  function porRevisar() {
    var f = Almacen.faltas();
    if (!f) return [];
    var lista = [];
    Object.keys(f.personas).forEach(function (p) {
      if (p === yo()) return;
      f.personas[p].dias.forEach(function (d) { if (d.resultado === 'Pendiente') lista.push({ de: p, dia: d }); });
    });
    return lista;
  }

  function novedades() {
    if (!Almacen.config()) return 0;
    var desde = visto();
    var mias = ((Almacen.social(yo()) || {}).reacciones || []).filter(function (r) { return r.de !== yo() && r.fecha > desde; });
    return porRevisar().length + mias.length;
  }

  function actualizarPunto() {
    var boton = document.querySelector('.pestanas [data-vista="social"]');
    if (boton) boton.classList.toggle('con-aviso', novedades() > 0);
  }

  // Al abrir la app se mira si hay algo nuevo, para el punto de la pestaña.
  function comprobar() {
    if (!Almacen.config()) return;
    pedirDatos(yo());
  }

  // ---- Likes y comentarios ----

  function reacciones(datos, sobre) {
    var lista = (datos.reacciones || []).filter(function (r) { return r.sobre === sobre; });
    var likes = lista.filter(function (r) { return r.tipo === 'like'; });
    var comentarios = lista.filter(function (r) { return r.tipo === 'comentario'; });
    var mio = datos.de === yo();
    var dado = likes.some(function (r) { return r.de === yo(); });
    var caja = h('div', { class: 'reacciones' });
    var barra = h('div', { class: 'reacciones-barra' }, [
      mio
        ? (likes.length ? h('span', { class: 'like dado', title: likes.map(function (r) { return nombreDe(r.de); }).join(', '), texto: '❤️ ' + likes.length }) : null)
        : h('button', { type: 'button', class: 'like' + (dado ? ' dado' : ''), 'aria-pressed': dado ? 'true' : 'false',
          texto: (dado ? '❤️' : '🤍') + (likes.length ? ' ' + likes.length : ''), onclick: function (ev) {
            ev.currentTarget.disabled = true;
            Almacen.reaccionar(datos.de, sobre, 'like').then(repintar).catch(fallo);
          } }),
      h('button', { type: 'button', class: 'comentar', texto: '💬' + (comentarios.length ? ' ' + comentarios.length : ' Comentar'),
        onclick: function () {
          abiertos[datos.de + '|' + sobre] = !abiertos[datos.de + '|' + sobre];
          repintar();
        } }),
    ]);
    caja.appendChild(barra);
    if (abiertos[datos.de + '|' + sobre]) {
      comentarios.forEach(function (c) {
        caja.appendChild(h('div', { class: 'comentario' }, [
          h('p', {}, [h('strong', { texto: nombreDe(c.de) + ': ' }), c.texto]),
          h('span', { class: 'detalle', texto: fechaCorta(c.fecha.slice(0, 10)) + ' ' + c.fecha.slice(11, 16) }),
          c.de === yo() ? h('button', { type: 'button', class: 'discreto', 'aria-label': 'Borrar comentario', texto: '✕', onclick: function () {
            Almacen.borrarComentario(datos.de, c.id).then(repintar).catch(fallo);
          } }) : null,
        ]));
      });
      var texto = h('input', { type: 'text', maxlength: '500', placeholder: 'Escribe un comentario', 'aria-label': 'Comentario' });
      var enviar = h('button', { type: 'button', class: 'principal', texto: 'Enviar', onclick: function () {
        if (!texto.value.trim()) return;
        enviar.disabled = true;
        Almacen.reaccionar(datos.de, sobre, 'comentario', texto.value).then(repintar).catch(function (e) {
          enviar.disabled = false;
          fallo(e);
        });
      } });
      texto.addEventListener('keydown', function (e) { if (e.key === 'Enter') enviar.click(); });
      caja.appendChild(h('div', { class: 'escribir' }, [texto, enviar]));
    }
    return caja;
  }

  // ---- Faltas ----

  function filaFaltaPropia(d) {
    var texto = fechaCorta(d.fecha) + ' · ' + d.entreno;
    if (justificando === d.fecha) {
      var motivo = h('input', { type: 'text', maxlength: '300', placeholder: 'Motivo (enfermo, trabajo…)', 'aria-label': 'Motivo', value: d.motivo || '' });
      var guardar = h('button', { type: 'button', class: 'principal', texto: 'Mandar', onclick: function () {
        guardar.disabled = true;
        Almacen.justificar(d.fecha, motivo.value)
          .then(function () { justificando = null; repintar(); })
          .catch(function (e) { guardar.disabled = false; fallo(e); });
      } });
      setTimeout(function () { motivo.focus(); }, 0);
      return h('li', { class: 'justificar' }, [h('span', { texto: texto }), motivo, guardar]);
    }
    var otro = Object.keys(Almacen.faltas().personas).filter(function (p) { return p !== yo(); }).map(nombreDe).join(' y ');
    var estado = d.resultado === 'Justificada' ? 'justificada: ' + d.motivo
      : d.resultado === 'Pendiente' ? 'esperando a ' + otro + ': ' + d.motivo
        : d.resultado === 'Rechazada' ? 'rechazada: ' + d.motivo : 'falta';
    return h('li', {}, [
      h('span', { texto: texto + ' · ' + estado }),
      d.resultado === 'Justificada' ? null : h('button', { type: 'button', class: 'discreto',
        texto: d.resultado === 'Falta' ? 'Justificar' : 'Cambiar motivo', onclick: function () {
          justificando = d.fecha;
          repintar();
        } }),
    ]);
  }

  function botonesRevisar(de, d) {
    return h('div', { class: 'revisar-botones' }, [
      h('button', { type: 'button', class: 'principal', texto: 'Aceptar', onclick: function (ev) {
        ev.currentTarget.disabled = true;
        Almacen.revisar(de, d.fecha, true).then(repintar).catch(fallo);
      } }),
      h('button', { type: 'button', texto: 'Rechazar', onclick: function (ev) {
        ev.currentTarget.disabled = true;
        Almacen.revisar(de, d.fecha, false).then(repintar).catch(fallo);
      } }),
    ]);
  }

  // Una falta del otro: su justificante por contestar, o quitársela si no tiene (o se la rechazaste).
  function filaFaltaAjena(p, d) {
    var texto = fechaCorta(d.fecha) + ' · ' + d.entreno;
    if (d.resultado === 'Pendiente') {
      return h('li', { class: 'justificar' }, [h('span', { texto: texto + ' · justificante: ' + d.motivo }), botonesRevisar(p, d)]);
    }
    if (d.resultado === 'Justificada') return h('li', {}, [h('span', { texto: texto + ' · justificada: ' + d.motivo })]);
    return h('li', {}, [
      h('span', { texto: texto + (d.resultado === 'Rechazada' ? ' · rechazada: ' + d.motivo : ' · sin justificante') }),
      h('button', { type: 'button', class: 'discreto', texto: 'Quitar', onclick: function (ev) {
        var boton = ev.currentTarget;
        if (boton.textContent !== '¿Seguro?') { boton.textContent = '¿Seguro?'; return; }
        boton.disabled = true;
        Almacen.revisar(p, d.fecha, true).then(repintar).catch(fallo);
      } }),
    ]);
  }

  function tarjetaFaltas(cont) {
    var f = Almacen.faltas();
    var anio = Almacen.hoyISO().slice(0, 4);
    var personas = Object.keys(f.personas).sort(function (a, b) { return a === yo() ? 1 : b === yo() ? -1 : 0; });
    function delAnio(p) {
      return f.personas[p].dias.filter(function (d) { return d.fecha.slice(0, 4) === anio; });
    }
    if (faltasAbiertas && !f.personas[faltasAbiertas]) faltasAbiertas = null;
    var tarjeta = h('div', { class: 'tarjeta faltas' }, [
      h('h3', { texto: 'Faltas ' + anio }),
      // Cada contador es un botón: abre la lista de faltas de esa persona, también las de hace semanas, que ya no
      // salen en "Días de gym".
      h('div', { class: 'marcador' }, personas.map(function (p) {
        var dias = delAnio(p);
        var faltas = dias.filter(function (d) { return CUENTAN.indexOf(d.resultado) >= 0; }).length;
        var justificadas = dias.filter(function (d) { return d.resultado === 'Justificada'; }).length;
        var abierto = faltasAbiertas === p;
        return h('button', { type: 'button', class: abierto ? 'abierto' : '', 'aria-expanded': abierto ? 'true' : 'false', onclick: function () {
          faltasAbiertas = abierto ? null : p;
          justificando = null;
          repintar();
        } }, [
          h('span', { class: 'etiqueta', texto: f.personas[p].nombre }),
          h('strong', { texto: String(faltas) }),
          h('span', { class: 'detalle', texto: justificadas ? justificadas + (justificadas === 1 ? ' justificada' : ' justificadas') : ' ' }),
          h('span', { class: 'ver', texto: abierto ? 'Cerrar ▴' : 'Ver ▾' }),
        ]);
      })),
    ]);

    // Los justificantes del otro por contestar salen siempre, sin abrir nada.
    porRevisar().forEach(function (x) {
      if (faltasAbiertas === x.de) return; // ya sale en su lista
      tarjeta.appendChild(h('div', { class: 'revisar' }, [
        h('p', {}, [h('strong', { texto: f.personas[x.de].nombre + ' justifica ' + fechaCorta(x.dia.fecha) + ' · ' + x.dia.entreno + ': ' }), x.dia.motivo]),
        botonesRevisar(x.de, x.dia),
      ]));
    });

    if (faltasAbiertas) {
      var p = faltasAbiertas;
      var mio = p === yo();
      var lista = delAnio(p).filter(function (d) { return CUENTAN.indexOf(d.resultado) >= 0 || d.resultado === 'Justificada'; }).reverse();
      tarjeta.appendChild(h('p', { class: 'detalle', texto: mio ? 'Tus faltas' : 'Faltas de ' + f.personas[p].nombre }));
      if (!lista.length) {
        tarjeta.appendChild(h('p', { class: 'detalle', texto: 'Ninguna falta este año.' }));
      } else {
        tarjeta.appendChild(h('ul', { class: 'lista-faltas' }, lista.map(function (d) {
          return mio ? filaFaltaPropia(d) : filaFaltaAjena(p, d);
        })));
      }
    }
    if (!personas.some(function (p) { return delAnio(p).length; })) {
      tarjeta.appendChild(h('p', { class: 'detalle', texto: 'Cuentan los días de gym desde el ' + fechaCorta(Calendario.INICIO_FALTAS) +
        '. Es falta si al acabar el día no están todos los ejercicios; se puede recuperar al día siguiente. El justificante lo acepta el otro.' }));
    }
    cont.appendChild(tarjeta);
  }

  // ---- Lo de cada persona ----

  function textoHoy(datos) {
    var hoy = datos.dias[0];
    var mio = datos.de === yo();
    if (!hoy) return null;
    if (hoy.fecha === datos.hoy) {
      if (hoy.resultado === 'Hecho') return '✅ ' + hoy.entreno + ' completado';
      if (hoy.resultado === 'En curso') return '🏋️ En el gym: ' + hoy.hechos + ' de ' + hoy.total + ' ejercicios del ' + hoy.entreno;
      if (hoy.resultado === 'Terminado') return '🏁 ' + hoy.entreno + ' terminado: ' + hoy.hechos + ' de ' + hoy.total + ' ejercicios';
      if (hoy.resultado === 'Sin terminar') return '⏸️ ' + hoy.entreno + ' sin terminar: ' + hoy.hechos + ' de ' + hoy.total + ' ejercicios' +
        (hoy.ultima ? ' · última serie a las ' + hoy.ultima : '');
      return '⏳ Hoy toca ' + hoy.entreno + ' · ' + (mio ? 'no has entrado' : 'no ha entrado');
    }
    if (hoy.resultado === 'Puede recuperarlo hoy') return '😴 Hoy es descanso · ayer ' + (mio ? 'no completaste' : 'no completó') + ' el ' + hoy.entreno + ' (' + hoy.hechos + ' de ' + hoy.total + ')';
    return '😴 Hoy es día de descanso';
  }

  function tarjetaDias(cont, datos) {
    var tarjeta = h('div', { class: 'tarjeta' }, [h('h3', { texto: 'Días de gym' })]);
    var titular = textoHoy(datos);
    if (titular) tarjeta.appendChild(h('p', { class: 'hoy-social', texto: titular }));
    if (!datos.dias.length) {
      tarjeta.appendChild(h('p', { class: 'detalle', texto: 'Todavía no hay días de gym desde el ' + fechaCorta(Calendario.INICIO_FALTAS) + '.' }));
    }
    datos.dias.slice(0, diasVisibles).forEach(function (d) {
      var partes = [];
      if (d.total) partes.push((d.resultado === 'Recuperado' ? d.conSiguiente : d.hechos) + ' de ' + d.total + ' ejercicios');
      if (d.minutos) partes.push(d.minutos + ' min');
      if (d.series) partes.push(d.series + ' series');
      tarjeta.appendChild(h('div', { class: 'dia-social' }, [
        h('div', { class: 'ejercicio-cabecera' }, [
          h('strong', { texto: fechaCorta(d.fecha) + ' · ' + d.entreno + ' · ' + Calendario.nombreColumna(d.columna) }),
          chip(d.resultado, datos.de === yo()),
        ]),
        partes.length ? h('p', { class: 'detalle', texto: partes.join(' · ') }) : null,
        d.motivo ? h('p', { class: 'detalle', texto: 'Justificante: ' + d.motivo }) : null,
        reacciones(datos, 'dia:' + d.fecha),
      ]));
    });
    if (datos.dias.length > diasVisibles) {
      tarjeta.appendChild(h('button', { type: 'button', class: 'discreto', texto: 'Ver más días', onclick: function () {
        diasVisibles += 14;
        repintar();
      } }));
    }
    cont.appendChild(tarjeta);
  }

  // Pasos de hoy (anillo) y kcal de la semana. Los tuyos, con los de este móvil, que están más al día que lo subido.
  function tarjetaPasos(cont, datos) {
    var mio = datos.de === yo();
    var lista = mio ? Almacen.pasos() : (datos.pasos || []);
    if (!lista.length) {
      cont.appendChild(h('div', { class: 'tarjeta' }, [
        h('h3', { texto: 'Pasos' }),
        h('p', { class: 'detalle', texto: mio ? 'Los pasos se leen en la app de Android.' : datos.nombre + ' todavía no tiene pasos (se leen en la app de Android).' }),
      ]));
      return;
    }
    var hoy = datos.hoy;
    var pasos = Pasos.tarjetas(cont, lista, hoy, mio ? Almacen.objetivoPasos() : 10000, mio ? null : datos.nombre);
    pasos.appendChild(reacciones(datos, 'pasos:' + hoy));
  }

  function tarjetaEstado(cont, datos) {
    var mio = datos.de === yo();
    // Lo tuyo con los datos de este móvil, que están más al día que lo subido.
    var r = mio ? (Estado.actual() || datos.estado) : datos.estado;
    if (!r) {
      cont.appendChild(h('div', { class: 'tarjeta' }, [
        h('h3', { texto: 'Estado de fuerza' }),
        h('p', { class: 'detalle', texto: mio ? 'Abre tu pestaña Estado y pon tus datos para que salga aquí.'
          : datos.nombre + ' todavía no ha abierto su pestaña Estado.' }),
      ]));
      return;
    }
    if (mio) Estado.compartir(r);
    var fotos = datos.estados || [];
    var anterior = fotos.length ? fotos[fotos.length - 1] : null;
    var tarjeta = Estado.resumen(cont, r, null, anterior, !mio, true);
    if (!mio && datos.estado && datos.estado.guardado) {
      tarjeta.masInfo.appendChild(h('p', { class: 'detalle', texto: 'Actualizado el ' + fechaCorta(datos.estado.guardado) }));
    }
    Estado.musculos(tarjeta.masInfo, r);
    tarjeta.appendChild(reacciones(datos, 'estado:' + datos.hoy.slice(0, 7)));
  }

  function tarjetaCiclo(cont, datos) {
    var p = datos.progreso || { ejercicios: [], filas: [] };
    var ciclos = [];
    p.filas.forEach(function (f) { if (ciclos.indexOf(f.ciclo) < 0) ciclos.push(f.ciclo); });
    if (!ciclos.length) return;
    var elegido = cicloElegido[datos.de];
    var ciclo = elegido && ciclos.indexOf(elegido) >= 0 ? elegido : ciclos[ciclos.length - 1];
    cont.appendChild(h('div', { class: 'tarjeta' }, [
      h('div', { class: 'ejercicio-cabecera' }, [
        h('h2', { texto: 'Evolución del ciclo' }),
        h('select', { 'aria-label': 'Ciclo', onchange: function (e) {
          cicloElegido[datos.de] = e.target.value;
          repintar();
        } }, ciclos.map(function (c) { return h('option', { value: c, selected: c === ciclo, texto: c }); })),
      ]),
      h('p', { class: 'detalle', texto: 'Línea discontinua: lo que proyectaba el Excel. Línea amarilla: lo hecho.' }),
      reacciones(datos, 'ciclo:' + ciclo),
    ]));
    App.graficasCiclo(cont, p, ciclo, 'social-' + datos.de);
  }

  // ---- Pantalla ----

  App.vistas.social = function (cont) {
    if (!Almacen.config()) {
      cont.appendChild(h('p', { class: 'vacio', texto: 'Configura la app en Ajustes.' }));
      return;
    }
    var entrando = !pintandoDentro;
    if (entrando) sinActualizar = false;
    function noCargo() {
      return h('div', { class: 'tarjeta' }, [
        h('p', { texto: 'No se pudo cargar.' }),
        h('button', { texto: 'Reintentar', onclick: function () { App.mostrar('social'); } }),
      ]);
    }
    var f = Almacen.faltas();
    if (!f) {
      // Sin nada guardado todavía: se espera a la primera respuesta.
      if (sinActualizar && !pedido.faltas) {
        cont.appendChild(noCargo());
        return;
      }
      pedirDatos(null);
      cont.appendChild(h('div', { class: 'tarjeta' }, [h('p', { texto: 'Cargando…' })]));
      return;
    }

    var personas = Object.keys(f.personas).sort(function (a, b) { return a === yo() ? 1 : b === yo() ? -1 : 0; });
    if (!viendo || !f.personas[viendo]) viendo = personas[0];
    cont.appendChild(h('div', { class: 'opciones dos selector-persona' }, personas.map(function (p) {
      return h('button', { type: 'button', class: p === viendo ? 'actual' : '', texto: p === yo() ? 'Tú' : f.personas[p].nombre, onclick: function () {
        viendo = p;
        diasVisibles = 7;
        App.mostrar('social');
      } });
    })));

    // Al entrar en la pestaña o cambiar de persona se vuelve a pedir todo; al repintar, solo lo viejo.
    var datos = Almacen.social(viendo);
    if (entrando || (!sinActualizar && (viejo(f) || viejo(datos)))) pedirDatos(viendo);
    cont.appendChild(h('p', { class: 'detalle social-linea', 'aria-live': 'polite' }));
    pintarLinea();

    tarjetaFaltas(cont);

    if (!datos) {
      cont.appendChild(sinActualizar && !pedido[viendo] ? noCargo()
        : h('div', { class: 'tarjeta' }, [h('p', { texto: 'Cargando lo de ' + f.personas[viendo].nombre + '…' })]));
      return;
    }
    if (viendo === yo()) marcarVisto();
    tarjetaDias(cont, datos);
    tarjetaPasos(cont, datos);
    tarjetaEstado(cont, datos);
    tarjetaCiclo(cont, datos);
    actualizarPunto();
  };

  setTimeout(comprobar, 1500);

  return { actualizarPunto: actualizarPunto };
})();
