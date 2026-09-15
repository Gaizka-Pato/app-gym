// Guarda la app en el móvil para que abra sin cobertura. Las llamadas a la API (Apps Script) no se cachean:
// los datos sin conexión los gestiona js/almacen.js.
const VERSION = 'gymapp-78b48c87f8';
const ARCHIVOS = [
  './',
  './index.html',
  './estilo.css',
  './manifest.webmanifest',
  './icono-192.png',
  './icono-512.png',
  './js/calendario.js',
  './js/almacen.js',
  './js/grupos.js',
  './js/records.js',
  './js/grafica.js',
  './js/app.js',
  './js/vistas.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
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
