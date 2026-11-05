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
    expect(m).toContain("b.title = `${d.name}：${subs.map((x) => x.name).join(t('・', ' · '))}`;");
    expect(m).toContain("h('small', 'isl-tab-sub', tabHint(subs.map((x) => x.short)))");
  });
});
