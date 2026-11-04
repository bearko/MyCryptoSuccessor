/**
 * 段 H1：Epic の町 ①（docs/ISLAND_PHASE1.md「Epic の町 ①」）：
 * Epic の調査依頼状は Rare の 2 つの町で発表したとき・依頼状が無いと Epic に出店できない・Epic への初進出で 3 回目の災害
 * （Common・Uncommon・Rare の全セクタが廃墟・支度金・第 3 回・保存済みの店の名前でサイン）・Epic の荒れ地と出土品（Epic のエクステ）・
 * お題と発表の条件・Epic の復刻品（Epic 進出後に研究 Lv3 で開く・Rare より高い）・骨董の需要（ダンジョンの Rare 以上は Rare の町では売れず、
 * Epic の町で売れる）・Epic の町の商圏の取り合い・ブランド力の上限と企業の格・古いセーブ（版 17）。
 */
import { describe, expect, it } from 'vitest';
import {
  ANTIQUE,
  BRAND_CAP,
  DEPT,
  DIG,
  DIG_BALANCE,
  DIG_SITES,
  DUNGEON_FINDS,
  EPIC_AREA,
  EPIC_RIVAL,
  GRADE,
  MARKET_SERIES,
  RARE_AREA,
  RELICS,
  RESEARCH_NEED,
  RESET,
  RP_GAIN,
  SECTORS,
  SECTOR_CHIEF,
  TABLETS,
  TAX,
  TIERS,
  fundsOf,
  grantOf,
  isAntique,
  relicOf,
  relicSells,
  rivalsOf,
  seriesOf,
  skuPrice,
  DIG_THEME,
} from '../src/island/p1/data';
import { RUIN, brandAdd, brandCap, sectorDef, sectorState } from '../src/island/p1/company';
import { letterLock, letterLockOf, letterLocked, moveTo, recOf } from '../src/island/p1/land';
import { lettersLeft, letterToGet, presentAfter, presentPages, topicsPage } from '../src/island/p1/digmeet';
import { relicLine, seriesTag, RARE_RELIC_NOTE } from '../src/island/p1/digview';
import { antiquesHeld, pendingReset, rankUpTier, reviveView } from '../src/island/p1/reset';
import { deptOpen, menuDepts } from '../src/island/p1/dept';
import { gradeOf } from '../src/island/p1/mkt';
import { acctOf } from '../src/island/p1/acct';
import {
  allowedDirs,
  antiqueHere,
  areaShares,
  build,
  capture,
  craftCheck,
  deserializeP1,
  digLayouts,
  epicRelicsOpen,
  extRank,
  findSize,
  letterProgress,
  newP1,
  newStorePull,
  openGate,
  openRelic,
  present,
  presentLock,
  priceOf,
  relicMinCraft,
  relicSku,
  ringsDue,
  rivalBase0,
  rivalStores,
  serializeP1,
  setShelf,
  staffOf,
  step,
  syncRelics,
  unsellableHere,
  type P1State,
  type PBuilding,
} from '../src/island/p1/model';
import { runOnce } from '../scripts/island/sim';

function lot(s: P1State, id: string, skip = 0): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] {
  let n = 0;
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const d = allowedDirs(s, id, i, j);
      if (d.length && n++ >= skip) return [i, j, d[0]];
    }
  throw new Error('no lot');
}
function put(s: P1State, id: string, skip = 0): PBuilding {
  const b = build(s, id, ...lot(s, id, skip));
  if (typeof b === 'string') throw new Error(b);
  b.left = 1;
  step(s);
  return b;
}
/** 発掘場のある町（お題をそろえた・この町で出土品を掘った） */
function townAt(sector: string, tier: 'R' | 'E', presented: string[] = []): P1State {
  const s = newP1(5, tier, sector);
  s.money = 1e8;
  s.tut = 99;
  s.flags.digMeet = 'done';
  s.presented = [...presented];
  s.letters = ['U', 'R'];
  s.dig!.topics = [...DIG_SITES[sector].topics];
  const need = DIG_BALANCE.presentRes[tier]!;
  s.dig!.dug = Object.fromEntries(DIG_SITES[sector].finds.slice(0, need.n).map((id) => [id, need.dug]));
  return s;
}
const MGR = 10001;
/** タオックス → ウメコタウン → グリーン・マウス（どれも建物つき）まで進んだ会社。Rare の依頼状まで */
function company(): P1State {
  const s = newP1(9);
  s.tut = 99;
  s.money = 1e7;
  s.flags.digMeet = 'done';
  s.flags.hq = true;
  openGate(s);
  put(s, 'workshop');
  put(s, 'general_store', 3);
  s.presented = ['c1', 'c2'];
  s.letters = ['U'];
  s.storeName = 'クマ商会';
  expect(moveTo(s, 'u1', MGR)).toBeNull();
  s.money = 5e6;
  put(s, 'workshop');
  put(s, 'general_store', 3);
  s.presented.push('u1', 'u2');
  s.letters.push('R');
  expect(moveTo(s, 'r1', 10002)).toBeNull();
  s.money = 5e6;
  put(s, 'workshop');
  put(s, 'general_store', 3);
  put(s, 'warehouse', 8);
  return s;
}
/** Common・Uncommon のダンジョンで出る Rare（復刻品のある）エクステ＝骨董 */
const dungeonUp = Object.entries(DUNGEON_FINDS)
  .filter(([id]) => !id.startsWith('e'))
  .flatMap(([, x]) => [...(x.R ?? []), ...(x.E ?? []), ...(x.L ?? [])]);
const dungeonRare = dungeonUp.find((e) => relicOf(e)?.relic?.rare && extRank(e) === 'R')!;
const dungeonEpic = dungeonUp.find((e) => relicOf(e)?.relic?.epic)!;

describe('1. Epic の町を開く', () => {
  it('Epic の 3 町は遊べる（雲は無し）。他社 4 社・gap・到着の案内 3 枚・入国料は Rare より高い。他社の強さは EPIC_RIVAL', () => {
    const es = SECTORS.filter((x) => x.tier === 'E');
    expect(es.map((x) => x.id)).toEqual(['e1', 'e2', 'e3']);
    const rareFee = Math.max(...SECTORS.filter((x) => x.tier === 'R').map((x) => x.fee));
    for (const d of es) {
      expect([d.soon, d.need, d.cloud]).toEqual([undefined, undefined, undefined]);
      expect(d.fee).toBeGreaterThan(rareFee);
      expect(d.profile.rivals).toHaveLength(4);
      expect(d.profile.intro).toHaveLength(3);
      expect(d.profile.intro[1]).toContain('骨董');
      expect(d.profile.gap!.length).toBeGreaterThanOrEqual(2);
      for (const k of d.profile.gap!) expect(rivalsOf(d.id).some((r) => (r.sells[k] ?? 0) > 0), `${d.id} ${k}`).toBe(false);
      for (const k of ['Sensu', 'Mallet', 'Node-Doll', 'Lantern', 'Scissors']) expect(rivalsOf(d.id).filter((r) => (r.sells[k] ?? 0) > 0).length, `${d.id} ${k}`).toBeGreaterThanOrEqual(2);
      // Epic の復刻品・骨董は他社の sells に入れない
      for (const r of rivalsOf(d.id)) expect(Object.keys(r.sells).some((k) => k.startsWith('Relic-'))).toBe(false);
    }
    // Legendary はいまのまま雲
    expect(SECTORS.find((x) => x.id === 'l1')!.cloud).toBe(true);
    expect(TIERS.E).toMatchObject({ n: 26, rival: 5, demand: 4.5, commonPull: 0.25 });
    const r = rivalsOf('e1')[0];
    expect(rivalBase0(r, 'E', 'e1')).toBeCloseTo(r.base * 5 * EPIC_RIVAL.base, 5);
    const r3 = rivalsOf('e3')[0];
    expect(rivalBase0(r3, 'E', 'e3')).toBeCloseTo(r3.base * 5 * 1.15 * EPIC_RIVAL.base * (EPIC_RIVAL.town.e3 ?? 1), 5);
    const s = newP1(3, 'E', 'e1');
    expect(s.n).toBe(26);
    expect(s.rivals).toHaveLength(4);
  });

  it('Epic の調査依頼状は Rare の 2 つの町で発表したとき（1 つ目では届かない）。「枠だけ」ではない', () => {
    const s = townAt('r1', 'R');
    expect(letterProgress(s, 'E')).toEqual([0, 2]);
    expect(letterToGet(s)).toBeNull();
    expect(lettersLeft(s)).toBe(1);
    expect(present(s)).toMatchObject({ rp: RP_GAIN.R.present, letter: null });
    expect(letterLock(s, 'E')).toBe('🔒 調査依頼状が要る（Rare の 2 つの町で研究を発表しよう。いま 1 / 2）');
    const t2 = townAt('r2', 'R', ['r1']);
    expect(letterToGet(t2)).toBe('E');
    expect(presentPages(t2)[2].text).not.toContain('雲の向こう');
    expect(present(t2)).toMatchObject({ letter: 'E' });
    expect(t2.letters).toEqual(['U', 'R', 'E']);
    expect(presentAfter('E', 0, false, 'R')).toContain('Epic のセクタに進出');
  });

  it('依頼状が無いと Epic に出店できない（letter）。ランドマップの札と同じ文。初進出はランクアップなので入国料を取らない', () => {
    const s = company();
    expect(sectorState(s.land!, 'e1')).toBe('open');
    expect(letterLocked(s, 'e1')).toBe(true);
    expect(letterLockOf(s, 'e1')).toContain('Rare の 2 つの町');
    expect(moveTo(s, 'e1', MGR)).toBe('letter');
    expect(s.resets).toHaveLength(2);
    expect(rankUpTier(s, 'e1')).toBe('E');
  });

  it('Epic の町に初めて入ると法務の部門が開く（中身は次の更新）。1-1 の表の「Epic 1」の部門', () => {
    const r = newP1(1, 'R', 'r1');
    expect(deptOpen(r, 'legal')).toBe(false);
    expect(menuDepts(r)).not.toContain('legal');
    const e = newP1(1, 'E', 'e1');
    expect(DEPT.legal.opens).toBe('E');
    expect(deptOpen(e, 'legal')).toBe(true);
    expect(menuDepts(e)).toContain('legal');
  });
});

describe('2. 3 回目のランクアップ（Rare → Epic）の災害', () => {
  it('Common・Uncommon・Rare の全セクタが廃墟・周回は 3 周目・支度金（Rare の支度金より多い）・第 3 回・サインは保存済みの店の名前', () => {
    const s = company();
    s.letters.push('E');
    const name = s.storeName;
    const before = s.money;
    expect(moveTo(s, 'e1', 10003)).toBeNull();
    expect(s.resets).toHaveLength(3);
    const rec = pendingReset(s)!;
    expect(rec).toMatchObject({ tier: 'E', to: 'e1', grant: RESET.grantE });
    expect(rec.levy).toBeGreaterThanOrEqual(Math.round(before));
    expect(s.money).toBe(grantOf('E'));
    expect(RESET.grantE).toBeGreaterThan(RESET.grantR);
    expect(RESET.grantR).toBe(60000);
    expect(Object.keys(rec.ruins).sort()).toEqual(['c1', 'r1', 'u1']);
    for (const id of ['c1', 'u1', 'r1']) {
      const snap = recOf(s, id).snap as unknown as P1State;
      expect(snap.buildings.filter((b) => b.owner === 'me')).toHaveLength(0);
      expect(snap.buildings.filter((b) => b.owner === RUIN).length).toBe(rec.ruins[id]);
      expect(rec.ruins[id]).toBeGreaterThan(0);
      expect(snap.dig!.round).toBe(3);
      expect(reviveView(s, id)?.ruins).toBe(rec.ruins[id]);
    }
    expect(s.loop?.n).toBe(3);
    // 第 3 回（disaster.ts は resets の何番目かで「第 N 回」）。サインは保存済みの店の名前（入力は出さない）
    expect(s.resets!.indexOf(rec) + 1).toBe(3);
    expect(s.storeName).toBe(name);
    // Rare の町の廃墟もヒーローに任せられる（支援金の段は Rare の町の修繕額から。Uncommon より大きい）
    expect(fundsOf('R')[0]).toBeGreaterThan(fundsOf('U')[0]);
    // Epic の外周は Epic に進出すると開く
    expect(ringsDue(s)).toContain('E');
    // Epic の町には商圏の取り合い
    expect(s.area).toBeTruthy();
  });

  it('段 F の決まり：ランクアップの災害でその四半期のここまでの税は帳消し・資金 30,000 G を残す（Epic でも）', () => {
    const s = company();
    s.letters.push('E');
    const A = acctOf(s);
    A.cur.base = 9e6;
    A.owed = 50000;
    expect(moveTo(s, 'e1', 10003)).toBeNull();
    expect(acctOf(s).cur.base).toBe(0);
    expect(acctOf(s).owed).toBe(0);
    expect(TAX.rate.E).toBe(0.3);
    expect(TAX.keep).toBe(30000);
    // 支度金は資金を残す額（TAX.keep）より多い：着いた最初の四半期の税で立ち上げが止まらない
    expect(grantOf('E')).toBeGreaterThan(TAX.keep);
  });
});

describe('3. Epic の発掘', () => {
  it('Epic の地図にも 2 × 2 の荒れ地が 4 か所・6 層。出土品はカタログの Epic のエクステ（お題 4・お題以外 10）・石板は各町 2 枚', () => {
    for (const id of ['e1', 'e2', 'e3']) {
      const s = newP1(1, 'E', id);
      expect(s.dig?.sites).toHaveLength(4);
      const d = DIG_SITES[id];
      expect([d.topics.length, d.finds.length]).toEqual([4, 10]);
      for (const e of [...d.topics, ...d.finds]) expect(extRank(e), `${id} ${e}`).toBe('E');
      const tabs = TABLETS.filter((x) => x.sector === id);
      expect(tabs).toHaveLength(2);
      expect(SECTOR_CHIEF[id]).toBeGreaterThan(15000);
      // ダンジョンの上のランクは Legendary だけ
      expect(Object.keys(DUNGEON_FINDS[id])).toEqual(['L']);
      expect(topicsPage(id)).toContain(`[[${DIG_THEME[id]}]]の跡`);
      // Epic の町の荒れ地の Epic の出土品はふつうの大きさ（2 × 2 は上のランクの大きな遺物だけ）
      expect(findSize({ kind: 'ext', id: d.finds[0] }, 'E')).toEqual([1, 1]);
      const L = digLayouts(id)[0];
      expect(L.finds.filter((f) => f.item.kind === 'ext').every((f) => f.size[0] === 1)).toBe(true);
    }
    // ほかのセクタの壁では Epic は 2 × 2 のまま
    expect(findSize({ kind: 'ext', id: DIG_SITES.e1.finds[0] })).toEqual([2, 2]);
    expect(findSize({ kind: 'ext', id: DIG_SITES.e1.finds[0] }, 'R')).toEqual([2, 2]);
    // 壁は Rare から 1 段上（層・硬さ・深い層の許可・お題の層・申請料）
    expect(DIG.E.layers).toHaveLength(6);
    expect(DIG_BALANCE.hard.E.every(([lo], k) => lo > DIG_BALANCE.hard.R[Math.min(4, k)][0] - (k === 5 ? 3 : 0))).toBe(true);
    expect(DIG_BALANCE.tree.deep.E[5]).toBe(6);
    expect(DIG_BALANCE.permitFee.E).toBeGreaterThan(DIG_BALANCE.permitFee.R);
    expect(Math.max(...DIG_BALANCE.topicLayer.E)).toBe(5);
    // お題・石板・発表の RP は Rare の 2.5 倍。出土品 1 個ぶんは同じ
    expect(RP_GAIN.E).toEqual({ first: RP_GAIN.C.first, lv: RP_GAIN.C.lv, topic: 625, tablet: 312, present: 937 });
    // Epic の研究パネルの値段も Rare の 2.5 倍
    expect(DIG_BALANCE.rpPrice.E.lo).toBe(DIG_BALANCE.rpPrice.R.lo * 2.5);
  });

  it('お題は、ほかのセクタのダンジョンに出さない。お題以外も、ダンジョンの Rare 以上とシリーズで重ならない', () => {
    const eDig = Object.entries(DIG_SITES).filter(([id]) => id.startsWith('e')).flatMap(([, d]) => [...d.topics, ...d.finds]);
    const eSeries = new Set(eDig.map(seriesOf));
    const allDungeon = Object.values(DUNGEON_FINDS).flatMap((x) => [...(x.R ?? []), ...(x.E ?? []), ...(x.L ?? [])]);
    expect(allDungeon.filter((e) => eSeries.has(seriesOf(e)))).toEqual([]);
    for (const e of eDig) expect(allDungeon).not.toContain(e);
    // Common〜Rare のダンジョンの出土品はいまの数のまま
    for (const [id, x] of Object.entries(DUNGEON_FINDS)) if (!id.startsWith('e')) for (const v of Object.values(x)) expect(v, id).toHaveLength(DIG_BALANCE.dungeon.pick);
  });

  it('発表：お題 4 つ ＋ この町の出土品 2 種を この町で 14 個ずつ。Epic の発表は Legendary の調査依頼状の枠だけ（2 つ目の町で）', () => {
    const s = townAt('e1', 'E');
    const need = DIG_BALANCE.presentRes.E!;
    expect(need).toEqual({ n: 2, dug: 14 });
    s.dig!.dug = { [DIG_SITES.e1.finds[0]]: need.dug, [DIG_SITES.e1.finds[1]]: need.dug - 1 };
    expect(presentLock(s)).toBe('research');
    s.dig!.dug[DIG_SITES.e1.finds[1]] = need.dug;
    expect(presentLock(s)).toBeNull();
    expect(presentPages(s)[1].text).toContain('分け合う心');
    expect(present(s)).toMatchObject({ rp: 937, letter: null });
    const t2 = townAt('e2', 'E', ['e1']);
    expect(presentPages(t2)[2].text).toContain('Legendary の都はまだ雲の向こう');
    expect(present(t2)).toMatchObject({ letter: 'L' });
    expect(presentAfter('L', 0, false, 'E')).toContain('雲の向こう');
  });
});

describe('4. Epic の復刻品', () => {
  const epic = RELICS.filter((p) => p.relic!.epic);
  const rare = RELICS.filter((p) => p.relic!.rare && !p.relic!.epic);
  const pr = (p: (typeof RELICS)[number]) => skuPrice(relicSku(p.key));

  it('Epic の荒れ地の出土品とダンジョンの Epic に 1 つずつ。値段は Rare の復刻品より高い（合わせて ×10）。材料・工期・職人は 1 段上', () => {
    expect(epic.length).toBeGreaterThan(40);
    for (const p of epic) expect(extRank(p.relic!.ext)).toBe('E');
    expect(Math.min(...epic.map(pr))).toBeGreaterThan(Math.max(...rare.map(pr)));
    expect(DIG_BALANCE.relic.epic.price).toBe(10);
    const avg = (xs: typeof RELICS) => xs.reduce((a, p) => a + pr(p), 0) / xs.length;
    expect(avg(epic) / avg(rare)).toBeCloseTo(DIG_BALANCE.relic.epic.price / DIG_BALANCE.relic.rare.price, 1);
    const total = (p: (typeof RELICS)[number]) => Object.values(p.recipe.U).reduce<number>((a, q) => a + (q ?? 0), 0);
    expect(Math.min(...epic.map(total))).toBeGreaterThan(Math.max(...rare.map(total)) - 1);
    expect(Math.min(...epic.map((p) => p.days))).toBeGreaterThanOrEqual(Math.max(...rare.map((p) => p.days)));
    expect(relicMinCraft(epic[0].key)).toBeGreaterThan(relicMinCraft(rare[0].key));
  });

  it('レシピは Epic の町に進出してから、研究 Lv3 で開く（それまでは研究ノートに「Epic の町に進出してから」）', () => {
    const ext = DIG_SITES.e1.finds[0];
    const s = newP1(2, 'R', 'r1');
    s.research[ext] = RESEARCH_NEED[2];
    expect(epicRelicsOpen(s)).toBe(false);
    expect(openRelic(s, ext)).toBeNull();
    syncRelics(s);
    expect(s.recipes[`Relic-${ext}`]).toBeUndefined();
    expect(relicLine({ id: ext, lv: 3 }, true, false)).toEqual([expect.stringContaining('Epic の町に進出'), false]);
    expect(relicLine({ id: ext, lv: 3 }, true, true)).toEqual([expect.any(String), true]);
    const e = newP1(2, 'E', 'e1');
    e.research[ext] = RESEARCH_NEED[2];
    expect(epicRelicsOpen(e)).toBe(true);
    syncRelics(e);
    expect(e.recipes[`Relic-${ext}`]).toBeTruthy();
    const x = relicSku(`Relic-${ext}`);
    expect(x.endsWith(':U')).toBe(true);
    e.mats = { cloth: 99, paper: 99, gem: 99, iron: 99, wood: 99, clay: 99, glass: 99 };
    const st = e.staff[0];
    st.stats = { ...st.stats, phy: 45, int: 45, agi: 45 };
    // Rare の復刻品は作れる適性（40 以上）でも、Epic の復刻品は 1 段上（48）
    expect(craftCheck(e, x, st.hero)).toBe('skill');
    expect(e.demand[`Relic-${ext}`]).toBeCloseTo(DIG_BALANCE.relic.demandBase * TIERS.E.demand * 1.1, 6);
    // Epic の町の Epic の復刻品の札
    expect(seriesTag(ext, 'E')).toEqual(['Epic の町で売れる', true]);
    // Rare の町では Epic の復刻品は売れない（シリーズが Rare の荒れ地と同じでも）
    expect(relicSells(relicOf(ext), 'R')).toBe(false);
  });
});

describe('5. 骨董の需要', () => {
  it('ダンジョン由来の Rare 以上の復刻品は Rare の町では売れず、Epic の町では骨董として売れる（値段 × ANTIQUE.price・需要 × ANTIQUE.demand）', () => {
    expect(dungeonRare && dungeonEpic).toBeTruthy();
    const key = `Relic-${dungeonRare}`;
    // Rare の町：レシピは開くが売れない（棚に並べられない）。札は「Epic の町で骨董として売れる」
    const r = newP1(4, 'R', 'r1');
    r.tut = 99;
    r.money = 1e7;
    r.flags.hq = true;
    r.research[dungeonRare] = RESEARCH_NEED[2];
    syncRelics(r);
    expect(r.recipes[key]).toBeTruthy();
    expect(unsellableHere(r, key)).toBe(true);
    expect(r.demand[key]).toBe(0);
    expect(seriesTag(dungeonRare, 'R')).toEqual(['この町では売れない（Epic の町で骨董として売れる）', false]);
    expect(seriesTag(dungeonRare)![0]).toContain('Epic の町で骨董として売れる');
    expect(RARE_RELIC_NOTE(true)).not.toContain('準備中');
    // Epic の町：骨董として売れる（棚に並べられる・札は緑の「骨董として人気」）
    const e = newP1(4, 'E', 'e1');
    e.tut = 99;
    e.money = 1e7;
    e.flags.hq = true;
    e.flags.digMeet = 'done';
    e.research[dungeonRare] = RESEARCH_NEED[2];
    syncRelics(e);
    expect(MARKET_SERIES.E.soon).toBeUndefined();
    expect(isAntique(relicOf(dungeonRare), 'E')).toBe(true);
    expect(isAntique(relicOf(dungeonRare), 'R')).toBe(false);
    expect(antiqueHere(e, key)).toBe(true);
    expect(unsellableHere(e, key)).toBe(false);
    expect(e.demand[key]).toBeCloseTo(DIG_BALANCE.relic.demandBase * TIERS.E.demand * 1.1 * ANTIQUE.demand, 6);
    expect(seriesTag(dungeonRare, 'E')).toEqual([expect.stringContaining('骨董として人気'), true]);
    put(e, 'workshop');
    const b = put(e, 'general_store', 3);
    expect(setShelf(e, b.uid, 0, relicSku(key))).toBe(true);
    // 値段：その復刻品の値段 × 骨董の倍率（Epic の町の単価の整え ×1.15 も）
    const x = relicSku(key);
    expect(priceOf(e, x)).toBe(Math.round(skuPrice(x) * 1.15 * ANTIQUE.price));
    expect(priceOf(r, x)).toBe(Math.round(skuPrice(x) * 1.13));
    // ダンジョンの Epic の遺物も骨董（Epic の町に進出してから研究 Lv3 でレシピ）
    e.research[dungeonEpic] = RESEARCH_NEED[2];
    syncRelics(e);
    expect(antiqueHere(e, `Relic-${dungeonEpic}`)).toBe(true);
    // 荒れ地の復刻品は骨董ではない
    expect(isAntique(relicOf(DIG_SITES.e1.finds[0]), 'E')).toBe(false);
    expect(isAntique(relicOf(DIG_SITES.r1.finds[0]), 'E')).toBe(false);
    // Rare の荒れ地のシリーズの Rare の復刻品は Epic の町でも売れる（前のランクの復刻品）
    expect(relicSells(relicOf(DIG_SITES.r1.finds[0]), 'E')).toBe(true);
    // 展示館の価値（E 15）はそのまま
    expect(DIG_BALANCE.museum.val.E).toBe(15);
  });

  it('骨董は Epic の他社が真似しない（独占が切れても他社の sells に入らない）', () => {
    const e = newP1(4, 'E', 'e1');
    e.tut = 99;
    e.money = 1e7;
    e.flags.hq = true;
    const key = `Relic-${dungeonRare}`;
    e.research[dungeonRare] = RESEARCH_NEED[2];
    syncRelics(e);
    e.recipes[key].sold = -1000;
    for (let m = 0; m < 6; m++) {
      e.monthSales[key] = 100000;
      e.day = (m + 1) * 30 - 1;
      step(e);
    }
    for (const r of e.rivals) expect(r.sells[key] ?? 0).toBe(0);
  });

  it('倉庫の骨董は 3 回目の災害で失わずに、Epic の町の倉庫へ運ぶ（進出の確認の「残るもの」に数）。ほかの在庫は失う', () => {
    const s = company();
    s.letters.push('E');
    s.research[dungeonRare] = RESEARCH_NEED[2];
    syncRelics(s);
    const x = relicSku(`Relic-${dungeonRare}`);
    s.stock[x] = 7;
    s.stock['Lantern:C'] = 5;
    expect(antiquesHeld(s, 'E')).toMatchObject({ n: 7, kinds: 1 });
    expect(antiquesHeld(s, 'R').n).toBe(0);
    expect(moveTo(s, 'e1', 10003)).toBeNull();
    expect(pendingReset(s)!.keep).toEqual({ [x]: 7 });
    expect(s.stock[x]).toBe(7);
    expect(s.stock['Lantern:C']).toBeUndefined();
    // Epic の町では並べられる
    put(s, 'workshop');
    const b = put(s, 'general_store', 3);
    expect(setShelf(s, b.uid, 0, x)).toBe(true);
  });
});

describe('6. Epic の町の商圏の取り合い', () => {
  it('Epic の町にも商圏（他社 1 社に stores 軒・本店 1 軒）。距離の重みは Epic の広さに合わせた d0。1 軒では町の 2 割に届かない', () => {
    const s = newP1(1, 'E', 'e1');
    expect(s.area).toBeTruthy();
    expect(rivalStores(s)).toHaveLength(s.rivals.length * EPIC_AREA.stores);
    for (const r of s.rivals) expect(s.area!.stores.filter((x) => x.rid === r.id && x.main)).toHaveLength(1);
    expect(EPIC_AREA.d0).toBeGreaterThan(RARE_AREA.d0);
    const w = newStorePull(s);
    let best = 0;
    for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) best = Math.max(best, areaShares(s, [{ i, j, w }]).extra[0]);
    expect(best).toBeGreaterThan(0);
    expect(best).toBeLessThan(0.2);
    // 店の場所で売れ方が変わる（離れた 2 軒目は、1 軒目とほとんど取り合わない）
    const one = capture(s, 'Lantern', [{ i: 2, j: 2, w: 3, g: 'me' }])[0];
    const two = capture(s, 'Lantern', [
      { i: 2, j: 2, w: 3, g: 'me' },
      { i: s.n - 3, j: s.n - 3, w: 3, g: 'me' },
    ]);
    expect(two[0] + two[1]).toBeGreaterThan(one * 1.6);
    // Epic の町から Rare の町の写しに戻っても、商圏は Rare の数字のまま（Rare の町の売れ方を変えない）
    const r = newP1(1, 'R', 'r1');
    expect(rivalStores(r)).toHaveLength(r.rivals.length * RARE_AREA.stores);
  });
});

describe('7. ブランド力の上限と企業の格', () => {
  it('上限は出店したいちばん上のランクで決まる（Common 400 → Epic 1,200）。上限の上は上がらない', () => {
    const c = newP1(1);
    expect(brandCap(c)).toBe(BRAND_CAP.C);
    c.brand = BRAND_CAP.C - 5;
    brandAdd(c, 50, 'test');
    expect(c.brand).toBe(BRAND_CAP.C);
    const e = newP1(1, 'E', 'e1');
    expect(brandCap(e)).toBe(BRAND_CAP.E);
    e.brand = 999;
    brandAdd(e, 50, 'test');
    expect(e.brand).toBe(1049);
    // 上限の上にいるとき（上限の決まりの前）は上がらないが、下がるのはそのまま
    c.brand = 900;
    brandAdd(c, 10, 'test');
    expect(c.brand).toBe(900);
    brandAdd(c, -10, 'test');
    expect(c.brand).toBe(890);
    // 上限は上のランクほど大きい。売り場の強さ（300 で頭打ち）・カリスマ度（400 で頭打ち）は Common の上限で届く＝売れ方は変わらない
    expect(BRAND_CAP.C).toBeGreaterThanOrEqual(400);
    expect(BRAND_CAP.U).toBeLessThan(BRAND_CAP.R);
    expect(BRAND_CAP.R).toBeLessThan(BRAND_CAP.E);
  });

  it('格のしきい値：地元の店・地域の有名店・全国ブランドは前のまま。世界ブランドは Epic の町に出店してから（Rare の上限 × CI でも届かない）', () => {
    expect(GRADE.at.slice(0, 4)).toEqual([0, 100, 250, 450]);
    expect(BRAND_CAP.R * (1 + GRADE.ci * 2)).toBeLessThan(GRADE.at[4]);
    expect(BRAND_CAP.E).toBeGreaterThanOrEqual(GRADE.at[4]);
    const r = newP1(1, 'R', 'r1');
    r.brand = BRAND_CAP.R;
    expect(gradeOf(r)).toBe(3);
    const e = newP1(1, 'E', 'e1');
    e.brand = GRADE.at[4];
    expect(gradeOf(e)).toBe(4);
  });

  it(
    '最短の方針の通しでは、ブランド力がどの月も上限より下（上限の決まりで売れ方と時間が変わらない）',
    () => {
      let hit = 0;
      let months = 0;
      runOnce('rta', 1, {
        onMonth: (s) => {
          months++;
          if ((s.brand ?? 0) >= brandCap(s)) hit++;
        },
      });
      expect(months).toBeGreaterThan(10);
      expect(hit).toBe(0);
    },
    120_000,
  );
});

describe('8. セーブ（版 18）', () => {
  it('版 17 のセーブは読める。Rare の 2 町で発表して受け取っていた Epic の依頼状は残す（そのまま Epic へ出店できる）。倉庫の骨董はそのまま', () => {
    const s = townAt('r2', 'R', ['r1']);
    s.letters = ['U', 'R', 'E'];
    s.presented = ['c1', 'c2', 'u1', 'u2', 'r1', 'r2'];
    s.research[dungeonRare] = RESEARCH_NEED[2];
    syncRelics(s);
    const x = relicSku(`Relic-${dungeonRare}`);
    s.stock[x] = 4;
    s.brand = 999;
    const o = JSON.parse(serializeP1(s));
    o.v = 17;
    const back = deserializeP1(JSON.stringify(o))!;
    expect(back.v).toBe(28);
    expect(back.letters).toEqual(['U', 'R', 'E']);
    expect(letterProgress(back, 'E')).toBeNull();
    expect(back.stock[x]).toBe(4);
    // ブランド力は上限（Rare の町にいるので 800）へ。いちばん高かった値（カリスマ度の分）は残す
    expect(back.brand).toBe(BRAND_CAP.R);
    expect(back.brandPeak).toBe(999);
    expect(newP1(1).v).toBe(28);
    void staffOf;
    void sectorDef;
  });
});
