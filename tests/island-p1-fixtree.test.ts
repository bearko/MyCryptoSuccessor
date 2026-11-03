/**
 * テストプレイの不具合の修正（2026-11-03）：
 * ① スキルツリー（外周が開く演出のあとの「OK」の無い幕）はブラウザで確かめる（Playwright）。資金がマイナスのときのパネルの購入はここ。
 * ② ランクアップの災害のあと、RP で開けたパネルの引き継ぎ（印・効き目・払い直しなし）。
 * ③ 提案・指示の「棚に並べる」で、棚が増える・新しい棚にその商品が置かれる・作業台が切り替わる・知らせ（トースト）の文。
 */
import { describe, expect, it } from 'vitest';
import { SKILL, isResearch } from '../src/island/p1/data';
import { moveTo } from '../src/island/p1/land';
import { allowedDirs, build, carriedRp, craftDays, deserializeP1, has, jamOf, learn, missingFront, myShops, newP1, pickHires, uncommonHeroes, openGate, serializeP1, skillLock, step, type P1State } from '../src/island/p1/model';
import { execute } from '../src/island/p1/deleg';
import { stockMsg, stockPlan } from '../src/island/p1/moves';
import { shapeById } from '../src/island/p1/treelayout';
import { shelfPicks } from '../src/island/p1/orders';
import { HIRE_POOL, isResearch as isRes } from '../src/island/p1/data';
import { charismaOf, charismaWays, hireEmptyLines, nearestWay } from '../src/island/p1/hr';
import { cardsMonth, cardInbox } from '../src/island/p1/card';
import { heroById } from '../src/game/catalog';
import { runOnce } from '../scripts/island/sim';

function put(s: P1State, id: string, skip = 0) {
  let n = 0;
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const d = allowedDirs(s, id, i, j);
      if (d.length && n++ >= skip) {
        const b = build(s, id, i, j, d[0]);
        if (typeof b === 'string') throw new Error(b);
        b.left = 1;
        step(s);
        return b;
      }
    }
  throw new Error('no lot');
}

describe('資金がマイナスのときのパネル', () => {
  it('RP のパネルは資金に関係なく開けられ、お金のパネルは開けられない（資金は動かない）', () => {
    const s = newP1(9);
    s.tut = 99;
    s.flags.hq = true;
    s.money = -17534;
    s.rp = 2051;
    const rp = 'five_s';
    expect(isResearch(SKILL[rp])).toBe(true);
    expect(skillLock(s, SKILL[rp])).toBeNull();
    expect(learn(s, rp)).toBeNull();
    expect(s.money).toBe(-17534);
    expect(s.rp!).toBeLessThan(2051);
    // お金のパネル：足りない（マイナスのまま）
    expect(isResearch(SKILL.jig)).toBe(false);
    expect(skillLock(s, SKILL.jig)).toBe('money');
    expect(learn(s, 'jig')).toBe('money');
    expect(has(s, 'jig')).toBe(false);
    expect(s.money).toBe(-17534);
  });
});

describe('引き継いだ RP のパネル', () => {
  function reset(): P1State {
    const s = newP1(9);
    s.tut = 99;
    s.money = 1e7;
    s.flags.digMeet = 'done';
    s.flags.hq = true;
    openGate(s);
    put(s, 'workshop');
    put(s, 'general_store', 3);
    s.skills.push('jig', 'jig2');
    s.letters = ['U'];
    s.rp = 1000;
    expect(moveTo(s, 'u1', 10001)).toBeNull();
    return s;
  }
  it('お金のパネル（段取りの改善）は未取得に戻り、RP のパネル（型の工夫）は残って「引き継ぎ」と分かる', () => {
    const s = reset();
    expect(has(s, 'jig')).toBe(false);
    expect(has(s, 'jig2')).toBe(true);
    expect(s.resets![0].kept).toContain('jig2');
    expect(carriedRp(s, 'jig2')).toBe(true);
    expect(missingFront(s, 'jig2')).toEqual(['jig']);
    // お金のパネルは引き継ぎではない
    expect(carriedRp(s, 'jig')).toBe(false);
    // 災害のあとに新しく開けた RP のパネルは「引き継ぎ」ではない
    s.rp = 500;
    expect(learn(s, 'five_s')).toBeNull();
    expect(carriedRp(s, 'five_s')).toBe(false);
  });
  it('手前のお金のパネルが無くても、引き継いだ RP のパネルは効く。手前を開け直しても RP の払い直しはなく、そのまま効く', () => {
    const s = reset();
    const x = 'Sensu:C' as const;
    const withBoth = deserializeP1(serializeP1(s))!;
    const without = deserializeP1(serializeP1(s))!;
    without.skills = without.skills.filter((id) => id !== 'jig2');
    // 型の工夫（−15%）は、手前の段取りの改善が無くても効いている
    expect(craftDays(withBoth, x)).toBeLessThan(craftDays(without, x));
    expect(skillLock(s, SKILL.jig2)).toBe('done');
    // 手前を開け直す（お金だけ）：RP は減らない・型の工夫はそのまま・さらに日数が縮む
    const rp = s.rp;
    const d0 = craftDays(s, x);
    s.money = 1e6;
    expect(learn(s, 'jig')).toBeNull();
    expect(s.rp).toBe(rp);
    expect(has(s, 'jig2')).toBe(true);
    expect(craftDays(s, x)).toBeLessThan(d0);
    expect(missingFront(s, 'jig2')).toEqual([]);
    // 記録の無い古いセーブでも、手前が外れている RP のパネルは「引き継ぎ」
    const old = deserializeP1(serializeP1(reset()))!;
    old.resets![0].kept = undefined;
    expect(carriedRp(old, 'jig2')).toBe(true);
  });
});

/** 棚を増やして並べる手が打てる、タオックスの「④ 販売が詰まっている月」（自動プレイの最短の方針の写し） */
let save: string | null = null;
function sellJam(): P1State {
  if (!save)
    runOnce('rta', 1, {
      onlyFirst: true,
      onMonth: (s, _sector, m) => {
        if (!save && m >= 2 && myShops(s).length && jamOf(s) === 'sell') save = serializeP1(s);
      },
    });
  const s = deserializeP1(save!)!;
  s.tut = 99;
  s.money = 50000;
  return s;
}

describe('棚に並べる手（提案カード・指示の箱・受け箱の承認が同じ execute を使う）', () => {
  it('棚が +1 され、新しい棚にその商品が置かれ、作業台がその商品に切り替わる。知らせの文に棚の番号と作業台の番号が入る', () => {
    const s = sellJam();
    const b = myShops(s)[0];
    const p = shelfPicks(s, b.uid).find((x) => x.ok && x.add && x.make != null)!;
    expect(p).toBeTruthy();
    const key = p.x.split(':')[0];
    const n0 = s.shops[b.uid].shelves.length;
    const act = { k: 'stock' as const, uid: b.uid, key, rar: 'C' as const, idx: -1, add: true, make: p.make! };
    const plan = stockPlan(s, act)!;
    const money = s.money;
    expect(execute(s, act)).toBeNull();
    expect(s.shops[b.uid].shelves.length).toBe(n0 + 1);
    expect(s.shops[b.uid].shelves[n0]).toBe(p.x);
    expect(s.money).toBe(money - p.cost);
    // 作業台：止まっていれば今すぐ、動いていればいまのロットが終わってから
    const sl = s.slots[p.make!];
    if (plan.later) expect(s.deleg?.pend[p.make!]).toBe(p.x);
    else expect(sl.sku).toBe(p.x);
    const msg = stockMsg(plan, key);
    expect(msg).toContain(`${n0 + 1} 段目`);
    expect(msg).toContain(`作業台 ${p.make! + 1}`);
    expect(msg).toContain(plan.later ? 'ロットが終わったら' : '切り替えました');
  });
  it('作業台が動いているときは、その台の切り替えは「いまのロットが終わってから」になり、ロットが終わると替わる', () => {
    const s = sellJam();
    const b = myShops(s)[0];
    const p = shelfPicks(s, b.uid).find((x) => x.ok && x.add && x.make != null)!;
    const k = p.make!;
    s.slots[k].running = true;
    const act = { k: 'stock' as const, uid: b.uid, key: p.x.split(':')[0], rar: 'C' as const, idx: -1, add: true, make: k };
    const plan = stockPlan(s, act)!;
    expect(plan.later).toBe(true);
    expect(execute(s, act)).toBeNull();
    expect(s.deleg!.pend[k]).toBe(p.x);
    expect(stockMsg(plan, act.key)).toContain('ロットが終わったら');
  });
  it('空き棚に並べるとき（add: false）は棚の数は変わらず、その棚に置かれる', () => {
    const s = sellJam();
    const b = myShops(s)[0];
    const sh = s.shops[b.uid];
    sh.shelves[sh.shelves.length - 1] = null;
    const p = shelfPicks(s, b.uid).find((x) => x.ok && !x.add)!;
    expect(p).toBeTruthy();
    const n0 = sh.shelves.length;
    const act = { k: 'stock' as const, uid: b.uid, key: p.x.split(':')[0], rar: 'C' as const, idx: sh.shelves.indexOf(null), add: false, ...(p.make != null ? { make: p.make } : {}) };
    const plan = stockPlan(s, act)!;
    expect(execute(s, act)).toBeNull();
    expect(sh.shelves.length).toBe(n0);
    expect(sh.shelves).toContain(p.x);
    expect(stockMsg(plan, act.key)).toContain(`${act.idx + 1} 段目`);
  });
  it('並べる候補は、アンコモンを作っている町ではその作っているほう（コモンを並べて作り手がいない棚にしない）', () => {
    const s = sellJam();
    const b = myShops(s)[0];
    s.tier = 'U';
    s.skills.push('pot');
    const x = shelfPicks(s, b.uid)[0].x;
    const key = x.split(':')[0];
    // その商品のアンコモンを開発して、いま作業台がアンコモンを作っている
    s.dev = [key];
    s.slots[0].sku = `${key}:U` as never;
    const p = shelfPicks(s, b.uid).find((y) => y.x.split(':')[0] === key);
    // 棚にすでにある商品は候補に出ない。出るなら、作っているアンコモンのほう
    if (p) expect(p.x).toBe(`${key}:U`);
  });
});

describe('D. 人を雇う（Uncommon・採用のパネル・候補 0 人・提案）', () => {
  const commons = () => HIRE_POOL.filter((id) => heroById.has(id));
  /** Common のヒーローを全員雇った会社（候補は Uncommon だけになる） */
  function allCommon(): P1State {
    const s = newP1(9);
    s.tut = 99;
    s.skills.push('hire');
    for (const id of commons()) s.staff.push({ hero: id, task: null, target: null, wage: 100, stamina: 50, resting: false, stats: { phy: 20, int: 20, agi: 20, hp: 50 } } as never);
    return s;
  }
  it('カリスマ 10 で Uncommon の候補が出る（憧れの職場 b_scout なしで）。9 では出ない', () => {
    const s = allCommon();
    expect(has(s, 'b_scout')).toBe(false);
    s.charismaBonus = 9;
    expect(charismaOf(s)).toBe(9);
    expect(pickHires(s)).toEqual([]);
    s.charismaBonus = 10;
    const xs = pickHires(s);
    expect(xs.length).toBeGreaterThan(0);
    for (const id of xs) expect(uncommonHeroes()).toContain(id);
  });
  it('憧れの職場は候補を 5 人にして、アンコモンが雇えるときは必ず 1 人アンコモンが入る', () => {
    const s = newP1(9);
    s.tut = 99;
    s.skills.push('hire', 'slots', 'b_scout');
    s.charismaBonus = 10;
    for (let m = 0; m < 6; m++) {
      s.reports.length = m;
      const xs = pickHires(s);
      expect(xs.length).toBe(5);
      expect(xs.some((id) => uncommonHeroes().includes(id))).toBe(true);
    }
  });
  it('採用のパネル（人材の募集・採用枠の拡大・憧れの職場）は研究パネル（RP・四角）で、ランクアップの災害で消えない', () => {
    for (const id of ['hire', 'slots', 'b_scout']) {
      expect(isRes(SKILL[id]), id).toBe(true);
      expect(shapeById(id), id).toBe('square');
    }
    expect(SKILL.hire.rp).toBe(30);
    expect(SKILL.slots.rp).toBe(50);
    expect(SKILL.b_scout.rp).toBe(60);
    const s = newP1(9);
    s.tut = 99;
    s.money = 1e7;
    s.flags.digMeet = 'done';
    s.flags.hq = true;
    openGate(s);
    put(s, 'workshop');
    put(s, 'general_store', 3);
    s.skills.push('hire', 'slots', 'b_scout');
    s.letters = ['U'];
    expect(moveTo(s, 'u1', 10001)).toBeNull();
    for (const id of ['hire', 'slots', 'b_scout']) expect(has(s, id), id).toBe(true);
  });
  it('候補が 0 人のとき、理由と次の一手（カリスマの内訳・いちばん近い上げ方）の文が出る。候補がいれば出ない', () => {
    const s = allCommon();
    s.hirePool = [];
    s.charismaBonus = 7;
    const xs = hireEmptyLines(s);
    expect(xs[0]).toContain('Common のヒーローは全員仲間になりました');
    expect(xs[1]).toContain('次は Uncommon：カリスマ 10（あと 3）');
    expect(xs[1]).toContain('町の制覇・研究成果の発表・ブランド力');
    expect(xs.some((x) => x.includes('いまのカリスマ 7'))).toBe(true);
    expect(xs.some((x) => x.startsWith('いちばん近い上げ方：'))).toBe(true);
    // 近い上げ方：あと 3 を満たす中でいちばん小さい上がり方
    const w = nearestWay(s, 3)!;
    const ok = charismaWays(s).filter((x) => x.gain >= 3).sort((a, b) => a.gain - b.gain)[0];
    expect(w.gain).toBe(ok ? ok.gain : Math.max(...charismaWays(s).map((x) => x.gain)));
    s.hirePool = [1001];
    expect(hireEmptyLines(s)).toEqual([]);
  });
  it('人手が足りなくて雇える候補がいるとき、人事の担当（いなければマインちゃん）から「雇う」の提案カードが出る', () => {
    const s = sellJam();
    s.skills.push('hire');
    const free = s.slots.findIndex((x) => x.worker != null);
    expect(free).toBeGreaterThanOrEqual(0);
    // 作業台の職人を外し、買い付けの担当も外す：手が足りない
    for (const st of s.staff) if (st.task === 'craft' || st.task === 'buy' || st.task === 'transport') (st.task = null), (st.target = null);
    s.slots.forEach((sl) => (sl.worker = null));
    s.staff = s.staff.filter((x) => [10001, 10002, 10003].includes(x.hero));
    s.hirePool = commons().slice(0, 3);
    s.cards = undefined;
    const r = { ...s.reports[s.reports.length - 1], month: (s.reports[s.reports.length - 1]?.month ?? 0) + 1 };
    cardsMonth(s, r as never);
    const c = cardInbox(s).find((x) => x.src === 'hr');
    expect(c, '人事の提案カード').toBeTruthy();
    expect(c!.choices.some((x) => x.act.k === 'do' && x.act.a.k === 'hire')).toBe(true);
    expect(c!.issue.k).toBe('hire');
  });
});
