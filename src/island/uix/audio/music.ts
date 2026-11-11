/**
 * 段 UIX1s：BGM。16 分音符の格子で鳴らす小さなシーケンサー（見本 public/uixlab/c/js/music.js を移した）。
 * ・地図の曲は 5 層（旋律・低音・分散和音・太鼓・和音の厚み）。層は小節の頭で増える。
 * ・曲の切り替えも小節の頭でそろえる。前の曲の残りは 0.3 秒で消し、次の曲は頭から鳴らす（短いクロスフェード）。
 * ・いま鳴っている和音を SE に教える（harmony）。押す音が曲に溶けるようにするため。
 */
import type { Engine } from './engine';
import { CHORD, LAYERS, SONGS, type BarChord, type ChordName, type DrumStyle, type Layer, type Song, type SongName } from './songs';

/**
 * どれだけ先まで音を予約するか（秒）。見本は 0.16 秒。
 * 本体は、日が変わる処理などで画面の処理が 0.1〜0.4 秒止まることがある（調査の 7-3）。0.16 秒だと、止まっているあいだに
 * 予約が切れて拍が遅れるので、0.5 秒先まで予約する。音そのもの（鳴る時刻・音色）は変わらない。
 * 代わりに、層の出入りと場面の切り替えが効くのは「もう予約した小節の次」なので、小節の終わり 0.5 秒で頼むと 1 小節あとになる。
 */
export const AHEAD_S = 0.5;
/**
 * 重い端末では、予約の時計（30ms ごと）そのものが間に合わなくなる。時計の間隔が開いたら、その 2.5 倍先（上限 2 秒）まで予約する。
 * 間隔が戻れば、少しずつ 0.5 秒へ戻る
 */
export const AHEAD_MAX_S = 2;
export const aheadFor = (gap: number): number => Math.min(AHEAD_MAX_S, Math.max(AHEAD_S, gap * 2.5));
/** 予約が間に合わず過ぎてしまった音は、まとめて鳴らさずに捨てる（これより遅れたら）。拍の位置は保つ */
export const LATE_S = 0.03;

/** 分散和音の順（見本のまま）と、別の順（この段で足した。山を 2 つに分ける） */
const ARP = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3];
const ARP_ALT = [0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 1, 2, 4, 3, 2, 1];
/** 発掘：上から下りる */
const ARP_DIG = [3, 2, 1, 0, 2, 1, 0, 1, 3, 2, 1, 0, 2, 1, 0, 1];

/** 低音の型：位置 → [根音からの半音, 長さ（16 分音符）] */
type BassPat = Record<number, [number, number]>;
const BASS: Record<DrumStyle, BassPat> = {
  map: { 0: [0, 3], 3: [0, 1], 4: [7, 2], 6: [0, 2], 8: [0, 3], 11: [0, 1], 12: [12, 2], 14: [7, 2] },
  light: { 0: [0, 3], 3: [0, 1], 4: [7, 2], 6: [0, 2], 8: [0, 3], 11: [0, 1], 12: [12, 2], 14: [7, 2] },
  soft: { 0: [0, 6], 8: [7, 4], 12: [12, 3] },
  march: { 0: [0, 3], 4: [0, 3], 8: [7, 3], 12: [0, 2], 14: [7, 2] },
  dig: { 0: [0, 6], 8: [0, 2], 10: [7, 2], 12: [0, 3] },
  board: { 0: [0, 3], 4: [7, 3], 8: [0, 3], 12: [7, 3] },
};

interface Deck {
  out: GainNode;
  layer: Record<Layer, GainNode>;
}

export class Music {
  readonly eng: Engine;
  song: Song | null = null;
  name: SongName | '' = '';
  /** いまの曲の 0 小節目の時刻 */
  t0 = 0;
  /** 次に鳴らす 16 分音符（曲の頭から数えて） */
  n = 0;
  /** 層の数（1〜5）。層を固定しない曲（地図）だけに効く */
  level = 2;
  on = new Set<Layer>(['lead', 'bass']);
  pending: SongName | null = null;
  /** 1 回だけの曲（制覇）のあとに戻る曲 */
  after: SongName = 'map';
  /** OfflineAudioContext で書き出すとき true（時計で鳴らさない。pump を自分で呼ぶ） */
  offline = false;
  private timer: ReturnType<typeof setInterval> | 0 = 0;
  private prev: { song: Song; t0: number } | null = null;
  /** 確かめ用：予約が間に合わずに捨てた 16 分音符の数 */
  late = 0;
  /** 予約の時計の、最近のいちばん開いた間隔（秒） */
  gap = 0;
  private lastPump = -1;
  /** 小節の頭ごとに呼ぶ（t：その時刻・bar：曲の中の小節・layers：鳴っている層） */
  onBar: ((t: number, name: SongName, bar: number, layers: Layer[]) => void) | null = null;
  /** 曲を重ねて替えるための 2 つの出口 */
  private decks: Deck[];
  private cur = 0;

  constructor(eng: Engine) {
    this.eng = eng;
    const mk = (): Deck => {
      const out = eng.ctx.createGain();
      out.gain.value = 1;
      out.connect(eng.bgm);
      const layer = {} as Record<Layer, GainNode>;
      for (const k of LAYERS) {
        const g = eng.ctx.createGain();
        g.gain.value = 1;
        g.connect(out);
        layer[k] = g;
      }
      return { out, layer };
    };
    this.decks = [mk(), mk()];
  }

  get step(): number {
    return 60 / (this.song?.bpm ?? 116) / 4;
  }

  /** 曲を今すぐ始める。fromBar：その小節から（省くと頭から。見本帳で、曲の途中の節を聴くのに使う） */
  start(name: SongName, at?: number, fromBar = 0): void {
    this.song = SONGS[name];
    this.name = name;
    this.n = Math.max(0, Math.floor(fromBar)) * 16;
    this.t0 = (at ?? this.eng.now + 0.08) - this.n * this.step;
    this.pending = null;
    this.prev = null;
    this.lastPump = -1;
    const d = this.decks[this.cur];
    d.out.gain.cancelScheduledValues(0);
    d.out.gain.value = 1;
    if (!this.timer && !this.offline && typeof setInterval === 'function') {
      this.timer = setInterval(() => this.pump(), 30);
      // テスト（node）で、時計が残って終われなくなるのを防ぐ（ブラウザでは何もしない）
      (this.timer as unknown as { unref?: () => void }).unref?.();
    }
    this.pump();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
    this.song = null;
    this.name = '';
    this.pending = null;
    // 予約ずみの音は、出口を絞って消す
    const t = this.eng.now;
    for (const d of this.decks) {
      d.out.gain.cancelScheduledValues(0);
      d.out.gain.setValueAtTime(d.out.gain.value, t);
      d.out.gain.linearRampToValueAtTime(0.0001, t + 0.12);
    }
    // 次に start したときのための出口へ（止めた出口は絞ったままにして、残りの音を出さない）
    this.cur = 1 - this.cur;
  }

  get playing(): boolean {
    return !!this.song;
  }

  /** 次の小節の頭の時刻 */
  nextBar(): number {
    if (!this.song) return this.eng.now + 0.05;
    const bar = this.step * 16;
    const k = Math.ceil((this.eng.now + 0.06 - this.t0) / bar);
    return this.t0 + Math.max(0, k) * bar;
  }

  /** 次の小節の頭で曲を替える。返り値：その時刻。いまの曲と同じなら、予約を取り消すだけ */
  cue(name: SongName, after?: SongName): number {
    if (after) this.after = after;
    this.pending = name === this.name ? null : name;
    return this.nextBarAfterScheduled();
  }
  nextBarAfterScheduled(): number {
    // もう予約した小節の次（予約ずみの音は取り消さない）
    const bar = this.step * 16;
    const k = Math.ceil(this.n / 16);
    const t = this.t0 + k * bar;
    return t < this.eng.now + 0.02 ? t + bar : t;
  }

  /** 層の数（1〜5）。小節の頭で効く */
  setLevel(n: number): void {
    this.level = Math.max(1, Math.min(5, Math.round(n)));
  }

  /** 拍の位置（0〜1：1 拍のうち）と、小節の中の拍（0〜3） */
  beat(now = this.eng.now): { frac: number; beat: number; bar: number } {
    if (!this.song) return { frac: 0, beat: 0, bar: 0 };
    const b = (now - this.t0) / (this.step * 4);
    const fb = Math.floor(b);
    return { frac: b - fb, beat: ((fb % 4) + 4) % 4, bar: Math.floor(fb / 4) };
  }

  /** いま（か、その時刻）の和音。SE が音程を合わせるのに使う */
  harmony(t = this.eng.now): { pcs: number[]; root: number } {
    if (!this.song) return { pcs: CHORD.C, root: 0 };
    // 先に予約した次の曲が始まる前は、前の曲の和音で答える
    const cur = t < this.t0 && this.prev ? this.prev : { song: this.song, t0: this.t0 };
    const s = cur.song;
    const st = Math.floor((t - cur.t0) / (60 / s.bpm / 4));
    const bar = ((Math.floor(st / 16) % s.bars) + s.bars) % s.bars;
    const pos = ((st % 16) + 16) % 16;
    const pcs = CHORD[chordName(s.chords[bar], pos)];
    return { pcs, root: pcs[0] };
  }

  /** いま鳴っている層（確かめ用・見本帳のランプ） */
  layers(): Layer[] {
    return LAYERS.filter((k) => this.on.has(k));
  }

  pump(until?: number): void {
    if (!this.song) return;
    const now = this.eng.now;
    if (until == null) {
      // 時計の間隔（音の時刻で測る）。開いたらすぐ覚え、戻るときはゆっくり
      const dt = this.lastPump < 0 ? 0 : now - this.lastPump;
      this.lastPump = now;
      this.gap = Math.max(dt, this.gap * 0.97);
    }
    const lim = until ?? now + aheadFor(this.gap);
    let guard = 0;
    while (this.song && this.t0 + this.n * this.step < lim && guard++ < 4000) {
      const pos = this.n % 16;
      if (pos === 0) this.barHead();
      const t = this.t0 + this.n * this.step;
      // 書き出し（offline）では捨てない。本番で、止まっていたあいだに過ぎた音だけを捨てる
      if (this.offline || t >= now - LATE_S) this.emit(this.n, t);
      else this.late++;
      this.n++;
    }
  }

  private barHead(): void {
    const t = this.t0 + this.n * this.step;
    const s = this.song!;
    const barIdx = this.n / 16;
    // 曲の切り替え（小節の頭）
    let next = this.pending;
    if (!next && s.once && barIdx >= s.bars) next = this.after;
    let fresh = false;
    if (next && next !== this.name) {
      this.pending = null;
      this.prev = { song: s, t0: this.t0 };
      this.song = SONGS[next];
      this.name = next;
      this.t0 = t;
      this.n = 0;
      // 前の曲の残り（伸ばした音の終わり）を 0.3 秒で消して、次の曲は別の出口から頭を鳴らす
      const old = this.decks[this.cur];
      old.out.gain.cancelScheduledValues(t);
      old.out.gain.setValueAtTime(1, t);
      old.out.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      this.cur = 1 - this.cur;
      const d = this.decks[this.cur];
      d.out.gain.cancelScheduledValues(0);
      d.out.gain.setValueAtTime(1, Math.max(0, t - 0.001));
      fresh = true;
    } else if (next) this.pending = null;
    // 層の出入り（小節の頭）
    const song = this.song!;
    const want = new Set<Layer>(song.layers ?? LAYERS.slice(0, this.level));
    const G = this.decks[this.cur].layer;
    for (const k of LAYERS) {
      const g = G[k].gain;
      if (want.has(k) && !this.on.has(k)) {
        g.cancelScheduledValues(t);
        g.setValueAtTime(0.0001, t);
        g.exponentialRampToValueAtTime(1, t + this.step * 4);
      } else if (!want.has(k) && this.on.has(k) && !fresh) {
        g.cancelScheduledValues(t);
        g.setValueAtTime(1, t);
        g.exponentialRampToValueAtTime(0.0001, t + this.step * 2);
      } else if (fresh && want.has(k)) {
        // 出口を替えた：前の曲から続いている層は、そのままの大きさで
        g.cancelScheduledValues(t);
        g.setValueAtTime(1, Math.max(0, t - 0.001));
      }
    }
    this.on = want;
    if (this.onBar) this.onBar(t, this.name as SongName, (this.n / 16) % song.bars, [...want]);
  }

  private emit(n: number, t: number): void {
    const s = this.song!;
    const e = this.eng;
    const st = this.step;
    const bar = Math.floor(n / 16) % s.bars;
    const pos = n % 16;
    const ch = CHORD[chordName(s.chords[bar], pos)];
    const md = s.mods[bar];
    const has = (k: Layer) => this.on.has(k) && !md?.rest?.includes(k);
    const G = this.decks[this.cur].layer;
    const style = md?.drums ?? s.drums;

    if (has('lead')) {
      for (const ev of s.leadEv[bar]) {
        if (ev.pos !== pos) continue;
        const dur = ev.len * st * 0.9;
        const wave = md?.leadWave ?? s.leadWave ?? 'p25';
        e.tone({ t, m: ev.m, dur, vol: wave === 'tri' ? 0.2 : 0.085, wave, a: 0.006, d: 0.09, s: 0.72, r: 0.07, bus: G.lead, echo: 0.22, echoB: true, vib: ev.len >= 4 ? { rate: 5.6, depth: 9, delay: 0.16 } : null });
        if (s.harmony) {
          // 祝いの曲：旋律の下に和音の音を 2 つ重ねて、管の合奏のように
          const below = [...ch]
            .map((pc) => {
              let m = ev.m - 1;
              while (((m % 12) + 12) % 12 !== pc) m--;
              return m;
            })
            .sort((a, b) => b - a);
          e.tone({ t, m: below[0], dur, vol: 0.05, wave: 'p50', a: 0.006, d: 0.1, s: 0.7, r: 0.07, bus: G.lead, pan: -0.25 });
          e.tone({ t, m: below[1], dur, vol: 0.045, wave: 'p25', a: 0.006, d: 0.1, s: 0.7, r: 0.07, bus: G.lead, pan: 0.25 });
        }
      }
    }

    if (has('bass')) {
      const root = ch[0] < 4 ? 48 + ch[0] : 36 + ch[0];
      const p = BASS[style][pos];
      if (p) e.tone({ t, m: root + p[0], dur: p[1] * st * 0.86, vol: 0.2, wave: 'tri', a: 0.005, r: 0.05, bus: G.bass });
    }

    if (has('arp')) {
      const soft = style === 'soft';
      if (!soft || pos % 2 === 0) {
        const order = style === 'dig' ? ARP_DIG : md?.arpAlt ? ARP_ALT : ARP;
        const k = order[pos];
        const m = 60 + ch[k % 3] + (ch[k % 3] < ch[0] ? 12 : 0) + Math.floor(k / 3) * 12;
        e.tone({ t, m, dur: st * (soft ? 1.6 : 0.8), vol: soft ? 0.05 : 0.036, wave: 'p12', a: 0.003, d: 0.06, s: 0.4, r: 0.04, bus: G.arp, pan: pos % 2 ? 0.38 : -0.38, echo: soft ? 0.3 : 0.12, echoB: true });
      }
    }

    if (has('drums')) this.drums(style, !!md?.fill, bar, pos, t, G.drums);

    if (has('pad')) {
      const split = Array.isArray(s.chords[bar]);
      if (pos === 0 || (split && pos === 8)) {
        const len = split ? 8 : 16;
        // 和音の 3 度と 5 度を長く伸ばす（厚み）
        for (const [i, pan] of [
          [1, -0.5],
          [2, 0.5],
        ]) {
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

  private drums(style: DrumStyle, fillBar: boolean, bar: number, pos: number, t: number, bus: AudioNode): void {
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
    if (style === 'soft') {
      if (pos % 4 === 2) hat(0.6);
      if (pos === 0) e.tone({ t, f: 120, to: 60, toT: 0.08, dur: 0.07, vol: 0.14, wave: 'sin', bus });
      return;
    }
    if (style === 'march') {
      if (pos % 4 === 0) kick();
      if (pos % 4 === 2 || (pos % 4 === 3 && bar % 2 === 1)) snare(0.8);
      if (pos === 0 && (bar === 0 || bar === 3)) e.noise({ t, dur: 0.9, vol: 0.09, hp: 5200, bus, seed: 0.5 });
      if (bar === 3 && pos >= 8 && pos < 12) snare(0.5 + (pos - 8) * 0.12);
      return;
    }
    const fill = fillBar && pos >= 12;
    if (style === 'light') {
      // 地図の曲の「休み」：頭の一打と刻みだけ。節の終わりの連打で、ふつうの型へ戻る
      if (pos === 0) kick(0.8);
      if (pos % 4 === 2) hat(0.6);
      if (fill && pos > 12) snare(0.45 + (pos - 12) * 0.12);
      return;
    }
    if (style === 'dig') {
      // 発掘：半分の速さ（3 拍めに小太鼓）。裏拍に、つるはしが石に当たる「チッ」
      if (pos === 0 || pos === 10) kick(pos === 10 ? 0.7 : 1);
      if (pos === 8) snare(0.8);
      if (pos === 4 || pos === 12) {
        e.noise({ t, type: 'metal', rate: 2.4, dur: 0.05, vol: 0.05, hp: 3000, bus, pan: pos === 4 ? -0.3 : 0.3, seed: 0.02 * pos });
        e.tone({ t, m: 91 + (bar % 2 ? 0 : 5), dur: 0.02, vol: 0.018, wave: 'tri', r: 0.06, bus, pan: pos === 4 ? -0.3 : 0.3 });
      }
      if (pos % 4 === 2) hat(0.4);
      return;
    }
    if (style === 'board') {
      // 経営会議：歩みの拍。小太鼓は小さく、偶数の小節の終わりに 2 つ足す
      if (pos === 0 || pos === 8) kick(0.85);
      if (pos === 4 || pos === 12) snare(0.55);
      if (bar % 2 === 1 && (pos === 14 || pos === 15)) snare(0.3 + (pos - 14) * 0.1);
      if (bar % 2 === 0 && pos === 7) snare(0.25);
      if (pos % 2 === 0) hat(pos % 4 === 2 ? 0.6 : 0.35);
      return;
    }
    if (pos === 0 || pos === 8 || pos === 10) kick(pos === 10 ? 0.7 : 1);
    if (pos === 4 || pos === 12) snare();
    if (fill && pos > 12) snare(0.45 + (pos - 12) * 0.12);
    if (pos % 2 === 0) hat(pos % 4 === 2 ? 1 : 0.55, pos === 14 && bar % 2 === 1);
    else if (pos % 4 === 3) hat(0.3);
  }
}

const chordName = (c: BarChord, pos: number): ChordName => (Array.isArray(c) ? c[pos < 8 ? 0 : 1] : c);
