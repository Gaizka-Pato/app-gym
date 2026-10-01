// Guarda la app en el móvil para que abra sin cobertura. Las llamadas a la API (Apps Script) no se cachean:
// los datos sin conexión los gestiona js/almacen.js.
const VERSION = 'gymapp-fcb913769d';
const ARCHIVOS = [
  './',
  './index.html',
  './estilo.css',
  './manifest.webmanifest',
  './icono-192.png',
  './icono-512.png',
  './icono-claro-192.png',
  './icono-claro-512.png',
  './iconos/entreno.png',
  './iconos/pasos.png',
  './iconos/fin.png',
  './iconos/peso.png',
  './iconos/recuperar.png',
  './iconos/terminado.png',
  './iconos/descanso.png',
  './iconos/editar.png',
  './iconos/borrar.png',
  './iconos/compartir.png',
  './iconos/nuevo-ejercicio.png',
  './iconos/estado-entrenando.png',
  './iconos/estado-no-ido.png',
  './iconos/estado-terminado.png',
  './iconos/cara-feliz.png',
  './iconos/cara-normal.png',
  './iconos/cara-reventado.png',
  './js/tema.js',
  './js/iconos.js',
  './js/plan.js',
  './js/calendario.js',
  './js/rutina.js',
  './js/almacen.js',
  './js/grupos.js',
  './js/records.js',
  './js/ajuste.js',
  './js/discos.js',
  './js/fuerza.js',
  './js/progreso.js',
  './js/grafica.js',
  './js/app.js',
  './js/vistas.js',
  './js/estado.js',
  './js/social.js',
  './js/inicio.js',
  './js/rutinas.js',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' pide cada archivo a GitHub y no a la caché del navegador: GitHub Pages deja los archivos 10 minutos
  // en esa caché y, sin esto, una versión publicada dos veces seguidas se guardaba con los archivos de la anterior.
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(ARCHIVOS.map((a) => new Request(a, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
