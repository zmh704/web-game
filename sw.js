// ============================================================
// Service Worker
//
// 重要修正：原来所有请求都是 cache-first，并且把 game.html 也缓存了。
// 结果是「改了 HTML/CSS 之后，用户刷新也永远看到旧页面」，
// 表现出来就是"按钮点了没反应"这种假故障。
//
// 现在：
//   · HTML / sw.js 走 network-first —— 有网就一定是新的
//   · 其它静态资源 stale-while-revalidate —— 先用缓存保证快，后台再更新
//   · 安装后立即 skipWaiting + claim，避免用户长时间停留在旧版本
// ============================================================
const CACHE_NAME = 'miracle-forest-v10';
const ASSETS = [
  'game.html',
  'manifest.json',
  'icons/icon-192.svg',
  'icons/icon-512.svg',
  'src/styles/game.css',
  'src/scripts/game-network.js',
  'src/scripts/game-sync.js'
];

self.addEventListener('install', (event) => {
  // 新版本立刻进入等待→激活流程，不等旧页面全部关闭
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .catch(() => { /* 单个资源 404 不应导致整个安装失败 */ })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// 需要「永远拿最新」的请求：页面、脚本、样式、SW 自身。
// 只把图片/图标这类不常变的资源留给缓存优先。
function isNetworkFirst(url) {
  const path = new URL(url).pathname;
  return path.endsWith('/') ||
    path.endsWith('.html') ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('.json');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // 跨域请求（联机信令等）不接管
  if (new URL(req.url).origin !== self.location.origin) return;

  if (isNetworkFirst(req.url)) {
    // 网络优先：失败才退回缓存（离线仍可用）
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 其它资源：先给缓存，同时后台更新
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
