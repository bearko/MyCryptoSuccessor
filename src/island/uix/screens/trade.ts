/**
 * 段 UIX3b：営業「商圏の取り合い」（入のときだけ。docs/ISLAND_UIX.md「画面：商圏の取り合い」）。画面の部品（sparts.ts：uxp-）で組み直した。
 * 商圏の地図（canvas：p1/tradeui.ts の areaMiniMap）と、地図に重ねる表示はそのまま使う。会社ごとの取り分・自社の取り分の推移（縦の棒）・
 * 出店の候補地（ここに入る＝お金を払う手応え）・撤退と空き店舗・他社の店（撤退の危険の目盛り）。器は今の札（open()）。
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { uxKey, uxLamp, uxMeter, uxTape } from '../parts';
import { uxSfx } from '../sound';
import { uxpCard, uxpGap, uxpPrice, uxpRank, uxpStamp } from '../sparts';
import { B } from './b-deps';
import { bDim, bIcon } from './b-icons';
import { bEmpty, bHead, dim, done, histBars, key, noEmoji, num, payFx, put, sheet, stampLater, state, whyLine } from './b-kit';
import './trade.css';
import type { Ctx } from '../../p1/screens';

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** 撤退の危険の目盛り（2 か月で撤退）：点いているランプの数 */
export const riskLamps = (weak: number, below: boolean, months: number) => Array.from({ length: months }, (_x, k) => k < weak + (below ? 1 : 0));
/** 撤退まであと何か月か */
export const quitLeft = (weak: number, below: boolean, months: number) => Math.max(0, months - weak - (below ? 1 : 0));

export function openTradeUx(ctx: Ctx, hooks: { areaView: () => void; panels: () => void }) {
  sheet(ctx, t('営業：商圏の取り合い', 'Sales: trade areas'), null, 'uxb-trade2', (host, s) => {
    if (!s.area) {
      host.append(bEmpty(t('商圏の取り合いは Rare の町で始まります', 'The fight over trade areas starts in Rare towns'), { ico: 'compass' }));
      return;
    }
    const area = s.area;
    const cands = B.siteCandidates(s, 3);
    const sv = B.surveyed(s);
    // 上：会社ごとの取り分（順位だけは横の棒）と、地図で見るキー
    const shares = B.companyShares(s);
    const max = Math.max(0.001, ...shares.map((c) => c.share));
    put(
      host,
      bHead(t('町のお客さんの取り分', 'Share of the town’s customers'), { ico: 'people' }),
      el(
        'div.uxp-ranks',
        [...shares]
          .sort((a, b) => b.share - a.share)
          .map((c, n) => uxpRank({ n: n + 1, name: c.name, value: pct(c.share), ratio: c.share / max, me: c.id === 'me', note: t(`${c.stores} 軒`, `${c.stores} store(s)`), pic: el('i.uxb-dotc', { style: { background: B.companyColor(s, c.id) } }) })),
      ),
      key(t('地図で商圏を見る', 'Show trade areas on the map'), () => hooks.areaView(), { kind: 'main', ico: 'compass', cls: 'uxb-wide' }),
    );
    // 自社の取り分の推移（月の締め。縦の棒）
    const sh = B.shareHist(s.reports);
    if (sh.length >= 2) {
      const d = sh[sh.length - 1].v - sh[sh.length - 2].v;
      put(
        host,
        bHead(t('自社の取り分の推移（月の締め）', 'Your share at each close'), { ico: 'bars' }),
        el(`span.uxb-gain${d >= 0 ? '' : '.is-wait'}`, bIcon(d >= 0 ? 'up' : 'down', { color: d >= 0 ? '#36e08b' : '#ffb81f', scale: 1 }), t(`先月から ${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d * 10) / 10)} ポイント`, `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d * 10) / 10)} pts since last month`)),
        histBars(sh.map((x, k) => ({ label: B.monLab(x.month), value: x.v, kind: k === sh.length - 1 ? 'main' : '', text: `${Math.round(x.v * 10) / 10}%` })), { height: 132 }),
      );
    }
    // 商圏の地図（今の canvas のまま）と、出店の候補地
    const mapW = typeof innerWidth === 'number' ? Math.min(320, Math.max(220, innerWidth - 96)) : 280;
    put(
      host,
      bHead(t('商圏の地図', 'Trade-area map'), { ico: 'compass' }),
      el('div.uxb-areamap', B.areaMiniMap(s, cands, mapW)),
      el('div.uxb-legend', el('span', el('i.uxb-lg-me'), t('自社の店', 'Yours')), el('span', el('i.uxb-lg-rival'), t('他社の店', 'Rival')), el('span', el('i.uxb-lg-vac'), t('空き店舗', 'Vacant')), el('span', el('i.uxb-lg-cand', '1'), t('出店の候補地', 'Candidate site'))),
      dim(t('色が濃いほど、その会社にお客さんが行く', 'Darker = more customers go there')),
      bHead(t('出店の候補地', 'Candidate sites'), { ico: 'flag' }),
      dim(t('自社の取り分がいちばん増える所です。', 'Where your share grows most.')),
    );
    if (!cands.length) host.append(bEmpty(t('いま出せる場所がありません', 'No sites available now'), { ico: 'flag' }));
    cands.forEach((c, k) => {
      const label = c.vacant != null ? t(`空き店舗（${B.storeName(s, c.vacant, area.vacant.find((v) => v.uid === c.vacant)?.was || undefined)}の跡）`, `Vacant store (was ${B.storeName(s, c.vacant, area.vacant.find((v) => v.uid === c.vacant)?.was || undefined)})`) : t('空き地', 'Empty lot');
      const fore = sv ? el('span.uxb-gain', bIcon('up', { color: '#36e08b', scale: 1 }), t(`この店 ${pct(c.own)}・自社 +${pct(c.gain)}`, `This store ${pct(c.own)} · you +${pct(c.gain)}`)) : el('span.uxb-dim', bDim('lock'), t('取り分の予測：立地調査（パネル）で見えます', 'Share forecast: needs Site survey (panel)'));
      let right: HTMLElement;
      let foot: (HTMLElement | null)[] = [];
      if (c.vacant != null) {
        const uid = c.vacant;
        const cost = B.vacantCost(s);
        const err = B.vacantErr(s, uid);
        const gap = uxpGap(s.money, cost);
        if (err !== 'money') gap.el.hidden = true;
        const st = uxpStamp(t('出店済', 'Moved in'));
        foot = [uxpPrice(cost), el('span.uxb-dim', bDim('hour'), t(`${B.RARE_AREA.vacant.days} 日で開店`, `opens in ${B.RARE_AREA.vacant.days} d`)), st.el, gap.el];
        right = uxKey(
          t('ここに入る', 'Move in'),
          () => {
            if (B.vacantErr(ctx.s(), uid) === 'money') return gap.nudge();
            const x = B.takeVacant(ctx.s(), uid);
            if (typeof x === 'string') {
              uxSfx('deny');
              return void ctx.toast(t('いまは入れません（条件を確かめましょう）', 'Can’t move in right now (check the conditions)'));
            }
            ctx.toast(t(`空き店舗に出店！ ${B.RARE_AREA.vacant.days} 日で開店します（内装だけ）`, `Moved into the vacant store! Opens in ${B.RARE_AREA.vacant.days} days (fit-out only)`));
            const card = host.querySelector<HTMLElement>(`[data-cand="${k}"]`);
            payFx(card);
            uxSfx('build');
            st.hit(card);
            stampLater(() => done(ctx), 700);
          },
          { kind: err ? '' : k === 0 ? 'main' : '', disabled: !!err && err !== 'money', cls: 'uxb-buykey', strong: true },
        );
      } else right = key(t('ここに建てる', 'Build here'), () => ctx.build?.('general_store', [c.i, c.j]), { ico: 'hammer' });
      host.append(uxpCard({ pic: el('span.uxb-up-n.is-cand', num(k + 1)), name: label, desc: fore, foot, right, cls: `uxb-cand${c.vacant != null ? ' is-vacant' : ''}`, attrs: { 'data-cand': String(k) } }));
    });
    // 撤退と空き店舗（先月の締め）
    const vac = s.buildings.filter(B.isVacant);
    const last = s.reports[s.reports.length - 1]?.trade;
    if (vac.length || last?.quit.length || last?.refill.length || last?.back?.length) {
      host.append(bHead(t('撤退と空き店舗', 'Closings and vacancies'), { ico: 'shop' }));
      const MAX = 4;
      for (const q of last?.quit ?? []) host.append(el('p.uxb-news.is-good', state('good', t(`${B.storeName(s, q.uid, q.rid)}が撤退した（先月の締め）`, `${B.storeName(s, q.uid, q.rid)} closed (last month)`))));
      for (const id of last?.back ?? []) host.append(whyLine(t(`${B.rivalDef(id)?.name ?? id}が町に戻ってきた（空き店舗に出店）`, `${B.rivalDef(id)?.name ?? id} came back to town (into a vacant store)`), 'warn'));
      const refills = last?.refill ?? [];
      for (const q of refills.slice(0, MAX)) host.append(whyLine(t(`${B.storeName(s, q.uid, q.rid)}が空き店舗に出店した`, `${B.storeName(s, q.uid, q.rid)} opened in a vacant store`), 'shop'));
      if (refills.length > MAX) host.append(whyLine(t(`ほか ${refills.length - MAX} 軒に、他社が出店した`, `Rivals opened in ${refills.length - MAX} more`), 'shop'));
      for (const b of vac.slice(0, MAX)) host.append(dim(el('i.uxb-lg-vac'), ' ', t(`${B.vacantLabel()}：${noEmoji(B.refillText(area.vacant.find((x) => x.uid === b.uid)))}`, `${B.vacantLabel()}: ${noEmoji(B.refillText(area.vacant.find((x) => x.uid === b.uid)))}`)));
      if (vac.length > MAX) host.append(dim(t(`ほかに空き店舗 ${vac.length - MAX} 軒（地図の □）`, `${vac.length - MAX} more vacant stores (□ on the map)`)));
    }
    // 他社の店（撤退の危険の大きい順）
    put(host, bHead(t('他社の店（撤退の危険の大きい順）', 'Rival stores (most at risk first)'), { ico: 'list' }), dim(B.quitRule()));
    for (const r of B.storeRows(s)) {
      const lamps = riskLamps(r.weak, r.below, B.RARE_AREA.quitMonths);
      const m = uxMeter(r.share0 > 0 ? Math.min(1, r.ratio) : 0, r.below ? '' : 'good');
      host.append(
        el(
          `div.uxb-rival${r.below ? '.is-risk' : ''}`,
          el('span.uxb-rival-name', el('i.uxb-dotc', { style: { background: B.companyColor(s, r.rid) } }), el('b', r.name)),
          el('span.uxb-rival-share', num(pct(r.share)), el('span.uxb-dim', t(`開店 ${pct(r.share0)}・${Math.round(r.ratio * 100)}%`, `open ${pct(r.share0)} · ${Math.round(r.ratio * 100)}%`))),
          m.el,
          el('span.uxb-rival-risk', { 'aria-label': t(`撤退まで ${quitLeft(r.weak, r.below, B.RARE_AREA.quitMonths)} か月`, `${quitLeft(r.weak, r.below, B.RARE_AREA.quitMonths)} mo to closing`) }, lamps.map((on) => uxLamp('bad', on, on)), r.below ? uxTape(t('撤退の危険', 'At risk'), 'amber') : el('span.uxb-dim', t('安定', 'Stable'))),
        ),
      );
    }
    // 記録・奥義の予告・営業のパネルへ
    put(host, bHead(t('記録', 'Record'), { ico: 'trophy' }), el('p', t(`撤退させた他社の店 ${area.closed} 軒・空き店舗に入った ${area.took} 軒`, `Rival stores closed: ${area.closed} · vacancies taken: ${area.took}`)), dim(noEmoji(B.SALES_MASTERY())), key(t('営業のパネルを見る（スキルツリー）', 'See sales panels (skill tree)'), () => hooks.panels(), { ico: 'star', kind: 'weak' }));
  });
}
