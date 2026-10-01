// Lee las pestañas "Entreno A1…B2" del Excel (rejilla de textos) y las convierte en la lista de ejercicios de la app.
// Se usa tal cual en Apps Script y en las pruebas de Node, por eso no usa módulos.
// Solo lee la celda superior izquierda de cada celda combinada: Apps Script deja vacías las demás.
var Plan = (function () {
  // Parejas de columnas [series/kg, reps] de cada semana: D-E … P-Q, y S-T para el AMRAP. R es la separación.
  var COLUMNAS = [[3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [18, 19]];

  function texto(fila, col) {
    return fila && fila[col] != null ? String(fila[col]).trim() : '';
  }

  function numero(t) {
    var limpio = String(t || '').replace(/\s/g, '').replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(limpio) ? Number(limpio) : null;
  }

  // "1.30 minutos" → 90, "2-3 minutos" → 120, "Entre descansos PUSH (1.30)" → 90, "30 seg" → 30.
  function descansoSegundos(t) {
    var s = String(t || '').toLowerCase();
    var m = s.match(/(\d+)[.,:](\d+)/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    m = s.match(/(\d+)\s*-\s*\d+\s*min/) || s.match(/(\d+)\s*min/);
    if (m) return Number(m[1]) * 60;
    m = s.match(/(\d+)\s*seg/);
    return m ? Number(m[1]) : null;
  }

  // "3x9" → 3 series de 9; "2x8 + 2x7" → 2 de 8 y 2 de 7; "3 o 4 x" con "12" → 4 series de 12, la cuarta opcional.
  function seriesPlan(seriesTxt, repsTxt) {
    var partes = String(seriesTxt || '').split('+');
    var lista = [];
    if (partes.every(function (p) { return /\d+\s*x\s*\S/i.test(p); })) {
      partes.forEach(function (p) {
        var m = p.match(/(\d+)\s*x\s*(.+)/i);
        for (var i = 0; i < Number(m[1]); i++) lista.push({ reps: m[2].trim(), opcional: false });
      });
      return lista;
    }
    var nums = (String(seriesTxt || '').match(/\d+/g) || []).map(Number);
    if (!nums.length) return lista;
    var min = Math.min.apply(null, nums);
    var max = Math.max.apply(null, nums);
    for (var j = 0; j < max; j++) lista.push({ reps: String(repsTxt || '').trim(), opcional: j >= min });
    return lista;
  }

  function columna(objetivo, detalle, series, kg) {
    return { objetivo: objetivo.replace(/\s+/g, ' ').trim(), detalle: detalle, series: series, kg: kg };
  }

  function ejercicio(base, tipo, nombre, columnas, descansos) {
    columnas.forEach(function (c, i) {
      c.descanso = descansos[i].segundos;
      c.descansoTexto = descansos[i].texto;
    });
    return Object.assign({
      id: base.entreno + '-' + base.fila,
      tipo: tipo,
      nombre: nombre,
      nombreCorto: nombre.replace(/^WEAK POINT:\s*/i, ''),
      columnas: columnas,
    }, base);
  }

  // Series y reps sacadas de la fila del nombre; el detalle (RIR, "1 y 1/2"…) de la fila de debajo.
  function columnasSimples(filas, s) {
    return COLUMNAS.map(function (c) {
      var series = texto(filas[s], c[0]);
      var reps = texto(filas[s], c[1]);
      return columna(series + ' ' + reps, texto(filas[s + 1], c[1]), seriesPlan(series, reps), null);
    });
  }

  // Un bloque va desde la fila del nombre (s) hasta su fila "Tiempo de pausa" (e), ambas en base 0.
  function leerBloque(filas, s, e, entreno) {
    var nombre = texto(filas[s], 0);
    if (s >= e || !nombre || /^Tiempo de pausa/i.test(nombre)) return [];

    var descansos = COLUMNAS.map(function (c) {
      var t = texto(filas[e], c[0]);
      return { texto: t, segundos: descansoSegundos(t) };
    });
    var filaSerie = -1;
    var filaRM = -1;
    for (var r = s; r < e; r++) {
      var a = texto(filas[r], 0);
      if (filaSerie < 0 && /ºSerie/i.test(a)) filaSerie = r;
      if (filaRM < 0 && /RM Te[oó]rico/i.test(a)) filaRM = r;
    }
    var base = { entreno: entreno, fila: s + 1 };

    if (/^WEAK POINT/i.test(nombre)) {
      return [ejercicio(base, 'debil', nombre, columnasSimples(filas, s), descansos)];
    }

    if (/JUMPS? SET/i.test(texto(filas[s + 1], 0))) {
      var otro = texto(filas[s + 2], 0);
      var grupo = entreno + '-' + (s + 1);
      return [nombre, otro].map(function (n, i) {
        var pareja = i === 0 ? otro : nombre;
        var cols = COLUMNAS.map(function (c) {
          var series = texto(filas[s], c[0]);
          var reps = texto(filas[s], c[1]);
          return columna(series + ' ' + reps, 'Jump set con ' + pareja, seriesPlan(series, reps), null);
        });
        return ejercicio(Object.assign({}, base, { fila: s + 1 + i * 2, grupo: grupo }), 'jump', n, cols, descansos);
      });
    }

    if (filaSerie >= 0) {
      var principal = ejercicio(base, 'principal', nombre, COLUMNAS.map(function (c) {
        var esquema = texto(filas[s], c[0]);
        var pct = texto(filas[s + 1], c[1]);
        return columna(esquema, pct ? '@ ' + pct : '', seriesPlan(esquema, ''), numero(texto(filas[filaSerie], c[0])));
      }), descansos);
      if (filaRM >= 0) {
        principal.rm = numero(texto(filas[filaRM], 2));
        principal.celdaRM = 'C' + (filaRM + 1);
      }
      return [principal];
    }

    return [ejercicio(base, 'secundario', nombre, columnasSimples(filas, s), descansos)];
  }

  function leerHoja(filas, entreno) {
    var ejercicios = [];
    var inicio = 1; // la fila 1 es la cabecera "Series / Rep."
    for (var r = 1; r < filas.length; r++) {
      if (!/^Tiempo de pausa/i.test(texto(filas[r], 0))) continue;
      Array.prototype.push.apply(ejercicios, leerBloque(filas, inicio, r, entreno));
      inicio = r + 1;
    }
    return ejercicios;
  }

  // hojas: { "Entreno A1": filas, … } → { A1: [ejercicios], B1: …, A2: …, B2: … }
  function leerLibro(hojas) {
    var entrenos = {};
    Object.keys(hojas).forEach(function (nombre) {
      var m = nombre.match(/^Entreno\s+([AB][12])$/i);
      if (m) entrenos[m[1].toUpperCase()] = leerHoja(hojas[nombre], m[1].toUpperCase());
    });
    return entrenos;
  }

  return {
    COLUMNAS: COLUMNAS,
    leerLibro: leerLibro,
    leerHoja: leerHoja,
    seriesPlan: seriesPlan,
    descansoSegundos: descansoSegundos,
    numero: numero,
  };
})();
