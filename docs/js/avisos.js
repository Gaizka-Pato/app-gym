// Avisos de la app de Android (1.9, él, 2026-11-06): agua, compra y moverse, cada uno con su interruptor; y el
// descanso de cada noche. Los avisos los lanza el móvil con la app cerrada (movil/…/Avisos.kt); aquí se eligen y se le
// pasa lo que necesita saber (lo bebido hoy y lo que toca, lo que hay en la lista de la compra) cada vez que cambia.
var AvisosApp = (function () {
  var h = App.h;
  var CLAVE = 'gymapp.avisos';
  var DIAS = [[0, 'Ninguno'], [1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [7, 'Domingo']];
  var POR_DEFECTO = {
    agua: { activo: false, desde: 9, hasta: 22 },
    compra: { activo: false, hora: 18, dia: 0, horaDia: 10 },
    moverse: { activo: false, horas: 2, desde: 9, hasta: 21 },
  };

  function nativo() {
    return window.AndroidPasos && typeof window.AndroidPasos.avisos === 'function' ? window.AndroidPasos : null;
  }

  function config() {
    var guardado = {};
    try { guardado = JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch (e) { guardado = {}; }
    var c = {};
    Object.keys(POR_DEFECTO).forEach(function (k) { c[k] = Object.assign({}, POR_DEFECTO[k], guardado[k] || {}); });
    return c;
  }

  function guardar(c) {
    try { localStorage.setItem(CLAVE, JSON.stringify(c)); } catch (e) { /* sin almacenamiento */ }
    pasar();
  }

  function horasEntreno(fecha) {
    var horas = Almacen.series().filter(function (s) { return s.fecha === fecha && s.hora; }).map(function (s) {
      var p = String(s.hora).split(':').map(Number);
      return p[0] + (p[1] || 0) / 60;
    });
    return horas.length > 1 ? Math.max.apply(null, horas) - Math.min.apply(null, horas) : 0;
  }

  function nombreDe(id) {
    var a = Almacen.tablaComida('alimentos').concat(typeof Basicos !== 'undefined' ? Basicos.LISTA : []).filter(function (x) { return x.id === id; })[0];
    return a ? a.nombre.toLowerCase() : String(id).replace(/^n-/, '');
  }

  // Lo que necesita el móvil: la configuración y los datos de ahora.
  function datos() {
    var c = config();
    var hoy = Almacen.hoyISO();
    var cuerpo = Almacen.cuerpo();
    var vaso = 250;
    try { vaso = Number(localStorage.getItem('gymapp.vaso')) || 250; } catch (e) { vaso = 250; }
    var bebido = Almacen.tablaComida('agua').filter(function (a) { return a.fecha === hoy; })
      .reduce(function (t, a) { return t + (Number(a.ml) || 0); }, 0);
    var lista = Comida.lista(Comida.estadoDespensa(Almacen.filasComida('despensa')));
    return {
      agua: Object.assign({}, c.agua, { objetivo: Comida.aguaObjetivo(cuerpo && cuerpo.peso, horasEntreno(hoy)) || 0, bebido: bebido, fecha: hoy, vaso: vaso }),
      compra: Object.assign({}, c.compra, { pendientes: lista.length,
        firma: lista.map(function (x) { return x.producto; }).sort().join('|'),
        nombres: lista.slice(0, 4).map(function (x) { return nombreDe(x.producto); }).join(', ') + (lista.length > 4 ? '…' : '') }),
      moverse: c.moverse,
    };
  }

  // Se le pasa al móvil (sin esperar: es barato y no contesta nada).
  var ultimoPasado = '';
  function pasar() {
    var n = nativo();
    if (!n) return;
    try {
      var texto = JSON.stringify(datos());
      if (texto === ultimoPasado) return;
      ultimoPasado = texto;
      n.avisos(texto);
    } catch (e) { /* sin datos todavía */ }
  }
  var espera = null;
  Almacen.alCambiar(function () {
    clearTimeout(espera);
    espera = setTimeout(function () { pasar(); pasarPesos(); }, 1500);
  });
  window.addEventListener('load', function () { setTimeout(function () { recogerAgua(); recogerPesos(); pasar(); pasarPesos(); }, 3000); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { recogerAgua(); recogerPesos(); } });

  // ---- Vasos apuntados sin abrir la app (APK 2.1: "+ Vaso" en la notificación y en el atajo del icono) ----
  // El móvil ya los subió al Excel con su id; aquí se añaden los que falten (también los que se quitaron: no vuelven).
  function recogerAgua() {
    var n = window.AndroidPasos;
    if (!n || typeof n.aguaMovil !== 'function') return;
    var lista = [];
    try { lista = JSON.parse(n.aguaMovil()) || []; } catch (e) { lista = []; }
    var tengo = {};
    Almacen.filasComida('agua').forEach(function (a) { tengo[a.id] = true; });
    var nuevas = lista.filter(function (t) { return t.id && t.fecha && t.ml > 0 && !tengo[t.id]; });
    if (!nuevas.length) return;
    nuevas.forEach(function (t) { Almacen.guardarFilaComida('agua', { id: t.id, fecha: t.fecha, hora: t.hora, ml: Number(t.ml) }); });
    if (typeof App.repintar === 'function') App.repintar();
  }

  // ---- La báscula Xiaomi (APK 2.0, Bascula.kt) ----
  // El móvil necesita los últimos pesos de esta persona para saber si quien se sube es ella; y lo que la báscula
  // apunta sola con la app cerrada se recoge aquí al abrirla (si ese día no hay ya un peso).
  function conBascula() {
    var n = window.AndroidPasos;
    return n && typeof n.bascula === 'function' ? n : null;
  }
  function pesosPropios() {
    return Almacen.tablaComida('pesos').filter(function (p) { return p.fecha && p.kg > 0; })
      .sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
  }
  var pesosPasados = '';
  function pasarPesos() {
    var n = conBascula();
    if (!n) return;
    var texto = JSON.stringify({ pesos: pesosPropios().slice(-10).map(function (p) {
      return { fecha: p.fecha, kg: Number(p.kg), impedancia: Number(p.impedancia) || 0 };
    }) });
    if (texto === pesosPasados) return;
    pesosPasados = texto;
    try { n.basculaDatos(texto); } catch (e) { /* APK viejo */ }
  }
  function recogerPesos() {
    var n = conBascula();
    if (!n) return;
    var lista = [];
    try { lista = JSON.parse(n.pesosBascula()) || []; } catch (e) { lista = []; }
    var tengo = {};
    pesosPropios().forEach(function (p) { tengo[p.fecha] = p; });
    var nuevos = lista.filter(function (m) { return m.fecha && m.kg > 0 && !tengo[m.fecha]; });
    if (!nuevos.length) return;
    nuevos.forEach(function (m) {
      // Grasa, agua y músculo se calculan ya (con la altura y la edad de ahora) y se guardan con el peso.
      var c = m.impedancia > 0 ? Comida.composicionXiaomi(Almacen.cuerpo(), m.fecha, Number(m.kg), Number(m.impedancia)) : null;
      Almacen.guardarFilaComida('pesos', { id: 'peso-' + m.fecha, fecha: m.fecha, kg: m.kg, impedancia: m.impedancia || '', origen: 'báscula',
        grasa: c ? c.grasa : '', agua: c ? c.agua : '', musculo: c ? c.musculo : '' });
    });
    // El más reciente pasa a Tus datos (es el que usan las cuentas).
    var ultimo = pesosPropios().pop();
    var cuerpo = Almacen.cuerpo() || {};
    if (ultimo && Number(cuerpo.peso) !== Number(ultimo.kg)) Almacen.guardarCuerpo(Object.assign({}, cuerpo, { peso: Number(ultimo.kg) }));
    if (typeof App.repintar === 'function') App.repintar();
  }

  function ponerBascula(si) {
    var n = conBascula();
    if (!n) return;
    var id = 'bs' + Date.now();
    esperando[id] = function (d) {
      if (si && !d.activa) App.avisar('Sin el permiso de "Dispositivos cercanos" no se puede oír la báscula', true);
      else if (d.motivo === 'sinBluetooth') App.avisar('Enciende el Bluetooth para que se oiga la báscula');
      else if (d.motivo === 'sinNotificaciones') App.avisar('Sin notificaciones no podrá preguntarte si eres tú', true);
      pasarPesos();
      abrir();
    };
    n.bascula(id, si);
  }

  // El permiso de las notificaciones (Android 13 o más), al encender el primero.
  var esperando = {};
  var anterior = window.__pasosNativo;
  window.__pasosNativo = function (id, d) {
    if (esperando[id]) { var f = esperando[id]; delete esperando[id]; return f(d || {}); }
    if (anterior) return anterior(id, d);
  };
  function pedirPermiso(despues) {
    var n = nativo();
    if (!n || typeof n.pedirAvisos !== 'function') return despues(true);
    var id = 'av' + Date.now();
    esperando[id] = function (d) { despues(!!d.concedido); };
    n.pedirAvisos(id);
  }

  function resumen() {
    var c = config();
    var puestos = [['agua', 'agua'], ['compra', 'compra'], ['moverse', 'moverse']].filter(function (x) { return c[x[0]].activo; })
      .map(function (x) { return x[1]; });
    return puestos.length ? puestos.join(', ') : 'Apagados';
  }

  function interruptor(titulo, detalle, encendido, alCambiar) {
    var boton = h('button', { type: 'button', class: 'fila-ajuste interruptor-tema', role: 'switch', 'aria-checked': encendido ? 'true' : 'false',
      'aria-label': titulo, onclick: function () { alCambiar(!encendido); } }, [
      h('span', { class: 'fila-ajuste-titulo' }, [titulo, detalle ? h('span', { class: 'detalle aviso-detalle', texto: detalle }) : null]),
      h('span', { class: 'interruptor' + (encendido ? ' encendido' : ''), 'aria-hidden': 'true' }, [h('span', { class: 'interruptor-bola' })]),
    ]);
    return boton;
  }

  function selectHora(valor, desde, hasta, alCambiar, etiqueta) {
    var opciones = [];
    for (var i = desde; i <= hasta; i++) opciones.push(h('option', { value: i, selected: i === valor, texto: String(i).padStart(2, '0') + ':00' }));
    return h('label', { class: 'campo aviso-campo' }, [h('span', { texto: etiqueta }),
      h('select', { 'aria-label': etiqueta, onchange: function (ev) { alCambiar(Number(ev.target.value)); } }, opciones)]);
  }

  // La hoja de Ajustes → Avisos.
  function abrir() {
    var c = config();
    function cambiar(clave, campo, valor) {
      var nueva = config();
      nueva[clave][campo] = valor;
      var activar = campo === 'activo' && valor;
      if (activar) pedirPermiso(function (ok) {
        if (!ok) App.avisar('Sin permiso de notificaciones no pueden salir los avisos', true);
        guardar(nueva);
        abrir();
      });
      else { guardar(nueva); abrir(); }
    }
    var cuerpo = Almacen.cuerpo();
    var bascula = conBascula();
    var basculaPuesta = false;
    try { basculaPuesta = !!(bascula && bascula.basculaActiva()); } catch (e) { basculaPuesta = false; }
    App.abrirSelector('Avisos', [
      interruptor('💧 Agua', cuerpo && cuerpo.peso ? 'Si vas por detrás de lo que toca a esa hora (de 9 a 22, como mucho cada 2 h)' : 'Pon tu peso en Tus datos para saber cuánta te toca',
        c.agua.activo, function (v) { cambiar('agua', 'activo', v); }),
      interruptor('🛒 Compra', 'Cuando algo baja de su mínimo, una vez al día', c.compra.activo, function (v) { cambiar('compra', 'activo', v); }),
      c.compra.activo ? h('div', { class: 'aviso-opciones' }, [
        selectHora(c.compra.hora, 8, 22, function (v) { cambiar('compra', 'hora', v); }, 'A partir de las'),
        h('label', { class: 'campo aviso-campo' }, [h('span', { texto: 'Día de compra' }),
          h('select', { 'aria-label': 'Día de compra', onchange: function (ev) { cambiar('compra', 'dia', Number(ev.target.value)); } },
            DIAS.map(function (d) { return h('option', { value: d[0], selected: d[0] === c.compra.dia, texto: d[1] }); }))]),
        c.compra.dia ? selectHora(c.compra.horaDia, 7, 21, function (v) { cambiar('compra', 'horaDia', v); }, 'Ese día, a las') : null,
      ]) : null,
      interruptor('🚶 Moverse', 'Si llevas ' + c.moverse.horas + ' h sin andar (de 9 a 21)', c.moverse.activo, function (v) { cambiar('moverse', 'activo', v); }),
      c.moverse.activo ? h('div', { class: 'aviso-opciones' }, [
        h('label', { class: 'campo aviso-campo' }, [h('span', { texto: 'Horas sin andar' }),
          h('select', { 'aria-label': 'Horas sin andar', onchange: function (ev) { cambiar('moverse', 'horas', Number(ev.target.value)); } },
            [1, 1.5, 2, 3].map(function (n) { return h('option', { value: n, selected: n === c.moverse.horas, texto: App.formato(n) + ' h' }); }))]),
      ]) : null,
      bascula ? interruptor('⚖️ Báscula Xiaomi', 'Al subirte se apunta tu peso solo; si no está claro que eres tú, te pregunta. Con el Bluetooth encendido.',
        basculaPuesta, ponerBascula)
        : window.AndroidPasos ? h('p', { class: 'detalle', texto: '⚖️ Para que la báscula apunte el peso sola, actualiza la app.' }) : null,
      h('p', { class: 'detalle aviso-pie', texto: 'Los avisos salen aunque la app esté cerrada.' }),
      // La pegatina NFC de la nevera no necesita nada aquí (él, 2026-11-07): se graba una vez con ares://compra.
    ]);
  }

  // ---- Descanso (Historial → Actividad) ----
  function descansos() {
    var n = nativo();
    if (!n || typeof n.descansos !== 'function') return null;
    try { return JSON.parse(n.descansos()) || []; } catch (e) { return []; }
  }

  function horaDe(ms) {
    var d = new Date(ms);
    return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function duracion(min) {
    return Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0') + ' min';
  }

  function tarjetaDescanso() {
    var lista = descansos();
    if (lista == null) return null;
    var grafica = h('div');
    var hoy = Almacen.hoyISO();
    var porFecha = {};
    lista.forEach(function (n) { porFecha[n.fecha] = n; });
    var dias = [];
    for (var i = 13; i >= 0; i--) dias.push(Calendario.sumarDias(hoy, -i));
    var ultima = lista.slice().sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; })[0];
    var tarjeta = h('div', { class: 'tarjeta' }, [
      h('div', { class: 'ejercicio-cabecera' }, [h('h2', { texto: '😴 Descanso' }), h('span', { class: 'tipo', texto: '14 noches' })]),
      ultima ? h('p', { class: 'detalle', texto: (ultima.fecha === hoy ? 'Anoche: ' : Grafica.fechaCorta(ultima.fecha) + ': ') +
        duracion(ultima.minutos) + ' seguidas (de ' + horaDe(ultima.inicio) + ' a ' + horaDe(ultima.fin) + ')' }) : null,
      grafica,
      h('p', { class: 'detalle', texto: lista.length ? 'Es el rato más largo de la noche con la pantalla apagada y sin andar: si miras el móvil a medianoche, se corta.'
        : 'Se mide con la notificación de los pasos puesta: mañana verás la primera noche.' }),
    ]);
    if (lista.length) {
      Grafica.barras(grafica, dias.map(function (f) {
        var n = porFecha[f];
        var horas = n ? Math.round(n.minutos / 6) / 10 : 0;
        return { etiqueta: f.slice(8), v: horas, titulo: Grafica.fechaCorta(f) + ': ' + (n ? duracion(n.minutos) : 'sin datos') };
      }), { clase: 'descanso', objetivo: 8 });
    }
    return tarjeta;
  }

  return { disponible: function () { return !!nativo(); }, abrir: abrir, resumen: resumen, pasar: pasar, tarjetaDescanso: tarjetaDescanso };
})();
