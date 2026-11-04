/**
 * 営業の部門の画面（段 C）：商圏の取り合い。商圏の地図（会社ごとの塗り分け・取り分の％）・出店の候補地（上位 3）・他社の店の一覧（取り分・撤退の危険の目盛り）・
 * 撤退と空き店舗のお知らせ・営業のパネルへの近道・奥義の予告。数字は trade.ts と model.ts の「商圏の取り合い」。docs/ISLAND_PHASE1.md「営業の部門」。
 */
import { t } from '../../i18n';
import { RARE_AREA, SALES_MASTERY, rivalDef } from './data';
import { isVacant, myShops, takeVacant, vacantCost, vacantErr, type P1State } from './model';
import { after, open, type Ctx } from './screens';
import { areaPaint, companyColor, companyShares, quitRule, refillText, siteCandidates, storeName, storeRows, surveyed, vacantLabel, type Candidate } from './trade';
import { btn, h, money } from './ui';
import { arw, histBox } from './chartkit';
import { shareHist } from './dash';

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

/** 商圏の地図（小さな等角の地図）：マスを会社の色で塗り、店（●自社・■他社・□空き店舗）と候補地（金の 1・2・3）を重ねる */
export function areaMiniMap(s: P1State, cands: Candidate[], size = 320): HTMLCanvasElement {
  const cv = h('canvas', 'isl-trade-map');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const n = s.n;
  const cw = size / n;
  const ch = cw / 2;
  const W = size;
  const H = Math.ceil(ch * n + ch + 6);
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  cv.style.width = `${W}px`;
  cv.style.height = `${H}px`;
  const g = cv.getContext('2d');
  if (!g) return cv;
  g.scale(dpr, dpr);
  const at = (i: number, j: number) => ({ x: W / 2 + ((i - j) * cw) / 2, y: 3 + ((i + j) * ch) / 2 + ch / 2 });
  const cell = (i: number, j: number, fill: string) => {
    const c = at(i, j);
    g.beginPath();
    g.moveTo(c.x, c.y - ch / 2);
    g.lineTo(c.x + cw / 2, c.y);
    g.lineTo(c.x, c.y + ch / 2);
    g.lineTo(c.x - cw / 2, c.y);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  const paint = areaPaint(s);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const p = paint[j * n + i];
      cell(i, j, 'rgba(40,60,50,0.9)');
      if (p) {
        g.globalAlpha = 0.25 + 0.65 * Math.min(1, p.v * 1.4);
        cell(i, j, companyColor(s, p.g));
        g.globalAlpha = 1;
      }
    }
  // 店
  for (const b of s.buildings) {
    const c = at(b.i, b.j);
    if (b.owner === 'me' && myShops(s).includes(b)) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(c.x, c.y, Math.max(3, cw * 0.32), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = companyColor(s, 'me');
      g.beginPath();
      g.arc(c.x, c.y, Math.max(2, cw * 0.22), 0, Math.PI * 2);
      g.fill();
    } else if (isVacant(b)) {
      g.strokeStyle = '#ddd';
      g.lineWidth = 1.5;
      g.strokeRect(c.x - cw * 0.25, c.y - cw * 0.25, cw * 0.5, cw * 0.5);
    } else if (s.rivals.some((r) => r.id === b.owner && !r.gone)) {
      g.fillStyle = '#111';
      g.fillRect(c.x - cw * 0.28, c.y - cw * 0.28, cw * 0.56, cw * 0.56);
      g.fillStyle = companyColor(s, b.owner);
      g.fillRect(c.x - cw * 0.2, c.y - cw * 0.2, cw * 0.4, cw * 0.4);
    }
  }
  // 候補地（金の数字）
  cands.forEach((c, k) => {
    const p = at(c.i, c.j);
    g.fillStyle = '#ffd257';
    g.beginPath();
    g.arc(p.x, p.y, Math.max(6, cw * 0.45), 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1a1405';
    g.font = `bold ${Math.max(9, Math.round(cw * 0.6))}px sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`${k + 1}`, p.x, p.y + 0.5);
  });
  return cv;
}

/** 撤退の危険の目盛り（2 か月で撤退：■□ → ■■） */
function riskMeter(weak: number, below: boolean): HTMLElement {
  const m = h('span', 'isl-trade-risk');
  for (let k = 0; k < RARE_AREA.quitMonths; k++) m.append(h('i', k < weak + (below ? 1 : 0) ? 'is-on' : ''));
  m.setAttribute('aria-label', t(`撤退まで ${Math.max(0, RARE_AREA.quitMonths - weak - (below ? 1 : 0))} か月`, `${Math.max(0, RARE_AREA.quitMonths - weak - (below ? 1 : 0))} mo to closing`));
  return m;
}

/** 営業の画面 */
export function openTrade(ctx: Ctx, hooks: { areaView: () => void; panels: () => void }) {
  open(ctx, t('営業：商圏の取り合い', 'Sales: trade areas'), (body) => {
    const s = ctx.s();
    if (!s.area) {
      body.append(h('p', 'isl-dim', t('商圏の取り合いは Rare の町で始まります。', 'The fight over trade areas starts in Rare towns.')));
      return;
    }
    const cands = siteCandidates(s, 3);
    const sv = surveyed(s);

    // 上：会社ごとの取り分（帯）
    const shares = companyShares(s);
    const top = h('div', 'isl-card2 isl-trade-top');
    const barEl = h('div', 'isl-trade-bar');
    for (const c of shares) {
      if (c.share <= 0.001) continue;
      const seg = h('span', c.id === 'me' ? 'is-me' : '');
      seg.style.flexGrow = `${c.share}`;
      seg.style.background = companyColor(s, c.id);
      seg.title = `${c.name} ${pct(c.share)}`;
      barEl.append(seg);
    }
    const legend = h('div', 'isl-trade-legend');
    for (const c of shares) {
      const li = h('span', c.id === 'me' ? 'is-me' : '');
      const dot = h('i');
      dot.style.background = companyColor(s, c.id);
      li.append(dot, h('b', '', c.name), h('small', '', t(`${pct(c.share)}・${c.stores} 軒`, `${pct(c.share)} · ${c.stores}`)));
      legend.append(li);
    }
    const head = h('div', 'isl-trade-head');
    head.append(h('h3', '', t('町のお客さんの取り分', 'Share of the town’s customers')), btn(t('地図で商圏を見る', 'Show trade areas on the map'), () => hooks.areaView(), 'is-on isl-trade-view'));
    top.append(head, barEl, legend);
    // 段 UI8b：自社の取り分の推移（月の締め。Report.trade）
    const sh = shareHist(s.reports);
    const d = sh.length >= 2 ? sh[sh.length - 1].v - sh[sh.length - 2].v : 0;
    const tx = histBox({
      title: t('自社の取り分の推移（月の締め）', 'Your share at each close'),
      note: sh.length >= 2 ? t(`先月から ${arw(d)} ${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d * 10) / 10)} ポイント`, `${arw(d)} ${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d * 10) / 10)} pts since last month`) : '',
      months: sh.map((x) => x.month),
      series: [{ name: t('自社の取り分', 'Your share'), kind: 'line', cls: 'is-gold', vals: sh.map((x) => x.v) }],
      lo: 0,
      fmt: (v) => `${Math.round(v * 10) / 10}%`,
      axis: (v) => `${v}%`,
      aria: t(`自社の取り分の推移：いま ${sh[sh.length - 1]?.v ?? 0}%`, `Your share: now ${sh[sh.length - 1]?.v ?? 0}%`),
    });
    if (tx) top.append(tx);
    body.append(top);

    // 真ん中：商圏の地図と候補地
    const mid = h('div', 'isl-trade-mid');
    const mapBox = h('div', 'isl-card2 isl-trade-mapbox');
    mapBox.append(h('h3', '', t('商圏の地図', 'Trade-area map')), areaMiniMap(s, cands, Math.min(320, Math.max(220, innerWidth - 80))));
    const key = h('small', 'isl-dim isl-trade-key', t('● 自社の店　■ 他社の店　□ 空き店舗　①〜③ 出店の候補地。色が濃いほど、その会社にお客さんが行く', '● yours  ■ rival  □ vacant  ①–③ candidate sites. Darker = more customers go there'));
    mapBox.append(key);
    const candBox = h('div', 'isl-card2 isl-trade-cands');
    candBox.append(h('h3', '', t('出店の候補地（自社の取り分がいちばん増える所）', 'Candidate sites (where your share grows most)')));
    if (!cands.length) candBox.append(h('p', 'isl-dim', t('いま出せる場所がありません', 'No sites available now')));
    cands.forEach((c, k) => {
      const row = h('div', `isl-trade-cand ${c.vacant != null ? 'is-vacant' : ''}`);
      const label = c.vacant != null ? t(`空き店舗（${storeName(s, c.vacant, s.area?.vacant.find((v) => v.uid === c.vacant)?.was || undefined)}の跡）`, `Vacant store (was ${storeName(s, c.vacant, s.area?.vacant.find((v) => v.uid === c.vacant)?.was || undefined)})`) : t('空き地', 'Empty lot');
      const info = h('div', 'isl-trade-cand-info');
      info.append(h('b', 'isl-trade-num', `${k + 1}`), h('span', '', label));
      // 立地調査：取り分の予測
      info.append(h('small', sv ? 'isl-good' : 'isl-dim', sv ? t(`この店 ${pct(c.own)}・自社 +${pct(c.gain)}`, `This store ${pct(c.own)} · you +${pct(c.gain)}`) : t('取り分の予測：🔒 立地調査', 'Share forecast: 🔒 Site survey')));
      row.append(info);
      if (c.vacant != null) {
        const uid = c.vacant;
        const e = vacantErr(s, uid);
        const b = btn(t(`ここに入る（${money(vacantCost(s))}・${RARE_AREA.vacant.days} 日）`, `Move in (${money(vacantCost(s))}, ${RARE_AREA.vacant.days} d)`), () => {
          const x = takeVacant(s, uid);
          if (typeof x === 'string') return ctx.toast(t('入れません（資金・条件）', 'Can’t move in (funds or conditions)'));
          ctx.sfx?.('place');
          ctx.toast(t(`空き店舗に出店！ ${RARE_AREA.vacant.days} 日で開店します（内装だけ）`, `Moved into the vacant store! Opens in ${RARE_AREA.vacant.days} days (fit-out only)`));
          after(ctx);
        }, 'is-on');
        b.disabled = !!e;
        row.append(b);
        if (e === 'money') row.append(h('small', 'isl-bad', t(`あと ${money(vacantCost(s) - s.money)}`, `${money(vacantCost(s) - s.money)} short`)));
      } else {
        row.append(btn(t('ここに建てる', 'Build here'), () => ctx.build?.('general_store', [c.i, c.j]), 'is-on'));
      }
      candBox.append(row);
    });
    mid.append(mapBox, candBox);
    body.append(mid);

    // お知らせ：今月の撤退・空き店舗
    const vac = s.buildings.filter(isVacant);
    const last = s.reports[s.reports.length - 1]?.trade;
    if (vac.length || last?.quit.length || last?.refill.length || last?.back?.length) {
      const news = h('div', 'isl-card2 isl-trade-news');
      news.append(h('h3', '', t('撤退と空き店舗', 'Closings and vacancies')));
      for (const q of last?.quit ?? []) news.append(h('p', 'isl-good', t(`🏚 ${storeName(s, q.uid, q.rid)}が撤退した（先月の締め）`, `🏚 ${storeName(s, q.uid, q.rid)} closed (last month)`)));
      for (const id of last?.back ?? []) news.append(h('p', 'isl-bad', t(`🔁 ${rivalDef(id)?.name ?? id}が町に戻ってきた（空き店舗に出店）`, `🔁 ${rivalDef(id)?.name ?? id} came back to town (into a vacant store)`)));
      // 他社がまとめて戻った月・空き店舗が多い月は、上の数行と「ほか N 軒」に（一覧が長くなりすぎないように）
      const MAX = 4;
      const refills = last?.refill ?? [];
      for (const q of refills.slice(0, MAX)) news.append(h('p', 'isl-bad', t(`🏪 ${storeName(s, q.uid, q.rid)}が空き店舗に出店した`, `🏪 ${storeName(s, q.uid, q.rid)} opened in a vacant store`)));
      if (refills.length > MAX) news.append(h('p', 'isl-bad', t(`🏪 ほか ${refills.length - MAX} 軒に、他社が出店した`, `🏪 Rivals opened in ${refills.length - MAX} more`)));
      for (const b of vac.slice(0, MAX)) {
        const v = s.area.vacant.find((x) => x.uid === b.uid);
        news.append(h('p', '', t(`□ ${vacantLabel()}：${refillText(v)}`, `□ ${vacantLabel()}: ${refillText(v)}`)));
      }
      if (vac.length > MAX) news.append(h('p', '', t(`□ ほかに空き店舗 ${vac.length - MAX} 軒（地図の □）`, `□ ${vac.length - MAX} more vacant stores (□ on the map)`)));
      body.append(news);
    }

    // 他社の店の一覧
    const list = h('div', 'isl-card2 isl-trade-list');
    list.append(h('h3', '', t('他社の店（撤退の危険の大きい順）', 'Rival stores (most at risk first)')), h('p', 'isl-dim', quitRule()));
    const tbl = h('div', 'isl-trade-rows');
    for (const r of storeRows(s)) {
      const row = h('div', `isl-trade-row ${r.below ? 'is-risk' : ''}`);
      const dot = h('i', 'isl-trade-dot');
      dot.style.background = companyColor(s, r.rid);
      const name = h('span', 'isl-trade-name');
      name.append(dot, h('b', '', r.name));
      const sh = h('span', 'isl-trade-share');
      sh.append(h('b', '', pct(r.share)), h('small', 'isl-dim', t(`開店 ${pct(r.share0)}・${Math.round(r.ratio * 100)}%`, `open ${pct(r.share0)} · ${Math.round(r.ratio * 100)}%`)));
      const rk = h('span', 'isl-trade-riskbox');
      rk.append(riskMeter(r.weak, r.below), h('small', r.below ? 'isl-bad' : 'isl-dim', r.below ? t('撤退の危険', 'At risk') : t('安定', 'Stable')));
      row.append(name, sh, rk);
      tbl.append(row);
    }
    list.append(tbl);
    body.append(list);

    // 下：営業のパネルへの近道・奥義の予告・記録
    const foot = h('div', 'isl-card2 isl-trade-foot');
    foot.append(
      h('p', '', t(`撤退させた他社の店 ${s.area.closed} 軒・空き店舗に入った ${s.area.took} 軒`, `Rival stores closed: ${s.area.closed} · vacancies taken: ${s.area.took}`)),
      h('p', 'isl-dim', SALES_MASTERY()),
    );
    const row = h('div', 'isl-row');
    row.append(btn(t('営業のパネルを見る（スキルツリー）', 'See sales panels (skill tree)'), () => hooks.panels()));
    foot.append(row);
    body.append(foot);
  });
}
