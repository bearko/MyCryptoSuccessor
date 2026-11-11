// BGM：16 分音符の格子で鳴らす小さなシーケンサー。
// ・地図の曲は 5 層（旋律・低音・分散和音・太鼓・和音の厚み）。層は小節の頭で増える。
// ・曲の切り替えも小節の頭でそろえる。
// ・いま鳴っている和音を SE に教える（harmony）。押す音が曲に溶けるようにするため。

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const CHORD = {
  C: [0, 4, 7],
  F: [5, 9, 0],
  G: [7, 11, 2],
  Am: [9, 0, 4],
  Dm: [2, 5, 9],
  Em: [4, 7, 11],
};
/** 調（ハ長調）の音階。SE の音階にも使う */
export const SCALE = [0, 2, 4, 5, 7, 9, 11];
export const PENTA = [0, 2, 4, 7, 9];

const midi = (name) => {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  return PC[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;
};
/** "A4:2 C5:2 -:4" → [{pos, m, len}]（len は 16 分音符の数） */
const line = (s) => {
  let pos = 0;
  const out = [];
  for (const tok of s.trim().split(/\s+/)) {
    const [n, l] = tok.split(':');
    const len = Number(l);
    if (n !== '-') out.push({ pos, m: midi(n), len });
    pos += len;
  }
  return out;
};

export const LAYERS = ['lead', 'bass', 'arp', 'drums', 'pad'];

const SONGS = {
  // 地図：港町の昼。覚えやすい「上がって伸ばす」動機を、和音に合わせて 1 段ずつ下げて繰り返す
  map: {
    bpm: 116,
    chords: ['F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', 'C', 'Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'G'],
    lead: [
      'A4:2 C5:2 F5:4 E5:2 F5:2 G5:4',
      'G5:6 D5:2 B4:4 D5:4',
      'G4:2 B4:2 E5:4 D5:2 E5:2 G5:4',
      'E5:6 C5:2 A4:8',
      'F4:2 A4:2 D5:4 C5:2 D5:2 F5:4',
      'E5:2 D5:2 B4:4 G4:2 B4:2 D5:4',
      'C5:6 E5:2 G5:4 E5:4',
      'C5:8 -:4 G4:2 C5:2',
      'E5:4 A5:4 G5:2 E5:2 C5:4',
      'F5:4 A5:4 G5:2 F5:2 C5:4',
      'E5:4 G5:4 C6:4 G5:4',
      'D5:6 E5:2 D5:4 B4:4',
      'E5:4 A5:4 G5:2 E5:2 C5:4',
      'F5:4 A5:4 C6:2 A5:2 F5:4',
      'G5:2 A5:2 B5:4 D6:4 B5:4',
      'G5:8 -:8',
    ],
    drums: 'map',
    fillBars: [7, 15],
  },
  // 月次報告：同じ速さで、静かに数字を待つ。太鼓は刻みだけ
  report: {
    bpm: 116,
    chords: ['C', 'C', 'Am', 'Am', 'F', 'F', 'G', 'G'],
    lead: [
      'E5:4 -:4 G5:4 -:4',
      'E5:2 D5:2 C5:4 -:8',
      'E5:4 -:4 A5:4 -:4',
      'E5:2 D5:2 C5:4 -:8',
      'F5:4 -:4 A5:4 -:4',
      'G5:2 F5:2 E5:4 -:8',
      'D5:4 -:4 G5:4 -:4',
      'B4:2 D5:2 G5:4 -:8',
    ],
    leadWave: 'tri',
    drums: 'soft',
    layers: ['lead', 'bass', 'arp', 'drums'],
  },
  // 制覇：4 小節の祝いの曲。終わったら地図の曲へ戻る
  fanfare: {
    bpm: 116,
    chords: ['C', ['F', 'G'], ['C', 'F'], ['G', 'C']],
    lead: ['G4:1 G4:1 G4:2 C5:4 E5:4 G5:4', 'A5:3 A5:1 A5:4 B5:3 B5:1 B5:4', 'C6:6 G5:2 A5:4 C6:4', 'D6:4 B5:2 D6:2 C6:8'],
    leadWave: 'p50',
    harmony: true,
    drums: 'march',
    layers: ['lead', 'bass', 'arp', 'drums', 'pad'],
    once: true,
  },
};
for (const s of Object.values(SONGS)) {
  s.bars = s.chords.length;
  s.leadEv = s.lead.map(line);
}

export class Music {
  /** @param {import('./audio.js').Engine} eng */
  constructor(eng) {
    this.eng = eng;
    this.song = null;
    this.name = '';
    this.t0 = 0; // いまの曲の 0 小節目の時刻
    this.n = 0; // 次に鳴らす 16 分音符（曲の頭から数えて）
    this.level = 2;
    this.on = new Set(['lead', 'bass']);
    this.pending = null;
    this.after = 'map';
    this.timer = 0;
    this.hist = []; // {t, song, bar0} 和音を時刻から引くため
    this.onBar = null;
    this.gain = {};
    for (const k of LAYERS) {
      const g = eng.ctx.createGain();
      g.gain.value = 1;
      g.connect(eng.bgm);
      this.gain[k] = g;
    }
  }

  get step() {
    return 60 / (this.song?.bpm ?? 116) / 4;
  }

  /** 曲を今すぐ頭から始める */
  start(name, at) {
    this.song = SONGS[name];
    this.name = name;
    this.t0 = at ?? this.eng.now + 0.08;
    this.n = 0;
    this.hist.push({ t: this.t0, name });
    if (!this.timer && typeof setInterval === 'function' && !this.offline) this.timer = setInterval(() => this.pump(), 30);
    this.pump();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = 0;
    this.song = null;
  }

  /** 次の小節の頭の時刻 */
  nextBar() {
    if (!this.song) return this.eng.now + 0.05;
    const bar = this.step * 16;
    const k = Math.ceil((this.eng.now + 0.06 - this.t0) / bar);
    return this.t0 + Math.max(0, k) * bar;
  }

  /** 次の小節の頭で曲を替える。返り値：その時刻 */
  cue(name, after) {
    this.pending = name;
    if (after) this.after = after;
    return this.nextBarAfterScheduled();
  }
  nextBarAfterScheduled() {
    // もう予約した小節の次（予約ずみの音は取り消さない）
    const bar = this.step * 16;
    const k = Math.ceil(this.n / 16);
    const t = this.t0 + k * bar;
    return t < this.eng.now + 0.02 ? t + bar : t;
  }

  /** 層の数（2〜5）。小節の頭で効く */
  setLevel(n) {
    this.level = Math.max(1, Math.min(5, n));
  }

  /** 拍の位置（0〜1：1 拍のうち）と、小節の中の拍（0〜3） */
  beat(now = this.eng.now) {
    if (!this.song) return { frac: 0, beat: 0, bar: 0 };
    const b = (now - this.t0) / (this.step * 4);
    const fb = Math.floor(b);
    return { frac: b - fb, beat: ((fb % 4) + 4) % 4, bar: Math.floor(fb / 4) };
  }

  /** いま（か、その時刻）の和音。SE が音程を合わせるのに使う */
  harmony(t = this.eng.now) {
    if (!this.song) return { pcs: CHORD.C, root: 0 };
    // 先に予約した次の曲が始まる前は、前の曲の和音で答える
    const cur = t < this.t0 && this.prev ? this.prev : this;
    const s = cur.song;
    const st = Math.floor((t - cur.t0) / (60 / s.bpm / 4));
    const bar = ((Math.floor(st / 16) % s.bars) + s.bars) % s.bars;
    const pos = ((st % 16) + 16) % 16;
    const pcs = CHORD[this._chordName(s, bar, pos)];
    return { pcs, root: pcs[0] };
  }

  _chordName(s, bar, pos) {
    const c = s.chords[bar];
    return Array.isArray(c) ? c[pos < 8 ? 0 : 1] : c;
  }

  pump(until) {
    if (!this.song) return;
    const lim = until ?? this.eng.now + 0.16;
    let guard = 0;
    while (this.t0 + this.n * this.step < lim && guard++ < 4000) {
      const pos = this.n % 16;
      if (pos === 0) this._barHead();
      this._emit(this.n, this.t0 + this.n * this.step);
      this.n++;
    }
  }

  _barHead() {
    const t = this.t0 + this.n * this.step;
    const s = this.song;
    const barIdx = this.n / 16;
    // 曲の切り替え（小節の頭）
    let next = this.pending;
    if (!next && s.once && barIdx >= s.bars) next = this.after;
    if (next) {
      this.pending = null;
      this.prev = { song: this.song, t0: this.t0 };
      this.song = SONGS[next];
      this.name = next;
      this.t0 = t;
      this.n = 0;
      this.hist.push({ t, name: next });
    }
    // 層の出入り（小節の頭）
    const want = new Set((this.song.layers ?? LAYERS).slice(0, this.song.layers ? 9 : this.level));
    for (const k of LAYERS) {
      const g = this.gain[k].gain;
      if (want.has(k) && !this.on.has(k)) {
        g.setValueAtTime(0.0001, t);
        g.exponentialRampToValueAtTime(1, t + this.step * 4);
      } else if (!want.has(k) && this.on.has(k)) {
        g.setValueAtTime(1, t);
        g.exponentialRampToValueAtTime(0.0001, t + this.step * 2);
      }
    }
    this.on = want;
    if (this.onBar) this.onBar(t, this.name, (this.n / 16) % this.song.bars, [...want]);
  }

  _emit(n, t) {
    const s = this.song;
    const e = this.eng;
    const st = this.step;
    const bar = Math.floor(n / 16) % s.bars;
    const pos = n % 16;
    const ch = CHORD[this._chordName(s, bar, pos)];
    const on = this.on;
    const G = this.gain;

    if (on.has('lead')) {
      for (const ev of s.leadEv[bar]) {
        if (ev.pos !== pos) continue;
        const dur = ev.len * st * 0.9;
        const wave = s.leadWave ?? 'p25';
        e.tone({ t, m: ev.m, dur, vol: wave === 'tri' ? 0.2 : 0.085, wave, a: 0.006, d: 0.09, s: 0.72, r: 0.07, bus: G.lead, echo: 0.22, echoB: true, vib: ev.len >= 4 ? { rate: 5.6, depth: 9, delay: 0.16 } : null });
        if (s.harmony) {
          // 祝いの曲：旋律の下に和音の音を 2 つ重ねて、管の合奏のように
          const below = [...ch].map((pc) => { let m = ev.m - 1; while (((m % 12) + 12) % 12 !== pc) m--; return m; }).sort((a, b) => b - a);
          e.tone({ t, m: below[0], dur, vol: 0.05, wave: 'p50', a: 0.006, d: 0.1, s: 0.7, r: 0.07, bus: G.lead, pan: -0.25 });
          e.tone({ t, m: below[1], dur, vol: 0.045, wave: 'p25', a: 0.006, d: 0.1, s: 0.7, r: 0.07, bus: G.lead, pan: 0.25 });
        }
      }
    }

    if (on.has('bass')) {
      const root = ch[0] < 4 ? 48 + ch[0] : 36 + ch[0];
      const pat = s.drums === 'soft' ? { 0: [0, 6], 8: [7, 4], 12: [12, 3] } : s.drums === 'march' ? { 0: [0, 3], 4: [0, 3], 8: [7, 3], 12: [0, 2], 14: [7, 2] } : { 0: [0, 3], 3: [0, 1], 4: [7, 2], 6: [0, 2], 8: [0, 3], 11: [0, 1], 12: [12, 2], 14: [7, 2] };
      const p = pat[pos];
      if (p) e.tone({ t, m: root + p[0], dur: p[1] * st * 0.86, vol: 0.2, wave: 'tri', a: 0.005, r: 0.05, bus: G.bass });
    }

    if (on.has('arp')) {
      const soft = s.drums === 'soft';
      if (!soft || pos % 2 === 0) {
        const order = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3];
        const k = order[pos];
        const m = 60 + ch[k % 3] + (ch[k % 3] < ch[0] ? 12 : 0) + Math.floor(k / 3) * 12;
        e.tone({ t, m, dur: st * (soft ? 1.6 : 0.8), vol: soft ? 0.05 : 0.036, wave: 'p12', a: 0.003, d: 0.06, s: 0.4, r: 0.04, bus: G.arp, pan: pos % 2 ? 0.38 : -0.38, echo: soft ? 0.3 : 0.12, echoB: true });
      }
    }

    if (on.has('drums')) this._drums(s, bar, pos, t, G.drums);

    if (on.has('pad')) {
      if (pos === 0 || (Array.isArray(s.chords[bar]) && pos === 8)) {
        const len = Array.isArray(s.chords[bar]) ? 8 : 16;
        // 和音の 3 度と 5 度を長く伸ばす（厚み）
        for (const [i, pan] of [[1, -0.5], [2, 0.5]]) {
          const m = 60 + ch[i] + (ch[i] < 4 ? 12 : 0);
          e.tone({ t, m, dur: len * st * 0.96, vol: 0.03, wave: 'p50', a: 0.09, r: 0.12, bus: G.pad, pan, vib: { rate: 4.2, depth: 6, delay: 0.3 } });
        }
      }
      // 小節の終わりのきらめき（4 小節ごと）
      if (bar % 4 === 3 && pos >= 12 && !s.once) {
        const m = 84 + ch[(pos - 12) % 3];
        e.tone({ t, m, dur: st * 0.7, vol: 0.03, wave: 'tri', a: 0.002, d: 0.05, s: 0.3, r: 0.05, bus: G.pad, echo: 0.5, echoB: true, pan: (pos % 2 ? 1 : -1) * 0.6 });
      }
    }
  }

  _drums(s, bar, pos, t, bus) {
    const e = this.eng;
    const kick = (v = 1) => {
      e.tone({ t, f: 150, to: 46, toT: 0.11, dur: 0.1, vol: 0.34 * v, wave: 'sin', a: 0.002, r: 0.05, bus });
      e.noise({ t, dur: 0.012, vol: 0.06 * v, lp: 1800, bus, seed: 0.3 });
    };
    const snare = (v = 1) => {
      e.noise({ t, dur: 0.11, vol: 0.13 * v, bp: 1900, q: 0.7, bus, seed: 0.11 + pos * 0.01 });
      e.tone({ t, f: 210, to: 150, toT: 0.05, dur: 0.05, vol: 0.07 * v, wave: 'tri', bus });
    };
    const hat = (v = 1, open = false) => e.noise({ t, type: 'metal', rate: 1.6, dur: open ? 0.09 : 0.028, vol: 0.035 * v, hp: 6500, bus, pan: 0.2, seed: 0.05 * pos });
    if (s.drums === 'soft') {
      if (pos % 4 === 2) hat(0.6);
      if (pos === 0) e.tone({ t, f: 120, to: 60, toT: 0.08, dur: 0.07, vol: 0.14, wave: 'sin', bus });
      return;
    }
    if (s.drums === 'march') {
      if (pos % 4 === 0) kick();
      if (pos % 4 === 2 || (pos % 4 === 3 && bar % 2 === 1)) snare(0.8);
      if (pos === 0 && (bar === 0 || bar === 3)) e.noise({ t, dur: 0.9, vol: 0.09, hp: 5200, bus, seed: 0.5 });
      if (bar === 3 && pos >= 8 && pos < 12) snare(0.5 + (pos - 8) * 0.12);
      return;
    }
    const fill = s.fillBars?.includes(bar) && pos >= 12;
    if (pos === 0 || pos === 8 || pos === 10) kick(pos === 10 ? 0.7 : 1);
    if (pos === 4 || pos === 12) snare();
    if (fill && pos > 12) snare(0.45 + (pos - 12) * 0.12);
    if (pos % 2 === 0) hat(pos % 4 === 2 ? 1 : 0.55, pos === 14 && bar % 2 === 1);
    else if (pos % 4 === 3) hat(0.3);
  }
}
