// Pestaña Comida (2026-11-06): el diario del día por comidas (Desayuno, Almuerzo, Comida, Merienda y Cena), buscar
// entre lo último que comiste, los alimentos que habéis apuntado y los básicos, crear un alimento con su etiqueta, y
// el agua con botones de un toque. Las cuentas van en src/comida.js (Comida) y los datos en Almacen (tablas de la
// comida). Cada apunte guarda sus macros de ese momento, así que cambiar un alimento no cambia lo ya comido.
(function () {
  var h = App.h;
  var formato = App.formato;
  var dia = null;              // día que se mira (null = hoy)

  function hoy() { return Almacen.hoyISO(); }
  function diaVisto() { return dia || hoy(); }

  function horaAhora() {
    var d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function apuntesDe(fecha) {
    return Almacen.tablaComida('comidas').filter(function (a) { return a.fecha === fecha; })
      .sort(function (a, b) { return String(a.hora || '').localeCompare(String(b.hora || '')); });
  }

  function aguaDe(fecha) {
    return Almacen.tablaComida('agua').filter(function (a) { return a.fecha === fecha; });
  }

  // Horas de entreno de ese día: de la primera a la última serie apuntada (para el agua).
  function horasEntreno(fecha) {
    var horas = Almacen.series().filter(function (s) { return s.fecha === fecha && s.hora; }).map(function (s) {
      var p = String(s.hora).split(':').map(Number);
      return p[0] + (p[1] || 0) / 60;
    });
    return horas.length > 1 ? Math.max.apply(null, horas) - Math.min.apply(null, horas) : 0;
  }

  // Las medidas de cada uno (él, 2026-11-06: "que el usuario diga tanto botella como vaso"). En el móvil.
  function medida(clave, porDefecto) {
    var v = 0;
    try { v = Number(localStorage.getItem('gymapp.' + clave)); } catch (e) { v = 0; }
    return v > 0 ? v : porDefecto;
  }
  function vaso() { return medida('vaso', 250); }

  function botella() { return medida('botella', 500); }

  // Todo lo que se puede apuntar: los alimentos comunes (con código o creados a mano) y los básicos, sin repetir nombre.
  function catalogo() {
    var vistos = {};
    var lista = [];
    Almacen.tablaComida('alimentos').concat(Basicos.LISTA).forEach(function (a) {
      var k = Basicos.normalizar(a.nombre + ' ' + (a.marca || ''));
      if (!a.nombre || vistos[k]) return;
      vistos[k] = true;
      lista.push(a);
    });
    return lista;
  }

  // Lo último que se ha comido, sin repetir (los 12 más recientes), con la cantidad de la última vez.
  function recientes() {
    var vistos = {};
    var lista = [];
    Almacen.tablaComida('comidas').slice().sort(function (a, b) {
      return (b.fecha + ' ' + (b.hora || '')).localeCompare(a.fecha + ' ' + (a.hora || ''));
    }).forEach(function (a) {
      var k = Basicos.normalizar(a.nombre);
      if (!a.nombre || vistos[k] || lista.length >= 12) return;
      vistos[k] = true;
      lista.push(a);
    });
    return lista;
  }

  // Los macros por 100 g de un apunte (para repetirlo con otra cantidad).
  function por100(a) {
    var g = Number(a.gramos) || 0;
    if (!(g > 0)) return null;
    return { nombre: a.nombre, codigo: a.codigo, kcal: a.kcal * 100 / g, proteina: (a.proteina || 0) * 100 / g,
      hidratos: (a.hidratos || 0) * 100 / g, grasa: (a.grasa || 0) * 100 / g, porcion: g,
      cafeina: a.cafeina != null && a.cafeina !== '' ? Number(a.cafeina) * 100 / g : '' };
  }

  function linea(m) {
    return Math.round(m.kcal || 0) + ' kcal · P ' + formato(Math.round(m.proteina || 0)) + ' · H ' +
      formato(Math.round(m.hidratos || 0)) + ' · G ' + formato(Math.round(m.grasa || 0));
  }

  // ---- Apuntar ----

  // Lo que pesa una unidad (una rebanada, un huevo, un yogur) y cómo se llama. Sale del alimento de la lista, no del
  // apunte (que trae los gramos de la última vez); si es un básico guardado en la lista común, el nombre, del básico.
  function unidadDe(alimento) {
    var id = productoDe(alimento);
    var real = (id && alimentoDe(id)) || (alimento.id ? alimento : null);
    var basico = id ? Basicos.LISTA.filter(function (b) { return b.id === id; })[0] : null;
    return { id: id || (real && real.id) || null, real: real, g: Number(real && real.porcion) || 0,
      envase: Number(real && real.envase) || 0, nombre: (real && real.unidad) || (basico && basico.unidad) || 'unidad' };
  }

  function plural(n) {
    if (/s$/.test(n)) return n;
    if (/ón$/.test(n)) return n.replace(/ón$/, 'ones');
    return /[aeiou]$/.test(n) ? n + 's' : n + 'es';
  }

  function mayuscula(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  // Paso 2: cuánto. alimento: macros por 100 g. apunte: si se está cambiando uno ya apuntado.
  // Por unidades o por gramos (él, 2026-11-07: "el pan Bimbo son rebanadas, no sé los gramos"). Si no se sabe lo que
  // pesa una, se pregunta cuánto pesa el paquete y cuántas trae (viene en la bolsa) y se guarda en la lista común.
  function cantidad(alimento, comidaId, apunte) {
    var u = unidadDe(alimento);
    var num = { type: 'number', inputmode: 'decimal', min: '0', step: 'any' };
    var modo = u.g > 0 ? 'unidades' : 'gramos';
    var gramos = h('input', Object.assign({}, num, { step: '1', 'aria-label': 'Gramos',
      value: apunte ? apunte.gramos : u.g || alimento.porcion || 100 }));
    var unidades = h('input', Object.assign({}, num, { step: '0.5', 'aria-label': mayuscula(plural(u.nombre)),
      value: apunte && u.g ? String(Math.round(apunte.gramos / u.g * 10) / 10) : 1 }));
    // Lo que pesa una, si se pregunta: el paquete entero y cuántas trae, o lo que pesa una.
    var paquete = h('input', Object.assign({}, num, { 'aria-label': 'El paquete pesa (g)', value: u.envase || alimento.envase || '' }));
    var cuantas = h('input', Object.assign({}, num, { step: '1', 'aria-label': mayuscula(plural(u.nombre)) + ' que trae' }));
    var una = h('input', Object.assign({}, num, { 'aria-label': 'O lo que pesa cada ' + u.nombre + ' (g)', placeholder: u.g ? formato(u.g) : '' }));
    var preguntar = !(u.g > 0);
    function pesoUna() {
      if (!preguntar) return u.g;
      var p = App.numero(paquete.value), c = App.numero(cuantas.value), g1 = App.numero(una.value);
      if (p > 0 && c > 0) return Math.round(p / c * 10) / 10;
      return g1 > 0 ? g1 : 0;
    }
    function gramosAhora() {
      return modo === 'gramos' ? App.numero(gramos.value) || 0 : Math.round((App.numero(unidades.value) || 0) * pesoUna() * 10) / 10;
    }
    var resultadoUna = h('p', { class: 'detalle' });
    var cambiarPeso = h('button', { type: 'button', class: 'discreto', texto: 'Cambiar', onclick: function () {
      preguntar = true;
      pintar();
    } });
    var lineaUna = h('p', { class: 'detalle comida-una' });
    var cajaPaquete = h('div', { class: 'comida-paquete' }, [
      h('p', { class: 'detalle', texto: '¿Cuánto pesa cada ' + u.nombre + '? Mira el paquete:' }),
      h('div', { class: 'comida-macros-campos' }, [
        h('label', { class: 'campo' }, [h('span', { texto: 'El paquete pesa (g)' }), paquete]),
        h('label', { class: 'campo' }, [h('span', { texto: mayuscula(plural(u.nombre)) + ' que trae' }), cuantas]),
      ]),
      h('label', { class: 'campo' }, [h('span', { texto: 'O lo que pesa cada ' + u.nombre + ' (g)' }), una]),
      resultadoUna,
    ]);
    // La hoja, rehecha para que sea simple (él, 2026-11-08: "extremadamente liosa"): arriba en grande lo que suma;
    // debajo un solo "− cantidad +" con unidades/gramos pequeño encima; dónde va, plegado y solo al cambiar uno ya
    // apuntado; y Guardar con "Quitar" pequeño debajo.
    var masMenos = function (d) {
      return h('button', { type: 'button', class: 'comida-paso', texto: d > 0 ? '+' : '−', 'aria-label': d > 0 ? 'Más' : 'Menos', onclick: function () {
        if (modo === 'unidades') {
          var v = App.numero(unidades.value) || 0;
          // De una en una; por debajo de 1, de media en media.
          var paso = v < 1 || (d < 0 && v <= 1) ? 0.5 : 1;
          unidades.value = String(Math.max(0.5, v + d * paso));
        } else {
          gramos.value = String(Math.max(5, Math.round(((App.numero(gramos.value) || 0) + d * 10) / 5) * 5));
        }
        pintar();
      } });
    };
    var etiquetaMedida = h('span', { class: 'comida-medida' });
    var cajaCantidad = h('div', { class: 'comida-cantidad' }, [
      masMenos(-1),
      h('div', { class: 'comida-cantidad-valor' }, [unidades, gramos, etiquetaMedida]),
      masMenos(1),
    ]);
    var cajaUnidades = h('div', { class: 'comida-una-fila' }, [lineaUna, cambiarPeso]);
    var botonesModo = [['unidades', mayuscula(plural(u.nombre))], ['gramos', 'Gramos']].map(function (m) {
      return h('button', { type: 'button', texto: m[1], onclick: function () {
        if (m[0] === modo) return;
        // Al cambiar, lo mismo en la otra medida.
        var g = gramosAhora(), p = pesoUna();
        if (m[0] === 'gramos' && g > 0) gramos.value = String(g);
        if (m[0] === 'unidades' && p > 0 && App.numero(gramos.value) > 0) unidades.value = String(Math.round(App.numero(gramos.value) / p * 2) / 2 || 1);
        modo = m[0];
        pintar();
      } });
    });
    var kcalGrande = h('div', { class: 'comida-total' });
    var macros = h('div', { class: 'comida-total-macros' });
    function pintar() {
      botonesModo[0].classList.toggle('actual', modo === 'unidades');
      botonesModo[1].classList.toggle('actual', modo === 'gramos');
      unidades.hidden = modo !== 'unidades';
      gramos.hidden = modo !== 'gramos';
      cajaUnidades.hidden = modo !== 'unidades';
      cajaPaquete.hidden = modo !== 'unidades' || !preguntar;
      var p = pesoUna();
      var cuantasU = App.numero(unidades.value) || 0;
      etiquetaMedida.textContent = modo === 'gramos' ? 'g' : (cuantasU === 1 ? u.nombre : plural(u.nombre));
      lineaUna.textContent = preguntar ? '' : '1 ' + u.nombre + ' = ' + formato(p) + ' g';
      cambiarPeso.hidden = preguntar;
      resultadoUna.textContent = p > 0 ? '1 ' + u.nombre + ' = ' + formato(p) + ' g' : '';
      var g = gramosAhora();
      var m = Comida.porCantidad(alimento, g);
      kcalGrande.innerHTML = '';
      kcalGrande.appendChild(document.createTextNode(String(Math.round(m.kcal || 0))));
      kcalGrande.appendChild(h('small', { texto: ' kcal' + (g > 0 ? ' · ' + formato(g) + ' g' : '') }));
      macros.innerHTML = '';
      [['Proteína', m.proteina, 'proteina'], ['Hidratos', m.hidratos, 'hidratos'], ['Grasa', m.grasa, 'grasa']].forEach(function (x) {
        macros.appendChild(h('span', { class: 'comida-macro ' + x[2] }, [h('strong', { texto: formato(Math.round(x[1] || 0)) + ' g' }), x[0]]));
      });
    }
    [gramos, unidades, paquete, cuantas, una].forEach(function (i) { i.addEventListener('input', pintar); });
    pintar();
    var eleccion = apunte ? apunte.comida : comidaId;
    // Al cambiar uno ya apuntado: a qué comida y en qué plato de esa comida va, o aparte en uno nuevo.
    var grupoElegido = apunte ? apunte.grupo || '' : grupoPara(comidaId);
    var nombreComida = function (id) { return (Comida.COMIDAS.filter(function (c) { return c.id === id; })[0] || {}).nombre || id; };
    var destino = null;
    if (apunte) {
      var otros = bloques(apuntesDe(apunte.fecha).filter(function (a) { return a.comida === apunte.comida; }));
      var opcionesGrupo = otros.map(function (b, i) { return { grupo: b.grupo, texto: nombreBloque(b, i) }; });
      var solo = otros.filter(function (b) { return b.grupo === grupoElegido; })[0];
      if (!(solo && solo.apuntes.length === 1)) opcionesGrupo.push({ grupo: nuevoGrupo(), texto: 'Aparte, en otro plato' });
      var textoDestino = h('span');
      var cajaDestino = h('div', { class: 'comida-destino-opciones', hidden: true });
      var cajaGrupos = null;
      var pintarDestino = function () {
        var g = opcionesGrupo.filter(function (o) { return o.grupo === grupoElegido; })[0];
        textoDestino.textContent = 'Va en ' + nombreComida(eleccion) + (eleccion === apunte.comida && g && opcionesGrupo.length > 1 ? ' · ' + g.texto : '');
      };
      var botonesComida = Comida.COMIDAS.map(function (c) {
        return h('button', { type: 'button', class: 'chip-opcion' + (c.id === eleccion ? ' actual' : ''), texto: c.nombre, onclick: function (ev) {
          eleccion = c.id;
          botonesComida.forEach(function (b) { b.classList.toggle('actual', b === ev.currentTarget); });
          if (cajaGrupos) cajaGrupos.hidden = eleccion !== apunte.comida;
          pintarDestino();
        } });
      });
      if (opcionesGrupo.length > 1) {
        var botonesGrupo = opcionesGrupo.map(function (o) {
          return h('button', { type: 'button', class: 'chip-opcion' + (o.grupo === grupoElegido ? ' actual' : ''), texto: o.texto, onclick: function (ev) {
            grupoElegido = o.grupo;
            botonesGrupo.forEach(function (b) { b.classList.toggle('actual', b === ev.currentTarget); });
            pintarDestino();
          } });
        });
        cajaGrupos = h('div', { class: 'comida-destino-grupo' }, [h('p', { class: 'detalle', texto: 'Plato' }), h('div', { class: 'comida-chips' }, botonesGrupo)]);
      }
      cajaDestino.appendChild(h('p', { class: 'detalle', texto: 'Comida' }));
      cajaDestino.appendChild(h('div', { class: 'comida-chips' }, botonesComida));
      if (cajaGrupos) cajaDestino.appendChild(cajaGrupos);
      var flecha = h('span', { class: 'comida-destino-flecha', texto: '›' });
      destino = h('div', { class: 'comida-destino' }, [
        h('button', { type: 'button', class: 'comida-destino-boton', onclick: function () {
          cajaDestino.hidden = !cajaDestino.hidden;
          flecha.classList.toggle('abierta', !cajaDestino.hidden);
        } }, [textoDestino, flecha]),
        cajaDestino,
      ]);
      pintarDestino();
    }
    App.abrirSelector(alimento.nombre + (alimento.marca ? ' · ' + alimento.marca : ''), [
      kcalGrande,
      macros,
      h('div', { class: 'comida-modo-pequeno' }, botonesModo),
      cajaCantidad,
      cajaUnidades,
      cajaPaquete,
      destino,
      h('button', { type: 'button', class: 'principal comida-guardar', texto: apunte ? 'Guardar' : 'Apuntar', onclick: function () {
        if (modo === 'unidades' && !(pesoUna() > 0)) { App.avisar('Pon cuánto pesa el paquete y cuántas trae', true); return; }
        var g = gramosAhora();
        if (!(g > 0)) { App.avisar(modo === 'unidades' ? 'Pon cuántas' : 'Pon los gramos', true); return; }
        if (modo === 'unidades' && preguntar) guardarUnidad(u, alimento, pesoUna(), App.numero(paquete.value));
        var m = Comida.porCantidad(alimento, g);
        if (!apunte) restarDeDespensa(alimento, g);
        Almacen.guardarFilaComida('comidas', Object.assign({}, apunte || {}, {
          fecha: apunte ? apunte.fecha : diaVisto(), hora: apunte ? apunte.hora : horaAhora(), comida: eleccion,
          grupo: eleccion !== (apunte ? apunte.comida : comidaId) ? '' : grupoElegido,
          grupoNombre: eleccion !== (apunte ? apunte.comida : comidaId) ? '' : nombreGrupo(apunte ? apunte.fecha : diaVisto(), eleccion, grupoElegido),
          nombre: alimento.nombre, codigo: alimento.codigo || '', gramos: g,
          kcal: m.kcal, proteina: m.proteina, hidratos: m.hidratos, grasa: m.grasa, cafeina: m.cafeina || '',
        }));
        App.cerrarSelector();
        App.repintar();
      } }),
      apunte ? h('button', { type: 'button', class: 'comida-quitar-enlace', texto: 'Quitar de ' + nombreComida(apunte.comida).toLowerCase(), onclick: function () {
        Almacen.borrarFilaComida('comidas', apunte.id);
        App.cerrarSelector();
        App.repintar();
      } }) : null,
    ]);
    setTimeout(function () {
      var foco = modo === 'gramos' ? gramos : preguntar ? (paquete.value ? cuantas : paquete) : unidades;
      foco.focus();
      if (foco.select) foco.select();
    }, 50);
  }

  // Guarda lo que pesa una unidad (y el paquete, si se puso) en la lista común, con el mismo id: le sirve al otro.
  function guardarUnidad(u, alimento, g, paquete) {
    var id = u.id;
    if (!id || !(g > 0)) return;
    var cambios = { porcion: g };
    if (paquete > 0) cambios.envase = paquete;
    guardarEnAlimentos(id, u.real || alimento, cambios);
  }

  // ---- Elegir un alimento: buscar, escanear o crear ----
  // Sirve para apuntar (con lo último comido y los platos) y para los ingredientes de un plato.
  // alElegir(alimento con macros por 100 g). opciones: { conPlatos, comidaId }.
  function elegirAlimento(titulo, alElegir, opciones) {
    opciones = opciones || {};
    var caja = h('input', { type: 'search', placeholder: 'Buscar alimento', 'aria-label': 'Buscar alimento' });
    var lista = h('div', { class: 'lista-historial comida-resultados' });
    var todos = catalogo();
    var ultimos = opciones.conPlatos ? recientes() : [];
    var misPlatos = opciones.conPlatos ? platos() : [];

    function fila(nombre, detalle, alTocar, clase) {
      return h('button', { type: 'button', class: clase || '', onclick: alTocar }, [
        h('span', { texto: nombre }),
        h('span', { class: 'tipo', texto: detalle }),
      ]);
    }
    function filaPlato(p) {
      var t = totalPlato(p);
      return fila('🍽 ' + p.nombre, Math.round(t.kcal / (Number(p.raciones) || 1)) + ' kcal/ración', function () { apuntarPlato(p, opciones.comidaId); }, 'comida-plato');
    }
    function coincide(nombre, palabras) {
      var n = Basicos.normalizar(nombre);
      return palabras.every(function (p) { return n.indexOf(p) >= 0; });
    }
    // Lo que hay en casa (la despensa): { id: estado }. Lo que tienes va primero y con lo que queda; lo que no tienes
    // en casa, con "no queda"; lo propuesto (los básicos, que nadie ha metido), aparte y marcado como sugerencia.
    var est = estado();
    function deCasa(a) {
      var id = productoDe(a) || a.id;
      return id ? est[id] || null : null;
    }
    function filaAlimento(a, detalleExtra) {
      var e = deCasa(a);
      var tuyo = a.fuente !== 'básico' || (e && (e.hay > 0 || e.minimo > 0));
      var texto = e && e.hay > 0 ? '🏠 quedan ' + enEnvases(e.hay)
        : e ? 'no queda'
          : detalleExtra || (tuyo ? Math.round(a.kcal) + ' kcal/100 g' : 'sugerido · ' + Math.round(a.kcal) + ' kcal');
      return fila(a.nombre + (a.marca ? ' · ' + a.marca : ''), texto, function () { alElegir(a); },
        e && e.hay > 0 ? 'en-casa' : tuyo ? '' : 'sugerido');
    }
    function rellenar() {
      lista.innerHTML = '';
      var texto = Basicos.normalizar(caja.value);
      var titulo = function (t) { lista.appendChild(h('p', { class: 'detalle comida-seccion', texto: t })); };
      if (!texto) {
        var enCasa = todos.filter(function (a) { var e = deCasa(a); return e && e.hay > 0; });
        if (enCasa.length) {
          titulo('En casa');
          enCasa.forEach(function (a) { lista.appendChild(filaAlimento(a)); });
        }
        if (misPlatos.length) {
          titulo('Platos');
          misPlatos.forEach(function (p) { lista.appendChild(filaPlato(p)); });
        }
        // Lo último, sin los platos (van arriba) ni lo que ya sale en "En casa".
        var ultimosFuera = ultimos.filter(function (a) {
          if (a.plato) return false;
          var e = deCasa(a);
          return !(e && e.hay > 0);
        });
        if (ultimosFuera.length) titulo('Lo último');
        ultimosFuera.forEach(function (a) {
          var base = por100(a);
          if (base) lista.appendChild(fila(a.nombre, formato(a.gramos) + ' g · ' + Math.round(a.kcal) + ' kcal', function () { alElegir(base); }));
        });
        // Los escaneados o creados que no están en casa ahora.
        var tuyos = Almacen.tablaComida('alimentos').filter(function (a) { var e = deCasa(a); return !(e && e.hay > 0); }).slice(-15).reverse();
        if (tuyos.length) {
          titulo('Tus productos');
          tuyos.forEach(function (a) { lista.appendChild(filaAlimento(a)); });
        }
        lista.appendChild(h('p', { class: 'detalle', texto: 'Escribe para buscar entre ' + todos.length + ' alimentos.' }));
        return;
      }
      var palabras = texto.split(' ');
      misPlatos.filter(function (p) { return coincide(p.nombre, palabras); }).forEach(function (p) { lista.appendChild(filaPlato(p)); });
      var puntos = function (a) {
        var e = deCasa(a);
        return e && e.hay > 0 ? 0 : a.fuente !== 'básico' ? 1 : 2;   // en casa, tuyos, sugeridos
      };
      var hallados = todos.filter(function (a) { return coincide(a.nombre + ' ' + (a.marca || ''), palabras); }).sort(function (a, b) {
        // En casa primero, luego lo tuyo y después lo sugerido; dentro, los que empiezan por lo escrito ("pan" → Pan
        // blanco antes que Empanada) y luego los de nombre más corto.
        var na = Basicos.normalizar(a.nombre), nb = Basicos.normalizar(b.nombre);
        var ea = na.indexOf(palabras[0]) === 0 ? 0 : 1, eb = nb.indexOf(palabras[0]) === 0 ? 0 : 1;
        return puntos(a) - puntos(b) || ea - eb || na.length - nb.length;
      }).slice(0, 40);
      hallados.forEach(function (a) { lista.appendChild(filaAlimento(a)); });
      if (!lista.childNodes.length) lista.appendChild(h('p', { class: 'vacio', texto: 'No está. Escanéalo o créalo con lo que pone la etiqueta.' }));
    }
    caja.addEventListener('input', rellenar);
    rellenar();
    App.abrirSelector(titulo, [
      h('div', { class: 'comida-buscar' }, [caja, botonEscanear(alElegir)]),
      lista,
      h('div', { class: 'comida-crear' }, [
        h('button', { type: 'button', class: 'discreto', texto: '+ Nuevo alimento', onclick: function () {
          nuevoAlimento({ nombre: caja.value.trim() }, alElegir);
        } }),
        opciones.conPlatos ? h('button', { type: 'button', class: 'discreto', texto: '+ Nuevo plato', onclick: function () {
          editarPlato({ nombre: caja.value.trim(), raciones: 1, ingredientes: [] }, opciones.comidaId);
        } }) : null,
      ]),
    ]);
    setTimeout(function () { caja.focus(); }, 50);
  }

  // Paso 1 de apuntar: qué.
  // grupo: el plato de esa comida al que va (él, 2026-11-07: "las tostadas y aparte el tazón"); '' = el primero.
  // Se recuerda hasta el siguiente "+ Añadir" para que lo use lo que se apunte (alimento o plato guardado).
  // nombre: el de un plato nuevo de los atajos ("Tazón", "Postre").
  var grupoNuevo = { grupo: '', comida: '', nombre: '' };
  function buscar(comidaId, grupo, nombre) {
    grupoNuevo = { grupo: grupo || '', comida: comidaId, nombre: nombre || '' };
    elegirAlimento('Añadir a ' + nombreComida(comidaId), function (a) { cantidad(a, comidaId); }, { conPlatos: true, comidaId: comidaId });
  }
  function grupoPara(comidaId) { return grupoNuevo.comida === comidaId ? grupoNuevo.grupo : ''; }
  // El nombre del plato al que va lo nuevo: el del atajo o el que ya tenga ese plato ese día.
  function nombreGrupo(fecha, comidaId, grupo) {
    if (!grupo) return '';
    if (grupoNuevo.comida === comidaId && grupoNuevo.grupo === grupo && grupoNuevo.nombre) return grupoNuevo.nombre;
    var b = bloques(apuntesDe(fecha).filter(function (a) { return a.comida === comidaId && (a.grupo || '') === grupo; }))[0];
    return b ? nombrePuesto(b) : '';
  }

  // Un alimento con lo que pone su etiqueta (por 100 g). Va a la lista común: le sirve también al otro.
  // inicial: lo que ya se sabe (nombre, o lo que trajo el escáner: codigo, marca, kcal…). alGuardar(alimento).
  function nuevoAlimento(inicial, alGuardar, aviso) {
    inicial = inicial || {};
    function campo(etiqueta, attrs, valor) {
      var input = h('input', Object.assign({ 'aria-label': etiqueta, value: valor != null ? valor : '' }, attrs));
      return { input: input, nodo: h('label', { class: 'campo' }, [h('span', { texto: etiqueta }), input]) };
    }
    var num = { type: 'number', inputmode: 'decimal', min: '0', step: 'any' };
    var nombre = campo('Nombre', {}, inicial.nombre);
    var marca = campo('Marca (opcional)', {}, inicial.marca);
    var kcal = campo('Kcal por 100 g', num, inicial.kcal);
    var prot = campo('Proteína (g)', num, inicial.proteina);
    var hid = campo('Hidratos (g)', num, inicial.hidratos);
    var gra = campo('Grasa (g)', num, inicial.grasa);
    var cafe = campo('Cafeína (mg, opcional)', num, inicial.cafeina);
    var porcion = campo('Lo que pesa una unidad (g, opcional)', num, inicial.porcion);
    var envase = campo('El envase entero (g o ml, opcional)', num, inicial.envase);
    var cuantas = campo('Unidades que trae (opcional)', num, '');
    App.abrirSelector(inicial.codigo ? 'Producto ' + inicial.codigo : 'Nuevo alimento', [
      aviso ? h('p', { class: 'detalle comida-aviso', texto: aviso }) : null,
      nombre.nodo, marca.nodo,
      h('p', { class: 'detalle', texto: 'Por cada 100 g, como en la etiqueta:' }),
      h('div', { class: 'comida-macros-campos' }, [kcal.nodo, prot.nodo, hid.nodo, gra.nodo]),
      h('div', { class: 'comida-macros-campos' }, [porcion.nodo, envase.nodo]),
      h('div', { class: 'comida-macros-campos' }, [cuantas.nodo, cafe.nodo]),
      h('button', { type: 'button', class: 'principal', texto: 'Guardar', onclick: function () {
        var n = nombre.input.value.trim();
        var p = App.numero(prot.input.value) || 0, hc = App.numero(hid.input.value) || 0, g = App.numero(gra.input.value) || 0;
        var k = App.numero(kcal.input.value);
        if (!n) { App.avisar('Ponle un nombre', true); return; }
        if (!(k > 0) && !(p + hc + g > 0)) { App.avisar('Pon las kcal o los macros', true); return; }
        // Una ración: la puesta o, con el envase y las unidades que trae, el envase entre las unidades.
        function unaDe() {
          var r = App.numero(porcion.input.value), e = App.numero(envase.input.value), c = App.numero(cuantas.input.value);
          if (r > 0) return r;
          return e > 0 && c > 0 ? Math.round(e / c * 10) / 10 : '';
        }
        // Con código de barras, el id es el código: si los dos escanean el mismo producto, es la misma fila.
        var alimento = Almacen.guardarFilaComida('alimentos', Object.assign(inicial.codigo ? { id: 'ean-' + inicial.codigo } : {}, {
          codigo: inicial.codigo || '', nombre: n, marca: marca.input.value.trim(), kcal: k > 0 ? k : Math.round(p * 4 + hc * 4 + g * 9),
          proteina: p, hidratos: hc, grasa: g, cafeina: App.numero(cafe.input.value) != null ? App.numero(cafe.input.value) : '', porcion: unaDe(), envase: App.numero(envase.input.value) || '', fuente: inicial.fuente || 'etiqueta',
        }));
        alGuardar(alimento);
      } }),
    ]);
  }

  // ---- Escáner ----
  // En la app de Android, el lector de Google (window.AndroidPasos.escanear); en el ordenador, o con el APK viejo, se
  // teclea el número. Con el código: el alimento si ya está en la lista común; si no, Open Food Facts rellena la ficha
  // para revisarla; si tampoco lo tiene, la ficha vacía con el código puesto.
  var esperandoEscaneo = {};
  window.__escaneo = function (id, datos) {
    var f = esperandoEscaneo[id];
    delete esperandoEscaneo[id];
    if (f) f(datos || {});
  };

  function hayEscaner() {
    return !!(window.AndroidPasos && typeof window.AndroidPasos.escanear === 'function');
  }

  function botonEscanear(alElegir) {
    return h('button', { type: 'button', class: 'comida-escanear', 'aria-label': 'Escanear código de barras', texto: '📷', onclick: function () {
      if (!hayEscaner()) return teclearCodigo(alElegir);
      var id = 'e' + Date.now();
      esperandoEscaneo[id] = function (r) {
        if (r.estado === 'ok' && r.codigo) porCodigo(String(r.codigo), alElegir);
        else if (r.estado === 'error') App.avisar('No se pudo abrir el lector: ' + (r.mensaje || 'prueba a teclear el número'), true);
      };
      window.AndroidPasos.escanear(id);
    } });
  }

  function teclearCodigo(alElegir) {
    var input = h('input', { type: 'text', inputmode: 'numeric', placeholder: '8410000000000', 'aria-label': 'Código de barras' });
    App.abrirSelector('Código de barras', [
      h('p', { class: 'detalle', texto: hayEscaner() ? '' : 'El número de debajo de las barras. Para escanear con la cámara hace falta la app nueva.' }),
      input,
      h('button', { type: 'button', class: 'principal', texto: 'Buscar', onclick: function () {
        var c = input.value.replace(/\D/g, '');
        if (c.length < 8) { App.avisar('El código tiene al menos 8 números', true); return; }
        porCodigo(c, alElegir);
      } }),
    ]);
    setTimeout(function () { input.focus(); }, 50);
  }

  // Los macros de Open Food Facts por 100 g, o null si no los trae.
  function desdeOpenFoodFacts(codigo, p) {
    var n = (p && p.nutriments) || {};
    var kcal = n['energy-kcal_100g'] != null ? n['energy-kcal_100g'] : n['energy_100g'] != null ? n['energy_100g'] / 4.184 : null;
    if (kcal == null && n.proteins_100g == null) return null;
    var r1 = function (v) { return v == null || v === '' ? '' : Math.round(Number(v) * 10) / 10; };
    return { codigo: codigo, nombre: String(p.product_name_es || p.product_name || '').trim(), marca: String(p.brands || '').split(',')[0].trim(),
      kcal: kcal != null ? Math.round(kcal) : '', proteina: r1(n.proteins_100g), hidratos: r1(n.carbohydrates_100g), grasa: r1(n.fat_100g),
      cafeina: n.caffeine_100g != null && n.caffeine_100g !== '' ? Math.round(Number(n.caffeine_100g) * 1000) : '',
      // Lo que pesa una unidad, solo si el paquete lo dice ("6 x 125 g"). La ración de Open Food Facts (serving_quantity)
      // no vale: muchas veces es 100 g aunque la rebanada pese 28 (él, 2026-11-09: 2 rebanadas salían 200 g de pan).
      // Sin esto, la primera vez que se apunta por unidades se pregunta el paquete y cuántas trae.
      porcion: pack(p.quantity).una || '',
      envase: p.product_quantity ? Math.round(Number(p.product_quantity)) : pack(p.quantity).total || '', fuente: 'openfoodfacts' };
  }

  // "6 x 125 g" (yogures, natillas…): lo que pesa cada uno y el total. Si no viene así, {}.
  function pack(texto) {
    var m = /(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(g|gr|ml)\b/i.exec(String(texto || ''));
    if (!m) return {};
    var una = Number(m[2].replace(',', '.'));
    return una > 0 ? { una: una, total: Math.round(una * Number(m[1])) } : {};
  }

  function porCodigo(codigo, alElegir) {
    var ya = Almacen.tablaComida('alimentos').filter(function (a) { return String(a.codigo) === codigo; })[0];
    if (ya) return alElegir(ya);
    if (!navigator.onLine) {
      return nuevoAlimento({ codigo: codigo }, alElegir, 'Sin conexión: rellénalo con la etiqueta (o vuelve a escanearlo luego).');
    }
    App.abrirSelector('Buscando ' + codigo + '…', [h('p', { class: 'detalle', texto: 'Mirando en Open Food Facts…' })]);
    var url = 'https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(codigo) +
      '.json?fields=product_name,product_name_es,brands,nutriments,serving_quantity,product_quantity,quantity';
    var listo = false;
    var espera = setTimeout(function () {
      if (listo) return;
      listo = true;
      nuevoAlimento({ codigo: codigo }, alElegir, 'Open Food Facts no contesta: rellénalo con la etiqueta.');
    }, 12000);
    fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      if (listo) return;
      listo = true;
      clearTimeout(espera);
      var datos = d && d.status === 1 ? desdeOpenFoodFacts(codigo, d.product) : null;
      if (datos) nuevoAlimento(datos, alElegir, 'Datos de Open Food Facts: revisa que cuadren con la etiqueta y guarda.');
      else nuevoAlimento({ codigo: codigo }, alElegir, 'Este producto no está en Open Food Facts: rellénalo con la etiqueta una vez y ya queda guardado.');
    }).catch(function () {
      if (listo) return;
      listo = true;
      clearTimeout(espera);
      nuevoAlimento({ codigo: codigo }, alElegir, 'No se pudo buscar: rellénalo con la etiqueta.');
    });
  }

  // ---- Platos ----
  // Un plato es una receta con sus ingredientes (cada uno con sus gramos y sus macros de ese momento) y las raciones
  // que salen. Va al Excel común: los dos ven los platos de los dos. Se apunta por raciones.

  function ingredientesDe(p) {
    var l = p && p.ingredientes;
    if (typeof l === 'string') { try { l = JSON.parse(l); } catch (e) { l = []; } }
    return Array.isArray(l) ? l : [];
  }

  function totalPlato(p) {
    var ing = ingredientesDe(p);
    var t = Comida.sumar(ing);
    t.gramos = ing.reduce(function (s, i) { return s + (Number(i.gramos) || 0); }, 0);
    return t;
  }

  function platos() {
    return Almacen.tablaComida('platos').slice().sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre), 'es'); });
  }

  // Apuntar un plato guardado, con la misma hoja simple que un alimento (él, 2026-11-08): arriba en grande lo que suma
  // y sus macros, debajo lo que lleva en pequeño, "− 1 ración +" (de media en media) y Apuntar con "Cambiar el plato"
  // pequeño debajo.
  function apuntarPlato(p, comidaId) {
    var raciones = Number(p.raciones) || 1;
    var total = totalPlato(p);
    var cuantas = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: '0.5', value: '1', 'aria-label': 'Raciones' });
    var etiqueta = h('span', { class: 'comida-medida' });
    var kcalGrande = h('div', { class: 'comida-total' });
    var macros = h('div', { class: 'comida-total-macros' });
    function parte() { return (App.numero(cuantas.value) || 0) / raciones; }
    function refrescar() {
      var f = parte();
      var n = App.numero(cuantas.value) || 0;
      etiqueta.textContent = n === 1 ? 'ración' : 'raciones';
      kcalGrande.innerHTML = '';
      kcalGrande.appendChild(document.createTextNode(String(Math.round(total.kcal * f))));
      kcalGrande.appendChild(h('small', { texto: ' kcal' + (total.gramos > 0 ? ' · ' + formato(Math.round(total.gramos * f)) + ' g' : '') }));
      macros.innerHTML = '';
      [['Proteína', total.proteina, 'proteina'], ['Hidratos', total.hidratos, 'hidratos'], ['Grasa', total.grasa, 'grasa']].forEach(function (x) {
        macros.appendChild(h('span', { class: 'comida-macro ' + x[2] }, [h('strong', { texto: formato(Math.round((x[1] || 0) * f)) + ' g' }), x[0]]));
      });
    }
    var paso = function (d) {
      return h('button', { type: 'button', class: 'comida-paso', texto: d > 0 ? '+' : '−', 'aria-label': d > 0 ? 'Más' : 'Menos', onclick: function () {
        cuantas.value = String(Math.max(0.5, (App.numero(cuantas.value) || 0) + d * 0.5));
        refrescar();
      } });
    };
    cuantas.addEventListener('input', refrescar);
    refrescar();
    App.abrirSelector('🍽 ' + p.nombre, [
      kcalGrande,
      macros,
      h('p', { class: 'detalle comida-lleva', texto: ingredientesDe(p).map(function (i) { return i.nombre + ' ' + formato(i.gramos) + ' g'; }).join(' · ') +
        (raciones !== 1 ? ' — salen ' + formato(raciones) + ' raciones' : '') }),
      h('div', { class: 'comida-cantidad' }, [paso(-1), h('div', { class: 'comida-cantidad-valor' }, [cuantas, etiqueta]), paso(1)]),
      h('button', { type: 'button', class: 'principal comida-guardar', texto: 'Apuntar', onclick: function () {
        var f = parte();
        if (!(f > 0)) { App.avisar('Pon las raciones', true); return; }
        ingredientesDe(p).forEach(function (i) { restarDeDespensa(i, (Number(i.gramos) || 0) * f); });
        Almacen.guardarFilaComida('comidas', {
          fecha: diaVisto(), hora: horaAhora(), comida: comidaId, grupo: grupoPara(comidaId), grupoNombre: nombreGrupo(diaVisto(), comidaId, grupoPara(comidaId)), nombre: p.nombre, plato: p.id,
          gramos: Math.round(total.gramos * f), kcal: Math.round(total.kcal * f), proteina: Math.round(total.proteina * f * 10) / 10,
          hidratos: Math.round(total.hidratos * f * 10) / 10, grasa: Math.round(total.grasa * f * 10) / 10,
          cafeina: total.cafeina > 0 ? Math.round(total.cafeina * f) : '',
        });
        App.cerrarSelector();
        App.repintar();
      } }),
      h('button', { type: 'button', class: 'comida-enlace', texto: 'Cambiar el plato', onclick: function () { editarPlato(p, comidaId); } }),
    ]);
  }

  // Crear o cambiar un plato. borrador: { id?, nombre, raciones, ingredientes }. Se va guardando en el borrador mientras
  // se eligen los ingredientes (cada uno abre el buscador y vuelve aquí).
  function editarPlato(borrador, comidaId) {
    var p = { id: borrador.id, nombre: borrador.nombre || '', raciones: Number(borrador.raciones) || 1, ingredientes: ingredientesDe(borrador).slice() };
    var nombre = h('input', { 'aria-label': 'Nombre del plato', placeholder: 'Arroz con pollo', value: p.nombre });
    var raciones = h('input', { type: 'number', inputmode: 'decimal', min: '0.5', step: '0.5', value: p.raciones, 'aria-label': 'Raciones que salen' });
    function leerCampos() {
      p.nombre = nombre.value.trim();
      p.raciones = App.numero(raciones.value) || 1;
    }
    var total = totalPlato(p);
    var lista = h('div', { class: 'lista-historial comida-ingredientes' }, p.ingredientes.map(function (ing, i) {
      return h('div', { class: 'comida-ingrediente' }, [
        // Tocarlo cambia los gramos (los macros, en la misma proporción).
        h('button', { type: 'button', class: 'comida-ingrediente-nombre', 'aria-label': 'Cambiar los gramos de ' + ing.nombre, onclick: function () {
          leerCampos();
          var g0 = Number(ing.gramos) || 0;
          var base = { nombre: ing.nombre, porcion: g0 || 100 };
          ['kcal', 'proteina', 'hidratos', 'grasa', 'cafeina'].forEach(function (k) { base[k] = g0 > 0 ? (Number(ing[k]) || 0) / g0 * 100 : 0; });
          pedirGramos(base, function (g) {
            var m = Comida.porCantidad(base, g);
            p.ingredientes[i] = Object.assign({}, ing, { gramos: g, kcal: m.kcal, proteina: m.proteina, hidratos: m.hidratos, grasa: m.grasa, cafeina: m.cafeina || 0 });
            editarPlato(p, comidaId);
          }, 'Cambiar');
        } }, [
          h('span', { texto: ing.nombre }),
          h('span', { class: 'tipo', texto: formato(ing.gramos) + ' g · ' + Math.round(ing.kcal) + ' kcal ›' }),
        ]),
        h('button', { type: 'button', class: 'discreto', 'aria-label': 'Quitar ' + ing.nombre, texto: '×', onclick: function () {
          leerCampos();
          p.ingredientes.splice(i, 1);
          editarPlato(p, comidaId);
        } }),
      ]);
    }));
    App.abrirSelector(p.id ? 'Cambiar plato' : 'Nuevo plato', [
      h('label', { class: 'campo' }, [h('span', { texto: 'Nombre' }), nombre]),
      h('label', { class: 'campo' }, [h('span', { texto: 'Raciones que salen' }), raciones]),
      h('p', { class: 'detalle', texto: 'Ingredientes (en crudo, lo que echas a la olla):' }),
      lista,
      h('button', { type: 'button', class: 'discreto', texto: '+ Ingrediente', onclick: function () {
        leerCampos();
        elegirAlimento('Ingrediente', function (a) {
          pedirGramos(a, function (g) {
            var m = Comida.porCantidad(a, g);
            p.ingredientes.push({ nombre: a.nombre, codigo: a.codigo || '', gramos: g, kcal: m.kcal, proteina: m.proteina, hidratos: m.hidratos, grasa: m.grasa, cafeina: m.cafeina || 0 });
            editarPlato(p, comidaId);
          });
        });
      } }),
      p.ingredientes.length ? h('p', { class: 'comida-previa', texto: 'Todo: ' + linea(total) }) : null,
      h('button', { type: 'button', class: 'principal', texto: 'Guardar plato', onclick: function () {
        leerCampos();
        if (!p.nombre) { App.avisar('Ponle un nombre', true); return; }
        if (!p.ingredientes.length) { App.avisar('Añade algún ingrediente', true); return; }
        var guardado = Almacen.guardarFilaComida('platos', p.id ? p : { nombre: p.nombre, raciones: p.raciones, ingredientes: p.ingredientes });
        if (comidaId) apuntarPlato(guardado, comidaId);
        else { App.cerrarSelector(); App.repintar(); }
      } }),
      p.id ? h('button', { type: 'button', class: 'discreto comida-quitar', texto: 'Borrar el plato', onclick: function (ev) {
        var b = ev.currentTarget;
        if (!b.dataset.seguro) { b.dataset.seguro = '1'; b.textContent = '¿Seguro? Toca otra vez para borrarlo'; return; }
        Almacen.borrarFilaComida('platos', p.id);
        App.cerrarSelector();
        App.repintar();
      } }) : null,
    ]);
  }

  // Los gramos de un ingrediente.
  function pedirGramos(alimento, alGuardar, textoBoton) {
    var gramos = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: '1', value: alimento.porcion || 100, 'aria-label': 'Gramos' });
    var vista = h('p', { class: 'comida-previa' });
    function refrescar() { vista.textContent = linea(Comida.porCantidad(alimento, App.numero(gramos.value) || 0)); }
    gramos.addEventListener('input', refrescar);
    refrescar();
    App.abrirSelector(alimento.nombre, [
      h('label', { class: 'campo' }, [h('span', { texto: 'Gramos' }), gramos]),
      vista,
      h('button', { type: 'button', class: 'principal', texto: textoBoton || 'Añadir al plato', onclick: function () {
        var g = App.numero(gramos.value);
        if (!(g > 0)) { App.avisar('Pon los gramos', true); return; }
        alGuardar(g);
      } }),
    ]);
    setTimeout(function () { gramos.focus(); gramos.select(); }, 50);
  }

  function nombreComida(id) {
    return (Comida.COMIDAS.filter(function (c) { return c.id === id; })[0] || {}).nombre || id;
  }

  // ---- Agua ----

  function beber(ml) {
    Almacen.guardarFilaComida('agua', { fecha: diaVisto(), hora: horaAhora(), ml: ml });
    App.repintar();
  }

  function cambiarMedidas() {
    var num = { type: 'number', inputmode: 'numeric', min: '50', step: '10' };
    var v = h('input', Object.assign({ value: vaso(), 'aria-label': 'Mililitros del vaso' }, num));
    var b = h('input', Object.assign({ value: botella(), 'aria-label': 'Mililitros de la botella' }, num));
    App.abrirSelector('Tu vaso y tu botella', [
      h('label', { class: 'campo' }, [h('span', { texto: 'Vaso (ml)' }), v]),
      h('label', { class: 'campo' }, [h('span', { texto: 'Botella (ml)' }), b]),
      h('button', { type: 'button', class: 'principal', texto: 'Guardar', onclick: function () {
        var nv = App.numero(v.value), nb = App.numero(b.value);
        if (!(nv >= 50) || !(nb >= 50)) { App.avisar('Pon los ml del vaso y de la botella', true); return; }
        try {
          localStorage.setItem('gymapp.vaso', String(Math.round(nv)));
          localStorage.setItem('gymapp.botella', String(Math.round(nb)));
        } catch (e) { /* sin almacenamiento */ }
        App.cerrarSelector();
        App.repintar();
      } }),
    ]);
  }

  function tarjetaAgua(fecha) {
    var tomas = aguaDe(fecha).sort(function (a, b) { return String(a.hora).localeCompare(String(b.hora)); });
    var total = tomas.reduce(function (t, a) { return t + (Number(a.ml) || 0); }, 0);
    var cuerpo = Almacen.cuerpo();
    var objetivo = Comida.aguaObjetivo(cuerpo && cuerpo.peso, horasEntreno(fecha));
    var parte = objetivo ? Math.min(1, total / objetivo) : 0;
    var ultima = tomas[tomas.length - 1];
    return h('div', { class: 'tarjeta comida-agua' }, [
      h('div', { class: 'ejercicio-cabecera' }, [
        h('h2', { texto: '💧 Agua' }),
        h('span', { class: 'tipo', texto: formato(total / 1000) + (objetivo ? ' de ' + formato(objetivo / 1000) : '') + ' L' }),
      ]),
      objetivo ? h('div', { class: 'barra-agua', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(objetivo), 'aria-valuenow': String(total) },
        [h('span', { style: 'width:' + Math.round(parte * 100) + '%' })])
        : h('p', { class: 'detalle', texto: 'Pon tu peso en Ajustes para saber cuánta te toca.' }),
      h('div', { class: 'comida-agua-botones' }, [
        h('button', { type: 'button', texto: '+ Vaso ' + vaso() + ' ml', onclick: function () { beber(vaso()); } }),
        h('button', { type: 'button', texto: '+ Botella ' + botella() + ' ml', onclick: function () { beber(botella()); } }),
        ultima ? h('button', { type: 'button', class: 'discreto', 'aria-label': 'Quitar la última', texto: '↶', onclick: function () {
          Almacen.borrarFilaComida('agua', ultima.id);
          App.repintar();
        } }) : null,
      ]),
      h('button', { type: 'button', class: 'discreto comida-botella', texto: 'Tu vaso y tu botella', onclick: cambiarMedidas }),
    ]);
  }

  // ---- Pantalla ----

  // ---- Lo que toca comer (él, 2026-11-07: "medir cuánto debería consumir de cada cosa, con barras") ----
  // Plan de cada uno (en el móvil): Mantenimiento, Volumen o Recorte (Comida.PLANES). Las kcal = el gasto de un día
  // normal (Pasos.gastoMedio) ± lo que pide el plan; proteína y grasa por kg y los hidratos con lo que queda.
  function planComida() {
    var v = '';
    try { v = localStorage.getItem('gymapp.planComida') || ''; } catch (e) { v = ''; }
    return Comida.PLANES[v] ? v : 'mantenimiento';
  }

  function objetivoDelDia() {
    var cuerpo = Almacen.cuerpo();
    if (!cuerpo || !(cuerpo.peso > 0)) return null;
    var g = typeof Pasos !== 'undefined' && Pasos.gastoMedio ? Pasos.gastoMedio(hoy()) : null;
    var plan = planComida();
    var o = g ? Comida.objetivo(plan, cuerpo, g.kcal) : null;
    if (o) return Object.assign(o, { gasto: g.kcal, deLosPesos: g.deLosPesos });
    // Sin la altura no se sabe el gasto: proteína y grasa sí (van por kg).
    var p = Comida.PLANES[plan];
    return { plan: plan, kcal: null, proteina: Math.round(cuerpo.peso * p.proteina), grasa: Math.round(cuerpo.peso * p.grasa), hidratos: null };
  }

  // Una barra: nombre, lo comido de lo que toca y la barra llena en proporción. Si se pasa, la parte de más en rojo
  // (la proteína no: pasarse no es malo).
  function barraMacro(nombre, valor, meta, unidad, clase) {
    var v = Math.round(valor);
    var pasa = meta > 0 && v > meta;
    var lleno = meta > 0 ? Math.min(1, v / meta) : 0;
    var sobra = pasa && clase !== 'proteina' ? Math.min(1, (v - meta) / v) : 0;
    return h('div', { class: 'macro macro-' + clase + (pasa && clase !== 'proteina' ? ' pasado' : '') }, [
      h('div', { class: 'macro-cabecera' }, [
        h('span', { class: 'macro-nombre', texto: nombre }),
        h('span', { class: 'macro-cifra' }, [
          h('strong', { texto: Grafica.miles(v) }),
          meta > 0 ? ' / ' + Grafica.miles(meta) + ' ' + unidad : ' ' + unidad,
        ]),
      ]),
      h('div', { class: 'macro-barra', role: 'progressbar', 'aria-label': nombre, 'aria-valuemin': '0',
        'aria-valuemax': String(meta || 0), 'aria-valuenow': String(v) }, [
        h('span', { class: 'macro-lleno', style: 'width:' + Math.round(lleno * 100) + '%' }),
        sobra ? h('span', { class: 'macro-sobra', style: 'width:' + Math.round(sobra * 100) + '%' }) : null,
      ]),
    ]);
  }

  function tarjetaResumen(fecha, totales) {
    var o = objetivoDelDia();
    var falta = o && o.kcal ? Comida.falta(o, totales) : null;
    var pie = !Almacen.cuerpo() || !(Almacen.cuerpo().peso > 0) ? 'Pon tu peso en Tus datos para saber lo que te toca.'
      : !o.kcal ? 'Pon tu altura en Tus datos para saber tus calorías.'
        : fecha === hoy() && falta.kcal > 0 ? 'Te quedan ' + Grafica.miles(Math.round(falta.kcal)) + ' kcal' +
          (falta.proteina > 0 ? ' y ' + Math.round(falta.proteina) + ' g de proteína.' : '.')
          : null;
    return h('div', { class: 'tarjeta comida-resumen' }, [
      h('div', { class: 'ejercicio-cabecera' }, [
        h('h2', { texto: 'Lo que toca' }),
        h('button', { type: 'button', class: 'discreto comida-plan', texto: Comida.PLANES[planComida()].nombre + ' ›', onclick: elegirPlan }),
      ]),
      barraMacro('Calorías', totales.kcal, o && o.kcal, 'kcal', 'kcal'),
      barraMacro('Proteína', totales.proteina, o && o.proteina, 'g', 'proteina'),
      barraMacro('Hidratos', totales.hidratos, o && o.hidratos, 'g', 'hidratos'),
      barraMacro('Grasa', totales.grasa, o && o.grasa, 'g', 'grasa'),
      barraMacro('Cafeína', totales.cafeina || 0, Comida.CAFEINA_MAX, 'mg', 'cafeina'),
      pie ? h('p', { class: 'detalle', texto: pie }) : null,
    ]);
  }

  function elegirPlan() {
    var actual = planComida();
    var o = objetivoDelDia();
    var cuerpo = Almacen.cuerpo() || {};
    var botones = Object.keys(Comida.PLANES).map(function (id) {
      var p = Comida.PLANES[id];
      var cambio = cuerpo.peso > 0 && p.semana ? (p.semana > 0 ? '+' : '−') + formato(Math.abs(Math.round(cuerpo.peso * p.semana * 100) / 100)) + ' kg por semana'
        : 'mantener el peso';
      return h('button', { type: 'button', class: id === actual ? 'actual' : '', onclick: function () {
        try { localStorage.setItem('gymapp.planComida', id); } catch (e) { /* sin almacenamiento: se queda en mantenimiento */ }
        App.cerrarSelector();
        App.repintar();
      } }, [h('span', { texto: p.nombre }), h('span', { class: 'tipo', texto: cambio })]);
    });
    App.abrirSelector('Tu objetivo', [
      h('div', { class: 'lista-historial comida-planes' }, botones),
      o && o.gasto ? h('p', { class: 'detalle', texto: (o.deLosPesos ? 'Según lo que comes y lo que marca la báscula, gastas unas '
        : 'Un día normal gastas unas ') + Grafica.miles(o.gasto) + ' kcal (tu cuerpo, lo que andas y el entreno). ' +
        'Proteína ' + formato(Comida.PLANES[actual].proteina) + ' g y grasa ' + formato(Comida.PLANES[actual].grasa) + ' g por kilo; los hidratos, lo que queda.' })
        : h('p', { class: 'detalle', texto: 'Pon tu peso y tu altura en Tus datos para calcular tus calorías.' }),
    ]);
  }

  // ---- Varios platos en una comida (él, 2026-11-07: "las tostadas y aparte el tazón; todo junto es mentira") ----
  // Cada apunte lleva `grupo` (id del plato dentro de esa comida; '' = el primero) y, si se le puso, `grupoNombre`.
  function nuevoGrupo() { return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  // Los apuntes de una comida, por platos, en el orden en que se empezó cada uno.
  function bloques(apuntes) {
    var lista = [], porGrupo = {};
    apuntes.forEach(function (a) {
      var g = a.grupo || '';
      if (!porGrupo[g]) { porGrupo[g] = { grupo: g, apuntes: [] }; lista.push(porGrupo[g]); }
      porGrupo[g].apuntes.push(a);
    });
    return lista;
  }

  // '' = "+ Otro plato" (sin nombre: sale lo que lleva).
  var PLATOS_RAPIDOS = { desayuno: ['Tazón', ''], comida: ['', 'Postre'], cena: ['', 'Postre'] };

  function nombrePuesto(b) { return b.apuntes.map(function (a) { return a.grupoNombre; }).filter(Boolean)[0] || ''; }

  // "Guardar como plato": con 2 cosas o más, o con 1 si el plato tiene nombre (él, 2026-11-09: "el tazón no se
  // puede guardar"). No sale si lo único que lleva ya es un plato guardado.
  function sePuedeGuardar(b) {
    if (b.apuntes.length >= 2) return true;
    return b.apuntes.length === 1 && !!nombrePuesto(b) && !b.apuntes[0].plato;
  }

  // El nombre del plato (él, 2026-11-08: "el nombre del plato y no los ingredientes; sin nombre, Plato 1, Plato 2"):
  // el que se le puso; si no, el del plato guardado que lleva; si no, "Plato N" por su orden en esa comida.
  function nombreBloque(b, i) {
    var puesto = nombrePuesto(b);
    if (puesto) return puesto;
    var guardado = b.apuntes.filter(function (a) { return a.plato; })[0];
    if (guardado) return guardado.nombre;
    return 'Plato ' + (i + 1);
  }

  function renombrarBloque(b, i) {
    var nombre = h('input', { 'aria-label': 'Nombre del plato', placeholder: nombreBloque(b, i), value: b.apuntes.map(function (a) { return a.grupoNombre; }).filter(Boolean)[0] || '' });
    App.abrirSelector('Nombre del plato', [
      h('label', { class: 'campo' }, [h('span', { texto: 'Nombre' }), nombre]),
      h('button', { type: 'button', class: 'principal', texto: 'Guardar', onclick: function () {
        var n = nombre.value.trim();
        var g = b.grupo || nuevoGrupo();
        b.apuntes.forEach(function (a) { Almacen.guardarFilaComida('comidas', Object.assign({}, a, { grupo: g, grupoNombre: n })); });
        App.cerrarSelector();
        App.repintar();
      } }),
    ]);
    setTimeout(function () { nombre.focus(); }, 50);
  }

  function filaApunte(a) {
    return h('button', { type: 'button', onclick: function () {
      var base = por100(a);
      if (base) cantidad(base, a.comida, a);
    } }, [
      h('span', { texto: a.nombre }),
      h('span', { class: 'tipo', texto: formato(a.gramos) + ' g · ' + Math.round(a.kcal) + ' kcal' }),
    ]);
  }

  function tarjetaComida(c, apuntes) {
    var suyos = apuntes.filter(function (a) { return a.comida === c.id; });
    var total = Comida.sumar(suyos);
    // Almuerzo y Merienda solo salen si tienen algo (o con un botón pequeño para añadirlos).
    if (c.opcional && !suyos.length) return null;
    var partes = bloques(suyos);
    // En cajitas si hay más de un plato o si el único tiene nombre (un "Postre" solo tiene que decir que es el postre).
    var varios = partes.length > 1 || partes.some(nombrePuesto);
    // Atajos de plato nuevo (él, 2026-11-07): "+ Tazón" en el desayuno; "+ Otro plato" y "+ Postre" en comida y cena.
    // Uno con nombre no sale si ese día ya hay un plato con ese nombre (se añade con su "+ Añadir").
    var atajos = (PLATOS_RAPIDOS[c.id] || ['']).filter(function (n) {
      if (!n) return suyos.length > 0;
      return !partes.some(function (b) { return Grupos.normalizar(nombrePuesto(b) || '') === Grupos.normalizar(n); });
    });
    // Con un solo plato, como siempre: la lista y debajo los botones. Con varios, cada uno en su cajita con su nombre
    // (tocarlo lo cambia), sus kcal, lo que lleva y su "+ Añadir".
    var cuerpo = !suyos.length ? null : !varios
      ? h('div', { class: 'lista-historial comida-apuntes' }, suyos.map(filaApunte))
      : h('div', { class: 'comida-bloques' }, partes.map(function (b, i) {
        var t = Comida.sumar(b.apuntes);
        return h('div', { class: 'comida-bloque' }, [
          h('div', { class: 'comida-bloque-cabecera' }, [
            h('button', { type: 'button', class: 'comida-bloque-nombre', 'aria-label': 'Cambiar el nombre del plato', texto: nombreBloque(b, i), onclick: function () { renombrarBloque(b, i); } }),
            h('span', { class: 'tipo', texto: Math.round(t.kcal) + ' kcal' }),
          ]),
          h('div', { class: 'lista-historial comida-apuntes' }, b.apuntes.map(filaApunte)),
          h('div', { class: 'comida-crear' }, [
            h('button', { type: 'button', class: 'discreto', texto: '+ Añadir', onclick: function () { buscar(c.id, b.grupo); } }),
            sePuedeGuardar(b) ? h('button', { type: 'button', class: 'discreto', texto: '🍽 Guardar como plato', onclick: function () { guardarComoPlato(c, b.apuntes, nombrePuesto(b)); } }) : null,
          ]),
        ]);
      }));
    return h('div', { class: 'tarjeta comida-tarjeta' }, [
      h('div', { class: 'ejercicio-cabecera' }, [
        h('h3', { texto: c.nombre }),
        h('span', { class: 'tipo', texto: suyos.length ? Math.round(total.kcal) + ' kcal' : '' }),
      ]),
      cuerpo,
      h('div', { class: 'comida-crear' }, [
        suyos.length ? null : botonRepetir(c),
        varios ? null : h('button', { type: 'button', class: 'discreto', texto: '+ Añadir', onclick: function () { buscar(c.id, partes.length ? partes[0].grupo : ''); } }),
      ].concat(atajos.map(function (n) {
        return h('button', { type: 'button', class: 'discreto', texto: '+ ' + (n || 'Otro plato'), onclick: function () { buscar(c.id, nuevoGrupo(), n); } });
      })).concat([
        !varios && partes.length && sePuedeGuardar(partes[0]) ? h('button', { type: 'button', class: 'discreto', texto: '🍽 Guardar como plato', onclick: function () { guardarComoPlato(c, suyos); } }) : null,
      ])),
    ]);
  }

  // "↻ Igual que ayer" (él, 2026-11-07: repetir con un toque): en una comida vacía, lo de la última vez que se apuntó
  // esa comida (hasta 14 días atrás) se copia entero al día que se mira, y se resta de la despensa como al apuntarlo.
  function ultimaVez(comidaId, fecha) {
    var desde = Calendario.sumarDias(fecha, -14);
    var antes = Almacen.tablaComida('comidas').filter(function (a) { return a.comida === comidaId && a.fecha < fecha && a.fecha >= desde; });
    if (!antes.length) return null;
    var ultima = antes.reduce(function (m, a) { return a.fecha > m ? a.fecha : m; }, '');
    return { fecha: ultima, apuntes: antes.filter(function (a) { return a.fecha === ultima; }) };
  }

  function botonRepetir(c) {
    var fecha = diaVisto();
    var u = ultimaVez(c.id, fecha);
    if (!u) return null;
    var cuando = u.fecha === Calendario.sumarDias(fecha, -1) ? 'ayer' : 'el ' + Grafica.fechaCorta(u.fecha);
    var kcal = Math.round(Comida.sumar(u.apuntes).kcal);
    return h('button', { type: 'button', class: 'comida-repetir', texto: '↻ Igual que ' + cuando + ' · ' + kcal + ' kcal', onclick: function () {
      var hora = horaAhora();
      u.apuntes.forEach(function (a) {
        var plato = a.plato && Almacen.tablaComida('platos').filter(function (p) { return p.id === a.plato; })[0];
        if (plato) {
          var f = (Number(a.gramos) || 0) / (totalPlato(plato).gramos || 1);
          ingredientesDe(plato).forEach(function (i) { restarDeDespensa(i, (Number(i.gramos) || 0) * f); });
        } else restarDeDespensa(a, Number(a.gramos) || 0);
        var copia = Object.assign({}, a, { fecha: fecha, hora: hora });
        delete copia.id;
        delete copia.borrado;
        Almacen.guardarFilaComida('comidas', copia);
      });
      App.avisar(c.nombre + ' apuntado: ' + u.apuntes.map(function (a) { return a.nombre; }).join(', '));
      App.repintar();
    } });
  }

  // Lo apuntado en una comida (el desayuno de siempre) pasa a ser un plato de una ración, para repetirlo de un toque.
  // sugerido: el nombre que se le puso al plato del día (si no, se propone "Mi desayuno"; nunca la lista de lo que lleva).
  function guardarComoPlato(c, apuntes, sugerido) {
    var nombre = h('input', { 'aria-label': 'Nombre del plato', value: sugerido || '', placeholder: 'Mi ' + c.nombre.toLowerCase() });
    App.abrirSelector('Guardar como plato', [
      h('p', { class: 'detalle', texto: apuntes.map(function (a) { return a.nombre + ' ' + formato(a.gramos) + ' g'; }).join(' · ') }),
      h('label', { class: 'campo' }, [h('span', { texto: 'Nombre' }), nombre]),
      h('button', { type: 'button', class: 'principal', texto: 'Guardar', onclick: function () {
        var n = nombre.value.trim() || nombre.placeholder;
        Almacen.guardarFilaComida('platos', { nombre: n, raciones: 1, ingredientes: apuntes.map(function (a) {
          return { nombre: a.nombre, codigo: a.codigo || '', gramos: Number(a.gramos) || 0, kcal: a.kcal, proteina: a.proteina || 0, hidratos: a.hidratos || 0, grasa: a.grasa || 0, cafeina: Number(a.cafeina) || 0 };
        }) });
        App.avisar('Guardado: lo tienes en "+ Añadir" → Platos');
        App.cerrarSelector();
      } }),
    ]);
    setTimeout(function () { nombre.focus(); }, 50);
  }

  // ---- Despensa y lista de la compra (2026-11-06) ----
  // Común con el otro: movimientos en la tabla "despensa" (Comida.estadoDespensa). Se cuenta en envases (un brick, un
  // yogur). Cada producto es un alimento por su id (ean-<código>, b-<básico> o el de uno creado a mano).

  function ahoraISO() {
    var d = new Date();
    return hoy() + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' +
      String(d.getSeconds()).padStart(2, '0') + '.' + String(d.getMilliseconds()).padStart(3, '0');
  }

  function mover(producto, tipo, cantidad) {
    Almacen.guardarFilaComida('despensa', { producto: producto, fecha: ahoraISO(), tipo: tipo, cantidad: cantidad });
  }

  function estado() {
    return Comida.estadoDespensa(Almacen.filasComida('despensa'));
  }

  // El alimento de un id de la despensa (de la lista común o de los básicos).
  function alimentoDe(id) {
    return Almacen.tablaComida('alimentos').concat(Basicos.LISTA).filter(function (a) { return a.id === id; })[0] || null;
  }

  function nombreProducto(id) {
    var a = alimentoDe(id);
    return a ? a.nombre + (a.marca ? ' · ' + a.marca : '') : String(id).replace(/^n-/, '');
  }

  // El id de despensa de un alimento o de lo apuntado (por su código, o buscando el alimento por el nombre).
  function productoDe(a) {
    if (!a) return null;
    if (a.codigo) return 'ean-' + a.codigo;
    if (a.id && alimentoDe(a.id)) return a.id;
    var n = Basicos.normalizar(a.nombre);
    var igual = Almacen.tablaComida('alimentos').concat(Basicos.LISTA).filter(function (x) { return Basicos.normalizar(x.nombre) === n; })[0];
    return igual ? igual.id : null;
  }

  // Al apuntar lo comido: si ese producto está en la despensa y queda, se resta lo que es en envases.
  function restarDeDespensa(alimento, gramos) {
    var id = productoDe(alimento);
    var e = id && estado()[id];
    if (!e || !(e.hay > 0)) return;
    mover(id, 'comido', Comida.envasesDe(alimentoDe(id) || alimento, gramos));
  }

  function enEnvases(n) {
    return formato(Math.round(n * 10) / 10);
  }

  // Meter o sacar envases a mano, o fijar cuántos hay y el mínimo.
  function fichaProducto(id) {
    var e = estado()[id] || { hay: 0, minimo: 0, pedido: 0 };
    var hay = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: '1', value: e.hay, 'aria-label': 'Cuántos hay' });
    // "Quiero tener siempre N" (él, 2026-11-08: "aceite, siempre 6 en casa; si gasto, a comprar"): el mínimo, con − +.
    // Si baja de ahí, la lista pide lo que falta hasta N (Comida.lista).
    var nMin = e.minimo || 0;
    var textoSiempre = h('p', { class: 'detalle casa-siempre-texto' });
    function explicar() {
      textoSiempre.textContent = nMin > 0 ? 'Si gastas, va a la compra lo que falte hasta ' + nMin + '.'
        : 'Sin número: va a la compra cuando se acabe.';
    }
    explicar();
    var a = alimentoDe(id) || { nombre: nombreProducto(id) };
    var envase = campoEnvase(a);
    // Cafeína por 100 g o ml (2026-11-09): lo escaneado casi nunca la trae; aquí se corrige.
    var cafe = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: a.cafeina != null ? a.cafeina : '',
      placeholder: String(Comida.cafeinaDe(a)), 'aria-label': 'Cafeína (mg por 100 g o ml)' });
    App.abrirSelector(nombreProducto(id), [
      h('div', { class: 'casa-siempre' }, [
        h('span', { class: 'casa-siempre-titulo', texto: 'Quiero tener siempre' }),
        contador(nMin, function (v) { nMin = v; explicar(); }, true, 0),
        textoSiempre,
      ]),
      h('label', { class: 'campo' }, [h('span', { texto: 'Cuántos hay ahora' }), hay]),
      h('label', { class: 'campo' }, [h('span', { texto: 'Cada uno trae (g o ml, para restar lo que comes)' }), envase]),
      h('label', { class: 'campo' }, [h('span', { texto: 'Cafeína (mg por 100 g o ml)' }), cafe]),
      h('button', { type: 'button', class: 'principal', texto: 'Guardar', onclick: function () {
        var nHay = App.numero(hay.value);
        guardarEnvase(a, id, envase);
        var nCafe = App.numero(cafe.value);
        if (nCafe != null && nCafe !== Number(alimentoDe(id) && alimentoDe(id).cafeina)) guardarEnAlimentos(id, a, { cafeina: nCafe });
        if (nHay != null && nHay !== e.hay) mover(id, 'ajuste', Math.max(0, nHay));
        if (nMin !== (e.minimo || 0)) mover(id, 'minimo', nMin);
        App.cerrarSelector();
        App.repintar();
      } }),
      h('button', { type: 'button', class: 'discreto comida-quitar', texto: 'Quitar de la despensa', onclick: function () {
        mover(id, 'fuera', 0);
        App.cerrarSelector();
        App.repintar();
      } }),
    ]);
  }

  // Cuánto trae cada envase de un producto (g o ml). Si cambia, se guarda en la lista común con el mismo id: así
  // un básico (que no tiene envase) también lo recuerda, y lo que se coma se resta en la proporción buena.
  function campoEnvase(a) {
    return h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: a.envase || '', placeholder: a.porcion ? String(a.porcion) : '',
      'aria-label': 'Cada envase trae (g o ml)' });
  }
  function guardarEnvase(a, id, input) {
    var v = App.numero(input.value);
    if (!(v > 0) || Number(a.envase) === v) return;
    guardarEnAlimentos(id, a, { envase: v });
  }
  // Cambia unos campos de un alimento de la lista común (un básico entra en ella con su mismo id).
  function guardarEnAlimentos(id, a, cambios) {
    var base = alimentoDe(id) || a;
    var copia = {};
    ['nombre', 'marca', 'codigo', 'kcal', 'proteina', 'hidratos', 'grasa', 'cafeina', 'porcion', 'envase', 'unidad', 'fuente'].forEach(function (k) { if (base[k] != null) copia[k] = base[k]; });
    Almacen.guardarFilaComida('alimentos', Object.assign(copia, cambios, { id: id }));
  }

  // − N + para elegir cuántos (sin teclado). grande: el de la hoja de añadir.
  function contador(valor, alCambiar, grande, minimo) {
    var cifra = h('span', { class: 'casa-cifra', texto: enEnvases(valor) });
    var tope = minimo == null ? 1 : minimo;
    function paso(d) {
      var nuevo = Math.max(tope, valor + d);
      if (nuevo === valor) return;
      var cambio = nuevo - valor;
      valor = nuevo;
      cifra.textContent = enEnvases(valor);
      alCambiar(valor, cambio);
    }
    return h('div', { class: 'casa-contador' + (grande ? ' grande' : '') }, [
      h('button', { type: 'button', class: 'discreto', 'aria-label': 'Uno menos', texto: '−', onclick: function () { paso(-1); } }),
      cifra,
      h('button', { type: 'button', class: 'discreto', 'aria-label': 'Uno más', texto: '+', onclick: function () { paso(1); } }),
    ]);
  }

  // Un solo botón para añadir (él, 2026-11-08: "tiene que ser muy fácil"): eliges el producto, cuántos con − +, y si
  // ya lo tienes en casa o hay que comprarlo. El tamaño del envase no se pregunta aquí (está en la ficha).
  function anadir() {
    elegirAlimento('Añadir', function (a) {
      var id = productoDe(a) || a.id;
      var e = estado()[id];
      var n = 1;
      function listo(texto) {
        App.cerrarSelector();
        App.avisar(texto);
        App.repintar();
      }
      App.abrirSelector(a.nombre, [
        e && e.hay > 0 ? h('p', { class: 'detalle casa-ahora', texto: 'Ahora en casa: ' + enEnvases(e.hay) }) : null,
        contador(1, function (v) { n = v; }, true),
        h('div', { class: 'casa-destino' }, [
          h('button', { type: 'button', class: 'principal', texto: '🏠 Ya lo tengo en casa', onclick: function () {
            mover(id, 'compra', n);
            listo(a.nombre + ': ' + n + ' en casa');
          } }),
          h('button', { type: 'button', class: 'discreto', texto: '🛒 Apuntar en la lista', onclick: function () {
            mover(id, 'pedir', n + ((e && e.pedido) || 0));
            listo(a.nombre + ': a la lista');
          } }),
        ]),
      ]);
    });
  }

  // Al volver de la compra: escanear uno tras otro, cada uno +1. Sin el lector, el buscador.
  function meterEscaneando() {
    function uno(a) {
      var id = productoDe(a) || a.id;
      mover(id, 'compra', 1);
      var e = estado()[id];
      App.abrirSelector(a.nombre + ' +1', [
        h('p', { class: 'comida-previa', texto: 'Ahora hay ' + enEnvases(e ? e.hay : 1) }),
        h('div', { class: 'comida-crear' }, [
          h('button', { type: 'button', class: 'discreto', texto: '+1 más', onclick: function () { uno(a); } }),
          hayEscaner() ? h('button', { type: 'button', class: 'principal', texto: '📷 Siguiente', onclick: escanearUno }) : null,
        ]),
        h('button', { type: 'button', class: 'discreto', texto: 'Listo', onclick: function () { App.cerrarSelector(); App.repintar(); } }),
      ]);
    }
    function escanearUno() {
      var id = 'e' + Date.now();
      esperandoEscaneo[id] = function (r) {
        if (r.estado === 'ok' && r.codigo) porCodigo(String(r.codigo), uno);
        else if (r.estado === 'error') App.avisar('No se pudo abrir el lector', true);
        else App.repintar();
      };
      window.AndroidPasos.escanear(id);
    }
    if (hayEscaner()) escanearUno();
    else teclearCodigo(uno);
  }

  // Despensa y compra juntas (él, 2026-11-07: "cuando se agota o queda poco se tiene que mandar a la compra"):
  // arriba lo que hay que comprar, debajo lo que hay en casa.
  // Rehecha el 2026-11-08 (él: "tiene que ser muy fácil"): dos botones arriba (📷 Meter compra, + Añadir), la lista
  // con casillas como una lista de papel y lo de casa con − N +. Tocar el nombre abre la ficha (mínimo, envase).
  function pintarCasa(cont) {
    var est = estado();
    var ids = Object.keys(est).filter(function (id) { return est[id].hay > 0; })
      .sort(function (a, b) { return nombreProducto(a).localeCompare(nombreProducto(b), 'es'); });
    var porComprar = Comida.lista(est);
    // Con quién compartes la casa (o la invitación a hacerlo).
    var hogar = typeof Equipos !== 'undefined' ? Equipos.hogar() : null;
    cont.appendChild(h('button', { type: 'button', class: 'tarjeta casa-hogar', onclick: Juntos.hogar }, hogar ? [
      h('span', { texto: '🏠 ' + hogar.nombre }),
      h('span', { class: 'casa-hogar-quien', texto: (hogar.miembros || []).length === 1 ? 'Solo tú · Invitar ›'
        : (hogar.miembros || []).map(function (u) { return Equipos.nombreDe(u); }).join(', ') + ' ›' }),
    ] : [
      h('span', { texto: 'Compartir la casa' }),
      h('span', { class: 'casa-hogar-quien', texto: 'Despensa y lista para todos ›' }),
    ]));
    cont.appendChild(h('div', { class: 'comida-crear comida-acciones' }, [
      h('button', { type: 'button', class: 'principal', texto: '📷 Meter compra', onclick: meterEscaneando }),
      h('button', { type: 'button', class: 'discreto', texto: '+ Añadir', onclick: anadir }),
    ]));
    if (!ids.length && !porComprar.length) {
      cont.appendChild(h('div', { class: 'tarjeta casa-vacia' }, [
        h('h3', { texto: 'Así funciona' }),
        h('ol', {}, [
          h('li', { texto: 'Al volver del súper, 📷 Meter compra y escaneas cada cosa.' }),
          h('li', { texto: 'Lo que apuntas que comes se resta solo.' }),
          h('li', { texto: 'Lo que se acaba aparece en la lista de la compra.' }),
          h('li', { texto: 'Toca un producto para decir cuántos quieres tener siempre.' }),
        ]),
      ]));
      return;
    }
    pintarCompra(cont, porComprar);
    pintarEnCasa(cont, est, ids);
  }

  // Lo tocado en la lista mientras se compra (en el carro, aún sin meter en casa): solo en este móvil.
  function carro() {
    try { return JSON.parse(localStorage.getItem('gymapp.carro') || '[]'); } catch (e) { return []; }
  }
  function guardarCarro(ids) {
    try { localStorage.setItem('gymapp.carro', JSON.stringify(ids)); } catch (e) { /* sin almacenamiento: no se recuerda */ }
  }

  function motivoCompra(x) {
    var cuantos = x.falta > 1 ? '×' + x.falta + ' · ' : '';
    if (x.motivo === 'minimo') return cuantos + 'tienes ' + enEnvases(x.hay) + ' de ' + x.minimo;
    if (x.hay > 0) return cuantos + (x.motivo === 'poco' ? 'queda poco' : 'quedan ' + enEnvases(x.hay));
    return cuantos + (x.motivo === 'pedido' ? 'apuntado' : 'no queda');
  }

  // La lista de la compra: tocar marca en el carro (y otra vez lo desmarca); al acabar, "Meter N en casa".
  function pintarCompra(cont, lista) {
    var enCarro = carro().filter(function (id) { return lista.some(function (x) { return x.producto === id; }); });
    cont.appendChild(h('h3', { class: 'comida-titulo-casa', texto: '🛒 Por comprar' + (lista.length ? ' (' + lista.length + ')' : '') }));
    if (!lista.length) {
      cont.appendChild(h('p', { class: 'vacio', texto: 'No falta nada.' }));
      return;
    }
    var orden = lista.filter(function (x) { return enCarro.indexOf(x.producto) < 0; })
      .concat(lista.filter(function (x) { return enCarro.indexOf(x.producto) >= 0; }));
    cont.appendChild(h('div', { class: 'tarjeta casa-lista' }, [
      h('div', {}, orden.map(function (x) {
        var cogido = enCarro.indexOf(x.producto) >= 0;
        return h('div', { class: 'casa-fila' }, [
          h('button', { type: 'button', class: 'casa-item' + (cogido ? ' cogido' : ''), 'aria-pressed': cogido ? 'true' : 'false', onclick: function () {
            guardarCarro(cogido ? enCarro.filter(function (id) { return id !== x.producto; }) : enCarro.concat([x.producto]));
            App.repintar();
          } }, [
            h('span', { class: 'casa-check', texto: cogido ? '✓' : '' }),
            h('span', { class: 'casa-nombre', texto: nombreProducto(x.producto) }),
            h('span', { class: 'tipo', texto: motivoCompra(x) }),
          ]),
          cogido ? h('span') : h('button', { type: 'button', class: 'casa-quitar', 'aria-label': 'Esta vez no', texto: '✕', onclick: function () {
            // Fuera de la lista hasta que se vuelva a comprar (o se cambie el mínimo).
            mover(x.producto, 'pedir', 0);
            App.repintar();
          } }),
        ]);
      })),
      enCarro.length ? h('button', { type: 'button', class: 'principal casa-meter', texto: '🏠 Meter ' + enCarro.length + ' en casa', onclick: function () {
        lista.forEach(function (x) { if (enCarro.indexOf(x.producto) >= 0) mover(x.producto, 'compra', x.falta); });
        guardarCarro([]);
        App.avisar(enCarro.length === 1 ? 'Metido en casa' : enCarro.length + ' cosas metidas en casa');
        App.repintar();
      } }) : null,
    ]));
  }

  // Lo que hay en casa, con − N + (si llega a 0, pasa a la lista sola).
  function pintarEnCasa(cont, est, ids) {
    if (!ids.length) return;
    cont.appendChild(h('h3', { class: 'comida-titulo-casa', texto: '🏠 En casa (' + ids.length + ')' }));
    cont.appendChild(h('div', { class: 'tarjeta casa-lista' }, ids.map(function (id) {
      var e = est[id];
      var poco = e.minimo > 0 ? e.hay < e.minimo : e.hay < 1;
      return h('div', { class: 'casa-fila' + (poco ? ' casa-poco' : '') }, [
        h('button', { type: 'button', class: 'casa-item', onclick: function () { fichaProducto(id); } }, [
          h('span', { class: 'casa-nombre', texto: nombreProducto(id) }),
          e.minimo > 0 ? h('span', { class: 'tipo', texto: enEnvases(e.hay) + ' de ' + e.minimo })
            : poco ? h('span', { class: 'tipo', texto: 'queda poco' }) : null,
        ]),
        contador(e.hay, function (v, cambio) {
          mover(id, cambio > 0 ? 'compra' : 'comido', Math.abs(cambio));
          App.repintar();
        }, false, 0),
      ]);
    })));
  }

  // Los platos de los dos, para verlos, cambiarlos o borrarlos (él, 2026-11-07).
  function pintarPlatos(cont) {
    var lista = platos();
    cont.appendChild(h('div', { class: 'comida-crear comida-acciones' }, [
      h('button', { type: 'button', class: 'principal', texto: '+ Nuevo plato', onclick: function () { editarPlato({}); } }),
    ]));
    if (!lista.length) {
      cont.appendChild(h('p', { class: 'vacio', texto: 'Aún no hay platos. Crea uno aquí o, en Hoy, guarda una comida con "Guardar como plato".' }));
      return;
    }
    // Buscador (él, 2026-11-07): por el nombre o por lo que lleva ("pollo"), sin tildes; filtra al escribir y se
    // recuerda al repintar (al volver de cambiar un plato).
    var caja = h('input', { type: 'search', class: 'comida-platos-buscar', placeholder: 'Buscar plato o ingrediente', 'aria-label': 'Buscar plato', value: buscaPlatos });
    var nada = h('p', { class: 'vacio', texto: 'Ningún plato lleva eso.', hidden: true });
    var filas = lista.map(function (p) {
      var t = totalPlato(p);
      var r = Number(p.raciones) || 1;
      var racion = { kcal: t.kcal / r, proteina: t.proteina / r, hidratos: t.hidratos / r, grasa: t.grasa / r };
      var ing = ingredientesDe(p);
      var fila = h('button', { type: 'button', class: 'comida-plato-fila', onclick: function () { editarPlato(p); } }, [
        h('span', { texto: '🍽 ' + p.nombre }),
        h('span', { class: 'tipo', texto: linea(racion) + ' por ración' }),
        h('span', { class: 'detalle', texto: ing.length + (ing.length === 1 ? ' ingrediente' : ' ingredientes') +
          (r !== 1 ? ' · salen ' + formato(r) + ' raciones' : '') + ' ›' }),
      ]);
      return { fila: fila, texto: Grupos.normalizar(p.nombre + ' ' + ing.map(function (i) { return i.nombre; }).join(' ')) };
    });
    function filtrar() {
      buscaPlatos = caja.value;
      var palabras = Grupos.normalizar(caja.value).split(/\s+/).filter(Boolean);
      var hay = 0;
      filas.forEach(function (f) {
        var si = palabras.every(function (w) { return f.texto.indexOf(w) >= 0; });
        f.fila.hidden = !si;
        if (si) hay++;
      });
      nada.hidden = hay > 0;
    }
    caja.addEventListener('input', filtrar);
    cont.appendChild(h('div', { class: 'tarjeta' }, [
      caja,
      h('div', { class: 'lista-historial comida-platos' }, filas.map(function (f) { return f.fila; })),
      nada,
    ]));
    filtrar();
  }
  var buscaPlatos = '';

  var apartado = 'hoy';     // "hoy", "platos" o "casa" (despensa y lista de la compra)
  var APARTADOS = [['hoy', 'Hoy'], ['platos', 'Platos'], ['casa', 'Casa']];

  App.vistas.comida = function (cont) {
    cont.appendChild(h('div', { class: 'segmentos' }, APARTADOS.map(function (a) {
      var n = a[0] === 'casa' ? Comida.lista(estado()).length : 0;
      return h('button', { type: 'button', class: apartado === a[0] ? 'activa' : '', texto: a[1] + (n ? ' 🛒' + n : ''), onclick: function () {
        apartado = a[0];
        App.repintar();
      } });
    })));
    if (apartado === 'platos') return pintarPlatos(cont);
    if (apartado === 'casa') return pintarCasa(cont);
    var fecha = diaVisto();
    var apuntes = apuntesDe(fecha);
    var totales = Comida.sumar(apuntes);
    var esHoy = fecha === hoy();
    cont.appendChild(h('div', { class: 'comida-dia' }, [
      h('button', { type: 'button', class: 'discreto', 'aria-label': 'Día anterior', texto: '‹', onclick: function () {
        dia = Calendario.sumarDias(fecha, -1);
        App.repintar();
      } }),
      h('strong', { texto: esHoy ? 'Hoy' : fecha === Calendario.sumarDias(hoy(), -1) ? 'Ayer' : Grafica.fechaCorta(fecha) }),
      h('button', { type: 'button', class: 'discreto', 'aria-label': 'Día siguiente', texto: '›', disabled: esHoy, onclick: function () {
        var sig = Calendario.sumarDias(fecha, 1);
        dia = sig >= hoy() ? null : sig;
        App.repintar();
      } }),
    ]));
    cont.appendChild(tarjetaResumen(fecha, totales));
    cont.appendChild(tarjetaAgua(fecha));
    Comida.COMIDAS.forEach(function (c) {
      var t = tarjetaComida(c, apuntes);
      if (t) cont.appendChild(t);
    });
    // Los opcionales que aún no tienen nada, con un botón pequeño para añadirlos.
    var sinNada = Comida.COMIDAS.filter(function (c) { return c.opcional && !apuntes.some(function (a) { return a.comida === c.id; }); });
    if (sinNada.length) {
      cont.appendChild(h('div', { class: 'comida-opcionales' }, sinNada.map(function (c) {
        return h('button', { type: 'button', class: 'discreto', texto: '+ ' + c.nombre, onclick: function () { buscar(c.id); } });
      })));
    }
  };

  // ---- El peso (él, 2026-11-07: "cada sábado por la mañana, pesarse en ayunas") ----
  // Una fila por día en la tabla "peso" (id peso-<fecha>: apuntarlo otra vez ese día lo cambia). El último peso pasa
  // también a Tus datos, que es el que usan las cuentas. Los sábados se marcan en el calendario de la app y hay un
  // evento "⚖️ Pesarse en ayunas" en Google Calendar (sábados 9:00) con el enlace #peso.
  var INICIO_PESO = '2026-11-14';
  function esDiaDePeso(fecha) {
    return fecha >= INICIO_PESO && new Date(fecha + 'T12:00').getDay() === 6;
  }
  function pesos() {
    return Almacen.tablaComida('pesos').filter(function (p) { return p.fecha && p.kg > 0; })
      .sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
  }
  function pesoDe(fecha) {
    return pesos().filter(function (p) { return p.fecha === fecha; })[0] || null;
  }

  // Peso, grasa, agua y músculo (él, 2026-11-07: "guardar peso, hidratación, kilos de músculo y % de grasa del
  // pesaje"). Con la báscula los calcula la app (impedancia); a mano se pueden copiar de Zepp Life.
  function apuntarPeso(fecha) {
    fecha = fecha || hoy();
    var lista = pesos();
    var ese = pesoDe(fecha);
    var ultimo = lista[lista.length - 1];
    var cuerpo = Almacen.cuerpo() || {};
    var num = { type: 'number', inputmode: 'decimal', min: '0', step: '0.1' };
    var kg = h('input', Object.assign({}, num, { 'aria-label': 'Kilos', value: ese ? ese.kg : ultimo ? ultimo.kg : cuerpo.peso || '' }));
    var c = ese ? composicionDe(ese) : null;
    var grasa = h('input', Object.assign({}, num, { 'aria-label': 'Grasa (%)', value: c ? c.grasa : '' }));
    var agua = h('input', Object.assign({}, num, { 'aria-label': 'Agua (%)', value: c ? c.agua : '' }));
    var musculo = h('input', Object.assign({}, num, { 'aria-label': 'Músculo (kg)', value: c ? c.musculo : '' }));
    var antes = lista.filter(function (p) { return p.fecha < fecha; }).pop();
    var cambio = h('p', { class: 'detalle' });
    function diferencia(v, a, unidad) {
      if (!(v > 0) || !(a > 0)) return '';
      var d = Math.round((v - a) * 10) / 10;
      return d === 0 ? 'igual' : (d > 0 ? '+' : '−') + formato(Math.abs(d)) + unidad;
    }
    function refrescar() {
      if (!antes) { cambio.textContent = ''; return; }
      var ca = composicionDe(antes) || {};
      var partes = ['Peso ' + diferencia(App.numero(kg.value), Number(antes.kg), ' kg'),
        ca.grasa ? 'grasa ' + diferencia(App.numero(grasa.value), ca.grasa, ' %') : '',
        ca.musculo ? 'músculo ' + diferencia(App.numero(musculo.value), ca.musculo, ' kg') : ''].filter(function (t) { return !/ $/.test(t) && t; });
      cambio.textContent = 'Desde el ' + Grafica.fechaCorta(antes.fecha) + ': ' + partes.join(' · ');
    }
    [kg, grasa, agua, musculo].forEach(function (i) { i.addEventListener('input', refrescar); });
    refrescar();
    var campo = function (t, i) { return h('label', { class: 'campo' }, [h('span', { texto: t }), i]); };
    App.abrirSelector('⚖️ Peso · ' + (fecha === hoy() ? 'hoy' : Grafica.fechaCorta(fecha)), [
      h('p', { class: 'detalle', texto: ese && ese.origen === 'báscula' ? 'Lo apuntó la báscula.'
        : 'En ayunas, después del baño y sin ropa: así cada semana se compara con la anterior.' }),
      campo('Kilos', kg),
      h('div', { class: 'comida-macros-campos peso-composicion' }, [campo('Grasa (%)', grasa), campo('Agua (%)', agua), campo('Músculo (kg)', musculo)]),
      ese && ese.origen === 'báscula' ? null : h('p', { class: 'detalle', texto: 'Grasa, agua y músculo: si te pesas en la Xiaomi, cópialos de Zepp Life (o deja que la báscula los apunte sola).' }),
      cambio,
      h('button', { type: 'button', class: 'principal', texto: 'Guardar', onclick: function () {
        var v = App.numero(kg.value);
        if (!(v > 20 && v < 300)) { App.avisar('Pon los kilos', true); return; }
        v = Math.round(v * 10) / 10;
        var r1 = function (i) { var x = App.numero(i.value); return x > 0 ? Math.round(x * 10) / 10 : ''; };
        var mismo = ese && Number(ese.kg) === v;
        Almacen.guardarFilaComida('pesos', { id: 'peso-' + fecha, fecha: fecha, kg: v, grasa: r1(grasa), agua: r1(agua), musculo: r1(musculo),
          impedancia: mismo ? ese.impedancia || '' : '', origen: mismo ? ese.origen || 'a mano' : 'a mano' });
        // El más reciente es el de Tus datos.
        if (!lista.some(function (p) { return p.fecha > fecha; })) Almacen.guardarCuerpo(Object.assign({}, Almacen.cuerpo() || {}, { peso: v }));
        App.cerrarSelector();
        App.avisar('Peso guardado: ' + formato(v) + ' kg');
        App.repintar();
      } }),
      ese ? h('button', { type: 'button', class: 'discreto comida-quitar', texto: 'Quitar', onclick: function () {
        Almacen.borrarFilaComida('pesos', ese.id);
        App.cerrarSelector();
        App.repintar();
      } }) : null,
    ]);
    setTimeout(function () { kg.focus(); kg.select(); }, 50);
  }

  // Grasa, agua y músculo de un pesaje: lo guardado o, si solo trae la impedancia, calculado (Comida.composicionXiaomi).
  function composicionDe(p) {
    if (!p) return null;
    if (p.grasa > 0 || p.musculo > 0 || p.agua > 0) return { grasa: Number(p.grasa) || null, agua: Number(p.agua) || null, musculo: Number(p.musculo) || null };
    return p.impedancia > 0 ? Comida.composicionXiaomi(Almacen.cuerpo(), p.fecha, Number(p.kg), Number(p.impedancia)) : null;
  }
  App.apuntarPeso = apuntarPeso;
  // Para Historial → Salud: el plan, poder cambiarlo y la composición de cada pesaje.
  App.planComida = planComida;
  App.elegirPlanComida = elegirPlan;
  App.composicionDe = composicionDe;
  App.pesoDe = pesoDe;
  App.esDiaDePeso = esDiaDePeso;

  // La comida de ahora: desayuno hasta las 11, almuerzo hasta la 1, comida hasta las 5, merienda hasta las 8, y cena.
  function comidaPorHora() {
    var hora = new Date().getHours();
    return hora < 11 ? 'desayuno' : hora < 13 ? 'almuerzo' : hora < 17 ? 'comida' : hora < 20 ? 'merienda' : 'cena';
  }

  // "#compra" (la pegatina NFC de la nevera, o un enlace) abre Comida → Compra.
  function abrirPorEnlace() {
    // También los avisos del móvil: #comida (el del agua) y #inicio (el de moverse). "#peso", el evento del sábado.
    // Los atajos del icono (APK 2.1): #entreno (empezar entreno) y #apuntar ("+ Añadir" de la comida que toca por la hora).
    var m = String(location.hash).match(/^#(compra|despensa|casa|platos|comida|inicio|peso|entreno|apuntar)$/);
    if (!m) return;
    history.replaceState(null, '', location.pathname);
    if (m[1] === 'inicio') return App.mostrar('inicio');
    if (m[1] === 'entreno') return App.abrirEntreno();
    if (m[1] === 'apuntar') {
      apartado = 'hoy';
      dia = null;
      App.mostrar('comida');
      return setTimeout(function () { buscar(comidaPorHora()); }, 400);
    }
    // El peso ya no está en Comida (él, 2026-11-08: "es el peso de la persona"): #peso abre Historial → Salud y su hoja.
    if (m[1] === 'peso') {
      App.abrirSalud();
      return setTimeout(function () { apuntarPeso(hoy()); }, 400);
    }
    // La pegatina de la nevera sigue siendo ares://compra: despensa y compra van juntas en "Casa".
    apartado = m[1] === 'comida' ? 'hoy' : m[1] === 'platos' ? 'platos' : 'casa';
    App.mostrar('comida');
  }
  window.addEventListener('hashchange', abrirPorEnlace);
  window.addEventListener('load', function () { setTimeout(abrirPorEnlace, 0); });
})();
