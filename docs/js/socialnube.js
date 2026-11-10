// Social de un grupo (Firestore): lo mismo que Social pedía a la API de los Excel (faltas, social, reaccionar,
// justificar, revisar), con la misma forma de datos, para que la pantalla sea la misma con dos o con diez.
//   grupos/<gid>/tarjetas/<uid>   la tarjeta de cada uno (Tarjeta.calcular), la publica su móvil
//   grupos/<gid>/social/<id>      likes y comentarios { de, para, sobre, tipo, texto, fecha }
//   grupos/<gid>/faltas/<uid>_<fecha>   justificantes { de, fecha, motivo, resultado, revisa }
var SocialNube = (function () {
  var CLAVE = 'gymapp.grupo.';

  function leerLocal(gid) {
    try { return JSON.parse(localStorage.getItem(CLAVE + gid) || 'null'); } catch (e) { return null; }
  }
  function escribirLocal(gid, d) {
    try { localStorage.setItem(CLAVE + gid, JSON.stringify(d)); } catch (e) { /* lleno: se queda en memoria hasta el siguiente */ }
  }

  function ahora() {
    var d = new Date();
    function dos(n) { return String(n).padStart(2, '0'); }
    return Almacen.hoyISO() + ' ' + dos(d.getHours()) + ':' + dos(d.getMinutes());
  }

  // Un id corto y estable a partir de un texto (para que el like de alguien a algo sea siempre el mismo documento).
  function huella(t) {
    var h = 5381;
    for (var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  // Tu tarjeta en ese grupo, solo si ha cambiado desde la última vez.
  function publicar(gid) {
    var t = Tarjeta.calcular();
    var texto = JSON.stringify(t);
    var l = leerLocal(gid) || {};
    if (l.publicada === texto) return Promise.resolve(false);
    return Nube.escribir('grupos/' + gid + '/tarjetas/' + Nube.uid(), Object.assign({ actualizado: Date.now() }, t)).then(function () {
      var d = leerLocal(gid) || {};
      d.publicada = texto;
      if (d.tarjetas) d.tarjetas[Nube.uid()] = t;
      escribirLocal(gid, d);
      return true;
    });
  }

  function actualizar(gid) {
    return publicar(gid).catch(function () { /* sin conexión: se publica luego */ }).then(function () {
      return Promise.all([
        Nube.consultar('grupos/' + gid, 'tarjetas', []),
        Nube.consultar('grupos/' + gid, 'social', []),
        Nube.consultar('grupos/' + gid, 'faltas', []),
        Nube.consultar('grupos/' + gid, 'rutas', []).catch(function () { return []; }),
      ]);
    }).then(function (r) {
      var d = leerLocal(gid) || {};
      d.tarjetas = {};
      r[0].forEach(function (t) { d.tarjetas[t._id] = t; });
      d.social = r[1].map(function (x) { return Object.assign({}, x, { id: x._id }); });
      d.faltas = r[2];
      d.rutas = (r[3] || []).map(function (x) { return Object.assign({}, x, { id: x._id }); });
      d.actualizado = Date.now();
      escribirLocal(gid, d);
      return d;
    });
  }

  function miembros(gid) {
    var g = Equipos.porId(gid);
    return g ? g.miembros || [] : [];
  }

  function nombre(gid, uid) {
    var d = leerLocal(gid) || {};
    var t = (d.tarjetas || {})[uid];
    return (Equipos.perfil(uid) || {}).nombre || (t && t.nombre) || 'Alguien';
  }

  // Sus días con lo de los justificantes encima (como la hoja "Sesiones" con su Resultado y Motivo).
  function diasCon(gid, uid, dias) {
    var d = leerLocal(gid) || {};
    var just = {};
    (d.faltas || []).forEach(function (f) { if (f.de === uid) just[f.fecha] = f; });
    return (dias || []).map(function (x) {
      var j = just[x.fecha];
      // Solo sobre una falta (o un día que aún puede serlo): un día hecho se queda hecho.
      if (!j || x.resultado === 'Hecho' || x.resultado === 'Recuperado') return x;
      return Object.assign({}, x, { resultado: j.resultado, motivo: j.motivo || '' });
    });
  }

  // { personas: { uid: { nombre, dias } } } — como Almacen.faltas(). Las faltas cuentan desde que se creó el grupo.
  function faltas(gid) {
    var d = leerLocal(gid);
    if (!d || !d.tarjetas) return null;
    var g = Equipos.porId(gid) || {};
    var inicio = g.creado ? Almacen.hoyISO(new Date(g.creado)) : '0000';
    var personas = {};
    miembros(gid).forEach(function (u) {
      var t = d.tarjetas[u];
      personas[u] = { nombre: nombre(gid, u), privado: !!(t && (t.oculto || []).indexOf('dias') >= 0), dias: diasCon(gid, u, t ? t.dias : []).filter(function (x) { return x.fecha >= inicio; }).slice().reverse() };
    });
    return { personas: personas, actualizado: d.actualizado };
  }

  // Lo de una persona, como Almacen.social(de).
  function social(gid, uid) {
    var d = leerLocal(gid);
    if (!d || !d.tarjetas) return null;
    var t = d.tarjetas[uid];
    if (!t) return { de: uid, nombre: nombre(gid, uid), hoy: Almacen.hoyISO(), dias: [], pasos: [], reacciones: [], actualizado: d.actualizado, sinTarjeta: true };
    return Object.assign({}, t, {
      de: uid, nombre: nombre(gid, uid), dias: diasCon(gid, uid, t.dias),
      reacciones: (d.social || []).filter(function (r) { return r.para === uid; }),
      rutas: (d.rutas || []).filter(function (r) { return r.de === uid; })
        .sort(function (a, b) { return (b.fecha + b.hora) < (a.fecha + a.hora) ? -1 : 1; }),
      actualizado: d.actualizado,
    });
  }

  function cambiarLocal(gid, cambio) {
    var d = leerLocal(gid) || {};
    cambio(d);
    escribirLocal(gid, d);
  }

  // Like (se quita si ya estaba) o comentario.
  function reaccionar(gid, para, sobre, tipo, texto) {
    var yo = Nube.uid();
    if (tipo === 'like') {
      var id = 'l' + huella(yo + '|' + para + '|' + sobre);
      var ya = ((leerLocal(gid) || {}).social || []).some(function (r) { return r.id === id; });
      var ruta = 'grupos/' + gid + '/social/' + id;
      var fila = { de: yo, para: para, sobre: sobre, tipo: 'like', texto: '', fecha: ahora() };
      return (ya ? Nube.borrar(ruta) : Nube.escribir(ruta, fila)).then(function () {
        cambiarLocal(gid, function (d) {
          d.social = (d.social || []).filter(function (r) { return r.id !== id; });
          if (!ya) d.social.push(Object.assign({ id: id }, fila));
        });
      });
    }
    var cid = 'c' + Nube.idNuevo(16);
    var c = { de: yo, para: para, sobre: sobre, tipo: 'comentario', texto: String(texto || '').trim().slice(0, 500), fecha: ahora() };
    if (!c.texto) return Promise.reject(new Error('Escribe algo'));
    return Nube.escribir('grupos/' + gid + '/social/' + cid, c).then(function () {
      cambiarLocal(gid, function (d) { (d.social || (d.social = [])).push(Object.assign({ id: cid }, c)); });
    });
  }

  function borrarComentario(gid, id) {
    return Nube.borrar('grupos/' + gid + '/social/' + id).then(function () {
      cambiarLocal(gid, function (d) { d.social = (d.social || []).filter(function (r) { return r.id !== id; }); });
    });
  }

  function guardarFalta(gid, de, fecha, datos) {
    var id = de + '_' + fecha;
    var fila = Object.assign({ de: de, fecha: fecha }, datos);
    return Nube.escribir('grupos/' + gid + '/faltas/' + id, fila).then(function () {
      cambiarLocal(gid, function (d) {
        d.faltas = (d.faltas || []).filter(function (f) { return !(f.de === de && f.fecha === fecha); });
        d.faltas.push(fila);
      });
    });
  }

  // Tu justificante: queda pendiente hasta que alguien del grupo lo acepte o lo rechace.
  function justificar(gid, fecha, motivo) {
    return guardarFalta(gid, Nube.uid(), fecha, { motivo: String(motivo || '').trim().slice(0, 300), resultado: 'Pendiente', revisa: '' });
  }

  // Aceptar o rechazar el de otro; sin justificante, aceptar es quitarle la falta.
  function revisar(gid, de, fecha, aceptar) {
    var antes = ((leerLocal(gid) || {}).faltas || []).filter(function (f) { return f.de === de && f.fecha === fecha; })[0];
    var yo = Nube.uid();
    var motivo = antes && antes.motivo ? antes.motivo : 'Quitada por ' + nombre(gid, yo);
    return guardarFalta(gid, de, fecha, { motivo: motivo, resultado: aceptar ? 'Justificada' : 'Rechazada', revisa: yo });
  }

  // Tras apuntar una serie (o un pesaje), tu tarjeta se vuelve a publicar sola: así un récord nuevo del minititulo
  // o el día de hoy se ven enseguida (él, 2026-11-08). Espera medio minuto de calma para no subir serie a serie.
  var pendiente = null;
  if (typeof Almacen !== 'undefined' && Almacen.alCambiar) {
    Almacen.alCambiar(function () {
      if (typeof Nube === 'undefined' || !Nube.uid() || typeof Equipos === 'undefined' || !Equipos.deGym().length) return;
      clearTimeout(pendiente);
      pendiente = setTimeout(function () {
        Equipos.deGym().forEach(function (g) { publicar(g._id).catch(function () { /* sin conexión: en el siguiente refresco */ }); });
      }, 30000);
    });
  }

  return {
    actualizar: actualizar,
    publicar: publicar,
    faltas: faltas,
    social: social,
    reaccionar: reaccionar,
    borrarComentario: borrarComentario,
    justificar: justificar,
    revisar: revisar,
    nombre: nombre,
  };
})();
