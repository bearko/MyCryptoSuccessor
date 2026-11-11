/**
 * My Crypto Successor の入口（index.html）。ふだんはフェーズ 1（p1/main.ts）。?test=2&mode=free のときだけ自由建築（free.ts）。
 * ?uix=sound のときは、音の見本帳（uix/audio/book.ts）。
 */
import { initUx } from './uix/flag';

const q = new URLSearchParams(location.search);
// 段 UIX1a：新しい画面（方向 C「管制卓」）の切り替え。既定は切。?uix=1／?uix=0・設定の「新しい画面（試作）」で替える（docs/ISLAND_UIX.md）
const uxc = initUx(location.search);
const start = () => (q.get('test') === '2' && q.get('mode') === 'free' ? import('./free') : import('./p1/main'));
if (q.get('uix') === 'sound')
  // 段 UIX1s：音の見本帳（SE と BGM を押して確かめる頁。ゲームの本体は読み込まない）
  void import('./uix/audio/book');
// 入のときだけ、新しい値・部品・書体を読む（切のときは読まない）。読めなくても、今の画面で始める
else if (uxc.kit) void import('./uix/boot').then(() => import('./uix/kit'));
else if (uxc.on) void import('./uix/boot').then(start, start);
else void start();

// オフラインで遊べるように（本番のビルドだけ。dist/sw.js は vite.config.ts の pwa() が作る）
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}
