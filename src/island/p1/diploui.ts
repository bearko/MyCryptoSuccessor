/**
 * 外交の一覧（段 UI4。営業 → 商圏の取り合いの画面の 2 つ目の部分）：会ったランドごとの仲の良さ・交易の約束・使者の依頼と、
 * 受け箱に残っている使者の話（押すとカード）。Epic の町に進出してから。計算と文は diplo.ts（DOM なし）。
 * 仕様は docs/ISLAND_PHASE1.md「外交（Epic）」。
 */
import { t } from '../../i18n';
import { DIPLO, PRODUCT } from './data';
import { cardInbox } from './card';
import { showCard, cardNav } from './cardui';
import { LAND_IDS, landDef, relTeaser, type LandRel } from './diplo';
import { DAYS, tierEntered } from './model';
import { after, open, type Ctx } from './screens';
import { h } from './ui';
import { uxh } from '../uix/screens/h-slots';

const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;

/** 使者の顔（仮の絵：ランドの色と紋） */
export function crestEl(land: string): HTMLElement {
  const L = landDef(land);
  const c = h('div', 'isl-crest', L.icon);
  c.style.setProperty('--lc', L.color);
  return c;
}

function landRow(ctx: Ctx, L: LandRel): HTMLElement {
  const s = ctx.s();
  const D = s.diplo!;
  const def = landDef(L.id);
  const row = h('div', 'isl-dip-land');
  row.style.setProperty('--lc', def.color);
  row.append(crestEl(L.id));
  row.append(h('b', '', t(`${def.name}（${def.envoy}）・仲 ${Math.round(L.rel)} / 100`, `${def.name} (${def.envoy}) · Relations ${Math.round(L.rel)} / 100`)));
  const bar = h('div', 'isl-dip-bar');
  const fill = h('i');
  fill.style.width = `${Math.round(L.rel)}%`;
  bar.append(fill);
  bar.title = relTeaser(L.rel);
  row.append(bar);
  const lines: string[] = [];
  const tr = D.trades.find((x) => x.land === L.id);
  if (tr) lines.push(t(`🤝 交易：毎月 ${tr.n} 個・+${Math.round(tr.bonus * 100)}%・あと ${tr.left} か月（守った ${tr.kept}・足りない ${tr.missed}）`, `🤝 Trade: ${tr.n}/mo · +${Math.round(tr.bonus * 100)}% · ${tr.left} mo left (kept ${tr.kept}, short ${tr.missed})`));
  for (const q of D.reqs.filter((x) => x.land === L.id))
    lines.push(t(`📜 依頼：${PRODUCT[q.key]?.name ?? q.key} ${q.got} / ${q.n} 個・あと ${Math.max(0, q.due - s.day)} 日・お礼 ${g(q.reward)}`, `📜 Request: ${PRODUCT[q.key]?.name ?? q.key} ${q.got}/${q.n} · ${Math.max(0, q.due - s.day)}d left · ${g(q.reward)}`));
  if (!lines.length) lines.push(t('いまは約束も依頼もない（次の使者を待とう）', 'No pact or request now (wait for the next envoy)'));
  row.append(h('div', 'isl-dip-row', lines.join('\n')));
  (row.lastChild as HTMLElement).style.whiteSpace = 'pre-line';
  return row;
}

/** 外交の一覧（Epic の町に進出していなければ開かない＝まとめた画面から外れる） */
export function openDiplo(ctx: Ctx) {
  // 段 UIX3h：新しい画面（入のときだけ。uix/screens/misc.ts）
  if (uxh.diplo) return uxh.diplo(ctx);
  const s0 = ctx.s();
  if (!tierEntered(s0, 'E')) return;
  open(ctx, t('外交（霧の向こうのランド）', 'Diplomacy (lands beyond the mist)'), (body) => {
    const s = ctx.s();
    const D = s.diplo;
    const c = h('div', 'isl-card2 isl-dip');
    if (!D?.lands.length) {
      const m = D?.since != null ? Math.round(s.day / DAYS) - D.since : 0;
      c.append(
        h('h3', '', t('まだ使者は来ていない', 'No envoy yet')),
        h('small', 'isl-dim', t(`クリプト・サン・シティの石板「返事の光」を読むか、Epic の町に着いてから ${DIPLO.afterMonths} か月で、霧の向こうから使者が来る（いま ${Math.max(0, m)} か月）。`, `An envoy arrives once you read the “Answering light” tablet in Crypto Sun City, or ${DIPLO.afterMonths} months after reaching Epic (now ${Math.max(0, m)}).`)),
      );
      body.append(c);
      return;
    }
    c.append(h('h3', '', t(`会ったランド ${D.lands.length} / ${LAND_IDS.length}`, `Lands met ${D.lands.length} / ${LAND_IDS.length}`)));
    c.append(h('small', 'isl-dim', relTeaser(Math.max(...D.lands.map((x) => x.rel)))));
    for (const L of D.lands) c.append(landRow(ctx, L));
    // 受け箱に残っている使者の話
    const waiting = cardInbox(s).filter((x) => x.src === 'diplo');
    if (waiting.length) {
      c.append(h('h4', '', t('返事を待っている使者', 'Envoys awaiting an answer')));
      for (const x of waiting) {
        const b = h('button', 'isl-cardbox-row');
        b.type = 'button';
        b.append(crestEl(x.dip!.land), h('span', 'isl-cardbox-txt', t(`${landDef(x.dip!.land).name}の使者の話`, `${landDef(x.dip!.land).name} envoy`)), h('span', 'isl-tag', t('開く', 'Open')));
        (b.firstChild as HTMLElement).style.cssText = 'width:40px;height:40px;border-radius:10px;font-size:22px';
        b.addEventListener('click', () => showCard(ctx, x, { done: () => (cardNav.done ? cardNav.done() : after(ctx)), open: (to) => cardNav.open?.(to) }));
        c.append(b);
      }
    }
    body.append(c);
  });
}
