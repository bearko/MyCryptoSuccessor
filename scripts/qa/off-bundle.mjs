#!/usr/bin/env node
/**
 * 段 UIX4a：本番の束の分かれ方を守る確かめ（docs/ISLAND_UIX.md「束の分かれ方を守る」）。`npm run build` のあとに回す（CI の quick）。
 *
 * 切（既定）のときに読むファイルは、入口（index.html の script）から、
 *   - 静的な import をたどった全部と、
 *   - 入口が本体を始める動的な import（`import('./p1/main')` のチャンク `main-*.js`）と、その静的な import
 * の JS と、それらが連れてくる CSS（`__vite__mapDeps` の一覧・index.html の stylesheet）。
 * これを、ハッシュを除いた名前の一覧にして、リポジトリの基準（scripts/qa/off-bundle.json）とくらべる。
 * さらに、切のときに読む CSS（本体の CSS）に、
 *   - 新しい画面の CSS（`is-uxc`・`ux-`/`uxp-` の部品の class）が入っていないこと
 *   - 本体の CSS（`src/island/**\/*.css` のうち、本体が読むもの）が、全部入っていること（別の束へ抜けていない）
 * を確かめる。
 *
 * 分かれ方が変わる典型（どちらも起きた）：新しい画面の束が、本体のモジュールを `import * as` で束ねて読む／CSS を持つ `p1/` のモジュールを読む。
 * 意図して変えるときは `node scripts/qa/off-bundle.mjs --write` で基準を書き直し、差分をコミットに入れる（手順は docs）。
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, process.env.OFF_BUNDLE_DIST || 'dist');
const BASE = join(ROOT, 'scripts', 'qa', 'off-bundle.json');
const WRITE = process.argv.includes('--write');
/** たどらない束（入のときだけ読む束・別の入口）。基準の stop が無いときの初めの値。入のときだけの束を足したら、基準の stop に足す */
const STOP = ['boot.js', 'kit.js', 's-boot.js', 'mapui.js', 'free.js', 'book.js'];

/** ハッシュを除いた名前（main-CQDAlwi5.css → main.css）。同じ名前が 2 つあれば main~2.css */
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

/**
 * 切のときに読むファイル（assets の中の名前）。
 * js・css：起動で読む（入口と、入口が始める本体 main-*.js と、それらの静的な import・連れてくる CSS）。
 * lazy：切のままでも、あとから読みうる物（本体の中の動的な import。stop の名前の束＝入のときだけ・別の入口の束 には入らない）
 */
export function offFiles(dist = DIST, stop = []) {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const entry = /<script[^>]+type="module"[^>]+src="\.?\/?assets\/([^"]+\.js)"/.exec(html)?.[1];
  if (!entry) throw new Error('index.html に入口の script が無い');
  const css = new Set([...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\.?\/?assets\/([^"]+\.css)"/g)].map((m) => m[1]));
  const js = new Set();
  const code = (f) => readFileSync(join(dist, 'assets', f), 'utf8');
  const walk = (f, into) => {
    if (js.has(f) || into.has(f)) return;
    into.add(f);
    for (const s of scan(code(f)).stat) walk(s, into);
  };
  walk(entry, js);
  // 入口が本体を始める動的な import（p1/main のチャンク）
  const ent = scan(code(entry));
  const game = ent.dyn.filter((f) => bare(f) === 'main.js');
  if (game.length !== 1) throw new Error(`入口から本体（main-*.js）への動的な import が 1 つではない：${ent.dyn.join(', ')}`);
  for (const f of ent.pre.get(game[0]) ?? []) (f.endsWith('.css') ? css.add(f) : walk(f, js));
  walk(game[0], js);
  // あとから読みうる物：本体の束から動的な import をたどる（入口の動的な import は、本体のほかは別の入口なので、たどらない）
  const lazy = new Set();
  const lazyCss = new Set();
  const stopped = new Set(stop);
  const queue = [...js].filter((f) => f !== entry);
  while (queue.length) {
    const f = queue.shift();
    const sc = scan(code(f));
    for (const d of sc.dyn) {
      if (stopped.has(bare(d)) || js.has(d) || lazy.has(d)) continue;
      const before = new Set(lazy);
      walk(d, lazy);
      for (const x of sc.pre.get(d) ?? []) if (x.endsWith('.css') && !css.has(x)) lazyCss.add(x);
      for (const x of lazy) if (!before.has(x)) queue.push(x);
    }
  }
  return { entry, js: [...js].sort(), css: [...css].sort(), lazy: [...lazy, ...lazyCss].sort() };
}

/** 本体が読む CSS の印：本体の CSS のファイルごとに、はじめの規則のセレクタ（空白を詰めた形）。切のときの CSS に全部あること */
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
/** 本体の CSS（切のときに読む CSS）に入れてはいけない物：新しい画面の CSS */
export const FORBID = [/\.is-uxc\b/, /\.uxp-[a-z]/, /\.ux-(key|plate|tape|lamp|crt)\b/];

function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error(`off-bundle: ${DIST} にビルドの出力が無い（先に npm run build）`);
    process.exit(2);
  }
  const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : { stop: STOP };
  const got = offFiles(DIST, base.stop ?? STOP);
  const names = { stop: base.stop ?? STOP, js: got.js.map(bare).sort(), css: got.css.map(bare).sort(), lazy: got.lazy.map(bare).sort() };
  const problems = [];
  // 本体の CSS の中身
  const cssText = got.css.map((f) => readFileSync(join(DIST, 'assets', f), 'utf8')).join('\n');
  for (const re of FORBID) if (re.test(cssText)) problems.push(`本体の CSS に新しい画面の CSS が入っている：${re}`);
  const flat = squash(cssText);
  const marks = cssMarks();
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
    if (!flat.includes(squash(mk.sel))) problems.push(`本体の CSS（${mk.file}）が、切のときに読む CSS に無い（別の束へ抜けた？）：${mk.sel}`);
  }
  if (WRITE) {
    writeFileSync(BASE, `${JSON.stringify(names, null, 2)}\n`);
    console.log(`off-bundle: 基準を書き直した（JS ${names.js.length}・CSS ${names.css.length}・あとから ${names.lazy.length}）→ scripts/qa/off-bundle.json`);
  } else {
    for (const k of ['js', 'css', 'lazy']) {
      const a = new Set(base[k]);
      const b = new Set(names[k]);
      const plus = [...b].filter((x) => !a.has(x));
      const minus = [...a].filter((x) => !b.has(x));
      if (plus.length || minus.length) problems.push(`切のときに${k === 'lazy' ? 'あとから読みうる束' : `読む ${k.toUpperCase()}`}の分かれ方が基準と違う：増えた [${plus.join(', ')}]・減った [${minus.join(', ')}]`);
    }
  }
  if (problems.length) {
    console.error('off-bundle: だめ');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('  意図して変えたときは node scripts/qa/off-bundle.mjs --write で基準を書き直す（docs/ISLAND_UIX.md「束の分かれ方を守る」）');
    process.exit(1);
  }
  console.log(`off-bundle: よい（切のときに読む JS ${names.js.length}・CSS ${names.css.length}：${[...names.js, ...names.css].join(' ')}／あとから読みうる束 ${names.lazy.length}：${names.lazy.join(' ')}）`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
