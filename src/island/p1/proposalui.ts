/**
 * 担当者からの提案書の画面（段 UI5a）：UI1 のカードと同じく画面いっぱい・時間が止まる（.isl-modal）。
 * 上から：担当者（顔・肩書き・ウィットの一言）・現状の課題（セリフ）・提案（1 行）・As-Is（左）／To-Be（右）・変わらない段の 1 行・
 * 期待効果（売上・コスト・利益の今 → 後。誤差は読みの確かさ ★）・導入コスト（払うもの全部）・「承認する」「見送る」「あとで」。
 * 承認すると会社のハンコ（店の名前の赤い丸印）を押す演出（pixelfx の collect-burst を印の位置で。docs/ISLAND_FX.md）のあと、
 * plan.ts の applyPlan で一気に変更し、まとめをトーストで出す。計算は plan.ts（DOM なし）。
 */
import { voiceQuip } from './voice';
import { t } from '../../i18n';
import { assetUrl, drawRef } from '../../render/images';
import raw from '../../generated/catalog.json';
import { FX_PAL, fxAtEl } from '../fx/layer';
import { PRODUCT, skuParts, type Sku } from './data';
import { staffOf, type P1State } from './model';
import { afterOf, applyPlan, planBlock, planCost, planEffect, planRows, planTitle, type Cell, type Plan, type PlanRes, type Row } from './plan';
import { quipOf } from './persona';
import { after, type Ctx } from './screens';
import { btn, extImage, h, heroIcon, heroName, money, rich, skuIcon } from './ui';
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

/** 提案書を出す（時間が止まる）。承認すると、ハンコの演出のあと一気に変更する */
export function openProposal(ctx: Ctx, plan: Plan, o: ProposalOpts = {}) {
  const s: P1State = ctx.s();
  ctx.root.querySelector('.isl-prop')?.remove();
  const m = h('div', 'isl-modal isl-prop');
  const panel = h('div', 'isl-prop-panel');
  // 見込み（写しに当てて計算する）
  const aft = afterOf(s, plan);
  const { rows, unchanged } = planRows(s, plan, aft);
  const eff = planEffect(s, plan, aft);
  const cost = planCost(s, plan);
  const block = planBlock(s, plan, cost);

  // 担当者
  const head = h('div', 'isl-prop-head');
  if (plan.hero != null) head.append(heroIcon(plan.hero, innerWidth < 600 ? 56 : 72));
  else {
    const mi = h('img', 'isl-prop-mine');
    mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
    mi.alt = '';
    head.append(mi);
  }
  const who = h('div', 'isl-prop-who');
  who.append(h('span', 'isl-prop-kicker', t('📄 担当者からの提案', '📄 Proposal from your staff')), h('b', 'isl-prop-name', [o.role ?? '', plan.hero != null ? heroName(plan.hero) : t('マインちゃん', 'Mine-chan')].filter(Boolean).join(t('・', ' · '))));
  const st = plan.hero != null ? staffOf(s, plan.hero) : null;
  if (st) {
    const star = starOf(plan.q, st.level ?? 1);
    who.append(h('small', 'isl-prop-star', t(`読みの確かさ ${'★'.repeat(star)}${'☆'.repeat(3 - star)}（誤差 ±${pct(eff.err)}）`, `Read ${'★'.repeat(star)}${'☆'.repeat(3 - star)} (±${pct(eff.err)})`)));
    // 段 P2：史実の調査のあるヒーローは、その人の提案のセリフ・口ぐせ（voice.ts）
    const q = voiceQuip(plan.hero!, 'sell', s.day) ?? quipOf(plan.hero!, 'sell', s.day);
    if (q) who.append(h('small', 'isl-prop-quip', `— ${q}`));
  }
  head.append(who);
  panel.append(head);

  const body = h('div', 'isl-prop-body');
  // 現状の課題・提案
  if (o.say) {
    const sec = h('section', 'isl-prop-sec');
    const p = h('p', 'isl-prop-say');
    p.append(t('「', '“'), rich(o.say), t('」', '”'));
    sec.append(h('h3', '', t('現状の課題', 'The issue')), p);
    body.append(sec);
  }
  const sec2 = h('section', 'isl-prop-sec');
  sec2.append(h('h3', '', t('提案', 'Proposal')), h('p', 'isl-prop-title', planTitle(s, plan)));
  body.append(sec2);

  // As-Is ／ To-Be（左右 2 列。行ごとに項目名を上に）
  const grid = h('div', 'isl-prop-grid');
  grid.append(h('div', 'isl-prop-colhead is-as', t('As-Is（いま）', 'As-Is (now)')), h('div', 'isl-prop-colhead is-to', t('To-Be（承認後）', 'To-Be (after)')));
  for (const r of rows as Row[]) {
    grid.append(h('div', 'isl-prop-rowlabel', r.label));
    grid.append(cellEl(r.asIs, 'as', r.changed), cellEl(r.toBe, 'to', r.changed));
  }
  body.append(grid);
  for (const u of unchanged) body.append(h('p', 'isl-prop-same', u));

  // 期待効果（月あたり）
  const fx = h('section', 'isl-prop-sec isl-prop-effect');
  fx.append(h('h3', '', t(`期待効果（月あたり・誤差 ±${pct(eff.err)}）`, `Expected (per month, ±${pct(eff.err)})`)));
  const tbl = h('div', 'isl-prop-eff');
  const line = (label: string, a: number, b: number, good: 'up' | 'down') => {
    const d = b - a;
    const better = good === 'up' ? d > 0.5 : d < -0.5;
    const worse = good === 'up' ? d < -0.5 : d > 0.5;
    tbl.append(h('span', 'isl-prop-efflabel', label), h('span', 'isl-prop-effnow', fmtG(a)), h('span', 'isl-prop-arrow', '→'), h('b', `isl-prop-effafter ${better ? 'is-good' : worse ? 'is-bad' : ''}`, fmtG(b)));
  };
  line(t('売上', 'Sales'), eff.now.sales, eff.after.sales, 'up');
  line(t('コスト', 'Costs'), eff.now.cost, eff.after.cost, 'down');
  line(t('利益', 'Profit'), eff.now.profit, eff.after.profit, 'up');
  fx.append(tbl);
  body.append(fx);

  // 導入コスト
  const cs = h('section', 'isl-prop-sec isl-prop-cost');
  cs.append(h('h3', '', t('導入コスト', 'What it takes')));
  const ul = h('ul', 'isl-prop-costs');
  if (!cost.items.length) ul.append(h('li', 'isl-dim', t('費用なし', 'Free')));
  for (const it of cost.items) {
    const bits = [it.money ? fmtG(it.money) : '', it.rp ? `${it.rp} RP` : '', it.monthly ? t(`毎月 ${fmtG(it.monthly)}`, `${fmtG(it.monthly)}/mo`) : '', it.days ? t(`${it.days} 日`, `${it.days} d`) : ''].filter(Boolean);
    const li = h('li', '');
    li.append(h('span', '', it.label), h('b', '', bits.join(t('・', ' · ')) || t('—', '—')));
    ul.append(li);
  }
  cs.append(ul);
  const total = [cost.money ? fmtG(cost.money) : '', cost.rp ? `${cost.rp} RP` : '', cost.monthly ? t(`毎月 ${fmtG(cost.monthly)}`, `${fmtG(cost.monthly)}/mo`) : ''].filter(Boolean).join(t('・', ' · '));
  cs.append(h('p', 'isl-prop-total', t(`合計：${total || '費用なし'}`, `Total: ${total || 'free'}`)));
  for (const b of block) cs.append(h('p', 'isl-bad isl-prop-block', b));
  body.append(cs);
  panel.append(body);

  // ボタン
  const foot = h('div', 'isl-prop-foot');
  const close = (what: 'ok' | 'skip' | 'later') => {
    m.remove();
    o.done?.(what);
  };
  const ok = btn(t('承認する', 'Approve'), () => {
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
  }, 'is-on isl-prop-ok');
  ok.disabled = block.length > 0;
  foot.append(ok, btn(t('見送る', 'Pass'), () => close('skip'), 'isl-prop-skip'));
  if (o.later) foot.append(btn(t('あとで（受け箱へ）', 'Later (inbox)'), () => close('later'), 'isl-prop-later'));
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
