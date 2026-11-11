/**
 * 段 UIX1a：入のときの設定（docs/ISLAND_UIX.md）。端末に覚える（セーブとは別。セーブの版は上げない）。
 * 文字の大きさ・動きを減らす・色の組み合わせ・走査線は <html> の class で効かせる（is-t115・is-t130・is-calm・is-cvd・is-crt）。
 * 音量の欄は音の担当（UIX1s）。
 */
const KEY = 'isl.uxc.prefs';
export type CalmMode = 'auto' | 'on' | 'off';
export interface UxPrefs {
  /** 文字の大きさ（%） */
  text: 100 | 115 | 130;
  /** 動きを減らす：自動（端末の設定に合わせる）・入・切 */
  calm: CalmMode;
  /** 色覚に配慮した色（良い＝青・急ぎ＝橙） */
  cvd: boolean;
  /** 吹き出しの文字の速さ（1 ゆっくり・2 ふつう・3 はやい・4 すぐ全部） */
  talk: 1 | 2 | 3 | 4;
  /** 走査線 */
  crt: boolean;
}
export const PREFS_DEF: UxPrefs = { text: 100, calm: 'auto', cvd: false, talk: 2, crt: true };
/** 吹き出しの速さ（1 秒あたりの字数。0：すぐ全部） */
export const TALK_CPS: Record<UxPrefs['talk'], number> = { 1: 16, 2: 26, 3: 48, 4: 0 };

export const prefs: UxPrefs = { ...PREFS_DEF };
const subs = new Set<(p: UxPrefs) => void>();
/** 重い端末で、走査線を自動で切った（設定は変えない） */
let crtAuto = false;

/** 覚えた値を、正しい値だけ取り込む（壊れた値・古い値は、はじめの値で） */
export function cleanPrefs(raw: unknown): UxPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    text: r.text === 115 || r.text === 130 ? r.text : 100,
    calm: r.calm === 'on' || r.calm === 'off' ? r.calm : 'auto',
    cvd: r.cvd === true,
    talk: r.talk === 1 || r.talk === 3 || r.talk === 4 ? r.talk : 2,
    crt: r.crt !== false,
  };
}
/** 動きを減らすか：設定が入、または自動で端末の設定が「減らす」 */
export function calmOf(mode: CalmMode, reduced: boolean): boolean {
  return mode === 'on' || (mode === 'auto' && reduced);
}

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
/** いま、動きを減らしているか（新しい部品・幕・粒は、これを見て止める） */
export const isCalm = (): boolean => calmOf(prefs.calm, !!mq?.matches);

function apply() {
  if (typeof document === 'undefined') return;
  const r = document.documentElement.classList;
  r.toggle('is-calm', isCalm());
  r.toggle('is-cvd', prefs.cvd);
  r.toggle('is-crt', prefs.crt && !crtAuto);
  r.toggle('is-t115', prefs.text === 115);
  r.toggle('is-t130', prefs.text === 130);
  for (const fn of subs) fn(prefs);
}
export function loadPrefs() {
  try {
    Object.assign(prefs, cleanPrefs(JSON.parse(localStorage.getItem(KEY) || '{}')));
  } catch {
    // 読めなければ、はじめの値で
  }
  mq?.addEventListener?.('change', apply);
  apply();
}
export function setPrefs(part: Partial<UxPrefs>) {
  Object.assign(prefs, cleanPrefs({ ...prefs, ...part }));
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // 覚えられなくても動く
  }
  apply();
}
export const onPrefs = (fn: (p: UxPrefs) => void) => void subs.add(fn);
/** 重いとき：走査線を自動で切る（設定の値はそのまま） */
export function dropCrt() {
  crtAuto = true;
  apply();
}
