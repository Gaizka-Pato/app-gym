// Aspecto de la app: oscuro (negro y naranja) o claro (blanco y verde), cada uno con su icono y el color de la
// barra de arriba del móvil. Se elige en Ajustes → "Aspecto" y se guarda en este móvil (no va al Excel).
// Se carga en el <head>, antes de pintar nada, para que al abrir no dé un fogonazo del color que no toca.
var Tema = (function () {
  var CLAVE = 'gymapp.tema';
  var TEMAS = {
    oscuro: { nombre: 'Oscuro', pista: 'Negro y naranja', barra: '#121110', icono: 'icono-192.png' },
    claro: { nombre: 'Claro', pista: 'Blanco y verde', barra: '#3f8f3c', icono: 'icono-claro-192.png' },
  };

  function actual() {
    var t = null;
    try { t = JSON.parse(localStorage.getItem(CLAVE)); } catch (e) { /* sin espacio o en privado */ }
    return TEMAS[t] ? t : 'oscuro';
  }

  function poner(t) {
    if (!TEMAS[t]) t = 'oscuro';
    try { localStorage.setItem(CLAVE, JSON.stringify(t)); } catch (e) { /* se queda solo para esta vez */ }
    aplicar();
  }

  function aplicar() {
    var t = actual();
    document.documentElement.setAttribute('data-tema', t);
    var poner2 = function (selector, atributo, valor) {
      var n = document.querySelector(selector);
      if (n) n.setAttribute(atributo, valor);
    };
    poner2('meta[name="theme-color"]', 'content', TEMAS[t].barra);
    poner2('link[rel="icon"]', 'href', TEMAS[t].icono);
    poner2('link[rel="apple-touch-icon"]', 'href', TEMAS[t].icono);
  }

  aplicar();

  return { TEMAS: TEMAS, actual: actual, poner: poner, aplicar: aplicar };
})();
