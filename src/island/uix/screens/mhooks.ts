/**
 * 段 UIX2m：地図の上の常設の UI（上と下の帯・建物の吹き出し）を、新しい画面（方向 C「管制卓」）へ分ける口（docs/ISLAND_UIX.md「画面：上と下の帯」「画面：建物の吹き出し」）。
 * 切のときは何も入っていない（p1/main.ts は `uxm.x?.()` と書く：何も起きず、今の画面と同じ DOM になる）。
 * 入のときだけ、screens/mapui.ts（動的に読む）が中身を入れる。このファイルは型と空の口だけ（切のときに読むのはこれだけ）。
 */
import type { Camera } from '../../render';
import type { P1State, PBuilding } from '../../p1/model';

/** カメラの行き先（p1/main.ts の tween に渡す） */
export interface UxmCam {
  x1: number;
  y1: number;
  z1: number;
  dur: number;
}
export interface UxmHooks {
  /** 上の帯を描き直した（renderHud の終わり。帯の高さを測る前） */
  hud?: () => void;
  /** 毎コマ（地図の描画ループから。1 日の進み・BGM の層のランプ） */
  frame?: (now: number) => void;
  /** 吹き出しの中身を作り直した：新しい器に入れる。true を返すと、今の置き方をしない */
  pop?: (title: string) => boolean;
  /** 吹き出しを建物に合わせて置く。true を返すと、今の置き方をしない */
  placePop?: () => boolean;
  /** 建物を押した：カメラの寄り先（null なら今の寄せ方） */
  popCam?: (i: number, j: number, size: number) => UxmCam | null;
  /** 吹き出しを閉じた：カメラの戻り先（null なら動かさない） */
  popClose?: () => UxmCam | null;
}
export const uxm: UxmHooks = {};

/** p1/main.ts から渡す、いまの画面の中身（読むだけ） */
export interface UxmHost {
  s: () => P1State;
  root: HTMLElement;
  hud: HTMLElement;
  foot: HTMLElement;
  pop: HTMLElement;
  news: HTMLElement;
  cam: Camera;
  size: () => { W: number; H: number };
  /** 流れの案内のあいだ、まだ帯に出さない額 */
  unpaid: () => number;
  speed: () => number;
  /** 1 日の進み（0〜1） */
  frac: () => number;
  /** 上の帯とテロップの下の端 */
  hudBottom: () => number;
  /** 吹き出しを出している建物（無ければ null）と、出しているマス */
  sel: () => PBuilding | null;
  popAt: () => [number, number] | null;
  /** 隣の町の吹き出しか */
  popSector: () => boolean;
  /** 全部を描き直す（renderAll） */
  refresh: () => void;
}
