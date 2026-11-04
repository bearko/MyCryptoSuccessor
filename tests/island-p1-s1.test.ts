// 段 S1（docs/ISLAND_PHASE1.md「教え（段 S1）」）：教えのデータ（史実の調査の言葉だけ・今の国や組織の名前なし）・残る条件（提案の結果・かかわった回数）・
// 1 人 1 つ・チュートリアルと 1 か月目は残らない・効き目の大きさと上限・セーブ（古いセーブは教えなし）
import { beforeAll, describe, expect, it } from 'vitest';
import fitJson from '../src/island/p1/heroes/fit.json';
import lessonJson from '../src/island/p1/heroes/lesson.json';
// @ts-expect-error 型の無い .mjs（ビルドの道具）
import { buildHeroData, WHY_NG } from '../scripts/heroes/build.mjs';
// @ts-expect-error 型の無い .mjs（ビルドの道具）
import { NOW_NG } from '../scripts/heroes/lessons.mjs';
import { DELEG, LESSON } from '../src/island/p1/data';
import { deserializeP1, fxSum, newP1, serializeP1, upkeepOf, type P1State, type Report, type Staff } from '../src/island/p1/model';
import { moraleParts } from '../src/island/p1/hr';
import { satAdd } from '../src/island/p1/cs';
import { hasLesson, lessonCounts, lessonDex, lessonFx, lessonMonth, lessonText, lessonTypeOf, LESSON_IDS, LESSON_OFF, LESSON_TYPES, loadLessons, meetHero, propErrK, readErr, takeFresh } from '../src/island/p1/lesson';

beforeAll(async () => {
  await loadLessons();
});

/** 2 か月目の締めのあと（チュートリアル済み・報告 2 つ）の町 */
function town(): P1State {
  const s = newP1(1);
  s.tut = 99;
  s.money = 1e6;
  s.day = 70;
  const rep = { month: 1, revenue: 200_000, bySeries: {}, costs: { materials: 50_000, wages: 0, part: 0, upkeep: 0, build: 0, ads: 0 }, profit: 0, area: [], rank: 5, news: [] } as unknown as Report;
  s.reports.push(rep, { ...rep, month: 2 });
  return s;
}
function add(s: P1State, hero: number, task: Staff['task'] = null, target: Staff['target'] = null): Staff {
  const st = { ...structuredClone(s.staff[0]), hero, task, target, morale: 70, resting: false } as Staff;
  s.staff.push(st);
  return st;
}
const rep = (s: P1State, results: { hero: number; est: number; real: number }[] = []): Report =>
  ({ ...s.reports[s.reports.length - 1], month: s.reports.length + 1, deleg: { duties: [], heads: [], props: 0, waiting: 0, results: results.map((x) => ({ dept: 'logistics', act: { k: 'skip' }, unit: 'G', ...x })) } }) as unknown as Report;
/** n 日ぶん、違う日にかかわる */
function meetDays(s: P1State, hero: number, n: number) {
  for (let k = 0; k < n; k++) {
    meetHero(s, hero);
    s.day++;
  }
}
/** 型 k の教えを n 個持たせる（記録だけ） */
function give(s: P1State, k: (typeof LESSON_TYPES)[number], n: number) {
  const ids = LESSON_IDS.filter((id) => lessonTypeOf(id) === k).slice(0, n);
  s.lessons ??= { got: {}, met: {}, last: {}, fresh: [], n: 0 };
  for (const id of ids) s.lessons.got[String(id)] = { hero: id, day: s.day, month: 2, via: 'meet' };
  s.lessons.n = Object.keys(s.lessons.got).length;
  return ids.length;
}

describe('教えのデータ（scripts/heroes/build.mjs・lessons.mjs）', () => {
  it('調査から作った lesson.json と fit.json の型が、いまの調査と同じ（作り直し忘れが無い）', () => {
    const b = buildHeroData();
    expect(b.errs).toEqual([]);
    expect(JSON.parse(JSON.stringify(b.lesson))).toEqual(lessonJson);
    expect(JSON.parse(JSON.stringify(b.fit))).toEqual(fitJson);
  });
  it('193 体のうち、コラボ・いまも信仰される神・調査に流儀の無いヒーローを除いた 185 体に 1 つずつ。8 つの型がどれも 10 以上', () => {
    expect(LESSON_IDS.length).toBe(185);
    for (const id of [3001, 3005, 3006, 2025, 4034, 4051, 3050, 2003]) expect(lessonTypeOf(id), String(id)).toBeNull();
    const c: Record<string, number> = {};
    for (const id of LESSON_IDS) c[lessonTypeOf(id)!] = (c[lessonTypeOf(id)!] ?? 0) + 1;
    expect(Object.keys(c).sort()).toEqual([...LESSON_TYPES].sort());
    for (const k of LESSON_TYPES) expect(c[k], k).toBeGreaterThanOrEqual(10);
  });
  it('名前・中身・もとに今の国・組織の名前と暴力・最期の言葉が無い。中身は 40 字まで・出典の URL は入れない', () => {
    for (const [id, x] of Object.entries(lessonJson as Record<string, { n: string; b: string; r: string }>)) {
      for (const v of [x.n, x.b, x.r]) {
        expect(NOW_NG.test(v), `${id} ${v}`).toBe(false);
        expect(WHY_NG.test(v), `${id} ${v}`).toBe(false);
      }
      expect([...x.b].length, id).toBeLessThanOrEqual(40);
      expect(x.n.length, id).toBeGreaterThan(0);
    }
    expect(JSON.stringify(lessonJson)).not.toMatch(/https?:\/\//);
  });
  it('伝承・物語の人物のもとは「伝承」と分かる書き方（史実として断定しない）', () => {
    const r = (lessonJson as Record<string, { r: string }>)['5006'].r;
    if (r) expect(r).toMatch(/伝承|伝わる|とされる|伝説|物語/);
  });
  it('レプリカはオリジナルと同じ教え（同じ人物なので、どちらかで 1 つ）', () => {
    expect(lessonTypeOf(15001)).toBe(lessonTypeOf(5001));
    expect(lessonText(15001)?.name).toBe(lessonText(5001)?.name);
    expect(lessonText(2001)?.body).toBe('既存の数字は怪しい。自分たちで測り直そう。');
  });
});

describe('教えが残るとき', () => {
  it('承認した提案が翌月の締めで見込みの向きに動いた → その締めで残る（お知らせの列に 1 回）', () => {
    const s = town();
    add(s, 2001, 'craft', 0);
    expect(lessonMonth(s, rep(s, [{ hero: 2001, est: 10, real: -3 }]))).toEqual([]);
    expect(lessonMonth(s, rep(s, [{ hero: 2001, est: 10, real: 4 }]))).toEqual([2001]);
    expect(s.lessons!.got['2001'].via).toBe('prop');
    expect(takeFresh(s)).toEqual([2001]);
    expect(takeFresh(s)).toEqual([]);
  });
  it(`違う日に ${LESSON.need} 回かかわる → 残る。同じ日は 1 回だけ数える`, () => {
    const s = town();
    add(s, 5001);
    for (let k = 0; k < 10; k++) meetHero(s, 5001);
    expect(s.lessons!.met['5001']).toBe(1);
    s.day++;
    meetDays(s, 5001, LESSON.need - 2);
    expect(lessonMonth(s, rep(s))).toEqual([]);
    s.day++;
    meetHero(s, 5001);
    expect(lessonMonth(s, rep(s))).toEqual([5001]);
    expect(s.lessons!.got['5001'].via).toBe('meet');
  });
  it('1 人から 1 つ：受け継いだあとは数えない・レプリカでももう残らない', () => {
    const s = town();
    add(s, 5001);
    add(s, 15001);
    meetDays(s, 5001, LESSON.need);
    expect(lessonMonth(s, rep(s))).toEqual([5001]);
    meetDays(s, 15001, LESSON.need + 2);
    expect(lessonMonth(s, rep(s, [{ hero: 15001, est: 5, real: 5 }]))).toEqual([]);
    expect(hasLesson(s, 15001)).toBe(true);
    expect(s.lessons!.n).toBe(1);
  });
  it(`1 回の締めで ${LESSON.perMonth} つまで（提案の結果が先）。会社にいない人は残らない`, () => {
    const s = town();
    add(s, 5001);
    add(s, 2001);
    meetDays(s, 5001, LESSON.need + 3);
    const got = lessonMonth(s, rep(s, [{ hero: 2001, est: 3, real: 1 }, { hero: 4002, est: 3, real: 9 }]));
    expect(got).toEqual([2001]);
    expect(lessonMonth(s, rep(s))).toEqual([5001]);
  });
  it('チュートリアルのあいだはかかわった回数を数えず、最初の 1 か月目の締め（報告が 2 つより少ない）は残らない', () => {
    const s = town();
    add(s, 2001);
    s.tut = 3;
    meetDays(s, 2001, LESSON.need + 2);
    expect(s.lessons?.met['2001'] ?? 0).toBe(0);
    s.tut = 99;
    s.reports.splice(1);
    meetDays(s, 2001, LESSON.need + 2);
    expect(lessonMonth(s, rep(s, [{ hero: 2001, est: 1, real: 1 }]))).toEqual([]);
    expect(s.lessons!.n).toBe(0);
  });
  it('教えの無いヒーロー（コラボ・ノービス）は数えない・残らない', () => {
    const s = town();
    add(s, 3001);
    add(s, 10001);
    meetDays(s, 3001, 9);
    meetDays(s, 10001, 9);
    expect(lessonMonth(s, rep(s, [{ hero: 3001, est: 1, real: 1 }]))).toEqual([]);
  });
  it('止めると（計測の「S1 なし」）残らない・効かない', () => {
    const s = town();
    add(s, 2001);
    give(s, 'numbers', 3);
    LESSON_OFF.on = true;
    try {
      expect(lessonMonth(s, rep(s, [{ hero: 2001, est: 1, real: 1 }]))).toEqual([]);
      expect(lessonFx(s, 'err')).toBe(0);
    } finally {
      LESSON_OFF.on = false;
    }
  });
});

describe('効き目（いまのモデルの数字だけ・小さく）', () => {
  it(`型ごとに 1 つ ${LESSON.fx.decide * 100}%（数字・顧客は ${LESSON.fx.numbers * 100}%・人を育てるは士気 +${LESSON.fx.people}）。${LESSON.cap} つまでで頭打ち`, () => {
    const s = town();
    expect(lessonFx(s, 'err')).toBe(0);
    give(s, 'numbers', 2);
    expect(lessonFx(s, 'err')).toBeCloseTo(2 * LESSON.fx.numbers);
    give(s, 'numbers', 9);
    expect(lessonCounts(s).numbers).toBeGreaterThan(LESSON.cap);
    expect(lessonFx(s, 'err')).toBeCloseTo(LESSON.cap * LESSON.fx.numbers);
    // どの型でも最大 +5%（数字・顧客は −15% の掛け算・人を育てるは士気 +5 点）
    for (const k of LESSON_TYPES) expect(LESSON.fx[k] * LESSON.cap, k).toBeLessThanOrEqual(k === 'people' ? 5 : k === 'numbers' || k === 'customer' ? 0.15 : 0.05);
  });
  it('数字の教え：提案の読みの誤差が小さくなる（±30% → ±26%）', () => {
    const s = town();
    expect(readErr(s, 0.7)).toBeCloseTo(0.3);
    give(s, 'numbers', LESSON.cap);
    expect(propErrK(s)).toBeCloseTo(DELEG.prop.err * (1 - LESSON.cap * LESSON.fx.numbers));
    expect(readErr(s, 0.7)).toBeCloseTo(0.26);
  });
  it('堅実の教え：建物の維持費 −、速さ：運ぶ・調達の日数 −、交渉：素材の値段 −（fxSum に足す）', () => {
    const s = town();
    const b = s.buildings.find((x) => x.owner === 'me' && (upkeepOf(s, x) ?? 0) > 0);
    const before = b ? upkeepOf(s, b) : 0;
    const f0 = Object.fromEntries((['upkeep', 'haulDays', 'buyDays', 'matPrice', 'craftDays'] as const).map((k) => [k, fxSum(s, k)]));
    give(s, 'steady', 3);
    give(s, 'speed', 2);
    give(s, 'deal', 1);
    expect(fxSum(s, 'upkeep') - f0.upkeep).toBeCloseTo(0.03);
    expect(fxSum(s, 'haulDays') - f0.haulDays).toBeCloseTo(0.02);
    expect(fxSum(s, 'buyDays') - f0.buyDays).toBeCloseTo(0.02);
    expect(fxSum(s, 'matPrice') - f0.matPrice).toBeCloseTo(0.01);
    expect(fxSum(s, 'craftDays')).toBe(f0.craftDays);
    if (b) expect(upkeepOf(s, b)).toBeLessThanOrEqual(before);
  });
  it('人を育てる教え：役目のある人だけ士気の目指す値 +（役目のない人は変わらない）', () => {
    const s = town();
    const lead = add(s, 2001, 'lead', 'craft');
    const none = add(s, 5001);
    const r0 = moraleParts(s, lead).role;
    const n0 = moraleParts(s, none).total;
    give(s, 'people', 2);
    expect(moraleParts(s, lead).role).toBe(r0 + 2 * LESSON.fx.people);
    expect(moraleParts(s, none).total).toBe(n0);
  });
  it('顧客の教え：満足度が下がるときだけゆるく（上がるときは同じ）', () => {
    const s = town();
    s.cs = { ...(s.cs ?? {}), sat: 60 } as P1State['cs'];
    satAdd(s, -10);
    const plain = s.cs!.sat;
    s.cs!.sat = 60;
    give(s, 'customer', 5);
    satAdd(s, -10);
    expect(s.cs!.sat).toBeCloseTo(60 - 10 * (1 - 5 * LESSON.fx.customer));
    expect(s.cs!.sat).toBeGreaterThan(plain);
    satAdd(s, 5);
    expect(s.cs!.sat).toBeCloseTo(60 - 10 * (1 - 5 * LESSON.fx.customer) + 5);
  });
});

describe('図鑑とセーブ', () => {
  it('図鑑：受け継いだもの・会社にいるまだの人（シルエット）・残りの数で全部', () => {
    const s = town();
    add(s, 2001);
    add(s, 5001);
    meetDays(s, 2001, 1);
    give(s, 'speed', 1);
    const d = lessonDex(s);
    expect(d.got.length + d.near.length + d.rest).toBe(LESSON_IDS.length);
    expect(d.total).toBe(LESSON_IDS.length);
    expect(d.near.find((r) => r.id === 2001)?.met).toBe(1);
  });
  it('セーブ：受け継いだ教えと回数は残る。古いセーブ（教えの項目なし）は教えなしから・効き目 0', () => {
    const s = town();
    add(s, 2001);
    give(s, 'numbers', 2);
    meetDays(s, 2001, 2);
    const back = deserializeP1(serializeP1(s))!;
    expect(back.lessons?.n).toBe(2);
    expect(back.lessons?.met['2001']).toBe(2);
    expect(lessonFx(back, 'err')).toBeCloseTo(2 * LESSON.fx.numbers);
    const o = JSON.parse(serializeP1(s));
    delete o.lessons;
    const old = deserializeP1(JSON.stringify(o))!;
    expect(old.v).toBe(o.v);
    expect(old.lessons).toBeUndefined();
    expect(lessonFx(old, 'err')).toBe(0);
    expect(lessonDex(old).got).toEqual([]);
  });
});
