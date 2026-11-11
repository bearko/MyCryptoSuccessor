// 帳場の音：すべて WebAudio で合成する（素材のファイルは使わない）
// 経路：音源 → BGM・SE のバス → まとめの音量 → コンプレッサー → 出力
// SE の音程は、いま鳴っている BGM の調（ニ長調）と和音に合わせる。

const TEMPO = 108;
const SPB = 60 / TEMPO;
const S16 = SPB / 4;
const BAR = SPB * 4;
const KEY = 62; // D4
const PENTA = [0, 2, 4, 7, 9];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);

// 和音（調の主音からの半音。t＝構成音、b＝低音）
const CH = {
  I: { t: [0, 4, 7], b: 0 },
  I3: { t: [0, 4, 7], b: 4 },
  ii: { t: [2, 5, 9], b: 2 },
  IV: { t: [5, 9, 0], b: 5 },
  IVM7: { t: [5, 9, 0, 4], b: 5 },
  V: { t: [7, 11, 2], b: 7 },
  V7: { t: [7, 11, 2, 5], b: 7 },
  Vsus: { t: [7, 0, 2], b: 7 },
  vi: { t: [9, 0, 4], b: 9 },
};
const PROG = {
  map: ['I', 'vi', 'IV', 'V', 'I3', 'IV', 'ii', 'V7'],
  report: ['IVM7', 'I3', 'ii', 'Vsus'],
  fest: ['I', 'IV', 'I3', 'V', 'vi', 'IV', 'V', 'I'],
};

/** 和音の構成音を、base 以上で下から n 個 */
function chordNotes(ch, base, n) {
  const out = [];
  for (let m = base; out.length < n && m < base + 60; m++) if (ch.t.includes((((m - KEY) % 12) + 12) % 12)) out.push(m);
  return out;
}
/** 五音音階の k 番目（base から上へ） */
function pentaNote(base, k) {
  const o = Math.floor(k / 5);
  return base + 12 * o + PENTA[((k % 5) + 5) % 5];
}

// 旋律：[16 分の位置, 音, 長さ（16 分）]
const MEL_A = [
  [[0, 66, 2], [2, 69, 2], [4, 74, 6], [10, 71, 2], [12, 69, 4]],
  [[0, 66, 6], [6, 64, 2], [8, 62, 4], [12, 66, 4]],
  [[0, 67, 2], [2, 71, 2], [4, 74, 6], [10, 76, 2], [12, 74, 2], [14, 71, 2]],
  [[0, 69, 8], [8, 73, 2], [10, 71, 2], [12, 69, 2], [14, 64, 2]],
  [[0, 66, 2], [2, 69, 2], [4, 74, 4], [8, 78, 4], [12, 76, 2], [14, 74, 2]],
  [[0, 71, 6], [6, 74, 2], [8, 76, 4], [12, 74, 2], [14, 71, 2]],
  [[0, 67, 4], [4, 71, 2], [6, 69, 2], [8, 67, 4], [12, 64, 4]],
  [[0, 69, 6], [6, 67, 2], [8, 64, 4], [12, 69, 2], [14, 73, 2]],
];
const MEL_B = [
  [[4, 74, 4], [8, 73, 2], [10, 69, 6]],
  [[4, 71, 4], [8, 69, 2], [10, 66, 6]],
  [[4, 71, 4], [8, 74, 2], [10, 71, 6]],
  [[0, 73, 4], [4, 71, 2], [6, 69, 10]],
  [[4, 69, 2], [6, 74, 2], [8, 78, 8]],
  [[0, 79, 4], [4, 78, 2], [6, 74, 2], [8, 71, 8]],
  [[0, 76, 4], [4, 74, 2], [6, 71, 2], [8, 67, 8]],
  [[0, 69, 4], [4, 71, 4], [8, 73, 4], [12, 76, 4]],
];
const MEL_FEST = [
  [[0, 74, 3], [3, 74, 1], [4, 74, 2], [6, 78, 2], [8, 81, 8]],
  [[0, 79, 4], [4, 83, 4], [8, 81, 4], [12, 79, 4]],
  [[0, 78, 3], [3, 78, 1], [4, 78, 2], [6, 81, 2], [8, 86, 8]],
  [[0, 85, 4], [4, 83, 4], [8, 81, 6], [14, 81, 2]],
  [[0, 83, 6], [6, 81, 2], [8, 78, 4], [12, 74, 4]],
  [[0, 79, 6], [6, 78, 2], [8, 74, 4], [12, 71, 4]],
  [[0, 73, 4], [4, 76, 4], [8, 81, 4], [12, 85, 4]],
  [[0, 86, 14]],
];
const PLUCK_A = [[0, 0, 1], [2, 2, 0.55], [3, 1, 0.45], [4, 3, 0.75], [6, 2, 0.55], [8, 0, 0.85], [10, 2, 0.55], [11, 3, 0.45], [12, 4, 0.75], [14, 2, 0.55]];
const PLUCK_B = [[0, 0, 1], [2, 1, 0.5], [4, 2, 0.7], [6, 3, 0.55], [7, 4, 0.5], [8, 2, 0.8], [10, 1, 0.5], [12, 3, 0.7], [14, 4, 0.55], [15, 2, 0.4]];

/** 音の出口をつくる（本番の AudioContext でも、書き出し用の OfflineAudioContext でも同じ） */
function buildGraph(ctx) {
  const out = ctx.createGain();
  out.gain.value = 0.84;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 5;
  comp.attack.value = 0.004;
  comp.release.value = 0.22;
  const master = ctx.createGain();
  master.gain.value = 1;
  const bgm = ctx.createGain();
  const se = ctx.createGain();
  bgm.gain.value = 0.6;
  se.gain.value = 0.8;
  bgm.connect(master);
  se.connect(master);
  master.connect(comp);
  comp.connect(out);
  out.connect(ctx.destination);
  // 小さな部屋の響き（帳場の木の壁）
  const len = Math.floor(ctx.sampleRate * 1.3);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let s = 1234567 + c * 777;
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const n = (s / 0x3fffffff) - 1;
      d[i] = n * Math.pow(1 - i / len, 3.2) * (i < 400 ? i / 400 : 1);
    }
  }
  const rev = ctx.createConvolver();
  rev.buffer = ir;
  const revIn = ctx.createGain();
  const revLp = ctx.createBiquadFilter();
  revLp.type = 'lowpass';
  revLp.frequency.value = 3800;
  revIn.connect(rev);
  rev.connect(revLp);
  const revOut = ctx.createGain();
  revOut.gain.value = 0.5;
  revLp.connect(revOut);
  revOut.connect(master);
  const bgmSend = ctx.createGain();
  bgmSend.gain.value = 0.2;
  bgm.connect(bgmSend);
  bgmSend.connect(revIn);
  const seSend = ctx.createGain();
  seSend.gain.value = 0.16;
  se.connect(seSend);
  seSend.connect(revIn);
  // 雑音（紙・印・打つ音のもと）
  const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = nb.getChannelData(0);
  let s = 22222;
  for (let i = 0; i < nd.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    nd[i] = s / 2147483648 - 1;
  }
  // 地図の曲の層（5 つ）と、報告・祝いの出口
  const layers = [];
  for (let i = 0; i < 5; i++) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(bgm);
    layers.push(g);
  }
  const sceneOut = {};
  for (const k of ['report', 'fest']) {
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(bgm);
    sceneOut[k] = g;
  }
  return { ctx, out, master, bgm, se, noise: nb, layers, sceneOut };
}

// ---------------------------------------------------------------- 音色
function env(g, t, a, peak, d, sus = 0, r = 0.05, hold = 0) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  if (sus > 0) {
    g.gain.setTargetAtTime(peak * sus, t + a, d / 3);
    g.gain.setTargetAtTime(0.0001, t + a + hold, r / 3);
  } else {
    g.gain.setTargetAtTime(0.0001, t + a, d / 3.2);
  }
}
function osc(G, type, f, t, stop, detune = 0) {
  const o = G.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (detune) o.detune.setValueAtTime(detune, t);
  o.start(t);
  o.stop(stop);
  return o;
}
function noise(G, t, dur, offset = 0) {
  const s = G.ctx.createBufferSource();
  s.buffer = G.noise;
  s.loop = true;
  s.start(t, offset % 1);
  s.stop(t + dur);
  return s;
}
function filt(G, type, f, q = 0.7) {
  const b = G.ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}
function gain(G, v = 0) {
  const g = G.ctx.createGain();
  g.gain.value = v;
  return g;
}

const V = {
  /** 撥弦（柔らかい琴・ギターの中間） */
  pluck(G, dest, t, m, dur, vel = 0.5) {
    const f = mtof(m);
    const end = t + dur + 0.6;
    const o1 = osc(G, 'triangle', f, t, end);
    const o2 = osc(G, 'sawtooth', f, t, end, 4);
    const g2 = gain(G, 0.22);
    const lp = filt(G, 'lowpass', Math.min(9000, f * 7), 1.2);
    lp.frequency.setValueAtTime(Math.min(9000, f * 7), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.6), t + 0.22);
    const g = gain(G);
    env(g, t, 0.004, vel * 0.5, dur * 0.9 + 0.25);
    o1.connect(lp);
    o2.connect(g2);
    g2.connect(lp);
    lp.connect(g);
    g.connect(dest);
  },
  /** 木管（クラリネットとオカリナの間） */
  reed(G, dest, t, m, dur, vel = 0.5, bright = 1) {
    const f = mtof(m);
    const end = t + dur + 0.25;
    const o1 = osc(G, 'square', f, t, end);
    const o2 = osc(G, 'triangle', f, t, end);
    const g1 = gain(G, 0.28);
    const g2 = gain(G, 0.9);
    const lp = filt(G, 'lowpass', (900 + f * 1.4) * bright, 0.8);
    const lfo = osc(G, 'sine', 5.1, t, end);
    const lg = gain(G, 0);
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.35, dur));
    lfo.connect(lg);
    lg.connect(o1.frequency);
    lg.connect(o2.frequency);
    const g = gain(G);
    env(g, t, 0.035, vel * 0.3, 0.2, 0.82, 0.12, Math.max(0.04, dur - 0.05));
    // 息の音
    const n = noise(G, t, Math.min(dur, 0.12) + 0.05, Math.random());
    const nf = filt(G, 'bandpass', f * 2, 1.5);
    const ng = gain(G);
    env(ng, t, 0.01, vel * 0.035, 0.1);
    n.connect(nf);
    nf.connect(ng);
    ng.connect(dest);
    o1.connect(g1);
    o2.connect(g2);
    g1.connect(lp);
    g2.connect(lp);
    lp.connect(g);
    g.connect(dest);
  },
  bass(G, dest, t, m, dur, vel = 0.5) {
    const f = mtof(m);
    const end = t + dur + 0.4;
    const o1 = osc(G, 'triangle', f, t, end);
    const o2 = osc(G, 'sine', f, t, end);
    const lp = filt(G, 'lowpass', 520, 0.7);
    const g = gain(G);
    env(g, t, 0.01, vel * 0.55, 0.3, 0.5, 0.18, dur);
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    g.connect(dest);
  },
  /** 木の音（そろばんの珠・拍子木） */
  wood(G, dest, t, f, vel = 0.4, len = 0.07) {
    const o = osc(G, 'sine', Math.min(15000, f * 1.6), t, t + len + 0.1);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.012);
    const g = gain(G);
    env(g, t, 0.001, vel * 0.6, len);
    o.connect(g);
    g.connect(dest);
    const o2 = osc(G, 'sine', Math.min(15000, f * 2.71), t, t + 0.06);
    const g2 = gain(G);
    env(g2, t, 0.001, vel * 0.16, 0.03);
    o2.connect(g2);
    g2.connect(dest);
    const n = noise(G, t, 0.03, Math.random());
    const hp = filt(G, 'highpass', 2400);
    const ng = gain(G);
    env(ng, t, 0.001, vel * 0.22, 0.012);
    n.connect(hp);
    hp.connect(ng);
    ng.connect(dest);
  },
  shaker(G, dest, t, vel = 0.2) {
    const n = noise(G, t, 0.09, Math.random());
    const bp = filt(G, 'bandpass', 6400, 1.1);
    const g = gain(G);
    env(g, t, 0.006, vel * 0.3, 0.05);
    n.connect(bp);
    bp.connect(g);
    g.connect(dest);
  },
  thump(G, dest, t, vel = 0.5, f0 = 120, f1 = 48, len = 0.16) {
    const o = osc(G, 'sine', f0, t, t + len + 0.2);
    o.frequency.exponentialRampToValueAtTime(f1, t + len * 0.7);
    const g = gain(G);
    env(g, t, 0.002, vel, len);
    o.connect(g);
    g.connect(dest);
  },
  snare(G, dest, t, vel = 0.3) {
    const n = noise(G, t, 0.16, Math.random());
    const bp = filt(G, 'bandpass', 2100, 0.6);
    const g = gain(G);
    env(g, t, 0.002, vel * 0.5, 0.09);
    n.connect(bp);
    bp.connect(g);
    g.connect(dest);
    V.wood(G, dest, t, 230, vel * 0.5, 0.06);
  },
  /** 風琴のような和音の地（細いふいご） */
  pad(G, dest, t, m, dur, vel = 0.3) {
    const f = mtof(m);
    const end = t + dur + 0.6;
    const o1 = osc(G, 'sawtooth', f, t, end, -7);
    const o2 = osc(G, 'sawtooth', f, t, end, 7);
    const lp = filt(G, 'lowpass', 1100, 0.5);
    const g = gain(G);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * 0.11, t + 0.3);
    g.gain.setTargetAtTime(vel * 0.085, t + 0.3, 0.4);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.14);
    const tr = osc(G, 'sine', 4.2, t, end);
    const tg = gain(G, vel * 0.018);
    tr.connect(tg);
    tg.connect(g.gain);
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    g.connect(dest);
  },
  /** 鈴・小さな鐘 */
  bell(G, dest, t, m, vel = 0.3, len = 0.9) {
    const f = mtof(m);
    [[1, 1, len], [2.76, 0.32, len * 0.5], [5.4, 0.12, len * 0.28]].forEach(([r, a, d]) => {
      if (f * r > 15000) return;
      const o = osc(G, 'sine', f * r, t, t + d + 0.3);
      const g = gain(G);
      env(g, t, 0.002, vel * a * 0.5, d);
      o.connect(g);
      g.connect(dest);
    });
  },
  /** 木琴（完成・お断り） */
  marimba(G, dest, t, m, vel = 0.4, len = 0.32) {
    const f = mtof(m);
    const o = osc(G, 'sine', f, t, t + len + 0.3);
    const g = gain(G);
    env(g, t, 0.002, vel * 0.6, len);
    o.connect(g);
    g.connect(dest);
    const o2 = osc(G, 'sine', Math.min(15000, f * 4), t, t + 0.12);
    const g2 = gain(G);
    env(g2, t, 0.001, vel * 0.14, 0.05);
    o2.connect(g2);
    g2.connect(dest);
  },
  /** 紙の音：帯域を動かした雑音 */
  paper(G, dest, t, f0, f1, len, vel = 0.3, q = 0.9) {
    const n = noise(G, t, len + 0.05, Math.random());
    const bp = filt(G, 'bandpass', f0, q);
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + len);
    const hp = filt(G, 'highpass', 500);
    const g = gain(G);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + len * 0.35);
    g.gain.setTargetAtTime(0.0001, t + len * 0.5, len * 0.16);
    n.connect(bp);
    bp.connect(hp);
    hp.connect(g);
    g.connect(dest);
  },
  coin(G, dest, t, m, vel = 0.3) {
    const f = mtof(m);
    [[1, 1, 0.28], [2.0, 0.28, 0.2], [2.93, 0.4, 0.16], [4.1, 0.14, 0.08]].forEach(([r, a, d]) => {
      if (f * r > 15000) return;
      const o = osc(G, 'sine', f * r, t, t + d + 0.2);
      const g = gain(G);
      env(g, t, 0.001, vel * a * 0.42, d);
      o.connect(g);
      g.connect(dest);
    });
    const n = noise(G, t, 0.02, Math.random());
    const hp = filt(G, 'highpass', 6000);
    const ng = gain(G);
    env(ng, t, 0.001, vel * 0.12, 0.01);
    n.connect(hp);
    hp.connect(ng);
    ng.connect(dest);
  },
  /** 喋る字：母音のような短い声 */
  voice(G, dest, t, m, vel = 0.3, kind = 0) {
    const f = mtof(m);
    const o = osc(G, kind === 2 ? 'triangle' : 'sawtooth', f, t, t + 0.12);
    o.frequency.setValueAtTime(f * 1.03, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.97, t + 0.06);
    const bp = filt(G, 'bandpass', [760, 520, 1050][kind] ?? 760, 2.2);
    const lp = filt(G, 'lowpass', 2600);
    const g = gain(G);
    env(g, t, 0.006, vel * (kind === 2 ? 1.5 : 1.1), 0.05);
    o.connect(bp);
    bp.connect(lp);
    lp.connect(g);
    g.connect(dest);
  },
};

// ---------------------------------------------------------------- 曲
/** 1 小節ぶんの音を置く。scene：map・report・fest。on：鳴らす層（地図） */
function scheduleBar(G, scene, bar, t, on) {
  const prog = PROG[scene];
  const ch = CH[prog[bar % prog.length]];
  const next = CH[prog[(bar + 1) % prog.length]];
  const st = (n) => t + n * S16 + (n % 2 ? S16 * 0.14 : 0); // ごく軽い跳ね
  if (scene === 'map') {
    const L = G.layers;
    // 層 1：撥弦の分散和音
    if (on[0]) {
      const notes = chordNotes(ch, 57, 6);
      for (const [n, k, v] of bar % 2 ? PLUCK_B : PLUCK_A) V.pluck(G, L[0], st(n), notes[k], 0.3, v * 0.62);
    }
    // 層 2：低音
    if (on[1]) {
      const r = KEY - 24 + ch.b;
      V.bass(G, L[1], st(0), r, S16 * 5, 0.62);
      V.bass(G, L[1], st(6), r + 7 > 52 ? r - 5 : r + 7, S16 * 1.6, 0.4);
      V.bass(G, L[1], st(8), r, S16 * 4, 0.55);
      V.bass(G, L[1], st(14), KEY - 24 + next.b + (bar % 2 ? 2 : -2), S16 * 1.6, 0.36);
    }
    // 層 3：木管の旋律（16 小節でひと回り）
    if (on[2]) {
      const m = (bar % 16 < 8 ? MEL_A : MEL_B)[bar % 8];
      for (const [n, note, len] of m) V.reed(G, L[2], st(n), note, len * S16 * 0.92, 0.62);
    }
    // 層 4：軽い打ちもの
    if (on[3]) {
      V.thump(G, L[3], st(0), 0.26, 105, 52, 0.13);
      V.thump(G, L[3], st(10), 0.18, 105, 52, 0.11);
      V.wood(G, L[3], st(4), 880, 0.3);
      V.wood(G, L[3], st(12), 880, 0.32);
      V.wood(G, L[3], st(7), 660, 0.14);
      if (bar % 2) V.wood(G, L[3], st(15), 660, 0.16);
      for (let n = 0; n < 16; n += 2) V.shaker(G, L[3], st(n), n % 4 ? 0.34 : 0.18);
    }
    // 層 5：和音の地と、小さな鈴
    if (on[4]) {
      const p = chordNotes(ch, 62, 3);
      V.pad(G, L[4], t, p[0], BAR * 0.96, 0.5);
      V.pad(G, L[4], t, p[1], BAR * 0.96, 0.5);
      V.pad(G, L[4], t, p[2], BAR * 0.96, 0.4);
      if (bar % 2 === 0) V.bell(G, L[4], st(2), chordNotes(ch, 86, 2)[bar % 4 ? 1 : 0], 0.16, 1.1);
      if (bar % 4 === 3) [0, 1, 2].forEach((k) => V.bell(G, L[4], st(10 + k * 2), chordNotes(ch, 81, 3)[k], 0.1, 0.5));
    }
  } else if (scene === 'report') {
    const o = G.sceneOut.report;
    const notes = chordNotes(ch, 57, 6);
    [[0, 0, 0.8], [3, 2, 0.5], [6, 3, 0.55], [8, 4, 0.6], [11, 2, 0.45], [14, 3, 0.5]].forEach(([n, k, v]) => V.pluck(G, o, st(n), notes[k], 0.7, v * 0.5));
    V.bass(G, o, t, KEY - 24 + ch.b, BAR * 0.8, 0.5);
    const p = chordNotes(ch, 66, 3);
    V.reed(G, o, t + S16 * 4, p[bar % 2 ? 1 : 0], BAR * 0.62, 0.3, 0.8);
    V.pad(G, o, t, p[0] - 12, BAR * 0.96, 0.34);
    // そろばんを弾くような刻み
    for (let n = 0; n < 16; n += 2) if ((n + bar * 3) % 7 !== 1) V.wood(G, o, st(n), n % 8 === 4 ? 1320 : 990, n % 4 ? 0.07 : 0.12, 0.04);
  } else if (scene === 'fest') {
    const o = G.sceneOut.fest;
    const notes = chordNotes(ch, 57, 6);
    // かき鳴らす和音
    for (const n of [0, 6, 8, 12, 14]) notes.slice(0, 5).forEach((m, k) => V.pluck(G, o, st(n) + k * 0.014, m, 0.35, (n % 8 ? 0.42 : 0.6) * 0.6));
    const r = KEY - 24 + ch.b;
    for (const n of [0, 4, 8, 12]) V.bass(G, o, st(n), n % 8 ? r + 12 > 55 ? r : r + 12 : r, S16 * 3, 0.58);
    for (const [n, note, len] of MEL_FEST[bar % 8]) {
      V.reed(G, o, st(n), note - 12, len * S16 * 0.9, 0.66, 1.25);
      V.reed(G, o, st(n), note, len * S16 * 0.9, 0.3, 1.1);
      V.bell(G, o, st(n), note, 0.13, 0.5);
    }
    const p = chordNotes(ch, 62, 3);
    p.forEach((m) => V.pad(G, o, t, m, BAR * 0.96, 0.5));
    V.thump(G, o, st(0), 0.4, 115, 50, 0.16);
    V.thump(G, o, st(8), 0.34, 115, 50, 0.14);
    V.thump(G, o, st(11), 0.2, 115, 50, 0.1);
    V.snare(G, o, st(4), 0.34);
    V.snare(G, o, st(12), 0.36);
    for (let n = 0; n < 16; n += 2) V.shaker(G, o, st(n), n % 4 ? 0.4 : 0.22);
    if (bar % 4 === 3) for (let n = 8; n < 16; n++) V.wood(G, o, st(n), 700 + n * 40, 0.1 + (n - 8) * 0.03, 0.04);
    if (bar % 8 === 7) chordNotes(ch, 74, 4).forEach((m, k) => V.bell(G, o, st(0) + k * 0.05, m, 0.2, 1.6));
  }
  return ch;
}

// ---------------------------------------------------------------- SE
/** 鳴らす。ch：いまの和音、v：ゆらぎ（同じ音が続いても飽きないように） */
const SE = {
  press(G, t, ch) {
    const m = chordNotes(ch, 81, 3)[Math.floor(Math.random() * 3)];
    V.wood(G, G.se, t, mtof(m) * rnd(0.985, 1.015), rnd(0.3, 0.38), 0.05);
  },
  release(G, t, ch) {
    const m = chordNotes(ch, 74, 2)[Math.floor(Math.random() * 2)];
    V.wood(G, G.se, t, mtof(m) * rnd(0.985, 1.015), rnd(0.12, 0.17), 0.04);
  },
  open(G, t, ch) {
    V.paper(G, G.se, t, rnd(700, 900), rnd(2600, 3200), 0.2, 0.3);
    V.thump(G, G.se, t + 0.17, 0.3, 150, 70, 0.09);
    V.pluck(G, G.se, t + 0.17, chordNotes(ch, 62, 1)[0], 0.3, 0.3);
  },
  close(G, t, ch) {
    V.paper(G, G.se, t, rnd(2400, 2900), rnd(600, 800), 0.18, 0.26);
    V.thump(G, G.se, t + 0.12, 0.2, 120, 60, 0.08);
    V.pluck(G, G.se, t + 0.02, chordNotes(ch, 57, 1)[0], 0.25, 0.22);
  },
  /** めくる：紙が空を切って、落ちる */
  flip(G, t, ch, o = {}) {
    const up = o.back ? 0.86 : 1;
    V.paper(G, G.se, t, 500 * up, 3400 * up, 0.3, 0.3, 0.7);
    V.paper(G, G.se, t + 0.26, 3000 * up, 1100 * up, 0.24, 0.22, 1.2);
    V.paper(G, G.se, t + 0.5, 1800, 900, 0.06, 0.34, 0.6);
    V.thump(G, G.se, t + 0.51, 0.16, 180, 90, 0.05);
    const n = chordNotes(ch, 69, 3);
    V.pluck(G, G.se, t + 0.5, n[o.back ? 0 : 1], 0.3, 0.26);
  },
  tab(G, t, ch, o = {}) {
    const n = chordNotes(ch, 74, 3);
    const a = o.dir < 0 ? [n[1], n[0]] : [n[0], n[1]];
    V.wood(G, G.se, t, mtof(a[0]), 0.34, 0.06);
    V.wood(G, G.se, t + 0.07, mtof(a[1]), 0.3, 0.06);
    V.paper(G, G.se, t + 0.02, 900, 2400, 0.34, 0.18);
  },
  lift(G, t) {
    V.paper(G, G.se, t, 1400, 2800, 0.09, 0.12, 2);
    V.wood(G, G.se, t, 520, 0.14, 0.03);
  },
  /** 検印：「ドン」と紙。いちばんの決めの一手 */
  stamp(G, t, ch) {
    V.thump(G, G.se, t, 1.0, 150, 38, 0.3);
    V.thump(G, G.se, t, 0.5, 260, 90, 0.08);
    const n = noise(G, t, 0.08, Math.random());
    const lp = filt(G, 'lowpass', 1700, 0.5);
    const g = gain(G);
    env(g, t, 0.001, 0.62, 0.05);
    n.connect(lp);
    lp.connect(g);
    g.connect(G.se);
    V.wood(G, G.se, t, 190, 0.5, 0.09);
    V.paper(G, G.se, t + 0.05, 2600, 900, 0.22, 0.2);
    // 曲に溶ける低い和音（根音と五度）
    const r = chordNotes(ch, 38, 1)[0];
    V.pluck(G, G.se, t + 0.01, r + 12, 0.9, 0.5);
    V.pluck(G, G.se, t + 0.02, r + 19, 0.8, 0.32);
    V.bell(G, G.se, t + 0.09, chordNotes(ch, 74, 3)[2], 0.2, 1.4);
    V.bell(G, G.se, t + 0.2, chordNotes(ch, 86, 1)[0], 0.12, 1.2);
  },
  stampSmall(G, t, ch) {
    V.thump(G, G.se, t, 0.5, 170, 60, 0.14);
    V.wood(G, G.se, t, 240, 0.34, 0.06);
    V.paper(G, G.se, t + 0.03, 2200, 1000, 0.12, 0.12);
    V.pluck(G, G.se, t + 0.01, chordNotes(ch, 57, 1)[0], 0.4, 0.3);
  },
  /** 金貨：数が増えるほど高くなる（五音音階を上がる） */
  coin(G, t, ch, o = {}) {
    const k = Math.min(14, o.n ?? 0);
    V.coin(G, G.se, t, pentaNote(74, k) + (Math.random() < 0.15 ? 12 : 0), (o.vel ?? 0.3) * rnd(0.9, 1.1));
  },
  income(G, t, ch) {
    const n = chordNotes(ch, 78, 3);
    V.coin(G, G.se, t, n[0], 0.26);
    V.coin(G, G.se, t + 0.07, n[Math.random() < 0.5 ? 1 : 2], 0.22);
  },
  pay(G, t, ch) {
    const n = chordNotes(ch, 69, 4).reverse();
    n.forEach((m, k) => V.wood(G, G.se, t + k * 0.055, mtof(m), 0.3 - k * 0.03, 0.05));
    V.coin(G, G.se, t + 0.24, n[3], 0.2);
  },
  /** やわらかいお断り：低い木琴がふたつ、下がる。責めない */
  deny(G, t, ch) {
    const n = chordNotes(ch, 54, 3);
    V.marimba(G, G.se, t, n[1], 0.36, 0.26);
    V.marimba(G, G.se, t + 0.14, n[0], 0.32, 0.36);
    V.paper(G, G.se, t, 900, 600, 0.12, 0.08);
  },
  decide(G, t, ch) {
    const n = chordNotes(ch, 69, 3);
    V.pluck(G, G.se, t, n[0], 0.4, 0.5);
    V.pluck(G, G.se, t + 0.03, n[2], 0.4, 0.42);
    V.bell(G, G.se, t + 0.03, n[2] + 12, 0.14, 0.7);
  },
  complete(G, t, ch) {
    const n = chordNotes(ch, 74, 4);
    [0, 1, 2].forEach((k) => V.marimba(G, G.se, t + k * 0.075, n[k], 0.4, 0.28));
    V.bell(G, G.se, t + 0.24, n[3], 0.2, 0.9);
    V.wood(G, G.se, t, 420, 0.3, 0.05);
  },
  rankup(G, t) {
    for (let k = 0; k < 7; k++) V.pluck(G, G.se, t + k * 0.06, pentaNote(69, k), 0.3, 0.34 + k * 0.03);
    V.bell(G, G.se, t + 0.44, 86, 0.3, 1.4);
    V.bell(G, G.se, t + 0.44, 81, 0.2, 1.2);
    V.thump(G, G.se, t + 0.44, 0.5, 140, 55, 0.18);
  },
  conquer(G, t) {
    V.thump(G, G.se, t, 0.9, 160, 40, 0.34);
    const n = noise(G, t, 0.9, 0.3);
    const hp = filt(G, 'highpass', 3600);
    const g = gain(G);
    env(g, t, 0.004, 0.2, 0.6);
    n.connect(hp);
    hp.connect(g);
    g.connect(G.se);
    for (let k = 0; k < 10; k++) V.pluck(G, G.se, t + 0.05 + k * 0.045, pentaNote(62, k), 0.35, 0.3 + k * 0.03);
    [62, 69, 74, 78, 81].forEach((m, k) => V.pluck(G, G.se, t + 0.52 + k * 0.012, m, 1.2, 0.5));
    V.bell(G, G.se, t + 0.52, 86, 0.3, 2);
    V.bell(G, G.se, t + 0.52, 90, 0.2, 1.6);
  },
  talk(G, t, ch, o = {}) {
    const base = [50, 45, 69][o.voice ?? 0] ?? 50;
    const k = Math.floor(rnd(0, 4));
    V.voice(G, G.se, t, pentaNote(base, k), o.vel ?? 0.26, o.voice ?? 0);
  },
  /** 物差しのつまみ：値で音程が変わる */
  slide(G, t, ch, o = {}) {
    V.wood(G, G.se, t, mtof(pentaNote(69, Math.round((o.p ?? 0) * 9))), 0.3, 0.05);
  },
  toggle(G, t, ch, o = {}) {
    const n = chordNotes(ch, 69, 3);
    V.wood(G, G.se, t, mtof(o.on ? n[0] : n[2]), 0.36, 0.06);
    V.wood(G, G.se, t + 0.08, mtof(o.on ? n[2] : n[0]), 0.36, 0.07);
    V.thump(G, G.se, t + 0.08, 0.2, 200, 110, 0.05);
  },
  /** 桁が止まる音（そろばん） */
  tick(G, t, ch, o = {}) {
    V.wood(G, G.se, t, mtof(pentaNote(81, o.n ?? 0)) * rnd(0.99, 1.01), o.vel ?? 0.16, 0.035);
  },
  whoosh(G, t) {
    V.paper(G, G.se, t, 400, 1600, 0.42, 0.14, 0.5);
  },
  start(G, t) {
    SE.stamp(G, t, CH.I);
    [62, 66, 69, 74, 78].forEach((m, k) => V.pluck(G, G.se, t + 0.18 + k * 0.07, m, 0.6, 0.4));
    V.paper(G, G.se, t + 0.1, 500, 3000, 0.6, 0.26, 0.6);
  },
  soft(G, t, ch) {
    V.marimba(G, G.se, t, chordNotes(ch, 62, 2)[1], 0.3, 0.2);
  },
};

// ---------------------------------------------------------------- 本番の入れ物
class AudioKit {
  constructor() {
    this.G = null;
    this.scene = 'map';
    this.pending = null;
    this.bar = 0;
    this.nextBar = 0;
    this.timeline = [];
    this.layers = 1;
    this.on = [false, false, false, false, false];
    this.vol = { bgm: 0.7, se: 0.8, muted: false };
    this.timer = 0;
    this.lastSe = {};
    this.onBar = null;
  }
  get ready() { return !!this.G; }
  /** 最初に画面に触れたときに呼ぶ */
  start() {
    if (this.G) { this.G.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.G = buildGraph(ctx);
    this.applyVol(0);
    this.nextBar = ctx.currentTime + 0.12;
    this.timer = setInterval(() => this.pump(), 60);
    document.addEventListener('visibilitychange', () => {
      // タブが隠れたら止める
      if (document.hidden) ctx.suspend(); else ctx.resume();
    });
    ctx.resume();
    this.pump();
  }
  pump() {
    const G = this.G;
    if (!G || G.ctx.state !== 'running') return;
    const now = G.ctx.currentTime;
    if (this.nextBar < now - 0.5) this.nextBar = now + 0.1; // 長く止まっていたら仕切り直す
    while (this.nextBar < now + 0.35) {
      const t = this.nextBar;
      // 場面の切り替えは小節の頭で
      if (this.pending && this.pending !== this.scene) {
        this.scene = this.pending;
        this.bar = 0;
      }
      this.pending = null;
      if (this.scene === 'fest' && this.bar >= 8) { this.scene = 'map'; this.bar = 0; }
      // 地図の層：小節の頭で 1 つずつ重ねる
      for (let i = 0; i < 5; i++) {
        const want = this.scene === 'map' && i < this.layers;
        if (want !== this.on[i]) {
          this.on[i] = want;
          G.layers[i].gain.setTargetAtTime(want ? 1 : 0, t, want ? 0.5 : 0.12);
        }
      }
      const ch = scheduleBar(G, this.scene, this.bar, t, this.scene === 'map' ? this.on.map((v, i) => v || i < this.layers) : this.on);
      this.timeline.push({ t, ch, scene: this.scene, bar: this.bar });
      if (this.timeline.length > 6) this.timeline.shift();
      this.onBar?.(this.scene, this.bar, t - now);
      this.bar++;
      this.nextBar += BAR;
    }
  }
  /** いま鳴っている和音 */
  chord() {
    if (!this.G) return CH.I;
    const now = this.G.ctx.currentTime;
    let c = CH.I;
    for (const x of this.timeline) if (x.t <= now + 0.02) c = x.ch;
    return c;
  }
  setScene(name) { this.pending = name; }
  setLayers(n) { this.layers = Math.max(1, Math.min(5, n)); }
  applyVol(tc = 0.05) {
    const G = this.G;
    if (!G) return;
    const t = G.ctx.currentTime;
    G.bgm.gain.setTargetAtTime(this.vol.bgm * 0.5, t, tc || 0.001);
    G.se.gain.setTargetAtTime(this.vol.se * 0.85, t, tc || 0.001);
    G.master.gain.setTargetAtTime(this.vol.muted ? 0 : 1, t, tc || 0.001);
  }
  setVol(v) { Object.assign(this.vol, v); this.applyVol(); }
  /** 大きな SE のあいだ、曲を少し下げる */
  duck(amount = 0.45, len = 0.9) {
    const G = this.G;
    if (!G) return;
    const t = G.ctx.currentTime;
    const base = this.vol.bgm * 0.5;
    G.bgm.gain.cancelScheduledValues(t);
    G.bgm.gain.setTargetAtTime(base * amount, t, 0.02);
    G.bgm.gain.setTargetAtTime(base, t + len, 0.3);
  }
  se(name, o = {}) {
    const G = this.G;
    if (!G || G.ctx.state !== 'running' || !SE[name]) return;
    const now = G.ctx.currentTime;
    const gap = o.gap ?? 0.028;
    if (this.lastSe[name] && now - this.lastSe[name] < gap) return;
    this.lastSe[name] = now;
    SE[name](G, now + 0.004 + (o.delay ?? 0), this.chord(), o);
  }
}

export const audio = new AudioKit();

// ---------------------------------------------------------------- 書き出し（確かめ用）
/** OfflineAudioContext で曲や SE を描く。戻り値は { sr, l, r, peak } */
export async function renderOffline(kind, seconds = 16, opt = {}) {
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
  const G = buildGraph(ctx);
  G.bgm.gain.value = (opt.bgm ?? 0.7) * 0.5;
  G.se.gain.value = (opt.se ?? 0.8) * 0.85;
  if (kind === 'map' || kind === 'report' || kind === 'fest') {
    const n = opt.layers ?? 5;
    G.layers.forEach((g, i) => (g.gain.value = i < n ? 1 : 0));
    const on = [0, 1, 2, 3, 4].map((i) => i < n);
    for (let b = 0, t = 0.05; t < seconds; b++, t += BAR) scheduleBar(G, kind, b, t, on);
  } else if (kind === 'mix') {
    // いちばん音が重なる所：全部の層＋検印＋金貨
    G.layers.forEach((g) => (g.gain.value = 1));
    for (let b = 0, t = 0.05; t < seconds; b++, t += BAR) scheduleBar(G, 'map', b, t, [true, true, true, true, true]);
    SE.stamp(G, 2.3, CH.vi);
    for (let k = 0; k < 12; k++) SE.coin(G, 4.5 + k * 0.08, CH.IV, { n: k });
    SE.rankup(G, 6.7, CH.V);
    SE.conquer(G, 9, CH.I);
  } else if (SE[kind]) {
    const reps = opt.reps ?? 1;
    for (let k = 0; k < reps; k++) SE[kind](G, 0.05 + k * (opt.every ?? 0.12), CH[opt.chord ?? 'I'], { n: k, on: true, p: k / Math.max(1, reps - 1), voice: opt.voice ?? 0 });
  }
  const buf = await ctx.startRendering();
  const l = buf.getChannelData(0);
  const r = buf.getChannelData(1);
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < l.length; i++) {
    const a = Math.max(Math.abs(l[i]), Math.abs(r[i]));
    if (a > peak) peak = a;
    sum += l[i] * l[i];
  }
  return { sr, l, r, peak, rms: Math.sqrt(sum / l.length) };
}
export const SE_NAMES = Object.keys(SE);
export const BAR_SEC = BAR;
