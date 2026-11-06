// 段 UI5b（画面の側）：増減の符号の関数・組織図の中身・下の帯がグループになったときのマインちゃんの説明・演出の強さ・
// スキルツリーのつながりの見直し（効き目・値段は変えない・枝をまたがない）。線どうしの交わり 0 は tests/island-p1-treeorder.test.ts
import { describe, expect, it } from 'vitest';
import { signCls, signed, money } from '../src/island/p1/ui';
import { DELEG, DEPT_SKILLS, REQUIRES_ORIG, SKILL, SKILLS, multiRole, rpCost, type DeptId } from '../src/island/p1/data';
import { deptLevel, menuDepts } from '../src/island/p1/dept';
import { headOf, setHead, setLeader } from '../src/island/p1/deleg';
import { canHoldRole, deserializeP1, fixRoles, newP1, roleCount, serializeP1, setSectorHead, staffOf, type P1State } from '../src/island/p1/model';
import { orgChart, orgCounts } from '../src/island/p1/org';
import { FOOT_TALK, TALK_MAX, deptTalkNext, talkLen } from '../src/island/p1/mine';
import { TREE_LINKS } from '../src/island/p1/treelinks';
import { groupOf } from '../src/island/p1/treelayout';
import { SUB_ALIAS, SUB_DEFS, subCount } from '../src/island/p1/menus';
import { openTier } from './l0util';

/** その部門の理解度を n にする（お金パネルを Lv1 ずつ取る） */
function setLevel(s: P1State, d: DeptId, n: number) {
  const ids = DEPT_SKILLS[d].filter((k) => !k.donate && !k.inf).map((k) => k.id);
  s.skills = [...s.skills.filter((id) => !ids.includes(id)), ...ids.slice(0, n)];
  for (const id of ids.slice(0, n)) delete s.skillLv[id];
  expect(deptLevel(s, d)).toBe(n);
}

describe('増減の符号（signed）：減ったら −・増えたら +・変わらなければ ±', () => {
  it('ブランド力の増減（前は「★ +-10」と出ていた）', () => {
    expect(`★ ${signed(-10)}`).toBe('★ −10');
    expect(`★ ${signed(10)}`).toBe('★ +10');
    expect(`★ ${signed(0)}`).toBe('★ ±0');
    expect(signed(-10)).not.toContain('+-');
  });
  it('お金（先月比・資金の変化・利益）も同じ関数で：3 桁区切りと G', () => {
    expect(signed(35332, money)).toBe('+35,332 G');
    expect(signed(-3070, money)).toBe('−3,070 G');
    expect(signed(0, money)).toBe('±0 G');
    // 四捨五入した値で決める（+0.4 は ±0・−0.6 は −1）
    expect(signed(0.4)).toBe('±0');
    expect(signed(-0.6)).toBe('−1');
  });
  it('色の class：増えた緑・減った赤・変わらない灰', () => {
    expect(signCls(5)).toBe('is-good');
    expect(signCls(-5)).toBe('is-bad');
    expect(signCls(0)).toBe('is-even');
    expect(signCls(0.3)).toBe('is-even');
  });
});

describe('組織図（人事 → ヒーローの配置の中）', () => {
  it('始めたばかり：開いている部門ごとに部長の席（理解度 8 まで鍵）・業務ごとのリーダーの席（理解度 3 まで鍵）。経営企画は社長（あなた）', () => {
    const s = newP1(1);
    const o = orgChart(s);
    expect(o.depts.map((d) => d.dept)).toEqual(menuDepts(s));
    const st = o.depts.find((d) => d.dept === 'strategy')!;
    expect(st.byCeo).toBe(true);
    const lg = o.depts.find((d) => d.dept === 'logistics')!;
    expect(lg.head).toMatchObject({ hero: null, open: false, lock: { at: DELEG.headAt, now: deptLevel(s, 'logistics') } });
    expect(lg.leaders.length).toBeGreaterThan(0);
    for (const L of lg.leaders) expect(L).toMatchObject({ hero: null, open: false, lock: { at: DELEG.leaderAt } });
    // いまのセクタは「あなたが直接」・従業員の数
    expect(o.sectors).toHaveLength(1);
    expect(o.sectors[0].here).toBe(true);
    expect(o.sectors[0].people).not.toBeNull();
    const n = orgCounts(o);
    expect(n.filled).toBe(0);
    expect(n.locked).toBeGreaterThan(0);
  });
  it('理解度が届くと空席（置ける）・置いた人は顔・★・士気つきで、持ち場からは外れる', () => {
    // 段 L0：部長・リーダーの席は Rare の町から
    const s = openTier(newP1(1), 'R');
    setLevel(s, 'logistics', DELEG.headAt);
    let o = orgChart(s);
    const lg = () => o.depts.find((d) => d.dept === 'logistics')!;
    expect(lg().head).toMatchObject({ hero: null, open: true });
    expect(lg().leaders.every((x) => x.open && x.hero == null)).toBe(true);
    const [a, b] = s.staff.map((x) => x.hero);
    expect(setHead(s, 'logistics', a)).toBeNull();
    expect(setLeader(s, 'order', b)).toBeNull();
    o = orgChart(s);
    expect(lg().head.hero).toBe(a);
    expect(lg().head.star).toBeGreaterThanOrEqual(1);
    expect(lg().head.morale).toBe(Math.round(staffOf(s, a)!.morale ?? 70));
    expect(lg().leaders.find((x) => x.duty === 'order')?.hero).toBe(b);
    // リーダーは持ち場（posts）には出ない（役目の仕事）。部長は持ち場の仕事をしていなければ出ない
    expect(lg().posts.some((p) => p.hero === a || p.hero === b)).toBe(false);
    expect(orgCounts(o).filled).toBe(2);
    expect(o.idle).not.toContain(a);
  });
  it('部長は町の持ち場と兼ねてよい（部長の席と持ち場の両方に出る）', () => {
    const s = openTier(newP1(1), 'R');
    setLevel(s, 'logistics', DELEG.headAt);
    const a = s.staff[0].hero;
    s.staff[0].task = 'craft';
    s.staff[0].target = 0;
    expect(setHead(s, 'logistics', a)).toBeNull();
    expect(staffOf(s, a)!.task).toBe('craft');
    const o = orgChart(s);
    const lg = o.depts.find((d) => d.dept === 'logistics')!;
    expect(lg.head.hero).toBe(a);
    expect(lg.posts.map((p) => p.hero)).toContain(a);
  });
  it('持ち場：物流の仕事をしているヒーローは物流の下に（ほかの部門には出ない）', () => {
    const s = newP1(1);
    s.staff[0].task = 'craft';
    s.staff[0].target = 0;
    const o = orgChart(s);
    expect(o.depts.find((d) => d.dept === 'logistics')!.posts.map((p) => p.hero)).toContain(s.staff[0].hero);
    expect(o.depts.filter((d) => d.dept !== 'logistics').flatMap((d) => d.posts)).toEqual([]);
    expect(o.idle).not.toContain(s.staff[0].hero);
  });
  it('サブタブは増やさない（ヒーローの配置にまとめる）・前の key「hr:org」で組織図の部分へ', () => {
    expect(SUB_DEFS().hr.find((x) => x.key === 'staff')?.parts).toEqual(['staff', 'org', 'side']);
    expect(SUB_ALIAS['hr:org']).toEqual({ m: 'hr', key: 'staff', part: 'org' });
    expect(subCount(['logistics', 'hr', 'strategy', 'marketing', 'systems', 'rnd'])).toBe(21);
  });
});

describe('下の帯がグループの帯になったときのマインちゃんの説明（フィードバック 5）', () => {
  it('2 枚・1 枚 60 字まで・人事は「管理」の中と言う', () => {
    const xs = FOOT_TALK();
    expect(xs).toHaveLength(2);
    for (const x of xs) expect(talkLen(x)).toBeLessThanOrEqual(TALK_MAX);
    expect(xs.join('')).toContain('管理');
    expect(xs.join('')).toContain('人事');
  });
  it('部門が 7 つ以上（グループの帯）になったら、ほかの部門の紹介より先に 1 回だけ', () => {
    const s = newP1(1);
    s.tut = 99;
    const ui = { talk: false, sheet: false, card: false, report: false } as never;
    expect(deptTalkNext(s, ui, { intro: false, reset: false })).toBeNull();
    // Uncommon に進出（経理・総務・CS が開く）
    s.tier = 'U';
    s.land = { cur: 'u1', mine: ['c1', 'u1'], recs: {} } as never;
    s.flags.depts = menuDepts(s);
    expect(menuDepts(s).length).toBeGreaterThan(6);
    expect(deptTalkNext(s, ui, { intro: false, reset: false })).toBe('foot');
    s.flags.footTalk = true;
    expect(deptTalkNext(s, ui, { intro: false, reset: false })).not.toBe('foot');
  });
});

describe('スキルツリーのつながりの見直し（線の交わり 0 のため）', () => {
  it('変えたのはつながりだけ：効き目・値段は前のまま（値段は前のつながりの深さで決めたもの）', () => {
    for (const k of SKILLS) {
      expect(k.cost, k.id).toBeGreaterThanOrEqual(0);
      expect(rpCost(k), k.id).toBeGreaterThanOrEqual(0);
    }
    // 見直したパネルは、もとの「先に要る」と違う
    for (const [id, req] of Object.entries(TREE_LINKS)) expect([...req].sort().join('+'), id).not.toBe([...(REQUIRES_ORIG[id] ?? [])].sort().join('+'));
  });
  it('「先に要る」は同じ束（物流は ① 調達・② 製造などの束）の中だけ・同じか内側のランク・輪にならない', () => {
    const tierIx = (id: string) => ['C', 'U', 'R', 'E', 'L'].indexOf(SKILL[id].tier ?? 'C');
    for (const k of SKILLS)
      for (const r of k.requires ?? []) {
        expect(groupOf(r)?.key, `${r} → ${k.id}`).toBe(groupOf(k.id)?.key);
        expect(tierIx(r), `${r} → ${k.id}`).toBeLessThanOrEqual(tierIx(k.id));
      }
    const seen = new Map<string, number>();
    const depth = (id: string, stack: string[] = []): number => {
      if (stack.includes(id)) throw new Error(`輪：${[...stack, id].join(' → ')}`);
      if (seen.has(id)) return seen.get(id)!;
      const d = Math.max(0, ...(SKILL[id].requires ?? []).map((r) => 1 + depth(r, [...stack, id])));
      seen.set(id, d);
      return d;
    };
    for (const k of SKILLS) depth(k.id);
  });
  it('変えないもの：人材の募集（チュートリアル）・技（修行）・レベルが要るもの・技を n 個', () => {
    for (const k of SKILLS) if (k.id === 'hire' || k.train || k.reqLv || k.anyOf) expect(TREE_LINKS[k.id], k.id).toBeUndefined();
    expect(SKILL.hire.requires ?? []).toEqual([]);
  });
});

describe('役職の決まり（組織図の追加の決まり。model.ts の roleCount・canHoldRole の 1 か所）', () => {
  const twoDepts = () => {
    // 段 L0：部長は Rare の町から
    const s = openTier(newP1(1), 'R');
    setLevel(s, 'logistics', DELEG.headAt);
    setLevel(s, 'hr', DELEG.headAt);
    return s;
  };
  it('部長どうしの兼任はしない（ほかの部門の部長は busy）・外すと自分に戻り、持ち場の仕事はそのまま', () => {
    const s = twoDepts();
    const a = s.staff[0].hero;
    expect(setHead(s, 'logistics', a)).toBeNull();
    expect(setHead(s, 'hr', a)).toBe('busy');
    expect(headOf(s, 'hr')).toBeNull();
    expect(roleCount(staffOf(s, a)!)).toBe(1);
    // 同じ部門に置き直すのはよい
    expect(setHead(s, 'logistics', a)).toBeNull();
    staffOf(s, a)!.task = 'buy';
    expect(setHead(s, 'logistics', null)).toBeNull();
    expect(headOf(s, 'logistics')).toBeNull();
    expect(staffOf(s, a)!.task).toBe('buy');
  });
  it('固有の能力（multiRole）：ダ・ビンチ・フランクリン・平賀源内は 2 つまで（復刻の番号も同じ）・ほかは 1', () => {
    expect(multiRole(5005)).toBe(2);
    expect(multiRole(15005)).toBe(2);
    expect(multiRole(2041)).toBe(2);
    expect(multiRole(3003)).toBe(2);
    expect(multiRole(s0().staff[0].hero)).toBe(1);
    const s = twoDepts();
    setLevel(s, 'marketing', DELEG.headAt);
    s.staff.push({ ...structuredClone(s.staff[0]), hero: 5005, task: null, target: null });
    expect(setHead(s, 'logistics', 5005)).toBeNull();
    expect(setHead(s, 'hr', 5005)).toBeNull();
    expect(setHead(s, 'marketing', 5005)).toBe('busy');
    expect(staffOf(s, 5005)!.heads).toEqual(['logistics', 'hr']);
  });
  it('セクター長になると、兼ねられない部長の役職は外れる（固有の能力のヒーローは 1 つ残る）', () => {
    const s = twoDepts();
    const a = s.staff[0].hero;
    s.staff.push({ ...structuredClone(s.staff[0]), hero: 5005, task: null, target: null });
    setHead(s, 'logistics', a);
    setHead(s, 'hr', 5005);
    s.land = { cur: 'c1', mine: ['c1', 'c2', 'c3'], recs: { c2: { id: 'c2', invest: 0.1, capital: 0, log: [] }, c3: { id: 'c3', invest: 0.1, capital: 0, log: [] } } } as never;
    expect(setSectorHead(s, 'c2', a)).toBe(true);
    expect(staffOf(s, a)).toMatchObject({ task: 'manager', target: 'c2' });
    expect(staffOf(s, a)!.heads).toBeUndefined();
    expect(headOf(s, 'logistics')).toBeNull();
    setSectorHead(s, 'c3', 5005);
    expect(staffOf(s, 5005)!.heads).toEqual(['hr']);
    expect(canHoldRole(staffOf(s, 5005)!, { head: 'logistics' })).toBe(false);
  });
  it('古いセーブ：task lead・H:部門 の部長は役職へ移る（兼任ではないので知らせない）。兼任になっていたら 1 つだけ残して知らせる', () => {
    const s = twoDepts();
    const [a, b] = s.staff.map((x) => x.hero);
    Object.assign(staffOf(s, a)!, { task: 'lead', target: 'H:logistics' });
    const back = deserializeP1(serializeP1(s))!;
    expect(staffOf(back, a)).toMatchObject({ task: null, heads: ['logistics'] });
    expect(back.flags.roleFix).toBeUndefined();
    expect(headOf(back, 'logistics')?.hero).toBe(a);
    // 兼任（2 つの部長）を読み込むと 1 つだけ残る
    staffOf(s, b)!.heads = ['hr', 'marketing'];
    const fixed = fixRoles(s);
    expect(fixed).toContain(b);
    expect(staffOf(s, b)!.heads).toEqual(['hr']);
    // セクター長の写しが、いまセクター長でない人を指していたら外す
    s.land = { cur: 'c1', mine: ['c1', 'c2'], recs: { c2: { id: 'c2', invest: 0.1, capital: 0, log: [], manager: a } } } as never;
    expect(fixRoles(s)).toContain(a);
    expect((s.land as { recs: Record<string, { manager: number | null }> }).recs.c2.manager).toBeNull();
  });
});
const s0 = () => newP1(1);
