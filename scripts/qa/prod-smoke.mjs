// 本番のサイトを開いて、止まらずに動くかを確かめる（Nightly から毎晩動かす）。
//   node scripts/qa/prod-smoke.mjs [URL=https://successor.bearko.games]
// 見るもの：新しい画面（方向 C「管制卓」。段 UIX5a から既定）が出るか（<html class="is-uxc">・走査線の層・上の帯 .uxm-hud）・
// 読み込みの失敗の表示（.isl-boot-fail）が出ていないか・捕まえられなかったエラー（pageerror）が無いか。
// スマホとパソコンの幅の 2 通りと、前の切り替えの URL（?uix=0。もう読まないので新しい画面のまま）のスマホの幅。
// コンソールのエラー（読み込みの失敗など）は一覧に出すが、落とすのは pageerror と画面が出ないときだけ。
import { chromium } from 'playwright';

const base = process.argv[2] || 'https://successor.bearko.games';
const cases = [
  { name: 'スマホ', q: '', w: 390, h: 844 },
  { name: 'パソコン', q: '', w: 1280, h: 800 },
  { name: 'スマホ・前の切り替えの URL（?uix=0）', q: '?uix=0', w: 390, h: 844 },
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
    // 新しい画面の束を読んで、上の帯まで出たか（読めなければ失敗の表示が出る）
    await page.waitForSelector('html.is-uxc .ux-crt, .isl-boot-fail', { state: 'attached', timeout: 30_000 });
    if (await page.$('.isl-boot-fail')) throw new Error('読み込みの失敗の表示が出た');
    await page.waitForSelector('.uxm-hud', { state: 'attached', timeout: 30_000 });
    await page.waitForTimeout(5_000);
    if (await page.$('.isl-boot-fail')) throw new Error('読み込みの失敗の表示が出た');
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
