// La rutina que crea cada uno en la app: sus entrenos, sus ejercicios y sus días. Sustituye a las pestañas
// "Entreno A1…B2" del Excel. Sirve para la app (navegador) y para las pruebas de Node, por eso no usa módulos.
//
// rutina = {
//   version: 1,
//   dias: { patron: 'EEDEEDD', inicio, fin },   // E = entreno, D = descanso, de lunes a domingo (una o dos semanas
//                                                // que se alternan); inicio y fin del ciclo, 'aaaa-mm-dd'
//   semanas: 8, amrap: true,                     // columnas del ciclo (salen del inicio y el fin); con amrap, la
//                                                // última es el AMRAP. Acabado el ciclo, empieza otro igual.
//   entrenos: [{ id: 'A1', nombre: 'Push / Cuádriceps', ejercicios: [ejercicio…] }],   // en orden de rotación
// }
//   progresiones: [{ id: 'P1', nombre: 'Progresión 1', semanas: [{ series: '4x6', pct: 70 }, …], sube: 2.5 }],
//                  // sube: kg que se suman cada semana (entonces solo cuenta el % de la primera)
//                  // lo que cambia de una semana a otra, una fila por semana: series, y en los principales el %
//                  // (una semana puede traer sus reps, como "AMRAP"). Se pone una vez y la usan varios ejercicios.
// }
// ejercicio = {
//   id, nombre, tipo: 'principal' | 'secundario' | 'debil',
//   rm,                    // principal: 1RM del ciclo (kg; en las asistidas, la ayuda)
//   progresion: 'P1',      // su esquema de semanas; reps: las suyas ("12", "10-12") en las semanas que no traen
//   descanso: 120, nota,   // para todas las semanas (descansos / notas: una por semana, si cambian)
//   junto: true,           // jump set con el ejercicio siguiente
//   dropset: { bajadas: 2, porcentaje: 20 },   // tras la última serie, bajar N veces ese % sin descanso
//   semanas: [{ series: '3', reps: '12' }, …]   // los que no van por progresión: una fila si todas las semanas
//                                                // son iguales, o una por semana
// }
// `series` es texto como en el Excel ("4x6", "3 o 4 x 12", "2x8 + 2x7"): lo interpreta Plan.seriesPlan.
var Rutina = (function () {
  var DIA = 24 * 60 * 60 * 1000;

  function mod(a, n) {
    return ((a % n) + n) % n;
  }

  function utc(fechaISO) {
    var p = fechaISO.split('-').map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]);
  }

  function diasEntre(desdeISO, hastaISO) {
    return Math.round((utc(hastaISO) - utc(desdeISO)) / DIA);
  }

  function sumarDias(fechaISO, n) {
    return new Date(utc(fechaISO) + n * DIA).toISOString().slice(0, 10);
  }

  // 0 = lunes … 6 = domingo.
  function diaSemana(fechaISO) {
    return mod(new Date(utc(fechaISO)).getUTCDay() - 1, 7);
  }

  function patronDe(rutina) {
    var p = String((rutina.dias && rutina.dias.patron) || 'ED').toUpperCase().replace(/[^ED]/g, '');
    return p.indexOf('E') >= 0 ? p : 'ED';
  }

  function columnas(rutina) {
    return Math.max(1, rutina.semanas || 1);
  }

  function esAmrap(rutina, columna) {
    return !!rutina.amrap && columna === columnas(rutina);
  }

  function nombreColumna(rutina, columna) {
    return esAmrap(rutina, columna) ? 'AMRAP' : columnas(rutina) > 1 ? 'Semana ' + columna : '';
  }

  // Sesión n.º k (desde 0) → entreno y columna. Cada vuelta completa a los entrenos es una columna.
  function sesion(rutina, k) {
    var n = rutina.entrenos.length || 1;
    return {
      entreno: rutina.entrenos.length ? rutina.entrenos[mod(k, n)].id : null,
      columna: mod(Math.floor(k / n), columnas(rutina)) + 1,
    };
  }

  // Cuántos días de entreno hay antes del día n (contado desde el ancla del patrón).
  function sesionesAntes(patron, n) {
    var enUnaVuelta = patron.split('E').length - 1;
    var p = mod(n, patron.length);
    return Math.floor(n / patron.length) * enUnaVuelta + (patron.slice(0, p).split('E').length - 1);
  }

  // Un patrón de una o dos semanas empieza en lunes (el de la semana del inicio); uno de otra longitud, el
  // día de inicio.
  function ancla(rutina) {
    var inicio = rutina.dias.inicio;
    return patronDe(rutina).length % 7 === 0 ? sumarDias(inicio, -diaSemana(inicio)) : inicio;
  }

  function esEntreno(rutina, fechaISO) {
    var patron = patronDe(rutina);
    return patron.charAt(mod(diasEntre(ancla(rutina), fechaISO), patron.length)) === 'E';
  }

  // Días de entreno desde el inicio hasta la fecha (sin contarla). En un descanso, la sesión que sale es la
  // siguiente que toca.
  function sesionesHasta(rutina, fechaISO) {
    var patron = patronDe(rutina);
    var a = ancla(rutina);
    return sesionesAntes(patron, diasEntre(a, fechaISO)) - sesionesAntes(patron, diasEntre(a, rutina.dias.inicio));
  }

  // Semanas del ciclo que caben entre el inicio y el fin: cada vuelta a todos los entrenos es una.
  function semanasEntre(rutina, finISO) {
    var n = rutina.entrenos.length || 1;
    return Math.max(1, Math.ceil(sesionesHasta(rutina, sumarDias(finISO, 1)) / n));
  }

  // Lo que toca según los días de la rutina, sin mirar lo que se ha apuntado.
  function porCalendario(rutina, fechaISO) {
    var antes = fechaISO < rutina.dias.inicio;
    var s = sesion(rutina, antes ? 0 : sesionesHasta(rutina, fechaISO));
    s.descanso = antes || !esEntreno(rutina, fechaISO);
    if (antes) s.empieza = rutina.dias.inicio;
    return s;
  }

  // Como Calendario.siguiente: lo empezado hoy sigue en curso; en un descanso tras un día de entreno sin
  // completar se puede recuperar.
  function siguiente(rutina, ultima, hoyISO, pendienteAyer) {
    if (ultima && ultima.fecha === hoyISO) return { entreno: ultima.entreno, columna: ultima.columna, enCurso: true };
    var hoy = porCalendario(rutina, hoyISO);
    if (hoy.descanso && pendienteAyer) {
      var ayer = porCalendario(rutina, sumarDias(hoyISO, -1));
      if (!ayer.descanso) return { entreno: ayer.entreno, columna: ayer.columna, recuperar: true };
    }
    return hoy;
  }

  // Los próximos días de entreno desde una fecha (para el calendario y para enseñar "Mañana: …").
  function proximos(rutina, desdeISO, cuantos) {
    var lista = [];
    for (var i = 0; lista.length < cuantos && i < 400; i++) {
      var f = sumarDias(desdeISO, i);
      var t = porCalendario(rutina, f);
      if (!t.descanso) lista.push({ fecha: f, entreno: t.entreno, columna: t.columna });
    }
    return lista;
  }

  function kgDesdeRM(rm, pct) {
    if (rm == null || pct == null) return null;
    return Math.round(rm * pct / 100 / 2.5) * 2.5;
  }

  function descansoTexto(seg) {
    if (!seg) return '';
    if (seg < 60) return seg + ' seg';
    return Math.floor(seg / 60) + (seg % 60 ? '.' + String(seg % 60).padStart(2, '0') : '') + ' minutos';
  }

  function progresionDe(rutina, id) {
    var lista = rutina.progresiones || [];
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return null;
  }

  // Las semanas de un ejercicio: las de su progresión (con sus reps) o las suyas, con su descanso y su nota.
  // Una progresión con `sube` (kg) no va por %: la primera semana sale del % y cada semana suma esos kg; el AMRAP
  // se hace con los de la semana anterior. Se devuelve el % que da esos kg con el 1RM del ejercicio.
  function semanasDe(rutina, ej) {
    var p = ej.progresion ? progresionDe(rutina, ej.progresion) : null;
    var lista = p ? p.semanas : ej.semanas || [];
    var primero = lista[0] && lista[0].pct;
    var base = p && p.sube != null && ej.rm > 0 && primero != null ? kgDesdeRM(ej.rm, primero) : null;
    return lista.map(function (s, i) {
      var r = {};
      Object.keys(s).forEach(function (k) { r[k] = s[k]; });
      if (p && p.sube != null) {
        var k = i > 0 && esAmrap(rutina, i + 1) ? i - 1 : i;
        r.pct = base != null ? Math.round((base + p.sube * k) / ej.rm * 10000) / 100 : primero;
      }
      if (p && !r.reps && ej.reps) r.reps = ej.reps;
      if (ej.descansos && ej.descansos[i] != null) r.descanso = ej.descansos[i];
      if (r.descanso == null && ej.descanso != null) r.descanso = ej.descanso;
      if (ej.notas && ej.notas[i]) r.nota = ej.notas[i];
      if (!r.nota && ej.nota) r.nota = ej.nota;
      return r;
    });
  }

  // Lo que se enseña de una semana: series y reps juntas ("3" y "8" → "3 x 8"; "3 o 4" y "12" → "3 o 4 x 12").
  // Si las series ya llevan las reps ("2x8 + 2x7"), van tal cual.
  function textoSeries(s) {
    var series = String(s.series || '').trim();
    var reps = String(s.reps || '').trim();
    if (!reps) return series;
    return /x/i.test(series) ? series + ' ' + reps : series + ' x ' + reps;
  }

  function entrenoDe(rutina, id) {
    for (var i = 0; i < rutina.entrenos.length; i++) if (rutina.entrenos[i].id === id) return rutina.entrenos[i];
    return null;
  }

  // Un entreno de la rutina en el formato de siempre (el de Plan.leerHoja), para que el resto de la app no cambie.
  function aEjercicios(rutina, entreno) {
    var lista = entreno.ejercicios;
    return lista.map(function (ej, i) {
      var pareja = ej.junto ? lista[i + 1] : i > 0 && lista[i - 1].junto ? lista[i - 1] : null;
      var enJump = !!pareja;
      var cols = [];
      var semanas = semanasDe(rutina, ej);
      for (var c = 0; c < columnas(rutina); c++) {
        var s = semanas[Math.min(c, semanas.length - 1)] || {};
        var amrap = esAmrap(rutina, c + 1);
        var reps = textoSeries(s);
        var principal = ej.tipo === 'principal';
        var detalle = principal ? (s.pct != null ? '@ ' + s.pct + '%' : '')
          : enJump ? 'Jump set con ' + pareja.nombre : s.nota || '';
        if (principal && s.nota) detalle = (detalle ? detalle + ' · ' : '') + s.nota;
        if (ej.dropset && !amrap) {
          detalle = (detalle ? detalle + ' · ' : '') + 'Drop set: ' + ej.dropset.bajadas + ' × −' + ej.dropset.porcentaje + ' %';
        }
        cols.push({
          objetivo: reps.replace(/\s+/g, ' ').trim(),
          detalle: detalle,
          series: Plan.seriesPlan(s.series, s.reps || ''),
          kg: principal ? kgDesdeRM(ej.rm, s.pct) : null,
          descanso: s.descanso || null,
          descansoTexto: descansoTexto(s.descanso),
        });
      }
      var e = {
        id: ej.id,
        tipo: enJump ? 'jump' : ej.tipo,
        nombre: ej.tipo === 'debil' ? 'WEAK POINT: ' + ej.nombre : ej.nombre,
        nombreCorto: ej.nombre,
        columnas: cols,
        entreno: entreno.id,
      };
      if (enJump) e.grupo = ej.junto ? ej.id : pareja.id;
      if (ej.tipo === 'principal') e.rm = ej.rm != null ? ej.rm : null;
      if (ej.dropset) e.dropset = { bajadas: ej.dropset.bajadas, porcentaje: ej.dropset.porcentaje };
      return e;
    });
  }

  // Toda la rutina en el formato de la acción `plan`: { A1: [ejercicios], … }.
  function aPlan(rutina) {
    var entrenos = {};
    rutina.entrenos.forEach(function (e) { entrenos[e.id] = aEjercicios(rutina, e); });
    return entrenos;
  }

  // ---- Importar una vez el plan del Excel (Plan.leerLibro) ----

  function pctDe(detalle) {
    var m = String(detalle || '').match(/(\d+(?:[.,]\d+)?)\s*%/);
    return m ? Number(m[1].replace(',', '.')) : null;
  }

  function desdeEjercicio(ej, siguienteEsPareja) {
    var tipo = ej.tipo === 'jump' ? 'secundario' : ej.tipo;
    var r = { id: ej.id, nombre: ej.nombreCorto || ej.nombre, tipo: tipo };
    if (tipo === 'principal') r.rm = ej.rm != null ? ej.rm : null;
    if (siguienteEsPareja) r.junto = true;
    r.semanas = ej.columnas.map(function (c) {
      var s = { series: c.objetivo, descanso: c.descanso || null };
      if (tipo === 'principal') {
        s.pct = pctDe(c.detalle);
        var resto = String(c.detalle || '').replace(/@\s*\d+(?:[.,]\d+)?\s*%/, '').trim();
        if (resto) s.nota = resto;
      } else if (ej.tipo !== 'jump' && c.detalle && c.detalle !== 'Normal') {
        s.nota = c.detalle;
      }
      // "3 o 4 x" con las reps en otra casilla (la cuarta es opcional): se guardan aparte para no perderlo.
      if (c.series.length && JSON.stringify(Plan.seriesPlan(c.objetivo, '')) !== JSON.stringify(c.series)) {
        var reps = c.series[0].reps;
        var fin = c.objetivo.lastIndexOf(reps);
        s.series = (fin > 0 ? c.objetivo.slice(0, fin) : c.objetivo).trim();
        s.reps = reps;
      } else if (tipo !== 'principal') {
        // "2 x 12-15" → "2 x" y "12-15".
        var m = c.objetivo.match(/^(.*?x)\s*(\S.*)$/i);
        if (m && !/\+/.test(c.objetivo)) {
          s.series = m[1].trim();
          s.reps = m[2].trim();
        }
      }
      if (s.reps) {
        s.series = s.series.replace(/\s*x\s*$/i, '');
      } else {
        var partes = s.series.match(/^(\d+(?:\s*o\s*\d+)?)\s*x\s*([^\s+x]+)$/i);
        if (partes) {
          s.series = partes[1];
          s.reps = partes[2];
        }
      }
      return s;
    });
    if (tipo !== 'principal') {
      var cuenta = {};
      r.semanas.forEach(function (s) { if (s.reps) cuenta[s.reps] = (cuenta[s.reps] || 0) + 1; });
      var comun = Object.keys(cuenta).sort(function (a, b) { return cuenta[b] - cuenta[a]; })[0];
      if (comun) {
        r.reps = comun;
        r.semanas.forEach(function (s) { if (s.reps === comun) delete s.reps; });
      }
    }
    return r;
  }

  function iguales(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // El descanso y la nota salen de las semanas y pasan al ejercicio: uno para todas, o uno por semana si cambian.
  function compactar(ej) {
    [['descanso', 'descansos'], ['nota', 'notas']].forEach(function (c) {
      var valores = ej.semanas.map(function (s) { return s[c[0]] || null; });
      if (valores.every(function (v) { return v === valores[0]; })) {
        if (valores[0]) ej[c[0]] = valores[0];
      } else {
        ej[c[1]] = valores;
      }
      ej.semanas.forEach(function (s) { delete s[c[0]]; });
    });
  }

  // entrenos: { A1: [...], B1: [...] } de Plan.leerLibro; orden: ids en el orden de rotación.
  function desdePlan(entrenos, opciones) {
    opciones = opciones || {};
    var orden = opciones.orden || Object.keys(entrenos);
    var progresiones = [];
    var rutina = {
      version: 1,
      dias: { patron: opciones.patron || 'ED', inicio: opciones.inicio, fin: opciones.fin || null },
      semanas: opciones.semanas || 8,
      amrap: opciones.amrap !== false,
      progresiones: progresiones,
      entrenos: orden.filter(function (id) { return entrenos[id]; }).map(function (id) {
        var lista = entrenos[id];
        return {
          id: id,
          nombre: (opciones.nombres && opciones.nombres[id]) || id,
          ejercicios: lista.map(function (ej, i) {
            var sig = lista[i + 1];
            var r = desdeEjercicio(ej, ej.tipo === 'jump' && sig && sig.grupo === ej.grupo);
            compactar(r);
            // Todas las semanas iguales: no hace falta progresión.
            if (r.tipo !== 'principal' && r.semanas.every(function (x) { return iguales(x, r.semanas[0]); })) {
              r.semanas = [r.semanas[0]];
              if (r.reps && !r.semanas[0].reps) r.semanas[0].reps = r.reps;
              delete r.reps;
              return r;
            }
            var p = progresiones.filter(function (x) { return iguales(x.semanas, r.semanas); })[0];
            if (!p) {
              // Se llama por lo que es quien la usa primero: "Principales", "Secundarios 2", "Jump sets"…
              var base = { principal: 'Principales', debil: 'Weak points', jump: 'Jump sets' }[ej.tipo] || 'Secundarios';
              var mismas = progresiones.filter(function (x) { return x.nombre.replace(/ \d+$/, '') === base; }).length;
              p = { id: 'P' + (progresiones.length + 1), nombre: base + (mismas ? ' ' + (mismas + 1) : ''), semanas: r.semanas };
              progresiones.push(p);
            }
            r.progresion = p.id;
            delete r.semanas;
            return r;
          }),
        };
      }),
    };
    return rutina;
  }

  // ---- Comprobar lo que se crea en la app ----

  function errores(rutina) {
    var mal = [];
    if (!rutina || !rutina.entrenos || !rutina.entrenos.length) mal.push('Crea al menos un entreno');
    if (!rutina || !rutina.dias || !/^\d{4}-\d{2}-\d{2}$/.test(rutina.dias.inicio || '')) mal.push('Elige el día de inicio');
    if (rutina && rutina.dias && String(rutina.dias.patron || '').indexOf('E') < 0) mal.push('Pon al menos un día de entreno');
    var ids = {};
    ((rutina && rutina.entrenos) || []).forEach(function (e) {
      if (!e.nombre) mal.push('Un entreno no tiene nombre');
      if (ids[e.id]) mal.push('Hay dos entrenos con el mismo id');
      ids[e.id] = true;
      if (!e.ejercicios || !e.ejercicios.length) mal.push((e.nombre || 'Un entreno') + ' no tiene ejercicios');
      (e.ejercicios || []).forEach(function (ej, i) {
        if (!ej.nombre) mal.push('En ' + e.nombre + ' hay un ejercicio sin nombre');
        var semanas = semanasDe(rutina, ej);
        if (ej.tipo === 'principal' && ej.progresion && !progresionDe(rutina, ej.progresion)) mal.push(ej.nombre + ': elige su progresión');
        else if (!semanas.length || !semanas.every(function (s) { return Plan.seriesPlan(s.series, s.reps).length; })) {
          mal.push(ej.nombre + ': faltan las series (por ejemplo 3x10)');
        } else if (ej.tipo === 'principal' && semanas.some(function (s) { return s.pct == null; })) {
          mal.push(ej.nombre + ': falta el % del 1RM');
        }
        if (ej.junto && !e.ejercicios[i + 1]) mal.push(ej.nombre + ': el jump set necesita un ejercicio detrás');
        if (ej.junto && i > 0 && e.ejercicios[i - 1].junto) mal.push(ej.nombre + ': un jump set es de dos ejercicios');
      });
    });
    return mal;
  }

  // ---- Compartir ----
  // Lo que viaja en el enlace: la rutina sin lo que es de cada uno (el 1RM, el id, cuándo se guardó). Quien la recibe
  // pone sus propios 1RM.
  function paraCompartir(rutina) {
    var r = JSON.parse(JSON.stringify(rutina));
    delete r.id;
    delete r.actualizada;
    (r.entrenos || []).forEach(function (e) {
      (e.ejercicios || []).forEach(function (ej) { delete ej.rm; });
    });
    return r;
  }

  // Lo que llega de un enlace: vale si tiene lo mínimo de una rutina.
  function recibida(datos) {
    if (!datos || typeof datos !== 'object' || !Array.isArray(datos.entrenos) || !datos.dias || !datos.dias.patron) return null;
    var r = paraCompartir(datos);
    r.version = r.version || 1;
    r.semanas = Math.max(1, Math.min(52, Number(r.semanas) || 1));
    r.nombre = String(r.nombre || 'Rutina compartida').slice(0, 60);
    return r;
  }

  function idNuevo(prefijo, usados) {
    for (var n = 1; ; n++) if (!usados[prefijo + n]) return prefijo + n;
  }

  return {
    sumarDias: sumarDias,
    diaSemana: diaSemana,
    porCalendario: porCalendario,
    esEntreno: esEntreno,
    semanasEntre: semanasEntre,
    siguiente: siguiente,
    proximos: proximos,
    esAmrap: esAmrap,
    columnas: columnas,
    nombreColumna: nombreColumna,
    entrenoDe: entrenoDe,
    textoSeries: textoSeries,
    paraCompartir: paraCompartir,
    recibida: recibida,
    progresionDe: progresionDe,
    semanasDe: semanasDe,
    kgDesdeRM: kgDesdeRM,
    aPlan: aPlan,
    desdePlan: desdePlan,
    errores: errores,
    idNuevo: idNuevo,
  };
})();
