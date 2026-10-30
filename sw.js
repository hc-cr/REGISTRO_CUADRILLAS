/* Service worker de "Registro Cuadrillas".
   - Solo maneja archivos de ESTE sitio. Nunca toca las llamadas a Google (datos, login, tokens),
     ni las tipografías: esas siempre van directo a la red.
   - Páginas y código: primero la red (así las actualizaciones llegan de inmediato) y, si no hay
     internet, la última copia guardada.
   - Iconos y librerías: copia guardada primero (no cambian). */
const VERSION = "rc-v1";
const CORE = [
  "./", "index.html", "panel.html", "form.js", "panel.js", "guard.js", "pwa.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
  "vendor/html2canvas-1.4.1.min.js", "vendor/jspdf-2.5.1.umd.min.js"
];
const ESTATICOS = /\/(icons|vendor)\//;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // Google, tipografías, etc.: red directa

  if (ESTATICOS.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => guardar(req, res))));
    return;
  }
  e.respondWith(
    fetch(req).then((res) => guardar(req, res))
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html")))
  );
});

function guardar(req, res) {
  if (res && res.ok && res.type === "basic") {
    const copia = res.clone();
    caches.open(VERSION).then((c) => c.put(req, copia));
  }
  return res;
}
