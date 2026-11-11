/**
 * 段 UIX1a：いまの入口（btn()・sheet()・modal()・toast…）に、新しい器と手応えを差し込む口（docs/ISLAND_UIX.md）。
 * 切のときは何も入っていない（呼ぶ側は `ux.x?.()` と書く：何も起きず、今の画面と同じ DOM になる）。
 * 入のときだけ、uix/boot.ts（動的に読む）が中身を入れる。
 */
export interface UxHooks {
  /** 札（sheet()）を作った直後：器の飾り・✕ のキー・開く動き（幕か、短い出入り） */
  sheetOpen?: (el: HTMLElement, title: string) => void;
  /** ✕ や外側を押して閉じる：幕が閉じきるのを待ってから fn（消す）を呼ぶ */
  sheetLeave?: (el: HTMLElement, fn: () => void) => void;
  /** 札を消した（別の札への切り替えも含む） */
  sheetClosed?: () => void;
  /** モーダルを作った直後（root に入れる前でも後でもよい）：共通の器と入る動き。kind は種類の名前 */
  modal?: (m: HTMLElement, kind: string) => void;
  /** お知らせの置き場所（上端の y）：開いている札・窓の中身に重ねない */
  toastTop?: (y: number) => number;
  /** 承認のボタンをレバーに替える：レバーが落ちたら、もとのボタンを 1 回押す。返した要素をボタンの代わりに置く */
  lever?: (b: HTMLButtonElement, label?: string) => HTMLElement;
  /** 設定の画面に、入のときの欄を足す */
  settings?: (body: HTMLElement) => void;
}
export const ux: UxHooks = {};
