// 段 K（docs/SUCCESSOR_ROADMAP.md「段 K の実装」・docs/ISLAND_PHASE1.md「経営方針（段 K）」）：全社方針と事業別の方針・効き目・開放・経営方針発表会。
// 表（数・石板とパネルの割り当て・＋だけ）・効き目の式（部門のレベル・部長の能力で増える）・枠の数・開放（石板・パネル・理解度の条件）・発表会の決定・
// 変えられる時期・提案の傾向・推奨の重み・自動プレイの選び方・セーブ（版 26 → 27 → 28）・止めたとき・セリフ 60 字
import { beforeAll, describe, expect, it } from 'vitest';
import { DEPTS, POL, POLICIES, POLICY_OF, POL_PANELS, POL_SKILLS, SKILL, TABLETS, TABLET_KNOW, type DeptId } from '../src/island/p1/data';
import {
  KNOW_TALK,
  POL_OFF,
  SLOT_TALK,
  activePolicies,
  canSetCorp,
  canSetDept,
  corpOf,
  deptPolicyOf,
  isOpen,
  meetingsOn,
  openPolicies,
  polAutoFill,
  polFx,
  polOf,
  polPower,
  polSync,
  presDepts,
  presDue,
  presPickCorp,
  presPickDept,
  recCorp,
  recDept,
  setCorp,
  setDept,
  slotsOf,
  tabletKnow,
  takePolNews,
  themesOf,
  tiltOf,
  weightsOf,
} from '../src/island/p1/policy';
import { boardAgenda, boardFinish, boardOf, boardQuarter, yearOfBoard } from '../src/island/p1/board';
import { budgetDepts, laborCap } from '../src/island/p1/budget';
import { headOf, quality, setHead } from '../src/island/p1/deleg';
import { deptLevel } from '../src/island/p1/dept';
import { moraleParts } from '../src/island/p1/hr';
import { deserializeP1, fxSum, gainSkill, newP1, serializeP1, skillLock, type P1State } from '../src/island/p1/model';
import { runOnce, withoutPol } from '../scripts/island/sim';
import { TALK_MAX, talkLen } from '../src/island/p1/mine';
import { loadVoice } from '../src/island/p1/voice';

/** 通常の自動プレイで、Rare の町に着いて 2 回目の締めのあとの写し（部長が予算で動いている・会議が始まっている） */
let rare = '';
let v33: ReturnType<typeof runOnce>['v33'] | null = null;
beforeAll(async () => {
  await loadVoice();
  const r = runOnce('normal', 1, {
    onMonth: (s, _sector, m) => {
      if (!rare && s.tier === 'R' && m >= 2) rare = serializeP1(s);
    },
  });
  v33 = r.v33 ?? null;
}, 900_000);
const load = () => deserializeP1(rare)!;
/** 全社方針の枠を n にする（段 K2：ランクアップの特別なパネルを受け取ったことにする。減らさない） */
const slotsTo = (s: P1State, n: number) => {
  const P = polOf(s);
  P.slots = Math.max(P.slots ?? 0, n - POL.slots);
};
/** チュートリアルのあとの Common の町（1 か月目の締めのあと） */
function town(): P1State {
  const s = newP1(1);
  s.tut = 99;
  s.reports.push({ month: 1 } as never);
  return s;
}
/** 部長をそろえて、議題を作る（四半期の締めと同じ） */
function withAgenda(s = load()): P1State {
  const free = s.staff.filter((x) => x.task == null && !x.heads?.length);
  for (const d of budgetDepts(s)) {
    if (headOf(s, d)) continue;
    const st = free.shift();
    if (st) setHead(s, d, st.hero);
  }
  const m = Math.round(s.day / 30);
  boardQuarter(s, Math.floor(m / 3), m);
  return s;
}

describe('方針の表（data.ts の POLICIES）', () => {
  it('全社 10〜14（はじめから 7）・事業別は部門ごとに 2〜3（経営企画は全社方針）。名前は重ならない', () => {
    const corp = POLICIES.filter((p) => p.kind === 'corp');
    expect(corp.length).toBeGreaterThanOrEqual(10);
    expect(corp.length).toBeLessThanOrEqual(14);
    expect(corp.filter((p) => p.open.k === 'start').map((p) => p.id)).toEqual(['balance', 'profit', 'growth', 'brand', 'people', 'customer', 'research']);
    for (const d of DEPTS) {
      const n = POLICIES.filter((p) => p.kind === 'dept' && p.dept === d.id).length;
      if (d.id === 'strategy') expect(n).toBe(0);
      else {
        expect(n, d.id).toBeGreaterThanOrEqual(2);
        expect(n, d.id).toBeLessThanOrEqual(3);
      }
    }
    expect(new Set(POLICIES.map((p) => p.name)).size).toBe(POLICIES.length);
    expect(new Set(POLICIES.map((p) => p.id)).size).toBe(POLICIES.length);
  });
  it('32 枚の石板はどれも、ちょうど 1 つの方針を開く（ノウハウの一節つき）。部門の「経営方針」パネルも 1 つずつ', () => {
    expect(TABLETS.length).toBe(32);
    for (const tab of TABLETS) {
      const xs = POLICIES.filter((p) => p.open.k === 'tablet' && p.open.ids.includes(tab.id));
      expect(xs.length, tab.id).toBe(1);
      expect(TABLET_KNOW[tab.id], tab.id).toBeTruthy();
      // 2 枚で 1 つのときは、同じ町の 2 枚
      const o = xs[0].open as { ids: string[] };
      expect(new Set(o.ids.map((x) => TABLETS.find((y) => y.id === x)!.sector)).size).toBe(1);
    }
    for (const id of POL_PANELS) {
      const xs = POLICIES.filter((p) => p.open.k === 'panel' && p.open.id === id);
      expect(xs.length, id).toBe(1);
      expect(SKILL[id].dept, id).toBe(xs[0].dept);
      expect(SKILL[id].deptLv).toBeGreaterThan(0);
    }
    // 経営企画以外の 10 部門に 1 枚ずつ
    expect(new Set(POL_SKILLS.map((k) => k.dept)).size).toBe(10);
    expect(SKILL.pol_slots).toBeUndefined();
  });
  it('効き目は＋だけ（基本の値はどれも正）。推奨の重みは 6 つとも 0 以上', () => {
    for (const p of POLICIES) {
      expect(p.fx.length, p.id).toBeGreaterThan(0);
      for (const f of p.fx) expect(f.v, p.id).toBeGreaterThan(0);
      for (const v of Object.values(p.w)) expect(v).toBeGreaterThanOrEqual(0);
    }
  });
  it('手法の名前だけ（実在の企業名・人名は書かない）：名前と説明に「株式会社」「創業者」「氏」が無い', () => {
    for (const p of POLICIES) for (const x of [p.name, p.note]) expect(x, p.id).not.toMatch(/株式会社|有限会社|創業者|氏[、。]?$/);
  });
});

describe('効き目の式（基本 × 部門のレベル × 部長の能力）', () => {
  it('部門のレベル（理解度）が上がると強くなる（lvCap まで）。部長がいると強くなり、出来が高いほど強い。どれも 1 以上', () => {
    const s = load();
    const p = POLICY_OF.people;
    const d: DeptId = p.dept;
    setHead(s, d, null);
    const a = polPower(s, p);
    expect(a.head).toBe(1);
    expect(a.lv).toBeCloseTo(1 + POL.lv * Math.min(POL.lvCap, deptLevel(s, d)));
    // パネルを足すと理解度が上がる → 強くなる
    const lv0 = deptLevel(s, d);
    for (const k of ['hire', 'manual', 'slots', 'ojt', 'incentive', 'hr_talk', 'hr_career']) gainSkill(s, k);
    if (lv0 < POL.lvCap) expect(polPower(s, p).lv).toBeGreaterThan(a.lv);
    // 部長：出来の高い人ほど強い
    const xs = s.staff.filter((x) => x.task !== 'manager' && x.task !== 'train').sort((x, y) => quality(x, d) - quality(y, d));
    setHead(s, d, xs[0].hero);
    const lo = polPower(s, p);
    setHead(s, d, xs[xs.length - 1].hero);
    const hi = polPower(s, p);
    expect(lo.head).toBeGreaterThanOrEqual(1);
    expect(hi.head).toBeGreaterThanOrEqual(lo.head);
    expect(hi.head).toBeLessThanOrEqual(1 + POL.head + 1e-9);
    expect(hi.mul).toBeCloseTo(hi.lv * hi.head);
  });
  it('選んだ方針の効き目が汎用の効き目（fxSum）・士気・労力に足される。選ばなければ 0。チュートリアルのあいだ・止めたときは 0', () => {
    const s = load();
    setCorp(s, ['balance'], true);
    const d0 = fxSum(s, 'demand');
    const m0 = moraleParts(s, s.staff[0]);
    expect(m0.pol).toBe(0);
    setCorp(s, ['growth', 'people'], true);
    if (slotsOf(s) >= 2) {
      expect(fxSum(s, 'demand')).toBeGreaterThan(d0);
      expect(moraleParts(s, s.staff[0]).pol).toBeGreaterThan(0);
    } else {
      expect(corpOf(s)).toEqual(['growth']);
      expect(fxSum(s, 'demand')).toBeGreaterThan(d0);
    }
    // OKR：部長の労力
    slotsTo(s, 5);
    s.tablets = [...new Set([...(s.tablets ?? []), 'tab_c5'])];
    const dd = budgetDepts(s).find((x) => headOf(s, x))!;
    const l0 = laborCap(s, dd);
    setCorp(s, ['balance', 'okr'], true);
    expect(laborCap(s, dd)).toBeGreaterThanOrEqual(l0);
    expect(polFx(s, 'labor')).toBeGreaterThan(0);
    withoutPol(() => expect(polFx(s, 'labor')).toBe(0));
    const t = newP1(1);
    expect(polFx(t, 'flow')).toBe(0);
  });
  it('事業別の方針：その部門の方針だけが効く（開いていない方針は効かない）', () => {
    const s = load();
    expect(setDept(s, 'logistics', 'tqm', true)).toBe(isOpen(s, 'tqm'));
    gainSkill(s, 'pol_lg');
    expect(setDept(s, 'logistics', 'tqm', true)).toBe(true);
    expect(activePolicies(s).map((p) => p.id)).toContain('tqm');
    expect(polFx(s, 'craftDays')).toBeGreaterThan(0);
    // ほかの部門の方針は入らない
    expect(setDept(s, 'hr', 'tqm', true)).toBe(false);
  });
});

describe('全社方針の枠', () => {
  it('はじめ 1 つ。段 K2：ランクアップの特別なパネルを受け取るごとに +1、5 まで。枠より多くは選べない（tests/island-p1-stagek2.test.ts も）', () => {
    const s = town();
    expect(slotsOf(s)).toBe(1);
    expect(corpOf(s)).toEqual(['balance']);
    setCorp(s, ['profit', 'growth']);
    expect(corpOf(s)).toEqual(['profit']);
    slotsTo(s, 2);
    expect(slotsOf(s)).toBe(2);
    for (const n of [3, 4, 5]) {
      slotsTo(s, n);
      expect(slotsOf(s)).toBe(n);
    }
    setCorp(s, ['profit', 'growth', 'brand', 'people', 'customer', 'research']);
    expect(corpOf(s).length).toBe(5);
  });
});

describe('開放（石板・パネル）', () => {
  it('Common の石板は 1 枚で開く。Uncommon 以降は同じ町の 2 枚で開く（1 枚目は「あと 1 枚」）。開いた順に残り、知らせは 1 回', () => {
    const s = town();
    polOf(s);
    expect(isOpen(s, 'okr')).toBe(false);
    s.tablets.push('tab_c5');
    expect(isOpen(s, 'okr')).toBe(true);
    s.tablets.push('tab_u1a');
    expect(isOpen(s, 'blueOcean')).toBe(false);
    expect(tabletKnow(s, 'tab_u1a')!.open).toBe(false);
    expect(tabletKnow(s, 'tab_u1a')!.line).toContain('もう 1 枚');
    s.tablets.push('tab_u1b');
    expect(isOpen(s, 'blueOcean')).toBe(true);
    expect(tabletKnow(s, 'tab_u1b')!.line).toContain('選べるようになった');
    expect(polSync(s)).toEqual(['okr', 'blueOcean']);
    expect(polSync(s)).toEqual([]);
    expect(polOf(s).got.slice(-2)).toEqual(['okr', 'blueOcean']);
    expect(takePolNews(s)).toEqual(['okr', 'blueOcean']);
    expect(takePolNews(s)).toEqual([]);
  });
  it('部門の「経営方針」パネル：その部門の理解度が足りないと取れない（dept）。取ると、その部門の方針が開く', () => {
    const s = load();
    const k = SKILL.pol_hr;
    s.skills = s.skills.filter((x) => !SKILL[x] || SKILL[x].dept !== 'hr');
    s.rp = 99999;
    const e = skillLock(s, k);
    expect(['dept', 'requires', 'ring']).toContain(e);
    for (const id of ['hire', 'manual', 'slots', 'ojt', 'incentive', 'hr_talk', 'hr_career', 'mgr', 'b_scout', 'training', 'hr_brand', 'r_people_1']) gainSkill(s, id);
    expect(deptLevel(s, 'hr')).toBeGreaterThanOrEqual(k.deptLv!);
    expect(skillLock(s, k)).toBe(null);
    expect(isOpen(s, 'teal')).toBe(false);
    gainSkill(s, 'pol_hr');
    expect(isOpen(s, 'teal')).toBe(true);
    expect(openPolicies(s, 'dept', 'hr').map((p) => p.id)).toContain('teal');
  });
});

describe('変える時期と経営方針発表会', () => {
  it('会議の前（Rare の前）はいつでも変えられる。会議が始まると、選んである方針を替えるのは発表会で（空いた枠・方針の無い部門は埋められる）', () => {
    const t0 = town();
    expect(meetingsOn(t0)).toBe(false);
    expect(setCorp(t0, ['profit'])).toBe(true);
    const s = load();
    expect(meetingsOn(s)).toBe(true);
    setCorp(s, ['balance'], true);
    expect(canSetCorp(s, ['profit'])).toBe(false);
    expect(setCorp(s, ['profit'])).toBe(false);
    slotsTo(s, 2);
    expect(setCorp(s, ['balance', 'profit'])).toBe(true);
    expect(corpOf(s)).toEqual(['balance', 'profit']);
    gainSkill(s, 'pol_lg');
    setDept(s, 'logistics', null, true);
    expect(canSetDept(s, 'logistics')).toBe(true);
    expect(setDept(s, 'logistics', 'tqm')).toBe(true);
    s.tablets.push('tab_c2');
    expect(setDept(s, 'logistics', 'jit')).toBe(false);
  });
  it('発表会：その年の初めての会議（年初の回・年の途中で初めて開いたときはその回）。選んだもの（無ければ推奨）で決まり、同じ年の次の会議では開かない', () => {
    const s = withAgenda();
    slotsTo(s, 2);
    gainSkill(s, 'pol_lg');
    s.tablets.push('tab_c2', 'tab_c5');
    const A = boardOf(s).agenda!;
    delete polOf(s).year;
    expect(presDue(s, A)).toBe(true);
    const rec = recCorp(s);
    expect(rec[0]).toBe(corpOf(s)[0]);
    expect(rec.length).toBe(slotsOf(s));
    presPickCorp(s, A, ['growth', 'okr']);
    const r = recDept(s, 'logistics', ['growth', 'okr'])!;
    const other = openPolicies(s, 'dept', 'logistics').find((p) => p.id !== r)!.id;
    presPickDept(s, A, 'logistics', other);
    boardFinish(s, 'one');
    expect(corpOf(s)).toEqual(['growth', 'okr']);
    expect(deptPolicyOf(s, 'logistics')).toBe(other);
    expect(polOf(s).year).toBe(yearOfBoard(A));
    expect(polOf(s).stat!.changed).toBe(1);
    // ほかの部門（開いた方針がある）は推奨で決まる
    for (const d of presDepts(s)) expect(deptPolicyOf(s, d)).toBeTruthy();
    // 同じ年の次の会議では開かない・次の年は開く
    expect(presDue(s, { q: yearOfBoard(A) * 4 })).toBe(false);
    expect(presDue(s, { q: yearOfBoard(A) * 4 + 1 })).toBe(true);
  });
  it('飛ばす・一括承認・自動でも、発表会の回なら推奨で決まる（自動プレイの標準）', () => {
    for (const how of ['skip', 'bulk', 'auto'] as const) {
      const s = withAgenda();
      const A = boardOf(s).agenda!;
      delete polOf(s).year;
      const want = recCorp(s);
      boardFinish(s, how);
      expect(corpOf(s)).toEqual(want);
      expect(polOf(s).year).toBe(yearOfBoard(A));
    }
  });
  it('止めたとき（POL_OFF）は発表会を開かない', () => {
    const s = withAgenda();
    delete polOf(s).year;
    withoutPol(() => expect(presDue(s, boardOf(s).agenda!)).toBe(false));
  });
});

describe('推奨の重みと提案の傾向', () => {
  it('推奨の重みは、選んだ全社方針（と、その部門の事業別の方針）の重みの平均', () => {
    const s = load();
    slotsTo(s, 2);
    setCorp(s, ['profit', 'people'], true);
    setDept(s, 'logistics', null, true);
    const w = weightsOf(s);
    expect(w.morale).toBeCloseTo((POLICY_OF.profit.w.morale + POLICY_OF.people.w.morale) / 2);
    gainSkill(s, 'pol_hr');
    setDept(s, 'hr', 'teal', true);
    expect(weightsOf(s, 'hr').morale).toBeCloseTo((POLICY_OF.profit.w.morale + POLICY_OF.people.w.morale + POLICY_OF.teal.w.morale) / 3);
    expect(weightsOf(s, 'logistics').morale).toBeCloseTo(w.morale);
  });
  it('方針の推す種類の提案は × (1 + tilt)、引き換えで減る種類は × (1 − less)（段 K3）、ほかは 1。部門の方針は、その部門の提案だけ', () => {
    const s = load();
    setCorp(s, ['research'], true);
    expect(themesOf(s).has('rp')).toBe(true);
    expect(tiltOf(s, 'rp')).toBeCloseTo(1 + POL.tilt);
    // 段 K3：研究重視の引き換えで「売る手」は減る（× (1 − less)）。ほかの種類は 1
    expect(tiltOf(s, 'sell')).toBeCloseTo(1 - POL.less);
    expect(tiltOf(s, 'flow')).toBe(1);
    gainSkill(s, 'pol_ac');
    setDept(s, 'accounting', 'zeroBased', true);
    expect(tiltOf(s, 'cost', 'accounting')).toBeCloseTo(1 + POL.tilt);
    expect(tiltOf(s, 'cost', 'logistics')).toBe(1);
    withoutPol(() => expect(tiltOf(s, 'rp')).toBe(1));
  });
});

describe('自動プレイの選び方', () => {
  it('全社方針はバランスから、空いた枠は開いた順（はじめから開いている 7 つは表の順）に埋める。方針の無い部門は推奨（全社方針の重みにいちばん合う）', () => {
    const s = town();
    polOf(s);
    s.tablets.push('tab_c6', 'tab_c5');
    polSync(s);
    slotsTo(s, 3);
    polAutoFill(s);
    // はじめから開いている 7 つ（表の順）→ 石板で開いた順
    expect(corpOf(s)).toEqual(['balance', 'profit', 'growth']);
    expect(polOf(s).got.slice(-2)).toEqual(['okr', 'esg']);
    s.tablets.push('tab_c2');
    polAutoFill(s);
    expect(deptPolicyOf(s, 'logistics')).toBe('jit');
  });
  it('通常の自動プレイ（1 通し）：発表会が開かれ、方針のパネルと枠が取られて、方針が選ばれている', () => {
    expect(v33).toBeTruthy();
    expect(v33!.held).toBeGreaterThan(0);
    expect(v33!.corp).toBeGreaterThanOrEqual(1);
    expect(v33!.open).toBeGreaterThan(7);
    // 段 K2：ランクアップの特別なパネル「枠 +1」はすぐ受け取る（Rare まで行くので 3 枠以上）
    expect(v33!.slotLv).toBeGreaterThanOrEqual(2);
    expect(v33!.slots).toBe(1 + v33!.slotLv);
  });
});

describe('セーブ（版 27）とマインちゃん', () => {
  it('版 26 のセーブは 27 へ：全社方針は s.policy（無ければバランス）から、開いた順はいま開いているもの（知らせない）。27 はそのまま', () => {
    const s = load();
    const o = JSON.parse(serializeP1(s));
    o.v = 26;
    delete o.pol;
    o.policy = 'people';
    o.tablets = ['tab_c5', 'tab_c1'];
    const x = deserializeP1(JSON.stringify(o))!;
    expect(x.v).toBe(28);
    expect(corpOf(x)).toEqual(['people']);
    expect(x.pol!.got).toContain('okr');
    expect(x.pol!.got).toContain('empower');
    expect(takePolNews(x)).toEqual([]);
    const o2 = JSON.parse(serializeP1(s));
    o2.v = 26;
    delete o2.pol;
    delete o2.policy;
    expect(corpOf(deserializeP1(JSON.stringify(o2))!)).toEqual(['balance']);
    slotsTo(s, 2);
    setCorp(s, ['balance', 'growth'], true);
    const back = deserializeP1(serializeP1(s))!;
    expect(back.v).toBe(28);
    expect(corpOf(back)).toEqual(['balance', 'growth']);
    expect(newP1(1).v).toBe(28);
  });
  it('マインちゃんの一言は 60 字まで', () => {
    for (const x of [...KNOW_TALK(), ...SLOT_TALK(5)]) expect(talkLen(x)).toBeLessThanOrEqual(TALK_MAX);
  });
  it('POL_OFF でも、セーブ・全社方針の 1 つ目（段 UI7c の推奨）は使える', () => {
    const s = town();
    withoutPol(() => {
      setCorp(s, ['people']);
      expect(corpOf(s)).toEqual(['people']);
      expect(weightsOf(s)).toEqual(POLICY_OF.people.w);
    });
    void POL_OFF;
    void boardAgenda;
  });
});
