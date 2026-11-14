/**
 * My Crypto Successor の入口（index.html）。ふだんはフェーズ 1（p1/main.ts）。?test=2&mode=free のときだけ自由建築（free.ts）。
 * ?uix=sound のときは、音の見本帳（uix/audio/book.ts）。?uix=kit のときは、部品の見本帳（uix/kit.ts）。
 */
import { t } from '../i18n';
import { initUx } from './uix/flag';

const q = new URLSearchParams(location.search);
// 段 UIX5a：新しい画面（方向 C「管制卓」）が既定。<html class="is-uxc"> をいつも付ける（docs/ISLAND_UIX.md）
const uxc = initUx(location.search);
const start = () => (q.get('test') === '2' && q.get('mode') === 'free' ? import('./free') : import('./p1/main'));

/** 新しい画面の値・部品・書体（boot）と画面の束（s-boot）を、本体より先に読む（起動のすぐあとの最初の会話から、新しい画面で出すため） */
const loadUx = () => import('./uix/boot').then(() => import('./uix/screens/s-boot'));
/** 読めなかったら、少し待ってもう 1 回だけ読みにいく（通信が一瞬切れただけのとき） */
const loadUxRetry = () => loadUx().catch(() => new Promise((r) => setTimeout(r, 800)).then(loadUx));

/**
 * 段 UIX5a：読めなかったときの表示。古い画面はもう無いので、新しい画面の束なしでは始めない。
 * 何が起きたかと、次にすること（読み直す）をはっきり出す。束の CSS は読めていないので、見た目はここに直接書く（角は丸めない・字は 16px 以上・押す所は 44px 以上）
 */
function fail(err: unknown) {
  console.error(err);
  if (document.querySelector('.isl-boot-fail')) return;
  const box = document.createElement('div');
  box.className = 'isl-boot-fail';
  box.setAttribute('role', 'alert');
  box.style.cssText = 'position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;background:#0b0d17;color:#f4ecd4;font:16px/1.6 sans-serif;';
  const card = document.createElement('div');
  card.style.cssText = 'max-width:420px;padding:20px;border:2px solid #ffb81f;background:#1a1c2e;';
  const msg = document.createElement('p');
  msg.style.cssText = 'margin:0 0 16px;font-size:16px;';
  msg.textContent = t('ゲームの画面を読み込めませんでした。通信のよい所で、読み直してください。', 'The game screens could not be loaded. Check your connection, then reload.');
  const key = document.createElement('button');
  key.type = 'button';
  key.textContent = t('読み直す', 'Reload');
  key.style.cssText = 'min-height:44px;min-width:44px;padding:8px 20px;border:2px solid #0b0d17;background:#ffb81f;color:#1a1c2e;font:16px/1.2 sans-serif;cursor:pointer;';
  key.addEventListener('click', () => location.reload());
  card.append(msg, key);
  box.append(card);
  document.body.append(box);
}

if (q.get('uix') === 'sound')
  // 段 UIX1s：音の見本帳（SE と BGM を押して確かめる頁。ゲームの本体は読み込まない）
  void import('./uix/audio/book');
else if (uxc.kit) import('./uix/boot').then(() => import('./uix/kit')).catch(fail);
else loadUxRetry().then(start).catch(fail);

// オフラインで遊べるように（本番のビルドだけ。dist/sw.js は vite.config.ts の pwa() が作る）
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}
