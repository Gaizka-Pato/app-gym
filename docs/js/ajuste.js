// Rebaja del peso cuando no salen las repeticiones. El 1RM del ciclo no se toca (eso lo hace el AMRAP): solo cambian
// los kg que propone la app, y la diferencia con lo proyectado se ve en "Estimado vs realizado".
// - En el día: si una serie se queda corta, las siguientes proponen el peso con el que salen las reps que pide el Excel.
// - El siguiente día de ese ejercicio: si la última vez faltaron reps, toda la columna sale rebajada en la misma
//   proporción. Si la última vez se completó todo, vuelven los kg del Excel.
// - Secundarios (sin kg en el Excel): el peso de trabajo de la última vez; si salieron todas las reps (el tope del
//   rango, "12-15" → 15), un paso más; si faltaron, rebajado como arriba.
// - Principales con el peso del cuerpo: no hay kg que bajar; se ajustan las repeticiones (al final del archivo).
// La relación entre repeticiones y % es la del Excel (Records.porcentaje: 6→70 %, 5→74 %, 4→78 %, 3→82 %).
// Una serie es corta si no llega a lo que pide el Excel (en un rango, a su mínimo: "12-15" → 12).
var Ajuste = (function () {
  // Discos de 1,25 por lado: saltos de 2,5 kg. Por debajo de 15 kg (mancuernas, poleas ligeras), de 1 kg.
  function redondear(kg) {
    return kg < 15 ? Math.round(kg) : Math.round(kg / 2.5) * 2.5;
  }

  function paso(kg) {
    return kg < 15 ? 1 : 2.5;
  }

  function repsPlan(seriesPlan, i) {
    var r = parseInt(((seriesPlan || [])[i] || {}).reps, 10);
    return r > 0 ? r : null;
  }

  // Tope del rango de repeticiones ("12-15" → 15, "10" → 10).
  function repsTope(seriesPlan, i) {
    var m = String(((seriesPlan || [])[i] || {}).reps || '').match(/(\d+)\s*$/);
    return m ? Number(m[1]) : null;
  }

  // Peso de trabajo de una sesión: el que más se repite; si empatan, el mayor.
  function pesoDeTrabajo(series) {
    var veces = {};
    series.forEach(function (s) { veces[s.kg] = (veces[s.kg] || 0) + 1; });
    return Object.keys(veces).map(Number).sort(function (a, b) { return veces[b] - veces[a] || b - a; })[0];
  }

  // Serie corta: le faltan repeticiones respecto a lo que pedía el Excel.
  function corta(s, seriesPlan) {
    var objetivo = repsPlan(seriesPlan, s.serie - 1);
    return objetivo != null && s.kg > 0 && s.reps > 0 && s.reps < objetivo;
  }

  // Peso con el que saldrían las reps que pide el Excel, sabiendo que con kg salieron reps (sin redondear).
  function capacidad(kg, reps, objetivo) {
    return kg * Records.porcentaje(objetivo) / Records.porcentaje(Math.min(reps, objetivo));
  }

  // Kg para la serie i (desde 0) según lo hecho hoy, o null si no hay que tocar el peso porque no ha habido serie corta.
  // Tras una serie corta, la siguiente sale de la última hecha: si esa ya salió bien con el peso rebajado, se mantiene.
  function kgEnElDia(hechas, seriesPlan, i) {
    var previas = (hechas || []).filter(function (s) { return s.serie <= i && s.kg > 0 && s.reps > 0; })
      .sort(function (a, b) { return a.serie - b.serie; });
    if (!previas.some(function (s) { return corta(s, seriesPlan); })) return null;
    var ultima = previas[previas.length - 1];
    var objetivoUltima = repsPlan(seriesPlan, ultima.serie - 1) || ultima.reps;
    var objetivo = repsPlan(seriesPlan, i) || objetivoUltima;
    // Peso para las reps de la última serie y, de ahí, para las que pide esta.
    return redondear(capacidad(ultima.kg, ultima.reps, objetivoUltima) *
      Records.porcentaje(objetivo) / Records.porcentaje(objetivoUltima));
  }

  // Proporción (menor que 1) en la que bajar los kg del Excel por una sesión con series cortas, o null si se completó.
  // Sale de la peor serie corta: el peso con el que habrían salido sus reps frente al que pedía el Excel ese día.
  function rebaja(series, seriesPlan, kgPlan) {
    if (!(kgPlan > 0)) return null;
    var factor = null;
    (series || []).forEach(function (s) {
      if (!corta(s, seriesPlan)) return;
      var f = capacidad(s.kg, s.reps, repsPlan(seriesPlan, s.serie - 1)) / kgPlan;
      if (factor == null || f < factor) factor = f;
    });
    return factor != null && factor < 1 ? factor : null;
  }

  // Rebaja de hoy para un principal, mirando la última sesión de ese ejercicio guardada en el móvil (21 días).
  // Si fue en la columna AMRAP no hay rebaja: ahí empieza un ciclo con 1RM nuevo.
  // Devuelve { kg, kgExcel, fecha } o null.
  function deHoy(nombre, col) {
    if (!(col && col.kg > 0)) return null;
    var clave = Grupos.normalizar(nombre);
    var hoy = Almacen.hoyISO();
    var suyas = Almacen.series().filter(function (s) {
      return s.tipo === 'principal' && s.fecha < hoy && Grupos.normalizar(s.ejercicio) === clave;
    });
    var fecha = suyas.reduce(function (m, s) { return !m || s.fecha > m ? s.fecha : m; }, null);
    if (!fecha) return null;
    var sesion = suyas.filter(function (s) { return s.fecha === fecha; });
    var primera = sesion[0];
    if (primera.columna === Calendario.COLUMNAS) return null;
    var colEseDia = planDe(primera);
    if (!colEseDia) return null;
    var kgEseDia = primera.sustituye ? Grupos.kgDesdeRM(Grupos.rmDe(nombre), colEseDia.detalle) : colEseDia.kg;
    var factor = rebaja(sesion, colEseDia.series, kgEseDia);
    if (factor == null) return null;
    var kg = redondear(col.kg * factor);
    return kg < col.kg ? { kg: kg, kgExcel: col.kg, fecha: fecha } : null;
  }

  // Peso para hoy en un secundario según su última sesión. hechas: [{ serie, kg, reps }]; planAntes: las series que
  // pedía el Excel ese día; planHoy: las de hoy. Devuelve { kg, antes, cambio: 'sube' | 'baja' | null } o null.
  function propuesta(hechas, planAntes, planHoy) {
    var validas = (hechas || []).filter(function (s) { return s.kg > 0 && s.reps > 0; });
    if (!validas.length) return null;
    var trabajo = pesoDeTrabajo(validas);
    var cortas = validas.filter(function (s) { return corta(s, planAntes); });
    var objetivoHoy = repsPlan(planHoy, 0);
    if (cortas.length) {
      if (!objetivoHoy) return { kg: trabajo, antes: trabajo, cambio: null };
      var kg = Math.min.apply(null, cortas.map(function (s) { return capacidad(s.kg, s.reps, objetivoHoy); }));
      kg = Math.min(redondear(kg), trabajo);
      return { kg: kg, antes: trabajo, cambio: kg < trabajo ? 'baja' : null };
    }
    var obligatorias = (planAntes || []).filter(function (s) { return !s.opcional; }).length;
    var completas = validas.filter(function (s) {
      var tope = repsTope(planAntes, s.serie - 1);
      return s.kg >= trabajo && tope != null && s.reps >= tope;
    });
    if (obligatorias && completas.length >= obligatorias) return { kg: trabajo + paso(trabajo), antes: trabajo, cambio: 'sube' };
    return { kg: trabajo, antes: trabajo, cambio: null };
  }

  // Lo que pedía el Excel el día de una serie guardada en el móvil (su entreno, columna y ejercicio).
  function planDe(s) {
    var plan = Almacen.plan();
    var ej = ((plan && plan.entrenos && plan.entrenos[s.entreno]) || []).filter(function (e) { return e.id === s.ejercicioId; })[0];
    return (ej && ej.columnas[s.columna - 1]) || null;
  }

  // Propuesta de hoy para un secundario. La última sesión sale del móvil o, si no está, del historial; lo que se
  // pedía ese día solo se sabe si está en el móvil, y si no se compara con lo que se pide hoy.
  function secundario(nombre, col) {
    var ultima = Almacen.ultimaVez(nombre);
    if (!ultima || !col) return null;
    var clave = Grupos.normalizar(nombre);
    var locales = Almacen.series().filter(function (s) { return s.fecha === ultima.fecha && Grupos.normalizar(s.ejercicio) === clave; });
    var colEseDia = locales.length ? planDe(locales[0]) : null;
    var hechas = ultima.series.map(function (s, i) { return { serie: i + 1, kg: s[0], reps: s[1] }; });
    return propuesta(hechas, (colEseDia || col).series, col.series);
  }

  // ---- Principales con el peso del cuerpo (dominadas): lo mismo, pero en repeticiones ----
  // La base es el máximo de repeticiones y cada columna pide ROUND(máximo × %). Si no salen, se ajusta igual que
  // con la barra, sin tocar el máximo (eso lo hace el AMRAP) y sin tocar el Excel: "Estimado vs realizado" enseña lo
  // que tocaba frente a lo que se hizo.

  function pctDe(detalle) {
    var m = String(detalle || '').match(/(\d+(?:[.,]\d+)?)\s*%/);
    return m ? Number(m[1].replace(',', '.')) / 100 : null;
  }

  // En el día: tras una serie corta, las siguientes piden lo que salió en la última (nunca más de lo de hoy).
  function repsEnElDia(hechas, objetivo, i) {
    if (!(objetivo > 0)) return null;
    var previas = (hechas || []).filter(function (s) { return s.serie <= i && s.reps > 0; })
      .sort(function (a, b) { return a.serie - b.serie; });
    if (!previas.some(function (s) { return s.reps < objetivo; })) return null;
    return Math.min(objetivo, previas[previas.length - 1].reps);
  }

  // Máximo que implica una sesión con series cortas: reps ÷ % de ese día, de la peor serie. null si se completó.
  function maximoDeSesion(series, seriesPlan, detalle) {
    var pct = pctDe(detalle);
    if (!pct) return null;
    var maximo = null;
    (series || []).forEach(function (s) {
      var objetivo = repsPlan(seriesPlan, s.serie - 1);
      if (objetivo == null || !(s.reps > 0) || s.reps >= objetivo) return;
      var m = s.reps / pct;
      if (maximo == null || m < maximo) maximo = m;
    });
    return maximo;
  }

  // Máximo rebajado para hoy, mirando la última sesión de ese ejercicio en el móvil (fuera del AMRAP). Si entonces
  // se completó todo, vuelve el del Excel. Devuelve { maximo, fecha } o null.
  function maximoDeHoy(nombre, maximo) {
    if (!(maximo > 0)) return null;
    var clave = Grupos.normalizar(nombre);
    var hoy = Almacen.hoyISO();
    var suyas = Almacen.series().filter(function (s) {
      return s.tipo === 'principal' && s.fecha < hoy && Grupos.normalizar(s.ejercicio) === clave;
    });
    var fecha = suyas.reduce(function (m, s) { return !m || s.fecha > m ? s.fecha : m; }, null);
    if (!fecha) return null;
    var sesion = suyas.filter(function (s) { return s.fecha === fecha; });
    if (sesion[0].columna === Calendario.COLUMNAS) return null;
    var colEseDia = planDe(sesion[0]);
    if (!colEseDia) return null;
    var m = maximoDeSesion(sesion, colEseDia.series, colEseDia.detalle);
    return m != null && m < maximo ? { maximo: m, fecha: fecha } : null;
  }

  return {
    kgEnElDia: kgEnElDia, rebaja: rebaja, deHoy: deHoy, propuesta: propuesta, secundario: secundario,
    repsEnElDia: repsEnElDia, maximoDeSesion: maximoDeSesion, maximoDeHoy: maximoDeHoy,
  };
})();
