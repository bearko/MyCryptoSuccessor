// 段 UIX3a：画面の部品（uxp-）・土台の直し・共通の器と 1 か月目に通る画面（会話・選ぶ引き出し・チュートリアル ほか）。
// 入のときだけ分かれること・今の目印が残ること・出す中身が今の画面とそろうこと・主役のキーが前の層に出ること・動きを減らすと全部すぐ出ること。
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawer, pickExt, pickHero, pickKind } from '../src/island/p1/heroui';
import { newP1 } from '../src/island/p1/model';
import { uxcDeps } from '../src/island/p1/uxc';
import { uxsDeps } from '../src/island/p1/uxs';
import { EMOJI_ICO, EMOJI_RE, FRONT_PICK, splitByEmoji, sysSplit } from '../src/island/uix/screens/c-dress';
import { uxc } from '../src/island/uix/screens/c-slots';
import { M_ICONS } from '../src/island/uix/screens/micons';
import { KIND_ORDER, PICK_STAMP_MS, extOrder, heroTap, preselect } from '../src/island/uix/screens/picker';
import { S_ICONS } from '../src/island/uix/screens/s-icons';
import { uxsBoot } from '../src/island/uix/screens/s-slots';
import { MINE_SIZE, lightTalk, richParts, speakerOf, tapAct, voiceOf } from '../src/island/uix/screens/talk';
import { UX_ICONS } from '../src/island/uix/icons';
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
    for (const f of ['p1/main.ts', 'p1/heroui.ts', 'p1/tut.ts', 'p1/uxc.ts']) expect(src(f), f).not.toMatch(/from '\.\.\/uix\/screens\/(?!s-slots'|c-slots'|mhooks')/);
    expect(src('main.ts')).toMatch(/import\('\.\/uix\/boot'\)\s*\.then\(\(\) => import\('\.\/uix\/screens\/s-boot'\)\)\s*\.then\(start, start\)/);
    expect(src('uix/screens/s-boot.ts')).toContain('uxsBoot.install = install;');
    expect(src('p1/main.ts')).toContain('if (uxOn()) bootUxs();');
    expect(uxsBoot.install).toBeUndefined();
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
  it('チュートリアルの言い方：入のときだけ、キーの形に合わせる（切のときの文は今のまま残す）', () => {
    const tut = src('p1/tut.ts');
    expect(tut).toContain("const uxText = (off: string, on: string) => (uxOn() ? on : off);");
    expect(tut).toContain("t('光っている四角をタップして、[[MCHアーティスト]]を選ぼう！'");
    expect(tut).toContain('光っている「[[職人を置く]]」のキーを押して');
    expect(tut).toContain("focus: '.isl-plan-auto'");
    // 新しい工房の札にも、会話が囲む所の目印がある
    expect(src('uix/screens/workshop.ts')).toContain('div.uxs-ctl-row.isl-plan-auto');
  });
});

describe('今の要素のまま着せ替える画面（お知らせ・窓・チュートリアル ほか）', () => {
  it('絵文字 → ドットの絵：表の絵は、どれも 3 つの絵の表のどこかにある', () => {
    const all = new Set([...UX_ICONS, ...M_ICONS, ...S_ICONS]);
    for (const [e, name] of Object.entries(EMOJI_ICO)) expect(all.has(name), `${e} → ${name}`).toBe(true);
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
    expect(noComment(src('uix/screens/c-skin.css'))).toMatch(/html\.is-uxc\.is-calm #isl-ui :is\([^)]*\.isl-bcard\.is-guide[^)]*\) \{\s*animation: none;/);
  });
});
