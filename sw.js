// Inwentarz hufca: praca bez internetu. Wersja: 20261123-131446
const CACHE = "inwentarz-20261123-131446";
const CORE = ["./", "./index.html", "./local.js", "./demo.json", "./manifest.webmanifest",
  "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/favicon.png",
  "./vendor/qrcode.js", "./vendor/jsQR.js", "./vendor/jspdf.umd.min.js", "./vendor/xlsx.full.min.js"];

// przy słabym zasięgu nie czekamy w nieskończoność na sieć
const timed = (req, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("timeout")), ms); fetch(req).then(r => { clearTimeout(t); res(r); }, e => { clearTimeout(t); rej(e); }); });

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("inwentarz-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // wersja z kontami (/hufiec/) ma własne zasady: nie ruszamy jej
  if (url.pathname.includes("/hufiec/")) return;
  // strona: najpierw sieć (żeby szybko dostać poprawki), bez sieci z pamięci
  if (req.mode === "navigate"){
    e.respondWith(timed(req, 5000).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put("./index.html", c)); return r; })
      .catch(() => caches.match("./index.html").then(r => r || caches.match("./"))));
    return;
  }
  // biblioteki, ikony i czcionki: z pamięci (zmieniają się rzadko); reszta plików strony: najpierw sieć
  const own = url.origin === self.location.origin, font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!own && !font) return;
  const stable = font || /\/(vendor|icons)\//.test(url.pathname);
  e.respondWith(caches.open(CACHE).then(async c => {
    if (stable){
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req); if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone()); return r;
    }
    try { const r = await timed(req, 5000); if (r && r.ok) c.put(req, r.clone()); return r; }
    catch (err){ const hit = await c.match(req, {ignoreSearch:true}); if (hit) return hit; throw err; }
  }));
});
