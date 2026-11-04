/**
 * 担当者からの提案書の画面（段 UI5a。段 UI7b で並びを作り直した）：UI1 のカードと同じく画面いっぱい・時間が止まる（.isl-modal）。
 * 上から：担当者（顔・肩書き・読みの確かさ）・① 承認してほしいこと（要約の一言・承認事項・要点・予算・会社全体・推奨）・② 課題の背景・
 * ③ 期待効果（このまま → 承認後と差・月の費用の内訳・導入（1 回））・④ リスク・⑤ 詳しく（As-Is／To-Be。スマホでは閉じる）。
 * 「承認する」「見送る」「あとで」は下に固定（推奨の札つき）。中身は brief.ts。
 * 承認すると会社のハンコ（店の名前の赤い丸印）を押す演出（pixelfx の collect-burst を印の位置で。docs/ISLAND_FX.md）のあと、
 * plan.ts の applyPlan で一気に変更し、まとめをトーストで出す。計算は plan.ts（DOM なし）。
 */
import { t } from '../../i18n';
import { assetUrl, drawRef } from '../../render/images';
import raw from '../../generated/catalog.json';
import { FX_PAL, fxAtEl } from '../fx/layer';
import { DEPT, PRODUCT, skuParts, type DeptId, type Sku } from './data';
import { staffOf, type P1State } from './model';
import { afterOf, applyPlan, baseOf, planRows, planTitle, type Cell, type Plan, type PlanRes, type Row } from './plan';
import { askTo, briefOf } from './brief';
import { after, chooseMake, type Ctx } from './screens';
import { pickMake } from './stockui';
import { craftable } from './orders';
import { btn, extImage, h, heroIcon, heroName, money, recTag, rich, signCls, signed, skuIcon } from './ui';
import { starOf } from './card';

export interface ProposalOpts {
  /** 現状の課題（担当者のセリフ。[[ ]] で色） */
  say?: string;
  /** 肩書き（「よろず屋の店長」） */
  role?: string;
  /** 承認：既定は applyPlan（カード・受け箱は approveCard を渡す） */
  approve?: (p: Plan) => PlanRes;
  /** 閉じたあと（承認・見送る・あとで） */
  done?: (what: 'ok' | 'skip' | 'later') => void;
  /** 「あとで」を出す（受け箱に残る提案だけ） */
  later?: boolean;
  /** 段 UI5d：カードで推奨の手から開いた提案書（true：推奨は承認・false：カードの推奨はほかの手・無し：数字で決める。段 UI7b） */
  rec?: boolean;
  /** 段 UI7b：開いたカードの id（会社全体の「受け箱のほかの提案」から除く） */
  card?: number;
}

/** お店の中の絵（窓・壁・棚の段と並ぶ商品）。いまのお店の内装の絵（窓の景色）を使い、段の数を描き分ける（仮の絵：docs/ISLAND_ART_TODO.md） */
export function shopStill(shelves: (Sku | null)[], w = 150): HTMLCanvasElement {
  const c = h('canvas', 'isl-prop-shop');
  const H = 96;
  c.width = 160;
  c.height = H;
  c.style.width = `${w}px`;
  c.style.height = `${Math.round((w * H) / 160)}px`;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const draw = (view?: HTMLImageElement) => {
    g.fillStyle = '#5a3a24';
    g.fillRect(0, 0, 160, H);
    if (view?.complete && view.naturalWidth) g.drawImage(view, 0, 0, 160, 34);
    g.fillStyle = '#7a5434';
    g.fillRect(0, 34, 160, H - 34);
    // 棚：段の数だけ（5 段まで描く。それより多ければ「+N」）
    const n = Math.min(5, shelves.length);
    const top = 40;
    const rowH = Math.min(14, Math.floor((H - top - 6) / Math.max(1, n)));
    g.fillStyle = '#3a2416';
    g.fillRect(8, top - 4, 112, rowH * n + 8);
    for (let k = 0; k < n; k++) {
      const y = top + k * rowH;
      g.fillStyle = '#c9925a';
      g.fillRect(10, y + rowH - 3, 108, 3);
      const x = shelves[k];
      if (!x) continue;
      const [key, r] = skuParts(x);
      const ref = extImage(PRODUCT[key]?.ext[r] ?? 0);
      for (let i = 0; i < 6; i++) drawRef(g, ref, 12 + i * 17, y, rowH, rowH);
    }
    if (shelves.length > n) {
      g.fillStyle = '#f7f0bc';
      g.font = 'bold 12px sans-serif';
      g.fillText(`+${shelves.length - n}`, 124, top + 12);
    }
    // レジ
    g.fillStyle = '#3a2416';
    g.fillRect(126, H - 26, 30, 20);
    g.fillStyle = '#d8b07a';
    g.fillRect(126, H - 26, 30, 3);
  };
  const view = new Image();
  view.onload = () => draw(view);
  view.src = assetUrl((raw as { windowView: string }).windowView);
  draw();
  // 商品の絵が読み込まれたら描き直す
  window.setTimeout(() => draw(view), 400);
  return c;
}

const fmtG = (v: number) => money(Math.round(v));
const PLUS = () => t('＋', '+');
const pct = (v: number) => `${Math.round(v * 100)}%`;

function cellEl(c: Cell, side: 'as' | 'to', changed: boolean): HTMLElement {
  const el = h('div', `isl-prop-cell is-${side} ${side === 'to' && changed ? 'is-new' : ''}`);
  if (c.shelves) el.append(shopStill(c.shelves, innerWidth < 600 ? 120 : 150));
  if (c.goods) {
    const list = h('div', 'isl-prop-goods');
    if (!c.goods.length) list.append(h('span', 'isl-dim', t('なし', 'None')));
    for (const x of c.goods) {
      const row = h('div', `isl-prop-good ${x.plus ? 'is-plus' : ''}`);
      const info = h('span', 'isl-prop-goodtxt');
      const nm = PRODUCT[skuParts(x.x)[0]]?.name ?? x.x;
      info.append(h('b', '', (x.plus ? PLUS() : '') + nm), h('small', '', t(`月 ${Math.round(x.units)} 個・1 日 ${fmtG(x.perDay)}`, `${Math.round(x.units)}/mo · ${fmtG(x.perDay)}/day`)));
      row.append(skuIcon(x.x, 28), info);
      list.append(row);
    }
    el.append(list);
  } else el.append(h('span', `isl-prop-txt ${c.plus ? 'is-plus' : ''}`, c.text));
  return el;
}

/** 部門の札（短い名前・部門の色の枠） */
function deptTag(d: DeptId): HTMLElement {
  const e = h('span', 'isl-prop-dtag', DEPT[d].short);
  e.style.setProperty('--d', DEPT[d].color);
  return e;
}
const sg = (v: number) => signed(v, money);
const pctTxt = (v: number | null) => (v == null ? '' : `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`);
const NUM = ['①', '②', '③', '④', '⑤'];

/**
 * 提案書を出す（時間が止まる）。承認すると、ハンコの演出のあと一気に変更する。
 * 段 UI7b：上から ① 承認してほしいこと（要約の一言・承認事項・要点・予算・会社全体）② 課題の背景 ③ 期待効果 ④ リスク ⑤ 詳しく（As-Is／To-Be）。
 * ボタンは下に固定（本文だけが動く）。中身は brief.ts（DOM なし）
 */
export function openProposal(ctx: Ctx, plan: Plan, o: ProposalOpts = {}) {
  const s: P1State = ctx.s();
  ctx.root.querySelector('.isl-prop')?.remove();
  const m = h('div', 'isl-modal isl-prop');
  const panel = h('div', 'isl-prop-panel');
  const phone = innerWidth < 600;
  // 見込み（写しに当てて計算する）：このまま（承認しない）と承認後
  const base = baseOf(s);
  const aft = afterOf(s, plan);
  const { rows, unchanged } = planRows(base, plan, aft);
  const B = briefOf(s, plan, { rec: o.rec, card: o.card }, base, aft);
  const cost = B.cost;
  const block = B.block;

  // 担当者（顔・肩書き・読みの確かさ）
  const head = h('div', 'isl-prop-head');
  if (plan.hero != null) head.append(heroIcon(plan.hero, phone ? 48 : 64));
  else {
    const mi = h('img', 'isl-prop-mine');
    mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
    mi.alt = '';
    head.append(mi);
  }
  const who = h('div', 'isl-prop-who');
  const kick = h('span', 'isl-prop-kicker', t('📄 担当者からの提案', '📄 Proposal from your staff'));
  if (B.dept) kick.append(deptTag(B.dept));
  who.append(kick, h('b', 'isl-prop-name', [o.role ?? '', plan.hero != null ? heroName(plan.hero) : t('マインちゃん', 'Mine-chan')].filter(Boolean).join(t('・', ' · '))));
  const st = plan.hero != null ? staffOf(s, plan.hero) : null;
  if (st) {
    const star = starOf(plan.q, st.level ?? 1);
    who.append(h('small', 'isl-prop-star', t(`読みの確かさ ${'★'.repeat(star)}${'☆'.repeat(3 - star)}（誤差 ±${pct(B.err)}）`, `Read ${'★'.repeat(star)}${'☆'.repeat(3 - star)} (±${pct(B.err)})`)));
  }
  head.append(who);
  panel.append(head);

  const body = h('div', 'isl-prop-body');
  const sec = (title: string, cls = '') => {
    const e = h('section', `isl-prop-sec ${cls}`.trim());
    e.append(h('h3', '', title));
    body.append(e);
    return e;
  };

  // ① 承認してほしいこと
  const s1 = sec(t('承認してほしいこと', 'What I need you to approve'), 'is-ask');
  const pitch = h('p', 'isl-prop-pitch');
  pitch.append(t('「', '“'), document.createTextNode(B.pitch), t('」', '”'));
  s1.append(pitch);
  const asks = h('ol', 'isl-prop-asks');
  for (const a of B.asks) {
    const li = h('li', a.own ? '' : 'is-ask');
    const txt = h('span', 'isl-prop-askt');
    txt.append(deptTag(a.dept), document.createTextNode(`${NUM[a.n] ?? `${a.n + 1}.`} ${a.what}`));
    if (!a.own) txt.append(h('b', 'isl-prop-req', t(`（${askTo(a.dept)}）`, ` (${askTo(a.dept)})`)));
    const bits = [a.money ? money(a.money) : '', a.rp ? `${a.rp} RP` : '', a.monthly ? t(`毎月 ${money(a.monthly)}`, `${money(a.monthly)}/mo`) : ''].filter(Boolean);
    li.append(txt, h('span', 'isl-prop-askc', bits.join(t('・', ' · ')) || t('費用なし', 'free')));
    asks.append(li);
  }
  if (!B.asks.length) {
    const li = h('li', '');
    li.append(h('span', 'isl-prop-askt', planTitle(s, plan)));
    asks.append(li);
  }
  s1.append(asks);
  // 要点の 1 行：導入費用・月の利益の差（+○ G・+○%）
  const key = h('p', 'isl-prop-key');
  const setup = [cost.money ? money(cost.money) : '', cost.rp ? `${cost.rp} RP` : ''].filter(Boolean).join(t('・', ' · ')) || t('0 G', '0 G');
  key.append(h('span', '', t(`導入 ${setup}（1 回）`, `Setup ${setup} (once)`)));
  if (cost.monthly) key.append(h('span', '', t(`毎月 +${money(cost.monthly)}`, `+${money(cost.monthly)}/mo`)));
  const gain = Math.abs(B.dProfit) >= 0.5 || !rows.some((r) => r.kind !== 'goods' && r.changed && r.kind !== 'panel');
  if (gain) {
    const pf = h('span', `isl-prop-keyg ${signCls(B.dProfit)}`);
    pf.append(t(`月の利益 ${sg(B.dProfit)}`, `Profit ${sg(B.dProfit)}/mo`), B.pProfit != null && Math.abs(B.dProfit) >= 0.5 ? t(`（${pctTxt(B.pProfit)}）`, ` (${pctTxt(B.pProfit)})`) : '');
    key.append(pf);
  } else {
    const r = rows.find((x) => x.kind !== 'goods' && x.changed)!;
    key.append(h('span', 'isl-prop-keyg is-good', t(`${r.label}：${r.asIs.text} → ${r.toBe.text}`, `${r.label}: ${r.asIs.text} → ${r.toBe.text}`)));
  }
  s1.append(key);
  // この部門の予算（Rare から）
  const bud = h('p', 'isl-prop-budget');
  if (B.budget) {
    const x = B.budget;
    bud.append(
      document.createTextNode(t(`${DEPT[x.dept].name}部の予算：月 ${money(x.amt)}（使った ${money(x.used)}・残り ${money(x.rest)}）→ `, `${DEPT[x.dept].name} budget: ${money(x.amt)}/mo (used ${money(x.used)}, left ${money(x.rest)}) → `)),
      h(
        'b',
        x.inside ? 'is-good' : 'is-bad',
        x.inside
          ? x.need > 0
            ? t(`予算内（${money(x.need)}）`, `within budget (${money(x.need)})`)
            : t('予算内（この部門の費用なし）', 'within budget (no cost here)')
          : t(`予算外（${money(x.need - x.rest)} 超え・会社の資金から）`, `over budget by ${money(x.need - x.rest)} (company funds)`),
      ),
    );
  } else bud.append(document.createTextNode(t('部門の予算：まだありません（会社の資金から払います）', 'Department budget: none yet (paid from company funds)')));
  s1.append(bud);
  // 会社全体の材料：受け箱のほかの提案・資金
  s1.append(
    h(
      'p',
      'isl-prop-co',
      t(
        `会社全体：受け箱のほかの提案 ${B.co.n} 件（合計 ${money(B.co.money)}）・資金 ${money(B.co.cash)} → 承認後 ${money(B.co.left)}`,
        `Company: ${B.co.n} other proposals in the inbox (${money(B.co.money)} total) · funds ${money(B.co.cash)} → ${money(B.co.left)} after`,
      ),
    ),
  );
  for (const b of block) s1.append(h('p', 'isl-bad isl-prop-block', b));
  const why = h('p', 'isl-prop-why');
  why.append(recTag(), document.createTextNode(B.rec === 'ok' ? t(`承認 — ${B.why}`, `Approve — ${B.why}`) : t(`見送る — ${B.why}`, `Pass — ${B.why}`)));
  s1.append(why);

  // ② 課題の背景
  const s2 = sec(t('課題の背景', 'Background'));
  if (o.say) {
    const p = h('p', 'isl-prop-say');
    p.append(t('「', '“'), rich(o.say), t('」', '”'));
    s2.append(p);
  }
  const bg = h('ul', 'isl-prop-bg');
  for (const x of B.bg) bg.append(h('li', '', x));
  s2.append(bg);

  // ③ 期待効果（月あたり）：このまま → 承認後と差。売上は % も。費用は月の費用（続く）の内訳と、導入（1 回）
  const s3 = sec(t(`期待効果（月あたり・誤差 ±${pct(B.err)}）`, `Expected (per month, ±${pct(B.err)})`), 'isl-prop-effect');
  const tbl = h('div', 'isl-prop-eff');
  tbl.append(h('span', 'isl-prop-effh', ''), h('span', 'isl-prop-effh', t('このまま', 'As is')), h('span', 'isl-prop-effh', ''), h('span', 'isl-prop-effh', t('承認後', 'After')), h('span', 'isl-prop-effh', t('差', 'Change')));
  const line = (label: string, a: number, b: number, good: 'up' | 'down', pctOn = false, sub = false) => {
    const d = b - a;
    const better = good === 'up' ? d > 0.5 : d < -0.5;
    const worse = good === 'up' ? d < -0.5 : d > 0.5;
    const cls = better ? 'is-good' : worse ? 'is-bad' : '';
    const dd = h('span', `isl-prop-effd ${cls}`, sg(d));
    if (pctOn && Math.abs(a) > 0.5 && Math.abs(d) >= 0.5) dd.append(h('small', '', t(`（${pctTxt(d / Math.abs(a))}）`, ` (${pctTxt(d / Math.abs(a))})`)));
    tbl.append(h('span', `isl-prop-efflabel ${sub ? 'is-sub' : ''}`, label), h('span', 'isl-prop-effnow', fmtG(a)), h('span', 'isl-prop-arrow', '→'), h('b', `isl-prop-effafter ${cls}`, fmtG(b)), dd);
  };
  line(t('売上', 'Sales'), B.now.sales, B.after.sales, 'up', true);
  line(t('月の費用', 'Monthly costs'), B.now.cost, B.after.cost, 'down');
  for (const r of B.costs) line(t(`・${r.label}`, `· ${r.label}`), r.now, r.after, 'down', false, true);
  line(t('利益', 'Profit'), B.now.profit, B.after.profit, 'up', true);
  s3.append(tbl);
  const notes: string[] = [t('月の費用は、この提案で変わるものだけ（給料・維持費など変わらないものは入れない）。材料費＝売れる数 × 1 個の材料費', 'Only costs this changes (wages, upkeep etc. not included). Materials = units sold × cost each')];
  if (B.after.adDays && B.after.adDays < 30) notes.push(t(`宣伝は ${B.after.adDays} 日ぶんを日割り（月 30 日のうち）`, `Ads pro-rated: ${B.after.adDays} of 30 days`));
  for (const n of notes) s3.append(h('p', 'isl-prop-note', `※${n}`));
  // 部門ごとの分（ほかの部門の手を含むとき）
  if (B.parts.length > 1) {
    s3.append(h('h4', '', t('手ごとの分（順に足したときの増え方）', 'By move (added in order)')));
    const ul = h('ul', 'isl-prop-parts');
    for (const x of B.parts) {
      const li = h('li', '');
      const l = h('span', '');
      l.append(deptTag(x.dept), document.createTextNode(`${NUM[x.n] ?? ''} ${x.what}`));
      li.append(l, h('b', signCls(x.dProfit), t(`売上 ${sg(x.dSales)}・利益 ${sg(x.dProfit)}`, `sales ${sg(x.dSales)} · profit ${sg(x.dProfit)}`)));
      ul.append(li);
    }
    s3.append(ul);
  }
  // 導入（1 回）
  s3.append(h('h4', '', t('導入（1 回）', 'Setup (once)')));
  const ul = h('ul', 'isl-prop-costs');
  const once = cost.items.filter((it) => !it.monthly);
  if (!once.length) ul.append(h('li', 'isl-dim', t('費用なし', 'Free')));
  for (const it of once) {
    const bits = [it.money ? fmtG(it.money) : '', it.rp ? `${it.rp} RP` : '', it.days ? t(`${it.days} 日`, `${it.days} d`) : ''].filter(Boolean);
    const li = h('li', '');
    li.append(h('span', '', it.label), h('b', '', bits.join(t('・', ' · ')) || t('—', '—')));
    ul.append(li);
  }
  s3.append(ul);
  s3.append(h('p', 'isl-prop-total', t(`導入の合計：${setup}`, `Setup total: ${setup}`)));

  // ④ 予想されるリスク
  const s4 = sec(t('予想されるリスク', 'Risks'));
  const rl = h('ul', 'isl-prop-risks');
  for (const x of B.risks) rl.append(h('li', '', x));
  s4.append(rl);

  // ⑤ 詳しく：As-Is ／ To-Be（スマホでは閉じておく）
  const det = h('details', 'isl-prop-more');
  det.open = !phone;
  det.append(h('summary', '', t('詳しく：As-Is ／ To-Be', 'Details: As-Is / To-Be')));
  const title = h('p', 'isl-prop-title');
  title.append(document.createTextNode(planTitle(s, plan)));
  det.append(title);
  // 段 UI5c：「いまある素材で○○が作れます」の提案は、ほかの品も選べる（工房の作る物の選び方の「いまの素材で作れる」の並びへ）
  const use = plan.steps.find((x) => x.k === 'useup') as { k: 'useup'; slot: number; x: Sku } | undefined;
  if (use)
    det.append(
      btn(
        t('ほかの品を選ぶ（いまの素材で作れる）', 'Pick another (from what we have)'),
        () => {
          close('skip');
          pickMake(ctx, use.slot, {
            title: t(`作業台 ${use.slot + 1} で作るもの`, `What bench ${use.slot + 1} makes`),
            items: craftable(ctx.s()),
            tab: 'stock',
            onPick: (x) => chooseMake(ctx, ctx.s(), use.slot, x),
          });
        },
        'isl-prop-alt',
      ),
    );
  const grid = h('div', 'isl-prop-grid');
  grid.append(h('div', 'isl-prop-colhead is-as', t('As-Is（このまま）', 'As-Is (as is)')), h('div', 'isl-prop-colhead is-to', t('To-Be（承認後）', 'To-Be (after)')));
  for (const r of rows as Row[]) {
    grid.append(h('div', 'isl-prop-rowlabel', r.label));
    grid.append(cellEl(r.asIs, 'as', r.changed), cellEl(r.toBe, 'to', r.changed));
  }
  if (rows.length) det.append(grid);
  for (const u of unchanged) det.append(h('p', 'isl-prop-same', u));
  body.append(det);
  panel.append(body);

  // ボタン（下に固定）。推奨のボタンに「推奨」の札
  const foot = h('div', 'isl-prop-foot');
  const close = (what: 'ok' | 'skip' | 'later') => {
    m.remove();
    o.done?.(what);
  };
  const ok = btn(
    t('承認する', 'Approve'),
    () => {
      if (block.length) return;
      ok.disabled = true;
      stampThen(ctx, panel, () => {
        const r = (o.approve ?? ((p: Plan) => applyPlanSafe(ctx, p)))(plan);
        if (!r.ok) {
          ctx.sfx?.('error');
          ctx.toast(r.err === 'money' ? t('資金が足りません', 'Not enough funds') : r.err === 'rp' ? t('研究ポイントが足りません', 'Not enough RP') : t('もう打てない提案でした', 'That proposal is no longer possible'));
          ok.disabled = false;
          if (r.err === 'gone') close('skip');
          return;
        }
        ctx.sfx?.('levelup');
        const sum = r.did.length ? r.did.slice(0, 4).join(t('・', ' · ')) : t('承認しました', 'Approved');
        ctx.toast('✔ ' + sum);
        after(ctx);
        close('ok');
      });
    },
    `is-on isl-prop-ok ${B.rec === 'ok' ? 'is-rec' : ''}`,
  );
  ok.disabled = block.length > 0;
  const skip = btn(t('見送る', 'Pass'), () => close('skip'), `isl-prop-skip ${B.rec === 'skip' ? 'is-rec' : ''}`);
  if (B.rec === 'ok') ok.prepend(recTag());
  else skip.prepend(recTag());
  foot.append(ok, skip);
  if (o.later) foot.append(btn(phone ? t('あとで', 'Later') : t('あとで（受け箱へ）', 'Later (inbox)'), () => close('later'), 'isl-prop-later'));
  panel.append(foot);
  m.append(panel);
  m.addEventListener('click', (e) => e.stopPropagation());
  ctx.root.append(m);
  ctx.sfx?.('page');
}

/** 既定の承認（applyPlan） */
function applyPlanSafe(_ctx: Ctx, p: Plan): PlanRes {
  return applyPlan(_ctx.s(), p);
}

/**
 * ハンコの演出：提案書の右下に会社のハンコ（店の名前の赤い丸印。災害の協定書のハンコを小さく流用）を押し、
 * 押した瞬間に pixelfx の collect-burst（金）を印の位置で。そのあと then（一気に変更）。押す場所の上に長く残さない（0.8 秒）
 */
function stampThen(ctx: Ctx, panel: HTMLElement, then: () => void) {
  const s = ctx.s();
  const name = s.storeName || t('承認', 'OK');
  const wrap = h('div', 'isl-prop-stampat');
  const st = h('span', 'isl-disaster-stamp isl-prop-stamp');
  st.classList.toggle('is-long', [...name].length > 4);
  st.textContent = name;
  wrap.append(st);
  panel.append(wrap);
  void st.offsetWidth;
  st.classList.add('is-down');
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.setTimeout(() => {
    ctx.sfx?.('place', 1.2, 0.8);
    panel.classList.add('is-bump');
    fxAtEl('collect-burst', st, { palette: FX_PAL.gold, dy: 30 });
  }, reduce ? 0 : 260);
  window.setTimeout(then, reduce ? 50 : 800);
}
