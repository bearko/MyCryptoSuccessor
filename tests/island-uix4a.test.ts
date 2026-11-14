// 段 UIX4a：新しい画面の土台の直し（既定を入にする前に。docs/ISLAND_UIX.md）。
// 重さ（層を残さない・上掛けの canvas を隠す・同じ値の書き直しで見張りを動かさない・走査線の帯）／絵の名前の口（どの段の絵の表でも引ける・知らない名前は開発のときだけ警告）／
// 絵文字の表を 1 つに／まとめた画面で中身が空にならない・下に貼りつく帯／お知らせの位置／本番の束の分かれ方を守る仕組み
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMOJI_DOT, UX_ICONS, artOf, hasIcon, unknownIcon, uxArt } from '../src/island/uix/icons';
import { M_ICONS } from '../src/island/uix/screens/micons';
import { S_ICONS } from '../src/island/uix/screens/s-icons';
import { W_ICONS } from '../src/island/uix/screens/w-icons';
import { B_ICONS } from '../src/island/uix/screens/b-icons';
import { K_EMOJI, K_ICONS } from '../src/island/uix/screens/k-icons';
import { H_ICONS } from '../src/island/uix/screens/h-icons';
import { EMOJI_ICO, changedRec } from '../src/island/uix/screens/c-dress';
import { toastClear } from '../src/island/uix/legacy';
// @ts-expect-error 型の無い .mjs（scripts/qa）
import { bare, cssMarks, FORBID, scan } from '../scripts/qa/off-bundle.mjs';

const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const noComment = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

afterEach(() => vi.restoreAllMocks());

describe('重さ：開いているあいだ、合成の層を残さない', () => {
  it('窓の中身・札の切り替えの入る動きは、fill を backwards まで（both・forwards で最後の形を当て続けない）', () => {
    const css = noComment(src('src/island/uix/legacy.css'));
    expect(css).toMatch(/\.isl-modal\.ux-modal:not\(\.ux-modal--disaster\) > \* \{\s*animation: ux-modal-in [^;]* backwards;/);
    expect(css).toMatch(/\.isl-sheet\.ux-swap \.isl-sheet-body \{\s*animation: ux-key-in [^;]* backwards;/);
  });
  it('縦の棒（.uxp-bar）に will-change を付けない', () => {
    const css = noComment(src('src/island/uix/sparts.css'));
    const bar = /html\.is-uxc \.uxp-bar \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(bar).toMatch(/transition: transform/);
    expect(bar).not.toMatch(/will-change/);
  });
  it('上掛けの canvas は、動かすものが無いあいだ隠す（画面いっぱいの透明な層を残さない）。幕の札は晴れたら字を消す', () => {
    const fx = src('src/island/uix/fx.ts');
    expect(fx).toMatch(/cv\.hidden = true;\s*document\.body\.append\(cv\)/);
    expect(fx).toMatch(/cv\.hidden = true;\s*off\?\.\(\);/);
    expect(fx).toMatch(/if \(cv\) cv\.hidden = false;/);
    expect(fx).toMatch(/lab\.textContent = '';/);
    expect(noComment(src('src/island/uix/parts.css'))).toMatch(/\.ux-wipe-label:empty \{ display: none; \}/);
  });
  it('前の層：画面の大きさは毎コマ読まない（resize のときだけ）', () => {
    const f = src('src/island/uix/front.ts');
    const sync = /export function syncFront[\s\S]*?\n\}/.exec(f)?.[0] ?? '';
    expect(sync).not.toMatch(/clientWidth|clientHeight/);
    expect(f).toMatch(/addEventListener\('resize', \(\) => \(vw = 0\)\)/);
  });
  it('着せ替えの見張りは、値の変わらない書き直し（hidden を同じ値で付け直す）では動かない', () => {
    const el = (v: string | null) => ({ getAttribute: () => v });
    expect(changedRec({ type: 'attributes', attributeName: 'hidden', oldValue: '', target: el('') })).toBe(false);
    expect(changedRec({ type: 'attributes', attributeName: 'hidden', oldValue: null, target: el('') })).toBe(true);
    expect(changedRec({ type: 'attributes', attributeName: 'class', oldValue: 'a', target: el('a is-hot') })).toBe(true);
    expect(changedRec({ type: 'childList', attributeName: null, oldValue: null, target: el(null) })).toBe(true);
    expect(src('src/island/uix/screens/c-dress.ts')).toMatch(/attributeOldValue: true/);
  });
  it('地図の印（町の長・荒れ地の印・困りごと・指さし）は、hidden を値が変わるときだけ書く', () => {
    const m = src('src/island/p1/main.ts');
    for (const v of ['meetEl', 'chiefEl', 'issueEl', 'pointEl']) {
      expect(m).toMatch(new RegExp(`setHidden\\(${v}, `));
      expect(m).not.toMatch(new RegExp(`^\\s+${v}\\.hidden = [^t]`, 'm'));
    }
  });
  it('走査線の流れる帯は、升目ごとにカクカク動く（steps。毎コマ全面の重ね直しをしない）。動きを減らす・重い端末では止まる', () => {
    const css = noComment(src('src/island/uix/parts.css'));
    const band = /html\.is-uxc \.ux-crt::after \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(band).toMatch(/animation: ux-roll [\d.]+s steps\(\d+, end\) infinite;/);
    const base = noComment(src('src/island/uix/base.css'));
    expect(base).toMatch(/html\.is-uxc\.is-calm \.ux-crt::after/);
    expect(base).toMatch(/html\.is-uxc\.is-lite \.ux-crt::after/);
  });
  it('スキルツリー：消えた雲（is-leaving）は、動きが終わったら外す（forwards のまま層を残さない）', () => {
    expect(src('src/island/uix/screens/tree.ts')).toMatch(/is-leaving[\s\S]{0,400}animationend/);
  });
});

describe('絵の名前の口：土台の部品の ico が、どの段の絵の表でも引ける', () => {
  it('段の絵の表は、読まれたときに登録される（上と下の帯・工房と報告・世界・事業・経営企画・人と管理）', () => {
    for (const names of [M_ICONS, S_ICONS, W_ICONS, B_ICONS, K_ICONS, H_ICONS]) for (const n of names) expect(hasIcon(n), n).toBe(true);
  });
  it('同じ名前は、土台 → 段の順（order）で決まる：読まれた順に寄らない', () => {
    const a = { zz9: ['a'] };
    const b = { zz9: ['b'] };
    uxArt(b, 99);
    uxArt(a, 98);
    expect(artOf('zz9')).toEqual(['a']);
    // 土台の名前は土台の絵のまま
    const t = { [UX_ICONS[0]]: ['x'] };
    uxArt(t, 0);
    expect(artOf(UX_ICONS[0])).not.toEqual(['x']);
  });
  it('知らない名前は、開発のときだけ 1 回警告する（本番のビルドでは import.meta.env.DEV が偽になり、出さない）', () => {
    const w = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(hasIcon('no-such-ico-4a')).toBe(false);
    expect(unknownIcon('no-such-ico-4a')).toBe(true);
    expect(unknownIcon('no-such-ico-4a')).toBe(false);
    expect(w).toHaveBeenCalledTimes(1);
    expect(src('src/island/uix/icons.ts')).toMatch(/if \(!import\.meta\.env\.DEV \|\| warned\.has\(name\)\) return false;/);
    expect(src('src/island/uix/icons.ts')).toMatch(/const art = artOf\(name\);\s*if \(!art\) unknownIcon\(name\);/);
  });
  it('土台の部品が使っている絵の名前（uxKey・uxpHead・uxpEmpty・uxpTabs・uxpDrawer ほかの決まった名前）は、どれも描ける', () => {
    const files = ['src/island/uix/parts.ts', 'src/island/uix/sparts.ts', 'src/island/uix/legacy.ts', 'src/island/uix/settings.ts'];
    for (const f of files) for (const m of src(f).matchAll(/uxIcon\('([\w-]+)'/g)) expect(hasIcon(m[1]), `${f}: ${m[1]}`).toBe(true);
  });
});

describe('絵文字 → ドットの絵：表は 1 つ（EMOJI_DOT）', () => {
  it('着せ替え（c-dress）は表そのもの・経営企画（k-icons）と地図の札（land）は、その上に自分の絵を重ねるだけ', () => {
    expect(EMOJI_ICO).toBe(EMOJI_DOT);
    for (const [e, n] of Object.entries(EMOJI_DOT)) if (!['🏆', '📜', '🔍', '📊', '📈', '🎯', '🎁', '💥'].includes(e)) expect(K_EMOJI[e], e).toBe(n);
    expect(K_EMOJI['🏆']).toBe('trophy');
    const land = src('src/island/uix/screens/land.ts');
    expect(land).toMatch(/const EMOJI_ICO: Record<string, string> = \{ \.\.\.EMOJI_DOT,/);
  });
  it('表の絵は、どれも描ける（土台か、登録した段の表に名前がある）', () => {
    for (const [e, n] of Object.entries(EMOJI_DOT)) expect(hasIcon(n), `${e} → ${n}`).toBe(true);
    for (const [e, n] of Object.entries(K_EMOJI)) expect(hasIcon(n), `${e} → ${n}`).toBe(true);
  });
  it('字として読める記号（▲▼★✓）は、全段の表に入れない（お知らせの字が絵に替わらない）', () => {
    for (const ch of ['▲', '▼', '★', '✓', '✦']) expect(EMOJI_DOT[ch]).toBeUndefined();
  });
});

describe('まとめた画面（openTogether）と下に貼りつく帯', () => {
  it('入のときは、部分の箱を先に画面へ入れてから描く（「画面に入っていなければ描かない」画面が空にならない）。切のときは今のまま', () => {
    const s = src('src/island/p1/screens.ts');
    const fn = /export function openTogether[\s\S]*?\n\}/.exec(s)?.[0] ?? '';
    expect(fn).toMatch(/const live = document\.documentElement\.classList\.contains\('is-uxc'\);/);
    expect(fn).toMatch(/if \(live\) body\.append\(sec\);\s*p\.render\(sec\);/);
    expect(fn).toMatch(/if \(!live\) body\.append\(jump, \.\.\.secs\);/);
  });
  it('まとめた画面の中では、決めるキーの帯（uxpFoot）は貼りつかせず、節の終わりに置く', () => {
    expect(noComment(src('src/island/uix/sparts.css'))).toMatch(/html\.is-uxc \.isl-together \.uxp-foot \{\s*position: relative;\s*bottom: auto;/);
  });
  it('部分（.isl-part）を左へ戻す回避は、土台で直したので事業の段の CSS から外した', () => {
    expect(noComment(src('src/island/uix/legacy.css'))).toMatch(/\.isl-together > \.isl-part/);
  });
});

describe('お知らせの位置：選ぶ引き出しの見出しに重ねない', () => {
  it('見出しにかかるときだけ、見出しのすぐ下へ', () => {
    const head = { top: 100, bottom: 150 };
    expect(toastClear(60, 44, head)).toBe(156);
    expect(toastClear(120, 44, head)).toBe(156);
    // かからない（見出しより上に収まる・見出しより下）
    expect(toastClear(40, 44, head)).toBe(40);
    expect(toastClear(200, 44, head)).toBe(200);
    // 高さが分からないときは 40px とみなす
    expect(toastClear(70, 0, head)).toBe(156);
  });
  it('引き出しが開いているときに、置き場所の口（ux.toastTop）が見出しを見る', () => {
    expect(src('src/island/uix/legacy.ts')).toMatch(/\.uxp-drawer:not\(\.is-out\) \.uxp-drawer-head/);
  });
});

describe('本番の束の分かれ方を守る（scripts/qa/off-bundle.mjs）', () => {
  it('ハッシュを除いた名前', () => {
    expect(bare('main-CQDAlwi5.css')).toBe('main.css');
    expect(bare('s-boot-AbCd_-12.js')).toBe('s-boot.js');
  });
  it('静的な import・動的な import・__vite__mapDeps の一覧を読む', () => {
    const code =
      'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-AAAAAAAA.js","assets/ui-BBBBBBBB.js","assets/main-CCCCCCCC.css"])))=>i.map(i=>d[i]);' +
      'import{a as b}from"./hooks-DDDDDDDD.js";import"./flag-EEEEEEEE.js";' +
      'const s=()=>__vitePreload(()=>import("./main-AAAAAAAA.js"),__VITE_IS_MODERN__?__vite__mapDeps([0,1,2]):void 0);import("./boot-FFFFFFFF.js");';
    const r = scan(code);
    expect(r.stat.sort()).toEqual(['flag-EEEEEEEE.js', 'hooks-DDDDDDDD.js']);
    expect(r.dyn.sort()).toEqual(['boot-FFFFFFFF.js', 'main-AAAAAAAA.js']);
    expect(r.pre.get('main-AAAAAAAA.js')).toEqual(['main-AAAAAAAA.js', 'ui-BBBBBBBB.js', 'main-CCCCCCCC.css']);
  });
  it('本体の CSS に入れてはいけない物（新しい画面の CSS）', () => {
    expect(FORBID.some((re: RegExp) => re.test('html.is-uxc .ux-key{}'))).toBe(true);
    expect(FORBID.some((re: RegExp) => re.test('.isl-btn{}.isl-sheet{}'))).toBe(false);
  });
  it('本体の CSS の印は、本体のファイルごとに 1 つ', () => {
    const marks = cssMarks() as { file: string; sel: string }[];
    expect(marks.some((m) => m.file === 'src/island/p1/p1.css')).toBe(true);
    expect(marks.every((m) => m.sel.length > 0)).toBe(true);
  });
  it('基準の一覧はリポジトリにあり、CI の quick がビルドのあとに 1 行で回す', () => {
    expect(existsSync(new URL('../scripts/qa/off-bundle.json', import.meta.url))).toBe(true);
    const base = JSON.parse(src('scripts/qa/off-bundle.json'));
    expect(base.js).toContain('index.js');
    expect(base.js).toContain('main.js');
    expect(base.css).toContain('main.css');
    const ci = src('.github/workflows/ci.yml');
    expect(ci).toMatch(/- run: npm run build\n\s+- run: node scripts\/qa\/off-bundle\.mjs/);
  });
});
