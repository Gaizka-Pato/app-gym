// Rebaja del peso cuando no salen las repeticiones. El 1RM del ciclo no se toca (eso lo hace el AMRAP): solo cambian
// los kg que propone la app, y la diferencia con lo proyectado se ve en "Estimado vs realizado".
// - En el día: si una serie se queda corta, las siguientes proponen el peso con el que salen las reps que pide el Excel.
// - El siguiente día de ese ejercicio: si la última vez faltaron reps, toda la columna sale rebajada en la misma
//   proporción. Si la última vez se completó todo, vuelven los kg del Excel.
// - Secundarios (sin kg en el Excel): el peso de trabajo de la última vez; si salieron todas las reps (el tope del
//   rango, "12-15" → 15), sube: al menos un paso, y si se hicieron de más (14 × 12 pidiendo 8), el peso con el que
//   salen las reps que se piden (Epley, hacia abajo: 16 × 8). Si faltaron, rebajado como arriba.
// - Principales con el peso del cuerpo: no hay kg que bajar; se ajustan las repeticiones (al final del archivo).
// La relación entre repeticiones y % es la del Excel (Records.porcentaje: 6→70 %, 5→74 %, 4→78 %, 3→82 %).
// Una serie es corta si no llega a lo que pide el Excel (en un rango, a su mínimo: "12-15" → 12).
var Ajuste = (function () {
  // Discos de 1,25 por lado: saltos de 2,5 kg. Por debajo de 15 kg (poleas ligeras), de 1 kg.
  // Las mancuernas van de 2 en 2 (no hay impares): kilos pares, y en un empate el de abajo (25 → 24).
  function redondear(kg, material) {
    if (material === 'mancuernas') return Math.max(2, Math.ceil(kg / 2 - 0.5) * 2);
    return kg < 15 ? Math.round(kg) : Math.round(kg / 2.5) * 2.5;
  }

  function paso(kg, material) {
    if (material === 'mancuernas') return 2;
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
  // Hacia abajo, para no pasarse al subir: de 2 en 2 con mancuernas, de 1 por debajo de 15 kg, si no de 2,5.
  function redondearAbajo(kg, material) {
    if (material === 'mancuernas') return Math.max(2, Math.floor(kg / 2) * 2);
    return kg < 15 ? Math.floor(kg) : Math.floor(kg / 2.5 + 1e-9) * 2.5;
  }

  // Peso con el que saldrían `objetivo` reps, si con kg salieron reps (1RM de Epley, que vale para más de 6 reps).
  function pesoPara(kg, reps, objetivo) {
    return kg * (1 + Math.min(reps, 20) / 30) / (1 + objetivo / 30);
  }

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
  function kgEnElDia(hechas, seriesPlan, i, material) {
    var previas = (hechas || []).filter(function (s) { return s.serie <= i && s.kg > 0 && s.reps > 0; })
      .sort(function (a, b) { return a.serie - b.serie; });
    if (!previas.some(function (s) { return corta(s, seriesPlan); })) return null;
    var ultima = previas[previas.length - 1];
    var objetivoUltima = repsPlan(seriesPlan, ultima.serie - 1) || ultima.reps;
    var objetivo = repsPlan(seriesPlan, i) || objetivoUltima;
    // Peso para las reps de la última serie y, de ahí, para las que pide esta.
    return redondear(capacidad(ultima.kg, ultima.reps, objetivoUltima) *
      Records.porcentaje(objetivo) / Records.porcentaje(objetivoUltima), material);
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
    var kg = redondear(col.kg * factor, Grupos.materialDe(nombre));
    return kg < col.kg ? { kg: kg, kgExcel: col.kg, fecha: fecha } : null;
  }

  // ---- Secundarios, weak points y jump: doble progresión con subida escalonada (él, 2026-10-06) ----
  // Antes miraba solo la última sesión: subía en cuanto todas llegaban al tope (16 × 15 → 18 × 12, que en unas
  // laterales es un 12 % de golpe) y un solo día malo bajaba el peso. Ahora:
  // - Subir: cuando todas las obligatorias llegan al tope del rango o a una ("12-15" → 14). Si con el peso nuevo
  //   salen (Epley) las reps del mínimo del rango, sube todo; si no, **escalonado**: el peso nuevo entra serie a
  //   serie con las reps que dan de sí (nunca menos de 6) y el resto con el de antes (16 × 15 → 18 × 9 + 16 × 12,
  //   luego 18 × 9 × 2 + 16 × 12…). Si una serie del peso nuevo no sale, se repite ese paso; dos veces seguidas,
  //   se vuelve al peso de antes. Con todas al peso nuevo, +1 rep cada vez que salgan (o a una) hasta el rango.
  // - Bajar: solo si dos sesiones seguidas con ese peso se quedan por debajo del mínimo; una sola, se repite.
  // - Aviso: 4 sesiones con el mismo peso sin sumar reps.
  // Se compara con la última vez en el mismo entreno (no se rinde igual después del press que al principio).
  // Cada serie apuntada guarda lo que tocaba (kgObjetivo, repsObjetivo): con eso se sabe en qué paso se está.

  // Reps que salen con kg2 sabiendo que con kg salieron reps (Epley hacia abajo).
  function repsCon(kg, reps, kg2) {
    return Math.floor(30 * (kg * (1 + Math.min(reps, 20) / 30) / kg2 - 1) + 1e-9);
  }

  // Lo que pedía la serie s: lo guardado al apuntarla o, si es de antes, el mínimo del rango de hoy.
  function objetivoDe(s, planHoy) {
    return s.repsObjetivo > 0 ? s.repsObjetivo : repsPlan(planHoy, s.serie - 1) || repsPlan(planHoy, 0);
  }

  // sesiones: [{ fecha, series: [{ serie, kg, reps, kgObjetivo, repsObjetivo }] }] de la más vieja a la más nueva.
  // planHoy: las series que pide hoy el plan ({ reps: '12-15', opcional }).
  // Devuelve { kg, antes, cambio: 'sube' | 'baja' | null, series: [{ kg, reps }] (reps null: las del plan),
  //   resumen (para el objetivo, solo si las series no van iguales), texto (por qué), aviso } o null.
  function progresion(sesiones, planHoy, material) {
    var S = sesiones[sesiones.length - 1];
    var validas = S ? S.series.filter(function (s) { return s.kg > 0 && s.reps > 0; }) : [];
    if (!validas.length) return null;
    var total = (planHoy || []).length || validas.length;
    var n = (planHoy || []).filter(function (s) { return !s.opcional; }).length || total;
    var rMin = repsPlan(planHoy, 0);
    var mismas = function (kg, reps) { var l = []; for (var i = 0; i < total; i++) l.push({ kg: kg, reps: reps }); return l; };
    var f = function (kg) { return String(Math.round(kg * 100) / 100).replace('.', ','); };
    function escalon(kgNuevo, reps, k, kgViejo) {
      var l = [];
      for (var i = 0; i < total; i++) l.push(i < k ? { kg: kgNuevo, reps: reps } : { kg: kgViejo, reps: null });
      return l;
    }

    // Series del peso nuevo (las que pedían menos reps que el rango) y las de antes.
    var nuevas = validas.filter(function (s) { return s.repsObjetivo > 0 && rMin && s.repsObjetivo < rMin; });
    var viejas = validas.filter(function (s) { return nuevas.indexOf(s) < 0; });

    if (nuevas.length) {
      var kgNuevo = Math.max.apply(null, nuevas.map(function (s) { return s.kg; }));
      var t = Math.min.apply(null, nuevas.map(function (s) { return s.repsObjetivo; }));
      if (viejas.length) {
        // A medio escalón.
        var kgViejo = pesoDeTrabajo(viejas);
        var salen = nuevas.every(function (s) { return s.reps >= s.repsObjetivo; });
        var k = nuevas.length + (salen ? 1 : 0);
        if (!salen) {
          var A = sesiones[sesiones.length - 2];
          var antesFallo = A && A.series.some(function (s) { return s.kg === kgNuevo && s.repsObjetivo > 0 && s.reps < s.repsObjetivo; });
          if (antesFallo) {
            return { kg: kgViejo, antes: kgNuevo, cambio: 'baja', series: mismas(kgViejo, null),
              texto: 'El ' + f(kgNuevo) + ' × ' + t + ' no salió dos veces seguidas: vuelves a ' + f(kgViejo) + ' kg' };
          }
        }
        if (k >= n) {
          return { kg: kgNuevo, antes: kgViejo, cambio: 'sube', series: mismas(kgNuevo, t),
            resumen: f(kgNuevo) + ' kg × ' + t, texto: 'Ya todas con ' + f(kgNuevo) + ' kg: ahora a sumar reps hasta ' + rMin };
        }
        return { kg: kgNuevo, antes: kgViejo, cambio: salen ? 'sube' : null, series: escalon(kgNuevo, t, k, kgViejo),
          resumen: f(kgNuevo) + ' × ' + t + (k > 1 ? ' en ' + k + ' series' : ' en la 1ª') + ' + ' + f(kgViejo) + ' kg',
          texto: salen ? 'Salió el ' + f(kgNuevo) + ' × ' + t + ': ahora en ' + k + ' series'
            : 'No salió el ' + f(kgNuevo) + ' × ' + t + ': lo repites (si vuelve a fallar, vuelves a ' + f(kgViejo) + ')' };
      }
      // Todas con el peso nuevo: a sumar reps.
      var bien = nuevas.length >= n && nuevas.every(function (s) { return s.reps >= s.repsObjetivo - 1; });
      var t2 = bien ? t + 1 : t;
      if (t2 >= rMin) {
        return { kg: kgNuevo, antes: kgNuevo, cambio: null, series: mismas(kgNuevo, null),
          texto: f(kgNuevo) + ' kg ya en el rango: a por ' + planHoy[0].reps };
      }
      return { kg: kgNuevo, antes: kgNuevo, cambio: null, series: mismas(kgNuevo, t2), resumen: f(kgNuevo) + ' kg × ' + t2,
        texto: bien ? 'Con ' + f(kgNuevo) + ' kg: una rep más, a por ' + t2 : 'Con ' + f(kgNuevo) + ' kg: repites ' + t };
    }

    // Normal: todas con el mismo peso, dentro del rango.
    var trabajo = pesoDeTrabajo(validas);
    var igual = material === 'mancuernas' ? redondear(trabajo, material) : trabajo;
    var completas = validas.filter(function (s) {
      var tope = repsTope(planHoy, s.serie - 1) || repsTope(planHoy, 0);
      return s.kg >= trabajo && tope != null && s.reps >= tope - 1;
    });
    if (completas.length >= n) {
      // La peor de las completas: con su 1RM, cuántas reps salen con el peso de arriba.
      var peor = completas.reduce(function (m, s) { return !m || s.kg * (1 + s.reps / 30) < m.kg * (1 + m.reps / 30) ? s : m; }, null);
      var arriba = redondear(trabajo + paso(trabajo, material), material);
      var salenArriba = repsCon(peor.kg, peor.reps, arriba);
      if (!rMin || salenArriba >= rMin) {
        // Da para subir entero, y con reps de sobra quizá para más de un paso.
        var porReps = rMin ? redondearAbajo(pesoPara(peor.kg, peor.reps, rMin), material) : arriba;
        var nuevo = Math.max(arriba, porReps);
        return { kg: nuevo, antes: trabajo, cambio: 'sube', series: mismas(nuevo, null),
          texto: 'Sube de ' + f(trabajo) + ' a ' + f(nuevo) + ' kg: la última vez hiciste ' + f(peor.kg) + ' × ' + peor.reps };
      }
      var reps = Math.max(6, Math.min(salenArriba, rMin - 1));
      return { kg: arriba, antes: trabajo, cambio: 'sube', series: escalon(arriba, reps, 1, trabajo),
        resumen: f(arriba) + ' × ' + reps + ' en la 1ª + ' + f(trabajo) + ' kg',
        texto: 'Subida escalonada: con ' + f(peor.kg) + ' × ' + peor.reps + ' te salen unas ' + Math.max(salenArriba, 1) +
          ' con ' + f(arriba) + '. Primero en una serie y, si sale, en más' };
    }
    var cortas = validas.filter(function (s) { return s.reps < objetivoDe(s, planHoy); });
    if (cortas.length) {
      var A2 = sesiones[sesiones.length - 2];
      var a2 = A2 ? A2.series.filter(function (s) { return s.kg > 0 && s.reps > 0; }) : [];
      var antesCorta = a2.length && pesoDeTrabajo(a2) === trabajo && a2.some(function (s) { return s.reps < objetivoDe(s, planHoy); });
      if (antesCorta && rMin) {
        var kg = Math.min.apply(null, cortas.map(function (s) { return capacidad(s.kg, s.reps, rMin); }));
        kg = Math.min(redondear(kg, material), trabajo);
        if (material === 'mancuernas') kg = Math.max(2, Math.floor(kg / 2) * 2);
        if (kg < trabajo) {
          return { kg: kg, antes: trabajo, cambio: 'baja', series: mismas(kg, null),
            texto: 'Baja de ' + f(trabajo) + ' a ' + f(kg) + ' kg: dos sesiones seguidas sin llegar a ' + rMin };
        }
      }
      return { kg: igual, antes: trabajo, cambio: null, series: mismas(igual, null),
        texto: 'La última vez faltaron reps: repites ' + f(igual) + ' kg (si vuelve a pasar, baja)' };
    }
    // Mismo peso. Aviso si lleva 4 sesiones con él sin sumar reps.
    var aviso = null;
    var ultimas = sesiones.slice(-4).map(function (x) { return x.series.filter(function (s) { return s.kg > 0 && s.reps > 0; }); });
    if (ultimas.length === 4 && ultimas.every(function (l) { return l.length && pesoDeTrabajo(l) === trabajo; })) {
      var suma = function (l) { return l.reduce(function (t, s) { return t + s.reps; }, 0); };
      if (suma(ultimas[3]) <= suma(ultimas[0])) aviso = '4 sesiones con ' + f(trabajo) + ' kg sin sumar reps';
    }
    return { kg: igual, antes: trabajo, cambio: igual < trabajo ? 'baja' : igual > trabajo ? 'sube' : null, series: mismas(igual, null),
      texto: null, aviso: aviso };
  }

  // Lo que pedía el Excel el día de una serie guardada en el móvil (su entreno, columna y ejercicio).
  function planDe(s) {
    var plan = Almacen.plan();
    var ej = ((plan && plan.entrenos && plan.entrenos[s.entreno]) || []).filter(function (e) { return e.id === s.ejercicioId; })[0];
    return (ej && ej.columnas[s.columna - 1]) || null;
  }

  // Sesiones anteriores a hoy de un ejercicio: las del móvil (con su entreno y lo que tocaba), y si hay del mismo
  // entreno, solo esas; si no hay ninguna en el móvil, las del historial (FitNotes).
  // hasta (opcional): solo las de antes de ese día (para saber qué tocaba un día pasado).
  function sesionesDe(nombre, entreno, hasta) {
    var clave = Grupos.normalizar(nombre);
    var hoy = hasta || Almacen.hoyISO();
    var suyas = Almacen.series().filter(function (s) { return s.fecha < hoy && Grupos.normalizar(s.ejercicio) === clave; });
    if (entreno && suyas.some(function (s) { return s.entreno === entreno; })) suyas = suyas.filter(function (s) { return s.entreno === entreno; });
    var porDia = {};
    suyas.forEach(function (s) { (porDia[s.fecha] = porDia[s.fecha] || []).push(s); });
    var fechas = Object.keys(porDia).sort();
    if (fechas.length) {
      return fechas.map(function (fecha) {
        return { fecha: fecha, series: porDia[fecha].slice().sort(function (a, b) { return a.serie - b.serie; }).map(function (s, i) {
          return { serie: s.serie || i + 1, kg: Number(s.kg) || 0, reps: Number(s.reps) || 0,
            kgObjetivo: s.kgObjetivo, repsObjetivo: Number(s.repsObjetivo) || null };
        }) };
      });
    }
    var dias = (((Almacen.historial() || {}).ejercicios || {})[clave] || []).filter(function (d) { return d.f < hoy; });
    return dias.map(function (d) {
      return { fecha: d.f, series: d.s.map(function (s, i) { return { serie: i + 1, kg: s[0], reps: s[1] }; }) };
    });
  }

  // Proyección de un secundario para las columnas de un ciclo, como la de los principales (él, 2026-10-06): desde
  // las sesiones de antes de `desde` (el inicio del ciclo) se aplica la regla columna a columna suponiendo que se
  // cumple todo (las series normales llegan al tope del rango y las del escalón salen). Devuelve, por columna, el
  // peso de trabajo previsto (el mayor de sus series) y las series ([{ kg, reps }]); null sin sesiones de antes.
  function simular(sesiones, columnas, material) {
    var ses = sesiones.slice();
    if (!ses.length) return null;
    return columnas.map(function (col, i) {
      var p = progresion(ses, (col || {}).series, material);
      if (!p) return null;
      var planCol = (col || {}).series || [];
      ses.push({ fecha: 'proyeccion-' + i, series: p.series.map(function (s, k) {
        var rMinK = repsPlan(planCol, k) || repsPlan(planCol, 0);
        return { serie: k + 1, kg: s.kg, reps: s.reps || repsTope(planCol, k) || rMinK || 0, kgObjetivo: s.kg, repsObjetivo: s.reps || rMinK };
      }) });
      return { kg: Math.max.apply(null, p.series.map(function (s) { return s.kg; })), series: p.series };
    });
  }

  function proyeccion(nombre, columnas, entreno, desde) {
    return simular(sesionesDe(nombre, entreno, desde), columnas, Grupos.materialDe(nombre));
  }

  // Propuesta de hoy para un secundario en ese entreno.
  function secundario(nombre, col, entreno, hasta) {
    if (!col) return null;
    return progresion(sesionesDe(nombre, entreno, hasta), col.series, Grupos.materialDe(nombre));
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
    redondear: redondear, kgEnElDia: kgEnElDia, rebaja: rebaja, deHoy: deHoy, progresion: progresion, secundario: secundario, simular: simular, proyeccion: proyeccion,
    repsEnElDia: repsEnElDia, maximoDeSesion: maximoDeSesion, maximoDeHoy: maximoDeHoy,
  };
})();
