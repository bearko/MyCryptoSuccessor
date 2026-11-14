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
import { fxLine, lessonCounts, lessonDex, lessonFx, lessonTypeName, lessonLive, LESSON_COLOR, LESSON_ICON, LESSON_TYPES } from './lesson';
import type { LessonType } from './data';
import type { P1State } from './model';
import type { Ctx } from './screens';
import { btn, h } from './ui';
import { uxh } from '../uix/screens/h-slots';

/** 型の札（アイコンと名前。縁の色は型ごと） */
export function typeChip(k: LessonType, n?: number): HTMLElement {
  const e = h('span', 'isl-ls-chip', `${LESSON_ICON[k]} ${lessonTypeName(k)}${n != null ? ` ${n}` : ''}`);
  e.style.setProperty('--lc', LESSON_COLOR[k]);
  return e;
}

/** 受け継いだときのお知らせ（main.ts がトーストの列に入れる。押すと図鑑） */
export function lessonPopEl(hero: number, onOpen?: () => void): HTMLElement {
  return uxh.lessonPop!(hero, onOpen);
}

/** 型ごとの数の横棒（数の多い順でなく、型の順＝いつも同じ並び）。効き目の上限（LESSON.cap）に線と「上限」の字 */
export function typeBars(s: P1State, compact = false): HTMLElement {
  const c = lessonCounts(s);
  const top = Math.max(LESSON.cap + 1, ...LESSON_TYPES.map((k) => c[k]));
  const box = h('div', `isl-ls-bars ${compact ? 'is-compact' : ''}`);
  box.setAttribute('role', 'img');
  const list = LESSON_TYPES.map((k) => `${lessonTypeName(k)} ${c[k]}`).join(t('・', ', '));
  box.setAttribute('aria-label', t(`教えの型ごとの数：${list}`, `Lessons by type: ${list}`));
  for (const k of LESSON_TYPES) {
    const row = h('div', 'isl-ls-bar');
    row.title = t(`${lessonTypeName(k)}：${c[k]}（${fxLine(k, lessonLive(s, k))}）`, `${lessonTypeName(k)}: ${c[k]} (${fxLine(k, lessonLive(s, k))})`);
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

/**
 * 教えの図鑑（人事 → 育成の小さなカード・お知らせから）。画面（シート）の中でなく、ほかの窓と同じ層の窓（.isl-modal）に出す：
 * スマホでシートの見出しの下に付く部門の帯（sticky）が、図鑑の上に重ならないように。✕・外を押す・Esc で閉じる（下の育成の画面はそのまま）
 */
export function openLessons(ctx: Ctx) {
  // 段 UIX3h：新しい画面（uix/screens/hero.ts）
  return uxh.lessons!(ctx);
}

/** 提案書の「読みの確かさ」の横：数字の教えで小さくなった誤差の札（効いていなければ null） */
export function errChip(s: P1State): HTMLElement | null {
  const v = lessonFx(s, 'err');
  if (v <= 0) return null;
  const e = h('small', 'isl-ls-errchip', t(`${LESSON_ICON.numbers} 数字の教えで誤差 −${Math.round(v * 100)}%`, `${LESSON_ICON.numbers} lessons: error −${Math.round(v * 100)}%`));
  e.title = t('受け継いだ数字の教えの数だけ、提案の予測の誤差が小さくなる（見込みの数字とリスクの見積もりに効く）', 'Numbers lessons shrink the read error of proposals (affects estimates and risks)');
  return e;
}
