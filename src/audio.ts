import { audioFiles } from './game/catalog';
import { assetUrl } from './render/images';

/** BGM のキー（scripts/sync-assets.mjs の audio）。効果音は src/island/p1/sfx.ts */
export type Bgm = 'bgmCraft' | 'bgmDig';

/** Loudness of the BGM at the 100% setting (the final volume is this × the setting). */
const BGM_VOLUME = 0.35;

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

/** Minimal sound manager for the looping BGM. */
export class Sound {
  /** Volume setting, 0 (off) to 1 (the track's own loudness). */
  private bgmLevel = 1;
  private bgm: HTMLAudioElement | null = null;
  private bgmKey: Bgm | null = null;
  private unlocked = false;

  /**
   * Called on user gestures. Starts the BGM, and retries on later gestures while it is still paused
   * (a phone's first touch may not count as a user activation, so play() can be refused once).
   * A BGM that is already playing is never restarted.
   */
  unlock(): void {
    this.unlocked = true;
    if (!this.bgmKey || this.bgmLevel <= 0) return;
    if (!this.bgm) this.playBgm(this.bgmKey, true);
    else if (this.bgm.paused) void this.bgm.play().catch(() => undefined);
  }

  /** BGM が実際に鳴っているか（確認用） */
  bgmPlaying(): boolean {
    return !!this.bgm && !this.bgm.paused;
  }

  /** いま流している（流すはずの）BGM */
  currentBgm(): Bgm | null {
    return this.bgmKey;
  }

  /** いま鳴らしている BGM のファイル（確認用。まだ鳴らしていなければ、流すはずの曲のファイル） */
  bgmSrc(): string {
    return this.bgm?.src ?? (this.bgmKey ? assetUrl(audioFiles[this.bgmKey]) : '');
  }

  private fadeTimer = 0;
  /**
   * BGM をフェードで替える（いまの曲を ms/2 で小さくして止め、次の曲を ms/2 で大きくする）。音量の設定・ミュートはいつもどおり
   * （ミュート中・まだ鳴らせないときは、流すはずの曲だけ替える）
   */
  fadeBgm(key: Bgm, ms = 600): void {
    if (this.bgmKey === key && this.bgm && !this.bgm.paused) return;
    window.clearInterval(this.fadeTimer);
    const half = Math.max(1, ms / 2);
    const fadeIn = () => {
      this.playBgm(key, true);
      const a = this.bgm;
      if (!a) return;
      a.volume = 0;
      const t0 = performance.now();
      this.fadeTimer = window.setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / half);
        a.volume = clamp01(BGM_VOLUME * this.bgmLevel * k) || 0;
        if (k >= 1 || this.bgm !== a) {
          window.clearInterval(this.fadeTimer);
          if (this.bgm === a) a.volume = clamp01(BGM_VOLUME * this.bgmLevel);
        }
      }, 30);
    };
    const old = this.bgm;
    if (!old || old.paused || this.bgmLevel <= 0) return fadeIn();
    this.bgmKey = key;
    const v0 = old.volume;
    const t0 = performance.now();
    this.fadeTimer = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / half);
      old.volume = clamp01(v0 * (1 - k));
      if (k >= 1) {
        window.clearInterval(this.fadeTimer);
        fadeIn();
      }
    }, 30);
  }

  playBgm(key: Bgm, force = false): void {
    if (this.bgmKey === key && !force && this.bgm && !this.bgm.paused) return;
    this.bgmKey = key;
    this.bgm?.pause();
    this.bgm = null;
    if (this.bgmLevel <= 0 || !this.unlocked) return;
    this.bgm = new Audio(assetUrl(audioFiles[key]));
    this.bgm.loop = true;
    this.bgm.volume = BGM_VOLUME * this.bgmLevel;
    void this.bgm.play().catch(() => undefined);
  }

  /**
   * Applies the BGM volume (0..1; `se` is the island's sound effects, set on IslandSfx). The playing BGM
   * follows at once: 0 pauses it, raising it from 0 resumes it.
   */
  setVolumes({ bgm }: { bgm?: number; se?: number }): void {
    if (bgm === undefined) return;
    this.bgmLevel = clamp01(bgm);
    if (!this.bgm) {
      if (this.bgmLevel > 0 && this.bgmKey) this.playBgm(this.bgmKey, true);
      return;
    }
    if (this.bgmLevel <= 0) {
      this.bgm.pause();
      return;
    }
    this.bgm.volume = BGM_VOLUME * this.bgmLevel;
    if (this.bgm.paused && this.unlocked) void this.bgm.play().catch(() => undefined);
  }
}
