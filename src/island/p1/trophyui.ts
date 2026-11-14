/**
 * 段 UI6：トロフィー（実績）の一覧と、取ったときの帯。判定と保存は trophy.ts（DOM なし）。
 * 一覧はシステム → 設定の画面にまとめる（サブタブは増やさない）。アイコンは仮の絵（絵文字。docs/ISLAND_ART_TODO.md）。
 */
import './ui6.css';
import type { P1State } from './model';
import { type Ctx } from './screens';
import { checkTrophies, loadTrophies, saveTrophies, type TrophyBook, type TrophyDef } from './trophy';
import { uxh } from '../uix/screens/h-slots';

/** 手元の記録（はじめに 1 回だけ読む。書けなくても、このセッションのあいだは覚えておく） */
let book: TrophyBook | null = null;
export const trophyBook = (): TrophyBook => (book ??= loadTrophies());
/** テスト・撮影：手元の記録を読み直す */
export const resetTrophyBook = () => (book = null);

/** いまの状態で判定し、新しく取ったものを保存して返す（main.ts が 1 日ごとに呼ぶ） */
export function trophyTick(s: P1State): TrophyDef[] {
  const b = trophyBook();
  const got = checkTrophies(s, b);
  if (got.length) saveTrophies(b);
  return got;
}

/**
 * 取ったときの帯（トーストの列に入れる：トーストと縦に並ぶので重ならない。main.ts が、そのときのトーストが消えてから出す）
 */
export function trophyEl(d: TrophyDef): HTMLElement {
  // 段 UIX3h：新しい画面（記章が打たれる）
  return uxh.trophyPop!(d);
}

/** トロフィーの一覧（システム → 設定） */
export function openTrophies(ctx: Ctx) {
  return uxh.trophies!(ctx);
}
