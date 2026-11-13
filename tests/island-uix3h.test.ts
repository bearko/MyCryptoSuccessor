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
import { APT_ORDER, enterDelay, rankTone } from '../src/island/uix/screens/h-kit';
import { APPRENTICES, newlyPut, slotKey } from '../src/island/uix/screens/staff';
import { MORALE_LAMP, diffWord, markAt } from '../src/island/uix/screens/hr';
import { DUO_ICO, LESSON_ICO, PROMO_FLIP_MS, RELEASE_MS } from '../src/island/uix/screens/hero';
import { LESSON_TYPES } from '../src/island/p1/lesson';
import { H_ART as _HA } from '../src/island/uix/screens/h-icons';

const src = (f: string) => readFileSync(new URL(`../src/island/${f}`, import.meta.url), 'utf8');
export const H_FILES = ['h-boot.ts', 'h-deps.ts', 'h-slots.ts', 'h-kit.ts', 'h-icons.ts', 'staff.ts', 'hr.ts', 'hero.ts'];
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
    for (const k of ['staff', 'hire', 'charisma', 'payroll', 'growth', 'promotion', 'lessons', 'lessonPop']) expect(boot, k).toMatch(new RegExp(`uxh\\.${k} = \\w+;`));
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
    for (const f of H_FILES) expect(src(`uix/screens/${f}`), f).not.toMatch(emoji);
  });
});

describe('共通の道具（ヒーローの札・段の札・ランクの札・能力の縦の棒）', () => {
  it('能力の棒は、今のレーダーと同じ 6 つの仕事を同じ順で', () => {
    expect(APT_ORDER).toEqual(['buy', 'craft', 'transport', 'shop', 'intel', 'explore']);
    expect(src('p1/heroui.ts')).toContain("const RADAR: Task[] = ['buy', 'craft', 'transport', 'shop', 'intel', 'explore'];");
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
    for (const x of ['H.PROMO_ITEMS', "t('入り方：研究成果の発表", 'lessonPanel(ctx, s), dexPanel(s)', 'Number(!H.promoLock(b, s.heroItems)) - Number(!H.promoLock(a, s.heroItems)) || (b.level ?? 1) - (a.level ?? 1)', "cls: 'uxh-promo isl-hpromo-go'", "kind: 'main'", 'H.promote(ctx.s(), st.hero)', "ctx.sfx?.('levelup')", "t('昇格できる', 'Can promote')", 'promoText(s, st)']) expect(HE, x).toContain(x);
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
