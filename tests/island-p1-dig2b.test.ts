/**
 * 発掘 v2 の 2 段目：発掘のスキルツリー（9 本目の枝「発掘」。docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」の「2. 発掘のスキルツリー」）。
 * 各パネルの各 Lv で効き目が数字に出ること（作業時間・1 打の強さ・会心・長押しの間隔・隣への力・見える深さ・掘れる層・研究の上限と深さの倍率・
 * 上限で貯めて上がったときに Lv と RP・発破の火薬代と大きさ・ドリル・隊の人数の上限・隊の速さ・常駐の有無と速さ・段取り・交代制・素材）、
 * 版 3 → 4 の引き継ぎ、出会いの前は枝が隠れていること、パネルが重ならないこと。投資の監査（island:audit）では発掘の枝は「対象外」なので、ここで全部確かめる。
 */
import { describe, expect, it } from 'vitest';
import { BRANCHES, DIG_BALANCE, DIG_PANELS, digRpLv, DIG_SITES, INVESTS, RESEARCH_NEED, RP_GAIN, SKILL, SKILLS, isResearch, maxLv, rpCost, shownOf, shownText } from '../src/island/p1/data';
import {
  affordableSkills,
  assign,
  autoRate,
  crewDig,
  crewMul,
  crewSize,
  blastSize,
  bombCount,
  bombPower,
  bombsLeft,
  detonate,
  build,
  allowedDirs,
  crewCap,
  deepLayers,
  deserializeP1,
  dig,
  digCheck,
  digLayout,
  digLayouts,
  digNext,
  digPower,
  digRepeatMs,
  drill,
  endRun,
  fxSum,
  learn,
  levelLock,
  levelUp,
  lvOf,
  newP1,
  peek,
  peekAhead,
  peekView,
  researchCap,
  researchLeft,
  researchOf,
  runLock,
  serializeP1,
  sessionSec,
  setLevel,
  skillLock,
  standSite,
  startRun,
  step,
  type DigHit,
  type P1State,
  DUNGEON,
} from '../src/island/p1/model';
import { cellView, digRec, digSpec, lockedLayer, nextLvText, noteEntries, standing } from '../src/island/p1/digview';
import { BRANCH_TIP, digTips } from '../src/island/p1/digmeet';
import { DEPT_LAYOUT, HUBPOS, POS, UNPLACED, groupOf } from '../src/island/p1/treelayout';
import { specOf } from '../scripts/island/audit';

const T = DIG_BALANCE.tree;
const lot = (s: P1State, id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] => {
  for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) { const d = allowedDirs(s, id, i, j); if (d.length) return [i, j, d[0]]; }
  throw new Error('no lot');
};
/** 発掘との出会いのあと（枝が見える）・資金たっぷり・工房あり */
function met(seed = 1, sector = 'c1', tier: 'C' | 'U' = 'C'): P1State {
  const s = newP1(seed, tier, sector);
  s.money = 1e8;
  // 発掘のパネルは研究パネル（RP で開く）：開くための RP を持たせる
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
  // 段 DIG3：地中の爆弾は爆発済みにしておく（位置の決まったテストが爆発で崩れないように。爆弾のテストは tests/island-p1-dig3.test.ts）
  if (k !== DUNGEON) s.dig!.sites[k].boom = Array.from({ length: 12 }, (_, i) => i);
  return s;
}
const hpOf = (s: P1State) => s.dig!.sites[s.dig!.cur].hp;
const depthOf = (s: P1State) => s.dig!.sites[s.dig!.cur].depth;
/** いまの層が 1 枚はがれるまで打つ */
function breakCell(s: P1State, x: number, y: number): DigHit {
  for (let k = 0; k < 40; k++) {
    const r = dig(s, x, y);
    if (typeof r === 'string') throw new Error(`${x},${y}: ${r}`);
    if (r.broke) return r;
  }
  throw new Error('not broken');
}
/** (x, y) を手前から掘り進めて、層 layer をはがす */
function digTo(s: P1State, x: number, y: number, layer: number): DigHit {
  for (;;) {
    const r = breakCell(s, x, y);
    if (r.layer >= layer) return r;
  }
}
/** 荒れ地 k の、いまの許可で掘れる層をぜんぶはがす（はがれた結果を返す） */
function clearOpen(s: P1State, k = 0): DigHit[] {
  run(s, k);
  const L = digLayout(s.dig!.sector, k)!;
  const n = deepLayers(s, L.tier);
  const out: DigHit[] = [];
  for (let i = 0; i < L.w * L.h; i++) while (depthOf(s)[i] < Math.min(n, L.depth)) out.push(breakCell(s, i % 7, Math.floor(i / 7)));
  return out;
}
const lv = (s: P1State, id: string, n: number) => setLevel(s, id, n);

describe('データ：9 本目の枝「発掘」', () => {
  it('BRANCHES に dig。パネルは Common 12 枚（段 DIG3 で貫通を足した）・Uncommon 外周 6 枚、すべて研究パネル（RP。2026-11-03：以前はお金パネル Lv1〜5。cost はもとの GUM の表）。開くと決まった段の効き目（調整 v25c：Lv2・深い層の許可・研究の目利き・発掘隊の役所は Lv5）', () => {
    expect(BRANCHES.at(-1)).toEqual({ key: 'dig', name: '発掘' });
    // 無限の強化パネル・研究への寄付（6 段目）は別（tests/island-p1-dig2f.test.ts）
    const ks = SKILLS.filter((k) => k.branch === 'dig' && !k.inf && !k.donate);
    expect(ks.map((k) => k.id)).toEqual(DIG_PANELS);
    expect(ks.filter((k) => !k.tier)).toHaveLength(12);
    expect(ks.filter((k) => k.tier === 'U')).toHaveLength(6);
    for (const k of ks) {
      expect(isResearch(k), k.id).toBe(true);
      expect(maxLv(k), k.id).toBe(1);
      expect(rpCost(k), k.id).toBeGreaterThan(0);
      const [lo, hi] = k.tier ? [20000, 80000] : [2000, 12000];
      expect(k.cost, k.id).toBeGreaterThanOrEqual(lo);
      expect(k.cost, k.id).toBeLessThanOrEqual(hi);
      for (const r of k.requires ?? []) expect(SKILL[r]?.branch, `${k.id} → ${r}`).toBe('dig');
      // 研究パネルはレベルが無いので「／Lv」の説明は書かない（決まった段の値で書く）
      expect(k.note, k.id).not.toContain('／Lv');
    }
    // 調整 v25c：Common の発掘のパネルの RP は決め打ちで安く（合計 550 → 260。段 DIG3 の貫通 30 で 290）。Uncommon は段の自動の値段（60〜180）
    expect(ks.filter((k) => !k.tier).map((k) => rpCost(k))).toEqual(ks.filter((k) => !k.tier).map((k) => DIG_BALANCE.tree.rp[k.id]));
    expect(ks.filter((k) => !k.tier).reduce((a, k) => a + rpCost(k), 0)).toBe(290);
    for (const k of ks.filter((x) => x.tier === 'U')) {
      expect(rpCost(k), k.id).toBeGreaterThanOrEqual(60);
      expect(rpCost(k), k.id).toBeLessThanOrEqual(180);
    }
    // 開くと決まった段の効き目で入る（ふつう Lv2。深い層の許可・研究の目利き・発掘隊の役所は Lv5）
    const s0 = met();
    expect(learn(s0, 'dig_ext')).toBeNull();
    expect(lvOf(s0, 'dig_ext')).toBe(DIG_BALANCE.tree.rpLv.lv);
    expect(DIG_BALANCE.tree.rpLv.lv).toBe(2);
    expect(levelLock(s0, SKILL.dig_ext)).toBe('max');
    expect(SKILL.dig_ext.note).toContain('15 → 21 秒');
    for (const id of ['dig_deep', 'dig_study', 'dig_office']) expect(digRpLv(SKILL[id]), id).toBe(5);
    // Uncommon の外周の最初の 2 枚にエンブレム（ほかの枝の外周と同じ開き方）
    expect([SKILL.u_dig_ext2.emblem, SKILL.u_dig_auto.emblem]).toEqual([1, 2]);
    // 先に要るパネルのレベル：手前も研究パネル（レベルなし）なので、持っていればよい（以前は 発掘隊の手際 Lv3・追加申請 Lv5・ツルハシ Lv5）
    expect(SKILL.u_dig_auto.reqLv).toBeUndefined();
    expect(SKILL.u_dig_ext2.reqLv).toBeUndefined();
    expect(SKILL.u_dig_power2.reqLv).toBeUndefined();
  });

  it('設備投資から発掘の道具（ツルハシの新調・ランタン・発破の道具）が消えた。既存のパネル・設備の値段はそのまま', () => {
    expect(INVESTS.map((x) => x.id)).not.toEqual(expect.arrayContaining(['pick']));
    expect(INVESTS.some((x) => ['pick', 'lantern', 'blast'].includes(x.id))).toBe(false);
    expect([SKILL.host.cost, SKILL.jig.cost, SKILL.hire.cost]).toEqual([4000, 4000, 3000]);
  });

  it('配置：どのパネルも置かれていて、パネルどうし 1.05 より離れ、根もととも重ならない。発掘の枝は R&D の部門の枝（段 B：システムの隣）', () => {
    expect(UNPLACED).toEqual([]);
    const ps = [...POS.entries()];
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) expect(Math.hypot(ps[i][1].x - ps[j][1].x, ps[i][1].y - ps[j][1].y), `${ps[i][0]}–${ps[j][0]}`).toBeGreaterThan(1.05);
    for (const [, p] of HUBPOS) for (const [id, q] of ps) expect(Math.hypot(p.x - q.x, p.y - q.y), id).toBeGreaterThan(0.9);
    // 発掘の枝のパネルはすべて R&D の枝（1 つの束）
    for (const id of DIG_PANELS) expect(groupOf(id)?.key, id).toBe('rnd');
    expect(DEPT_LAYOUT.rnd.groups).toHaveLength(1);
    // システムの隣（もとの「物流とシステムのあいだ」の流れ。段 ST1：上から下へ流れる形では、システムの列のすぐ右の列）
    expect(DEPT_LAYOUT.rnd.x0).toBeGreaterThan(DEPT_LAYOUT.systems.x1);
    expect(Object.values(DEPT_LAYOUT).filter((L) => L.x0 > DEPT_LAYOUT.systems.x1 && L.x1 < DEPT_LAYOUT.rnd.x0)).toHaveLength(0);
  });

  it('出会いの前は枝ごと雲の中：研究も開放もできない（hidden）。「上げられる」にも入らない。出会いのあとは取れる', () => {
    const s = met();
    delete s.flags.digMeet;
    expect(skillLock(s, SKILL.dig_ext)).toBe('hidden');
    expect(learn(s, 'dig_ext')).toBe('hidden');
    expect(affordableSkills(s).some((k) => SKILL[k.id].branch === 'dig')).toBe(false);
    s.flags.digMeet = 'done';
    expect(skillLock(s, SKILL.dig_ext)).toBeNull();
    expect(learn(s, 'dig_ext')).toBeNull();
    // 研究パネル：開くと決まった段（調整 v25c：Lv2）の効き目
    expect(lvOf(s, 'dig_ext')).toBe(2);
  });

  it('先に要るもの：常駐は発掘隊の手際を持っていれば（調整 v25c：手前も研究パネルでレベルが無いので、以前の「Lv3 から」は外した）', () => {
    const s = met();
    s.emblem = 9;
    s.flags.rings = ['U'];
    lv(s, 'dig_ext', 1);
    lv(s, 'dig_office', 1);
    expect(skillLock(s, SKILL.u_dig_auto)).toBe('requires');
    lv(s, 'dig_crew', 1);
    expect(skillLock(s, SKILL.u_dig_auto)).toBeNull();
    // 素材の選り分けは Uncommon の輪が開いていればよい
    expect(skillLock(s, SKILL.u_dig_mat)).toBeNull();
    s.flags.rings = [];
    expect(skillLock(s, SKILL.u_dig_mat)).toBe('ring');
  });

  it('監査（island:audit）では「対象外」：発掘（tests/island-p1-dig2b.test.ts で確認）', () => {
    for (const id of DIG_PANELS) expect(specOf(SKILL[id])?.out, id).toBe('発掘（tests/island-p1-dig2b.test.ts で確認）');
  });

  it('パネルの説明の Lv ごとの値（いまの効果 → 次のレベル）が既存の仕組みで出る', () => {
    const line = (id: string, n: number) => shownOf(SKILL[id]).base.map((x) => shownText(x, n));
    expect(line('dig_ext', 1)).toEqual(['+3 秒']);
    expect(line('dig_ext', 5)).toEqual(['+15 秒']);
    expect(line('dig_speed', 1)).toEqual(['150 ms']);
    expect(line('dig_speed', 5)).toEqual(['90 ms']);
    expect(line('dig_power', 2)).toEqual(['+1', '+10%']);
    expect(line('dig_deep', 1)[0]).toBe('岩盤まで');
    expect(line('dig_deep', 3)[1]).toBe('大地のつなぎ目まで');
    expect(line('dig_study', 2)[0]).toBe('Lv5');
    expect(line('dig_blast', 4)).toEqual(['5 個', '2 枚', '4 × 4']);
    expect(line('u_dig_relay', 2)).toEqual(['+30%']);
  });
});

describe('作業時間・威力・速さ', () => {
  it('発掘の追加申請：1 回の発掘作業 15 → 18・21・24・27・30 秒。長期の発掘許可でさらに +6 秒／Lv（最大 60）', () => {
    const s = met();
    expect(sessionSec(s)).toBe(15);
    const got = [1, 2, 3, 4, 5].map((n) => (lv(s, 'dig_ext', n), sessionSec(s)));
    expect(got).toEqual([18, 21, 24, 27, 30]);
    const more = [1, 2, 3, 4, 5].map((n) => (lv(s, 'u_dig_ext2', n), sessionSec(s)));
    expect(more).toEqual([36, 42, 48, 54, 60]);
    run(s, 0);
    expect(s.digRun!.total).toBe(60000);
  });

  it('ツルハシの鍛え直し：1 打の強さ 2・2・3・3・4、会心（2 倍）は Lv2・4 で 10%・20%。重機の貸し出しでさらに +1・+1・+2・+2・+3', () => {
    const s = met();
    expect(digPower(s)).toBe(1);
    const p = [1, 2, 3, 4, 5].map((n) => (lv(s, 'dig_power', n), [digPower(s), fxSum(s, 'dig.crit')]));
    expect(p).toEqual([
      [2, 0],
      [2, 0.1],
      [3, 0.1],
      [3, 0.2],
      [4, 0.2],
    ]);
    const q = [1, 2, 3, 4, 5].map((n) => (lv(s, 'u_dig_power2', n), digPower(s)));
    expect(q).toEqual([5, 5, 6, 6, 7]);
  });

  it('会心は打った数から決まる（同じ打ち方なら同じ）。Lv2 でおよそ 10%、会心の 1 打は 2 倍の強さ', () => {
    const s = met();
    lv(s, 'dig_deep', 1);
    lv(s, 'dig_power', 2);
    run(s, 0);
    let crit = 0;
    let n = 0;
    for (let k = 0; k < 600; k++) {
      const at = digNext(s);
      if (!at) break;
      const before = hpOf(s)[at[1] * 7 + at[0]];
      const r = dig(s, at[0], at[1]);
      if (typeof r === 'string') break;
      n++;
      if (r.crit) {
        crit++;
        // 会心の 1 打は強さ 4（2 × 2）：Common の壁（硬さ 3 まで）はかならず 1 枚はがれる
        expect(r.broke).toBe(true);
      } else expect(r.broke ? 0 : before - r.left).toBe(r.broke ? 0 : Math.min(before, 2));
    }
    expect(n).toBeGreaterThan(80);
    expect(crit / n).toBeGreaterThan(0.04);
    expect(crit / n).toBeLessThan(0.2);
  });

  it('手早い掘り方：長押しの間隔 170 → 150・130・115・100・90 ms', () => {
    const s = met();
    expect(digRepeatMs(s)).toBe(170);
    expect([1, 2, 3, 4, 5].map((n) => (lv(s, 'dig_speed', n), digRepeatMs(s)))).toEqual([150, 130, 115, 100, 90]);
  });

  it('広く掘る：打ったマスの隣の いまの層 にも力の一部（Lv1 左右 25%・Lv3 左右と下 45%・Lv5 上下左右 60%）。はがれたら中身も出る', () => {
    const s = met();
    lv(s, 'dig_deep', 1);
    run(s, 0);
    const hard0 = (x: number, y: number) => digLayout('c1', 0)!.cells[y * 7 + x].hard[0];
    lv(s, 'dig_reach', 1);
    const r = dig(s, 3, 0);
    if (typeof r === 'string') throw new Error(r);
    expect(r.extra?.map((h) => [h.x, h.y])).toEqual([
      [2, 0],
      [4, 0],
    ]);
    expect(hpOf(s)[2]).toBeCloseTo(Math.max(0, hard0(2, 0) - 0.25), 5);
    // Lv3：左右と下
    lv(s, 'dig_reach', 3);
    const r3 = dig(s, 0, 4);
    if (typeof r3 === 'string') throw new Error(r3);
    expect(r3.extra?.map((h) => [h.x, h.y]).sort()).toEqual([
      [0, 5],
      [1, 4],
    ]);
    // Lv5：上下左右に 60%（打ったマスの強さ 1 × 0.6）
    lv(s, 'dig_reach', 5);
    expect(fxSum(s, 'dig.reach')).toBe(0.6);
    const hp0 = hpOf(s)[6 * 7 + 6];
    dig(s, 6, 5);
    expect(hpOf(s)[6 * 7 + 6]).toBeLessThan(hp0);
    // 隣の力ではがれたマスからも中身が出る：1 打の強さ 4（ツルハシ Lv5）× 25% ＝ 硬さ 1 の隣のマスがはがれる
    const t = met(3);
    lv(t, 'dig_deep', 1);
    lv(t, 'dig_power', 5);
    lv(t, 'dig_reach', 1);
    run(t, 0);
    const L = digLayout('c1', 0)!;
    const f = L.finds.find((g) => g.layer === 0 && g.item.kind === 'ext' && !g.item.topic && g.x < 6)!;
    expect(L.cells[f.y * 7 + f.x].hard[0]).toBe(1);
    const r2 = dig(t, f.x + 1, f.y);
    if (typeof r2 === 'string') throw new Error(r2);
    const got = r2.extra?.find((h) => h.x === f.x && h.y === f.y);
    expect(got).toMatchObject({ broke: true, splash: true });
    expect(got?.item).toEqual(f.item);
    expect(got!.first).toBe(true);
  });
});

describe('見える深さ・掘れる層・研究', () => {
  it('発掘のランタン：ひびの隙間から見え始める深さ ふだん いまの層だけ → Lv1・2・3 で 1・2・3 枚手前（Lv4・5 の遠くの気配はダンジョンの深さ用）', () => {
    const s = met();
    lv(s, 'dig_deep', 1);
    run(s, 0);
    expect(peekAhead(s)).toBe(0);
    expect([1, 2, 3, 4, 5].map((n) => (lv(s, 'dig_lamp', n), peekAhead(s)))).toEqual([1, 2, 3, 3, 3]);
    // 層 2 に埋まっていて、手前の層には何も無いマス：ふだんは見えない（2 枚手前）。Lv2 で見える
    const L = digLayout('c1', 0)!;
    const only = (layer: number, Lk = L) => Lk.finds.find((g) => g.layer === layer && !Lk.finds.some((h) => h.x === g.x && h.y === g.y && h.layer < layer))!;
    const f = only(2);
    const s0 = met();
    lv(s0, 'dig_deep', 1);
    run(s0, 0);
    expect(peek(s0, f.x, f.y)).toBeNull();
    lv(s, 'dig_lamp', 1);
    expect(peek(s, f.x, f.y)).toBeNull();
    lv(s, 'dig_lamp', 2);
    expect(peek(s, f.x, f.y)).toEqual(f.item);
    expect(peekView(s, f.x, f.y)).toMatchObject({ ahead: 2, frac: 0.15 });
    // Uncommon（4 層）：層 3 のものは Lv3（3 枚手前）から
    const u = met(1, 'u1', 'U');
    lv(u, 'dig_deep', 3);
    run(u, 0);
    const Lu = digLayout('u1', 0)!;
    const g = only(3, Lu);
    lv(u, 'dig_lamp', 2);
    expect(peek(u, g.x, g.y)).toBeNull();
    lv(u, 'dig_lamp', 3);
    expect(peek(u, g.x, g.y)).toEqual(g.item);
  });

  it('深い層の許可：はじめは 2 層目まで（岩盤は「深い層の許可が要る」）。Common は Lv1 で岩盤、Uncommon は Lv2 で 3 層目・Lv3 で 4 層目', () => {
    const s = met();
    expect(deepLayers(s, 'C')).toBe(2);
    run(s, 0);
    // 2 枚はがすと、3 層目（岩盤）は叩けない
    digTo(s, 0, 0, 1);
    expect(depthOf(s)[0]).toBe(2);
    expect(digCheck(s, 0, 0)).toBe('deep');
    expect(dig(s, 0, 0)).toBe('deep');
    expect(cellView(s, 0, 0).state).toBe('locked');
    expect(lockedLayer(s)).toBe(2);
    expect(digSpec(s)).toEqual({ sec: 15, power: 1, deep: '粘土層', cap: 3 });
    lv(s, 'dig_deep', 1);
    expect(deepLayers(s, 'C')).toBe(3);
    expect(digCheck(s, 0, 0)).toBeNull();
    expect(lockedLayer(s)).toBeNull();
    expect(digSpec(s)!.deep).toBe('岩盤');
    const u = met(1, 'u1', 'U');
    expect(deepLayers(u, 'U')).toBe(2);
    expect([1, 2, 3, 4, 5].map((n) => (lv(u, 'dig_deep', n), deepLayers(u, 'U')))).toEqual([2, 3, 4, 4, 4]);
  });

  it('いまの許可で掘れるマスが無くなった荒れ地は、作業を始められない（deep）。深い層の許可で掘れるようになる。掘りきり（done）は全部の層', () => {
    const s = met();
    clearOpen(s, 0);
    endRun(s);
    expect(s.dig!.sites[0].done).toBe(false);
    expect(runLock(s, 0)).toBe('deep');
    lv(s, 'dig_deep', 1);
    expect(runLock(s, 0)).toBeNull();
    clearOpen(s, 0);
    expect(s.dig!.sites[0].done).toBe(true);
  });

  it('研究の目利き：研究 Lv の上限 3 → 4・5。上限のあいだも数は貯め、上限が上がった瞬間に Lv と RP が入る', () => {
    const s = met();
    const id = 1011;
    s.research[id] = 10;
    expect(researchCap(s)).toBe(3);
    expect(researchOf(s, id)).toBe(3);
    expect(researchLeft(s, id)).toBe(0);
    const e = noteEntries(s, 'c1').find((x) => x.id === id)!;
    expect(nextLvText(e)).toBe('上限（研究の目利きで上がる）');
    // 上限のあいだに掘ったぶんも数える（11 個 → 生の Lv5）
    lv(s, 'dig_deep', 1);
    run(s, 0);
    const L = digLayout('c1', 0)!;
    const f = L.finds.find((g) => g.item.kind === 'ext' && !g.item.topic && g.item.id === id);
    if (f) {
      const h = digTo(s, f.x, f.y, f.layer);
      expect(h.lv).toBeUndefined();
      expect(s.research[id]).toBeGreaterThanOrEqual(11);
    } else s.research[id] = 11;
    endRun(s);
    const rp0 = s.rp;
    lv(s, 'dig_ext', 1);
    lv(s, 'dig_lamp', 1);
    expect(learn(s, 'dig_study')).toBeNull();
    // 発掘のパネルは研究パネル（開くと最大レベル）：上限は一気に Lv5 まで上がり、止まっていた Lv と RP がまとめて入る（RP の払いはパネルの値段のぶん減る）
    expect(researchCap(s)).toBe(5);
    expect(researchOf(s, id)).toBe(5);
    expect(s.rp - rp0 + rpCost(SKILL.dig_study)).toBeGreaterThanOrEqual(RP_GAIN.C.lv[2] + RP_GAIN.C.lv[3]);
    expect(levelUp(s, 'dig_study')).not.toBeNull();
    // お題は上限に掛からない（その場で Lv5）
    const t = met();
    const topic = DIG_SITES.c1.topics[0];
    t.research[topic] = RESEARCH_NEED[4];
    expect(researchOf(t, topic)).toBe(5);
  });

  it('研究の目利き Lv3〜5：深い層ほど研究が進みやすい（層 n で 1 + 0.25 × (n − 1) × 倍率 1・1.5・2 個ぶん。端数は持ち越し）', () => {
    const want = { 3: 1, 4: 1.5, 5: 2 } as const;
    for (const [n, m] of Object.entries(want)) {
      const s = met();
      lv(s, 'dig_deep', 1);
      lv(s, 'dig_study', Number(n));
      run(s, 0);
      // 岩盤（3 層目）のエクステを 1 つ掘る：1 + 0.25 × 2 × m 個ぶん
      const L = digLayout('c1', 0)!;
      const f = L.finds.find((g) => g.layer === 2 && g.item.kind === 'ext' && !g.item.topic)!;
      const id = (f.item as { id: number }).id;
      digTo(s, f.x, f.y, 1);
      const n0 = s.research[id] ?? 0;
      const c0 = s.resCarry?.[id] ?? 0;
      breakCell(s, f.x, f.y);
      const add = 1 + 0.25 * 2 * m + c0;
      expect((s.research[id] ?? 0) - n0, `Lv${n}`).toBe(Math.floor(add + 1e-9));
      expect(s.resCarry![id], `Lv${n}`).toBeCloseTo(add - Math.floor(add + 1e-9), 6);
    }
  });
});

describe('発破・ドリル', () => {
  it('発破（段 DIG3：地中の爆弾）：埋まっている数 2・3・4・5・6（Lv0 は 1）・威力 1・1・2・2・3 枚・範囲 3・3・3・4・5。費用なし。深い層の許可の無い層ははがさない', () => {
    const want: [number, number, number][] = [
      [2, 1, 3],
      [3, 1, 3],
      [4, 2, 3],
      [5, 2, 4],
      [6, 3, 5],
    ];
    expect([bombCount(met()), bombPower(met()), blastSize(met())]).toEqual([1, 1, 3]);
    for (let n = 1; n <= 5; n++) {
      const s = met();
      lv(s, 'dig_power', 1);
      lv(s, 'dig_deep', 3);
      lv(s, 'dig_blast', n);
      expect([bombCount(s), bombPower(s), blastSize(s)], `Lv${n}`).toEqual(want[n - 1]);
      // 調整 v44：荒れ地の格のぶん（タオックスは Common）を足す
      expect(bombsLeft(s, 0)).toHaveLength(want[n - 1][0] + T.bombTier.C);
      run(s, 0);
      // （連鎖しないように、ほかの爆弾は爆発済みにしておく）
      s.dig!.sites[0].boom = Array.from({ length: 12 }, (_, i) => i);
      // (3, 3) の 2 枚目（粘土層）まで掘っておく：そのマスは 1 枚奥、まわりは手前の 1 枚
      breakCell(s, 3, 3);
      const m0 = s.money;
      const r = detonate(s, 3, 3)!.extra ?? [];
      const [, P, N] = want[n - 1];
      // 1 枚目の爆発は N × N 全部。威力ぶんの枚数（岩盤までの 3 層に収まる範囲）
      expect(r.filter((h) => !h.pierce && h.layer === (h.x === 3 && h.y === 3 ? 1 : 0)).length, `Lv${n}`).toBe(N * N);
      expect(r.every((h) => h.broke && h.blast)).toBe(true);
      const center = r.filter((h) => h.x === 3 && h.y === 3);
      expect(center.length, `Lv${n}`).toBe(Math.min(P, 2));
      expect(r.filter((h) => h.x === 2 && h.y === 2).length, `Lv${n}`).toBe(Math.min(P, 3));
      expect(m0 - s.money).toBe(0);
    }
    // 2 層目まで（岩盤に許可が無い）のときは、岩盤の層ははがさない（真ん中が岩盤でも、まわりは はがれる）
    const s = met();
    lv(s, 'dig_power', 1);
    lv(s, 'dig_blast', 5);
    run(s, 0);
    digTo(s, 3, 3, 1);
    expect(digCheck(s, 3, 3)).toBe('deep');
    const r = detonate(s, 3, 3)!.extra ?? [];
    void bombsLeft;
    expect(r.some((h) => h.x === 3 && h.y === 3)).toBe(false);
    expect(r.every((h) => h.layer < 2)).toBe(true);
    expect(r.filter((h) => h.layer === 0)).toHaveLength(24);
  });

  it('掘削ドリル：押したマス 1 つを奥へ 3・4・5・6・7 層。燃料代 1,000 G。無ければ no-drill。許可の無い層で止まる', () => {
    for (let n = 1; n <= 5; n++) {
      const u = met(1, 'u1', 'U');
      lv(u, 'dig_deep', 3);
      run(u, 0);
      expect(drill(u, 2, 0)).toBe('no-drill');
      lv(u, 'dig_drill', n);
      const m0 = u.money;
      const r = drill(u, 2, 0);
      if (typeof r === 'string') throw new Error(r);
      // Uncommon の壁は 4 層：Lv1 は 3 層、Lv2 から 4 層（いちばん奥まで）
      const want = Math.min(4, T.drill[n - 1]);
      expect(r.map((h) => [h.x, h.y, h.layer]), `Lv${n}`).toEqual(Array.from({ length: want }, (_, k) => [2, 0, k]));
      expect(depthOf(u)[2]).toBe(want);
      expect(m0 - u.money).toBe(T.drillFuel);
    }
    // 2 層目まで（深い層の許可が無い）：2 層で止まる
    const s = met();
    lv(s, 'dig_drill', 5);
    run(s, 0);
    const r = drill(s, 1, 0);
    if (typeof r === 'string') throw new Error(r);
    expect(r).toHaveLength(2);
    expect(digCheck(s, 1, 0)).toBe('deep');
    s.money = 0;
    expect(drill(s, 4, 0)).toBe('money');
  });
});

describe('発掘隊：役所・手際・常駐（自動化）・段取り・交代制・素材（段 DIG3：隊員はシャドーヒーロー）', () => {
  /** 発掘隊 n 人（発掘隊の手際の Lv ＝ 人数。役所は上限 5） */
  const crew = (s: P1State, n: number) => {
    lv(s, 'dig_office', 5);
    lv(s, 'dig_crew', n);
  };
  /** 1 日ぶんの発掘隊の打った数（隣への力・貫通・爆発を除く） */
  const own = (hs: DigHit[]) => hs.filter((h) => !h.splash && !h.pierce && !h.blast);

  it('発掘隊の役所：人数の上限 1 → 2・3・3・4・5。隊員の数は発掘隊の手際の Lv（上限まで）。ヒーローは発掘の担当にできない（no-task）', () => {
    const s = met();
    expect(crewCap(s)).toBe(1);
    expect(crewSize(s)).toBe(0);
    expect([1, 2, 3, 4, 5].map((n) => (lv(s, 'dig_office', n), crewCap(s)))).toEqual([2, 3, 3, 4, 5]);
    lv(s, 'dig_office', 1);
    lv(s, 'dig_crew', 5);
    expect(crewSize(s)).toBe(2);
    lv(s, 'dig_office', 5);
    expect(crewSize(s)).toBe(5);
    expect(assign(s, 10001, 'dig')).toBe('no-task');
    expect(s.staff.some((x) => x.task === 'dig')).toBe(false);
  });

  it('発掘隊の手際：隊員の数 ＝ Lv・1 打の強さ ×(1 ＋ 20%／Lv)・作業中は 1 人 1 日 tree.crewDay 打（段 DIG3）', () => {
    const per = (n: number) => {
      const s = met();
      lv(s, 'dig_deep', 1);
      lv(s, 'dig_ext', 1);
      if (n) crew(s, n);
      run(s, 0);
      let hits = 0;
      for (let d = 0; d < 10; d++) hits += own(crewDig(s)).length;
      return { hits, power: digPower(s) * crewMul(s) };
    };
    expect(per(0).hits).toBe(0);
    for (const n of [1, 3, 5]) {
      const r = per(n);
      expect(r.hits, `Lv${n}`).toBe(Math.floor(n * T.crewDay * 10 + 1e-9));
      expect(r.power, `Lv${n}`).toBeCloseTo(1 + 0.2 * n, 6);
    }
    // 打った結果に隊員の番号（crew）が付く
    const s = met();
    lv(s, 'dig_deep', 1);
    crew(s, 2);
    run(s, 0);
    const hs = own(Array.from({ length: 8 }, () => crewDig(s)).flat());
    expect(hs.length).toBeGreaterThanOrEqual(2);
    // 隊員が順に打つ（0・1・0・1…）
    expect(hs.map((h) => h.crew)).toEqual(hs.map((_, i) => i % 2));
  });

  it('常駐：無ければ作業していない日は掘らない。あれば許可のある荒れ地を作業中の 20%・40%・55%・70%・80% の速さで掘る（隊員にスタミナは無い）', () => {
    const dayHits = (n: number) => {
      const s = met();
      s.emblem = 9;
      s.flags.rings = ['U'];
      lv(s, 'dig_deep', 1);
      crew(s, 1);
      s.dig!.sites[0].permit = true;
      if (n) lv(s, 'u_dig_auto', n);
      let hits = 0;
      for (let d = 0; d < 120; d++) hits += own(step(s).dug ?? []).length;
      return { hits, s };
    };
    expect(dayHits(0).hits).toBe(0);
    for (let n = 1; n <= 5; n++) {
      const r = dayHits(n);
      // 1 人 × crewDay 打 × 常駐の割合 × 120 日
      expect(r.hits / (T.crewDay * 120), `Lv${n}`).toBeCloseTo(T.auto[n - 1], 1);
      // 荒れ地の吹き出し・地図の作業員の元：常駐中 1 日 N 打
      expect(standing(r.s)?.site).toBe(0);
    }
  });

  it('常駐の段取り：常駐の速さ +10%／Lv。Lv1 はお題の気配のある所へ向かって掘る', () => {
    const s = met();
    s.emblem = 9;
    s.flags.rings = ['U'];
    lv(s, 'dig_deep', 1);
    crew(s, 1);
    lv(s, 'u_dig_auto', 1);
    const k = digLayouts('c1').findIndex((L) => L.topic != null);
    s.dig!.sites[k].permit = true;
    s.dig!.cur = k;
    const L = digLayout('c1', k)!;
    const tf = L.finds.find((g) => g.item.kind === 'ext' && !!g.item.topic)!;
    const plain = digNext(s, true)!;
    expect(plain).toEqual([0, 0]);
    lv(s, 'u_dig_route', 1);
    // お題の範囲のマスを、お題の層まで先に
    expect(digNext(s, true)).toEqual([tf.x, tf.y]);
    expect(standSite(s)).toBe(k);
    // 速さ：常駐の割合 ×（1 ＋ 10%／Lv）
    expect([1, 2, 3, 4, 5].map((n) => (lv(s, 'u_dig_route', n), autoRate(s)))).toEqual([1, 2, 3, 4, 5].map((n) => T.auto[0] * (1 + T.autoSpeed[n - 1])));
    expect(standing(s)?.perDay).toBeGreaterThan(0);
  });

  it('常駐の段取り Lv3：いまの層に研究 Lv の低いエクステがあるマスを先に・Lv5：研究 Lv の上限に達したエクステは避ける', () => {
    const s = met();
    lv(s, 'dig_deep', 1);
    const L = digLayout('c1', 3)!;
    s.dig!.sites[3].permit = true;
    s.dig!.cur = 3;
    // （お題は見つけ済みにしておく：Lv1 の「お題の気配へ向かう」は別のテスト）
    if (L.topic != null) s.dig!.topics.push(L.topic);
    // 手前の層（0）のエクステのマス（左上から）
    const exts = L.finds.filter((g) => g.layer === 0 && g.item.kind === 'ext' && !g.item.topic).map((g) => g.y * 7 + g.x).sort((a, b) => a - b);
    expect(exts.length).toBeGreaterThanOrEqual(3);
    const idAt = (k: number) => (L.finds.find((g) => g.layer === 0 && g.y * 7 + g.x === k)!.item as { id: number }).id;
    const xy = (k: number) => [k % 7, Math.floor(k / 7)];
    // 段取りが無ければ、浅いマス → 左上から
    expect(digNext(s, true)).toEqual([0, 0]);
    lv(s, 'u_dig_route', 3);
    expect(digNext(s, true)).toEqual(xy(exts[0]));
    // ひとつのエクステだけ研究 Lv が低い（ほかは上限まで）→ そこを先に
    const low = idAt(exts[exts.length - 1]);
    for (const k of exts) if (idAt(k) !== low) s.research[idAt(k)] = 11;
    expect(digNext(s, true)).toEqual(xy(exts.find((k) => idAt(k) === low)!));
    // Lv5：全部上限なら、エクステのマスを避ける
    s.research[low] = 11;
    lv(s, 'u_dig_route', 5);
    const pick = digNext(s, true)!;
    expect(exts.includes(pick[1] * 7 + pick[0])).toBe(false);
    // 作業中（手伝い）は段取りに関係なく、いつもの選び方
    expect(digNext(s, false)).toEqual([0, 0]);
  });

  it('常駐の交代制（段 DIG3：隊員にスタミナは無いので、常駐で働く日の打つ数 +15%／Lv に）', () => {
    const s = met();
    s.emblem = 9;
    s.flags.rings = ['U'];
    lv(s, 'u_dig_auto', 1);
    const base = autoRate(s);
    const got = [1, 2, 3, 4, 5].map((n) => (lv(s, 'u_dig_relay', n), autoRate(s) / base));
    got.forEach((v, i) => expect(v).toBeCloseTo(1 + 0.15 * (i + 1), 6));
  });

  it('素材の選り分け：掘り出した素材 +20%／Lv（端数は持ち越し）', () => {
    for (const n of [0, 1, 3, 5]) {
      const s = met();
      lv(s, 'dig_deep', 1);
      if (n) lv(s, 'u_dig_mat', n);
      let got = 0;
      let base = 0;
      for (let k = 0; k < 4; k++) {
        for (const h of clearOpen(s, k)) {
          if (h.item?.kind !== 'mat') continue;
          base += h.item.n;
          got += h.mat ?? 0;
        }
        endRun(s);
      }
      expect(base).toBeGreaterThan(20);
      expect(got / base, `Lv${n}`).toBeCloseTo(1 + 0.2 * n, 1);
    }
  });
});

describe('画面のための数字', () => {
  it('発掘終了の札の「次の強化のおすすめ」：いちばん安い発掘のパネルの次の Lv（「発掘の追加申請 Lv2（4,000 G）で 21 秒に」）', () => {
    const s = met();
    // 発掘のパネルは研究パネル（RP）：値段は RP・開くと決まった段の効き目（調整 v25c：Lv2。発掘の追加申請は 21 秒）
    // 段 UI5b：つながりの見直しで、ツルハシの鍛え直し（10 RP）は発掘の追加申請の先（線が交わらないように）。
    // はじめに取れるのは発掘の追加申請（15 RP）で「21 秒に」→ そのあといちばん安いツルハシの鍛え直し
    expect(SKILL.dig_power.requires).toEqual(['dig_ext']);
    expect(digRec(s)).toMatchObject({ id: 'dig_ext', lv: 2, cost: rpCost(SKILL.dig_ext), text: `発掘の追加申請（${rpCost(SKILL.dig_ext)} RP）で 21 秒に` });
    learn(s, 'dig_ext');
    expect(digRec(s)).toMatchObject({ id: 'dig_power', lv: 2, cost: rpCost(SKILL.dig_power) });
    expect(digRec(s)!.text).toContain(`ツルハシの鍛え直し（${rpCost(SKILL.dig_power)} RP）`);
    learn(s, 'dig_power');
    // 取ったものは出ない。次にいちばん安いもの
    expect(digRec(s)?.id).not.toBe('dig_power');
    // 深い層の許可が要るマスを押した作業のあとは、深い層の許可を先に（手前の発掘の追加申請・発掘のランタンから）
    expect(digRec(s, 'dig_deep')?.id).toBe('dig_lamp');
    learn(s, 'dig_lamp');
    expect(digRec(s, 'dig_deep')?.text).toContain('深い層の許可');
    // 出会いの前は出さない
    delete s.flags.digMeet;
    expect(digRec(s)).toBeNull();
  });

  it('マインちゃん：発掘の枝が雲から出たあと 1 回だけ（low）。発掘のパネルを 1 枚でも開けたら出さない', () => {
    const s = met();
    s.dig!.last = s.day;
    s.dig!.sites.forEach((x) => (x.permit = true));
    expect(digTips(s).some((x) => x.key === 'branch')).toBe(false);
    s.flags.digBranch = 'new';
    const tip = digTips(s).find((x) => x.key === 'branch')!;
    expect(tip).toMatchObject({ tier: 'low', text: BRANCH_TIP() });
    expect(tip.text).toContain('[[追加申請]]');
    lv(s, 'dig_ext', 1);
    expect(digTips(s).some((x) => x.key === 'branch')).toBe(false);
  });

  it('助言「N 秒だけ掘ってみよう」の秒数は作業時間に合わせる', () => {
    const s = met();
    s.dig!.sites[0].permit = true;
    s.day = 100;
    s.dig!.last = 0;
    lv(s, 'dig_ext', 2);
    expect(digTips(s).find((x) => x.key === 'idle')?.text).toContain('21 秒だけ掘ってみよう');
  });
});

describe('調整 v25c：発掘の枝の研究パネルの段', () => {
  it('v25b のセーブ（開くと Lv5）は、読み込むと決まった段にそろう（ふつう Lv2・深い層の許可・研究の目利き・発掘隊の役所は Lv5）', () => {
    const s = met();
    s.rp = 1e4;
    for (const id of ['dig_ext', 'dig_lamp', 'dig_deep', 'dig_study']) expect(learn(s, id), id).toBeNull();
    const o = JSON.parse(serializeP1(s));
    o.skillLv = { ...o.skillLv, dig_ext: 5, dig_lamp: 5, dig_deep: 5, dig_study: 5 };
    const back = deserializeP1(JSON.stringify(o))!;
    expect(['dig_ext', 'dig_lamp', 'dig_deep', 'dig_study'].map((id) => lvOf(back, id))).toEqual([2, 2, 5, 5]);
    expect(sessionSec(back)).toBe(DIG_BALANCE.sessionSec + DIG_BALANCE.tree.ext[1]);
  });
});

describe('セーブ：版 3 → 4', () => {
  /** 版 3 のセーブ（工房に発掘の道具） */
  const v3 = (inv: Record<string, number>, edit?: (o: Record<string, unknown>) => void) => {
    const s = met(4);
    const o = JSON.parse(serializeP1(s));
    o.v = 3;
    o.skills = o.skills.filter((id: string) => !id.startsWith('dig_') && !id.startsWith('u_dig_'));
    delete o.resCapPaid;
    const ws = o.buildings.find((b: { id: string; owner: string }) => b.owner === 'me' && b.id === 'workshop');
    ws.inv = { ...(ws.inv ?? {}), ...inv };
    edit?.(o);
    return deserializeP1(JSON.stringify(o))!;
  };

  it('ツルハシの新調 1 段 → ツルハシの鍛え直し Lv1、2 段 → Lv3／ランタン → 発掘のランタン Lv1／発破の道具 → 発破 Lv1（払ったお金は戻さない）。設備投資からは外す', () => {
    const a = v3({ pick: 1 });
    expect(a.v).toBe(28);
    expect(lvOf(a, 'dig_power')).toBe(1);
    expect(digPower(a)).toBe(2);
    const b = v3({ pick: 2, lantern: 1, blast: 1, tools: 2 });
    expect([lvOf(b, 'dig_power'), lvOf(b, 'dig_lamp'), lvOf(b, 'dig_blast')]).toEqual([3, 1, 1]);
    expect(digPower(b)).toBe(3);
    const ws = b.buildings.find((x) => x.owner === 'me' && x.id === 'workshop')!;
    expect(ws.inv).toEqual({ tools: 2 });
    // 資金は変わらない
    const plain = v3({});
    expect(b.money).toBe(plain.money);
    expect(lvOf(plain, 'dig_power')).toBe(0);
  });

  it('ほかのセクタの写しの工房の道具も渡す（いちばん進んだ段）', () => {
    const s = v3({}, (o) => {
      o.land = { cur: 'c1', mine: ['c1', 'c2'], recs: { c2: { id: 'c2', invest: 0, capital: 0, log: [], snap: { buildings: [{ uid: 99, id: 'workshop', owner: 'me', i: 1, j: 1, left: 0, inv: { pick: 2, lantern: 1 } }] } } } };
    });
    expect([lvOf(s, 'dig_power'), lvOf(s, 'dig_lamp')]).toEqual([3, 1]);
    const snapWs = ((s.land!.recs.c2.snap as { buildings: { inv: Record<string, number> }[] }).buildings[0]).inv;
    expect(snapWs).toEqual({});
  });

  it('研究 Lv・掘れる層は下がらない：版 3 で研究 Lv5 にしていたエクステは Lv5 のまま、岩盤まで掘っていた荒れ地は岩盤まで掘れる', () => {
    const s = v3({}, (o) => {
      (o.research as Record<number, number>)[1011] = 11;
      // 版 3 の断面（横 7 × 縦 20・上から掘る形。岩盤は 14 行目から）で、岩盤のマスを崩していた
      const d = o.dig as { sites: { hp: number[]; depth?: number[] }[] };
      d.sites = d.sites.map((x) => ({ ...x, depth: undefined, hp: new Array(140).fill(1) }));
      d.sites[0].hp[14 * 7] = 0;
    });
    expect(researchOf(s, 1011)).toBe(5);
    expect(researchCap(s)).toBe(5);
    expect(deepLayers(s, 'C')).toBe(3);
    // 新しいゲームは上限 3・2 層目まで
    const n = met();
    expect([researchCap(n), deepLayers(n, 'C')]).toEqual([3, 2]);
    // 版 4 を読み直しても変わらない
    const back = deserializeP1(serializeP1(s))!;
    expect([back.v, researchCap(back), deepLayers(back, 'C'), lvOf(back, 'dig_power')]).toEqual([28, 5, 3, 0]);
  });
});
