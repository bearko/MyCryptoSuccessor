/**
 * 段 UIX1a：新しい画面（方向 C「管制卓」）の切り替え（docs/ISLAND_UIX.md）。
 * <html> に class `is-uxc` が付いているときだけ、新しい見た目・新しい音になる。既定は切（今の画面と 1 画素も変わらない）。
 * 入れ方：設定の「新しい画面（試作）」、または URL の ?uix=1（入）・?uix=0（切）。URL で指定したら端末に覚える。
 * ?uix=kit は部品の見本帳（入の状態で開く。覚えない）。
 * 音の担当は、この class と window の `uxc:change`（detail.on）だけを見る（このファイルを import しない）。
 */
const KEY = 'isl.uxc';
export const UX_CLASS = 'is-uxc';

export interface UxChoice {
  on: boolean;
  /** 端末に覚える値（null：覚えない） */
  remember: boolean | null;
  /** 見本帳（?uix=kit） */
  kit: boolean;
}

/** URL と覚えている値から、入り切りを決める：URL の ?uix=1／0 → 覚えている値 → 切 */
export function resolveUx(search: string, stored: string | null): UxChoice {
  const q = new URLSearchParams(search).get('uix');
  if (q === 'kit') return { on: true, remember: null, kit: true };
  if (q === '1') return { on: true, remember: true, kit: false };
  if (q === '0') return { on: false, remember: false, kit: false };
  return { on: stored === '1', remember: null, kit: false };
}

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function write(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // 覚えられなくても切り替える
  }
}
function apply(on: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle(UX_CLASS, on);
  window.dispatchEvent(new CustomEvent('uxc:change', { detail: { on } }));
}

/** いま入か（<html> の class を見る） */
export function uxOn(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains(UX_CLASS);
}

/** 入り切りを替えて、端末に覚える（設定の画面から。見た目を入れ替えるには、画面を読み直す） */
export function setUx(on: boolean) {
  write(on);
  apply(on);
}

/** 起動のいちばん早い所で 1 回呼ぶ（src/island/main.ts） */
export function initUx(search = location.search): UxChoice {
  const c = resolveUx(search, read());
  if (c.remember !== null) write(c.remember);
  apply(c.on);
  return c;
}
