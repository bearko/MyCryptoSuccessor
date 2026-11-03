/**
 * 段 C：営業の始まり（Rare の町 ②：商圏の取り合い・撤退と空き店舗・営業の部門）。docs/ISLAND_PHASE1.md「商圏の取り合い（Rare）」「営業の部門」。
 */
import { describe, expect, it } from 'vitest';
import { P1B, RARE_AREA, SALES_SKILLS, SKILL, rivalDef } from '../src/island/p1/data';
import { deptOpen, menuDepts } from '../src/island/p1/dept';
import {
  areaBaseMul,
  areaMonth,
  areaRanking,
  areaShares,
  capture,
  deserializeP1,
  isVacant,
  myShare,
  newP1,
  newStorePull,
  rivalBase,
  rivalBase0,
  rivalStores,
  serializeP1,
  step,
  takeVacant,
  vacantCost,
  type P1State,
} from '../src/island/p1/model';
import { siteCandidates, storeName, storeRows } from '../src/island/p1/trade';
import { runOnce, withoutAcct, withoutCs, withoutHr, withoutEvents } from '../scripts/island/sim';
import { priceMul } from '../src/island/p1/acct';

const rare = (seed = 1, sector = 'r1') => newP1(seed, 'R', sector);
const learn = (s: P1State, id: string, lv = 1) => {
  if (!s.skills.includes(id)) s.skills.push(id);
  s.skillLv[id] = lv;
};

describe('Common・Uncommon の売れ方は前と同じ', () => {
  it('Common・Uncommon の町には商圏の取り合いが無い（他社 1 社 1 軒・area なし）', () => {
    for (const [tier, sec] of [
      ['C', 'c1'],
      ['C', 'c3'],
      ['U', 'u1'],
      ['U', 'u3'],
    ] as const) {
      const s = newP1(3, tier, sec);
      expect(s.area, sec).toBeUndefined();
      for (const r of s.rivals) expect(s.buildings.filter((b) => b.owner === r.id), `${sec} ${r.id}`).toHaveLength(1);
      // 段 F：Uncommon の町は単価が高い（他社の売上も × priceMul）
      expect(rivalBase(s, s.rivals[0])).toBeCloseTo(s.rivals[0].base * priceMul(s), 6);
    }
  });

  it(
    '最短の方針の通し（タオックス → Common → Uncommon）の月ごとの売上と他社の売上の合計が、段 C の前の main と同じ',
    () => {
      const out: Record<string, number[]> = {};
      // 段 E2（カリスマ度・士気・給与）・段 F（税・単価・疲れ）・段 G（問い合わせ・満足度・炎上・企業の格）は止めて比べる（withoutHr・withoutAcct・withoutCs）
      // 段 UI4（突発のできごと・外交）も止めて比べる（withoutEvents）
      withoutEvents(() => withoutCs(() => withoutHr(() => withoutAcct(() =>
        runOnce('rta', 1, {
          onMonth: (s, sector) => {
            const rep = s.reports[s.reports.length - 1];
            (out[sector] ??= []).push(Math.round(rep.revenue), Math.round(rep.area.filter((x) => !x.me).reduce((a, x) => a + x.sales, 0)));
          },
        }),
      ))));
      const sum = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [v.length / 2, v.filter((_, i) => i % 2 === 0).reduce((a, x) => a + x, 0), v.filter((_, i) => i % 2 === 1).reduce((a, x) => a + x, 0)]]));
      // 段 C の前の main（段 E1 のヒーローの育成を含む）で同じ通しを回した値
      // 2026-11-03（v25b）：発掘のパネルが研究パネル（RP）になった・Uncommon の候補がカリスマ 10 で来る、で数字が変わった
      // （以前は { c1: [11, 414550, 1408802], c2: [6, 233900, 798526], u1: [21, 3617289, 13607557] }。docs/ISLAND_BALANCE.md の v25b）
      expect(sum).toEqual({ c1: [10, 374300, 1265068], c2: [7, 943253, 929020], u1: [16, 2812791, 9618820] });
    },
    120_000,
  );
});

describe('Rare の町：店ごとの商圏', () => {
  it('他社 1 社に RARE_AREA.stores 軒の店（本店は 1 軒）。町を作ったときの他社の売上はいままでの目安のまま', () => {
    const s = rare();
    expect(s.area).toBeTruthy();
    expect(rivalStores(s)).toHaveLength(s.rivals.length * RARE_AREA.stores);
    for (const r of s.rivals) {
      expect(s.area!.stores.filter((x) => x.rid === r.id && x.main)).toHaveLength(1);
      expect(areaBaseMul(s, r.id)).toBeCloseTo(1, 6);
      expect(rivalBase(s, r)).toBeCloseTo(rivalBase0(rivalDef(r.id)!, 'R', 'r1') * priceMul(s), 3);
    }
    // 本店は支店より引きが強く、取り分も大きいことが多い
    const share = (main: boolean) => s.area!.stores.filter((x) => !!x.main === main).reduce((a, x) => a + x.share0, 0) / s.area!.stores.filter((x) => !!x.main === main).length;
    expect(share(true)).toBeGreaterThan(share(false));
  });

  it('店の場所で取り分が変わる（家の多い所・他社の店から離れた所ほど大きい）。1 軒では町の 2 割に届かない', () => {
    const s = rare();
    const w = newStorePull(s);
    let best = 0;
    let worst = 1;
    for (let j = 0; j < s.n; j++)
      for (let i = 0; i < s.n; i++) {
        const v = areaShares(s, [{ i, j, w }]).extra[0];
        best = Math.max(best, v);
        worst = Math.min(worst, v);
      }
    expect(best).toBeGreaterThan(worst * 3);
    expect(best).toBeLessThan(0.2);
  });

  it('Rare の町の商品の売れ方も店の場所で決まる：遠い家には届かない（その商品を売らない他社の店もお客さんを引き寄せる）', () => {
    const s = rare();
    const key = 'Lantern';
    const one = capture(s, key, [{ i: 2, j: 2, w: 3, g: 'me' }])[0];
    const two = capture(s, key, [
      { i: 2, j: 2, w: 3, g: 'me' },
      { i: s.n - 3, j: s.n - 3, w: 3, g: 'me' },
    ]);
    // 離れた 2 軒目は、1 軒目とほとんど取り合わずに増える
    expect(two[0] + two[1]).toBeGreaterThan(one * 1.6);
  });
});

describe('撤退と空き店舗', () => {
  it('取り分が開店のときの quitAt を下回る月が quitMonths 続くと撤退 → 空き店舗。refill か月後から、refillMax か月までに別の他社が入る', () => {
    const s = rare();
    const x = s.area!.stores.find((y) => !y.main)!;
    const uid = x.uid;
    const rid = x.rid;
    // 開店のときの取り分を大きく見せる（いまの取り分が半分を切ったことに）
    x.share0 = x.share / (RARE_AREA.quitAt * 0.8);
    const before = rivalBase(s, s.rivals.find((r) => r.id === rid)!);
    for (let m = 0; m < RARE_AREA.quitMonths - 1; m++) expect(areaMonth(s).quit).toEqual([]);
    const q = areaMonth(s);
    expect(q.quit).toEqual([{ rid, uid }]);
    const b = s.buildings.find((y) => y.uid === uid)!;
    expect(isVacant(b)).toBe(true);
    expect(s.area!.closed).toBe(1);
    expect(s.area!.vacant.map((v) => v.uid)).toContain(uid);
    expect(rivalBase(s, s.rivals.find((r) => r.id === rid)!)).toBeLessThan(before);
    expect(storeName(s, uid, rid)).toContain(rivalDef(rid)!.name);
    // 放っておくと、別の他社が入る（refillMax か月までには必ず）
    let refill: { rid: string; uid: number }[] = [];
    let at = 0;
    for (let m = 1; m <= RARE_AREA.refillMax && !refill.length; m++) {
      refill = areaMonth(s).refill;
      at = m;
    }
    expect(at).toBeGreaterThanOrEqual(RARE_AREA.refill);
    expect(refill.map((r) => r.uid)).toEqual([uid]);
    expect(refill[0].rid).not.toBe(rid);
    expect(b.owner).toBe(refill[0].rid);
    expect(s.area!.stores.find((y) => y.uid === uid)?.main).toBe(false);
  });

  it('店が全部撤退した会社は町から撤退し、ランキングに出ない', () => {
    const s = rare();
    const rid = s.rivals[3].id;
    for (const x of s.area!.stores.filter((y) => y.rid === rid)) x.share0 = 1;
    let gone: string[] = [];
    for (let m = 0; m < RARE_AREA.quitMonths; m++) gone = areaMonth(s).gone;
    expect(gone).toEqual([rid]);
    expect(s.rivals.find((r) => r.id === rid)!.gone).toBe(true);
    expect(rivalBase(s, s.rivals.find((r) => r.id === rid)!)).toBe(0);
    const area = areaRanking(s, 0, Object.fromEntries(s.rivals.map((r) => [r.id, 1000])));
    expect(area.filter((x) => !x.me)).toHaveLength(s.rivals.length - 1);
  });

  it('調整 1：撤退のあと他社が戻る。撤退の refill か月後の締めから毎月の確率で入り、refillMax か月までに必ず。町から撤退した会社も戻ってくる', () => {
    const s = rare();
    const n0 = s.area!.stores.length;
    const sells0 = Object.fromEntries(s.rivals.map((r) => [r.id, { ...r.sells }]));
    // 全部の店を撤退させる（他社が 0 社）
    for (const x of s.area!.stores) x.share0 = 1;
    for (let m = 0; m < RARE_AREA.quitMonths; m++) areaMonth(s);
    expect(s.rivals.every((r) => r.gone)).toBe(true);
    expect(s.area!.vacant).toHaveLength(n0);
    // 1 か月目の締め：一部の空き店舗にだけ入る（確率）。撤退した会社が戻ってくる
    const r1 = areaMonth(s);
    expect(RARE_AREA.refill).toBe(1);
    expect(r1.refill.length).toBeGreaterThan(0);
    expect(r1.refill.length).toBeLessThan(n0);
    expect(r1.back!.length).toBeGreaterThan(0);
    for (const id of r1.back!) {
      const r = s.rivals.find((x) => x.id === id)!;
      expect(r.gone).toBe(false);
      // 扱う商品は町を作ったときのもの
      expect(r.sells).toEqual(sells0[id]);
      expect(rivalStores(s).some((b) => b.owner === id)).toBe(true);
    }
    // refillMax か月までには、空き店舗が全部埋まる（他社が 0 社のままにならない）
    for (let m = 2; m <= RARE_AREA.refillMax; m++) areaMonth(s);
    expect(s.area!.vacant).toHaveLength(0);
    expect(s.buildings.filter(isVacant)).toHaveLength(0);
    expect(rivalStores(s)).toHaveLength(n0);
    expect(s.rivals.filter((r) => !r.gone).length).toBeGreaterThan(0);
    // 戻った店は支店で、開店のときの取り分はいまの取り分から（その会社の売上もまた立つ）
    for (const x of s.area!.stores) expect(x.main).toBe(false);
    for (const r of s.rivals.filter((x) => !x.gone)) expect(rivalBase(s, r)).toBeGreaterThan(0);
    // 同じ町・同じ日なら、同じように戻る（シードで決まる）
    const t = rare();
    for (const x of t.area!.stores) x.share0 = 1;
    for (let m = 0; m < RARE_AREA.quitMonths; m++) areaMonth(t);
    expect(areaMonth(t).refill).toEqual(r1.refill);
  });

  it('調整 1：自社が先に空き店舗に入れば、他社は入れない', () => {
    const s = rare();
    s.buildings.push({ uid: s.nextUid++, id: 'workshop', i: 1, j: 1, dir: 'rd', left: 0, owner: 'me' });
    s.money = 100000;
    const x = s.area!.stores.find((y) => !y.main)!;
    x.share0 = 1;
    for (let m = 0; m < RARE_AREA.quitMonths; m++) areaMonth(s);
    expect(typeof takeVacant(s, x.uid)).toBe('object');
    for (let m = 0; m < RARE_AREA.refillMax + 1; m++) expect(areaMonth(s).refill.map((r) => r.uid)).not.toContain(x.uid);
    expect(s.buildings.find((b) => b.uid === x.uid)!.owner).toBe('me');
  });

  it('Rare の町の商圏は Common・Uncommon の町へ持ち込まない（セーブを読んだとき、残っていれば外して、その町の他社を戻す）', () => {
    const r = rare();
    const c = newP1(2, 'C', 'c2');
    // 前の版の不具合：Rare の町から戻った Common の町に Rare の商圏が残り、その町の他社が全部撤退していた
    c.area = r.area;
    for (const x of c.rivals) {
      x.gone = true;
      x.sells = {};
    }
    const back = deserializeP1(serializeP1(c))!;
    expect(back.area).toBeUndefined();
    expect(back.rivals.every((x) => !x.gone)).toBe(true);
    expect(back.rivals.map((x) => x.sells)).toEqual(newP1(2, 'C', 'c2').rivals.map((x) => x.sells));
  });

  it('空き店舗には自社がすぐ出店できる（よろず屋の値段 × vacant.cost・工期 vacant.days 日）。候補地にも出る', () => {
    const s = rare();
    s.buildings.push({ uid: s.nextUid++, id: 'workshop', i: 1, j: 1, dir: 'rd', left: 0, owner: 'me' });
    s.money = 100000;
    const x = s.area!.stores.find((y) => !y.main)!;
    x.share0 = 1;
    for (let m = 0; m < RARE_AREA.quitMonths; m++) areaMonth(s);
    const uid = x.uid;
    expect(siteCandidates(s, 30).some((c) => c.vacant === uid)).toBe(true);
    const cost = vacantCost(s);
    expect(cost).toBe(Math.round(P1B.general_store.cost * RARE_AREA.vacant.cost));
    const b = takeVacant(s, uid);
    expect(typeof b).toBe('object');
    expect(s.money).toBe(100000 - cost);
    const pb = s.buildings.find((y) => y.uid === uid)!;
    expect([pb.owner, pb.id, pb.left]).toEqual(['me', 'general_store', RARE_AREA.vacant.days]);
    expect(s.area!.took).toBe(1);
    expect(s.area!.vacant).toHaveLength(0);
    for (let d = 0; d < RARE_AREA.vacant.days; d++) step(s);
    expect(s.shops[uid]).toBeTruthy();
    // もう空き店舗ではない
    expect(takeVacant(s, uid)).toBe('taken');
  });

  it('他社の店の一覧：撤退の危険の大きい順', () => {
    const s = rare();
    const x = s.area!.stores[5];
    x.share0 = x.share * 3;
    const rows = storeRows(s);
    expect(rows[0].uid).toBe(x.uid);
    expect(rows[0].below).toBe(true);
    expect(rows[0].risk).toBeGreaterThan(0);
    expect(rows).toHaveLength(s.area!.stores.length);
  });
});

describe('営業の部門', () => {
  it('Rare の町に出店すると営業の部門が開く（Uncommon までは開かない）。7 部門でメニューはグループの引き出し', () => {
    const u = newP1(1, 'U', 'u1');
    expect(deptOpen(u, 'sales')).toBe(false);
    expect(menuDepts(u)).not.toContain('sales');
    const s = rare();
    expect(deptOpen(s, 'sales')).toBe(true);
    expect(menuDepts(s)).toContain('sales');
  });

  it('営業のパネル 6 枚（研究 2・お金 4）は Rare の外周・営業の枝。部門の理解度に入る', () => {
    expect(SALES_SKILLS.map((k) => [k.id, k.cat, k.tier, k.branch, k.dept])).toEqual([
      ['sa_survey', 'research', 'R', 'sales', 'sales'],
      ['sa_local', 'money', 'R', 'sales', 'sales'],
      ['sa_dominant', 'research', 'R', 'sales', 'sales'],
      ['sa_road', 'money', 'R', 'sales', 'sales'],
      ['sa_nego', 'money', 'R', 'sales', 'sales'],
      ['sa_edge', 'money', 'R', 'sales', 'sales'],
    ]);
    for (const k of SALES_SKILLS) expect(SKILL[k.id].note.length, k.id).toBeGreaterThan(5);
  });

  it('営業のパネルの効き目：地域密着・ロードサイド・差別化の売り場・ドミナント出店で自社の取り分 ↑、撤退の交渉で空き店舗の費用 ↓', () => {
    const base = rare();
    const st = rivalStores(base)[0];
    const at = (s: P1State) => {
      const w = newStorePull(s);
      return areaShares(s, [
        { i: st.i + 1, j: st.j, w },
        { i: st.i + 1, j: st.j + 1, w },
      ]).me;
    };
    const v0 = at(base);
    for (const id of ['sa_local', 'sa_road', 'sa_edge', 'sa_dominant']) {
      const s = rare();
      learn(s, id);
      expect(at(s), id).toBeGreaterThan(v0 * 1.01);
      if (SKILL[id].cat === 'money') {
        const s5 = rare();
        learn(s5, id, 5);
        expect(at(s5), `${id} Lv5`).toBeGreaterThan(at(s));
      }
    }
    const s = rare();
    learn(s, 'sa_nego');
    expect(vacantCost(s)).toBeLessThan(vacantCost(base));
  });

  it('自社の取り分は月の締めの報告に残る（先月からの動き）', () => {
    const s = rare();
    s.reports.push({ trade: { share: 0.05, prev: null, quit: [], refill: [], gone: [] } } as never);
    const r = areaMonth(s);
    expect(r.prev).toBe(0.05);
    expect(r.share).toBeCloseTo(myShare(s), 6);
  });
});

describe('セーブ（版 12）', () => {
  it('新しいゲームは版 12。商圏（店ごとの取り分・撤退の数え・空き店舗）はセーブに残る', () => {
    const s = rare();
    s.area!.stores[2].weak = 1;
    s.area!.closed = 3;
    const back = deserializeP1(serializeP1(s))!;
    expect(back.v).toBe(21);
    expect(back.area!.stores[2].weak).toBe(1);
    expect(back.area!.closed).toBe(3);
  });

  it('古いセーブ（版 11）で Rare にいる：いまの他社の店から商圏を作り直す（開店のときの取り分・他社の売上の目安はそのまま）', () => {
    const s = rare(4, 'r2');
    const o = JSON.parse(serializeP1(s));
    o.v = 11;
    delete o.area;
    // 版 11 の Rare の町は 1 社 1 軒
    const keep = new Set(o.rivals.map((r: { id: string }) => o.buildings.find((b: { owner: string }) => b.owner === r.id).uid));
    o.buildings = o.buildings.filter((b: { owner: string; uid: number }) => !o.rivals.some((r: { id: string }) => r.id === b.owner) || keep.has(b.uid));
    const back = deserializeP1(JSON.stringify(o))!;
    expect(back.v).toBe(21);
    expect(back.area).toBeTruthy();
    expect(back.area!.stores).toHaveLength(back.rivals.length);
    for (const r of back.rivals) expect(areaBaseMul(back, r.id)).toBeCloseTo(1, 6);
    // Uncommon にいる古いセーブには作らない
    const u = JSON.parse(serializeP1(newP1(4, 'U', 'u1')));
    u.v = 11;
    expect(deserializeP1(JSON.stringify(u))!.area).toBeUndefined();
  });
});
