/**
 * 段 UIX1a：入のときだけ動的に読む入口（src/island/main.ts。docs/ISLAND_UIX.md）。
 * ここから先（値・部品の CSS・書体・上掛けの canvas）は、切のときは 1 バイトも読まない。
 * やること：書体と CSS を読む・設定を class に当てる・上掛けの層を作る・いまの入口（札・窓・お知らせ・ボタン）へ差し込む。
 */
import '@fontsource/dotgothic16/400.css';
import '@fontsource/jersey-10/400.css';
import './tokens.css';
import './base.css';
import './parts.css';
import './legacy.css';
import { initFx } from './fx';
import { installLegacy } from './legacy';
import { onQuality, quality } from './loop';
import { dropCrt, loadPrefs } from './prefs';

let booted = false;
export function bootUx() {
  if (booted || typeof document === 'undefined') return;
  booted = true;
  loadPrefs();
  initFx();
  // 走査線（設定で入り切り。重い端末では自動で切る）
  const crt = document.createElement('div');
  crt.className = 'ux-crt';
  crt.setAttribute('aria-hidden', 'true');
  document.body.append(crt);
  onQuality(() => {
    if (quality.level === 0) dropCrt();
  });
  installLegacy();
}
bootUx();
