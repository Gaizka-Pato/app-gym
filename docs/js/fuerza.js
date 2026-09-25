// Estado de fuerza: el mismo cálculo que el "Analizar fuerza" de symmetricstrength.com, con las series del historial.
// Fórmulas y tablas copiadas de su librería (Strength, en static/res/libs.js):
//   - 1RM de una serie: 100·kg / (48,8 + 53,8·e^(−0,075·reps)), de 1 a 10 repeticiones.
//   - Puntuación de un ejercicio: el total de powerlifting que "implica" ese 1RM, pasado a Wilks y dividido entre 4
//     (con un ajuste por edad por debajo de 23 y por encima de 40 años).
//   - Puntuación total: media de las 5 categorías (sentadilla, peso muerto, press horizontal, press vertical, tirón).
//   - Músculos: media ponderada (peso³) de las puntuaciones de los ejercicios que los trabajan.
//   - Simetría: 100 − varianza de las puntuaciones de los ejercicios.
// No usa el DOM: se prueba en Node (tests/fuerza.test.mjs).
var Fuerza = (function () {
  // Sube cuando cambia qué se calcula (por ejemplo qué ejercicios cuentan): las fotos de una versión anterior se rehacen.
  // 2: el "Press Inclinado" del plan es con barra y cuenta.
  // 3: dominadas y fondos cuentan todas las repeticiones; la edad sale de la fecha de nacimiento.
  // 4: cada categoría sale del ejercicio y el material de la lista, y las asistidas solo cuando no hay nada mejor.
  // 5: uno por categoría, como los eligió él: sentadilla, peso muerto, press banca, press militar y remo libre
  //    con barra, y dominadas con el peso del cuerpo o lastradas. Press inclinado y fondos dejan de contar.
  var VERSION = 5;

  var LEVANTAMIENTOS = [
    { id: 'backSquat', nombre: 'Sentadilla', en: 'Back Squat', categoria: 'squat' },
    { id: 'frontSquat', nombre: 'Sentadilla frontal', en: 'Front Squat', categoria: 'squat' },
    { id: 'deadlift', nombre: 'Peso muerto', en: 'Deadlift', categoria: 'floorPull' },
    { id: 'sumoDeadlift', nombre: 'Peso muerto sumo', en: 'Sumo Deadlift', categoria: 'floorPull' },
    { id: 'powerClean', nombre: 'Cargada de potencia', en: 'Power Clean', categoria: 'floorPull' },
    { id: 'benchPress', nombre: 'Press banca', en: 'Bench Press', categoria: 'horizontalPress' },
    { id: 'inclineBenchPress', nombre: 'Press inclinado', en: 'Incline Bench Press', categoria: 'horizontalPress' },
    { id: 'dip', nombre: 'Fondos', en: 'Dip', categoria: 'horizontalPress', corporal: true },
    { id: 'overheadPress', nombre: 'Press militar', en: 'Overhead Press', categoria: 'verticalPress' },
    { id: 'pushPress', nombre: 'Push press', en: 'Push Press', categoria: 'verticalPress' },
    { id: 'snatchPress', nombre: 'Snatch press', en: 'Snatch Press', categoria: 'verticalPress' },
    { id: 'chinup', nombre: 'Dominadas', en: 'Chin-up', categoria: 'pullup', corporal: true },
    { id: 'pullup', nombre: 'Dominadas pronas', en: 'Pull-up', categoria: 'pullup', corporal: true },
    { id: 'pendlayRow', nombre: 'Remo con barra', en: 'Pendlay Row', categoria: 'pullup' },
  ];

  var CATEGORIAS = [
    { id: 'squat', nombre: 'Sentadilla' },
    { id: 'floorPull', nombre: 'Peso muerto' },
    { id: 'horizontalPress', nombre: 'Press horizontal' },
    { id: 'verticalPress', nombre: 'Press vertical' },
    { id: 'pullup', nombre: 'Dominadas y remo' },
  ];

  var MUSCULOS = [
    ['upperTraps', 'Trapecio superior'], ['middleTraps', 'Trapecio medio'], ['lowerTraps', 'Trapecio inferior'],
    ['frontDelts', 'Deltoides anterior'], ['sideDelts', 'Deltoides lateral'], ['rearDelts', 'Deltoides posterior'],
    ['rotatorCuff', 'Manguito rotador'], ['upperChest', 'Pectoral superior'], ['lowerChest', 'Pectoral inferior'],
    ['biceps', 'Bíceps'], ['triceps', 'Tríceps'], ['forearms', 'Antebrazos'],
    ['serratusAndObliques', 'Serrato y oblicuos'], ['abdominals', 'Abdominales'], ['latsAndTeresMajor', 'Dorsales'],
    ['spinalErectors', 'Lumbares'], ['glutes', 'Glúteos'], ['hamstrings', 'Isquiotibiales'],
    ['quads', 'Cuádriceps'], ['hipFlexors', 'Flexores de cadera'], ['hipAdductors', 'Aductores'], ['calves', 'Gemelos'],
  ];

  // Cuánto trabaja cada ejercicio cada músculo (0-10), en el orden de MUSCULOS. Tabla liftInvolvement de la web.
  var IMPLICACION = {
    backSquat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 6, 2, 6, 9, 6, 8, 4, 6, 2],
    frontSquat: [2, 2, 2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 2, 8, 0, 4, 7, 4, 10, 4, 6, 2],
    deadlift: [8, 8, 2, 0, 0, 0, 0, 0, 0, 0, 0, 4, 4, 6, 4, 10, 7, 7, 6, 2, 4, 2],
    sumoDeadlift: [8, 8, 2, 0, 0, 0, 0, 0, 0, 0, 0, 4, 4, 6, 4, 6, 8, 8, 8, 4, 6, 2],
    powerClean: [8, 8, 2, 0, 0, 0, 0, 0, 0, 0, 0, 6, 4, 6, 2, 8, 6, 6, 8, 2, 4, 3],
    benchPress: [0, 0, 0, 6, 0, 0, 2, 8, 10, 2, 8, 2, 0, 2, 4, 2, 0, 0, 2, 0, 0, 0],
    inclineBenchPress: [0, 0, 0, 6, 0, 0, 2, 10, 8, 2, 8, 2, 0, 2, 4, 2, 0, 0, 2, 0, 0, 0],
    dip: [0, 0, 6, 6, 2, 0, 2, 6, 10, 0, 8, 2, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0],
    overheadPress: [4, 4, 4, 10, 6, 0, 2, 4, 0, 2, 8, 2, 2, 4, 0, 2, 2, 0, 0, 0, 0, 0],
    pushPress: [4, 4, 4, 8, 6, 0, 2, 2, 0, 2, 8, 2, 2, 4, 0, 2, 4, 2, 4, 2, 6, 3],
    snatchPress: [6, 6, 6, 8, 8, 2, 2, 0, 0, 2, 6, 2, 2, 4, 0, 2, 2, 0, 0, 0, 0, 0],
    chinup: [0, 4, 4, 0, 0, 6, 6, 2, 2, 8, 0, 4, 4, 8, 10, 0, 0, 0, 0, 0, 0, 0],
    pullup: [0, 6, 6, 0, 0, 6, 6, 0, 0, 6, 0, 6, 4, 6, 10, 0, 0, 0, 0, 0, 0, 0],
    pendlayRow: [2, 6, 6, 0, 0, 8, 8, 0, 2, 6, 0, 4, 4, 4, 10, 5, 3, 3, 0, 0, 2, 2],
  };

  // Niveles de la web, de menos a más, con su puntuación mínima y su color.
  var NIVELES = [
    { min: -Infinity, nombre: 'Mediocre', color: '#C40FA2' },
    { min: 30, nombre: 'Sin entrenamiento', color: '#5D2EF3' },
    { min: 45, nombre: 'Novato', color: '#3598DC' },
    { min: 60, nombre: 'Intermedio', color: '#27CE83' },
    { min: 75, nombre: 'Competente', color: '#ABCC1D' },
    { min: 87.5, nombre: 'Avanzado', color: '#E5C22A' },
    { min: 100, nombre: 'Excepcional', color: '#E99E3B' },
    { min: 112.5, nombre: 'Élite', color: '#FF6033' },
    { min: 125, nombre: 'Clase mundial', color: '#F6384F' },
  ];

  // Qué cuenta como cada levantamiento de la web. Lo eligió él el 2026-09-22: manda el ejercicio de la lista
  // con su material, no lo que se parezca el nombre. La familia es el propio ejercicio o, si es una variante,
  // el ejercicio del que es variante ("Press Banca Mancuernas" → "Press Banca"), así que la banca con
  // mancuernas o el militar en máquina no entran aunque sean el mismo movimiento.
  // Con qué se tiene que hacer cada uno para contar. Si la casilla "Material" está vacía no se exige nada.
  var MATERIAL = {
    backSquat: 'barra', deadlift: 'barra', benchPress: 'barra',
    overheadPress: 'barra', pendlayRow: 'barra', chinup: 'corporal',
  };

  // Qué ejercicio es cada uno, por el nombre (el de la lista, o el del histórico de FitNotes).
  // Uno por categoría, como los eligió él: ni press inclinado ni fondos entran en el press horizontal.
  var EQUIVALENCIAS = [
    ['backSquat', /^sentadilla( libre| con barra| trasera)?$/],
    ['deadlift', /^peso muerto( convencional| con barra)?$/],
    ['benchPress', /^(press (de )?banca|press supino|supine press|press plano con barra)( con barra)?$/],
    ['overheadPress', /^pres{1,2} militar( barra| con barra| de pie)?$/],
    ['chinup', /^dominadas( lastradas| supinas)?$/],
    ['pendlayRow', /^remo (libre|en barra|con barra|pendl?e?y|en bar{1,2}a \(?smith\)?)/],
  ];

  // Las hechas con máquina de asistencia: solo cuentan si no hay ni normales ni lastradas (lo pidió él).
  var ASISTIDOS = [['chinup', /^dominadas asistid/]];

  function normalizar(nombre) {
    return String(nombre || '').replace(/^WEAK POINT:\s*/i, '').toLowerCase().replace(/\s+/g, ' ').trim()
      .normalize('NFD').replace(/\p{M}/gu, '');
  }

  // familia y material salen de "Grupos musculares" (Grupos.familiaDe / Grupos.materialDe). Si el ejercicio no
  // está en la lista (solo en el histórico de FitNotes) se mira el nombre.
  function levantamientoDe(nombre, familia, material) {
    // Si es una variante, quien manda es el ejercicio del que es variante: "Press Banca Mancuernas" es press
    // banca, y se queda fuera por el material, no por el nombre.
    var clave = normalizar(familia || nombre);
    var id = null;
    for (var i = 0; i < EQUIVALENCIAS.length; i++) {
      if (EQUIVALENCIAS[i][1].test(clave)) { id = EQUIVALENCIAS[i][0]; break; }
    }
    if (!id || !familia) return id;   // sin lista (histórico de FitNotes) vale el nombre a secas
    var m = normalizar(material);
    return !m || !MATERIAL[id] || m === MATERIAL[id] ? id : null;
  }

  // El levantamiento al que suplen las asistidas, para usarlas solo a falta de las de verdad.
  function levantamientoAsistido(nombre) {
    var clave = normalizar(nombre);
    for (var i = 0; i < ASISTIDOS.length; i++) if (ASISTIDOS[i][1].test(clave)) return ASISTIDOS[i][0];
    return null;
  }

  function levantamiento(id) {
    return LEVANTAMIENTOS.find(function (l) { return l.id === id; });
  }

  // ---- Fórmulas de la web (en kg; su "Metric") ----

  function kgALibras(kg) {
    return 2.20462 * kg;
  }

  function coeficienteWilks(hombre, peso) {
    var c = hombre
      ? [-216.0475144, 16.2606339, -0.002388645, -0.00113732, 7.01863e-6, -1.291e-8]
      : [594.31747775582, -27.23842536447, 0.82112226871, -0.00930733913, 4.731582e-5, -9.054e-8];
    var suma = 0;
    for (var i = 0; i < c.length; i++) suma += c[i] * Math.pow(peso, i);
    return 500 / suma;
  }

  function unaRM(kg, reps) {
    if (reps === 1) return kg;
    return reps >= 1 && reps <= 10 && kg > 0 ? (100 * kg) / (48.8 + 53.8 * Math.exp(-0.075 * reps)) : null;
  }

  // Qué parte del total de powerlifting (sentadilla + banca + muerto) supone cada ejercicio.
  // En dominadas y fondos depende de lo que se levanta además del cuerpo (en libras, como en la web).
  function partePL(hombre, peso, id, kg) {
    var extra = kgALibras(kg - peso);
    switch (id) {
      case 'deadlift': return hombre ? 0.396825 : 0.414938;
      case 'backSquat': return (hombre ? 0.87 : 0.84) * partePL(hombre, peso, 'deadlift', kg);
      case 'benchPress': return (hombre ? 0.65 : 0.57) * partePL(hombre, peso, 'deadlift', kg);
      case 'sumoDeadlift': return partePL(hombre, peso, 'deadlift', kg);
      case 'powerClean': return 0.56 * partePL(hombre, peso, 'deadlift', kg);
      case 'frontSquat': return 0.8 * partePL(hombre, peso, 'backSquat', kg);
      case 'inclineBenchPress': return 0.82 * partePL(hombre, peso, 'benchPress', kg);
      case 'dip': return hombre
        ? 1.68064e-10 * Math.pow(extra, 4) - 1.2946e-7 * Math.pow(extra, 3) + 3.71905e-5 * Math.pow(extra, 2) - 0.00499168 * extra + 0.566576
        : 8.249e-10 * Math.pow(extra, 4) - 4.01956e-7 * Math.pow(extra, 3) + 6.22122e-5 * Math.pow(extra, 2) - 0.00431442 * extra + 0.37562;
      case 'overheadPress': return 0.65 * partePL(hombre, peso, 'benchPress', kg);
      case 'pushPress': return 1.33 * partePL(hombre, peso, 'overheadPress', kg);
      case 'snatchPress': return 0.8 * partePL(hombre, peso, 'overheadPress', kg);
      case 'chinup': return hombre
        ? 4.01897e-10 * Math.pow(extra, 4) - 2.34536e-7 * Math.pow(extra, 3) + 5.02252e-5 * Math.pow(extra, 2) - 0.00502633 * extra + 0.459545
        : 1.66589e-9 * Math.pow(extra, 4) - 5.1621e-7 * Math.pow(extra, 3) + 5.4088e-5 * Math.pow(extra, 2) - 0.00281674 * extra + 0.302005;
      case 'pullup': return 0.95 * partePL(hombre, peso, 'chinup', kg);
      case 'pendlayRow': return 0.53 * partePL(hombre, peso, 'deadlift', kg);
      default: return 1;
    }
  }

  function factorEdad(edad) {
    if (typeof edad === 'number' && edad < 23) return 0.0038961 * edad * edad - 0.166926 * edad + 2.80303;
    if (typeof edad === 'number' && edad > 40) return 0.000467683 * edad * edad - 0.0299717 * edad + 1.45454;
    return 1;
  }

  // Puntuación de un ejercicio con su 1RM (en dominadas y fondos, el 1RM incluye el peso del cuerpo).
  function puntuacion(p, id, kg) {
    var hombre = p.sexo !== 'mujer';
    var total = kg / partePL(hombre, p.peso, id, kg);
    return (total * coeficienteWilks(hombre, p.peso) * factorEdad(p.edad)) / 4;
  }

  // 1RM que corresponde a una puntuación (para "lo esperado a tu nivel" y los niveles de cada ejercicio).
  function kgParaPuntuacion(p, id, objetivo) {
    var hombre = p.sexo !== 'mujer';
    var totalPL = (4 * objetivo) / factorEdad(p.edad) / coeficienteWilks(hombre, p.peso);
    if (!levantamiento(id).corporal) return partePL(hombre, p.peso, id, 0) * totalPL;
    // En dominadas y fondos la proporción depende del propio peso: la web lo busca por aproximaciones.
    var kg = p.peso;
    for (var i = 0; i < 50; i++) {
      var actual = puntuacion(p, id, kg);
      var error = Math.abs(actual - objetivo) / objetivo;
      if (error < 0.01) return partePL(hombre, p.peso, id, kg) * totalPL;
      if (error > 0.98) return 0;
      kg = actual > objetivo ? kg - kg * Math.pow(error, 1.5) : kg + kg * Math.pow(error, 1.5);
      if (!isFinite(kg)) return 0;
    }
    return 0;
  }

  function nivel(p) {
    var n = NIVELES[0];
    NIVELES.forEach(function (x) { if (p >= x.min) n = x; });
    return n;
  }

  function siguienteNivel(p) {
    return NIVELES.find(function (x) { return x.min > p; }) || null;
  }

  function mediaPonderada(pares) {
    var suma = 0;
    var pesos = 0;
    pares.forEach(function (x) {
      var w = x[1] * x[1] * x[1];
      suma += x[0] * w;
      pesos += w;
    });
    return pesos >= 50 ? suma / pesos : 0;
  }

  function simetria(puntos) {
    var media = puntos.reduce(function (a, b) { return a + b; }, 0) / puntos.length;
    var varianza = puntos.reduce(function (a, b) { return a + Math.pow(b - media, 2); }, 0) / puntos.length;
    return 100 - varianza;
  }

  function redondear(n, paso) {
    return Math.round(n / paso) * paso;
  }

  function un(n) {
    return Math.round(n * 10) / 10;
  }

  // ---- De las series al estado ----

  function rmSinTope(kg, reps) {
    return kg > 0 && reps > 0 ? (100 * kg) / (48.8 + 53.8 * Math.exp(-0.075 * reps)) : null;
  }

  // Años cumplidos en una fecha ('aaaa-mm-dd') por quien nació en `nacimiento` ('aaaa-mm-dd'), o null.
  function edadEn(nacimiento, fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(nacimiento || '')) || !fecha) return null;
    var anos = Number(fecha.slice(0, 4)) - Number(nacimiento.slice(0, 4));
    if (fecha.slice(5) < nacimiento.slice(5)) anos--;
    return anos >= 0 ? anos : null;
  }

  // Mejor 1RM de cada levantamiento con las series de los últimos `dias` días hasta `hasta` (incluido).
  // ejercicios: [{ nombre, corporal, asistido, dias: [{ f, s: [[kg, reps]] }] }].
  // En dominadas y fondos el 1RM incluye el cuerpo: de peso corporal suman el lastre (los kg de FitNotes de
  // 30 o más son el peso del cuerpo, no lastre) y las asistidas restan la ayuda de la máquina.
  // En el resto la fórmula de la web solo vale de 1 a 10 repeticiones; en dominadas y fondos, donde el peso es el
  // del cuerpo, cuentan todas (la misma fórmula sin tope).
  function mejores(ejercicios, persona, hasta, dias) {
    var desde = fechaMenos(hasta, dias || 183);
    var mejor = {};
    var reserva = {};   // lo que sale de las asistidas: solo vale si no hay nada mejor
    ejercicios.forEach(function (e) {
      var id = levantamientoDe(e.nombre, e.familia, e.material);
      var esReserva = false;
      if (!id) {
        id = levantamientoAsistido(e.nombre);
        esReserva = true;
      }
      if (!id) return;
      var donde = esReserva ? reserva : mejor;
      var corporal = !!levantamiento(id).corporal;
      e.dias.forEach(function (d) {
        if (d.f <= desde || d.f > hasta) return;
        d.s.forEach(function (s) {
          var kg = Number(s[0]) || 0;
          var reps = Number(s[1]) || 0;
          if (!(reps > 0)) return;
          if (corporal) {
            if (e.asistido) kg = persona.peso - kg;
            else kg = persona.peso + (e.corporal && kg >= 30 ? 0 : kg);
          }
          var rm = corporal ? rmSinTope(kg, reps) : unaRM(kg, reps);
          if (!rm || rm <= 0) return;
          if (!donde[id] || rm > donde[id].rm) donde[id] = { rm: rm, kg: Number(s[0]) || 0, reps: Number(s[1]), f: d.f, ejercicio: e.nombre };
        });
      });
    });
    // Las asistidas entran solo donde no hay nada: sin dominadas ni lastradas, mejor eso que quedarse sin nota.
    Object.keys(reserva).forEach(function (id) { if (!mejor[id]) mejor[id] = reserva[id]; });
    return mejor;
  }

  // persona: { sexo: 'hombre' | 'mujer', edad, peso, nacimiento }. rms: { id: { rm, … } } (lo que da mejores()).
  // Devuelve null si no hay ningún levantamiento con datos.
  function calcular(persona, rms) {
    var p = { sexo: persona.sexo, edad: persona.edad ? Number(persona.edad) : null, peso: Number(persona.peso), nacimiento: persona.nacimiento || null };
    if (!(p.peso > 0)) return null;
    var lev = {};
    Object.keys(rms).forEach(function (id) {
      var rm = redondear(rms[id].rm, 0.5);
      lev[id] = Object.assign({}, rms[id], { rm: rm, puntos: un(puntuacion(p, id, rm)) });
    });
    if (!Object.keys(lev).length) return null;

    var categorias = {};
    CATEGORIAS.forEach(function (c) {
      var mejor = null;
      LEVANTAMIENTOS.forEach(function (l) {
        if (l.categoria === c.id && lev[l.id] && (mejor == null || lev[l.id].puntos > mejor)) mejor = lev[l.id].puntos;
      });
      if (mejor != null) categorias[c.id] = mejor;
    });
    var valores = Object.keys(categorias).map(function (k) { return categorias[k]; });
    var total = un(valores.reduce(function (a, b) { return a + b; }, 0) / valores.length);

    var musculos = {};
    MUSCULOS.forEach(function (m, i) {
      var pares = [];
      Object.keys(lev).forEach(function (id) { pares.push([lev[id].puntos, IMPLICACION[id][i]]); });
      musculos[m[0]] = un(mediaPonderada(pares));
    });

    // Lo que "tocaría" levantar con la puntuación total: el diagrama de fuerzas y debilidades.
    Object.keys(lev).forEach(function (id) {
      var esperado = redondear(kgParaPuntuacion(p, id, total), 0.5);
      lev[id].esperado = esperado;
      lev[id].diferencia = esperado > 0 ? Math.round(((lev[id].rm - esperado) / esperado) * 100) : null;
      var sig = siguienteNivel(lev[id].puntos);
      if (sig) lev[id].siguiente = { nivel: sig.nombre, kg: redondear(kgParaPuntuacion(p, id, sig.min), 0.5) };
    });

    var puntos = Object.keys(lev).map(function (id) { return lev[id].puntos; });
    var ordenados = Object.keys(lev).filter(function (id) { return lev[id].diferencia != null; })
      .sort(function (a, b) { return lev[b].diferencia - lev[a].diferencia; });
    var fuertes = [];
    var debiles = [];
    MUSCULOS.forEach(function (m) {
      var v = musculos[m[0]];
      if (!v) return;
      var d = (v - total) / total;
      if (d >= 0.05) fuertes.push([m[0], d]);
      if (d <= -0.05) debiles.push([m[0], d]);
    });
    fuertes.sort(function (a, b) { return b[1] - a[1]; });
    debiles.sort(function (a, b) { return a[1] - b[1]; });

    var resultado = {
      persona: p,
      total: total,
      nivel: nivel(total).nombre,
      categorias: categorias,
      levantamientos: lev,
      musculos: musculos,
      simetria: puntos.length > 1 ? Math.round(simetria(puntos)) : null,
      masFuerte: ordenados.length && lev[ordenados[0]].diferencia > 0 ? ordenados[0] : null,
      masDebil: ordenados.length && lev[ordenados[ordenados.length - 1]].diferencia < 0 ? ordenados[ordenados.length - 1] : null,
      musculosFuertes: fuertes.map(function (x) { return x[0]; }),
      musculosDebiles: debiles.map(function (x) { return x[0]; }),
    };
    // Total y Wilks de powerlifting, si están los tres.
    var muerto = Math.max((lev.deadlift || {}).rm || 0, (lev.sumoDeadlift || {}).rm || 0);
    if (lev.backSquat && lev.benchPress && muerto) {
      resultado.totalPL = lev.backSquat.rm + lev.benchPress.rm + muerto;
      resultado.wilks = un(resultado.totalPL * coeficienteWilks(p.sexo !== 'mujer', p.peso));
    }
    return resultado;
  }

  // ---- Fechas ----

  function fechaMenos(iso, dias) {
    var d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() - dias);
    return d.toISOString().slice(0, 10);
  }

  // Último día de un mes 'aaaa-mm'.
  function finDeMes(mes) {
    var p = mes.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1], 0));
    return d.toISOString().slice(0, 10);
  }

  // Mes anterior a 'aaaa-mm'.
  function mesAnterior(mes) {
    var p = mes.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 2, 1));
    return d.toISOString().slice(0, 7);
  }

  var NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function nombreMes(mes) {
    var p = mes.split('-');
    return NOMBRES_MES[Number(p[1]) - 1] + ' ' + p[0];
  }

  return {
    VERSION: VERSION,
    LEVANTAMIENTOS: LEVANTAMIENTOS,
    CATEGORIAS: CATEGORIAS,
    MUSCULOS: MUSCULOS,
    NIVELES: NIVELES,
    levantamientoDe: levantamientoDe,
    levantamiento: levantamiento,
    unaRM: unaRM,
    edadEn: edadEn,
    puntuacion: puntuacion,
    kgParaPuntuacion: kgParaPuntuacion,
    nivel: nivel,
    siguienteNivel: siguienteNivel,
    mejores: mejores,
    calcular: calcular,
    finDeMes: finDeMes,
    mesAnterior: mesAnterior,
    nombreMes: nombreMes,
  };
})();
