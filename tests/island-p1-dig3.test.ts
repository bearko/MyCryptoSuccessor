/**
 * 段 DIG3：発掘を「なぞって掘る」に作り直す（右脳のコンテンツ。docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」の「なぞって掘る」）。
 * 1. なぞり（当てたマスが間隔で打たれる・離すと止まる・ボタンの上では打たない）／2. 範囲の枠の形・貫通の持ち越し／
 * 3. 爆弾の埋め方と爆発／4. 隊員の数と規則／5. 作業中は月の締めが待つ・演出がリザルトに集まる／移行。
 * 地層・出土品・RP・研究の数字と simTapsPerSec は変えない。
 */
import { describe, expect, it } from 'vitest';
import { DIG_BALANCE } from '../src/island/p1/data';
import { aimStep, cellOf } from '../src/island/p1/digview';
import { allowedDirs, build, dig, digRepeatMs, endRun, newP1, reachCells, reachCount, setLevel, startRun, type DigHit, type P1State } from '../src/island/p1/model';

const T = DIG_BALANCE.tree;
const lot = (s: P1State, id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] => {
  for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) { const d = allowedDirs(s, id, i, j); if (d.length) return [i, j, d[0]]; }
  throw new Error('no lot');
};
/** 発掘との出会いのあと・資金と RP たっぷり・工房あり */
function met(seed = 1, sector = 'c1', tier: 'C' | 'U' = 'C'): P1State {
  const s = newP1(seed, tier, sector);
  s.money = 1e8;
  s.rp = 100000;
  s.tut = 99;
  s.flags.hq = true;
  s.flags.digMeet = 'done';
  s.skills.push('hire');
  const b = build(s, 'workshop', ...lot(s, 'workshop'));
  if (typeof b === 'string') throw new Error(b);
  b.left = 0;
  return s;
}
function run(s: P1State, k = 0): P1State {
  s.dig!.sites[k].permit = true;
  if (s.digRun) endRun(s);
  const r = startRun(s, k);
  if (typeof r === 'string') throw new Error(r);
  return s;
}
const lv = (s: P1State, id: string, n: number) => setLevel(s, id, n);
const depthOf = (s: P1State) => s.dig!.sites[s.dig!.cur].depth;
const hpOf = (s: P1State) => s.dig!.sites[s.dig!.cur].hp;
/** いまの層が 1 枚はがれるまで打つ */
function breakCell(s: P1State, x: number, y: number): DigHit {
  for (let k = 0; k < 60; k++) {
    const r = dig(s, x, y);
    if (typeof r === 'string') throw new Error(`${x},${y}: ${r}`);
    if (r.broke) return r;
  }
  throw new Error('not broken');
}
/** DOM の代わり（cellOf は closest と dataset だけ使う） */
const fakeEl = (cls: string, x?: number, y?: number) => {
  const el = { dataset: {} as Record<string, string>, closest: (sel: string) => (sel === '.isl-dig-cell' && cls === 'isl-dig-cell' ? el : null) };
  if (x != null) el.dataset.x = String(x);
  if (y != null) el.dataset.y = String(y);
  return el as unknown as Element;
};

describe('1. なぞって掘る', () => {
  it('当てたマスは、まず 1 打・そのあと digRepeatMs ごとに 1 打（Lv0 は 170 ms ＝ 0.5 秒に約 3 回）。離すと止まる・マスが変わればすぐ打つ', () => {
    const s = met();
    expect(digRepeatMs(s)).toBe(170);
    expect(DIG_BALANCE.repeatMs).toBe(170);
    const ms = digRepeatMs(s);
    let r = aimStep(null, [2, 3], 1000, ms);
    expect(r.strike).toBe(true);
    expect(r.aim).toEqual({ x: 2, y: 3, next: 1170 });
    // 同じマス：間隔が来るまで打たない
    r = aimStep(r.aim, [2, 3], 1100, ms);
    expect(r.strike).toBe(false);
    r = aimStep(r.aim, [2, 3], 1170, ms);
    expect(r.strike).toBe(true);
    expect(r.aim!.next).toBe(1340);
    // 0.5 秒で 3 回（1000・1170・1340）
    let n = 0;
    let a = null as ReturnType<typeof aimStep>['aim'];
    for (let now = 1000; now < 1500; now += 16) {
      const x = aimStep(a, [2, 3], now, ms);
      a = x.aim;
      if (x.strike) n++;
    }
    expect(n).toBe(3);
    // 離すと止まる
    r = aimStep(a, null, 2000, ms);
    expect(r).toEqual({ aim: null, strike: false });
    // 別のマスへ：すぐ 1 打
    r = aimStep(a, [3, 3], 2000, ms);
    expect(r.strike).toBe(true);
    expect([r.aim!.x, r.aim!.y]).toEqual([3, 3]);
  });

  it('マスの上だけ掘る：閉じるボタン・帯・札の上（マスでない要素）では null', () => {
    expect(cellOf(fakeEl('isl-dig-cell', 4, 5))).toEqual([4, 5]);
    expect(cellOf(fakeEl('isl-btn'))).toBeNull();
    expect(cellOf(fakeEl('isl-dig-endcard'))).toBeNull();
    expect(cellOf(null)).toBeNull();
    // 座標の無いマス（無効）も null
    expect(cellOf(fakeEl('isl-dig-cell'))).toBeNull();
  });

  it('自動で打っても 1 打の中身は手で打つのと同じ（dig）：硬さが減り、0 で 1 枚はがれる', () => {
    const s = met();
    run(s, 0);
    const k = 0;
    const h0 = hpOf(s)[k];
    const r = dig(s, 0, 0);
    if (typeof r === 'string') throw new Error(r);
    // 表土（硬さ 1）は 1 打ではがれる。硬ければ 1 打の強さぶん減る
    if (r.broke) expect(h0).toBeLessThanOrEqual(1);
    else expect(h0 - r.left).toBeCloseTo(1, 6);
    if (!r.broke) breakCell(s, 0, 0);
    expect(depthOf(s)[k]).toBe(1);
  });
});

describe('2. 範囲（点線の枠）', () => {
  it('効く範囲：Lv0 は当てたマスだけ・Lv1・2 で左右（3 マス）・Lv3 で左右と下（4 マス）・Lv4・5 で上下左右（5 マス）。壁の外は入らない', () => {
    const s = met();
    run(s, 0);
    expect(reachCells(s, 3, 4)).toEqual([[3, 4]]);
    expect([0, 1, 2, 3, 4, 5].map(reachCount)).toEqual([1, 3, 3, 4, 5, 5]);
    lv(s, 'dig_reach', 1);
    expect(reachCells(s, 3, 4)).toEqual([[3, 4], [2, 4], [4, 4]]);
    lv(s, 'dig_reach', 3);
    expect(reachCells(s, 3, 4)).toEqual([[3, 4], [2, 4], [4, 4], [3, 5]]);
    lv(s, 'dig_reach', 5);
    expect(reachCells(s, 3, 4)).toEqual([[3, 4], [2, 4], [4, 4], [3, 3], [3, 5]]);
    // 左上の角：壁の外のマスは入らない
    expect(reachCells(s, 0, 0)).toEqual([[0, 0], [1, 0], [0, 1]]);
    expect(T.reachDir).toEqual(['lr', 'lr', 'lrd', 'all', 'all']);
  });
});
