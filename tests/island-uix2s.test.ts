// 段 UIX2s：工房の札・月次報告の新しい画面（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：工房」「画面：月次報告」）。
// 入のときだけ新しい画面に分かれること・今の目印（チュートリアルが指す所）が残ること・出す中身が今の画面とそろうこと・
// 数え上げ／ページ送り／とばすの決まり・動きを減らすと全部すぐ出ること。
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FACTORY } from '../src/island/p1/data';
import { assign, build, invest, newP1, recipeOf, setAutoCraft, setCraftPlan, startCraft, step, tutSpot, wsAny, type P1State, type Report } from '../src/island/p1/model';
import { craftable } from '../src/island/p1/orders';
import { openDigSummary, openMonthReport, wasAnnounced, type ReportHooks } from '../src/island/p1/report';
import { openWorkshop, type Ctx } from '../src/island/p1/screens';
import { UX_ICONS } from '../src/island/uix/icons';
import { COUNT_MS, FEED_MS, RANGE_KEY, barBox, growStreak, manText, niceMax, noEmoji, paperCore, rankMove, rankOrder, readRange, reportPages } from '../src/island/uix/screens/report';
import { S_ICONS } from '../src/island/uix/screens/s-icons';
import { uxsDeps } from '../src/island/p1/uxs';
import { setDeps } from '../src/island/uix/screens/s-deps';
import { uxs } from '../src/island/uix/screens/s-slots';
import { STAMP_MS, TAB_MS, benchProgress, benchState, gapRatio, planRange, planSnap, planText, wsTabs, wsTitle } from '../src/island/uix/screens/workshop';

const src = (f: string) => readFileSync(new URL(`../src/island/${f}`, import.meta.url), 'utf8');
const WS = src('uix/screens/workshop.ts');
const RP = src('uix/screens/report.ts');
const CSS = ['workshop.css', 'report.css'].map((f) => [f, src(`uix/screens/${f}`).replace(/\/\*[\s\S]*?\*\//g, '')] as const);

// 新しい画面は、本体の関数を束で受け取る（本番では p1/uxs.ts の loadUxs が渡す）
setDeps(uxsDeps);
afterEach(() => {
  for (const k of Object.keys(uxs)) delete (uxs as Record<string, unknown>)[k];
});

/** 工房を建てて、職人を 1 人置いた町 */
function town(): P1State {
  const s = newP1(1, 'C', 'c1');
  s.money = 1e7;
  s.tut = 99;
  const ws = build(s, 'workshop', ...tutSpot(s, 'workshop')!);
  if (typeof ws === 'string') throw new Error(ws);
  for (let k = 0; k < 6; k++) step(s);
  return s;
}
const fakeCtx = (s: P1State): Ctx => ({ s: () => s, root: {} as HTMLElement, save: () => undefined, refresh: () => undefined, toast: () => undefined });

describe('切り替え：入のときだけ新しい画面に分かれる（切のときは今の画面のまま）', () => {
  it('差し込み口は、はじめは空。入のときだけ s-boot.ts を動的に読む（切のときは読まない）', () => {
    expect(Object.keys(uxs)).toEqual([]);
    expect(src('p1/main.ts')).toContain('if (uxOn()) void loadUxs();');
    expect(src('p1/uxs.ts')).toMatch(/export const loadUxs = \(\) => import\('\.\.\/uix\/screens\/s-boot'\)\.then\(\(m\) => m\.install\(uxsDeps\)\);/);
    // 入口のほかに、本体から新しい画面を直接読んでいる所は無い（切のときに読み込まれない）
    for (const f of ['p1/screens.ts', 'p1/report.ts', 'p1/main.ts', 'p1/factoryui.ts', 'p1/uxs.ts']) expect(src(f), f).not.toMatch(/from '\.\.\/uix\/screens\/(?!s-slots')/);
    // 差し込み口のファイルは、型だけを読む（切のときも増えるのは数行）
    expect(src('uix/screens/s-slots.ts').match(/^import (?!type )/gm)).toBeNull();
    const boot = src('uix/screens/s-boot.ts');
    for (const k of ['workshop', 'report', 'digSummary']) expect(boot).toContain(`uxs.${k} = `);
  });
  it('新しい画面の束は、本体のモジュールを自分では読まない（型だけ。本体の束の分かれ方を変えない）。関数は p1/uxs.ts から渡す', () => {
    for (const f of ['workshop.ts', 'report.ts', 's-boot.ts', 's-deps.ts', 's-icons.ts', 's-press.ts']) {
      const code = src(`uix/screens/${f}`);
      for (const m of code.matchAll(/^import (type )?[^;]*? from '([^']+)';/gms)) {
        const outside = /^\.\.\/\.\.\//.test(m[2]);
        // uix の外から読んでよいのは、型と、もともと別の束になっている i18n だけ
        if (outside && !m[1]) expect(m[2], `${f}: ${m[0].slice(0, 60)}`).toBe('../../../i18n');
      }
    }
    // 渡す束に、新しい画面が使う名前が全部ある
    for (const code of [WS, RP]) for (const m of code.matchAll(/\bD\.([A-Za-z_]\w*)/g)) expect(Object.keys(uxsDeps), m[1]).toContain(m[1]);
  });
  it('工房：差し込み口が入っていれば、今の画面を作らずにそちらへ渡す（開き方はそのまま渡る）', () => {
    const s = town();
    const spy = vi.fn();
    uxs.workshop = spy;
    const ctx = fakeCtx(s);
    openWorkshop(ctx);
    openWorkshop(ctx, true);
    openWorkshop(ctx, { make: craftable(s)[0], from: 'x' });
    expect(spy.mock.calls.map((c) => c[1])).toEqual([{ invest: false }, { invest: true }, { make: craftable(s)[0], from: 'x' }]);
    expect(spy.mock.calls[0][0]).toBe(ctx);
  });
  it('月次報告：発表は 1 回だけ、の決まりは今のまま（2 回目は again が真）。まとめ報告は、最新の月の発表も兼ねる', () => {
    const s = town();
    const r = { month: 1, revenue: 100, rank: 2, area: [], news: [], costs: {}, bySeries: {}, profit: 0 } as unknown as Report;
    const spy = vi.fn();
    uxs.report = spy;
    const then = () => undefined;
    openMonthReport(fakeCtx(s), r, {} as ReportHooks, then);
    openMonthReport(fakeCtx(s), r, {} as ReportHooks, then);
    expect(spy.mock.calls.map((c) => c[4])).toEqual([false, true]);
    expect(spy.mock.calls[0][3]).toBe(then);
    expect(wasAnnounced(r)).toBe(true);
    const latest = { ...r, month: 2 } as Report;
    const dig = vi.fn();
    uxs.digSummary = dig;
    openDigSummary(fakeCtx(s), { latest } as never, { detail: () => undefined });
    expect(dig).toHaveBeenCalledTimes(1);
    expect(wasAnnounced(latest)).toBe(true);
  });
});

describe('今の目印が残る（チュートリアル・BGM の場面・撮影の道具が見ている所）', () => {
  it('工房：今の札の器（open()）で開く。✕ は今のキーのまま。強調は is-hot、一言は mineTip の「workshop」', () => {
    expect(WS).toMatch(/D\.open\(\s*ctx,/);
    expect(WS).toContain("D.mineTip(ctx, 'workshop', tipBox)");
    // 1 か月目の強調：作業台 1 の職人（いないとき）→ 作る物（職人がいて、まだ決めていないとき）。今の画面と同じ条件
    expect(WS).toContain("whoKey.classList.toggle('is-hot', tut === 'craft' && k === 0 && sl.worker == null)");
    expect(WS).toContain("itemKey.classList.toggle('is-hot', tut === 'craft' && k === 0 && sl.worker != null && !sl.sku)");
    // チュートリアルのあいだの選ぶ画面は、今と同じ（マインちゃんのおすすめの札つき）
    expect(WS).toContain("badge: ctx.step?.() === 'craft' ?");
    // ✕ を別のボタンに作り替えない（.isl-sheet-head .isl-btn に is-guide が付く）
    expect(WS).not.toMatch(/isl-sheet-head[^\n]*\.remove\(\)/);
  });
  it('指で押したあとの click が、開いたばかりの窓や地図に当たらない守りを、キーに付けている', () => {
    const sp = src('uix/screens/s-press.ts');
    expect(sp).toContain("addEventListener('click', stop, true)");
    // 重なる窓を開く・札を閉じる・画面を替えるキーは、どれも守りつき
    for (const k of ['safe(() => pickWho())', 'safe(() => pickItem())', 'safe(() => buy())', 'safe(() => setTab(key))', 'ctx.rebuild?.();\n          })']) expect(WS, k).toContain(k);
    expect(RP).toContain('return press(b, safe(fn));');
    expect(RP).toContain('safe(() => go(1))');
    // 今の目印 isl-slot も付ける（今の道具・案内が同じ場所を指せる）
    expect(WS).toContain("cls: 'uxs-slot uxs-slot--who isl-slot'");
    expect(WS).toContain("cls: 'uxs-slot uxs-slot--item isl-slot isl-ext-slot'");
  });
  it('工房：チュートリアルのあいだは、設備投資と建て替えを出さない（今の画面と同じ）', () => {
    expect(wsTabs(true)).toEqual(['bench', 'cmp']);
    expect(wsTabs(false)).toEqual(['bench', 'cmp', 'invest']);
  });
  it('月次報告：今の札の器で開き、is-report-sheet を付ける（BGM の場面）。閉じるのは今の ✕ のキー（字は「とばす」）', () => {
    expect(RP).toContain("sheet?.classList.add('uxs-rp', 'ux-root', 'is-report-sheet')");
    expect(RP).toContain("uxScene('report')");
    expect(RP).toMatch(/head\?\.querySelector<HTMLButtonElement>\('\.isl-btn'\)/);
    expect(RP).toContain("t('とばす', 'Skip')");
  });
});

describe('出す中身が、今の画面とそろう（主な項目）', () => {
  it('工房：今の画面の言葉と操作が、新しい画面にもある', () => {
    const now = src('p1/screens.ts');
    for (const k of ['素材があるかぎり作り続けます。', '素材が足りないので、いまは作れません。', 'いま作っている 1 ロットのあとに、この数だけ作ります。', '主力にする', '工房の倉庫（運ぶ前の商品）', 'できた商品は、物流の担当がお店へ運びます。', 'まだありません', '押すと作業台 1 で作ります。', '作業台は全部ふさがっています。', '市場データで選んだ', '建物ごと（セクタごと）の設備なので、新しいセクタでは入れ直します。', 'この 1 ロットで止める', 'に戻る']) {
      expect(now, k).toContain(k);
      expect(WS, k).toContain(k);
    }
    // 操作：職人の入れ替え・作る物の選択・作る数・自動製造・主力にする・設備投資・建て替え
    for (const k of ['pickHero(', 'pickMake(', 'pickExt(', 'chooseMake(', 'setCraftPlan(', 'setAutoCraft(', 'applyPlan(', 'invest(', 'ctx.rebuild?.()', 'extCard(', 'craftErr(', 'upWhy(']) expect(WS, k).toContain(k);
    // 建て替えの言葉（工房の建て替えの箱と同じ）
    const fac = src('p1/factoryui.ts');
    for (const k of ['そのあいだも作り続けます', 'となりが空いているので、その場で広げられます', 'となりが空いていないので、光った場所へ移って建て替えます', '工房を町工場に建て替えると、作業台が 4 台になるよ']) {
      expect(fac, k).toContain(k);
      expect(WS, k).toContain(k);
    }
  });
  it('月次報告：今の報告の項目と導線が、新しい画面にもある', () => {
    const now = src('p1/report.ts');
    for (const k of ['投資：スキルツリー', '目標確認：企業ランキング', '分析：サプライチェーンの画面', '担当者からの提案', '研究ノート', '育成', '給与', '問い合わせ', '外交', '営業', '利益との差', 'うち復刻品', '月次 PDCA', '売上の内訳（商品ごとの割合・費用・売上から利益まで）', '商品ごとの売上の割合', '費用の内訳', '売上から利益まで', '商圏の取り分', '巻き返し', '課題あり', '今月の出土品', '今月のレベルアップ', '担当の報告', '士気と給与', 'お客さんの声', '来月も守り切れたら[[制覇]]だよ！', '利益＝売上 − その月の費用。資金にはこのほかの入出金も入る', '期間の売上', '今回の出土', 'いまの課題', 'くわしい報告を見る', '続ける']) {
      expect(now, k).toContain(k);
      expect(RP, k).toContain(k);
    }
    // 導線は、今と同じ口へ
    for (const k of ['hooks.openSkills(D.STAGE_BRANCH[bn])', 'hooks.openRanking()', 'hooks.openSupply()', 'hooks.openTrade?.()', 'hooks.openNotes?.()', 'hooks.openGrowth?.()', 'hooks.openProps?.()', 'hooks.openPay?.()', 'hooks.openCs?.()', 'hooks.openLegal?.()', 'hooks.openDiplo?.()', 'hooks.openProposal?.(', 'hooks.detail()']) expect(RP, k).toContain(k);
    // 同じ数え方（今の関数をそのまま使う）
    for (const k of ['reportJam(', 'cashGap(', 'salesParts(', 'costParts(', 'monthFall(', 'moneyCandles(', 'reportProposal(', 'whatIf(', 'bestSell(', 'levelUpText(', 'clearCondText(']) expect(RP, k).toContain(k);
  });
  it('ページ：売上 → 企業ランキング → 推移 → サプライチェーン（→ 各部からの報告は、行がある月だけ）', () => {
    expect(reportPages(false)).toEqual(['sales', 'rank', 'trend', 'scm']);
    expect(reportPages(true)).toEqual(['sales', 'rank', 'trend', 'scm', 'dept']);
  });
});

describe('工房の札の決まり（DOM なしの芯）', () => {
  it('作業台の様子：職人がいない → 止まっている（素材が足りない）→ 作っている → 待っている', () => {
    const s = town();
    const sl = s.slots[0];
    expect(benchState(s, sl)).toEqual({ state: 'empty', err: 'worker' });
    expect(benchProgress(s, sl)).toBeNull();
    assign(s, s.staff[0].hero, 'craft', 0);
    expect(benchState(s, sl)).toEqual({ state: 'idle', err: null });
    const x = craftable(s)[0];
    // 素材が無い：止まっている（理由は今の画面と同じ鍵）
    const mats = { ...s.mats };
    for (const k of Object.keys(s.mats)) s.mats[k as keyof typeof s.mats] = 0;
    sl.sku = x;
    expect(benchState(s, sl)).toEqual({ state: 'stop', err: 'mats' });
    Object.assign(s.mats, mats);
    for (const [m, q] of Object.entries(recipeOf(x))) s.mats[m as keyof typeof s.mats] = (q ?? 0) * 4;
    expect(startCraft(s, 0, x, true)).toBeNull();
    expect(benchState(s, sl).state).toBe('run');
    const p = benchProgress(s, sl)!;
    expect(p.p).toBeGreaterThanOrEqual(0);
    expect(p.p).toBeLessThanOrEqual(1);
    expect(p.left).toBeGreaterThan(0);
    // 休憩中
    s.staff[0].resting = true;
    expect(benchState(s, sl).state).toBe('rest');
  });
  it('作る数の添え書きと範囲：今の画面と同じ（自動製造・あと N 個・この 1 ロットで止める・使い切り）', () => {
    const s = town();
    const sl = s.slots[0];
    assign(s, s.staff[0].hero, 'craft', 0);
    const x = craftable(s)[0];
    for (const k of Object.keys(s.mats)) s.mats[k as keyof typeof s.mats] = 0;
    for (const [m, q] of Object.entries(recipeOf(x))) s.mats[m as keyof typeof s.mats] = (q ?? 0) * 4;
    expect(startCraft(s, 0, x, true)).toBeNull();
    expect(planText(s, sl, 0)).toBe('自動製造');
    const r = planRange(s, sl);
    expect(r.max).toBeGreaterThan(0);
    expect(r.max % r.batch).toBe(0);
    expect(r.cur).toBe(r.max);
    setAutoCraft(s, 0, false);
    setCraftPlan(s, 0, planSnap(r.batch + 1, r.batch, r.max));
    expect(sl.left).toBe(r.batch * 2);
    expect(planText(s, sl, 0)).toBe(`あと ${r.batch * 2} 個`);
    expect(planRange(s, sl).cur).toBe(r.batch * 2);
    setCraftPlan(s, 0, 0);
    expect(planText(s, sl, 0)).toBe('この 1 ロットで止める');
    sl.back = null;
    expect(planText(s, sl, 0)).toMatch(/^いまの素材で あと \d+ 個$/);
    // つまみは 1 ロットの倍数（0〜最大）にそろえる
    expect(planSnap(-5, 10, 100)).toBe(0);
    expect(planSnap(31, 10, 100)).toBe(40);
    expect(planSnap(999, 10, 100)).toBe(100);
  });
  it('足りないときの目盛り：1/20 刻み・少しは点ける（責めない「あと N G」）', () => {
    expect(gapRatio(0, 1000)).toBe(0.05);
    expect(gapRatio(500, 1000)).toBe(0.5);
    expect(gapRatio(990, 1000)).toBe(1);
    expect(gapRatio(100944, 480000)).toBe(0.2);
    expect(WS).toContain('売上がたまれば届きます');
  });
  it('見出し：「工房（本店）」は名前と添え札に分ける。町工場・大工場は形（1×2・2×2）を添える', () => {
    const s = town();
    const ws = wsAny(s)!;
    expect(wsTitle(ws)).toEqual(['工房', '本店']);
    expect(wsTitle({ id: 'workshop', lv: 1 })).toEqual([FACTORY.name[1], FACTORY.shape[1]]);
    expect(wsTitle({ id: 'workshop', lv: 2 })).toEqual([FACTORY.name[2], FACTORY.shape[2]]);
    expect(wsTitle(null)[0]).toBe('工房');
    // 設備投資は、工房の設備が全部（買えたら model の invest。数字は変えない）
    const before = s.money;
    expect(invest(s, ws.uid, 'tools')).toBeNull();
    expect(s.money).toBeLessThan(before);
  });
  it('動きの長さ：タブの横送り 520ms・買ってから「導入済」まで 420ms（見本の値）', () => {
    expect(TAB_MS).toBe(520);
    expect(STAMP_MS).toBe(420);
    expect(WS).toContain("easing: 'steps(8, end)'");
  });
});

describe('月次報告の決まり（DOM なしの芯）', () => {
  it('ページ送り：送っている途中は進まない。最後の「つぎへ」は閉じる。前へも戻れる', () => {
    const log: string[] = [];
    const c = paperCore(3, { render: (k, dir, feed) => log.push(`${k}:${dir}:${feed}`), close: () => log.push('close') });
    c.show(0);
    expect(c.page).toBe(0);
    expect(c.busy).toBe(false);
    c.go(1);
    expect(log).toEqual(['0:1:false', '1:1:true']);
    // 紙を送っているあいだ（600ms）は、押しても進まない
    expect(c.busy).toBe(true);
    c.go(1);
    expect(c.page).toBe(1);
    c.fed();
    c.go(-1);
    expect(log.at(-1)).toBe('0:-1:true');
    c.fed();
    c.go(-1);
    expect(c.page).toBe(0);
    c.go(1);
    c.fed();
    c.go(1);
    c.fed();
    expect(c.page).toBe(2);
    c.go(1);
    expect(log.at(-1)).toBe('close');
    expect(FEED_MS).toBe(600);
    expect(RP).toContain("easing: 'steps(9, end)'");
  });
  it('紙を押すと、そのページがすぐ全部出る（数え上げを待たせない）。ページを替えるときも、残りを出してから', () => {
    const c = paperCore(2, { render: () => undefined, close: () => undefined });
    c.show(0);
    expect(c.printing).toBe(false);
    expect(c.tap()).toBe(false);
    let done = 0;
    c.setSkip(() => done++);
    expect(c.printing).toBe(true);
    expect(c.tap()).toBe(true);
    expect(done).toBe(1);
    expect(c.printing).toBe(false);
    expect(c.tap()).toBe(false);
    // 数え上げ → 残りの行、と 2 段で終わらせるページ：1 回目の押しで数え終わり、2 回目で全部出る
    c.setSkip(() => c.setSkip(() => done++));
    expect(c.tap()).toBe(true);
    expect(c.printing).toBe(true);
    c.show(1);
    expect(done).toBe(2);
  });
  it('数え上げをしない：開き直し・もう見たページ・動きを減らす（紙も送らない）', () => {
    const a = paperCore(2, { render: () => undefined, close: () => undefined });
    a.show(0);
    expect(a.instant()).toBe(false);
    a.go(1);
    a.fed();
    expect(a.instant()).toBe(false);
    a.go(-1);
    a.fed();
    // もう見たページ
    expect(a.instant()).toBe(true);
    // 開き直し（発表を済ませた報告）
    const b = paperCore(2, { render: () => undefined, close: () => undefined }, () => false, true);
    b.show(0);
    expect(b.instant()).toBe(true);
    // 動きを減らす：紙を送らず、すぐ出る
    const feeds: boolean[] = [];
    const c = paperCore(2, { render: (_k, _d, feed) => feeds.push(feed), close: () => undefined }, () => true);
    c.show(0);
    expect(c.instant()).toBe(true);
    c.go(1);
    expect(feeds).toEqual([false, false]);
    expect(c.busy).toBe(false);
    expect(COUNT_MS).toBe(1900);
  });
  it('順位：行の並び（多い順）と、先月からの動き（初登場・上がった・下がった・キープ）', () => {
    expect(rankOrder([10, 30, 20])).toEqual([2, 0, 1]);
    // わが社（0 番）の売上が伸びて追い抜くと、並びが入れ替わる
    expect(rankOrder([25, 30, 20])).toEqual([1, 0, 2]);
    expect(rankOrder([31, 30, 20])).toEqual([0, 1, 2]);
    expect(rankOrder([30, 30])).toEqual([0, 1]);
    expect(rankMove(null, 3)).toBe('new');
    expect(rankMove(3, 1)).toBe('up');
    expect(rankMove(1, 2)).toBe('down');
    expect(rankMove(2, 2)).toBe('keep');
  });
  it('縦の棒：目盛りはきりのよい数。赤字の棒は 0 の線から下へ', () => {
    expect(niceMax(1046849)).toBe(1200000);
    expect(niceMax(540984)).toBe(600000);
    expect(niceMax(9)).toBe(10);
    expect(niceMax(100)).toBe(100);
    expect(niceMax(0)).toBe(1);
    expect(barBox(50, 0, 100)).toEqual({ b: 0, h: 50 });
    expect(barBox(-50, -100, 100)).toEqual({ b: 25, h: 25 });
    expect(barBox(100, -100, 100)).toEqual({ b: 50, h: 50 });
    // 棒の上の金額：小数 1 桁まで（見本と同じ書き方）
    expect(manText(1046849)).toBe('104.7万');
    expect(manText(540984)).toBe('54.1万');
    expect(manText(600000)).toBe('60万');
    expect(manText(4571)).toBe('4,571');
    expect(manText(-64000)).toBe('−6.4万');
    expect(manText(123456789)).toBe('1.2億');
    expect(growStreak([1, 2, 3, 4])).toBe(3);
    expect(growStreak([4, 3, 5])).toBe(1);
    expect(growStreak([5, 4])).toBe(0);
    expect(growStreak([5])).toBe(0);
  });
  it('推移の期間は、今の月次報告と同じ鍵で覚える（3・6・12 か月・全期間。はじめは 6 か月）', () => {
    expect(RANGE_KEY).toBe('isl.chartRange');
    expect(src('p1/report.ts')).toContain("localStorage.getItem('isl.chartRange')");
    expect(readRange(() => null)).toBe(6);
    expect(readRange(() => '3')).toBe(3);
    expect(readRange(() => '0')).toBe(0);
    expect(readRange(() => '7')).toBe(6);
    expect(readRange(() => {
      throw new Error('x');
    })).toBe(6);
  });
  it('絵文字は外して、ドットのアイコンを添える（✔ は言葉に）', () => {
    expect(noEmoji('👑 制覇！')).toBe('制覇！');
    expect(noEmoji('⛏ 今月の出土品')).toBe('今月の出土品');
    expect(noEmoji('制覇の条件：1 位を 2 か月 ✔')).toBe('制覇の条件：1 位を 2 か月 済');
    expect(noEmoji('★ +10 → 20')).toBe('★ +10 → 20');
    // 新しい画面のコードに、絵文字の印を書いていない
    for (const [f, s] of [['workshop.ts', WS], ['report.ts', RP]] as const) expect(s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2B50}]/gu), f).toBeNull();
  });
});

describe('アイコンと CSS の決まり', () => {
  it('足したアイコンは 12×12。土台の名前とぶつからない', () => {
    const art = /const ART: Record<string, string\[\]> = \{([\s\S]*?)\n\};/.exec(src('uix/screens/s-icons.ts'))![1];
    const rows = [...art.matchAll(/^\s+(\w+): \[(.*)\],$/gm)];
    expect(rows.map((m) => m[1])).toEqual(S_ICONS);
    for (const m of rows) {
      const ls = [...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1]);
      expect(ls.length, m[1]).toBe(12);
      for (const l of ls) expect(l, m[1]).toMatch(/^[.#+\-argcwk]{12}$/);
    }
    for (const n of S_ICONS) expect(UX_ICONS, n).not.toContain(n);
    // 画面で使う名前は、どれも絵がある
    const all = new Set([...S_ICONS, ...UX_ICONS]);
    for (const s of [WS, RP]) for (const m of s.matchAll(/(?:sIcon|inkIcon)\('(\w+)'/g)) expect(all.has(m[1]), m[1]).toBe(true);
    for (const m of RP.matchAll(/ico: '(\w+)'/g)) expect(all.has(m[1]), m[1]).toBe(true);
  });
  it('セレクタはすべて .is-uxc の内側。角は丸めない。字は 1rem（16px）から。新しい class は uxs- で、今の CSS とぶつからない', () => {
    const old = ['island.css', 'p1/p1.css', 'p1/p2.css', 'p1/factory.css', 'p1/ui8.css', 'uix/parts.css', 'uix/legacy.css', 'uix/base.css', 'uix/kit.css', 'uix/audio/book.css'].map((f) => src(f)).join('\n');
    for (const [f, css] of CSS) {
      let depth = 0;
      let inKeyframes = -1;
      let buf = '';
      const bad: string[] = [];
      for (const ch of css) {
        if (ch === '{') {
          const sel = buf.trim();
          if (sel.startsWith('@keyframes')) inKeyframes = depth;
          else if (!sel.startsWith('@') && inKeyframes < 0) for (const one of sel.split(/,(?![^(]*\))/)) if (!/^html\.is-uxc/.test(one.trim())) bad.push(one.trim());
          depth++;
          buf = '';
        } else if (ch === '}') {
          depth--;
          if (inKeyframes >= 0 && depth <= inKeyframes) inKeyframes = -1;
          buf = '';
        } else if (ch === ';') buf = '';
        else buf += ch;
      }
      expect(bad, f).toEqual([]);
      expect(css, f).not.toMatch(/border-radius/);
      // 字の大きさ：rem（1 以上）か、数字の段（--ux-n*）だけ。px の小さい字は書かない
      for (const m of css.matchAll(/font-size:\s*([^;]+);/g)) expect(m[1].trim(), f).toMatch(/^(1(\.\d+)?rem|[2-9](\.\d+)?rem|var\(--ux-n(15|2|3|4)\)|0)$/);
      for (const m of css.matchAll(/font:\s*([^;]+);/g)) expect(m[1], f).toMatch(/\b1rem\//);
      // 動かすのは transform と opacity
      for (const m of css.matchAll(/transition:\s*([^;]+);/g)) if (m[1].trim() !== 'none') expect(m[1].replace(/\([^)]*\)/g, ''), f).toMatch(/^(transform|opacity)\b[^,]*(,\s*(transform|opacity)\b[^,]*)*$/);
      for (const m of css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\n\}/g)) for (const p of m[1].matchAll(/([\w-]+):/g)) expect(['transform', 'opacity'], `${f} ${p[1]}`).toContain(p[1]);
      // 新しい class・keyframes は uxs-。今の CSS に同じ名前が無い
      const mine = new Set([...css.matchAll(/\.(uxs-[\w-]+)/g)].map((m) => m[1]));
      expect(mine.size, f).toBeGreaterThan(20);
      for (const c of mine) expect(old.includes(`.${c}`), c).toBe(false);
      for (const m of css.matchAll(/@keyframes ([\w-]+)/g)) expect(m[1], f).toMatch(/^uxs-/);
    }
  });
});
