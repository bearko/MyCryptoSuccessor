// 段 UIX3d：決める場面の新しい画面（提案のカード・提案書・経営会議・方針・部長との対話・任せる。方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md）。
// 入のときだけ新しい画面に分かれること・今の目印が残ること・出す中身が今の画面とそろうこと・主役のキーが前の層に出ること・
// 動きを減らすと全部すぐ出ること。
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { uxdDeps, cardView } from '../src/island/p1/uxd';
import { uxsDeps } from '../src/island/p1/uxs';
import { newP1 } from '../src/island/p1/model';
import { choiceText } from '../src/island/p1/card';
import { uxd } from '../src/island/uix/screens/d-slots';
import { CLOSE_MS, PAGE_MS } from '../src/island/uix/screens/proposal';
import { FLOW, NEXT_MS } from '../src/island/uix/screens/board';

const src = (f: string) => readFileSync(new URL(`../src/island/${f}`, import.meta.url), 'utf8');
export const D_FILES = ['card.ts', 'proposal.ts', 'board.ts', 'd-kit.ts', 'd-boot.ts', 'd-deps.ts', 'd-slots.ts'];
export const D_CSS = ['d-card.css', 'd-prop.css', 'd-board.css'];
const noComment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

afterEach(() => {
  for (const k of Object.keys(uxd)) delete (uxd as Record<string, unknown>)[k];
});

describe('切り替え：入のときだけ新しい画面に分かれる（切のときは今の画面のまま）', () => {
  it('差し込み口は、はじめは空。入れ物は uix/hooks.ts・中身を入れるのは d-boot.ts（s-boot.ts の install から 1 行で呼ぶ）', () => {
    expect(Object.keys(uxd)).toEqual([]);
    expect(src('uix/screens/d-slots.ts').match(/^import (?!type )/gm)).toBeNull();
    expect(src('uix/screens/d-slots.ts')).toContain("export { uxdSlots as uxd } from '../hooks';");
    expect(src('uix/hooks.ts')).toContain('export const uxdSlots: UxdScreens = {};');
    expect(src('uix/screens/s-boot.ts')).toContain('installD(d.d);');
    expect(src('p1/uxs.ts')).toContain('d: uxdDeps,');
    expect(uxsDeps.d).toBe(uxdDeps);
  });
  it('本体の入口は、差し込み口が空なら今の画面（入口ごとの 1 行の分かれ道）', () => {
    const c = src('p1/cardui.ts');
    expect(c).toContain('m.append(uxd.cardPanel ? uxd.cardPanel(ctx, c, { close, quiet }) : panel(ctx, s, c, close, quiet));');
    expect(c).toContain('if (uxd.inbox) return uxd.inbox(ctx);');
    expect(c).toContain('if (uxd.gone) return uxd.gone(s);');
    expect(c).toContain('if (uxd.issues) return uxd.issues(s);');
    // 今のカードのボタンも、切り出した同じ処理（cardChoose）を呼ぶ
    expect(c).toContain("b.addEventListener('click', () => cardChoose(ctx, s, c, k, isRec, x.label, close, quiet, () => delegOn));");
  });
  it('新しい画面の束は、本体のモジュールを自分では読まない（型だけ）。関数は p1/uxd.ts から渡す', () => {
    for (const f of D_FILES) {
      const code = src(`uix/screens/${f}`);
      expect(code, f).not.toMatch(/from '\.\/(micons|mhooks|mapui|hud|pop|dock)'/);
      for (const m of code.matchAll(/^import (type )?[^;]*? from '([^']+)';/gms)) {
        const outside = /^\.\.\/\.\.\//.test(m[2]);
        if (outside && !m[1]) expect(m[2], `${f}: ${m[0].slice(0, 60)}`).toBe('../../../i18n');
      }
      for (const m of code.matchAll(/\bQ\.([A-Za-z_]\w*)/g)) expect(Object.keys(uxdDeps), `${f}: Q.${m[1]}`).toContain(m[1]);
    }
  });
  it('新しい CSS は、すべて html.is-uxc の内側。class の接頭辞は uxd-。角は丸めない・字は 16px 以上・ぼかさない・層を残さない', () => {
    for (const f of D_CSS) {
      const css = noComment(src(`uix/screens/${f}`));
      const flat = css.replace(/@(media|supports)[^{]*\{/g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
      for (const m of flat.matchAll(/(^|\})\s*([^{}@]+)\{/g)) for (const sel of m[2].split(',')) if (sel.trim()) expect(sel.trim(), f).toMatch(/^html\.is-uxc[ .:]/);
      expect(css, f).not.toMatch(/border-radius\s*:\s*[1-9.]/);
      expect(css, f).not.toMatch(/backdrop-filter/);
      expect(css, f).not.toMatch(/filter\s*:\s*(blur|drop-shadow)/);
      for (const m of css.matchAll(/font-size:\s*([\d.]+)(px|rem)/g)) expect(Number(m[1]) * (m[2] === 'rem' ? 16 : 1), `${f}: ${m[0]}`).toBeGreaterThanOrEqual(16);
      for (const m of css.matchAll(/@keyframes\s+([\w-]+)/g)) expect(m[1], f).toMatch(/^uxd-/);
      for (const m of css.matchAll(/\.(ux[a-z]-[\w-]+)/g)) expect(m[1], f).toMatch(/^(uxd|uxp)-/);
      expect(css, f).not.toMatch(/\b(forwards|both)\b/);
      expect(css, f).not.toMatch(/will-change/);
    }
  });
});

describe('提案のカード：出す中身は今のカードと同じ', () => {
  const card = (s: ReturnType<typeof newP1>, choices: { act: { k: string }; cost: number; rp?: number }[]) => {
    s.cards ??= { inbox: [], mk: 0, popN: 0, heroes: [], last: {}, trust: [], seq: 0 } as never;
    const c = { id: 7, src: 'quit', kind: 'quit', hero: s.staff[0]?.hero ?? null, q: 0.8, dept: null, mk: 0, sector: s.sector ?? 'c1', day: s.day, issue: { k: 'quit', days: 30 }, choices, pop: true } as never;
    s.cards!.inbox.push(c);
    return c;
  };
  it('選択肢は今のボタンと同じ数・同じ字（並び：推奨を先に）', () => {
    const s = newP1(3);
    s.tut = 99;
    const c = card(s, [
      { act: { k: 'skip' }, cost: 0 },
      { act: { k: 'skip' }, cost: 0 },
    ]);
    const v = cardView(s, c);
    expect(v.choices.length).toBe(2);
    expect(v.choices.map((x) => x.label)).toEqual((c as { choices: never[] }).choices.map((ch) => choiceText(s, c, ch).label));
    expect(v.two).toBe(false);
    expect(v.id).toBe(7);
  });
  it('払えない手は「あと N G」（今の赤い理由と同じ額）', () => {
    const s = newP1(3);
    s.tut = 99;
    s.money = 1000;
    const c = card(s, [{ act: { k: 'skip' }, cost: 0 }, { act: { k: 'donate' }, cost: 5000 }]);
    const v = cardView(s, c);
    const x = v.choices.find((y) => y.cost === 5000)!;
    expect(x.shortG).toBe(4000);
    expect(x.why).toContain('4,000');
  });
  it('決めるキーは主のキー（前の層）・判は採用／見送り／保留／却下で色と言葉が替わる・提案書へ進む手は判を打たない', () => {
    const code = src('uix/screens/card.ts');
    expect(code).toMatch(/uxKey\(decLab, \(\) => go\(\), \{ kind: 'main'/);
    expect(code).toContain("if (ch.act === 'skip') return { text: t('見送り', 'Passed'), kind: 'dark' };");
    expect(code).toContain("return { text: t('採用', 'Adopted'), kind: 'good' };");
    expect(code).toMatch(/if \(r\.ch\?\.goProp\) \{[^}]*Q\.cardChoose/);
  });
  it('動きを減らすと、判を待たずにすぐ決まる・印字はすぐ全部出る（土台の uxpPrint）', () => {
    const code = src('uix/screens/card.ts');
    expect(code).toContain('later(isCalm() ? 0 : 420');
    expect(code).toContain('uxpPrint(lines');
  });
});

describe('提案書：投影される資料・最後の 1 枚で承認のレバー', () => {
  const P = src('p1/proposalui.ts');
  const U = src('uix/screens/proposal.ts');
  it('入口は 1 行の分かれ道（方針を聞くのは今のまま先に）。中身は今の画面と同じ propModel・propSlides', () => {
    const i = P.indexOf('if (askDue(s)) return openPolicyPick');
    const j = P.indexOf('if (uxd.proposal) return uxd.proposal(ctx, plan, o);');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(P).toContain('const M = propModel(ctx, plan, o);');
    expect(P).toContain('const slides = propSlides(ctx, plan, o, M, SLIDE_KIT,');
    expect(U).toContain('Q.propModel(ctx, plan, o)');
    expect(U).toContain('Q.propSlides(ctx, plan, o, M, KIT,');
  });
  it('KPI は桁の回る数字の札・12 か月の累計は縦の棒（今の目印 isl-sl-kpi・data-kpi・isl-sl-lab を残す）', () => {
    expect(U).toContain("x.el.classList.add('isl-sl-kpi');");
    expect(U).toContain("x.el.querySelector('.uxd-tile-k')?.classList.add('isl-sl-lab');");
    expect(U).toContain('const KIT: SlideKit = { kpiTile: kpiTileUx, lineChart: lineBars };');
    expect(U).not.toMatch(/<path|polyline/);
  });
  it('送りは 600ms（見本の報告と同じ）・承認はレバー（主役・前の層）。承認の処理は今と同じ（o.approve か applyPlan → after → お知らせ → done("ok")）', () => {
    expect(PAGE_MS).toBe(600);
    expect(CLOSE_MS).toBeGreaterThanOrEqual(500);
    expect(U).toContain('const lever = uxLever({');
    expect(U).toContain("can: () => !DC.block.length && !engaged");
    expect(U).toMatch(/o\.approve \?\? \(\(p: Plan\) => Q\.applyPlan\(ctx\.s\(\), p\)\)/);
    expect(U).toContain("close('ok');");
    expect(U).toContain("kind: 'main', big: true, ico: 'next', cls: 'uxd-prop-next'");
  });
  it('動きを減らすと、ページはすぐ替わり・判のあとすぐ閉じる', () => {
    expect(U).toContain('if (!isCalm()) {');
    expect(U).toContain('later(isCalm() ? 60 : CLOSE_MS');
  });
});

describe('経営会議：議題 → 意見 → 決議の帯・出席者の札・決議の判', () => {
  const O = src('p1/boardui.ts');
  const U = src('uix/screens/board.ts');
  it('入口は 1 行の分かれ道（議題が無ければ今と同じく何もしない）', () => {
    const i = O.indexOf('if (!A || !A.items.some((x) => !x.done)) return false;');
    expect(O.indexOf('if (uxd.board) return uxd.board(ctx, hooks);')).toBeGreaterThan(i);
    expect(U).toContain('if (!A || !A.items.some((x) => !x.done)) return false;');
  });
  it('決める処理は今と同じ関数（decide・boardFinish・boardSummary）を同じ引数で。差し込みの場面（方針発表会）も同じ口で描く', () => {
    expect(U).toContain('B.decide(s, it, pick);');
    expect(U).toContain("B.boardFinish(s, 'bulk');");
    expect(U).toContain("B.boardFinish(s, how);");
    expect(U).toContain("B.boardFinish(s, 'one');");
    expect(U).toMatch(/xs\[i\]\.run\(\s*ctx,\s*A!,\s*panel,/);
    // 今の目印（席・会議室）：差し込みの場面が席の反応と演出の置き場所に使う
    expect(U).toContain('div.uxd-bd-seat.isl-bm-seat');
    expect(U).toContain('div.uxd-bd-seats.isl-bm-room');
    expect(U).toContain('div.uxd-bd.isl-bm.ux-plate');
  });
  it('流れは 3 段・判から次の話し手までは今と同じ長さ・決めるキーは主のキー（前の層）', () => {
    expect([...FLOW]).toEqual(['agenda', 'talk', 'result']);
    expect(NEXT_MS).toBe(900);
    expect(U).toMatch(/uxKey\(t\('判を押す', 'Stamp it'\), \(\) => stamp\(it, pick, card\), \{ kind: 'main'/);
    expect(U).toMatch(/uxKey\(t\('会議を始める', 'Start'\), \(\) => scenes\(0\), \{\s*kind: 'main'/);
  });
  it('演出なし・動きを減らすときは、待ち時間を短く（今と同じ 260ms）', () => {
    expect(U).toContain("const still = () => B.fxLevel() === 'off' || isCalm();");
    expect(U).toContain('later(quick ? 260 : NEXT_MS');
  });
});
