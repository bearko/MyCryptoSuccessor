/**
 * 段 UIX3d：経営方針（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：方針」）。
 * 決まり・文・選べる方針は今の画面と同じ（policy.ts・policycards.ts の関数を同じ引数で）。
 * - 方針の札：同じ形の札（絵・名前・手法の要点・いまの効き目・副次効果）。今かかっている方針は「施行中」の札
 * - 選ぶのは選ぶ引き出し（下から出る板・押して選ぶ・下の主のキーで決める）。全社方針は枠の数まで選べる（選んだ数のランプ）
 * - 方針の画面（札）：全社方針（枠のランプ・施行中の札・特別なパネル「枠 +1」）・事業別の方針（部門の色の帯・部長の顔）・開放の一覧
 * - マインちゃんが 1 回だけ聞く窓：引き出しの上に、マインちゃんの一言（あとで決める＝今と同じ「バランスのまま」）
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { uxKey, uxLamp, uxTape } from '../parts';
import { uxSfx } from '../sound';
import { uxpCard, uxpDrawer, uxpEmpty, uxpFace, uxpHead, uxpSelect, uxpStamp } from '../sparts';
import type { Ctx } from '../../p1/screens';
import type { DeptId, PolicyDef } from '../../p1/data';
import type { P1State } from '../../p1/model';
import { Q } from './d-deps';
import { LITE, dDept, dFace, dIco, dText } from './d-kit';
import { kIcon } from './k-icons';
import './d-card.css';
import './d-pol.css';

const dot = () => t('・', ', ');
/** 方針の絵（仮の絵：絵文字の印をドットの絵に。表に無いものは旗） */
const polIco = (p: PolicyDef, o = LITE) => dIco(p.icon, { ...o, scale: 2 }, 'flag');

/** 方針の札（一覧のカードと同じ形）：絵・名前・手法の要点・いまの効き目・副次効果。施行中なら札 */
export function polCard(s: P1State, p: PolicyDef, o: { on?: boolean; rec?: boolean; fx?: 'now' | 'base' | 'power'; onTap?: (c: HTMLElement) => void; selected?: boolean; off?: boolean; right?: HTMLElement | null } = {}): HTMLElement {
  const P = Q.polKit;
  const fx = o.fx === 'base' ? [P.baseFxText(p)] : o.fx === 'power' ? Q.powerLines(s, p) : [P.polFxOf(s, p).map((f) => P.fxLine(f.k, f.v)).join(dot())];
  const st = o.on ? uxpStamp(t('施行中', 'In force'), { kind: 'good' }) : null;
  st?.show();
  const card = uxpCard({
    pic: el('span.uxd-pol-pic', polIco(p)),
    name: dText(p.name),
    tags: [st?.el ?? null, o.rec ? uxTape(el('b', t('推奨', 'Rec.')), 'amber') : null, p.kind === 'dept' ? dDept(p.dept) : null],
    desc: dText(p.note),
    foot: el('span.uxd-pol-fx', ...fx.filter(Boolean).map((x) => el('span.uxd-pol-fxl', kIcon('up', { ...LITE, color: '#36e08b' }), el('span', dText(x)))), el('span.uxd-pol-side', kIcon('scales', LITE), el('span', t(`副次効果：${dText(P.sideText(p))}`, `Side effects: ${dText(P.sideText(p))}`)))),
    right: o.right ?? null,
    onTap: o.onTap,
    selected: o.selected,
    off: o.off,
    cls: `uxd-pol-card${o.on ? ' is-on' : ''}`,
    attrs: { 'data-policy': p.id },
  });
  return card;
}

// ---------------------------------------------------------------- マインちゃんの問い（全社方針の 1 つ目）
/** 方針を選ぶ引き出し（時間が止まる）。mine：マインちゃんが聞く（1 回だけ）。then：閉じたあと（選んだ・あとで） */
export function openPolicyPickUx(ctx: Ctx, o: { mine?: boolean; then?: () => void } = {}) {
  const P = Q.polKit;
  const s = ctx.s();
  ctx.root.querySelector('.isl-pol')?.remove();
  const cur = P.corpOf(s)[0];
  let sel: string | null = cur ?? null;
  let done = false;
  const later = () => {
    if (o.mine) s.flags.policyAsked = true;
    ctx.save();
  };
  const dr = uxpDrawer({
    root: ctx.root,
    title: o.mine ? t('全社方針（社長の価値観）を聞かせて', 'Your values: the company policy') : t('全社方針（社長の価値観）', 'Company policy (your values)'),
    ico: 'flag',
    cls: 'isl-pol uxd-pol-dr',
    note: t('提案書の推奨・ヒーローの言い方・部長の提案の並びが、この方針で変わります。方針ごとに小さな効き目もあります。', 'This shapes recommendations, how heroes pitch and how proposals are ordered. Each policy also has a small effect.'),
    decide: { label: t('この方針にする', 'Set this policy'), onDecide: () => go() },
    side: uxKey(o.mine ? t('あとで決める（バランスのまま）', 'Decide later (stay Balanced)') : t('閉じる', 'Close'), () => dr.close(), { kind: 'weak', cls: 'isl-pol-later' }),
    onClose: () => {
      if (!done) later();
      o.then?.();
    },
  });
  if (o.mine) dr.body.append(el('div.uxd-pol-mine', dFace({ hero: null }, 64), el('div.uxd-pol-say', uxTape(el('b', t('マインちゃん', 'Mine-chan')), 'dark'), el('p', dText(P.askLine())))));
  const list = el('div.uxp-list.uxd-pol-list');
  const ids = P.POLICIES.filter((p) => p.kind === 'corp' && (P.START_IDS.includes(p.id) || P.isOpen(s, p.id))).map((p) => p.id);
  const cards: HTMLElement[] = [];
  for (const id of ids) {
    const p = P.POLICY_OF[id];
    const c = polCard(s, p, { on: id === cur, fx: 'base', selected: id === sel, onTap: () => pick(id, c) });
    cards.push(c);
    list.append(c);
  }
  dr.body.append(list);
  function pick(id: string, c: HTMLElement) {
    sel = id;
    cards.forEach((x) => uxpSelect(x, x === c, x === c));
    dr.setDecide({ on: true, name: dText(P.policyName(id)) });
  }
  if (sel) dr.setDecide({ on: true, name: dText(P.policyName(sel)) });
  function go() {
    if (!sel) return;
    done = true;
    P.setPolicy(ctx.s(), sel);
    ctx.sfx?.('tap');
    ctx.toast(t(`全社方針を「${P.policyName(sel)}」にしました`, `Company policy set to “${P.policyName(sel)}”`));
    Q.after(ctx);
    dr.close();
  }
}

// ---------------------------------------------------------------- 受け箱の上の札
/** 経営企画の「受け箱」の上の 1 枚：いまの全社方針・事業別の方針の数と「方針を見る」 */
export function policyCardUx(ctx: Ctx): HTMLElement {
  const P = Q.polKit;
  const s = ctx.s();
  const corp = P.corpOf(s).map((id) => P.POLICY_OF[id]);
  const n = P.slotsOf(s);
  const free = corp.length < n && P.openPolicies(s, 'corp').length > corp.length;
  const gift = P.slotPending(s) > 0;
  const lamps = el('span.uxd-pol-slots', { role: 'img', 'aria-label': t(`全社方針 ${corp.length} / ${n} 枠`, `Company ${corp.length} / ${n}`) }, Array.from({ length: n }, (_, i) => uxLamp('good', i < corp.length)), el('span.ux-num', `${corp.length}/${n}`));
  const go = uxKey(t('方針を見る', 'Policies'), () => Q.polOpenView(ctx), { kind: gift ? 'main' : '', cls: `uxd-pol-go isl-pol-change${gift ? ' is-glow' : ''}`, ico: 'flag' });
  return el(
    'div.uxd-polbox.ux-root',
    uxpHead(t('経営方針', 'Management policy'), { kind: 'amber', ico: 'flag', right: lamps }),
    el('div.uxd-polbox-row', el('div.uxd-polbox-cur', ...corp.map((p) => el('span.uxd-polbox-p', polIco(p), el('b', dText(p.name))))), go),
    el('p.uxd-polbox-n', t(`事業別 ${P.presDepts(s).filter((d) => P.deptPolicyOf(s, d)).length} 部門・選べる方針 ${P.openPolicies(s).length} / ${P.POLICIES.length}`, `${P.presDepts(s).filter((d) => P.deptPolicyOf(s, d)).length} division policies · ${P.openPolicies(s).length} / ${P.POLICIES.length} unlocked`)),
    gift ? el('p.uxd-polbox-gift', uxLamp('', true, true), kIcon('gift', { ...LITE, color: '#ffb81f' }), t('全社方針の枠 +1 が受け取れます', 'A free +1 policy slot is ready')) : free ? el('p.uxd-polbox-free', uxLamp('cyan', true), t('空いた枠があります', 'A slot is free')) : null,
  );
}

// ---------------------------------------------------------------- 方針の画面
const TIER_EN: Record<string, string> = { C: 'Common', U: 'Uncommon', R: 'Rare', E: 'Epic', L: 'Legendary' };
/** 方針の画面（札の中身）。器は今の札（open）のまま */
export function policyViewBody(ctx: Ctx, body: HTMLElement) {
  const P = Q.polKit;
  const s = ctx.s();
  body.classList.add('isl-pv', 'uxd-pv', 'ux-root');
  const lock = P.meetingsOn(s);
  body.append(el('p.uxd-pv-lead', lock ? t('方針は毎年、年初の経営会議（経営方針発表会）で決めます。空いた枠・方針の無い部門は、いつでも埋められます。主要な効き目は＋だけで、部門のレベル（理解度）と部長の能力で強くなります。副次効果には＋も−もあります。', 'Policies are set each year at the opening board meeting. Empty slots and divisions without a policy can be filled anytime. Main effects are positive and grow with department level and the head’s ability; side effects can cut both ways.') : t('方針はいつでも変えられます（Rare から、年初の経営会議で決めるようになります）。主要な効き目は＋だけで、部門のレベル（理解度）と部長の能力で強くなります。副次効果には＋も−もあります。', 'You can change policies anytime (from Rare they’re set at the opening board meeting). Main effects are positive and grow with department level and the head’s ability; side effects can cut both ways.')));
  // 全社方針
  const n = P.slotsOf(s);
  const corp = P.corpOf(s);
  const lamps = el('span.uxd-pol-slots', Array.from({ length: n }, (_, i) => uxLamp('good', i < corp.length)), el('span.ux-num', `${corp.length}/${n}`));
  body.append(uxpHead(t('全社方針', 'Company policies'), { kind: 'amber', ico: 'flag', note: lamps, right: uxKey(t('選び直す', 'Choose'), () => Q.polOpenCorp(ctx), { cls: 'uxd-pv-pick isl-pv-pick' }) }));
  const l1 = el('div.uxp-list');
  for (const id of corp) l1.append(polCard(s, P.POLICY_OF[id], { on: true, fx: 'power' }));
  for (let k = corp.length; k < n; k++) l1.append(el('div.uxd-pv-free', uxLamp('cyan', true, true), el('span', t('空いた枠（選ぶと効き目が重なります）', 'Free slot — effects stack'))));
  body.append(l1);
  // 特別なパネル「全社方針の枠 +1」
  const tier = P.slotNextTier(s);
  if (tier) {
    const claim = uxKey(t('受け取る', 'Claim'), () => {
      const m = P.claimSlot(s);
      if (m == null) return;
      ctx.sfx?.('okay');
      ctx.toast(t(`🎁 全社方針の枠が ${m} つになりました。空いた枠に方針を選べます`, `🎁 You now have ${m} company policy slots — fill the new one`));
      ctx.save();
      Q.after(ctx);
      Q.polOpenView(ctx);
    }, { kind: 'main', big: true, cls: 'uxd-pv-claim isl-pv-gift', ico: 'check' });
    body.append(uxpCard({ pic: el('span.uxd-pol-pic', kIcon('gift', { ...LITE, color: '#ffb81f', scale: 2 })), name: t('全社方針の枠 +1', 'Company policy slot +1'), desc: t(`${TIER_EN[tier]} の町に進出した特典。無償（お金・RP 0）で、全社方針が ${n} → ${n + 1} 枠に`, `Reward for reaching a ${TIER_EN[tier]} town. Free (no money or RP): ${n} → ${n + 1} slots`), right: claim, cls: 'uxd-pv-gift' }));
  }
  const locked = P.slotLocked(s).filter((x) => x.n > n + P.slotPending(s));
  for (const x of locked) body.append(el('p.uxd-pv-lock', kIcon('lock', LITE), t(`${x.n} 枠目：${TIER_EN[x.tier]} の町に進出すると取れる`, `Slot ${x.n}: expand to a ${TIER_EN[x.tier]} town`)));
  if (n < 5 && !tier) body.append(el('p.uxd-pv-dim', t('枠は、上のランクの町に初めて進出するたびに 1 つ増えます（無償の特別なパネル。Legendary の進出で 5 つ）。', 'You gain a slot each time you first expand to a higher-rank town (a free special panel; 5 at Legendary).')));
  // 事業別の方針
  body.append(uxpHead(t('事業別の方針', 'Division policies'), { kind: 'amber', ico: 'list' }));
  const ds = P.presDepts(s);
  if (!ds.length) body.append(uxpEmpty(t('まだ選べる事業別の方針がありません', 'No division policies yet'), { ico: 'flag', sub: t('スキルツリーの各部門の「経営方針」パネルと、石板のノウハウで開きます', 'Unlock them with each department’s “Policy” panel and tablet know-how') }));
  for (const d of ds) {
    const id = P.deptPolicyOf(s, d);
    const H = Q.headOf(s, d);
    const top = el(
      'div.uxd-pv-dhead',
      dDept(d),
      H ? uxpFace(Q.heroIcon(H.hero, 64), { win: 40 }) : null,
      el('span.uxd-pv-dwho', H ? t(`部長 ${Q.heroNm(H.hero)}`, `Head ${Q.heroNm(H.hero)}`) : t('部長なし（社長が決める）', 'No head (you decide)')),
      P.canSetDept(s, d) || !lock ? uxKey(id ? t('変える', 'Change') : t('選ぶ', 'Choose'), () => Q.polOpenDept(ctx, d), { cls: 'uxd-pv-pick isl-pv-pick' }) : null,
    );
    top.style.setProperty('--d', Q.DEPT[d].color);
    const sec = el('section.uxd-pv-dept.isl-pv-dept', top, id ? polCard(s, P.POLICY_OF[id], { on: true, fx: 'power' }) : el('div.uxd-pv-free', uxLamp('', false), el('span', t('方針なし（選ぶと効き目が付きます）', 'No policy (choose one to add its effect)'))));
    sec.dataset.dept = d;
    body.append(sec);
  }
  // 開放の一覧
  body.append(uxpHead(t('開放の一覧', 'Unlocks'), { kind: 'dark', ico: 'list', right: el('span.ux-num.uxd-pv-cnt', `${P.openPolicies(s).length} / ${P.POLICIES.length}`) }));
  for (const [kind, title] of [
    ['corp', t('全社方針', 'Company')],
    ['dept', t('事業別', 'Division')],
  ] as const) {
    body.append(el('h4.uxd-pv-h', title));
    const grid = el('div.uxd-pv-grid');
    for (const p of P.POLICIES.filter((x) => x.kind === kind)) {
      const ok = P.isOpen(s, p.id);
      const e = el(`div.uxd-pv-item.isl-pv-item.${ok ? 'is-open' : 'is-lock'}`, { 'data-policy': p.id }, el('span.uxd-pv-ih', ok ? polIco(p) : kIcon('lock', { ...LITE, scale: 2 }), kind === 'dept' ? dDept(p.dept) : null, el('b', dText(p.name))), el('span.uxd-pv-in', ok ? dText(p.note) : dText(P.openText(s, p))), ok ? el('span.uxd-pv-if', dText(P.baseFxText(p))) : null);
      grid.append(e);
    }
    body.append(grid);
  }
}
export function openPolicyViewUx(ctx: Ctx) {
  Q.open(ctx, t('経営方針', 'Management policy'), (body: HTMLElement) => policyViewBody(ctx, body));
}

// ---------------------------------------------------------------- 全社方針・事業別の方針を選ぶ引き出し
/** 全社方針を選ぶ（枠の数まで。会議が始まったあとは、いまの方針を外せない＝空いた枠を埋めるだけ） */
export function openCorpPickUx(ctx: Ctx) {
  const P = Q.polKit;
  const s = ctx.s();
  const n = P.slotsOf(s);
  const keep = P.meetingsOn(s) ? P.corpOf(s) : [];
  let pick = [...P.corpOf(s)];
  ctx.root.querySelector('.isl-pol')?.remove();
  const lamps = el('span.uxd-pol-slots');
  const dr = uxpDrawer({
    root: ctx.root,
    title: t(`全社方針を選ぶ（${n} 枠まで）`, `Choose company policies (up to ${n})`),
    ico: 'flag',
    cls: 'isl-pol uxd-pol-dr',
    note: keep.length ? t('いま選んでいる方針は、年初の経営会議まで替えられません。空いた枠に足せます。', 'Current policies stay until the opening board meeting; you can fill empty slots.') : t('選んだ方針の重みを合わせて推奨を決めます。効き目は重なります。', 'Recommendations blend the chosen policies; effects stack.'),
    decide: { label: t('決める', 'Set'), onDecide: () => go() },
    side: lamps,
  });
  const list = el('div.uxp-list.uxd-pol-list');
  const cards: HTMLElement[] = [];
  for (const p of P.openPolicies(s, 'corp')) {
    const c = polCard(s, p, {
      on: P.corpOf(s).includes(p.id),
      fx: 'now',
      selected: pick.includes(p.id),
      off: keep.includes(p.id),
      onTap: keep.includes(p.id)
        ? undefined
        : () => {
            if (pick.includes(p.id)) pick = pick.filter((x) => x !== p.id);
            else if (pick.length < n) pick.push(p.id);
            else pick = [...pick.slice(0, n - 1), p.id].filter((x, i, a) => a.indexOf(x) === i);
            for (const k of keep) if (!pick.includes(k)) pick.unshift(k);
            ctx.sfx?.('tap');
            draw(p.id);
          },
    });
    cards.push(c);
    list.append(c);
  }
  dr.body.append(list);
  function draw(hit?: string) {
    lamps.replaceChildren(...Array.from({ length: n }, (_, i) => uxLamp('good', i < pick.length)), el('span.ux-num', t(`選んだ ${pick.length} / ${n}`, `${pick.length} / ${n} chosen`)));
    cards.forEach((c) => uxpSelect(c, pick.includes(c.dataset.policy!), !!hit && c.dataset.policy === hit && pick.includes(hit)));
    dr.setDecide({ on: pick.length > 0, name: pick.map((x) => dText(P.policyName(x))).join(dot()) });
  }
  draw();
  function go() {
    if (P.canSetCorp(s, pick) && P.setCorp(s, pick)) {
      ctx.toast(t(`全社方針：${pick.map(P.policyName).join(dot())}`, `Company policies: ${pick.map(P.policyName).join(dot())}`));
      ctx.save();
      Q.after(ctx);
    }
    uxSfx('confirm');
    dr.close();
  }
}
/** 事業別の方針を選ぶ（推奨の札つき） */
export function openDeptPickUx(ctx: Ctx, d: DeptId) {
  const P = Q.polKit;
  const s = ctx.s();
  const cur = P.deptPolicyOf(s, d);
  const rec = P.recDept(s, d);
  ctx.root.querySelector('.isl-pol')?.remove();
  let sel: string | null = cur ?? rec ?? null;
  const dr = uxpDrawer({
    root: ctx.root,
    title: t(`${Q.DEPT[d].name}の方針`, `${Q.DEPT[d].name} policy`),
    ico: 'flag',
    cls: 'isl-pol uxd-pol-dr',
    decide: { label: t('この方針にする', 'Set this policy'), onDecide: () => go() },
    side: uxKey(t('閉じる', 'Close'), () => dr.close(), { kind: 'weak', cls: 'isl-pol-later' }),
  });
  const list = el('div.uxp-list.uxd-pol-list');
  const cards: HTMLElement[] = [];
  for (const p of P.openPolicies(s, 'dept', d)) {
    const c = polCard(s, p, { on: p.id === cur, rec: p.id === rec, fx: 'now', selected: p.id === sel, onTap: () => pick(p.id, c) });
    cards.push(c);
    list.append(c);
  }
  dr.body.append(list);
  function pick(id: string, c: HTMLElement) {
    sel = id;
    cards.forEach((x) => uxpSelect(x, x === c, x === c));
    dr.setDecide({ on: true, name: dText(P.POLICY_OF[id].name) });
  }
  if (sel) dr.setDecide({ on: true, name: dText(P.POLICY_OF[sel].name) });
  function go() {
    if (sel && P.setDept(s, d, sel)) {
      ctx.toast(t(`${Q.DEPT[d].name}の方針を「${P.POLICY_OF[sel].name}」にしました`, `${Q.DEPT[d].name} policy set to “${P.POLICY_OF[sel].name}”`));
      ctx.save();
      Q.after(ctx);
    }
    uxSfx('confirm');
    dr.close();
  }
}
