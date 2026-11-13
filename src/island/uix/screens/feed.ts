/**
 * 段 UIX3k：物流拠点の吹き出しの「輸入」の箱（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：予算と部門・輸入の箱」）。
 * 出す中身・押す先は今の箱（p1/feedui.ts の feedBox）と同じ。本体の関数は束（K）から使う。吹き出しの「くわしく」の板に入る。
 * - 見出しの貼り札「輸入」・次の便（トラックのランプ・あと N 日）・決まり（相手の出来高の N% まで・N 品まで）
 * - となり町ごとの節：関税の札・選んだ数のランプ（N 品まで）
 * - 止まっているとき：理由の札と、止まっている品
 * - Rare から：物流の部長の提案（顔・吹き出し・承認はレバー）
 * - 商品のカード（絵・名前・需要・週の数・1 個の値段）：押すと選ぶ（ランプと琥珀の枠・「輸入中」の貼り札）、もう一度で外す
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { ux } from '../hooks';
import { uxKey, uxLamp, uxTape } from '../parts';
import { uxSfx } from '../sound';
import { uxpCard, uxpEmpty, uxpFace, uxpHead, uxpSelect } from '../sparts';
import { K } from './k-deps';
import { kIcon } from './k-icons';
import './k-screens.css';
import type { P1State, PBuilding } from '../../p1/model';

/** 止まっている理由（今の WHY と同じ言葉） */
export const FEED_WHY: Record<string, () => string> = {
  unopened: () => t('まだ出店していない町からは輸入できません', 'You can only import from towns you have opened in'),
  workshop: () => t('相手の町に工房がありません（止まっています）', 'No workshop in that town (stopped)'),
  ruin: () => t('相手の町の工房が廃墟です。直すと再開します', 'That town’s workshop is in ruins; repair it to resume'),
  units: () => t('相手の町の出来高の記録がありません（町を離れる前のひと月の売上が要ります）', 'No output record for that town yet (needs a month of sales before you left)'),
};
/** 需要の札を明るくするか（今の is-good と同じ：需要が 1.05 倍より上か、まだ誰も売っていない） */
export const demandHot = (demand: number, gap: boolean) => demand > 1.05 || gap;
/** 関税の率の字（今と同じ：0.1% 刻み） */
export const dutyPct = (rate: number) => `${Math.round(rate * 1000) / 10}%`;

const lite = { color: '#f4ecd4', hi: '#fffdf3', lo: '#0b0d17', scale: 1 };
const ink = { color: '#1a1c2e', hi: '#1a1c2e', lo: '#8a7f5c', scale: 1 };

/** 拠点の吹き出しの「輸入」（この拠点が境の拠点でなければ null） */
export function feedBoxUx(s: P1State, b: PBuilding, done: (msg?: string) => void): HTMLElement | null {
  const nbs = K.tradeNeighbors(s).filter((nb: { id: string; opened: boolean }) => nb.opened && K.borderDepots(s, nb.id).some((x: PBuilding) => x.uid === b.uid));
  if (!nbs.length) return null;
  const max = K.TRADE.feed.max;
  const nx = K.feedNext(s);
  const box = el('div.uxk-fd.uxk-calm');
  box.append(
    uxpHead([kIcon('box', ink), el('b', t('輸入', 'Imports'))], { right: el('span.uxk-fd-next', uxLamp('good', true, nx === 0), kIcon('truck', lite), el('span', nx ? t(`次の便 あと ${nx} 日`, `Next truck in ${nx} d`) : t('次の便 今日', 'Next truck today'))) }),
    el('p.uxk-fd-rule', t(`となり町の工房の商品を、毎週トラックでここへ（相手の出来高の ${Math.round(K.TRADE.feed.share * 100)}% まで・${max} 品まで）`, `Next town’s workshop goods arrive here weekly by truck (up to ${Math.round(K.TRADE.feed.share * 100)}% of their output, ${max} items)`)),
  );
  for (const nb of nbs) {
    const picks = K.feedPicks(s, nb.id).length;
    const lamps = el('span.uxk-fd-picks', { role: 'img', 'aria-label': t(`選んだ ${picks}/${max}`, `Picked ${picks}/${max}`) }, Array.from({ length: max }, (_, i) => uxLamp('good', i < picks)), el('span.ux-num', `${picks}/${max}`));
    const sec = el('section.uxk-fd-town', el('div.uxk-fd-from', el('b', t(`${nb.name}の工房から`, `From ${nb.name}’s workshop`)), uxTape(t(`関税 ${dutyPct(K.goodsRate(s, nb.id))}`, `Duty ${dutyPct(K.goodsRate(s, nb.id))}`), 'dark'), lamps));
    const why = K.feedBlock(s, nb.id);
    if (why && why !== 'depot') {
      sec.append(el('div.uxk-fd-stop', uxLamp('bad', true), kIcon('warn', { ...lite, color: '#ff5964' }), el('span', FEED_WHY[why]?.() ?? '')));
      for (const e of K.feedPicks(s, nb.id)) sec.append(el('span.uxk-fd-paused', uxLamp('', false), el('span', t(`止まっている品：${K.skuName(e.sku)}`, `Paused: ${K.skuName(e.sku)}`))));
      box.append(sec);
      continue;
    }
    // Rare から：物流の部長の提案（顔と、承認はレバー）
    const sg = K.feedSuggest(s, nb.id);
    if (sg) {
      const line = sg.out
        ? t(`「${K.skuName(sg.out)}を${K.skuName(sg.sku)}に入れ替えると この町の売上 月 +${K.money(sg.gain)}」`, `“Swap ${K.skuName(sg.out)} for ${K.skuName(sg.sku)}: this town +${K.money(sg.gain)}/mo”`)
        : t(`「${K.skuName(sg.sku)}を輸入に足すと この町の売上 月 +${K.money(sg.gain)}」`, `“Add ${K.skuName(sg.sku)} to imports: this town +${K.money(sg.gain)}/mo”`);
      const ok = uxKey(t('承認', 'Approve'), () => {
        K.approveFeed(s, sg);
        done(t(`${K.skuName(sg.sku)}を${nb.name}から輸入します`, `Importing ${K.skuName(sg.sku)} from ${nb.name}`));
      }, { ico: null, cls: 'uxk-fd-ok' });
      sec.append(
        el(
          'div.uxk-fd-head',
          el('span.uxk-fd-face', uxpFace(K.heroIcon(sg.hero, 64), { win: 48 })),
          el('span.uxk-fd-say', el('b', t(`${K.heroName(sg.hero)}（物流の部長）`, `${K.heroName(sg.hero)} (Logistics head)`)), el('span', line)),
          el('span.uxk-fd-lever', ux.lever?.(ok) ?? ok),
        ),
      );
    }
    const items = K.feedItems(s, nb.id);
    if (!items.length) {
      sec.append(uxpEmpty(t('相手の工房が作っている商品がありません', 'That workshop isn’t making anything'), { ico: 'box' }));
      box.append(sec);
      continue;
    }
    const list = el('div.uxp-list.uxk-fd-list');
    for (const it of items) {
      const hot = demandHot(it.demand, it.gap);
      const card = uxpCard({
        pic: el('span.uxk-fd-pic', K.skuIcon(it.sku, 40)),
        name: K.skuName(it.sku),
        tags: it.on ? uxTape(t('輸入中', 'Importing'), 'good') : null,
        desc: el(`span.uxk-fd-dm${hot ? '.is-good' : ''}`, it.gap ? t(`需要 ×${it.demand.toFixed(1)}・まだ誰も売っていない`, `Demand ×${it.demand.toFixed(1)} · nobody sells it`) : t(`この町の需要 ×${it.demand.toFixed(1)}`, `Demand here ×${it.demand.toFixed(1)}`)),
        foot: [
          el('span.uxk-fd-qty', kIcon('truck', lite), el('span', it.week < it.weekShare ? t(`週 ${it.week} 個まで（拠点の置き場所で頭打ち）`, `Up to ${it.week}/wk (capped by hub storage)`) : t(`週 ${it.week} 個まで`, `Up to ${it.week}/wk`))),
          el('span.uxk-fd-price', kIcon('coin', lite), el('span', t(`1 個 ${K.money(it.unit)}（関税 ${K.money(it.duty)} 込み）`, `${K.money(it.unit)} each (incl. duty ${K.money(it.duty)})`))),
        ],
        selected: it.on,
        cls: 'uxk-fd-card',
        attrs: { 'data-sku': it.sku },
        onTap: (c) => {
          const r = K.toggleFeed(s, nb.id, it.sku);
          if (r === 'full') {
            uxSfx('deny');
            return done(t(`${nb.name}からは ${max} 品までです（外してから選びましょう）`, `Up to ${max} items from ${nb.name} (remove one first)`));
          }
          if (r === 'block') {
            uxSfx('deny');
            return done(t('いまは輸入できません', 'Can’t import right now'));
          }
          uxpSelect(c, !it.on, true);
          done(it.on ? t(`${K.skuName(it.sku)}の輸入をやめました`, `Stopped importing ${K.skuName(it.sku)}`) : t(`${K.skuName(it.sku)}を${K.townName(nb.id)}から輸入します（毎週 ${it.week} 個まで）`, `Importing ${K.skuName(it.sku)} from ${K.townName(nb.id)} (up to ${it.week}/wk)`));
        },
      });
      card.setAttribute('aria-pressed', String(it.on));
      list.append(card);
    }
    sec.append(list);
    box.append(sec);
  }
  return box;
}
