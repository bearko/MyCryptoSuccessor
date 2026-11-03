/**
 * 段 UI4（追加の要望）：工房の作る物を A から B に替えたとき、主力商品が A のお店をまとめて B に替える小さなシート。
 * 一覧（店の名前・いまの主力・A の数）・店ごとのチェック（初めは全部オン）・「まとめて替える」「替えない」。A の残りの扱いを 1 行で。
 * チュートリアル（1 か月目）・A を主力に並べているお店が無いときは出さない（model.ts の bulkMainRows が空）。計算は model.ts（bulkMainRows・bulkMainNote・bulkMain）。
 */
import { t } from '../../i18n';
import { DEF } from '../defs';
import { bulkMain, bulkMainNote, bulkMainRows, type P1State } from './model';
import { after, type Ctx } from './screens';
import { btn, h, skuIcon, skuName } from './ui';
import type { Sku } from './data';

export function offerBulk(ctx: Ctx, a: Sku, b: Sku, done?: () => void): boolean {
  const s: P1State = ctx.s();
  const rows = bulkMainRows(s, a, b);
  if (!rows.length) return false;
  ctx.root.querySelector('.isl-bulk')?.remove();
  const note = bulkMainNote(s, a, rows);
  const on = new Set(rows.map((r) => r.uid));
  const m = h('div', 'isl-modal isl-bulk');
  const p = h('div', 'isl-bulk-panel');
  const head = h('div', 'isl-bulk-head');
  head.append(skuIcon(a, 40), h('span', 'isl-bulk-arrow', '→'), skuIcon(b, 40));
  p.append(head, h('b', 'isl-bulk-title', t(`お店の主力商品も${skuName(b)}に替えますか？`, `Switch the shops’ main product to ${skuName(b)} too?`)));
  const list = h('div', 'isl-bulk-list');
  for (const r of rows) {
    const bd = s.buildings.find((x) => x.uid === r.uid);
    const row = h('button', 'isl-bulk-row is-on');
    row.type = 'button';
    row.dataset.uid = String(r.uid);
    const box = h('span', 'isl-bulk-check', '✔');
    const nm = DEF[bd?.id ?? '']?.name ?? t('お店', 'Shop');
    row.append(box, h('span', 'isl-bulk-name', nm), h('small', '', t(`主力：${skuName(a)}・在庫 ${r.stock} 個`, `Main: ${skuName(a)} · ${r.stock} in stock`)));
    row.addEventListener('click', () => {
      if (on.has(r.uid)) on.delete(r.uid);
      else on.add(r.uid);
      row.classList.toggle('is-on', on.has(r.uid));
      box.textContent = on.has(r.uid) ? '✔' : '';
      go.disabled = !on.size;
    });
    list.append(row);
  }
  p.append(list);
  // A の残りの扱い（1 行）
  const line =
    note.left > 0 || note.still
      ? note.shelf2 > 0
        ? t(`${skuName(a)}の在庫 ${note.left} 個は、売り切るまで棚の 2 段目へ${note.still ? '（ほかの作業台でまだ作っている）' : ''}`, `The ${note.left} ${skuName(a)} left move to the 2nd shelf until sold${note.still ? ' (another bench still makes it)' : ''}`)
        : t(`${skuName(a)}の在庫 ${note.left} 個は、お店の裏に戻る（空いた棚が無い）`, `The ${note.left} ${skuName(a)} left go back to storage (no free shelf)`)
      : t(`${skuName(a)}の在庫は残っていない`, `No ${skuName(a)} left in stock`);
  p.append(h('small', 'isl-bulk-note', line));
  const row = h('div', 'isl-bulk-btns');
  const close = () => {
    m.remove();
    done?.();
  };
  const go = btn(t('まとめて替える', 'Switch them all'), () => {
    const n = bulkMain(ctx.s(), a, b, [...on]);
    ctx.sfx?.('levelup');
    ctx.toast(t(`${n} 軒のお店の主力商品を${skuName(b)}にしました`, `Main product set to ${skuName(b)} in ${n} shop(s)`));
    ctx.save();
    close();
    after(ctx);
  }, 'is-on');
  row.append(go, btn(t('替えない', 'Keep as is'), close));
  p.append(row);
  m.append(p);
  ctx.root.append(m);
  ctx.sfx?.('page');
  return true;
}
