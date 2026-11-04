// 段 P2（docs/ISLAND_PHASE1.md「ヒーローの声と適性」「ヒーローの組み合わせ」）：取り込んだセリフが字数の上限内・cautions の人物の決まり・
// 適性の倍率の 1 か所・組み合わせの条件と 1 回だけ出る・効き目が期限や解消で切れる・古いセーブ（版 22）
import { beforeAll, describe, expect, it } from 'vitest';
import fitJson from '../src/island/p1/heroes/fit.json';
import voiceJson from '../src/island/p1/heroes/voice.json';
// @ts-expect-error 型の無い .mjs（ビルドの道具）
import { buildHeroData, WHY_NG } from '../scripts/heroes/build.mjs';
import { CARD, DUO, HERO_FIT } from '../src/island/p1/data';
import { cardsMonth, chooseCard, quipOfCard, sayLength, sayOf, type Card } from '../src/island/p1/card';
import { quality } from '../src/island/p1/deleg';
import { deserializeP1, newP1, serializeP1, speed, drainOf, type P1State, type Report, type Staff } from '../src/island/p1/model';
import { moraleParts } from '../src/island/p1/hr';
import { sayLen } from '../src/island/p1/persona';
import { talkLen, TALK_MAX } from '../src/island/p1/mine';
import { baseId, bestFits, FIT_KEYS, fitDept, fitLine, fitMul, fitTask, gradeOf, lineOf, loadVoice, P2_OFF, unloadVoice, voiceOf, voiceQuip, voiceSay, type FitKey } from '../src/island/p1/voice';
import { applyDuo, DUOS, DUO_BY_ID, duoTalk, loadDuoTalk, duoDemo, duoDex, duoDrain, duoDue, duoFlush, duoMet, duoMorale, duoPages, duoSay, duoSpeed } from '../src/island/p1/duo';

beforeAll(async () => {
  await loadVoice();
  await loadDuoTalk();
});

/** 2 か月目の締めのあと（チュートリアル済み・売上のある報告 2 つ）の町。ヒーローは足していく */
function town(): P1State {
  const s = newP1(1);
  s.tut = 99;
  s.money = 1e6;
  s.day = 70;
  const rep = { month: 1, revenue: 200_000, bySeries: {}, costs: { materials: 50_000, wages: 0, part: 0, upkeep: 0, build: 0, ads: 0 }, profit: 0, area: [], rank: 5, news: [] } as unknown as Report;
  s.reports.push(rep, { ...rep, month: 2 });
  return s;
}
/** ヒーローを 1 人足す（はじめの人の写し・仕事なし） */
function add(s: P1State, hero: number, task: Staff['task'] = null, target: Staff['target'] = null): Staff {
  const st = { ...structuredClone(s.staff[0]), hero, task, target, morale: 70, resting: false } as Staff;
  s.staff.push(st);
  return st;
}
const fakeReport = (s: P1State): Report => ({ ...s.reports[s.reports.length - 1], month: s.reports.length + 1, comeback: undefined, rally: undefined }) as Report;
const duoCards = (s: P1State) => (s.cards?.inbox ?? []).filter((c) => c.src === 'duo');

describe('データの取り込み（scripts/heroes/build.mjs）', () => {
  it('調査の 193 体から作った fit.json・voice.json が、いまの調査と同じ（作り直し忘れが無い）・出典や要約は入れない', () => {
    const b = buildHeroData();
    expect(b.errs).toEqual([]);
    expect(b.n).toBe(193);
    expect(JSON.parse(JSON.stringify(b.fit))).toEqual(fitJson);
    expect(JSON.parse(JSON.stringify(b.voice))).toEqual(voiceJson);
    const v = (voiceJson as Record<string, Record<string, unknown>>)['5001'];
    expect(Object.keys(v).sort()).toEqual(['fp', 'l', 'tic', 'to', 'why']);
    expect(JSON.stringify(voiceJson)).not.toMatch(/https?:\/\//);
  });

  it('セリフ・口ぐせは 1 行 40 字まで。場面（greet・propose・approved・rejected・tired・success）がそろっている', () => {
    for (const [id, v] of Object.entries(voiceJson as Record<string, { tic: string[]; l: Record<string, string[]> }>)) {
      for (const x of [...v.tic, ...Object.values(v.l).flat()]) expect([...x].length, `${id} ${x}`).toBeLessThanOrEqual(40);
      for (const k of ['greet', 'propose', 'approved', 'rejected', 'tired', 'success']) expect(v.l[k]?.length, `${id} ${k}`).toBeGreaterThan(0);
    }
  });

  it('レプリカ（id + 10000・同じ名前）はオリジナルと同じデータ。ノービスなど調査の無いヒーローは無し（いまの型）', () => {
    expect(baseId(5001)).toBe(5001);
    expect(baseId(15001)).toBe(5001);
    expect(gradeOf(15001, 'strategy')).toBe(gradeOf(5001, 'strategy'));
    expect(voiceOf(12020)?.to).toBe(voiceOf(2020)?.to);
    expect(baseId(10001)).toBeNull();
    expect(baseId(10004)).toBeNull();
    expect(fitMul(10001, 'craft')).toBe(1);
    expect(voiceOf(10004)).toBeNull();
  });
});

describe('セリフの適用', () => {
  it('カードの課題のセリフ：社長の呼び方 ＋ 課題。CARD.sayMax 字を超えたら呼び方を落とす（193 体すべて）', () => {
    const cores = ['作業台が手いっぱいで、月[[ 120 個]]しか作れない', '[[お客さんの 3 割]]しか来ず、在庫が工房に[[ 240 個]]たまっている', 'x'.repeat(CARD.sayMax - 2)];
    for (const id of Object.keys(voiceJson)) {
      for (const c of cores) {
        const x = voiceSay(Number(id), c)!;
        expect(x).toBeTruthy();
        expect(sayLen(x), `${id} ${x}`).toBeLessThanOrEqual(CARD.sayMax);
      }
    }
    expect(voiceSay(4037, '素材が足りない')).toBe('社長殿、素材が足りない。');
    expect(voiceSay(2037, '素材が足りない')).toBe('大将、素材が足りない。');
  });

  it('ウィットの一言：その人の提案のセリフか口ぐせ（辞めたいは疲れたときのセリフ）。調査の無い人・声を外すと、いまの型の一言', () => {
    const v = voiceOf(5001)!;
    expect([...v.l.propose, ...v.tic]).toContain(voiceQuip(5001, 'sell', 3));
    expect(v.l.tired).toContain(voiceQuip(5001, 'quit', 3));
    expect(voiceQuip(10001, 'sell', 3)).toBeNull();
    const s = town();
    const st = add(s, 5001, 'craft');
    const c = { id: 1, src: 'crafter', kind: 'craft', hero: st.hero, q: 0.8, dept: 'logistics', mk: 1, sector: 'c1', day: 1, issue: { k: 'craft', n: 12 }, choices: [], pop: true } as Card;
    expect(sayOf(s, c).startsWith('社長、')).toBe(true);
    expect([...v.l.propose, ...v.tic]).toContain(quipOfCard(c));
    unloadVoice();
    try {
      expect(voiceOf(5001)).toBeNull();
      expect(sayOf(s, c)).not.toBe('社長、作業台が手いっぱいで、月[[ 12 個]]しか作れない。');
      expect(quipOfCard(c)).toBeTruthy();
    } finally {
      return loadVoice();
    }
  });

  it('場面のセリフ（着任・承認・却下・疲れ・うまくいった）が引ける', () => {
    for (const sc of ['greet', 'approved', 'rejected', 'tired', 'success'] as const) expect(voiceOf(5009)!.l[sc]).toContain(lineOf(5009, sc, 7));
    expect(lineOf(10001, 'greet')).toBeNull();
  });
});

describe('実在の人物への敬意（cautions）', () => {
  // 「観察は裏切りません」のような言い回しはよい（取り込んだセリフ）。組み合わせの会話は「裏切」も使わない
  const NG = /殺|処刑|自害|自決|暗殺|切腹|謀反|斬り|首を(?!縦)|討ち|焼き討ち|戦死|最期/;
  it('取り込んだセリフと組み合わせの会話・図鑑の一言に、暴力・最期の言葉が無い', () => {
    for (const [id, v] of Object.entries(voiceJson as Record<string, { tic: string[]; l: Record<string, string[]> }>)) for (const x of [...v.tic, ...Object.values(v.l).flat()]) expect(x, `${id}`).not.toMatch(NG);
    for (const d of DUOS) {
      for (const p of duoTalk(d.id)) {
        expect(p.text(), d.id).not.toMatch(NG);
        expect(p.text(), d.id).not.toMatch(/裏切/);
      }
      expect(d.name(), d.id).not.toMatch(NG);
    }
  });
  it('適性の根拠の 1 行（画面に出す）は、暴力・最期にふれない（ふれる根拠は「〜が、」の前まで、通らなければ札だけ）', () => {
    for (const [id, v] of Object.entries(voiceJson as Record<string, { why: string[] }>)) for (const w of v.why) expect(w, id).not.toMatch(WHY_NG);
    expect(voiceOf(5001)!.why[FIT_KEYS.indexOf('hr')]).toBe('家臣を働きで取り立てた。');
    expect(voiceOf(4001)!.why[FIT_KEYS.indexOf('hr')]).toBe('');
    expect(fitLine(4001, 'hr')).toBe(`人事 ${gradeOf(4001, 'hr')}`);
  });
  it('秀吉をからかう呼び名を使わない・本能寺の変の場面を会話にしない・桃園の誓いを史実として扱わない（図鑑の一言で分ける）', () => {
    const all = DUOS.flatMap((d) => duoTalk(d.id).map((p) => p.text()));
    for (const x of all) {
      expect(x).not.toMatch(/猿|(^|[^エ])サル/);
      expect(x).not.toMatch(/本能寺|桃園/);
    }
    expect(DUO_BY_ID.liubei3.note()).toMatch(/小説/);
    expect(DUO_BY_ID.nobumitsu.note()).toMatch(/諸説/);
    expect(DUO_BY_ID.brothers.note()).toMatch(/史実のつながりは無い/);
  });
  it('組み合わせの会話は 1 枚 60 字まで・3〜4 枚・話す人は組み合わせのヒーロー', () => {
    for (const d of DUOS) {
      expect(duoTalk(d.id).length, d.id).toBeGreaterThanOrEqual(3);
      expect(duoTalk(d.id).length, d.id).toBeLessThanOrEqual(4);
      for (const p of duoTalk(d.id)) {
        expect(talkLen(p.text()), `${d.id} ${p.text()}`).toBeLessThanOrEqual(TALK_MAX);
        expect(d.heroes).toContain(p.who);
      }
      for (const h of d.heroes) expect(baseId(h), `${d.id} ${h}`).toBe(h);
    }
    expect(DUOS.length).toBeGreaterThanOrEqual(20);
    expect(DUOS.length).toBeLessThanOrEqual(30);
    expect(new Set(DUOS.map((d) => d.id)).size).toBe(DUOS.length);
  });
});

describe('適性の倍率（1 か所：data.ts の HERO_FIT と voice.ts の入り口）', () => {
  it('S・A・B・C・D の倍率は HERO_FIT.mul。止めると 1', () => {
    const want: Record<string, number> = HERO_FIT.mul;
    for (const id of [5001, 2020, 1003])
      for (const k of FIT_KEYS) {
        const g = gradeOf(id, k as FitKey)!;
        expect(fitMul(id, k as FitKey)).toBe(want[g]);
      }
    P2_OFF.fit = true;
    try {
      expect(fitMul(5001, 'strategy')).toBe(1);
    } finally {
      P2_OFF.fit = false;
    }
  });
  it('任せた部門の出来（quality）に掛ける：hero の無い見積もり（雇う前の候補）は掛けない・上限は DELEG.q.cap のまま', () => {
    const s = newP1(1);
    const base = s.staff[0];
    const q0 = quality({ stats: base.stats, level: 1, passives: [] }, 'hr');
    expect(quality({ stats: base.stats, level: 1, passives: [], hero: 2044 }, 'hr')).toBeCloseTo(q0 * HERO_FIT.mul.S, 6);
    expect(quality({ stats: base.stats, level: 1, passives: [], hero: 2003 }, 'hr')).toBeCloseTo(q0 * HERO_FIT.mul.D, 6);
    expect(fitDept(2044, 'hr')).toBe(HERO_FIT.mul.S);
  });
  it('持ち場の速さ（speed）に掛ける：職人 S は ×1.10・D は ×0.96（同じ能力値で比べる）', () => {
    const s = town();
    const a = add(s, 2001, 'craft');
    const b = add(s, 2009, 'craft');
    const n = add(s, 10002, 'craft');
    for (const x of [a, b]) x.stats = { ...n.stats };
    expect(speed(a, 'craft', s) / speed(n, 'craft', s)).toBeCloseTo(HERO_FIT.mul.S, 6);
    expect(speed(b, 'craft', s) / speed(n, 'craft', s)).toBeCloseTo(HERO_FIT.mul.D, 6);
    expect(fitTask(2001, 'side')).toBe(1);
  });
  it('適性の 1 行（「人事 S：…」）と、向いている順の役', () => {
    expect(fitLine(2044, 'hr')).toMatch(/^人事 S：/);
    expect(bestFits(5001)).toEqual(['strategy', 'systems', 'sector_head']);
  });
});

describe('ヒーローの組み合わせ：条件と 1 回だけ出る', () => {
  it('同じ町にそろった最初の締めに、掛け合いの会話つきのカード。2 回目は出ない（図鑑に残る）', () => {
    const s = town();
    add(s, 5009);
    add(s, 4037);
    cardsMonth(s, fakeReport(s));
    expect(duoCards(s)).toHaveLength(0);
    add(s, 4001);
    cardsMonth(s, fakeReport(s));
    const cs = duoCards(s);
    expect(cs).toHaveLength(1);
    expect(cs[0].duo!.id).toBe('liubei3');
    expect(cs[0].pop).toBe(true);
    expect(duoPages(cs[0].duo!).map((p) => p.who)).toEqual([5009, 4037, 4001, 5009]);
    expect(sayLength(s, cs[0])).toBeLessThanOrEqual(CARD.sayMax);
    expect(duoSay(cs[0].duo!).startsWith('社長、')).toBe(true);
    expect(s.duo!.found.liubei3).toBeTruthy();
    chooseCard(s, cs[0].id, 2);
    for (let k = 0; k < 3; k++) cardsMonth(s, fakeReport(s));
    expect(duoCards(s)).toHaveLength(0);
    expect(duoDex(s).filter((x) => x.found).map((x) => x.id)).toEqual(['liubei3']);
  });
  it('1 か月目（チュートリアル）・チュートリアルの途中・カードの上限を使いきった締めには出さない', () => {
    const s = town();
    add(s, 5016);
    add(s, 4026);
    s.reports = s.reports.slice(0, 1);
    expect(duoDue(s, 0, false)).toBeNull();
    s.reports.push({ ...s.reports[0], month: 2 });
    expect(duoDue(s, 0, true)).toBeNull();
    expect(duoDue(s, CARD.cap.C, false)).toBeNull();
    expect(duoDue(s, 0, false)?.id).toBe('nile');
  });
  it('レプリカでもそろう（会話の話し手はいまの会社のヒーロー）', () => {
    const s = town();
    add(s, 15016);
    add(s, 4026);
    const d = duoDue(s, 0, false)!;
    expect(d.heroes).toEqual([15016, 4026]);
    expect(duoPages(d)[0].who).toBe(15016);
  });
  it('条件：同じ部門（宿敵）・部長とその部門の部下（緊張）・ほかの町のセクター長は同じ町に数えない', () => {
    const s = town();
    const e = add(s, 4007, 'craft');
    const tz = add(s, 4041, 'dig');
    const team = DUO_BY_ID.currents;
    expect(duoMet(s, team)).toBeNull();
    tz.task = 'shop';
    expect(duoMet(s, team)).not.toBeNull();
    e.task = 'lead';
    e.target = 'H:logistics';
    expect(duoMet(s, team)).not.toBeNull();
    const boss = DUO_BY_ID.nobumitsu;
    const n = add(s, 5001, 'lead', 'H:rnd');
    const m = add(s, 2020, 'craft');
    expect(duoMet(s, boss)).toBeNull();
    m.task = 'dig';
    expect(duoMet(s, boss)).not.toBeNull();
    n.task = 'dig';
    n.target = null;
    expect(duoMet(s, boss)).toBeNull();
    const town3 = DUO_BY_ID.shieikan3;
    add(s, 4035);
    add(s, 4027);
    const o = add(s, 4012, 'manager', 'c2');
    expect(duoMet(s, town3)).toBeNull();
    o.task = null;
    o.target = null;
    expect(duoMet(s, town3)).not.toBeNull();
  });
});

describe('ヒーローの組み合わせ：効き目と期限・解消', () => {
  it('見つけるまでは効かない。見つけたら条件がそろっているあいだだけ（盟友：士気 +・速さ ×）', () => {
    const s = town();
    const a = add(s, 5016, 'craft');
    add(s, 4026, 'shop');
    expect(duoMorale(s, a.hero)).toBe(0);
    duoDue(s, 0, false);
    expect(duoMorale(s, a.hero)).toBe(DUO.fx.ally.morale);
    expect(duoSpeed(s, a.hero)).toBe(DUO.fx.ally.speed);
    expect(moraleParts(s, a).duo).toBe(DUO.fx.ally.morale);
    s.staff = s.staff.filter((x) => x.hero !== 4026);
    duoFlush(s);
    expect(duoMorale(s, a.hero)).toBe(0);
    P2_OFF.duo = true;
    try {
      s.staff.push({ ...a, hero: 4026 });
      expect(duoMorale(s, a.hero)).toBe(0);
    } finally {
      P2_OFF.duo = false;
    }
  });
  it('宿敵を競わせる：速さ ×・疲れ ×（期限で切れる）。離すと、いつもの効き目が止まる', () => {
    const s = town();
    const a = add(s, 5025, 'craft');
    add(s, 5026, 'craft');
    const d = duoDue(s, 0, false)!;
    expect(d.id).toBe('chuhan');
    const F = DUO.fx.rival;
    expect(duoSpeed(s, a.hero)).toBeCloseTo(F.speed, 6);
    expect(duoDrain(s, a.hero)).toBeCloseTo(F.drain, 6);
    const d0 = drainOf(s, a);
    expect(applyDuo(s, d, d.opts.findIndex((o) => o.id === 'compete'))).toBeNull();
    expect(duoSpeed(s, a.hero)).toBeCloseTo(F.speed * DUO.opt.compete.speed, 6);
    expect(drainOf(s, a)).toBeCloseTo(d0 * DUO.opt.compete.drain, 6);
    s.day += DUO.opt.compete.days;
    expect(duoSpeed(s, a.hero)).toBeCloseTo(F.speed, 6);
    expect(applyDuo(s, d, d.opts.findIndex((o) => o.id === 'apart'))).toBeNull();
    expect(duoSpeed(s, a.hero)).toBe(1);
    expect(duoDrain(s, a.hero)).toBe(1);
  });
  it('緊張は士気 −（部長と部下のあいだ）。話し合うと解消して止まる（費用は先月の売上の割合）', () => {
    const s = town();
    const h = add(s, 3051, 'lead', 'H:logistics');
    const y = add(s, 5019, 'craft');
    const d = duoDue(s, 0, false)!;
    expect(d.id).toBe('genji');
    expect(duoMorale(s, y.hero)).toBe(DUO.fx.tension.morale);
    expect(duoMorale(s, h.hero)).toBe(DUO.fx.tension.morale);
    const k = d.opts.findIndex((o) => o.id === 'talk');
    const m0 = s.money;
    expect(applyDuo(s, d, k)).toBeNull();
    expect(m0 - s.money).toBe(d.opts[k].cost);
    expect(d.opts[k].cost).toBeGreaterThanOrEqual(DUO.minCost);
    expect(duoMorale(s, y.hero)).toBe(0);
    expect(s.duo!.found.genji.off).toBe(true);
  });
  it('どの組み合わせにも見込みが 0 以上の手がある・おすすめは払える手・お金が足りなければ打てない', () => {
    const s = town();
    for (const d of DUOS) for (const h of d.heroes) if (!s.staff.some((x) => x.hero === h)) add(s, h);
    for (const d of DUOS) {
      const x = duoDemo(s, d.id)!;
      expect(x.opts.length).toBe(3);
      expect(x.opts.some((o) => o.ev >= 0)).toBe(true);
      expect(x.opts.filter((o) => o.light)).toHaveLength(1);
    }
    s.money = 0;
    const x = duoDemo(s, 'genji')!;
    expect(applyDuo(s, x, x.opts.findIndex((o) => o.id === 'talk'))).toBe('money');
  });
});

describe('セーブ（版 23）', () => {
  it('見つけた組み合わせ・効き目の期限が残る。古いセーブ（版 22）は空から', () => {
    const s = town();
    add(s, 5025, 'craft');
    add(s, 5026, 'craft');
    const d = duoDue(s, 0, false)!;
    applyDuo(s, d, 0);
    const back = deserializeP1(serializeP1(s))!;
    expect(back.v).toBe(26);
    expect(back.duo!.found.chuhan.opt).toBe('compete');
    expect(back.duo!.found.chuhan.until).toBe(s.duo!.found.chuhan.until);
    const old = JSON.parse(serializeP1(s));
    old.v = 22;
    delete old.duo;
    const o = deserializeP1(JSON.stringify(old))!;
    expect(o.v).toBe(26);
    expect(o.duo).toBeUndefined();
    expect(duoMorale(o, 5025)).toBe(0);
  });
});
