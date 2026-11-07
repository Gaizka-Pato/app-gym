// Evolución del ciclo calculada en el móvil con sus propias series (antes solo se leía de la pestaña
// "Estimado vs realizado" del Excel, que se quedaba atrasada). Hace lo mismo que accionVsRealizado de la API:
// - estimado: los kg que pide el plan en cada columna (con el peso del cuerpo, las reps: máximo × %);
// - realizado: el peso de trabajo (el más repetido; si empatan, el mayor) de la última sesión de ese entreno y
//   columna; con el peso del cuerpo, la mejor serie en reps;
// - si ese día se cambió el ejercicio ("⇄ Cambiar"), con qué se hizo y lo que le tocaba con su propio 1RM.
// Solo el ciclo en curso: los anteriores siguen saliendo de lo que ya había en el Excel.
var Progreso = (function () {
  // El ciclo en curso empieza el día siguiente al último de la columna AMRAP del ciclo anterior.
  function inicioCiclo(hoyISO) {
    var f = hoyISO;
    for (var i = 0; i < 120; i++) {
      var antes = Calendario.sumarDias(f, -1);
      if (Calendario.porCalendario(antes).columna === Calendario.COLUMNAS && Calendario.porCalendario(f).columna === 1) return f;
      f = antes;
    }
    return f;
  }

  // Días que dura un ciclo: 8 columnas × 4 entrenos × 2 días (uno sí y otro no).
  var DIAS_CICLO = Calendario.COLUMNAS * Calendario.ORDEN.length * 2;

  // Cuántos ciclos del calendario hay entre dos días (0 si caen en el mismo).
  function ciclosEntre(desde, hasta) {
    var a = Date.parse(inicioCiclo(desde)), b = Date.parse(inicioCiclo(hasta));
    return Math.round((b - a) / 86400000 / DIAS_CICLO);
  }

  // El ciclo en curso: el siguiente al último del Recopilatorio. Sin AMRAP (la rutina Torso/Pierna) el Recopilatorio
  // no suma ciclos, así que también se cuentan los ciclos del calendario que han pasado desde esa fila.
  function numeroDeCiclo(recopilatorio, hoyISO) {
    var n = 0, fecha = null;
    (recopilatorio || []).forEach(function (fila) {
      var m = String(fila.ciclo || '').match(/Ciclo\s+(\d+)/i);
      if (m && Number(m[1]) >= n) {
        n = Number(m[1]);
        var f = String(fila.fecha || '').slice(0, 10);
        fecha = /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null;
      }
    });
    var pasados = fecha && hoyISO && fecha < hoyISO ? ciclosEntre(fecha, hoyISO) : 0;
    return n + Math.max(1, pasados);
  }

  function masRepetido(cuentas, mayor) {
    var mejor = null;
    Object.keys(cuentas).forEach(function (k) {
      var v = cuentas[k];
      var n = mayor ? Number(k) : k;
      if (!mejor || v > mejor.veces || (mayor && v === mejor.veces && n > mejor.valor)) mejor = { valor: n, veces: v };
    });
    return mejor ? mejor.valor : null;
  }

  var guardado = { clave: null, valor: null };

  function calcular() {
    var propios = Almacen.datosPropios();
    var plan = Almacen.plan();
    if (!propios || !plan || !plan.entrenos) return null;
    var series = Almacen.series();
    var hoy = Almacen.hoyISO();
    // Lo mismo dos veces seguidas no se vuelve a calcular: la pantalla lo pide varias veces al pintarse.
    if (guardado.series === series && guardado.plan === plan && guardado.propios === propios && guardado.hoy === hoy) return guardado.valor;

    var ciclo = 'Ciclo ' + numeroDeCiclo(propios.recopilatorio, hoy);
    var inicio = inicioCiclo(hoy);
    var delCiclo = series.filter(function (s) { return s.fecha >= inicio && s.entreno && s.columna; });

    // Última fecha de cada sesión (entreno y columna), y lo hecho ese día en cada hueco del plan.
    var ultima = {};
    delCiclo.forEach(function (s) {
      var k = s.entreno + '|' + s.columna;
      if (!ultima[k] || s.fecha > ultima[k]) ultima[k] = s.fecha;
    });
    var huecos = {};
    delCiclo.forEach(function (s) {
      var sesion = s.entreno + '|' + s.columna;
      if (s.fecha !== ultima[sesion]) return;
      var clave = sesion + '|' + Grupos.normalizar(s.sustituye || s.ejercicio);
      var x = huecos[clave] || (huecos[clave] = { kgs: {}, reps: null, con: {} });
      if (s.sustituye && Grupos.normalizar(s.ejercicio) !== Grupos.normalizar(s.sustituye)) {
        x.con[s.ejercicio] = (x.con[s.ejercicio] || 0) + 1;
      }
      var kg = Number(s.kg);
      if (s.kg != null && s.kg !== '' && !isNaN(kg)) x.kgs[kg] = (x.kgs[kg] || 0) + 1;
      if (s.reps > 0 && (x.reps == null || s.reps > x.reps)) x.reps = Number(s.reps);
    });

    var ejercicios = [];
    var filas = [];
    for (var i = 0; i < Calendario.COLUMNAS; i++) {
      var sufijo = i + 1 === Calendario.COLUMNAS ? 'AMRAP' : 'col ' + (i + 1);
      filas.push({ etiqueta: ciclo + ' · ' + sufijo, ciclo: ciclo, columna: sufijo, objetivo: '', valores: {} });
    }
    Calendario.ORDEN.forEach(function (entreno) {
      (plan.entrenos[entreno] || []).forEach(function (ej) {
        if (ej.tipo !== 'principal') return;
        var corporal = Grupos.esCorporal(ej.nombre);
        if (ej.rm == null && !corporal) return;
        var nombre = (ej.nombreCorto || ej.nombre) + (corporal ? ' (reps)' : '');
        if (ejercicios.indexOf(nombre) < 0) ejercicios.push(nombre);
        var maximo = corporal ? Grupos.rmDe(Grupos.nombreReps(ej.nombreCorto || ej.nombre)) : null;
        ej.columnas.forEach(function (col, c) {
          var amrap = c + 1 === Calendario.COLUMNAS;
          var estimado = corporal
            ? (maximo > 0 ? (amrap ? maximo : Grupos.repsDesdeMaximo(maximo, col.detalle)) : null)
            : (col.kg != null ? col.kg : null);
          var x = huecos[entreno + '|' + (c + 1) + '|' + Grupos.normalizar(ej.nombre)];
          var realizado = x ? (corporal ? x.reps : masRepetido(x.kgs, true)) : null;
          var con = x ? masRepetido(x.con, false) : null;
          if (estimado == null && realizado == null) return;
          var valores = [estimado, realizado];
          if (con) {
            var rmCon = Grupos.rmParaCambio(con);
            valores.push({ con: con, toco: corporal || !(rmCon > 0) ? null : Grupos.kgDesdeRM(rmCon, col.detalle) });
          }
          // Un mismo ejercicio en dos entrenos: la primera vez que salga en esa columna.
          if (!filas[c].valores[nombre] || filas[c].valores[nombre][1] == null) filas[c].valores[nombre] = valores;
        });
      });
    });
    var valor = { ciclo: ciclo, inicio: inicio, ejercicios: ejercicios, filas: filas };
    guardado = { series: series, plan: plan, propios: propios, hoy: hoy, valor: valor };
    return valor;
  }

  return { calcular: calcular, inicioCiclo: inicioCiclo, numeroDeCiclo: numeroDeCiclo, DIAS_CICLO: DIAS_CICLO };
})();
