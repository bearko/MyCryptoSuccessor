// 段 FACTORY1a：工房を 1×2 の町工場・2×2 の大工場へ建て替える。docs/ISLAND_PHASE1.md「工房の段（建て替え）」
import { describe, expect, it } from 'vitest';
import { DEF } from '../src/island/defs';
import { cells, frontCell } from '../src/island/sim';
import { BUILD_CATS, FACTORY, P1B, PRODUCT, STORE, type Mat } from '../src/island/p1/data';
import { moveTo, recOf } from '../src/island/p1/land';
import {
  allowedDirs,
  assign,
  benchCount,
  build,
  canBuild,
  canMoveTo,
  canPlaceAt,
  cellsOf,
  defOf,
  deserializeP1,
  doorOf,
  facLv,
  finishUp,
  invest,
  isRevived,
  myWorkshop,
  newP1,
  occupant,
  openGate,
  poolCap,
  serializeP1,
  startCraft,
  startUp,
  step,
  turn,
  tutSpot,
  upCheck,
  upSpots,
  wasteCells,
  wasteSpots,
  wsAny,
  wsDef,
  type P1State,
  type PBuilding,
} from '../src/island/p1/model';

const run = (s: P1State, days: number) => {
  for (let k = 0; k < days; k++) step(s);
};
function lot(s: P1State, id: string, ok: (i: number, j: number) => boolean = () => true): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] {
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const d = allowedDirs(s, id, i, j);
      if (d.length && ok(i, j)) return [i, j, d[0]];
    }
  throw new Error('no lot');
}
/** 工房を建てて（チュートリアルと同じ場所）、作業台の設備投資を n 段 */
function town(seed = 1, tier: 'C' | 'R' = 'C', sector = 'c1', bench = 2): { s: P1State; ws: PBuilding } {
  const s = newP1(seed, tier, sector);
  s.money = 1e7;
  s.tut = 99;
  const ws = build(s, 'workshop', ...tutSpot(s, 'workshop')!);
  if (typeof ws === 'string') throw new Error(ws);
  run(s, 6);
  for (let k = 0; k < bench; k++) expect(invest(s, ws.uid, 'bench')).toBeNull();
  return { s, ws };
}
const has = (cs: [number, number][], i: number, j: number) => cs.some(([x, y]) => x === i && y === j);

describe('形：2×2（cells・frontCell）', () => {
  it('2×2 は向きで形が変わらず、(i+1, j+1) が手前のマス', () => {
    const d = wsDef(2);
    expect(d.size).toBe(4);
    for (const dir of ['rd', 'ld', 'lu', 'ru'] as const) {
      expect(cells(d, 3, 4, dir)).toEqual([[3, 4], [4, 4], [3, 5], [4, 5]]);
      expect(frontCell(d, 3, 4, dir)).toEqual([4, 5]);
    }
    expect(wsDef(1).size).toBe(2);
    expect(wsDef(1).art).toBe('factory');
    expect(wsDef(0)).toBe(DEF.workshop);
    // 段の無い建物はそのまま（島づくりの DEF）
    expect(defOf({ id: 'general_store' })).toBe(DEF.general_store);
    expect(defOf({ id: 'workshop' })).toBe(DEF.workshop);
  });

  it('2×2 の工房は 4 マスとも当たり、入口は道路に面した前のマス', () => {
    const { s, ws } = town(5, 'R', 'r1');
    ws.lv = 1;
    const sp = upSpots(s, 2)[0];
    Object.assign(ws, { i: sp.i, j: sp.j, dir: sp.dir, lv: 2 });
    const cs = cells(wsDef(2), ws.i, ws.j, ws.dir);
    for (const [x, y] of cs) expect(occupant(s, x, y)?.uid).toBe(ws.uid);
    expect(cellsOf(ws)).toHaveLength(4);
    const door = doorOf(ws);
    expect(has(cs, ...door)).toBe(false);
  });
});

describe('開く条件とお金', () => {
  it('段 1 は作業台の設備投資 2 段目のあと（どのランクの町でも）。段 2 は Rare 以上の町だけ', () => {
    const a = town(1, 'C', 'c1', 1);
    expect(upCheck(a.s).err).toBe('bench');
    expect(upCheck(a.s).lv).toBe(1);
    expect(invest(a.s, a.ws.uid, 'bench')).toBeNull();
    const c1 = upCheck(a.s);
    expect(c1.err).toBeNull();
    expect(c1.cost).toBe(FACTORY.cost[1]);
    expect(c1.days).toBe(FACTORY.days[1]);
    // Common の町で町工場にしたあと、大工場は Rare から
    a.ws.lv = 1;
    expect(upCheck(a.s)).toMatchObject({ lv: 2, err: 'tier' });
    const r = town(5, 'R', 'r1', 2);
    r.ws.lv = 1;
    const c2 = upCheck(r.s);
    expect(c2.lv).toBe(2);
    expect(['room', null]).toContain(c2.err);
    r.ws.lv = 2;
    expect(upCheck(r.s).err).toBe('max');
  });

  it('お金：建て替えの値段だけ減る（資金が足りなければ始められない）', () => {
    const { s } = town(1);
    s.money = FACTORY.cost[1] - 1;
    expect(upCheck(s).err).toBe('money');
    const sp = upSpots(s, 1)[0];
    expect(startUp(s, sp.i, sp.j, sp.dir)).toBe('money');
    s.money = FACTORY.cost[1] + 500;
    expect(startUp(s, sp.i, sp.j, sp.dir)).toBeNull();
    expect(s.money).toBe(500);
    expect(upCheck(s).err).toBe('busy');
  });
});

describe('置き方：その場の建て替えと、移転を兼ねる建て替え', () => {
  it('その場：いまのマスを含む置き方が先。終わった日に 1×2 になり、前のマスもそのまま使う', () => {
    const { s, ws } = town(1);
    const spots = upSpots(s, 1);
    expect(spots.length).toBeGreaterThan(0);
    const here = spots.filter((p) => p.here);
    expect(here.length).toBeGreaterThan(0);
    expect(spots[0].here).toBe(true);
    const old: [number, number] = [ws.i, ws.j];
    const sp = here[0];
    expect(startUp(s, sp.i, sp.j, sp.dir)).toBeNull();
    run(s, FACTORY.days[1]);
    expect(ws.lv).toBe(1);
    expect(ws.up).toBeUndefined();
    const cs = cells(wsDef(1), ws.i, ws.j, ws.dir);
    expect(cs).toHaveLength(2);
    expect(has(cs, ...old)).toBe(true);
  });

  it('移転を兼ねる：終わった日に前のマスが空く', () => {
    const { s, ws } = town(1);
    const old: [number, number] = [ws.i, ws.j];
    const far = upSpots(s, 1).find((p) => !p.here && !has(cells(wsDef(1), p.i, p.j, p.dir), ...old));
    expect(far).toBeTruthy();
    expect(startUp(s, far!.i, far!.j, far!.dir)).toBeNull();
    // 建て替えのあいだは前のマスに建っていて、新しいマスは予約（どちらも工房の当たり）
    expect(occupant(s, ...old)?.uid).toBe(ws.uid);
    expect(occupant(s, far!.i, far!.j)?.uid).toBe(ws.uid);
    run(s, FACTORY.days[1]);
    expect(occupant(s, ...old)).toBeNull();
    expect([ws.i, ws.j, ws.dir]).toEqual([far!.i, far!.j, far!.dir]);
  });

  it('予約したマスには、ほかの建物を置けない', () => {
    const { s } = town(1);
    const sp = upSpots(s, 1).find((p) => !p.here)!;
    expect(startUp(s, sp.i, sp.j, sp.dir)).toBeNull();
    for (const [x, y] of cells(wsDef(1), sp.i, sp.j, sp.dir)) {
      for (const d of ['rd', 'ld', 'lu', 'ru'] as const) expect(canPlaceAt(s, 'general_store', x, y, d)).not.toBeNull();
      expect(allowedDirs(s, 'general_store', x, y)).toEqual([]);
    }
  });

  it('2×2 は荒れ地に置けず、復興した土地には置ける', () => {
    const { s, ws } = town(5, 'R', 'r1', 2);
    ws.lv = 1;
    expect(s.dig).toBeTruthy();
    const waste = new Set<string>();
    wasteSpots(s.dig!.sector).forEach((_, k) => wasteCells(s.dig!.sector, k).forEach(([x, y]) => waste.add(`${x},${y}`)));
    const onWaste = (p: { i: number; j: number; dir: 'rd' | 'ld' | 'lu' | 'ru' }) => cells(wsDef(2), p.i, p.j, p.dir).some(([x, y]) => waste.has(`${x},${y}`));
    expect(upSpots(s, 2).some(onWaste)).toBe(false);
    // 荒れ地 0 を掘りきって復興させる
    const st = s.dig!.sites[0];
    st.revived = true;
    const [x0, y0] = wasteCells(s.dig!.sector, 0)[0];
    expect(isRevived(s, x0, y0)).toBe(true);
    const on = upSpots(s, 2).filter((p) => cells(wsDef(2), p.i, p.j, p.dir).some(([x, y]) => wasteCells(s.dig!.sector, 0).some(([a, b]) => a === x && b === y)));
    expect(on.length).toBeGreaterThan(0);
  });

  it('置ける場所が 1 つも無ければ、押せない（理由は room）', () => {
    const { s, ws } = town(1);
    // まわりを全部ふさぐ：工房以外の草地を他社の建物で埋める
    for (let j = 0; j < s.n; j++)
      for (let i = 0; i < s.n; i++) if (s.ground[j * s.n + i] === 'grass' && !occupant(s, i, j)) s.buildings.push({ uid: s.nextUid++, id: 'house', i, j, dir: 'rd', left: 0, owner: 'town' });
    expect(upSpots(s, 1)).toEqual([]);
    expect(upCheck(s).err).toBe('room');
    const any = cellsOf(ws)[0];
    expect(startUp(s, any[0], any[1], ws.dir)).toBe('room');
  });
});

describe('建て替えのあいだも作り続け、終わった日に台の数と物置が替わる', () => {
  it('段 1：作業台 3 → 4・物置 +60。段 2：5 台・+140', () => {
    const { s, ws } = town(1);
    assign(s, 10003, 'craft', 0);
    for (const [m, n] of Object.entries(PRODUCT.Lantern.recipe.C ?? {})) s.mats[m as Mat] = (n ?? 0) * 3;
    expect(startCraft(s, 0, 'Lantern:C')).toBeNull();
    expect(benchCount(s)).toBe(3);
    const pool0 = poolCap(s);
    const sp = upSpots(s, 1)[0];
    expect(startUp(s, sp.i, sp.j, sp.dir)).toBeNull();
    // 建て替えのあいだ：工房は動いている（myWorkshop がある・台の数は前のまま・作り続ける）
    let made = 0;
    for (let k = 0; k < FACTORY.days[1] - 1; k++) {
      const r = step(s);
      made += r.made.length;
      expect(myWorkshop(s)?.uid).toBe(ws.uid);
      expect(s.slots).toHaveLength(3);
      expect(r.rebuilt).toBeUndefined();
    }
    expect(s.slots[0].running || made > 0).toBe(true);
    const r = step(s);
    expect(r.rebuilt?.map((b) => b.uid)).toEqual([ws.uid]);
    expect(facLv(s)).toBe(1);
    expect(s.slots).toHaveLength(4);
    expect(benchCount(s)).toBe(4);
    expect(s.flags.facNew).toEqual([3]);
    expect(poolCap(s)).toBe(pool0 + FACTORY.pool[1]);
    // 段 2（数字だけ確かめる：置き場所は別のテスト）
    ws.up = { lv: 2, i: ws.i, j: ws.j, dir: ws.dir, left: 1, days: 10 };
    finishUp(s, ws);
    expect(s.slots).toHaveLength(5);
    expect(poolCap(s)).toBe(pool0 + FACTORY.pool[2]);
    expect(poolCap(s) - pool0).toBe(140);
    expect(STORE.base).toBe(80);
  });

  it('段の上積みは作業台 2 段目を取ってから（作業台 1 段で町工場でも 2 台のまま）', () => {
    const { s, ws } = town(1, 'C', 'c1', 1);
    ws.lv = 1;
    expect(benchCount(s)).toBe(2);
    invest(s, ws.uid, 'bench');
    expect(benchCount(s)).toBe(4);
    expect(s.slots).toHaveLength(4);
  });

  it('建て替えの途中は移転・向きの変更をしない', () => {
    const { s, ws } = town(1);
    const sp = upSpots(s, 1)[0];
    startUp(s, sp.i, sp.j, sp.dir);
    expect(upCheck(s).err).toBe('busy');
    const d0 = ws.dir;
    expect(turn(s, ws.uid)).toBe(false);
    expect(ws.dir).toBe(d0);
    const [i, j, d] = lot(s, 'general_store');
    expect(canMoveTo(s, ws.uid, i, j, d)).toBe('locked');
  });
});

describe('ほかのセクタ・古いセーブ', () => {
  it('ほかのセクタの写しでも、形と台の数がそろう（新しいセクタは段 0 から）', () => {
    const { s, ws } = town(24);
    const sp = upSpots(s, 1)[0];
    startUp(s, sp.i, sp.j, sp.dir);
    run(s, FACTORY.days[1]);
    expect(s.slots).toHaveLength(4);
    expect(openGate(s)).toBe(true);
    s.money = 1e7;
    expect(moveTo(s, 'c2', 10002)).toBeNull();
    // c2 は新しいセクタ：工房はまだ無い（建てれば段 0）
    expect(wsAny(s)).toBeNull();
    const snap = recOf(s, 'c1').snap as unknown as P1State;
    const sw = snap.buildings.find((b) => b.owner === 'me' && b.id === 'workshop')!;
    expect(sw.lv).toBe(1);
    expect(defOf(sw).size).toBe(2);
    const w2 = build(s, 'workshop', ...lot(s, 'workshop'));
    if (typeof w2 === 'string') throw new Error(w2);
    run(s, 6);
    expect(facLv(s)).toBe(0);
    expect(benchCount(s)).toBe(1);
    // 写しの台が多すぎたら、戻ったときにそろえる
    snap.slots.push({ sku: null, worker: null, progress: 0, running: false, repeat: true });
    expect(moveTo(s, 'c1', 10003)).toBeNull();
    expect(wsAny(s)?.uid).toBe(ws.uid);
    expect(facLv(s)).toBe(1);
    expect(s.slots).toHaveLength(4);
    expect(cellsOf(wsAny(s)!)).toHaveLength(2);
  });

  it('古いセーブ（lv が無い・作業台 2 段目済み）は段 0 のまま読める（形を勝手に替えない）', () => {
    const { s, ws } = town(1);
    const o = JSON.parse(serializeP1(s));
    const w = o.buildings.find((b: PBuilding) => b.uid === ws.uid);
    delete w.lv;
    delete w.up;
    const back = deserializeP1(JSON.stringify(o))!;
    expect(back.v).toBe(s.v);
    const bw = back.buildings.find((b) => b.uid === ws.uid)!;
    expect(bw.lv).toBeUndefined();
    expect(facLv(back)).toBe(0);
    expect(cellsOf(bw)).toEqual([[ws.i, ws.j]]);
    expect(back.slots).toHaveLength(3);
    // 建て替え中のセーブも読み書きできる
    const sp = upSpots(s, 1)[0];
    startUp(s, sp.i, sp.j, sp.dir);
    const b2 = deserializeP1(serializeP1(s))!;
    expect(b2.buildings.find((b) => b.uid === ws.uid)!.up).toMatchObject({ lv: 1, left: FACTORY.days[1] });
  });
});

describe('入り口を 1 つに', () => {
  it('建築の一覧に「工場（準備中）」が出ない（港はそのまま）', () => {
    const ids = BUILD_CATS.flatMap((c) => c.ids);
    expect(ids).not.toContain('factory');
    expect(ids).toContain('harbor');
    expect(P1B.factory).toBeUndefined();
    const s = newP1(1);
    expect(canBuild(s, 'factory')).toBe('locked');
  });
});
