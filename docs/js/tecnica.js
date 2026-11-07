// Cómo se hace cada ejercicio: dos imágenes (inicio y final) con los músculos principales en naranja, que se
// funden de una a otra como una repetición. Salen en un círculo junto al nombre del ejercicio (al tocarlo se abre
// en grande creciendo desde ahí) y dentro de la ℹ️ con un ▶.
// Las imágenes están en tecnica/ y las genera herramientas/tecnica/exportar.py (dibujos de dominio público).
var Tecnica = (function () {
  // [nombre normalizado (expresión), imagen, músculos que trabaja]. Va en orden: lo más concreto primero.
  var TABLA = [
    [/press inclinado/, 'incline-bench-press', 'pecho y tríceps'],
    [/press banca|banca/, 'bench-press', 'pecho y tríceps'],
    [/converging/, 'chest-press-machine', 'pecho y tríceps'],
    [/press militar|pres militar/, 'overhead-press', 'hombro y tríceps'],
    [/elev(\.|aciones)? laterales|^laterales/, 'lateral-raises', 'hombro'],
    [/hombro post/, 'reverse-pec-deck', 'hombro posterior'],
    [/aperturas/, 'pec-deck', 'pecho'],
    [/sentadilla(?! bulgara)/, 'squat', 'cuádriceps y glúteo'],
    [/prensa/, 'leg-press', 'cuádriceps y glúteo'],
    [/extension de (cuadriceps|pierna)/, 'leg-extension', 'cuádriceps'],
    [/curl femoral|curl de pierna/, 'seated-leg-curl', 'femoral'],
    [/aductores|aduptores/, 'hip-adduction-machine', 'aductores'],
    [/hip t(h)?rust|empuje de cadera/, 'hip-thrust-machine', 'glúteo'],
    [/peso muerto|rumano/, 'deadlift', 'glúteo y femoral'],
    [/hiperextension|hiiperextesion/, 'back-extensions', 'lumbar y glúteo'],
    [/gemelo/, 'standing-calf-raise-machine', 'gemelo'],
    [/dominadas asistidas|dominadas \(asistidas\)/, 'assisted-pull-up', 'dorsal'],
    [/dominadas/, 'pull-up', 'dorsal'],
    [/jalon al pec/, 'lat-pulldown', 'dorsal'],
    [/pull ?over/, 'straight-arm-pulldown', 'dorsal'],
    [/remo (en )?polea unilateral|remo unilateral/, 'single-arm-cable-row', 'espalda'],
    [/remo (libre|con barra)|^remo$|remo \(barra\)/, 'bent-over-row', 'espalda'],
    [/remo/, 'machine-row', 'espalda'],
    [/trapecio/, 'dumbbell-shrug', 'trapecio'],
    [/curl 45/, 'incline-dumbbell-curl', 'bíceps'],
    [/biceps barra z|curl de biceps|curl bara z|curl barra z/, 'ez-bar-curl', 'bíceps'],
    [/polea triceps|jalon de triceps/, 'tricep-pushdowns', 'tríceps'],
    [/triceps barra z|extension de triceps|^barra z$/, 'skull-crushers', 'tríceps'],
    [/fondos/, 'dips', 'pecho y tríceps'],
    [/toes to bar/, 'toes-to-bar', 'abdomen'],
    [/^abs$|abdominales/, 'machine-abdominal-crunch', 'abdomen'],
  ];

  function h(etiqueta, atributos, hijos) {
    var n = document.createElement(etiqueta);
    Object.keys(atributos || {}).forEach(function (k) {
      if (k === 'texto') n.textContent = atributos[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), atributos[k]);
      else if (atributos[k] != null) n.setAttribute(k, atributos[k]);
    });
    (hijos || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  // Busca por el nombre y, si no, por el ejercicio del que es variante ("Press Banca (Barra)" → Press Banca).
  function de(nombre) {
    var nombres = [nombre, Grupos.varianteDe(nombre)];
    for (var i = 0; i < nombres.length; i++) {
      var clave = Grupos.normalizar(nombres[i]);
      if (!clave) continue;
      for (var j = 0; j < TABLA.length; j++) {
        if (TABLA[j][0].test(clave)) return { id: TABLA[j][1], trabaja: TABLA[j][2] };
      }
    }
    return null;
  }

  function imagen(id, n) {
    return 'tecnica/' + id + '-' + n + '.webp';
  }

  // Las dos imágenes una encima de otra; con la clase "en-marcha" la de arriba aparece y desaparece.
  function animacion(t, enMarcha) {
    var caja = h('div', { class: 'tecnica-anim' + (enMarcha ? ' en-marcha' : ''), role: 'button', tabindex: '0',
      'aria-label': enMarcha ? 'Parar' : 'Ver cómo se hace' }, [
      h('img', { src: imagen(t.id, 1), alt: 'Inicio del movimiento', draggable: 'false' }),
      h('img', { class: 'tecnica-final', src: imagen(t.id, 2), alt: 'Final del movimiento', draggable: 'false' }),
      h('span', { class: 'tecnica-play', 'aria-hidden': 'true' }),
    ]);
    function alternar() {
      var marcha = caja.classList.toggle('en-marcha');
      caja.setAttribute('aria-label', marcha ? 'Parar' : 'Ver cómo se hace');
    }
    caja.addEventListener('click', alternar);
    caja.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); }
    });
    return caja;
  }

  function trabaja(t) {
    return h('p', { class: 'tecnica-trabaja' }, [document.createTextNode('Trabaja: '), h('b', { texto: t.trabaja })]);
  }

  // Para la ℹ️: la imagen parada con el ▶ y debajo qué músculos trabaja.
  function bloque(nombre) {
    var t = de(nombre);
    if (!t) return null;
    return h('div', { class: 'notas-bloque tecnica-bloque' }, [
      h('p', { class: 'notas-titulo', texto: 'Cómo se hace' }),
      animacion(t, false),
      trabaja(t),
    ]);
  }

  function sinMovimiento() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // En grande, en la hoja de abajo, creciendo desde el círculo que se ha tocado.
  function abrir(nombre, origen) {
    var t = de(nombre);
    if (!t) return;
    var anim = animacion(t, true);
    App.abrirSelector(nombre, [anim, trabaja(t)]);
    var caja = document.querySelector('#selector .selector-caja');
    if (!origen || !anim.animate || sinMovimiento()) return;
    var a = origen.getBoundingClientRect();
    var b = anim.getBoundingClientRect();
    if (!a.width || !b.width) return;
    var desde = 'translate(' + (a.left + a.width / 2 - (b.left + b.width / 2)) + 'px,' +
      (a.top + a.height / 2 - (b.top + b.height / 2)) + 'px) scale(' + (a.width / b.width) + ')';
    anim.animate([{ transform: desde, borderRadius: '50%' }, { transform: 'none', borderRadius: '14px' }],
      { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    if (caja) caja.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
  }

  // El círculo junto al nombre; null si el ejercicio no tiene imagen.
  function miniatura(nombre) {
    var t = de(nombre);
    if (!t) return null;
    var boton = h('button', { type: 'button', class: 'tecnica-mini', 'aria-label': 'Cómo se hace ' + nombre }, [
      h('img', { src: imagen(t.id, 'mini'), alt: '', draggable: 'false' }),
    ]);
    boton.addEventListener('click', function () { abrir(nombre, boton); });
    return boton;
  }

  return { de: de, bloque: bloque, miniatura: miniatura, abrir: abrir, TABLA: TABLA };
})();
