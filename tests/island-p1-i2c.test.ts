// 段 I2c（docs/SUCCESSOR_ROADMAP.md「段 I2c」）：経理の部長の手（税・経費のパネル）の見込みに、税が減る分・経費が減る分（いまのモデルの数字）を入れる。
// 部長の自動の施策の候補・経営会議の打ち手（①②③）がその数字で動く
import { describe, expect, it } from 'vitest';
import { MONEY_LEVER, SKILL } from '../src/island/p1/data';
import { deserializeP1, gainSkill, has, myShops, scratch, serializeP1, setLevel, lvOf, type P1State } from '../src/island/p1/model';
import { moneyGain } from '../src/island/p1/acctgain';
import { acctOf, taxOn, taxRate } from '../src/island/p1/acct';
import { candidates, ifsOf, setHead } from '../src/island/p1/deleg';
import { causeChips, causeName, diagnose, effOf, leverCore, panelLevers } from '../src/island/p1/boardplan';
import { runOnce } from '../scripts/island/sim';

const saves = new Map<string, string>();
/** その字で始まるランクの町（税がかかる会社・締めた四半期がある・お店がある）。自動プレイを途中で止めて写す。u＝Uncommon・r＝Rare */
function town(rank: 'u' | 'r'): P1State {
  if (!saves.has(rank)) {
    try {
      runOnce('normal', 1, {
        onMonth: (s, sector) => {
          if (sector.startsWith(rank) && taxOn(s) && acctOf(s).hist.length > 0 && myShops(s).length && (s.books?.months.length ?? 0) >= 3) {
            saves.set(rank, serializeP1(s));
            throw new Error('stop');
          }
        },
      });
    } catch (e) {
      if ((e as Error).message !== 'stop') throw e;
    }
  }
  const s = deserializeP1(saves.get(rank)!)!;
  s.money = 1_000_000;
  s.rp = 5000;
  return s;
}
const apply = (s: P1State, id: string) => {
  const c = scratch(s);
  if (has(s, id)) setLevel(c, id, lvOf(s, id) + 1);
  else {
    for (const r of SKILL[id].requires ?? []) if (!has(c, r)) gainSkill(c, r);
    gainSkill(c, id);
  }
  return c;
};

describe('税・経費の効き目（いまのモデルの数字から）', () => {
  it('材料費の分析：経費の減り ＝ 材料費 × 1 個の材料費の下がり方。税の減りは無い。合計は税引き後', () => {
    const s = town('u');
    const g = moneyGain(s, apply(s, 'ac_cost'));
    expect(g.cost).toBeGreaterThan(0);
    expect(g.tax).toBe(0);
    expect(g.total).toBeCloseTo(g.cost * (1 - taxRate(s)), 6);
  });
  it('税理士の顧問：差し引ける上限が上がるぶんだけ税が減る（上限に届いていなければ 0）', () => {
    const s = town('u');
    const g = moneyGain(s, apply(s, 'ac_advisor'));
    const rec = acctOf(s).hist[acctOf(s).hist.length - 1];
    // 経費は動かないか、ごくわずか（パネルを開くと部門の理解度が上がる分。いまのモデルの効き目）
    expect(g.cost).toBeLessThan(moneyGain(s, apply(s, 'ac_cost')).cost);
    // 上限に届いていた四半期なら減る・届いていなければ 0（作り話にしない）
    if (rec.ded >= rec.cap - 1 && rec.base > 0) expect(g.tax).toBeGreaterThan(0);
    else expect(g.tax).toBeGreaterThanOrEqual(0);
  });
  it('税がかからない会社（Common だけ）は税の減り 0', () => {
    const s = town('u');
    s.land = s.land ? { ...s.land, mine: [] } : s.land;
    s.tier = 'C';
    expect(taxOn(s)).toBe(false);
    expect(moneyGain(s, apply(s, 'ac_advisor')).tax).toBe(0);
  });
});

describe('経理の部長：候補と経営会議の打ち手', () => {
  it('部長の候補（Rare）に、税・経費の減りで見込んだ経理のパネルが入る（流れの手が無くても）。どれも元が取れる手', () => {
    const s = town('r');
    const cs = candidates(s, 'accounting', ifsOf(s));
    const ids = cs.map((c) => (c.act.k === 'skill' || c.act.k === 'level' ? c.act.id : ''));
    expect(cs.length).toBeGreaterThan(0);
    expect(ids.every((x) => x.startsWith('ac_'))).toBe(true);
    for (const c of cs) expect(c.real).toBeGreaterThan(0);
  });
  it('経営会議（Uncommon・材料費の小さい町）：元が取れる税・経費の手が無ければ、その数字（いちばん良い手・元が取れるまでの月数）を原因に出す', () => {
    const s = town('u');
    const H = s.staff.find((x) => x.task == null) ?? s.staff[0];
    setHead(s, 'accounting', H.hero);
    const dg = diagnose(s, 'accounting', 0, { atk: 0, spd: 0, odd: 0, grow: 0 });
    if (dg.why?.k === 'need') {
      expect(dg.why.best).toBeTruthy();
      expect(dg.why.best!.pay).toBeGreaterThan(MONEY_LEVER.pay);
      expect(causeName(dg.why)).toBe('元が取れる手が無い');
      expect(causeChips(dg.why).some((x) => x.includes('元が取れるまで'))).toBe(true);
    } else expect(dg.lever?.k).toBe('panel');
  });
  it('経営会議（Rare・材料費の大きい町）：施策 0 件でも、元が取れる税・経費の手（見込みの G）を出す', () => {
    const s = town('r');
    const H = s.staff.find((x) => x.task == null) ?? s.staff[0];
    setHead(s, 'accounting', H.hero);
    const L = panelLevers(s, 'accounting');
    const money = L.filter((x) => x.save && x.save.total > 0);
    for (const x of money) expect((x.cost + x.rp * MONEY_LEVER.rpG) / x.save!.total).toBeLessThanOrEqual(MONEY_LEVER.pay);
    const dg = diagnose(s, 'accounting', 0, { atk: 0, spd: 0, odd: 0, grow: 0 });
    console.log(JSON.stringify({ levers: L.map((x) => ({ nm: x.nm, save: x.save, cost: x.cost, rp: x.rp })), why: dg.why, lever: dg.lever }));
    if (money.length) {
      expect(dg.why?.k).not.toBe('need');
      expect(dg.lever?.k).toBe('panel');
      if (dg.lever?.k === 'panel' && dg.lever.save) {
        expect(effOf(dg.lever)).toContain('税と経費');
        expect(leverCore(dg.lever, { atk: 0, spd: 0, odd: 0, grow: 0 })).toContain('『');
      }
      if (dg.why?.k === 'lock' && dg.why.save) expect(causeChips(dg.why).some((x) => x.includes('税・経費'))).toBe(true);
    }
  });
});
