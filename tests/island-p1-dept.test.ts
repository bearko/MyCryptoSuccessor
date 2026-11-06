/**
 * 段 B：部門の土台（11 部門・理解度・メニューとスキルツリーの並べ直し）。docs/ISLAND_PHASE1.md「部門」。
 * パネルの効き目と値段は、割り振り前（tests/fixtures/skills-before-dept.json：段 B の前の main で書き出したもの）と同じ。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { POL_PANELS, POL_PANEL_DEPT, DIG_PANELS, ACCT_SKILLS, CS_SKILLS, LEGAL_SKILLS, GA_SKILLS, MKT_SKILLS, UI5_SKILLS, DEPT, DEPTS, HR_SKILLS, DEPT_MARKS, DEPT_SKILLS, REQUIRES_ORIG, SKILL, SKILLS, deptOf, levelCost, maxLv, rpCost, shownOf } from '../src/island/p1/data';
import { deptLevel, deptNews, deptOpen, deptReady, menuDepts, menuLayout, nextMark } from '../src/island/p1/dept';
import { deserializeP1, newP1, serializeP1 } from '../src/island/p1/model';
import { DEPT_LAYOUT, EDGES, HUBPOS, HUB_BOX, KNOTPOS, POS, RING_OUT, SLACK, UNPLACED, groupOf } from '../src/island/p1/treelayout';
import { TUT } from '../src/island/p1/tut';
/** 段 K の経営方針のパネル（POL_SKILLS）は別に数える（tests/island-p1-stagek.test.ts） */
const noPol = <T extends { id: string }>(xs: T[]) => xs.filter((k) => !POL_PANELS.includes(k.id));

const BEFORE = JSON.parse(readFileSync(new URL('./fixtures/skills-before-dept.json', import.meta.url), 'utf8')) as Record<string, unknown>[];

describe('部門の定義（DEPTS）', () => {
  it('11 部門。名前・色・アイコン・グループ・開くランク（Common 6・Uncommon 3・Rare 1・Epic 1）・中身ができる段', () => {
    expect(DEPTS.map((d) => d.id).sort()).toEqual(['accounting', 'general', 'hr', 'legal', 'logistics', 'marketing', 'rnd', 'sales', 'strategy', 'support', 'systems']);
    const by = (tier: string) => DEPTS.filter((d) => d.opens === tier).map((d) => d.id).sort();
    expect(by('C')).toEqual(['hr', 'logistics', 'marketing', 'rnd', 'strategy', 'systems']);
    expect(by('U')).toEqual(['accounting', 'general', 'support']);
    expect(by('R')).toEqual(['sales']);
    expect(by('E')).toEqual(['legal']);
    expect([DEPT.sales.stage, DEPT.accounting.stage, DEPT.general.stage, DEPT.support.stage, DEPT.legal.stage]).toEqual(['C', 'F', 'F', 'G', 'H']);
    for (const g of ['biz', 'strat', 'admin', 'base']) expect(DEPTS.some((d) => d.group === g)).toBe(true);
    expect(DEPT.systems.group).toBe('base');
    for (const d of DEPTS) expect([d.name, d.short, d.icon, d.color].every(Boolean), d.id).toBe(true);
  });

  it('理解度の節目は 1 か所（3 チームリーダー・8 事業部長・15/25/40 奥義）', () => {
    expect(DEPT_MARKS.map((m) => m.at)).toEqual([3, 8, 15, 25, 40]);
    expect(nextMark(0)).toMatchObject({ at: 3, left: 3 });
    expect(nextMark(12)).toMatchObject({ at: 15, left: 3 });
    expect(nextMark(40)).toBeNull();
  });
});

describe('パネルの部門の割り振り', () => {
  it('すべてのパネルに部門がある。法務は段 H2 の 4 枚（営業は段 C の 6 枚・経理は段 F の 6 枚・カスタマーサポートは段 G の 4 枚）、総務は人材の枝の職場の環境のもの（段 F の 3 枚を足して 12 枚）', () => {
    for (const k of SKILLS) expect(DEPT[deptOf(k)], k.id).toBeTruthy();
    expect(noPol(DEPT_SKILLS.legal).map((k) => k.id)).toEqual(LEGAL_SKILLS.map((k) => k.id));
    expect(noPol(DEPT_SKILLS.support).map((k) => k.id)).toEqual(CS_SKILLS.map((k) => k.id));
    for (const k of [...CS_SKILLS, ...MKT_SKILLS]) expect([k.branch, k.tier], k.id).toEqual(['shop', 'U']);
    for (const k of MKT_SKILLS) expect(deptOf(k), k.id).toBe('marketing');
    expect(noPol(DEPT_SKILLS.accounting).map((k) => k.id)).toEqual(ACCT_SKILLS.map((k) => k.id));
    expect(noPol(DEPT_SKILLS.general)).toHaveLength(12);
    for (const k of GA_SKILLS) expect(deptOf(k), k.id).toBe('general');
    expect(noPol(DEPT_SKILLS.sales).map((k) => k.id)).toEqual(['sa_survey', 'sa_local', 'sa_dominant', 'sa_road', 'sa_nego', 'sa_edge']);
    expect(DEPT_SKILLS.general.map((k) => k.id)).toEqual(expect.arrayContaining(['lounge', 'shift', 'welfare']));
    for (const k of DEPT_SKILLS.general) expect(k.branch).toBe('people');
    // 物流：調達・製造・物流・技の枝はすべて
    for (const k of SKILLS.filter((x) => ['buy', 'craft', 'logi', 'tech'].includes(x.branch))) expect(deptOf(k), k.id).toBe('logistics');
    // 販売の枝：売り場の運営・店舗は物流、宣伝・ブランド・見せ方はマーケ
    for (const id of ['host', 'display', 'hours', 'shop2', 'shop3', 'd_shop', 'concierge']) expect(deptOf(SKILL[id]), id).toBe('logistics');
    for (const id of ['vmd', 'pop', 'golden', 'b_sign', 'fair', 'b_premium', 'd_ops', 'b_ads']) expect(deptOf(SKILL[id]), id).toBe('marketing');
    for (const k of SKILLS.filter((x) => x.branch === 'shop')) expect(['logistics', 'marketing', 'support'], k.id).toContain(deptOf(k));
    // 経営 → 経営企画（ブランドのものはマーケ）・発掘 → R&D（寄付・無限の強化パネルも）・システム → システム
    // 段 K の経営方針のパネル（POL_SKILLS）は、その部門（POL_PANEL_DEPT）
    for (const k of SKILLS.filter((x) => x.branch === 'ops' && !ACCT_SKILLS.includes(x) && !POL_PANELS.includes(x.id))) expect(['strategy', 'marketing'], k.id).toContain(deptOf(k));
    for (const id of POL_PANELS) expect(deptOf(SKILL[id]), id).toBe(POL_PANEL_DEPT[id]);
    for (const k of ACCT_SKILLS) expect([k.branch, deptOf(k)], k.id).toEqual(['ops', 'accounting']);
    for (const k of SKILLS.filter((x) => x.branch === 'dig')) expect(deptOf(k), k.id).toBe('rnd');
    for (const k of SKILLS.filter((x) => x.branch === 'sys')) expect(deptOf(k), k.id).toBe('systems');
    expect(deptOf(SKILL.dig_donate)).toBe('rnd');
    expect(deptOf(SKILL.u_dig_speed_inf)).toBe('rnd');
  });

  it('効き目・値段・先に要るパネル・外周のランク・エンブレムの条件は、割り振り前と同じ', () => {
    // 段 C で足した営業のパネル（営業の枝）・段 E2 で足した人事のパネル（HR_SKILLS）・段 F の経理と総務のパネルは除いて比べる
    // 段 G のカスタマーサポート・マーケのパネル（CS_SKILLS・MKT_SKILLS）も除く
    // 段 H2 の法務のパネル（法務の枝）も除く。M&A の遊びに合わせて見直した Epic の 2 枚（M&A 部門・工芸の工房の買収）は効き目だけを比べから外す
    // 段 UI5a で足した調達の交代要員（UI5_SKILLS）も除く。段 DIG3 で足した発掘の「貫通」も除く
    expect(SKILLS.filter((k) => k.branch !== 'sales' && k.branch !== 'legal' && !HR_SKILLS.includes(k) && !ACCT_SKILLS.includes(k) && !GA_SKILLS.includes(k) && !CS_SKILLS.includes(k) && !MKT_SKILLS.includes(k) && !UI5_SKILLS.includes(k.id) && !POL_PANELS.includes(k.id) && k.id !== 'dig_pierce').map((k) => k.id)).toEqual(BEFORE.map((x) => x.id));
    for (const b of BEFORE) {
      const k = SKILL[b.id as string];
      // 段 UI5b：先に要るものは、つながりの見直し（treelinks.ts）の前のもの（REQUIRES_ORIG）で比べる。見直しは tests/island-p1-ui5b.test.ts
      // 発掘の枝の 17 枚は研究パネル（RP）になった（2026-11-03）：区分・値段・Lv が変わるので、名前・先に要るもの・ランクだけ比べる
      if (DIG_PANELS.includes(b.id as string)) {
        expect([k.name, REQUIRES_ORIG[k.id] ?? [], k.tier ?? 'C', k.emblem ?? null], k.id).toEqual([b.name, b.requires, b.tier, b.emblem]);
        continue;
      }
      if (b.id === 'e_ops_1' || b.id === 'e_tech_2') {
        expect([k.name, k.cost, rpCost(k), k.cat, REQUIRES_ORIG[k.id], k.tier], k.id).toEqual([b.name, b.cost, b.rp, b.cat, b.requires, b.tier]);
        continue;
      }
      // 調整 v25c：無限の強化パネルの「手前の Lv5」は、手前（手早い掘り方など）が研究パネル（レベルなし）になったので外した（持っていればよい）
      if (k.inf && k.branch === 'dig') expect(k.reqLv ?? null, k.id).toBeNull();
      const now = { id: k.id, name: k.name, note: k.note, cost: k.cost, rp: rpCost(k), cat: k.cat, max: maxLv(k) === Infinity ? 'inf' : maxLv(k), lv5: maxLv(k) >= 5 && maxLv(k) !== Infinity ? levelCost(k, 5) : null, requires: REQUIRES_ORIG[k.id] ?? [], reqLv: k.inf && k.branch === 'dig' ? b.reqLv : (k.reqLv ?? null), anyOf: k.anyOf ?? null, brand: k.brand ?? null, tier: k.tier ?? 'C', emblem: k.emblem ?? null, big: !!k.big, train: k.train ?? null, fx: k.fx ?? null, up: k.up ?? null, shown: shownOf(k) };
      expect(JSON.parse(JSON.stringify(now)), k.id).toEqual(b);
    }
  });
});

describe('部門の理解度（deptLevel）', () => {
  it('取ったパネルの Lv の合計：研究パネルは取ったら 1、お金パネルは Lv の数、無限の強化パネルは Lv。寄付は数えない', () => {
    const s = newP1(1);
    expect(DEPTS.map((d) => deptLevel(s, d.id))).toEqual(DEPTS.map(() => 0));
    // お金パネル（接客の研修 Lv3）・研究パネル（品出しの名人）
    s.skills = ['host', 'display', 'vmd', 'u_dig_speed_inf', 'dig_ext', 'hire'];
    s.skillLv = { host: 3, u_dig_speed_inf: 4, dig_ext: 2 };
    s.rpBuys = 5;
    expect(SKILL.host.cat).toBe('money');
    expect(SKILL.display.cat).toBe('research');
    expect(deptLevel(s, 'logistics')).toBe(3 + 1);
    expect(deptLevel(s, 'marketing')).toBe(1);
    // 発掘のパネルは研究パネル（RP）になった（2026-11-03）：取ったら 1（Lv は数えない）
    expect(deptLevel(s, 'rnd')).toBe(4 + 1);
    expect(deptLevel(s, 'hr')).toBe(1);
    expect(deptLevel(s, 'accounting')).toBe(0);
  });
});

describe('開く部門とメニュー', () => {
  it('はじめは Common の 6 部門がメニューに出る。中身の無い部門（法務）と、まだ開くランクに達していない営業・経理・総務・CS は出ない', () => {
    const s = newP1(1);
    expect(menuDepts(s)).toEqual(['marketing', 'logistics', 'systems', 'rnd', 'hr', 'strategy']);
    for (const d of ['accounting', 'general', 'support', 'sales', 'legal'] as const) expect(deptOpen(s, d), d).toBe(false);
    // 段 H1：法務の中身（部門の演出と紹介・次の更新の札）ができた（Epic に出店すると開く）
    expect(deptReady('legal')).toBe(true);
    // 段 C：営業の中身はできた（Rare に出店すると開く）。段 F：経理・総務・段 G：CS の中身もできた（Uncommon に出店すると開く）
    for (const d of ['sales', 'accounting', 'general', 'support'] as const) expect(deptReady(d), d).toBe(true);
  });

  it('Uncommon に出店すると経理・総務・CS は開くランクに達する。中身ができた経理・総務（段 F）・CS（段 G）はメニューに出る', () => {
    const s = newP1(1);
    s.tier = 'U';
    for (const d of ['accounting', 'general', 'support'] as const) expect(deptOpen(s, d), d).toBe(true);
    expect(deptOpen(s, 'sales')).toBe(false);
    expect(menuDepts(s)).toHaveLength(9);
    expect(menuDepts(s)).toContain('support');
    // 段 F まで（CS の中身の前）は 8 部門
    expect(menuDepts(s, 'F')).not.toContain('support');
    // 段 E2 まで（段 D）は 6 部門のまま
    expect(menuDepts(s, 'D')).toHaveLength(6);
    // 段 F ができたら（経理と総務）
    expect(menuDepts(s, 'F')).toEqual(['marketing', 'logistics', 'systems', 'rnd', 'hr', 'general', 'accounting', 'strategy']);
    // 段 C（営業）ができても、Rare に出店するまでは出ない
    expect(menuDepts(s, 'C')).not.toContain('sales');
    s.tier = 'R';
    expect(menuDepts(s, 'C')).toContain('sales');
  });

  it('6 つまでは左 3・真ん中の経営企画・右 2。7 つ以上はグループ（事業・戦略・管理・基盤）の引き出し（経営企画は真ん中のまま）', () => {
    const six = menuLayout(['marketing', 'logistics', 'systems', 'rnd', 'hr', 'strategy']);
    expect(six).toEqual({ kind: 'flat', left: ['logistics', 'hr', 'rnd'], center: 'strategy', right: ['marketing', 'systems'] });
    const eight = menuLayout(['marketing', 'logistics', 'systems', 'rnd', 'hr', 'general', 'accounting', 'strategy']);
    expect(eight.kind).toBe('groups');
    if (eight.kind !== 'groups') return;
    expect(eight.center).toBe('strategy');
    expect(eight.groups.map((g) => g.id)).toEqual(['biz', 'strat', 'admin', 'base']);
    expect(eight.groups.find((g) => g.id === 'admin')!.depts).toEqual(['hr', 'general', 'accounting']);
    expect(eight.groups.find((g) => g.id === 'strat')!.depts).toEqual(['marketing', 'rnd']);
    // 11 部門すべてでも、どの部門もどこかのグループに 1 回だけ
    const all = menuLayout(DEPTS.map((d) => d.id));
    if (all.kind !== 'groups') throw new Error('groups');
    expect([...all.groups.flatMap((g) => g.depts), all.center].sort()).toEqual(DEPTS.map((d) => d.id).sort());
  });

  it('チュートリアルの光らせる場所は部門のメニュー（経営企画 → 建築・物流 → 調達・物流 → サプライチェーン・経営企画（スキルツリー）・マーケ → 企業ランキング）。順番は前と同じ', () => {
    const s = newP1(1);
    const hl = TUT.map((x) => (typeof x.hl === 'function' ? x.hl(s) : x.hl) ?? '');
    // 段 B の前：plan:build・speed・scm:buy・plan:build・speed・hr:staff・scm:flow・skill・hr・speed・mkt:ranking（名前だけ部門に）
    expect(TUT.map((x) => x.id)).toEqual(['workshop', 'wsWait', 'craft', 'mats', 'shop', 'shopWait', 'sell', 'haul', 'firstSale', 'scm', 'recruit', 'hire', 'month', 'ranking']);
    expect(hl.filter(Boolean)).toEqual(['strategy:build', 'speed', 'logistics:buy', 'strategy:build', 'speed', 'hr:staff', 'logistics:flow', 'strategy', 'hr', 'speed', 'marketing:ranking']);
    for (const x of hl.filter((v) => v && v !== 'speed')) expect(DEPT[x.split(':')[0] as keyof typeof DEPT], x).toBeTruthy();
  });
});

describe('部門のお知らせ（トースト）', () => {
  it('はじめはお知らせ済みにするだけ。理解度が節目に届いたら 1 回だけ（2 回目は出ない）', () => {
    const s = newP1(1);
    expect(deptNews(s)).toEqual([]);
    s.skills = ['host', 'display'];
    s.skillLv = { host: 2 };
    const a = deptNews(s);
    expect(a).toHaveLength(1);
    expect(a[0]).toContain('物流の理解度が 3');
    expect(a[0]).toContain('置けるようになった');
    expect(deptNews(s)).toEqual([]);
    // 新しく開いた部門（段 F ができて、Uncommon に出店した）
    s.tier = 'U';
    const b = deptNews(s, 'F');
    expect(b.join()).toContain('新しい部門：総務');
    expect(b.join()).toContain('新しい部門：経理');
    expect(deptNews(s, 'F')).toEqual([]);
  });
});

describe('セーブ（版 11）', () => {
  it('新しいゲームは版 11。版 10 の古いセーブは、取ったパネル・レベルがそのまま版 11 になり、届いていた節目はまとめて出さない', () => {
    expect(newP1(1).v).toBe(28);
    const s = newP1(2);
    s.skills = ['host', 'display', 'vmd', 'golden', 'jig', 'lounge', 'shift'];
    s.skillLv = { host: 5, jig: 3 };
    const o = JSON.parse(serializeP1(s));
    o.v = 10;
    delete o.flags.depts;
    delete o.flags.deptMarks;
    const back = deserializeP1(JSON.stringify(o))!;
    expect(back.v).toBe(28);
    expect(back.skills).toEqual(s.skills);
    expect(back.skillLv).toEqual(s.skillLv);
    expect(deptLevel(back, 'logistics')).toBe(5 + 1 + 3);
    expect(deptLevel(back, 'general')).toBe(2);
    expect(deptNews(back)).toEqual([]);
    expect(back.flags.deptMarks?.logistics).toBe(2);
    // 版 11 で保存し直しても、お知らせ済みのまま
    const again = deserializeP1(serializeP1(back))!;
    expect(again.flags.deptMarks?.logistics).toBe(2);
    expect(deptNews(again)).toEqual([]);
  });
});

describe('スキルツリー：11 本の部門の枝', () => {
  it('どのパネルも並んでいて、部門の枝（束）の中にある。枝の幅は足りている（余り ≥ 0）', () => {
    expect(UNPLACED).toEqual([]);
    expect(SLACK).toBeGreaterThanOrEqual(0);
    for (const k of SKILLS) expect(groupOf(k.id)?.dept, k.id).toBe(deptOf(k));
    expect(Object.keys(DEPT_LAYOUT).sort()).toEqual(DEPTS.map((d) => d.id).sort());
    expect(HUBPOS.size).toBe(11);
    // パネルの数が多い部門ほど枝が広い（物流がいちばん広い・パネルの無い部門がいちばん細い）
    const w = (d: keyof typeof DEPT_LAYOUT) => DEPT_LAYOUT[d].w;
    for (const d of DEPTS) if (d.id !== 'logistics') expect(w('logistics')).toBeGreaterThan(w(d.id));
    for (const d of ['accounting', 'support', 'legal'] as const) for (const x of ['hr', 'marketing', 'systems', 'strategy', 'rnd'] as const) expect(w(d)).toBeLessThan(w(x));
    expect(RING_OUT.L).toBeLessThanOrEqual(21);
  });

  it('パネルは自分の部門の枝の角度の中（隣の枝にはみ出さない）', () => {
    for (const k of SKILLS) {
      const g = groupOf(k.id)!;
      const p = POS.get(k.id)!;
      const a = Math.atan2(p.y, p.x);
      const d = Math.abs(Math.atan2(Math.sin(a - g.a), Math.cos(a - g.a)));
      // 大きめの研究パネル（根もとの近く）は束の幅を少し出てよい
      expect(d, k.id).toBeLessThanOrEqual(g.w / 2 + (k.big || k.donate ? 0.12 : 1e-6));
    }
  });

  it('根もとの札どうしは重ならない（1 行の札の大きさ）。束の節もパネルと重ならない', () => {
    const hubs = [...HUBPOS.entries()];
    for (let i = 0; i < hubs.length; i++)
      for (let j = i + 1; j < hubs.length; j++) {
        const [a, b] = [hubs[i][1], hubs[j][1]];
        const over = Math.abs(a.x - b.x) < HUB_BOX.w + 0.06 && Math.abs(a.y - b.y) < HUB_BOX.h + 0.06;
        expect(over, `${hubs[i][0]}–${hubs[j][0]}`).toBe(false);
      }
    expect(KNOTPOS.size).toBe(5);
    for (const [g, p] of KNOTPOS) for (const [id, q] of POS) expect(Math.hypot(p.x - q.x, p.y - q.y), `${g}–${id}`).toBeGreaterThan(0.75);
  });

  it('線は 11 本の枝のどれかの束から。先に要るパネルが別の部門の線は、隣どうしの部門だけ', () => {
    const order = DEPTS.map((d) => d.id);
    const near = (a: string, b: string) => {
      const i = order.indexOf(a as (typeof order)[number]);
      const j = order.indexOf(b as (typeof order)[number]);
      return Math.min((i - j + order.length) % order.length, (j - i + order.length) % order.length) <= 1;
    };
    for (const e of EDGES) {
      expect(groupOf(e.to)?.key).toBe(e.g);
      if (e.from) expect(near(deptOf(SKILL[e.from]), e.br), `${e.from} → ${e.to}`).toBe(true);
    }
  });
});
