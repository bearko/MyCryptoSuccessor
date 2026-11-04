/**
 * Rare の町 ①（docs/ISLAND_PHASE1.md「Rare の町」）：
 * Rare の調査依頼状は Uncommon の 2 つの町で発表したとき・依頼状が無いと Rare に出店できない・Rare への初進出で 2 回目の災害
 * （Common・Uncommon の全セクタが廃墟・支度金・保存済みの店の名前でサイン）・Rare の荒れ地と出土品（Rare のエクステ）・お題と発表の条件・
 * Rare の復刻品（Rare 進出後に研究 Lv3 で開く・Uncommon より高い）・Rare の他社・古いセーブ。
 */
import { describe, expect, it } from 'vitest';
import { DIG_BALANCE, DIG_SITES, DIG_THEME, DUNGEON_FINDS, MARKET_SERIES, PRODUCTS, RARE_RIVAL, RELICS, RESEARCH_NEED, RESET, RP_GAIN, SECTORS, TABLETS, TIERS, UNCOMMON, fundsOf, grantOf, relicOf, relicSells, rivalsOf, seriesOf, sku, skuPrice } from '../src/island/p1/data';
import { sectorProfile } from '../src/island/p1/company';
import { RUIN, sectorState } from '../src/island/p1/company';
import { letterLock, letterLockOf, letterLocked, moveTo, recOf } from '../src/island/p1/land';
import { lettersLeft, letterToGet, presentAfter, presentPages, topicsPage } from '../src/island/p1/digmeet';
import { relicLine, seriesTag } from '../src/island/p1/digview';
import { pendingReset, rankUpTier, reviveView } from '../src/island/p1/reset';
import {
  allowedDirs,
  baseDemand,
  build,
  pullUnsellable,
  setShelf,
  unsellableHere,
  craftCheck,
  deserializeP1,
  extRank,
  letterProgress,
  newP1,
  openGate,
  openRelic,
  present,
  presentLock,
  rareRelicsOpen,
  relicMinCraft,
  relicSku,
  rivalBase0,
  ringsDue,
  serializeP1,
  setLevel,
  staffOf,
  step,
  syncRelics,
  type P1State,
  type PBuilding,
} from '../src/island/p1/model';

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
function townAt(sector: string, tier: 'U' | 'R', presented: string[] = []): P1State {
  const s = newP1(5, tier, sector);
  s.money = 1e8;
  s.tut = 99;
  s.flags.digMeet = 'done';
  s.presented = [...presented];
  s.letters = ['U'];
  s.dig!.topics = [...DIG_SITES[sector].topics];
  const need = DIG_BALANCE.presentRes[tier]!;
  s.dig!.dug = Object.fromEntries(DIG_SITES[sector].finds.slice(0, need.n).map((id) => [id, need.dug]));
  return s;
}
const MGR = 10001;
/** タオックス（建物つき）→ ウメコタウン（建物つき）まで進んだ会社。Uncommon の依頼状まで */
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
  put(s, 'warehouse', 8);
  return s;
}

describe('1. Rare の町を開く', () => {
  it('Rare の 4 町は遊べる（準備中・開放の条件は無し）。他社 4 社・gap・到着の案内 3 枚。他社の強さは RARE_RIVAL', () => {
    const rs = SECTORS.filter((x) => x.tier === 'R');
    expect(rs.map((x) => x.id)).toEqual(['r1', 'r2', 'r3', 'r4']);
    for (const d of rs) {
      expect([d.soon, d.need, d.cloud]).toEqual([undefined, undefined, undefined]);
      expect(d.profile.rivals).toHaveLength(4);
      expect(d.profile.intro).toHaveLength(3);
      expect(d.profile.gap!.length).toBeGreaterThanOrEqual(2);
      // gap の商品は他社が売っていない。基礎の 5 つはどれも他社 2 社以上
      for (const k of d.profile.gap!) expect(rivalsOf(d.id).some((r) => (r.sells[k] ?? 0) > 0), `${d.id} ${k}`).toBe(false);
      for (const k of ['Sensu', 'Mallet', 'Node-Doll', 'Lantern', 'Scissors']) expect(rivalsOf(d.id).filter((r) => (r.sells[k] ?? 0) > 0).length, `${d.id} ${k}`).toBeGreaterThanOrEqual(2);
      // Rare の復刻品は他社の sells に入れない（勝ち筋）
      for (const r of rivalsOf(d.id)) expect(Object.keys(r.sells).some((k) => k.startsWith('Relic-'))).toBe(false);
    }
    expect(TIERS.R).toMatchObject({ n: 21, rival: 3.5, demand: 3, commonPull: 0.35 });
    const r = rivalsOf('r1')[0];
    expect(rivalBase0(r, 'R', 'r1')).toBeCloseTo(r.base * 3.5 * RARE_RIVAL.base, 5);
    const r2 = rivalsOf('r2')[0];
    expect(rivalBase0(r2, 'R', 'r2')).toBeCloseTo(r2.base * 3.5 * 1.15 * RARE_RIVAL.base * (RARE_RIVAL.town.r2 ?? 1), 5);
    const s = newP1(3, 'R', 'r1');
    expect(s.n).toBe(21);
    expect(s.rivals).toHaveLength(4);
  });

  it('Rare の調査依頼状は Uncommon の 2 つの町で発表したとき（1 つ目では届かない）', () => {
    const s = townAt('u1', 'U');
    expect(letterProgress(s, 'R')).toEqual([0, 2]);
    expect(letterToGet(s)).toBeNull();
    expect(lettersLeft(s)).toBe(1);
    expect(presentPages(s)[2].text).toContain('[[Rare の調査依頼状]]');
    expect(present(s)).toMatchObject({ rp: RP_GAIN.U.present, letter: null });
    expect(s.letters).toEqual(['U']);
    expect(letterProgress(s, 'R')).toEqual([1, 2]);
    expect(letterLock(s, 'R')).toBe('🔒 調査依頼状が要る（Uncommon の 2 つの町で研究を発表しよう。いま 1 / 2）');
    // 2 つ目の Uncommon の町
    const t2 = townAt('u2', 'U', ['u1']);
    expect(letterToGet(t2)).toBe('R');
    expect(lettersLeft(t2)).toBe(0);
    expect(present(t2)).toMatchObject({ letter: 'R' });
    expect(t2.letters).toEqual(['U', 'R']);
    expect(letterProgress(t2, 'R')).toBeNull();
    expect(presentAfter('R', 0, false, 'U')).toContain('Rare のセクタに進出');
    expect(presentAfter(null, 1, false, 'U')).toContain('別の Uncommon の町');
  });

  it('依頼状が無いと Rare に出店できない（letter）。ランドマップの札と同じ文。入国料はいまのまま（ランクアップの進出なので取らない）', () => {
    const s = company();
    expect(sectorState(s.land!, 'r1')).toBe('open');
    expect(letterLocked(s, 'r1')).toBe(true);
    expect(letterLockOf(s, 'r1')).toContain('Uncommon の 2 つの町');
    expect(moveTo(s, 'r1', MGR)).toBe('letter');
    expect(s.resets).toHaveLength(1);
    expect(SECTORS.find((x) => x.id === 'r1')!.fee).toBe(600000);
  });
});

describe('2. 2 回目のランクアップ（Uncommon → Rare）の災害', () => {
  it('Common・Uncommon の全セクタが廃墟・荒れ地は作り直し・周回は 2 周目・支度金・サインは保存済みの店の名前（入力は出さない）', () => {
    const s = company();
    s.letters.push('R');
    expect(rankUpTier(s, 'r1')).toBe('R');
    const name = s.storeName;
    const before = s.money;
    const m = staffOf(s, 10002)!;
    expect(moveTo(s, 'r1', m.hero)).toBeNull();
    expect(s.resets).toHaveLength(2);
    const rec = pendingReset(s)!;
    expect(rec).toMatchObject({ tier: 'R', to: 'r1', grant: RESET.grantR });
    expect(rec.levy).toBe(Math.round(before));
    expect(s.money).toBe(grantOf('R'));
    expect(RESET.grantR).toBeGreaterThanOrEqual(RESET.grant);
    expect(Object.keys(rec.ruins).sort()).toEqual(['c1', 'u1']);
    expect(rec.ruins.c1).toBeGreaterThan(0);
    expect(rec.ruins.u1).toBeGreaterThan(0);
    for (const id of ['c1', 'u1']) {
      const snap = recOf(s, id).snap as unknown as P1State;
      expect(snap.buildings.filter((b) => b.owner === 'me')).toHaveLength(0);
      expect(snap.buildings.filter((b) => b.owner === RUIN).length).toBe(rec.ruins[id]);
      expect(snap.dig!.round).toBe(2);
      expect(reviveView(s, id)?.ruins).toBe(rec.ruins[id]);
    }
    expect(s.loop?.n).toBe(2);
    // サイン：店の名前はセーブに残っている（入力の段は出さない＝disaster.ts は storeName があれば書くだけ）
    expect(s.storeName).toBe(name);
    // 出店許可の費用は取らない・支援金の段は Uncommon の町は大きめ
    expect(fundsOf('U')[0]).toBeGreaterThan(fundsOf('C')[0]);
    // Rare の外周は Rare に進出すると開く（スキルツリーの演出で）
    expect(ringsDue(s)).toContain('R');
  });
});

describe('3. Rare の発掘', () => {
  it('Rare の地図にも 2 × 2 の荒れ地が 4 か所・5 層。出土品はカタログの Rare のエクステ（お題 4・お題以外 10）・石板は各町 2 枚', () => {
    for (const id of ['r1', 'r2', 'r3', 'r4']) {
      const s = newP1(1, 'R', id);
      expect(s.dig?.sites).toHaveLength(4);
      expect(s.dig!.sites.every((x, k) => x.depth.length === 63 && k >= 0)).toBe(true);
      const d = DIG_SITES[id];
      expect([d.topics.length, d.finds.length]).toEqual([4, 10]);
      for (const e of [...d.topics, ...d.finds]) expect(extRank(e), `${id} ${e}`).toBe('R');
      const tabs = TABLETS.filter((x) => x.sector === id);
      expect(tabs).toHaveLength(2);
      for (const x of tabs) expect(x.soon).toBeUndefined();
      // ダンジョンの上のランクは Epic・Legendary
      expect(Object.keys(DUNGEON_FINDS[id])).toEqual(['E', 'L']);
      expect(topicsPage(id)).toContain(`[[${DIG_THEME[id]}]]の跡`);
    }
    // お題・石板・発表の RP は Uncommon の 2.5 倍。出土品 1 個ぶんは同じ
    expect(RP_GAIN.R).toEqual({ first: RP_GAIN.C.first, lv: RP_GAIN.C.lv, topic: 250, tablet: 125, present: 375 });
    expect(DIG_BALANCE.hard.R.length).toBe(5);
  });

  it('発表：お題 4 つ ＋ この町の出土品 2 種を この町で 12 個ずつ。Rare の発表は Epic の依頼状の枠だけ（2 つ目の町で）', () => {
    const s = townAt('r1', 'R');
    s.dig!.dug = { [DIG_SITES.r1.finds[0]]: 12, [DIG_SITES.r1.finds[1]]: 11 };
    expect(presentLock(s)).toBe('research');
    s.dig!.dug[DIG_SITES.r1.finds[1]] = 12;
    expect(presentLock(s)).toBeNull();
    expect(presentPages(s)[1].text).toContain('栄えすぎた');
    expect(present(s)).toMatchObject({ rp: 375, letter: null });
    const t2 = townAt('r2', 'R', ['r1']);
    expect(presentPages(t2)[2].text).toContain('[[Epic の調査依頼状]]');
    expect(present(t2)).toMatchObject({ letter: 'E' });
    // 段 H1：Epic の町は開いた（依頼状で出店できる。tests/island-p1-epic.test.ts）
    expect(SECTORS.filter((x) => x.tier === 'E').every((x) => !x.cloud)).toBe(true);
  });
});

describe('4. Rare の復刻品', () => {
  const rare = RELICS.filter((p) => p.relic!.rare && !p.relic!.epic);
  const unc = RELICS.filter((p) => p.relic!.rank === 'U' && !p.relic!.rare);

  it('Rare の荒れ地の出土品とダンジョンの Rare のエクステに 1 つずつ。値段は Uncommon の復刻品より高い（合わせて ×5）', () => {
    expect(rare.length).toBeGreaterThan(40);
    for (const p of rare) expect(extRank(p.relic!.ext)).toBe('R');
    const pr = (p: (typeof RELICS)[number]) => skuPrice(relicSku(p.key));
    expect(Math.min(...rare.map(pr))).toBeGreaterThan(Math.max(...unc.map(pr)));
    expect(DIG_BALANCE.relic.rare.price).toBe(5);
    const avg = (xs: typeof RELICS) => xs.reduce((a, p) => a + pr(p), 0) / xs.length;
    expect(avg(rare) / avg(unc)).toBeCloseTo(DIG_BALANCE.relic.rare.price / UNCOMMON.price, 1);
    // 材料・工期・職人は 1 段上
    const total = (p: (typeof RELICS)[number]) => Object.values(p.recipe.U).reduce<number>((a, q) => a + (q ?? 0), 0);
    expect(Math.min(...rare.map(total))).toBeGreaterThan(Math.max(...unc.map(total)) - 1);
    expect(Math.min(...rare.map((p) => p.days))).toBeGreaterThanOrEqual(Math.max(...unc.map((p) => p.days)));
    expect(relicMinCraft(rare[0].key)).toBeGreaterThan(UNCOMMON.minCraft);
    expect(relicMinCraft(unc[0].key)).toBe(UNCOMMON.minCraft);
  });

  it('レシピは Rare の町に進出してから、研究 Lv3 で開く（それまでは研究ノートに「Rare の町に進出してから」）', () => {
    const ext = DIG_SITES.r1.finds[0];
    const s = newP1(2, 'U', 'u1');
    s.research[ext] = RESEARCH_NEED[2];
    expect(rareRelicsOpen(s)).toBe(false);
    expect(openRelic(s, ext)).toBeNull();
    syncRelics(s);
    expect(s.recipes[`Relic-${ext}`]).toBeUndefined();
    expect(relicLine({ id: ext, lv: 3 }, false)).toEqual([expect.stringContaining('Rare の町に進出'), false]);
    expect(relicLine({ id: ext, lv: 3 }, true)).toEqual([expect.any(String), true]);
    // Rare の町へ（ランドの出店先に Rare）
    const r = newP1(2, 'R', 'r1');
    r.research[ext] = RESEARCH_NEED[2];
    expect(rareRelicsOpen(r)).toBe(true);
    syncRelics(r);
    expect(r.recipes[`Relic-${ext}`]).toBeTruthy();
    // 作るのはアンコモンの格（:U）。製造の適性が 1 段上
    const x = relicSku(`Relic-${ext}`);
    expect(x.endsWith(':U')).toBe(true);
    r.mats = { cloth: 99, paper: 99, gem: 99, iron: 99, wood: 99, clay: 99, glass: 99 };
    const st = r.staff[0];
    st.stats = { ...st.stats, phy: 10, int: 10, agi: 10 };
    expect(craftCheck(r, x, st.hero)).toBe('skill');
    // Rare の町の需要（ランクの需要 ×3）
    expect(r.demand[`Relic-${ext}`]).toBe(DIG_BALANCE.relic.demandBase * TIERS.R.demand);
  });
});

describe('5. セーブ（版 10）', () => {
  it('版 9 のセーブは読める。前の条件（Uncommon の 1 つ目の発表）で受け取っていた Rare の依頼状は残す', () => {
    const s = townAt('u1', 'U');
    s.letters = ['U', 'R'];
    s.presented = ['c1', 'c2', 'u1'];
    const o = JSON.parse(serializeP1(s));
    o.v = 9;
    const back = deserializeP1(JSON.stringify(o))!;
    expect(back.v).toBe(28);
    expect(back.letters).toEqual(['U', 'R']);
    expect(letterProgress(back, 'R')).toBeNull();
    // 新しいゲームは版 10
    expect(newP1(1).v).toBe(28);
    void setLevel;
  });
});

describe('6. 売れるシリーズ（Rare の町では新しいシリーズ。ダンジョン由来の Rare は Rare の町で売れない）', () => {
  const rDig = Object.entries(DIG_SITES).filter(([id]) => id.startsWith('r')).flatMap(([, d]) => [...d.topics, ...d.finds]);
  // Common・Uncommon のセクタのダンジョンで出る Rare 以上
  const dungeonUp = Object.entries(DUNGEON_FINDS).filter(([id]) => !id.startsWith('r')).flatMap(([, x]) => [...(x.R ?? []), ...(x.E ?? []), ...(x.L ?? [])]);
  const dungeonRare = dungeonUp.find((e) => relicOf(e)?.relic?.rare)!;

  it('Rare の町の荒れ地のシリーズ（お題・出土品とも）は、Common・Uncommon のダンジョンの Rare 以上のシリーズと重ならない', () => {
    const a = new Set(rDig.map(seriesOf));
    const b = new Set(dungeonUp.map(seriesOf));
    expect([...a].filter((k) => b.has(k))).toEqual([]);
    // ダンジョンの Rare はいまの数のまま（セクタごと pick 種）
    for (const [id, x] of Object.entries(DUNGEON_FINDS)) if (id.startsWith('c') || id.startsWith('u')) expect(x.R, id).toHaveLength(DIG_BALANCE.dungeon.pick);
    // 市場：Rare は荒れ地のシリーズ。段 H1：Epic は荒れ地のシリーズと骨董の需要（ダンジョンの Rare 以上のシリーズ）。Legendary は準備中
    expect(new Set(MARKET_SERIES.R.relics)).toEqual(a);
    expect(MARKET_SERIES.C.relics).toBeUndefined();
    expect(MARKET_SERIES.U.relics).toBeUndefined();
    expect(MARKET_SERIES.E.soon).toBeUndefined();
    expect(MARKET_SERIES.L.soon).toBe(true);
    for (const k of ['E', 'L'] as const) for (const e of dungeonUp) expect(MARKET_SERIES[k].antique).toContain(seriesOf(e));
  });

  it('ダンジョン由来の Rare の復刻品は、レシピは開くが Rare の町では売れない（需要 0・棚に並べられない・札「この町では売れない」）', () => {
    expect(dungeonRare).toBeTruthy();
    const s = newP1(4, 'R', 'r1');
    s.tut = 99;
    s.money = 1e7;
    s.flags.hq = true;
    s.flags.digMeet = 'done';
    s.research[dungeonRare] = RESEARCH_NEED[2];
    syncRelics(s);
    const key = `Relic-${dungeonRare}`;
    expect(s.recipes[key]).toBeTruthy();
    expect(relicSells(relicOf(dungeonRare), 'R')).toBe(false);
    expect(unsellableHere(s, key)).toBe(true);
    expect(s.demand[key]).toBe(0);
    expect(baseDemand(relicOf(dungeonRare)!, 'R', sectorProfile(s))).toBe(0);
    put(s, 'workshop');
    const b = put(s, 'general_store', 3);
    expect(setShelf(s, b.uid, 0, relicSku(key))).toBe(false);
    expect(s.shops[b.uid].shelves[0]).toBeNull();
    expect(seriesTag(dungeonRare, 'R')).toEqual([expect.stringContaining('この町では売れない'), false]);
    expect(seriesTag(dungeonRare)![0]).toContain('Epic の町で骨董');
    // 展示館の価値はそのまま（R 5）
    expect(DIG_BALANCE.museum.val).toMatchObject({ R: 5, E: 15, L: 40 });
  });

  it('Rare の町の荒れ地の Rare の復刻品は売れる（需要 ×3 × 家・棚に並べられる・札「Rare の町で売れる」）', () => {
    const ext = DIG_SITES.r2.finds[3];
    const s = newP1(4, 'R', 'r1');
    s.tut = 99;
    s.money = 1e7;
    s.flags.hq = true;
    s.flags.digMeet = 'done';
    s.research[ext] = RESEARCH_NEED[2];
    syncRelics(s);
    const key = `Relic-${ext}`;
    expect(relicSells(relicOf(ext), 'R')).toBe(true);
    expect(s.demand[key]).toBe(DIG_BALANCE.relic.demandBase * TIERS.R.demand * (sectorProfile(s)?.homes ?? 1));
    put(s, 'workshop');
    const b = put(s, 'general_store', 3);
    expect(setShelf(s, b.uid, 0, relicSku(key))).toBe(true);
    expect(seriesTag(ext, 'R')).toEqual([expect.stringContaining('Rare の町で売れる'), true]);
  });

  it('Common・Uncommon の売れ方は前と同じ（全商品・全復刻品の需要の式・Rare の町のいまの商品と Uncommon の復刻品も）', () => {
    for (const tier of ['C', 'U'] as const) {
      for (const id of SECTORS.filter((x) => x.tier === tier).map((x) => x.id)) {
        const prof = sectorProfile({ sector: id } as P1State);
        for (const p of RELICS) {
          expect(relicSells(p, tier)).toBe(true);
          expect(baseDemand(p, tier, prof)).toBe(p.demand * TIERS[tier].demand * (prof?.homes ?? 1));
        }
      }
    }
    // Rare の町でも、いまの商品と Common・Uncommon の復刻品は制限なし（Common の売れにくさは ×0.35 のまま）
    for (const p of [...PRODUCTS, ...RELICS.filter((x) => !x.relic!.rare)]) expect(relicSells(p, 'R')).toBe(true);
    expect(TIERS.R.commonPull).toBe(0.35);
    void sku;
  });

  it('以前のセーブ：Rare の町の棚にダンジョン由来の Rare の復刻品があれば、倉庫へ戻す（需要も 0 に）', () => {
    const s = newP1(4, 'R', 'r1');
    s.tut = 99;
    s.money = 1e7;
    s.flags.hq = true;
    s.flags.digMeet = 'done';
    s.research[dungeonRare] = RESEARCH_NEED[2];
    const key = `Relic-${dungeonRare}`;
    const x = relicSku(key);
    put(s, 'workshop');
    const b = put(s, 'general_store', 3);
    // 前の版で並べていた状態をつくる
    s.recipes[key] = { at: 0 };
    s.shops[b.uid].shelves[0] = x;
    s.shops[b.uid].shelf[x] = 3;
    s.shops[b.uid].storage[x] = 5;
    s.demand[key] = 40;
    s.stock[x] = 2;
    const back = deserializeP1(serializeP1(s))!;
    expect(back.shops[b.uid].shelves[0]).toBeNull();
    expect(back.shops[b.uid].shelf[x]).toBeUndefined();
    expect(back.shops[b.uid].storage[x]).toBeUndefined();
    expect(back.stock[x]).toBe(10);
    expect(back.demand[key]).toBe(0);
    expect(pullUnsellable(back)).toBe(0);
  });
});
