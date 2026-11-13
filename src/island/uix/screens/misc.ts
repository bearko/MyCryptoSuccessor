/**
 * 段 UIX3h：外交・商品開発・M&A（法務の前）・地図の表示・研究ポイントの入り方と研究の施策。方向 C「管制卓」。入のときだけ（docs/ISLAND_UIX.md「画面：外交・開発・地図の表示」）。
 * 出す中身・計算・押す先は今の画面（p1/diploui.ts の openDiplo・crestEl、p1/screens.ts の openDev・openMA、p1/mapsetui.ts の openMapSet、
 * p1/r2ui.ts の rpStackEl・studyEl）と同じ。本体の関数は束（H）から使う。
 *
 * - 外交：会ったランドの札（紋の札・仲の計器と一言・交易の約束と依頼の行）・返事を待っている使者（押すとカード）
 * - 商品開発：コモン → アンコモンの札（絵・値段）・開発済みの札／開発中の計器とあと N 日／開発するキー（足りないときは「あと N G」・止まる理由）
 * - M&A（法務の前）：説明と、錠の札 3 つ（買収・業務提携・妨害工作）
 * - 地図の表示：項目ごとの札（名前・説明・色の見本・入り切りのスイッチ・いつ出るか）
 * - 研究ポイントの入り方：入り口ごとの縦の積み上げ棒（色と網目と名前の見本）・毎月の見込み。研究の施策：キー（今月済み・足りない理由）
 */
import { t } from '../../../i18n';
import { el, type Kid } from '../dom';
import { uxKey, uxLamp, uxMeter } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { uxpCard, uxpEmpty, uxpGap, uxpPaper, uxpRow, uxpStamp } from '../sparts';
import { H } from './h-deps';
import { enter, hIcon, keepOpen, keyLabel, lite, liveDraw, sect, tape } from './h-kit';
import type { Ctx } from '../../p1/screens';
import type { P1State } from '../../p1/model';
import type { MapSetKey } from '../../p1/mapsetui';
import type { RpSrc } from '../../p1/r2';

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）
/** 研究ポイントの入り口の網目（色だけにしない：網目と名前の見本） */
export const RP_PAT: Record<RpSrc, '' | 'dots' | 'hatch'> = { dig: '', present: 'dots', study: 'hatch', retest: '', museum: 'dots', donate: 'hatch', other: '' };
/** 積み上げ棒の高さ（%：上限 hi に対して。2% きざみ） */
export const stackPct = (v: number, hi: number) => Math.min(100, Math.round((Math.max(0, v) / Math.max(1, hi)) * 50) * 2);
const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;

// ================================================================= 外交
/** 使者の紋の札（仮の絵：ランドの色の札に地球の絵と名前の頭の字） */
export function crestUx(land: string, size = 40): HTMLElement {
  const L = H.landDef(land);
  const e = el('span.uxh-crest', { title: L.name, style: { width: `${size}px`, height: `${size}px` } }, hIcon('globe', { ...lite, color: '#1a1c2e', hi: '#1a1c2e', lo: '#1a1c2e', scale: size >= 40 ? 2 : 1 }));
  e.style.setProperty('--hc', L.color);
  return e;
}

export function openDiploUx(ctx: Ctx) {
  if (!H.tierEntered(ctx.s(), 'E')) return;
  keepOpen(ctx, t('外交（霧の向こうのランド）', 'Diplomacy (lands beyond the mist)'), (c, body) => {
    const page = el('div.uxh-page.uxh-dip');
    body.append(page);
    return liveDraw(page, (anim) => {
      const s = c.s();
      const D = s.diplo;
      if (!D?.lands.length) {
        const m = D?.since != null ? Math.round(s.day / H.DAYS) - D.since : 0;
        page.replaceChildren(uxpEmpty(t('まだ使者は来ていない', 'No envoy yet'), { ico: 'globe', sub: t(`クリプト・サン・シティの石板「返事の光」を読むか、Epic の町に着いてから ${H.DIPLO.afterMonths} か月で、霧の向こうから使者が来る（いま ${Math.max(0, m)} か月）。`, `An envoy arrives once you read the “Answering light” tablet in Crypto Sun City, or ${H.DIPLO.afterMonths} months after reaching Epic (now ${Math.max(0, m)}).`) }));
        return;
      }
      const lands = el('div.uxh-dip-lands');
      for (const L of D.lands) {
        const def = H.landDef(L.id);
        const m = uxMeter(L.rel / 100, L.rel >= 60 ? 'good' : '');
        const rows: HTMLElement[] = [];
        const tr = D.trades.find((x) => x.land === L.id);
        if (tr) rows.push(uxpRow(t('交易', 'Trade'), t(`毎月 ${tr.n} 個・+${Math.round(tr.bonus * 100)}%`, `${tr.n}/mo · +${Math.round(tr.bonus * 100)}%`), { ico: 'share', note: t(`あと ${tr.left} か月（守った ${tr.kept}・足りない ${tr.missed}）`, `${tr.left} mo left (kept ${tr.kept}, short ${tr.missed})`) }));
        for (const q of D.reqs.filter((x) => x.land === L.id)) rows.push(uxpRow(t(`依頼：${H.legal.PRODUCT[q.key]?.name ?? q.key}`, `Request: ${H.legal.PRODUCT[q.key]?.name ?? q.key}`), `${q.got} / ${q.n}`, { ico: 'doc', num: true, note: t(`あと ${Math.max(0, q.due - s.day)} 日・お礼 ${g(q.reward)}`, `${Math.max(0, q.due - s.day)}d left · ${g(q.reward)}`) }));
        const card = el(
          'div.uxh-dip-land.isl-dip-land',
          { 'data-land': L.id },
          el('div.uxh-dip-h', crestUx(L.id), el('span.uxh-dip-n', el('b', def.name), el('span.uxh-dim', def.envoy)), el('span.uxh-dip-rel', el('span.uxh-dim', t('仲', 'Relations')), el('b.ux-num', `${Math.round(L.rel)}`), el('span.ux-num.uxh-dim', '/ 100'))),
          m.el,
          el('p.uxh-note', H.relTeaser(L.rel)),
          rows.length ? el('div.uxh-rows', rows) : el('p.uxh-dim', t('いまは約束も依頼もない（次の使者を待とう）', 'No pact or request now (wait for the next envoy)')),
        );
        card.style.setProperty('--hc', def.color);
        lands.append(card);
      }
      const out: HTMLElement[] = [el('section.uxh-sec', sect(t(`会ったランド ${D.lands.length} / ${H.LAND_IDS.length}`, `Lands met ${D.lands.length} / ${H.LAND_IDS.length}`), 'globe', { note: H.relTeaser(Math.max(...D.lands.map((x) => x.rel))) }), lands)];
      const waiting = H.cardInbox(s).filter((x) => x.src === 'diplo');
      if (waiting.length) {
        const list = el('div.uxp-list');
        for (const x of waiting)
          list.append(
            uxpCard({
              pic: crestUx(x.dip!.land),
              name: t(`${H.landDef(x.dip!.land).name}の使者の話`, `${H.landDef(x.dip!.land).name} envoy`),
              right: uxKey(keyLabel('mail', t('開く', 'Open')), () => H.showCard(c, x, { done: () => (H.cardNav.done ? H.cardNav.done() : H.after(c)), open: (to) => H.cardNav.open?.(to) }), { ico: null, cls: 'uxh-dip-open isl-cardbox-row' }),
              cls: 'uxh-dip-wait',
            }),
          );
        out.push(el('section.uxh-sec', sect(t('返事を待っている使者', 'Envoys awaiting an answer'), 'mail', { kind: 'dark' }), list));
      }
      page.replaceChildren(...out);
      if (anim && !isCalm()) enter([...lands.children] as HTMLElement[]);
    });
  });
}

// ================================================================= 商品開発
let devJust: string | null = null;
export function openDevUx(ctx: Ctx) {
  devJust = null;
  keepOpen(ctx, t('商品開発', 'Product development'), (c, body) => {
    const page = el('div.uxh-page.uxh-dev');
    body.append(page);
    return liveDraw(page, (anim) => {
      const s = c.s();
      const out: HTMLElement[] = [el('p.uxh-note', t(`アンコモンを開発すると、値段 ${H.UNCOMMON.price} 倍・売り場の強さ ${H.UNCOMMON.pull} 倍の商品を作れます。開発には「魔法の釜」（スキル・工房）が要り、1 つずつ ${H.DEV.days} 日かかります。作るには製造の適性 ${H.UNCOMMON.minCraft} 以上の職人が要ります。`, `Developing an Uncommon gives ${H.UNCOMMON.price}× price and ${H.UNCOMMON.pull}× pull. Needs the Magic Pot skill; one at a time, ${H.DEV.days} days each. Crafting needs aptitude ${H.UNCOMMON.minCraft}+.`))];
      const pot = H.has(s, 'pot');
      if (!pot) out.push(el('p.uxh-warn.uxh-it', hIcon('lock', { ...lite, color: '#ff9a3c' }), el('span', t('スキルツリーの「魔法の釜」で解放されます。', 'Unlocked by the Magic Pot skill.'))));
      const list = el('div.uxp-list.uxh-devs');
      let firstGo = true;
      for (const p of H.PRODUCTS) {
        const cs = H.sku(p.key, 'C');
        const us = H.sku(p.key, 'U');
        const pic = el('span.uxh-dev-pic', H.skuIcon(cs, 40), hIcon('next', { ...lite, color: '#97a1cf' }), H.skuIcon(us, 40));
        const foot: Kid[] = [];
        let right: Kid = null;
        const stamp = uxpStamp(t('開発中', 'Started'), { kind: 'amber' });
        if (s.dev.includes(p.key)) {
          const done = uxpStamp(t('開発済', 'Developed'), { kind: 'good' });
          done.show();
          foot.push(el('span.is-good', t('開発済み（工房で作れます）', 'Developed (craft it in the workshop)')), done.el);
        } else if (s.lab?.key === p.key) {
          const m = uxMeter(1 - s.lab.left / H.DEV.days, 'cyan');
          foot.push(el('span.uxh-dev-run', tape(t(`開発中・あと ${s.lab.left} 日`, `In development · ${s.lab.left} days left`), 'amber'), m.el), stamp.el);
        } else {
          const cost = H.devCost(p.key);
          const gap = uxpGap(s.money, cost);
          const why = !pot ? t('魔法の釜が要ります', 'Needs the Magic Pot') : s.lab ? t('ほかの商品を開発中（1 つずつ）', 'Another item is in development (one at a time)') : null;
          const main = !why && s.money >= cost && firstGo;
          if (main) firstGo = false;
          right = uxKey(keyLabel('flask', t(`開発する ${H.money(cost)}（${H.DEV.days} 日）`, `Develop ${H.money(cost)} (${H.DEV.days} d)`), main), () => {
            if (s.money < cost) return gap.nudge();
            const e = H.develop(s, p.key);
            if (e === 'money') c.toast(t('資金が足りません', 'Not enough funds'));
            else if (!e) {
              c.toast(t(`${H.skuName(us)}の開発を始めました`, `Started developing ${H.skuName(us)}`));
              devJust = p.key;
              uxSfx('cash');
            }
            H.after(c);
          }, { kind: main ? 'main' : '', ico: null, disabled: !!why, cls: 'uxh-dev-go' });
          if (why) foot.push(el('span.uxh-dim', why));
          foot.push(gap.el);
        }
        const card = uxpCard({ pic, name: `${H.skuName(cs)} → ${H.skuName(us)}`, desc: el('span.ux-num.uxh-amber', `${H.money(p.price)} → ${H.money(H.skuPrice(us))}`), foot, right, cls: 'uxh-devc isl-dev', attrs: { 'data-sku': p.key } });
        if (devJust === p.key && s.lab?.key === p.key) {
          devJust = null;
          requestAnimationFrame(() => stamp.hit(card));
        }
        list.append(card);
      }
      out.push(list);
      page.replaceChildren(...out);
      if (anim && !isCalm()) enter([...list.children] as HTMLElement[]);
    });
  });
}

// ================================================================= M&A（法務の部門が開く前）
export function openMAUx(ctx: Ctx) {
  keepOpen(ctx, t('M&A', 'M&A'), (_c, body) => {
    const page = el('div.uxh-page.uxh-ma0');
    body.append(page);
    return liveDraw(page, () => {
      const items: [string, string, string][] = [
        [t('買収（M&A）', 'Acquisition (M&A)'), t('打診 → 調査 → 値段の交渉と条項 → 成立。相手の店と売れ筋を手に入れる（Epic の町）', 'Approach → diligence → price & clauses → signed. Take over the rival’s stores and best-sellers (Epic towns)'), 'office'],
        [t('業務提携', 'Alliance'), t('他社と組んで、素材や商品を融通しあう（準備中）', 'Team up with a rival to share materials and goods (coming soon)'), 'share'],
        [t('妨害工作', 'Sabotage'), t('他社の売り場を一時的に弱くする（準備中）', 'Weaken a rival store for a while (coming soon)'), 'bomb'],
      ];
      page.replaceChildren(
        el('p.uxh-note', t('他社の買収（M&A）は、Epic の町に進出すると開く法務の部門が受け持ちます。他社のお店をタップして「調査」しておくと、相手のことがよく分かります。', 'Acquiring rivals (M&A) is handled by the Legal department, which opens when you enter an Epic town. Research rival stores (tap them on the map) to learn about them.')),
        el('div.uxp-list', items.map(([name, note, ico]) => uxpCard({ pic: hIcon(ico, { ...lite, color: '#4a5486', scale: 3 }), name: el('span.uxh-name', el('b', name), hIcon('lock', { ...lite, color: '#97a1cf' })), desc: note, foot: tape(t('Epic の町で', 'In Epic towns'), 'dark'), off: true, cls: 'uxh-ma0c' }))),
      );
    });
  });
}

// ================================================================= 地図の表示
export function openMapSetUx(ctx: Ctx, changed: () => void) {
  keepOpen(ctx, t('地図の表示', 'Map display'), (c, body) => {
    const page = el('div.uxh-page.uxh-mapset');
    body.append(page);
    return liveDraw(page, () => {
      const list = el('div.uxh-ms-list.isl-mapset');
      for (const it of H.MAPSET_ITEMS) list.append(mapItem(c, it.key, changed));
      page.replaceChildren(el('p.uxh-note', t('地図に重ねて出すものを選びます。', 'Choose what to overlay on the map.')), list);
    });
  });
}
/** 1 項目の札（名前・説明・色の見本・スイッチ・いつ出るか）。押したら札だけ描き直す（今と同じ） */
function mapItem(ctx: Ctx, key: MapSetKey, changed: () => void): HTMLElement {
  const it = H.MAPSET_ITEMS.find((x) => x.key === key)!;
  const row = el('div.uxh-ms.isl-mapset-item', { 'data-key': key });
  const draw = (feel = false) => {
    const s = ctx.s();
    const locked = H.mapSetLocked(s, key);
    const on = !locked && H.mapSetOn(s, key);
    row.classList.toggle('is-off', !on);
    row.classList.toggle('is-locked', locked);
    const sw = uxKey(el('span.uxh-sw', uxLamp('good', on), el('b', locked ? '—' : on ? t('オン', 'On') : t('オフ', 'Off'))), () => {
      if (H.mapSetLocked(ctx.s(), key)) return;
      H.toggleMapSet(ctx.s(), key);
      ctx.sfx?.('tap');
      uxSfx('toggle', { step: on ? 0 : 2 });
      ctx.save();
      changed();
      draw(true);
    }, { kind: on ? '' : 'weak', ico: null, disabled: locked, cls: `uxh-ms-sw isl-mapset-sw${on ? ' is-on' : ''}`, attrs: { role: 'switch', 'aria-checked': String(on), 'aria-label': it.name(), 'data-ux-quiet': '' } });
    const legend = el('div.uxh-ms-legend');
    if (key === 'flow') legend.append(lineKey(H.MAPVIZ_COLOR.supply, t('調達', 'Supply')), lineKey(H.MAPVIZ_COLOR.haul, t('輸送', 'Haul')));
    else if (key === 'area') legend.append(areaKey(H.MAPVIZ_COLOR.mine, t('自分のお店', 'Your shops')), areaKey(H.MAPVIZ_COLOR.rival, t('他社のお店', 'Rival shops')));
    else for (const k of H.MARK_LEGEND) legend.append(markKey(H.MARK_KIND[k].color, k === 'mats' ? t('素材と製造', 'Materials, crafting') : H.MARK_KIND[k].name()));
    const when = it.when?.(s);
    row.replaceChildren(el('div.uxh-ms-h', hIcon(key === 'flow' ? 'truck' : key === 'area' ? 'shop' : 'warn', lite), el('b', it.name()), sw), el('p.uxh-note', it.note()), legend);
    if (when) row.append(el('p.uxh-dim', when));
    if (feel && !isCalm()) {
      row.classList.remove('is-flip');
      void row.offsetWidth;
      row.classList.add('is-flip');
    }
  };
  draw();
  return row;
}
const lineKey = (color: string, name: string) => el('span.uxh-ms-key', el('i.uxh-ms-line', { style: { borderTopColor: color } }), el('span', name));
const areaKey = (color: string, name: string) => {
  const i = el('i.uxh-ms-area');
  i.style.setProperty('--c', color);
  return el('span.uxh-ms-key', i, el('span', name));
};
const markKey = (color: string, name: string) => {
  const i = el('i.uxh-ms-mark', hIcon('warn', { color: '#1a1c2e', hi: '#1a1c2e', lo: '#1a1c2e', scale: 1 }));
  i.style.setProperty('--c', color);
  return el('span.uxh-ms-key', i, el('span', name));
};

// ================================================================= 研究ポイントの入り方・研究の施策
/** 月の研究ポイントの入り方：入り口ごとの縦の積み上げ棒（過去 5 か月 ＋ 今月）・見本・毎月の見込み */
export function rpStackUx(s: P1State): HTMLElement {
  const months = s.reports.slice(-5).map((r) => ({ name: t(`${r.month} 月`, `M${r.month}`), v: r.rpSrc ?? {} }));
  months.push({ name: t('今月', 'Now'), v: s.rpSrc ?? {} });
  const tot = (v: Partial<Record<RpSrc, number>>) => H.RP_SRCS.reduce((a, k) => a + (v[k] ?? 0), 0);
  const hi = Math.max(10, ...months.map((m) => tot(m.v)));
  const col = (k: RpSrc) => H.PALETTE[{ dig: 5, present: 1, study: 2, retest: 0, museum: 3, donate: 6, other: 4 }[k]];
  const chart = el('div.uxh-rp-bars', { role: 'img', 'aria-label': months.map((m) => `${m.name} ${Math.round(tot(m.v))} RP`).join(' / ') });
  months.forEach((m, i) => {
    const bar = el('span.uxh-rp-bar');
    for (const k of H.RP_SRCS) {
      const v = m.v[k] ?? 0;
      if (v <= 0) continue;
      const seg = el(`i.uxh-rp-seg${RP_PAT[k] ? '.is-' + RP_PAT[k] : ''}`, { title: `${H.rpSrcName(k)} +${Math.round(v)} RP`, style: { height: `${stackPct(v, hi)}%`, backgroundColor: col(k) } });
      bar.append(seg);
    }
    chart.append(el(`span.uxh-rp-col${i === months.length - 1 ? '.is-now' : ''}`, el('span.ux-num.uxh-rp-v', `${Math.round(tot(m.v))}`), el('span.uxh-rp-plot', bar), el('span.uxh-rp-m', m.name)));
  });
  const leg = el('div.uxh-rp-leg', H.RP_SRCS.map((k) => el('span.uxh-rp-key', el(`i.uxh-rp-sw${RP_PAT[k] ? '.is-' + RP_PAT[k] : ''}`, { style: { backgroundColor: col(k) } }), el('span', H.rpSrcName(k)))));
  const box = el('div.uxh-rp.isl-r2-box', sect(t('月の研究ポイントの入り方', 'Monthly RP by source'), 'bars', { kind: 'dark' }), chart, leg, el('p.uxh-dim', t(`毎月：追試 +${H.retestRp(s)} RP・展示館 +${H.museumRp(s)} RP`, `Monthly: follow-ups +${H.retestRp(s)} RP · museum +${H.museumRp(s)} RP`)));
  if (!isCalm()) requestAnimationFrame(() => requestAnimationFrame(() => chart.classList.add('is-grown')));
  else chart.classList.add('is-grown');
  return box;
}
/** 研究の施策のキー（出土品の整理・文献調査。月に 1 回ずつ）。R&D 部長がいれば、部長が予算で行う一言 */
export function studyUx(s: P1State, o: { done: () => void; toast: (m: string) => void; sfx?: (k: 'error' | 'levelup') => void }): HTMLElement {
  const box = el('div.uxh-study.isl-r2-study');
  if (H.studyByHead(s)) {
    box.append(el('p.uxh-dim', t('研究の施策（出土品の整理・文献調査）は R&D 部長が予算で毎月行います', 'The R&D head runs sorting and surveys from the budget every month')));
    return box;
  }
  const keys: HTMLElement[] = [];
  for (const k of H.STUDY_KINDS) {
    const e = H.studyLock(s, k);
    if (e === 'hidden') continue;
    const done = H.studyDone(s, k);
    const cost = H.studyCost(s, k);
    const gap = uxpGap(s.money, cost, { hint: '' });
    const label = done ? t(`${H.studyName(k)}（今月は済み）`, `${H.studyName(k)} (done this month)`) : t(`${H.studyName(k)} ${H.money(cost)} → +${H.studyRp(s, k)} RP`, `${H.studyName(k)} ${H.money(cost)} → +${H.studyRp(s, k)} RP`);
    const key = uxKey(keyLabel(done ? 'check' : 'book', label), () => {
      const r = H.runStudy(s, k);
      if (typeof r === 'string') {
        if (r === 'money') gap.nudge();
        else o.sfx?.('error');
        o.toast(r === 'money' ? t(`資金が足りません（${H.money(cost)}）`, `Not enough funds (${H.money(cost)})`) : t('今月はもう行いました', 'Already done this month'));
        return;
      }
      o.sfx?.('levelup');
      o.toast(t(`${H.studyName(k)}：+${r.rp} RP`, `${H.studyName(k)}: +${r.rp} RP`));
      o.done();
    }, { ico: null, disabled: e != null && e !== 'money', cls: `uxh-study-k${e == null ? ' is-on' : ''}` });
    keys.push(el('div.uxh-study-x', key, e === 'money' ? gap.el : null));
  }
  if (keys.length) box.append(el('p.uxh-dim', t('研究の施策（月に 1 回ずつ・Rare からは R&D 部長が予算で）', 'Research work (once a month each; from Rare the R&D head does it)')), ...keys);
  return box;
}
/** 紙の行（外交の一覧などで使う） */
export const paperRows = (rows: HTMLElement[]) => uxpPaper({ plain: true }, rows);
