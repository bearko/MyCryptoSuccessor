// 音の土台。1 つの AudioContext の上に、音源 → BGM・SE のバス → まとめの音量 → コンプレッサー → 出力 を組む。
// 音はすべて合成（矩形波・三角波・ノイズ）。素材のファイルは使わない。
// OfflineAudioContext を渡せば、同じ作りで WAV に書き出せる（確かめ用）。

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Engine {
  /** @param {BaseAudioContext} ctx */
  constructor(ctx) {
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

    // やまびこ：BGM 用（拍に合わせる）と SE 用（短い）
    this.echoB = this._echo(0.388, 0.3, 2400, this.bgm);
    this.echoS = this._echo(0.13, 0.22, 3200, this.se);

    this.waves = {
      p12: this._pulse(0.125),
      p25: this._pulse(0.25),
      p50: this._pulse(0.5),
    };
    this.noiseBuf = { white: this._white(), metal: this._metal() };
    this.vol = { bgm: 0.7, se: 0.8, mute: false };
    this._applyVol(0);
  }

  get now() {
    return this.ctx.currentTime;
  }

  _echo(time, fb, lp, dest) {
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

  _pulse(duty) {
    const n = 40;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return this.ctx.createPeriodicWave(re, im);
  }

  _white() {
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

  _metal() {
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

  _applyVol(ramp = 0.05) {
    const t = this.now;
    const m = this.vol.mute ? 0 : 1;
    // 聞こえ方がなめらかに変わるよう、音量は 2 乗で効かせる
    const b = this.vol.bgm * this.vol.bgm * 0.9 * m;
    const s = this.vol.se * this.vol.se * 1.0 * m;
    if (ramp > 0) {
      this.bgm.gain.setTargetAtTime(b, t, ramp);
      this.se.gain.setTargetAtTime(s, t, ramp);
    } else {
      this.bgm.gain.value = b;
      this.se.gain.value = s;
    }
  }
  setVol(part) {
    Object.assign(this.vol, part);
    this._applyVol();
  }

  /**
   * 音程のある 1 音。
   * o: { t, f|m, dur, vol, wave, a, d, s, r, bus, pan, to, toT, vib, det, echo }
   */
  tone(o) {
    const c = this.ctx;
    const t = Math.max(o.t ?? this.now, 0);
    const f = o.f ?? midiHz(o.m);
    const dur = o.dur ?? 0.1;
    const vol = o.vol ?? 0.1;
    const a = o.a ?? 0.004;
    const d = o.d ?? 0;
    const s = o.s ?? 1;
    const r = o.r ?? 0.04;
    const osc = c.createOscillator();
    const w = o.wave ?? 'p25';
    if (this.waves[w]) osc.setPeriodicWave(this.waves[w]);
    else osc.type = w === 'tri' ? 'triangle' : w === 'sin' ? 'sine' : w === 'saw' ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + (o.toT ?? dur));
    if (o.det) osc.detune.setValueAtTime(o.det, t);
    const g = c.createGain();
    const hold = Math.max(t + a + d, t + dur);
    const sus = Math.max(0.0001, vol * s);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    if (d > 0) g.gain.exponentialRampToValueAtTime(sus, t + a + d);
    g.gain.setValueAtTime(d > 0 ? sus : vol, hold);
    g.gain.exponentialRampToValueAtTime(0.0001, hold + r);
    const end = hold + r + 0.03;
    let lfo = null;
    if (o.vib) {
      lfo = c.createOscillator();
      lfo.frequency.value = o.vib.rate ?? 5.5;
      const lg = c.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.setValueAtTime(0, t + (o.vib.delay ?? 0.15));
      lg.gain.linearRampToValueAtTime(o.vib.depth ?? 8, t + (o.vib.delay ?? 0.15) + 0.12);
      lfo.connect(lg).connect(osc.detune);
      lfo.start(t);
      lfo.stop(end);
    }
    let tail = g;
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
    return end;
  }

  /**
   * ノイズの 1 発（クリック・紙・太鼓の皮）。
   * o: { t, dur, vol, type, rate, hp, lp, bp, q, a, bus, pan, sweep }
   */
  noise(o) {
    const c = this.ctx;
    const t = Math.max(o.t ?? this.now, 0);
    const dur = o.dur ?? 0.03;
    const vol = o.vol ?? 0.2;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf[o.type ?? 'white'];
    src.loop = true;
    src.playbackRate.value = o.rate ?? 1;
    let node = src;
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
    src.stop(t + a + dur + 0.03);
  }
}

export { midiHz };
