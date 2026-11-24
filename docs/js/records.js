// Récords de un ejercicio. Una serie es récord si, comparada con todas las anteriores:
//   - su 1RM estimado (Epley, con cualquier número de repeticiones) es el mayor hasta entonces, o
//   - nunca se habían hecho tantas repeticiones con ese peso o más (récord de repeticiones con ese peso).
// La primera serie de un ejercicio no cuenta como récord: no hay con qué comparar.
// Asistidos (ayuda: los kg son la ayuda de la máquina): no hay 1RM y el récord es más reps con esa ayuda o menos.
var Records = (function () {
  // Epley con cualquier número de repeticiones (antes solo hasta 12; él, 2026-11-04: "con infinito de repes").
  function rm(kg, reps) {
    return kg > 0 && reps > 0 ? Math.round(kg * (1 + reps / 30) * 10) / 10 : 0;
  }

  // anteriores: [[kg, reps]]. Devuelve { rm: nuevo 1RM si es récord o null, reps: bool, rmAnterior }.
  function comparar(anteriores, kg, reps, ayuda) {
    var mejorRm = 0;
    var superada = false;
    anteriores.forEach(function (s) {
      if (!ayuda) mejorRm = Math.max(mejorRm, rm(s[0], s[1]));
      if ((ayuda ? s[0] <= kg : s[0] >= kg) && s[1] >= reps) superada = true;
    });
    var nuevo = ayuda ? 0 : rm(kg, reps);
    var hayHistoria = anteriores.length > 0;
    return {
      rm: hayHistoria && nuevo > mejorRm ? nuevo : null,
      reps: hayHistoria && reps > 0 && !superada,
      rmAnterior: mejorRm,
    };
  }

  // dias: [{ f: 'aaaa-mm-dd', s: [[kg, reps]] }] en orden de fecha.
  // Devuelve las series que fueron récord en su momento ({ 'fecha|índice': ['rm', 'reps'] }) y las mejores marcas.
  function analizar(dias, ayuda) {
    var anteriores = [];
    var marcas = {};
    var mejorRm = null;
    var pesoMax = null;
    var porPeso = {};
    dias.forEach(function (d) {
      d.s.forEach(function (s, i) {
        var kg = Number(s[0]) || 0;
        var reps = Number(s[1]) || 0;
        var c = comparar(anteriores, kg, reps, ayuda);
        var tipos = [];
        if (c.rm) tipos.push('rm');
        if (c.reps) tipos.push('reps');
        if (tipos.length) marcas[d.f + '|' + i] = tipos;

        var r = ayuda ? 0 : rm(kg, reps);
        if (r && (!mejorRm || r > mejorRm.rm)) mejorRm = { rm: r, kg: kg, reps: reps, f: d.f };
        // Con ayuda, el "peso máximo" es la menor ayuda.
        var mejorPeso = !pesoMax || (ayuda ? kg < pesoMax.kg : kg > pesoMax.kg) || (kg === pesoMax.kg && reps > pesoMax.reps);
        if (mejorPeso) pesoMax = { kg: kg, reps: reps, f: d.f };
        if (!porPeso[kg] || reps > porPeso[kg].reps) porPeso[kg] = { kg: kg, reps: reps, f: d.f };
        anteriores.push([kg, reps]);
      });
    });
    var repsPorPeso = Object.keys(porPeso).map(function (k) { return porPeso[k]; })
      .sort(function (a, b) { return ayuda ? a.kg - b.kg : b.kg - a.kg; });
    return { marcas: marcas, mejorRm: mejorRm, pesoMax: pesoMax, repsPorPeso: repsPorPeso };
  }

  // El Excel pide 6 reps al 70%, 5 al 74%, 4 al 78% y 3 al 82%: de ahí sale el % de cada número de repeticiones.
  // Lo usa ajuste.js para rebajar el peso cuando faltan repeticiones.
  function porcentaje(reps) {
    return Math.min(0.9, Math.max(0.46, 0.94 - 0.04 * reps));
  }

  return {
    rm: rm,
    comparar: comparar,
    analizar: analizar,
    porcentaje: porcentaje,
  };
})();
