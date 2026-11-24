// Qué entreno y qué columna tocan. Sirve para la app (navegador) y para las pruebas de Node, por eso no usa módulos.
// Rotación: A1 → B1 → A2 → B2, un entreno cada dos días. Cada vuelta completa es una columna; la 8 es el AMRAP.
var Calendario = (function () {
  var ORDEN = ['A1', 'B1', 'A2', 'B2'];
  var COLUMNAS = 8;
  // 14/09/2026 fue B2 de la columna 1 (lo usaban el calendario de Google y la fórmula del Excel).
  var REFERENCIA = Date.UTC(2026, 8, 14);
  var DIA = 24 * 60 * 60 * 1000;
  // Primer día de gym que cuenta para las faltas.
  var INICIO_FALTAS = '2026-09-20';

  function mod(a, n) {
    return ((a % n) + n) % n;
  }

  function diasEntre(fechaISO) {
    var p = fechaISO.split('-').map(Number);
    return Math.round((Date.UTC(p[0], p[1] - 1, p[2]) - REFERENCIA) / DIA);
  }

  // Lo que toca según el calendario fijo, sin mirar lo que se ha apuntado.
  function porCalendario(fechaISO) {
    var n = diasEntre(fechaISO);
    var sesion = Math.ceil(n / 2);
    return {
      entreno: ['B2', 'A1', 'B1', 'A2'][mod(sesion, 4)],
      columna: mod(Math.floor((sesion + 3) / 4), COLUMNAS) + 1,
      descanso: mod(n, 2) === 1,
    };
  }

  function sumarDias(fechaISO, n) {
    var p = fechaISO.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
  }

  // Manda el calendario: quien falta pierde ese entreno y sigue con el de los demás.
  // ultima: { fecha, entreno, columna } de la última sesión apuntada, o null. Si ya hay algo apuntado hoy, esa
  // sesión sigue en curso. pendienteAyer: ayer tocaba gym y no se completó; en el descanso de hoy se puede recuperar.
  function siguiente(ultima, hoyISO, pendienteAyer) {
    if (ultima && ultima.fecha === hoyISO) return { entreno: ultima.entreno, columna: ultima.columna, enCurso: true };
    var hoy = porCalendario(hoyISO);
    if (hoy.descanso && pendienteAyer) {
      var ayer = porCalendario(sumarDias(hoyISO, -1));
      return { entreno: ayer.entreno, columna: ayer.columna, recuperar: true };
    }
    return hoy;
  }

  function nombreColumna(columna) {
    return columna === COLUMNAS ? 'AMRAP' : 'Columna ' + columna;
  }

  return {
    ORDEN: ORDEN,
    COLUMNAS: COLUMNAS,
    INICIO_FALTAS: INICIO_FALTAS,
    sumarDias: sumarDias,
    porCalendario: porCalendario,
    siguiente: siguiente,
    nombreColumna: nombreColumna,
  };
})();
