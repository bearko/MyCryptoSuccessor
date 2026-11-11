/**
 * 段 UIX1s：新しい音の動かし方（切り替え・始め方・隠れたら止める・場面と層・全体のボタンの音）。
 * 新しい音は <html class="is-uxc">（または URL の uix=1）のときだけ。付いていないときは、ここは何も鳴らさず、今の音にも触らない。
 * 見た目の担当（UIX1a）のファイルは読まない：class と、window の uxc:change（detail.on）だけを見る。
 */
import { ALL_SFX, SfxBank, isSfxName, type SfxName, type SfxOpts } from './bank';
import { Engine } from './engine';
import { LEGACY_SFX, legacyToUx, type LegacySfx } from './legacy';
import { growing, mapLevel, type Momentum } from './level';
import { Music } from './music';
import { loadVol, saveVol, type StoreLike, type UxVol } from './prefs';
import type { Layer, SongName } from './songs';

/** 場面（BGM が替わる）。制覇は場面ではなく、uxSfx('conquest') で祝いの曲を 1 回はさむ */
export type UxScene = 'map' | 'report' | 'sector' | 'dig' | 'board' | 'title';
export const UX_SCENES: UxScene[] = ['map', 'report', 'sector', 'dig', 'board', 'title'];
const SCENE_SONG: Record<UxScene, SongName> = { map: 'map', report: 'report', sector: 'sector', dig: 'dig', board: 'board', title: 'title' };

/** 本体（p1/main.ts）が渡すもの。どれも読むだけ */
export interface UxSoundHost {
  /** 今の音（mp3 の BGM）を止める（true）・戻す（false）。入のあいだ二重に鳴らさないため */
  legacyBgm?: (paused: boolean) => void;
  /** いまの場面 */
  scene?: () => UxScene;
  /** 会社の勢い（地図の曲の層を決める数字） */
  momentum?: () => Momentum | null;
  /** 札・窓が出入りする親（#isl-ui）。出入りを見て、開く・閉じるの音を鳴らす */
  root?: Element | null;
  /** 吹き出し（hidden の切り替えで出入りする） */
  pop?: Element | null;
}

interface Listenable {
  addEventListener(type: string, fn: (e: never) => void, opts?: boolean | { capture?: boolean }): void;
}
interface DocLike extends Listenable {
  hidden?: boolean;
  documentElement?: { classList: { contains(c: string): boolean } };
}
/** まわりの世界（テストでは小さな偽物を渡す） */
export interface UxEnv {
  win: Listenable | null;
  doc: DocLike | null;
  store: StoreLike | null;
  /** URL の ?… の部分 */
  search: string;
  /** AudioContext を作る（作れなければ null） */
  makeContext: () => AudioContext | null;
  /** ms */
  now: () => number;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
  /** class の変化を見る（無ければ uxc:change だけに頼る） */
  observeClass?: (fn: () => void) => void;
  /** 子の出入りを見る（無ければ、開く・閉じるの音は付けない） */
  observeKids?: (el: Element, fn: (added: Element[], removed: Element[]) => void) => void;
  observeHidden?: (el: Element, fn: (hidden: boolean) => void) => void;
}

/**
 * 押した音を付ける相手（今の「ボタンを押したらクリック音」と同じ：使える button）。
 * 自分の音を持つ部品（レバー・音の見本帳の鍵など）は、data-ux-quiet を付けると、ここでは鳴らさない
 */
const pressTarget = (e: { target?: unknown }): boolean => {
  const t = e.target as { closest?: (s: string) => { disabled?: boolean } | null } | null;
  if (typeof t?.closest !== 'function') return false;
  const b = t.closest('button');
  return !!b && !b.disabled && !t.closest('[data-ux-quiet]');
};

/** 出入りした子が、札・窓か */
const boxKind = (el: Element): 'sheet' | 'modal' | null => {
  const c = el.classList;
  if (!c) return null;
  if (c.contains('isl-sheet') || c.contains('ux-sheet')) return 'sheet';
  if (c.contains('isl-modal') || c.contains('ux-modal')) return 'modal';
  return null;
};
/**
 * 札・窓の出入り → 鳴らす音。札から札へ替わったら tab、出ただけなら open、消えただけなら close。
 * 窓から窓へ（会話の次の枚など）は、押した音がもう鳴っているので鳴らさない
 */
export function boxSound(added: Element[], removed: Element[]): SfxName | null {
  const a = added.map(boxKind).filter((x) => x);
  const r = removed.map(boxKind).filter((x) => x);
  if (!a.length && !r.length) return null;
  if (a.length && r.length) return a.includes('sheet') && r.includes('sheet') ? 'tab' : null;
  return a.length ? 'open' : 'close';
}

export class UxSound {
  readonly env: UxEnv;
  host: UxSoundHost = {};
  on = false;
  ctx: AudioContext | null = null;
  eng: Engine | null = null;
  music: Music | null = null;
  bank: SfxBank | null = null;
  vol: UxVol;
  /** 場面の指定（uxScene で積む。上が優先）。空なら host.scene() */
  private holds: { scene: UxScene }[] = [];
  /** 見本帳：場面と層を手で決める */
  forceScene: UxScene | null = null;
  forceLevel: number | null = null;
  /** 立ち上がりの「プチ」を消すか（engine.ts の clean。既定は見本のまま。見本帳で聴き比べる） */
  clean = false;
  private timer: unknown = null;
  private wasGrowing = false;
  private inited = false;
  /** 指で押した音を鳴らしたか（そのあとの click で、今の「tap」を重ねないため） */
  private ptrPressed = false;
  private ptrUpAt = -1e9;
  /** 確かめ用 */
  stats = { legacy: 0, legacySkipped: 0, suspends: 0, resumes: 0 };

  constructor(env: UxEnv) {
    this.env = env;
    this.vol = loadVol(env.store);
  }

  /** class か URL から、入か切かを読む */
  private readOn(): boolean {
    if (this.env.doc?.documentElement?.classList.contains('is-uxc')) return true;
    try {
      return new URLSearchParams(this.env.search).get('uix') === '1';
    } catch {
      return false;
    }
  }

  /** 本体から 1 回だけ呼ぶ */
  init(host: UxSoundHost = {}): void {
    this.host = host;
    if (this.inited) return;
    this.inited = true;
    const { win, doc } = this.env;
    this.on = this.readOn();
    if (this.on) host.legacyBgm?.(true);
    win?.addEventListener('uxc:change', ((e: { detail?: { on?: boolean } }) => this.setOn(!!e.detail?.on)) as (e: never) => void);
    this.env.observeClass?.(() => this.setOn(!!this.env.doc?.documentElement?.classList.contains('is-uxc')));
    // ブラウザは最初の操作まで音を出せない。スマホは指を離したとき（pointerup・touchend・click）が操作として数えられるので、鳴るまで毎回試す
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) win?.addEventListener(ev, ((e: { type: string; target?: unknown }) => this.gesture(e)) as (e: never) => void, { capture: true });
    doc?.addEventListener('visibilitychange', (() => this.visibility()) as (e: never) => void);
    if (host.root)
      this.env.observeKids?.(host.root, (a, r) => {
        const s = boxSound(a, r);
        if (s) this.sfx(s);
      });
    if (host.pop) this.env.observeHidden?.(host.pop, (hidden) => this.sfx(hidden ? 'close' : 'open'));
  }

  /**
   * 入り切りを替える。鳴っている曲は止めて入れ替える。
   * start：入にしたその場で音を始める（設定の切り替えは、押した操作の中なので始められる）。false なら次の操作から
   */
  setOn(v: boolean, start = true): void {
    if (v === this.on) return;
    this.on = v;
    this.host.legacyBgm?.(v);
    if (v) {
      if (start) this.unlock();
      return;
    }
    this.music?.stop();
    if (this.timer != null) this.env.clearInterval(this.timer);
    this.timer = null;
    if (this.ctx && this.ctx.state === 'running') {
      this.stats.suspends++;
      void this.ctx.suspend().catch(() => undefined);
    }
  }

  /** 操作のたび（入のときだけ）：音を始める・止まっていれば動かす・ボタンなら押した音 */
  private gesture(e: { type: string; target?: unknown }): void {
    if (!this.on) return;
    this.unlock();
    if (e.type === 'pointerdown') {
      this.ptrPressed = pressTarget(e);
      if (this.ptrPressed) this.sfx('press');
    } else if (e.type === 'pointerup') {
      if (this.ptrPressed) {
        this.sfx('release');
        this.ptrUpAt = this.env.now();
      }
    }
  }

  /** 音を始める（最初の 1 回は、電源の入る音 → 曲）。止まっていれば動かす */
  unlock(): void {
    if (!this.on) return;
    if (!this.ctx) {
      const ctx = this.env.makeContext();
      if (!ctx) return;
      this.ctx = ctx;
      this.eng = new Engine(ctx);
      this.eng.clean = this.clean;
      this.music = new Music(this.eng);
      this.bank = new SfxBank(this.eng, this.music);
      this.bank.afterConquest = () => SCENE_SONG[this.sceneNow()];
      this.applyVol(0);
      this.bank.play('boot');
      this.startMusic(1.0);
    } else if (!this.music?.playing) this.startMusic(0.12);
    if (this.ctx.state !== 'running' && !this.env.doc?.hidden) {
      this.stats.resumes++;
      void this.ctx.resume().catch(() => undefined);
    }
    if (this.timer == null) this.timer = this.env.setInterval(() => this.tick(), 250);
  }

  private startMusic(delay: number): void {
    const m = this.music;
    const e = this.eng;
    if (!m || !e) return;
    this.applyLevel();
    // 層は、はじめの小節から決めた数で鳴らす（見本と同じく、旋律と低音は頭から）
    m.start(SCENE_SONG[this.sceneNow()], e.now + delay);
  }

  /** 隠れたら止め、戻ったら戻す */
  private visibility(): void {
    const ctx = this.ctx;
    if (!ctx || !this.on) return;
    if (this.env.doc?.hidden) {
      this.stats.suspends++;
      void ctx.suspend().catch(() => undefined);
    } else {
      this.stats.resumes++;
      void ctx.resume().catch(() => undefined);
    }
  }

  /** いまの場面 */
  sceneNow(): UxScene {
    return this.forceScene ?? this.holds[this.holds.length - 1]?.scene ?? this.host.scene?.() ?? 'map';
  }

  /** 場面を指定する（新しい画面が呼ぶ）。返り値を呼ぶと外れる */
  hold(scene: UxScene): () => void {
    const h = { scene };
    this.holds.push(h);
    this.tick();
    return () => {
      const k = this.holds.indexOf(h);
      if (k >= 0) this.holds.splice(k, 1);
      this.tick();
    };
  }

  private applyLevel(): void {
    const m = this.music;
    if (!m) return;
    if (this.forceLevel != null) {
      m.setLevel(this.forceLevel);
      return;
    }
    const mo = this.host.momentum?.();
    if (!mo) return;
    const lv = mapLevel(mo, this.wasGrowing);
    this.wasGrowing = growing(mo, this.wasGrowing);
    m.setLevel(lv);
  }

  /** 場面と層を見直す（1 秒に 4 回。替わるのは小節の頭） */
  tick(): void {
    const m = this.music;
    if (!this.on || !m || !m.playing) return;
    this.applyLevel();
    const song = SCENE_SONG[this.sceneNow()];
    // 祝いの曲のあいだは割り込まない（終わったら、その場面の曲へ）
    if (m.name === 'fanfare' || m.pending === 'fanfare') m.after = song;
    else if (m.name !== song || m.pending) m.cue(song);
  }

  // ---------------------------------------------------------------- 鳴らす

  /** SE を鳴らす。切のとき・まだ音を始めていないときは何もしない */
  sfx(name: SfxName, opts?: SfxOpts): boolean {
    if (!this.on || !this.bank || !this.ctx || this.ctx.state !== 'running') return false;
    return this.bank.play(name, opts);
  }

  /**
   * 今の効果音の呼び出しを、新しい音へ付け替える。返り値：こちらで引き受けた（今の音は鳴らさない）。
   * 切のときは false を返すだけで、何もしない
   */
  legacy(k: string, gain = 1, rate = 1): boolean {
    if (!this.on) return false;
    this.stats.legacy++;
    if (!(LEGACY_SFX as readonly string[]).includes(k)) return true;
    // 指で押した瞬間に press を鳴らしたあとの click の「tap」は重ねない
    if (k === 'tap' && this.ptrPressed && this.env.now() - this.ptrUpAt < 120) {
      this.stats.legacySkipped++;
      return true;
    }
    const c = legacyToUx(k as LegacySfx, gain, rate);
    this.sfx(c.name, c.opts);
    return true;
  }

  // ---------------------------------------------------------------- 設定

  private applyVol(ramp = 0.05): void {
    const e = this.eng;
    if (!e) return;
    e.vol = { bgm: this.vol.bgm / 10, se: this.vol.se / 10, mute: this.vol.mute };
    // setVol はなめらかに変える。はじめだけ、その場で
    if (ramp > 0) e.setVol({});
    else {
      const m = e.vol.mute ? 0 : 1;
      e.bgm.gain.value = e.vol.bgm * e.vol.bgm * 0.9 * m;
      e.se.gain.value = e.vol.se * e.vol.se * m;
      e.env.gain.value = e.vol.se * e.vol.se * m;
    }
  }
  setVol(part: Partial<UxVol>, save = true): void {
    this.vol = { ...this.vol, ...part };
    this.applyVol();
    if (save) saveVol(this.env.store, this.vol);
  }

  /** 立ち上がりの「プチ」を消す・見本のままに戻す（これから鳴らす音に効く） */
  setClean(v: boolean): void {
    this.clean = v;
    if (this.eng) this.eng.clean = v;
  }

  /** いまの曲の様子（層のランプ・拍の脈に使える） */
  musicInfo(): { song: SongName | ''; bar: number; beat: number; frac: number; layers: Layer[]; level: number } | null {
    const m = this.music;
    if (!m || !m.playing || !m.song) return null;
    const b = m.beat();
    return { song: m.name, bar: ((b.bar % m.song.bars) + m.song.bars) % m.song.bars, beat: b.beat, frac: b.frac, layers: m.layers(), level: m.level };
  }

  /** 確かめ用 */
  debug() {
    return {
      on: this.on,
      state: this.ctx?.state ?? 'none',
      scene: this.sceneNow(),
      music: this.musicInfo(),
      pending: this.music?.pending ?? null,
      vol: this.vol,
      clean: this.clean,
      active: this.bank?.active() ?? 0,
      played: { ...(this.bank?.played ?? {}) },
      dropped: { ...(this.bank?.dropped ?? {}) },
      made: this.eng?.made ?? 0,
      late: this.music?.late ?? 0,
      gap: this.music?.gap ?? 0,
      stats: { ...this.stats },
      names: ALL_SFX.length,
    };
  }
}

export { isSfxName };

/** ブラウザのまわりの世界 */
export function browserEnv(): UxEnv {
  const hasWin = typeof window !== 'undefined';
  const hasDoc = typeof document !== 'undefined';
  let store: StoreLike | null = null;
  try {
    store = hasWin ? window.localStorage : null;
  } catch {
    store = null;
  }
  return {
    win: hasWin ? (window as unknown as Listenable) : null,
    doc: hasDoc ? (document as unknown as DocLike) : null,
    store,
    search: hasWin ? window.location.search : '',
    makeContext: () => {
      if (!hasWin) return null;
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        return new Ctor({ latencyHint: 'interactive' });
      } catch {
        return null;
      }
    },
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
    observeClass:
      hasDoc && typeof MutationObserver !== 'undefined'
        ? (fn) => {
            let was = document.documentElement.classList.contains('is-uxc');
            new MutationObserver(() => {
              const is = document.documentElement.classList.contains('is-uxc');
              if (is !== was) {
                was = is;
                fn();
              }
            }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
          }
        : undefined,
    observeKids:
      typeof MutationObserver !== 'undefined'
        ? (el, fn) => {
            new MutationObserver((recs) => {
              const added: Element[] = [];
              const removed: Element[] = [];
              for (const r of recs) {
                r.addedNodes.forEach((n) => n.nodeType === 1 && added.push(n as Element));
                r.removedNodes.forEach((n) => n.nodeType === 1 && removed.push(n as Element));
              }
              fn(added, removed);
            }).observe(el, { childList: true });
          }
        : undefined,
    observeHidden:
      typeof MutationObserver !== 'undefined'
        ? (el, fn) => {
            let was = el.hasAttribute('hidden');
            new MutationObserver(() => {
              const is = el.hasAttribute('hidden');
              if (is !== was) {
                was = is;
                fn(is);
              }
            }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
          }
        : undefined,
  };
}
