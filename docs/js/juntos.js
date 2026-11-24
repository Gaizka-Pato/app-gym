// Pantallas de los grupos y del hogar (Equipos hace el trabajo): crear, invitar, unirse con el enlace, ver quién está,
// echar y salir. El enlace de invitación es …/#unirse=<código>; en Android se abre en el navegador, que ofrece pasarlo a
// la app (ares://unirse?c=<código>, APK 2.2).
var Juntos = (function () {
  function h(etiqueta, atributos, hijos) {
    var n = document.createElement(etiqueta);
    Object.keys(atributos || {}).forEach(function (k) {
      if (k === 'texto') n.textContent = atributos[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), atributos[k]);
      else if (atributos[k] != null && atributos[k] !== false) n.setAttribute(k, atributos[k] === true ? '' : atributos[k]);
    });
    (hijos || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function fallo(e) {
    App.avisar(navigator.onLine ? (e && e.message) || 'No se pudo' : 'Hace falta conexión', true);
  }

  function esperando(boton, texto) {
    boton.disabled = true;
    boton.textContent = texto;
  }

  var PALABRAS = {
    hogar: { el: 'el hogar', tu: 'tu hogar', un: 'un hogar', que: 'La despensa, la lista de la compra y los platos, compartidos con los que viven contigo. Lo que comes sigue siendo solo tuyo.' },
    gym: { el: 'el grupo', tu: 'tu grupo', un: 'un grupo', que: 'Os veis los días de gym, la fuerza, el progreso del ciclo, los pasos y las calorías, con likes y comentarios.' },
  };

  // ---- Crear ----

  function crear(tipo, alCrear) {
    var p = PALABRAS[tipo];
    var nombre = h('input', { value: tipo === 'hogar' ? 'Casa' : '', placeholder: tipo === 'hogar' ? 'Casa' : 'Los del gym', maxlength: '40', 'aria-label': 'Nombre' });
    var boton = h('button', { type: 'button', class: 'principal', texto: 'Crear', onclick: function () {
      var n = nombre.value.trim() || nombre.placeholder;
      esperando(boton, 'Creando…');
      Equipos.crear(tipo, n).then(function (g) {
        if (tipo === 'hogar') Almacen.alEntrarEnHogar(g._id, true).catch(function () {});
        App.cerrarSelector();
        App.avisar(n + ' creado. Ahora invita a los demás');
        (alCrear || function () { App.repintar(); })(g);
      }).catch(function (e) { boton.disabled = false; boton.textContent = 'Crear'; fallo(e); });
    } });
    App.abrirSelector('Crear ' + p.un, [
      h('p', { class: 'detalle', texto: p.que }),
      h('label', { class: 'campo' }, [h('span', { texto: 'Nombre' }), nombre]),
      boton,
    ]);
  }

  // ---- Invitar ----

  function invitar(g) {
    Equipos.invitar(g._id).then(function (url) {
      var texto = 'Únete a ' + (g.tipo === 'hogar' ? 'nuestra casa' : 'mi grupo') + ' «' + g.nombre + '» en Ares:';
      if (navigator.share) {
        return navigator.share({ title: 'Ares', text: texto, url: url }).catch(function (e) {
          if (e && e.name !== 'AbortError') mostrarEnlace(g, url, texto);
        });
      }
      mostrarEnlace(g, url, texto);
    }).catch(fallo);
  }

  function mostrarEnlace(g, url, texto) {
    var campo = h('input', { value: url, readonly: true, 'aria-label': 'Enlace de invitación' });
    function copiar(valor, hecho) {
      campo.select();
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(valor).then(hecho, function () { document.execCommand('copy'); hecho(); });
      else { document.execCommand('copy'); hecho(); }
    }
    App.abrirSelector('Invitar a ' + g.nombre, [
      h('p', { class: 'detalle', texto: 'Mándale este enlace por WhatsApp. Vale 7 días y para varias personas.' }),
      campo,
      h('a', { class: 'boton principal', href: 'https://wa.me/?text=' + encodeURIComponent(texto + ' ' + url), target: '_blank', rel: 'noopener', texto: 'Mandar por WhatsApp' }),
      h('button', { type: 'button', class: 'discreto', texto: 'Copiar enlace', onclick: function () {
        copiar(url, function () { App.avisar('Enlace copiado'); });
      } }),
    ]);
  }

  // ---- Ver un grupo o el hogar ----

  function fichaMiembro(g, uid) {
    var p = Equipos.perfil(uid) || {};
    var yo = uid === Nube.uid();
    var foto = p.foto ? h('span', { class: 'juntos-foto', style: 'background-image:url("' + p.foto + '")' })
      : h('span', { class: 'juntos-foto sin-foto' }, [Iconos.perfil()]);
    return h('div', { class: 'juntos-miembro' }, [
      foto,
      h('span', { class: 'juntos-nombre', texto: yo ? (p.nombre || 'Tú') + ' (tú)' : p.nombre || 'Alguien' }),
      g.dueno === uid ? h('span', { class: 'tipo', texto: 'creador' }) : null,
      Equipos.soyDueno(g) && !yo ? h('button', { type: 'button', class: 'discreto', texto: 'Echar', onclick: function (ev) {
        var b = ev.currentTarget;
        if (b.dataset.seguro !== 'sí') { b.dataset.seguro = 'sí'; b.textContent = '¿Seguro?'; return; }
        Equipos.quitar(g._id, uid).then(function () { abrir(Equipos.porId(g._id)); App.repintar(); }).catch(fallo);
      } }) : null,
    ]);
  }

  function abrir(g) {
    if (!g) { App.cerrarSelector(); return; }
    var p = PALABRAS[g.tipo];
    App.abrirSelector(g.nombre, [
      h('div', { class: 'juntos-miembros' }, (g.miembros || []).map(function (u) { return fichaMiembro(g, u); })),
      h('button', { type: 'button', class: 'principal', texto: 'Invitar', onclick: function () { invitar(g); } }),
      Equipos.soyDueno(g) ? h('button', { type: 'button', class: 'discreto', texto: 'Cambiar el nombre', onclick: function () { renombrar(g); } }) : null,
      h('button', { type: 'button', class: 'discreto comida-quitar', texto: 'Salir de ' + p.el, onclick: function (ev) {
        var b = ev.currentTarget;
        if (b.dataset.seguro !== 'sí') { b.dataset.seguro = 'sí'; b.textContent = '¿Seguro? Toca otra vez para salir'; return; }
        Equipos.salir(g._id).then(function () {
          App.cerrarSelector();
          App.avisar('Has salido de ' + g.nombre);
          App.repintar();
        }).catch(fallo);
      } }),
    ]);
  }

  function renombrar(g) {
    var nombre = h('input', { value: g.nombre, maxlength: '40', 'aria-label': 'Nombre' });
    App.abrirSelector('Cambiar el nombre', [
      nombre,
      h('button', { type: 'button', class: 'principal', texto: 'Guardar', onclick: function () {
        var n = nombre.value.trim();
        if (!n) return;
        Equipos.renombrar(g._id, n).then(function () { abrir(Equipos.porId(g._id)); App.repintar(); }).catch(fallo);
      } }),
    ]);
  }

  // El hogar: el tuyo, o crear uno / unirte con el enlace que te hayan mandado.
  function hogar() {
    var g = Equipos.hogar();
    if (g) return abrir(g);
    var enlace = h('input', { type: 'url', placeholder: 'Pega aquí el enlace de invitación', autocomplete: 'off', 'aria-label': 'Enlace de invitación' });
    App.abrirSelector('Compartir la casa', [
      h('p', { class: 'detalle', texto: PALABRAS.hogar.que }),
      h('button', { type: 'button', class: 'principal', texto: 'Crear el hogar', onclick: function () { crear('hogar'); } }),
      h('p', { class: 'ajustes-sub', texto: '¿Te han invitado?' }),
      h('div', { class: 'otro' }, [enlace, h('button', { type: 'button', class: 'principal', texto: 'Unirme', onclick: function () { recibir(enlace.value); } })]),
    ]);
  }

  function pegarInvitacion() {
    var enlace = h('input', { type: 'url', placeholder: 'Pega aquí el enlace de invitación', autocomplete: 'off', 'aria-label': 'Enlace de invitación' });
    App.abrirSelector('Unirme con un enlace', [
      h('p', { class: 'detalle', texto: 'Mantén pulsado el enlace que te han mandado, cópialo y pégalo aquí.' }),
      enlace,
      h('button', { type: 'button', class: 'principal', texto: 'Ver invitación', onclick: function () { recibir(enlace.value); } }),
    ]);
  }

  // ---- Recibir una invitación (#unirse=<código> o el enlace pegado) ----

  function codigoDe(texto) {
    var m = String(texto || '').match(/unirse[=?](?:c=)?([a-z0-9]{6,40})/i) || String(texto || '').match(/^\s*([a-z0-9]{12})\s*$/i);
    return m ? m[1] : null;
  }

  var PENDIENTE = 'gymapp.invitacion';

  function recibir(texto) {
    var codigo = codigoDe(texto);
    if (!codigo) return App.avisar('Ese no es un enlace de invitación de Ares', true);
    // Sin la app configurada todavía: se guarda y se enseña al acabar la bienvenida.
    if (!Almacen.config()) {
      try { localStorage.setItem(PENDIENTE, codigo); } catch (e) { /* sin almacenamiento */ }
      App.avisar('Primero cuéntanos quién eres; luego te unes');
      return App.mostrar('ajustes');
    }
    // En el navegador de un Android con la app instalada: mejor dentro de la app (es donde están tus datos).
    var enNavegadorAndroid = !window.AndroidPasos && /Android/i.test(navigator.userAgent);
    App.abrirSelector('Invitación', [h('p', { class: 'detalle', texto: 'Buscando la invitación…' })]);
    Equipos.verInvitacion(codigo).then(function (inv) {
      var p = PALABRAS[inv.tipo] || PALABRAS.gym;
      var ya = Equipos.porId(inv.grupo);
      var boton = h('button', { type: 'button', class: 'principal', texto: ya ? 'Ver' : 'Unirme', onclick: function () {
        if (ya) return abrir(ya);
        esperando(boton, 'Uniéndote…');
        Equipos.unirse(codigo).then(function (g) {
          if (g && g.tipo === 'hogar') return Almacen.alEntrarEnHogar(g._id, false).catch(function () {}).then(function () { return g; });
          return g;
        }).then(function (g) {
          App.cerrarSelector();
          App.avisar('Ya estás en ' + inv.nombre);
          App.mostrar(g && g.tipo === 'hogar' ? 'comida' : 'social');
        }).catch(function (e) { boton.disabled = false; boton.textContent = 'Unirme'; fallo(e); });
      } });
      App.abrirSelector(inv.tipo === 'hogar' ? 'Te invitan a una casa' : 'Te invitan a un grupo', [
        h('h3', { class: 'juntos-invitacion', texto: inv.nombre }),
        h('p', { class: 'detalle', texto: (inv.deNombre ? inv.deNombre + ' te invita. ' : '') + p.que }),
        enNavegadorAndroid ? h('a', { class: 'boton principal', texto: 'Abrir en la app Ares',
          href: 'intent://unirse?c=' + codigo + '#Intent;scheme=ares;package=app.gymapp;end' }) : null,
        enNavegadorAndroid ? h('p', { class: 'detalle', texto: '¿Sin la app? Únete aquí:' }) : null,
        boton,
      ]);
    }).catch(function (e) { App.cerrarSelector(); fallo(e); });
  }

  function desdeEnlace() {
    var codigo = codigoDe(location.hash);
    if (!codigo || !/unirse/.test(location.hash)) return;
    history.replaceState(null, '', location.pathname);
    setTimeout(function () { recibir('unirse=' + codigo); }, 400);
  }
  window.addEventListener('hashchange', desdeEnlace);
  window.addEventListener('load', function () { setTimeout(desdeEnlace, 0); });

  // Tras la bienvenida, la invitación que esperaba.
  function invitacionPendiente() {
    var codigo = null;
    try { codigo = localStorage.getItem(PENDIENTE); localStorage.removeItem(PENDIENTE); } catch (e) { /* nada */ }
    if (codigo) setTimeout(function () { recibir('unirse=' + codigo); }, 600);
  }

  // Dónde está cada cosa (para cualquiera que se la descargue) y borrar la cuenta de grupos.
  function privacidad() {
    var conCuenta = !!Nube.uid();
    // Por apartados, como una política de privacidad corta (él, 2026-11-08: "más profesional").
    function apartado(titulo, texto) {
      return h('section', { class: 'privacidad-apartado' }, [h('h4', { texto: titulo }), h('p', { texto: texto })]);
    }
    App.abrirSelector('Tus datos y tu privacidad', [
      h('p', { class: 'privacidad-intro', texto: 'Ares guarda tus datos en tu dispositivo. Solo se comparte lo que tú decides compartir, y solo con quien tú invitas.' }),
      apartado('En tu dispositivo', 'Entrenamientos, series, rutinas, comidas, peso, composición corporal, pasos y descanso. No salen de tu móvil salvo que tú los compartas.'),
      apartado('En tus grupos', 'Los miembros ven tu nombre, tu foto y un resumen de tu actividad: días de entrenamiento y faltas, nivel de fuerza, progreso del ciclo, pasos y calorías. No ven tus series ni lo que comes.'),
      apartado('En tu hogar', 'Los miembros comparten la despensa, la lista de la compra, los productos y los platos. Tu registro de comidas sigue siendo privado.'),
      apartado('Dónde se guarda', 'Lo compartido se almacena en Google Firebase, en servidores de la Unión Europea (Madrid). El acceso está restringido a los miembros de cada grupo u hogar.' +
        (Almacen.conExcel() ? ' Tu copia de seguridad se guarda en tu hoja de Google.' : '')),
      apartado('Servicios externos', 'Al escanear un producto, se consulta su código de barras en Open Food Facts para obtener su información nutricional. No se envía ningún dato personal.'),
      apartado('Tu control', 'Puedes salir de un grupo o de tu hogar cuando quieras. Al borrar tu cuenta se eliminan tu perfil, tus comentarios y tu resumen de todos los grupos; los datos de tu móvil se conservan.'),
      conCuenta ? h('button', { type: 'button', class: 'discreto comida-quitar', texto: 'Borrar mi cuenta', onclick: function (ev) {
        var b = ev.currentTarget;
        if (b.dataset.seguro !== 'sí') { b.dataset.seguro = 'sí'; b.textContent = '¿Seguro? Saldrás de todos tus grupos y de tu hogar'; return; }
        esperando(b, 'Borrando…');
        Equipos.borrarCuenta().then(function () {
          App.cerrarSelector();
          App.avisar('Cuenta borrada. Lo de tu móvil sigue aquí');
          App.repintar();
        }).catch(function (e) { b.disabled = false; b.textContent = 'Borrar mi cuenta'; fallo(e); });
      } }) : null,
    ]);
  }

  return {
    privacidad: privacidad,
    crear: crear,
    abrir: abrir,
    hogar: hogar,
    invitar: invitar,
    pegarInvitacion: pegarInvitacion,
    recibir: recibir,
    invitacionPendiente: invitacionPendiente,
  };
})();
