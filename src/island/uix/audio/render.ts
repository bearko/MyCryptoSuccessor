/**
 * 段 UIX1s：書き出し（確かめ用）。OfflineAudioContext の上に本番と同じ作り（Engine・Music・SfxBank）を組んで、音を数字で確かめる。
 * 見本帳（?uix=sound）が window.__uxs に出す。撮影の道具（Playwright）が呼んで WAV にする。
 * ・ふつうの組：音の口の名前ごとの SE・地図の曲の層 1〜5・ほかの場面の曲・いちばん重なる場合。
 * ・見本と同じ組（lab）：見本 C の書き出しと同じ名前・同じ条件。標本ごとに比べて、移し間違いが無いことを確かめる。
 */
import { ALL_SFX, SfxBank, type SfxName, type SfxOpts } from './bank';
import { Engine } from './engine';
import { Music } from './music';
import type { Sfx } from './sfx';
import { SONGS, type SongName } from './songs';

export interface Rig {
  e: Engine;
  m: Music;
  b: SfxBank;
  s: Sfx;
  /** 「いま」を t にして鳴らす（間引きの覚えは消す） */
  at: (t: number, fn: () => void) => void;
  /** 名前で鳴らす（間引き・上限つき） */
  play: (t: number, name: SfxName, o?: SfxOpts) => boolean;
  /** 曲を、書き出す長さのぶんだけ予約する */
  fill: () => void;
}

export function makeRig(ctx: BaseAudioContext, sec = 16): Rig {
  const e = new Engine(ctx);
  const m = new Music(e);
  m.offline = true;
  const b = new SfxBank(e, m);
  const s = b.sfx;
  // 決まった乱数（書き出しのたびに同じ音になる。見本の書き出しと同じ種）
  let seed = 7;
  s.rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const at = (t: number, fn: () => void) => {
    const keep = e.fakeNow;
    e.fakeNow = t;
    s.last = {};
    fn();
    e.fakeNow = keep;
  };
  const play = (t: number, name: SfxName, o?: SfxOpts) => {
    let ok = false;
    at(t, () => (ok = b.play(name, o)));
    return ok;
  };
  return { e, m, b, s, at, play, fill: () => m.pump(sec + 0.5) };
}

export interface RenderJob {
  name: string;
  /** 'main'：ふつうの組・'lab'：見本と同じ名前・同じ条件の組 */
  set: 'main' | 'lab';
  sec: number;
  run: (r: Rig) => void;
}

const song = (r: Rig, name: SongName, level: number) => {
  r.m.setLevel(level);
  r.m.on = new Set();
  r.m.start(name, 0.05);
  r.fill();
};
const barSec = (name: SongName) => (60 / SONGS[name].bpm) * 4;

/** 名前ごとの SE の書き出し方（長さ・段を変えて何回か鳴らすもの） */
const SE_SHOW: Partial<Record<SfxName, { sec?: number; run?: (r: Rig) => void }>> = {
  lever: { run: (r) => [0, 1, 2, 3, 4, 5, 6, 7].forEach((k) => r.play(0.05 + k * 0.09, 'lever', { step: k })) },
  lamp: { run: (r) => [0, 1, 2, 3, 4].forEach((k) => r.play(0.05 + k * 0.129, 'lamp', { step: k })) },
  coin: { sec: 3, run: (r) => { for (let k = 0; k < 14; k++) r.play(0.05 + k * 0.09, 'coin'); } },
  tick: { run: (r) => { for (let k = 0; k < 12; k++) r.play(0.05 + k * 0.05, 'tick'); } },
  blip: { sec: 3, run: (r) => [0, 3, 6].forEach((v, n) => { for (let k = 0; k < 14; k++) r.play(0.05 + n * 0.9 + k * 0.05, 'blip', { voice: v, step: 'あいうえおかきくけこさしすせ'.codePointAt(k) }); }) }, // i18n-ja
  slide: { run: (r) => { for (let k = 0; k <= 10; k++) r.play(0.05 + k * 0.07, 'slide', { step: k }); } },
  toggle: { run: (r) => { r.play(0.05, 'toggle', { step: 1 }); r.play(0.6, 'toggle', { step: 0 }); } },
  conquest: { sec: 4 },
  rankup: { sec: 2.5 },
  roll: { sec: 2.5 },
  boot: { sec: 2.5 },
  streak: { run: (r) => [0, 1, 2, 3, 4].forEach((k) => r.play(0.05 + k * 0.2, 'streak', { step: k })) },
  print: { run: (r) => [0, 0.18, 0.36].forEach((dt, k) => r.play(0.05 + dt, 'print', { step: 6 - (k === 2 ? 1 : 0) })) },
  dig: { run: (r) => [0, 2, 4].forEach((d, k) => r.play(0.05 + k * 0.5, 'dig', { step: d })) },
  zoom: { run: (r) => { r.play(0.05, 'zoom', { step: 1 }); r.play(0.6, 'zoom', { step: 0 }); } },
};

function mainJobs(): RenderJob[] {
  const jobs: RenderJob[] = [];
  for (const name of ALL_SFX) {
    const show = SE_SHOW[name];
    jobs.push({ name: `se_${name}`, set: 'main', sec: show?.sec ?? 2, run: show?.run ?? ((r) => void r.play(0.05, name)) });
  }
  // 地図の曲：層 1〜5 を各 16 秒（1 巡めのはじめ＝見本と同じ所）
  for (let lv = 1; lv <= 5; lv++) jobs.push({ name: `bgm_map_layer${lv}`, set: 'main', sec: 16, run: (r) => song(r, 'map', lv) });
  // 地図の曲：足した変化の所（2 巡めの A の休み・3 巡めの C・4 巡めの A）を、5 層で各 16 秒
  const part = (name: string, bar0: number) =>
    jobs.push({
      name,
      set: 'main',
      sec: 16,
      run: (r) => {
        r.m.setLevel(5);
        r.m.on = new Set(['lead', 'bass', 'arp', 'drums', 'pad']);
        r.m.start('map', 0.05, bar0);
        r.fill();
      },
    });
  part('bgm_map_pass2_rest', 16);
  part('bgm_map_pass3_bridge', 32);
  part('bgm_map_pass4_arp_in', 48);
  // 地図の曲：ひと回り（64 小節）を 5 層で（音割れ・無音が無いこと）
  jobs.push({ name: 'bgm_map_whole_form', set: 'main', sec: Math.ceil(64 * barSec('map')) + 2, run: (r) => song(r, 'map', 5) });
  // ほかの場面の曲：各 16 秒
  for (const k of ['report', 'sector', 'dig', 'board', 'title'] as const) jobs.push({ name: `bgm_${k}`, set: 'main', sec: 16, run: (r) => song(r, k, 5) });
  // 制覇：地図（5 層）→ 連打 → 一撃と祝いの曲 → 地図へ戻る
  jobs.push({
    name: 'bgm_conquest_from_map',
    set: 'main',
    sec: 16,
    run: (r) => {
      r.m.setLevel(5);
      r.m.on = new Set(['lead', 'bass', 'arp', 'drums', 'pad']);
      r.m.start('map', 0.05);
      // 2 小節めの途中で制覇（その小節までを予約してから）
      r.m.pump(0.05 + barSec('map') * 1.5);
      r.play(0.05 + barSec('map') * 1.5, 'conquest');
      r.fill();
    },
  });
  // 場面の切り替え：地図（5 層）→ 月次報告 → 地図
  jobs.push({
    name: 'bgm_switch_map_report_map',
    set: 'main',
    sec: 16,
    run: (r) => {
      const bar = barSec('map');
      r.m.setLevel(5);
      r.m.on = new Set(['lead', 'bass', 'arp', 'drums', 'pad']);
      r.m.start('map', 0.05);
      r.m.pump(0.05 + bar * 1.5);
      r.at(0.05 + bar * 1.5, () => r.m.cue('report'));
      r.play(0.05 + bar * 1.5, 'bell');
      r.m.pump(0.05 + bar * 4.5);
      r.at(0.05 + bar * 4.5, () => r.m.cue('map'));
      r.play(0.05 + bar * 4.5, 'close');
      r.fill();
    },
  });
  // いちばん重なる場合：地図の 5 層の上に、大きい音から順に上限（12 本）まで同時に
  jobs.push({
    name: 'mix_worst',
    set: 'main',
    sec: 8,
    run: (r) => {
      song(r, 'map', 5);
      const loud: SfxName[] = ['clunk', 'rankup', 'stamp', 'built', 'cash', 'bell', 'open', 'page', 'build', 'done', 'deny', 'error', 'confirm', 'tab', 'close', 'boot'];
      // 2 秒めに、同じ瞬間に 16 種を頼む（上限で 12 本に間引かれる）
      r.at(2.0, () => loud.forEach((k) => r.b.play(k)));
      // 4 秒めに、制覇（連打 → 一撃 → 祝いの曲）の上へ、承認・順位・金貨の連打
      r.play(4.0, 'conquest');
      r.play(5.0, 'clunk');
      r.play(5.05, 'rankup');
      for (let k = 0; k < 14; k++) r.play(5.2 + k * 0.06, 'coin');
      r.fill();
    },
  });
  return jobs;
}

/** 見本 C の書き出し（uixlab_c/）と同じ名前・同じ条件 */
function labJobs(): RenderJob[] {
  const j = (name: string, sec: number, run: (r: Rig) => void): RenderJob => ({ name, set: 'lab', sec, run: (r) => r.at(0.05, () => run(r)) });
  const one = (k: 'press' | 'release' | 'open' | 'close' | 'page' | 'tab' | 'approve' | 'deposit' | 'buy' | 'deny' | 'decide' | 'complete' | 'rankup' | 'conquest' | 'bell' | 'boot' | 'dock' | 'sale' | 'flap') => j(`se_${k}`, 2, (r) => r.s[k]());
  return [
    j('bgm_map_5layers', 16, (r) => song(r, 'map', 5)),
    j('bgm_map_2layers', 8, (r) => song(r, 'map', 2)),
    j('bgm_report', 9, (r) => {
      r.m.start('report', 0.05);
      r.fill();
    }),
    j('bgm_fanfare_to_map', 12, (r) => {
      r.m.setLevel(5);
      r.m.start('fanfare', 0.05);
      r.fill();
    }),
    ...(['press', 'release', 'open', 'close', 'page', 'tab', 'approve', 'deposit', 'buy', 'deny', 'decide', 'complete', 'rankup', 'conquest', 'bell', 'boot', 'dock', 'sale', 'flap'] as const).map(one),
    j('se_toggle', 2, (r) => r.s.toggle(true)),
    j('se_coin_run', 3, (r) => {
      for (let i = 0; i < 40; i++) r.at(0.05 + i * 0.05, () => r.s.coin(i / 40));
    }),
    j('se_speak_3voices', 3, (r) => {
      (
        [
          { wave: 'p50', deg: 0, oct: 4 },
          { wave: 'tri', deg: 2, oct: 5 },
          { wave: 'p25', deg: 4, oct: 5 },
        ] as const
      ).forEach((v, k) => {
        for (let i = 0; i < 14; i++) r.at(0.05 + k * 0.9 + i * 0.05, () => r.s.speak(v, 'あいうえおかきくけこさしすせ'[i])); // i18n-ja
      });
    }),
    j('se_lamps_stamp', 3, (r) => {
      r.s.approve();
      for (let i = 0; i < 5; i++) r.s.lamp(i, 0.13 + i * 0.129);
      r.s.stamp(0.13 + 5 * 0.129);
    }),
    j('mix_bgm_plus_se', 8, (r) => {
      song(r, 'map', 5);
      r.at(1.0, () => r.s.approve());
      for (let i = 0; i < 5; i++) r.s.lamp(i, 1.13 + i * 0.129);
      r.s.stamp(1.13 + 5 * 0.129);
      r.at(3, () => r.s.rankup());
      r.at(5, () => r.s.buy());
      r.at(6, () => r.s.complete());
    }),
  ];
}

export const renderJobs = (): RenderJob[] => [...mainJobs(), ...labJobs()];

export interface RenderOpt {
  /** 立ち上がりの「プチ」を消す作り（engine.ts の clean）で書き出す */
  clean?: boolean;
  /** 音量の設定（0〜10）。省くと見本のはじめの値（BGM 7・SE 8） */
  bgm?: number;
  se?: number;
}

/** 1 つ書き出す（44.1kHz・2ch）。返り値：左右の標本 */
export async function renderJob(job: RenderJob, opt: RenderOpt = {}, sr = 44100): Promise<{ sr: number; L: Float32Array; R: Float32Array }> {
  const ctx = new OfflineAudioContext(2, Math.round(sr * job.sec), sr);
  const rig = makeRig(ctx, job.sec);
  rig.e.clean = !!opt.clean;
  if (opt.bgm != null || opt.se != null) {
    // はじめから、その音量で（なめらかに変える時間を置かない）
    const b = (opt.bgm ?? 7) / 10;
    const s = (opt.se ?? 8) / 10;
    rig.e.vol = { bgm: b, se: s, mute: false };
    rig.e.bgm.gain.value = b * b * 0.9;
    rig.e.se.gain.value = s * s;
    rig.e.env.gain.value = s * s;
  }
  job.run(rig);
  const buf = await ctx.startRendering();
  return { sr, L: buf.getChannelData(0), R: buf.getChannelData(1) };
}
