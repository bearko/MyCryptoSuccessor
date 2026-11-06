/**
 * 段 UI9b：提案書レビューの反映（ユーザーのコメント 2026-11-05）。
 * - セリフは 3 段（現状 → 原因 → 対応）で、どの出どころ・どの部門でも同じ骨組み。数字と要点の語は [[ ]]（色）
 * - 課題の優先度は 高・中・低（数字の優先はやめる。境は data.ts の ISSUE.lv）
 * - 単発の施策（宣伝・使い切り）は長期の欄がグレーアウト（once）、12 か月の線に効き目の終わりの印
 * - 代替案の一覧に状態（本案・効果が薄い・予算不足・実施中・提出済み・未解放・見送り）。未解放は研究ポイントで開拓するパネル
 * - 判断に要らない指標は出さない（kpisOf の pick）
 * - チュートリアル以外で「推奨」の語が出ない（カードの 2 択・提案書の見出し・代替案の表）
 * 仕様は docs/SUCCESSOR_ROADMAP.md「段 UI9b（レビューの反映）」。
 */
import { describe, expect, it } from 'vitest';
import { ISSUE } from '../src/island/p1/data';
import { deserializeP1, myShops, serializeP1, type P1State } from '../src/island/p1/model';
import { planOf } from '../src/island/p1/plan';
import { briefOf, judgeOf } from '../src/island/p1/brief';
import { PROPOSAL_SRC, cardInbox, cardsMonth, coreOf, demoDraft, enqueue, gateDraft, hireOffer, newCards, planOfChoice, shownRec, speechOf, speechText, moveLine, stallDraft, stockCard, type Card } from '../src/island/p1/card';
import { issueLv, issuesOf, lvWord } from '../src/island/p1/issues';
import { ALT_STATUS, altsOf, briefSpeech, issueRows, kpisOf, onceOf, slideTitle } from '../src/island/p1/slides';
import type { PropAct } from '../src/island/p1/deleg';
import { REGISTERS, SUMMARY_MAX, numsOf, plen, registerOf, sentencesOf, speakCore, spokenText, styleOf, type SummaryCore } from '../src/island/p1/summary';
import { loadVoice, voiceOf } from '../src/island/p1/voice';
import voiceRaw from '../src/island/p1/heroes/voice.json';
import { runOnce } from '../scripts/island/sim';
import { openTier } from './l0util';

const saves = new Map<number, string[]>();
function months(seed: number): string[] {
  if (!saves.has(seed)) {
    const xs: string[] = [];
    runOnce('normal', seed, { onlyFirst: seed !== 1, onMonth: (s, _sec, m) => void (myShops(s).length && m >= 2 && xs.push(serializeP1(s))) });
    saves.set(seed, xs);
  }
  return saves.get(seed)!;
}
const load = (x: string): P1State => {
  const s = deserializeP1(x)!;
  s.tut = 99;
  // 段 L0：ヒーロー・部長からの提案は Rare の町から（会社が Rare の町を開いた状態にする。いまの町は最初の町のまま）
  return openTier(s, 'R');
};
const isDo = (c: Card['choices'][number]) => c.act.k === 'do' || c.act.k === 'approve';
/** 月の締めの提案のカード（全部の出どころ）に、撮影用の下書き（店員・職人・調達係・待機中・倉庫・人事・流れの止まり）を足したもの */
function allCards(s: P1State): Card[] {
  s.cards = newCards();
  cardsMonth(s, s.reports[s.reports.length - 1]);
  const out = [...cardInbox(s)];
  const iss = issuesOf(s);
  for (const src of ['clerk', 'crafter', 'buyer', 'idle'] as const) {
    const d = demoDraft(s, src);
    const g = d && gateDraft(s, d, iss);
    if (g) {
      const c = enqueue(s, g);
      if (c) out.push(c);
    }
  }
  const r = s.reports[s.reports.length - 1];
  const sd = stallDraft(s, { ...r, stall: { stage: 'craft', why: 'rest', hero: 0 } as never });
  const sg = sd && gateDraft(s, sd, iss);
  if (sg) {
    const c = enqueue(s, sg);
    if (c) out.push(c);
  }
  const st = stockCard(s);
  if (st) {
    const c = enqueue(s, st);
    if (c) out.push(c);
  }
  const ho = hireOffer(s);
  if (ho) out.push(ho.card);
  return out;
}

describe('セリフは 3 段（現状・原因・対応）', () => {
  it('提案のカード（全部の出どころ）は、現状・原因・対応がそろい、数字に色（[[ ]]）があり、「推奨」の語が無い。知らせ・提案でないカードは null', () => {
    const seen = new Set<string>();
    let n = 0;
    for (const seed of [1, 2, 3])
      for (const x of months(seed)) {
        const s = load(x);
        for (const c of allCards(s)) {
          const sp = speechOf(s, c);
          const k = shownRec(s, c);
          const proposal = (PROPOSAL_SRC.includes(c.src) || c.src === 'budget') && !c.note && k >= 0 && (isDo(c.choices[k]) || c.issue.k === 'store' || c.src === 'budget');
          if (!proposal) {
            if (!(PROPOSAL_SRC.includes(c.src) || c.src === 'budget') || c.note) expect(sp, `${c.src}:${c.issue.k}`).toBeNull();
            continue;
          }
          expect(sp, `${c.src}:${c.issue.k}`).not.toBeNull();
          const text = speechText(sp!);
          expect(sp!.now.length, text).toBeGreaterThan(5);
          expect(sp!.cause.length, text).toBeGreaterThan(5);
          expect(sp!.ask.length, text).toBeGreaterThan(5);
          expect(sp!.cause, text).toMatch(/原因|余地|回せ|残って/);
          expect(sp!.ask, text).toMatch(/承認|進め|上げる|様子を見|攻め|伸ば|勝負/);
          expect(text, text).toMatch(/\[\[/);
          expect(text, text).not.toMatch(/推奨/);
          seen.add(`${c.src}:${c.issue.k}`);
          n++;
        }
      }
    expect(n).toBeGreaterThan(5);
    // 店員・職人・調達係・人事・倉庫は必ず通る
    for (const k of ['clerk:sell', 'crafter:craft', 'buyer:buy', 'hr:hire', 'stock:store']) expect([...seen], [...seen].join(',')).toContain(k);
  }, 180000);
  it('カードの 2 択の 1 行目は「種類：手の名前」（部門つき）。カードの無い提案書は briefSpeech で同じ骨組み', () => {
    const s = load(months(1)[0]);
    const cs = allCards(s).filter((c) => PROPOSAL_SRC.includes(c.src) && !c.note);
    expect(cs.length).toBeGreaterThan(0);
    for (const c of cs) {
      const k = shownRec(s, c);
      if (k < 0 || !isDo(c.choices[k])) continue;
      const m = moveLine(s, c, c.choices[k]);
      expect(m.dept, `${c.src}`).toBeTruthy();
      expect(m.cat.length).toBeGreaterThan(0);
      expect(m.name.length).toBeGreaterThan(0);
      const plan = planOfChoice(s, c, k)!;
      const B = briefOf(s, plan, { card: c.id, iss: c.issues });
      const sp = briefSpeech(B, m.name, null, 1);
      expect(sp.now).toMatch(/^社長、/);
      expect(sp.ask).toMatch(/承認|進め|攻め|伸ば|勝負/);
      expect(sp.ask).toMatch(/\[\[/);
    }
  });
});

describe('優先度は 高・中・低', () => {
  it('課題の一覧の全部に lv があり、境は ISSUE.lv（score ÷ 月の粗利）。流れが止まっていれば高。古い課題（lv なし）は並びの番号から', () => {
    for (const x of months(1).slice(0, 6)) {
      const s = load(x);
      for (const y of issuesOf(s)) {
        expect(['hi', 'mid', 'lo']).toContain(y.lv);
        expect(issueLv(y)).toBe(y.lv);
        expect(['高', '中', '低']).toContain(lvWord(issueLv(y)));
        if (y.stopped) expect(y.lv).toBe('hi');
      }
    }
    expect(ISSUE.lv.hi).toBeGreaterThan(ISSUE.lv.mid);
    expect(issueLv({ pri: 1 })).toBe('hi');
    expect(issueLv({ pri: 3 })).toBe('mid');
    expect(issueLv({ pri: 5 })).toBe('lo');
    expect(issueLv({ pri: 5, stopped: true })).toBe('hi');
  });
  it('サマリーの課題の表：題名・優先度（高中低）・影響。解く課題が無ければ会社のいちばんの課題と「解けない」', () => {
    const s = load(months(1)[0]);
    const iss = issuesOf(s);
    const rows = issueRows({ solved: iss.slice(0, 2), iss });
    expect(rows.length).toBe(2);
    for (const r of rows) {
      expect(['高', '中', '低']).toContain(r.lvText);
      expect(r.impact).toMatch(/放置すると|伸ばせば/);
      expect(r.solved).toBe(true);
    }
    const miss = issueRows({ solved: [], iss });
    expect(miss.length).toBe(1);
    expect(miss[0].solved).toBe(false);
  });
});

describe('単発の施策と、判断に要る指標だけ', () => {
  it('宣伝だけの提案は単発（効き目 N 日）：長期の欄に once。続く手を含む提案は null。導入費用の無い手は導入・回収の欄を出さない', () => {
    const s = load(months(1)[0]);
    const ad = planOf(s, [{ k: 'ad', id: 'poster' }], { hero: null, q: 0.9, dept: 'marketing' });
    const B = briefOf(s, ad);
    expect(onceOf(B)).toBe(30);
    const ks = kpisOf(B, null, { pick: true });
    expect(ks.find((k) => k.key === 'long')?.once).toBe(true);
    expect(ks.find((k) => k.key === 'long')?.sub).toMatch(/単発（効き目 30 日）/);
    expect(ks.some((k) => k.key === 'lead')).toBe(false);
    // 続く手（宣伝 ＋ パネル）は単発ではない
    const fx = s.buildings.find((b) => b.owner === 'me' && b.id === 'workshop');
    if (fx) {
      const p2 = planOf(s, [{ k: 'ad', id: 'poster' }, { k: 'invest', id: 'tools', uid: fx.uid }], { hero: null, q: 0.9, dept: 'logistics' });
      const B2 = briefOf(s, p2);
      if (B2.asks.length > 1) expect(onceOf(B2)).toBeNull();
    }
    // 費用の無い手（人の配置）：導入・回収のタイルは出さない。pick なしは前のまま 5 枚以上
    const idle = s.staff.find((y) => y.task == null && !y.resting);
    if (idle) {
      const p3 = planOf(s, [{ k: 'assign', hero: idle.hero, task: 'craft', target: 0 }], { hero: null, q: 0.9, dept: 'hr' });
      const B3 = briefOf(s, p3);
      const k3 = kpisOf(B3, null, { pick: true });
      expect(k3.some((k) => k.key === 'setup' || k.key === 'payback')).toBe(false);
      expect(kpisOf(B3).map((k) => k.key).slice(0, 5)).toEqual(['short', 'long', 'setup', 'payback', 'lead']);
    }
  });
});

describe('代替案の一覧に状態が付く', () => {
  it('本案が 1 行目（pick）。残りは 効果が薄い・予算不足・実施中・提出済み・未解放・見送り のどれかで、状態の 1 行がある。未解放は研究ポイントつき', () => {
    const seen = new Set<string>();
    for (const x of months(1).slice(0, 4)) {
      const s = load(x);
      const cs = allCards(s).filter((c) => PROPOSAL_SRC.includes(c.src) && !c.note && c.id >= 0);
      for (const c of cs) {
        const k = shownRec(s, c);
        if (k < 0 || !isDo(c.choices[k])) continue;
        const plan = planOfChoice(s, c, k)!;
        const B = briefOf(s, plan, { card: c.id, iss: c.issues });
        const alts = altsOf(s, plan, B, c, B.iss, s);
        expect(alts[0].status).toBe('pick');
        expect(alts[0].chosen).toBe(true);
        for (const a of alts.slice(1)) {
          expect(Object.keys(ALT_STATUS)).toContain(a.status);
          expect(a.status).not.toBe('pick');
          expect(a.note.length).toBeGreaterThan(0);
          expect(a.note).not.toMatch(/推奨/);
          if (a.status === 'locked') {
            expect(a.skill).toBeTruthy();
            expect(a.rp).toBeGreaterThan(0);
            expect(a.name).toMatch(/を開拓する/);
          }
          seen.add(a.status);
        }
      }
      if (seen.size >= 2) break;
    }
    expect(seen.size).toBeGreaterThan(0);
  }, 180000);
  it('研究ポイントが足りない町では、同じ段に効くパネルが「未解放」として並ぶ', () => {
    for (const x of months(1).slice(0, 4)) {
      const s = load(x);
      s.rp = 0;
      const cs = allCards(s).filter((c) => c.src === 'crafter' || c.src === 'buyer' || c.src === 'clerk');
      let found = false;
      for (const c of cs) {
        const k = shownRec(s, c);
        if (k < 0 || !isDo(c.choices[k])) continue;
        const plan = planOfChoice(s, c, k)!;
        const B = briefOf(s, plan, { card: c.id, iss: c.issues });
        const alts = altsOf(s, plan, B, c, B.iss, s, 8);
        if (alts.some((a) => a.status === 'locked')) found = true;
      }
      if (found) return;
    }
    throw new Error('no locked alternative found');
  }, 180000);
});

describe('チュートリアル以外で「推奨」の語が出ない', () => {
  it('提案書の見出し（サマリー）・代替案の状態の名前・取り下げの一行に「推奨」は無い', () => {
    const s = load(months(1)[0]);
    const plan = planOf(s, [{ k: 'ad', id: 'flyer' }] as PropAct[], { hero: null, q: 0.9, dept: 'marketing' });
    const B = briefOf(s, plan);
    for (const id of ['sum', 'issue', 'move', 'effect', 'risk', 'plan', 'more'] as const) expect(slideTitle(id, B, 'x')).not.toMatch(/推奨/);
    expect(slideTitle('sum', B, 'x')).toBe('結論：承認');
    for (const k of Object.keys(ALT_STATUS) as (keyof typeof ALT_STATUS)[]) expect(ALT_STATUS[k]()).not.toMatch(/推奨/);
    // 判断の仕組みは変えない：承認の提案書は承認のまま
    expect(judgeOf(s, plan, issuesOf(s)).rec).toBe(B.rec);
  });
});

describe('追加 2：サマリー文の声の層（意味 → 型 → 語り口）', () => {
  /** ユーザーの例（店員・販売の手）の意味の層 */
  const core: SummaryCore = {
    now: { what: '[[販売]]がボトルネックになっています。', evidence: '来店はお客様全体の[[ 10%]]にとどまり、工房には[[ 57 個]]の在庫が滞留しています。', num: ['10', '57'] },
    cause: { what: '製造や輸送ではなく、[[販路の集客力不足]]が原因と考えます。' },
    ask: { move: '看板の設置', verb: 'で店頭の魅力を上げ', cost: '初期投資[[ 5,000 G]]', effect: '来月から売上[[ +20%]]', big: true },
  };
  const V = voiceRaw as Record<string, { reg?: string; tic: string[] }>;
  it('voice.json の全員に語尾の型（register）がある。坂本龍馬は tosa・織田信長は assert', async () => {
    await loadVoice();
    for (const [id, v] of Object.entries(V)) expect(REGISTERS, id).toContain(v.reg);
    expect(voiceOf(5008)?.reg).toBe('tosa');
    expect(voiceOf(5001)?.reg).toBe('assert');
    expect(registerOf(null)).toBe('genki');
  });
  it('主なレジスターの例：数字と手の名前が残り、語尾が型どおり', async () => {
    await loadVoice();
    const ex: Record<string, number | null> = { polite: 1005, genki: null, assert: 5001, tosa: 5008 };
    for (const [reg, hero] of Object.entries(ex)) {
      expect(registerOf(hero)).toBe(reg);
      const sp = speakCore(core, hero, 1);
      const text = spokenText(sp);
      for (const n of ['10', '57', '5,000', '+20']) expect(text, `${reg}: ${text}`).toContain(n);
      expect(text).toContain('看板の設置');
      expect(plen(text)).toBeLessThanOrEqual(SUMMARY_MAX);
      expect(text.endsWith(sp.ask)).toBe(true);
      if (reg === 'tosa') expect(text).toMatch(/ぜよ|じゃき/);
      if (reg === 'assert') expect(text).toMatch(/である|せよ|伸ばせ|攻めよ/);
      if (reg === 'genki') expect(text).toMatch(/！/);
      if (reg === 'polite') expect(text).toMatch(/ます。|です。/);
      expect(text).not.toMatch(/推奨/);
    }
  });
  it('性質：全ヒーロー（voice.json）× 口ぐせの回し × 4 つの型で、(a) 数字が全部残る (b) 手の名前が残る (c) 150 字以内 (d) 最後が承認してほしいこと', async () => {
    await loadVoice();
    const base = numsOf(`${core.now.what}${core.now.evidence}${core.ask.cost}${core.ask.effect}`);
    expect(base).toEqual(['10', '57', '5,000', '+20']);
    for (const id of Object.keys(V))
      for (const salt of [0, 1, 2])
        for (const style of ['bold', 'steady', 'numeric', 'short'] as const) {
          const hero = Number(id);
          const sp = speakCore(core, hero, salt, style);
          const text = spokenText(sp);
          const nums = numsOf(text);
          // 根拠を落とした場合でも、費用と効果の数字は残る
          for (const n of ['5,000', '+20']) expect(nums, `${id} ${style} ${salt}: ${text}`).toContain(n);
          if (text.includes('在庫')) for (const n of ['10', '57']) expect(nums, `${id}: ${text}`).toContain(n);
          expect(text, `${id}: ${text}`).toContain('看板の設置');
          expect(plen(text), `${id} ${style} ${salt}: ${text}`).toBeLessThanOrEqual(SUMMARY_MAX);
          expect(plen(text), `${id}: ${text}`).toBeGreaterThanOrEqual(60);
          expect(text.endsWith(sp.ask), `${id}: ${text}`).toBe(true);
          expect(sp.ask).toContain('看板の設置');
          expect(text).not.toMatch(/ますです|ですです|るよ！よ！|。。/);
        }
    // 型の既定：声の無いヒーローでも 4 つのどれか
    expect(['bold', 'steady', 'numeric', 'short']).toContain(styleOf(99999));
    expect(sentencesOf(core, 'short').ask).toContain('看板の設置');
  });
  it('カードの 3 段（全パターン）も、150 字以内・数字と手の名前が残る・最後が承認してほしいこと。セリフの数字 ＝ 提案書の KPI（短期利益・導入費用）', async () => {
    await loadVoice();
    const fmtS = (v: number) => `${v >= 0.5 ? '+' : v <= -0.5 ? '−' : '±'}${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
    let n = 0;
    for (const x of months(1).slice(0, 3)) {
      const s = load(x);
      for (const c of allCards(s)) {
        const k = shownRec(s, c);
        const sp = speechOf(s, c);
        if (!sp || k < 0) continue;
        const text = speechText(sp);
        expect(plen(text), `${c.src}: ${text}`).toBeLessThanOrEqual(SUMMARY_MAX);
        expect(text.endsWith(sp.ask)).toBe(true);
        // 文法・形：述語の無い断片（「月 −N G。」）・括弧の補足・「るだと思う」のような崩れが無い
        expect(text).not.toMatch(/[るう]だと思|[るう]じゃと思|になってござる|G[。！]/);
        expect(text).not.toMatch(/（ほかの段|（調達係の能力/);
        const core2 = coreOf(s, c)!;
        expect(text).toContain(core2.ask.move);
        for (const m of numsOf(core2.ask.effect)) expect(numsOf(text), text).toContain(m);
        // セリフの数字 ＝ 提案書の表の数字（短期利益 ＝ 来月の利益の差 − 導入費用・導入費用）
        if (!isDo(c.choices[k]) || c.src === 'budget') continue;
        const plan = planOfChoice(s, c, k)!;
        const B = briefOf(s, plan, { card: c.id, iss: c.issues });
        const S = B.vals.list.find((m) => m.key === 'short')!;
        if (/G/.test(core2.ask.effect) && !/置き場所|出土品|取り分/.test(core2.ask.effect)) expect(numsOf(core2.ask.effect), `${c.src}: ${core2.ask.effect} vs short ${S.d}`).toContain(fmtS(S.d));
        if (B.cost.money > 0) expect(numsOf(core2.ask.cost), `${c.src}: ${core2.ask.cost}`).toContain(Math.round(B.cost.money).toLocaleString('en-US'));
        n++;
      }
    }
    expect(n).toBeGreaterThan(3);
  }, 180000);
  it('口ぐせは文頭だけ・呼びかけは社長への言葉だけ・archaic の語尾', async () => {
    await loadVoice();
    // 1006 ピタゴラス（呼びかけ「あなた」）→ 「社長」。5001 織田信長の口ぐせは文頭、文の途中には無い
    expect(spokenText(speakCore(core, 1006, 1))).toMatch(/^(.*。)?社長、/);
    expect(spokenText(speakCore(core, 1006, 1))).not.toMatch(/あなた、/);
    for (const salt of [0, 1, 2]) {
      const sp = speakCore(core, 5001, salt);
      const text = spokenText(sp);
      const tics = ['結論から申せ', '古い決まりは捨ておけ'];
      for (const tc of tics) if (text.includes(tc)) expect(text.indexOf(tc)).toBe(0);
      expect(sp.cause).not.toMatch(/結論から申せ|古い決まり/);
    }
    // archaic：「になってござる」は使わない
    const ar = spokenText(speakCore(core, 4025, 0));
    expect(ar).not.toMatch(/になってござる/);
    expect(ar).toMatch(/おりまする|でござる|心得まする/);
    // 承認の文は 3 通りを月で回す（同じ型・同じ声で、少なくとも 2 通り）
    const asks = new Set([0, 1, 2].map((salt) => speakCore({ ...core, ask: { ...core.ask, big: false } }, 1005, salt, 'steady').ask));
    expect(asks.size).toBeGreaterThanOrEqual(2);
  });
});
