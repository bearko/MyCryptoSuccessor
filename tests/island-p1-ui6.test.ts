// 段 UI6（docs/SUCCESSOR_ROADMAP.md「段 UI6 の実装」）：部門は「部長との会話」で動かす（話題の流れ・確認事項・部長がいないとき・
// マインちゃんの一言）・トロフィー（判定・保存の失敗に強いこと）
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DELEG, DEPT_SKILLS, SKILL } from '../src/island/p1/data';
import { deptLevel } from '../src/island/p1/dept';
import { headOf, setHead } from '../src/island/p1/deleg';
import { cardsDay, hireOffer } from '../src/island/p1/card';
import { newP1, type P1State, type Report, type Staff } from '../src/island/p1/model';
import { talkLen, TALK_MAX } from '../src/island/p1/mine';
import { loadVoice, unloadVoice } from '../src/island/p1/voice';
import {
  HEAD_OPEN_TALK,
  HEAD_PICK_TALK,
  MINE_NO_HEAD,
  TALK_DEPTS,
  checkItems,
  doneLine,
  everHead,
  headTalkDue,
  itemLine,
  laterLine,
  openLine,
  talkMode,
  topicLine,
  topicsOf,
} from '../src/island/p1/headtalk';
import { TROPHIES, TROPHY_KEY, checkTrophies, emptyBook, globalId, loadTrophies, pendingSync, saveTrophies } from '../src/island/p1/trophy';
import { SUB_ALIAS, SUB_DEFS } from '../src/island/p1/menus';
import { landCleared, playable } from '../src/island/p1/land';
import { BUDGET_OFF } from '../src/island/p1/budget';
import { openTier } from './l0util';

beforeAll(async () => {
  await loadVoice();
  // 段 L0：部長は Rare の町から（town は Rare の町を開いた会社）。部長を置ける理解度の節目（8）を確かめるので、予算で任せる段 I1 は止める
  BUDGET_OFF.on = true;
});
afterAll(() => {
  BUDGET_OFF.on = false;
});

/** 2 か月目の締めのあと（チュートリアル済み）の町 */
function town(): P1State {
  const s = openTier(newP1(1), 'R');
  s.tut = 99;
  s.money = 1e6;
  s.day = 70;
  const rep = { month: 1, revenue: 200_000, bySeries: {}, costs: { materials: 50_000, wages: 0, part: 0, upkeep: 0, build: 0, ads: 0 }, profit: 0, area: [], rank: 5, news: [] } as unknown as Report;
  s.reports.push(rep, { ...rep, month: 2 });
  return s;
}
function add(s: P1State, hero: number): Staff {
  const st = { ...structuredClone(s.staff[0]), hero, task: null, target: null, morale: 70, resting: false, heads: [] } as Staff;
  s.staff.push(st);
  return st;
}
/** 人事の理解度を部長の節目（8）以上に */
function hrOpen(s: P1State) {
  s.skillLv ??= {};
  for (const k of DEPT_SKILLS.hr.slice(0, 4)) {
    if (!s.skills.includes(k.id)) s.skills.push(k.id);
    s.skillLv[k.id] = 5;
  }
}
/** 部長の提案（人事）を受け箱に */
function hrProp(s: P1State, hero: number, id = 900) {
  const sk = DEPT_SKILLS.hr.find((k) => !s.skills.includes(k.id))!;
  s.deleg!.inbox.push({ id, dept: 'hr', hero, month: 2, sector: s.sector ?? 'c1', act: { k: 'skill', id: sk.id }, est: 1800, err: 0.1, unit: 'G', cost: SKILL[sk.id].cost, status: 'new' });
}
const all60 = (xs: string[]) => xs.forEach((x) => expect(talkLen(x), x).toBeLessThanOrEqual(TALK_MAX));

describe('会話で動かす部門（talkMode）', () => {
  it('いまは人事だけ。チュートリアルのあいだ・部長を置けない理解度では、いまの画面のまま（null）', () => {
    expect(TALK_DEPTS).toEqual(['hr']);
    const s = town();
    expect(deptLevel(s, 'hr')).toBeLessThan(DELEG.headAt);
    expect(talkMode(s, 'hr')).toBeNull();
    hrOpen(s);
    expect(deptLevel(s, 'hr')).toBeGreaterThanOrEqual(DELEG.headAt);
    expect(talkMode(s, 'hr')).toBe('mine');
    expect(talkMode(s, 'logistics')).toBeNull();
    s.tut = 5;
    expect(talkMode(s, 'hr')).toBeNull();
  });

  it('部長がいないとき：マインちゃんが「任せる人を選ぶ？」。話題は「任せる人を選ぶ」「自分で決める（詳しい画面）」', () => {
    const s = town();
    hrOpen(s);
    expect(openLine(s, 'hr')).toBe(MINE_NO_HEAD());
    expect(topicLine(s, 'hr', 'hire')).toBe(MINE_NO_HEAD());
    expect(topicsOf(s, 'hr').map((x) => x.id)).toEqual(['pick', 'self']);
  });

  it('部長がいるとき：話題は 2〜4（採用の状況・組織のこと・〔今月の確認事項（N）〕・任せ方を変える）。セリフは 60 字まで', () => {
    const s = town();
    hrOpen(s);
    add(s, 2044);
    expect(setHead(s, 'hr', 2044)).toBeNull();
    expect(talkMode(s, 'hr')).toBe('head');
    const ts = topicsOf(s, 'hr');
    expect(ts.map((x) => x.id)).toEqual(['hire', 'org', 'deleg']);
    expect(ts.length).toBeGreaterThanOrEqual(2);
    expect(ts.length).toBeLessThanOrEqual(4);
    all60([openLine(s, 'hr'), topicLine(s, 'hr', 'hire'), topicLine(s, 'hr', 'org'), topicLine(s, 'hr', 'deleg'), doneLine(s, 'hr'), laterLine(s, 'hr', 3)]);
    // 史実の調査のあるヒーロー（ソクラテス）は社長の呼び方で
    expect(openLine(s, 'hr').startsWith('社長')).toBe(true);
  });

  it('声のデータが無い（読み込み前・英語）ときは口調の型で、60 字まで', () => {
    const s = town();
    hrOpen(s);
    add(s, 2044);
    setHead(s, 'hr', 2044);
    unloadVoice();
    try {
      all60([openLine(s, 'hr'), topicLine(s, 'hr', 'hire'), topicLine(s, 'hr', 'org'), topicLine(s, 'hr', 'deleg'), doneLine(s, 'hr')]);
    } finally {
      return loadVoice();
    }
  });
});

describe('今月の確認事項（話題の中で順に）', () => {
  it('辞めたいの話（カード）・部長の提案が人事の確認事項に並び、件数が話題の名前に出る。ほかの部門の提案は入らない', () => {
    const s = town();
    hrOpen(s);
    add(s, 2044);
    setHead(s, 'hr', 2044);
    const q = add(s, 2020);
    q.quit = s.day + 10;
    q.morale = 20;
    cardsDay(s, [2020]);
    s.deleg ??= { next: {}, stat: {}, inbox: [], done: [], seq: 0, cover: [], pend: {}, adWait: {}, carry: 0, newProps: 0 };
    hrProp(s, 2044);
    s.deleg.inbox.push({ ...s.deleg.inbox[0], id: 901, dept: 'logistics' });
    const xs = checkItems(s, 'hr');
    expect(xs.map((x) => x.k)).toEqual(['card', 'prop']);
    const ts = topicsOf(s, 'hr');
    expect(ts.map((x) => x.id)).toEqual(['hire', 'org', 'check', 'deleg']);
    expect(ts.find((x) => x.id === 'check')!.label).toContain('（2）');
    // 部長が話す：ほかのヒーローの話は「〇〇から相談が届いている」
    expect(itemLine(s, 'hr', xs[0])).toContain('明智光秀');
    all60(xs.map((x) => itemLine(s, 'hr', x)));
    expect(openLine(s, 'hr')).toContain('2 件');
  });

  it('部長の提案のカード（承認の手が受け箱の提案を指す）は、提案と 2 重に並ばない', () => {
    const s = town();
    hrOpen(s);
    add(s, 2044);
    setHead(s, 'hr', 2044);
    s.deleg ??= { next: {}, stat: {}, inbox: [], done: [], seq: 0, cover: [], pend: {}, adWait: {}, carry: 0, newProps: 0 };
    hrProp(s, 2044, 777);
    s.cards = { seq: 1, inbox: [{ id: 1, src: 'head', kind: 'head:hr', hero: 2044, q: 0.8, dept: 'hr', mk: 0, sector: 'c1', day: s.day, issue: { k: 'head' }, choices: [{ act: { k: 'approve', pid: 777 }, cost: 0 }, { act: { k: 'reject', pid: 777 }, cost: 0 }], pop: false }], trust: [], mk: 0, popN: 0, heroes: [], last: {}, auto: [], stat: { made: {}, pop: {}, boxed: {}, auto: {}, months: {}, src: {} } };
    const xs = checkItems(s, 'hr');
    expect(xs.length).toBe(1);
  });

  it('採用の状況の提案（hireOffer）は受け箱に入れない仮のカードで、雇う手がおすすめ', () => {
    const s = town();
    const before = s.cards?.inbox.length ?? 0;
    const o = hireOffer(s);
    expect(s.cards?.inbox.length ?? 0).toBe(before);
    if (o) {
      expect(o.card.id).toBe(-1);
      expect(o.card.choices[o.k].act.k).toBe('do');
    }
  });
});

describe('マインちゃんの一言（部長を置けるようになった・初めて任命する）', () => {
  it('初めて部長を置けるようになったら 1 回（部長がいる・一言を見た・チュートリアルのあいだは出さない）', () => {
    const s = town();
    expect(headTalkDue(s)).toBeNull();
    hrOpen(s);
    expect(headTalkDue(s)).toBe('hr');
    s.flags.headTalk = true;
    expect(headTalkDue(s)).toBeNull();
    s.flags.headTalk = false;
    add(s, 2044);
    setHead(s, 'hr', 2044);
    expect(headTalkDue(s)).toBeNull();
  });
  it('一言は 1 枚 60 字まで・「操作の仕方が大きく変わる」を言う', () => {
    const xs = [...HEAD_OPEN_TALK('hr'), ...HEAD_PICK_TALK()];
    all60(xs);
    expect(HEAD_OPEN_TALK('hr').join('')).toContain('操作の仕方が大きく変わる');
    expect(HEAD_PICK_TALK().join('')).toContain('操作の仕方が大きく変わる');
  });
});

describe('トロフィー', () => {
  it('ID・名前・条件がそろい、全体の ID は successor/<id>。最初の 1 つはマイクロマネジメント', () => {
    expect(TROPHIES[0].id).toBe('micromanage');
    expect(TROPHIES[0].name()).toBe('マイクロマネジメント');
    expect(new Set(TROPHIES.map((x) => x.id)).size).toBe(TROPHIES.length);
    expect(TROPHIES.length).toBeGreaterThanOrEqual(3);
    expect(TROPHIES.length).toBeLessThanOrEqual(6);
    for (const d of TROPHIES) {
      expect(d.name().length).toBeGreaterThan(0);
      expect(d.cond().length).toBeGreaterThan(0);
    }
    expect(globalId('micromanage')).toBe('successor/micromanage');
  });

  it('マイクロマネジメント：Epic ランドを制覇して、部長を一度も置いていなければ取れる。一度置いたら（外しても）取れない', () => {
    const s = town();
    const tr = TROPHIES.find((x) => x.id === 'micromanage')!;
    expect(tr.test(s)).toBe(false);
    // Epic の町すべてで 👑（ほかのセクタの記録として）
    s.land = { cur: 'none', mine: [], recs: Object.fromEntries(playable('E').map((x) => [x.id, { snap: { cleared: true } }])) } as unknown as P1State['land'];
    openTier(s, 'R');
    expect(landCleared(s, 'E')).toBe(true);
    expect(tr.test(s)).toBe(true);
    hrOpen(s);
    add(s, 2044);
    setHead(s, 'hr', 2044);
    expect(tr.test(s)).toBe(false);
    setHead(s, 'hr', null);
    expect(headOf(s, 'hr')).toBeNull();
    expect(everHead(s)).toBe(true);
    expect(s.flags.headEver).toBe(true);
    expect(tr.test(s)).toBe(false);
  });

  it('段 UI6 の前のセーブ：部長の提案の記録が報告にあれば「置いたことがある」', () => {
    const s = town();
    expect(everHead(s)).toBe(false);
    (s.reports[1] as Report & { deleg?: unknown }).deleg = { duties: [], heads: [{ dept: 'hr', hero: 2044, q: 0.8 }], props: 1, waiting: 0, results: [] };
    expect(everHead(s)).toBe(true);
  });

  it('判定：取ったものを記録（日時・日）・2 回は取らない・チュートリアルのあいだは判定しない', () => {
    const s = town();
    hrOpen(s);
    add(s, 2044);
    setHead(s, 'hr', 2044);
    const b = emptyBook();
    s.tut = 3;
    expect(checkTrophies(s, b)).toEqual([]);
    s.tut = 99;
    const now = new Date('2026-11-03T00:00:00Z');
    const got = checkTrophies(s, b, now).map((x) => x.id);
    expect(got).toContain('first_head');
    expect(got).not.toContain('micromanage');
    expect(b.got.first_head).toEqual({ at: now.toISOString(), day: s.day });
    expect(checkTrophies(s, b, now)).toEqual([]);
    s.cleared = true;
    expect(checkTrophies(s, b, now).map((x) => x.id)).toEqual(['first_clear']);
    expect(pendingSync(b).map((x) => x.id).sort()).toEqual(['successor/first_clear', 'successor/first_head']);
  });

  it('保存：セーブとは別のキー。読めない・書けない・壊れた中身・知らない ID でも落ちない', () => {
    const mem = new Map<string, string>();
    const ok = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const b = emptyBook();
    b.got.first_head = { at: '2026-11-03T00:00:00.000Z', day: 70 };
    expect(saveTrophies(b, ok)).toBe(true);
    expect([...mem.keys()]).toEqual([TROPHY_KEY]);
    expect(TROPHY_KEY).toBe('successor.trophies');
    expect(loadTrophies(ok).got.first_head.day).toBe(70);
    // 書けない（容量・プライベートの窓）
    const ng = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
    expect(saveTrophies(b, ng)).toBe(false);
    expect(loadTrophies(ng)).toEqual(emptyBook());
    expect(saveTrophies(b, null)).toBe(false);
    expect(loadTrophies(null)).toEqual(emptyBook());
    // 壊れた中身・知らない ID・形の違う記録
    for (const raw of ['{', 'null', '"x"', '[]', '{"got":5}']) {
      mem.set(TROPHY_KEY, raw);
      expect(loadTrophies(ok)).toEqual(emptyBook());
    }
    mem.set(TROPHY_KEY, JSON.stringify({ v: 1, game: 'successor', got: { nope: { at: 'x', day: 1 }, first_head: { day: 3 }, first_clear: { at: '2026-11-01T00:00:00Z', day: 9, sent: true } } }));
    expect(loadTrophies(ok).got).toEqual({ first_clear: { at: '2026-11-01T00:00:00Z', day: 9, sent: true } });
  });

  it('一覧はシステム → 設定の画面にまとめる（サブタブは増やさない）', () => {
    const set = SUB_DEFS().systems.find((x) => x.key === 'settings')!;
    expect(set.parts).toContain('trophy');
    expect(SUB_ALIAS['systems:trophy']).toEqual({ m: 'systems', key: 'settings', part: 'trophy' });
  });
});
