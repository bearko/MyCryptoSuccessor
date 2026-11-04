/**
 * 段 S1：教えの画面（DOM）。決まりと文は lesson.ts（DOM なし）。
 * - 受け継いだときのお知らせ（画面の中の大事な知らせ。トーストの列に入れる：main.ts の lessonFlush）：ヒーローの顔・その人の言葉・「教え：○○を受け継いだ」・効き目。
 * - 人事 → ヒーローの育成の上に、受け継いだ数と型ごとの横棒の小さなカード（「教えの図鑑」を開く）。
 * - 教えの図鑑：型ごとの数の横棒（効き目の上限の線）・いまの効き目・受け継いだ教え・まだのヒーローのシルエット（いま会社にいる人）・残りの数。
 * - 提案書の「読みの確かさ」の横に、数字の教えで小さくなった誤差の札。
 * 絵は仮（型のアイコンは絵文字・図鑑の枠は CSS）。docs/ISLAND_ART_TODO.md。
 */
import './lesson.css';
import { t } from '../../i18n';
import { LESSON } from './data';
import { fxLine, lessonCounts, lessonDex, lessonFx, lessonText, lessonTypeName, lessonLive, LESSON_COLOR, LESSON_ICON, LESSON_TYPES, type LessonRow } from './lesson';
import type { LessonType } from './data';
import type { P1State } from './model';
import { open, type Ctx } from './screens';
import { btn, h, heroIcon, heroName } from './ui';

/** 型の札（アイコンと名前。縁の色は型ごと） */
export function typeChip(k: LessonType, n?: number): HTMLElement {
  const e = h('span', 'isl-ls-chip', `${LESSON_ICON[k]} ${lessonTypeName(k)}${n != null ? ` ${n}` : ''}`);
  e.style.setProperty('--lc', LESSON_COLOR[k]);
  return e;
}

/** 受け継いだときのお知らせ（main.ts がトーストの列に入れる。押すと図鑑） */
export function lessonPopEl(hero: number, onOpen?: () => void): HTMLElement {
  const x = lessonText(hero);
  const el = h('div', 'isl-toast isl-ls-pop');
  el.append(heroIcon(hero, 44));
  const txt = h('span', 'isl-ls-pop-txt');
  if (x) {
    txt.append(h('small', 'isl-ls-pop-who', t(`${heroName(hero)}「${x.body}」`, `${heroName(hero)}: “${x.body}”`)));
    const b = h('b', '', t(`📜 教え：「${x.name}」を受け継いだ`, `📜 Lesson inherited: “${x.name}”`));
    txt.append(b);
    const fx = h('small', 'isl-ls-pop-fx');
    fx.append(typeChip(x.type), document.createTextNode(` ${fxLine(x.type)}`));
    txt.append(fx);
  }
  el.append(txt);
  if (onOpen) {
    el.classList.add('is-tap');
    el.addEventListener('click', onOpen);
  }
  return el;
}

/** 型ごとの数の横棒（数の多い順でなく、型の順＝いつも同じ並び）。効き目の上限（LESSON.cap）に線と「上限」の字 */
export function typeBars(s: P1State, compact = false): HTMLElement {
  const c = lessonCounts(s);
  const top = Math.max(LESSON.cap + 1, ...LESSON_TYPES.map((k) => c[k]));
  const box = h('div', `isl-ls-bars ${compact ? 'is-compact' : ''}`);
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', t(`教えの型ごとの数：${LESSON_TYPES.map((k) => `${lessonTypeName(k)} ${c[k]}`).join('・')}`, `Lessons by type: ${LESSON_TYPES.map((k) => `${lessonTypeName(k)} ${c[k]}`).join(', ')}`));
  for (const k of LESSON_TYPES) {
    const row = h('div', 'isl-ls-bar');
    row.title = `${lessonTypeName(k)}：${c[k]}（${fxLine(k, lessonLive(s, k))}）`;
    const name = h('span', 'isl-ls-bar-name', `${LESSON_ICON[k]} ${lessonTypeName(k)}`);
    const track = h('span', 'isl-ls-bar-track');
    const fill = h('i', `isl-ls-bar-fill ${c[k] >= LESSON.cap ? 'is-cap' : ''}`);
    fill.style.width = `${(c[k] / top) * 100}%`;
    fill.style.setProperty('--lc', LESSON_COLOR[k]);
    const cap = h('i', 'isl-ls-bar-cap');
    cap.style.left = `${(LESSON.cap / top) * 100}%`;
    track.append(fill, cap);
    row.append(name, track, h('b', 'isl-ls-bar-n', String(c[k])));
    if (!compact) row.append(h('small', `isl-ls-bar-fx ${c[k] ? 'isl-good' : 'isl-dim'}`, c[k] ? fxLine(k, lessonLive(s, k)) : t('まだ', 'none yet')));
    box.append(row);
  }
  return box;
}
const capNote = () => t(`縦の線＝効き目の上限（1 つの型で ${LESSON.cap} つまで）`, `Line = effect cap (${LESSON.cap} per type)`);

/** 人事 → ヒーローの育成の上：受け継いだ数と型ごとの横棒（小）・図鑑を開く */
export function lessonCard(ctx: Ctx, s: P1State): HTMLElement {
  const d = lessonDex(s);
  const c = h('div', 'isl-card2 isl-ls-card');
  c.append(h('h3', '', t(`📜 受け継いだ教え（${d.got.length} / ${d.total}）`, `📜 Lessons inherited (${d.got.length} / ${d.total})`)));
  c.append(h('small', 'isl-dim', t('偉人たちと仕事を重ねると、その人の仕事の流儀が「教え」として社長に残ります。型ごとに、社長の判断が少し強くなります。', 'Work alongside the greats and their way of working stays with you as a lesson. Each type makes your calls a little stronger.')));
  c.append(typeBars(s, true));
  c.append(btn(t('📜 教えの図鑑を開く', '📜 Open lessons'), () => openLessons(ctx), 'isl-ls-open'));
  return c;
}

/** 受け継いだ教えの 1 行（顔・名前・型・教えの名前・その人の言葉・もと・受け継いだ月） */
function gotRow(r: LessonRow): HTMLElement {
  const x = lessonText(r.hero);
  const row = h('div', 'isl-ls-row');
  row.style.setProperty('--lc', LESSON_COLOR[r.type]);
  const txt = h('div', 'isl-ls-row-txt');
  const head = h('div', 'isl-ls-row-head');
  head.append(typeChip(r.type), h('small', 'isl-dim', heroName(r.hero)));
  txt.append(head, h('b', 'isl-ls-name', x?.name ?? ''));
  if (x?.body) txt.append(h('p', 'isl-ls-say', t(`「${x.body}」`, `“${x.body}”`)));
  if (x?.root) txt.append(h('small', 'isl-ls-root', t(`もと：${x.root}`, `From: ${x.root}`)));
  const g = r.got!;
  txt.append(h('small', 'isl-dim', g.via === 'prop' ? t(`承認した提案が効いて受け継いだ（${Math.floor(g.day / 30) + 1} か月目）`, `Inherited when an approved proposal worked (month ${Math.floor(g.day / 30) + 1})`) : t(`仕事を重ねて受け継いだ（${Math.floor(g.day / 30) + 1} か月目）`, `Inherited by working together (month ${Math.floor(g.day / 30) + 1})`)));
  row.append(heroIcon(r.hero, 44), txt);
  return row;
}
/** まだのヒーロー（いま会社にいる人）：シルエットと型・かかわった回数 */
function nearCell(r: LessonRow): HTMLElement {
  const cell = h('div', 'isl-ls-sil');
  const face = heroIcon(r.hero, 40);
  face.classList.add('isl-ls-shadow');
  cell.append(face, h('small', '', heroName(r.hero)), h('small', 'isl-dim', `${LESSON_ICON[r.type]} ${t(`${Math.min(r.met, LESSON.need)} / ${LESSON.need}`, `${Math.min(r.met, LESSON.need)} / ${LESSON.need}`)}`));
  cell.title = t(`型：${lessonTypeName(r.type)}・かかわった回数 ${r.met} / ${LESSON.need}（提案を承認して効けば、すぐ受け継ぐ）`, `Type: ${lessonTypeName(r.type)} · worked together ${r.met} / ${LESSON.need} (or inherit right away when an approved proposal works)`);
  return cell;
}

/** 教えの図鑑（人事 → 育成の小さなカードから） */
export function openLessons(ctx: Ctx) {
  open(ctx, t('教えの図鑑', 'Lessons'), (body) => {
    const s = ctx.s();
    const d = lessonDex(s);
    const head = h('div', 'isl-card2 isl-ls-head');
    head.append(h('h3', '', t(`📜 受け継いだ教え ${d.got.length} / ${d.total}`, `📜 Lessons inherited ${d.got.length} / ${d.total}`)));
    head.append(
      h(
        'small',
        'isl-dim',
        t(
          `ヒーローの提案を承認して、翌月の締めで見込みどおりに数字が動いたとき、またはそのヒーローと ${LESSON.need} 回仕事でかかわったとき（カード・部長との会話・組み合わせ・経営会議）、月の締めで 1 人から 1 つ残ります（2 か月目から・1 回の締めで ${LESSON.perMonth} つまで）。`,
          `When a hero’s approved proposal moves the numbers as expected at next month’s close, or after working with them ${LESSON.need} times (cards, talks with heads, pairings, board meetings), one lesson per hero stays at the monthly close (from month 2; ${LESSON.perMonth} per close).`,
        ),
      ),
    );
    body.append(head);
    // 型ごとの数（横棒）といまの効き目
    const chart = h('div', 'isl-card2 isl-ls-chart');
    const most = LESSON_TYPES.map((k) => [k, lessonCounts(s)[k]] as const).sort((a, b) => b[1] - a[1])[0];
    chart.append(h('h3', '', d.got.length ? t(`いちばん多いのは${lessonTypeName(most[0])}の教え（${most[1]} つ）`, `Most common: ${lessonTypeName(most[0])} (${most[1]})`) : t('型ごとの数（まだ 0）', 'By type (none yet)')));
    chart.append(typeBars(s), h('small', 'isl-dim', capNote()));
    body.append(chart);
    // 受け継いだ教え
    const got = h('div', 'isl-card2 isl-ls-got');
    got.append(h('h3', '', t('受け継いだ教え', 'Inherited')));
    if (!d.got.length) got.append(h('p', 'isl-dim', t('まだありません。ヒーローの提案を承認して、手が効くのを待とう。', 'None yet. Approve a hero’s proposal and wait for it to pay off.')));
    for (const r of d.got) got.append(gotRow(r));
    body.append(got);
    // まだのヒーロー
    const near = h('div', 'isl-card2 isl-ls-near');
    near.append(h('h3', '', t(`まだの教え（いま会社にいる ${d.near.length} 人）`, `Not yet (${d.near.length} in your company)`)));
    const grid = h('div', 'isl-ls-sils');
    for (const r of d.near) grid.append(nearCell(r));
    if (d.near.length) near.append(grid);
    near.append(h('small', 'isl-dim', t(`ほかに ${d.rest} 人の偉人の教えがあります（雇うと、ここに並びます）。`, `${d.rest} more greats have lessons to share (hire them to see them here).`)));
    body.append(near);
  });
}

/** 提案書の「読みの確かさ」の横：数字の教えで小さくなった誤差の札（効いていなければ null） */
export function errChip(s: P1State): HTMLElement | null {
  const v = lessonFx(s, 'err');
  if (v <= 0) return null;
  const e = h('small', 'isl-ls-errchip', t(`${LESSON_ICON.numbers} 数字の教えで誤差 −${Math.round(v * 100)}%`, `${LESSON_ICON.numbers} lessons: error −${Math.round(v * 100)}%`));
  e.title = t('受け継いだ数字の教えの数だけ、提案の読みの誤差が小さくなる（見込みの数字とリスクの見積もりに効く）', 'Numbers lessons shrink the read error of proposals (affects estimates and risks)');
  return e;
}
