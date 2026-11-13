// 本番のサイトを開いて、止まらずに動くかを確かめる（Nightly から毎晩動かす）。
//   node scripts/qa/prod-smoke.mjs [URL=https://successor.bearko.games]
// 見るもの：ゲームの画面（#isl-ui）が出るか・捕まえられなかったエラー（pageerror）が無いか。
// 今の見た目と新しい見た目（?uix=1）、スマホとパソコンの幅の 4 通り。
// コンソールのエラー（読み込みの失敗など）は一覧に出すが、落とすのは pageerror と画面が出ないときだけ。
import { chromium } from 'playwright';

const base = process.argv[2] || 'https://successor.bearko.games';
const cases = [
  { name: 'スマホ・今の見た目', q: '', w: 390, h: 844 },
  { name: 'スマホ・新しい見た目', q: '?uix=1', w: 390, h: 844 },
  { name: 'パソコン・今の見た目', q: '', w: 1280, h: 800 },
  { name: 'パソコン・新しい見た目', q: '?uix=1', w: 1280, h: 800 },
];

const browser = await chromium.launch();
let bad = 0;
for (const c of cases) {
  const page = await browser.newPage({ viewport: { width: c.w, height: c.h } });
  const errors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  let ok = true;
  try {
    await page.goto(base + c.q, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForSelector('#isl-ui', { timeout: 30_000 });
    await page.waitForTimeout(5_000);
  } catch (e) {
    ok = false;
    errors.push(`画面が出ない：${e.message}`);
  }
  if (errors.length) ok = false;
  if (!ok) bad++;
  console.log(`${ok ? '通過' : '失敗'}：${c.name}`);
  for (const e of errors) console.log(`  エラー：${e}`);
  for (const e of consoleErrors.slice(0, 5)) console.log(`  コンソール：${e}`);
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
