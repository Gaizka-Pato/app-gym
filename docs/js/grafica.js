// Gráfica de línea en SVG, sin librerías, para la evolución de un ejercicio.
var Grafica = (function () {
  var NS = 'http://www.w3.org/2000/svg';

  function el(nombre, atributos, texto) {
    var n = document.createElementNS(NS, nombre);
    Object.keys(atributos).forEach(function (k) { n.setAttribute(k, atributos[k]); });
    if (texto != null) n.textContent = texto;
    return n;
  }

  function fechaCorta(iso) {
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0].slice(2);
  }

  // puntos: [{ f: 'aaaa-mm-dd', v: número }] ordenados por fecha.
  function dibujar(contenedor, puntos, unidad) {
    contenedor.innerHTML = '';
    puntos = puntos.filter(function (p) { return p.v > 0; });
    if (puntos.length < 2) {
      contenedor.appendChild(Object.assign(document.createElement('p'), { className: 'vacio', textContent: 'Aún no hay datos suficientes para la gráfica.' }));
      return;
    }
    var ancho = 340, alto = 180, margen = { izq: 36, der: 10, arr: 12, abj: 24 };
    var t0 = Date.parse(puntos[0].f), t1 = Date.parse(puntos[puntos.length - 1].f);
    var valores = puntos.map(function (p) { return p.v; });
    var min = Math.min.apply(null, valores), max = Math.max.apply(null, valores);
    if (max === min) { max += 1; min -= 1; }
    var x = function (f) { return margen.izq + ((Date.parse(f) - t0) / Math.max(1, t1 - t0)) * (ancho - margen.izq - margen.der); };
    var y = function (v) { return margen.arr + (1 - (v - min) / (max - min)) * (alto - margen.arr - margen.abj); };

    var svg = el('svg', { viewBox: '0 0 ' + ancho + ' ' + alto, class: 'grafica', role: 'img' });
    [min, (min + max) / 2, max].forEach(function (v) {
      svg.appendChild(el('line', { x1: margen.izq, x2: ancho - margen.der, y1: y(v), y2: y(v), class: 'guia' }));
      svg.appendChild(el('text', { x: margen.izq - 4, y: y(v) + 4, 'text-anchor': 'end', class: 'eje' }, String(Math.round(v * 10) / 10).replace('.', ',')));
    });
    svg.appendChild(el('text', { x: margen.izq, y: alto - 6, class: 'eje' }, fechaCorta(puntos[0].f)));
    svg.appendChild(el('text', { x: ancho - margen.der, y: alto - 6, 'text-anchor': 'end', class: 'eje' }, fechaCorta(puntos[puntos.length - 1].f)));
    svg.appendChild(el('polyline', {
      points: puntos.map(function (p) { return x(p.f).toFixed(1) + ',' + y(p.v).toFixed(1); }).join(' '),
      class: 'linea',
    }));
    var ultimo = puntos[puntos.length - 1];
    svg.appendChild(el('circle', { cx: x(ultimo.f), cy: y(ultimo.v), r: 4, class: 'punto' }));
    svg.appendChild(el('title', {}, 'Último: ' + ultimo.v + ' ' + unidad + ' (' + fechaCorta(ultimo.f) + ')'));
    contenedor.appendChild(svg);
  }

  // Dos líneas sobre las mismas etiquetas (por ejemplo lo estimado y lo realizado de un ciclo).
  // Los huecos se saltan: la línea se corta y sigue en el siguiente valor.
  // marcas: [{ texto, valor }] por columna (o null). Señalan las columnas hechas con otro ejercicio: en vez del
  // peso del otro ejercicio (que sería de otra cosa) la línea pasa por `valor`, lo que cuenta aquí ese día, y
  // el punto sale como una ✕. Sin `valor` la ✕ se queda suelta, sin unir.
  // Un paso de eje que se lee solo (1, 2, 2,5, 5 × 10ⁿ) para unas tres rayas entre lo y hi.
  function pasoRedondo(rango) {
    var bruto = rango / 3;
    var mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    var opciones = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < opciones.length; i++) if (opciones[i] * mag >= bruto) return opciones[i] * mag;
    return 10 * mag;
  }

  function num(v) {
    return String(Math.round(v * 10) / 10).replace('.', ',');
  }

  // Dos líneas sobre las mismas columnas: lo que tocaba (discontinua) y lo hecho (él, 2026-10-06, rehecha):
  // - cada punto de lo hecho en verde si llegó a lo que tocaba y en rojo si no, con la diferencia sombreada;
  // - tocando una columna, un cartelito con lo que tocaba, lo hecho y la diferencia;
  // - eje con números redondos; un día muy por debajo (un cambio, un día malo) no aplasta la gráfica: se queda
  //   pegado abajo con su número;
  // - la columna AMRAP en dorado con "RM", como los días de RM del calendario.
  // Los huecos se saltan: la línea se corta y sigue en el siguiente valor.
  // marcas: [{ texto, valor }] por columna (o null). Señalan las columnas hechas con otro ejercicio: en vez del
  // peso del otro ejercicio (que sería de otra cosa) la línea pasa por `valor`, lo que cuenta aquí ese día, y
  // el punto sale como una ✕. Sin `valor` la ✕ se queda suelta, sin unir. unidad: ' kg' o ' reps'.
  // opciones (los secundarios): { estados: ['bien' | 'medio' | 'mal'] por columna (si no, llegó o no a lo que tocaba),
  //   textos: el cartelito de cada columna, leyenda: el HTML de la leyenda }.
  function comparar(contenedor, etiquetas, estimado, realizado, marcas, unidad, opciones) {
    opciones = opciones || {};
    var estadoDe = function (i, v) { return (opciones.estados && opciones.estados[i]) || (v >= estimado[i] ? 'bien' : 'mal'); };
    contenedor.innerHTML = '';
    marcas = marcas || [];
    unidad = unidad || '';
    // Lo hecho que cuenta en cada columna: con otro ejercicio, lo que vale aquí (o suelto, sin unir).
    var hecho = realizado.map(function (v, i) { return marcas[i] ? (marcas[i].valor != null ? marcas[i].valor : null) : v; });
    var puntoDe = function (i) { return marcas[i] ? (marcas[i].valor != null ? marcas[i].valor : marcas[i].suelto) : realizado[i]; };
    var est = estimado.filter(function (v) { return v > 0; });
    var todos = est.concat(etiquetas.map(function (e, i) { return puntoDe(i); }).filter(function (v) { return v > 0; }));
    // Con un solo dato se pinta su punto: en el primer ciclo de un ejercicio de peso corporal no hay más.
    if (!todos.length) {
      contenedor.appendChild(Object.assign(document.createElement('p'), { className: 'vacio', textContent: 'Aún no hay datos de este ciclo.' }));
      return;
    }
    // El eje se ajusta a lo que tocaba y a lo hecho que no se aleje mucho; lo que cae muy por debajo se queda abajo.
    var suelo = est.length ? Math.min.apply(null, est) * 0.75 : -Infinity;
    var enEje = todos.filter(function (v) { return v >= suelo; });
    var lo = Math.min.apply(null, enEje), hi = Math.max.apply(null, enEje);
    if (hi === lo) { hi += 1; lo -= 1; }
    var paso = pasoRedondo(hi - lo);
    lo = Math.floor(lo / paso) * paso;
    hi = Math.ceil(hi / paso) * paso;
    if (hi === lo) hi = lo + paso;

    var ancho = 340, alto = 200, margen = { izq: 34, der: 12, arr: 14, abj: 30 };
    var x = function (i) { return margen.izq + (etiquetas.length > 1 ? i / (etiquetas.length - 1) : 0.5) * (ancho - margen.izq - margen.der); };
    var y = function (v) { return margen.arr + (1 - (Math.max(lo, v) - lo) / (hi - lo)) * (alto - margen.arr - margen.abj); };
    var abajo = function (v) { return v < lo; };

    var svg = el('svg', { viewBox: '0 0 ' + ancho + ' ' + alto, class: 'grafica ciclo', role: 'img' });
    var caja = document.createElement('div');
    caja.className = 'grafica-caja';

    // La columna AMRAP: una franja dorada detrás de todo.
    var hueco = etiquetas.length > 1 ? (x(1) - x(0)) : 40;
    etiquetas.forEach(function (etiqueta, i) {
      if (etiqueta !== 'AMRAP') return;
      var x0 = x(i) - hueco / 2;
      svg.appendChild(el('rect', { x: x0, y: margen.arr - 6, width: Math.min(hueco, ancho - x0), height: alto - margen.arr - margen.abj + 12, rx: 8, class: 'franja-rm' }));
    });
    for (var t = lo; t <= hi + paso / 1000; t += paso) {
      svg.appendChild(el('line', { x1: margen.izq, x2: ancho - margen.der, y1: y(t), y2: y(t), class: 'guia' }));
      svg.appendChild(el('text', { x: margen.izq - 4, y: y(t) + 4, 'text-anchor': 'end', class: 'eje' }, num(t)));
    }
    etiquetas.forEach(function (etiqueta, i) {
      var rm = etiqueta === 'AMRAP';
      svg.appendChild(el('text', { x: x(i), y: alto - 8, 'text-anchor': 'middle', class: 'eje' + (rm ? ' eje-rm' : '') }, rm ? 'RM' : etiqueta));
    });

    // La diferencia sombreada: una barra de lo que tocaba a lo hecho, verde si llegaste y roja si no.
    etiquetas.forEach(function (e, i) {
      var v = hecho[i];
      if (!(estimado[i] > 0) || !(v > 0)) return;
      var y1 = y(estimado[i]), y2 = y(v);
      svg.appendChild(el('rect', { x: x(i) - 4, y: Math.min(y1, y2), width: 8, height: Math.max(1, Math.abs(y2 - y1)), rx: 4,
        class: 'diferencia ' + estadoDe(i, v) }));
    });

    [['linea2', estimado], ['linea', hecho]].forEach(function (serie) {
      var tramo = [];
      serie[1].forEach(function (v, i) {
        if (v == null || !(v > 0)) {
          if (tramo.length > 1) svg.appendChild(el('polyline', { points: tramo.join(' '), class: serie[0] }));
          tramo = [];
          return;
        }
        tramo.push(x(i).toFixed(1) + ',' + y(v).toFixed(1));
      });
      if (tramo.length > 1) svg.appendChild(el('polyline', { points: tramo.join(' '), class: serie[0] }));
    });
    // Puntos: lo que tocaba pequeños; lo hecho más grandes, verdes o rojos (sin nada que comparar, del color de la línea).
    estimado.forEach(function (v, i) {
      if (v > 0) svg.appendChild(el('circle', { cx: x(i), cy: y(v), r: 3, class: 'punto2' }));
    });
    var hayCambios = false;
    etiquetas.forEach(function (e, i) {
      var v = puntoDe(i);
      if (!(v > 0)) return;
      var cx = x(i), cy = y(v);
      var clase = opciones.estados && opciones.estados[i] ? ' ' + opciones.estados[i] : estimado[i] > 0 ? ' ' + estadoDe(i, v) : '';
      if (marcas[i]) {
        // Las columnas cambiadas: una ✕ sobre la línea, en el valor que cuenta aquí.
        hayCambios = true;
        var r = 5;
        var aspa = el('g', { class: 'punto-cambio' + clase });
        aspa.appendChild(el('line', { x1: cx - r, y1: cy - r, x2: cx + r, y2: cy + r }));
        aspa.appendChild(el('line', { x1: cx - r, y1: cy + r, x2: cx + r, y2: cy - r }));
        svg.appendChild(aspa);
      } else {
        svg.appendChild(el('circle', { cx: cx, cy: cy, r: 4.5, class: 'punto' + clase }));
      }
      // Muy por debajo del eje: pegado abajo, con su número para que no engañe.
      if (abajo(v)) svg.appendChild(el('text', { x: cx + 8, y: cy + 4, 'text-anchor': 'start', class: 'eje valor-fuera' }, '↓ ' + num(v)));
    });

    // Tocar (o pasar por encima de) una columna: el cartelito con lo que tocaba y lo hecho.
    var pista = document.createElement('div');
    pista.className = 'pista pista-ciclo';
    pista.hidden = true;
    var guia = el('line', { x1: 0, x2: 0, y1: margen.arr, y2: alto - margen.abj, class: 'guia-activa', visibility: 'hidden' });
    svg.appendChild(guia);
    function textoColumna(i) {
      if (opciones.textos && opciones.textos[i]) return opciones.textos[i];
      var col = etiquetas[i] === 'AMRAP' ? 'RM' : 'Col ' + etiquetas[i];
      var v = puntoDe(i);
      var partes = [col];
      var m = marcas[i];
      if (m) {
        // Hecho con otro ejercicio: lo del otro y lo que cuenta aquí, en dos líneas cortas.
        partes.push(m.con + ' ' + (m.suelto != null ? num(m.suelto) : '?') + (m.toco != null ? ' de ' + num(m.toco) : '') + unidad);
        if (m.valor != null && estimado[i] > 0) {
          return partes.join(' · ') + '\nAquí cuenta ' + num(m.valor) + ' de ' + num(estimado[i]) + unidad +
            ' (' + (m.valor >= estimado[i] ? '+' : '−') + num(Math.abs(m.valor - estimado[i])) + ')';
        }
        return partes.join(' · ');
      }
      if (estimado[i] > 0) partes.push('tocaba ' + num(estimado[i]) + unidad);
      if (v > 0) partes.push('hiciste ' + num(v) + unidad + (estimado[i] > 0 ? ' (' + (v >= estimado[i] ? '+' : '−') + num(Math.abs(v - estimado[i])) + ')' : ''));
      else partes.push('sin hacer');
      return partes.join(' · ');
    }
    function mostrar(i) {
      guia.setAttribute('x1', x(i));
      guia.setAttribute('x2', x(i));
      guia.setAttribute('visibility', 'visible');
      pista.textContent = textoColumna(i);
      pista.hidden = false;
      var rc = caja.getBoundingClientRect();
      var escala = rc.width / ancho;
      var izq = x(i) * escala - pista.offsetWidth / 2;
      pista.style.left = Math.max(2, Math.min(rc.width - pista.offsetWidth - 2, izq)) + 'px';
      // Encima del punto más alto de esa columna, sin subirse al título.
      var arriba = Math.min(estimado[i] > 0 ? y(estimado[i]) : alto, puntoDe(i) > 0 ? y(puntoDe(i)) : alto);
      pista.style.top = Math.max(pista.offsetHeight + 4, Math.min(arriba, alto - margen.abj) * escala) + 'px';
    }
    // Con el dedo (eventos táctiles, que siguen llegando aunque el móvil desplace algo): sale al tocar, se queda
    // mientras se mantiene y se quita al soltar. Si el dedo se va de lado más de 24 px es que se está pasando a
    // otro ejercicio: se quita y el carrusel se desplaza como siempre (él, 2026-10-06: "no me deja arrastrar").
    // Con ratón, al pasar por encima.
    function esconder() { pista.hidden = true; guia.setAttribute('visibility', 'hidden'); }
    function columnaEn(clientX) {
      var r = svg.getBoundingClientRect();
      var sx = (clientX - r.left) / r.width * ancho;
      var i = etiquetas.length > 1 ? Math.round((sx - margen.izq) / (x(1) - x(0))) : 0;
      return Math.max(0, Math.min(etiquetas.length - 1, i));
    }
    var x0 = null;
    svg.addEventListener('touchstart', function (ev) {
      if (ev.touches.length !== 1) return;
      x0 = ev.touches[0].clientX;
      mostrar(columnaEn(x0));
    }, { passive: true });
    svg.addEventListener('touchmove', function (ev) {
      if (x0 == null) return;
      if (Math.abs(ev.touches[0].clientX - x0) > 24) { x0 = null; esconder(); }
    }, { passive: true });
    ['touchend', 'touchcancel'].forEach(function (n) {
      svg.addEventListener(n, function () { x0 = null; esconder(); });
    });
    svg.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    svg.addEventListener('pointermove', function (ev) { if (ev.pointerType === 'mouse') mostrar(columnaEn(ev.clientX)); });
    svg.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse') esconder(); });

    caja.appendChild(svg);
    caja.appendChild(pista);
    contenedor.appendChild(caja);
    contenedor.appendChild(Object.assign(document.createElement('p'), {
      className: 'leyenda',
      innerHTML: opciones.leyenda || '<span class="muestra estimado"></span> Tocaba <span class="muestra real"></span> Hecho' +
        ' <span class="muestra-punto bien"></span> Llegaste <span class="muestra-punto mal"></span> Corto' +
        (hayCambios ? ' <span class="muestra cambio">✕</span> Cambiado' : ''),
    }));
  }

  function miles(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // Anillo de progreso (pasos de hoy frente al objetivo): el número en medio, "de <objetivo>" y el porcentaje.
  function anillo(valor, objetivo) {
    var r = 64, grosor = 16, lado = 2 * (r + grosor / 2) + 4, c = lado / 2;
    var parte = objetivo > 0 ? Math.min(1, valor / objetivo) : 0;
    var vuelta = 2 * Math.PI * r;
    var svg = el('svg', { viewBox: '0 0 ' + lado + ' ' + lado, class: 'anillo', role: 'img' });
    svg.appendChild(el('circle', { cx: c, cy: c, r: r, class: 'anillo-fondo', 'stroke-width': grosor }));
    if (parte > 0) {
      svg.appendChild(el('circle', {
        cx: c, cy: c, r: r, class: 'anillo-valor', 'stroke-width': grosor,
        'stroke-dasharray': (vuelta * parte).toFixed(1) + ' ' + vuelta.toFixed(1),
        transform: 'rotate(-90 ' + c + ' ' + c + ')',
      }));
    }
    svg.appendChild(el('text', { x: c, y: c - 2, 'text-anchor': 'middle', class: 'anillo-numero' }, miles(valor)));
    svg.appendChild(el('text', { x: c, y: c + 20, 'text-anchor': 'middle', class: 'anillo-de' }, 'de ' + miles(objetivo)));
    var porcentaje = objetivo > 0 ? (valor / objetivo * 100).toFixed(2).replace('.', ',') + '%' : '';
    svg.appendChild(el('text', { x: c, y: c + 42, 'text-anchor': 'middle', class: 'anillo-porcentaje' }, porcentaje));
    return svg;
  }

  // Fuego de las calorías (Inicio): un dibujo; el número va debajo, fuera del svg. animo: 'feliz' (por defecto),
  // 'normal', 'preocupado' o 'triste', según vaya la semana (Pasos.animoSemana).
  var TITULO_FUEGO = { feliz: 'contento', normal: 'tranquilo', preocupado: 'preocupado', triste: 'triste' };
  function fuego(animo) {
    animo = TITULO_FUEGO[animo] ? animo : 'feliz';
    var svg = el('svg', { viewBox: '0 0 100 124', class: 'fuego ' + animo, role: 'img' });
    svg.appendChild(el('title', {}, 'Calorías · fuego ' + TITULO_FUEGO[animo]));
    svg.appendChild(el('path', {
      class: 'fuego-llama',
      d: 'M48 6 C58 18, 64 32, 66 46 C70 36, 76 30, 80 38 C90 56, 94 74, 90 88' +
         ' C84 108, 68 120, 50 120 C32 120, 16 108, 10 88 C6 72, 10 52, 20 40' +
         ' C22 33, 27 29, 29 36 C31 44, 33 48, 36 44 C34 30, 38 14, 48 6 Z',
    }));
    svg.appendChild(el('path', {
      class: 'fuego-centro',
      d: 'M47 30 C56 44, 58 56, 56 66 C62 58, 68 60, 70 68 C76 80, 74 96, 64 105' +
         ' C56 112, 40 112, 32 105 C22 96, 21 76, 28 64 C31 58, 35 58, 37 63' +
         ' C37 48, 40 37, 47 30 Z',
    }));
    svg.appendChild(el('path', {
      class: 'fuego-brillo',
      d: 'M56 66 C62 58, 68 60, 70 68 C75 79, 74 93, 67 102 C71 88, 69 75, 63 69 C60 66, 58 65, 56 66 Z',
    }));
    var apagado = animo === 'preocupado' || animo === 'triste';
    [[38, 84], [62, 84]].forEach(function (o) {
      svg.appendChild(el('ellipse', { cx: o[0], cy: o[1] + (apagado ? 1 : 0), rx: 8, ry: apagado ? 8.5 : 10, class: 'fuego-ojo' }));
      svg.appendChild(el('circle', { cx: o[0] - 3, cy: o[1] - 4, r: 3, class: 'fuego-luz' }));
      svg.appendChild(el('circle', { cx: o[0] + 2.5, cy: o[1] + 4, r: 1.6, class: 'fuego-luz' }));
    });
    // Cejas caídas hacia fuera cuando se preocupa o se pone triste.
    if (apagado) {
      var caida = animo === 'triste' ? 7 : 4;
      svg.appendChild(el('path', { class: 'fuego-linea', d: 'M30 ' + (70 - caida / 2) + ' L44 ' + (70 - caida - 2) }));
      svg.appendChild(el('path', { class: 'fuego-linea', d: 'M70 ' + (70 - caida / 2) + ' L56 ' + (70 - caida - 2) }));
    }
    if (!apagado) {
      [26, 74].forEach(function (x) {
        svg.appendChild(el('ellipse', { cx: x, cy: 96, rx: 7, ry: 4.5, class: 'fuego-color' }));
      });
    }
    if (animo === 'feliz') {
      svg.appendChild(el('path', { class: 'fuego-boca', d: 'M42 96 C46 109, 54 109, 58 96 C54 99, 46 99, 42 96 Z' }));
      svg.appendChild(el('ellipse', { cx: 50, cy: 104, rx: 4, ry: 2.8, class: 'fuego-lengua' }));
    } else if (animo === 'normal') {
      svg.appendChild(el('path', { class: 'fuego-linea', d: 'M43 99 Q50 104 57 99' }));
    } else if (animo === 'preocupado') {
      svg.appendChild(el('path', { class: 'fuego-linea', d: 'M43 102 Q46.5 99.5 50 102 Q53.5 104.5 57 102' }));
    } else {
      svg.appendChild(el('path', { class: 'fuego-linea', d: 'M42 105 Q50 96 58 105' }));
      svg.appendChild(el('path', { class: 'fuego-lagrima', d: 'M63 94 C63 94, 58 101, 58 104 A5 5 0 0 0 68 104 C68 101, 63 94, 63 94 Z' }));
    }
    return svg;
  }

  // Un tope redondo para el eje (350 → 400, 1.240 → 1.500): las rayas caen en números que se leen solos.
  function topeRedondo(max) {
    var mag = Math.pow(10, Math.floor(Math.log10(max)));
    var pasos = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < pasos.length; i++) if (pasos[i] * mag >= max) return pasos[i] * mag;
    return 10 * mag;
  }

  // Una barra con las esquinas de arriba redondas y la base recta, pegada al eje.
  function caminoBarra(x, arriba, w, base, r) {
    r = Math.max(0, Math.min(r, w / 2, base - arriba));
    return 'M' + x.toFixed(1) + ',' + base.toFixed(1) + ' V' + (arriba + r).toFixed(1) +
      ' Q' + x.toFixed(1) + ',' + arriba.toFixed(1) + ' ' + (x + r).toFixed(1) + ',' + arriba.toFixed(1) +
      ' H' + (x + w - r).toFixed(1) + ' Q' + (x + w).toFixed(1) + ',' + arriba.toFixed(1) + ' ' + (x + w).toFixed(1) + ',' + (arriba + r).toFixed(1) +
      ' V' + base.toFixed(1) + ' Z';
  }

  // Barras: [{ etiqueta, v, titulo }]. opciones: { clase, objetivo (línea discontinua), valores (número encima),
  // media (línea de la media de los días con algo, con su número) }.
  // Con muchas barras solo se escriben unas pocas etiquetas para que no se pisen.
  function barras(contenedor, lista, opciones) {
    opciones = opciones || {};
    contenedor.innerHTML = '';
    if (!lista.some(function (b) { return b.v > 0; })) {
      contenedor.appendChild(Object.assign(document.createElement('p'), { className: 'vacio', textContent: 'Aún no hay datos.' }));
      return;
    }
    var ancho = 340, alto = opciones.valores ? 180 : 170, margen = { izq: 38, der: 6, arr: opciones.valores ? 18 : 12, abj: 22 };
    var max = topeRedondo(Math.max(opciones.objetivo || 0, Math.max.apply(null, lista.map(function (b) { return b.v || 0; }))));
    var hueco = (ancho - margen.izq - margen.der) / lista.length;
    var y = function (v) { return margen.arr + (1 - v / max) * (alto - margen.arr - margen.abj); };
    var svg = el('svg', { viewBox: '0 0 ' + ancho + ' ' + alto, class: 'grafica barras ' + (opciones.clase || ''), role: 'img' });
    // La caja lleva el svg y el cartelito que sale al tocar una barra.
    var caja = document.createElement('div');
    caja.className = 'grafica-caja';
    var pista = document.createElement('div');
    pista.className = 'pista';
    pista.hidden = true;
    var marcada = null;
    function esconder() {
      pista.hidden = true;
      if (marcada) marcada.classList.remove('activa');
      marcada = null;
    }
    // El cartelito se pone encima de la barra, sin salirse por los lados.
    function mostrarPista(barra, texto) {
      if (marcada && marcada !== barra) marcada.classList.remove('activa');
      marcada = barra;
      barra.classList.add('activa');
      pista.textContent = texto;
      pista.hidden = false;
      var rc = caja.getBoundingClientRect(), rb = barra.getBoundingClientRect();
      var izq = rb.left - rc.left + rb.width / 2 - pista.offsetWidth / 2;
      pista.style.left = Math.max(2, Math.min(rc.width - pista.offsetWidth - 2, izq)) + 'px';
      pista.style.top = Math.max(22, rb.top - rc.top) + 'px';
    }
    [0, max / 2, max].forEach(function (v) {
      svg.appendChild(el('line', { x1: margen.izq, x2: ancho - margen.der, y1: y(v), y2: y(v), class: 'guia' }));
      svg.appendChild(el('text', { x: margen.izq - 4, y: y(v) + 4, 'text-anchor': 'end', class: 'eje' }, v >= 10000 ? miles(v / 1000) + 'k' : miles(v)));
    });
    var cada = Math.ceil(lista.length / 8);
    var barrasDibujadas = [];
    lista.forEach(function (b, i) {
      var x = margen.izq + i * hueco;
      var v = b.v || 0;
      var llega = opciones.objetivo ? v >= opciones.objetivo : true;
      var w = hueco * 0.72;
      var x1 = x + (hueco - w) / 2, r = Math.min(4, w * 0.35);
      var barra;
      if (b.partes) {
        // Apilada (calorías: andando abajo, entrenando encima): la de arriba lleva las esquinas redondas.
        var abajo = b.partes[0] || 0, encima = b.partes[1] || 0;
        barra = el('g', { class: 'barra-apilada' });
        if (abajo > 0) barra.appendChild(el('path', { d: caminoBarra(x1, y(abajo), w, y(0), encima > 0 ? 0 : r), class: 'barra' }));
        if (encima > 0) barra.appendChild(el('path', { d: caminoBarra(x1, y(abajo + encima), w, y(abajo), r), class: 'barra parte-2' }));
      } else {
        barra = el('path', { d: caminoBarra(x1, y(v), w, y(0), r), class: 'barra' + (llega ? '' : ' corta') });
      }
      svg.appendChild(barra);
      barrasDibujadas.push({ barra: barra, texto: b.titulo || (b.etiqueta + ': ' + miles(v)) });
      if (opciones.valores && v > 0) {
        svg.appendChild(el('text', { x: x + hueco / 2, y: y(v) - 4, 'text-anchor': 'middle', class: 'eje valor' }, miles(v)));
      }
      if ((lista.length - 1 - i) % cada === 0) {
        // Con muchas barras, la última etiqueta se pega al borde para que no se corte.
        var ultima = cada > 1 && i === lista.length - 1;
        svg.appendChild(el('text', { x: ultima ? ancho - 1 : x + hueco / 2, y: alto - 6, 'text-anchor': ultima ? 'end' : 'middle', class: 'eje' }, b.etiqueta));
      }
    });
    if (opciones.objetivo) {
      svg.appendChild(el('line', { x1: margen.izq, x2: ancho - margen.der, y1: y(opciones.objetivo), y2: y(opciones.objetivo), class: 'objetivo' }));
    }
    // La media de los días con algo: una raya fina y su número a la derecha, por encima de las barras.
    var conAlgo = lista.filter(function (b) { return b.v > 0; });
    if (opciones.media && conAlgo.length > 1) {
      var media = conAlgo.reduce(function (t, b) { return t + b.v; }, 0) / conAlgo.length;
      svg.appendChild(el('line', { x1: margen.izq, x2: ancho - margen.der, y1: y(media), y2: y(media), class: 'media' }));
      svg.appendChild(el('text', { x: ancho - margen.der, y: y(media) - 4, 'text-anchor': 'end', class: 'eje media-texto' }, 'media ' + miles(media)));
    }
    // Con el dedo, como en las gráficas del ciclo (él, 2026-10-09): sale al tocar, sigue al dedo de barra en barra
    // mientras se mantiene y se quita al soltar. Si el dedo se va hacia arriba o abajo es que se desplaza la
    // página: se quita. Con ratón, al pasar por encima.
    function barraEn(clientX) {
      var r = svg.getBoundingClientRect();
      var i = Math.floor(((clientX - r.left) / r.width * ancho - margen.izq) / hueco);
      return barrasDibujadas[Math.max(0, Math.min(barrasDibujadas.length - 1, i))];
    }
    function mostrarEn(clientX) {
      var b = barraEn(clientX);
      if (b) mostrarPista(b.barra, b.texto);
    }
    var inicio = null;
    svg.addEventListener('touchstart', function (ev) {
      if (ev.touches.length !== 1) return;
      inicio = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
      mostrarEn(inicio.x);
    }, { passive: true });
    svg.addEventListener('touchmove', function (ev) {
      if (!inicio) return;
      var t = ev.touches[0];
      if (Math.abs(t.clientY - inicio.y) > 16 && Math.abs(t.clientY - inicio.y) > Math.abs(t.clientX - inicio.x)) {
        inicio = null;
        esconder();
        return;
      }
      mostrarEn(t.clientX);
    }, { passive: true });
    ['touchend', 'touchcancel'].forEach(function (n) {
      svg.addEventListener(n, function () { inicio = null; esconder(); });
    });
    svg.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    svg.addEventListener('pointermove', function (ev) { if (ev.pointerType === 'mouse') mostrarEn(ev.clientX); });
    svg.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse') esconder(); });
    caja.appendChild(svg);
    caja.appendChild(pista);
    contenedor.appendChild(caja);
  }

  return {
    dibujar: dibujar, comparar: comparar, fechaCorta: fechaCorta,
    anillo: anillo, barras: barras, fuego: fuego, miles: miles,
  };
})();
