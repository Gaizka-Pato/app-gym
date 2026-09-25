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
  function comparar(contenedor, etiquetas, estimado, realizado, marcas) {
    contenedor.innerHTML = '';
    marcas = marcas || [];
    // Con un solo dato se pinta su punto: en el primer ciclo de un ejercicio de peso corporal no hay más.
    var valores = estimado.concat(realizado.map(function (v, i) { return marcas[i] ? null : v; }))
      .concat(marcas.map(function (m) { return m ? (m.valor != null ? m.valor : m.suelto) : null; }))
      .filter(function (v) { return v != null && v > 0; });
    if (!valores.length) {
      contenedor.appendChild(Object.assign(document.createElement('p'), { className: 'vacio', textContent: 'Aún no hay datos de este ciclo.' }));
      return;
    }
    var ancho = 340, alto = 190, margen = { izq: 34, der: 8, arr: 12, abj: 30 };
    var min = Math.min.apply(null, valores), max = Math.max.apply(null, valores);
    if (max === min) { max += 1; min -= 1; }
    var x = function (i) { return margen.izq + (etiquetas.length > 1 ? i / (etiquetas.length - 1) : 0.5) * (ancho - margen.izq - margen.der); };
    var y = function (v) { return margen.arr + (1 - (v - min) / (max - min)) * (alto - margen.arr - margen.abj); };

    var svg = el('svg', { viewBox: '0 0 ' + ancho + ' ' + alto, class: 'grafica', role: 'img' });
    [min, (min + max) / 2, max].forEach(function (v) {
      svg.appendChild(el('line', { x1: margen.izq, x2: ancho - margen.der, y1: y(v), y2: y(v), class: 'guia' }));
      svg.appendChild(el('text', { x: margen.izq - 4, y: y(v) + 4, 'text-anchor': 'end', class: 'eje' }, String(Math.round(v * 10) / 10).replace('.', ',')));
    });
    etiquetas.forEach(function (etiqueta, i) {
      svg.appendChild(el('text', { x: x(i), y: alto - 8, 'text-anchor': 'middle', class: 'eje' }, etiqueta));
    });

    [['linea2', estimado], ['linea', realizado]].forEach(function (serie) {
      var tramo = [];
      serie[1].forEach(function (v, i) {
        // La columna hecha con otro ejercicio no vale en kg del otro ejercicio: la línea pasa por lo que ese
        // día cuenta aquí (lo que tocaba, subido o bajado en la proporción de lo que cumpliste en el otro).
        if (serie[0] === 'linea' && marcas[i]) v = marcas[i].valor;
        if (v == null || !(v > 0)) {
          if (tramo.length > 1) svg.appendChild(el('polyline', { points: tramo.join(' '), class: serie[0] }));
          tramo = [];
          return;
        }
        tramo.push(x(i).toFixed(1) + ',' + y(v).toFixed(1));
        if (serie[0] === 'linea' && marcas[i]) return; // Su punto es la ✕, que se pinta abajo.
        svg.appendChild(el('circle', { cx: x(i), cy: y(v), r: 3, class: serie[0] === 'linea' ? 'punto' : 'punto2' }));
      });
      if (tramo.length > 1) svg.appendChild(el('polyline', { points: tramo.join(' '), class: serie[0] }));
    });

    // Las columnas cambiadas: una ✕ sobre la línea, en el valor que cuenta aquí.
    var hayCambios = false;
    marcas.forEach(function (m, i) {
      if (!m) return;
      var v = m.valor != null ? m.valor : m.suelto;
      if (!(v > 0)) return;
      hayCambios = true;
      var r = 5, cx = x(i), cy = y(v);
      var aspa = el('g', { class: 'punto-cambio' });
      aspa.appendChild(el('line', { x1: cx - r, y1: cy - r, x2: cx + r, y2: cy + r }));
      aspa.appendChild(el('line', { x1: cx - r, y1: cy + r, x2: cx + r, y2: cy - r }));
      aspa.appendChild(el('title', {}, m.texto || 'Cambiado'));
      svg.appendChild(aspa);
    });

    contenedor.appendChild(svg);
    contenedor.appendChild(Object.assign(document.createElement('p'), {
      className: 'leyenda',
      innerHTML: '<span class="muestra estimado"></span> Proyectado <span class="muestra real"></span> Realizado' +
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

  // Barras: [{ etiqueta, v, titulo }]. opciones: { clase, objetivo (línea discontinua), valores (número encima) }.
  // Con muchas barras solo se escriben unas pocas etiquetas para que no se pisen.
  function barras(contenedor, lista, opciones) {
    opciones = opciones || {};
    contenedor.innerHTML = '';
    if (!lista.some(function (b) { return b.v > 0; })) {
      contenedor.appendChild(Object.assign(document.createElement('p'), { className: 'vacio', textContent: 'Aún no hay datos.' }));
      return;
    }
    var ancho = 340, alto = opciones.valores ? 170 : 160, margen = { izq: 38, der: 6, arr: opciones.valores ? 18 : 10, abj: 22 };
    var max = Math.max(opciones.objetivo || 0, Math.max.apply(null, lista.map(function (b) { return b.v || 0; })));
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
    lista.forEach(function (b, i) {
      var x = margen.izq + i * hueco;
      var v = b.v || 0;
      var llega = opciones.objetivo ? v >= opciones.objetivo : true;
      var barra = el('rect', {
        x: (x + hueco * 0.15).toFixed(1), y: y(v).toFixed(1), width: (hueco * 0.7).toFixed(1),
        height: Math.max(0, y(0) - y(v)).toFixed(1), rx: Math.min(4, hueco * 0.2).toFixed(1), class: 'barra' + (llega ? '' : ' corta'),
      });
      svg.appendChild(barra);
      // Una zona invisible de alto completo, para poder tocar también los días de poco valor.
      var texto = b.titulo || (b.etiqueta + ': ' + miles(v));
      var zona = el('rect', { x: x.toFixed(1), y: margen.arr, width: hueco.toFixed(1), height: (y(0) - margen.arr).toFixed(1), class: 'zona' });
      zona.addEventListener('pointerenter', function () { mostrarPista(barra, texto); });
      zona.addEventListener('pointerdown', function () { mostrarPista(barra, texto); });
      svg.appendChild(zona);
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
    caja.appendChild(svg);
    caja.appendChild(pista);
    caja.addEventListener('pointerleave', esconder);
    contenedor.appendChild(caja);
  }

  return {
    dibujar: dibujar, comparar: comparar, fechaCorta: fechaCorta,
    anillo: anillo, barras: barras, fuego: fuego, miles: miles,
  };
})();
