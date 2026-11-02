// マインちゃんのメッセージ（段 UI2。docs/ISLAND_PHASE1.md「マインちゃんのメッセージ（UI2）」）：
// すべての会話の 1 枚が 60 字以内・Uncommon に着いた日の会話は 6 枚まで（部門の紹介は重ならず 1 日に 1 つ）・
// 月次報告・カードが開いているあいだは会話を待たせる・2 か月目からは地図の吹き出しを出さない・「詰まり」の札は SCM の詰まりと同じ
import { describe, expect, it } from 'vitest';
import raw from '../src/generated/catalog.json';
import { ACCT_INTRO, CS_INTRO, LEGAL_INTRO, SALES_INTRO, SECTORS, introFirstStep, type Tier } from '../src/island/p1/data';
import { AGAIN_TIP, DEEP_TIP, MEET_FOUND, MEET_LINES, MEET_WALL, PEEK_TIP, meetTip, presentAfter, topicsPage } from '../src/island/p1/digmeet';
import {
  CLEAR_LINE,
  DONATE_LINE,
  DUNGEON_LINE,
  GATE_LINES,
  HIRE_LINES,
  LAND_CLEAR_LINE,
  LINE_MAX,
  MANAGER_LINE,
  MUSEUM_LINE,
  RANK_LINES,
  RELIC_LINE,
  RESET_EPIC,
  RESET_LINE,
  RESET_RARE,
  REVIVE_LINE,
  RP_LINE,
  RUIN_LINE,
  SIDE_LINES,
  TALK_MAX,
  TOUR,
  ZERO_LINE,
  arrivalPages,
  bubbleKind,
  chipOf,
  deptTalkNext,
  freeUi,
  talkLen,
  talkWaits,
} from '../src/island/p1/mine';
import { TUT, TUT_END } from '../src/island/p1/tut';
import { allowedDirs, assign, build, canPlaceAt, jamOf, myShops, newP1, setShelf, startCraft, step, tutSpot, type P1State, type PBuilding } from '../src/island/p1/model';

/** いちばん長いヒーローの名前（セクター長の 1 枚の字数を、いちばん長い名前で確かめる） */
const longestHero = (raw as { heroes: { id: number; name: string }[] }).heroes.reduce((a, b) => (b.name.length > a.name.length ? b : a));
const BIG = '9,999,900 G';

/** 会話に出る文（チュートリアルのほか、到着の案内・部門の紹介・発掘・関所・ランキングの紹介など）を全部 */
function allTalks(): [string, string][] {
  const out: [string, string][] = [];
  const add = (where: string, text: string) => out.push([where, text]);
  for (const st of TUT) {
    for (const p of st.intro?.pages ?? []) add(`TUT ${st.id}`, p.text);
    for (const p of st.sheetTalk?.pages ?? []) add(`TUT ${st.id}（画面の上）`, p.text);
  }
  TUT_END.forEach((p) => add('TUT_END', p.text));
  for (const x of TOUR) {
    add(`TOUR ${x.key}`, x.say);
    if (x.then) add(`TOUR ${x.key} then`, x.then);
  }
  HIRE_LINES().forEach((x) => add('人材登用', x));
  add('研究ポイント', RP_LINE(999));
  for (const d of SECTORS) {
    d.profile.intro.forEach((x, k) => add(`到着 ${d.id} ${k}`, x.split('{top}').join(BIG)));
    const tp = topicsPage(d.id);
    if (tp) add(`お題 ${d.id}`, tp);
    add(`出店許可 ${d.id}`, `[[${d.name}]]の出店許可がおりたよ！ ここは${d.tier}ランドセクタ。`);
  }
  for (const tier of ['C', 'U', 'R', 'E'] as Tier[]) for (const pot of [false, true]) add(`最初の一手 ${tier}`, introFirstStep(tier, pot));
  [RESET_LINE(), RESET_RARE(), RESET_EPIC(), RUIN_LINE(), MANAGER_LINE(longestHero.name)].forEach((x) => add('到着', x));
  [...SALES_INTRO(), ...ACCT_INTRO(), ...CS_INTRO(), ...LEGAL_INTRO()].forEach((x) => add('部門の紹介', x));
  [...SIDE_LINES(), ...GATE_LINES(9_999_900), REVIVE_LINE(), DUNGEON_LINE(), MUSEUM_LINE(), RELIC_LINE(), ...RANK_LINES(), ...MEET_LINES(), MEET_FOUND()].forEach((x) => add('ほか', x));
  // 顔つきのモーダルに残した文も 60 字まで（制覇・ランド制覇・調査依頼状）
  add('制覇', CLEAR_LINE(9_999_900));
  for (const tier of ['C', 'U', 'R', 'E'] as Tier[]) add(`ランド制覇 ${tier}`, LAND_CLEAR_LINE(tier, 8));
  for (const letter of [null, 'U', 'R', 'E', 'L'] as const) for (const left of [0, 1]) for (const c of [false, true]) for (const tier of ['C', 'U', 'R', 'E'] as Tier[]) add(`発表のあと ${letter} ${left} ${c} ${tier}`, presentAfter(letter, left, c, tier));
  return out;
}

describe('1 枚 60 字まで', () => {
  it('字数は空白と [[ ]] を除いた字の数', () => {
    expect(talkLen('[[工房]]ができたね！ ここで作るよ。')).toBe(15);
    expect(TALK_MAX).toBe(60);
    expect(LINE_MAX).toBe(30);
  });
  it('すべての会話の 1 枚が 60 字以内（日本語）', () => {
    const over = allTalks().filter(([, x]) => talkLen(x) > TALK_MAX);
    expect(over.map(([w, x]) => `${w}: ${talkLen(x)} ${x}`)).toEqual([]);
    expect(allTalks().length).toBeGreaterThan(150);
  });
  it('研究成果の発表の会話（町の長）も 60 字以内（どのランクの町でも）', async () => {
    const { presentPages } = await import('../src/island/p1/digmeet');
    const { newDig } = await import('../src/island/p1/model');
    for (const id of ['c1', 'c2', 'u1', 'r1', 'e1']) {
      const s = newP1(1);
      s.sector = id;
      s.dig = newDig(id);
      for (const letters of [[], ['U'], ['U', 'R'], ['U', 'R', 'E']] as Tier[][]) {
        s.letters = letters;
        for (const pg of presentPages(s)) expect(talkLen(pg.text), `${id} ${pg.text}`).toBeLessThanOrEqual(TALK_MAX);
      }
    }
  });
  it('画面の中に残したマインちゃんの一言は 1 行・30 字まで', () => {
    for (const x of [ZERO_LINE(), DONATE_LINE(), MEET_WALL(), PEEK_TIP(), AGAIN_TIP(), DEEP_TIP()]) expect(talkLen(x), x).toBeLessThanOrEqual(LINE_MAX);
  });
  it('チュートリアルの会話の流れ（枚数）は変えていない', () => {
    expect(TUT.map((st) => st.intro?.pages.length ?? 0)).toEqual([4, 0, 5, 0, 0, 0, 3, 3, 0, 2, 3, 0, 0, 2]);
    expect(TUT.find((x) => x.id === 'craft')?.sheetTalk?.pages).toHaveLength(4);
    expect(TUT_END).toHaveLength(3);
    expect(TOUR).toHaveLength(7);
  });
});

/** Uncommon の町（ウメコタウン）に初めて着いた日（ランクアップの災害のあと・前の町はセクター長に任せた・発掘と出会ったあと） */
function arrivedU(): P1State {
  const s = newP1(1);
  s.tut = 99;
  s.sector = 'u1';
  s.tier = 'U';
  s.flags.digMeet = 'done';
  s.flags.depts = [...(s.flags.depts ?? []), 'accounting', 'general', 'support'];
  s.day = 100;
  return s;
}

describe('Uncommon に着いた日', () => {
  it('到着の案内は 6 枚まで（いままでは 6 枚 ＋ 経理と総務 3 枚 ＋ CS 3 枚の 12 枚）', () => {
    const s = arrivedU();
    const a = arrivalPages(s, { target: 'u1', fresh: true, manager: longestHero.id, reset: true });
    expect(a.intro).toBe(true);
    expect(a.pages.length).toBeLessThanOrEqual(6);
    for (const p of a.pages) expect(talkLen(p.text), p.text).toBeLessThanOrEqual(TALK_MAX);
    // 研究の枚（市場データのボタン）とお題の枚（お題の絵）
    expect(a.pages.filter((p) => p.kind === 'research')).toHaveLength(1);
    expect(a.pages.filter((p) => p.kind === 'topic')).toHaveLength(1);
  });
  it('部門の紹介は、到着の案内の日には出ず、1 日に 1 つずつ（経理と総務 → 次の日にカスタマーサポート）', () => {
    const s = arrivedU();
    // 到着の案内がまだ（needsIntro）・災害の演出がまだのあいだは出さない
    expect(deptTalkNext(s, freeUi(), { intro: true, reset: false })).toBeNull();
    expect(deptTalkNext(s, freeUi(), { intro: false, reset: true })).toBeNull();
    // 到着の案内を出した日（main.ts の arrive が flags.talkDay に入れる）
    s.flags.talkDay = s.day;
    expect(deptTalkNext(s, freeUi(), { intro: false, reset: false })).toBeNull();
    // 到着の案内の会話が出ているあいだも出さない（重ならない）
    s.day++;
    expect(deptTalkNext(s, { ...freeUi(), talk: true }, { intro: false, reset: false })).toBeNull();
    expect(deptTalkNext(s, freeUi(), { intro: false, reset: false })).toBe('acct');
    s.flags.acctTalk = true;
    s.flags.talkDay = s.day;
    expect(deptTalkNext(s, freeUi(), { intro: false, reset: false })).toBeNull();
    s.day++;
    expect(deptTalkNext(s, freeUi(), { intro: false, reset: false })).toBe('cs');
    s.flags.csTalk = true;
    s.flags.talkDay = s.day;
    s.day += 5;
    expect(deptTalkNext(s, freeUi(), { intro: false, reset: false })).toBeNull();
  });
  it('部門の紹介は 2 枚ずつ（経理と総務・CS・営業・法務）', () => {
    for (const x of [ACCT_INTRO(), CS_INTRO(), SALES_INTRO(), LEGAL_INTRO()]) expect(x).toHaveLength(2);
  });
  it('Rare・Epic に着いた日も、町の違いの 1 枚は災害のあとの 1 枚とまとめて 6 枚まで', () => {
    for (const [id, tier] of [
      ['r1', 'R'],
      ['e1', 'E'],
    ] as const) {
      const s = arrivedU();
      s.sector = id;
      s.tier = tier;
      const a = arrivalPages(s, { target: id, fresh: true, manager: longestHero.id, reset: true });
      expect(a.pages.length).toBeLessThanOrEqual(6);
      expect(a.pages[0].text).toBe(tier === 'R' ? RESET_RARE() : RESET_EPIC());
    }
  });
});

describe('会話を待たせる（月次報告・カード・画面）', () => {
  it('月次報告・カード・ほかの会話・災害の演出・移動中は、会話を出さない（画面の上の説明でも）', () => {
    for (const k of ['report', 'card', 'talk', 'disaster', 'moving'] as const) {
      expect(talkWaits({ ...freeUi(), [k]: true }), k).toBe(true);
      expect(talkWaits({ ...freeUi(), [k]: true }, true), k).toBe(true);
    }
  });
  it('画面（シート）・窓・置くモード・流れの案内のあいだも待つ。チュートリアルの「画面を開いたままの説明」だけは画面の上に出す', () => {
    for (const k of ['sheet', 'modal', 'placing', 'tour'] as const) {
      expect(talkWaits({ ...freeUi(), [k]: true }), k).toBe(true);
      expect(talkWaits({ ...freeUi(), [k]: true }, true), k).toBe(false);
    }
    expect(talkWaits(freeUi())).toBe(false);
  });
  it('月次報告・カードが開いているあいだは、部門の紹介も出さない', () => {
    const s = arrivedU();
    s.flags.talkDay = s.day - 1;
    expect(deptTalkNext(s, { ...freeUi(), report: true, sheet: true }, { intro: false, reset: false })).toBeNull();
    expect(deptTalkNext(s, { ...freeUi(), card: true, modal: true }, { intro: false, reset: false })).toBeNull();
    expect(deptTalkNext(s, freeUi(), { intro: false, reset: false })).toBe('acct');
  });
});

/** タオックスで工房とお店を建て、作って運んで売っている状態（チュートリアルのあと） */
function running(): P1State {
  const s = newP1(1);
  const lot = (id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] => {
    for (let j = 0; j < s.n; j++)
      for (let i = 0; i < s.n; i++) {
        const ds = allowedDirs(s, id, i, j);
        if (ds.length && !canPlaceAt(s, id, i, j, ds[0])) return [i, j, ds[0]];
      }
    throw new Error('no lot');
  };
  s.money = 80000;
  const [a, b, d] = lot('workshop');
  build(s, 'workshop', a, b, d);
  for (let k = 0; k < 5; k++) step(s);
  const sp = tutSpot(s, 'general_store')!;
  const shop = build(s, 'general_store', sp[0], sp[1], sp[2]) as PBuilding;
  for (let k = 0; k < 6; k++) step(s);
  assign(s, 10003, 'craft', 0);
  assign(s, 10002, 'shop', shop.uid);
  setShelf(s, shop.uid, 0, 'Sensu:C');
  startCraft(s, 0, 'Sensu:C');
  assign(s, 10001, 'transport', null);
  s.mats.wood = 300;
  for (let k = 0; k < 12; k++) step(s);
  s.tut = 99;
  return s;
}

describe('2 か月目からは地図の吹き出しを出さない', () => {
  it('チュートリアル（タオックスの 1 か月目）のあいだは、案内の吹き出しが残る', () => {
    const s = newP1(1);
    expect(typeof s.tut).toBe('number');
    expect(bubbleKind(s)).toBe('tut');
  });
  it('チュートリアルのあとは、月末ポーズ・販売の詰まり・依頼などでも吹き出しは出ない', () => {
    const s = running();
    expect(myShops(s).length).toBe(1);
    expect(bubbleKind(s)).toBeNull();
    s.monthPause = true;
    expect(bubbleKind(s)).toBeNull();
    s.monthPause = false;
    s.money = 100;
    expect(bubbleKind(s)).toBeNull();
  });
  it('発掘との出会いの途中（光っている荒れ地を押す・研究パネルを開く）だけは、押す場所の案内が残る', () => {
    const s = running();
    s.flags.digMeet = 'skill';
    expect(meetTip(s)).not.toBeNull();
    expect(bubbleKind(s)).toBe('meet');
    s.flags.digMeet = 'done';
    expect(bubbleKind(s)).toBeNull();
  });
});

describe('上の帯の「詰まり」の札', () => {
  it('SCM の詰まりの段と同じ（jamOf）。チュートリアルのあいだは出さない', () => {
    const s = running();
    const c = chipOf(s);
    expect(c).toEqual({ k: 'jam', stage: jamOf(s) });
    // 段を詰まらせると札も変わる（運ぶ人を外す → ③ 物流）
    assign(s, 10001, null, null);
    expect(chipOf(s)).toEqual({ k: 'jam', stage: jamOf(s) });
    s.tut = 3;
    expect(chipOf(s)).toBeNull();
  });
  it('工房・お店がまだ無い町では「次の一手」（工事中は出さない）', () => {
    const s = newP1(1);
    s.tut = 99;
    expect(chipOf(s)).toEqual({ k: 'ws' });
    const r = running();
    r.buildings = r.buildings.filter((b) => !(b.owner === 'me' && b.id === 'general_store'));
    expect(chipOf(r)).toEqual({ k: 'shop' });
  });
});
