/**
 * 段 UIX3h：人と管理の画面（職人・採用・ヒーロー・育成・人事と給与・法務・トロフィー・図鑑 ほか）の新しい画面の差し込み口（docs/ISLAND_UIX.md「画面：職人と採用」ほか）。
 * 切のときは何も入っていない（呼ぶ側は `if (uxh.x) return uxh.x(...)` と書く：今の画面がそのまま開く）。
 * 入のときだけ、h-boot.ts（s-boot.ts から呼ぶ。動的に読む）が中身を入れる。型だけを読むので、切のときも数行ぶんしか増えない。
 */
import type { Ctx } from '../../p1/screens';
import type { HeroRarity } from '../../p1/data';
import type { TrophyDef } from '../../p1/trophy';
import type { LegalHooks } from '../../p1/legalui';
import type { P1State } from '../../p1/model';
import type { MapSetApi } from './misc-types';

export interface UxhScreens {
  /** ヒーローの配置（職人・運搬係・店員の持ち場と、待機中の名簿） */
  staff?: (ctx: Ctx) => void;
  /** 人材登用（charisma: false＝まとめた画面の前の部分。カリスマの札は出さない） */
  hire?: (ctx: Ctx, o: { charisma?: boolean }) => void;
  /** 経営者（カリスマ度のくわしい札） */
  charisma?: (ctx: Ctx) => void;
  /** 給与・労務 */
  payroll?: (ctx: Ctx) => void;
  /** ヒーローの育成（focus：その人の札へ送る） */
  growth?: (ctx: Ctx, focus?: number) => void;
  /** 昇格の演出 */
  promotion?: (root: HTMLElement, hero: number, from: HeroRarity, to: HeroRarity, done?: () => void) => void;
  /** 教えの図鑑 */
  lessons?: (ctx: Ctx) => void;
  /** 教えを受け継いだときのお知らせ（トーストの列に入れる要素） */
  lessonPop?: (hero: number, onOpen?: () => void) => HTMLElement;
  /** トロフィーの一覧（記章の棚） */
  trophies?: (ctx: Ctx) => void;
  /** トロフィーを取ったときの帯（トーストの列に入れる要素） */
  trophyPop?: (d: TrophyDef) => HTMLElement;
  /** 遺物の展示館 */
  museum?: (ctx: Ctx) => void;
  /** 法務 → M&A（focusRid：その他社の札を光らせて送る） */
  legalMA?: (ctx: Ctx, hooks: LegalHooks, focusRid?: string) => void;
  /** 法務 → 契約 */
  contract?: (ctx: Ctx, hooks: LegalHooks) => void;
  /** 法務 → 特許 */
  patents?: (ctx: Ctx, hooks: LegalHooks) => void;
  /** 法務 → 争い */
  suits?: (ctx: Ctx, hooks: LegalHooks) => void;
  /** 外交（霧の向こうのランド） */
  diplo?: (ctx: Ctx) => void;
  /** 商品開発（R&D） */
  dev?: (ctx: Ctx) => void;
  /** M&A（法務の部門が開く前の説明） */
  ma?: (ctx: Ctx) => void;
  /** 地図の表示（changed：地図を描き直す） */
  mapSet?: (ctx: Ctx, changed: () => void, api: MapSetApi) => void;
  /** 月の研究ポイントの入り方（研究ノート・スキルツリーの中の部品） */
  rpStack?: (s: P1State) => HTMLElement;
  /** 研究の施策のキー（研究ノート・スキルツリーの中の部品） */
  study?: (s: P1State, o: { done: () => void; toast: (m: string) => void; sfx?: (k: 'error' | 'levelup') => void }) => HTMLElement;
}
// 入れ物は uix/hooks.ts に置く（理由はそこに）。ここは型と、同じ物の名前だけ
export { uxhSlots as uxh } from '../hooks';
