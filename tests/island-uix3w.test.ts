// 段 UIX3w：世界の場面（町の制覇・ランドマップと進出・発掘）の新しい画面（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md）。
// 入のときだけ新しい画面に分かれること・今の目印が残ること・出す中身が今の画面とそろうこと・主役のキーが前の層に出ること・
// 動きを減らすと全部すぐ出ること。
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uxsDeps } from '../src/island/p1/uxs';
import { uxwDeps } from '../src/island/p1/uxw';
import { FRONT_SEL } from '../src/island/uix/front';
import { CUT_CALM_MS, CUT_MS, CUT_OUT_MS, ROLL_MS, bare, barWait, cutCore, letterKind, nameParts, plainSay, rpDigits, sayParts } from '../src/island/uix/screens/conquer';
import { uxw } from '../src/island/uix/screens/w-slots';

const src = (f: string) => readFileSync(new URL(`../src/island/${f}`, import.meta.url), 'utf8');
const MAIN = src('p1/main.ts');
const CQ = src('uix/screens/conquer.ts');
const FILES = ['conquer.ts', 'w-boot.ts', 'w-deps.ts', 'w-slots.ts'];
const CSS_FILES = ['conquer.css'];
const CSS = CSS_FILES.map((f) => [f, src(`uix/screens/${f}`).replace(/\/\*[\s\S]*?\*\//g, '')] as const);

afterEach(() => {
  for (const k of Object.keys(uxw)) delete (uxw as Record<string, unknown>)[k];
});

describe('切り替え：入のときだけ新しい画面に分かれる（切のときは今の画面のまま）', () => {
  it('差し込み口は、はじめは空。中身を入れるのは w-boot.ts（s-boot.ts の install から 1 行で呼ぶ）', () => {
    expect(Object.keys(uxw)).toEqual([]);
    expect(src('uix/screens/w-slots.ts').match(/^import (?!type )/gm)).toBeNull();
    expect(src('uix/screens/s-boot.ts')).toContain('installW(d.w);');
    expect(src('p1/uxs.ts')).toContain('w: uxwDeps,');
    expect(uxsDeps.w).toBe(uxwDeps);
    const boot = src('uix/screens/w-boot.ts');
    for (const k of ['letter', 'cheer']) expect(boot).toContain(`uxw.${k} = `);
    // 本体から新しい画面を直接読んでいる所は無い（読んでよいのは、空の差し込み口だけ）
    for (const f of ['p1/main.ts', 'p1/landui.ts', 'p1/digui.ts', 'p1/uxw.ts']) expect(src(f), f).not.toMatch(/from '\.\.\/uix\/screens\/(?!s-slots'|w-slots'|mhooks')/);
  });
  it('新しい画面の束は、本体のモジュールを自分では読まない（型だけ）。関数は p1/uxw.ts から渡す', () => {
    for (const f of FILES) {
      const code = src(`uix/screens/${f}`);
      for (const m of code.matchAll(/^import (type )?[^;]*? from '([^']+)';/gms)) {
        const outside = /^\.\.\/\.\.\//.test(m[2]);
        if (outside && !m[1]) expect(m[2], `${f}: ${m[0].slice(0, 60)}`).toBe('../../../i18n');
      }
      for (const m of code.matchAll(/\bW\.([A-Za-z_]\w*)/g)) expect(Object.keys(uxwDeps), `${f}: W.${m[1]}`).toContain(m[1]);
    }
  });
  it('新しい CSS は、すべて html.is-uxc の内側。class の接頭辞は uxw-。角は丸めない', () => {
    for (const [f, css] of CSS) {
      const flat = css.replace(/@(media|supports)[^{]*\{/g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
      for (const m of flat.matchAll(/(^|\})\s*([^{}@]+)\{/g)) for (const sel of m[2].split(',')) if (sel.trim()) expect(sel.trim(), f).toMatch(/^html\.is-uxc[ .:]/);
      expect(css, f).not.toMatch(/border-radius\s*:\s*(?!0)/);
      expect(css, f).not.toMatch(/backdrop-filter/);
      // 字は 16px（1rem）以上
      for (const m of css.matchAll(/font-size:\s*([\d.]+)(px|rem)/g)) expect(Number(m[1]) * (m[2] === 'rem' ? 16 : 1), `${f}: ${m[0]}`).toBeGreaterThanOrEqual(16);
      for (const m of css.matchAll(/@keyframes\s+([\w-]+)/g)) expect(m[1], f).toMatch(/^uxw-/);
    }
  });
});

describe('町の制覇・研究成果の発表・調査依頼状', () => {
  it('入口：showLetter・clearModal・ランド制覇のお祝いが、差し込み口が入っているときだけ新しい画面へ渡す', () => {
    expect(MAIN).toContain('if (uxw.letter) {');
    expect(MAIN).toMatch(/if \(uxw\.cheer\) return uxw\.cheer\(\{ host: root, kind: 'clear'/);
    expect(MAIN).toMatch(/if \(uxw\.cheer\) uxw\.cheer\(\{ host: root, kind: 'land'/);
    // 切のときの窓（今の modal()）は、そのまま残っている
    expect(MAIN).toContain('modal(title, body, acts, true);');
    // 音は今のまま（入のとき、制覇は小太鼓 → 一撃 → 祝いの曲）
    expect(MAIN).toContain("if (conquered && uxOn()) uxSfx('conquest');");
  });
  it('出す中身が今の窓とそろう：依頼状の絵と名前・差出人・研究ポイント・制覇の 2 条件・ひと言・今の選択肢・今の花火', () => {
    for (const k of ['letterName:', 'letterIcon:', 'from:', 'rp,', 'conds:', 'say: presentAfter(', 'actions: acts', 'fx: () => letterFx(conquered)', 'town:']) expect(MAIN, k).toContain(k);
    for (const k of ['v.letterName', 'v.letterIcon', 'v.from', 'v.rp', 'v.conds', 'v.say', 'v.actions', 'v.fx()', 'v.town', 'v.hero']) expect(CQ, k).toContain(k);
    // 初めての制覇のお祝いへ続く流れ（then）は、今のまま選択肢に入っている
    expect(MAIN).toMatch(/const acts: UxwAct\[\] = letter === 'U'[^\n]*then\(\(\) => openLand\(ctx\)\)/);
  });
  it('今の目印：窓は .isl-modal.is-letter（開いているあいだ時間が止まる・ほかの案内が重ならない）', () => {
    expect(CQ).toContain('el(`div.isl-modal.ux-root.uxw-cq${cls}`)');
    expect(CQ).toContain("shell('.is-letter')");
    expect(MAIN).toContain("!!root.querySelector('.isl-modal')");
  });
  it('場面の種類：制覇（カットインあり）／調査依頼状／発表だけ', () => {
    expect(letterKind({ conquered: true, letter: 'U' })).toBe('conquest');
    expect(letterKind({ conquered: true, letter: null })).toBe('conquest');
    expect(letterKind({ conquered: false, letter: 'R' })).toBe('letter');
    expect(letterKind({ conquered: false, letter: null })).toBe('present');
  });
  it('カットインは、祝いの曲が始まる小節の頭に合わせる（先読みに間に合わなければ、次の小節）', () => {
    const beat = 60000 / 116;
    expect(barWait(null)).toBe(ROLL_MS);
    expect(barWait({ beat: 0, frac: 0 })).toBe(Math.round(beat * 4));
    expect(barWait({ beat: 2, frac: 0.5 })).toBe(Math.round(beat * 1.5));
    // 小節の頭まで 0.5 秒を切っていたら、もう 1 小節待つ
    expect(barWait({ beat: 3, frac: 0.5 })).toBe(Math.round(beat * 4.5));
    // 待ちは、長くても 2 小節半（約 2.6 秒）まで
    for (let b = 0; b < 4; b++) for (let f = 0; f < 1; f += 0.1) expect(barWait({ beat: b, frac: f })).toBeLessThanOrEqual(Math.round(beat * 5));
    // 決めの演出は 2〜3 秒（見本の値）
    expect([CUT_MS, CUT_CALM_MS, CUT_OUT_MS]).toEqual([2600, 1800, 220]);
  });
  it('場面の進み：判定 → カットイン → 札。押すと、どの段からでも札へ飛ぶ。札は 1 回だけ', () => {
    const log: string[] = [];
    const ev = { pre: () => log.push('pre'), cut: () => log.push('cut'), card: () => log.push('card') };
    const a = cutCore('conquest', ev);
    a.start();
    a.end(); // まだ判定の途中：何も起きない
    a.bar();
    a.bar();
    a.end();
    a.skip();
    a.end();
    expect(log).toEqual(['pre', 'cut', 'card']);
    log.length = 0;
    const b = cutCore('conquest', ev);
    b.start();
    b.skip();
    b.bar();
    b.end();
    expect(log).toEqual(['pre', 'card']);
    log.length = 0;
    const c = cutCore('conquest', ev);
    c.start();
    c.bar();
    c.skip();
    expect(log).toEqual(['pre', 'cut', 'card']);
    // 制覇でない発表は、はじめから札
    log.length = 0;
    cutCore('letter', ev).start();
    cutCore('present', ev).start();
    expect(log).toEqual(['card', 'card']);
  });
  it('文：絵文字は外す（✔ は言葉に）。[[ ]] の強調は、1 字ずつ出すあいだは外し、出しきったら色で付ける', () => {
    expect(bare('👑 研究成果を発表して制覇！')).toBe('研究成果を発表して制覇！');
    expect(bare('2 か月続けて 1 位 ✔')).toMatch(/^2 か月続けて 1 位 (済|done)$/);
    expect(plainSay('[[制覇]]おめでとう！')).toBe('制覇おめでとう！');
    expect(sayParts('[[制覇]]おめでとう！ [[関所]]へ')).toEqual([
      ['制覇', true],
      ['おめでとう！ ', false],
      ['関所', true],
      ['へ', false],
    ]);
    expect(nameParts('Uncommon の調査依頼状')).toEqual(['Uncommon', 'の調査依頼状']);
    expect(nameParts('調査依頼状')).toEqual(['調査依頼状']);
    expect([rpDigits(5), rpDigits(120), rpDigits(12345)]).toEqual([2, 3, 5]);
  });
  it('主役のキーは 1 つだけ主のキー（前の層に出る）。押すと、窓を閉じてから今の動き。続く click は呑む', () => {
    expect(FRONT_SEL).toContain('.ux-key--main');
    expect(CQ).toContain("k === main ? { kind: 'main', big: true, strong: true } : {}");
    expect(CQ).toMatch(/safe\(\(\) => \{\s*close\(\);\s*fn\(\);\s*\}\)/);
    const spy = vi.fn();
    uxw.letter = spy;
    expect(spy).not.toHaveBeenCalled();
  });
  it('動きを減らす：判定のランプは全部点き、火花と揺れは出さず、数字とひと言はすぐ出る（部品の決まり）', () => {
    expect(CQ).toContain('if (!isCalm()) {');
    expect(CQ).toContain('isCalm() ? CUT_CALM_MS : CUT_MS');
    expect(CQ).toContain('if (cut.isConnected && !isCalm())');
    expect(CQ).toMatch(/if \(isCalm\(\)\) \{\s*lamps\.forEach\(\(l\) => l\.classList\.add\('is-on'\)\);/);
  });
  it('音：見本と同じ（制覇の音は本体が鳴らす）。札・ランプ・数え上げ・飛ばす・閉じる', () => {
    for (const k of ["uxSfx('flap')", "uxSfx('lamp', { step: i })", "uxSfx('coin')", "uxSfx('close')", "uxSfx('rankup')", "'open' : 'clunk'"]) expect(CQ, k).toContain(k);
    expect(CQ).toContain('barWait(uxMusic())');
  });
});
