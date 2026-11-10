// Grupos de Social y el hogar de Casa (plan del 2026-11-08): crear, invitar con un enlace, unirse, salir y echar.
// Todo en Firestore (Nube). Un grupo es { tipo: 'gym' | 'hogar', nombre, dueno, miembros: [uid] }; uno puede estar en
// varios grupos de gym y en un solo hogar. Aquí no hay pantallas: las ponen Ajustes, Social y Casa.
var Equipos = (function () {
  var CLAVE = 'gymapp.equipos';   // { grupos: [...], perfiles: { uid: { nombre, foto } }, leido }
  var DIAS_INVITACION = 7;

  function leerLocal() {
    try { return JSON.parse(localStorage.getItem(CLAVE) || 'null') || { grupos: [], perfiles: {} }; } catch (e) { return { grupos: [], perfiles: {} }; }
  }
  function escribirLocal(d) {
    try { localStorage.setItem(CLAVE, JSON.stringify(d)); } catch (e) { /* lleno o bloqueado: se vuelve a pedir */ }
    avisar();
  }

  var oyentes = [];
  function alCambiar(f) { oyentes.push(f); }
  function avisar() { oyentes.forEach(function (f) { try { f(); } catch (e) { /* una pantalla rota no frena las demás */ } }); }

  function grupos() { return leerLocal().grupos || []; }
  function deGym() { return grupos().filter(function (g) { return g.tipo === 'gym'; }); }
  function hogar() { return grupos().filter(function (g) { return g.tipo === 'hogar'; })[0] || null; }
  function porId(gid) { return grupos().filter(function (g) { return g._id === gid; })[0] || null; }
  function perfil(uid) { return (leerLocal().perfiles || {})[uid] || null; }
  function soyDueno(g) { return g && g.dueno === Nube.uid(); }

  // Tu nombre y tu foto en la nube, para que los vean los de tus grupos. Solo si cambian.
  function subirPerfil() {
    var c = Almacen.config();
    if (!c) return Promise.resolve();
    var datos = { nombre: String(c.nombre || 'Yo').slice(0, 40), foto: Almacen.foto(c.persona) || '' };
    var huella = datos.nombre + '|' + datos.foto.length + '|' + datos.foto.slice(-40);
    var local = leerLocal();
    if (local.perfilSubido === huella && Nube.uid()) return Promise.resolve();
    return Nube.entrar().then(function (uid) {
      return Nube.escribir('usuarios/' + uid, Object.assign({ actualizado: Date.now() }, datos));
    }).then(function () {
      var l = leerLocal();
      l.perfilSubido = huella;
      escribirLocal(l);
    });
  }

  // Tus grupos y los perfiles de sus miembros. Se guarda en el móvil para verlo sin conexión.
  function actualizar() {
    return Nube.entrar().then(function (uid) {
      return Nube.consultar('', 'grupos', [['miembros', 'array-contains', uid]]);
    }).then(function (lista) {
      var l = leerLocal();
      var faltan = {};
      lista.forEach(function (g) { (g.miembros || []).forEach(function (u) { faltan[u] = true; }); });
      return Promise.all(Object.keys(faltan).map(function (u) {
        return Nube.leer('usuarios/' + u).then(function (p) { return [u, p]; }, function () { return [u, (l.perfiles || {})[u] || null]; });
      })).then(function (pares) {
        var perfiles = {};
        pares.forEach(function (p) { if (p[1]) perfiles[p[0]] = { nombre: p[1].nombre, foto: p[1].foto || '' }; });
        escribirLocal(Object.assign(l, { grupos: lista, perfiles: perfiles, leido: Date.now() }));
        return lista;
      });
    });
  }

  function crear(tipo, nombre) {
    if (tipo === 'hogar' && hogar()) return Promise.reject(new Error('Ya estás en un hogar: sal de él antes'));
    var gid = Nube.idNuevo(20);
    return Nube.entrar().then(function (uid) {
      return Nube.escribir('grupos/' + gid, { tipo: tipo, nombre: String(nombre).trim().slice(0, 40), dueno: uid, miembros: [uid], creado: Date.now() });
    }).then(function () { return subirPerfil(); }).then(actualizar).then(function () { return porId(gid); });
  }

  // El enlace para invitar: dura 7 días y vale para varios.
  function invitar(gid) {
    var g = porId(gid);
    if (!g) return Promise.reject(new Error('No estás en ese grupo'));
    var codigo = Nube.idNuevo(12);
    // creada, con la hora de Google: a un echado solo le vale una invitación del dueño de después de echarle.
    return Nube.juntos([{ ruta: 'invitaciones/' + codigo, servidor: ['creada'], datos: {
      grupo: gid, nombre: g.nombre, tipo: g.tipo, de: Nube.uid(), deNombre: (perfil(Nube.uid()) || {}).nombre || (Almacen.config() || {}).nombre || '',
      caduca: Date.now() + DIAS_INVITACION * 86400000,
    } }]).then(function () { return enlace(codigo); });
  }

  function enlace(codigo) {
    return 'https://gaizka-pato.github.io/app-gym/#unirse=' + codigo;
  }

  function verInvitacion(codigo) {
    return Nube.entrar().then(function () { return Nube.leer('invitaciones/' + codigo); }).then(function (inv) {
      if (!inv) throw new Error('Esa invitación no existe');
      if (inv.caduca < Date.now()) throw new Error('Esa invitación ha caducado: pide otra');
      return inv;
    });
  }

  function unirse(codigo) {
    return verInvitacion(codigo).then(function (inv) {
      if (porId(inv.grupo)) return porId(inv.grupo);
      if (inv.tipo === 'hogar' && hogar()) throw new Error('Ya estás en un hogar: sal de él antes');
      return subirPerfil().then(function () {
        return Nube.juntos([{ ruta: 'grupos/' + inv.grupo, datos: { invitacion: codigo }, campos: ['invitacion'], anadir: { miembros: [Nube.uid()] }, existe: true }]);
      }).then(actualizar).then(function () { return porId(inv.grupo); });
    });
  }

  // Salir (tú) o echar a alguien (el dueño). Si sale el dueño y queda gente, el mando pasa al primero que quede;
  // si no queda nadie, el grupo se borra.
  function quitar(gid, uid) {
    var g = porId(gid);
    if (!g) return Promise.resolve();
    var yo = Nube.uid();
    var quedan = (g.miembros || []).filter(function (u) { return u !== uid; });
    var tarjeta = { ruta: 'grupos/' + gid + '/tarjetas/' + uid, borrar: true };
    var paso;
    if (uid === yo && !quedan.length) paso = Nube.juntos([tarjeta, { ruta: 'grupos/' + gid, borrar: true }]);
    else if (uid === yo && g.dueno === yo) {
      paso = Nube.juntos([tarjeta, { ruta: 'grupos/' + gid, datos: { dueno: quedan[0], miembros: quedan }, campos: ['dueno', 'miembros'] }]);
    } else if (uid === yo) paso = Nube.juntos([tarjeta, { ruta: 'grupos/' + gid, quitar: { miembros: [yo] }, existe: true }]);
    // Echar (el dueño): fuera de la lista, se apunta cuándo (las invitaciones de antes ya no le valen) y su tarjeta fuera.
    else paso = Nube.juntos([tarjeta, { ruta: 'grupos/' + gid, quitar: { miembros: [uid] }, servidor: ['echados.`' + uid + '`'], existe: true }]);
    return paso.then(actualizar);
  }

  function salir(gid) { return quitar(gid, Nube.uid()); }

  function renombrar(gid, nombre) {
    return Nube.escribir('grupos/' + gid, { nombre: String(nombre).trim().slice(0, 40) }, ['nombre']).then(actualizar);
  }

  // Borrar tu cuenta: tus likes y comentarios, tus justificantes y tu tarjeta de cada grupo; sales de todos (si eras
  // el único, el grupo se borra) y se borra tu perfil y la cuenta. Lo de tu móvil se queda.
  function borrarCuenta() {
    var yo = Nube.uid();
    if (!yo) return Promise.resolve();
    return actualizar().then(function (lista) {
      return lista.reduce(function (cadena, g) {
        return cadena.then(function () {
          return Promise.all([
            Nube.consultar('grupos/' + g._id, 'social', [['de', '==', yo]]),
            Nube.consultar('grupos/' + g._id, 'faltas', [['de', '==', yo]]),
          ]).then(function (r) {
            var cambios = r[0].map(function (x) { return { ruta: x._ruta, borrar: true }; })
              .concat(r[1].map(function (x) { return { ruta: x._ruta, borrar: true }; }));
            return cambios.length ? Nube.juntos(cambios) : null;
          }).then(function () { return quitar(g._id, yo); });
        });
      }, Promise.resolve());
    }).then(function () {
      return Nube.borrar('usuarios/' + yo);
    }).then(Nube.borrarCuenta).then(function () {
      escribirLocal({ grupos: [], perfiles: {} });
    });
  }

  function nombreDe(uid) {
    if (uid === Nube.uid()) return 'Tú';
    return (perfil(uid) || {}).nombre || 'Alguien';
  }

  return {
    alCambiar: alCambiar,
    grupos: grupos,
    deGym: deGym,
    hogar: hogar,
    porId: porId,
    perfil: perfil,
    nombreDe: nombreDe,
    soyDueno: soyDueno,
    subirPerfil: subirPerfil,
    actualizar: actualizar,
    crear: crear,
    invitar: invitar,
    enlace: enlace,
    verInvitacion: verInvitacion,
    unirse: unirse,
    quitar: quitar,
    salir: salir,
    renombrar: renombrar,
    borrarCuenta: borrarCuenta,
  };
})();
