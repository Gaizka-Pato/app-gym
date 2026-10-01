// Grupos musculares y ejercicios (pestaña común "Ejercicios" del Excel maestro) y cambios del día.
var Grupos = (function () {
  // Misma regla que normalizarGrupo() en la API: sin "WEAK POINT:", sin acentos, sin mayúsculas ni espacios de más.
  function normalizar(nombre) {
    return String(nombre || '').replace(/^WEAK POINT:\s*/i, '').toLowerCase().replace(/\s+/g, ' ').trim()
      .normalize('NFD').replace(/\p{M}/gu, '');
  }

  function tabla() {
    var plan = Almacen.plan();
    return (plan && plan.grupos) || [];
  }

  function grupoDe(nombre) {
    var clave = normalizar(nombre);
    var fila = tabla().find(function (f) { return normalizar(f[0]) === clave; });
    return fila ? fila[1] : null;
  }

  // Zona del cuerpo de cada grupo muscular, para agrupar la lista de ejercicios en dos niveles (zona → músculo).
  // Los grupos genéricos de FitNotes ("Pierna", "Espalda"…) caen en su zona; lo que no esté aquí va a "Otros".
  var ZONAS = [
    ['Pecho', ['pecho']],
    ['Espalda', ['espalda', 'trapecio', 'lumbar', 'postura']],
    ['Hombro', ['hombro']],
    ['Brazo', ['biceps', 'triceps', 'antebrazo', 'brazo']],
    ['Pierna', ['pierna', 'cuadriceps', 'femoral y gluteo', 'femoral', 'gluteo', 'aductores', 'abductores', 'gemelo']],
    ['Abdomen', ['abdomen', 'core']],
    ['Cardio', ['cardio']],
  ];

  function zonaDe(grupo) {
    var clave = normalizar(grupo);
    var zona = ZONAS.find(function (z) { return z[1].indexOf(clave) >= 0; });
    return zona ? zona[0] : 'Otros';
  }

  // Orden de las zonas en la lista: de arriba abajo del cuerpo y "Otros" al final.
  function ordenZona(zona) {
    var i = ZONAS.findIndex(function (z) { return z[0] === zona; });
    return i < 0 ? ZONAS.length : i;
  }

  // Ejercicios con el peso del cuerpo: manda la columna "Tipo" del Excel y, si está vacía, esta lista,
  // pero solo si el ejercicio no tiene 1RM con kg en su pestaña: las dominadas asistidas o con lastre
  // llevan kg de verdad y siguen el modelo de % del Excel. Misma regla que esCorporal() en la API.
  var CORPORALES = ['dominadas', 'abs', 'fondos', 'toes to bar', 'elevaciones de piernas'];

  // Ejercicios por tiempo (plancha, cinta, bici…): se apuntan minutos y segundos y, los de cardio, también km.
  // Manda la columna "Tipo" del Excel ("tiempo"); si está vacía, esta lista, el grupo Cardio o que su historial
  // traiga tiempos (FitNotes los guardaba en su columna "Tiempo (s)").
  var POR_TIEMPO = ['plancha', 'correr en cinta', 'cinta', 'bici', 'bicicleta', 'eliptica', 'comba', 'andar con mancuernas'];

  // Con qué se hace cada ejercicio. Solo los de barra llevan discos, y la barra Z pesa 10 kg en vez de 20.
  // Manda la columna "Material" de "Ejercicios" (la elige quien crea el ejercicio); esta lista es
  // para los que ya existían, y vale mientras el Excel no la tenga puesta.
  var MATERIALES = [['barra', 'Barra'], ['barra z', 'Barra Z'], ['mancuernas', 'Mancuernas'],
    ['maquina', 'Máquina'], ['polea', 'Polea'], ['corporal', 'Peso corporal']];

  var BARRAS = { barra: 20, 'barra z': 10 };

  // Con los nombres nuevos y los viejos, por si algún Excel se queda sin renombrar.
  var MATERIAL_POR_DEFECTO = {
    'press banca': 'barra', 'press inclinado': 'barra', sentadilla: 'barra',
    'press militar': 'barra', 'press militar barra': 'barra', 'remo libre': 'barra', remo: 'barra',
    'curl de biceps': 'barra z', 'biceps barra z': 'barra z', 'extension de triceps': 'barra z', 'triceps barra z': 'barra z',
    'elevaciones laterales': 'mancuernas', 'elev. laterales': 'mancuernas', trapecio: 'mancuernas',
    'curl 45º': 'mancuernas', 'curl 45': 'mancuernas',
    'converging press': 'maquina', aperturas: 'maquina', 'aperturas maquina': 'maquina',
    'jalon al pecho': 'maquina', 'remo sentado': 'maquina', 'remo maquina': 'maquina', 'remo dorian': 'maquina',
    'hombro posterior': 'maquina', 'hombro posteriro': 'maquina', prensa: 'maquina',
    'extension de cuadriceps': 'maquina', 'curl femoral': 'maquina', 'hip thrust': 'maquina', 'hip trust': 'maquina',
    aductores: 'maquina', gemelos: 'maquina', gemelo: 'maquina', 'dominadas asistidas': 'maquina', 'fondos asistidos': 'maquina',
    'remo unilateral': 'polea', 'remo polea unilateral': 'polea', 'pull over': 'polea',
    'jalon de triceps': 'polea', 'polea triceps': 'polea',
    dominadas: 'corporal', fondos: 'corporal', hiperextension: 'corporal', hiiperextesion: 'corporal',
    abdominales: 'corporal', abs: 'corporal', plancha: 'corporal', 'toes to bar': 'corporal',
  };

  // Variantes: otra forma de hacer el mismo ejercicio (banca con mancuernas, dominadas lastradas…).
  // Son ejercicios de la lista con la columna "Variante de" puesta, y cada una lleva su propio 1RM.
  function varianteDe(nombre) {
    var clave = normalizar(nombre);
    var fila = tabla().find(function (f) { return normalizar(f[0]) === clave; });
    return (fila && fila[4]) ? String(fila[4]).trim() : '';
  }

  // El ejercicio "de familia" al que pertenece: él mismo, o el suyo si es una variante. Cadena vacía si no está
  // en la lista (un nombre que solo existe en el histórico de FitNotes).
  function familiaDe(nombre) {
    var clave = normalizar(nombre);
    var fila = tabla().find(function (f) { return normalizar(f[0]) === clave; });
    if (!fila) return '';
    return (fila[4] && String(fila[4]).trim()) || String(fila[0]).trim();
  }

  function variantes(nombre) {
    var clave = normalizar(nombre);
    return tabla().filter(function (f) { return f[4] && normalizar(f[4]) === clave; }).map(function (f) { return f[0]; });
  }

  function materialDe(nombre) {
    var clave = normalizar(nombre);
    var fila = tabla().find(function (f) { return normalizar(f[0]) === clave; });
    var puesto = fila && fila[3] ? String(fila[3]).toLowerCase().trim() : '';
    return puesto || MATERIAL_POR_DEFECTO[clave] || '';
  }

  // Kg de la barra del ejercicio (20 la recta, 10 la Z) o null si no va con barra.
  function barraDe(nombre) {
    return BARRAS[materialDe(nombre)] || null;
  }

  function tipoPuesto(clave) {
    var fila = tabla().find(function (f) { return normalizar(f[0]) === clave; });
    return fila && fila[2] ? String(fila[2]).toLowerCase().trim() : '';
  }

  function esCardio(nombre) {
    var info = ((Almacen.historial() || {}).info || {})[Almacen.normalizar(nombre)];
    return /cardio/i.test(grupoDe(nombre) || (info && info.grupo) || '');
  }

  function porTiempo(nombre) {
    var clave = normalizar(nombre);
    var puesto = tipoPuesto(clave);
    if (puesto) return puesto === 'tiempo';
    if (POR_TIEMPO.indexOf(clave) >= 0 || esCardio(nombre)) return true;
    var dias = (((Almacen.historial() || {}).ejercicios || {})[Almacen.normalizar(nombre)]) || [];
    return dias.some(function (d) { return d.s.some(function (s) { return s[2] > 0; }); });
  }

  // "1:30" → 90. Sin dos puntos, el número va en minutos en el cardio y en segundos en el resto (plancha).
  function leerTiempo(texto, enMinutos) {
    var t = String(texto || '').trim().replace(',', '.');
    var m = t.match(/^(\d+):(\d{1,2})$/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    var n = Number(t);
    return n > 0 ? Math.round(enMinutos ? n * 60 : n) : 0;
  }

  function textoTiempo(seg) {
    return Math.floor(seg / 60) + ':' + String(Math.round(seg % 60)).padStart(2, '0');
  }

  // Serie por tiempo, [kg, reps, seg, km] → "25:00 · 4,2 km".
  function textoSerieTiempo(s) {
    var partes = [];
    if (s[2] > 0) partes.push(textoTiempo(s[2]));
    if (s[3] > 0) partes.push(String(s[3]).replace('.', ',') + ' km');
    return partes.join(' · ') || '—';
  }

  // 1RM que trae la pestaña de entreno para ese ejercicio, si lo tiene.
  function rmDelPlan(nombre) {
    var plan = Almacen.plan();
    var clave = normalizar(nombre);
    var mejor = null;
    Object.keys((plan && plan.entrenos) || {}).forEach(function (e) {
      (plan.entrenos[e] || []).forEach(function (ej) {
        if (normalizar(ej.nombre) === clave && ej.rm > 0) mejor = Math.max(mejor || 0, ej.rm);
      });
    });
    return mejor;
  }

  function esCorporal(nombre) {
    var clave = normalizar(nombre);
    var puesto = tipoPuesto(clave);
    if (puesto) return puesto === 'corporal';
    if (/lastre|lastrad|con peso/.test(clave)) return false;
    return CORPORALES.indexOf(clave) >= 0 && !(rmDelPlan(clave) > 0);
  }

  // Los de la lista con 1RM en su pestaña y sin lastre (dominadas asistidas) van en la máquina de asistencia: sus
  // kg son ayuda. Ahí el % del Excel va al revés (más intensidad tiene que ser menos ayuda), así que se refleja
  // alrededor del 75 %: 70 % → 80 % del 1RM de ayuda, 82 % → 68 %. La columna Tipo puede decirlo con "asistida".
  function esAsistido(nombre) {
    var clave = normalizar(nombre);
    var puesto = tipoPuesto(clave);
    if (puesto) return /^asistid[ao]$/.test(puesto);
    if (/lastre|lastrad|con peso/.test(clave)) return false;
    return CORPORALES.indexOf(clave) >= 0 && rmDelPlan(clave) > 0;
  }

  function kgAsistido(rm, detalle) {
    var m = String(detalle || '').match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (!(rm > 0) || !m) return null;
    var p = Number(m[1].replace(',', '.')) / 100;
    return Math.round(rm * (1.5 - p) / 2.5) * 2.5;
  }

  // Principales con el peso del cuerpo: la base del ciclo no es un peso sino el máximo de repeticiones en una serie,
  // y el % de cada columna se aplica a ese número (70 % de 12 → 8 por serie). Se guarda en el Recopilatorio, en la
  // columna "<ejercicio> (reps)", al acabar el AMRAP. Si no hay, sale del historial: la mejor serie de los últimos
  // 6 meses (o de siempre, si en 6 meses no hay ninguna).
  function nombreReps(nombre) {
    return String(nombre || '').replace(/^WEAK POINT:\s*/i, '').trim() + ' (reps)';
  }

  function maximoReps(nombre) {
    var guardado = rmDe(nombreReps(nombre));
    if (guardado > 0) return { reps: guardado, guardado: true };
    var clave = Almacen.normalizar(nombre);
    var series = [];
    ((((Almacen.historial() || {}).ejercicios || {})[clave]) || []).forEach(function (d) {
      d.s.forEach(function (s) { series.push({ f: d.f, reps: Number(s[1]) || 0 }); });
    });
    Almacen.series().forEach(function (s) {
      if (Almacen.normalizar(s.ejercicio) === clave) series.push({ f: s.fecha, reps: Number(s.reps) || 0 });
    });
    var limite = Almacen.hoyISO(new Date(Date.now() - 183 * 86400000));
    var recientes = series.filter(function (s) { return s.f >= limite; });
    var max = Math.max.apply(null, [0].concat((recientes.length ? recientes : series).map(function (s) { return s.reps; })));
    return max > 0 ? { reps: max, guardado: false } : null;
  }

  function repsDesdeMaximo(maximo, detalle) {
    var m = String(detalle || '').match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (!(maximo > 0) || !m) return null;
    return Math.max(1, Math.round(maximo * Number(m[1].replace(',', '.')) / 100));
  }

  // Ejercicios de la lista común (la de los dos) con un nombre parecido, para no crear el mismo con otro nombre:
  // "Remo mancuerna" → "Remo con mancuerna", "Laterales" → "Elev. Laterales". Parecido: las palabras del nombre más
  // corto están todas en el otro, o comparten al menos el 60 %. Sin contar "con", "de", "en"… y sin mirar plurales.
  var VACIAS = ['con', 'en', 'de', 'del', 'la', 'el', 'los', 'las', 'a', 'al', 'y', 'o'];

  function palabras(nombre) {
    return normalizar(nombre).replace(/[().,:\-/]/g, ' ').split(' ').filter(function (w) { return w && VACIAS.indexOf(w) < 0; });
  }

  function mismaPalabra(a, b) {
    return a === b || (a.length > 3 && b.length > 3 && (a.indexOf(b) === 0 || b.indexOf(a) === 0));
  }

  function parecidos(nombre) {
    var p = palabras(nombre);
    if (!p.length) return [];
    var clave = normalizar(nombre);
    return tabla().map(function (f) {
      if (normalizar(f[0]) === clave) return { nombre: f[0], nota: 1 };
      var q = palabras(f[0]);
      if (!q.length) return null;
      var comunes = p.filter(function (w) { return q.some(function (x) { return mismaPalabra(w, x); }); }).length;
      var nota = comunes / Math.max(p.length, q.length);
      return comunes && (comunes === Math.min(p.length, q.length) || nota >= 0.6) ? { nombre: f[0], nota: nota } : null;
    }).filter(Boolean)
      .sort(function (a, b) { return b.nota - a.nota || a.nombre.localeCompare(b.nombre, 'es'); })
      .slice(0, 6)
      .map(function (x) { return x.nombre; });
  }

  // Base de ayuda del ciclo siguiente para que cada columna lleve `menos` kg menos de ayuda. La ayuda de una columna es
  // ROUND(base × (1,5 − %) / 2,5) × 2,5, así que bajar la base lo mismo no basta (41 → 38,5 deja columnas igual):
  // se busca, de 0,5 en 0,5, la base más alta con la que bajan todas. Con 41 y los % de 70 a 82: 37
  // (32,5 · 30 · 30 · 27,5 · 27,5 → 30 · 27,5 · 27,5 · 25 · 25).
  function ayudaMenos(base, detalles, menos) {
    var pcts = (detalles || []).map(function (d) {
      var m = String(d || '').match(/(\d+(?:[.,]\d+)?)\s*%/);
      return m ? Number(m[1].replace(',', '.')) / 100 : null;
    }).filter(function (p, i, lista) { return p && lista.indexOf(p) === i; });
    function ayuda(b, p) { return Math.round(b * (1.5 - p) / 2.5) * 2.5; }
    var nueva = Math.floor((base - menos) * 2) / 2;
    while (nueva > 0 && pcts.some(function (p) { return ayuda(nueva, p) > ayuda(base, p) - menos; })) nueva -= 0.5;
    return nueva > 0 ? nueva : null;
  }

  function todos() {
    var vistos = {};
    return tabla().map(function (f) { return f[1]; }).filter(function (g) {
      if (vistos[g]) return false;
      vistos[g] = true;
      return true;
    });
  }

  // Otros ejercicios del mismo grupo, sin repetir y sin el propio ejercicio.
  function alternativas(nombre) {
    var grupo = grupoDe(nombre);
    if (!grupo) return [];
    var vistos = {};
    vistos[normalizar(nombre)] = true;
    return tabla().filter(function (f) {
      var clave = normalizar(f[0]);
      if (f[1] !== grupo || vistos[clave]) return false;
      vistos[clave] = true;
      // Los que solo son el nombre de familia ("Press Banca", con sus variantes debajo) no se hacen: se hace una variante.
      return !variantes(f[0]).length;
    }).map(function (f) { return f[0]; });
  }

  // Grupos de una lista de nombres, en orden y sin repetir.
  function delDia(nombres) {
    var vistos = {};
    return nombres.map(grupoDe).filter(function (g) {
      if (!g || vistos[g]) return false;
      vistos[g] = true;
      return true;
    });
  }

  function guardarGrupo(ejercicio, grupo, material, varianteDeOtro) {
    return Almacen.llamar('guardarGrupo', { ejercicio: ejercicio, grupo: grupo, material: material || '', varianteDe: varianteDeOtro || '' }).then(function () {
      return Almacen.actualizarPlan();
    });
  }

  // ---- Cambios del día: solo valen para esa fecha, entreno y columna ----

  function claveAlmacen() {
    var c = Almacen.config();
    return 'gymapp.cambios.' + (c ? c.persona : 'nadie');
  }

  function leerCambios() {
    try {
      return JSON.parse(localStorage.getItem(claveAlmacen()) || '{}');
    } catch (e) {
      return {};
    }
  }

  function escribirCambios(cambios) {
    var hoy = Almacen.hoyISO();
    Object.keys(cambios).forEach(function (k) { if (k.slice(0, 10) < hoy) delete cambios[k]; });
    try {
      localStorage.setItem(claveAlmacen(), JSON.stringify(cambios));
    } catch (e) { /* sin espacio: el cambio dura hasta cerrar la app */ }
  }

  function claveCambio(entreno, columna, ejercicioId) {
    return Almacen.hoyISO() + '|' + entreno + '|' + columna + '|' + ejercicioId;
  }

  function cambioDe(entreno, columna, ejercicioId) {
    return leerCambios()[claveCambio(entreno, columna, ejercicioId)] || null;
  }

  function cambiar(entreno, columna, ejercicioId, nombre) {
    var cambios = leerCambios();
    if (nombre) cambios[claveCambio(entreno, columna, ejercicioId)] = nombre;
    else delete cambios[claveCambio(entreno, columna, ejercicioId)];
    escribirCambios(cambios);
  }

  // 1RM de un ejercicio según el Recopilatorio (su último ciclo apuntado), o null si no tiene.
  function rmDe(nombre) {
    var plan = Almacen.plan();
    var dato = plan && plan.rms && plan.rms[normalizar(nombre)];
    return dato ? dato.rm : null;
  }

  // Misma fórmula que el Excel: ROUND(1RM × % / 2,5) × 2,5. El porcentaje sale del detalle del día ("@ 65%").
  function kgDesdeRM(rm, detalle) {
    var m = String(detalle || '').match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (rm == null || !m) return null;
    return Math.round(rm * Number(m[1].replace(',', '.')) / 100 / 2.5) * 2.5;
  }

  // ---- Ejercicios extra del día (añadidos a mano a la sesión): solo valen para esa fecha, entreno y columna ----

  function claveExtras() {
    var c = Almacen.config();
    return 'gymapp.extras.' + (c ? c.persona : 'nadie');
  }

  function leerExtras() {
    try {
      return JSON.parse(localStorage.getItem(claveExtras()) || '{}');
    } catch (e) {
      return {};
    }
  }

  function extrasDe(entreno, columna) {
    return leerExtras()[Almacen.hoyISO() + '|' + entreno + '|' + columna] || [];
  }

  function ponerExtras(entreno, columna, lista) {
    var extras = leerExtras();
    var hoy = Almacen.hoyISO();
    Object.keys(extras).forEach(function (k) { if (k.slice(0, 10) < hoy) delete extras[k]; });
    if (lista.length) extras[hoy + '|' + entreno + '|' + columna] = lista;
    else delete extras[hoy + '|' + entreno + '|' + columna];
    try {
      localStorage.setItem(claveExtras(), JSON.stringify(extras));
    } catch (e) { /* sin espacio: el extra dura hasta cerrar la app */ }
  }

  function anadirExtra(entreno, columna, nombre) {
    var lista = extrasDe(entreno, columna);
    if (lista.some(function (n) { return normalizar(n) === normalizar(nombre); })) return;
    lista.push(nombre);
    ponerExtras(entreno, columna, lista);
  }

  function quitarExtra(entreno, columna, nombre) {
    ponerExtras(entreno, columna, extrasDe(entreno, columna).filter(function (n) { return normalizar(n) !== normalizar(nombre); }));
  }

  return {
    rmDe: rmDe,
    kgDesdeRM: kgDesdeRM,
    normalizar: normalizar,
    grupoDe: grupoDe,
    zonaDe: zonaDe,
    ordenZona: ordenZona,
    esCorporal: esCorporal,
    esAsistido: esAsistido,
    parecidos: parecidos,
    nombreReps: nombreReps,
    maximoReps: maximoReps,
    repsDesdeMaximo: repsDesdeMaximo,
    kgAsistido: kgAsistido,
    ayudaMenos: ayudaMenos,
    porTiempo: porTiempo,
    MATERIALES: MATERIALES,
    materialDe: materialDe,
    varianteDe: varianteDe,
    familiaDe: familiaDe,
    variantes: variantes,
    barraDe: barraDe,
    esCardio: esCardio,
    leerTiempo: leerTiempo,
    textoTiempo: textoTiempo,
    textoSerieTiempo: textoSerieTiempo,
    todos: todos,
    alternativas: alternativas,
    delDia: delDia,
    guardarGrupo: guardarGrupo,
    cambioDe: cambioDe,
    cambiar: cambiar,
    extrasDe: extrasDe,
    anadirExtra: anadirExtra,
    quitarExtra: quitarExtra,
  };
})();
