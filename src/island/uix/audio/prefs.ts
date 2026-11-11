/**
 * 段 UIX1s：音の設定（BGM の音量・SE の音量・消音）。入（is-uxc）のときの音だけに効く。
 * 保存先は今の音の設定と同じ鍵（mycryptoisland.p1.sound）で、省略できる項目（uxBgm・uxSe・uxMute）を足すだけ。
 * 古い設定（項目が無い）では、今の入り切り（bgm・se が 0 か 1）を引き継ぐ：入なら見本のはじめの値（BGM 7・SE 8）、切なら 0。
 */

export const SOUND_KEY = 'mycryptoisland.p1.sound';
/** 見本のはじめの値（10 段のうち） */
export const DEF_BGM = 7;
export const DEF_SE = 8;
/** 設定の画面で押すたびに進む段（0＝鳴らさない と、5 段） */
export const VOL_STEPS = [0, 2, 4, 6, 8, 10];

export interface UxVol {
  /** 0〜10 */
  bgm: number;
  /** 0〜10 */
  se: number;
  mute: boolean;
}

interface Stored {
  bgm?: number;
  se?: number;
  uxBgm?: number;
  uxSe?: number;
  uxMute?: boolean;
}

export interface StoreLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const clamp10 = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(10, Math.round(v))) : d);

function read(st: StoreLike | null): Stored {
  try {
    const x = JSON.parse(st?.getItem(SOUND_KEY) ?? '{}') as unknown;
    return x && typeof x === 'object' ? (x as Stored) : {};
  } catch {
    return {};
  }
}

/** 保存してある値から、音の設定を作る（項目が無ければ、今の入り切りを引き継ぐ） */
export function volFrom(x: Stored): UxVol {
  const bgmOn = x.bgm === undefined || x.bgm > 0;
  const seOn = x.se === undefined || x.se > 0;
  return { bgm: clamp10(x.uxBgm, bgmOn ? DEF_BGM : 0), se: clamp10(x.uxSe, seOn ? DEF_SE : 0), mute: x.uxMute === true };
}

export const loadVol = (st: StoreLike | null): UxVol => volFrom(read(st));

/** 保存する：今の音の設定（bgm・se ほか）はそのまま残して、足した項目だけ書き換える */
export function saveVol(st: StoreLike | null, v: UxVol): void {
  try {
    const x = read(st);
    st?.setItem(SOUND_KEY, JSON.stringify({ ...x, uxBgm: clamp10(v.bgm, DEF_BGM), uxSe: clamp10(v.se, DEF_SE), uxMute: !!v.mute }));
  } catch {
    // 保存できなくても鳴らせる
  }
}

/** 押すたびに次の段へ（いちばん上の次は 0） */
export function nextStep(v: number): number {
  const up = VOL_STEPS.find((x) => x > v);
  return up ?? 0;
}
