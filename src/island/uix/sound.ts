/**
 * 段 UIX1s：音の口。新しい画面の部品は、ここの uxSfx だけを呼ぶ（中身は uix/audio/）。
 * 新しい音は <html class="is-uxc">（または URL の uix=1）のときだけ鳴る。付いていないときは、どれを呼んでも何もしない。
 * 名前と引数は、見た目の担当と合わせる約束（変えない）。くわしくは docs/ISLAND_UIX_SOUND.md。
 */
import { UxSound, browserEnv, isSfxName, type UxScene, type UxSoundHost } from './audio/core';
import type { UxVol } from './audio/prefs';

export type { UxScene, UxSoundHost } from './audio/core';
export type { UxVol } from './audio/prefs';
export type { Momentum } from './audio/level';
export { UX_SFX, UX_SFX_MORE } from './audio/bank';
export { VOL_STEPS, nextStep } from './audio/prefs';

let core: UxSound | null = null;
/** 1 つだけの音の本体（はじめて使うときに作る） */
export function uxSound(): UxSound {
  core ??= new UxSound(browserEnv());
  return core;
}

/**
 * SE を鳴らす。
 * 名前：press・release・open・close・page・tab・lever・clunk・lamp・coin・cash・deny・confirm・rankup・conquest・
 * build・done・tick・blip・toggle・slide・error（ほかに足した名前は audio/bank.ts の UX_SFX_MORE）。
 * opts：pitch＝音程のずらし（半音）・voice＝喋る人（blip）・step＝段（lever の目盛り・lamp の何個めか・slide の位置など）。
 * 知らない名前・切のとき・まだ音を始めていないときは、何もしない。
 */
export function uxSfx(name: string, opts?: { pitch?: number; voice?: number; step?: number }): void {
  if (!isSfxName(name)) return;
  uxSound().sfx(name, opts);
}

/** 新しい音が入か */
export const uxOn = (): boolean => uxSound().on;

/** 本体（p1/main.ts）から 1 回だけ呼ぶ：切り替え・最初の操作・隠れたとき・場面と層の読み方をつなぐ */
export function uxSoundInit(host: UxSoundHost): void {
  uxSound().init(host);
}

/** 今の効果音の呼び出しを付け替える（IslandSfx.route に入れる）。切のときは false（今の音がそのまま鳴る） */
export const uxLegacy = (k: string, gain?: number, rate?: number): boolean => uxSound().legacy(k, gain, rate);

/** 場面を指定する（BGM が小節の頭で替わる）。返り値を呼ぶと、元の場面へ戻る */
export const uxScene = (scene: UxScene): (() => void) => uxSound().hold(scene);

/** 音の設定（0〜10・消音） */
export const uxVol = (): UxVol => ({ ...uxSound().vol });
export const uxSetVol = (part: Partial<UxVol>): void => uxSound().setVol(part);

/** いまの曲の様子（層のランプ・拍の脈に）。鳴っていなければ null */
export const uxMusic = () => uxSound().musicInfo();
