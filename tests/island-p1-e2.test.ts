/**
 * 段 E2（docs/ISLAND_PHASE1.md「カリスマ度」「士気と給与」。数字は data.ts の CHARISMA・MORALE・SALARY、計算は hr.ts）：
 * カリスマ度の上がり方・しきい値で雇えるレアリティ・ランクアップの災害で残る・士気の上下と効き目・辞めたいの予告と引き止め・
 * 給与の合計がいまの人件費と同じ・古いセーブ。
 */
import { describe, expect, it } from 'vitest';
import { CHARISMA, HIRE_POOL, MORALE, PAY, SALARY, SKILL, aptitude } from '../src/island/p1/data';
import { moveTo } from '../src/island/p1/land';
import {
  bonus,
  build,
  allowedDirs,
  deserializeP1,
  endMonth,
  hire,
  newP1,
  openGate,
  pickHires,
  raise,
  serializeP1,
  setRest,
  speed,
  staffOf,
  step,
  wageMul,
  wageOf,
  type P1State,
  type PBuilding,
} from '../src/island/p1/model';
import {
  charismaLine,
  charismaOf,
  charismaParts,
  cutPay,
  hireCap,
  marketStep,
  moraleDay,
  moraleMul,
  moraleParts,
  payroll,
  syncCharisma,
  talk,
} from '../src/island/p1/hr';
import { heroRarityOf } from '../src/island/p1/hero';

/** チュートリアルが済んだタオックス（月の締めを 1 回済ませた＝士気が動く）。人材の募集あり */
function game(seed = 3): P1State {
  const s = newP1(seed);
  s.tut = 99;
  s.money = 1e7;
  s.flags.hq = true;
  s.skills.push('hire');
  s.reports.push(endMonth(s));
  return s;
}
/** 雇える候補から n 人雇う */
function hireN(s: P1State, n: number) {
  for (const id of HIRE_POOL) {
    if (n <= 0) break;
    if (s.staff.some((x) => x.hero === id)) continue;
    s.hirePool = [id];
    if (hire(s, id) == null) n--;
  }
}
function put(s: P1State, id: string, skip = 0): PBuilding {
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

describe('カリスマ度', () => {
  it('上がり方：制覇（町のランク）・研究成果の発表・ブランド力のいちばん高かった値・採用ブランド。0〜100', () => {
    const s = game();
    expect(charismaOf(s)).toBe(0);
    s.cleared = true;
    expect(charismaParts(s).clear).toBe(CHARISMA.clear.C);
    s.presented = ['c1', 'c2'];
    expect(charismaParts(s).present).toBe(2 * CHARISMA.present.C);
    s.presented = ['c1', 'u1'];
    expect(charismaParts(s).present).toBe(CHARISMA.present.C + CHARISMA.present.U);
    // ブランド力：いちばん高かった値（下がっても減らない）
    s.brand = 130;
    expect(charismaParts(s).brand).toBe(Math.floor(130 / CHARISMA.brand.per));
    s.brandPeak = 130;
    s.brand = 10;
    expect(charismaParts(s).brand).toBe(Math.floor(130 / CHARISMA.brand.per));
    s.brandPeak = 5000;
    expect(charismaParts(s).brand).toBe(CHARISMA.brand.max);
    s.skills.push('hr_brand');
    expect(charismaParts(s).panel).toBe(CHARISMA.panel);
    // ほかの町の制覇（ランドの写し）
    s.land = { cur: 'c1', mine: ['c1', 'u1', 'r1'], recs: { u1: { snap: { cleared: true, tier: 'U' } }, r1: { snap: { cleared: true, tier: 'R' } } } } as unknown as P1State['land'];
    expect(charismaParts(s).clear).toBe(CHARISMA.clear.C + CHARISMA.clear.U + CHARISMA.clear.R);
    s.charismaBonus = 999;
    expect(charismaOf(s)).toBe(CHARISMA.max);
  });

  it('しきい値で雇えるレアリティ：0 で Common まで・U 10・R 35・E 60・L 85。雇う画面の 1 行', () => {
    const s = game();
    const at = (v: number) => hireCap(s, v);
    expect([at(0), at(CHARISMA.cap.U! - 1), at(CHARISMA.cap.U!), at(CHARISMA.cap.R! - 1), at(CHARISMA.cap.R!), at(CHARISMA.cap.E!), at(CHARISMA.cap.L!)]).toEqual(['C', 'C', 'U', 'U', 'R', 'E', 'L']);
    expect(charismaLine(s, 42)).toBe('カリスマ 42：レアまで雇える（エピックまで あと 18）');
    expect(charismaLine(s, 90)).toBe('カリスマ 90：レジェンドまで雇える');
  });

  it('雇える候補：パネルがあっても、カリスマ度が足りないレアリティは来ない。届けば来る（格の候補は Epic から）', () => {
    const rar = (s: P1State) => new Set(pickHires(s).map(heroRarityOf));
    const s = game();
    s.skills.push('slots', 'b_scout', 'headhunt');
    const seen0 = new Set<string>();
    for (let k = 0; k < 12; k++) {
      s.seed = 100 + k;
      for (const r of rar(s)) seen0.add(r);
    }
    expect([...seen0]).toEqual(['C']);
    // Uncommon まで
    s.charismaBonus = CHARISMA.cap.U!;
    const seenU = new Set<string>();
    for (let k = 0; k < 12; k++) {
      s.seed = 100 + k;
      for (const r of rar(s)) seenU.add(r);
    }
    expect(seenU.has('U')).toBe(true);
    expect(seenU.has('R')).toBe(false);
    // Rare（ヘッドハンティング）・Epic（格の候補）
    s.charismaBonus = CHARISMA.cap.E!;
    expect(rar(s).has('R')).toBe(true);
    expect(rar(s).has('E')).toBe(true);
    s.charismaBonus = CHARISMA.cap.L!;
    expect(rar(s).has('L')).toBe(true);
    // パネルなし（人材の募集だけ）：カリスマ度で Uncommon は来る（2026-11-03：憧れの職場は要らない）。Rare はヘッドハンティングが要る（格の候補だけ）
    const t = game();
    t.charismaBonus = CHARISMA.cap.E!;
    const xs = pickHires(t).map(heroRarityOf);
    expect(xs.filter((r) => r === 'R')).toEqual([]);
    expect(xs.some((r) => r === 'U')).toBe(true);
    expect(xs.filter((r) => r === 'E')).toHaveLength(1);
  });

  it('上がったら知らせる（雇えるレアリティが上がったときは cap）。ランクアップの災害でも減らない', () => {
    const s = game(9);
    s.money = 1e7;
    s.flags.digMeet = 'done';
    openGate(s);
    put(s, 'workshop');
    put(s, 'general_store', 3);
    expect(syncCharisma(s)).toBeNull();
    s.cleared = true;
    s.presented = ['c1', 'c2'];
    s.brand = 200;
    s.brandPeak = 200;
    const up = syncCharisma(s)!;
    expect(up.from).toBe(0);
    expect(up.to).toBe(CHARISMA.clear.C + 2 * CHARISMA.present.C + Math.floor(200 / CHARISMA.brand.per));
    expect(up.cap).toBe('U');
    expect(syncCharisma(s)).toBeNull();
    const before = charismaOf(s);
    s.letters = ['U'];
    // Uncommon へ進出（災害：所持金・建物・お金のパネルがリセット）
    expect(moveTo(s, 'u1', 10001)).toBeNull();
    expect(s.resets).toHaveLength(1);
    expect(charismaOf(s)).toBe(before);
    expect(s.charisma).toBe(before);
  });
});

describe('士気', () => {
  it('効き目：ふつうの帯（40〜70）は ×1。100 で ×1.2（調整 1）・20 未満で ×0.9。作業の速さに掛かる', () => {
    expect(moraleMul({ morale: MORALE.start })).toBe(1);
    expect(moraleMul({ morale: 40 })).toBe(1);
    expect(moraleMul({ morale: 100 })).toBeCloseTo(1.2, 6);
    expect(moraleMul({ morale: 85 })).toBeCloseTo(1.1, 6);
    expect(moraleMul({ morale: 30 })).toBeCloseTo(0.95, 6);
    expect(moraleMul({ morale: 10 })).toBeCloseTo(0.9, 6);
    const s = game();
    const st = s.staff[0];
    const v0 = speed(st, 'craft', s);
    st.morale = 100;
    expect(speed(st, 'craft', s) / v0).toBeCloseTo(1.2, 6);
    st.morale = 5;
    expect(speed(st, 'craft', s) / v0).toBeCloseTo(0.9, 6);
  });

  it('調整 1：士気 100 の効き目（×1.2）は、給与 1 段（作業の速さ +5%）の 4 倍。上の帯だけを強め、初めの 70 と下の帯は変えない', () => {
    expect(MORALE.band.top).toBe(1.2);
    expect(moraleMul({ morale: 100 }) - 1).toBeCloseTo(PAY.raiseSpeed * 4, 6);
    // 初めの 70（チュートリアル・序盤）は ×1 のまま。70 を超えると上がり始める
    expect(moraleMul({ morale: MORALE.start })).toBe(1);
    expect(moraleMul({ morale: 70 })).toBe(1);
    expect(moraleMul({ morale: 71 })).toBeGreaterThan(1);
    expect(moraleMul({ morale: 80 })).toBeCloseTo(1 + 0.2 / 3, 6);
    // 下の帯（20 未満で ×0.9）は前と同じ
    expect(moraleMul({ morale: 19 })).toBeCloseTo(0.9, 6);
    expect(moraleMul({ morale: 0 })).toBeCloseTo(0.9, 6);
    // 速さに掛かる：士気 100 の職人は、士気 70 の職人の 1.2 倍の速さで作る
    const s = game();
    const st = s.staff[0];
    st.morale = 70;
    const v70 = speed(st, 'craft', s);
    st.morale = 100;
    expect(speed(st, 'craft', s) / v70).toBeCloseTo(1.2, 6);
  });

  it('チュートリアル（タオックスの 1 か月目）のあいだは動かない', () => {
    const s = newP1(3);
    for (let k = 0; k < 20; k++) step(s);
    expect(s.reports.length).toBe(0);
    for (const st of s.staff) expect(st.morale).toBe(MORALE.start);
    expect(moraleDay(s, new Set([10001]))).toBeNull();
  });

  it('上下：目標へ寄る・休みで上がる・働きすぎ（スタミナが尽きた）で下がる・給与の相場との差・総務のパネル・同じ仕事の続きすぎ', () => {
    const s = game();
    const st = s.staff[0];
    // 目標：ふつう 55（創業の 3 人は給与の段 0・Lv1 の相場 0）
    expect(moraleParts(s, st).total).toBe(MORALE.base);
    st.morale = 70;
    moraleDay(s, new Set());
    expect(st.morale).toBeCloseTo(70 + (55 - 70) * MORALE.rate + MORALE.ev.idle, 6);
    // 休み
    st.morale = 55;
    st.resting = true;
    moraleDay(s, new Set());
    expect(st.morale).toBeCloseTo(55 + MORALE.ev.rest, 6);
    st.resting = false;
    // 働きすぎ
    st.morale = 55;
    st.task = 'shop';
    st.sameOf = 'shop';
    moraleDay(s, new Set([st.hero]));
    expect(st.morale).toBeCloseTo(55 + MORALE.ev.tired, 6);
    // 給与：相場より 1 段上は +8、下げた段は −10 − 8
    raise(s, st.hero);
    expect(moraleParts(s, st).pay).toBe(MORALE.pay.up);
    // 総務の職場の環境
    s.skills.push('lounge', 'shift');
    expect(moraleParts(s, st).env).toBe(2 * MORALE.env);
    // 同じ仕事の続きすぎ（60 日を過ぎて 10 日ごとに −1、−10 まで）
    st.same = MORALE.same.after + 35;
    expect(moraleParts(s, st).same).toBe(-3);
    st.same = 999;
    expect(moraleParts(s, st).same).toBe(-MORALE.same.max);
    // 仕事が替わると 0 から
    st.task = 'craft';
    moraleDay(s, new Set());
    expect(st.same).toBe(0);
  });

  it('出来事：レベルアップ・昇格・昇進（役目が上がった）・昇給・賞与・給与を下げる', () => {
    const s = game();
    hireN(s, 1);
    const st = s.staff[3];
    st.morale = 50;
    st.level = (st.level ?? 1) + 3;
    const tgt = moraleParts(s, st).total;
    moraleDay(s, new Set());
    const drift = (tgt - 50) * MORALE.rate + MORALE.ev.idle;
    expect(st.morale).toBeCloseTo(50 + drift + 3 * MORALE.ev.level, 6);
    // 同じ Lv では 2 度上がらない
    const m1 = st.morale!;
    moraleDay(s, new Set());
    expect(st.morale! - m1).toBeLessThan(1);
    // 昇進（チームリーダー）
    st.morale = 50;
    st.task = 'lead';
    st.target = 'L:rest';
    const t2 = moraleParts(s, st).total;
    moraleDay(s, new Set());
    expect(st.morale).toBeCloseTo(50 + (t2 - 50) * MORALE.rate + MORALE.ev.role, 6);
    st.task = null;
    st.target = null;
    // 昇給 +4・賞与 +8・下げる −8
    st.morale = 50;
    raise(s, st.hero);
    expect(st.morale).toBe(50 + MORALE.ev.raise);
    bonus(s, st.hero);
    expect(st.morale).toBe(50 + MORALE.ev.raise + MORALE.ev.bonus);
    expect(cutPay(s, st.hero)).toBeNull();
    expect(st.morale).toBe(50 + MORALE.ev.raise + MORALE.ev.bonus + MORALE.ev.cut);
    // キャリアの道すじ（パネル）：昇進・昇格・レベルアップの士気 +50%
    s.skills.push('hr_career');
    st.morale = 50;
    st.level = (st.level ?? 1) + 2;
    const t3 = moraleParts(s, st).total;
    moraleDay(s, new Set());
    expect(st.morale).toBeCloseTo(50 + (t3 - 50) * MORALE.rate + MORALE.ev.idle + 2 * MORALE.ev.level * (1 + MORALE.career), 6);
  });
});

describe('辞めたい（予告と引き止め）', () => {
  it('士気が 20 未満で 20 日続くと「辞めたい」の札（30 日の予告）。士気が 35 に戻れば思いとどまる。面談は予告 1 回に 1 度', () => {
    const s = game();
    hireN(s, 2);
    const st = s.staff[3];
    st.morale = 5;
    st.low = MORALE.quit.days - 1;
    const r = moraleDay(s, new Set())!;
    expect(r.want).toEqual([st.hero]);
    expect(st.quit).toBe(s.day + MORALE.quit.notice);
    // 引き止めの面談
    const m0 = st.morale!;
    expect(talk(s, st.hero)).toBeNull();
    expect(st.morale).toBe(m0 + MORALE.quit.talk);
    expect(talk(s, st.hero)).toBe('done');
    // 昇給・賞与で 35 まで戻す → 次の日に思いとどまる
    raise(s, st.hero);
    bonus(s, st.hero);
    st.morale = Math.max(st.morale!, MORALE.quit.safe);
    const r2 = moraleDay(s, new Set())!;
    expect(r2.stay).toEqual([st.hero]);
    expect(st.quit).toBeUndefined();
    expect(s.staff).toContain(st);
  });

  it('予告のあいだに手を打たないと辞める（仕事も外れる）。面談のパネルで予告が 45 日・面談の士気 +25。ヒーローが 3 人以下なら辞めない', () => {
    const s = game();
    hireN(s, 2);
    const st = s.staff[3];
    s.skills.push('hr_talk');
    st.morale = 0;
    st.low = MORALE.quit.days;
    moraleDay(s, new Set());
    expect(st.quit).toBe(s.day + MORALE.quit.noticeTalk);
    const m0 = st.morale!;
    expect(talk(s, st.hero)).toBeNull();
    expect(st.morale).toBe(m0 + MORALE.quit.talkPanel);
    st.morale = 0;
    // 予告の日を過ぎる
    s.day = st.quit!;
    const r = moraleDay(s, new Set())!;
    expect(r.quit).toEqual([st.hero]);
    expect(staffOf(s, st.hero)).toBeNull();
    expect(s.quits?.map((x) => x.hero)).toEqual([st.hero]);
    // 3 人以下：辞めない（札も出ない）
    const t = game();
    const f = t.staff[0];
    f.morale = 0;
    f.low = 99;
    moraleDay(t, new Set());
    expect(f.quit).toBeUndefined();
  });

  it('日を進めても、ふつうに休ませていれば辞めたいは出ない（士気はふつうの帯に寄る）', () => {
    const s = game();
    hireN(s, 3);
    for (let k = 0; k < 200; k++) step(s);
    for (const st of s.staff) {
      expect(st.quit).toBeUndefined();
      expect(st.morale!).toBeGreaterThan(MORALE.quit.below);
    }
  });
});

describe('給与', () => {
  it('ヒーローごとの月給の合計 ＝ いまの人件費（月の締めに払う額）。月給は雇ったときのまま（初期値は変わらない）', () => {
    const s = game();
    hireN(s, 3);
    s.skills.push('incentive');
    for (const st of s.staff.slice(3)) expect(st.wage).toBe(wageOf(st.hero));
    raise(s, s.staff[3].hero);
    const expected = Math.round(s.staff.reduce((a, x) => a + x.wage, 0) * wageMul(s));
    expect(payroll(s)).toBe(expected);
    s.monthCost.wages = 0;
    const m0 = s.money;
    const rep = endMonth(s);
    expect(rep.costs.wages).toBe(expected);
    expect(m0 - s.money).toBeGreaterThanOrEqual(expected);
  });

  it('相場の段：Lv1 で 0・もとのレアリティの上限 Lv で 1・昇格 1 回で +0.5（3 まで）', () => {
    const s = game();
    hireN(s, 1);
    const st = s.staff[3];
    expect(marketStep(st)).toBe(0);
    st.level = 60;
    expect(marketStep(st)).toBeCloseTo(SALARY.market.atCap, 6);
    st.rarity = 'U';
    expect(marketStep(st)).toBeCloseTo(SALARY.market.atCap + SALARY.market.promo, 6);
    st.level = 999;
    st.rarity = 'L';
    expect(marketStep(st)).toBe(PAY.raiseMax);
  });

  it('給与の段：＋1 段（昇給。速さ +5%）・−1 段（月給 −1 段。速さはそのまま、士気が下がる）。0 G と −2 段より下には下げない', () => {
    const s = game();
    hireN(s, 1);
    const st = s.staff[3];
    const w0 = st.wage;
    const v0 = speed(st, 'craft', s);
    expect(cutPay(s, st.hero)).toBeNull();
    expect(st.lv).toBe(-1);
    expect(st.wage).toBe(w0 - Math.max(100, Math.round(wageOf(st.hero) * PAY.raiseWage)));
    st.morale = MORALE.start;
    expect(speed(st, 'craft', s)).toBeCloseTo(v0, 9);
    expect(cutPay(s, st.hero)).toBeNull();
    expect(cutPay(s, st.hero)).toBe('min');
    expect(st.lv).toBe(SALARY.min);
    raise(s, st.hero);
    raise(s, st.hero);
    expect(st.wage).toBe(w0);
    // 創業の 3 人は月給 0 G：下げられない
    expect(cutPay(s, 10001)).toBe('min');
    // 相場より下：士気の目標が下がる
    const f = s.staff[0];
    f.level = 40;
    expect(moraleParts(s, f).pay).toBe(-MORALE.pay.down);
  });

  it('給与テーブル（パネル）：相場どおりか上の人の士気の目標 +4', () => {
    const s = game();
    const st = s.staff[0];
    const t0 = moraleParts(s, st).total;
    s.skills.push('hr_paytable');
    expect(moraleParts(s, st).total).toBe(t0 + MORALE.paytable);
    st.level = 40;
    expect(moraleParts(s, st).table).toBe(0);
  });
});

describe('パネルと古いセーブ', () => {
  it('人事のパネル 4 枚：人事の部門。研究パネル（面談・採用ブランド）は決め打ちの RP、お金パネル（キャリアの道すじ・給与テーブル）は Lv5 まで', () => {
    for (const id of ['hr_talk', 'hr_career', 'hr_brand', 'hr_paytable']) expect(SKILL[id], id).toBeTruthy();
    expect([SKILL.hr_talk.cat, SKILL.hr_brand.cat, SKILL.hr_career.cat, SKILL.hr_paytable.cat]).toEqual(['research', 'research', 'money', 'money']);
    expect([SKILL.hr_talk.rp, SKILL.hr_brand.rp]).toEqual([45, 130]);
    expect([SKILL.hr_brand.tier, SKILL.hr_paytable.tier]).toEqual(['U', 'U']);
  });

  it('版 14 のセーブ：士気は 70 から・月給と給与の段はそのまま・カリスマ度は記録からさかのぼって数える（読み込んでもトーストは出ない）', () => {
    const s = game();
    hireN(s, 2);
    raise(s, s.staff[3].hero);
    s.cleared = true;
    s.presented = ['c1'];
    s.brand = 85;
    const wages = s.staff.map((x) => [x.wage, x.lv ?? 0]);
    const o = JSON.parse(serializeP1(s));
    o.v = 14;
    for (const st of o.staff) {
      delete st.morale;
      delete st.seen;
      delete st.same;
      delete st.sameOf;
    }
    delete o.brandPeak;
    delete o.charisma;
    delete o.hrMonth;
    const back = deserializeP1(JSON.stringify(o))!;
    expect(back.v).toBe(26);
    for (const st of back.staff) expect(st.morale).toBe(MORALE.start);
    expect(back.staff.map((x) => [x.wage, x.lv ?? 0])).toEqual(wages);
    expect(back.brandPeak).toBe(85);
    expect(charismaOf(back)).toBe(CHARISMA.clear.C + CHARISMA.present.C + Math.floor(85 / CHARISMA.brand.per));
    expect(back.charisma).toBe(charismaOf(back));
    expect(syncCharisma(back)).toBeNull();
    // 版 15 で読み直しても同じ
    const again = deserializeP1(serializeP1(back))!;
    expect(again.staff.map((x) => x.morale)).toEqual(back.staff.map((x) => x.morale));
  });

  it('自動の休み（スタミナ）とのつながり：休ませると士気が上がる・ふつうの給与の人は目標 55 前後', () => {
    const s = game();
    const st = s.staff[1];
    st.morale = 50;
    setRest(s, st.hero, true);
    step(s);
    expect(st.morale!).toBeGreaterThan(50);
    expect(aptitude(st.stats, 'craft')).toBeGreaterThan(0);
  });
});
