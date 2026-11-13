/**
 * 段 UIX3d：担当者からの提案書（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：提案書」）。
 * 器は今の窓（.isl-modal.isl-prop：開いているあいだ時間が止まる）。中身（見込み・推奨・スライド）は今の画面と同じ（propModel・propSlides）。
 * - 上：話し手（顔の窓・「提案書」の貼り札・出どころ・部門・名前・読みの確かさのランプ）
 * - 投影される資料：1 枚ずつ送る（600ms・9 段の横送り。◀ ▶・ページのランプ・← →・指で横に払う）。KPI は桁の回る数字の札、
 *   12 か月の累計は縦の棒（このまま＝点線・承認後＝琥珀。◀ ▶ で月を選んで値を読む）
 * - 最後の 1 枚「決裁」：承認事項・資金の前後（桁が回る）・予算・止める理由 → 承認のレバー。落ちると資金が減って回り、
 *   ランプが順に点いて「承認済」、会社の判が打たれて閉じる
 * - 下に貼りつく帯：見送る・あとで（受け箱へ）・前へ・つぎへ（主のキー。最後の 1 枚ではレバーが主役）
 */
import { t } from '../../../i18n';
import { el, fmtN } from '../dom';
import { ux } from '../hooks';
import { later } from '../loop';
import { isCalm } from '../prefs';
import { Odo, uxKey, uxLamp, uxLever, uxTape } from '../parts';
import { uxSfx } from '../sound';
import { uxpFoot, uxpGap, uxpHead, uxpPaper, uxpStamp } from '../sparts';
import type { Ctx } from '../../p1/screens';
import type { Plan, PlanRes } from '../../p1/plan';
import type { ProposalOpts, SlideKit } from '../../p1/proposalui';
import type { Kpi } from '../../p1/slides';
import { Q } from './d-deps';
import { INK, LITE, dDept, dFace, dIco, dMore, dStars, dText, dTile, sgnTxt } from './d-kit';
import { dotEmoji, kIcon } from './k-icons';
import './d-card.css';
import './d-prop.css';

/** ページ送りの長さ（見本の報告と同じ 600ms・9 段） */
export const PAGE_MS = 600;
/** 承認したあと、判を見せてから閉じるまで */
export const CLOSE_MS = 700;

/** KPI のタイル（今の kpiTile と同じ中身を、桁の回る数字の札で）。開いたページで 0 から回る */
const rolls = new WeakMap<HTMLElement, () => void>();
export function kpiTileUx(k: Kpi): HTMLElement {
  const x = dTile({
    key: k.key,
    label: dText(k.label),
    ico: k.icon,
    v: k.v,
    unit: k.unit,
    delta: k.tone === 'delta',
    text: k.text,
    sub: k.sub,
    note: k.renow != null ? t(`いま計算し直すと ${sgnTxt(k.renow)} G`, `Recalculated now: ${sgnTxt(k.renow)} G`) : undefined,
  });
  // 今の画面と同じ目印（計算のしかたの ⓘ は、名前の札の横に付く）
  x.el.classList.add('isl-sl-kpi');
  x.el.querySelector('.uxd-tile-k')?.classList.add('isl-sl-lab');
  if (k.once) x.el.dataset.once = '1';
  rolls.set(x.el, () => x.roll());
  return x.el;
}

/**
 * 12 か月の累計（今の折れ線）を縦の棒に：月ごとに「このまま（点線）」と「承認後（琥珀）」の 2 本。0 の線から上下に伸びる。
 * 単発の施策は、効き目が切れた月に印を置き、そのあとの棒を網目に。◀ ▶（44px）か棒を押して月を選び、下の行で値を読む
 */
export function lineBars(now: number[], after: number[], o: { once?: { month: number; label: string } } = {}): HTMLElement {
  const n = now.length;
  const lo = Math.min(0, ...now, ...after);
  const hi = Math.max(0, ...now, ...after);
  const span = hi - lo || 1;
  const zero = ((0 - lo) / span) * 100;
  const cut = o.once ? Math.max(0, Math.min(n - 1, o.once.month)) : null;
  const read = el('div.uxd-lb-read', { 'aria-live': 'polite' });
  const cols: HTMLElement[] = [];
  let cur = n - 1;
  const bar = (v: number, cls: string) => {
    const h = (Math.abs(v) / span) * 100;
    const b = el(`i.uxd-lb-bar.${cls}${v < 0 ? '.is-neg' : ''}`);
    b.style.height = `${Math.max(v ? 1 : 0, Math.round(h))}%`;
    if (v >= 0) b.style.bottom = `${zero}%`;
    else b.style.top = `${100 - zero}%`;
    return b;
  };
  const plot = el('div.uxd-lb-plot', el('i.uxd-lb-zero', { style: { bottom: `${zero}%` } }));
  for (let k = 0; k < n; k++) {
    const fade = cut != null && k > cut ? '.is-fade' : '';
    // 列を押しても選べる（押しやすいのは下の ◀ ▶ のキー：44px。列は読み上げでは 1 枚の絵の一部）
    const c = el(`div.uxd-lb-col${fade}`, { 'aria-hidden': 'true' }, el('span.uxd-lb-pair', bar(now[k], 'is-now'), bar(after[k], 'is-after')), el('span.uxd-lb-m.ux-num', String(k + 1)));
    c.addEventListener('click', (e) => {
      e.stopPropagation();
      pick(k);
    });
    cols.push(c);
    plot.append(c);
  }
  if (cut != null && cut < n - 1) {
    const mark = el('span.uxd-lb-cut', { style: { left: `${((cut + 1) / n) * 100}%` } }, uxTape(el('b', dText(o.once!.label)), 'dark'));
    plot.append(mark);
  }
  function pick(k: number) {
    cur = Math.max(0, Math.min(n - 1, k));
    cols.forEach((c, i) => c.classList.toggle('is-on', i === cur));
    read.replaceChildren(el('b', t(`${cur + 1} か月目まで`, `Through month ${cur + 1}`)), el('span.uxd-lb-a', uxLamp('', true), el('span', 'To-Be'), el('b.ux-num', `${sgnTxt(after[cur])} G`)), el('span.uxd-lb-n', uxLamp('', false), el('span', 'As-Is'), el('b.ux-num', `${sgnTxt(now[cur])} G`)));
  }
  const prev = uxKey(el('span', kIcon('left', { ...LITE, scale: 2 }), el('span.ux-vh', t('前の月', 'Previous month'))), () => pick(cur - 1), { cls: 'uxd-lb-prev', attrs: { 'aria-label': t('前の月', 'Previous month'), 'data-ux-quiet': '' } });
  const next = uxKey(el('span', kIcon('next', { ...LITE, scale: 2 }), el('span.ux-vh', t('次の月', 'Next month'))), () => pick(cur + 1), { cls: 'uxd-lb-next', attrs: { 'aria-label': t('次の月', 'Next month'), 'data-ux-quiet': '' } });
  const legend = el('div.uxd-lb-legend', el('span.uxd-lb-key.is-after', el('i'), t('To-Be（承認後）', 'To-Be (after)')), el('span.uxd-lb-key.is-now', el('i'), t('As-Is（このまま）', 'As-Is (as is)')), el('span.uxd-lb-unit', t('横：か月', 'Across: months')));
  const e = el(
    'div.uxd-lb.isl-sl-line',
    { role: 'img', 'aria-label': t(`12 か月の利益の累計：このまま ${fmtN(now[n - 1])} G、承認後 ${fmtN(after[n - 1])} G`, `Cumulative profit: as is ${fmtN(now[n - 1])} G, after ${fmtN(after[n - 1])} G`) },
    legend,
    plot,
    el('div.uxd-lb-foot', prev, read, next),
  );
  if (o.once) e.dataset.once = String(o.once.month);
  pick(cur);
  return e;
}
const KIT: SlideKit = { kpiTile: kpiTileUx, lineChart: lineBars };

/** 提案書を開く（新しい画面）。閉じ方・承認の処理は今の画面と同じ */
export function openProposalUx(ctx: Ctx, plan: Plan, o: ProposalOpts = {}) {
  ctx.root.querySelector('.isl-prop')?.remove();
  const m = el('div.isl-modal.isl-prop');
  ux.modal?.(m, 'prop');
  const M = Q.propModel(ctx, plan, o);
  if (!M) return;
  const s = M.s;
  const H = Q.propHead(s, plan, M, o);
  const DC = Q.propDecide(s, plan, M);
  let closed = false;
  const close = (what: 'ok' | 'skip' | 'later') => {
    if (closed) return;
    closed = true;
    removeEventListener('keydown', onKey, true);
    m.remove();
    o.done?.(what);
  };

  // ---- 話し手
  const head = el(
    'div.uxd-prop-head',
    el('span.uxd-prop-face', dFace({ hero: H.hero }, 56)),
    el(
      'span.uxd-prop-who',
      el('span.uxd-prop-kick', uxTape([kIcon('sheet', INK), el('b', t('提案書', 'Proposal'))], 'amber'), el('span', dText(H.kicker)), dDept(H.dept)),
      el('span.uxd-prop-nm', el('b.uxd-prop-name', dText(H.name)), H.star ? el('span.uxd-prop-star', dStars(H.star, H.err)) : null),
    ),
  );
  if (H.errChip) {
    dotEmoji(H.errChip);
    head.querySelector('.uxd-prop-who')?.append(H.errChip);
  }

  // ---- 資料（今のスライドの中身）と、最後の 1 枚「決裁」
  const slides = Q.propSlides(ctx, plan, o, M, KIT, { go: (i) => go(i), close: (w) => close(w) });
  const dec = decidePage();
  const pages = [...slides.map((x) => ({ id: x.id, name: Q.SLIDE_NAME[x.id](), el: x.el })), { id: 'decide', name: t('決裁', 'Sign-off'), el: dec.el }];
  const screen = el('div.uxd-prop-screen', { tabindex: '0', role: 'region', 'aria-roledescription': t('スライド', 'slides') });
  const wraps = pages.map((p, k) => {
    p.el.classList.add('isl-sl');
    p.el.dataset.slide = p.id;
    p.el.setAttribute('aria-label', `${k + 1} / ${pages.length} ${p.name}`);
    const w = el('div.uxd-prop-page', p.el);
    w.hidden = k !== 0;
    screen.append(w);
    return w;
  });
  for (const w of wraps.slice(0, -1)) dotEmoji(w, '#1a1c2e');
  // 続きがあるときだけ、投影の面の下端に「▼ 続き」（いまのページを送り切ると消える）
  const more = dMore();
  screen.append(more);
  // ページのランプ（押すとそのページへ）
  const lampKeys = pages.map((p, k) =>
    uxKey(el('span.uxd-pg-in', uxLamp(k === pages.length - 1 ? 'good' : '', false), el('span.uxd-pg-n.ux-num', String(k + 1)), el('span.uxd-pg-name', p.name)), () => go(k), { cls: `uxd-pg${k === pages.length - 1 ? ' is-decide' : ''}`, attrs: { 'aria-label': `${k + 1}. ${p.name}`, 'data-ux-quiet': '' } }),
  );
  const pageName = el('b.uxd-prop-pname');
  const strip = el('div.uxd-prop-strip', lampKeys);

  // ---- 下に貼りつく帯
  const skip = uxKey(t('見送る', 'Pass'), () => close('skip'), { kind: 'weak', cls: 'uxd-prop-skip', attrs: DC.rec === 'skip' ? { 'data-rec': '1' } : {} });
  const laterKey = o.later ? uxKey(innerWidth < 600 ? t('あとで', 'Later') : t('あとで（受け箱へ）', 'Later (inbox)'), () => close('later'), { kind: 'weak', cls: 'uxd-prop-later' }) : null;
  const prev = uxKey(el('span', kIcon('left', { ...LITE, scale: 2 }), el('span.ux-vh', t('前のスライド', 'Previous slide'))), () => go(cur - 1), { cls: 'uxd-prop-prev', attrs: { 'aria-label': t('前のスライド', 'Previous slide'), 'data-ux-quiet': '' } });
  const nextLab = el('b', t('つぎへ', 'Next'));
  const next = uxKey(nextLab, () => go(cur + 1), { kind: 'main', big: true, ico: 'next', cls: 'uxd-prop-next', attrs: { 'data-ux-quiet': '' } });
  const foot = uxpFoot(el('span.uxd-prop-side', skip, laterKey, DC.rec === 'skip' ? uxTape(el('b', t('推奨', 'Rec.')), 'amber') : null), el('span.uxp-foot-main.uxd-prop-go', prev, next));

  const plate = el('div.uxd-prop.ux-plate.ux-root', { role: 'dialog', 'aria-label': t('提案書', 'Proposal') }, el('div.ux-screws'), head, el('div.uxd-prop-bar', strip, pageName), screen, foot);
  m.append(plate);
  m.addEventListener('click', (e) => e.stopPropagation());

  // ---- 送り
  let cur = 0;
  let busy = 0;
  function show(k: number) {
    pageName.textContent = `${k + 1} / ${pages.length}  ${pages[k].name}`;
    lampKeys.forEach((b, i) => {
      b.querySelector('.ux-lamp')?.classList.toggle('is-on', i <= k);
      b.setAttribute('aria-current', i === k ? 'step' : 'false');
      b.classList.toggle('is-cur', i === k);
    });
    prev.disabled = k === 0;
    next.hidden = k === pages.length - 1;
    pages.forEach((p, i) => p.el.setAttribute('aria-hidden', i === k ? 'false' : 'true'));
    for (const t2 of wraps[k].querySelectorAll<HTMLElement>('[data-kpi]')) {
      const r = rolls.get(t2);
      if (r) {
        rolls.delete(t2);
        r();
      }
    }
    if (k === pages.length - 1) dec.shown();
    more.watch(wraps[k]);
  }
  function go(i: number) {
    const k = Math.max(0, Math.min(pages.length - 1, i));
    if (k === cur || closed) return;
    const from = wraps[cur];
    const to = wraps[k];
    const dir = k > cur ? 'next' : 'prev';
    clearTimeout(busy);
    for (const w of wraps) w.classList.remove('is-in-next', 'is-in-prev', 'is-out-next', 'is-out-prev');
    wraps.forEach((w) => (w.hidden = w !== from && w !== to));
    to.hidden = false;
    to.scrollTop = 0;
    if (!isCalm()) {
      to.classList.add(`is-in-${dir}`);
      from.classList.add(`is-out-${dir}`);
      busy = window.setTimeout(() => {
        from.hidden = true;
        from.classList.remove(`is-out-${dir}`);
        to.classList.remove(`is-in-${dir}`);
      }, PAGE_MS);
    } else from.hidden = true;
    cur = k;
    uxSfx('page');
    show(k);
  }
  const onKey = (e: KeyboardEvent) => {
    if (!m.isConnected) return;
    const tg = e.target as HTMLElement | null;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      go(cur + (e.key === 'ArrowRight' ? 1 : -1));
    }
  };
  addEventListener('keydown', onKey, true);
  // 指で横に払う（縦に送っているときは送らない）
  let sw: { x: number; y: number } | null = null;
  screen.addEventListener('pointerdown', (e) => (sw = { x: e.clientX, y: e.clientY }));
  screen.addEventListener('pointerup', (e) => {
    if (!sw) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    sw = null;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.5) go(cur + (dx < 0 ? 1 : -1));
  });

  // ---- 最後の 1 枚：決裁（承認のレバー）
  function decidePage() {
    const funds = new Odo({ digits: Math.max(6, String(Math.max(0, Math.round(DC.cash))).length), value: Math.max(0, DC.cash) });
    const afterTxt = el('b.ux-num.uxd-dc-after', `${DC.left < 0 ? '−' : ''}${fmtN(Math.abs(DC.left))} G`);
    const asks = el('ol.uxd-dc-asks');
    for (const a of DC.asks) asks.append(el('li', dDept(a.dept), dIco(a.icon, INK, 'check'), el('b', dText(a.what)), el('span.uxd-dc-cost', a.cost), a.ask ? uxTape(el('b', a.ask), 'dark') : null));
    if (DC.title) asks.append(el('li', el('b', dText(DC.title))));
    if (DC.drop) asks.append(el('li.is-drop', kIcon('warn', { ...INK, color: '#9c2238' }), el('span', dText(DC.drop))));
    const gap = DC.left < 0 ? uxpGap(DC.cash, DC.money) : null;
    const paper = uxpPaper(
      { cls: 'uxd-dc-paper' },
      uxpHead(t('承認事項', 'For approval'), { kind: 'dark' }),
      asks,
      el(
        'div.uxd-dc-funds',
        el('span.uxd-dc-k', kIcon('coin', INK), t('資金', 'Funds')),
        funds.el,
        el('span.uxd-dc-arrow', '→'),
        afterTxt,
        el('span.uxd-dc-res', t(`ひと月の固定費の目安 ${Q.money(DC.reserve)}`, `A month of fixed costs: ${Q.money(DC.reserve)}`)),
      ),
      DC.budget ? el(`p.uxd-dc-budget.is-${DC.budget.inside ? 'in' : 'over'}`, uxLamp(DC.budget.inside ? 'good' : 'bad', true), DC.budget.inside ? t(`${DC.budget.name}部の予算内`, `Within ${DC.budget.name} budget`) : t(`${DC.budget.name}部の予算外（${Q.money(DC.budget.over)} 超え）`, `Over ${DC.budget.name} budget by ${Q.money(DC.budget.over)}`)) : null,
      el('p.uxd-dc-why', dText(DC.why)),
      ...DC.block.map((b) => el('p.uxd-dc-block', kIcon('warn', { ...INK, color: '#9c2238' }), el('span', dText(b)))),
      gap ? gap.el : null,
    );
    const seal = uxpStamp(DC.storeName || t('承認', 'OK'), { kind: 'amber', ico: null });
    seal.el.classList.add('uxd-dc-seal');
    let engaged = false;
    const lever = uxLever({
      label: t('承認', 'OK'),
      aria: t('承認する（レバーを下げる）', 'Approve (pull the lever down)'),
      can: () => !DC.block.length && !engaged,
      onEngage: () => {
        engaged = true;
        const r: PlanRes = (o.approve ?? ((p: Plan) => Q.applyPlan(ctx.s(), p)))(plan);
        if (!r.ok) {
          ctx.sfx?.('error');
          ctx.toast(r.err === 'money' ? t('資金が足りません', 'Not enough funds') : r.err === 'rp' ? t('研究ポイントが足りません', 'Not enough RP') : t('もう打てない提案でした', 'That proposal is no longer possible'));
          return close('skip');
        }
        Q.after(ctx);
        funds.set(Math.max(0, ctx.s().money), { dur: 900, onTick: () => uxSfx('tick') });
        sum = r.did.length ? r.did.slice(0, 4).join(t('・', ' · ')) : t('承認しました', 'Approved');
      },
      onDone: () => {
        seal.hit(plate);
        later(isCalm() ? 60 : CLOSE_MS, () => {
          ctx.sfx?.('levelup');
          ctx.toast('✔ ' + sum);
          close('ok');
        });
      },
      shakeEl: () => plate,
    });
    let sum = '';
    if (DC.block.length) lever.el.classList.add('is-block');
    const box = el('section.uxd-dc', el('h3.isl-sl-h', t('決裁', 'Sign-off')), el('div.uxd-dc-cols', paper, el('div.uxd-dc-lever', el('div.uxd-dc-lamps', lever.lamps, lever.done), lever.el, seal.el)));
    return {
      el: box,
      shown() {
        funds.set(Math.max(0, DC.cash), { dur: 0 });
      },
    };
  }

  ctx.root.append(m);
  show(0);
  // 1 枚目の KPI が回る
  uxSfx('open');
  ctx.sfx?.('page');
}
