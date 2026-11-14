#!/usr/bin/env node
/**
 * 段 UIX5a：起動のときに読む束を守る確かめ（docs/ISLAND_UIX.md「起動で読む束を守る」）。`npm run build` のあとに回す（CI の quick）。
 * 段 UIX4a の off-bundle.mjs（切のときに読む束を守る）の役目を替えたもの：新しい画面が既定になり、「切のとき」が無くなったため。
 *
 * 起動のときに読むファイルは、入口（index.html の script）と、入口の HTML が先に取りにいく一覧
 *   - `<link rel="modulepreload">`（JS）・`<link rel="preload" as="style">`（CSS）。vite.config.ts の startPreload() が、
 *     新しい画面の値と部品（boot）→ 画面の束（s-boot）→ 本体（p1/main）→ 上と下の帯（mapui）の依存の図から作る
 * の全部。これを、ハッシュを除いた名前の一覧にして、リポジトリの基準（scripts/qa/start-bundle.json）とくらべる。
 *   - JS は名前の組（順は問わない）。CSS は **順も** くらべる：CSS を当てる順（重なりの順）が変わると、同じ CSS でも見た目が変わるため。
 *   - 一覧が欠けていないこと：一覧の JS の静的な import は、全部一覧にある。
 *   - 入口が始める束：入口の動的な import に boot・s-boot・本体（main）があること。
 * さらに、本体の CSS（入口が本体を読むときに連れてくる CSS。`main.css` ほか）に、
 *   - 新しい画面の CSS（`is-uxc`・`ux-`/`uxp-` の部品の class）が入っていないこと（入ると、新しい画面の CSS が本体の CSS のあとに当たり、重なりの順が変わる）
 *   - 本体の CSS（`src/island/**\/*.css` のうち、本体が読むもの）が、全部入っていること（別の束へ抜けていない）
 * を確かめる。本体の CSS の中の、もとの CSS ファイルの並び（bodyOrder）も基準とくらべる：import を消す・足すと、モジュールをたどる順が変わり、
 * 同じ名前の束の中でファイルの並び（当たる順）だけが変わることがある（段 UIX5a で起きた。p1/main.ts の頭で並びを決めて直した）。
 * あとから読みうる束（起動の束の中の動的な import）も基準とくらべる。
 *
 * 分かれ方が変わる典型（段 UIX3 で 2 回起きた）：新しい画面の束が、本体のモジュールを `import * as` で束ねて読む／CSS を持つ `p1/` のモジュールを読む。
 * 意図して変えるときは `node scripts/qa/start-bundle.mjs --write` で基準を書き直し、差分をコミットに入れる（手順は docs）。
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, process.env.START_BUNDLE_DIST || 'dist');
const BASE = join(ROOT, 'scripts', 'qa', 'start-bundle.json');
const WRITE = process.argv.includes('--write');
/** あとから読みうる束を数えるとき、たどらない束（別の入口：見本帳・自由建築・音の見本帳）。基準の stop が無いときの初めの値 */
const STOP = ['kit.js', 'free.js', 'book.js'];
/** 入口が起動で始める束（入口の動的な import に、この名前が全部あること） */
const STARTS = ['boot.js', 's-boot.js', 'main.js'];

/** ハッシュを除いた名前（main-CQDAlwi5.css → main.css） */
export const bare = (f) => f.replace(/-[A-Za-z0-9_-]{8}(\.[a-z0-9]+)$/, '$1');

/** 1 つの JS の中の、静的な import・動的な import・__vite__mapDeps の一覧（同じフォルダの名前） */
export function scan(code) {
  const stat = new Set();
  const dyn = new Set();
  // import{a as b}from"./x.js" ・ import"./x.js" ・ export{a}from"./x.js"
  for (const m of code.matchAll(/(?:^|[;\s}])(?:import|export)\s*(?:[\w$*{}\s,]*?\s*from\s*)?["'`]\.\/([^"'`]+\.js)["'`]/g)) stat.add(m[1]);
  for (const m of code.matchAll(/\bimport\(\s*["'`]\.\/([^"'`]+\.js)["'`]\s*\)/g)) dyn.add(m[1]);
  // __vite__mapDeps：動的な import が連れてくるファイル（JS と CSS）。添え字で呼ぶ
  let deps = [];
  const md = /m\.f\s*\|\|\s*\(\s*m\.f\s*=\s*(\[[^\]]*\])/.exec(code);
  if (md) {
    try {
      deps = JSON.parse(md[1]).map((p) => p.replace(/^.*\//, ''));
    } catch {
      deps = [];
    }
  }
  // import("./x.js")（.then(...) が付くこともある）と、その __vite__mapDeps([..]) の組
  const pre = new Map();
  for (const m of code.matchAll(/import\(\s*["'`]\.\/([^"'`]+\.js)["'`]\s*\)(?:\.then\([^()]*\))?\s*,\s*(?:__VITE_IS_MODERN__\s*\?\s*)?__vite__mapDeps\(\s*\[([\d,\s]*)\]\s*\)/g))
    pre.set(
      m[1],
      m[2]
        .split(',')
        .filter((x) => x.trim())
        .map((i) => deps[Number(i)])
        .filter(Boolean),
    );
  return { stat: [...stat], dyn: [...dyn], pre };
}

/** 入口の HTML から：入口の script・先に取りにいく JS（modulepreload）・CSS（preload as=style。書いた順） */
export function htmlStart(html) {
  const entry = /<script[^>]+type="module"[^>]+src="\.?\/?assets\/([^"]+\.js)"/.exec(html)?.[1] ?? null;
  const js = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\.?\/?assets\/([^"]+\.js)"/g)].map((m) => m[1]);
  const css = [...html.matchAll(/<link[^>]+rel="preload"[^>]+as="style"[^>]+href="\.?\/?assets\/([^"]+\.css)"/g)].map((m) => m[1]);
  // 入口の HTML に直接書いた stylesheet（今は無い）も、当てる順の先頭に入れる
  const sheets = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\.?\/?assets\/([^"]+\.css)"/g)].map((m) => m[1]);
  return { entry, js, css: [...sheets, ...css] };
}

/**
 * 起動のときに読むファイル（assets の中の名前）と、確かめの結果。
 * js：入口と先に取りにいく JS。css：当てる順の CSS。body：本体の CSS（入口が本体を読むときに連れてくる CSS）。
 * lazy：あとから読みうる物（起動の束の中の動的な import。stop の名前の束＝別の入口 には入らない）
 */
export function startFiles(dist = DIST, stop = STOP) {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const h = htmlStart(html);
  if (!h.entry) throw new Error('index.html に入口の script が無い');
  const code = (f) => readFileSync(join(dist, 'assets', f), 'utf8');
  const js = new Set([h.entry, ...h.js]);
  const problems = [];
  // 一覧が欠けていないこと：静的な import は全部一覧にある
  for (const f of js) for (const s of scan(code(f)).stat) if (!js.has(s)) problems.push(`先に取りにいく一覧に無い静的な import：${bare(f)} → ${bare(s)}`);
  // 入口が始める束
  const ent = scan(code(h.entry));
  const dynBare = ent.dyn.map(bare);
  for (const n of STARTS) if (!dynBare.includes(n)) problems.push(`入口が ${n} を動的に読んでいない（起動の順：boot → s-boot → 本体）`);
  for (const n of STARTS) if (![...js].some((f) => bare(f) === n)) problems.push(`先に取りにいく一覧に ${n} が無い`);
  // 本体の CSS
  const game = ent.dyn.find((f) => bare(f) === 'main.js');
  const body = (game && ent.pre.get(game)?.filter((f) => f.endsWith('.css'))) || [];
  if (!body.length) problems.push('入口が本体を読むときに連れてくる CSS（本体の CSS）が見つからない');
  // あとから読みうる物：起動の束から動的な import をたどる（入口の動的な import は、起動の束のほかは別の入口なので、たどらない）
  const lazy = new Set();
  const lazyCss = new Set();
  const stopped = new Set(stop);
  const walk = (f) => {
    if (js.has(f) || lazy.has(f)) return;
    lazy.add(f);
    for (const s of scan(code(f)).stat) walk(s);
  };
  const queue = [...js].filter((f) => f !== h.entry);
  const seen = new Set(queue);
  while (queue.length) {
    const f = queue.shift();
    const sc = scan(code(f));
    for (const d of sc.dyn) {
      if (stopped.has(bare(d)) || js.has(d) || lazy.has(d)) continue;
      const before = new Set(lazy);
      walk(d);
      for (const x of sc.pre.get(d) ?? []) if (x.endsWith('.css') && !h.css.includes(x)) lazyCss.add(x);
      for (const x of lazy) if (!before.has(x) && !seen.has(x)) (seen.add(x), queue.push(x));
    }
  }
  return { entry: h.entry, js: [...js].sort(), css: h.css, body, lazy: [...lazy, ...lazyCss].sort(), problems };
}

/** 本体が読む CSS の印：本体の CSS のファイルごとに、はじめの規則のセレクタ（空白を詰めた形）。本体の CSS に全部あること */
export function cssMarks(root = ROOT) {
  const out = [];
  const dirs = ['src/island/p1', 'src/island'];
  for (const d of dirs) {
    for (const f of readdirSync(join(root, d))) {
      if (!f.endsWith('.css')) continue;
      const text = readFileSync(join(root, d, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      const m = /(^|\})\s*([^@{}][^{}]*?)\s*\{/.exec(text);
      if (!m) continue;
      out.push({ file: `${d}/${f}`, sel: m[2].replace(/\s+/g, ' ').trim() });
    }
  }
  return out;
}
/** 縮めた CSS の中にセレクタがあるか（空白の詰め方の違いを無視） */
const squash = (s) => s.replace(/\s+/g, '').replace(/::?(before|after)/g, ':$1');
/** 本体の CSS に入れてはいけない物：新しい画面の CSS（入ると、本体の CSS といっしょに新しい画面の CSS のあとに当たり、重なりの順が変わる） */
export const FORBID = [/\.is-uxc\b/, /\.uxp-[a-z]/, /\.ux-(key|plate|tape|lamp|crt)\b/];

function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error(`start-bundle: ${DIST} にビルドの出力が無い（先に npm run build）`);
    process.exit(2);
  }
  const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : { stop: STOP };
  const got = startFiles(DIST, base.stop ?? STOP);
  const names = { stop: base.stop ?? STOP, js: got.js.map(bare).sort(), css: got.css.map(bare), body: got.body.map(bare), lazy: got.lazy.map(bare).sort() };
  const problems = [...got.problems];
  // 本体の CSS の中身
  const cssText = got.body.map((f) => readFileSync(join(DIST, 'assets', f), 'utf8')).join('\n');
  for (const re of FORBID) if (re.test(cssText)) problems.push(`本体の CSS に新しい画面の CSS が入っている：${re}`);
  const flat = squash(cssText);
  const marks = cssMarks();
  // 本体の CSS の中の、もとの CSS ファイルの並び（ファイルごとのはじめの規則の位置の順）
  names.bodyOrder = marks
    .map((m) => ({ f: m.file.replace(/^src\/island\//, ''), at: flat.indexOf(squash(m.sel)) }))
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((m) => m.f);
  // 本体が読む CSS か：p1/ のどれかの .ts（または入口の main.ts）が import しているものだけ
  const imported = new Set();
  for (const d of ['src/island/p1', 'src/island']) {
    for (const f of readdirSync(join(ROOT, d))) {
      if (!f.endsWith('.ts')) continue;
      for (const m of readFileSync(join(ROOT, d, f), 'utf8').matchAll(/import\s+['"](\.{1,2}\/[^'"]+\.css)['"]/g)) {
        const p = join(d, m[1]).split('\\').join('/');
        imported.add(p.replace(/^\.\//, ''));
      }
    }
  }
  for (const mk of marks) {
    if (!imported.has(mk.file)) continue;
    if (!flat.includes(squash(mk.sel))) problems.push(`本体の CSS（${mk.file}）が、本体の CSS の束に無い（別の束へ抜けた？）：${mk.sel}`);
  }
  if (WRITE) {
    if (problems.length) {
      console.error('start-bundle: 基準を書き直す前に、次を直す');
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    writeFileSync(BASE, `${JSON.stringify(names, null, 2)}\n`);
    console.log(`start-bundle: 基準を書き直した（JS ${names.js.length}・CSS ${names.css.length}・あとから ${names.lazy.length}）→ scripts/qa/start-bundle.json`);
    return;
  }
  for (const k of ['js', 'lazy']) {
    const a = new Set(base[k]);
    const b = new Set(names[k]);
    const plus = [...b].filter((x) => !a.has(x));
    const minus = [...a].filter((x) => !b.has(x));
    if (plus.length || minus.length) problems.push(`起動のときに${k === 'lazy' ? 'あとから読みうる束' : '読む JS'}の分かれ方が基準と違う：増えた [${plus.join(', ')}]・減った [${minus.join(', ')}]`);
  }
  const label = { css: '起動のときに当てる CSS（順も）', body: '本体の CSS', bodyOrder: '本体の CSS の中のファイルの並び（当たる順）' };
  for (const k of ['css', 'body', 'bodyOrder'])
    if (JSON.stringify(base[k]) !== JSON.stringify(names[k])) problems.push(`${label[k]}が基準と違う：基準 [${(base[k] ?? []).join(', ')}]・いま [${names[k].join(', ')}]`);
  if (problems.length) {
    console.error('start-bundle: だめ');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('  意図して変えたときは node scripts/qa/start-bundle.mjs --write で基準を書き直す（docs/ISLAND_UIX.md「起動で読む束を守る」）');
    process.exit(1);
  }
  console.log(`start-bundle: よい（起動のときに読む JS ${names.js.length}：${names.js.join(' ')}／当てる CSS の順 ${names.css.join(' → ')}／あとから読みうる束 ${names.lazy.length}：${names.lazy.join(' ')}）`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
