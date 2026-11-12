// 段 UIX3a：画面の部品（uxp-）・土台の直し・共通の器と 1 か月目に通る画面（会話・選ぶ引き出し・チュートリアル ほか）。
// 入のときだけ分かれること・今の目印が残ること・出す中身が今の画面とそろうこと・主役のキーが前の層に出ること・動きを減らすと全部すぐ出ること。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FRONT_SEL } from '../src/island/uix/front';
import { KEY_ATTR, SWALLOW_MS, SWALLOW_PX, swallowHit } from '../src/island/uix/parts';
import { UXP_DRAWER_IN_MS, UXP_DRAWER_OUT_MS, UXP_STAMP_MS, UXP_TAB_MS, uxpGapRatio, uxpGapText, uxpNiceMax, uxpShort } from '../src/island/uix/sparts';

const src = (f: string) => readFileSync(new URL(`../src/island/${f}`, import.meta.url), 'utf8');
const noComment = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
/** CSS のセレクタを全部取り出す（@keyframes の中は除く） */
function selectors(css: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inKeyframes = -1;
  let buf = '';
  for (const ch of noComment(css)) {
    if (ch === '{') {
      const sel = buf.trim();
      if (sel.startsWith('@keyframes')) inKeyframes = depth;
      else if (!sel.startsWith('@') && inKeyframes < 0) out.push(...sel.split(/,(?![^(]*\))/).map((x) => x.trim()));
      depth++;
      buf = '';
    } else if (ch === '}') {
      depth--;
      if (inKeyframes >= 0 && depth <= inKeyframes) inKeyframes = -1;
      buf = '';
    } else if (ch === ';') buf = '';
    else buf += ch;
  }
  return out;
}
/** この段の CSS（どれも入のときだけ読む） */
const MY_CSS = ['uix/sparts.css'];

describe('画面の部品（uxp-）', () => {
  const TS = src('uix/sparts.ts');
  it('共通で使う部品が全部ある', () => {
    for (const name of ['uxpHead', 'uxpRow', 'uxpStat', 'uxpTabs', 'uxpCard', 'uxpSelect', 'uxpGap', 'uxpEmpty', 'uxpDrawer', 'uxpPaper', 'uxpPrint', 'uxpBars', 'uxpRank', 'uxpFace', 'uxpHero', 'uxpDot', 'uxpFoot', 'uxpStamp', 'uxpSeg', 'uxpNum', 'uxpPrice'])
      expect(TS, name).toMatch(new RegExp(`export function ${name}\\b`));
  });
  it('本体（p1/）は読まない（絵は呼ぶ側が渡す）。CSS は土台といっしょに、入のときだけ読む', () => {
    for (const m of TS.matchAll(/^import [^;]*? from '([^']+)';/gms)) expect(m[1]).toMatch(/^(\.\/|\.\.\/\.\.\/i18n$)/);
    expect(src('uix/boot.ts')).toContain("import './sparts.css';");
    // 見本帳に並べてある
    expect(src('uix/kit.ts')).toContain("sec('sparts'");
  });
  it('CSS のセレクタは、すべて .is-uxc の内側。class は uxp-。角は丸めない。字は 16px（1rem）から', () => {
    for (const f of MY_CSS) {
      const css = noComment(src(f));
      const sels = selectors(css);
      expect(sels.filter((s) => !/^html\.is-uxc/.test(s)), f).toEqual([]);
      expect([...css.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim()).filter((v) => !/^0( !important)?$/.test(v)), f).toEqual([]);
      expect([...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])).filter((v) => v < 16), f).toEqual([]);
      expect([...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)rem/g)].map((m) => Number(m[1])).filter((v) => v < 1), f).toEqual([]);
      // 動かすのは transform と opacity
      for (const m of css.matchAll(/transition:\s*([^;]+);/g)) for (const part of m[1].split(/,(?![^(]*\))/)) expect(part.trim(), f).toMatch(/^(transform|opacity|translate)\b/);
    }
    const mine = selectors(src('uix/sparts.css')).flatMap((s) => [...s.matchAll(/\.(uxp-[\w-]+)/g)].map((m) => m[1]));
    expect(mine.length).toBeGreaterThan(80);
    // いまの CSS の class とぶつからない
    const old = src('p1/p1.css') + src('island.css');
    for (const c of new Set(mine)) expect(old.includes(`.${c}`), c).toBe(false);
  });
  it('動きの長さ：タブ 520ms・引き出しの出入り 260／180ms・札が打たれるまで 420ms', () => {
    expect(UXP_TAB_MS).toBe(520);
    expect(UXP_DRAWER_IN_MS).toBeGreaterThanOrEqual(180);
    expect(UXP_DRAWER_IN_MS).toBeLessThanOrEqual(260);
    expect(UXP_DRAWER_OUT_MS).toBeGreaterThanOrEqual(180);
    expect(UXP_DRAWER_OUT_MS).toBeLessThanOrEqual(260);
    expect(UXP_STAMP_MS).toBe(420);
    const css = src('uix/sparts.css');
    expect(css).toMatch(/uxp-drawer-in 260ms steps\(7, end\)/);
    expect(css).toMatch(/uxp-drawer-out 180ms steps\(4, end\)/);
  });
  it('「あと N G」：足りないときだけ言葉が出る。目盛りは 1/20 刻みで、少しは点ける', () => {
    expect(uxpGapText(3000, 3000)).toBeNull();
    expect(uxpGapText(5000, 3000)).toBeNull();
    expect(uxpGapText(1800, 3000)).toMatch(/1,200 G/);
    expect(uxpGapText(2999.2, 3000)).toMatch(/\b1 G/);
    expect(uxpGapRatio(0, 3000)).toBe(0.05);
    expect(uxpGapRatio(1800, 3000)).toBe(0.6);
    expect(uxpGapRatio(2990, 3000)).toBe(1);
    expect(uxpGapRatio(-500, 3000)).toBe(0.05);
  });
  it('縦の棒：上限はきりのよい数。棒の上の数は短く', () => {
    expect([0, 7, 12, 180, 268400].map(uxpNiceMax)).toEqual([1, 10, 20, 200, 500000]);
    expect(uxpShort(9800)).toBe('9,800');
    expect(uxpShort(121000)).toMatch(/^12\.1/);
    expect(uxpShort(-54000)).toMatch(/^-5\.4/);
  });
  it('選ぶ引き出し：今の目印（.isl-picker）を付ける。決めるキーは主のキー（前の層）で、選ぶまで平ら', () => {
    expect(TS).toMatch(/el\(`div\.isl-picker\.uxp-drawer\.ux-root/);
    expect(TS).toMatch(/kind: 'main', big: true[^}]*cls: 'uxp-decide'[^}]*disabled: true/);
    expect(FRONT_SEL).toContain('.ux-key--main');
    // 動きを減らすときは、しまう動きを待たずに消す
    expect(TS).toMatch(/if \(isCalm\(\) \|\| !e\.isConnected\) return done\(\);/);
  });
  it('動きを減らす：印字は全部すぐ出る。棒は伸びきった形。タブはすぐ替わる', () => {
    expect(TS).toMatch(/if \(isCalm\(\)\) finish\(\);/);
    expect(TS).toMatch(/if \(instant \|\| isCalm\(\) \|\| typeof to\.animate !== 'function'\)/);
    expect(noComment(src('uix/sparts.css'))).toMatch(/html\.is-uxc\.is-calm \.uxp-bar \{\s*transform: scaleY\(1\);/);
  });
});

describe('土台の直し', () => {
  it('press()：指を離した瞬間に動くので、続く click を 1 回だけ呑む（同じ場所に来たものだけ）', () => {
    expect(SWALLOW_MS).toBe(400);
    // 押した所の近くに来た click は呑む
    expect(swallowHit(100, 200, 100, 200, 1)).toBe(true);
    expect(swallowHit(100, 200, 100 + SWALLOW_PX, 200 - SWALLOW_PX, 1)).toBe(true);
    // 別の所を押した click・場所の無い click（読み上げ・コードから）は通す
    expect(swallowHit(100, 200, 100 + SWALLOW_PX + 1, 200, 1)).toBe(false);
    expect(swallowHit(100, 200, 300, 600, 1)).toBe(false);
    expect(swallowHit(100, 200, 100, 200, 0)).toBe(false);
    const parts = src('uix/parts.ts');
    expect(parts).toMatch(/if \(hit && isDown\) swallowClick\(e\.clientX, e\.clientY\);\s*up\(hit\);/);
  });
  it('キーの初期化と手応えは、class の接頭辞に関係なく効く（press() を通したキーの目印 data-ux-key）', () => {
    expect(KEY_ATTR).toBe('data-ux-key');
    expect(src('uix/parts.ts')).toContain("b.setAttribute(KEY_ATTR, '');");
    expect(src('uix/base.css')).toMatch(/button\[class\*=' ux-'\], button\[data-ux-key\]/);
    expect(src('uix/legacy.ts')).toMatch(/b\.hasAttribute\(KEY_ATTR\)/);
    expect(src('uix/legacy.css')).toMatch(/button\.is-ux-down:not\(\.isl-btn\):not\(\[class\*='ux-'\]\):not\(\[data-ux-key\]\)/);
  });
});
