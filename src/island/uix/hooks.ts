/**
 * 段 UIX1a：いまの入口（btn()・sheet()・modal()・toast…）に、新しい器と手応えを差し込む口（docs/ISLAND_UIX.md）。
 * 切のときは何も入っていない（呼ぶ側は `ux.x?.()` と書く：何も起きず、今の画面と同じ DOM になる）。
 * 入のときだけ、uix/boot.ts（動的に読む）が中身を入れる。
 */
import type { UxsDeps } from '../p1/uxs';
import type { UxcScreens } from './screens/c-slots';
import type { UxbScreens } from './screens/b-slots';
import type { UxkScreens } from './screens/k-slots';
import type { UxhScreens } from './screens/h-slots';
import type { UxScreens } from './screens/s-slots';
import type { UxwScreens } from './screens/w-slots';

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

/**
 * 段 UIX3a：新しい画面の差し込み口の入れ物（中身の型と説明は screens/s-slots.ts・c-slots.ts・w-slots.ts。そこから同じ物を名前を替えて出している）。
 * 入れ物そのものは、このファイル（切のときも読む小さな束）に置く：入のとき、入口が新しい画面の束を本体より先に読むので、
 * 入れ物が本体の束の中にあると、本番のビルドで入れ物だけの束が 1 つ増え、切のときに読むファイルの数が変わってしまうため。
 */
export const uxsSlots: UxScreens = {};
export const uxcSlots: UxcScreens = {};
export const uxwSlots: UxwScreens = {};
export const uxbSlots: UxbScreens = {};
export const uxkSlots: UxkScreens = {};
export const uxhSlots: UxhScreens = {};
/** 束（s-boot.ts）が読めたら、入れ方（install）がここに入る（p1/uxs.ts の bootUxs が、起動のその場で呼ぶ）。切のときは空のまま */
export const uxsBootSlot: { install?: (d: UxsDeps) => void } = {};
