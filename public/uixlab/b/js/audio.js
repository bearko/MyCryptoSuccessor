// 号外の音。WebAudio でぜんぶ合成する（素材のファイルは使わない）。
// 経路：音源 → BGM のバス・SE のバス → まとめの音量 → コンプレッサー → やわらかい天井（±0.95 を超えない）→ 出力。
// SE の音程は、いま鳴っている BGM の和音から選ぶ（押すたびに曲に溶ける）。

export const BPM = 116;
const STEP = 60 / BPM / 4; // 16 分音符
const SWING = 0.57; // 16 分の跳ね
const BAR = STEP * 16;

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// 和音（8 小節でひと回り）。root は MIDI、pent は SE と旋律が使う 5 音（ピッチクラス）
const CH = {
  Dm9: { root: 38, tones: [62, 65, 69, 72, 76], guide: [65, 72, 76], pent: [2, 5, 7, 9, 0] },
  G13: { root: 43, tones: [62, 65, 67, 71, 76], guide: [65, 71, 76], pent: [7, 9, 11, 2, 4] },
  Bb: { root: 34, tones: [62, 65, 69, 70, 74], guide: [62, 69, 74], pent: [10, 0, 2, 5, 7], up: 9 },
  C9: { root: 36, tones: [62, 64, 67, 70, 76], guide: [64, 70, 74], pent: [0, 2, 4, 7, 9] },
  A7: { root: 33, tones: [61, 64, 67, 69, 73], guide: [61, 67, 73], pent: [9, 1, 4, 7, 11] },
  // 祝い（同主調の長調）
  D: { root: 38, tones: [62, 66, 69, 74, 78], guide: [66, 69, 74], pent: [2, 4, 6, 9, 11] },
  G: { root: 43, tones: [62, 67, 71, 74, 79], guide: [67, 71, 74], pent: [7, 9, 11, 2, 4] },
  A: { root: 45, tones: [61, 64, 69, 73, 76], guide: [64, 69, 73], pent: [9, 11, 1, 4, 6] },
  Bm: { root: 35, tones: [62, 66, 71, 74, 78], guide: [62, 66, 71], pent: [11, 2, 4, 6, 9] },
};
const PROG = {
  map: ['Dm9', 'G13', 'Dm9', 'G13', 'Bb', 'C9', 'Dm9', 'A7'],
  report: ['Dm9', 'Dm9', 'Bb', 'C9', 'Dm9', 'Dm9', 'Bb', 'A7'],
  fete: ['D', 'G', 'D', 'A', 'Bm', 'G', 'A', 'D'],
};

// 旋律（5 層め）。[小節, 16 分の位置, MIDI, 長さ（16 分）]
const LEAD = [
  [0, 0, 69, 3], [0, 3, 72, 3], [0, 6, 74, 4], [0, 12, 72, 2], [0, 14, 69, 2],
  [1, 4, 71, 2], [1, 6, 74, 2], [1, 8, 76, 5],
  [2, 0, 77, 3], [2, 3, 74, 3], [2, 6, 72, 2], [2, 8, 69, 4], [2, 14, 67, 2],
  [3, 2, 67, 2], [3, 4, 69, 2], [3, 6, 71, 2], [3, 10, 74, 5],
  [4, 0, 74, 3], [4, 3, 77, 3], [4, 6, 79, 4], [4, 12, 77, 3],
  [5, 0, 76, 3], [5, 4, 74, 2], [5, 6, 72, 2], [5, 10, 76, 2], [5, 12, 79, 3],
  [6, 0, 81, 5], [6, 6, 77, 2], [6, 8, 74, 3], [6, 11, 72, 3],
  [7, 0, 73, 3], [7, 4, 76, 3], [7, 8, 69, 6],
];
// 管の合いの手（4 層め）。[小節, 位置, 長さ, 強さ]
const HORN = [
  [0, 10, 1, 0.8], [0, 12, 2, 1], [1, 6, 1, 0.7], [1, 7, 3, 1],
  [2, 10, 1, 0.8], [2, 12, 2, 1], [3, 12, 1, 0.8], [3, 14, 2, 1],
  [4, 0, 2, 1], [4, 10, 1, 0.7], [5, 6, 1, 0.8], [5, 8, 3, 1],
  [6, 10, 1, 0.8], [6, 12, 2, 1], [7, 4, 1, 0.8], [7, 6, 1, 0.9], [7, 8, 5, 1],
];
// 祝いの旋律（管）
const FETE = [
  [0, 0, 74, 3], [0, 3, 74, 1], [0, 4, 78, 4], [0, 8, 81, 6], [0, 14, 78, 2],
  [1, 0, 79, 4], [1, 4, 83, 4], [1, 8, 86, 8],
  [2, 0, 86, 3], [2, 3, 85, 1], [2, 4, 86, 4], [2, 8, 81, 4], [2, 12, 78, 4],
  [3, 0, 76, 4], [3, 4, 81, 4], [3, 8, 85, 8],
  [4, 0, 86, 6], [4, 6, 83, 2], [4, 8, 78, 4], [4, 12, 83, 4],
  [5, 0, 83, 3], [5, 3, 81, 1], [5, 4, 79, 4], [5, 8, 86, 8],
  [6, 0, 85, 4], [6, 4, 81, 4], [6, 8, 88, 4], [6, 12, 85, 4],
  [7, 0, 86, 10],
];

function makeNoise(ctx) {
  const len = Math.floor(ctx.sampleRate * 2);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 22222;
  for (let i = 0; i < len; i++) {
    s = (s * 16807) % 2147483647;
    d[i] = (s / 2147483647) * 2 - 1;
  }
  return b;
}
function makeIR(ctx) {
  const len = Math.floor(ctx.sampleRate * 1.1);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  let s = 777;
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) {
      s = (s * 16807) % 2147483647;
      const t = i / len;
      d[i] = ((s / 2147483647) * 2 - 1) * Math.pow(1 - t, 3.2) * (i < 400 ? i / 400 : 1);
    }
  }
  return b;
}

/** 音のエンジン。AudioContext でも OfflineAudioContext でも同じに動く。 */
export function createEngine(ctx) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 5;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  // やわらかい天井：小さい音はそのまま通し、大きな一打だけを丸めて ±0.95 に収める（音量を最大にしても割れない）
  const outGain = ctx.createGain();
  outGain.gain.value = 0.534;
  const ceil = ctx.createWaveShaper();
  const curve = new Float32Array(2049);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = (0.95 * Math.tanh(1.5 * x)) / Math.tanh(1.5);
  }
  ceil.curve = curve;
  ceil.oversample = '4x';
  const master = ctx.createGain();
  master.connect(comp);
  comp.connect(outGain);
  outGain.connect(ceil);
  ceil.connect(ctx.destination);
  const bgm = ctx.createGain();
  const se = ctx.createGain();
  const bgmDuck = ctx.createGain();
  bgm.connect(bgmDuck);
  bgmDuck.connect(master);
  se.connect(master);
  bgm.gain.value = 0.62;
  se.gain.value = 0.8;
  const rev = ctx.createConvolver();
  rev.buffer = makeIR(ctx);
  const sendB = ctx.createGain();
  const sendS = ctx.createGain();
  sendB.connect(rev);
  sendS.connect(rev);
  const revOutB = ctx.createGain();
  rev.connect(revOutB);
  // 残響は BGM のバスへ（SE の残響もここへ混ぜる。量は小さい）
  revOutB.gain.value = 0.5;
  revOutB.connect(bgmDuck);
  const NOISE = makeNoise(ctx);

  // ---------------------------------------------------------------- 音の部品
  const env = (g, t, a, peak, d, sus = 0.0001) => {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus), t + a + d);
  };
  function tone(dest, t, { f, type = 'sine', a = 0.002, d = 0.1, v = 0.3, slide = 0, slideT = 0.05, det = 0, lp = 0, q = 0.7, lpTo = 0, hp = 0 }) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + slideT);
    if (det) o.detune.value = det;
    const g = ctx.createGain();
    env(g, t, a, v, d);
    let last = o;
    if (lp) {
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.setValueAtTime(lp, t);
      if (lpTo) fl.frequency.exponentialRampToValueAtTime(lpTo, t + a + d);
      fl.Q.value = q;
      last.connect(fl);
      last = fl;
    }
    if (hp) {
      const fh = ctx.createBiquadFilter();
      fh.type = 'highpass';
      fh.frequency.value = hp;
      last.connect(fh);
      last = fh;
    }
    last.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + a + d + 0.05);
    return g;
  }
  function noise(dest, t, { type = 'highpass', f = 6000, fTo = 0, q = 0.8, a = 0.001, d = 0.05, v = 0.2, off = 0 }) {
    const s = ctx.createBufferSource();
    s.buffer = NOISE;
    s.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(f, t);
    if (fTo) fl.frequency.exponentialRampToValueAtTime(fTo, t + a + d);
    fl.Q.value = q;
    const g = ctx.createGain();
    env(g, t, a, v, d);
    s.connect(fl);
    fl.connect(g);
    g.connect(dest);
    s.start(t, off % 1.9);
    s.stop(t + a + d + 0.05);
    return g;
  }

  // ---------------------------------------------------------------- 楽器
  const kick = (dest, t, v = 1) => {
    tone(dest, t, { f: 150, slide: 0.3, slideT: 0.11, d: 0.22, v: 0.95 * v });
    tone(dest, t, { f: 62, type: 'triangle', d: 0.16, v: 0.35 * v });
    noise(dest, t, { type: 'bandpass', f: 3200, q: 1.2, d: 0.012, v: 0.22 * v });
  };
  const snare = (dest, t, v = 1) => {
    noise(dest, t, { type: 'bandpass', f: 2400, q: 0.7, d: 0.13, v: 0.5 * v, off: 0.3 });
    noise(dest, t, { type: 'highpass', f: 6500, d: 0.07, v: 0.22 * v, off: 0.9 });
    tone(dest, t, { f: 235, slide: 0.72, slideT: 0.06, type: 'triangle', d: 0.09, v: 0.4 * v });
  };
  const hat = (dest, t, v = 1, open = false) => {
    noise(dest, t, { type: 'highpass', f: 8200, d: open ? 0.22 : 0.035, v: 0.16 * v, off: 1.1 });
    noise(dest, t, { type: 'bandpass', f: 10500, q: 2.5, d: open ? 0.16 : 0.025, v: 0.1 * v, off: 0.5 });
  };
  const clap = (dest, t, v = 1) => {
    for (let i = 0; i < 3; i++) noise(dest, t + i * 0.011, { type: 'bandpass', f: 1500, q: 1.1, d: i === 2 ? 0.12 : 0.016, v: 0.3 * v, off: i * 0.37 });
  };
  const rim = (dest, t, v = 1, f = 1750) => {
    tone(dest, t, { f, type: 'triangle', d: 0.03, v: 0.3 * v });
    tone(dest, t, { f: f * 0.56, type: 'square', d: 0.018, v: 0.08 * v, lp: 3000 });
    noise(dest, t, { type: 'bandpass', f: 4200, q: 2, d: 0.01, v: 0.16 * v });
  };
  const shaker = (dest, t, v = 1) => noise(dest, t, { type: 'bandpass', f: 7200, q: 1.4, a: 0.012, d: 0.04, v: 0.1 * v, off: 1.4 });
  const tamb = (dest, t, v = 1) => {
    noise(dest, t, { type: 'highpass', f: 9000, a: 0.002, d: 0.09, v: 0.1 * v, off: 0.2 });
    tone(dest, t, { f: 6400, type: 'square', d: 0.05, v: 0.012 * v });
  };
  const tom = (dest, t, f = 120, v = 1) => {
    tone(dest, t, { f: f * 1.5, slide: 0.66, slideT: 0.09, d: 0.2, v: 0.6 * v });
    noise(dest, t, { type: 'bandpass', f: 900, q: 1, d: 0.03, v: 0.12 * v });
  };
  const crash = (dest, t, v = 1, d = 1.3) => {
    noise(dest, t, { type: 'highpass', f: 5200, d, v: 0.26 * v, off: 0.7 });
    noise(dest, t, { type: 'bandpass', f: 8200, q: 3, d: d * 0.7, v: 0.12 * v, off: 0.1 });
  };
  const bass = (dest, t, n, len, v = 1) => {
    const f = midi(n);
    const d = Math.max(0.09, len * STEP * 0.82);
    tone(dest, t, { f, type: 'sawtooth', a: 0.004, d, v: 0.36 * v, lp: 1500, lpTo: 320, q: 3.2 });
    tone(dest, t, { f, type: 'sine', a: 0.004, d: d * 1.05, v: 0.3 * v });
    tone(dest, t, { f: f * 2, type: 'square', a: 0.002, d: Math.min(d, 0.12), v: 0.07 * v, lp: 2200 });
  };
  const clav = (dest, t, notes, v = 1) => {
    for (const n of notes) {
      tone(dest, t, { f: midi(n), type: 'square', a: 0.002, d: 0.085, v: 0.07 * v, lp: 3400, lpTo: 900, q: 2.4, hp: 320 });
      tone(dest, t, { f: midi(n) * 2.001, type: 'sawtooth', a: 0.002, d: 0.04, v: 0.022 * v, hp: 900 });
    }
  };
  const keys = (dest, t, notes, len, v = 1) => {
    // やわらかい鍵盤（報告の場面）
    for (const n of notes) {
      const f = midi(n);
      tone(dest, t, { f, type: 'sine', a: 0.006, d: len, v: 0.1 * v });
      tone(dest, t, { f: f * 2, type: 'sine', a: 0.004, d: len * 0.4, v: 0.035 * v });
      tone(dest, t, { f: f * 4.01, type: 'sine', a: 0.002, d: 0.06, v: 0.02 * v });
    }
  };
  const horn = (dest, t, notes, len, v = 1, send = null) => {
    const d = Math.max(0.07, len * STEP * 0.9);
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(dest);
    if (send) out.connect(send);
    for (const n of notes) {
      const f = midi(n);
      for (const det of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.detune.value = det;
        o.frequency.setValueAtTime(f * 0.972, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.028);
        const fl = ctx.createBiquadFilter();
        fl.type = 'lowpass';
        fl.Q.value = 1.6;
        fl.frequency.setValueAtTime(500, t);
        fl.frequency.exponentialRampToValueAtTime(2600 + 900 * v, t + 0.03);
        fl.frequency.exponentialRampToValueAtTime(1100, t + d + 0.02);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.085 * v, t + 0.014);
        g.gain.setValueAtTime(0.07 * v, t + Math.max(0.02, d - 0.03));
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.05);
        o.connect(fl);
        fl.connect(g);
        g.connect(out);
        o.start(t);
        o.stop(t + d + 0.1);
      }
    }
  };
  const lead = (dest, t, n, len, v = 1, send = null) => {
    // 口笛とミュートした管のあいだ：三角波＋細い帯域、ゆるいビブラート
    const f = midi(n);
    const d = len * STEP * 0.92;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f * 0.985, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.6;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(d, 0.3));
    lfo.connect(lg);
    lg.connect(o.frequency);
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = f;
    const g2 = ctx.createGain();
    g2.gain.value = 0.22;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16 * v, t + 0.02);
    g.gain.setValueAtTime(0.13 * v, t + Math.max(0.03, d - 0.04));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.06);
    o.connect(bp);
    o2.connect(g2);
    g2.connect(bp);
    bp.connect(g);
    g.connect(dest);
    if (send) g.connect(send);
    o.start(t);
    o2.start(t);
    lfo.start(t);
    o.stop(t + d + 0.1);
    o2.stop(t + d + 0.1);
    lfo.stop(t + d + 0.1);
  };

  // ---------------------------------------------------------------- 曲（1 小節ぶんを予約する）
  const st = (t0, s) => t0 + s * STEP + (s % 2 ? (2 * SWING - 1) * STEP : 0);

  function barMap(t0, bar, layers) {
    const k = bar % 8;
    const ch = CH[PROG.map[k]];
    const next = CH[PROG.map[(k + 1) % 8]];
    const D = bgm;
    // 1 層め：キック・ハット・ベース
    const kicks = k % 2 === 0 ? [0, 6, 10] : [0, 3, 10, 13];
    for (const s of kicks) kick(D, st(t0, s), s === 0 ? 0.78 : 0.62);
    for (let s = 0; s < 16; s += 2) hat(D, st(t0, s), s % 4 === 2 ? 1.7 : 1);
    const r = ch.root;
    const up = ch.up ?? 10; // 経過の音（ふつうは短 7 度。長調の和音は 6 度）
    const appr = next.root > r ? next.root - 1 : next.root + 1;
    const line = k % 2 === 0
      ? [[0, r, 2], [3, r + 12, 1], [6, r, 2], [10, r + 7, 1], [11, r + 12, 1], [14, r + up, 1]]
      : [[0, r, 2], [3, r + 12, 1], [5, r + 7, 1], [8, r, 2], [11, r + 12, 1], [13, r + up, 1], [15, appr, 1]];
    for (const [s, n, l] of line) bass(D, st(t0, s), n, l, s === 0 ? 0.86 : 0.74);
    // 2 層め：スネア・16 分のハット・ゴーストノート
    if (layers >= 2) {
      snare(D, st(t0, 4), 1.35);
      snare(D, st(t0, 12), 1.45);
      snare(D, st(t0, 7), 0.24);
      snare(D, st(t0, 9), 0.3);
      if (k % 2) snare(D, st(t0, 15), 0.45);
      for (let s = 1; s < 16; s += 2) hat(D, st(t0, s), 0.6);
      if (k % 2) hat(D, st(t0, 14), 1.4, true);
      if (k === 7) { tom(D, st(t0, 13), 150, 0.7); tom(D, st(t0, 14), 120, 0.8); tom(D, st(t0, 15), 95, 0.9); }
    } else {
      rim(D, st(t0, 4), 1, 1400);
      rim(D, st(t0, 12), 1.15, 1400);
    }
    // 3 層め：刻み（クラビのような撥弦）
    if (layers >= 3) {
      const pat = k % 2 === 0 ? [2, 5, 8, 11, 13] : [1, 4, 7, 10, 14];
      for (const s of pat) clav(D, st(t0, s), ch.guide, s % 4 === 1 ? 2.9 : 2.3);
      for (let s = 0; s < 16; s += 4) shaker(D, st(t0, s + 2), 1.6);
    }
    // 4 層め：管の合いの手
    if (layers >= 4) for (const [b, s, l, v] of HORN) if (b === k) horn(D, st(t0, s), ch.guide, l, 1.3 * v, sendB);
    // 5 層め：旋律とタンバリン
    if (layers >= 5) {
      for (const [b, s, n, l] of LEAD) if (b === k) lead(D, st(t0, s), n, l, 1.6, sendB);
      for (let s = 0; s < 16; s += 2) tamb(D, st(t0, s), s % 4 === 2 ? 1.5 : 0.8);
      if (k === 0) crash(D, t0, 0.5, 0.9);
    }
  }
  function barReport(t0, bar) {
    // 報告：音数を引いて、数字の出る余白を空ける。足もとは同じ調・同じ速さ
    const k = bar % 8;
    const ch = CH[PROG.report[k]];
    const D = bgm;
    kick(D, st(t0, 0), 0.7);
    kick(D, st(t0, 10), 0.55);
    for (let s = 0; s < 16; s += 2) shaker(D, st(t0, s), s % 4 === 2 ? 2.2 : 1.3);
    rim(D, st(t0, 4), 0.9, 1300);
    rim(D, st(t0, 12), 1, 1300);
    rim(D, st(t0, 15), 0.5, 1700);
    const r = ch.root;
    for (const [s, n, l] of [[0, r, 3], [6, r + 12, 1], [8, r + 7, 2], [14, r + (ch.up ?? 10), 1]]) bass(D, st(t0, s), n, l, 0.7);
    keys(D, st(t0, 0), ch.guide, 1.3, 2.2);
    keys(D, st(t0, 7), ch.guide, 0.5, 1.5);
    keys(D, st(t0, 10), [ch.guide[2] + 12], 0.6, 1.2);
    if (k % 4 === 3) for (let i = 0; i < 4; i++) tom(D, st(t0, 12 + i), 110 + i * 14, 0.35 + i * 0.1);
  }
  function barFete(t0, bar) {
    // 祝い：長調に上がって、管が主旋律を吹く
    const k = bar % 8;
    const ch = CH[PROG.fete[k]];
    const D = bgm;
    for (const s of [0, 3, 6, 8, 11, 14]) kick(D, st(t0, s), s === 0 || s === 8 ? 0.78 : 0.55);
    snare(D, st(t0, 4), 1.3);
    snare(D, st(t0, 12), 1.3);
    clap(D, st(t0, 4), 0.7);
    clap(D, st(t0, 12), 0.7);
    for (const s of [7, 13, 15]) snare(D, st(t0, s), 0.25);
    for (let s = 0; s < 16; s++) hat(D, st(t0, s), s % 4 === 2 ? 1.5 : s % 2 ? 0.5 : 0.9, s === 14);
    for (let s = 0; s < 16; s += 2) tamb(D, st(t0, s), 1);
    if (k % 4 === 0) crash(D, t0, 0.8, 1.6);
    const r = ch.root;
    for (const [s, n, l] of [[0, r, 2], [3, r + 12, 1], [6, r + 7, 2], [8, r, 2], [11, r + 12, 1], [14, r + 7, 2]]) bass(D, st(t0, s), n, l, 0.8);
    for (const s of [2, 5, 10, 13]) clav(D, st(t0, s), ch.guide, 2.4);
    for (const [b, s, n, l] of FETE) if (b === k) horn(D, st(t0, s), [n - 12, n], l, 1.5, sendB);
    for (const s of [0, 8]) horn(D, st(t0, s), ch.guide.map((n) => n - 12), 2, 0.8, sendB);
  }

  // ---------------------------------------------------------------- 進行（小節の頭で切り替える）
  const S = { mode: 'map', want: 'map', layers: 1, wantLayers: 1, bar: 0, step: 0, t0: 0, running: false, nextBar: 0, feteLeft: 0, after: 'map' };
  const beatSubs = new Set();
  function scheduleBar(t0) {
    if (S.want !== S.mode) {
      S.mode = S.want;
      S.bar = 0;
    }
    if (S.mode === 'fete') {
      if (S.feteLeft <= 0) {
        S.mode = S.want = S.after;
        S.bar = 0;
      } else S.feteLeft--;
    }
    S.layers = S.wantLayers;
    if (S.mode === 'map') barMap(t0, S.bar, S.layers);
    else if (S.mode === 'report') barReport(t0, S.bar);
    else if (S.mode === 'fete') barFete(t0, S.bar);
    S.t0 = t0;
    S.curBar = S.bar;
    S.curMode = S.mode;
    S.bar++;
  }
  function chordAt(t) {
    const mode = S.curMode ?? 'map';
    const bar = t >= S.t0 + BAR ? (S.curBar ?? 0) + 1 : S.curBar ?? 0;
    return CH[PROG[mode === 'silent' ? 'map' : mode][((bar % 8) + 8) % 8]];
  }
  /** いまの和音の 5 音から、基準の高さ（MIDI）の近くで i 番めの音を返す。 */
  function note(i = 0, base = 72, t = ctx.currentTime) {
    const ch = chordAt(t);
    const p = ch.pent;
    const oct = Math.floor(i / 5);
    const pc = p[((i % 5) + 5) % 5];
    let n = base - (base % 12) + pc + oct * 12;
    if (pc < p[0]) n += 12;
    return n;
  }

  // ---------------------------------------------------------------- SE
  let seq = 0;
  const jit = (c = 14) => (Math.random() * 2 - 1) * c; // セント
  const vj = () => 0.88 + Math.random() * 0.24;
  const SE = {
    /** 押す：木の縁を叩く短い一打（和音の音に寄せる） */
    tap(t) {
      const n = note((seq++ * 2) % 5, 84, t);
      tone(se, t, { f: midi(n), type: 'triangle', d: 0.04, v: 0.22 * vj(), det: jit() });
      tone(se, t, { f: midi(n - 12), type: 'square', d: 0.02, v: 0.05, lp: 2400 });
      noise(se, t, { type: 'bandpass', f: 3800 + Math.random() * 800, q: 2.2, d: 0.012, v: 0.2 * vj() });
    },
    release(t) {
      const n = note((seq * 2 + 1) % 5, 72, t);
      tone(se, t, { f: midi(n), type: 'triangle', d: 0.03, v: 0.09 * vj(), det: jit() });
      noise(se, t, { type: 'bandpass', f: 2400, q: 2, d: 0.008, v: 0.07 });
    },
    open(t) {
      noise(se, t, { type: 'bandpass', f: 500, fTo: 4200, q: 1.1, a: 0.05, d: 0.16, v: 0.2 });
      const a = note(0, 72, t), b = note(2, 72, t), c = note(4, 72, t);
      tone(se, t + 0.02, { f: midi(a), type: 'square', d: 0.07, v: 0.1, lp: 2600 });
      tone(se, t + 0.09, { f: midi(b), type: 'square', d: 0.07, v: 0.11, lp: 2800 });
      tone(se, t + 0.16, { f: midi(c), type: 'square', d: 0.14, v: 0.12, lp: 3200 });
      kick(se, t + 0.16, 0.5);
    },
    close(t) {
      noise(se, t, { type: 'bandpass', f: 3800, fTo: 420, q: 1.1, a: 0.01, d: 0.18, v: 0.18 });
      const a = note(3, 72, t), b = note(0, 72, t);
      tone(se, t + 0.01, { f: midi(a), type: 'square', d: 0.06, v: 0.09, lp: 2400 });
      tone(se, t + 0.08, { f: midi(b), type: 'square', d: 0.1, v: 0.1, lp: 2000 });
      tom(se, t + 0.1, 90, 0.4);
    },
    /** めくる：紙が空を切る音＋着地の一打 */
    page(t) {
      noise(se, t, { type: 'bandpass', f: 900, fTo: 5200, q: 0.8, a: 0.12, d: 0.26, v: 0.26 });
      noise(se, t + 0.05, { type: 'highpass', f: 5000, a: 0.08, d: 0.18, v: 0.07, off: 0.6 });
      const a = note(1, 72, t + 0.4), b = note(3, 72, t + 0.4);
      tom(se, t + 0.4, 100, 0.55);
      rim(se, t + 0.4, 0.8, midi(a + 12));
      tone(se, t + 0.4, { f: midi(b), type: 'triangle', d: 0.12, v: 0.12 });
    },
    tab(t) {
      rim(se, t, 0.8, midi(note(1, 84, t)));
      rim(se, t + 0.075, 0.7, midi(note(3, 84, t)));
      noise(se, t, { type: 'bandpass', f: 1200, fTo: 3600, q: 1, a: 0.03, d: 0.1, v: 0.09 });
    },
    /** 承認：この方向でいちばんの一打（刷る） */
    approve(t) {
      kick(se, t, 1.25);
      snare(se, t, 0.9);
      tone(se, t, { f: 55, slide: 0.5, slideT: 0.5, d: 0.6, v: 0.6 });
      crash(se, t, 0.95, 1.6);
      const ch = chordAt(t);
      horn(se, t, [ch.root + 24, ...ch.guide], 1.4, 1.25, sendS);
      horn(se, t + STEP * 2, [ch.root + 24, ...ch.guide.map((n) => n + 0)], 1.2, 1.1, sendS);
      horn(se, t + STEP * 4, [ch.root + 36, ...ch.guide.map((n) => n + 12)], 5, 1.3, sendS);
      snare(se, t + STEP * 2, 0.7);
      kick(se, t + STEP * 4, 1.1);
      clap(se, t + STEP * 4, 0.9);
      noise(se, t + STEP * 4, { type: 'bandpass', f: 600, fTo: 6000, q: 0.7, a: 0.02, d: 0.35, v: 0.14 });
    },
    /** 金貨：n が大きいほど音階を上がる（base は始まりの高さ。高くなりすぎて倍音が折り返さないよう、既定は低め） */
    coin(t, n = 0, v = 1, base = 72) {
      const m = Math.min(108, note(n, base, t));
      const f = midi(m);
      tone(se, t, { f, type: 'sine', d: 0.16, v: 0.16 * v * vj(), det: jit(8) });
      tone(se, t, { f: f * 2.76, type: 'sine', d: 0.08, v: 0.07 * v });
      tone(se, t, { f: f * 5.4, type: 'sine', d: 0.035, v: 0.03 * v });
      noise(se, t, { type: 'highpass', f: 9000, d: 0.012, v: 0.05 * v });
    },
    /** 入金 */
    credit(t) {
      SE.coin(t, 2, 0.9, 84);
      SE.coin(t + 0.07, 4, 1, 84);
      shaker(se, t + 0.07, 1.6);
      tone(se, t + 0.07, { f: midi(note(0, 60, t)), type: 'triangle', d: 0.12, v: 0.12 });
    },
    /** 断る：責めない。やわらかい 2 音が少しだけ下がる */
    deny(t) {
      const a = note(2, 60, t), b = note(1, 60, t);
      tone(se, t, { f: midi(a), type: 'sine', a: 0.012, d: 0.16, v: 0.2 });
      tone(se, t, { f: midi(a) * 2, type: 'sine', a: 0.012, d: 0.06, v: 0.04 });
      tone(se, t + 0.13, { f: midi(b), type: 'sine', a: 0.012, d: 0.24, v: 0.2 });
      tone(se, t + 0.13, { f: midi(b) * 2, type: 'sine', a: 0.012, d: 0.08, v: 0.04 });
      noise(se, t, { type: 'lowpass', f: 700, a: 0.01, d: 0.06, v: 0.06 });
    },
    /** 決定 */
    decide(t) {
      const a = note(0, 72, t), b = note(2, 72, t);
      rim(se, t, 0.9, midi(a + 12));
      tone(se, t, { f: midi(a), type: 'square', d: 0.07, v: 0.11, lp: 3000 });
      tone(se, t + 0.07, { f: midi(b), type: 'square', d: 0.16, v: 0.13, lp: 3400 });
      kick(se, t + 0.07, 0.55);
      hat(se, t + 0.07, 0.8, true);
    },
    /** 買った：重い一打と金貨 */
    buy(t) {
      kick(se, t, 1.1);
      clap(se, t, 0.8);
      const ch = chordAt(t);
      horn(se, t, ch.guide, 2, 1.1, sendS);
      SE.coin(t + 0.1, 3, 1, 79);
      SE.coin(t + 0.17, 5, 1, 79);
      SE.coin(t + 0.24, 7, 1, 79);
    },
    /** 完成：和音を駆け上がる 3 音 */
    complete(t, k = 0) {
      for (let i = 0; i < 3; i++) {
        const n = note(i * 2 + k, 72, t);
        tone(se, t + i * 0.06, { f: midi(n), type: 'triangle', d: 0.14, v: 0.14 });
        tone(se, t + i * 0.06, { f: midi(n) * 2, type: 'square', d: 0.05, v: 0.04, lp: 4000 });
      }
      rim(se, t, 0.8, 2100);
      noise(se, t + 0.12, { type: 'highpass', f: 7000, d: 0.12, v: 0.07 });
    },
    /** 順位が上がる */
    rankup(t) {
      for (let i = 0; i < 7; i++) {
        const n = note(i, 67, t);
        tone(se, t + i * 0.055, { f: midi(n), type: 'square', d: 0.08, v: 0.09, lp: 3400 });
        tone(se, t + i * 0.055, { f: midi(n) * 2, type: 'triangle', d: 0.05, v: 0.05 });
      }
      const at = t + 7 * 0.055;
      kick(se, at, 1.2);
      crash(se, at, 0.9, 1.4);
      clap(se, at, 1);
      const ch = chordAt(at);
      horn(se, at, [ch.root + 24, ...ch.guide, ch.guide[2] + 5], 5, 1.25, sendS);
    },
    /** 制覇の入り：スネアのロール → 一打 → 長調の和音 */
    conquer(t) {
      for (let i = 0; i < 12; i++) snare(se, t + i * 0.036, 0.25 + i * 0.055);
      noise(se, t, { type: 'bandpass', f: 400, fTo: 7000, q: 0.6, a: 0.4, d: 0.06, v: 0.2 });
      const at = t + 0.45;
      kick(se, at, 1.3);
      crash(se, at, 1.1, 2.4);
      tone(se, at, { f: 73.4, slide: 0.5, slideT: 0.6, d: 0.9, v: 0.6 });
      horn(se, at, [50, 62, 66, 69, 74], 3, 1.25, sendS);
      horn(se, at + STEP * 3, [50, 62, 66, 69, 74], 1, 1.1, sendS);
      horn(se, at + STEP * 4, [50, 66, 69, 74, 78], 9, 1.3, sendS);
      clap(se, at + STEP * 4, 1);
      kick(se, at + STEP * 4, 1.2);
      for (let i = 0; i < 6; i++) SE.coin(at + STEP * 4 + i * 0.07, 3 + i, 0.6, 79);
    },
    /** 喋る字：人ごとに声の高さと色が違う */
    voice(t, who = 0) {
      const V = [
        { base: 60, type: 'square', bp: 1100, v: 0.3 }, // 職人
        { base: 50, type: 'sawtooth', bp: 780, v: 0.36 }, // 部長
        { base: 69, type: 'triangle', bp: 1700, v: 0.7 }, // 案内役
      ][who] ?? { base: 60, type: 'square', bp: 1000, v: 0.08 };
      const n = note(Math.floor(Math.random() * 3), V.base, t);
      const o = ctx.createOscillator();
      o.type = V.type;
      o.frequency.setValueAtTime(midi(n) * 1.03, t);
      o.frequency.exponentialRampToValueAtTime(midi(n) * 0.97, t + 0.05);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = V.bp * (0.9 + Math.random() * 0.2);
      bp.Q.value = 1.4;
      const g = ctx.createGain();
      env(g, t, 0.006, V.v, 0.05);
      o.connect(bp);
      bp.connect(g);
      g.connect(se);
      o.start(t);
      o.stop(t + 0.1);
    },
    /** スライダーの目盛り：値の位置で音階を上がる */
    tick(t, i = 0) {
      const n = note(i, 72, t);
      tone(se, t, { f: midi(n), type: 'triangle', d: 0.04, v: 0.26 });
      noise(se, t, { type: 'bandpass', f: 5200, q: 3, d: 0.008, v: 0.14 });
    },
    thunk(t) {
      tom(se, t, 85, 0.5);
      rim(se, t, 0.5, 900);
    },
    toggle(t, on) {
      const a = note(on ? 0 : 2, 72, t), b = note(on ? 2 : 0, 72, t);
      rim(se, t, 0.9, midi(a + 12));
      tone(se, t + 0.06, { f: midi(b), type: 'square', d: 0.1, v: 0.1, lp: 3000 });
      if (on) hat(se, t + 0.06, 0.8, true);
    },
    /** 数字を叩きつける：活字が版に落ちる */
    slam(t, v = 1, hi = 0) {
      tom(se, t, 78 + hi * 6, 0.75 * v);
      noise(se, t, { type: 'bandpass', f: 2600, q: 1.4, d: 0.02, v: 0.2 * v });
      tone(se, t, { f: midi(note(hi, 60, t)), type: 'square', d: 0.05, v: 0.06 * v, lp: 1800 });
    },
    /** 斜めに切り裂く */
    slash(t) {
      noise(se, t, { type: 'bandpass', f: 6500, fTo: 700, q: 1.6, a: 0.015, d: 0.26, v: 0.42 });
      noise(se, t, { type: 'highpass', f: 8000, a: 0.01, d: 0.12, v: 0.13, off: 0.4 });
      tone(se, t, { f: 520, slide: 0.25, slideT: 0.22, type: 'sawtooth', d: 0.22, v: 0.05, lp: 1800 });
    },
    /** はじまりの一打 */
    start(t) {
      snare(se, t, 0.5);
      snare(se, t + 0.05, 0.9);
      kick(se, t + 0.05, 1.2);
      crash(se, t + 0.05, 0.9, 1.6);
      horn(se, t + 0.05, [50, 62, 65, 69, 72], 1.4, 1.2, sendS);
      horn(se, t + 0.05 + STEP * 2, [50, 65, 69, 72, 76], 4, 1.25, sendS);
      kick(se, t + 0.05 + STEP * 2, 1);
    },
    /** 売れた（地図の「+N G」。小さく） */
    sale(t, n = 0) {
      SE.coin(t, n, 0.42, 84);
    },
    /** 紙が舞う */
    paper(t) {
      noise(se, t, { type: 'bandpass', f: 2200, fTo: 4800, q: 0.9, a: 0.04, d: 0.12, v: 0.08, off: Math.random() });
    },
    /** 知らせ（テロップ） */
    news(t) {
      rim(se, t, 0.8, midi(note(4, 84, t)));
      rim(se, t + 0.09, 0.8, midi(note(4, 84, t)));
      horn(se, t + 0.18, chordAt(t).guide.slice(1), 1, 0.7, sendS);
    },
    /** やわらかい選択（段の切り替え） */
    seg(t, i = 0) {
      rim(se, t, 0.8, midi(note(i * 2, 84, t)));
    },
  };
  sendS.gain.value = 0.35;
  sendB.gain.value = 0.3;

  return { ctx, S, SE, bgm, se, master, bgmDuck, scheduleBar, chordAt, note, beatSubs, BAR, STEP, st };
}

// ---------------------------------------------------------------- 画面で使う窓口
let E = null;
let timer = 0;
let pendingLayers = 1;
const pendingBeat = [];
const vol = { bgm: 0.7, se: 0.8, mute: false };
const applyVol = () => {
  if (!E) return;
  const t = E.ctx.currentTime;
  E.bgm.gain.setTargetAtTime(0.62 * vol.bgm * vol.bgm * 1.6, t, 0.03);
  E.se.gain.setTargetAtTime(0.8 * vol.se * vol.se * 1.4, t, 0.03);
  E.master.gain.setTargetAtTime(vol.mute ? 0 : 1, t, 0.02);
};
function pump() {
  if (!E || E.ctx.state !== 'running') return;
  const S = E.S;
  while (S.nextBar < E.ctx.currentTime + 0.14) {
    const t0 = Math.max(S.nextBar, E.ctx.currentTime + 0.02);
    if (S.want !== 'silent') E.scheduleBar(t0);
    else { S.mode = 'silent'; S.curMode = 'silent'; S.t0 = t0; }
    for (let b = 0; b < 4; b++) {
      const bt = t0 + b * E.STEP * 4;
      const ms = (bt - E.ctx.currentTime) * 1000;
      setTimeout(() => E.beatSubs.forEach((f) => f(b, S.curMode)), Math.max(0, ms));
    }
    S.nextBar = t0 + E.BAR;
  }
}
export const audio = {
  get ready() { return !!E; },
  /** 最初に触れたときに呼ぶ */
  async start() {
    if (E) {
      if (E.ctx.state !== 'running' && !document.hidden) await E.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    E = createEngine(ctx);
    E.S.wantLayers = pendingLayers;
    pendingBeat.forEach((f) => E.beatSubs.add(f));
    applyVol();
    await ctx.resume().catch(() => {});
    E.S.nextBar = ctx.currentTime + 0.06;
    timer = setInterval(pump, 25);
    document.addEventListener('visibilitychange', () => {
      if (!E) return;
      if (document.hidden) E.ctx.suspend().catch(() => {});
      else E.ctx.resume().catch(() => {});
    });
  },
  /** BGM を始める位置をずらす（はじまりの一打のあと、頭から鳴らす） */
  startMusicAt(delay = 0.5) { if (E) { E.S.nextBar = E.ctx.currentTime + delay; E.S.bar = 0; } },
  se(name, ...a) {
    if (!E || E.ctx.state !== 'running' || vol.mute) return;
    try { E.SE[name]?.(E.ctx.currentTime + 0.004, ...a); } catch { /* 音が鳴らなくても画面は進める */ }
  },
  /** 少し先の時刻に鳴らす（秒） */
  seAt(name, delay, ...a) {
    if (!E || E.ctx.state !== 'running' || vol.mute) return;
    try { E.SE[name]?.(E.ctx.currentTime + 0.004 + delay, ...a); } catch { /* 同上 */ }
  },
  layers(n) { if (E) E.S.wantLayers = Math.max(1, Math.min(5, n)); else pendingLayers = n; },
  get layerCount() { return E ? E.S.wantLayers : pendingLayers; },
  /** 場面の曲（'map'・'report'）。小節の頭で替わる */
  scene(mode) { if (E) E.S.want = mode; },
  /** 祝い：n 小節鳴らして、もとの曲へ戻る */
  fete(bars = 8, after = 'map') { if (E) { E.S.feteLeft = bars; E.S.after = after; E.S.want = 'fete'; } },
  /** 大きな SE のあいだ、BGM を下げる */
  duck(depth = 0.25, hold = 0.5, back = 0.8) {
    if (!E) return;
    const t = E.ctx.currentTime;
    const g = E.bgmDuck.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(depth, t, 0.02);
    g.setTargetAtTime(1, t + hold, back / 3);
  },
  onBeat(f) { if (E) E.beatSubs.add(f); else pendingBeat.push(f); return () => E?.beatSubs.delete(f); },
  vol,
  setVol(k, v) { vol[k] = v; applyVol(); },
  get mode() { return E?.S.curMode ?? 'map'; },
  get time() { return E?.ctx.currentTime ?? 0; },
  /** 次の拍までの秒（見た目を拍に合わせるとき） */
  toNextBeat() { if (!E) return 0; const b = E.STEP * 4; const d = (E.ctx.currentTime - E.S.t0) % b; return d < 0 ? -d : b - d; },
};

/** 確かめ用：OfflineAudioContext で曲や SE を書き出す（Float32Array の L・R を返す） */
export async function renderOffline({ seconds = 16, mode = 'map', layers = 5, se = null, over = null, rate = 44100, bgmVol = vol.bgm, seVol = vol.se } = {}) {
  const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OC(2, Math.ceil(seconds * rate), rate);
  const e = createEngine(ctx);
  e.bgm.gain.value = 0.62 * bgmVol * bgmVol * 1.6;
  e.se.gain.value = 0.8 * seVol * seVol * 1.4;
  if (se) {
    e.S.curMode = 'map';
    e.S.curBar = 0;
    e.S.t0 = 0;
    e.SE[se.name](0.05, ...(se.args ?? []));
  } else {
    e.S.want = mode;
    e.S.mode = mode;
    e.S.wantLayers = layers;
    if (mode === 'fete') e.S.feteLeft = 99;
    for (let t = 0.05; t < seconds; t += e.BAR) e.scheduleBar(t);
    for (const x of over ?? []) e.SE[x.name](x.at, ...(x.args ?? []));
  }
  const buf = await ctx.startRendering();
  return [buf.getChannelData(0), buf.getChannelData(1)];
}
