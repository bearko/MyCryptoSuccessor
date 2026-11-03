// ドット絵のエフェクトの層（src/island/fx/layer.ts・docs/ISLAND_FX.md）：演出の強さの分岐と、小さな手応えの間引き
import { describe, expect, it } from 'vitest';
import { FX_PAL, FX_RARITY, LOUD, THIN_MS, fxPlan, rampOf, thinOk } from '../src/island/fx/layer';
import { EFFECTS, type FxId } from '../src/island/fx/registry.js';

describe('演出の強さ（fxPlan）', () => {
  const ids = Object.keys(EFFECTS) as FxId[];
  it('なし：どの効果も出さない', () => {
    for (const id of ids) expect(fxPlan(id, 'off')).toBeNull();
  });
  it('控えめ：花火・紙吹雪・光の柱は出さない。ほかは小さく（1 ドット 3/4・光は半分）', () => {
    expect(LOUD).toEqual(expect.arrayContaining(['firework-burst', 'confetti', 'loot-beam']));
    for (const id of ids) {
      const p = fxPlan(id, 'calm');
      if (LOUD.includes(id)) expect(p).toBeNull();
      else expect(p).toEqual({ scale: 0.75, light: 0.5 });
    }
  });
  it('ふつう：そのまま', () => {
    for (const id of ids) expect(fxPlan(id, 'full')).toEqual({ scale: 1, light: 1 });
  });
});

describe('間引き（thinOk）', () => {
  it('同じ組は 1 秒に 1 つまで。1 秒たてばまた出せる', () => {
    const last = new Map<string, number>();
    expect(thinOk(last, 'small', 1000)).toBe(true);
    expect(thinOk(last, 'small', 1300)).toBe(false);
    expect(thinOk(last, 'small', 1000 + THIN_MS - 1)).toBe(false);
    expect(thinOk(last, 'small', 1000 + THIN_MS)).toBe(true);
  });
  it('出さなかったものは時刻を進めない（続けて来ても、最初から 1 秒で出せる）', () => {
    const last = new Map<string, number>();
    thinOk(last, 'a', 0);
    for (let t = 100; t < THIN_MS; t += 100) expect(thinOk(last, 'a', t)).toBe(false);
    expect(thinOk(last, 'a', THIN_MS)).toBe(true);
  });
  it('組が違えば別に数える', () => {
    const last = new Map<string, number>();
    expect(thinOk(last, 'a', 0)).toBe(true);
    expect(thinOk(last, 'b', 10)).toBe(true);
    expect(thinOk(last, 'a', 20)).toBe(false);
  });
});

describe('色', () => {
  const hex = /^#[0-9a-f]{6}$/;
  it('レアリティの色：5 つとも、暗い → 明るいの 7 段以上', () => {
    for (const r of ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']) {
      const ramp = FX_RARITY[r];
      expect(ramp.length).toBeGreaterThanOrEqual(7);
      for (const c of ramp) expect(c).toMatch(hex);
    }
    expect(FX_RARITY.Legendary).toBe(FX_PAL.gold);
  });
  it('rampOf：1 つの色から 7 段（真ん中がその色・最後は白）', () => {
    const r = rampOf('#F0A35A');
    expect(r).toHaveLength(7);
    expect(r[3]).toBe('#f0a35a');
    expect(r[6]).toBe('#ffffff');
    for (const c of r) expect(c).toMatch(hex);
    const luma = (c: string) => [1, 3, 5].reduce((a, i) => a + parseInt(c.slice(i, i + 2), 16), 0);
    for (let i = 1; i < r.length; i++) expect(luma(r[i])).toBeGreaterThan(luma(r[i - 1]));
  });
});

describe('効果の一覧', () => {
  it('写した効果は 1 回きりなら最後に止まり、ループなら life で止められる（meta がそろっている）', () => {
    for (const [id, m] of Object.entries(EFFECTS)) {
      expect(m.meta.size[0], id).toBeLessThanOrEqual(250);
      expect(m.meta.size[1], id).toBeLessThanOrEqual(250);
      expect(m.meta.duration, id).toBeGreaterThan(0);
    }
  });
});
