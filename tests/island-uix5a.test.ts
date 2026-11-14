// 段 UIX5a（docs/ISLAND_UIX.md「2. 切り替え」「起動で読む束を守る」）：新しい画面を既定にし、もう通らない古い描き方を片付けた。
// 既定で入・前の切り替えは読まない・入口は束を先に読み、読めなければ失敗の表示・本体の入口は差し込み口へ渡すだけ・新しい音だけ・事前に保存する束。
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { initUx, resolveUx, uxOn } from '../src/island/uix/flag';

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const P1 = 'src/island/p1';
/** 部長との対話（UIX5t の持ち場）は見ない */
const P1_FILES = readdirSync(new URL(`../${P1}`, import.meta.url))
  .filter((f) => f.endsWith('.ts') && f !== 'headtalkui.ts')
  .map((f) => `${P1}/${f}`);
const G = globalThis as unknown as Record<string, unknown>;

/** `(` から対応する `)` の次の位置（文字列の中のかっこは数えない。差し込みの引数は短いので、これで足りる） */
function closeParen(code: string, open: number): number {
  let depth = 0;
  let q: string | null = null;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (q) {
      if (c === '\\') i++;
      else if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i + 1;
  }
  return -1;
}

describe('既定で入（<html class="is-uxc"> をいつも付ける）', () => {
  const prev = { document: G.document, window: G.window, localStorage: G.localStorage, CustomEvent: G.CustomEvent };
  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete G[k];
      else G[k] = v;
    }
  });
  it('URL・覚えた値によらず入。前の切り替えで覚えた isl.uxc は消す。?uix=kit は見本帳', () => {
    const cls = new Set<string>();
    const store: Record<string, string> = { 'isl.uxc': '0' };
    G.document = { documentElement: { classList: { add: (c: string) => cls.add(c), contains: (c: string) => cls.has(c) } } };
    G.window = { dispatchEvent: () => true };
    G.CustomEvent = class {};
    G.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: (k: string) => void delete store[k] };
    for (const q of ['', '?uix=0', '?uix=1']) expect(resolveUx(q)).toEqual({ on: true, kit: false });
    expect(resolveUx('?uix=kit').kit).toBe(true);
    initUx('?uix=0');
    expect(uxOn()).toBe(true);
    expect(store).toEqual({});
    // 切り替えの口（setUx）と、URL の ?uix=0／?uix=1 を読む所は、もう無い
    const flag = read('src/island/uix/flag.ts');
    expect(flag).not.toMatch(/export function setUx/);
    expect(flag).not.toContain("=== '0'");
  });
  it('設定の「新しい画面（試作）」のスイッチは無い', () => {
    const main = read(`${P1}/main.ts`);
    expect(main).not.toContain('新しい画面（試作）');
    expect(main).not.toContain("id: 'uix'");
    expect(main).not.toContain('setUx(');
  });
});

describe('入口（src/island/main.ts）：束を先に読む・読めなければ失敗の表示', () => {
  const M = read('src/island/main.ts');
  it('値と部品（boot）→ 画面の束（s-boot）→ 本体の順。読めなければ 1 回だけ読み直し、それでもだめなら fail（本体は始めない）', () => {
    expect(M).toContain("const loadUx = () => import('./uix/boot').then(() => import('./uix/screens/s-boot'));");
    expect(M).toContain('const loadUxRetry = () => loadUx().catch(() => new Promise((r) => setTimeout(r, 800)).then(loadUx));');
    expect(M).toContain('else loadUxRetry().then(start).catch(fail);');
    // 前の「読めなくても今の画面で始める」（.then(start, start)）は無い
    expect(M).not.toContain('.then(start, start)');
    // 見本帳・音の見本帳は残す
    expect(M).toContain("q.get('uix') === 'sound'");
    expect(M).toContain("import('./uix/boot').then(() => import('./uix/kit'))");
  });
  it('失敗の表示：何が起きたかと「読み直す」のキー（16px・44px 以上・角は丸めない・ことばは t）', () => {
    const fail = M.slice(M.indexOf('function fail('), M.indexOf('\n}\n', M.indexOf('function fail(')));
    expect(fail).toContain("box.className = 'isl-boot-fail';");
    expect(fail).toContain("box.setAttribute('role', 'alert');");
    expect(fail).toContain("t('ゲームの画面を読み込めませんでした。通信のよい所で、読み直してください。'");
    expect(fail).toContain("t('読み直す', 'Reload')");
    expect(fail).toContain("key.addEventListener('click', () => location.reload());");
    expect(fail).toContain('min-height:44px');
    expect(fail).not.toMatch(/border-radius/);
    for (const px of fail.matchAll(/font(?:-size)?:\s*(\d+)px/g)) expect(Number(px[1])).toBeGreaterThanOrEqual(16);
    // ほかの CSS の class とぶつからない
    for (const f of ['src/island/island.css', `${P1}/p1.css`]) expect(read(f)).not.toContain('isl-boot-fail');
  });
});

describe('本体の入口は、差し込み口へ渡すだけ（もう通らない古い描き方を片付けた）', () => {
  it('`return ux<x>.<名前>!(…);` のあとに文が無い（関数はそこで終わる）', () => {
    let n = 0;
    for (const f of P1_FILES) {
      const code = read(f);
      for (const m of code.matchAll(/return (ux[a-z])\.(\w+)!\(/g)) {
        const end = closeParen(code, m.index! + m[0].length - 1);
        expect(end, `${f}: ${m[0]}`).toBeGreaterThan(0);
        expect(code.slice(end), `${f}: ${m[1]}.${m[2]}`).toMatch(/^;\n\}/);
        n++;
      }
    }
    // 段 UIX5a で片付けた入口（関数の頭の 1 行の分かれ道）の数。ほかに設定（openSettings → openSettingsUx）と、塊の形の 5 か所（建築の札・発表・地図の窓・発掘の報告・スキルツリー）
    expect(n).toBeGreaterThanOrEqual(73);
  });
  it('前の「差し込み口が空なら今の画面」の分かれ道（if (ux<x>.<名前>) return …）は残っていない', () => {
    for (const f of P1_FILES) expect(read(f), f).not.toMatch(/if \(ux[a-z]\.\w+\) return ux[a-z]\.\w+\(/);
  });
  it('入か切かで分かれる所は無い（uxOn()・is-uxc を見る分かれ道）', () => {
    for (const f of P1_FILES) {
      const code = read(f);
      expect(code, f).not.toMatch(/\buxOn\(\)/);
      expect(code, f).not.toContain("classList.contains('is-uxc')");
    }
    expect(read(`${P1}/tut.ts`)).not.toContain('uxText');
  });
  it('起動のその場で差し込み口へ入れる。上と下の帯（mapui）はいつも読む', () => {
    const main = read(`${P1}/main.ts`);
    expect(main).toContain('\nbootUxs();\nvoid loadUxs();\n');
    expect(main).toContain("\nvoid import('../uix/screens/mapui').then(");
  });
});

describe('音：新しい音だけ', () => {
  const main = read(`${P1}/main.ts`);
  it('今の BGM（mp3 の Sound）と効果音（IslandSfx）は使わない。効果音の呼び出しは新しい音へ付け替える', () => {
    expect(main).not.toContain('new Sound(');
    expect(main).not.toContain('new IslandSfx');
    expect(main).toContain('const sfx = { play: (k: Sfx, gain = 1, rate = 1) => void uxLegacy(k, gain, rate) };');
    expect(read(`${P1}/sfx.ts`)).not.toMatch(/class IslandSfx/);
    expect(read('src/audio.ts')).not.toMatch(/class Sound/);
    // 場面の名前（町・発掘・経営会議）は覚えて、新しい音の場面に使う
    expect(main).toContain("if (digOpen() || bgmKey === 'bgmDig') return 'dig';");
    expect(main).toContain("if (bgmKey === 'bgmBoard') return 'board';");
  });
});

describe('サービスワーカーと起動で読む束', () => {
  const V = read('vite.config.ts');
  it('新しい画面の束と書体も事前に保存する（見本帳の kit だけは使ったときに覚える）', () => {
    expect(V).toContain("const shell = files.filter((f) => SHELL.some((re) => re.test(f)) && !/^assets\\/kit-/.test(f));");
    expect(V).not.toMatch(/!\/\\\.woff2\?\$\/\.test\(f\)/);
  });
  it('起動で読む束（boot → s-boot → 本体 → 上と下の帯）を、入口の HTML で先に取りにいく', () => {
    expect(V).toContain("const START = ['src/island/uix/boot.ts', 'src/island/uix/screens/s-boot.ts', 'src/island/p1/main.ts', 'src/island/uix/screens/mapui.ts'];");
    expect(V).toContain("rel: 'modulepreload'");
    expect(V).toContain("rel: 'preload', as: 'style'");
    expect(V).toMatch(/plugins: \[uxFonts\(\), pwa\(\), siteUrl\(\), startPreload\(\)\]/);
  });
  it('本体の CSS の中のファイルの並び（当たる順）は、古い描き方を消す前と同じ（p1/main.ts の頭で決める・基準 bodyOrder で守る）', () => {
    const main = read(`${P1}/main.ts`);
    const css = [...main.matchAll(/^import '(\.{1,2}\/[^']+\.css)';$/gm)].map((m) => m[1]);
    expect(css).toEqual(['./lesson.css', './p2.css', './factory.css', './ui8.css', './pol.css', '../island.css', './p1.css']);
    const base = JSON.parse(read('scripts/qa/start-bundle.json'));
    expect(base.bodyOrder.slice(0, 7)).toEqual(['island.css', 'p1/lesson.css', 'p1/p2.css', 'p1/factory.css', 'p1/ui8.css', 'p1/pol.css', 'p1/p1.css']);
    expect(read('scripts/qa/start-bundle.mjs')).toContain("for (const k of ['css', 'body', 'bodyOrder'])");
  });
  it('毎晩の本番の確かめは、新しい画面が出ること・失敗の表示が出ないことを見る（前の ?uix=1 の場合分けは無い）', () => {
    const smoke = read('scripts/qa/prod-smoke.mjs');
    expect(smoke).toContain("waitForSelector('.uxm-hud'");
    expect(smoke).toContain("page.$('.isl-boot-fail')");
    expect(smoke).not.toContain("q: '?uix=1'");
  });
});
