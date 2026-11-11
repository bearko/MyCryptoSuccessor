/**
 * 段 UIX1s：SE。機械のクリック（ノイズ）と、曲の和音に合わせた短い音程を重ねる（見本 public/uixlab/c/js/sfx.js を移した）。
 * 音程はいつも「いま鳴っている BGM の和音・音階」から選ぶので、押すたびに曲に溶ける。
 * 同じ音が続いても飽きないように、音程・強さ・左右を少しずつ揺らす。
 * 見本に無い音（建てる・誤り・発掘・石に当たる・建物の完成）は、同じ音色の決まりでこの段で足した（下の「足した音」）。
 */
import type { Engine, NoiseOpt, ToneOpt, Wave } from './engine';
import type { Music } from './music';
import { PENTA, SCALE } from './songs';

/** 喋る音（人ごとに波形と高さが違う） */
export interface Voice {
  wave: Wave;
  /** 音階の何番めか */
  deg: number;
  oct: number;
  len?: number;
  vol?: number;
}
/** 声の表：0〜4 は見本の 5 人ぶんの値。5〜9 はこの段で足した（同じ決まりで、波形と高さの組を変えた） */
export const VOICES: Voice[] = [
  { wave: 'p50', deg: 0, oct: 4, len: 0.045, vol: 0.085 },
  { wave: 'tri', deg: 2, oct: 4, vol: 0.12 },
  { wave: 'p25', deg: 3, oct: 4, vol: 0.08 },
  { wave: 'tri', deg: 2, oct: 5, len: 0.04, vol: 0.13 },
  { wave: 'p25', deg: 0, oct: 5, len: 0.04, vol: 0.085 },
  { wave: 'p12', deg: 1, oct: 5, len: 0.04, vol: 0.09 },
  { wave: 'p50', deg: 3, oct: 3, len: 0.05, vol: 0.085 },
  { wave: 'tri', deg: 4, oct: 4, vol: 0.12 },
  { wave: 'p12', deg: 4, oct: 4, len: 0.045, vol: 0.09 },
  { wave: 'p25', deg: 1, oct: 4, vol: 0.08 },
];

export class Sfx {
  readonly e: Engine;
  readonly music: Music;
  last: Record<string, number> = {};
  seq = 0;
  rnd: () => number = Math.random;
  private lastK: number | undefined;
  /** その 1 回だけの、音程のずらし（半音）。音程のある音（m で指定した音）に効く */
  shift = 0;
  /** その 1 回だけの、大きさの倍率 */
  gain = 1;

  constructor(eng: Engine, music: Music) {
    this.e = eng;
    this.music = music;
  }

  private tn(o: ToneOpt): number {
    if (this.gain !== 1) o.vol = (o.vol ?? 0.1) * this.gain;
    if (this.shift && o.m != null) o.det = (o.det ?? 0) + this.shift * 100;
    return this.e.tone(o);
  }
  private nz(o: NoiseOpt): void {
    if (this.gain !== 1) o.vol = (o.vol ?? 0.2) * this.gain;
    this.e.noise(o);
  }

  /** 和音の i 番目の音（3 を超えたら上のオクターブへ） */
  ct(i: number, oct = 5, t?: number): number {
    const h = this.music.harmony(t);
    const pcs = h.pcs;
    const k = ((i % 3) + 3) % 3;
    let m = 12 * (oct + 1) + pcs[k] + Math.floor(i / 3) * 12;
    if (pcs[k] < pcs[0]) m += 12;
    return m;
  }
  /** 音階の i 番目の音（5 音音階。どの和音の上でも濁らない） */
  sc(i: number, oct = 5, scale: number[] = PENTA): number {
    const n = scale.length;
    return 12 * (oct + 1) + scale[((i % n) + n) % n] + Math.floor(i / n) * 12;
  }
  jit(c = 7): number {
    return (this.rnd() * 2 - 1) * c;
  }
  /** 続けて呼ばれすぎたら間引く */
  gate(key: string, ms: number): boolean {
    const now = this.e.now;
    if (now - (this.last[key] ?? -9) < ms / 1000) return false;
    this.last[key] = now;
    return true;
  }
  click(t: number, v = 1, hp = 2600): void {
    this.nz({ t, dur: 0.012, vol: 0.2 * v, hp, seed: this.rnd() });
    this.tn({ t, f: 150, to: 70, toT: 0.035, dur: 0.035, vol: 0.13 * v, wave: 'tri', r: 0.02 });
  }

  // ---- 押す・離す
  press(strong = false): void {
    const t = this.e.now;
    const k = this.seq++ % 3;
    this.click(t, strong ? 1.25 : 1);
    this.tn({ t, m: this.ct(k, 6), dur: 0.03, vol: 0.05, wave: 'p12', det: this.jit(), r: 0.03, pan: this.jit(0.2) });
    this.lastK = k;
  }
  release(): void {
    const t = this.e.now;
    this.nz({ t, dur: 0.008, vol: 0.1, hp: 4200, seed: this.rnd() });
    this.tn({ t, m: this.ct(this.lastK ?? 0, 5), dur: 0.02, vol: 0.028, wave: 'p12', det: this.jit(), r: 0.03 });
  }

  // ---- 開く・閉じる（和音を上る／下る）
  open(): void {
    const t = this.e.now;
    this.nz({ t, dur: 0.16, vol: 0.07, bp: 700, sweep: 4200, q: 1.4 });
    [0, 1, 2].forEach((i, n) => this.tn({ t: t + n * 0.05, m: this.ct(i, 5), dur: 0.05, vol: 0.075, wave: 'p25', d: 0.05, s: 0.4, r: 0.06, echo: 0.25, det: this.jit(4) }));
    this.click(t + 0.15, 0.7);
  }
  close(): void {
    const t = this.e.now;
    this.nz({ t, dur: 0.14, vol: 0.06, bp: 3600, sweep: 600, q: 1.4 });
    [2, 1, 0].forEach((i, n) => this.tn({ t: t + n * 0.045, m: this.ct(i, 5), dur: 0.04, vol: 0.055, wave: 'p25', d: 0.04, s: 0.4, r: 0.05, det: this.jit(4) }));
    this.click(t + 0.13, 0.8, 1800);
  }
  /** 地図のカメラが寄る・戻る */
  zoom(inward = true): void {
    const t = this.e.now;
    const a = this.ct(0, 4);
    this.tn({ t, m: inward ? a : a + 12, to: 440 * Math.pow(2, ((inward ? a + 12 : a) - 69) / 12), toT: 0.16, dur: 0.16, vol: 0.05, wave: 'tri', a: 0.02, r: 0.06 });
  }

  // ---- 紙テープを送る（めくる）
  page(steps = 7, gap = 0.07): void {
    const t = this.e.now;
    for (let i = 0; i < steps; i++) {
      this.nz({ t: t + i * gap, dur: 0.03, vol: 0.13, bp: 1500 + (i % 2) * 500, q: 2.2, seed: i * 0.13 + this.rnd() * 0.2 });
      this.tn({ t: t + i * gap, f: 95, dur: 0.02, vol: 0.07, wave: 'p50', r: 0.01 });
    }
    const end = t + steps * gap;
    this.click(end, 1.1, 1600);
    this.tn({ t: end, m: this.ct(2, 5, end), dur: 0.05, vol: 0.06, wave: 'tri', d: 0.06, s: 0.3, r: 0.08, echo: 0.2 });
  }
  /** 1 行を打ち出す */
  print(n = 4): void {
    if (!this.gate('print', 40)) return;
    const t = this.e.now;
    for (let i = 0; i < n; i++) this.nz({ t: t + i * 0.022, type: 'metal', rate: 0.5 + (i % 3) * 0.12, dur: 0.012, vol: 0.05, hp: 2400, seed: i * 0.21 });
  }

  // ---- タブ
  tab(): void {
    const t = this.e.now;
    this.click(t, 0.9);
    this.tn({ t: t + 0.01, m: this.ct(0, 5), dur: 0.04, vol: 0.07, wave: 'tri', r: 0.04 });
    this.tn({ t: t + 0.07, m: this.ct(2, 5), dur: 0.05, vol: 0.07, wave: 'tri', r: 0.06, echo: 0.2 });
  }

  // ---- 承認：レバーの手応え
  detent(p: number): void {
    if (!this.gate('detent', 28)) return;
    const t = this.e.now;
    this.nz({ t, dur: 0.01, vol: 0.12, hp: 1800, seed: p });
    this.tn({ t, m: this.sc(Math.round(p * 7), 4), dur: 0.02, vol: 0.05, wave: 'p50', r: 0.02 });
  }
  leverBack(): void {
    const t = this.e.now;
    this.click(t, 0.7, 1500);
    this.tn({ t, m: this.ct(0, 3), dur: 0.05, vol: 0.08, wave: 'tri', r: 0.05 });
  }
  /** ガチャン。和音の一撃を重ねる */
  approve(): void {
    const t = this.e.now;
    this.nz({ t, dur: 0.09, vol: 0.5, lp: 1100, seed: 0.4 });
    this.nz({ t: t + 0.004, type: 'metal', rate: 0.7, dur: 0.12, vol: 0.14, hp: 1800, seed: 0.2 });
    this.tn({ t, f: 120, to: 42, toT: 0.2, dur: 0.22, vol: 0.5, wave: 'sin', a: 0.002, r: 0.1 });
    this.tn({ t, f: 240, to: 90, toT: 0.07, dur: 0.07, vol: 0.2, wave: 'tri', r: 0.04 });
    [0, 1, 2].forEach((i) => this.tn({ t: t + 0.012, m: this.ct(i, 4), dur: 0.22, vol: 0.06, wave: 'p50', a: 0.004, d: 0.2, s: 0.25, r: 0.2, pan: (i - 1) * 0.4, echo: 0.25 }));
  }
  /** ランプが 1 つずつ点く（i が上がるほど高い） */
  lamp(i: number, t?: number): void {
    const at = t ?? this.e.now;
    this.tn({ t: at, m: this.ct(i, 5, at), dur: 0.06, vol: 0.085, wave: 'p25', d: 0.07, s: 0.35, r: 0.1, echo: 0.3, pan: -0.4 + i * 0.2 });
    this.nz({ t: at, dur: 0.006, vol: 0.06, hp: 5000, seed: i * 0.1 });
  }
  /** ランプが全部点いたあとの決め（承認済の札が点く） */
  stamp(t?: number): void {
    const at = t ?? this.e.now;
    [0, 1, 2, 3].forEach((i) => this.tn({ t: at, m: this.ct(i, 5, at), dur: 0.3, vol: 0.055, wave: i % 2 ? 'p25' : 'p50', a: 0.004, d: 0.25, s: 0.3, r: 0.3, pan: (i - 1.5) * 0.3, echo: 0.3 }));
    this.nz({ t: at, dur: 0.25, vol: 0.05, hp: 6000, seed: 0.7 });
    this.click(at, 1);
  }

  // ---- お金
  /** 金貨：p（0〜1）が進むほど音階を上る */
  coin(p: number): void {
    if (!this.gate('coin', 42)) return;
    const t = this.e.now;
    const m = this.sc(Math.floor(p * 12), 5);
    this.tn({ t, m, dur: 0.035, vol: 0.058, wave: 'p25', d: 0.05, s: 0.3, r: 0.06, det: this.jit(5), pan: this.jit(0.35), echo: 0.12 });
    this.tn({ t: t + 0.03, m: m + 12, dur: 0.02, vol: 0.03, wave: 'tri', r: 0.05 });
    this.nz({ t, dur: 0.005, vol: 0.035, hp: 6000, seed: p });
  }
  /** 桁が回る音（数え上げのあいだ） */
  tick(): void {
    if (!this.gate('tick', 46)) return;
    const t = this.e.now;
    this.nz({ t, dur: 0.006, vol: 0.09, hp: 3800, seed: this.rnd() });
  }
  /** 入金（チャリン） */
  deposit(v = 1): void {
    if (!this.gate('deposit', 90)) return;
    const t = this.e.now;
    this.tn({ t, m: this.ct(2, 6), dur: 0.04, vol: 0.09 * v, wave: 'p25', d: 0.05, s: 0.3, r: 0.08, det: this.jit(), echo: 0.25 });
    this.tn({ t: t + 0.055, m: this.ct(3, 6), dur: 0.09, vol: 0.1 * v, wave: 'p25', d: 0.1, s: 0.25, r: 0.16, det: this.jit(), echo: 0.3 });
    this.nz({ t, dur: 0.006, vol: 0.05 * v, hp: 6500, seed: this.rnd() });
  }
  /** 買った：レジのベルと、引き出しの「ガチャ」 */
  buy(): void {
    const t = this.e.now;
    this.click(t, 1.2, 1400);
    [0, 2, 3, 5].forEach((i, n) => this.tn({ t: t + 0.03 + n * 0.055, m: this.ct(i, 5), dur: 0.05, vol: 0.075, wave: n % 2 ? 'p25' : 'tri', d: 0.06, s: 0.3, r: 0.12, echo: 0.3, pan: -0.3 + n * 0.2 }));
    this.nz({ t: t + 0.25, type: 'metal', rate: 2, dur: 0.2, vol: 0.035, hp: 7000 });
  }
  /** 足りない：責めない、やわらかい 2 音 */
  deny(): void {
    const t = this.e.now;
    this.tn({ t, m: this.ct(1, 4), dur: 0.09, vol: 0.16, wave: 'tri', a: 0.015, r: 0.08 });
    this.tn({ t: t + 0.12, m: this.ct(0, 4), dur: 0.14, vol: 0.15, wave: 'tri', a: 0.015, r: 0.14 });
    this.nz({ t, dur: 0.02, vol: 0.04, lp: 900, seed: 0.3 });
  }
  /** 決定 */
  decide(): void {
    const t = this.e.now;
    this.click(t, 0.9);
    [0, 2, 3].forEach((i, n) => this.tn({ t: t + n * 0.042, m: this.ct(i, 5), dur: 0.04, vol: 0.07, wave: 'p25', d: 0.04, s: 0.4, r: 0.07, echo: n === 2 ? 0.3 : 0 }));
  }
  /** 商品ができあがった */
  complete(v = 1): void {
    if (!this.gate('complete', 120)) return;
    const t = this.e.now;
    [0, 1, 2, 3].forEach((i, n) => {
      this.tn({ t: t + n * 0.06, m: this.ct(i, 5), dur: 0.05, vol: 0.11 * v, wave: 'tri', d: 0.05, s: 0.4, r: 0.1, echo: 0.3 });
      this.tn({ t: t + n * 0.06, m: this.ct(i, 6), dur: 0.03, vol: 0.04 * v, wave: 'p12', r: 0.06, pan: n % 2 ? 0.4 : -0.4 });
    });
    this.nz({ t, dur: 0.02, vol: 0.07 * v, hp: 3000, seed: 0.9 });
  }
  /** 地図で 1 つ売れた（よく鳴るので小さく） */
  sale(): void {
    if (!this.gate('sale', 160)) return;
    const t = this.e.now;
    const i = this.seq++ % 3;
    this.tn({ t, m: this.ct(i, 6), dur: 0.03, vol: 0.055, wave: 'p25', d: 0.04, s: 0.3, r: 0.07, pan: this.jit(0.5), echo: 0.2 });
    this.tn({ t: t + 0.05, m: this.ct(i + 1, 6), dur: 0.04, vol: 0.055, wave: 'p25', d: 0.05, s: 0.3, r: 0.1, pan: this.jit(0.5), echo: 0.2 });
  }

  // ---- 順位・制覇
  rankup(): void {
    const t = this.e.now;
    const h = this.music.harmony(t);
    // 和音の根音から音階を駆け上がって、高い和音で決める
    const start = SCALE.indexOf(h.root) >= 0 ? SCALE.indexOf(h.root) : 0;
    for (let n = 0; n < 8; n++) this.tn({ t: t + n * 0.045, m: this.sc(start + n, 5, SCALE), dur: 0.04, vol: 0.06, wave: 'p25', r: 0.05, pan: -0.5 + n * 0.14 });
    const at = t + 8 * 0.045;
    [0, 1, 2, 3].forEach((i) => this.tn({ t: at, m: this.ct(i, 5, at), dur: 0.4, vol: 0.06, wave: i % 2 ? 'p50' : 'p25', d: 0.3, s: 0.4, r: 0.3, echo: 0.3, pan: (i - 1.5) * 0.3, vib: { depth: 8, delay: 0.1 } }));
    this.nz({ t: at, dur: 0.5, vol: 0.06, hp: 5200, seed: 0.5 });
    this.tn({ t: at, f: 130, to: 50, toT: 0.15, dur: 0.15, vol: 0.3, wave: 'sin', r: 0.08 });
  }
  /** 制覇の一撃（曲のファンファーレの頭に重ねる） */
  conquest(t?: number): void {
    const at = t ?? this.e.now;
    this.nz({ t: at, dur: 1.3, vol: 0.12, hp: 4200, seed: 0.6 });
    this.tn({ t: at, f: 110, to: 38, toT: 0.4, dur: 0.4, vol: 0.5, wave: 'sin', r: 0.2 });
    this.nz({ t: at, dur: 0.12, vol: 0.35, lp: 900, seed: 0.2 });
  }
  /** 小太鼓の連打（from から to へ、だんだん強く・細かく） */
  roll(from: number, to: number): void {
    const n = Math.max(6, Math.round((to - from) / 0.06));
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const t = from + (to - from) * (1 - Math.pow(1 - k, 1.25));
      this.nz({ t, dur: 0.05, vol: 0.04 + 0.1 * k, bp: 1900, q: 0.8, seed: i * 0.07 });
    }
  }
  /** 花火 */
  firework(v = 1): void {
    if (!this.gate('fw', 110)) return;
    const t = this.e.now;
    this.nz({ t, dur: 0.3, vol: 0.07 * v, bp: 2400, sweep: 500, q: 0.6, seed: this.rnd() });
    this.tn({ t, m: this.ct(Math.floor(this.rnd() * 4), 6), dur: 0.05, vol: 0.03 * v, wave: 'p12', r: 0.2, echo: 0.4, pan: this.jit(0.7) });
  }

  // ---- 喋る字（人ごとに波形と高さが違う。音階の音だけを使う）
  speak(v: Voice, ch: string): void {
    if (!this.gate('speak', 34)) return;
    if (/[、。！？\s…「」・]/.test(ch)) return;
    const t = this.e.now;
    const code = ch.codePointAt(0) ?? 0;
    const step = ((code * 7) % 5) - 2 + (this.rnd() < 0.25 ? 1 : 0);
    const m = this.sc(v.deg + step, v.oct);
    this.tn({ t, m, dur: v.len ?? 0.04, vol: (v.vol ?? 0.06) * 1.5, wave: v.wave, a: 0.003, d: 0.03, s: 0.5, r: 0.03, det: this.jit(6) });
  }

  // ---- つまみ・切り替え
  slider(p: number): void {
    if (!this.gate('slider', 30)) return;
    const t = this.e.now;
    this.nz({ t, dur: 0.006, vol: 0.09, hp: 3000, seed: p });
    this.tn({ t, m: this.sc(Math.round(p * 10), 5), dur: 0.03, vol: 0.055, wave: 'tri', r: 0.04 });
  }
  toggle(on: boolean): void {
    const t = this.e.now;
    this.nz({ t, dur: 0.02, vol: 0.22, bp: 1300, q: 1.5, seed: on ? 0.1 : 0.6 });
    this.tn({ t, f: 170, to: 80, toT: 0.04, dur: 0.04, vol: 0.14, wave: 'tri', r: 0.02 });
    const a = on ? [0, 2] : [2, 0];
    a.forEach((i, n) => this.tn({ t: t + 0.02 + n * 0.05, m: this.ct(i, 5), dur: 0.04, vol: 0.06, wave: 'p25', r: 0.05 }));
  }
  /** 順位の札がめくれる・日付が変わるなど、小さな機械の音 */
  flap(): void {
    if (!this.gate('flap', 50)) return;
    const t = this.e.now;
    this.nz({ t, dur: 0.015, vol: 0.22, bp: 2200, q: 2, seed: this.rnd() });
    this.tn({ t, f: 190, to: 110, toT: 0.02, dur: 0.02, vol: 0.05, wave: 'tri', r: 0.02 });
  }
  /** 月の締めの鐘 */
  bell(): void {
    const t = this.e.now;
    (
      [
        [2, 0],
        [0, 0.16],
        [2, 0.32],
        [3, 0.48],
      ] as const
    ).forEach(([i, dt]) => this.tn({ t: t + dt, m: this.ct(i, 5, t), dur: 0.12, vol: 0.12, wave: 'tri', d: 0.12, s: 0.3, r: 0.3, echo: 0.35 }));
  }
  /** 制覇までのランプが 1 つ点く */
  streak(i: number): void {
    const t = this.e.now;
    this.tn({ t, m: this.sc(i, 5), dur: 0.05, vol: 0.06, wave: 'p25', d: 0.06, s: 0.3, r: 0.1, echo: 0.25 });
    this.nz({ t, dur: 0.006, vol: 0.05, hp: 5000, seed: i * 0.1 });
  }
  /** 電源を入れる（はじまり） */
  boot(): void {
    const t = this.e.now;
    this.nz({ t, dur: 0.03, vol: 0.4, lp: 1400, seed: 0.3 });
    this.tn({ t, f: 150, to: 60, toT: 0.05, dur: 0.05, vol: 0.3, wave: 'tri' });
    this.tn({ t: t + 0.05, f: 55, to: 880, toT: 0.5, dur: 0.5, vol: 0.05, wave: 'sin', a: 0.05, r: 0.2 });
    this.nz({ t: t + 0.06, dur: 0.35, vol: 0.05, hp: 3000, seed: 0.8 });
    (
      [
        [60, 0.62],
        [64, 0.72],
        [67, 0.82],
        [72, 0.94],
      ] as const
    ).forEach(([m, dt]) => this.tn({ t: t + dt, m, dur: 0.06, vol: 0.07, wave: 'p25', d: 0.06, s: 0.4, r: 0.12, echo: 0.3 }));
  }
  /** 帯が「ガチャ」とはまる */
  dock(v = 1): void {
    const t = this.e.now;
    this.nz({ t, dur: 0.04, vol: 0.3 * v, lp: 1600, seed: 0.45 });
    this.tn({ t, f: 130, to: 55, toT: 0.07, dur: 0.07, vol: 0.28 * v, wave: 'sin', r: 0.04 });
    this.nz({ t: t + 0.01, type: 'metal', rate: 1.1, dur: 0.03, vol: 0.06 * v, hp: 2400 });
  }

  // ================================================================ 足した音（見本に無い場面。同じ音色の決まりで）

  /** 建てる：槌の「トン、トン」のあと、土台が「ガチャ」とはまって、和音の 2 音が立つ */
  build(): void {
    const t = this.e.now;
    [0, 0.13].forEach((dt, n) => {
      this.nz({ t: t + dt, dur: 0.03, vol: 0.2, bp: 900 + n * 150, q: 1.2, seed: 0.33 + n * 0.2 });
      this.tn({ t: t + dt, f: 180 + n * 20, to: 90 + n * 10, toT: 0.05, dur: 0.05, vol: 0.18, wave: 'tri', r: 0.03 });
    });
    const at = t + 0.28;
    this.nz({ t: at, dur: 0.04, vol: 0.28, lp: 1600, seed: 0.45 });
    this.tn({ t: at, f: 130, to: 55, toT: 0.07, dur: 0.07, vol: 0.26, wave: 'sin', r: 0.04 });
    this.nz({ t: at + 0.01, type: 'metal', rate: 1.1, dur: 0.03, vol: 0.05, hp: 2400 });
    [0, 2].forEach((i, n) => this.tn({ t: at + 0.02 + n * 0.055, m: this.ct(i, 5, at), dur: 0.05, vol: 0.065, wave: 'p25', d: 0.05, s: 0.35, r: 0.1, echo: 0.25, pan: n ? 0.25 : -0.25 }));
  }
  /** 建物の完成：土台がはまる音のあと、できあがりの 4 音 */
  built(): void {
    this.dock(0.8);
    const keep = this.e.fakeNow;
    // できあがりの 4 音は、はまった音の少しあとから
    this.e.fakeNow = this.e.now + 0.07;
    this.complete(1);
    this.e.fakeNow = keep;
  }
  /** 誤り（保存できない・操作が通らなかった）：低い同じ高さを 2 回。責めない大きさで、「足りない」（deny）とは形を変える */
  error(): void {
    const t = this.e.now;
    const m = this.ct(0, 3);
    [0, 0.11].forEach((dt, n) => {
      this.tn({ t: t + dt, m, dur: n ? 0.1 : 0.07, vol: 0.17, wave: 'tri', a: 0.008, r: n ? 0.1 : 0.05 });
      this.tn({ t: t + dt, m: m + 12, dur: 0.05, vol: 0.026, wave: 'p50', a: 0.008, r: 0.04 });
      this.nz({ t: t + dt, dur: 0.03, vol: 0.06, lp: 700, seed: 0.3 + n * 0.2 });
    });
  }
  /** 発掘のマスを打つ：低い「ゴツッ」と、土が崩れる「ザッ」。depth（0〜）が深いほど低く重い */
  dig(v = 1, depth = 0): void {
    if (!this.gate('dig', 40)) return;
    const t = this.e.now;
    const k = Math.pow(2, -Math.max(0, Math.min(8, depth)) / 12);
    // よく続けて鳴るので、帯のはまる音（dock）より小さく。小さなスピーカーでも聞こえるよう、三角波の胴と崩れる土を重ねる
    this.tn({ t, f: 110 * k, to: 48 * k, toT: 0.09, dur: 0.09, vol: 0.22 * v, wave: 'sin', a: 0.002, r: 0.05 });
    this.tn({ t, f: 190 * k, to: 95 * k, toT: 0.04, dur: 0.04, vol: 0.1 * v, wave: 'tri', r: 0.03 });
    this.nz({ t, dur: 0.03, vol: 0.14 * v, lp: 900, seed: this.rnd() });
    this.nz({ t: t + 0.02, dur: 0.16, vol: 0.07 * v, bp: 1400, sweep: 500, q: 0.7, seed: this.rnd() });
    this.tn({ t, m: this.ct(0, 3), dur: 0.03, vol: 0.05 * v, wave: 'tri', r: 0.04 });
  }
  /** つるはしが石に当たる「カツン」：金物のノイズと、高い三角波の響き */
  clink(v = 1): void {
    if (!this.gate('clink', 40)) return;
    const t = this.e.now;
    this.nz({ t, type: 'metal', rate: 2.2, dur: 0.06, vol: 0.12 * v, hp: 3200, seed: 0.15 });
    this.tn({ t, f: 190, to: 120, toT: 0.02, dur: 0.02, vol: 0.08 * v, wave: 'tri', r: 0.02 });
    this.tn({ t, m: this.ct(2, 7), dur: 0.03, vol: 0.05 * v, wave: 'tri', r: 0.14, echo: 0.3, pan: this.jit(0.3) });
  }
}
