/**
 * 段 UIX1a：新しい画面（方向 C「管制卓」）の目印（docs/ISLAND_UIX.md）。
 * 段 UIX5a：新しい見た目が既定（いつも入）。<html> の class `is-uxc` は、いつも付ける（CSS のセレクタは `html.is-uxc` の内側に書く決まりのまま）。
 * 前の切り替え（URL の ?uix=1／?uix=0・設定の「新しい画面（試作）」・端末に覚えた `isl.uxc`）は読まない。覚えた値は起動のときに消す。
 * ?uix=kit は部品の見本帳。?uix=sound（音の見本帳）は src/island/main.ts が見る。
 * 音の担当は、この class と window の `uxc:change`（detail.on）だけを見る（このファイルを import しない）。
 */
const OLD_KEY = 'isl.uxc';
export const UX_CLASS = 'is-uxc';

export interface UxChoice {
  /** いつも true（段 UIX5a から。型は前のまま） */
  on: boolean;
  /** 見本帳（?uix=kit） */
  kit: boolean;
}

/** URL から決める：?uix=kit なら見本帳。どちらでも入 */
export function resolveUx(search: string): UxChoice {
  return { on: true, kit: new URLSearchParams(search).get('uix') === 'kit' };
}

/** 前の切り替えで端末に覚えた値は、もう読まないので消す */
function forgetOld() {
  try {
    localStorage.removeItem(OLD_KEY);
  } catch {
    // 消せなくても読まないので害は無い
  }
}

/** いま入か（<html> の class を見る） */
export function uxOn(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains(UX_CLASS);
}

/** 起動のいちばん早い所で 1 回呼ぶ（src/island/main.ts） */
export function initUx(search = location.search): UxChoice {
  const c = resolveUx(search);
  forgetOld();
  if (typeof document !== 'undefined') {
    document.documentElement.classList.add(UX_CLASS);
    window.dispatchEvent(new CustomEvent('uxc:change', { detail: { on: true } }));
  }
  return c;
}
