// 段 K3（docs/ISLAND_PHASE1.md「経営方針（段 K）」の段 K3 の項・docs/SUCCESSOR_ROADMAP.md「段 K3」）：
// 経営方針発表会をカードの一大イベントに・方針の副次効果（＋と−。部門の士気・指標・提案の傾向・できごとの起きやすさ）。
// 副次効果はどれも、実際にゲームの数字に効く（表示だけの効果は無い）
import { describe, expect, it } from 'vitest';
import { DEPTS, FX_LABEL, POL, POLICIES, POLICY_OF, POL_SIDES, type PolSide } from '../src/island/p1/data';
import { EV_KINDS, GOOD_KINDS } from '../src/island/p1/events';
import { POL_OFF, lessOf, polEvW, polFx, polStaffMorale, setCorp, sidesOf, staffDepts, tiltOf, tiltOfSet, whenOf } from '../src/island/p1/policy';
import { cardLines, deptStaff, reactOf, sideText } from '../src/island/p1/policycards';
import { moraleParts } from '../src/island/p1/hr';
import { fxSum, newP1, type P1State } from '../src/island/p1/model';

/** チュートリアルのあとの Common の町（1 か月目の締めのあと） */
function fresh(): P1State {
  const s = newP1(1);
  s.tut = 99;
  s.reports.push({ month: 1 } as never);
  return s;
}
/** 副次効果がプレイヤーに良いか（＋）悪いか（−） */
function signOf(x: PolSide): 1 | -1 {
  if (x.k === 'less') return -1;
  if (x.k === 'ev') return (GOOD_KINDS as string[]).includes(x.ev) === x.v > 0 ? 1 : -1;
  return x.v > 0 ? 1 : -1;
}

describe('副次効果の表（data.ts の POL_SIDES）', () => {
  it('37 の方針すべてにある。提案が増える（themes）と合わせて 3〜6 個。＋と−が 1 つ以上ずつ。向いている時期の 1 行つき', () => {
    expect(Object.keys(POL_SIDES).sort()).toEqual(POLICIES.map((p) => p.id).sort());
    for (const p of POLICIES) {
      const xs = sidesOf(p);
      const n = xs.length + p.themes.length;
      expect(n, p.id).toBeGreaterThanOrEqual(3);
      expect(n, p.id).toBeLessThanOrEqual(6);
      expect(xs.some((x) => signOf(x) < 0), `${p.id} に−が無い`).toBe(true);
      expect(xs.some((x) => signOf(x) > 0) || p.themes.length > 0, `${p.id} に＋が無い`).toBe(true);
      expect(whenOf(p).length, p.id).toBeGreaterThan(4);
    }
  });
  it('種類は今のモデルにあるものだけ（部門・汎用の効き目・提案の種類・できごと）。0 の値は無い・小さめ', () => {
    const depts = DEPTS.map((d) => d.id) as string[];
    for (const p of POLICIES)
      for (const x of sidesOf(p)) {
        if (x.k === 'mo') {
          expect(depts).toContain(x.d);
          expect(Math.abs(x.v)).toBeGreaterThan(0);
          expect(Math.abs(x.v)).toBeLessThanOrEqual(3);
        } else if (x.k === 'fx') {
          expect(x.fx in FX_LABEL || ['morale', 'rp', 'sat', 'labor'].includes(x.fx), x.fx).toBe(true);
          expect(Math.abs(x.v)).toBeGreaterThan(0);
          expect(Math.abs(x.v)).toBeLessThanOrEqual(0.05);
        } else if (x.k === 'ev') {
          expect(EV_KINDS).toContain(x.ev);
          expect(Math.abs(x.v)).toBeLessThanOrEqual(0.6);
        }
      }
  });
  it('一言の副次効果の文がある（方針の画面の行）', () => {
    expect(sideText(POLICY_OF.profit)).toContain('人事');
  });
});

describe('副次効果はゲームの数字に効く', () => {
  it('部門の士気：利益重視で人事の人（部長）の士気の目指す値 −2、経理の人 +3。その部門でない人は変わらない', () => {
    const s = fresh();
    const [a, b, c] = s.staff;
    a.heads = ['hr'];
    b.heads = ['accounting'];
    setCorp(s, ['balance'], true);
    const a0 = moraleParts(s, a).pol;
    const b0 = moraleParts(s, b).pol;
    const c0 = moraleParts(s, c).pol;
    setCorp(s, ['profit'], true);
    expect(moraleParts(s, a).pol - a0).toBeCloseTo(-2);
    // 経理：バランスの +2 → 利益重視の +3
    expect(moraleParts(s, b).pol - b0).toBeCloseTo(1);
    expect(staffDepts(c).includes('hr') || staffDepts(c).includes('accounting')).toBe(false);
    expect(moraleParts(s, c).pol).toBeCloseTo(c0);
    expect(polStaffMorale(s, a)).toBeCloseTo(-2);
    expect(deptStaff(s, 'hr').map((x) => x.hero)).toEqual([a.hero]);
  });
  it('指標：成長重視は建物の維持費 +2%（fxSum の upkeep が −0.02）。バランスは宣伝の効き目 −3%', () => {
    const s = fresh();
    setCorp(s, ['growth'], true);
    expect(polFx(s, 'upkeep')).toBeCloseTo(-0.02);
    setCorp(s, ['balance'], true);
    expect(polFx(s, 'ads')).toBeCloseTo(-0.03);
    expect(fxSum(s, 'ads')).toBeLessThan(0);
  });
  it('提案の傾向：研究重視は「売る手」の提案が × (1 − less)。推すものと減るものが重なれば掛け合わせ', () => {
    const s = fresh();
    setCorp(s, ['research'], true);
    expect(lessOf(s).has('sell')).toBe(true);
    expect(tiltOf(s, 'sell')).toBeCloseTo(1 - POL.less);
    expect(tiltOf(s, 'rp')).toBeCloseTo(1 + POL.tilt);
    expect(tiltOfSet(['research', 'growth'], 'sell')).toBeCloseTo((1 + POL.tilt) * (1 - POL.less));
  });
  it('できごとの起きやすさ：利益重視で「人の引き抜き」×1.5、人を大事にで ×0.5。止めたとき・チュートリアルは 1', () => {
    const s = fresh();
    setCorp(s, ['profit'], true);
    expect(polEvW(s, 'scout')).toBeCloseTo(1.5);
    expect(polEvW(s, 'heat')).toBe(1);
    setCorp(s, ['people'], true);
    expect(polEvW(s, 'scout')).toBeCloseTo(0.5);
    POL_OFF.on = true;
    try {
      expect(polEvW(s, 'scout')).toBe(1);
    } finally {
      POL_OFF.on = false;
    }
    const t = newP1(1);
    expect(polEvW(t, 'tired')).toBe(1);
    expect(polStaffMorale(t, t.staff[0])).toBe(0);
  });
});

describe('カードの詳細（As-Is → To-Be）と役員の反応', () => {
  it('利益重視：素材の値段 100% → 下がる（良い）・人事の士気は下がる（悪い）・職場の提案が減る・引き抜きが増える（悪い）', () => {
    const s = fresh();
    s.staff[0].heads = ['hr'];
    const xs = cardLines(s, POLICY_OF.profit, []);
    const main = xs.find((x) => x.kind === 'main')!;
    expect(main.now).toBe('100%');
    expect(main.good).toBe(true);
    expect(main.dir).toBe(-1);
    const hr = xs.find((x) => x.kind === 'mo' && x.label.includes('人事'))!;
    expect(hr.good).toBe(false);
    expect(Number(hr.next)).toBeLessThan(Number(hr.now));
    expect(xs.find((x) => x.kind === 'less')!.good).toBe(false);
    const ev = xs.find((x) => x.kind === 'ev')!;
    expect(ev.now).toBe('×1');
    expect(ev.next).toBe('×1.5');
    expect(ev.good).toBe(false);
    // 同じ方針がほかにあっても、このカードを除いた組 → 足した組
    expect(cardLines(s, POLICY_OF.profit, ['profit']).find((x) => x.kind === 'ev')!.now).toBe('×1');
  });
  it('部長の反応：利益重視で人事部長は渋い顔（−）、経理部長は喜ぶ（＋）、方針の部門の部長は相性で＋', () => {
    const s = fresh();
    expect(reactOf(s, 'hr', ['profit']).score).toBeLessThan(0);
    expect(reactOf(s, 'accounting', ['profit']).score).toBeGreaterThan(0);
    expect(reactOf(s, 'accounting', ['profit']).fit).toBe(true);
    expect(reactOf(s, 'logistics', ['profit']).score).toBe(0);
    // 人を大事に：全員の士気 + が入るので、どの部門の部長も喜ぶ
    expect(reactOf(s, 'logistics', ['people']).score).toBeGreaterThan(0);
  });
});
