// 段 UIX1s（docs/ISLAND_UIX_SOUND.md）：音の土台。切り替え・音の口の名前・重なりの上限・層の決め方・隠れたら止まる・設定の保存・見本からの移し間違いが無いこと。
// WebAudio は小さな偽物で置き換える（鳴らさずに、作った音源の数と中身だけを見る）。
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { IslandSfx } from '../src/island/p1/sfx';
import { ALL_SFX, MAX_VOICES, SAME_GAP_MS, SfxBank, UX_SFX, isSfxName } from '../src/island/uix/audio/bank';
import { UxSound, boxSound, type UxEnv, type UxScene } from '../src/island/uix/audio/core';
import { Engine, type NoiseOpt, type ToneOpt } from '../src/island/uix/audio/engine';
import { LEGACY_SFX, legacyToUx } from '../src/island/uix/audio/legacy';
import { BASE_LEVEL, PACE_FROM_DAY, growing, mapLevel, momentumParts, type Momentum } from '../src/island/uix/audio/level';
import { AHEAD_MAX_S, AHEAD_S, LATE_S, Music, aheadFor } from '../src/island/uix/audio/music';
import { DEF_BGM, DEF_SE, SOUND_KEY, loadVol, nextStep, saveVol, volFrom } from '../src/island/uix/audio/prefs';
import { Sfx } from '../src/island/uix/audio/sfx';
import { LAYERS, MAP_FORM, SONGS, SONG_LEAD_TEXT, SONG_NAMES, lineLen } from '../src/island/uix/audio/songs';
import { uxSfx } from '../src/island/uix/sound';

// ---------------------------------------------------------------- 偽物の WebAudio

const param = (v = 0) => {
  const p = {
    value: v,
    setValueAtTime: (x: number) => ((p.value = x), p),
    linearRampToValueAtTime: () => p,
    exponentialRampToValueAtTime: () => p,
    setTargetAtTime: (x: number) => ((p.value = x), p),
    cancelScheduledValues: () => p,
  };
  return p;
};
class FakeCtx {
  currentTime = 0;
  sampleRate = 8000;
  state: 'suspended' | 'running' | 'closed' = 'running';
  destination = {};
  made: Record<string, number> = {};
  suspends = 0;
  resumes = 0;
  /** BufferSource につないだ Gain の値（今の効果音の大きさを見る） */
  srcGains: number[] = [];
  private node(kind: string, extra: Record<string, unknown> = {}) {
    this.made[kind] = (this.made[kind] ?? 0) + 1;
    const n: Record<string, unknown> = { kind, ...extra };
    n.connect = (to: unknown) => {
      if (kind === 'src' && (to as { kind?: string }).kind === 'gain') queueMicrotask(() => this.srcGains.push(((to as { gain: { value: number } }).gain.value)));
      return to;
    };
    n.start = () => undefined;
    n.stop = () => undefined;
    return n;
  }
  createGain = () => this.node('gain', { gain: param(1) });
  createOscillator = () => this.node('osc', { frequency: param(440), detune: param(0), type: 'sine', setPeriodicWave: () => undefined });
  createBufferSource = () => this.node('src', { buffer: null, loop: false, playbackRate: param(1) });
  createBiquadFilter = () => this.node('filter', { type: 'lowpass', frequency: param(350), Q: param(1) });
  createDynamicsCompressor = () => this.node('comp', { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
  createDelay = () => this.node('delay', { delayTime: param() });
  createStereoPanner = () => this.node('pan', { pan: param() });
  createPeriodicWave = () => ({});
  createBuffer = (_ch: number, len: number) => {
    const d = new Float32Array(len);
    return { getChannelData: () => d };
  };
  decodeAudioData = async () => ({ duration: 0.1 });
  suspend = async () => {
    this.suspends++;
    this.state = 'suspended';
  };
  resume = async () => {
    this.resumes++;
    this.state = 'running';
  };
}
const asCtx = (c: FakeCtx) => c as unknown as AudioContext;

/** 偽物のまわりの世界（UxEnv） */
function fakeEnv(o: { cls?: boolean; search?: string; store?: Record<string, string> } = {}) {
  const ctxs: FakeCtx[] = [];
  const win: Record<string, ((e: unknown) => void)[]> = {};
  const doc: Record<string, ((e: unknown) => void)[]> = {};
  const data: Record<string, string> = { ...(o.store ?? {}) };
  const st = { now: 1000, cls: !!o.cls, hidden: false, timers: [] as (() => void)[] };
  const env: UxEnv = {
    win: { addEventListener: (t: string, f: (e: never) => void) => void (win[t] ??= []).push(f as (e: unknown) => void) },
    doc: {
      addEventListener: (t: string, f: (e: never) => void) => void (doc[t] ??= []).push(f as (e: unknown) => void),
      get hidden() {
        return st.hidden;
      },
      documentElement: { classList: { contains: (c: string) => c === 'is-uxc' && st.cls } },
    },
    store: { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) },
    search: o.search ?? '',
    makeContext: () => {
      const c = new FakeCtx();
      ctxs.push(c);
      return asCtx(c);
    },
    now: () => st.now,
    setInterval: (fn) => st.timers.push(fn),
    clearInterval: () => undefined,
  };
  const fire = (t: string, e: unknown = {}) => (win[t] ?? []).forEach((f) => f({ type: t, ...(e as object) }));
  const fireDoc = (t: string) => (doc[t] ?? []).forEach((f) => f({ type: t }));
  const button = { closest: (s: string) => (s === 'button' ? { disabled: false } : null) };
  return { env, ctxs, st, data, fire, fireDoc, button };
}

const mo = (p: Partial<Momentum> = {}): Momentum => ({ rank: 4, companies: 6, salesNow: 0, salesPrev: 1000, salesPrev2: 1000, day: 10, days: 30, ...p });

// ---------------------------------------------------------------- 切り替え

describe('段 UIX1s：切り替え（新しい音は <html class="is-uxc"> か ?uix=1 のときだけ）', () => {
  it('切（既定）：何も作らず、今の音の呼び出しを引き受けない', () => {
    const f = fakeEnv();
    const u = new UxSound(f.env);
    const legacyBgm = vi.fn();
    u.init({ legacyBgm });
    expect(u.on).toBe(false);
    for (const ev of ['pointerdown', 'pointerup', 'click', 'keydown', 'touchend']) f.fire(ev, { target: f.button });
    expect(f.ctxs.length).toBe(0);
    for (const k of LEGACY_SFX) expect(u.legacy(k)).toBe(false);
    for (const n of ALL_SFX) expect(u.sfx(n)).toBe(false);
    expect(legacyBgm).not.toHaveBeenCalled();
    expect(u.stats.legacy).toBe(0);
  });

  it('切のとき、今の効果音（IslandSfx）は 1 つも変わらない：付け替えの口を付けても、同じ音源を同じ大きさで鳴らす', async () => {
    const run = async (withRoute: boolean) => {
      const ctx = new FakeCtx();
      vi.stubGlobal('window', { AudioContext: function () { return ctx; } });
      vi.stubGlobal('fetch', async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
      const sfx = new IslandSfx();
      if (withRoute) {
        // 切の音の本体（何も引き受けない）を、本番と同じ口につなぐ
        const u = new UxSound(fakeEnv().env);
        u.init({});
        sfx.route = (k, g, r) => u.legacy(k, g, r);
      }
      sfx.unlock();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      expect(sfx.info().loaded).toBe(LEGACY_SFX.length);
      const nowSpy = vi.spyOn(performance, 'now');
      let t = 1000;
      for (const k of LEGACY_SFX) {
        // 同じ音の 50ms の間引きにかからないよう、時計を進める
        nowSpy.mockReturnValue((t += 100));
        sfx.play(k);
        sfx.play(k, 0.7, 0.8);
      }
      await new Promise((r) => setTimeout(r, 0));
      nowSpy.mockRestore();
      vi.unstubAllGlobals();
      return { src: ctx.made.src ?? 0, gains: ctx.srcGains.map((x) => Math.round(x * 1000) / 1000) };
    };
    const base = await run(false);
    const routed = await run(true);
    // 24 種を 2 回ずつ。2 回めは 50ms 以内なので間引かれる（今のまま）
    expect(base.src).toBe(LEGACY_SFX.length);
    expect(routed).toEqual(base);
  });

  it('入：class が付いていれば入。今の BGM を止めてもらい、今の効果音の呼び出しはこちらで引き受ける', () => {
    const f = fakeEnv({ cls: true });
    const u = new UxSound(f.env);
    const legacyBgm = vi.fn();
    u.init({ legacyBgm });
    expect(u.on).toBe(true);
    expect(legacyBgm).toHaveBeenCalledWith(true);
    // 最初の操作の前は、音を作らない
    expect(f.ctxs.length).toBe(0);
    expect(u.legacy('tap')).toBe(true);
    f.fire('pointerup', { target: null });
    expect(f.ctxs.length).toBe(1);
    expect(u.music?.playing).toBe(true);
    expect(u.bank?.played.boot).toBe(1);
    // 今の効果音：IslandSfx は鳴らさない（route が true を返す）
    const ctx = new FakeCtx();
    const sfx = new IslandSfx();
    (sfx as unknown as { ctx: unknown; buf: Map<string, unknown> }).ctx = ctx;
    (sfx as unknown as { buf: Map<string, unknown> }).buf.set('levelup', {});
    sfx.route = (k, g, r) => u.legacy(k, g, r);
    sfx.play('levelup');
    expect(ctx.made.src ?? 0).toBe(0);
    expect(u.bank?.played.stamp).toBe(1);
  });

  it('URL の uix=1 でも入。uix=sound（見本帳）・uix=0 では入にならない', () => {
    for (const [search, on] of [['?uix=1', true], ['?uix=0', false], ['?uix=sound', false], ['', false]] as const) {
      const u = new UxSound(fakeEnv({ search }).env);
      u.init({});
      expect(u.on).toBe(on);
    }
  });

  it('uxc:change で入り切りが替わる。切にすると曲を止め、今の BGM を戻してもらう。二重には鳴らさない', () => {
    const f = fakeEnv();
    const u = new UxSound(f.env);
    const legacyBgm = vi.fn();
    u.init({ legacyBgm });
    f.fire('uxc:change', { detail: { on: true } });
    expect(u.on).toBe(true);
    expect(legacyBgm).toHaveBeenLastCalledWith(true);
    expect(f.ctxs.length).toBe(1);
    expect(u.music?.playing).toBe(true);
    expect(u.legacy('error')).toBe(true);
    f.fire('uxc:change', { detail: { on: false } });
    expect(u.on).toBe(false);
    expect(legacyBgm).toHaveBeenLastCalledWith(false);
    expect(u.music?.playing).toBe(false);
    expect(f.ctxs[0].state).toBe('suspended');
    expect(u.legacy('error')).toBe(false);
    expect(u.sfx('press')).toBe(false);
    // もう一度入：同じ AudioContext を使い直す（2 つ作らない）
    f.fire('uxc:change', { detail: { on: true } });
    expect(f.ctxs.length).toBe(1);
    expect(u.music?.playing).toBe(true);
  });

  it('指で押したら press は 1 回だけ：押した瞬間に鳴らし、そのあとの click の「tap」は重ねない。キーで押したときは tap が press になる', () => {
    const f = fakeEnv({ cls: true });
    const u = new UxSound(f.env);
    u.init({});
    f.fire('pointerup', { target: null });
    const played = () => ({ ...u.bank!.played });
    const ctx = f.ctxs[0];
    ctx.currentTime = 1;
    f.fire('pointerdown', { target: f.button });
    expect(played().press).toBe(1);
    ctx.currentTime = 1.1;
    f.st.now += 100;
    f.fire('pointerup', { target: f.button });
    expect(played().release).toBe(1);
    f.st.now += 5;
    f.fire('click', { target: f.button });
    expect(u.legacy('tap')).toBe(true);
    expect(u.legacy('tap')).toBe(true);
    expect(played().press).toBe(1);
    expect(u.stats.legacySkipped).toBe(2);
    // キー（pointer なし）：しばらくあと
    ctx.currentTime = 3;
    f.st.now += 2000;
    expect(u.legacy('tap')).toBe(true);
    expect(played().press).toBe(2);
    // ボタンでない所を押しても press は鳴らさない／data-ux-quiet の部品も鳴らさない
    ctx.currentTime = 4;
    f.fire('pointerdown', { target: { closest: () => null } });
    f.fire('pointerdown', { target: { closest: (s: string) => (s === 'button' ? { disabled: false } : s === '[data-ux-quiet]' ? {} : null) } });
    f.fire('pointerdown', { target: { closest: (s: string) => (s === 'button' ? { disabled: true } : null) } });
    expect(played().press).toBe(2);
  });

  it('札・窓の出入りの音：出たら open・消えたら close・札から札へは tab・窓から窓へは鳴らさない', () => {
    const el = (...cls: string[]) => ({ classList: { contains: (c: string) => cls.includes(c) } }) as unknown as Element;
    expect(boxSound([el('isl-sheet')], [])).toBe('open');
    expect(boxSound([], [el('isl-modal', 'isl-talk')])).toBe('close');
    expect(boxSound([el('isl-sheet')], [el('isl-sheet')])).toBe('tab');
    expect(boxSound([el('isl-modal')], [el('isl-modal')])).toBeNull();
    expect(boxSound([el('isl-toast')], [el('isl-spend')])).toBeNull();
    expect(boxSound([el('ux-sheet')], [])).toBe('open');
  });
});

// ---------------------------------------------------------------- 音の口

describe('段 UIX1s：音の口（uxSfx）と重なりの上限', () => {
  const rig = () => {
    const ctx = new FakeCtx();
    const e = new Engine(asCtx(ctx));
    const m = new Music(e);
    m.offline = true;
    const b = new SfxBank(e, m);
    b.sfx.rnd = () => 0.5;
    return { ctx, e, m, b };
  };

  it('名前は約束の 22 種（見た目の担当と合わせる）。どの名前も、音源を 1 つ以上作る', () => {
    expect([...UX_SFX]).toEqual(['press', 'release', 'open', 'close', 'page', 'tab', 'lever', 'clunk', 'lamp', 'coin', 'cash', 'deny', 'confirm', 'rankup', 'conquest', 'build', 'done', 'tick', 'blip', 'toggle', 'slide', 'error']);
    for (const name of ALL_SFX) {
      const { e, b } = rig();
      const n0 = e.made;
      expect(b.play(name), name).toBe(true);
      expect(e.made, name).toBeGreaterThan(n0);
    }
    expect(isSfxName('press')).toBe(true);
    expect(isSfxName('nope')).toBe(false);
  });

  it('uxSfx は、知らない名前でも・ブラウザの外（切）でも、何もせずに戻る', () => {
    expect(() => uxSfx('press')).not.toThrow();
    expect(() => uxSfx('no-such-sound', { step: 3 })).not.toThrow();
    expect(() => uxSfx('lever', { step: 2, pitch: 1, voice: 0 })).not.toThrow();
  });

  it(`同じ名前は ${SAME_GAP_MS}ms 以内なら 1 つ。間隔が空けばまた鳴る`, () => {
    const { ctx, b } = rig();
    ctx.currentTime = 1;
    expect(b.play('open')).toBe(true);
    ctx.currentTime = 1 + (SAME_GAP_MS - 1) / 1000;
    expect(b.play('open')).toBe(false);
    // 別の名前は鳴る
    expect(b.play('close')).toBe(true);
    ctx.currentTime = 1 + (SAME_GAP_MS + 1) / 1000;
    expect(b.play('open')).toBe(true);
    expect(b.played.open).toBe(2);
    expect(b.dropped.open).toBe(1);
  });

  it(`同時は ${MAX_VOICES} 本まで。節目の音（承認・順位・制覇）だけは上限でも通す`, () => {
    const { ctx, b } = rig();
    ctx.currentTime = 1;
    const many = ['open', 'close', 'page', 'tab', 'cash', 'deny', 'confirm', 'build', 'done', 'error', 'bell', 'boot', 'dock', 'built', 'press', 'release', 'toggle', 'zoom'] as const;
    const ok = many.filter((k) => b.play(k));
    expect(ok.length).toBe(MAX_VOICES);
    expect(b.active()).toBe(MAX_VOICES);
    expect(b.play('lamp')).toBe(false);
    expect(b.play('clunk')).toBe(true);
    expect(b.play('rankup')).toBe(true);
    // 鳴り終われば、また鳴らせる
    ctx.currentTime = 9;
    expect(b.active()).toBe(0);
    expect(b.play('lamp')).toBe(true);
  });

  it('金貨は、続けて鳴ると音階を上がる（空くと下から）。段を渡せば、その高さ', () => {
    const { ctx, e, b } = rig();
    const notes: number[] = [];
    const tone = e.tone.bind(e);
    e.tone = (o: ToneOpt) => {
      if (o.wave === 'p25' && o.m != null) notes.push(o.m);
      return tone(o);
    };
    for (let i = 0; i < 6; i++) {
      ctx.currentTime = 1 + i * 0.1;
      b.play('coin');
    }
    expect(notes).toEqual([...notes].sort((a, c) => a - c));
    expect(new Set(notes).size).toBe(6);
    ctx.currentTime = 5;
    b.play('coin');
    expect(notes[6]).toBe(notes[0]);
    ctx.currentTime = 6;
    b.play('coin', { step: 5 });
    expect(notes[7]).toBe(notes[5]);
  });

  it('レバー・ランプ・つまみは、段が上がるほど高い。音程のずらし（pitch）は半音で効く', () => {
    const { ctx, e, b } = rig();
    const seen: ToneOpt[] = [];
    const tone = e.tone.bind(e);
    e.tone = (o: ToneOpt) => (seen.push({ ...o }), tone(o));
    const top = (name: 'lever' | 'lamp' | 'slide', step: number) => {
      seen.length = 0;
      ctx.currentTime += 1;
      b.play(name, { step });
      return Math.max(...seen.filter((o) => o.m != null).map((o) => o.m!));
    };
    for (const name of ['lever', 'lamp', 'slide'] as const) expect(top(name, 4), name).toBeGreaterThan(top(name, 1));
    seen.length = 0;
    ctx.currentTime += 1;
    b.play('confirm', { pitch: 2 });
    expect(seen.filter((o) => o.m != null).every((o) => o.det === 200)).toBe(true);
    // 音程の無い音（クリックの胴）はずらさない
    expect(seen.filter((o) => o.m == null).every((o) => !o.det)).toBe(true);
  });

  it('SE の音程は、いま鳴っている曲の和音から選ぶ', () => {
    const { ctx, e, m, b } = rig();
    m.start('map', 0);
    const pcs = (t: number) => {
      ctx.currentTime = t;
      const seen: number[] = [];
      const tone = e.tone.bind(e);
      e.tone = (o: ToneOpt) => (o.m != null && seen.push(((o.m % 12) + 12) % 12), tone(o));
      b.play('stamp');
      e.tone = tone;
      return [...new Set(seen)].sort((a, c) => a - c);
    };
    const bar = (60 / 116) * 4;
    // 1 小節め：F（ファ・ラ・ド）／ 2 小節め：G（ソ・シ・レ）
    expect(pcs(0.1)).toEqual([0, 5, 9]);
    expect(pcs(bar + 0.1)).toEqual([2, 7, 11]);
  });

  it('今の 24 種は、どれも新しい音へ付け替わる（表は docs/ISLAND_UIX_SOUND.md）', () => {
    expect(LEGACY_SFX.length).toBe(24);
    for (const k of LEGACY_SFX) expect(isSfxName(legacyToUx(k).name), k).toBe(true);
    // 意味で分ける所
    expect(legacyToUx('error').name).toBe('deny');
    expect(legacyToUx('error', 1, 0.6).name).toBe('error');
    expect(legacyToUx('place').name).toBe('build');
    expect(legacyToUx('place', 1.2, 0.8).name).toBe('clunk');
    expect(legacyToUx('place', 0.8, 0.9 + 3 * 0.04)).toEqual({ name: 'lamp', opts: { step: 3 } });
    expect(legacyToUx('levelup').name).toBe('stamp');
    expect(legacyToUx('sale').name).toBe('sale');
    expect(legacyToUx('dig', 1.36, 1 - 2 * 0.13).opts?.step).toBe(2);
  });
});

// ---------------------------------------------------------------- 曲

describe('段 UIX1s：曲（場面・層・構成）', () => {
  it('旋律は、どの曲のどの小節も 16 分音符 16 個ぶん', () => {
    for (const k of SONG_NAMES) {
      expect(SONG_LEAD_TEXT[k].length, k).toBe(SONGS[k].bars);
      SONG_LEAD_TEXT[k].forEach((s, b) => expect(lineLen(s), `${k} ${b + 1} 小節め`).toBe(16));
    }
  });

  it('場面の曲がそろっている：地図・月次報告・制覇・セクタ選択・発掘・経営会議・タイトル', () => {
    expect(SONG_NAMES).toEqual(['map', 'report', 'fanfare', 'sector', 'dig', 'board', 'title']);
    expect(SONGS.fanfare.once).toBe(true);
    // 地図だけは層を固定しない（勢いで 1〜5 層）
    for (const k of SONG_NAMES) expect(!!SONGS[k].layers, k).toBe(k !== 'map');
  });

  it('地図の曲は 64 小節でひと回り。1 巡め（16 小節）は見本のまま、2 巡めからに変化を足してある', () => {
    const s = SONGS.map;
    expect(MAP_FORM.length).toBe(8);
    expect(s.bars).toBe(64);
    // 1 巡め：変化なし（終わりの連打だけ）
    for (let b = 0; b < 16; b++) expect(s.mods[b] ?? {}, `${b}`).toEqual(b % 8 === 7 ? { fill: true } : {});
    // 2 巡めの A：旋律は三角波の長い音・太鼓は軽く
    expect(s.mods[16]).toMatchObject({ leadWave: 'tri', drums: 'light' });
    expect(s.leadEv[16].length).toBeLessThan(s.leadEv[0].length);
    // 3 巡め：つなぎ（A とは違う和音から）
    expect(s.chords[32]).not.toBe(s.chords[0]);
    // 4 巡めの A：分散和音がはじめの 4 小節は休む
    expect(s.mods[48]?.rest).toEqual(['arp']);
    expect(s.mods[52]?.rest).toBeUndefined();
    // B は毎回同じ旋律（戻ってくる所）
    for (const at of [8, 24, 40, 56]) expect(s.leadEv[at]).toEqual(s.leadEv[8]);
  });

  it('層は小節の頭で増える。場面は小節の頭で替わる', () => {
    const ctx = new FakeCtx();
    const e = new Engine(asCtx(ctx));
    const m = new Music(e);
    m.offline = true;
    const bars: { t: number; name: string; n: number }[] = [];
    m.onBar = (t, name, _bar, layers) => bars.push({ t, name, n: layers.length });
    m.setLevel(2);
    m.start('map', 0);
    const bar = (60 / 116) * 4;
    m.pump(bar * 1.5);
    m.setLevel(5);
    ctx.currentTime = bar * 1.5;
    const at = m.cue('report');
    expect(at).toBeCloseTo(bar * 2, 6);
    m.pump(bar * 3.5);
    expect(bars.map((x) => x.name)).toEqual(['map', 'map', 'report', 'report']);
    expect(bars[2].t).toBeCloseTo(bar * 2, 6);
    expect(bars.map((x) => x.n)).toEqual([2, 2, 4, 4]);
    ctx.currentTime = bar * 3.5;
    m.cue('map');
    m.pump(bar * 4.5);
    expect(bars[4]).toMatchObject({ name: 'map', n: 5 });
    expect(m.layers()).toEqual([...LAYERS]);
    // 同じ曲をもう一度頼んでも、頭から鳴らし直さない
    m.cue('map');
    m.pump(bar * 5.5);
    expect(m.n).toBeGreaterThan(16);
  });

  it(`${AHEAD_S} 秒先まで予約する。画面の処理が止まって過ぎてしまった音は、まとめて鳴らさずに捨てて、拍の位置を保つ`, () => {
    const ctx = new FakeCtx();
    const e = new Engine(asCtx(ctx));
    const m = new Music(e);
    const times: number[] = [];
    const tone = e.tone.bind(e);
    e.tone = (o: ToneOpt) => (times.push(o.t ?? -1), tone(o));
    m.setLevel(5);
    m.start('map', 0);
    m.stop();
    // start は時計（30ms ごと）を回すので、止めてから手で進める
    m.offline = true;
    m.start('map', 0);
    m.offline = false;
    expect(Math.max(...times)).toBeLessThan(AHEAD_S);
    expect(Math.max(...times)).toBeGreaterThan(AHEAD_S - 0.14);
    // 1.2 秒止まった
    times.length = 0;
    ctx.currentTime = 1.2;
    m.pump();
    expect(m.late).toBeGreaterThan(0);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(1.2 - LATE_S);
    // 拍の位置は保つ：鳴らした音は、どれも 16 分音符の格子の上
    const step = 60 / 116 / 4;
    for (const t of times) expect(Math.abs(t / step - Math.round(t / step))).toBeLessThan(1e-6);
    // 時計の間隔が開いたので、その 2.5 倍先（上限 2 秒）まで予約してある
    expect(aheadFor(1.2)).toBe(AHEAD_MAX_S);
    expect(aheadFor(0.03)).toBe(AHEAD_S);
    expect(aheadFor(0.4)).toBeCloseTo(1.0, 6);
    expect(m.n).toBe(Math.ceil((1.2 + AHEAD_MAX_S) / step));
  });

  it('制覇：次の小節の頭で祝いの曲（4 小節）に入り、終わったら元の場面の曲へ戻る', () => {
    const f = fakeEnv({ cls: true });
    const u = new UxSound(f.env);
    let scene: UxScene = 'map';
    u.init({ scene: () => scene });
    f.fire('pointerup', { target: null });
    const m = u.music!;
    m.offline = true;
    const ctx = f.ctxs[0];
    const bar = (60 / 116) * 4;
    ctx.currentTime = 1.0 + bar * 0.5;
    m.pump(ctx.currentTime + AHEAD_S);
    expect(u.sfx('conquest')).toBe(true);
    expect(m.pending).toBe('fanfare');
    // 祝いの曲のあいだは、場面の見直しが割り込まない
    scene = 'sector';
    u.tick();
    expect(m.pending).toBe('fanfare');
    m.pump(1.0 + bar * 1.2);
    expect(m.name).toBe('fanfare');
    u.tick();
    expect(m.name).toBe('fanfare');
    m.pump(1.0 + bar * 5.2);
    expect(m.name).toBe('sector');
  });

  it('場面の見直し：本体の場面が替わったら、その曲を次の小節に予約する。新しい画面は uxScene で指定できる', () => {
    const f = fakeEnv({ cls: true });
    const u = new UxSound(f.env);
    let scene: UxScene = 'map';
    u.init({ scene: () => scene });
    f.fire('pointerup', { target: null });
    const m = u.music!;
    expect(m.name).toBe('map');
    scene = 'report';
    u.tick();
    expect(m.pending).toBe('report');
    scene = 'map';
    u.tick();
    expect(m.pending).toBeNull();
    const off = u.hold('dig');
    expect(m.pending).toBe('dig');
    off();
    expect(m.pending).toBeNull();
  });
});

// ---------------------------------------------------------------- 層の決め方

describe('段 UIX1s：地図の曲の層の決め方（会社の勢い）', () => {
  it('旋律と低音が土台（2 層）。当てはまる数だけ重なる：売上の伸び・順位が上半分・1 位', () => {
    // 開業前・まだ売れていない
    expect(mapLevel(mo({ rank: null, salesPrev: null, salesNow: 0 }))).toBe(BASE_LEVEL);
    expect(BASE_LEVEL).toBe(2);
    // 1 か月め：1 つでも売れたら「伸びている」→ 分散和音
    expect(mapLevel(mo({ rank: null, salesPrev: null, salesNow: 50 }))).toBe(3);
    // 6 社の 3 位＝上半分 → 太鼓
    expect(mapLevel(mo({ rank: 3, salesNow: 400, salesPrev: 1000, day: 10 }))).toBe(4);
    expect(mapLevel(mo({ rank: 4, salesNow: 400, salesPrev: 1000, day: 10 }))).toBe(3);
    // 1 位 → 和音の厚み
    expect(mapLevel(mo({ rank: 1, salesNow: 400, salesPrev: 1000, day: 10 }))).toBe(5);
    // 1 位でも、売上が落ちていれば 1 層へる
    expect(mapLevel(mo({ rank: 1, salesNow: 100, salesPrev: 1000, day: 10 }))).toBe(4);
    // 5 社なら 3 位までが上半分
    expect(mapLevel(mo({ rank: 3, companies: 5, salesNow: 0, salesPrev: 1000, day: 10 }))).toBe(3);
    for (let r = 1; r <= 6; r++)
      for (const sales of [0, 500, 5000]) {
        const lv = mapLevel(mo({ rank: r, salesNow: sales }));
        expect(lv).toBeGreaterThanOrEqual(2);
        expect(lv).toBeLessThanOrEqual(5);
      }
    expect(momentumParts(mo({ rank: 1, salesNow: 400 }))).toEqual({ growth: true, upper: true, top: true });
  });

  it('売上の伸び：月のはじめは先月と先々月で見る。そのあとは今月のペース。境目で行き来しない', () => {
    // 月のはじめ（ペースが読めない）
    expect(growing(mo({ day: PACE_FROM_DAY - 1, salesNow: 0, salesPrev: 1000, salesPrev2: 800 }))).toBe(true);
    expect(growing(mo({ day: PACE_FROM_DAY - 1, salesNow: 0, salesPrev: 700, salesPrev2: 800 }))).toBe(false);
    // 10 日めで 333 → ひと月 1000 のペース
    expect(growing(mo({ day: 10, salesNow: 334, salesPrev: 1000 }))).toBe(true);
    expect(growing(mo({ day: 10, salesNow: 320, salesPrev: 1000 }))).toBe(false);
    // いちど伸びていたら、9 割を切るまでは保つ
    expect(growing(mo({ day: 10, salesNow: 320, salesPrev: 1000 }), true)).toBe(true);
    expect(growing(mo({ day: 10, salesNow: 290, salesPrev: 1000 }), true)).toBe(false);
  });

  it('本体の数字（勢い）を読んで、地図の曲の層へ渡す', () => {
    const f = fakeEnv({ cls: true });
    const u = new UxSound(f.env);
    let m: Momentum = mo({ rank: null, salesPrev: null });
    u.init({ momentum: () => m });
    f.fire('pointerup', { target: null });
    expect(u.music!.level).toBe(2);
    m = mo({ rank: 1, salesNow: 900, salesPrev: 1000, day: 20 });
    u.tick();
    expect(u.music!.level).toBe(5);
  });
});

// ---------------------------------------------------------------- 隠れたら止まる・設定

describe('段 UIX1s：隠れたら止まる・設定の保存', () => {
  it('画面が隠れたら AudioContext を止め、戻ったら動かす（切のときは触らない）', () => {
    const f = fakeEnv({ cls: true });
    const u = new UxSound(f.env);
    u.init({});
    f.fire('pointerup', { target: null });
    const ctx = f.ctxs[0];
    expect(ctx.state).toBe('running');
    f.st.hidden = true;
    f.fireDoc('visibilitychange');
    expect(ctx.state).toBe('suspended');
    expect(ctx.suspends).toBe(1);
    // 隠れているあいだは、SE も鳴らさない・操作でも動かさない
    expect(u.sfx('press')).toBe(false);
    f.fire('keydown', {});
    expect(ctx.state).toBe('suspended');
    f.st.hidden = false;
    f.fireDoc('visibilitychange');
    expect(ctx.state).toBe('running');
    // 切のとき
    const g = fakeEnv();
    const v = new UxSound(g.env);
    v.init({});
    g.st.hidden = true;
    g.fireDoc('visibilitychange');
    expect(g.ctxs.length).toBe(0);
  });

  it('古い設定（項目が無い）では、今の入り切りを引き継ぐ：入なら見本のはじめの値、切なら 0', () => {
    expect(volFrom({})).toEqual({ bgm: DEF_BGM, se: DEF_SE, mute: false });
    expect(volFrom({ bgm: 1, se: 1 })).toEqual({ bgm: 7, se: 8, mute: false });
    expect(volFrom({ bgm: 0, se: 1 })).toEqual({ bgm: 0, se: 8, mute: false });
    expect(volFrom({ bgm: 1, se: 0 })).toEqual({ bgm: 7, se: 0, mute: false });
    expect(volFrom({ bgm: 0, se: 1, uxBgm: 4, uxMute: true })).toEqual({ bgm: 4, se: 8, mute: true });
    expect(volFrom({ uxBgm: 99, uxSe: -3 })).toEqual({ bgm: 10, se: 0, mute: false });
  });

  it('保存は省略できる項目を足すだけ：今の設定（bgm・se）は書き換えない。壊れた保存でも動く', () => {
    const f = fakeEnv({ store: { [SOUND_KEY]: '{"bgm":0,"se":1}' } });
    const u = new UxSound(f.env);
    expect(u.vol).toEqual({ bgm: 0, se: 8, mute: false });
    u.setVol({ bgm: 6 });
    u.setVol({ mute: true });
    expect(JSON.parse(f.data[SOUND_KEY])).toEqual({ bgm: 0, se: 1, uxBgm: 6, uxSe: 8, uxMute: true });
    expect(loadVol(f.env.store)).toEqual({ bgm: 6, se: 8, mute: true });
    const bad = fakeEnv({ store: { [SOUND_KEY]: '{oops' } });
    expect(loadVol(bad.env.store)).toEqual({ bgm: DEF_BGM, se: DEF_SE, mute: false });
    expect(() => saveVol(null, { bgm: 1, se: 1, mute: false })).not.toThrow();
  });

  it('音量は 2 乗で効く。消音は BGM・SE の両方を 0 に。段は 0 → 2 → … → 10 → 0', () => {
    const f = fakeEnv({ cls: true });
    const u = new UxSound(f.env);
    u.init({});
    f.fire('pointerup', { target: null });
    const e = u.eng!;
    expect(e.bgm.gain.value).toBeCloseTo(0.7 * 0.7 * 0.9, 6);
    expect(e.se.gain.value).toBeCloseTo(0.8 * 0.8, 6);
    u.setVol({ bgm: 10, se: 5 });
    expect(e.bgm.gain.value).toBeCloseTo(0.9, 6);
    expect(e.se.gain.value).toBeCloseTo(0.25, 6);
    u.setVol({ mute: true });
    expect(e.bgm.gain.value).toBe(0);
    expect(e.se.gain.value).toBe(0);
    expect([0, 2, 4, 6, 7, 8, 10].map(nextStep)).toEqual([2, 4, 6, 8, 8, 10, 0]);
  });
});

// ---------------------------------------------------------------- 見本からの移し間違いが無いこと

describe('段 UIX1s：見本（public/uixlab/c/js）と同じ音を出す', () => {
  type Call = Record<string, unknown>;
  /** tone・noise の呼び出しを記録する（つなぎ先は、SE のバスかどうかだけを見る） */
  const record = (e: { tone: (o: ToneOpt) => number; noise: (o: NoiseOpt) => void; se: unknown; bgm: unknown }) => {
    const calls: Call[] = [];
    const strip = (kind: string, o: ToneOpt | NoiseOpt) => {
      const { bus, ...rest } = o;
      const c: Call = { kind, toSe: bus === undefined || bus === e.se };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined && v !== null) c[k] = typeof v === 'number' ? Math.round(v * 1e9) / 1e9 : v;
      calls.push(c);
    };
    e.tone = (o) => (strip('tone', o), 0);
    e.noise = (o) => strip('noise', o);
    return calls;
  };
  const lcg = () => {
    let seed = 7;
    return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  };
  const lab = async () => {
    const at = (f: string) => pathToFileURL(resolve(__dirname, '../public/uixlab/c/js', f)).href;
    const [a, m, s] = await Promise.all([import(/* @vite-ignore */ at('audio.js')), import(/* @vite-ignore */ at('music.js')), import(/* @vite-ignore */ at('sfx.js'))]);
    return { Engine: a.Engine, Music: m.Music, Sfx: s.Sfx };
  };

  it('曲：地図（1 巡め 16 小節・2 層と 5 層）・月次報告・制覇 → 地図 の音の並びが、見本と同じ', async () => {
    const L = await lab();
    const bar = (60 / 116) * 4;
    const cases: [string, (m: { setLevel(n: number): void; on: Set<string>; start(n: string, at: number): void; pump(u: number): void; offline: boolean }) => void][] = [
      ['map 5', (m) => (m.setLevel(5), (m.on = new Set()), m.start('map', 0.05), m.pump(0.05 + bar * 16 - 0.001))],
      ['map 2', (m) => (m.setLevel(2), (m.on = new Set()), m.start('map', 0.05), m.pump(0.05 + bar * 16 - 0.001))],
      ['report', (m) => (m.start('report', 0.05), m.pump(0.05 + bar * 16 - 0.001))],
      ['fanfare → map', (m) => (m.setLevel(5), m.start('fanfare', 0.05), m.pump(0.05 + bar * 10 - 0.001))],
    ];
    for (const [name, run] of cases) {
      const c1 = new FakeCtx();
      const e1 = new L.Engine(c1);
      const want = record(e1);
      const m1 = new L.Music(e1);
      m1.offline = true;
      run(m1);
      const c2 = new FakeCtx();
      const e2 = new Engine(asCtx(c2));
      const got = record(e2);
      const m2 = new Music(e2);
      m2.offline = true;
      run(m2 as never);
      expect(got.length, name).toBe(want.length);
      expect(got.length, name).toBeGreaterThan(100);
      expect(got, name).toEqual(want);
    }
  });

  it('SE：見本の 30 種の鳴らし方が、同じ乱数で同じ音の並びになる', async () => {
    const L = await lab();
    const V = { wave: 'p25', deg: 3, oct: 4, vol: 0.08 };
    const runs: [string, (s: never) => void][] = [
      ...(['press', 'release', 'open', 'close', 'zoom', 'page', 'print', 'tab', 'leverBack', 'approve', 'stamp', 'tick', 'deposit', 'buy', 'deny', 'decide', 'complete', 'sale', 'rankup', 'conquest', 'firework', 'flap', 'bell', 'boot', 'dock'] as const).map((k): [string, (s: never) => void] => [k, (s) => (s as Record<string, () => void>)[k]()]),
      ['detent', (s) => (s as { detent(p: number): void }).detent(0.6)],
      ['lamp', (s) => (s as { lamp(i: number, t: number): void }).lamp(3, 1.4)],
      ['coin', (s) => (s as { coin(p: number): void }).coin(0.5)],
      ['roll', (s) => (s as { roll(a: number, b: number): void }).roll(0.1, 1.5)],
      ['speak', (s) => (s as { speak(v: unknown, c: string): void }).speak(V, 'A')],
      ['slider', (s) => (s as { slider(p: number): void }).slider(0.3)],
      ['toggle', (s) => (s as { toggle(on: boolean): void }).toggle(false)],
      ['streak', (s) => (s as { streak(i: number, n: number): void }).streak(2, 5)],
    ];
    expect(runs.length).toBeGreaterThanOrEqual(30);
    for (const [name, run] of runs) {
      const c1 = new FakeCtx();
      const e1 = new L.Engine(c1);
      const want = record(e1);
      const m1 = new L.Music(e1);
      m1.offline = true;
      m1.start('map', 0);
      want.length = 0;
      c1.currentTime = 3.3;
      const s1 = new L.Sfx(e1, m1);
      s1.rnd = lcg();
      run(s1 as never);

      const c2 = new FakeCtx();
      const e2 = new Engine(asCtx(c2));
      const got = record(e2);
      const m2 = new Music(e2);
      m2.offline = true;
      m2.start('map', 0);
      got.length = 0;
      c2.currentTime = 3.3;
      const s2 = new Sfx(e2, m2);
      s2.rnd = lcg();
      run(s2 as never);
      expect(want.length, name).toBeGreaterThan(0);
      expect(got, name).toEqual(want);
    }
  });

  it('まとめの経路の値（コンプレッサー・天井・音量の効き方）が、見本と同じ', async () => {
    const L = await lab();
    const e1 = new L.Engine(new FakeCtx());
    const e2 = new Engine(asCtx(new FakeCtx()));
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release'] as const) expect(e2.comp[k].value, k).toBe(e1.comp[k].value);
    expect(e2.out.gain.value).toBe(e1.out.gain.value);
    expect(e2.bgmTone.frequency.value).toBe(e1.bgmTone.frequency.value);
    expect(e2.bgm.gain.value).toBe(e1.bgm.gain.value);
    expect(e2.se.gain.value).toBe(e1.se.gain.value);
    expect(e2.echoB.delay.delayTime.value).toBe(e1.echoB.delay.delayTime.value);
    expect(e2.echoS.delay.delayTime.value).toBe(e1.echoS.delay.delayTime.value);
    // 立ち上がりの「プチ」を消す切り替えは、既定では切（見本のまま）
    expect(e2.clean).toBe(false);
  });
});
