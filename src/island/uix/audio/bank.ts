/**
 * 段 UIX1s：SE の名前 → 鳴らし方。音の口（uix/sound.ts の uxSfx）はここを通る。
 * ・同じ名前の音は 40ms 以内なら 1 つ（見本が自分の間隔を持つ音は、見本の間隔のまま）。
 * ・同時に鳴らす SE は 12 本まで（大きな節目の音だけは通す）。
 */
import type { Engine } from './engine';
import type { Music } from './music';
import { Sfx, VOICES } from './sfx';
import type { SongName } from './songs';

/** 音の口の名前（指示書の 22 種）。見た目の担当と合わせる約束なので、名前と引数は変えない */
export const UX_SFX = ['press', 'release', 'open', 'close', 'page', 'tab', 'lever', 'clunk', 'lamp', 'coin', 'cash', 'deny', 'confirm', 'rankup', 'conquest', 'build', 'done', 'tick', 'blip', 'toggle', 'slide', 'error'] as const;
export type UxSfxName = (typeof UX_SFX)[number];
/** 足した名前（見本にある細かい音と、今の音の付け替えに要る音）。uxSfx に同じように渡せる */
export const UX_SFX_MORE = ['sale', 'deposit', 'stamp', 'bell', 'flap', 'print', 'zoom', 'roll', 'firework', 'boot', 'dock', 'streak', 'leverback', 'built', 'dig', 'clink'] as const;
export type UxSfxMore = (typeof UX_SFX_MORE)[number];
export type SfxName = UxSfxName | UxSfxMore;
export const ALL_SFX: readonly SfxName[] = [...UX_SFX, ...UX_SFX_MORE];

export interface SfxOpts {
  /** 音程のずらし（半音。+12 で 1 オクターブ上）。音程のある音に効く */
  pitch?: number;
  /** 喋る人（blip）。0〜9 の声の表を回して使う */
  voice?: number;
  /**
   * 段：lever は目盛り（0〜7）・lamp は何個めのランプか（0〜）・slide はつまみの位置（0〜10）・
   * coin は何枚めか（0〜12。省くと、続けて鳴らすたびに上がる）・page は紙を送る数（省くと 7）・
   * toggle は 0 で切・それ以外で入・blip は字の番号（codePointAt。省くと順に揺らす）・zoom は 0 で戻る・streak は何個めか
   */
  step?: number;
  /** その場だけの大きさ（1 が標準）。今の音の付け替え（legacy.ts）が使う */
  gain?: number;
}

/** 同じ名前の音を続けて鳴らせる間隔（ms） */
export const SAME_GAP_MS = 40;
/** 同時に鳴らす SE の上限 */
export const MAX_VOICES = 12;
/** 見本が自分の間隔を持つ音（Sfx の中の gate。ここでは重ねて間引かない） */
const OWN_GATE: ReadonlySet<SfxName> = new Set<SfxName>(['lever', 'coin', 'tick', 'deposit', 'done', 'sale', 'blip', 'slide', 'flap', 'print', 'firework', 'dig', 'clink']);
/** 上限でも落とさない音（節目） */
const KEEP: ReadonlySet<SfxName> = new Set<SfxName>(['clunk', 'rankup', 'conquest', 'stamp', 'bell', 'boot']);
/** 金貨が「続けて」と数える間隔（秒）。これより空くと、音階の下から */
const COIN_RUN_S = 1.2;

export class SfxBank {
  readonly sfx: Sfx;
  private eng: Engine;
  private music: Music;
  private lastAt = new Map<string, number>();
  /** 鳴っている SE の終わる時刻 */
  private ends: number[] = [];
  private coinN = 0;
  private coinAt = -9;
  private blipN = 0;
  /** 制覇の祝いの曲のあとに戻る曲（core が場面から決める） */
  afterConquest: () => SongName = () => 'map';
  /** 確かめ用：鳴らした数・間引いた数（名前ごと） */
  played: Record<string, number> = {};
  dropped: Record<string, number> = {};

  constructor(eng: Engine, music: Music) {
    this.eng = eng;
    this.music = music;
    this.sfx = new Sfx(eng, music);
  }

  /** いま鳴っている SE の数 */
  active(): number {
    const now = this.eng.now;
    this.ends = this.ends.filter((t) => t > now);
    return this.ends.length;
  }

  /** 鳴らす。鳴らしたら true（間引いたら false） */
  play(name: SfxName, o: SfxOpts = {}): boolean {
    const now = this.eng.now;
    const drop = () => {
      this.dropped[name] = (this.dropped[name] ?? 0) + 1;
      return false;
    };
    if (!OWN_GATE.has(name)) {
      if (now - (this.lastAt.get(name) ?? -9) < SAME_GAP_MS / 1000) return drop();
    }
    if (this.active() >= MAX_VOICES && !KEEP.has(name)) return drop();
    const s = this.sfx;
    const e = this.eng;
    const made0 = e.made;
    e.mark = 0;
    s.shift = o.pitch ?? 0;
    s.gain = o.gain ?? 1;
    try {
      this.run(name, o, now);
    } finally {
      s.shift = 0;
      s.gain = 1;
    }
    // 見本が自分の間隔で間引いた（何も鳴らさなかった）
    if (e.made === made0) return drop();
    this.lastAt.set(name, now);
    this.ends.push(e.mark);
    this.played[name] = (this.played[name] ?? 0) + 1;
    return true;
  }

  private run(name: SfxName, o: SfxOpts, now: number): void {
    const s = this.sfx;
    const step = o.step;
    switch (name) {
      case 'press':
        return s.press(false);
      case 'release':
        return s.release();
      case 'open':
        return s.open();
      case 'close':
        return s.close();
      case 'page':
        return s.page(Math.max(1, Math.min(12, Math.round(step ?? 7))), step != null && step <= 4 ? 0.05 : 0.07);
      case 'tab':
        return s.tab();
      case 'lever':
        return s.detent(Math.max(0, Math.min(7, step ?? 3)) / 7);
      case 'clunk':
        return s.approve();
      case 'lamp':
        return s.lamp(Math.max(0, Math.round(step ?? 0)));
      case 'coin': {
        // 続けて鳴ると音階を上がる（12 段で頭打ち）。step を渡したら、その段
        if (step == null) {
          this.coinN = now - this.coinAt < COIN_RUN_S ? Math.min(11, this.coinN + 1) : 0;
          this.coinAt = now;
        }
        return s.coin(Math.max(0, Math.min(11.99, step ?? this.coinN)) / 12);
      }
      case 'cash':
        return s.buy();
      case 'deny':
        return s.deny();
      case 'confirm':
        return s.decide();
      case 'rankup':
        return s.rankup();
      case 'conquest': {
        // 見本と同じ：次の小節の頭で祝いの曲へ。そこまで小太鼓を連打して、頭で一撃
        const t = this.music.playing ? this.music.cue('fanfare', this.afterConquest()) : now + 0.9;
        s.roll(now + 0.02, t);
        return s.conquest(t);
      }
      case 'build':
        return s.build();
      case 'done':
        return s.complete(1);
      case 'tick':
        return s.tick();
      case 'blip': {
        const v = VOICES[(((o.voice ?? 0) % VOICES.length) + VOICES.length) % VOICES.length];
        const ch = step != null ? String.fromCodePoint(Math.max(1, Math.round(step))) : String.fromCodePoint(0x3042 + ((this.blipN++ * 3) % 80));
        return s.speak(v, ch);
      }
      case 'toggle':
        return s.toggle(step !== 0);
      case 'slide':
        return s.slider(Math.max(0, Math.min(10, step ?? 5)) / 10);
      case 'error':
        return s.error();
      case 'sale':
        return s.sale();
      case 'deposit':
        return s.deposit(1);
      case 'stamp':
        return s.stamp();
      case 'bell':
        return s.bell();
      case 'flap':
        return s.flap();
      case 'print':
        return s.print(Math.max(1, Math.min(8, Math.round(step ?? 4))));
      case 'zoom':
        return s.zoom(step !== 0);
      case 'roll':
        return s.roll(now + 0.02, now + 1.4);
      case 'firework':
        return s.firework(1);
      case 'boot':
        return s.boot();
      case 'dock':
        return s.dock(1);
      case 'streak':
        return s.streak(Math.max(0, Math.round(step ?? 0)));
      case 'leverback':
        return s.leverBack();
      case 'built':
        return s.built();
      case 'dig':
        return s.dig(1, Math.max(0, step ?? 0));
      case 'clink':
        return s.clink(1);
    }
  }
}

export const isSfxName = (x: string): x is SfxName => (ALL_SFX as readonly string[]).includes(x);
