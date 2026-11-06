/**
 * 段 DIG3：発掘を「なぞって掘る」に作り直す（右脳のコンテンツ。docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」の「なぞって掘る」）。
 * 1. なぞり（当てたマスが間隔で打たれる・離すと止まる・ボタンの上では打たない）／2. 範囲の枠の形・貫通の持ち越し／
 * 3. 爆弾の埋め方と爆発／4. 隊員の数と規則／5. 作業中は月の締めが待つ・演出がリザルトに集まる／移行。
 * 地層・出土品・RP・研究の数字と simTapsPerSec は変えない。
 */
import { describe, expect, it } from 'vitest';
import { DIG_BALANCE, DIG_CREW_HEROES, DIG_PANELS, SKILL, rpCost, shownOf, shownText } from '../src/island/p1/data';
import { aimStep, cellOf, crewInfo } from '../src/island/p1/digview';
import { BOMB_MAX, allowedDirs, assign, bombCount, bombsLeft, build, crewDig, crewSize, deserializeP1, dig, digLayout, digLayouts, digNext, digPower, digRepeatMs, dungeonLayout, endRun, holdReport, learn, lvOf, newP1, peekView, pierceRate, reachCells, reachCount, serializeP1, setLevel, startRun, step, type DigHit, type P1State } from '../src/island/p1/model';

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

describe('2. 貫通（打った力が層の硬さを超えたぶんを下の層へ）', () => {
  it('パネル：Common の枝「貫通」（広く掘るの先。RP 30・GUM 9,000）。持ち越し 25 → 35・50・65・80%。スキルツリーの札に「いま → 次」', () => {
    expect(SKILL.dig_pierce.branch).toBe('dig');
    expect(SKILL.dig_pierce.requires).toEqual(['dig_reach']);
    expect(SKILL.dig_pierce.cost).toBe(9000);
    expect(rpCost(SKILL.dig_pierce)).toBe(30);
    expect(T.pierce).toEqual([0.25, 0.35, 0.5, 0.65, 0.8]);
    expect(DIG_PANELS).toContain('dig_pierce');
    const s = met();
    expect(pierceRate(s)).toBe(0);
    for (let n = 1; n <= 5; n++) {
      lv(s, 'dig_pierce', n);
      expect(pierceRate(s), `Lv${n}`).toBeCloseTo(T.pierce[n - 1], 6);
    }
    // 札の「いま → 次」：貫通 +25% → +35%・範囲 3 マス → 4 マス
    const line = (id: string, n: number) => shownOf(SKILL[id]).base.map((x) => shownText(x, n));
    expect(line('dig_pierce', 1)).toEqual(['+25%']);
    expect(line('dig_pierce', 2)).toEqual(['+35%']);
    expect(line('dig_reach', 2)[0]).toBe('3 マス');
    expect(line('dig_reach', 3)[0]).toBe('4 マス');
    expect(line('dig_reach', 5)[0]).toBe('5 マス');
  });

  it('Lv0 は持ち越しなし（いまと同じ）。Lv で、余った力 × 割合が同じマスの次の層に届く（pierce の結果が extra に）。層がはがれればさらに次へ', () => {
    // 1 打の強さを大きく（岩盤まで掘れる）：表土（硬さ 1）を 10 で打てば 9 余る
    const s = met();
    lv(s, 'dig_deep', 3);
    lv(s, 'dig_power', 5);
    lv(s, 'u_dig_power2', 5);
    const P = digPower(s);
    expect(P).toBe(7);
    run(s, 0);
    const L = digLayout('c1', 0)!;
    // Lv0：余っても下の層には届かない
    const r0 = dig(s, 0, 0);
    if (typeof r0 === 'string') throw new Error(r0);
    expect(r0.broke).toBe(true);
    expect(r0.over).toBeCloseTo(P - L.cells[0].hard[0], 6);
    expect(r0.extra ?? []).toEqual([]);
    expect(depthOf(s)[0]).toBe(1);
    // Lv1（25%）：マス (1, 0)。余り × 0.25 が 2 枚目に届く
    lv(s, 'dig_pierce', 1);
    const h1 = L.cells[1].hard;
    const r1 = dig(s, 1, 0);
    if (typeof r1 === 'string') throw new Error(r1);
    expect(r1.broke).toBe(true);
    const over = Math.round((P - h1[0]) * 100) / 100;
    const carry = Math.round(over * 0.25 * 100) / 100;
    const ex = r1.extra ?? [];
    expect(ex.length).toBeGreaterThanOrEqual(1);
    expect(ex[0].pierce).toBe(true);
    expect([ex[0].x, ex[0].y, ex[0].layer]).toEqual([1, 0, 1]);
    expect(ex[0].dmg).toBeCloseTo(Math.min(carry, h1[1]), 2);
    if (carry >= h1[1]) {
      expect(ex[0].broke).toBe(true);
      expect(depthOf(s)[1]).toBeGreaterThanOrEqual(2);
    } else {
      expect(ex[0].broke).toBe(false);
      expect(hpOf(s)[1]).toBeCloseTo(h1[1] - carry, 2);
    }
    // Lv5（80%）：強さ 7 で表土 1 → 余り 6 × 0.8 ＝ 4.8 が粘土層（硬さ 1〜2）をはがし、さらに余りの 80% が岩盤（硬さ 2〜3）へ
    lv(s, 'dig_pierce', 5);
    const r5 = dig(s, 2, 0);
    if (typeof r5 === 'string') throw new Error(r5);
    const ex5 = r5.extra ?? [];
    expect(ex5.length).toBeGreaterThanOrEqual(2);
    expect(ex5.every((h) => h.pierce && h.x === 2 && h.y === 0)).toBe(true);
    expect(ex5.map((h) => h.layer)).toEqual(ex5.map((_, i) => i + 1));
    expect(depthOf(s)[2]).toBeGreaterThanOrEqual(2);
    // 深い層の許可が無い層には届かない
    const u = met();
    lv(u, 'dig_power', 5);
    lv(u, 'u_dig_power2', 5);
    lv(u, 'dig_pierce', 5);
    run(u, 0);
    const ru = dig(u, 3, 0);
    if (typeof ru === 'string') throw new Error(ru);
    expect((ru.extra ?? []).every((h) => h.layer < 2)).toBe(true);
    expect(depthOf(u)[3]).toBeLessThanOrEqual(2);
  });
});

describe('3. 爆弾は地中に埋まっている', () => {
  it('壁ごとに爆弾の候補 BOMB_MAX（12）個：中層以降・出土品の無い層・マスは別々。同じ壁はいつも同じ所。ダンジョンの壁にも', () => {
    for (const sector of ['c1', 'u1', 'r1']) {
      for (const L of digLayouts(sector)) {
        expect(L.bombs, `${sector}:${L.site}`).toHaveLength(BOMB_MAX);
        const cells = new Set(L.bombs.map((b) => b.y * L.w + b.x));
        expect(cells.size).toBe(BOMB_MAX);
        for (const b of L.bombs) {
          expect(b.layer).toBeGreaterThanOrEqual(Math.floor((L.depth - 1) / 2));
          expect(b.layer).toBeLessThan(L.depth);
          expect(L.at[(b.y * L.w + b.x) * L.depth + b.layer]).toBe(-1);
        }
      }
      expect(digLayouts(sector)[0].bombs).toEqual(digLayout(sector, 0)!.bombs);
    }
    const D = dungeonLayout('c1', 1)!;
    expect(D.bombs).toHaveLength(BOMB_MAX);
    // 出土品の配置は前と同じ（爆弾は出土品のあとに引く）：v41 までの並びと同じ種で同じ出土品
    expect(digLayout('c1', 0)!.finds.length).toBeGreaterThan(10);
  });

  it('生きている爆弾は Lv0 で 1 個・Lv で 2〜6 個（候補の並びの先頭から）。その層をはがすと爆発して、まわりの層が一度にはがれ、残りが減る', () => {
    const s = met();
    lv(s, 'dig_deep', 3);
    expect(bombsLeft(s, 0)).toHaveLength(1);
    lv(s, 'dig_blast', 3);
    expect(bombsLeft(s, 0).map((x) => x.i)).toEqual([0, 1, 2, 3]);
    run(s, 0);
    const L = digLayout('c1', 0)!;
    const b = L.bombs[0];
    // （連鎖しないように、ほかの爆弾は爆発済みにしておく）
    s.dig!.sites[0].boom = [1, 2, 3];
    expect(bombsLeft(s, 0).map((x) => x.i)).toEqual([0]);
    const before = [...depthOf(s)];
    // 爆弾の層までは何も起きない
    let hit: DigHit | null = null;
    for (;;) {
      const r = breakCell(s, b.x, b.y);
      if (r.layer === b.layer) {
        hit = r;
        break;
      }
      expect(r.bomb).toBeFalsy();
    }
    expect(hit!.bomb).toBe(true);
    const ex = hit!.extra ?? [];
    expect(ex.length).toBeGreaterThan(0);
    expect(ex.every((h) => h.blast && h.broke)).toBe(true);
    // まわり 3 × 3（壁の中・掘りきっていないマス）が 2 枚（威力 Lv3 ＝ 2）までは がれた
    for (const h of ex) {
      expect(Math.abs(h.x - b.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(h.y - b.y)).toBeLessThanOrEqual(1);
    }
    const k00 = (b.y + (b.y > 0 ? -1 : 1)) * L.w + b.x;
    expect(depthOf(s)[k00] - before[k00]).toBeGreaterThanOrEqual(1);
    expect(bombsLeft(s, 0)).toHaveLength(0);
    expect(s.dig!.sites[0].boom).toEqual([1, 2, 3, 0]);
    expect(s.digRun!.got.bombs).toBe(1);
    // 同じ所をもう一度はがしても爆発しない
    expect(bombsLeft(s, 0).some((x) => x.i === 0)).toBe(false);
  });

  it('調整 v44：発破のパネルを開くと、荒れ地の格で爆弾の数を足す（Lv0 は格に関係なく 1 個）。掘削ドリルは開くと Lv5（奥へ 7 層）', () => {
    const B = T.bombTier;
    expect(bombCount(met(), 'E')).toBe(1);
    const s = met();
    expect(learn(s, 'dig_ext')).toBeNull();
    expect(learn(s, 'dig_power')).toBeNull();
    expect(learn(s, 'dig_blast')).toBeNull();
    const L = lvOf(s, 'dig_blast');
    expect(L).toBe(DIG_BALANCE.tree.rpLv.keep.dig_blast ?? DIG_BALANCE.tree.rpLv.lv);
    expect([bombCount(s, 'C'), bombCount(s, 'U'), bombCount(s, 'R'), bombCount(s, 'E')]).toEqual((['C', 'U', 'R', 'E'] as const).map((t) => Math.min(BOMB_MAX, T.bombs[L - 1] + B[t])));
    expect(bombsLeft(s, 0)).toHaveLength(T.bombs[L - 1] + B.C);
    expect(learn(s, 'dig_drill')).toBeNull();
    expect(lvOf(s, 'dig_drill')).toBe(5);
    expect(pierceRate(s)).toBe(0);
  });

  it('自動プレイ：爆弾の有無で打つ数は変えない（simTapsPerSec 4・作業 15 秒のまま）。発破の火薬代は無い', () => {
    expect(DIG_BALANCE.simTapsPerSec).toBe(4);
    expect(DIG_BALANCE.sessionSec).toBe(15);
    expect('blastCost' in T).toBe(false);
    expect(T.bombs).toEqual([2, 3, 4, 5, 6]);
    expect(T.blastSize).toEqual([3, 3, 3, 4, 5]);
    expect(SKILL.dig_blast.note).toContain('費用なし');
  });
});

describe('4. 発掘隊はシャドーヒーロー', () => {
  it('隊員の数は「発掘隊の手際」の Lv（役所の上限まで）。研究パネルとして開くと Lv2 ＝ 2 人。ヒーローは発掘の担当にできない', () => {
    const s = met();
    expect(crewSize(s)).toBe(0);
    expect(crewInfo(s).n).toBe(0);
    lv(s, 'dig_office', 5);
    expect(learn(s, 'dig_ext')).toBeNull();
    expect(learn(s, 'dig_crew')).toBeNull();
    expect(lvOf(s, 'dig_crew')).toBe(2);
    expect(crewSize(s)).toBe(2);
    expect(crewInfo(s).heroes).toEqual(DIG_CREW_HEROES.slice(0, 2));
    expect(assign(s, s.staff[0].hero, 'dig')).toBe('no-task');
    expect(SKILL.dig_crew.note).toContain('隊員 2 人');
  });

  it('作業のあいだ、隊員は 1 人 1 日 tree.crewDay 打（digPower × 手際の威力）。打った結果に隊員の番号。作業していない日は常駐が無ければ掘らない', () => {
    const s = met();
    lv(s, 'dig_deep', 3);
    lv(s, 'dig_office', 5);
    lv(s, 'dig_crew', 3);
    expect(crewDig(s)).toEqual([]);
    run(s, 0);
    const hs = Array.from({ length: 6 }, () => crewDig(s)).flat().filter((h) => !h.splash && !h.pierce && !h.blast);
    expect(hs).toHaveLength(Math.floor(18 * T.crewDay + 1e-9));
    expect(hs.map((h) => h.crew)).toEqual(hs.map((_, i) => i % 3));
    expect(hs.every((h) => h.dmg === Math.min(1.6, h.dmg! + (h.broke ? 0 : 0)) || h.dmg! <= 1.6)).toBe(true);
    // 1 日の step でも打つ（res.dug）
    const d = step(s);
    expect((d.dug ?? []).filter((h) => h.crew != null).length).toBeGreaterThan(0);
  });

  it('行動規則：Lv1 手前から順に／Lv2 硬いマスを避ける／Lv3 出土品の気配が見えたら優先／Lv4 爆弾の近く／Lv5 深い層へ', () => {
    const s = met();
    lv(s, 'dig_deep', 3);
    run(s, 0);
    const L = digLayout('c1', 0)!;
    // Lv1：左上から
    expect(digNext(s, false, false, 1)).toEqual([0, 0]);
    // Lv2：手前の層でいちばん柔らかいマスを先に（同じ硬さなら左上から）
    const soft = Math.min(...L.cells.map((c) => c.hard[0]));
    const k2 = L.cells.findIndex((c) => c.hard[0] === soft);
    expect(digNext(s, false, false, 2)).toEqual([k2 % L.w, Math.floor(k2 / L.w)]);
    // Lv3：覗き見でエクステが見えているマス（ランタンで手前から見える）を先に
    lv(s, 'dig_lamp', 3);
    const ext = L.finds.find((f) => f.item.kind === 'ext' && !f.item.topic && f.layer <= 1)!;
    const pick3 = digNext(s, false, false, 3)!;
    const pv = peekView(s, pick3[0], pick3[1]);
    expect(pv && !pv.hint && pv.item.kind === 'ext').toBe(true);
    void ext;
    // Lv4：生きている爆弾のマスを先に（規則 Lv3 の気配より優先ではなく、同じ重みの中で近い方。ここは爆弾だけの壁で確かめる）
    const b = L.bombs[0];
    const pick4 = digNext(s, false, false, 4)!;
    const pv4 = peekView(s, pick4[0], pick4[1]);
    // 爆弾のマスが、エクステの見えるマスより先
    expect(pick4).toEqual([b.x, b.y]);
    void pv4;
    lv(s, 'dig_lamp', 0);
    s.skills = s.skills.filter((x) => x !== 'dig_lamp');
    expect(digNext(s, false, false, 4)).toEqual([b.x, b.y]);
    // Lv5：深いマスを先に（1 枚はがしたマスがあれば、そこ。規則は積み重なるので、爆弾は爆発済みにして確かめる）
    breakCell(s, 5, 5);
    expect(digNext(s, false, false, 5)).toEqual([b.x, b.y]);
    s.dig!.sites[0].boom = [0];
    const p5 = digNext(s, false, false, 5)!;
    const pv5 = peekView(s, p5[0], p5[1]);
    // 深いマス（5, 5）か、見えているエクステのマス（Lv3 の規則も積み重なる）
    expect((p5[0] === 5 && p5[1] === 5) || (!!pv5 && !pv5.hint && pv5.item.kind === 'ext')).toBe(true);
    // 見えているエクステを掘り出してしまえば、深いマスへ
    for (let g = 0; g < 20; g++) {
      const q = digNext(s, false, false, 5)!;
      if (q[0] === 5 && q[1] === 5) break;
      breakCell(s, q[0], q[1]);
    }
    const q5 = digNext(s, false, false, 5)!;
    expect(depthOf(s)[q5[1] * L.w + q5[0]]).toBeGreaterThanOrEqual(1);
    // Lv1 は手前の層のいちばん左上（(0, 0) は 1 枚はがしたので次）
    const q1 = digNext(s, false, false, 1)!;
    expect(depthOf(s)[q1[1] * L.w + q1[0]]).toBe(0);
  });

  it('移行：セーブで発掘の担当だったヒーローは外れ、いた人数ぶんだけ隊員になる（Lv は上げない・版は上げない）', () => {
    const s = met();
    lv(s, 'dig_office', 5);
    s.staff[0].task = 'dig' as never;
    s.staff[1].task = 'dig' as never;
    const v0 = s.v;
    const b = deserializeP1(serializeP1(s))!;
    expect(b.v).toBe(v0);
    expect(b.staff.some((x) => x.task === 'dig')).toBe(false);
    expect(b.digCrewOld).toBe(2);
    expect(lvOf(b, 'dig_crew')).toBe(0);
    expect(crewSize(b)).toBe(2);
    // 手際を開けば大きいほう（Lv3 → 3 人）
    setLevel(b, 'dig_crew', 3);
    expect(crewSize(b)).toBe(3);
    // 爆弾の無いセーブ（boom 無し）も読める
    delete b.dig!.sites[0].boom;
    expect(deserializeP1(serializeP1(b))!.dig!.sites[0].boom).toBeUndefined();
  });
});

describe('5. 終わり方と演出', () => {
  it('作業中に月をまたいでも、月の締めは行い（報告は積む）、リザルト → 月次報告の順（endRun の crossed）。Sim は変えない（作業を即終える）', () => {
    const s = met();
    s.open = 0;
    run(s, 0);
    const rep0 = s.reports.length;
    expect(holdReport(s)).toBe(true);
    // 月をまたぐまで日を進める（作業は終わらない：現実の秒なので runTick を呼ばない）
    for (let d = 0; d < 35 && s.reports.length === rep0; d++) step(s);
    expect(s.reports.length).toBe(rep0 + 1);
    expect(s.digRun).not.toBeNull();
    expect(s.monthPause).toBeFalsy();
    const end = endRun(s)!;
    expect(end.crossed).toBe(true);
    expect(end.held).toHaveLength(1);
    expect(s.monthPause).toBe(true);
  });

  it('見つけた出土品は見つけた順に got.finds に残る（素材は入らない。お題・2 × 2 は big・石板も）', () => {
    const s = met();
    lv(s, 'dig_deep', 3);
    run(s, 0);
    const L = digLayout('c1', 0)!;
    expect(s.digRun!.got.finds).toBeUndefined();
    const ext = L.finds.find((f) => f.item.kind === 'ext' && !f.item.topic)!;
    for (let n = 0; ; n++) {
      const r = breakCell(s, ext.x, ext.y);
      if (r.layer === ext.layer) break;
      if (n > 10) throw new Error('deep');
    }
    const fs = s.digRun!.got.finds ?? [];
    expect(fs.length).toBeGreaterThanOrEqual(1);
    const f = fs.find((x) => x.item.kind === 'ext' && x.item.id === (ext.item as { id: number }).id)!;
    expect(f.layer).toBe(ext.layer);
    expect(f.first).toBe(true);
    expect(f.rp).toBe(15);
    expect(fs.every((x) => x.item.kind !== 'mat')).toBe(true);
    // お題は big
    const tp = L.finds.find((g) => g.item.kind === 'ext' && !!g.item.topic);
    if (tp) {
      for (let n = 0; ; n++) {
        const r = breakCell(s, tp.x, tp.y);
        if (r.layer === tp.layer) break;
        if (n > 10) throw new Error('deep');
      }
      const t2 = (s.digRun!.got.finds ?? []).find((x) => x.item.kind === 'ext' && !!x.item.topic)!;
      expect(t2.big).toBe(true);
      expect(t2.rp).toBe(40);
    }
    // 結果（endRun）にもそのまま
    const end = endRun(s)!;
    expect(end.got.finds!.length).toBe((fs.length ?? 0) + (tp ? 1 : 0));
  });
});
