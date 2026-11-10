// Discos que hay que poner en cada lado de la barra para un peso.
// En el gimnasio hay pares de 20, 10, 5, 2,5 y 1,25 kg, y la barra es de 20.
var Discos = (function () {
  var BARRA = 20;
  var DISPONIBLES = [20, 10, 5, 2.5, 1.25];

  function redondear(n) {
    return Math.round(n * 100) / 100;
  }

  function formatoKg(n) {
    return String(redondear(n)).replace('.', ',');
  }

  // { porLado: [[disco, veces]], resto } con lo que va en un lado. Un resto negativo es un peso menor que la barra.
  function calcular(peso, barra, disponibles) {
    var falta = redondear(((Number(peso) || 0) - (barra == null ? BARRA : Number(barra) || 0)) / 2);
    if (falta < 0) return { porLado: [], resto: falta };
    var porLado = [];
    (disponibles || DISPONIBLES).slice().sort(function (a, b) { return b - a; }).forEach(function (disco) {
      var veces = Math.floor((falta + 1e-9) / disco);
      if (veces > 0) {
        porLado.push([disco, veces]);
        falta = redondear(falta - veces * disco);
      }
    });
    return { porLado: porLado, resto: falta };
  }

  function texto(peso, barra, disponibles) {
    var r = calcular(peso, barra, disponibles);
    if (r.resto < 0) return 'menos que la barra';
    if (!r.porLado.length) return 'solo la barra';
    var partes = r.porLado.map(function (p) { return (p[1] > 1 ? p[1] + '×' : '') + formatoKg(p[0]); });
    return partes.join(' + ') + (r.resto > 0 ? ' (faltan ' + formatoKg(r.resto) + ')' : '');
  }

  // La barra que se usó la última vez; por defecto 20 kg.
  function barraActual() {
    return Number(typeof Almacen !== 'undefined' && Almacen.marca('barra')) || BARRA;
  }

  // Colores de los discos como en el gimnasio (20 azul, 10 verde, 5 blanco, 2,5 rojo, 1,25 gris) y su alto.
  var DIBUJO = { 20: ['#2f6fd6', 76], 10: ['#2fa35a', 60], 5: ['#e8e8e8', 46], 2.5: ['#d64545', 36], 1.25: ['#9aa0a6', 30] };

  // Un lado de la barra dibujado: el manguito y los discos de dentro afuera, el más grande pegado al tope.
  function dibujo(r) {
    var h = App.h;
    var discos = [];
    r.porLado.forEach(function (p) {
      for (var i = 0; i < p[1]; i++) {
        var d = DIBUJO[p[0]] || ['#888', 30];
        discos.push(h('span', { class: 'disco', style: 'background:' + d[0] + ';height:' + d[1] + 'px', title: formatoKg(p[0]) + ' kg' }));
      }
    });
    return h('div', { class: 'discos-dibujo', 'aria-hidden': 'true' }, [h('span', { class: 'discos-tope' })].concat(discos, [h('span', { class: 'discos-manguito' })]));
  }

  // Hoja con los discos de cada lado, grande y dibujado; el peso se puede tocar en el momento y la barra queda guardada.
  // barraEjercicio: la barra de ese ejercicio (la Z pesa 10); si no viene, la última que se usó.
  function abrirCalculadora(peso, barraEjercicio) {
    var h = App.h;
    var entradaPeso = h('input', { inputmode: 'decimal', value: App.formato(peso), 'aria-label': 'Peso total' });
    var entradaBarra = h('input', { inputmode: 'decimal', value: App.formato(barraEjercicio || barraActual()), 'aria-label': 'Peso de la barra' });
    var resultado = h('div', { class: 'discos-resultado' });

    function recalcular() {
      var total = App.numero(entradaPeso.value);
      var barra = App.numero(entradaBarra.value);
      if (barra != null && !barraEjercicio) Almacen.marcar('barra', barra);
      if (barra == null) barra = barraActual();
      resultado.innerHTML = '';
      if (total == null) {
        resultado.appendChild(h('p', { class: 'detalle', texto: 'Pon el peso total' }));
        return;
      }
      var r = calcular(total, barra);
      resultado.appendChild(h('p', { class: 'discos-titulo', texto: 'En cada lado' }));
      resultado.appendChild(h('p', { class: 'discos-lado', texto: r.resto < 0 ? 'Menos que la barra' : !r.porLado.length ? 'Solo la barra'
        : r.porLado.map(function (p) { return (p[1] > 1 ? p[1] + ' × ' : '') + formatoKg(p[0]); }).join('  +  ') }));
      if (r.porLado.length) resultado.appendChild(dibujo(r));
      if (r.resto > 0) resultado.appendChild(h('p', { class: 'detalle', texto: 'Faltan ' + formatoKg(r.resto) + ' kg por lado con estos discos' }));
    }

    entradaPeso.addEventListener('input', recalcular);
    entradaBarra.addEventListener('input', recalcular);
    recalcular();
    App.abrirSelector('Discos', [
      resultado,
      h('div', { class: 'discos-campos' }, [
        h('label', { class: 'campo' }, [h('span', { texto: 'Peso total (kg)' }), entradaPeso]),
        h('label', { class: 'campo' }, [h('span', { texto: 'Barra (kg)' }), entradaBarra]),
      ]),
      h('button', { type: 'button', class: 'principal', texto: 'Hecho', onclick: function () { App.cerrarSelector(); } }),
    ]);
  }

  return {
    BARRA: BARRA,
    DISPONIBLES: DISPONIBLES,
    calcular: calcular,
    texto: texto,
    formatoKg: formatoKg,
    barraActual: barraActual,
    abrirCalculadora: abrirCalculadora,
  };
})();
