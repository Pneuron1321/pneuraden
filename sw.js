/* PNEURADEN — сервис-воркер: быстрый старт и работа без сети.
   Страницы и код приложения — СНАЧАЛА СЕТЬ (всегда свежая версия), без сети — из кэша.
   Библиотеки с фиксированной версией и шрифты — из кэша (они не меняются).
   Тайлы карты и API (маршруты, камеры, поиск) не трогаем — ими управляет браузер. */
const V='pnd-v1';
const SHELL=['./','./index.html','./lite.js','./manifest.webmanifest','./assets/icon-192.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css','https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).catch(()=>{}));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);
  const same=u.origin===self.location.origin;
  const lib=/^(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname);
  if(same&&(r.mode==='navigate'||/\.(js|webmanifest|png|jpg)$/.test(u.pathname))){
    e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));}return res;})
      .catch(()=>caches.match(r).then(m=>m||caches.match('./index.html'))));
  }else if(lib){
    e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok||res.type==='opaque'){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));}return res;})));
  }
});
