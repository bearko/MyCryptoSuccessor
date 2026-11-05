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
    expect(m).toContain('⏸ 計画中 — ▶ で ${d.month} 月へ');
  });
  it('A-2：懐中時計は画面・吹き出し・メニューを開いていても隠さない（窓・案内・建てるモードのあいだだけ）', () => {
    const m = src('main.ts');
    const line = m.split('\n').find((l) => l.startsWith('const nextShown = '))!;
    expect(line).toContain('s.monthPause');
    expect(line).not.toContain('sheetOpen()');
    expect(line).not.toContain('!menu');
    expect(line).not.toContain('!pop');
    expect(line).toContain('.isl-modal:not(.has-focus)');
    expect(src('p1.css')).toContain('#isl-ui:has(.isl-sheet) .isl-next-month');
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
