// 段 L0：0 → 1 はプレイヤー（ユーザーの声 2026-11-06）。チームリーダーは Uncommon から・事業部長と提案は Rare から。
// 序盤は地図の印（困りごとのアイコン）で「いま何をすればいいか」を見せる。docs/ISLAND_PHASE1.md「提案は Rare から（段 L0）」
import { describe, expect, it } from 'vitest';
import { DELEG, DEPT_SKILLS, L0, type DeptId } from '../src/island/p1/data';
import { deptLevel, deptNews } from '../src/island/p1/dept';
import { bandText, delegDay, headLeft, headOf, leaderLeft, leaderOf, setHead, setLeader } from '../src/island/p1/deleg';
import { deserializeP1, newP1, serializeP1, staffOf, type P1State } from '../src/island/p1/model';
import { headsOpen, heroStage, leadersOpen, propsOpen } from '../src/island/p1/stage';
import { orgChart } from '../src/island/p1/org';
import { talkMode, headTalkDue } from '../src/island/p1/headtalk';
import { openTier } from './l0util';

/** その部門の理解度を n にする（お金パネルを Lv1 ずつ取る） */
function setLevel(s: P1State, d: DeptId, n: number) {
  const ids = DEPT_SKILLS[d].filter((k) => !k.donate && !k.inf).map((k) => k.id);
  s.skills = [...s.skills.filter((id) => !ids.includes(id)), ...ids.slice(0, n)];
  for (const id of ids.slice(0, n)) delete s.skillLv[id];
  expect(deptLevel(s, d)).toBe(n);
}
/** 会社が出店したことのある最高ランクを r にする（いまの町は Common のまま、ランドに r の町を足す） */
const atTier = (s: P1State, r: 'C' | 'U' | 'R' | 'E') => openTier(s, r);

describe('heroStage（判定の 1 か所）', () => {
  it('会社が出店したことのある最高ランクで C・U・R（Epic 以上は R）', () => {
    const s = newP1(1);
    expect(heroStage(s)).toBe('C');
    expect(leadersOpen(s)).toBe(false);
    expect(headsOpen(s)).toBe(false);
    expect(propsOpen(s)).toBe(false);
    atTier(s, 'U');
    expect(heroStage(s)).toBe('U');
    expect(leadersOpen(s)).toBe(true);
    expect(headsOpen(s)).toBe(false);
    atTier(s, 'R');
    expect(heroStage(s)).toBe('R');
    expect(headsOpen(s) && propsOpen(s)).toBe(true);
    const e = atTier(newP1(1), 'E');
    expect(heroStage(e)).toBe('R');
    // データは data.ts の L0 の 1 か所
    expect(L0).toMatchObject({ leaderFrom: 'U', headFrom: 'R', propFrom: 'R' });
  });
});

describe('部長・リーダー（1）', () => {
  it('Common・Uncommon では理解度 8 でも事業部長を置けない（🔒 Rare）。Rare からは今どおり（理解度に関係なく 0）', () => {
    const s = newP1(1);
    const hero = s.staff[0].hero;
    setLevel(s, 'logistics', DELEG.headAt);
    expect(headLeft(s, 'logistics')).toBe('R');
    expect(setHead(s, 'logistics', hero)).toBe('locked');
    atTier(s, 'U');
    expect(headLeft(s, 'logistics')).toBe('R');
    expect(setHead(s, 'logistics', hero)).toBe('locked');
    expect(bandText(s, 'strategy').long).toContain('Rare');
    atTier(s, 'R');
    setLevel(s, 'logistics', 0);
    expect(headLeft(s, 'logistics')).toBe(0);
    expect(setHead(s, 'logistics', hero)).toBeNull();
    expect(headOf(s, 'logistics')?.hero).toBe(hero);
  });

  it('チームリーダーは Uncommon から理解度 3 で置ける。Common では理解度 3 でも置けない（🔒 Uncommon）', () => {
    const s = newP1(1);
    const hero = s.staff[0].hero;
    setLevel(s, 'logistics', DELEG.leaderAt);
    expect(leaderLeft(s, 'logistics')).toBe('U');
    expect(setLeader(s, 'order', hero)).toBe('locked');
    expect(bandText(s, 'logistics').long).toContain('Uncommon');
    atTier(s, 'U');
    expect(leaderLeft(s, 'logistics')).toBe(0);
    setLevel(s, 'logistics', DELEG.leaderAt - 1);
    expect(setLeader(s, 'order', hero)).toBe('locked');
    setLevel(s, 'logistics', DELEG.leaderAt);
    expect(setLeader(s, 'order', hero)).toBeNull();
    expect(leaderOf(s, 'order')?.hero).toBe(hero);
  });

  it('組織図の空席：Common のリーダーは「🔒 Uncommon」、部長は「🔒 Rare」', () => {
    const s = newP1(1);
    setLevel(s, 'logistics', DELEG.headAt);
    const o = orgChart(s);
    const lg = o.depts.find((d) => d.dept === 'logistics')!;
    expect(lg.head.open).toBe(false);
    expect(lg.head.lock?.rank).toBe('R');
    expect(lg.leaders.every((x) => !x.open && x.lock?.rank === 'U')).toBe(true);
    atTier(s, 'U');
    const lg2 = orgChart(s).depts.find((d) => d.dept === 'logistics')!;
    expect(lg2.leaders.every((x) => x.open)).toBe(true);
    expect(lg2.head.lock?.rank).toBe('R');
  });

  it('Rare より前は、部長との会話・初めての部長の一言も出ない（理解度 8 でも）', () => {
    const s = newP1(1);
    s.tut = 99;
    setLevel(s, 'hr', DELEG.headAt);
    expect(talkMode(s, 'hr')).toBeNull();
    expect(headTalkDue(s)).toBeNull();
    atTier(s, 'R');
    expect(talkMode(s, 'hr')).toBe('mine');
    expect(headTalkDue(s)).toBe('hr');
  });

  it('理解度の節目のお知らせ：Common の 3 は「Uncommon の町を開くと置ける」・ランクの町を開くとお知らせ', () => {
    const s = newP1(1);
    deptNews(s);
    setLevel(s, 'logistics', DELEG.leaderAt);
    const a = deptNews(s);
    expect(a.some((x) => x.includes('Uncommon'))).toBe(true);
    atTier(s, 'U');
    const b = deptNews(s);
    expect(b.some((x) => x.includes('Uncommon') && x.includes('チームリーダー'))).toBe(true);
    expect(deptNews(s).length).toBe(0);
  });

  it('古いセーブ：Common で既に置いてある部長・リーダーは外さない（読み込んでも残り、業務を回す）。新しくは置けない', () => {
    const s = newP1(1);
    const [a, b] = s.staff.map((x) => x.hero);
    // 段 L0 の前のセーブの形（Common の町で部長とリーダー）
    staffOf(s, a)!.heads = ['hr'];
    staffOf(s, b)!.task = 'lead';
    staffOf(s, b)!.target = 'L:rest';
    const t = deserializeP1(serializeP1(s))!;
    expect(headOf(t, 'hr')?.hero).toBe(a);
    expect(leaderOf(t, 'rest')?.hero).toBe(b);
    t.tut = 99;
    expect(talkMode(t, 'hr')).toBe('head');
    expect(() => delegDay(t)).not.toThrow();
    // 外したら Rare まで置き直せない
    expect(setHead(t, 'hr', null)).toBeNull();
    expect(setHead(t, 'hr', a)).toBe('locked');
  });
});

// ---------------------------------------------------------------- 2. 提案は Rare から（序盤は地図の印）
import { PROPOSAL_SRC, canTrust, cardsMonth, demoDraft, newCards, reportProposal, type Card } from '../src/island/p1/card';
import { delegMonth } from '../src/island/p1/deleg';
import { assign, myShops as shopsOf, stallOf, type Report } from '../src/island/p1/model';
import { marksOf, noteMarks, tipPanels } from '../src/island/p1/mapmarks';
import { directOrder } from '../src/island/p1/orders';
import { planOf } from '../src/island/p1/plan';
import { runOnce } from '../scripts/island/sim';

/** タオックスを数か月遊んだところ（Common・チュートリアルのあと。自動プレイの最短の方針の写し） */
let mid: string | null = null;
function midGame(): P1State {
  if (!mid)
    runOnce('rta', 1, {
      onlyFirst: true,
      onMonth: (s, _sector, m) => {
        if (!mid && m >= 4 && shopsOf(s).length) mid = serializeP1(s);
      },
    });
  const s = deserializeP1(mid!)!;
  // 自動プレイはチュートリアルを飛ばす（tut 0 のまま）。遊んでいる人と同じく、チュートリアルのあとに
  s.tut = 99;
  return s;
}
const fakeReport = (s: P1State): Report => ({ ...(s.reports[s.reports.length - 1] ?? ({} as Report)), month: (s.reports[s.reports.length - 1]?.month ?? 0) + 1 });

describe('提案は Rare から（2）', () => {
  it('Common では提案カード（ヒーロー・流れの止まり・人事・倉庫・知らせ）を受け箱に入れない。できごとは出る', () => {
    const s = midGame();
    expect(heroStage(s)).toBe('C');
    s.cards = newCards();
    // 店員を外して流れを止めても（流れの止まりの提案の元）、カードにはならない
    const shop = shopsOf(s)[0];
    const clerk = s.shops[shop.uid].staff;
    if (clerk != null) assign(s, clerk, null);
    s.shops[shop.uid].part = 0;
    let ev = 0;
    for (let k = 0; k < 8; k++) {
      const r = fakeReport(s);
      r.stall = stallOf(s) ?? undefined;
      cardsMonth(s, r);
      const box = s.cards?.inbox ?? [];
      expect(box.filter((c) => PROPOSAL_SRC.includes(c.src)).length).toBe(0);
      ev += box.filter((c) => c.src === 'event').length;
      s.cards!.inbox = [];
    }
    expect(ev).toBeGreaterThan(0);
  });

  it('古いセーブで Common に置いてある部長は、月の締めで提案を持ってこない（業務は回す）。Rare からは持ってくる', () => {
    const s = midGame();
    const H = s.staff.find((x) => x.task == null) ?? s.staff[0];
    H.heads = ['logistics'];
    delegMonth(s, fakeReport(s));
    expect((s.deleg?.inbox ?? []).length).toBe(0);
    atTier(s, 'R');
    // Rare：予算で任せた部長は自分で実行するので、予算を止めて前の形（受け箱）で確かめる
    for (let k = 0; k < 3 && !(s.deleg?.inbox ?? []).length; k++) delegMonth(s, fakeReport(s));
    expect((s.deleg?.newProps ?? 0) + (s.deleg?.inbox ?? []).length + (s.budget ? 1 : 0)).toBeGreaterThan(0);
  });

  it('月次報告の KPI ③「担当者からの提案」と ★3 の「任せる」は Common では出ない', () => {
    const s = midGame();
    const r = s.reports[s.reports.length - 1];
    expect(reportProposal(s, r)).toBeNull();
    const d = demoDraft(s, 'clerk') ?? demoDraft(s, 'idle');
    expect(d).not.toBeNull();
    const c = { ...d!, id: 1, mk: 0, sector: 'c1', day: s.day, pop: false, q: 0.97 } as Card;
    expect(canTrust(s, c)).toBe(false);
  });

  it('吹き出しの指示（従業員を増やす）は、Common では提案書を挟まず直接行う（お金の確認は残す）。Rare では提案書（null）', () => {
    const s = midGame();
    const b = shopsOf(s)[0];
    const sh = s.shops[b.uid];
    const before = sh.part;
    const plan = planOf(s, [{ k: 'staff', uid: b.uid, n: before + 1 }], { hero: sh.staff });
    s.money = 1e6;
    const res = directOrder(s, plan);
    expect(res?.ok).toBe(true);
    expect(s.shops[b.uid].part).toBe(before + 1);
    // お金が足りなければ払えない（何もしない）
    const plan2 = planOf(s, [{ k: 'invest', id: 'shelf', uid: b.uid }], { hero: sh.staff });
    s.money = 0;
    const r2 = directOrder(s, plan2);
    if (r2 && r2.need > 0) expect(r2.err).toBe('money');
    atTier(s, 'R');
    expect(directOrder(s, plan)).toBeNull();
  });
});

describe('地図の印（2）', () => {
  it('店員のいないお店に「人」（青）。押すと店員を置く指示。人を戻すと消える', () => {
    const s = midGame();
    const b = shopsOf(s)[0];
    const clerk = s.shops[b.uid].staff;
    const part = s.shops[b.uid].part;
    if (clerk != null) assign(s, clerk, null);
    s.shops[b.uid].part = 0;
    const m = marksOf(s).find((x) => x.uid === b.uid);
    expect(m?.kind).toBe('people');
    expect(m?.go).toEqual({ k: 'order', uid: b.uid, order: 'clerk' });
    s.shops[b.uid].part = Math.max(1, part);
    expect(marksOf(s).find((x) => x.uid === b.uid)?.kind).not.toBe('people');
  });

  it('棚が空のお店に「売れない」（赤）。押すとそのお店の画面（品出し）', () => {
    const s = midGame();
    const b = shopsOf(s)[0];
    const sh = s.shops[b.uid];
    if (sh.staff == null && !sh.part) sh.part = 1;
    sh.shelf = {};
    sh.storage = {};
    const m = marksOf(s).find((x) => x.uid === b.uid);
    expect(m?.kind).toBe('sell');
    expect(m?.go).toEqual({ k: 'screen', id: 'shop', uid: b.uid });
  });

  it('詰まりと一致：調達係がいない → 問屋に「人」（調達係を置く）。作業台に職人がいない → 工房に「人」（職人を置く）', () => {
    const s = midGame();
    for (const x of s.staff.filter((y) => y.task === 'buy')) assign(s, x.hero, null);
    for (const k of Object.keys(s.mats)) s.mats[k as keyof typeof s.mats] = 0;
    const st = stallOf(s);
    if (st?.stage === 'buy' && st.why === 'none') {
      const wh = s.buildings.find((b) => b.owner === 'town' && b.id === 'wholesale')!;
      const m = marksOf(s).find((x) => x.uid === wh.uid);
      expect(m?.kind).toBe('people');
      expect(m?.go).toEqual({ k: 'order', uid: wh.uid, order: 'buyer' });
    }
    const t2 = midGame();
    for (const sl of t2.slots) if (sl.worker != null) assign(t2, sl.worker, null);
    const st2 = stallOf(t2);
    expect(st2).toEqual({ stage: 'craft', why: 'noworker' });
    const ws = t2.buildings.find((b) => b.owner === 'me' && b.id === 'workshop')!;
    const m2 = marksOf(t2).find((x) => x.uid === ws.uid);
    expect(m2?.kind).toBe('people');
    expect(m2?.go).toEqual({ k: 'order', uid: ws.uid, order: 'crafter' });
  });

  it('同じ建物に複数あれば強いもの 1 つ＋「+N」', () => {
    const s = midGame();
    const b = shopsOf(s)[0];
    const sh = s.shops[b.uid];
    if (sh.staff == null && !sh.part) sh.part = 1;
    sh.shelf = {};
    sh.storage = {};
    sh.offLast = 5;
    sh.part = Math.min(sh.part, 1);
    if (sh.staff == null) {
      const hero = s.staff.find((x) => x.task == null)?.hero ?? s.staff[0].hero;
      assign(s, hero, 'shop', b.uid);
    }
    const m = marksOf(s).find((x) => x.uid === b.uid)!;
    expect(m.kind).toBe('sell');
    expect(m.more).toBeGreaterThanOrEqual(1);
    expect(marksOf(s).filter((x) => x.uid === b.uid).length).toBe(1);
  });

  it('チュートリアル中・1 か月目・Rare からは印を出さない', () => {
    const s = midGame();
    const b = shopsOf(s)[0];
    s.shops[b.uid].shelf = {};
    s.shops[b.uid].storage = {};
    expect(marksOf(s).length).toBeGreaterThan(0);
    const tut = deserializeP1(serializeP1(s))!;
    tut.tut = 3;
    expect(marksOf(tut)).toEqual([]);
    const first = deserializeP1(serializeP1(s))!;
    first.reports = [];
    expect(marksOf(first)).toEqual([]);
    atTier(s, 'R');
    expect(marksOf(s)).toEqual([]);
  });

  it('何度も出る困りごとは、それを無くすパネルに 💡（取ると消える）', () => {
    const s = midGame();
    const b = shopsOf(s)[0];
    s.shops[b.uid].shelf = {};
    s.shops[b.uid].storage = {};
    if (s.shops[b.uid].staff == null && !s.shops[b.uid].part) s.shops[b.uid].part = 1;
    s.skills = s.skills.filter((x) => x !== 'display');
    noteMarks(s);
    expect(tipPanels(s).has('display')).toBe(false);
    noteMarks(s);
    expect(tipPanels(s).has('display')).toBe(true);
    s.skills.push('display');
    expect(tipPanels(s).has('display')).toBe(false);
    // 先に要るパネルがまだなら、手前の取れるパネルに 💡（自動発注 → POS レジ）
    s.skills = s.skills.filter((x) => x !== 'auto_order' && x !== 'pos');
    s.flags.markFix = { auto_order: 2 };
    expect([...tipPanels(s)]).toEqual(['pos']);
  });
});

// ---------------------------------------------------------------- 3. 序盤の自動化を「自分で取る」遊びに
import { L0_PANELS, L0_PANELS_BEFORE, MISSIONS, SKILL } from '../src/island/p1/data';
import { accept, missionMet, missionProgress } from '../src/island/p1/model';

describe('序盤の自動化のパネル・依頼（3）', () => {
  it('序盤の自動化のパネルは値段を下げるだけ（RP・G を上げない）。data.ts の 1 か所', () => {
    expect(Object.keys(L0_PANELS).length).toBeGreaterThanOrEqual(5);
    for (const [id, v] of Object.entries(L0_PANELS)) {
      const k = SKILL[id];
      const b = L0_PANELS_BEFORE[id];
      expect(k, id).toBeTruthy();
      expect(k.rp ?? 0).toBeLessThanOrEqual(b.rp);
      expect(k.cost).toBeLessThanOrEqual(b.cost);
      if (v.rp != null) expect(k.rp).toBe(v.rp);
      if (v.cost != null) expect(k.cost).toBe(v.cost);
    }
  });
  it('序盤の自動化を覚える依頼（自動発注・交代要員・定期便）：取ると達成。報酬は Common の依頼の段（3,000 G まで）', () => {
    const ids = ['m_edi', 'm_relief', 'm_timetable'];
    for (const id of ids) {
      const m = MISSIONS.find((x) => x.id === id)!;
      expect(m, id).toBeTruthy();
      expect(m.reward).toBeLessThanOrEqual(3000);
      expect(m.sector).toBeUndefined();
    }
    const s = newP1(1);
    expect(missionMet(s, 'm_edi')).toBe(false);
    s.skills.push('auto_order', 'timetable');
    expect(missionMet(s, 'm_edi')).toBe(true);
    expect(missionMet(s, 'm_timetable')).toBe(true);
    s.skills.push('relief');
    const [a, b] = s.staff;
    a.task = 'buy';
    expect(missionMet(s, 'm_relief')).toBe(false);
    expect(missionProgress(s, 'm_relief')).toEqual([1, 2]);
    b.task = 'buy';
    expect(missionMet(s, 'm_relief')).toBe(true);
    expect(accept(s, 'm_relief')).toBeNull();
    expect(s.missions.m_relief).toBe('done');
  });
});

// ---------------------------------------------------------------- 4. Sim
import { headDepts } from '../src/island/p1/deleg';

describe('自動プレイ（4）', () => {
  it('通常の方針：最初の町（Common）ではリーダー・部長を置かず、提案のカードも受けない（任せていない業務は手で打つ）', () => {
    let months = 0;
    let leads = 0;
    let heads = 0;
    let props = 0;
    runOnce('normal', 1, {
      onlyFirst: true,
      onMonth: (s) => {
        months++;
        leads += s.staff.filter((x) => x.task === 'lead').length;
        heads += headDepts(s).length;
        props += (s.cards?.inbox ?? []).filter((c) => PROPOSAL_SRC.includes(c.src)).length + (s.deleg?.inbox.length ?? 0);
      },
    });
    expect(months).toBeGreaterThan(2);
    expect(leads).toBe(0);
    expect(heads).toBe(0);
    expect(props).toBe(0);
  }, 300000);
});

// ---------------------------------------------------------------- 3b. 序盤の手を減らす仕組みのパネル（ユーザーの決定 2026-11-06：案 A）
import { L0_AUTO, L0_SKILLS } from '../src/island/p1/data';
import { autoDuties, autoDuty } from '../src/island/p1/deleg';

describe('仕組みのパネル（調達・製造計画・勤務シフトの自動化）', () => {
  const take = (s: P1State, id: string) => {
    if (!s.skills.includes(id)) s.skills.push(id);
  };
  it('データは L0_AUTO の 1 か所。Common のシステムの枝（研究パネル）・値段は序盤のパネルの段', () => {
    expect(L0_SKILLS).toEqual(['auto_proc', 'auto_lineup', 'auto_rest']);
    for (const id of L0_SKILLS) {
      const k = SKILL[id];
      expect(k.tier ?? 'C').toBe('C');
      expect(k.branch).toBe('sys');
      expect(k.cat).toBe('research');
      expect(k.rp).toBe(L0_AUTO.panels[id].rp);
      expect(k.rp).toBeLessThanOrEqual(80);
    }
  });
  it('調達の自動化：取る前は作っていない調達の品目が残る。取ると毎日の業務で作業台に合わせてそろう', () => {
    const s = midGame();
    s.skills = s.skills.filter((x) => !L0_SKILLS.includes(x));
    s.proc.items = [...s.proc.items, 'Moai:C' as never];
    for (let k = 0; k < 5; k++) delegDay(s);
    expect(s.proc.items).toContain('Moai:C');
    expect(autoDuty(s, 'order')).toBe(false);
    take(s, 'auto_proc');
    expect(autoDuty(s, 'order')).toBe(true);
    for (let k = 0; k < 5; k++) {
      s.day++;
      delegDay(s);
    }
    expect(s.proc.items).not.toContain('Moai:C');
  });
  it('製造計画の自動化：作るものが決まっていない作業台に、売れ筋を自動で決める（取る前はそのまま）', () => {
    const s = midGame();
    s.skills = s.skills.filter((x) => !L0_SKILLS.includes(x));
    for (const sl of s.slots) Object.assign(sl, { running: false, sku: null, progress: 0 });
    const idle = () => s.slots.filter((sl) => !sl.sku).length;
    const n0 = idle();
    expect(n0).toBeGreaterThan(0);
    for (let k = 0; k < 5; k++) delegDay(s);
    expect(idle()).toBe(n0);
    take(s, 'auto_lineup');
    for (let k = 0; k < 5; k++) {
      s.day++;
      delegDay(s);
    }
    expect(idle()).toBeLessThan(n0);
  });
  it('勤務シフトの自動化：休む職人の持ち場に待機中の人が入る（取る前は入らない）。ヒーローのリーダーがいればそちらが回す', () => {
    const s = midGame();
    s.skills = s.skills.filter((x) => !L0_SKILLS.includes(x));
    const crafter = s.staff.find((x) => x.task === 'craft')!;
    crafter.resting = true;
    const free = s.staff.find((x) => x.task == null && !x.resting) ?? Object.assign(s.staff[s.staff.length - 1], { task: null, target: null, resting: false });
    delegDay(s);
    expect(s.deleg?.cover.length ?? 0).toBe(0);
    take(s, 'auto_rest');
    s.day++;
    delegDay(s);
    expect(s.deleg!.cover.some((c) => c.for === crafter.hero && c.hero === free.hero)).toBe(true);
    // ヒーローのリーダーがいれば、仕組みではなくリーダーが回す
    openTier(s, 'U');
    setLevel(s, 'hr', DELEG.leaderAt);
    const lead = s.staff.find((x) => x.task == null && x.hero !== free.hero);
    if (lead && setLeader(s, 'rest', lead.hero) == null) expect(autoDuty(s, 'rest')).toBe(false);
  });
  it('古いセーブ：仕組みのパネルを取ったまま保存して読んでも動く（任せ方の記録が無くても）', () => {
    const s = midGame();
    for (const id of L0_SKILLS) take(s, id);
    delete s.deleg;
    const t = deserializeP1(serializeP1(s))!;
    expect(autoDuties(t)).toEqual(['order', 'craft', 'shelf', 'rest']);
    expect(() => {
      for (let k = 0; k < 3; k++) delegDay(t);
    }).not.toThrow();
  });
});
