/**
 * 段 UIX1a：新しい部品が音を鳴らす口（docs/ISLAND_UIX.md「音の口」）。
 * この段では、名前を今の効果音（p1/sfx.ts の IslandSfx）へ対応づけるだけの薄い中身。音の土台の段（UIX1s）が、このファイルの中身を新しい音に替える。
 * 名前：press・release・open・close・page・tab・lever（目盛り）・clunk（レバーが落ちる）・lamp・coin・cash・deny・confirm・rankup・conquest・build・done・tick・blip・toggle・slide・error
 */
export type UxSfxName = 'press' | 'release' | 'open' | 'close' | 'page' | 'tab' | 'lever' | 'clunk' | 'lamp' | 'coin' | 'cash' | 'deny' | 'confirm' | 'rankup' | 'conquest' | 'build' | 'done' | 'tick' | 'blip' | 'toggle' | 'slide' | 'error';
export const UX_SFX: readonly UxSfxName[] = ['press', 'release', 'open', 'close', 'page', 'tab', 'lever', 'clunk', 'lamp', 'coin', 'cash', 'deny', 'confirm', 'rankup', 'conquest', 'build', 'done', 'tick', 'blip', 'toggle', 'slide', 'error'];

/**
 * 今の効果音への対応（[名前, 大きさ, 速さ]）。null は鳴らさない：
 * press・release は、全体のボタンの音（p1/main.ts の capture の click の tap）がもう鳴るので重ねない。tick・blip・slide は続けて呼ばれるので、今の音では鳴らさない
 */
const MAP: Record<UxSfxName, [string, number?, number?] | null> = {
  press: null,
  release: null,
  open: ['page'],
  close: ['move', 0.6],
  page: ['page'],
  tab: ['tap'],
  lever: ['tap', 0.8],
  clunk: ['place', 1.2, 0.8],
  lamp: ['check', 0.5],
  coin: ['sale'],
  cash: ['spend'],
  deny: ['error', 0.6],
  confirm: ['levelup'],
  rankup: ['levelup'],
  conquest: ['win'],
  build: ['place'],
  done: ['done'],
  tick: null,
  blip: null,
  toggle: ['tap'],
  slide: null,
  error: ['error'],
};

type Sink = (key: string, gain?: number, rate?: number) => void;
let sink: Sink | null = null;
/** 今の効果音の鳴らし口をつなぐ（p1/main.ts） */
export function setUxSfxSink(f: Sink | null) {
  sink = f;
}

/** 音を鳴らす。pitch：高さの倍率。voice：話す人ごとの声。step：段（レバーの目盛り・ランプ・つまみ） */
export function uxSfx(name: string, opts?: { pitch?: number; voice?: number; step?: number }): void {
  const m = MAP[name as UxSfxName];
  if (!m || !sink) return;
  const rate = (m[2] ?? 1) * (opts?.pitch ?? 1) * (opts?.step != null ? 1 + opts.step * 0.06 : 1);
  sink(m[0], m[1], rate);
}
