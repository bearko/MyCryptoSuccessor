// 段 UIX3a：画面の部品（uxp-）・土台の直し・共通の器と 1 か月目に通る画面（会話・選ぶ引き出し・チュートリアル ほか）。
// 入のときだけ分かれること・今の目印が残ること・出す中身が今の画面とそろうこと・主役のキーが前の層に出ること・動きを減らすと全部すぐ出ること。
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawer, pickExt, pickHero, pickKind } from '../src/island/p1/heroui';
import { newP1 } from '../src/island/p1/model';
import { uxcDeps } from '../src/island/p1/uxc';
import { uxsDeps } from '../src/island/p1/uxs';
import { EMOJI_ICO, EMOJI_RE, FRONT_PICK, GUIDE_SEL, GUIDE_SFX_GAP, GUIDE_SNAP_MS, TOAST_SFX_GAP, guideStep, sayParts, splitByEmoji, sysSplit, toastKind, toastParts } from '../src/island/uix/screens/c-dress';
import { uxc } from '../src/island/uix/screens/c-slots';
import { M_ICONS } from '../src/island/uix/screens/micons';
import { KIND_ORDER, PICK_STAMP_MS, extOrder, heroTap, preselect } from '../src/island/uix/screens/picker';
import { S_ICONS } from '../src/island/uix/screens/s-icons';
import { uxsBoot } from '../src/island/uix/screens/s-slots';
import { MINE_SIZE, lightTalk, richParts, speakerOf, tapAct, voiceOf } from '../src/island/uix/screens/talk';
import { UX_ICONS, hasIcon } from '../src/island/uix/icons';
// 段 UIX4a：入のときは、新しい画面の束（s-boot）が段の絵の表を全部登録する。ここでも同じにする
import '../src/island/uix/screens/micons';
import '../src/island/uix/screens/s-icons';
import '../src/island/uix/screens/w-icons';
import '../src/island/uix/screens/b-icons';
import '../src/island/uix/screens/k-icons';
import '../src/island/uix/screens/h-icons';
import { FRONT_SEL } from '../src/island/uix/front';
import { KEY_ATTR, SWALLOW_MS, SWALLOW_PX, innerKey, swallowHit } from '../src/island/uix/parts';
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
const MY_CSS = ['uix/sparts.css', 'uix/screens/talk.css', 'uix/screens/picker.css', 'uix/screens/c-skin.css'];
/** この段の画面のコード（入のときだけ読む束） */
const MY_TS = ['talk.ts', 'picker.ts', 'c-dress.ts', 'c-boot.ts', 'c-deps.ts'];
afterEach(() => {
  for (const k of Object.keys(uxc)) delete (uxc as Record<string, unknown>)[k];
});

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
  it('押せるカードの中に置いたキーを押しても、カードは動かない（中のキーだけが動く）', () => {
    const key = { closest: () => key, tag: 'key' } as unknown as Element;
    const card = { contains: (x: unknown) => x === key } as unknown as Element;
    expect(innerKey(card, key)).toBe(true);
    // カードそのもの・カードの外の物・相手が要素でないとき
    expect(innerKey(card, { closest: () => card } as unknown as Element)).toBe(false);
    expect(innerKey(card, { closest: () => ({}) } as unknown as Element)).toBe(false);
    expect(innerKey(card, { closest: () => null } as unknown as Element)).toBe(false);
    expect(innerKey(card, null)).toBe(false);
    expect(src('uix/parts.ts')).toContain('if (innerKey(b, e.target)) return;');
  });
  it('キーの初期化と手応えは、class の接頭辞に関係なく効く（press() を通したキーの目印 data-ux-key）', () => {
    expect(KEY_ATTR).toBe('data-ux-key');
    expect(src('uix/parts.ts')).toContain("b.setAttribute(KEY_ATTR, '');");
    expect(src('uix/base.css')).toMatch(/button\[class\*=' ux-'\], button\[data-ux-key\]/);
    expect(src('uix/legacy.ts')).toMatch(/b\.hasAttribute\(KEY_ATTR\)/);
    expect(src('uix/legacy.css')).toMatch(/button\.is-ux-down:not\(\.isl-btn\):not\(\[class\*='ux-'\]\):not\(\[data-ux-key\]\)/);
  });
});

describe('切り替え：入のときだけ新しい画面に分かれる（切のときは今の画面のまま）', () => {
  it('差し込み口は、はじめは空。型だけを読む。中身は c-boot が入れる（s-boot の install から 1 行で呼ぶ）', () => {
    expect(Object.keys(uxc)).toEqual([]);
    expect(src('uix/screens/c-slots.ts').match(/^import (?!type )/gm)).toBeNull();
    const boot = src('uix/screens/c-boot.ts');
    for (const k of ['talk', 'drawer', 'pickHero', 'pickExt']) expect(boot).toContain(`uxc.${k} = `);
    expect(src('uix/screens/s-boot.ts')).toContain('installC(d.uxc);');
    expect(Object.keys(uxsDeps)).toContain('uxc');
    expect(uxsDeps.uxc).toBe(uxcDeps);
  });
  it('この段の束は、本体のモジュールを自分では読まない（型だけ）。使う関数は p1/uxc.ts から全部渡っている', () => {
    for (const f of MY_TS) {
      const code = src(`uix/screens/${f}`);
      for (const m of code.matchAll(/^import (type )?[^;]*? from '([^']+)';/gms)) if (/^\.\.\/\.\.\//.test(m[2]) && !m[1]) expect(m[2], `${f}: ${m[0].slice(0, 60)}`).toBe('../../../i18n');
      for (const m of code.matchAll(/\bC\.([A-Za-z_]\w*)/g)) expect(Object.keys(uxcDeps), `${f}: C.${m[1]}`).toContain(m[1]);
    }
  });
  it('本体から読むのは、空の差し込み口だけ。入のときは、入口が束を先に読み、本体は起動のその場で差し込む', () => {
    for (const f of ['p1/main.ts', 'p1/heroui.ts', 'p1/tut.ts', 'p1/uxc.ts']) expect(src(f), f).not.toMatch(/from '\.\.\/uix\/screens\/(?![a-z]-slots'|mhooks')/);
    // 段 UIX5a：入口は、束（boot → s-boot）を読んでから本体を始める（読めなければ、もう 1 回読みにいき、それでもだめなら失敗の表示。今の画面では始めない）
    expect(src('main.ts')).toMatch(/const loadUx = \(\) => import\('\.\/uix\/boot'\)\.then\(\(\) => import\('\.\/uix\/screens\/s-boot'\)\);/);
    expect(src('main.ts')).toContain('loadUxRetry().then(start).catch(fail);');
    expect(src('uix/screens/s-boot.ts')).toContain('uxsBoot.install = install;');
    expect(src('p1/main.ts')).toContain('if (uxOn()) bootUxs();');
    expect(uxsBoot.install).toBeUndefined();
    // 入れ物そのものは uix/hooks.ts（切のときも読む小さな束）に置く：差し込み口のファイルは型と名前だけで、中身（束）を持たない
    // （本番のビルドで、入れ物だけの束が増えて、切のときに読むファイルの数が変わらないように）
    const hooks = src('uix/hooks.ts');
    for (const n of ['uxsSlots', 'uxcSlots', 'uxwSlots', 'uxsBootSlot']) expect(hooks).toMatch(new RegExp(`export const ${n}\\b`));
    expect(src('uix/screens/s-slots.ts')).toContain("export { uxsSlots as uxs, uxsBootSlot as uxsBoot } from '../hooks';");
    expect(src('uix/screens/c-slots.ts')).toContain("export { uxcSlots as uxc } from '../hooks';");
    expect(src('uix/screens/w-slots.ts')).toContain("export { uxwSlots as uxw } from '../hooks';");
    for (const f of ['uix/screens/s-slots.ts', 'uix/screens/c-slots.ts', 'uix/screens/w-slots.ts']) expect(src(f), f).not.toMatch(/^export (const|let|function|class) /m);
    // 段 UIX5a：新しい画面の束（画面の部品・アイコンほか）と書体も事前に保存する。見本帳の kit だけは使ったときに覚える
    expect(src('../../vite.config.ts')).toContain("!/^assets\\/kit-/.test(f)");
    expect(src('../../vite.config.ts')).not.toContain('(boot|kit|s-boot|sparts|micons)-');
  });
  it('引き出し・ヒーロー選び・エクステ選び：差し込み口が入っていれば、今の画面を作らずにそちらへ渡す（引数はそのまま）', () => {
    const s = newP1(1, 'C', 'c1');
    const root = {} as HTMLElement;
    const d = vi.fn(() => () => undefined);
    const h = vi.fn();
    const e = vi.fn();
    uxc.drawer = d;
    uxc.pickHero = h;
    uxc.pickExt = e;
    const fill = () => undefined;
    drawer(root, 'T', 'N', fill);
    expect(d).toHaveBeenCalledWith(root, 'T', 'N', fill);
    const ho = { title: 'x', task: 'craft' as const, current: null, onPick: () => undefined };
    pickHero(root, s, ho);
    expect(h).toHaveBeenCalledWith(root, s, ho);
    const eo = { title: 'x', items: [], current: null, onPick: () => undefined, craft: { stock: () => undefined, rank: () => undefined } };
    pickExt(root, s, eo);
    // 作る物を選ぶ並び（craft）も、同じ口へ渡る
    expect(e).toHaveBeenCalledWith(root, s, eo);
  });
  it('会話：入のときだけ uxc.talk へ渡す。今の目印（.isl-modal.isl-talk ほか）は新しい会話にも付く', () => {
    const main = src('p1/main.ts');
    expect(main).toMatch(/if \(uxc\.talk\) return uxc\.talk\(\{ root, pages, ok, then, stage: talkStage, keys: \(m, fn\) => talkKeys\.set\(m, fn\), prep: renderNext \}\);/);
    const talk = src('uix/screens/talk.ts');
    expect(talk).toContain("el('div.isl-modal.isl-talk.ux-modal.ux-modal--talk.uxc-talk.ux-root'");
    for (const c of ['isl-talk-text', 'isl-talk-extra', 'isl-talk-focus', 'isl-talk-stage', 'isl-talk-foot']) expect(talk, c).toContain(c);
    // 引き出しは、今の目印 .isl-picker を付ける（画面の部品の器）
    expect(src('uix/sparts.ts')).toContain('div.isl-picker.uxp-drawer');
  });
});

describe('会話', () => {
  it('話す人：使者（crest）→ ヒーロー（who）→ 案内役。声は名前から決まる（同じ人はいつも同じ声）', () => {
    expect(speakerOf({})).toEqual({ kind: 'mine' });
    expect(speakerOf({ who: 5024 })).toEqual({ kind: 'hero', id: 5024 });
    expect(speakerOf({ who: 5024, crest: 'ruby' })).toEqual({ kind: 'crest', land: 'ruby' });
    expect(voiceOf('葛飾北斎')).toBe(voiceOf('葛飾北斎'));
    expect(voiceOf('葛飾北斎')).not.toBe(voiceOf('マルコ・ポーロ'));
    // 案内役の立ち絵は、もとの大きさ（96×128）の等倍：にじませない
    expect(MINE_SIZE).toEqual({ w: 96, h: 128 });
  });
  it('押したとき：喋っている途中なら最後まで出す → 次の枚 → 最後の枚は閉じる。その枚だけのキーがあれば、選ぶまで閉じない', () => {
    expect(tapAct({ typing: true, k: 0, n: 3, button: false })).toBe('skip');
    expect(tapAct({ typing: false, k: 0, n: 3, button: false })).toBe('next');
    expect(tapAct({ typing: false, k: 2, n: 3, button: false })).toBe('done');
    expect(tapAct({ typing: false, k: 2, n: 3, button: true })).toBe('stay');
    expect(tapAct({ typing: true, k: 2, n: 3, button: true })).toBe('skip');
    // キー（つぎへ・最後の枚のキー）からは、喋っている途中でもすぐ進む
    expect(src('uix/screens/talk.ts')).toMatch(/tapAct\(\{ typing: !viaKey && bubble\.typing, k, n: pages\.length, button: !viaKey && !!pages\[k\]\.button \}\)/);
  });
  it('強調（[[ ]]）は今と同じ書き方。暗幕を薄くするのは、囲む所も絵も無い 1 枚だけの会話', () => {
    expect(richParts('ここが[[新天地]]のランド！')).toEqual([{ text: 'ここが', em: false }, { text: '新天地', em: true }, { text: 'のランド！', em: false }]);
    expect(richParts('[[A]][[B]]')).toEqual([{ text: 'A', em: true }, { text: 'B', em: true }]);
    expect(lightTalk([{}])).toBe(true);
    expect(lightTalk([{}, {}])).toBe(false);
    expect(lightTalk([{ focus: '.x' }])).toBe(false);
    expect(lightTalk([{ show: 'crew' }])).toBe(false);
  });
  it('主役は「つぎへ」（主のキー＝前の層）。1 字ずつ喋るのは土台の器（動きを減らすと全部すぐ出る）', () => {
    const talk = src('uix/screens/talk.ts');
    expect(talk).toMatch(/uxKey\(last \? ok[^;]*kind: 'main', big: true/);
    const parts = src('uix/parts.ts');
    expect(parts).toMatch(/export function typeInto\(/);
    expect(parts).toMatch(/if \(isCalm\(\) \|\| cps <= 0\) finish\(\);/);
    // 入る動きは 180〜260ms
    expect(src('uix/screens/talk.css')).toMatch(/uxc-talk-in 260ms steps\(7, end\)/);
  });
});

describe('選ぶ引き出し', () => {
  it('カードを押したとき（今の引き出しと同じ決まり）', () => {
    expect(heroTap('free', { promoLead: false, canSwap: false })).toBe('select');
    expect(heroTap('current', { promoLead: false, canSwap: false })).toBe('select');
    expect(heroTap('busy', { promoLead: false, canSwap: true })).toBe('swap');
    // チュートリアル中は付け替えない
    expect(heroTap('busy', { promoLead: false, canSwap: false })).toBe('busy');
    expect(heroTap('busy', { promoLead: true, canSwap: true })).toBe('promo');
    expect(heroTap('resting', { promoLead: true, canSwap: true })).toBe('rest');
    expect(heroTap('training', { promoLead: false, canSwap: true })).toBe('none');
  });
  it('並びは今と同じ：待機中 → いまの担当 → ほかの担当 → 休憩中 → 修行中', () => {
    expect(Object.entries(KIND_ORDER).sort((a, b) => a[1] - b[1]).map((x) => x[0])).toEqual(['free', 'current', 'busy', 'resting', 'training']);
    const s = newP1(1, 'C', 'c1');
    expect(s.staff.map((st) => pickKind(st, null))).toEqual(s.staff.map(() => 'free'));
  });
  it('はじめに選んでおく人：空いている枠は、いちばん向いている待機中の人。担当がいる枠は、その人', () => {
    const list = [
      { hero: 1, kind: 'free' as const, apt: 26 },
      { hero: 2, kind: 'free' as const, apt: 28 },
      { hero: 3, kind: 'busy' as const, apt: 90 },
    ];
    expect(preselect(list, null)).toBe(2);
    expect(preselect(list, 3)).toBe(3);
    expect(preselect(list.filter((x) => x.kind !== 'free'), null)).toBeNull();
    expect(preselect(list, 9)).toBeNull();
  });
  it('エクステの並び：売れない物 → 技がまだの物はうしろ、あとは粗利の高い順。印をつけた物は先頭', () => {
    const xs = ['a', 'b', 'c', 'd'];
    const o = { off: (x: string) => Number(x === 'a'), locked: (x: string) => Number(x === 'b'), profit: (x: string) => ({ a: 99, b: 50, c: 10, d: 20 })[x] ?? 0 };
    expect(extOrder(xs, o)).toEqual(['d', 'c', 'b', 'a']);
    expect(extOrder(xs, { ...o, first: 'c' })).toEqual(['c', 'd', 'b', 'a']);
    expect(extOrder(xs, { ...o, keep: true })).toEqual(xs);
  });
  it('決めるキーは主のキー。決めたら「決定」の札を打ってからしまう（180〜260ms）。動きを減らすと、すぐしまう', () => {
    expect(PICK_STAMP_MS).toBeGreaterThanOrEqual(180);
    expect(PICK_STAMP_MS).toBeLessThanOrEqual(260);
    const code = src('uix/screens/picker.ts');
    expect(code).toMatch(/if \(isCalm\(\) \|\| !card\) \{\s*d\.drop\(\);\s*fn\(\);/);
    expect(code.match(/decide: \{ label: t\('決める', 'Confirm'\)/g)?.length).toBe(2);
    // 選べる操作は今と同じ：外す・担当を外す（枠を空に）・並べない・ランクアップ・並びの切り替え・絞り込み
    for (const w of ["t('担当を外す', 'Unassign')", "t('外す', 'Free')", "t('並べない', 'Clear')", "t('ランクアップ', 'Rank up')", "t('おすすめ（効率）', 'Best (efficiency)')", "t('いまの素材で作れる', 'From what we have')", "t('今のセクタで売れるもの', 'Sells in this sector')"]) expect(code, w).toContain(w);
  });
  it('チュートリアルの言い方：キーの形に合わせる（段 UIX5a で、新しい画面の文だけにした）', () => {
    const tut = src('p1/tut.ts');
    expect(tut).not.toContain('uxText');
    expect(tut).not.toContain("t('光っている四角をタップして、[[MCHアーティスト]]を選ぼう！'");
    expect(tut).toContain('光っている「[[職人を置く]]」のキーを押して');
    expect(tut).toContain('光っている「[[作る物を選ぶ]]」を押そう');
    expect(tut).toContain('[[自動製造]]のスイッチが「入」になっていると');
    expect(tut).toContain("focus: '.isl-plan-auto'");
    // 新しい工房の札にも、会話が囲む所の目印がある
    expect(src('uix/screens/workshop.ts')).toContain('div.uxs-ctl-row.isl-plan-auto');
  });
});

describe('今の要素のまま着せ替える画面（お知らせ・窓・チュートリアル ほか）', () => {
  it('絵文字 → ドットの絵：表の絵は、どれも描ける（3 つの絵の表か、段 UIX4a で登録した段の絵の表のどこかにある）', () => {
    const all = new Set([...UX_ICONS, ...M_ICONS, ...S_ICONS]);
    for (const [e, name] of Object.entries(EMOJI_ICO)) expect(all.has(name) || hasIcon(name), `${e} → ${name}`).toBe(true);
  });
  it('字を、絵文字とそれ以外に分ける（知らない絵文字は字のまま。異体字の印も一緒に取る）', () => {
    expect(splitByEmoji('工事中だよ。右上の ⏩ で早送り')).toEqual([{ text: '工事中だよ。右上の ' }, { text: '⏩', ico: 'ff' }, { text: ' で早送り' }]);
    expect(splitByEmoji('⚠\uFE0F 素材が足りません')).toEqual([{ text: '⚠\uFE0F', ico: 'warn' }, { text: ' 素材が足りません' }]);
    expect(splitByEmoji('🏆 トロフィー 🏆').filter((x) => x.ico).length).toBe(2);
    expect(splitByEmoji('ふつうの字')).toEqual([{ text: 'ふつうの字' }]);
    expect(EMOJI_RE.test('🦄')).toBe(false);
  });
  it('設定のキー：「名前：いまの値」を分ける（「：」が無ければ分けない）', () => {
    expect(sysSplit('街の人通り：ふつう')).toEqual(['街の人通り', 'ふつう']);
    expect(sysSplit('Crowd: Normal')).toEqual(['Crowd', 'Normal']);
    expect(sysSplit('案内を隠す')).toBeNull();
  });
  it('主役のボタンを前の層へ：建てるモードの「建てる」・窓の主のボタン・マインちゃんの一言の先', () => {
    expect(FRONT_PICK.length).toBeLessThanOrEqual(3);
    expect(FRONT_SEL).toContain('.ux-front');
    expect(src('uix/screens/c-dress.ts')).toContain("b.classList.add('ux-front')");
  });
  it('動きを減らす：着せ替えた所の出入り・はずみも止まる', () => {
    expect(noComment(src('uix/screens/c-skin.css'))).toMatch(/html\.is-uxc\.is-calm #isl-ui :is\([^)]*\.isl-tour-tap[^)]*\) \{\s*animation: none;/);
  });
});

describe('お知らせ：管制卓の信号の帯', () => {
  const CSS = noComment(src('uix/screens/c-skin.css'));
  const TS = src('uix/screens/c-dress.ts');
  it('種類：済み・注意・セリフ・知らせ（頭の印で決める）', () => {
    expect(toastKind('✔ 承認：扇子を輸入に追加しました')).toBe('done');
    expect(toastKind('⚠ 素材が足りません（あと 12 個）')).toBe('warn');
    expect(toastKind('💬 MCHアーティスト「いい品ができたぞ」')).toBe('say');
    expect(toastKind('マスをタップで建物を動かす')).toBe('info');
    expect(toastKind('いまは「工房で作るものを決める」をしよう！')).toBe('info');
  });
  it('字を、種類・本文・「×N」に分ける（頭の印は絵とランプに替わるので、本文からは外す。字そのものは今のまま）', () => {
    expect(toastParts('✔ 承認しました')).toEqual({ kind: 'done', body: '承認しました', n: 1 });
    expect(toastParts('木材を 1 ロット注文しました ×3')).toEqual({ kind: 'info', body: '木材を 1 ロット注文しました', n: 3 });
    expect(toastParts('⚠ 資金が足りません ×2')).toEqual({ kind: 'warn', body: '資金が足りません', n: 2 });
    expect(sayParts('💬 MCHアーティスト「いい品ができたぞ」')).toEqual({ name: 'MCHアーティスト', line: 'いい品ができたぞ' });
    expect(sayParts('ふつうの知らせ')).toBeNull();
    // 今の決まり（積む数・消えるまで・同じ文は ×N）は本体のまま：新しい画面の側は、出た札を組み直すだけ
    const main = src('p1/main.ts');
    expect(main).toContain('setTimeout(() => e.remove(), 3300);');
    expect(main).toContain('while (toasts.children.length > 3) toasts.firstChild?.remove();');
  });
  it('幅：せまい画面は画面幅 − 32px・広い画面は 420px まで。字は 3 行まで。160ms ほどで滑り込む', () => {
    expect(CSS).toMatch(/#isl-ui \.isl-toasts \{\s*left: 16px;\s*right: 16px;/);
    expect(CSS).toMatch(/width: min\(420px, calc\(100% - 16px\)\);/);
    expect(CSS).toMatch(/-webkit-line-clamp: 3;/);
    // 3300ms の 4.85% ＝ 160ms
    expect(CSS).toMatch(/uxc-sig-life 3300ms steps\(4, end\)/);
    expect(Math.round(3300 * 0.0485)).toBe(160);
  });
  it('上の帯を隠さない：札・窓を開いているあいだも、上の帯のすぐ下', () => {
    const legacy = src('uix/legacy.ts');
    // （段 UIX4a：選ぶ引き出しの見出しもよけるため、いったん top に入れてから返す）
    expect(legacy).toMatch(/if \(hud && hud\.height\) top = hud\.bottom \+ 6;/);
    expect(legacy).not.toMatch(/\? 8 : y\)/);
  });
  it('せまい画面：帯が出ているあいだ、ミッションの札は見出しだけにたたんで下へよける（クリアの印が出ているあいだは、たたまない）', () => {
    expect(TS).toContain("root.classList.toggle('uxc-toasting', hgt > 0);");
    // 印のある札の目印は c-dress.ts が付ける（段 UIX3k：:not(:has(...)) だと、せまい画面でどこを書き換えても文書全体の見た目の計算が走る）
    expect(CSS).toMatch(/\.uxc-toasting \.isl-missions:not\(\.uxc-stamped\) > :not\(\.isl-missions-head\) \{\s*display: none;/);
    expect(TS).toContain("m.classList.toggle('uxc-stamped', !!m.querySelector('.isl-mis-stamp'))");
    expect(CSS).not.toMatch(/:not\(:has\(/);
    expect(CSS).toMatch(/translate: 0 var\(--uxc-toast-h, 0px\);/);
  });
  it('音は間引く。セリフには、名前の札と小さな顔。トロフィーは、表に無い絵ならトロフィーのドットの絵', () => {
    expect(TOAST_SFX_GAP).toBeGreaterThanOrEqual(300);
    expect(TS).toContain("if (now - toastSfxAt < TOAST_SFX_GAP) return;");
    expect(TS).toContain("uxpFace(C.heroIcon(id, 64), { win: 40 })");
    expect(Object.keys(uxcDeps)).toContain('heroByName');
    expect(uxcDeps.heroByName('そんな人はいない')).toBeNull();
    expect(UX_ICONS).toContain('trophy');
    expect(TS).toMatch(/uxIcon\(m \? EMOJI_ICO\[m\[1\]\] : 'trophy'/);
  });
});

describe('チュートリアル：一言・光る枠・クリア・流れの案内・ほめる一言', () => {
  const CSS = noComment(src('uix/screens/c-skin.css'));
  const TS = src('uix/screens/c-dress.ts');
  it('手順・条件・順番は変えない：本体のチュートリアルの段（p1/tut.ts の TUT）には、入のときの言い方のほか触らない', () => {
    const tut = src('p1/tut.ts');
    // 段 UIX3a で入のときだけ替えた文の 3 か所は、段 UIX5a で新しい画面の文だけにした（段の手順・条件・順番は同じ）
    expect(tut).not.toContain('uxText(');
    for (const f of ['uix/screens/c-dress.ts', 'uix/screens/talk.ts', 'uix/screens/picker.ts']) expect(src(f), f).not.toMatch(/\.tut\s*=[^=]/);
  });
  it('マインちゃんの一言：会話と同じ器（枠の上に立つ・名前の札・1 字ずつ喋る）。出す・隠すは今の決まりのまま', () => {
    expect(TS).toMatch(/typeInto\(p, f, \{ voice: TIP_VOICE \}\)/);
    // 文が替わったときだけ喋る（同じ文のまま作り直されたら、全部出たまま）
    expect(TS).toMatch(/if \(last && last\.key === key\) \{/);
    expect(CSS).toMatch(/\.isl-advisor > \.isl-bubble\[data-uxc-name\]::before \{\s*content: attr\(data-uxc-name\);/);
    // display は書かない（札・窓・吹き出しを開いているあいだは今の決まりで隠れる）・はみ出した所は地図を押せるまま
    const adv = [...CSS.matchAll(/html\.is-uxc #isl-ui \.isl-advisor \{([^}]*)\}/g)].map((m) => m[1]);
    expect(adv.length).toBeGreaterThan(0);
    for (const body of adv) expect(body).not.toMatch(/display:/);
    expect(adv.join('\n')).toMatch(/padding-top: 92px;\s*pointer-events: none;/);
    // 立ち絵は 96×128 の等倍（にじませない）
    expect(CSS).toMatch(/\.isl-advisor > img \{[^}]*width: 96px;\s*height: 128px;/);
    expect(CSS).toMatch(/\.isl-dock-mine \{[^}]*object-fit: none;/);
  });
  it('光る枠：相手が替わったら締まり直す・同じ相手なら締まり直さない・相手が無ければ消す', () => {
    expect(guideStep('', 'a')).toBe('snap');
    expect(guideStep('a', 'a')).toBe('keep');
    expect(guideStep('a', 'b')).toBe('snap');
    expect(guideStep('a', null)).toBe('hide');
    expect(GUIDE_SNAP_MS).toBe(180);
    expect(GUIDE_SFX_GAP).toBeGreaterThanOrEqual(300);
    expect(CSS).toMatch(/uxc-guide-snap 180ms steps\(3, end\) 1/);
    expect(CSS).toMatch(/uxc-guide-pulse 1\.6s steps\(4, end\) infinite/);
    // 動きを減らす：止まった形
    expect(CSS).toMatch(/html\.is-uxc\.is-calm \.uxc-guide,\s*html\.is-uxc\.is-calm \.uxc-guide > i \{\s*animation: none;/);
    // 今の目印（is-hot・is-guide）を見る。下の帯のタブ・速さのキーは、上と下の帯の段が自分で囲む
    for (const sel of GUIDE_SEL) expect(sel).toMatch(/\.is-hot|\.is-guide/);
    expect(GUIDE_SEL.join(' ')).not.toMatch(/isl-tab|isl-speed/);
    // 会話のあいだは出さない
    expect(TS).toContain("if (!root.querySelector('.isl-talk'))");
  });
  it('ミッションのクリア：印が打たれる（1 回だけ）。流れの案内：段が進むと光が走る。ほめる一言：打たれる札', () => {
    expect(TS).toContain('if (stamp && !hadStamp) {');
    expect(CSS).toMatch(/\.isl-missions\.uxc-clear \.isl-mis-stamp \{\s*animation: ux-stamp 200ms steps\(4, end\) 1;/);
    expect(TS).toContain("tour.classList.add('uxc-run');");
    expect(CSS).toMatch(/uxc-tour-run 520ms steps\(8, end\)/);
    expect(CSS).toMatch(/\.isl-tour-step\.is-done::before \{[^}]*clip-path: polygon/);
    expect(TS).toContain("pr.classList.add('uxc-hit');");
    expect(CSS).toMatch(/\.isl-praise\.uxc-hit \{\s*animation: uxc-praise 2600ms/);
  });
});
