// Lo que trae la app para quien empieza sin Excel (él, 2026-11-08: "cada uno su propia lista de ejercicios"):
// una lista de ejercicios de serie y dos rutinas para poder entrenar el primer día. Cada uno lo cambia a su gusto.
// No es privado: son ejercicios de gimnasio corrientes, sin kg ni nombres de nadie.
var Inicial = (function () {
  // [nombre, grupo, tipo, material, variante de] — el mismo formato que la pestaña "Ejercicios" del Excel.
  var EJERCICIOS = [
    ['Press Banca', 'Pecho', '', 'barra', ''],
    ['Press Banca (Mancuernas)', 'Pecho', '', 'mancuernas', 'Press Banca'],
    ['Press Inclinado', 'Pecho', '', 'barra', ''],
    ['Press Inclinado (Mancuernas)', 'Pecho', '', 'mancuernas', 'Press Inclinado'],
    ['Press de Pecho en Máquina', 'Pecho', '', 'maquina', ''],
    ['Aperturas', 'Pecho', '', 'maquina', ''],
    ['Fondos', 'Pecho', 'corporal', 'corporal', ''],
    ['Dominadas', 'Espalda', 'corporal', 'corporal', ''],
    ['Dominadas Asistidas', 'Espalda', 'asistida', 'maquina', ''],
    ['Jalón al Pecho', 'Espalda', '', 'maquina', ''],
    ['Remo con Barra', 'Espalda', '', 'barra', ''],
    ['Remo Sentado', 'Espalda', '', 'maquina', ''],
    ['Remo Unilateral', 'Espalda', '', 'polea', ''],
    ['Pull Over', 'Espalda', '', 'polea', ''],
    ['Hiperextensión', 'Lumbar', 'corporal', 'corporal', ''],
    ['Press Militar', 'Hombro', '', 'barra', ''],
    ['Press Militar (Mancuernas)', 'Hombro', '', 'mancuernas', 'Press Militar'],
    ['Elevaciones Laterales', 'Hombro', '', 'mancuernas', ''],
    ['Hombro Posterior', 'Hombro', '', 'maquina', ''],
    ['Trapecio', 'Trapecio', '', 'mancuernas', ''],
    ['Curl de Bíceps', 'Bíceps', '', 'barra z', ''],
    ['Curl 45º', 'Bíceps', '', 'mancuernas', ''],
    ['Jalón de Tríceps', 'Tríceps', '', 'polea', ''],
    ['Extensión de Tríceps', 'Tríceps', '', 'barra z', ''],
    ['Sentadilla', 'Cuádriceps', '', 'barra', ''],
    ['Prensa', 'Cuádriceps', '', 'maquina', ''],
    ['Extensión de Cuádriceps', 'Cuádriceps', '', 'maquina', ''],
    ['Peso Muerto', 'Femoral y glúteo', '', 'barra', ''],
    ['Peso Muerto Rumano', 'Femoral y glúteo', '', 'barra', ''],
    ['Curl Femoral', 'Femoral y glúteo', '', 'maquina', ''],
    ['Hip Thrust', 'Femoral y glúteo', '', 'maquina', ''],
    ['Aductores', 'Aductores', '', 'maquina', ''],
    ['Gemelos', 'Gemelo', '', 'maquina', ''],
    ['Abdominales', 'Abdomen', 'corporal', 'corporal', ''],
    ['Toes to Bar', 'Abdomen', 'corporal', 'corporal', ''],
    ['Plancha', 'Abdomen', 'tiempo', 'corporal', ''],
    ['Correr', 'Cardio', 'tiempo', 'corporal', ''],
    ['Andar', 'Cardio', 'tiempo', 'corporal', ''],
    ['Correr en Cinta', 'Cardio', 'tiempo', 'maquina', ''],
    ['Bicicleta', 'Cardio', 'tiempo', 'maquina', ''],
  ];

  // Ocho semanas de doble progresión (sin 1RM ni %): la última, semana suave con la mitad de series.
  function progresion(id, series) {
    var semanas = [];
    for (var i = 0; i < 7; i++) semanas.push({ series: String(series) });
    semanas.push({ series: String(Math.max(1, Math.ceil(series / 2))), nota: 'Semana suave: mismo peso, lejos del fallo' });
    return { id: id, nombre: series + ' series', semanas: semanas };
  }

  var GRANDE = { descanso: 120, nota: 'Deja 1-2 reps en reserva' };
  var RESTO = { descanso: 75, nota: 'Última serie al fallo' };

  function ej(id, nombre, prog, reps, grande) {
    return Object.assign({ id: id, nombre: nombre, tipo: 'secundario', progresion: prog, reps: reps }, grande ? GRANDE : RESTO);
  }

  var PLANTILLAS = [
    {
      id: 'torso-pierna', nombre: 'Torso / Pierna', detalle: '4 días a la semana · lunes, martes, jueves y viernes',
      patron: 'EEDEEDD',
      entrenos: [
        { id: 'A1', nombre: 'Torso 1', ejercicios: [
          ej('A1-1', 'Press Banca', 'P3', '6-8', true), ej('A1-2', 'Jalón al Pecho', 'P3', '8-10', true),
          ej('A1-3', 'Press Inclinado (Mancuernas)', 'P2', '10-12'), ej('A1-4', 'Remo Sentado', 'P3', '10-12'),
          ej('A1-5', 'Elevaciones Laterales', 'P3', '12-15'), ej('A1-6', 'Curl de Bíceps', 'P2', '10-12'),
          ej('A1-7', 'Jalón de Tríceps', 'P2', '12-15'),
        ] },
        { id: 'B1', nombre: 'Pierna 1', ejercicios: [
          ej('B1-1', 'Sentadilla', 'P3', '6-8', true), ej('B1-2', 'Curl Femoral', 'P3', '10-12'),
          ej('B1-3', 'Extensión de Cuádriceps', 'P2', '12-15'), ej('B1-4', 'Gemelos', 'P3', '10-15'),
          ej('B1-5', 'Abdominales', 'P2', '12-15'),
        ] },
        { id: 'A2', nombre: 'Torso 2', ejercicios: [
          ej('A2-1', 'Press Militar', 'P3', '6-8', true), ej('A2-2', 'Remo con Barra', 'P3', '8-10', true),
          ej('A2-3', 'Aperturas', 'P2', '12-15'), ej('A2-4', 'Pull Over', 'P2', '12-15'),
          ej('A2-5', 'Hombro Posterior', 'P3', '12-15'), ej('A2-6', 'Curl 45º', 'P2', '10-12'),
          ej('A2-7', 'Extensión de Tríceps', 'P2', '10-12'),
        ] },
        { id: 'B2', nombre: 'Pierna 2', ejercicios: [
          ej('B2-1', 'Peso Muerto Rumano', 'P3', '8-10', true), ej('B2-2', 'Prensa', 'P3', '10-12'),
          ej('B2-3', 'Hip Thrust', 'P3', '10-12'), ej('B2-4', 'Aductores', 'P2', '12-15'),
          ej('B2-5', 'Gemelos', 'P3', '10-15'),
        ] },
      ],
    },
    {
      id: 'cuerpo-entero', nombre: 'Cuerpo entero', detalle: '3 días a la semana · lunes, miércoles y viernes',
      patron: 'EDEDEDD',
      entrenos: [
        { id: 'A', nombre: 'Día A', ejercicios: [
          ej('A-1', 'Sentadilla', 'P3', '6-8', true), ej('A-2', 'Press Banca', 'P3', '6-8', true),
          ej('A-3', 'Remo Sentado', 'P3', '10-12'), ej('A-4', 'Elevaciones Laterales', 'P2', '12-15'),
          ej('A-5', 'Curl de Bíceps', 'P2', '10-12'), ej('A-6', 'Abdominales', 'P2', '12-15'),
        ] },
        { id: 'B', nombre: 'Día B', ejercicios: [
          ej('B-1', 'Peso Muerto Rumano', 'P3', '8-10', true), ej('B-2', 'Press Militar', 'P3', '6-8', true),
          ej('B-3', 'Jalón al Pecho', 'P3', '8-10'), ej('B-4', 'Prensa', 'P2', '10-12'),
          ej('B-5', 'Jalón de Tríceps', 'P2', '12-15'), ej('B-6', 'Gemelos', 'P2', '10-15'),
        ] },
      ],
    },
  ];

  // La rutina lista para guardar, empezando hoy (el patrón sigue cayendo en sus días de la semana: Rutina lo ancla
  // al lunes y cuenta las sesiones desde el inicio, así que el primer día de entreno desde hoy es el primer entreno).
  function rutina(id, hoyISO) {
    var p = PLANTILLAS.filter(function (x) { return x.id === id; })[0];
    if (!p) return null;
    var fin = new Date(new Date(hoyISO + 'T12:00:00Z').getTime() + (8 * 7 - 1) * 86400000).toISOString().slice(0, 10);
    return {
      version: 1, id: 'R1', nombre: p.nombre,
      dias: { patron: p.patron, inicio: hoyISO, fin: fin }, semanas: 8, amrap: false,
      progresiones: [progresion('P2', 2), progresion('P3', 3)],
      entrenos: JSON.parse(JSON.stringify(p.entrenos)),
    };
  }

  return {
    EJERCICIOS: EJERCICIOS,
    PLANTILLAS: PLANTILLAS.map(function (p) { return { id: p.id, nombre: p.nombre, detalle: p.detalle }; }),
    rutina: rutina,
  };
})();
