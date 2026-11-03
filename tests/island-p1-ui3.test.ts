// 段 UI3（docs/ISLAND_PHASE1.md「画面の並び（UI3）」）：画面の数（Common 22 以下・Epic 30 以下）・まとめた画面の飛び先
// （前のサブタブの key・チュートリアルで開くサブタブ）・建物の吹き出しの指示（担当のヒーロー・見込み・ひと言 30 字）・お店の設備投資の並び。DOM なし
import { describe, expect, it } from 'vitest';
import { DEPTS, type DeptId } from '../src/island/p1/data';
import { SUB_ALIAS, SUB_DEFS, resolveSub, subCount, subDefs } from '../src/island/p1/menus';
import { ACK_MAX, ackOf, greetOf, investGain, ordersOf, shelfGain, shelfPicks, shopInvestOrder, craftable } from '../src/island/p1/orders';
import { TONES, toneOf } from '../src/island/p1/persona';
import { TUT, hlOf } from '../src/island/p1/tut';
import { deserializeP1, jamOf, myShops, myWorkshop, newP1, sellNow, sellWhatIf, serializeP1, type P1State } from '../src/island/p1/model';
import { menuDepts } from '../src/island/p1/dept';
import { runOnce } from '../scripts/island/sim';
import raw from '../src/generated/catalog.json';


const COMMON: DeptId[] = ['logistics', 'strategy', 'hr', 'rnd', 'marketing', 'systems'];
const ALL: DeptId[] = DEPTS.map((d) => d.id);

/** タオックスで ④ 販売が詰まっている月（自動プレイの最短の方針の写し） */
let sellSave: string | null = null;
function sellJam(): P1State {
  if (!sellSave)
    runOnce('rta', 1, {
      onlyFirst: true,
      onMonth: (s, _sector, m) => {
        if (!sellSave && m >= 2 && myShops(s).length && jamOf(s) === 'sell') sellSave = serializeP1(s);
      },
    });
  const s = deserializeP1(sellSave!)!;
  s.tut = 99;
  return s;
}

describe('画面の数（サブタブ）', () => {
  it('Common は 22 以下、Epic（11 部門）は 30 以下', () => {
    expect(menuDepts(newP1(1)).sort()).toEqual([...COMMON].sort());
    expect(subCount(COMMON)).toBeLessThanOrEqual(22);
    expect(subCount(ALL)).toBeLessThanOrEqual(30);
    // 段 UI3 の目安：Common 29 → 21、Epic 38 → 29
    expect(subCount(COMMON)).toBe(21);
    expect(subCount(ALL)).toBe(29);
  });
  it('経理が開くと、決算書は経営企画から経理へ（同じ画面が 2 つに出ない）', () => {
    expect(subDefs('strategy', COMMON).some((x) => x.key === 'books')).toBe(true);
    expect(subDefs('strategy', ALL).some((x) => x.key === 'books')).toBe(false);
    expect(subDefs('accounting', ALL).some((x) => x.key === 'books')).toBe(true);
  });
  it('どの部門もサブタブは 5 つまで（スマホで横にずらさずに 1 行に並ぶ）・スマホの短い名前は 8 字まで', () => {
    for (const m of ALL) {
      const xs = subDefs(m, COMMON);
      expect(xs.length).toBeLessThanOrEqual(5);
      for (const x of xs) expect(x.short.length).toBeLessThanOrEqual(8);
    }
  });
  it('まとめた画面の部分は、ほかのサブタブと重ならない（1 つの画面は 1 か所だけ）', () => {
    const seen = new Map<string, string>();
    for (const [m, xs] of Object.entries(SUB_DEFS()))
      for (const x of xs)
        for (const p of x.parts) {
          // 決算書は経営企画（Common）と経理（Uncommon から）の付け替え。問い合わせは受け箱（経営企画）にも並べる
          if (p === 'books' || (p === 'inbox' && x.key === 'props')) continue;
          expect(seen.get(p), `${m}:${x.key} の ${p}`).toBeUndefined();
          seen.set(p, `${m}:${x.key}`);
        }
  });
});

describe('まとめた画面の飛び先', () => {
  it('前のサブタブの key は、まとめた画面のその部分へ開く', () => {
    const cases: [DeptId, string, DeptId, string, string][] = [
      ['marketing', 'outlook', 'marketing', 'data', 'outlook'],
      ['marketing', 'pr', 'marketing', 'ranking', 'pr'],
      ['logistics', 'bom', 'logistics', 'buy', 'bom'],
      ['hr', 'side', 'hr', 'staff', 'side'],
      ['strategy', 'ceo', 'hr', 'hire', 'ceo'],
      ['support', 'sat', 'support', 'inbox', 'sat'],
      ['systems', 'pace', 'systems', 'settings', 'pace'],
      ['systems', 'save', 'systems', 'settings', 'save'],
    ];
    for (const [m, k, m2, k2, part] of cases) {
      const r = resolveSub(m, k, ALL);
      expect(r, `${m}:${k}`).toEqual({ m: m2, key: k2, part });
      // 飛び先のサブタブは、その部分を持っている
      expect(subDefs(m2, ALL).find((x) => x.key === k2)?.parts).toContain(part);
    }
    // 経営企画の M&A（準備中の札）は外した：法務が開いていれば法務の M&A
    expect(resolveSub('strategy', 'ma', ALL)).toEqual({ m: 'legal', key: 'ma', part: 'ma' });
    expect(resolveSub('strategy', 'ma', COMMON)).toBeNull();
    expect(resolveSub('marketing', 'nope', ALL)).toBeNull();
    for (const k of Object.keys(SUB_ALIAS)) expect(resolveSub(k.split(':')[0] as DeptId, k.split(':')[1], ALL)).not.toBeNull();
  });
  it('いまのサブタブの key（カード・報告のボタン・チュートリアルの goSub）はそのまま開く', () => {
    for (const [m, k] of [['support', 'inbox'], ['accounting', 'tax'], ['hr', 'hire'], ['hr', 'staff'], ['legal', 'ma'], ['logistics', 'buy'], ['logistics', 'flow'], ['marketing', 'ranking'], ['sales', 'area'], ['strategy', 'build'], ['strategy', 'props']] as [DeptId, string][])
      expect(resolveSub(m, k, ALL)).toEqual({ m, key: k, part: null });
  });
  it('チュートリアルで押すサブタブは同じ key・同じ名前（マインちゃんの「「○○」を押そう！」の文が変わらない）・まとめた画面の 1 つ目が前の画面', () => {
    const s = newP1(1);
    const names: Record<string, string> = { 'strategy:build': '建築', 'logistics:buy': '調達', 'hr:staff': 'ヒーローの配置', 'logistics:flow': 'サプライチェーン', 'hr:hire': '人材登用', 'marketing:ranking': '企業ランキング' };
    const first: Record<string, string> = { 'strategy:build': 'build', 'logistics:buy': 'buy', 'hr:staff': 'staff', 'logistics:flow': 'flow', 'hr:hire': 'hire', 'marketing:ranking': 'ranking' };
    const seen = new Set<string>();
    for (const st of TUT) {
      for (const hired of [false, true]) {
        const hl = hlOf(st, hired ? { ...s, staff: [...s.staff, { ...s.staff[0], hero: 424242 }], flags: { ...s.flags, hireUnlocked: true } } : s);
        const [m, k] = hl.split(':');
        if (!k || m === 'speed') continue;
        seen.add(hl);
        const x = subDefs(m as DeptId, COMMON).find((y) => y.key === k);
        expect(x, hl).toBeDefined();
        expect(x!.name).toBe(names[hl]);
        expect(x!.short).toBe(names[hl]);
        expect(x!.parts[0]).toBe(first[hl]);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });
});

describe('建物の吹き出し：担当のヒーローへの指示', () => {
  it('お店：店長（その店の店員）が話し手で、棚を増やして並べる・品を入れ替える・宣伝を頼む。棚の指示に「+N 個／月」と値段', () => {
    const s = sellJam();
    const b = myShops(s).find((x) => s.shops[x.uid]?.staff != null)!;
    const box = ordersOf(s, b)!;
    expect(box.place).toBe('shop');
    expect(box.hero).toBe(s.shops[b.uid].staff);
    expect(box.role.text).toContain('店長');
    expect(box.orders.map((o) => o.k)).toEqual(expect.arrayContaining(['shelf', 'swap', 'ad']));
    expect(box.orders.length).toBeGreaterThanOrEqual(2);
    expect(box.orders.length).toBeLessThanOrEqual(4);
    const shelf = box.orders.find((o) => o.k === 'shelf')!;
    if (!shelf.off) {
      expect(shelf.sub).toMatch(/個／月/);
      expect(shelf.units!).toBeGreaterThan(0);
    }
    // 宣伝の指示：この町で元が取れるか（adGain）を添える
    expect(box.orders.find((o) => o.k === 'ad')!.sub).toMatch(/見込み|元が取れない|実施中/);
  });
  it('棚を増やして並べる見込みは、SCM の「棚 +1・別の商品」と同じ計算（sellNow を写しに当てる）', () => {
    const s = sellJam();
    const w = sellWhatIf(s).find((x) => x.kind === 'shelf');
    if (!w) return;
    const x = craftable(s).find((y) => y.startsWith(`${w.key}:`))!;
    const g = shelfGain(s, w.uid!, x)!;
    expect(g.add).toBe(true);
    expect(g.units).toBeCloseTo(w.units, 6);
    expect(g.cost).toBe(w.cost);
  });
  it('並べる商品の候補はまだその店に無い商品だけで、見込みの大きい順（作り手のいる商品が先）', () => {
    const s = sellJam();
    const b = myShops(s)[0];
    const on = s.shops[b.uid].shelves.filter(Boolean).map((y) => y!.split(':')[0]);
    const ps = shelfPicks(s, b.uid);
    expect(ps.length).toBeGreaterThan(0);
    for (const p of ps) expect(on).not.toContain(p.x.split(':')[0]);
    // 同じ組（ほかの商品を止めずに作れる・作業台を切り替えると止まる・作り手がいない）の中では見込みの大きい順。組はこの順
    const rank = (p: (typeof ps)[number]) => (p.ok ? (p.stops ? 1 : 2) : 0);
    for (let k = 1; k < ps.length; k++) {
      expect(rank(ps[k - 1])).toBeGreaterThanOrEqual(rank(ps[k]));
      if (rank(ps[k - 1]) === rank(ps[k])) expect(ps[k - 1].units).toBeGreaterThanOrEqual(ps[k].units);
    }
    const ok = ps.filter((p) => p.ok);
    // 作っていない商品は、作業台を 1 台その商品に替える（作り手）
    for (const p of ok) if (!s.slots.some((sl) => sl.sku && sl.sku.split(':')[0] === p.x.split(':')[0]) && p.make != null) expect(s.slots[p.make].worker).not.toBeNull();
  });
  it('工房：職人が話し手で、作る物を変える・作業台を足す（製造の見込みと値段）。卸問屋：調達係（いなければ「担当を置く」）', () => {
    const s = sellJam();
    const ws = ordersOf(s, myWorkshop(s)!)!;
    expect(ws.place).toBe('workshop');
    expect(s.slots.some((sl) => sl.worker === ws.hero)).toBe(true);
    expect(ws.orders.map((o) => o.k)).toEqual(expect.arrayContaining(['make', 'bench']));
    const bench = ws.orders.find((o) => o.k === 'bench')!;
    if (!bench.off) expect(bench.sub).toMatch(/製造 \+[\d.]+ 個／月/);
    // 販売が詰まりの月は、作業台を足しても売上は増えない（いちばん効く手にしない・詰まりの段を添える）
    expect(bench.rec).toBeFalsy();
    expect(bench.sub).toContain('④ 販売');
    const wh = s.buildings.find((x) => x.id === 'wholesale')!;
    const buy = ordersOf(s, wh)!;
    expect(buy.place).toBe('wholesale');
    const buyer = s.staff.find((x) => x.task === 'buy');
    expect(buy.hero).toBe(buyer?.hero ?? null);
    if (!buyer) expect(buy.orders[0].k).toBe('buyer');
    expect(buy.orders.map((o) => o.k)).toContain('buyopen');
    // 担当がいないお店は「担当を置く」が先頭
    const b = myShops(s)[0];
    const s2 = deserializeP1(serializeP1(s))!;
    s2.shops[b.uid].staff = null;
    const box2 = ordersOf(s2, b)!;
    expect(box2.hero).toBeNull();
    expect(box2.orders[0].k).toBe('clerk');
    // 他社の店・家は指示なし
    const rival = s.buildings.find((x) => x.owner !== 'me' && x.owner !== 'town')!;
    expect(ordersOf(s, rival)).toBeNull();
  });
  it('担当のひと言・指示を受けたひと言は 30 字まで（口調の型 8 種すべて）', () => {
    const heroes = (raw as { heroes: { id: number }[] }).heroes.map((x) => x.id);
    const byTone = new Map<string, number>();
    for (const id of heroes) if (!byTone.has(toneOf(id))) byTone.set(toneOf(id), id);
    expect(byTone.size).toBe(TONES.length);
    for (const id of byTone.values()) {
      expect(greetOf(id).length).toBeLessThanOrEqual(ACK_MAX);
      const a = ackOf(id, '糸切り鋏に切り替えます');
      expect(a.length).toBeLessThanOrEqual(ACK_MAX);
      expect(a).toContain('糸切り鋏に切り替えます');
      expect(ackOf(id, 'あ'.repeat(40)).length).toBeLessThanOrEqual(ACK_MAX);
    }
  });
});

describe('お店の設備投資：いま効く順・見込み', () => {
  it('序盤（販売が詰まり・処理力は余っている）は、棚を増やすが上、陳列の什器・裏の倉庫は効かない（下に薄く）', () => {
    const s = sellJam();
    const b = myShops(s)[0];
    const xs = shopInvestOrder(s, b);
    expect(xs.length).toBe(5);
    const weak = xs.filter((x) => x.weak).map((x) => x.id);
    expect(weak).toEqual(expect.arrayContaining(['fixtures', 'backroom']));
    // 効くものが先、効かないものがあと
    const firstWeak = xs.findIndex((x) => x.weak);
    if (firstWeak >= 0) for (const x of xs.slice(firstWeak)) expect(x.weak).toBe(true);
    // 棚を増やすの見込み（別の商品を並べたとき）はプラス
    if (xs.find((x) => x.id === 'shelves')) expect(investGain(s, b, 'shelves')).toBeGreaterThan(0.5);
    // 見込みの計算は状態を書き換えない
    const before = sellNow(s).units;
    shopInvestOrder(s, b);
    expect(sellNow(s).units).toBe(before);
  });
});
