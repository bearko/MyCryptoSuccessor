/**
 * My Crypto Successor の入口（index.html）。ふだんはフェーズ 1（p1/main.ts）。?test=2&mode=free のときだけ自由建築（free.ts）。
 */
const q = new URLSearchParams(location.search);
if (q.get('test') === '2' && q.get('mode') === 'free') void import('./free');
else void import('./p1/main');

// オフラインで遊べるように（本番のビルドだけ。dist/sw.js は vite.config.ts の pwa() が作る）
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}
