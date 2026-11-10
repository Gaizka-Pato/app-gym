// Lo compartido con otros (grupos de Social y el hogar de Casa) vive en Firebase (plan del 2026-11-08): cuenta anónima
// por móvil (Authentication) y Firestore para los datos. Se habla con su API REST, sin su librería (la app sigue sin
// dependencias). La configuración de abajo es pública por diseño (no es una clave): lo que protege los datos son las
// reglas de Firestore (firestore.rules, se pegan en la consola de Firebase).
var Nube = (function () {
  var CONFIG = {
    apiKey: 'AIzaSyCMo57b__MABCKLiXaiYehLcAJBrtJ93cA',
    projectId: 'ares-a4d70',
  };
  var BASE = 'https://firestore.googleapis.com/v1/projects/' + CONFIG.projectId + '/databases/(default)/documents';
  var CLAVE = 'gymapp.nube';   // { uid, token, refresco, caduca } — la cuenta de este móvil

  function sesion() {
    try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch (e) { return null; }
  }
  function guardarSesion(s) {
    try { localStorage.setItem(CLAVE, JSON.stringify(s)); } catch (e) { /* sin almacenamiento: se pedirá otra vez */ }
  }

  function uid() {
    var s = sesion();
    return s ? s.uid : null;
  }

  function pedir(url, opciones) {
    return fetch(url, opciones).then(function (r) {
      return r.text().then(function (t) {
        var datos = null;
        try { datos = t ? JSON.parse(t) : {}; } catch (e) { datos = { error: { message: t } }; }
        if (!r.ok) {
          var e = new Error((datos && datos.error && (datos.error.message || datos.error.status)) || ('Error ' + r.status));
          e.estado = r.status;
          throw e;
        }
        return datos;
      });
    });
  }

  // Una cuenta anónima la primera vez; después se renueva el permiso (dura una hora) con el refresco guardado.
  var pidiendo = null;
  function token() {
    var s = sesion();
    if (s && s.token && s.caduca > Date.now() + 60000) return Promise.resolve(s.token);
    if (pidiendo) return pidiendo;
    var peticion = s && s.refresco
      ? pedir('https://securetoken.googleapis.com/v1/token?key=' + CONFIG.apiKey, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(s.refresco),
      }).then(function (r) { return { uid: r.user_id, token: r.id_token, refresco: r.refresh_token, caduca: Date.now() + Number(r.expires_in) * 1000 }; })
      : pedir('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + CONFIG.apiKey, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
      }).then(function (r) { return { uid: r.localId, token: r.idToken, refresco: r.refreshToken, caduca: Date.now() + Number(r.expiresIn) * 1000 }; });
    pidiendo = peticion.then(function (nueva) {
      guardarSesion(nueva);
      return nueva.token;
    }).finally(function () { pidiendo = null; });
    return pidiendo;
  }

  // Crea la cuenta si no la hay (sin esperar a que se use) y devuelve el uid.
  function entrar() {
    return token().then(uid);
  }

  // ---- Valores de Firestore (su REST los quiere con tipo: { stringValue: 'a' }) ----

  function aValor(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(aValor) } };
    if (typeof v === 'object') return { mapValue: { fields: aCampos(v) } };
    return { stringValue: String(v) };
  }
  function aCampos(o) {
    var f = {};
    Object.keys(o || {}).forEach(function (k) { if (o[k] !== undefined) f[k] = aValor(o[k]); });
    return f;
  }
  function deValor(v) {
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('nullValue' in v) return null;
    if ('timestampValue' in v) return v.timestampValue;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(deValor);
    if ('mapValue' in v) return deCampos(v.mapValue.fields);
    return null;
  }
  function deCampos(f) {
    var o = {};
    Object.keys(f || {}).forEach(function (k) { o[k] = deValor(f[k]); });
    return o;
  }
  function deDocumento(d) {
    if (!d || !d.name) return null;
    var o = deCampos(d.fields);
    o._id = d.name.split('/').pop();
    o._ruta = d.name.split('/documents/')[1];
    return o;
  }

  function cabeceras(t) {
    return { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' };
  }

  // ---- Documentos (ruta: 'grupos/abc/despensa/x') ----

  function leer(ruta) {
    return token().then(function (t) {
      return pedir(BASE + '/' + ruta, { headers: cabeceras(t) }).then(deDocumento, function (e) {
        if (e.estado === 404) return null;
        throw e;
      });
    });
  }

  // Escribe el documento entero (o solo esos campos con "campos"). Repetirlo no duplica: va por su ruta.
  function escribir(ruta, datos, campos) {
    return token().then(function (t) {
      var mascara = (campos || []).map(function (c) { return 'updateMask.fieldPaths=' + encodeURIComponent(c); }).join('&');
      return pedir(BASE + '/' + ruta + (mascara ? '?' + mascara : ''), {
        method: 'PATCH', headers: cabeceras(t), body: JSON.stringify({ fields: aCampos(datos) }),
      }).then(deDocumento);
    });
  }

  function borrar(ruta) {
    return token().then(function (t) {
      return pedir(BASE + '/' + ruta, { method: 'DELETE', headers: cabeceras(t) });
    });
  }

  // Varios cambios juntos, todos o ninguno. cambios: [{ ruta, datos, campos, anadir, quitar, existe } |
  // { ruta, borrar: true }]. anadir / quitar: { campo: [valores] } que se meten o se sacan de una lista sin leerla
  // antes (así uno se une a un grupo que aún no puede leer). existe: solo si el documento ya está.
  // servidor: [campos] que se ponen con la hora de Google (no la del móvil).
  function juntos(cambios) {
    return token().then(function (t) {
      var raiz = 'projects/' + CONFIG.projectId + '/databases/(default)/documents/';
      return pedir(BASE.replace(/\/documents$/, '/documents:commit'), {
        method: 'POST', headers: cabeceras(t),
        body: JSON.stringify({ writes: cambios.map(function (c) {
          if (c.borrar) return { delete: raiz + c.ruta };
          var w = { update: { name: raiz + c.ruta, fields: aCampos(c.datos || {}) } };
          if (c.campos) w.updateMask = { fieldPaths: c.campos };
          var transformar = [];
          Object.keys(c.anadir || {}).forEach(function (k) {
            transformar.push({ fieldPath: k, appendMissingElements: { values: c.anadir[k].map(aValor) } });
          });
          Object.keys(c.quitar || {}).forEach(function (k) {
            transformar.push({ fieldPath: k, removeAllFromArray: { values: c.quitar[k].map(aValor) } });
          });
          (c.servidor || []).forEach(function (k) {
            transformar.push({ fieldPath: k, setToServerValue: 'REQUEST_TIME' });
          });
          if (transformar.length) {
            w.updateTransforms = transformar;
            // Solo el cambio de la lista: sin máscara, el documento se sustituiría por los campos dados (ninguno).
            if (!c.campos && !c.datos) w.updateMask = { fieldPaths: [] };
          }
          if (c.existe) w.currentDocument = { exists: true };
          return w;
        }) }),
      });
    });
  }

  // Consulta en una colección. padre: '' o 'grupos/abc'; donde: [[campo, op, valor]] (op: '==', '>', 'array-contains'…).
  var OPS = { '==': 'EQUAL', '!=': 'NOT_EQUAL', '<': 'LESS_THAN', '<=': 'LESS_THAN_OR_EQUAL', '>': 'GREATER_THAN',
    '>=': 'GREATER_THAN_OR_EQUAL', 'array-contains': 'ARRAY_CONTAINS', in: 'IN' };
  function consultar(padre, coleccion, donde, limite) {
    return token().then(function (t) {
      var filtros = (donde || []).map(function (d) {
        return { fieldFilter: { field: { fieldPath: d[0] }, op: OPS[d[1]], value: aValor(d[2]) } };
      });
      var consulta = { from: [{ collectionId: coleccion }] };
      if (filtros.length === 1) consulta.where = filtros[0];
      else if (filtros.length > 1) consulta.where = { compositeFilter: { op: 'AND', filters: filtros } };
      if (limite) consulta.limit = limite;
      return pedir(BASE + (padre ? '/' + padre : '') + ':runQuery', {
        method: 'POST', headers: cabeceras(t), body: JSON.stringify({ structuredQuery: consulta }),
      }).then(function (filas) {
        return (filas || []).map(function (f) { return deDocumento(f.document); }).filter(Boolean);
      });
    });
  }

  // Borra la cuenta de este móvil en Firebase (lo de dentro de los grupos lo quita antes Equipos.borrarCuenta).
  function borrarCuenta() {
    return token().then(function (t) {
      return pedir('https://identitytoolkit.googleapis.com/v1/accounts:delete?key=' + CONFIG.apiKey, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: t }),
      });
    }).then(function () {
      try { localStorage.removeItem(CLAVE); } catch (e) { /* nada */ }
    });
  }

  // Un id corto y difícil de adivinar (para grupos e invitaciones).
  function idNuevo(largo) {
    var letras = 'abcdefghijkmnpqrstuvwxyz23456789';
    var n = largo || 20;
    var bytes = new Uint8Array(n);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(bytes) : bytes.forEach(function (_, i) { bytes[i] = Math.random() * 256; });
    return Array.prototype.map.call(bytes, function (b) { return letras[b % letras.length]; }).join('');
  }

  return {
    CONFIG: CONFIG,
    uid: uid,
    entrar: entrar,
    leer: leer,
    escribir: escribir,
    borrar: borrar,
    juntos: juntos,
    consultar: consultar,
    idNuevo: idNuevo,
    borrarCuenta: borrarCuenta,
    // Para las pruebas (Node): la conversión de valores.
    aCampos: aCampos,
    deCampos: deCampos,
  };
})();

if (typeof module !== 'undefined') module.exports = Nube;
