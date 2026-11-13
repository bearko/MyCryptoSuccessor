// 段 UIX3h：人と管理の新しい画面（職人・採用・人事と給与・ヒーロー・トロフィー・図鑑 ほか。方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md）。
// 入のときだけ新しい画面に分かれること・今の目印が残ること・出す中身が今の画面とそろうこと・主役のキーが前の層に出ること・
// 動きを減らすと全部すぐ出ること。
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { uxhDeps } from '../src/island/p1/uxh';
import { uxsDeps } from '../src/island/p1/uxs';
import { FRONT_SEL } from '../src/island/uix/front';
import { UX_ICONS } from '../src/island/uix/icons';
import { uxh } from '../src/island/uix/screens/h-slots';
import { H_ART, H_ICONS } from '../src/island/uix/screens/h-icons';
import { K_ICONS } from '../src/island/uix/screens/k-icons';
import { S_ICONS } from '../src/island/uix/screens/s-icons';
import { W_ICONS } from '../src/island/uix/screens/w-icons';
import { APT_ORDER, aptPx, aptTicks, enterDelay, rankTone } from '../src/island/uix/screens/h-kit';
import { RANKS, RANK_AT } from '../src/island/p1/heroui';
import { APPRENTICES, newlyPut, slotKey } from '../src/island/uix/screens/staff';
import { MORALE_LAMP, diffWord, markAt } from '../src/island/uix/screens/hr';
import { DUO_ICO, LESSON_ICO, PROMO_FLIP_MS, RELEASE_MS } from '../src/island/uix/screens/hero';
import { TROPHY_ICO, dateText, stampDelay, trophyIco } from '../src/island/uix/screens/trophy';
import { TROPHIES } from '../src/island/p1/trophy';
import { LEGAL_ICO, dealSteps, oddsTone } from '../src/island/uix/screens/legal';
import { RP_PAT, stackPct } from '../src/island/uix/screens/misc';
import { RP_SRCS } from '../src/island/p1/r2';
import { LESSON_TYPES } from '../src/island/p1/lesson';
import { H_ART as _HA } from '../src/island/uix/screens/h-icons';

const src = (f: string) => readFileSync(new URL(`../src/island/${f}`, import.meta.url), 'utf8');
export const H_FILES = ['h-boot.ts', 'h-deps.ts', 'h-slots.ts', 'h-kit.ts', 'h-icons.ts', 'staff.ts', 'hr.ts', 'hero.ts', 'trophy.ts', 'legal.ts', 'misc.ts', 'misc-types.ts'];
export const H_CSS = ['h-screens.css'];
const noComment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const SCREENS = src('p1/screens.ts');
const HRUI = src('p1/hrui.ts');
const ST = src('uix/screens/staff.ts');
const HR = src('uix/screens/hr.ts');
const HE = src('uix/screens/hero.ts');
const ALL_ICONS = new Set([...UX_ICONS, ...K_ICONS, ...S_ICONS, ...W_ICONS, ...Object.keys(_HA)]);

afterEach(() => {
  for (const k of Object.keys(uxh)) delete (uxh as Record<string, unknown>)[k];
});

describe('切り替え：入のときだけ新しい画面に分かれる（切のときは今の画面のまま）', () => {
  it('差し込み口は、はじめは空。入れ物は uix/hooks.ts・中身を入れるのは h-boot.ts（s-boot.ts の install から 1 行で呼ぶ）', () => {
    expect(Object.keys(uxh)).toEqual([]);
    expect(src('uix/screens/h-slots.ts').match(/^import (?!type )/gm)).toBeNull();
    expect(src('uix/screens/h-slots.ts')).toContain("export { uxhSlots as uxh } from '../hooks';");
    expect(src('uix/hooks.ts')).toContain('export const uxhSlots: UxhScreens = {};');
    expect(src('uix/screens/s-boot.ts')).toContain('installH(d.h);');
    expect(src('p1/uxs.ts')).toContain('h: uxhDeps,');
    expect(uxsDeps.h).toBe(uxhDeps);
  });
  it('本体の入口は、関数の頭の 1 行だけ（切のときの作りは今のまま）', () => {
    expect(SCREENS).toMatch(/export function openStaff\(ctx: Ctx\) \{\n  if \(uxh\.staff\) return uxh\.staff\(ctx\);\n  holding = null;/);
    expect(SCREENS).toMatch(/export function openHire\(ctx: Ctx, opts: \{ charisma\?: boolean \} = \{\}\) \{\n  if \(uxh\.hire\) return uxh\.hire\(ctx, opts\);\n  open\(ctx, t\('人材登用'/);
    expect(HRUI).toMatch(/export function openCharisma\(ctx: Ctx\) \{\n[^\n]*\n  if \(uxh\.charisma\) return uxh\.charisma\(ctx\);\n  open\(/);
    expect(HRUI).toMatch(/export function openPayroll\(ctx: Ctx\) \{\n  if \(uxh\.payroll\) return uxh\.payroll\(ctx\);\n  open\(/);
    const boot = src('uix/screens/h-boot.ts');
    expect(src('p1/growthui.ts')).toMatch(/export function openGrowth\(ctx: Ctx, focus\?: number\) \{\n[^\n]*\n  if \(uxh\.growth\) return uxh\.growth\(ctx, focus\);\n  open\(/);
    expect(src('p1/growthui.ts')).toContain('  if (uxh.promotion) return uxh.promotion(root, hero, from, to, done);\n  const ov = h(');
    expect(src('p1/lessonui.ts')).toMatch(/export function openLessons\(ctx: Ctx\) \{\n[^\n]*\n  if \(uxh\.lessons\) return uxh\.lessons\(ctx\);\n  ctx\.root/);
    expect(src('p1/lessonui.ts')).toContain('  if (uxh.lessonPop) return uxh.lessonPop(hero, onOpen);\n  const x = lessonText(hero);');
    expect(src('p1/trophyui.ts')).toMatch(/export function openTrophies\(ctx: Ctx\) \{\n  if \(uxh\.trophies\) return uxh\.trophies\(ctx\);\n  open\(/);
    expect(src('p1/trophyui.ts')).toContain('  if (uxh.trophyPop) return uxh.trophyPop(d);\n  const el = h(');
    expect(src('p1/museumui.ts')).toMatch(/export function openMuseum\(ctx: Ctx\) \{\n[^\n]*\n  if \(uxh\.museum\) return uxh\.museum\(ctx\);\n  pickSlot = null;/);
    const LG = src('p1/legalui.ts');
    expect(LG).toMatch(/export function openLegalMA\(ctx: Ctx, hooks: LegalHooks = \{\}, focusRid\?: string\) \{\n[^\n]*\n  if \(uxh\.legalMA\) return uxh\.legalMA\(ctx, hooks, focusRid\);\n  open\(/);
    for (const [f, k] of [['openContract', 'contract'], ['openPatents', 'patents'], ['openSuits', 'suits']]) expect(LG).toContain(`export function ${f}(ctx: Ctx, hooks: LegalHooks = {}) {\n  if (uxh.${k}) return uxh.${k}(ctx, hooks);\n  open(`);
    expect(src('p1/diploui.ts')).toMatch(/export function openDiplo\(ctx: Ctx\) \{\n[^\n]*\n  if \(uxh\.diplo\) return uxh\.diplo\(ctx\);\n  const s0/);
    expect(SCREENS).toContain('export function openDev(ctx: Ctx) {\n  if (uxh.dev) return uxh.dev(ctx);\n  open(');
    expect(SCREENS).toContain('export function openMA(ctx: Ctx) {\n  if (uxh.ma) return uxh.ma(ctx);\n  open(');
    expect(src('p1/mapsetui.ts')).toContain('  if (uxh.mapSet) return uxh.mapSet(ctx, changed, { MAPSET_ITEMS, mapSetLocked, mapSetOn, toggleMapSet });\n  open(');
    expect(src('p1/r2ui.ts')).toMatch(/export function rpStackEl\(s: P1State\): HTMLElement \{\n[^\n]*\n  if \(uxh\.rpStack\) return uxh\.rpStack\(s\);/);
    expect(src('p1/r2ui.ts')).toContain('  if (uxh.study) return uxh.study(s, o);\n  const box = h(');
    for (const k of ['staff', 'hire', 'charisma', 'payroll', 'growth', 'promotion', 'lessons', 'lessonPop', 'trophies', 'trophyPop', 'museum', 'legalMA', 'contract', 'patents', 'suits', 'diplo', 'dev', 'ma', 'mapSet', 'rpStack', 'study']) expect(boot, k).toMatch(new RegExp(`uxh\\.${k} = \\w+;`));
  });
  it('新しい画面の束は、本体のモジュールを自分では読まない（型だけ）。関数は p1/uxh.ts から渡す', () => {
    for (const f of H_FILES) {
      const code = src(`uix/screens/${f}`);
      expect(code, f).not.toMatch(/from '\.\/(micons|mhooks|mapui|hud|pop|dock)'/);
      for (const m of code.matchAll(/^import (type )?[^;]*? from '([^']+)';/gms)) {
        const outside = /^\.\.\/\.\.\//.test(m[2]);
        if (outside && !m[1]) expect(m[2], `${f}: ${m[0].slice(0, 60)}`).toBe('../../../i18n');
      }
      for (const m of code.matchAll(/\bH\.([A-Za-z_]\w*)/g)) expect(Object.keys(uxhDeps), `${f}: H.${m[1]}`).toContain(m[1]);
      for (const m of code.matchAll(/\bL(?:L|\(\))\.([A-Za-z_]\w*)/g)) expect(Object.keys(uxhDeps.legal), `${f}: L.${m[1]}`).toContain(m[1]);
    }
  });
  it('新しい CSS は、すべて html.is-uxc の内側。class の接頭辞は uxh-。角は丸めない・字は 16px 以上・ぼかさない・層を残さない', () => {
    for (const f of H_CSS) {
      const css = noComment(src(`uix/screens/${f}`));
      const flat = css.replace(/@(media|supports)[^{]*\{/g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
      for (const m of flat.matchAll(/(^|\})\s*([^{}@]+)\{/g)) for (const sel of m[2].split(',')) if (sel.trim()) expect(sel.trim(), f).toMatch(/^html\.is-uxc[ .:]/);
      expect(css, f).not.toMatch(/border-radius\s*:\s*[1-9.]/);
      expect(css, f).not.toMatch(/backdrop-filter/);
      expect(css, f).not.toMatch(/filter\s*:\s*(blur|drop-shadow)/);
      for (const m of css.matchAll(/font-size:\s*([\d.]+)(px|rem)/g)) expect(Number(m[1]) * (m[2] === 'rem' ? 16 : 1), `${f}: ${m[0]}`).toBeGreaterThanOrEqual(16);
      for (const m of css.matchAll(/@keyframes\s+([\w-]+)/g)) expect(m[1], f).toMatch(/^uxh-/);
      for (const m of css.matchAll(/\.(ux[a-z]-[\w-]+)/g)) expect(m[1], f).toMatch(/^(uxh|uxp)-/);
      expect(css, f).not.toMatch(/\b(forwards|both)\b/);
      expect(css, f).not.toMatch(/will-change/);
      // 動きを減らす：この段の動き（入る・めくる・またたく）は、全部止める
      expect(css, f).toMatch(/html\.is-uxc\.is-calm #isl-ui \.uxh-in,/);
    }
  });
  it('足したアイコンは 12×12・土台や同じ束の絵と名前がぶつからない', () => {
    for (const [k, art] of Object.entries(H_ART)) {
      expect(art.length, k).toBe(12);
      for (const row of art) expect(row.length, k).toBe(12);
      for (const other of [UX_ICONS, K_ICONS, S_ICONS, W_ICONS]) expect(other, k).not.toContain(k);
    }
    expect(H_ICONS.length).toBeGreaterThan(0);
  });
  it('絵文字を出さない（この段の画面のコードに、絵文字の字を書かない）', () => {
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
    // 「★」「☆」は字として読める記号（ブランド力の★・研究の段）なので残す
    for (const f of H_FILES) expect(src(`uix/screens/${f}`).replace(/[★☆]/g, ''), f).not.toMatch(emoji);
  });
});

describe('共通の道具（ヒーローの札・段の札・ランクの札・能力の縦の棒）', () => {
  it('能力の棒は、今のレーダーと同じ 6 つの仕事を同じ順で', () => {
    expect(APT_ORDER).toEqual(['buy', 'craft', 'transport', 'shop', 'intel', 'explore']);
    expect(src('p1/heroui.ts')).toContain("const RADAR: Task[] = ['buy', 'craft', 'transport', 'shop', 'intel', 'explore'];");
  });
  it('能力の棒：0〜100 の同じ尺度で底の線から伸び、ランクの境目（本体の RANK_AT）に目盛りの線と字。ランクと数は各棒のすぐ上', () => {
    expect(aptTicks(RANKS, RANK_AT)).toEqual(RANK_AT.map((at, k) => ({ r: RANKS[k + 1], at })));
    expect(aptTicks(RANKS, RANK_AT).map((x) => x.r)).toEqual(['F', 'E', 'D', 'C', 'B', 'A', 'S']);
    // 高さは値に比例（2px の升目）。42 と 43 も同じ尺度で、境目の線とくらべて読める
    expect(aptPx(0, 200)).toBe(0);
    expect(aptPx(50, 200)).toBe(100);
    expect(aptPx(100, 200)).toBe(200);
    expect(aptPx(140, 200)).toBe(200);
    expect(aptPx(0.1, 200)).toBe(2);
    expect(aptPx(43, 200)).toBeGreaterThanOrEqual(aptPx(42, 200));
    const kit = src('uix/screens/h-kit.ts');
    expect(kit).toContain("el('span.uxh-apt-v', { style: { bottom: `${px + 2}px` } }");
    expect(kit).toContain("el('i.uxh-apt-bar', { style: { height: `${px}px` } })");
    expect(kit).toContain('aptTicks(H.RANKS, H.RANK_AT)');
    expect(noComment(src('uix/screens/h-screens.css'))).toMatch(/\.uxh-apt-plot \{[^}]*border-bottom: 2px solid/);
  });
  it('ランクの組（色だけにしない：字と数を必ず出す）', () => {
    expect(rankTone('S')).toBe('top');
    expect(rankTone('A')).toBe('hi');
    expect(rankTone('D')).toBe('mid');
    expect(rankTone('G')).toBe('low');
    expect(src('uix/screens/h-kit.ts')).toContain("el('b.ux-num', r), el('span.ux-num', String(H.aptShow(apt)))");
  });
  it('入る動きは 30ms ずつ・12 枚目からは同じ（たくさん並んでも待たせない）', () => {
    expect(enterDelay(0)).toBe(0);
    expect(enterDelay(3)).toBe(90);
    expect(enterDelay(40)).toBe(360);
  });
  it('動きを減らす：入る動き・飛んで入る札は出さない（isCalm を見る）', () => {
    const kit = src('uix/screens/h-kit.ts');
    expect(kit).toMatch(/export function enter\(els: HTMLElement\[\]\) \{\n  if \(isCalm\(\)\) return;/);
    expect(kit).toMatch(/if \(isCalm\(\) \|\| !to \|\| typeof ghost\.animate !== 'function'\) return;/);
  });
});

describe('ヒーローの配置', () => {
  it('今の目印：枠は .isl-slot（is-empty・is-hot）。チュートリアルの強調は今と同じ条件', () => {
    expect(ST).toContain("cls: `uxh-slot isl-slot${st ? '' : ' is-empty'}${o.hot ? ' is-hot' : ''}`");
    expect(ST).toContain("hot: hot || (ctx.step?.() === 'hire' && !buyer),");
    expect(ST).toContain("hot: hot || (ctx.step?.() === 'haul' && !haulers.length),");
    expect(ST).toContain("H.mineTip(ctx, 'staff', tipBox);");
    expect(ST).toContain("'div.uxh-lanes.isl-lanes'");
    expect(ST).toContain("'section.uxh-sec.uxh-bench.isl-bench-free'");
  });
  it('出す中身が今の画面とそろう：4 つの持ち場・運搬係は 3 人まで・役目の札（1 か月目は出さない）・そのほかの仕事・待機中の名簿・3 つのキー', () => {
    for (const x of ["t('調達', 'Buy')", "t('製造', 'Craft')", "t('物流', 'Haul')", "t('販売', 'Sell')", 'if (haulers.length < H.MAX_HAULERS)', 'if (!ctx.step?.()) {', 'H.rolesCard(ctx, s)', "x.task === 'explore' || x.task === 'intel' || x.task === 'train'", 'H.jobLabel(s, x)', "t('人材登用（雇う）', 'Recruit')", "t('給与・労務', 'Pay & welfare')", "t('ヒーローの育成', 'Hero growth')", "if (s.staff.some((x) => (x.level ?? 1) > 1))", "t('お店が開いたら店員を置けます', 'Assign a clerk once a shop opens')"]) expect(ST, x).toContain(x);
    // 押した先は今と同じ（持っている人をそのまま置く／ヒーローを選ぶ引き出し）
    expect(ST).toContain('H.assign(s, holding, task, target);');
    expect(ST).toContain('H.pickHero(ctx.root, s, {');
  });
  it('置いた枠に「配置」が打たれる（前と今の枠の中身を比べる）', () => {
    expect(slotKey('craft', 1)).toBe('craft:1:0');
    expect(slotKey('transport', null, 2)).toBe('transport::2');
    const a = new Map<string, number | null>([['buy::0', null], ['craft:0:0', 1]]);
    const b = new Map<string, number | null>([['buy::0', 7], ['craft:0:0', 1], ['transport::0', 3]]);
    // 新しく出た枠（前に無かった枠）は打たない：開いた直後に全部打たない
    expect(newlyPut(a, b)).toEqual(['buy::0']);
    expect(newlyPut(new Map(), b)).toEqual([]);
  });
  it('主役のキー（人材登用）は主のキー＝前の層', () => {
    expect(FRONT_SEL).toContain('.ux-key--main');
    expect(ST).toContain("{ kind: 'main', ico: null, cls: 'uxh-k-hire' }");
  });
});

describe('人材登用', () => {
  it('今の目印：.isl-hero-card（is-rec）の中の .isl-btn.is-on で雇う・待機中の人の配置は .isl-btn.is-on（チュートリアルの段で is-guide）', () => {
    expect(ST).toContain("el(`div.uxh-cand.isl-hero-card${rec ? '.is-rec' : ''}");
    expect(ST).toContain("el<HTMLButtonElement>('button.isl-btn.is-on.ux-front.uxh-hire'");
    expect(ST).toContain("el<HTMLButtonElement>(`button.isl-btn.is-on.uxh-go${ctx.step?.() === 'hire' ? '.is-guide' : ''}`");
    expect(ST).toContain("H.mineTip(ctx, 'hire', tipBox);");
  });
  it('はじめにめくっておく札は、チュートリアルなら調達にいちばん向いている人（押す回数は今と同じ）', () => {
    expect(APPRENTICES).toEqual([10001, 10002, 10003]);
    expect(SCREENS).toContain('!s.staff.some((x) => ![10001, 10002, 10003].includes(x.hero))');
    expect(ST).toContain('flipped = recBuy ?? pool[0] ?? null;');
  });
  it('出す中身：契約金と月給・能力（6 つの仕事のランクと数）・候補が 0 人の理由・カリスマ度（1 か月目は出さない）・足りないときは「あと N G」', () => {
    for (const x of ['H.signFee(s, id)', 'H.wageOf(id)', 'aptBars(stats)', 'H.hireEmptyLines(s)', 'charismaPanel(s)', 'H.charismaNeeds(s)', 'uxpGap(s.money, fee)', "if (e === 'money') {", 'gap.nudge();', "t('調達にいちばん向いている', 'Best buyer')", "t('スキル「人材の募集」（人材）を習得すると、ヒーローを雇えるようになります。'"]) expect(ST, x).toContain(x);
    expect(ST).toContain("const later = s.reports.length || (s.sector ?? 'c1') !== 'c1';");
    expect(ST).toContain('if (later && opts.charisma !== false) out.push(charismaPanel(s));');
  });
  it('雇った手応え：札が名簿へ飛び、「採用」が打たれる。契約金は金貨が飛ぶ', () => {
    expect(ST).toContain('flyTo(j.from, target, j.ghost);');
    expect(ST).toContain("uxpStamp(t('採用', 'Hired'), { kind: 'good' })");
    expect(ST).toContain('coinsFly(mid(moneyStat)');
  });
});

describe('人事（カリスマ度・経営者・給与と労務）', () => {
  it('しきい値の印の位置・差の言葉（▲▼ と符号）・士気のランプ', () => {
    expect(markAt(25, 100)).toBe(25);
    expect(markAt(140, 100)).toBe(100);
    expect(diffWord(null)).toBeNull();
    expect(diffWord(0)).toBe('同じ');
    expect(diffWord(5)).toBe('▲ +5');
    expect(diffWord(-3)).toBe('▼ −3');
    expect(Object.keys(MORALE_LAMP).sort()).toEqual(['bad', 'high', 'low', 'ok']);
  });
  it('出す中身が今の画面とそろう：カリスマ度の一言・しきい値・出どころ・次まで・くわしく（上がり方・段ごとの行）・推移・もとのレアリティ', () => {
    for (const x of ['H.charismaLine(s, v)', 'H.charismaSegs(p)', 'H.capAt(nx) - v', 'H.rarityHow(r)', 'H.charismaHist(s.reports)', 'st.baseRarity', "t('まだ 0。町を制覇すると上がる', 'Still 0. Conquer a town to raise it')"]) expect(HR, x).toContain(x);
  });
  it('給与と労務：合計と相場・士気の平均と先月との差・辞めたい・推移（縦の棒）・士気の内訳・引き止め・± 1 段・スタミナ・休ませる・賞与', () => {
    for (const x of ['H.payroll(s)', 'H.marketPay(s, x)', 'H.wantsToQuit(s)', 'H.moraleAvg(s)', 'H.moraleHist(s.reports)', 'H.partsText(s, st)', 'H.quitLeft(s, st)', 'H.talk(s, st.hero)', 'H.cutPay(s, st.hero)', 'H.raise(s, st.hero)', 'H.bonus(s, st.hero)', 'H.setRest(s, st.hero, !st.resting)', 'H.gapText(st)', 'H.marketStep(st)', "H.has(s, 'lounge')"]) expect(HR, x).toContain(x);
    // 並び：辞めたい人 → 士気の低い順（今と同じ）
    expect(HR).toContain('Number(b.quit != null) - Number(a.quit != null) || H.moraleOf(a) - H.moraleOf(b)');
    // 今の目印：data-hero・isl-paycard・is-quit
    expect(HR).toContain("el(`div.uxh-paycard.isl-paycard${st.quit != null ? '.is-quit' : ''}`, { 'data-hero': String(st.hero) })");
  });
  it('グラフは縦（推移は縦の棒）。給与明細は紙・数字は右そろえ', () => {
    expect(HR).toContain("{ max: 100, height: 150, cls: 'uxh-hist' }");
    expect(HR).toContain("uxpPaper(\n          { plain: true, cls: 'uxh-slip' },");
    expect(noComment(src('uix/screens/h-screens.css'))).toMatch(/\.uxh-slip \.uxp-row-v \{\s*margin-left: auto;\s*text-align: right;/);
  });
});

describe('ヒーローの人事票・育成・昇格・教え・組み合わせ図鑑', () => {
  it('人事票：顔・段の札・Lv と経験値・いまの仕事・スタミナ・士気・能力の縦の棒・史実の適性・パッシブ。名簿・そのほかの仕事・育成の札から開く', () => {
    for (const x of ["face(st.hero, 128, { scale: 2", 'rarTag(rar)', 'H.xpNeed(st.level ?? 1)', 'H.jobLabel(ctx.s(), st)', 'moraleTag(st)', 'aptBars(st.stats).el', 'fitPanel(s, st.hero, !!st.resting)', 'passives(st)']) expect(HE, x).toContain(x);
    expect(ST).toContain('openHeroSheet(ctx, hero)');
    expect(HE).toContain("right: uxKey(keyLabel('doc', t('人事票', 'Profile')), () => openHeroSheet(ctx, st.hero)");
  });
  it('担当を外すは 2 回押し（1 回目で「もう一度で外す」・3 秒で戻る）。外せない人（修行・セクター長・リーダー）には出さない', () => {
    expect(RELEASE_MS).toBe(3000);
    expect(HE).toContain("const canFree = st.task != null && st.task !== 'train' && st.task !== 'manager' && st.task !== 'lead';");
    expect(HE).toContain("lab.textContent = t('もう一度で外す', 'Tap again to unassign');");
    expect(HE).toContain('if (!H.releaseHero(ctx.s(), st.hero)) return;');
  });
  it('育成：強化アイテム・教え・組み合わせ図鑑・ヒーローごと（昇格できる人 → Lv の高い順）・昇格のキー（今の目印 isl-hpromo-go）', () => {
    for (const x of ['H.PROMO_ITEMS', "t('入り方：研究成果の発表", 'lessonPanel(ctx, s), dexPanel(s)', 'Number(!H.promoLock(b, s.heroItems)) - Number(!H.promoLock(a, s.heroItems)) || (b.level ?? 1) - (a.level ?? 1)', "cls: 'uxh-promo isl-hpromo-go'", "kind: isMain ? 'main' : ''", 'const isMain = takeMain();', 'H.promote(ctx.s(), st.hero)', "ctx.sfx?.('levelup')", "t('昇格できる', 'Can promote')", 'promoText(s, st)']) expect(HE, x).toContain(x);
  });
  it('昇格：段の札がめくれて上がる（もとの段 → 新しい段・「昇格」が打たれる）。動きを減らすときは、すぐ新しい段', () => {
    expect(PROMO_FLIP_MS).toBeGreaterThanOrEqual(300);
    expect(HE).toContain("flip.classList.add('is-turn');");
    expect(HE).toContain("flip.classList.add('is-done');\n    stamp.show();\n    return;");
    expect(HE).toContain('el(`div.isl-hpfx.uxh-pf.is-${to.toLowerCase()}`');
    expect(HE).toContain("t('タップで進む', 'Tap to continue')");
  });
  it('教えの型・組み合わせの種類は、絵文字の代わりにドットの絵（どれも、どこかの表にある）', () => {
    expect(Object.keys(LESSON_ICO).sort()).toEqual([...LESSON_TYPES].sort());
    for (const v of [...Object.values(LESSON_ICO), ...Object.values(DUO_ICO)]) expect(ALL_ICONS.has(v), v).toBe(true);
    expect(Object.keys(DUO_ICO).sort()).toEqual(['ally', 'kin', 'mentor', 'rival', 'tension']);
  });
  it('教えの図鑑：今と同じ窓の目印（.isl-modal.isl-ls-modal）・型ごとの数は縦の棒・受け継いだ教え・まだの人。お知らせは .isl-toast.isl-ls-pop（帯の着せ替えが組み直さない）', () => {
    expect(HE).toContain("el('div.isl-modal.isl-ls-modal.uxh-lsm')");
    expect(HE).toContain("{ max: top, height, cls: 'uxh-lsbars' }");
    expect(HE).toContain("el('div.isl-toast.isl-ls-pop.uxh-lspop', uxLamp('good', true)");
    expect(src('uix/screens/c-dress.ts')).toContain("if (e.querySelector(':scope > .ux-lamp')) return;");
  });
});

describe('トロフィー（記章の棚）・遺物の展示館', () => {
  const TR = src('uix/screens/trophy.ts');
  it('記章：全部のトロフィーに絵（表に無ければ記章）。取った物は光ってランプ・取った日と何か月目、まだの物は影と条件', () => {
    for (const d of TROPHIES) expect(ALL_ICONS.has(trophyIco(d.id)), d.id).toBe(true);
    expect(Object.keys(TROPHY_ICO).sort()).toEqual(TROPHIES.map((d) => d.id).sort());
    expect(trophyIco('nope')).toBe('medal');
    expect(dateText('2026-11-10T10:00:00Z')).toMatch(/^2026\/11\/1[01]$/);
    expect(dateText('x')).toBe('x');
    // 今の目印：.isl-tr（is-got）・data-trophy（全体の ID）
    expect(TR).toContain("el(\n          `div.uxh-tr.isl-tr${r ? '.is-got' : ''}`,\n          { 'data-trophy': H.globalId(d.id) },");
    for (const x of ['d.cond()', 'd.name()', 'd.from ?', "t('まだ', 'Not yet')", 'Math.floor(r.day / 30) + 1', "t('遊び方ごとの記録です。セーブとは別に、この端末に残ります。'", "t('bearko.games 共通のトロフィーに"]) expect(TR, x).toContain(x);
  });
  it('開いたとき、取った記章が順に打たれる（動きを減らすときは打たれたまま）。取った瞬間の帯も記章が打たれる（今の目印 .isl-toast.isl-tr-pop）', () => {
    expect(stampDelay(0)).toBe(180);
    expect(stampDelay(20)).toBe(180 + 1400);
    expect(TR).toContain('if (!anim || isCalm()) for (const h of hits) h.stamp.show();');
    expect(TR).toContain("el('div.isl-toast.isl-tr-pop.uxh-trpop'");
    // 帯の着せ替え（c-dress）は、記章の頭の i が無いので組み直さない（火花と音はそのまま）
    expect(src('uix/screens/c-dress.ts')).toContain("const i = e.querySelector<HTMLElement>(':scope > i');\n  if (!i || i.dataset.uxc) return;");
  });
  it('展示館：出す中身が今の画面とそろう（価値・来館・入館料・次の節目・推移・節目のボーナス・工事中・枠と錠・式の説明）。選ぶのは引き出し・外す・続けて次の枠', () => {
    for (const x of ['H.museumValue(s)', 'H.museumMarks(s)', 'MB.visitors', 'MB.fee', 'H.museumHist(s.reports)', 'H.museumKnown(s)', 'H.museumOpen(s)', 'H.museumSlots(s)', "t('展示室の増築で', 'Gallery extension')", 'H.exhibitable(s)', 'H.exhibit(s, k, null)', 'H.exhibit(s, k, pick)', "e === 'dup'", "ctx.sfx?.('levelup')", 'H.stars(H.researchOf(s, id))', 'H.relicValue(s, id)', "t(`展示中（枠 ${at + 1}）`", 'const next = (s.museum?.items ?? []).findIndex((x, i) => x == null && i < H.museumSlots(s));']) expect(TR, x).toContain(x);
    // 今の目印：.isl-mus-grid・.isl-mus-slot（is-on・is-empty・is-locked）
    expect(TR).toContain("el('div.uxh-mus-grid.isl-mus-grid')");
    expect(TR).toContain("cls: `uxh-mus-slot isl-mus-slot ${id != null ? 'is-on' : 'is-empty'}`");
    expect(TR).toContain("uxpStamp(t('展示', 'On display'), { kind: 'amber' })");
  });
});

describe('法務（M&A・契約・特許・争い）', () => {
  const LGX = src('uix/screens/legal.ts');
  it('話の段のランプ（打診 → 調査 → 交渉 → 成立）：今の画面と同じ決め方', () => {
    expect(dealSteps('offer', false)).toEqual(['now', '', '', '']);
    expect(dealSteps('talk', false)).toEqual(['done', 'now', '', '']);
    expect(dealSteps('talk', true)).toEqual(['done', 'done', '', '']);
    expect(dealSteps('nego', true)).toEqual(['done', 'done', 'now', '']);
    expect(dealSteps('signed', true)).toEqual(['done', 'done', 'done', 'now']);
  });
  it('見込みの組（色だけにしない：% と言葉）・法務の画面の絵', () => {
    expect(oddsTone(0.7)).toBe('good');
    expect(oddsTone(0.4)).toBe('amber');
    expect(oddsTone(0.1)).toBe('bad');
    expect(oddsTone(0.45, 0.6, 0.4)).toBe('amber');
    for (const v of Object.values(LEGAL_ICO)) expect(ALL_ICONS.has(v), v).toBe(true);
  });
  it('出す中身が今の画面とそろう：Epic の町でないときの紙・他社の一覧と打診・調査・条項・3 段の提示・取り下げ・買った会社・契約・特許・裁判・予告', () => {
    for (const x of ["t('法務の遊びは Epic の町で'", 'L().legalHere(s)', 'LL.startDeal(s, r.id)', 'LL.MA_LOCK_TEXT[lock]()', 'LL.startDD(s, d.id)', 'LL.ddFacts(s, d)', 'LL.clauseSlots(s)', 'LL.offerChance(s, d.rid, lv, c)', 'LL.sendOffer(s, d.id, lv, c)', 'L().cancelDeal(s, d.id)', 'M?.bought.length', 'LL.supplyPenalty(s)', 'LL.cancelSupply(s)', 'LL.signSupply(s, supplyPick.months, supplyPick.c)', 'LL.LEGAL.supply.terms', 'LL.patentable(s)', 'LL.filePatent(s, k)', 'LL.setLicense(s, k, !p.license)', 'LL.sueInfringer(s, k, rid)', 'LL.suitsOpen(s)', 'LL.suitParts(s, x)', 'LL.settle(s, x.id)', 'LL.legalLv(s)', 'LL.LEGAL_MASTERY()', 'LL.CROSS_SALES_LEGAL()', 'LL.CROSS_RND_LEGAL()']) expect(LGX, x).toContain(x);
    // 今の目印（data-focus）
    for (const f of ['ma-deal', 'ma-facts', 'ma-nego', 'ma-clauses', 'ma-list', 'lg-supply', 'lg-patents', 'lg-suits']) expect(LGX, f).toContain(`'data-focus': '${f}'`);
    // 足りないときは「あと N G」（押すと目盛りが進む）。主役（結ぶ・出願）は主のキー
    expect(LGX).toContain("if (lock === 'money') return gap.nudge();");
    expect(LGX).toContain("{ kind: 'main', ico: null, disabled: !!lock, cls: 'uxh-sup-sign' }");
  });
});

describe('外交・商品開発・M&A（法務の前）・地図の表示・研究ポイントの入り方', () => {
  const MI = src('uix/screens/misc.ts');
  it('研究ポイントの入り口：網目と名前の見本（色だけにしない）・積み上げの高さ', () => {
    expect(Object.keys(RP_PAT).sort()).toEqual([...RP_SRCS].sort());
    expect(stackPct(5, 10)).toBe(50);
    expect(stackPct(0, 10)).toBe(0);
    expect(stackPct(30, 10)).toBe(100);
    expect(MI).toContain("months.push({ name: t('今月', 'Now'), v: s.rpSrc ?? {} });");
    expect(MI).toContain('H.retestRp(s)');
    expect(MI).toContain('H.museumRp(s)');
  });
  it('出す中身が今の画面とそろう：外交（仲・交易・依頼・使者）・開発（済み・開発中・開発する・止まる理由）・地図の表示（3 項目・見本・スイッチ・いつ）・研究の施策', () => {
    for (const x of ['H.tierEntered(ctx.s(), \'E\')', 'H.relTeaser(L.rel)', 'D.trades.find((x) => x.land === L.id)', 'D.reqs.filter((x) => x.land === L.id)', "H.cardInbox(s).filter((x) => x.src === 'diplo')", 'H.showCard(c, x,', 's.dev.includes(p.key)', 's.lab?.key === p.key', 'H.develop(s, p.key)', "H.has(s, 'pot')", 'api.MAPSET_ITEMS', 'api.toggleMapSet(ctx.s(), key)', 'api.mapSetLocked(s, key)', 'H.MARK_LEGEND', 'H.studyByHead(s)', 'H.runStudy(s, k)', 'H.studyDone(s, k)']) expect(MI, x).toContain(x);
    // 今の目印：地図の表示の札（data-key・role=switch）
    expect(MI).toContain("el('div.uxh-ms.isl-mapset-item', { 'data-key': key })");
    expect(MI).toContain("role: 'switch', 'aria-checked': String(on)");
  });
});
