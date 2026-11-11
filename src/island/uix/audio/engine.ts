/**
 * 段 UIX1s：音の土台。1 つの AudioContext の上に、
 * 音源 → BGM・SE・環境の 3 本のバス → まとめの音量 → コンプレッサー → 天井 → 出力 を組む。
 * 音はすべて合成（矩形波・三角波・ノイズ）。素材のファイルは使わない。
 * OfflineAudioContext を渡せば、同じ作りで WAV に書き出せる（確かめ用）。
 * 値は見本（public/uixlab/c/js/audio.js）のまま。足したのは、環境のバスと、SE の長さを測る印（mark）だけ。
 */

export const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** 波形：p12・p25・p50 は矩形波の幅（12.5%・25%・50%）。tri 三角・sin 正弦・saw のこぎり */
export type Wave = 'p12' | 'p25' | 'p50' | 'tri' | 'sin' | 'saw' | 'sq';

export interface Vib {
  rate?: number;
  depth?: number;
  delay?: number;
}

/** 音程のある 1 音 */
export interface ToneOpt {
  /** 鳴らす時刻（省くと今） */
  t?: number;
  /** 周波数（Hz）。m（MIDI の番号）のどちらか */
  f?: number;
  m?: number;
  dur?: number;
  vol?: number;
  wave?: Wave;
  a?: number;
  d?: number;
  s?: number;
  r?: number;
  bus?: AudioNode;
  pan?: number;
  /** 周波数を to へ滑らせる（toT 秒かけて） */
  to?: number;
  toT?: number;
  vib?: Vib | null;
  /** ずらし（セント） */
  det?: number;
  /** やまびこへ送る量 */
  echo?: number;
  /** SE でも、BGM 用の（拍に合った）やまびこへ送る */
  echoB?: boolean;
}

/** ノイズの 1 発（クリック・紙・太鼓の皮） */
export interface NoiseOpt {
  t?: number;
  dur?: number;
  vol?: number;
  type?: 'white' | 'metal';
  rate?: number;
  hp?: number;
  lp?: number;
  bp?: number;
  q?: number;
  a?: number;
  bus?: AudioNode;
  pan?: number;
  sweep?: number;
  seed?: number;
}

export interface Vol {
  /** 0〜1 */
  bgm: number;
  /** 0〜1 */
  se: number;
  mute: boolean;
}

interface Echo {
  inp: GainNode;
  delay: DelayNode;
}

export class Engine {
  readonly ctx: BaseAudioContext;
  readonly master: GainNode;
  readonly comp: DynamicsCompressorNode;
  readonly out: GainNode;
  readonly bgm: GainNode;
  readonly bgmTone: BiquadFilterNode;
  readonly se: GainNode;
  /** 環境の音（地図の上の継続音）のバス。いまは鳴らすものが無い（次の段で使う） */
  readonly env: GainNode;
  readonly echoB: Echo;
  readonly echoS: Echo;
  private waves: Partial<Record<Wave, PeriodicWave>>;
  private noiseBuf: { white: AudioBuffer; metal: AudioBuffer };
  vol: Vol = { bgm: 0.7, se: 0.8, mute: false };
  /** いちばん遅く終わる音の時刻（SE の 1 回ぶんの長さを測るのに使う。測る側が 0 に戻す） */
  mark = 0;
  /** 確かめ用：これまでに作った音の数 */
  made = 0;
  /** 書き出しのとき、「いま」を決まった時刻にずらす（null なら本当の今） */
  fakeNow: number | null = null;
  /**
   * 立ち上がりの「プチ」を消すか（既定は false＝見本のまま）。
   * 見本の作りでは、音の始まる時刻が標本の境目からずれていると、音量の包み（0.0001 から上げる）が効く 1 標本前に、
   * 音源の最初の 1 標本だけが元の大きさで出ることがある（矩形波とノイズ。三角波・正弦波は 0 から始まるので出ない）。
   * true にすると、包みのはじめの値を先に 0.0001 にして、その 1 標本を出さない。ほかの値は何も変えない。
   * 耳で比べてから決めるため、見本帳（?uix=sound）に切り替えを置いてある。docs/ISLAND_UIX_SOUND.md
   */
  clean = false;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    const c = ctx;
    // 出口：まとめの音量 → コンプレッサー → 天井
    this.master = c.createGain();
    this.master.gain.value = 1;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -15;
    this.comp.knee.value = 10;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.14;
    this.out = c.createGain();
    this.out.gain.value = 0.82;
    this.master.connect(this.comp).connect(this.out).connect(c.destination);

    // BGM のバス：矩形波の角を少し丸める（長く聴いても疲れないように）
    this.bgm = c.createGain();
    this.bgmTone = c.createBiquadFilter();
    this.bgmTone.type = 'lowpass';
    this.bgmTone.frequency.value = 6200;
    this.bgmTone.Q.value = 0.4;
    this.bgm.connect(this.bgmTone).connect(this.master);
    // SE のバス
    this.se = c.createGain();
    this.se.connect(this.master);
    // 環境のバス
    this.env = c.createGain();
    this.env.connect(this.master);

    // やまびこ：BGM 用（拍に合わせる）と SE 用（短い）
    this.echoB = this.echo(0.388, 0.3, 2400, this.bgm);
    this.echoS = this.echo(0.13, 0.22, 3200, this.se);

    this.waves = {
      p12: this.pulse(0.125),
      p25: this.pulse(0.25),
      p50: this.pulse(0.5),
    };
    this.noiseBuf = { white: this.white(), metal: this.metal() };
    this.applyVol(0);
  }

  get now(): number {
    return this.fakeNow ?? this.ctx.currentTime;
  }

  private echo(time: number, fb: number, lp: number, dest: AudioNode): Echo {
    const c = this.ctx;
    const inp = c.createGain();
    const d = c.createDelay(1);
    d.delayTime.value = time;
    const f = c.createGain();
    f.gain.value = fb;
    const l = c.createBiquadFilter();
    l.type = 'lowpass';
    l.frequency.value = lp;
    inp.connect(d);
    d.connect(l).connect(f).connect(d);
    l.connect(dest);
    return { inp, delay: d };
  }

  private pulse(duty: number): PeriodicWave {
    const n = 40;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return this.ctx.createPeriodicWave(re, im);
  }

  private white(): AudioBuffer {
    const c = this.ctx;
    const b = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = b.getChannelData(0);
    let s = 22222;
    for (let i = 0; i < d.length; i++) {
      // 決まった乱数（書き出しのたびに同じ音になる）
      s = (s * 16807) % 2147483647;
      d[i] = (s / 2147483647) * 2 - 1;
    }
    return b;
  }

  private metal(): AudioBuffer {
    // 周期の短いノイズ：金物っぽい「チッ」になる
    const c = this.ctx;
    const len = 93 * 32;
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    let r = 1;
    for (let i = 0; i < len; i++) {
      if (i % 8 === 0) {
        const bit = (r ^ (r >> 6)) & 1;
        r = (r >> 1) | (bit << 14);
      }
      d[i] = r & 1 ? 0.9 : -0.9;
    }
    return b;
  }

  private applyVol(ramp = 0.05): void {
    const t = this.now;
    const m = this.vol.mute ? 0 : 1;
    // 聞こえ方がなめらかに変わるよう、音量は 2 乗で効かせる
    const b = this.vol.bgm * this.vol.bgm * 0.9 * m;
    const s = this.vol.se * this.vol.se * 1.0 * m;
    if (ramp > 0) {
      this.bgm.gain.setTargetAtTime(b, t, ramp);
      this.se.gain.setTargetAtTime(s, t, ramp);
      this.env.gain.setTargetAtTime(s, t, ramp);
    } else {
      this.bgm.gain.value = b;
      this.se.gain.value = s;
      this.env.gain.value = s;
    }
  }
  setVol(part: Partial<Vol>): void {
    Object.assign(this.vol, part);
    this.applyVol();
  }

  /** 音程のある 1 音。返り値：音が終わる時刻 */
  tone(o: ToneOpt): number {
    const c = this.ctx;
    const t = Math.max(o.t ?? this.now, 0);
    const f = o.f ?? midiHz(o.m ?? 69);
    const dur = o.dur ?? 0.1;
    const vol = o.vol ?? 0.1;
    const a = o.a ?? 0.004;
    const d = o.d ?? 0;
    const s = o.s ?? 1;
    const r = o.r ?? 0.04;
    const osc = c.createOscillator();
    const w = o.wave ?? 'p25';
    const pw = this.waves[w];
    if (pw) osc.setPeriodicWave(pw);
    else osc.type = w === 'tri' ? 'triangle' : w === 'sin' ? 'sine' : w === 'saw' ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + (o.toT ?? dur));
    if (o.det) osc.detune.setValueAtTime(o.det, t);
    const g = c.createGain();
    if (this.clean) g.gain.value = 0.0001;
    const hold = Math.max(t + a + d, t + dur);
    const sus = Math.max(0.0001, vol * s);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    if (d > 0) g.gain.exponentialRampToValueAtTime(sus, t + a + d);
    g.gain.setValueAtTime(d > 0 ? sus : vol, hold);
    g.gain.exponentialRampToValueAtTime(0.0001, hold + r);
    const end = hold + r + 0.03;
    if (o.vib) {
      const lfo = c.createOscillator();
      lfo.frequency.value = o.vib.rate ?? 5.5;
      const lg = c.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.setValueAtTime(0, t + (o.vib.delay ?? 0.15));
      lg.gain.linearRampToValueAtTime(o.vib.depth ?? 8, t + (o.vib.delay ?? 0.15) + 0.12);
      lfo.connect(lg).connect(osc.detune);
      lfo.start(t);
      lfo.stop(end);
    }
    let tail: AudioNode = g;
    osc.connect(g);
    if (o.pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = o.pan;
      g.connect(p);
      tail = p;
    }
    const bus = o.bus ?? this.se;
    tail.connect(bus);
    if (o.echo) {
      const e = c.createGain();
      e.gain.value = o.echo;
      tail.connect(e).connect(bus === this.bgm || o.echoB ? this.echoB.inp : this.echoS.inp);
    }
    osc.start(t);
    osc.stop(end);
    if (end > this.mark) this.mark = end;
    this.made++;
    return end;
  }

  /** ノイズの 1 発 */
  noise(o: NoiseOpt): void {
    const c = this.ctx;
    const t = Math.max(o.t ?? this.now, 0);
    const dur = o.dur ?? 0.03;
    const vol = o.vol ?? 0.2;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf[o.type ?? 'white'];
    src.loop = true;
    src.playbackRate.value = o.rate ?? 1;
    let node: AudioNode = src;
    if (o.hp) {
      const f = c.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = o.hp;
      node = node.connect(f);
    }
    if (o.lp) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(o.lp, t);
      if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
      node = node.connect(f);
    }
    if (o.bp) {
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(o.bp, t);
      if (o.sweep && !o.lp) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
      f.Q.value = o.q ?? 1.2;
      node = node.connect(f);
    }
    const g = c.createGain();
    if (this.clean) g.gain.value = 0.0001;
    const a = o.a ?? 0.001;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
    node = node.connect(g);
    if (o.pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = o.pan;
      node = node.connect(p);
    }
    node.connect(o.bus ?? this.se);
    // ノイズの始まりを少しずつずらす（同じ音の繰り返しに聞こえないように）
    src.start(t, ((o.seed ?? t * 7.13) % 0.9) + 0.01);
    const end = t + a + dur + 0.03;
    src.stop(end);
    if (end > this.mark) this.mark = end;
    this.made++;
  }
}
