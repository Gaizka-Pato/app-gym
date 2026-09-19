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
  function comparar(contenedor, etiquetas, estimado, realizado) {
    contenedor.innerHTML = '';
    // Con un solo dato se pinta su punto: en el primer ciclo de un ejercicio de peso corporal no hay más.
    var valores = estimado.concat(realizado).filter(function (v) { return v != null && v > 0; });
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
        if (v == null || !(v > 0)) {
          if (tramo.length > 1) svg.appendChild(el('polyline', { points: tramo.join(' '), class: serie[0] }));
          tramo = [];
          return;
        }
        tramo.push(x(i).toFixed(1) + ',' + y(v).toFixed(1));
        svg.appendChild(el('circle', { cx: x(i), cy: y(v), r: 3, class: serie[0] === 'linea' ? 'punto' : 'punto2' }));
      });
      if (tramo.length > 1) svg.appendChild(el('polyline', { points: tramo.join(' '), class: serie[0] }));
    });
    contenedor.appendChild(svg);
    contenedor.appendChild(Object.assign(document.createElement('p'), {
      className: 'leyenda',
      innerHTML: '<span class="muestra estimado"></span> Proyectado <span class="muestra real"></span> Realizado',
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
      barra.appendChild(el('title', {}, b.titulo || (b.etiqueta + ': ' + miles(v))));
      svg.appendChild(barra);
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
    contenedor.appendChild(svg);
  }

  return { dibujar: dibujar, comparar: comparar, fechaCorta: fechaCorta, anillo: anillo, barras: barras, miles: miles };
})();
