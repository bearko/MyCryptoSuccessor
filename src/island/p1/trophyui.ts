/**
 * 段 UI6：トロフィー（実績）の一覧と、取ったときの帯。判定と保存は trophy.ts（DOM なし）。
 * 一覧はシステム → 設定の画面にまとめる（サブタブは増やさない）。アイコンは仮の絵（絵文字。docs/ISLAND_ART_TODO.md）。
 */
import './ui6.css';
import { t } from '../../i18n';
import type { P1State } from './model';
import { open, type Ctx } from './screens';
import { h } from './ui';
import { TROPHIES, checkTrophies, globalId, loadTrophies, saveTrophies, type TrophyBook, type TrophyDef } from './trophy';

/** 手元の記録（はじめに 1 回だけ読む。書けなくても、このセッションのあいだは覚えておく） */
let book: TrophyBook | null = null;
export const trophyBook = (): TrophyBook => (book ??= loadTrophies());
/** テスト・撮影：手元の記録を読み直す */
export const resetTrophyBook = () => (book = null);

/** いまの状態で判定し、新しく取ったものを保存して返す（main.ts が 1 日ごとに呼ぶ） */
export function trophyTick(s: P1State): TrophyDef[] {
  const b = trophyBook();
  const got = checkTrophies(s, b);
  if (got.length) saveTrophies(b);
  return got;
}

/** 取ったときの帯（画面の上。4 秒で消える） */
export function trophyPop(root: HTMLElement, d: TrophyDef) {
  const el = h('div', 'isl-tr-pop');
  const txt = h('span');
  txt.append(h('small', '', t('🏆 トロフィーを手に入れた！', '🏆 Trophy unlocked!')), h('b', '', d.name()));
  el.append(h('i', '', d.icon), txt);
  root.append(el);
  setTimeout(() => el.remove(), 4200);
}

const dateText = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};

/** トロフィーの一覧（システム → 設定） */
export function openTrophies(ctx: Ctx) {
  open(ctx, t('トロフィー', 'Trophies'), (body) => {
    const b = trophyBook();
    const n = TROPHIES.filter((x) => b.got[x.id]).length;
    const head = h('div', 'isl-tr-head');
    head.append(h('b', '', `🏆 ${n} / ${TROPHIES.length}`), h('small', 'isl-dim', t('遊び方ごとの記録です。セーブとは別に、この端末に残ります。', 'Records of how you play, kept on this device apart from your save.')));
    body.append(head);
    const list = h('div', 'isl-tr-list');
    for (const d of TROPHIES) {
      const r = b.got[d.id];
      const row = h('div', `isl-tr ${r ? 'is-got' : ''}`);
      row.dataset.trophy = globalId(d.id);
      row.append(h('span', 'isl-tr-icon', d.icon), h('b', '', d.name()), h('small', '', d.cond()));
      const foot = h('small', r ? 'isl-tr-date' : 'isl-dim');
      foot.textContent = r ? t(`取った日 ${dateText(r.at)}（ゲームの ${Math.floor(r.day / 30) + 1} か月目）`, `Earned ${dateText(r.at)} (game month ${Math.floor(r.day / 30) + 1})`) : t('まだ', 'Not yet');
      if (d.from) foot.textContent += t(`・名前は${d.from()}から`, ` · named after ${d.from()}`);
      row.append(foot);
      list.append(row);
    }
    body.append(list);
    body.append(h('p', 'isl-dim', t('bearko.games 共通のトロフィーに、あとでまとめて登録できるようにしています（準備中）。', 'These can later be registered to the shared bearko.games trophies (coming soon).')));
  });
}
