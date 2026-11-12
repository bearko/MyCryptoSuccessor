/**
 * 段 UIX2s：指を離した瞬間（pointerup）に動くキーのための守り。
 * 土台の press() は、離した瞬間に操作を呼ぶ。指で押したときは、そのあとにブラウザが同じ場所へ click を届けるので、
 * 操作で開いたばかりの窓（引き出しの外側＝閉じる）や、札を閉じたあとの地図に、その click が当たってしまう。
 * 操作のすぐあとに続く click を 1 回だけ呑む（ms のあいだに来なければ、何もしない）。
 */
export function swallowClick(ms = 400) {
  if (typeof addEventListener !== 'function') return;
  const stop = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    off();
  };
  const off = () => {
    removeEventListener('click', stop, true);
    clearTimeout(id);
  };
  addEventListener('click', stop, true);
  const id = setTimeout(off, ms);
}
/** 操作の前に、続く click を呑む守りを立てる */
export const safe =
  <A extends unknown[]>(fn: (...a: A) => void) =>
  (...a: A) => {
    swallowClick();
    fn(...a);
  };
