/**
 * 段 UIX1s：今の 24 種の効果音（p1/sfx.ts の IslandSfx）の呼び出し → 新しい音。
 * 入（<html class="is-uxc">）のときだけ使う。呼ぶ側（45 か所ほど）は書き換えず、IslandSfx.play の入口で付け替える。
 * 対応の表は docs/ISLAND_UIX_SOUND.md と、見本帳（notes.ts の LEGACY_NOTE）にも書いてある（変えたら 3 つとも直す）。
 */
import type { SfxName, SfxOpts } from './bank';

/** 今の音の名前（p1/sfx.ts の Sfx と同じ 24 種。型だけの依存を作らないよう、ここに並べる。テストで同じことを確かめる） */
export const LEGACY_SFX = ['tap', 'page', 'move', 'place', 'spend', 'error', 'done', 'craft', 'sale', 'levelup', 'mission', 'report', 'win', 'check', 'clear', 'drum', 'dig', 'treasure', 'mining', 'katsun', 'okay', 'buff', 'deny', 'jingle'] as const;
export type LegacySfx = (typeof LEGACY_SFX)[number];

export interface UxCall {
  name: SfxName;
  opts?: SfxOpts;
}

/** 再生の速さ（今の音の rate）→ 半音 */
const semis = (rate: number): number => Math.round(12 * Math.log2(Math.max(0.5, Math.min(2, rate))) * 10) / 10;
/** 大きさ：今の音の gain（0.6〜1.4）を、そのまま倍率に（1 のときは渡さない） */
const g = (gain: number): SfxOpts => (gain === 1 ? {} : { gain: Math.max(0.4, Math.min(1.4, gain)) });

/**
 * 今の呼び出し（名前・大きさ・速さ）→ 新しい音。
 * place だけは、呼ぶ側が大きさと速さで意味を変えているので、それで分ける：
 *  ・速さ 0.85 以下（重く低い）＝承認のハンコ → clunk
 *  ・大きさも速さも標準 ＝ 建て始め → build
 *  ・それ以外（速さを少しずつ上げて連打）＝ 1 つずつ点く → lamp（速さから段を決める）
 */
export function legacyToUx(k: LegacySfx, gain = 1, rate = 1): UxCall {
  switch (k) {
    case 'tap':
      return { name: 'press', opts: rate === 1 ? undefined : { pitch: semis(rate) } };
    case 'page':
      // 会話の次へ・カードのめくりは短く（3 つ送る）。低く重い呼び出し（提案書の紙芝居）は長く
      return rate <= 0.6 ? { name: 'page', opts: { step: 7 } } : { name: 'page', opts: { step: 3, ...g(gain) } };
    case 'move':
      return { name: 'lever', opts: { step: 3, ...g(gain) } };
    case 'place':
      if (rate <= 0.85) return { name: 'clunk' };
      if (gain === 1 && rate === 1) return { name: 'build' };
      return { name: 'lamp', opts: { step: Math.max(0, Math.min(7, Math.round((rate - 0.9) / 0.04))) } };
    case 'spend':
      return { name: 'cash' };
    case 'error':
      // 低く落とした呼び出し（災害のはじまり）は、形の違う「誤り」の音を低く
      return rate < 0.8 ? { name: 'error', opts: { pitch: -5 } } : { name: 'deny' };
    case 'done':
      return { name: 'built' };
    case 'craft':
      return { name: 'done', opts: { gain: 0.7 } };
    case 'sale':
      return { name: 'sale' };
    case 'levelup':
      return { name: 'stamp' };
    case 'mission':
      return { name: 'rankup' };
    case 'report':
      return { name: 'bell' };
    case 'win':
      return { name: 'rankup', opts: g(gain) };
    case 'check':
      return { name: 'lamp', opts: { step: 2, ...g(gain) } };
    case 'clear':
      return { name: 'done' };
    case 'drum':
      return { name: 'roll', opts: g(gain) };
    case 'dig':
      // 奥の層ほど低く（今の音は 1 層ごとに速さ −0.13）
      return { name: 'dig', opts: { step: Math.max(0, Math.round((1 - rate) / 0.13)), ...g(Math.min(1.4, gain)) } };
    case 'treasure':
      return { name: 'stamp' };
    case 'mining':
      return { name: 'rankup' };
    case 'katsun':
      return { name: 'clink', opts: { pitch: semis(rate), ...g(gain) } };
    case 'okay':
      return { name: 'confirm' };
    case 'buff':
      return { name: 'zoom', opts: { step: 1 } };
    case 'deny':
      return { name: 'toggle', opts: { step: 0 } };
    case 'jingle':
      return { name: 'rankup' };
  }
}
