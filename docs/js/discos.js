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

  // Hoja para ver y cambiar el reparto: el peso se puede tocar en el momento y la barra queda guardada.
  function abrirCalculadora(peso) {
    var h = App.h;
    var entradaPeso = h('input', { inputmode: 'decimal', value: App.formato(peso), 'aria-label': 'Peso total' });
    var entradaBarra = h('input', { inputmode: 'decimal', value: App.formato(barraActual()), 'aria-label': 'Peso de la barra' });
    var resultado = h('p', { class: 'objetivo' });

    function recalcular() {
      var total = App.numero(entradaPeso.value);
      var barra = App.numero(entradaBarra.value);
      if (barra != null) Almacen.marcar('barra', barra);
      resultado.textContent = total != null
        ? 'Por lado: ' + texto(total, barra != null ? barra : barraActual())
        : 'Pon el peso total';
    }

    entradaPeso.addEventListener('input', recalcular);
    entradaBarra.addEventListener('input', recalcular);
    recalcular();
    App.abrirSelector('Discos por lado', [
      h('label', { class: 'campo' }, [h('span', { texto: 'Peso total (kg)' }), entradaPeso]),
      h('label', { class: 'campo' }, [h('span', { texto: 'Barra (kg)' }), entradaBarra]),
      resultado,
      h('p', { class: 'detalle', texto: 'Discos de 20, 10, 5, 2,5 y 1,25 por pares. La barra se guarda para la próxima vez.' }),
      h('button', { type: 'button', class: 'principal', texto: 'Hecho', onclick: function () {
        App.cerrarSelector();
        App.mostrar('hoy');
      } }),
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
