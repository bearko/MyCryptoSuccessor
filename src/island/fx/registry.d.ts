/** registry.js の型（pixelfx は JS のまま写しているので、使う所だけ型を書く） */
export type FxId = 'confetti' | 'collect-burst' | 'firework-burst' | 'coin-pop' | 'loot-beam' | 'power-star' | 'sunburst' | 'healing-bloom' | 'summon-rise' | 'poof' | 'hammer-sparks';

export interface FxFrame {
  w: number;
  h: number;
  ox: number;
  oy: number;
  /** 色（RGBA の並びの 32bit） */
  color: Uint32Array;
  /** 加算の光 */
  light: Uint32Array;
}
export interface FxMeta {
  name: string;
  size: [number, number];
  /** 効果の原点（足もと・当たる点）のキャンバス上の位置 */
  origin: [number, number];
  duration: number;
  loop: boolean;
  fps: number;
  options?: Record<string, unknown>;
}
export interface FxModule {
  meta: FxMeta;
}
export interface FxInstance {
  readonly t: number;
  meta: FxMeta;
  update(dt: number): void;
  draw(frame: FxFrame, layer?: 'back' | 'front'): void;
  stop(): void;
  done(): boolean;
}
export const EFFECTS: Record<FxId, FxModule>;
export function createFrame(w: number, h: number, ox?: number, oy?: number): FxFrame;
export function clearFrame(f: FxFrame): FxFrame;
export function createFx(mod: FxModule, o?: Record<string, unknown>): FxInstance;
export function composite(f: FxFrame, out: Uint8ClampedArray, bg?: number | Uint32Array | null, lightK?: number): Uint8ClampedArray;
