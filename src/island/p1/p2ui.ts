/**
 * 段 P2 の画面の部品（ヒーローの声と適性・組み合わせの図鑑）。計算と文は voice.ts・duo.ts（DOM なし）。
 * 差し込み先：growthui.ts（ヒーローのカードの適性・人事 → ヒーローの育成の上に図鑑）・delegui.ts（任命の候補の適性・着任のあいさつ）・
 * cardui.ts（承認／却下の反応）。仕様は docs/ISLAND_PHASE1.md「ヒーローの声と適性」「ヒーローの組み合わせ」。
 */
import './p2.css';
import { t } from '../../i18n';
import type { DeptId } from './data';
import { bestFits, FIT_KEYS, fitLine, fitName, GRADE_COLOR, gradeOf, lineOf, voiceToast, whyOf, type FitKey, type Scene } from './voice';
import { condName, duoDex, duoFoundN, duosOfHero, DUOS, fxText, KIND_ICON, kindName } from './duo';
import type { Card, Choice, ChooseRes } from './card';
import type { P1State } from './model';
import { h, heroIcon, heroName } from './ui';

/** 適性の札（「人事 S」。S は金・D は赤み） */
export function gradeChip(hero: number, k: FitKey, short = false): HTMLElement | null {
  const g = gradeOf(hero, k);
  if (!g) return null;
  const e = h('span', `isl-p2g is-${g.toLowerCase()}`, short ? g : `${fitName(k)} ${g}`);
  e.style.setProperty('--gc', GRADE_COLOR[g]);
  const why = whyOf(hero, k);
  if (why) e.title = why;
  return e;
}

/**
 * ヒーローのカード（育成）の「史実の適性」：向いている役の札と根拠の 1 行・ひとこと（あいさつ／休みのセリフ）・
 * 部門と役職ごとの 16 の札（開く）・入っている組み合わせの数。調査の無いヒーローは null
 */
export function fitBlock(s: P1State, hero: number, resting = false): HTMLElement | null {
  const best = bestFits(hero);
  if (!best.length) return null;
  const box = h('div', 'isl-p2fit');
  const row = h('div', 'isl-p2fit-best');
  row.append(h('small', 'isl-dim', t('史実の適性', 'Historical fit')));
  for (const k of best) {
    const c = gradeChip(hero, k);
    if (c) row.append(c);
  }
  box.append(row);
  const top = best.find((k) => whyOf(hero, k));
  if (top) box.append(h('small', 'isl-p2fit-why', fitLine(hero, top)));
  const say = lineOf(hero, resting ? 'tired' : 'greet', s.day >> 4);
  if (say) box.append(h('p', 'isl-p2say', `「${say}」`));
  const det = h('details', 'isl-p2fit-all');
  det.append(h('summary', '', t('部門・役職ごとの適性', 'Fit by department and role')));
  const grid = h('div', 'isl-p2fit-grid');
  for (const k of FIT_KEYS) {
    const c = gradeChip(hero, k);
    if (!c) continue;
    const cell = h('div', 'isl-p2fit-cell');
    cell.append(c);
    const w = whyOf(hero, k);
    if (w) cell.append(h('small', 'isl-dim', w));
    grid.append(cell);
  }
  det.append(grid);
  box.append(det);
  const ds = duosOfHero(hero);
  if (ds.length) {
    const n = ds.filter((d) => s.duo?.found[d.id]).length;
    box.append(h('small', 'isl-dim', t(`組み合わせ：${n} / ${ds.length} を見つけた`, `Pairings: found ${n} / ${ds.length}`)));
  }
  return box;
}

/** 任命の候補の 1 行（「人事 S：家臣の才を見抜き登用した」）。調査の無いヒーローは null */
export function fitTag(hero: number, d: DeptId): HTMLElement | null {
  const g = gradeOf(hero, d);
  if (!g) return null;
  const e = h('small', `isl-p2tag is-${g.toLowerCase()}`);
  e.style.setProperty('--gc', GRADE_COLOR[g]);
  e.append(h('b', '', `${fitName(d)} ${g}`));
  const w = whyOf(hero, d).replace(/。$/, '');
  if (w) e.append(h('span', '', t(`：${w}`, '')));
  return e;
}

/** 場面のセリフのトースト（「💬 名前「…」」）。声が無ければ何もしない */
export function sayToast(toast: (x: string) => void, hero: number | null | undefined, scene: Scene, salt = 0) {
  if (hero == null) return;
  const x = voiceToast(hero, scene, heroName(hero), salt);
  if (x) toast(x);
}

/** カードを選んだあと：ヒーローの提案・部長の提案なら、承認（手を打つ）・却下（いまはこのまま）の反応 */
export function cardReact(toast: (x: string) => void, c: Card, ch: Choice, res: ChooseRes) {
  if (!res.ok || c.hero == null) return;
  if (!['clerk', 'crafter', 'buyer', 'idle', 'head', 'hr'].includes(c.src)) return;
  const k = ch.act.k;
  const scene: Scene | null = k === 'do' || k === 'approve' ? 'approved' : k === 'reject' || k === 'skip' ? 'rejected' : null;
  if (scene) sayToast(toast, c.hero, scene, c.id);
}

/** 図鑑（人事 → ヒーローの育成の上）：見つけた組み合わせ（顔・名前・関係・条件・効き目・史実の一言）。未発見は「？？？」で数だけ */
export function dexCard(s: P1State): HTMLElement {
  const c = h('div', 'isl-card2 isl-p2dex');
  const n = duoFoundN(s);
  c.append(h('h3', '', t(`ヒーローの組み合わせ図鑑（${n} / ${DUOS.length}）`, `Hero pairings (${n} / ${DUOS.length})`)));
  c.append(h('small', 'isl-dim', t('史実でつながりのあるヒーローが、同じ会社・町・部門にそろうと見つかります（2 か月目から）。見つけた組み合わせには小さな効き目があります。', 'Heroes linked in history are discovered when they share a company, town or department (from month 2). Found pairings have small effects.')));
  const list = h('div', 'isl-p2dex-list');
  let hidden = 0;
  for (const r of duoDex(s)) {
    if (!r.found) {
      hidden++;
      continue;
    }
    const d = r.def;
    const row = h('div', `isl-p2dex-row is-${d.kind}`);
    const faces = h('div', 'isl-p2dex-faces');
    for (const id of d.heroes) faces.append(heroIcon(id, 36));
    const txt = h('div', 'isl-p2dex-txt');
    const sep = t('・', ' · ');
    txt.append(h('b', '', `${KIND_ICON[d.kind]} ${d.name()}`), h('small', '', `${kindName(d.kind)}${sep}${condName(d.cond)}${fxText(d.kind) ? `${sep}${fxText(d.kind)}` : ''}`), h('small', 'isl-dim', d.note()));
    const rec = s.duo?.found[d.id];
    if (rec?.off) txt.append(h('small', 'isl-good', t('いつもの効き目は止めてある', 'Usual effect turned off')));
    else if (rec?.until != null && rec.until > s.day) txt.append(h('small', 'isl-good', t(`期限つきの効き目：あと ${rec.until - s.day} 日`, `Timed effect: ${rec.until - s.day} days left`)));
    row.append(faces, txt);
    list.append(row);
  }
  if (hidden) {
    const q = h('div', 'isl-p2dex-row is-hidden');
    q.append(h('b', '', t('？？？', '???')), h('small', 'isl-dim', t(`まだ見つけていない組み合わせ ${hidden}`, `${hidden} pairings yet to find`)));
    list.append(q);
  }
  c.append(list);
  return c;
}
