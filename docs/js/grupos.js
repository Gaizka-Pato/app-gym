// Grupos musculares (pestaña "Grupos musculares" del Excel) y cambios de ejercicio del día.
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
      return true;
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

  function guardarGrupo(ejercicio, grupo) {
    return Almacen.llamar('guardarGrupo', { ejercicio: ejercicio, grupo: grupo }).then(function () {
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
