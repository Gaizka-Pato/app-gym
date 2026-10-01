// Iconos de la app (los eligió él el 2026-09-28): entrenar (el de la barra) y andar (la zapatilla). Son sus
// imágenes en blanco sobre negro, recortadas en web/iconos/, y se usan de plantilla: el CSS las pinta con el
// color de la app (.icono-entreno, .icono-pasos), así que cambian solas con el aspecto.
var Iconos = (function () {
  function crear(clase) {
    var s = document.createElement('span');
    s.className = 'icono ' + clase;
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  // Like y comentario de Social: dibujados como los suyos (un corazón y un bocadillo de contorno). Del color del texto;
  // el corazón se rellena cuando ya le has dado.
  var CORAZON = 'M12 20.3 4.6 13a4.9 4.9 0 0 1 0-6.9 4.8 4.8 0 0 1 6.8 0l.6.6.6-.6a4.8 4.8 0 0 1 6.8 0 4.9 4.9 0 0 1 0 6.9z';
  var BOCADILLO = 'M6.6 17.2A8 7.2 0 1 1 9.9 19l-5.4 1.6z';

  function dibujo(camino, lleno, clase) {
    var s = document.createElement('span');
    s.className = 'icono-trazo ' + clase;
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + camino + '" fill="' + (lleno ? 'currentColor' : 'none') +
      '" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>';
    return s;
  }

  // Perfil de usuario (el suyo: círculo, cabeza y hombros), donde va la foto mientras no hay una.
  function perfil() {
    var s = document.createElement('span');
    s.className = 'icono-trazo icono-perfil';
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3">' +
      '<circle cx="12" cy="12" r="10.3"/><circle cx="12" cy="9" r="3.6"/>' +
      '<path d="M5.6 19.6a7 6.2 0 0 1 12.8 0"/></svg>';
    return s;
  }

  // Trofeo de marca personal (como el suyo: copa con estrella y rayos). Del color de la app.
  function trofeo() {
    var s = document.createElement('span');
    s.className = 'icono-trazo icono-trofeo';
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<svg viewBox="0 0 24 24">' +
      '<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">' +
      '<path d="M12 1.2v2.2M5.3 3.2l1.4 1.6M18.7 3.2l-1.4 1.6M1.8 11h2M20.2 11h2M4.6 18l1.5-1.2M19.4 18l-1.5-1.2"/>' +
      '<path d="M7.2 6.6H4.9v1.2a3.4 3.4 0 0 0 3.3 3.4M16.8 6.6h2.3v1.2a3.4 3.4 0 0 1-3.3 3.4" stroke-width="1.5"/></g>' +
      '<path fill="currentColor" fill-rule="evenodd" d="M7 5.4h10v4.4a5 5 0 0 1-3.9 4.9v2.1h-2.2v-2.1A5 5 0 0 1 7 9.8z' +
      'M12 6.9l.56 1.53 1.63.06-1.29 1 .45 1.57L12 10.15l-1.35.91.45-1.57-1.29-1 1.63-.06z"/>' +
      '<rect x="9.2" y="17" width="5.6" height="1.6" rx=".4" fill="currentColor"/>' +
      '<rect x="7.8" y="19.2" width="8.4" height="2.2" rx=".6" fill="currentColor"/></svg>';
    return s;
  }

  // Más info (el suyo: la i dentro de un círculo).
  function info() {
    var s = document.createElement('span');
    s.className = 'icono-trazo icono-info';
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<circle cx="12" cy="7.4" r="1.45" fill="currentColor"/>' +
      '<path d="M10.2 10.2h2.6v6.3h1.1M10.2 16.5h3.7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return s;
  }

  // Los 🏆, 🏋️ (el peso: discos, peso máximo), ℹ️… de cualquier texto pasan a los iconos de la app: así no hay que tocar cada sitio que los usa.
  var EMOJIS = /🏆|🏋️?|ℹ️?|🏁|😴/;
  function cambiarEmojis(raiz) {
    if (!raiz || !raiz.nodeType) return;
    var nodos = [];
    if (raiz.nodeType === 3) nodos.push(raiz);
    else {
      var paseo = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
      while (paseo.nextNode()) if (EMOJIS.test(paseo.currentNode.nodeValue)) nodos.push(paseo.currentNode);
    }
    nodos.forEach(function (n) {
      if (!n.parentNode || !EMOJIS.test(n.nodeValue)) return;
      var trozos = n.nodeValue.split(/(🏆|🏋️?|ℹ️?|🏁|😴)\s?/);
      var padre = n.parentNode;
      trozos.forEach(function (t) {
        if (t === '🏆') padre.insertBefore(trofeo(), n);
        else if (t === '🏋️' || t === '🏋') padre.insertBefore(crear('icono-peso'), n);
        else if (t === 'ℹ️' || t === 'ℹ') padre.insertBefore(info(), n);
        else if (t === '🏁') padre.insertBefore(crear('icono-fin'), n);
        else if (t === '😴') padre.insertBefore(crear('icono-descanso'), n);
        else if (t) padre.insertBefore(document.createTextNode(t), n);
      });
      padre.removeChild(n);
    });
  }

  // Todo lo que se pinta en la página pasa por aquí.
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    new MutationObserver(function (cambios) {
      cambios.forEach(function (c) {
        if (c.type === 'characterData') cambiarEmojis(c.target);
        else c.addedNodes.forEach(cambiarEmojis);
      });
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  return {
    perfil: perfil,
    trofeo: trofeo,
    info: info,
    cambiarEmojis: cambiarEmojis,
    corazon: function (lleno) { return dibujo(CORAZON, lleno, 'icono-corazon'); },
    comentario: function () { return dibujo(BOCADILLO, false, 'icono-comentario'); },
    entreno: function () { return crear('icono-entreno'); },
    pasos: function () { return crear('icono-pasos'); },
    // Fin de entreno (el suyo: la mancuerna con el visto).
    fin: function () { return crear('icono-fin'); },
    // El peso (el suyo: la barra con los discos): discos por lado y peso máximo.
    peso: function () { return crear('icono-peso'); },
    // Recuperar un entreno que quedó a medias (el suyo: la mancuerna con las flechas).
    recuperar: function () { return crear('icono-recuperar'); },
    // Editar y borrar (los suyos), del color del texto del botón.
    editar: function () { return crear('icono-accion icono-editar'); },
    borrar: function () { return crear('icono-accion icono-borrar'); },
    // Compartir (el suyo: los tres círculos unidos).
    compartir: function () { return crear('icono-accion icono-compartir'); },
    // Nuevo ejercicio (el suyo: la mancuerna con el +).
    nuevoEjercicio: function () { return crear('icono-accion icono-nuevo-ejercicio'); },
    // Caras de Social para el día de hoy (sus dibujos): entrenando, no ha ido y terminado. Van del color del texto.
    estado: function (resultado) {
      if (resultado === 'Puede recuperarlo hoy') return crear('icono-accion icono-recuperar');
      var cual = { 'En curso': 'entrenando', 'Toca hoy': 'no-ido', 'Hecho': 'terminado', 'Terminado': 'terminado' }[resultado];
      return cual ? crear('icono-estado icono-estado-' + cual) : null;
    },
  };
})();
