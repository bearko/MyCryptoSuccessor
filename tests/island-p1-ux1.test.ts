// 段 UX1：プレイレポート（2026-11-05）の詰まりを直す（表示・操作・説明だけ。ゲームの数字・判断は変えない）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TUT_END } from '../src/island/p1/tut';

const src = (f: string) => readFileSync(new URL(`../src/island/p1/${f}`, import.meta.url), 'utf8');

describe('A. 時間の止まり方', () => {
  it('A-1：月末ポーズ（計画中）に ▶⏩ を押すと nextMonth（懐中時計と同じ）。⏩ なら ⏩ のまま', () => {
    const m = src('main.ts');
    const i = m.indexOf('if (v > 0 && s.monthPause && !s.digRun) {');
    expect(i).toBeGreaterThan(0);
    const body = m.slice(i, m.indexOf('}', i));
    expect(body).toContain('nextMonth(v)');
    expect(body).not.toContain('toast(');
    expect(m).toContain('function nextMonth(v = 1)');
    expect(m).toContain('speed = v;');
    // 日付の札に「⏸ 計画中 — ▶ で N 月へ」
    expect(m).toContain('計画中 — ▶ で ${d.month} 月へ');
  });
  it('A-2：懐中時計は画面・吹き出し・メニューを開いていても隠さない（窓・案内・建てるモードのあいだだけ）', () => {
    const m = src('main.ts');
    const line = m.split('\n').find((l) => l.startsWith('const nextShown = '))!;
    expect(line).toContain('s.monthPause');
    expect(line).not.toContain('!menu');
    expect(line).not.toContain('!pop');
    expect(line).toContain('.isl-modal:not(.has-focus)');
    // 画面（シート）を開いているあいだは、見出しの ✕ の横に小さく「▶ N 月へ」
    expect(m).toContain("root.querySelector('.isl-sheet .isl-sheet-head')");
    expect(m).toContain('head.insertBefore(nextMini, head.lastElementChild)');
    expect(src('p1.css')).toContain('.isl-sheet-head .isl-btn.isl-next-mini');
  });
  it('A-3：見習い期間の最後の会話は、懐中時計を金色の枠で囲む', () => {
    expect(TUT_END).toHaveLength(3);
    expect(TUT_END[2].focus).toBe('.isl-next-month');
    expect(TUT_END[2].text).toContain('▶');
  });
  it('A-4：案内で止めているときの ▶⏩ は理由のトースト。「⏩ で待つ」段は速さの箱を光らせる。1 枚の会話は暗幕を薄く', () => {
    const m = src('main.ts');
    expect(m).toContain("if (v > 0 && tutHold()) {");
    expect(m).toContain('会話を進めると、時間が動くよ');
    expect(m).toContain("speedBox.classList.toggle('is-guide', hm === 'speed'");
    expect(m).toContain("m.classList.toggle('is-light', pages.length === 1 && !pages[0].focus && !pages[0].show && !pages[0].el)");
    expect(src('p1.css')).toContain('.isl-modal.isl-talk.is-light');
  });
  it('A-5：流れの案内が終わったら、案内の前の速さに戻す（1 固定をやめる）', () => {
    const m = src('main.ts');
    expect(m).toContain('tourPrevSpeed = speed > 0 ? speed : 1;');
    const i = m.indexOf('function tourEnd()');
    const body = m.slice(i, m.indexOf('\n}\n', i));
    expect(body).toContain('speed = tourPrevSpeed;');
    expect(body).not.toContain('speed = 1;');
  });
  it('A-6：承認は押した瞬間に「承認中…」、変更を先に反映してからハンコの演出、そのあと閉じる', () => {
    const p = src('proposalui.ts');
    const i = p.indexOf("t('承認する', 'Approve')");
    const body = p.slice(i, p.indexOf('isl-prop-ok', i));
    const at = (x: string) => body.indexOf(x);
    expect(at('承認中…')).toBeGreaterThan(0);
    expect(at('applyPlanSafe(ctx, p)')).toBeLessThan(at('after(ctx)'));
    expect(at('after(ctx)')).toBeLessThan(at('stampThen(ctx, panel'));
    expect(at('stampThen(ctx, panel')).toBeLessThan(at("close('ok')"));
  });
});

describe('B. 建てる・掘る・押す', () => {
  it('B-1：チュートリアルの建築中は、スポット以外のタップでゴーストを動かさず、トーストだけ', () => {
    const m = src('main.ts');
    const i = m.indexOf('if (placing.i === i && placing.j === j) tryPlace();');
    const body = m.slice(i, m.indexOf('return;', i));
    expect(body).toContain('else if (tutSpotNow()) {');
    expect(body).toContain('光っている場所に建ててみて！');
    // 地図を動かしても動かない
    const g = m.indexOf('function setGhost(');
    expect(m.slice(g, m.indexOf('placing.i = i;', g))).toContain('if (tutSpotNow()) return;');
  });
  it('B-2：光るマスは金色の輪（画面で 3px・脈打つ。reduced-motion では輪なし）を建物の上に描く', () => {
    const r = src('render.ts');
    expect(r).toContain('export function markRing(');
    expect(r).toContain('const px = 3 / Math.max(0.1, zoom);');
    expect(r).toContain('if (!reducedMotion()) {');
    // 地面の層では塗りだけ、輪は前の層（建物の上）
    expect(r.indexOf('markRing(ctx, anim.mark.i, anim.mark.j, cam.zoom, now)')).toBeGreaterThan(r.indexOf("drawWorld(ctx, s, world, 'front'"));
  });
  it('B-3：画面の下の固定バーに「建てる ○○ G」「やめる」。B-4：荒れ地なら「⛏ 掘れば使える → 発掘へ」', () => {
    const m = src('main.ts');
    expect(m).toContain("const placeBox = h('div', 'isl-place-bar');");
    expect(m).toContain('placeBox.hidden = !placing;');
    const i = m.indexOf('function renderPlaceBar(');
    const body = m.slice(i, m.indexOf('\n}\n', i));
    expect(body).toContain("'is-on is-big'");
    expect(body).toContain("else if (err === 'waste')");
    expect(body).toContain('⛏ 掘れば使える → 発掘へ');
    expect(body).toContain("t('やめる', 'Cancel')");
    expect(m).toContain('function toWastePop()');
  });
  it('B-5：空のマスを押したら、画面で手前（i+1, j+1）の建物を選ぶ（建物の絵は上に伸びる）', async () => {
    const { newP1, build, tapTarget, occupant, allowedDirs } = await import('../src/island/p1/model');
    const s = newP1(1);
    s.tut = 99;
    let at: [number, number, 'rd' | 'ld' | 'lu' | 'ru'] | null = null;
    for (let j = 2; j < s.n && !at; j++) for (let i = 2; i < s.n && !at; i++) {
      const ds = allowedDirs(s, 'workshop', i, j);
      if (ds.length && !occupant(s, i - 1, j - 1)) at = [i, j, ds[0]];
    }
    expect(at).not.toBeNull();
    const b = build(s, 'workshop', at![0], at![1], at![2]);
    expect(typeof b).toBe('object');
    const [i, j] = [at![0], at![1]];
    // 建物のマスはそのまま。その奥（北）の空きマスは、手前の建物へ補正。さらに奥は補正しない
    expect(tapTarget(s, i, j)).toEqual([i, j]);
    expect(tapTarget(s, i - 1, j - 1)).toEqual([i, j]);
    expect(occupant(s, ...tapTarget(s, i - 1, j - 1))?.id).toBe('workshop');
    if (!occupant(s, i - 2, j - 2) && !occupant(s, i - 1, j - 1)) expect(tapTarget(s, i - 2, j - 2)).toEqual([i - 2, j - 2]);
    // 地図の外へは補正しない
    expect(tapTarget(s, s.n - 1, s.n - 1)).toEqual([s.n - 1, s.n - 1]);
  });
  it('B-6：ズームの ＋／− は最初の町でも出す。置くモードの初回に地図の動かし方のトースト（1 回だけ）', () => {
    const m = src('main.ts');
    expect(m).toContain('zoomBox.hidden = !!placing || digOpen();');
    expect(m).not.toContain('zoomBox.hidden = !land');
    expect(m).toContain('if (!s.flags.zoomTip) {');
  });
  it('B-7：部門のタブに title（サブタブ名の並び）と、PC の右の帯に主なサブタブ名', async () => {
    const { tabHint, subDefs } = await import('../src/island/p1/menus');
    expect(tabHint(['スキルツリー', '建築', 'ランド'])).toBe('スキルツリー・建築');
    expect(tabHint(['サプライチェーン', '調達'])).toBe('サプライチェーン');
    expect(tabHint(['研究ノート', '開発', '展示館'])).toBe('研究ノート・開発');
    expect(tabHint([])).toBe('');
    expect(tabHint(subDefs('strategy', ['logistics', 'strategy', 'hr', 'rnd', 'marketing']).map((x) => x.short))).toBe('スキルツリー・建築');
    const m = src('main.ts');
    expect(m).toContain("b.title = t(`${d.name}：${subs.map((x) => x.name).join('・')}`");
    expect(m).toContain("h('small', 'isl-tab-sub', tabHint(subs.map((x) => x.short)))");
  });
});

describe('C. 数字の説明', () => {
  it('C-1：提案書の KPI タイルは、初めて開いた日の数字（snap）を主に。いま計算し直して 1 G 以上ずれていれば renow', async () => {
    const { kpisOf } = await import('../src/island/p1/slides');
    const b = {
      vals: { list: [{ key: 'short' as const, now: 100, after: 1300, d: 1200, why: '' }, { key: 'long' as const, now: 300, after: 3300, d: 3000, why: '' }] },
      cost: { money: 500, rp: 0, monthly: 0, days: 0, items: [] },
      dProfit: 1200,
      now: {},
      after: {},
    } as unknown as Parameters<typeof kpisOf>[0];
    const plain = kpisOf(b);
    expect(plain.find((k) => k.key === 'short')).toMatchObject({ v: 1200 });
    expect(plain.find((k) => k.key === 'short')?.renow).toBeUndefined();
    const snap = kpisOf(b, null, { snap: { day: 3, short: 1000, long: 3000 } });
    expect(snap.find((k) => k.key === 'short')).toMatchObject({ v: 1000, renow: 1200 });
    expect(snap.find((k) => k.key === 'long')).toMatchObject({ v: 3000 });
    expect(snap.find((k) => k.key === 'long')?.renow).toBeUndefined();
    // 提案書：カードを初めて開いたときに snap を覚える。「予測精度」の札に説明の ⓘ
    const p = src('proposalui.ts');
    expect(p).toContain('if (card && !card.snap) {');
    expect(p).toContain('card.snap = { day: s.day, short: S.d, long: L.d };');
    expect(p).toContain('予測精度とは');
  });
  it('C-2：利益に入らない入出金（flowAdd）を月ごとに積み、「資金の変化 − 利益」＝内訳の合計＋残り（cashGap）', async () => {
    const { flowAdd, cashGap, FLOW_KEYS } = await import('../src/island/p1/model');
    const s: { flow?: Partial<Record<(typeof FLOW_KEYS)[number], number>> } = {};
    flowAdd(s, 'reward', 3000);
    flowAdd(s, 'side', 400);
    flowAdd(s, 'side', 400);
    flowAdd(s, 'permit', -2000);
    flowAdd(s, 'tax', 0);
    expect(s.flow).toEqual({ reward: 3000, side: 800, permit: -2000 });
    // 資金 10,000 → 12,500（+2,500）・利益 +500 → 差 +2,000：内訳 +3,000 +800 −2,000 = +1,800、残り +200
    const g = cashGap({ profit: 500, money: { start: 10000, end: 12500 }, cash: s.flow })!;
    expect(g.gap).toBe(2000);
    expect(g.items).toEqual([{ k: 'reward', v: 3000 }, { k: 'permit', v: -2000 }, { k: 'side', v: 800 }]);
    expect(g.rest).toBe(200);
    expect(g.items.reduce((a, x) => a + x.v, 0) + g.rest).toBe(g.gap);
    expect(cashGap({ profit: 1, cash: {} })).toBeNull();
    // 報告に cash を移し、月の締めで空にする
    const m = src('model.ts');
    expect(m).toContain("...(s.flow && Object.keys(s.flow).length ? { cash: { ...s.flow } } : {})");
    expect(m).toContain('s.flow = {};');
    expect(m).toContain("flowAdd(s, 'preopen'");
    expect(src('report.ts')).toContain('利益との差 ${signed(cg.gap, money)}');
  });
  it('C-3：大口注文の売上はお店の画面の売上（sh.rev）にも入る。C-5：選択肢の 2 行目は売上の額と「ふだんより +M G 得」', async () => {
    const { newP1, build, allowedDirs, myShops, syncShop, skuOf: sku } = await import('../src/island/p1/model');
    const { applyEvent, optSub } = await import('../src/island/p1/events');
    const s = newP1(1);
    s.tut = 99;
    s.money = 1e6;
    const lot = (id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] => {
      for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) {
        const d = allowedDirs(s, id, i, j);
        if (d.length) return [i, j, d[0]];
      }
      throw new Error('no lot');
    };
    build(s, 'workshop', ...lot('workshop'));
    const b = build(s, 'general_store', ...lot('general_store'));
    expect(typeof b).toBe('object');
    (b as { left: number }).left = 0;
    syncShop(s, b as never);
    const shop = myShops(s)[0];
    const x = sku('lantern', 'C');
    s.stock[x] = 20;
    const sh = s.shops[shop.uid];
    sh.shelves[0] = x;
    const rev0 = sh.rev;
    const money0 = s.money;
    const d: import('../src/island/p1/events').EvData = { kind: 'bigorder', good: true, who: 'mine', opts: [{ id: 'all', cost: 0, fx: [], order: { sku: x, n: 10, yen: 125, price: 100 }, ev: 250 }] };
    expect(applyEvent(s, d, 0)).toBeNull();
    expect(s.money - money0).toBe(1250);
    expect(sh.rev - rev0).toBe(1250);
    expect(s.stock[x]).toBe(10);
    const sub = optSub(d, d.opts[0]);
    expect(sub).toContain('売上 +1,250 G（ふだんより +250 G 得）');
    expect(sub).toContain('見込み +250 G');
  });
  it('C-4：発掘の帯の「研」「掘った」に今回の値（終了の札と同じ got.rp・got.cells）', async () => {
    const { digStatus } = await import('../src/island/p1/digview');
    const { newP1 } = await import('../src/island/p1/model');
    const s = newP1(1);
    s.tut = 99;
    s.rp = 120;
    s.digRun = { site: 0, left: 5000, total: 15000, rep0: 0, got: { found: 1, lv: 0, rp: 35, mat: 2, cells: 7 } };
    const st = digStatus(s)!;
    expect(st.rp).toBe(120);
    expect(st.rpNow).toBe(35);
    expect(st.cellsNow).toBe(7);
    const u = src('digui.ts');
    expect(u).toContain('（今回 +${st.rpNow}）');
    expect(u).toContain('（今回 ${st.cellsNow} マス）');
  });
  it('C-6：素材の表示額（unitPrice）は支払いと同じ式（できごとの倍率込み）', async () => {
    const { newP1, build, allowedDirs, unitPrice, matPrice, buy } = await import('../src/island/p1/model');
    const s = newP1(1);
    s.tut = 99;
    s.money = 1e6;
    for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) {
      const d = allowedDirs(s, 'workshop', i, j);
      if (d.length) {
        build(s, 'workshop', i, j, d[0]);
        j = s.n;
        break;
      }
    }
    const m = 'wood' as const;
    expect(unitPrice(s, m)).toBe(matPrice(s, m));
    // 素材の値上がりのできごと（×1.35）：表示も支払いも同じだけ上がる
    s.events = { fx: [{ k: 'mat', key: m, mul: 1.35, until: s.day + 10, sector: s.sector ?? 'c1', ev: 'matprice' }], log: [] } as never;
    expect(unitPrice(s, m)).toBe(Math.round(matPrice(s, m) * 1.35));
    const m0 = s.money;
    const e = buy(s, m, 5);
    if (e === null) expect(m0 - s.money).toBe(unitPrice(s, m) * 5);
    // 画面と提案書の表示は unitPrice（matPrice だけの表示は残さない）
    expect(src('screens.ts')).not.toMatch(/money\(matPrice\(s, m\)/);
    expect(src('plan.ts')).toContain('unitPrice(s, st.m) * st.lots * LOT');
  });
  it('C-7：承認事項に「作業台 N を A → B に替える（A は作らなくなる）」（dropLine）。カードの 2 行目にも短く', async () => {
    const { dropLine } = await import('../src/island/p1/plan');
    const { newP1, skuOf: sku } = await import('../src/island/p1/model');
    const s = newP1(1);
    const a = sku('lantern', 'C');
    const b = sku('sensu', 'C');
    s.slots = [{ sku: a, worker: null, running: null, auto: true }] as never;
    const line = dropLine(s, { hero: null, q: 0.9, dept: null, acts: [], steps: [{ k: 'make', slot: 0, x: b }], drop: a })!;
    expect(line).toMatch(/^作業台 1 を .+ → .+ に替える（.+は作らなくなる）$/);
    expect(dropLine(s, { hero: null, q: 0.9, dept: null, acts: [], steps: [], drop: null })).toBeNull();
    expect(src('proposalui.ts')).toContain("h('li', 'isl-sl-drop')");
    expect(src('card.ts')).toContain('は作らなくなる');
  });
  it('C-8：帯の速さの上限は 1.6 倍。月次報告 KPI ② の初期表示は売上だけ', async () => {
    const { newsSpeed } = await import('../src/island/p1/ticker');
    expect(newsSpeed(true, 99) / newsSpeed(true, 0)).toBeCloseTo(1.6, 5);
    const r = src('report.ts');
    expect(r).toContain("let trendView: 'sales' | 'both' | 'cash' = 'sales';");
    expect(r).toContain("sales: btn(t('売上', 'Sales')");
    expect(r).toContain("both: btn(t('売上と利益', 'Sales & profit')");
  });
  it('C-9：scm 段の intro は 1 枚。「SCM」は初出だけ併記。「研究ポイント（RP）」「G（この世界のお金）」', async () => {
    const { TUT } = await import('../src/island/p1/tut');
    const { RP_LINE } = await import('../src/island/p1/mine');
    const scm = TUT.find((x) => x.id === 'scm')!;
    expect(scm.intro?.pages).toHaveLength(1);
    expect(scm.intro?.pages[0].text).toContain('[[サプライチェーン]]（SCM）');
    expect(RP_LINE(30)).toContain('[[研究ポイント]]（RP）');
    expect(TUT.find((x) => x.id === 'mats')?.tips?.buy?.(newState())).toContain('G（この世界のお金）');
    // 画面の文から「SCM ダッシュボード」は消えた（残るのは「サプライチェーン（SCM）」の併記だけ）
    for (const f of ['tut.ts', 'scm.ts', 'report.ts', 'main.ts', 'cardui.ts', 'landui.ts', 'brief.ts']) expect(src(f).split('\n').filter((l) => l.includes("t('") || l.includes('t(`')).join('\n'), f).not.toContain('SCM ダッシュボード');
  });
  it('C-10：宣伝の一覧に「元が取れる月商の目安」（adGain が 0 になる売上の逆算。数字は変えない）', async () => {
    const { adBreakeven, adGain } = await import('../src/island/p1/moves');
    const { ADS } = await import('../src/island/p1/data');
    const { newP1, build, allowedDirs, syncShop } = await import('../src/island/p1/model');
    const s = newP1(1);
    s.tut = 99;
    s.money = 1e6;
    expect(adBreakeven(s, ADS[0].id)).toBeNull();
    const lot = (id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] => {
      for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) {
        const d = allowedDirs(s, id, i, j);
        if (d.length) return [i, j, d[0]];
      }
      throw new Error('no lot');
    };
    build(s, 'workshop', ...lot('workshop'));
    const b = build(s, 'general_store', ...lot('general_store'));
    (b as { left: number }).left = 0;
    syncShop(s, b as never);
    const be = adBreakeven(s, ADS[0].id)!;
    expect(be).not.toBeNull();
    expect(be.need).toBeGreaterThan(0);
    expect(be.need! % 100).toBe(0);
    expect(be.now).toBeGreaterThanOrEqual(0);
    // 目安より売上が小さければ見込みは赤字（adGain ≤ 0）
    if (be.now < be.need! - 100) expect(adGain(s, ADS[0].id)).toBeLessThanOrEqual(0);
    // 売上がまだ無い町でも目安は出る（伸びは宣伝の +N% で見る）。売上があって伸びが 0（重ね掛けの上限）なら need は null（画面は「いまは売上が伸びない」）
    const m = src('moves.ts');
    expect(m).toContain('const r = base > 0 ? (on - base) / base : ad.boost;');
    expect(m).toContain('if (!(k > 0)) return { need: null, now: Math.round(base) };');
    expect(src('screens.ts')).toContain('いまは売上が伸びない');
    expect(src('screens.ts')).toContain('元が取れる月商の目安 ${money(be.need)}〜');
  });
  it('C-11：たまった知らせが無いとき、待機の文ではなく一覧（hist）の見出しを古い順に繰り返し流す。一覧が空なら「ニュースはまだありません」', async () => {
    const { replayPick, NEWS_LIST } = await import('../src/island/p1/ticker');
    expect(replayPick([], 0).text).toBe('ニュースはまだありません');
    expect(replayPick([], 7).text).toBe('ニュースはまだありません');
    const hist = [{ text: 'c', n: 1, when: '', kind: 'hr' as const }, { text: 'b', n: 1, when: '' }, { text: 'a', n: 1, when: '' }];
    expect([0, 1, 2, 3, 4].map((k) => replayPick(hist, k).text)).toEqual(['a', 'b', 'c', 'a', 'b']);
    expect(replayPick(hist, 2).kind).toBe('hr');
    // 最近の NEWS_LIST 件だけ
    const many = Array.from({ length: NEWS_LIST + 5 }, (_, k) => ({ text: `n${k}`, n: 1, when: '' }));
    expect(replayPick(many, 0).text).toBe(`n${NEWS_LIST - 1}`);
    const tk = src('ticker.ts');
    expect(tk).not.toContain('▸ 最近のニュース ${');
    expect(tk).not.toContain('isl-news-idle');
    expect(tk).toContain('if (!tail || tail.x + tail.w + GAP <= tw) spawn();');
  });
});

function newState() {
  return { proc: { bought: 0 } } as never;
}
