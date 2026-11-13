// 画面はネット優先・つながらないときはキャッシュ。課題・学食・教室のデータはキャッシュしない
// 時刻表やファイル構成を変えたら VERSION を上げる
const VERSION = 'godlife-1.16.0';
const SHELL = ['./', 'index.html', 'css/app.css', 'data/trains.js',
  'js/core.js', 'js/classes.js', 'js/ocr.js', 'js/kadai.js', 'js/commute.js', 'js/campus.js', 'js/calendar.js', 'js/weather.js', 'js/notify.js', 'js/home.js', 'js/app.js',
  'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('.json') && !url.pathname.endsWith('manifest.json')) return; // データは毎回ネットから
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
