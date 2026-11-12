/**
 * 段 UIX3a：共通の器と、1 か月目に必ず通る画面（会話・選ぶ引き出し・窓・ミッション・設定 ほか）の差し込み口
 * （docs/ISLAND_UIX.md「画面：会話」「画面：選ぶ引き出し」ほか）。
 * 切のときは何も入っていない（呼ぶ側は `if (uxc.x) return uxc.x(...)` と書く：今の画面がそのまま開く）。
 * 入のときだけ、c-boot.ts（s-boot.ts から呼ぶ）が中身を入れる。型だけを読むので、切のときも増えるのは数行ぶん。
 */
import type { drawer, pickExt, pickHero } from '../../p1/heroui';
import type { TutPage } from '../../p1/tut';

/** マインちゃんの会話（p1/main.ts の showTalk と同じ中身。本体の中だけにある道具は、ここで渡す） */
export interface TalkCall {
  root: HTMLElement;
  pages: TutPage[];
  /** 最後の枚のキーの字 */
  ok: string;
  then: () => void;
  /** その枚の上の絵（仲間の 3 人・流れの図・お祝いの品・お題の絵）。無ければ null */
  stage: (pg: TutPage) => HTMLElement | null;
  /** スペース・Enter で呼ぶもの（いちばん上の会話の「次へ」か、最後の枚のキー）を登録する */
  keys: (m: HTMLElement, fn: () => void) => void;
  /** 枠で囲む前に呼ぶ（懐中時計のボタンを先に出す） */
  prep: () => void;
}

export interface UxcScreens {
  /** マインちゃんの会話 */
  talk?: (o: TalkCall) => void;
  /** 引き出しの器（p1/heroui.ts の drawer と同じ。中身は呼ぶ側が入れる）。閉じる関数を返す */
  drawer?: (...a: Parameters<typeof drawer>) => () => void;
  /** ヒーローを選ぶ引き出し */
  pickHero?: (...a: Parameters<typeof pickHero>) => void;
  /** エクステを選ぶ引き出し（作業台の作る物を選ぶ並びも） */
  pickExt?: (...a: Parameters<typeof pickExt>) => void;
}
export const uxc: UxcScreens = {};
