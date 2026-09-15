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

  return { dibujar: dibujar, fechaCorta: fechaCorta };
})();
