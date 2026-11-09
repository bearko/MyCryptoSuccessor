/**
 * 段 TRADE1b：物流拠点の吹き出しの「📦 輸入」（DOM）。この拠点が境の拠点になっているとなり町ごとに、相手の工房の商品の札を並べる。
 * 各札：商品の絵・この町の需要の倍率（gap なら「まだ誰も売っていない」）・1 週の数の上限・1 個の仕入れ値（関税込み）。
 * 押すと選び、もう一度押すと外す。選んだ札は金色の枠と「✓ 輸入中」（色だけに頼らない）。
 * Rare から：物流の部長の提案（顔・「〇〇を輸入に足すと この町の売上 月 +N G」・「承認」）を札の上に。数字は feed.ts。
 * class は isl-feed-*（ほかの画面の class とぶつけない）。
 */
import { t } from '../../i18n';
import { TRADE } from './data';
import { approveFeed, borderDepots, feedBlock, feedItems, feedNext, feedPicks, feedSuggest, goodsRate, townName, toggleFeed } from './feed';
import { tradeNeighbors } from './tariff';
import { btn, h, heroIcon, heroName, money, skuIcon, skuName } from './ui';
import type { P1State, PBuilding } from './model';

const WHY: Record<string, () => string> = {
  unopened: () => t('まだ出店していない町からは輸入できません', 'You can only import from towns you have opened in'),
  workshop: () => t('相手の町に工房がありません（止まっています）', 'No workshop in that town (stopped)'),
  ruin: () => t('相手の町の工房が廃墟です。直すと再開します', 'That town’s workshop is in ruins; repair it to resume'),
  units: () => t('相手の町の出来高の記録がありません（町を離れる前のひと月の売上が要ります）', 'No output record for that town yet (needs a month of sales before you left)'),
};

/** 拠点の吹き出しの「📦 輸入」（この拠点が境の拠点でなければ null） */
export function feedBox(s: P1State, b: PBuilding, done: (msg?: string) => void): HTMLElement | null {
  const nbs = tradeNeighbors(s).filter((nb) => nb.opened && borderDepots(s, nb.id).some((x) => x.uid === b.uid));
  if (!nbs.length) return null;
  const box = h('div', 'isl-feed');
  const head = h('div', 'isl-feed-title');
  const nx = feedNext(s);
  const when = nx ? t(`あと ${nx} 日`, `in ${nx} d`) : t('今日', 'today');
  head.append(h('b', '', t('📦 輸入', '📦 Imports')), h('small', '', t(`となり町の工房の商品を、毎週トラックでここへ（相手の出来高の ${Math.round(TRADE.feed.share * 100)}% まで・${TRADE.feed.max} 品まで）・次の便 ${when}`, `Next town’s workshop goods arrive here weekly by truck (up to ${Math.round(TRADE.feed.share * 100)}% of their output, ${TRADE.feed.max} items) · next truck ${when}`)));
  box.append(head);
  for (const nb of nbs) {
    const sec = h('div', 'isl-feed-town');
    const picks = feedPicks(s, nb.id).length;
    sec.append(h('div', 'isl-feed-from', t(`${nb.name}の工房から（関税 ${Math.round(goodsRate(s, nb.id) * 1000) / 10}%・選んだ ${picks}/${TRADE.feed.max}）`, `From ${nb.name}’s workshop (duty ${Math.round(goodsRate(s, nb.id) * 1000) / 10}%, picked ${picks}/${TRADE.feed.max})`)));
    const why = feedBlock(s, nb.id);
    if (why && why !== 'depot') {
      sec.append(h('p', 'isl-feed-stop', `⛔ ${WHY[why]?.() ?? ''}`));
      for (const e of feedPicks(s, nb.id)) sec.append(h('small', 'isl-dim', t(`止まっている品：${skuName(e.sku)}`, `Paused: ${skuName(e.sku)}`)));
      box.append(sec);
      continue;
    }
    // Rare から：物流の部長の提案（顔と「承認」）
    const sg = feedSuggest(s, nb.id);
    if (sg) {
      const say = h('div', 'isl-feed-head');
      const face = h('span', 'isl-feed-face');
      face.append(heroIcon(sg.hero, 36));
      const line = sg.out
        ? t(`${heroName(sg.hero)}（物流の部長）「${skuName(sg.out)}を${skuName(sg.sku)}に入れ替えると この町の売上 月 +${money(sg.gain)}」`, `${heroName(sg.hero)} (Logistics head): “Swap ${skuName(sg.out)} for ${skuName(sg.sku)}: this town +${money(sg.gain)}/mo”`)
        : t(`${heroName(sg.hero)}（物流の部長）「${skuName(sg.sku)}を輸入に足すと この町の売上 月 +${money(sg.gain)}」`, `${heroName(sg.hero)} (Logistics head): “Add ${skuName(sg.sku)} to imports: this town +${money(sg.gain)}/mo”`);
      say.append(face, h('span', 'isl-feed-say', line), btn(t('承認', 'Approve'), () => {
        approveFeed(s, sg);
        done(t(`${skuName(sg.sku)}を${nb.name}から輸入します`, `Importing ${skuName(sg.sku)} from ${nb.name}`));
      }, 'is-on'));
      sec.append(say);
    }
    const grid = h('div', 'isl-feed-grid');
    for (const it of feedItems(s, nb.id)) {
      const c = h('button', `isl-feed-card ${it.on ? 'is-on' : ''}`);
      c.type = 'button';
      c.setAttribute('aria-pressed', it.on ? 'true' : 'false');
      const top = h('div', 'isl-feed-card-top');
      top.append(skuIcon(it.sku, 40), h('b', '', skuName(it.sku)));
      c.append(top);
      if (it.on) c.append(h('span', 'isl-feed-on', t('✓ 輸入中', '✓ Importing')));
      c.append(h('span', `isl-feed-dm ${it.demand > 1.05 || it.gap ? 'is-good' : ''}`, it.gap ? t(`需要 ×${it.demand.toFixed(1)}・まだ誰も売っていない`, `Demand ×${it.demand.toFixed(1)} · nobody sells it`) : t(`この町の需要 ×${it.demand.toFixed(1)}`, `Demand here ×${it.demand.toFixed(1)}`)));
      c.append(h('span', 'isl-feed-qty', it.week < it.weekShare ? t(`週 ${it.week} 個まで（拠点の置き場所で頭打ち）`, `Up to ${it.week}/wk (capped by hub storage)`) : t(`週 ${it.week} 個まで`, `Up to ${it.week}/wk`)));
      c.append(h('span', 'isl-feed-price', t(`1 個 ${money(it.unit)}（関税 ${money(it.duty)} 込み）`, `${money(it.unit)} each (incl. duty ${money(it.duty)})`)));
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = toggleFeed(s, nb.id, it.sku);
        if (r === 'full') return done(t(`${nb.name}からは ${TRADE.feed.max} 品までです（外してから選びましょう）`, `Up to ${TRADE.feed.max} items from ${nb.name} (remove one first)`));
        if (r === 'block') return done(t('いまは輸入できません', 'Can’t import right now'));
        done(it.on ? t(`${skuName(it.sku)}の輸入をやめました`, `Stopped importing ${skuName(it.sku)}`) : t(`${skuName(it.sku)}を${townName(nb.id)}から輸入します（毎週 ${it.week} 個まで）`, `Importing ${skuName(it.sku)} from ${townName(nb.id)} (up to ${it.week}/wk)`));
      });
      grid.append(c);
    }
    if (!grid.childElementCount) sec.append(h('small', 'isl-dim', t('相手の工房が作っている商品がありません', 'That workshop isn’t making anything')));
    else sec.append(grid);
    box.append(sec);
  }
  return box;
}
