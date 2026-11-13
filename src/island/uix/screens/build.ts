/**
 * 段 UIX4r：建築の札（p1/main.ts の openBuildSheet。器は今の札・押した先・チュートリアルの目印は今のまま）。
 * 種類はキーの列（開いている種類は沈んでランプ）・建物は板の札（建物の絵・名前・値段・工期と維持費・足りなければ「あと N G」の目盛り）。
 * 今の目印：建物 .isl-bcard（is-guide・is-poor・is-off・is-secret）・並び .isl-bgrid。押す順も今と同じ（札を 1 回押す）。種類のキーは管制卓のキー（uxr-bcat・aria-pressed）。
 */
import { t } from '../../../i18n';
import type { BuildCardView, BuildCatView, BuildView } from './r-slots';
import { el } from '../dom';
import { press, uxKey, uxLamp } from '../parts';
import { uxpGap, uxpPrice } from '../sparts';
import { isCalm } from '../prefs';
import { hIcon } from './h-kit';
import { rLine } from './sector';

/** 種類の絵（今の絵文字の代わり。土台・ほかの段の絵の流用：docs/ISLAND_ART_TODO.md） */
export const CAT_ICO: Record<string, string> = { base: 'office', shop: 'shop', logi: 'box', food: 'cup', fun: 'star', big: 'crane', relic: 'pillar' };
const lite = { color: '#f4ecd4', hi: '#fffdf3', lo: '#0b0d17', scale: 1 };
const ink = { color: '#1a1c2e', hi: '#1a1c2e', lo: '#8a7f5c', scale: 1 };
const amb = { color: '#ffb81f', hi: '#ffe394', lo: '#7a3f06', scale: 1 };

function catKey(c: BuildCatView): HTMLElement {
  const b = uxKey(
    el('span.uxr-bc-k', hIcon(c.open ? (CAT_ICO[c.id] ?? 'list') : 'lock', c.on ? ink : c.open ? lite : { ...lite, color: '#97a1cf' }), el('b', c.name), el('span.ux-num.uxr-bc-n', `${c.known}/${c.total}`), c.isNew ? hIcon('star4', amb) : null),
    () => c.pick(),
    { cls: `uxr-bcat${c.on ? ' is-on' : ''}${c.open ? '' : ' is-lock'}${c.isNew ? ' is-unlocking' : ''}`, attrs: { 'aria-pressed': String(c.on), 'data-cat': c.id } },
  );
  return b;
}

function buildCard(c: BuildCardView, money: number, i: number): HTMLElement {
  const off = !!c.err && c.err !== 'money';
  const poor = c.err === 'money';
  const card = el<HTMLButtonElement>(`button.isl-bcard.uxr-bcard${c.secret ? '.is-secret' : ''}${poor ? '.is-poor' : ''}${off ? '.is-off' : ''}${c.guide ? '.is-guide.ux-front' : ''}`, { type: 'button', 'data-build': c.id, style: `--d:${Math.min(i, 8) * 40}ms` });
  if (c.secret) {
    card.append(el('span.uxr-bcard-pic.is-q', hIcon('lock', { ...lite, color: '#4a5486', hi: '#97a1cf', lo: '#20253d', scale: 3 })), el('span.uxr-bcard-body', el('b.uxr-bcard-name', '???'), rLine(null, c.hint, 'dim')));
  } else {
    const price = c.err === 'limit' ? el('span.ux-tape.ux-tape--good.uxr-bcard-done', hIcon('check', ink), el('b', c.cost)) : c.err === 'locked' ? rLine('lock', c.cost, 'dim') : uxpPrice(c.costN);
    const gap = poor ? uxpGap(money, c.costN) : null;
    card.append(
      el('span.uxr-bcard-pic', c.img ?? null),
      el(
        'span.uxr-bcard-body',
        el('span.uxr-bcard-top', el('b.uxr-bcard-name', c.name), c.guide ? uxLamp('', true, !isCalm()) : null),
        el('span.uxr-bcard-cost', price),
        c.note ? el('span.uxr-bcard-note', c.note) : null,
        el('span.uxr-bcard-spec', hIcon('cal', { ...lite, color: '#97a1cf' }), el('span', c.spec)),
        gap ? gap.el : null,
      ),
    );
    if (gap) card.dataset.short = '1';
  }
  // 押した瞬間に沈む（押した先は今と同じ：建てられなければ音とお知らせ）
  press(card, () => c.pick());
  return card;
}

export function buildUx(body: HTMLElement, v: BuildView) {
  body.classList.add('uxr-bd-body');
  const root = el('div.uxr-bd.ux-root');
  if (v.lotNote) root.append(rLine('pin', v.lotNote, 'gold'));
  const cats = el('div.uxr-bcats', { role: 'group', 'aria-label': t('建物の種類', 'Building types') }, v.cats.map(catKey));
  root.append(cats);
  // せまい画面で 1 行に送るとき：開いている種類が見える所まで
  requestAnimationFrame(() => {
    const on = cats.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (on && cats.scrollWidth > cats.clientWidth) cats.scrollLeft = Math.max(0, on.offsetLeft - cats.offsetLeft - 8);
  });
  if (v.emptyNote) root.append(rLine('lock', v.emptyNote, 'dim'));
  root.append(el('div.isl-bgrid.uxr-bgrid', v.cards.map((c, i) => buildCard(c, v.money, i))));
  body.append(root);
}
