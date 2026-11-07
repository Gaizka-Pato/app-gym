// Cuentas de la comida: lo comido, el gasto del día, el balance, los objetivos de cada plan, el agua y la despensa.
// Sin DOM ni almacén, como calendario.js: sirve para la app y para las pruebas de Node. Las cifras van todas arriba
// para poder cambiarlas en un solo sitio (propuestas del 2026-11-05, sin cerrar con él).
var Comida = (function () {
  var KCAL_POR_KG = 7700;           // 1 kg de peso ≈ 7.700 kcal
  var VIDA_DIARIA = 0.10;           // lo que se mueve uno sin contar pasos ni entreno, sobre el basal
  var DIGESTION = 0.10;             // efecto térmico de lo comido
  var KCAL = { proteina: 4, hidratos: 4, grasa: 9 };
  var AGUA_ML_KG = 35;
  var AGUA_ML_HORA_ENTRENO = 500;

  // Los tres planes. semana: cambio de peso buscado por semana (fracción del peso). proteina y grasa en g por kg.
  var PLANES = {
    mantenimiento: { nombre: 'Mantenimiento', semana: 0, proteina: 2, grasa: 0.8 },
    volumen: { nombre: 'Volumen', semana: 0.0025, proteina: 2, grasa: 0.8 },
    recorte: { nombre: 'Recorte', semana: -0.005, proteina: 2.2, grasa: 0.8 },
  };

  // Desayuno, Comida y Cena siempre; Almuerzo y Merienda si se apuntan.
  var COMIDAS = [
    { id: 'desayuno', nombre: 'Desayuno', opcional: false },
    { id: 'almuerzo', nombre: 'Almuerzo', opcional: true },
    { id: 'comida', nombre: 'Comida', opcional: false },
    { id: 'merienda', nombre: 'Merienda', opcional: true },
    { id: 'cena', nombre: 'Cena', opcional: false },
  ];

  function redondear(n, d) {
    var f = Math.pow(10, d || 0);
    return Math.round(n * f) / f;
  }

  function edadEn(nacimiento, fechaISO) {
    var n = String(nacimiento || '').split('-').map(Number);
    var f = String(fechaISO || '').split('-').map(Number);
    if (n.length < 3 || f.length < 3 || !n[0] || !f[0]) return null;
    var edad = f[0] - n[0];
    if (f[1] < n[1] || (f[1] === n[1] && f[2] < n[2])) edad--;
    return edad;
  }

  // Basal en reposo (Mifflin-St Jeor). cuerpo: { sexo: 'hombre'|'mujer', peso, altura (cm), nacimiento | edad }.
  // null si falta algo.
  function basal(cuerpo, fechaISO) {
    if (!cuerpo || !(cuerpo.peso > 0) || !(cuerpo.altura > 0)) return null;
    var edad = cuerpo.nacimiento ? edadEn(cuerpo.nacimiento, fechaISO) : cuerpo.edad;
    if (!(edad > 0)) return null;
    var base = 10 * cuerpo.peso + 6.25 * cuerpo.altura - 5 * edad;
    return redondear(base + (cuerpo.sexo === 'mujer' ? -161 : 5));
  }

  // Lo que aporta un alimento en una cantidad. alimento: macros por 100 g (o por 100 ml): { kcal, proteina, hidratos,
  // grasa }. Si no trae kcal, se calculan con los macros.
  function porCantidad(alimento, gramos) {
    var f = (Number(gramos) || 0) / 100;
    var p = (Number(alimento.proteina) || 0) * f;
    var h = (Number(alimento.hidratos) || 0) * f;
    var g = (Number(alimento.grasa) || 0) * f;
    var kcal = alimento.kcal != null && alimento.kcal !== '' ? Number(alimento.kcal) * f : p * KCAL.proteina + h * KCAL.hidratos + g * KCAL.grasa;
    return { kcal: redondear(kcal), proteina: redondear(p, 1), hidratos: redondear(h, 1), grasa: redondear(g, 1) };
  }

  // Suma de lo apuntado: [{ kcal, proteina, hidratos, grasa }] (cada apunte guarda sus macros de ese momento).
  function sumar(apuntes) {
    var t = { kcal: 0, proteina: 0, hidratos: 0, grasa: 0 };
    (apuntes || []).forEach(function (a) {
      t.kcal += Number(a.kcal) || 0;
      t.proteina += Number(a.proteina) || 0;
      t.hidratos += Number(a.hidratos) || 0;
      t.grasa += Number(a.grasa) || 0;
    });
    return { kcal: redondear(t.kcal), proteina: redondear(t.proteina, 1), hidratos: redondear(t.hidratos, 1), grasa: redondear(t.grasa, 1) };
  }

  // Lo comido de un día por comidas: { desayuno: {kcal…}, …, total }. apuntes: [{ comida, kcal, proteina… }].
  function delDia(apuntes) {
    var r = {};
    COMIDAS.forEach(function (c) {
      r[c.id] = sumar((apuntes || []).filter(function (a) { return a.comida === c.id; }));
    });
    r.total = sumar(apuntes);
    return r;
  }

  // Gasto del día en kcal, por partes. dia: { andar (kcal de los pasos), entreno (kcal del entreno), horasEntreno,
  // comido (kcal), parteDelDia (0-1: hoy, lo que va de día; el basal y la vida diaria solo esa parte) }. Las kcal del
  // entreno se calculan con MET (que incluye el reposo): se quita lo que ya cuenta el basal en esas horas (1 MET = 1 kcal
  // por kg y hora). null sin basal (faltan datos del cuerpo).
  function gasto(cuerpo, fechaISO, dia) {
    var b = basal(cuerpo, fechaISO);
    if (b == null) return null;
    dia = dia || {};
    if (dia.parteDelDia != null) b = redondear(b * Math.max(0, Math.min(1, dia.parteDelDia)));
    var vida = b * VIDA_DIARIA;
    var andar = Number(dia.andar) || 0;
    var entreno = Math.max(0, (Number(dia.entreno) || 0) - cuerpo.peso * (Number(dia.horasEntreno) || 0));
    var digestion = (Number(dia.comido) || 0) * DIGESTION;
    var total = b + vida + andar + entreno + digestion;
    return { basal: b, vida: redondear(vida), andar: redondear(andar), entreno: redondear(entreno),
      digestion: redondear(digestion), total: redondear(total) };
  }

  // Comido − gastado: negativo = déficit.
  function balance(comido, gastado) {
    return gastado == null ? null : redondear((Number(comido) || 0) - gastado);
  }

  // Lo que hay que comer cada día según el plan: el gasto medio (fijo cada día, el balance es lo real) más lo que pide
  // el cambio de peso buscado. Macros: proteína y grasa por kg, los hidratos con lo que queda (nunca negativos).
  function objetivo(plan, cuerpo, gastoMedio) {
    var p = PLANES[plan] || PLANES.mantenimiento;
    if (!cuerpo || !(cuerpo.peso > 0) || !(gastoMedio > 0)) return null;
    var porDia = cuerpo.peso * p.semana * KCAL_POR_KG / 7;
    var kcal = Math.round((gastoMedio + porDia) / 10) * 10;
    var proteina = Math.round(cuerpo.peso * p.proteina);
    var grasa = Math.round(cuerpo.peso * p.grasa);
    var hidratos = Math.max(0, Math.round((kcal - proteina * KCAL.proteina - grasa * KCAL.grasa) / KCAL.hidratos));
    return { plan: plan in PLANES ? plan : 'mantenimiento', kcal: kcal, proteina: proteina, grasa: grasa, hidratos: hidratos,
      cambioSemana: redondear(cuerpo.peso * p.semana, 2) };
  }

  // Lo que falta (o sobra, en negativo) para el objetivo: { kcal, proteina, hidratos, grasa }.
  function falta(obj, comido) {
    if (!obj) return null;
    comido = comido || {};
    return {
      kcal: redondear(obj.kcal - (comido.kcal || 0)),
      proteina: redondear(obj.proteina - (comido.proteina || 0), 1),
      hidratos: redondear(obj.hidratos - (comido.hidratos || 0), 1),
      grasa: redondear(obj.grasa - (comido.grasa || 0), 1),
    };
  }

  // Agua del día en ml: 35 ml por kg y 500 ml por hora de entreno, redondeado a 50 ml. fijo (ml): si se pone a mano.
  function aguaObjetivo(peso, horasEntreno, fijo) {
    if (fijo > 0) return fijo;
    if (!(peso > 0)) return null;
    return Math.round((peso * AGUA_ML_KG + (Number(horasEntreno) || 0) * AGUA_ML_HORA_ENTRENO) / 50) * 50;
  }

  // ---- El peso corrige el gasto ----
  // Tras 2-3 semanas con pesos y comidas apuntadas, el gasto real sale de lo comido y de lo que ha cambiado el peso:
  // gasto = comido medio − (cambio de peso × 7.700 / días). El cambio de peso es la pendiente de la recta de los
  // pesos (más estable que el primero y el último). pesos: [{ fecha, kg }]. comidos: [{ fecha, kcal }] (solo días
  // apuntados). null con menos de minDias (14) entre el primer y el último peso, menos de 3 pesos o 7 días comidos.
  function diasEntre(a, b) {
    return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  }

  function pendientePeso(pesos) {
    if (pesos.length < 2) return null;
    var x0 = pesos[0].fecha;
    var xs = pesos.map(function (p) { return diasEntre(x0, p.fecha); });
    var ys = pesos.map(function (p) { return Number(p.kg); });
    var mx = xs.reduce(function (t, v) { return t + v; }, 0) / xs.length;
    var my = ys.reduce(function (t, v) { return t + v; }, 0) / ys.length;
    var num = 0, den = 0;
    xs.forEach(function (x, i) { num += (x - mx) * (ys[i] - my); den += (x - mx) * (x - mx); });
    return den ? num / den : null;   // kg por día
  }

  function gastoReal(pesos, comidos, minDias) {
    pesos = (pesos || []).filter(function (p) { return p && p.fecha && p.kg > 0; })
      .sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
    comidos = (comidos || []).filter(function (c) { return c && c.kcal > 0; });
    if (pesos.length < 3 || comidos.length < 7) return null;
    var dias = diasEntre(pesos[0].fecha, pesos[pesos.length - 1].fecha);
    if (dias < (minDias || 14)) return null;
    var desde = pesos[0].fecha, hasta = pesos[pesos.length - 1].fecha;
    var enRango = comidos.filter(function (c) { return c.fecha >= desde && c.fecha <= hasta; });
    if (enRango.length < 7) return null;
    var comidoMedio = enRango.reduce(function (t, c) { return t + Number(c.kcal); }, 0) / enRango.length;
    var kgDia = pendientePeso(pesos);
    return { kcal: redondear(comidoMedio - kgDia * KCAL_POR_KG), comidoMedio: redondear(comidoMedio),
      kgSemana: redondear(kgDia * 7, 2), dias: dias };
  }

  // ---- Despensa por movimientos ----
  // Nunca se guarda un total: cada cambio es un movimiento { id, producto, fecha (ISO con hora), tipo, cantidad }.
  // tipo: 'compra' (+), 'comido' (−) o 'ajuste' (la cantidad que hay de verdad: pone el total a eso). Así dos
  // móviles no se pisan. Devuelve { producto: cantidad } (nunca menos de 0); los repetidos por id cuentan una vez.
  // Además de esos tres: 'minimo' (cuántos tiene que haber como poco; el último manda) y 'pedir' (apuntado a mano en
  // la lista: cuántos comprar; una compra posterior lo quita, y 'pedir' 0 lo tacha sin comprar).
  // 'fuera': quitado de la despensa (ni hay, ni mínimo, ni se pide).
  // estadoDespensa → { producto: { hay, minimo, pedido, tuvo, saltar } }. tuvo: alguna vez hubo (si se acaba, a la
  // lista); saltar: tachado de la lista sin comprar ('pedir' 0), hasta que se compre, se ajuste o cambie el mínimo.
  function estadoDespensa(movimientos) {
    var vistos = {};
    var lista = (movimientos || []).filter(function (m) {
      if (!m || !m.producto || m.borrado === 'sí' || (m.id && vistos[m.id])) return false;
      if (m.id) vistos[m.id] = true;
      return true;
    }).sort(function (a, b) { return String(a.fecha) < String(b.fecha) ? -1 : String(a.fecha) > String(b.fecha) ? 1 : 0; });
    var estado = {};
    lista.forEach(function (m) {
      var c = Number(m.cantidad) || 0;
      var e = estado[m.producto] || (estado[m.producto] = { hay: 0, minimo: 0, pedido: 0, tuvo: false, saltar: false });
      if (m.tipo === 'ajuste') { e.hay = c; e.saltar = false; if (c > 0) e.tuvo = true; }
      else if (m.tipo === 'compra') { e.hay += c; e.pedido = 0; e.saltar = false; if (c > 0) e.tuvo = true; }
      else if (m.tipo === 'comido') e.hay -= c;
      else if (m.tipo === 'minimo') { e.minimo = Math.max(0, c); e.saltar = false; }
      else if (m.tipo === 'pedir') { e.pedido = Math.max(0, c); if (!(c > 0)) e.saltar = true; }
      else if (m.tipo === 'fuera') { e.hay = 0; e.minimo = 0; e.pedido = 0; e.tuvo = false; e.saltar = false; }
      e.hay = Math.max(0, Math.round(e.hay * 100) / 100);
    });
    return estado;
  }

  // Solo lo que hay: { producto: cantidad }.
  function despensa(movimientos) {
    var estado = estadoDespensa(movimientos);
    var hay = {};
    Object.keys(estado).forEach(function (p) { hay[p] = estado[p].hay; });
    return hay;
  }

  // Lo que hay que comprar: lo que está por debajo de su mínimo. minimos: { producto: cantidad }.
  function listaCompra(hay, minimos) {
    return Object.keys(minimos || {}).filter(function (p) { return (hay[p] || 0) < minimos[p]; })
      .map(function (p) { return { producto: p, hay: hay[p] || 0, minimo: minimos[p], falta: minimos[p] - (hay[p] || 0) }; });
  }

  // Queda poco sin mínimo puesto: menos de un cuarto de envase (el culo del brick).
  var POCO = 0.25;

  // La lista desde el estado (él, 2026-11-07: "cuando se agota o queda poco, a la compra"): lo que baja del mínimo
  // (hasta llegar a él, en envases enteros), lo que se ha acabado o queda poco (1) y lo apuntado a mano.
  // [{ producto, hay, minimo, falta, motivo }] (motivo: 'pedido', 'minimo', 'agotado', 'poco'), primero lo que no queda.
  function lista(estado) {
    return Object.keys(estado || {}).map(function (p) {
      var e = estado[p];
      var auto = !e.saltar;
      var porMinimo = auto && e.minimo > e.hay ? Math.ceil(e.minimo - e.hay) : 0;
      var sinMinimo = auto && !e.minimo && e.tuvo && e.hay < POCO ? 1 : 0;
      var falta = Math.max(porMinimo, sinMinimo, e.pedido || 0);
      var motivo = e.pedido && e.pedido >= falta ? 'pedido' : porMinimo ? 'minimo' : e.hay > 0 ? 'poco' : 'agotado';
      return { producto: p, hay: e.hay, minimo: e.minimo, falta: falta, motivo: motivo };
    }).filter(function (x) { return x.falta > 0; })
      .sort(function (a, b) { return (a.hay > 0) - (b.hay > 0) || String(a.producto).localeCompare(String(b.producto)); });
  }

  // Cuántos envases son unos gramos: con el tamaño del envase (o, si no se sabe, la ración; si tampoco, 1 por toma).
  function envasesDe(alimento, gramos) {
    var envase = Number(alimento && (alimento.envase || alimento.porcion)) || 0;
    if (!(envase > 0)) return 1;
    return Math.round((Number(gramos) || 0) / envase * 100) / 100;
  }

  // Lo que da la báscula Xiaomi (Body Composition Scale 2) con su impedancia: las fórmulas que usa su app, tal como
  // las publica openScale (MiScaleLib). cuerpo: { sexo, nacimiento, altura }. Devuelve { grasa (%), agua (%), musculo
  // (kg), hueso (kg) } o null si falta algo o no tiene sentido. (Él, 2026-11-07: "peso, hidratación, kilos de músculo
  // y porcentaje de grasa del pesaje".)
  function composicionXiaomi(cuerpo, fechaISO, kg, impedancia) {
    if (!cuerpo || !(cuerpo.altura > 0) || !(kg > 0) || !(impedancia > 0)) return null;
    var edad = cuerpo.nacimiento ? edadEn(cuerpo.nacimiento, fechaISO) : cuerpo.edad;
    if (!(edad > 0)) return null;
    var hombre = cuerpo.sexo !== 'mujer';
    var alto = Number(cuerpo.altura);
    var lbm = (alto * 9.058 / 100) * (alto / 100) + kg * 0.32 + 12.226 - impedancia * 0.0068 - edad * 0.0542;
    var resta = hombre ? 0.8 : edad <= 49 ? 9.25 : 7.25;
    var coef = 1;
    if (hombre && kg < 61) coef = 0.98;
    else if (!hombre && kg > 60) coef = alto > 160 ? 0.96 * 1.03 : 0.96;
    else if (!hombre && kg < 50) coef = alto > 160 ? 1.02 * 1.03 : 1.02;
    var grasa = (1 - ((lbm - resta) * coef) / kg) * 100;
    if (grasa > 63) grasa = 75;
    if (!(grasa > 0)) return null;
    var agua = (100 - grasa) * 0.7;
    agua *= agua < 50 ? 1.02 : 0.98;
    var hueso = -((hombre ? 0.18016894 : 0.245691014) - lbm * 0.05158);
    hueso += hueso > 2.2 ? 0.1 : -0.1;
    if (hueso > (hombre ? 5.2 : 5.1)) hueso = 8;
    var musculo = kg - grasa / 100 * kg - hueso;
    if (musculo >= (hombre ? 93.5 : 84)) musculo = 120;
    return { grasa: redondear(grasa, 1), agua: redondear(agua, 1), musculo: redondear(musculo, 1), hueso: redondear(hueso, 1) };
  }

  function grasaXiaomi(cuerpo, fechaISO, kg, impedancia) {
    var c = composicionXiaomi(cuerpo, fechaISO, kg, impedancia);
    return c ? c.grasa : null;
  }

  // ---- Salud: cómo van peso, grasa, músculo y agua frente al plan (él, 2026-11-07) ----
  // Como las gráficas del ciclo: lo que tocaría según el plan (discontinua) frente a lo que va (la tendencia: la media
  // de los pesajes de los últimos 10 días, porque el peso de un día baila 1-2 kg con el agua y la sal).
  // Peso: sube o baja lo que dice el plan por semana (PLANES.semana) desde la tendencia del primer pesaje del periodo.
  // Grasa, músculo y agua: la línea es lo de partida y lo que se quiere es que suba, baje o no se mueva según el plan.
  var VENTANA_TENDENCIA = 10;
  var QUIERO = {
    mantenimiento: { grasa: ['noSube', 1], musculo: ['noBaja', 0.5], agua: ['noBaja', 1.5] },
    volumen: { grasa: ['noSube', 1], musculo: ['sube', 0.3], agua: ['noBaja', 1.5] },
    recorte: { grasa: ['baja', 0.3], musculo: ['noBaja', 0.5], agua: ['noBaja', 1.5] },
  };

  function diasEntre(a, b) {
    return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
  }

  // 'bien' (verde), 'medio' (dorado: cerca) o 'mal' (rojo) para una diferencia d con lo de partida.
  function estadoQuiero(quiero, tol, d) {
    if (quiero === 'sube') return d > tol ? 'bien' : d >= -tol ? 'medio' : 'mal';
    if (quiero === 'baja') return d < -tol ? 'bien' : d <= tol ? 'medio' : 'mal';
    if (quiero === 'noBaja') return d >= -tol ? 'bien' : d >= -2 * tol ? 'medio' : 'mal';
    if (quiero === 'noSube') return d <= tol ? 'bien' : d <= 2 * tol ? 'medio' : 'mal';
    return Math.abs(d) <= tol ? 'bien' : Math.abs(d) <= 2 * tol ? 'medio' : 'mal';
  }

  // pesajes: [{ fecha, kg, grasa, agua, musculo }] (en cualquier orden). aspecto: 'kg' | 'grasa' | 'musculo' | 'agua'.
  // desde: solo los pesajes de esa fecha en adelante (la tendencia sí mira los de antes).
  // Devuelve null sin datos, o { puntos: [{ fecha, valor, tendencia, tocaba, estado }], partida, quiero,
  // porSemana (cambio de la tendencia por semana, con 7 días o más), estado (el del último) }.
  function salud(pesajes, aspecto, plan, desde) {
    var conDato = (pesajes || []).filter(function (p) { return p && p.fecha && Number(p[aspecto]) > 0; })
      .sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
    var tendencia = function (fecha) {
      var ventana = conDato.filter(function (p) { var d = diasEntre(p.fecha, fecha); return d >= 0 && d < VENTANA_TENDENCIA; });
      return redondear(ventana.reduce(function (s, p) { return s + Number(p[aspecto]); }, 0) / ventana.length, 2);
    };
    var enPeriodo = conDato.filter(function (p) { return !desde || p.fecha >= desde; });
    if (!enPeriodo.length) return null;
    var primero = enPeriodo[0].fecha;
    var partida = tendencia(primero);
    var datosPlan = PLANES[plan] || PLANES.mantenimiento;
    var regla = aspecto === 'kg' ? null : (QUIERO[plan] || QUIERO.mantenimiento)[aspecto];
    var puntos = enPeriodo.map(function (p) {
      var t = tendencia(p.fecha);
      var tocaba, estado;
      if (aspecto === 'kg') {
        tocaba = redondear(partida * Math.pow(1 + datosPlan.semana, diasEntre(primero, p.fecha) / 7), 2);
        // Mantenimiento: una franja de ±1 %; volumen y recorte, ±0,5 % de lo previsto (y el doble, "cerca").
        var tol = datosPlan.semana === 0 ? 0.01 : 0.005;
        var d = Math.abs(t - tocaba) / tocaba;
        estado = d <= tol ? 'bien' : d <= 2 * tol ? 'medio' : 'mal';
      } else {
        tocaba = partida;
        estado = estadoQuiero(regla[0], regla[1], t - partida);
      }
      return { fecha: p.fecha, valor: Number(p[aspecto]), tendencia: t, tocaba: tocaba, estado: estado };
    });
    var ultimo = puntos[puntos.length - 1];
    var dias = diasEntre(primero, ultimo.fecha);
    return {
      puntos: puntos,
      partida: partida,
      quiero: aspecto === 'kg' ? (datosPlan.semana > 0 ? 'sube' : datosPlan.semana < 0 ? 'baja' : 'igual') : regla[0],
      porSemana: dias >= 7 ? redondear((ultimo.tendencia - partida) / dias * 7, 2) : null,
      estado: ultimo.estado,
    };
  }

  return {
    salud: salud,
    grasaXiaomi: grasaXiaomi,
    composicionXiaomi: composicionXiaomi,
    PLANES: PLANES,
    COMIDAS: COMIDAS,
    KCAL_POR_KG: KCAL_POR_KG,
    edadEn: edadEn,
    basal: basal,
    porCantidad: porCantidad,
    sumar: sumar,
    delDia: delDia,
    gasto: gasto,
    balance: balance,
    objetivo: objetivo,
    falta: falta,
    aguaObjetivo: aguaObjetivo,
    gastoReal: gastoReal,
    despensa: despensa,
    listaCompra: listaCompra,
    estadoDespensa: estadoDespensa,
    lista: lista,
    envasesDe: envasesDe,
  };
})();

if (typeof module !== 'undefined') module.exports = Comida;
