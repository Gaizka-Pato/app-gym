// Récords de un ejercicio. Una serie es récord si, comparada con todas las anteriores:
//   - su 1RM estimado (Epley, hasta 12 repeticiones) es el mayor hasta entonces, o
//   - nunca se habían hecho tantas repeticiones con ese peso o más (récord de repeticiones con ese peso).
// La primera serie de un ejercicio no cuenta como récord: no hay con qué comparar.
var Records = (function () {
  function rm(kg, reps) {
    return kg > 0 && reps > 0 && reps <= 12 ? Math.round(kg * (1 + reps / 30) * 10) / 10 : 0;
  }

  // anteriores: [[kg, reps]]. Devuelve { rm: nuevo 1RM si es récord o null, reps: bool, rmAnterior }.
  function comparar(anteriores, kg, reps) {
    var mejorRm = 0;
    var superada = false;
    anteriores.forEach(function (s) {
      mejorRm = Math.max(mejorRm, rm(s[0], s[1]));
      if (s[0] >= kg && s[1] >= reps) superada = true;
    });
    var nuevo = rm(kg, reps);
    var hayHistoria = anteriores.length > 0;
    return {
      rm: hayHistoria && nuevo > mejorRm ? nuevo : null,
      reps: hayHistoria && reps > 0 && !superada,
      rmAnterior: mejorRm,
    };
  }

  // dias: [{ f: 'aaaa-mm-dd', s: [[kg, reps]] }] en orden de fecha.
  // Devuelve las series que fueron récord en su momento ({ 'fecha|índice': ['rm', 'reps'] }) y las mejores marcas.
  function analizar(dias) {
    var anteriores = [];
    var marcas = {};
    var mejorRm = null;
    var pesoMax = null;
    var porPeso = {};
    dias.forEach(function (d) {
      d.s.forEach(function (s, i) {
        var kg = Number(s[0]) || 0;
        var reps = Number(s[1]) || 0;
        var c = comparar(anteriores, kg, reps);
        var tipos = [];
        if (c.rm) tipos.push('rm');
        if (c.reps) tipos.push('reps');
        if (tipos.length) marcas[d.f + '|' + i] = tipos;

        var r = rm(kg, reps);
        if (r && (!mejorRm || r > mejorRm.rm)) mejorRm = { rm: r, kg: kg, reps: reps, f: d.f };
        if (!pesoMax || kg > pesoMax.kg || (kg === pesoMax.kg && reps > pesoMax.reps)) pesoMax = { kg: kg, reps: reps, f: d.f };
        if (!porPeso[kg] || reps > porPeso[kg].reps) porPeso[kg] = { kg: kg, reps: reps, f: d.f };
        anteriores.push([kg, reps]);
      });
    });
    var repsPorPeso = Object.keys(porPeso).map(function (k) { return porPeso[k]; })
      .sort(function (a, b) { return b.kg - a.kg; });
    return { marcas: marcas, mejorRm: mejorRm, pesoMax: pesoMax, repsPorPeso: repsPorPeso };
  }

  return { rm: rm, comparar: comparar, analizar: analizar };
})();
