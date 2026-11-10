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
  var animarFaltas = false;  // se acaba de tocar: la lista se despliega (no al repintar solo cada 30 s)
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

  // ---- De dónde salen los datos: el Social de los Excel (los dos de siempre) o un grupo de Firestore (2026-11-08) ----
  var CLAVE_GRUPO = 'gymapp.socialGrupo';
  function grupoElegido() {
    var g = null;
    try { g = localStorage.getItem(CLAVE_GRUPO); } catch (e) { /* nada */ }
    var grupos = typeof Equipos !== 'undefined' ? Equipos.deGym() : [];
    if (g && g !== 'excel' && grupos.some(function (x) { return x._id === g; })) return g;
    if (g === 'excel' && Almacen.conExcel()) return null;
    return Almacen.conExcel() ? null : (grupos[0] ? grupos[0]._id : null);
  }
  function elegirGrupo(g) {
    try { localStorage.setItem(CLAVE_GRUPO, g || 'excel'); } catch (e) { /* nada */ }
    viendo = null;
    faltasAbiertas = null;
    verFaltas = false;
  }
  var fuente = {
    faltas: function () { var g = grupoElegido(); return g ? SocialNube.faltas(g) : Almacen.faltas(); },
    social: function (q) {
      var g = grupoElegido();
      if (g) return SocialNube.social(g, q);
      // GymCrush (los Excel): con el resumen que subió su móvil (minititulo, equilibrio, récords del mes).
      var d = Almacen.social(q);
      return d && d.resumen ? Object.assign({}, d, d.resumen) : d;
    },
    reaccionar: function (para, sobre, tipo, texto) {
      var g = grupoElegido();
      return g ? SocialNube.reaccionar(g, para, sobre, tipo, texto) : Almacen.reaccionar(para, sobre, tipo, texto);
    },
    borrarComentario: function (para, id) { var g = grupoElegido(); return g ? SocialNube.borrarComentario(g, id) : Almacen.borrarComentario(para, id); },
    justificar: function (fecha, motivo) { var g = grupoElegido(); return g ? SocialNube.justificar(g, fecha, motivo) : Almacen.justificar(fecha, motivo); },
    revisar: function (de, fecha, aceptar) { var g = grupoElegido(); return g ? SocialNube.revisar(g, de, fecha, aceptar) : Almacen.revisar(de, fecha, aceptar); },
  };

  function yo() {
    return grupoElegido() ? Nube.uid() : Almacen.config().persona;
  }

  function nombreDe(persona) {
    if (persona === yo()) return 'Tú';
    var f = fuente.faltas();
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
      App.mostrar('social', null, y);
      pintandoDentro = false;
    }
    actualizarPunto();
  }

  // Moverse dentro del grupo (a la ficha de alguien, a las faltas y de vuelta) desliza como entre pestañas y no
  // vuelve a pedir nada a internet (él, 2026-11-08: "que sea fluido"). Al volver, la lista sigue a la misma altura.
  var alturaGrupo = 0;
  function entrarEn() {
    alturaGrupo = window.scrollY;
    pintandoDentro = true;
    App.mostrar('social', 'izquierda');
    pintandoDentro = false;
  }
  function volverAlGrupo() {
    pintandoDentro = true;
    App.mostrar('social', 'derecha', alturaGrupo);
    pintandoDentro = false;
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
  // Si llegan varias respuestas seguidas (faltas y lo de cada uno), se repinta una sola vez.
  var repintarPronto = null;
  function llega(cambiado) {
    if (cambiado) {
      if (escribiendo()) repintarLuego = true;
      else if (!repintarPronto) {
        var luego = function () {
          // Mientras una pantalla se desliza, se espera: repintar en medio corta la animación.
          if (document.querySelector('.saliendo')) { repintarPronto = setTimeout(luego, 200); return; }
          repintarPronto = null;
          if (escribiendo()) repintarLuego = true;
          else repintar();
        };
        repintarPronto = setTimeout(luego, 250);
      }
    }
    pintarLinea();
    actualizarPunto();
  }

  function pedirDatos(quien) {
    if (!Almacen.config()) return;
    var g = grupoElegido();
    if (g) {
      if (pedido['g' + g]) return;
      var antesGrupo = huella(SocialNube.faltas(g)) + huella(SocialNube.social(g, quien));
      pedido['g' + g] = true;
      pintarLinea();
      SocialNube.actualizar(g).then(function () {
        pedido['g' + g] = false;
        sinActualizar = false;
        llega(huella(SocialNube.faltas(g)) + huella(SocialNube.social(g, quien)) !== antesGrupo);
      }).catch(function () {
        pedido['g' + g] = false;
        sinActualizar = true;
        llega(!SocialNube.faltas(g));
      });
      return;
    }
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

  // Línea pequeña de arriba: solo si falló, con un Reintentar (él, 2026-11-08: fuera el "Actualizando…").
  function pintarLinea() {
    var linea = document.querySelector('.social-linea');
    if (!linea) return;
    linea.innerHTML = '';
    if (pedido.faltas || pedido[viendo] || pedido['g' + grupoElegido()]) {
      // Pidiendo: no se enseña nada.
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

  function quiereMenosMovimiento() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function fechaCorta(iso) {
    var p = iso.split('-').map(Number);
    var dia = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
    return dia + ' ' + String(p[2]).padStart(2, '0') + '/' + String(p[1]).padStart(2, '0');
  }

  function chip(resultado, mio) {
    var c = CHIPS[resultado] || ['neutro', resultado];
    var texto = mio && resultado === 'Toca hoy' ? 'No has entrado' : c[1];
    return h('span', { class: 'chip resultado ' + c[0] }, [Iconos.estado(resultado), texto]);
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
    var mias = (fuente.social(yo()) || {}).reacciones || [];
    var ultima = mias.reduce(function (m, r) { return r.fecha > m ? r.fecha : m; }, visto());
    try {
      localStorage.setItem(claveVisto(), ultima);
    } catch (e) { /* sin almacenamiento: el punto vuelve a salir */ }
  }

  function porRevisar() {
    var f = fuente.faltas();
    if (!f) return [];
    var lista = [];
    Object.keys(f.personas).forEach(function (p) {
      if (p === yo()) return;
      f.personas[p].dias.forEach(function (d) { if (d.resultado === 'Pendiente') lista.push({ de: p, dia: d }); });
    });
    return lista;
  }

  function novedades() {
    if (!Almacen.conExcel() && !grupoElegido()) return 0;
    var desde = visto();
    var mias = ((fuente.social(yo()) || {}).reacciones || []).filter(function (r) { return r.de !== yo() && r.fecha > desde; });
    return porRevisar().length + mias.length;
  }

  function actualizarPunto() {
    var boton = document.querySelector('.pestanas [data-vista="social"]');
    if (boton) boton.classList.toggle('con-aviso', novedades() > 0);
  }

  // Al abrir la app se mira si hay algo nuevo, para el punto de la pestaña.
  function comprobar() {
    if (!Almacen.conExcel() && !grupoElegido()) return;
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
        ? (likes.length ? h('span', { class: 'like dado', title: likes.map(function (r) { return nombreDe(r.de); }).join(', ') },
          [Iconos.corazon(true), String(likes.length)]) : null)
        : h('button', { type: 'button', class: 'like' + (dado ? ' dado' : ''), 'aria-pressed': dado ? 'true' : 'false',
          'aria-label': dado ? 'Quitar me gusta' : 'Me gusta', onclick: function (ev) {
            ev.currentTarget.disabled = true;
            fuente.reaccionar(datos.de, sobre, 'like').then(repintar).catch(fallo);
          } }, [Iconos.corazon(dado), likes.length ? String(likes.length) : null]),
      h('button', { type: 'button', class: 'comentar', 'aria-label': 'Comentar',
        onclick: function () {
          abiertos[datos.de + '|' + sobre] = !abiertos[datos.de + '|' + sobre];
          repintar();
        } }, [Iconos.comentario(), comentarios.length ? String(comentarios.length) : 'Comentar']),
    ]);
    caja.appendChild(barra);
    if (abiertos[datos.de + '|' + sobre]) {
      comentarios.forEach(function (c) {
        caja.appendChild(h('div', { class: 'comentario' }, [
          h('p', {}, [h('strong', { texto: nombreDe(c.de) + ': ' }), c.texto]),
          h('span', { class: 'detalle', texto: fechaCorta(c.fecha.slice(0, 10)) + ' ' + c.fecha.slice(11, 16) }),
          c.de === yo() ? h('button', { type: 'button', class: 'discreto', 'aria-label': 'Borrar comentario', onclick: function () {
            fuente.borrarComentario(datos.de, c.id).then(repintar).catch(fallo);
          } }, [Iconos.borrar()]) : null,
        ]));
      });
      var texto = h('input', { type: 'text', maxlength: '500', placeholder: 'Escribe un comentario', 'aria-label': 'Comentario' });
      var enviar = h('button', { type: 'button', class: 'principal', texto: 'Enviar', onclick: function () {
        if (!texto.value.trim()) return;
        enviar.disabled = true;
        fuente.reaccionar(datos.de, sobre, 'comentario', texto.value).then(repintar).catch(function (e) {
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

  // Una falta en la lista: la fecha destacada a la izquierda, el entreno y su estado en color, y la acción a la derecha.
  var ESTADO_FALTA = {
    Falta: ['mal', 'Falta'], Pendiente: ['espera', 'Pendiente'], Justificada: ['bien', 'Justificada'], Rechazada: ['mal', 'Rechazada'],
  };

  function filaFalta(d, detalle, accion, clase) {
    var p = d.fecha.split('-').map(Number);
    var fecha = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    var e = ESTADO_FALTA[d.resultado] || ['neutro', d.resultado];
    return h('li', { class: 'falta-fila' + (clase ? ' ' + clase : '') }, [
      h('div', { class: 'falta-fecha' }, [
        h('strong', { texto: String(p[2]) }),
        h('span', { texto: fecha.toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' }).replace('.', '') + ' · ' +
          fecha.toLocaleDateString('es-ES', { month: 'short', timeZone: 'UTC' }).replace('.', '') }),
      ]),
      h('div', { class: 'falta-info' }, [
        h('div', { class: 'falta-linea' }, [h('strong', { texto: d.entreno }), h('span', { class: 'chip resultado ' + e[0], texto: e[1] })]),
        detalle ? h('p', { class: 'detalle', texto: detalle }) : null,
      ]),
      accion ? h('div', { class: 'falta-accion' }, [accion]) : null,
    ]);
  }

  function filaFaltaPropia(d) {
    if (justificando === d.fecha) {
      var motivo = h('input', { type: 'text', maxlength: '300', placeholder: 'Motivo (enfermo, trabajo…)', 'aria-label': 'Motivo', value: d.motivo || '' });
      var guardar = h('button', { type: 'button', class: 'principal', texto: 'Mandar', onclick: function () {
        guardar.disabled = true;
        fuente.justificar(d.fecha, motivo.value)
          .then(function () { justificando = null; repintar(); })
          .catch(function (e) { guardar.disabled = false; fallo(e); });
      } });
      setTimeout(function () { motivo.focus(); }, 0);
      var fila = filaFalta(d, null, null, 'justificar');
      fila.appendChild(h('div', { class: 'falta-motivo' }, [motivo, guardar]));
      return fila;
    }
    var otro = Object.keys(fuente.faltas().personas).filter(function (p) { return p !== yo(); }).map(nombreDe).join(' y ');
    var detalle = d.resultado === 'Pendiente' ? 'Esperando a ' + otro + ': ' + d.motivo
      : d.resultado === 'Falta' ? 'Sin justificante' : d.motivo;
    return filaFalta(d, detalle, d.resultado === 'Justificada' ? null : h('button', { type: 'button', class: 'discreto',
      texto: d.resultado === 'Falta' ? 'Justificar' : 'Cambiar motivo', onclick: function () {
        justificando = d.fecha;
        repintar();
      } }));
  }

  function botonesRevisar(de, d) {
    return h('div', { class: 'revisar-botones' }, [
      h('button', { type: 'button', class: 'principal', texto: 'Aceptar', onclick: function (ev) {
        ev.currentTarget.disabled = true;
        fuente.revisar(de, d.fecha, true).then(repintar).catch(fallo);
      } }),
      h('button', { type: 'button', texto: 'Rechazar', onclick: function (ev) {
        ev.currentTarget.disabled = true;
        fuente.revisar(de, d.fecha, false).then(repintar).catch(fallo);
      } }),
    ]);
  }

  // Una falta del otro: su justificante por contestar, o quitársela si no tiene (o se la rechazaste).
  function filaFaltaAjena(p, d) {
    if (d.resultado === 'Pendiente') {
      var fila = filaFalta(d, 'Justificante: ' + d.motivo, null, 'justificar');
      fila.appendChild(h('div', { class: 'falta-motivo' }, [botonesRevisar(p, d)]));
      return fila;
    }
    if (d.resultado === 'Justificada') return filaFalta(d, d.motivo, null);
    return filaFalta(d, d.resultado === 'Rechazada' ? 'Rechazada: ' + d.motivo : 'Sin justificante',
      h('button', { type: 'button', class: 'discreto', texto: 'Quitar', onclick: function (ev) {
        var boton = ev.currentTarget;
        if (boton.textContent !== '¿Seguro?') { boton.textContent = '¿Seguro?'; return; }
        boton.disabled = true;
        fuente.revisar(p, d.fecha, true).then(repintar).catch(fallo);
      } }));
  }

  function tarjetaFaltas(cont) {
    var f = fuente.faltas();
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
          justificando = null;
          var caja = document.querySelector('.faltas-caja');
          // Al cerrar, la lista se recoge antes de quitarla.
          if (abierto && caja && !quiereMenosMovimiento()) {
            caja.classList.add('plegar');
            var hecho = false;
            var quitar = function () { if (hecho) return; hecho = true; faltasAbiertas = null; repintar(); };
            caja.addEventListener('animationend', quitar);
            setTimeout(quitar, 400);
            return;
          }
          faltasAbiertas = abierto ? null : p;
          animarFaltas = !abierto;
          repintar();
        } }, [
          h('span', { class: 'etiqueta', texto: f.personas[p].nombre }),
          h('strong', { texto: f.personas[p].privado ? '—' : String(faltas) }),
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
      // Un panel propio que sale del contador tocado (la flecha apunta a él): se despliega al abrir y se recoge al cerrar.
      var filas = lista.map(function (d, i) {
        var fila = mio ? filaFaltaPropia(d) : filaFaltaAjena(p, d);
        fila.style.setProperty('--i', i);
        return fila;
      });
      var dentro = h('div', { class: 'faltas-dentro' }, [
        h('p', { class: 'faltas-titulo' }, [
          h('strong', { texto: mio ? 'Tus faltas' : 'Faltas de ' + f.personas[p].nombre }),
          h('span', { class: 'detalle', texto: lista.length ? lista.length + ' en ' + anio : '' }),
        ]),
        lista.length ? h('ul', { class: 'lista-faltas' }, filas) : h('p', { class: 'detalle', texto: 'Ninguna falta este año.' }),
      ]);
      tarjeta.appendChild(h('div', { class: 'faltas-caja lado-' + personas.indexOf(p) + (animarFaltas ? ' desplegar' : '') }, [dentro]));
      animarFaltas = false;
    }
    if (!personas.some(function (p) { return delAnio(p).length; })) {
      tarjeta.appendChild(h('p', { class: 'detalle', texto: (grupoElegido() ? 'Cuentan los días de gym de cada uno desde que se creó el grupo'
        : 'Cuentan los días de gym desde el ' + fechaCorta(Calendario.INICIO_FALTAS)) +
        '. Es falta si al acabar el día no están todos los ejercicios; se puede recuperar al día siguiente. ' +
        (grupoElegido() ? 'El justificante lo acepta cualquiera del grupo.' : 'El justificante lo acepta el otro.') }));
    }
    cont.appendChild(tarjeta);
  }

  // ---- Lo de cada persona ----

  function textoHoy(datos) {
    var hoy = datos.dias[0];
    var mio = datos.de === yo();
    if (!hoy) return null;
    if (hoy.fecha === datos.hoy) {
      if (hoy.resultado === 'Hecho') return hoy.entreno + ' completado';
      if (hoy.resultado === 'En curso') return 'En el gym: ' + hoy.hechos + ' de ' + hoy.total + ' ejercicios del ' + hoy.entreno;
      if (hoy.resultado === 'Terminado') return hoy.entreno + ' terminado: ' + hoy.hechos + ' de ' + hoy.total + ' ejercicios';
      if (hoy.resultado === 'Sin terminar') return '⏸️ ' + hoy.entreno + ' sin terminar: ' + hoy.hechos + ' de ' + hoy.total + ' ejercicios' +
        (hoy.ultima ? ' · última serie a las ' + hoy.ultima : '');
      return 'Hoy toca ' + hoy.entreno + ' · ' + (mio ? 'no has entrado' : 'no ha entrado');
    }
    if (hoy.resultado === 'Puede recuperarlo hoy') return '😴 Hoy es descanso · ayer ' + (mio ? 'no completaste' : 'no completó') + ' el ' + hoy.entreno + ' (' + hoy.hechos + ' de ' + hoy.total + ')';
    return '😴 Hoy es día de descanso';
  }

  // Plegada (él, 2026-11-08: "días de gym tiene que ser un desplegable"): el título con cuántos van esta semana y
  // cómo va hoy; al tocar, los días con sus likes y comentarios. Se recuerda abierta por persona mientras se mira.
  var diasAbiertos = {};
  function tarjetaDias(cont, datos) {
    var abierto = !!diasAbiertos[datos.de];
    var tarjeta = h('div', { class: 'tarjeta dias-plegable' + (abierto ? ' abierto' : '') });
    var titular = textoHoy(datos);
    if (titular) {
      var hoy = datos.dias[0];
      var cara = hoy && hoy.fecha === datos.hoy ? Iconos.estado(hoy.resultado) : null;
      tarjeta.appendChild(h('p', { class: 'hoy-social con-icono' + (cara ? ' con-cara' : '') }, [cara, h('span', { texto: titular })]));
    }
    // Solo los de esta semana, de lunes a hoy: las faltas de antes están en el contador de arriba.
    var hoyISO = datos.hoy || Almacen.hoyISO();
    var p0 = hoyISO.split('-').map(Number);
    var lunes = Calendario.sumarDias(hoyISO, -((new Date(Date.UTC(p0[0], p0[1] - 1, p0[2])).getUTCDay() + 6) % 7));
    var semana = datos.dias.filter(function (d) { return d.fecha >= lunes; });
    var hechos = semana.filter(function (d) { return d.resultado === 'Hecho' || d.resultado === 'Recuperado'; }).length;
    var comentarios = (datos.reacciones || []).filter(function (r) { return /^dia:/.test(r.sobre) && semana.some(function (d) { return r.sobre === 'dia:' + d.fecha; }); }).length;
    tarjeta.insertBefore(h('button', { type: 'button', class: 'dias-cabecera', 'aria-expanded': abierto ? 'true' : 'false', onclick: function () {
      diasAbiertos[datos.de] = !abierto;
      repintar();
    } }, [
      h('h3', { texto: 'Días de gym · esta semana' }),
      h('span', { class: 'dias-resumen' }, [
        semana.length ? hechos + ' de ' + semana.length : '',
        comentarios ? h('span', { class: 'dias-comentarios' }, [Iconos.comentario(), String(comentarios)]) : null,
        h('span', { class: 'dias-flecha', 'aria-hidden': 'true', texto: abierto ? '▴' : '▾' }),
      ]),
    ]), tarjeta.firstChild);
    if (!abierto) {
      cont.appendChild(tarjeta);
      return;
    }
    if (!semana.length) {
      tarjeta.appendChild(h('p', { class: 'detalle', texto: 'Esta semana todavía no hay días de gym.' }));
    }
    semana.forEach(function (d) {
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
    cont.appendChild(tarjeta);
  }

  // Pasos de hoy (anillo) y kcal de la semana. Los tuyos, con los de este móvil, que están más al día que lo subido.
  function tarjetaPasos(cont, datos) {
    var mio = datos.de === yo();
    var lista = mio ? Almacen.pasos() : (datos.pasos || []);
    if (!lista.length) {
      cont.appendChild(h('div', { class: 'tarjeta' }, [
        h('h3', { class: 'con-icono' }, [Iconos.pasos(), 'Pasos']),
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
        h('p', { class: 'detalle', texto: mio ? 'Pon tus datos en Ajustes para que salga aquí.'
          : datos.nombre + ' todavía no ha puesto sus datos de fuerza.' }),
      ]));
      return;
    }
    if (mio && !grupoElegido()) Estado.compartir(r);
    var fotos = datos.estados || [];
    var anterior = fotos.length ? fotos[fotos.length - 1] : null;
    var tarjeta = Estado.resumen(cont, r, null, anterior, !mio, true);
    if (!mio && datos.estado && datos.estado.guardado) {
      tarjeta.masInfo.appendChild(h('p', { class: 'detalle', texto: 'Actualizado el ' + fechaCorta(datos.estado.guardado) }));
    }
    Estado.musculos(tarjeta.masInfo, r);
    tarjeta.appendChild(reacciones(datos, 'estado:' + datos.hoy.slice(0, 7)));
  }

  // Las rutas que ha compartido (correr, andar, bici): las 5 últimas, con su trazo; al tocar, en el mapa.
  function tarjetaRutas(cont, datos) {
    var rutas = (datos.rutas || []).slice(0, 5);
    if (!rutas.length || typeof Ruta === 'undefined') return;
    var tarjeta = h('div', { class: 'tarjeta rutas-social' }, [h('h3', { texto: 'Rutas' })]);
    rutas.forEach(function (r) {
      tarjeta.appendChild(h('div', { class: 'ruta-social' }, [
        h('button', { type: 'button', class: 'ruta-social-fila', onclick: function () { Ruta.abrirEnGrande(r); } }, [
          Ruta.miniatura(r),
          h('div', { class: 'miembro-texto' }, [
            h('strong', { texto: r.ejercicio + ' · ' + fechaCorta(r.fecha) }),
            h('span', { class: 'detalle', texto: Ruta.texto(r) }),
          ]),
        ]),
        reacciones(datos, 'ruta:' + r.id),
      ]));
    });
    cont.appendChild(tarjeta);
  }

  // Sus récords del mes (los tuyos, recién calculados). Los de otros meses, con el selector.
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var mesElegido = {};
  var recordsAbiertos = {};
  function mejorRecord(lista) {
    return lista.slice().sort(function (a, b) { return (b.nivel || 0) - (a.nivel || 0) || (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0); })[0];
  }
  function tarjetaRecordsMes(cont, datos) {
    var mio = datos.de === yo();
    var abiertoRec = !!recordsAbiertos[datos.de];
    var meses = mio ? Tarjeta.recordsPorMes() : datos.recordsMes || [];
    var actual = Almacen.hoyISO().slice(0, 7);
    var elegido = mesElegido[datos.de] || actual;
    var delMes = meses.filter(function (m) { return m.mes === elegido; })[0];
    function nombreMes(m) { return MESES[Number(m.slice(5, 7)) - 1] + (m.slice(0, 4) !== actual.slice(0, 4) ? ' ' + m.slice(0, 4) : ''); }
    var opciones = [actual].concat(meses.map(function (m) { return m.mes; }).filter(function (m) { return m !== actual; }));
    var tarjeta = h('div', { class: 'tarjeta records-mes' }, [
      h('div', { class: 'ejercicio-cabecera' }, [
        h('h3', { class: 'con-icono' }, [Iconos.trofeo(), 'Récords de ' + nombreMes(elegido)]),
        opciones.length > 1 ? h('select', { 'aria-label': 'Mes', onchange: function (e) { mesElegido[datos.de] = e.target.value; repintar(); } },
          opciones.map(function (m) { return h('option', { value: m, selected: m === elegido ? true : null, texto: nombreMes(m) }); })) : null,
      ]),
      // Plegada (él, 2026-11-09): solo el mejor (el de más nivel de fuerza; a igualdad, el más reciente); al tocar, todos.
      delMes && delMes.lista.length ? h('div', { class: 'records-lista' }, (abiertoRec ? delMes.lista : [mejorRecord(delMes.lista)]).map(function (x) {
        return h('div', { class: 'records-fila' }, [
          h('span', { class: 'records-ejercicio', texto: x.ejercicio }),
          h('strong', { style: x.color ? 'color:' + x.color : '', texto: x.texto }),
          h('span', { class: 'detalle', texto: fechaCorta(x.fecha) }),
        ]);
      }).concat(delMes.lista.length > 1 ? [h('button', { type: 'button', class: 'records-mas', 'aria-expanded': abiertoRec ? 'true' : 'false', onclick: function () {
        recordsAbiertos[datos.de] = !abiertoRec;
        repintar();
      } }, [abiertoRec ? 'Ver solo el mejor ▴' : 'Ver los ' + delMes.lista.length + ' récords ▾'])] : [])) : h('p', { class: 'detalle', texto: elegido === actual ? (mio ? 'Este mes todavía no has batido ningún récord.' : 'Este mes todavía no ha batido ningún récord.') : 'Ningún récord ese mes.' }),
    ]);
    if (delMes && delMes.lista.length) tarjeta.appendChild(reacciones(datos, 'records:' + elegido));
    cont.appendChild(tarjeta);
  }

  // Su equilibrio (salud y fuerza), como el de Inicio. Sin pesaje no se puede calcular.
  function tarjetaEquilibrio(cont, datos) {
    var mio = datos.de === yo();
    // Lo tuyo, recién calculado (en GymCrush no viene en lo que da la API).
    var e = mio ? Tarjeta.calcular().equilibrio : datos.equilibrio;
    var t = App.pintarEquilibrio(cont, e, e ? e.salud : null, e ? e.fuerzaTotal : null,
      e ? '' : mio ? 'Pésate en la báscula para tenerlo' : datos.nombre + ' todavía no se ha pesado');
    if (e && !mio) t.appendChild(reacciones(datos, 'equilibrio:' + datos.hoy.slice(0, 7)));
  }

  function tarjetaCiclo(cont, datos) {
    var p = datos.progreso || { ejercicios: [], filas: [] };
    var ciclos = [];
    p.filas.forEach(function (f) { if (ciclos.indexOf(f.ciclo) < 0) ciclos.push(f.ciclo); });
    if (!ciclos.length) return;
    var elegido = cicloElegido[datos.de];
    var ciclo = elegido && ciclos.indexOf(elegido) >= 0 ? elegido : ciclos[ciclos.length - 1];
    // Solo el selector de ciclo y la gráfica (él, 2026-10-06): sin título, explicación, comentarios ni buscador.
    cont.appendChild(h('select', { class: 'selector-ciclo-social', 'aria-label': 'Ciclo', onchange: function (e) {
      cicloElegido[datos.de] = e.target.value;
      repintar();
    } }, ciclos.map(function (c) { return h('option', { value: c, selected: c === ciclo, texto: c }); })));
    App.graficasCiclo(cont, p, ciclo, 'social-' + datos.de, true);
  }

  // ---- Pantalla ----

  // Los grupos: el de siempre (con Excel) y los de Firestore; tocar el elegido abre su ficha (invitar, salir…).
  function nuevoGrupo() {
    Juntos.crear('gym', function (g) { elegirGrupo(g._id); App.mostrar('social'); });
  }
  function barraGrupos(cont) {
    var grupos = typeof Equipos !== 'undefined' ? Equipos.deGym() : [];
    var elegido = grupoElegido();
    if (!grupos.length && !Almacen.conExcel()) return;
    var botones = [];
    if (Almacen.conExcel()) {
      botones.push(h('button', { type: 'button', class: !elegido ? 'actual' : '', texto: 'GymCrush', onclick: function () {
        if (!elegido) return;
        elegirGrupo(null);
        App.mostrar('social');
      } }));
    }
    grupos.forEach(function (gr) {
      botones.push(h('button', { type: 'button', class: elegido === gr._id ? 'actual' : '', texto: gr.nombre + (elegido === gr._id ? ' ⋯' : ''), onclick: function () {
        if (elegido === gr._id) return Juntos.abrir(gr);
        elegirGrupo(gr._id);
        App.mostrar('social');
      } }));
    });
    botones.push(h('button', { type: 'button', class: 'discreto', texto: '+ Grupo', onclick: function () {
      App.abrirSelector('Otro grupo', [
        h('button', { type: 'button', class: 'principal', texto: 'Crear un grupo', onclick: nuevoGrupo }),
        h('button', { type: 'button', class: 'principal', texto: 'Tengo un enlace de invitación', onclick: Juntos.pegarInvitacion }),
      ]);
    } }));
    cont.appendChild(h('div', { class: 'social-grupos' }, botones));
  }

  // ---- Un grupo (él, 2026-11-08): la página del grupo tiene la lista de sus miembros, cada uno con su nombre y su
  // minititulo (hasta tres cosas que elige él: récords, fuerza, equilibrio), y las faltas del grupo (el marcador de
  // todos, sus listas y los justificantes por contestar: las ve y las contesta cualquiera del grupo). Al tocar a
  // alguien, lo que comparte. Atrás vuelve a la página del grupo. ----

  function foto(uid, grande) {
    var p = grupoElegido() ? Equipos.perfil(uid) || {} : { foto: Almacen.foto(uid) };
    return p.foto ? h('span', { class: 'miembro-foto' + (grande ? ' grande' : ''), style: 'background-image:url("' + p.foto + '")' })
      : h('span', { class: 'miembro-foto sin-foto' + (grande ? ' grande' : '') }, [Iconos.perfil()]);
  }

  function minititulo(datos) {
    var lista = (datos && datos.titulo) || [];
    if (datos && datos.de === yo()) lista = Tarjeta.titulo();
    else if (datos && !datos.titulo) {
      // De los Excel (GymCrush): la fuerza de su estado; el equilibrio y los récords, cuando tenga la app nueva.
      var r = datos.estado;
      var n = r && r.total > 0 ? Fuerza.nivel(r.total) : null;
      lista = [
        { tipo: 'fuerza', texto: n ? 'Fuerza ' + String(Math.round(r.total * 10) / 10).replace('.', ',') + ' · ' + n.nombre : 'Fuerza —', color: n ? n.color : '' },
        { tipo: 'equilibrio', texto: 'Equilibrio —', color: '' },
      ];
    }
    if (!lista.length) return null;
    return h('div', { class: 'minititulo' }, lista.map(function (t) {
      return h('span', { class: 'minititulo-dato' + (t.tipo === 'record' ? ' record' : ''), style: t.color ? 'color:' + t.color : '' },
        [t.tipo === 'record' ? Iconos.trofeo() : null, t.texto]);
    }));
  }

  // Cómo va hoy, en una línea (solo si comparte sus días).
  function hoyCorto(datos) {
    var d = (datos.dias || [])[0];
    if (!d || d.fecha !== Almacen.hoyISO()) return '';
    var c = CHIPS[d.resultado];
    return c ? (datos.de === yo() && d.resultado === 'Toca hoy' ? 'No has entrado' : c[1]) + ' · ' + d.entreno : '';
  }

  function pintarGrupo(cont, entrando, noCargo) {
    var g = grupoElegido();
    var f = fuente.faltas();
    if (entrando || (!sinActualizar && viejo(f))) pedirDatos(viendo);
    if (!f) {
      cont.appendChild(sinActualizar && !(g ? pedido['g' + g] : pedido.faltas) ? noCargo() : h('div', { class: 'tarjeta' }, [h('p', { texto: 'Cargando…' })]));
      return;
    }
    // En GymCrush lo de cada uno se pide aparte (la API de los Excel): el de todos para sus tarjetas.
    if (!g) Object.keys(f.personas).forEach(function (u) { if (entrando || viejo(fuente.social(u))) pedirDatos(u); });
    if (viendo && !f.personas[viendo]) viendo = null;
    cont.appendChild(h('p', { class: 'detalle social-linea', 'aria-live': 'polite' }));
    pintarLinea();

    if (verFaltas) return pintarFaltasGrupo(cont, f);
    if (!viendo) {
      var personas = Object.keys(f.personas).sort(function (a, b) { return a === yo() ? 1 : b === yo() ? -1 : 0; });
      // Arriba de todo, las faltas del grupo (él, 2026-11-08): con lo que haya por contestar a la vista.
      var anio = Almacen.hoyISO().slice(0, 4);
      var totalFaltas = personas.reduce(function (n, u) {
        return n + (f.personas[u].privado ? 0 : f.personas[u].dias.filter(function (d) { return d.fecha.slice(0, 4) === anio && CUENTAN.indexOf(d.resultado) >= 0; }).length);
      }, 0);
      var porContestar = porRevisar().length;
      cont.appendChild(h('button', { type: 'button', class: 'tarjeta boton-faltas', onclick: function () {
        verFaltas = true;
        faltasAbiertas = null;
        entrarEn();
      } }, [
        h('strong', { texto: 'Faltas ' + anio }),
        h('span', { class: 'boton-faltas-resumen' }, [
          porContestar ? h('span', { class: 'chip resultado espera', texto: porContestar + ' por contestar' }) : null,
          h('span', { texto: totalFaltas === 1 ? '1 falta' : totalFaltas + ' faltas' }),
          h('span', { class: 'miembro-flecha', 'aria-hidden': 'true', texto: '›' }),
        ]),
      ]));
      cont.appendChild(h('div', { class: 'miembros' }, personas.map(function (u) {
        var datos = fuente.social(u) || {};
        var hoy = (datos.oculto || []).indexOf('dias') < 0 ? hoyCorto(datos) : '';
        return h('button', { type: 'button', class: 'tarjeta miembro', onclick: function () {
          viendo = u;
          entrarEn();
        } }, [
          foto(u),
          h('div', { class: 'miembro-texto' }, [
            h('strong', { class: 'miembro-nombre', texto: u === yo() ? 'Tú' : f.personas[u].nombre }),
            minititulo(datos),
            hoy ? h('span', { class: 'detalle miembro-hoy', texto: hoy }) : null,
          ]),
          h('span', { class: 'miembro-flecha', 'aria-hidden': 'true', texto: '›' }),
        ]);
      })));
      return;
    }

    // La ficha de una persona: lo que comparte.
    var datos = fuente.social(viendo);
    var grupo = g ? Equipos.porId(g) || {} : { nombre: 'GymCrush' };
    cont.appendChild(h('button', { type: 'button', class: 'volver-grupo', onclick: function () { viendo = null; volverAlGrupo(); } }, ['‹ ' + (grupo.nombre || 'Grupo')]));
    cont.appendChild(h('div', { class: 'tarjeta perfil-social' }, [
      foto(viendo, true),
      h('div', { class: 'miembro-texto' }, [
        h('strong', { class: 'miembro-nombre', texto: viendo === yo() ? 'Tú' : f.personas[viendo].nombre }),
        minititulo(datos),
      ]),
    ]));
    if (!datos) {
      cont.appendChild(h('div', { class: 'tarjeta' }, [h('p', { texto: 'Cargando…' })]));
      return;
    }
    if (viendo === yo()) marcarVisto();
    var oculto = viendo === yo() ? [] : datos.oculto || [];
    // De los Excel, si su móvil aún no ha subido el resumen (app vieja), del otro solo hay días, pasos, fuerza y ciclo.
    if (!g && viendo !== yo() && !datos.recordsMes) oculto = oculto.concat(['recordsMes', 'equilibrio']);
    var ve = function (k) { return oculto.indexOf(k) < 0; };
    if (ve('dias')) tarjetaDias(cont, datos);
    tarjetaRutas(cont, datos);
    if (ve('pasos')) tarjetaPasos(cont, datos);
    if (ve('recordsMes')) tarjetaRecordsMes(cont, datos);
    if (ve('equilibrio')) tarjetaEquilibrio(cont, datos);
    if (ve('estado')) tarjetaEstado(cont, datos);
    if (ve('progreso')) tarjetaCiclo(cont, datos);
    if (oculto.length >= Tarjeta.PARTES.length) cont.appendChild(h('p', { class: 'vacio', texto: datos.nombre + ' tiene su perfil en privado.' }));
  }

  var verFaltas = false;

  function pintarFaltasGrupo(cont, f) {
    var grupo = grupoElegido() ? Equipos.porId(grupoElegido()) || {} : { nombre: 'GymCrush' };
    var anio = Almacen.hoyISO().slice(0, 4);
    cont.appendChild(h('button', { type: 'button', class: 'volver-grupo', onclick: function () { verFaltas = false; faltasAbiertas = null; volverAlGrupo(); } },
      ['‹ ' + (grupo.nombre || 'Grupo')]));
    cont.appendChild(h('h2', { class: 'faltas-grupo-titulo', texto: 'Faltas ' + anio }));
    var personas = Object.keys(f.personas).sort(function (a, b) { return a === yo() ? 1 : b === yo() ? -1 : 0; });
    personas.forEach(function (u) {
      var persona = f.personas[u];
      var dias = persona.dias.filter(function (d) { return d.fecha.slice(0, 4) === anio; });
      var faltas = dias.filter(function (d) { return CUENTAN.indexOf(d.resultado) >= 0; }).length;
      var justificadas = dias.filter(function (d) { return d.resultado === 'Justificada'; }).length;
      var pendientes = u === yo() ? 0 : dias.filter(function (d) { return d.resultado === 'Pendiente'; }).length;
      var abierto = faltasAbiertas === u;
      var resumen = persona.privado ? 'No comparte sus días'
        : (faltas === 1 ? '1 falta' : faltas + ' faltas') + (justificadas ? ' · ' + justificadas + (justificadas === 1 ? ' justificada' : ' justificadas') : '');
      var caja = h('div', { class: 'tarjeta faltas-persona' + (abierto ? ' abierto' : '') }, [
        h('button', { type: 'button', class: 'miembro faltas-persona-cabecera', 'aria-expanded': abierto ? 'true' : 'false', disabled: persona.privado ? true : null, onclick: function () {
          faltasAbiertas = abierto ? null : u;
          justificando = null;
          repintar();
        } }, [
          foto(u),
          h('div', { class: 'miembro-texto' }, [
            h('strong', { class: 'miembro-nombre', texto: u === yo() ? 'Tú' : persona.nombre }),
            h('span', { class: 'detalle miembro-hoy', texto: resumen }),
            pendientes ? h('span', { class: 'chip resultado espera', texto: pendientes + ' por contestar' }) : null,
          ]),
          h('strong', { class: 'faltas-persona-numero' + (faltas ? ' con-faltas' : ''), texto: persona.privado ? '—' : String(faltas) }),
        ]),
      ]);
      if (abierto) {
        var lista = dias.filter(function (d) { return CUENTAN.indexOf(d.resultado) >= 0 || d.resultado === 'Justificada'; }).reverse();
        caja.appendChild(lista.length
          ? h('ul', { class: 'lista-faltas' }, lista.map(function (d) { return u === yo() ? filaFaltaPropia(d) : filaFaltaAjena(u, d); }))
          : h('p', { class: 'detalle', texto: 'Ninguna falta este año.' }));
      }
      cont.appendChild(caja);
    });
  }

  // El botón atrás del móvil dentro de un grupo: de la ficha de alguien a la página del grupo.
  function atras() {
    if (verFaltas) {
      verFaltas = false;
      faltasAbiertas = null;
      volverAlGrupo();
      return true;
    }
    if (viendo) {
      viendo = null;
      volverAlGrupo();
      return true;
    }
    return false;
  }

  App.vistas.social = function (cont) {
    if (!Almacen.config()) {
      cont.appendChild(h('p', { class: 'vacio', texto: 'Configura la app en Ajustes.' }));
      return;
    }
    // Arriba, los grupos: el de los Excel (los dos de siempre) y los de Firestore, y crear o unirse a otro.
    barraGrupos(cont);
    var g = grupoElegido();
    if (!g && !Almacen.conExcel()) {
      // Solo los botones (él, 2026-11-08: fuera el título y la explicación).
      cont.appendChild(h('div', { class: 'tarjeta social-pronto' }, [
        h('button', { type: 'button', class: 'principal', texto: 'Crear un grupo', onclick: nuevoGrupo }),
        h('button', { type: 'button', class: 'principal', texto: 'Tengo un enlace de invitación', onclick: Juntos.pegarInvitacion }),
      ]));
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
    pintarGrupo(cont, entrando, noCargo);
    actualizarPunto();
  };

  setTimeout(comprobar, 1500);

  return { actualizarPunto: actualizarPunto, atras: atras };
})();
