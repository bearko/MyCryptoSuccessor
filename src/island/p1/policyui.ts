/**
 * 経営方針の画面（決まりは policy.ts。DOM はここ）。
 * - 段 UI7c：openPolicyPick（マインちゃんが 1 回だけ聞く。全社方針の 1 つ目）・policyCard（経営企画の「受け箱」の上の札）。
 * - 段 K：openPolicyView（方針の画面：いまの全社方針と事業別の方針・効き目の数字（基本 × 部門のレベル × 部長の能力）・開放の一覧）・
 *   openCorpPick（全社方針を枠の数まで選ぶ）・openDeptPick（事業別の方針）・
 *   経営方針発表会（段 I2 の年初の会議）：BOARD_SCENES に「社長が全社方針を発表 → 部長のいない部門の方針」、BOARD_ITEM_LINES に「部長の事業別の方針の発表」を足す。
 * - 段 K2：全社方針の枠 +1（ランクアップの特別なパネル・無償）は、方針の画面の全社方針の「枠」の所で受け取る（slotClaim）。受け箱の上の札も光る。
 * - 方針のアイコンは絵文字の仮の絵（docs/ISLAND_ART_TODO.md）。
 */
import { t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { DEPT, POLICIES, POLICY_OF, type DeptId, type PolicyDef, type Tier } from './data';
import {
  askLine,
  baseFxText,
  canSetCorp,
  claimSlot,
  canSetDept,
  corpOf,
  deptPolicyOf,
  fxLine,
  fxVal,
  isOpen,
  meetingsOn,
  openPolicies,
  openText,
  polFxOf,
  policyName,
  polPower,
  presDepts,
  recDept,
  setCorp,
  setDept,
  setPolicy,
  slotLocked,
  slotNextTier,
  slotPending,
  slotsOf,
  START_IDS,
} from './policy';
import { heroNm, headOf } from './deleg';
import { after, open, type Ctx } from './screens';
import { btn, h, recLine } from './ui';
import type { P1State } from './model';
import { sideText } from './policycards';
import './pol.css';

const dot = () => t('・', ', ');
/** 方針の名前（アイコンつき） */
const label = (p: PolicyDef) => `${p.icon} ${p.name}`;
/** 効き目の数字：いまの強さ（基本 × 部門のレベル × 部長の能力 → 値） */
export function powerLines(s: P1State, p: PolicyDef): string[] {
  const w = polPower(s, p);
  return polFxOf(s, p).map((f) => {
    const who = w.who != null ? (p.sector ? t(`セクター長 ×${w.head.toFixed(2)}`, `sector heads ×${w.head.toFixed(2)}`) : t(`部長 ${heroNm(w.who)} ×${w.head.toFixed(2)}`, `head ${heroNm(w.who)} ×${w.head.toFixed(2)}`)) : p.sector ? t('セクター長なし ×1', 'no sector head ×1') : t('部長なし ×1', 'no head ×1');
    return t(
      `${fxLine(f.k, f.base)} × ${DEPT[p.dept].name} Lv${w.level} ×${w.lv.toFixed(2)} × ${who} → ${fxVal(f.k, f.v)}`,
      `${fxLine(f.k, f.base)} × ${DEPT[p.dept].name} Lv${w.level} ×${w.lv.toFixed(2)} × ${who} → ${fxVal(f.k, f.v)}`,
    );
  });
}
/** いまの値だけ（「需要 +2.6%」） */
const nowText = (s: P1State, p: PolicyDef) => polFxOf(s, p).map((f) => fxLine(f.k, f.v)).join(dot());

// ---------------------------------------------------------------- 段 UI7c：マインちゃんの問い（全社方針の 1 つ目）

/** 方針を選ぶ窓（時間が止まる .isl-modal）。mine：マインちゃんが聞く（1 回だけ）。then：閉じたあと（選んだ・あとで） */
export function openPolicyPick(ctx: Ctx, o: { mine?: boolean; then?: () => void } = {}) {
  const s = ctx.s();
  ctx.root.querySelector('.isl-pol')?.remove();
  const m = h('div', 'isl-modal isl-pol');
  const panel = h('div', 'isl-pol-panel');
  const head = h('div', 'isl-pol-head');
  if (o.mine) {
    const mi = h('img', 'isl-pol-mine');
    mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
    mi.alt = '';
    const say = h('div', 'isl-pol-say');
    say.append(h('b', '', t('マインちゃん', 'Mine-chan')), h('p', '', askLine()));
    head.append(mi, say);
  } else head.append(h('h3', '', t('全社方針（社長の価値観）', 'Company policy (your values)')));
  panel.append(head);
  panel.append(h('p', 'isl-pol-lead', t('提案書の推奨・ヒーローの言い方・部長の提案の並びが、この方針で変わります。方針ごとに小さな効き目もあります。', 'This shapes recommendations, how heroes pitch and how proposals are ordered. Each policy also has a small effect.')));
  const list = h('div', 'isl-pol-list');
  const cur = corpOf(s)[0];
  const close = () => {
    m.remove();
    o.then?.();
  };
  const ids = POLICIES.filter((p) => p.kind === 'corp' && (START_IDS.includes(p.id) || isOpen(s, p.id))).map((p) => p.id);
  for (const id of ids) {
    const p = POLICY_OF[id];
    const b = h('button', `isl-pol-opt ${id === cur ? 'is-on' : ''}`);
    b.type = 'button';
    b.dataset.policy = id;
    const top = h('b', '', label(p));
    if (id === cur) top.append(h('span', 'isl-pol-cur', t('いまの方針', 'Current')));
    b.append(top, h('small', '', p.note), h('small', 'isl-pol-fx', baseFxText(p)));
    b.addEventListener('click', () => {
      setPolicy(ctx.s(), id);
      ctx.sfx?.('tap');
      ctx.toast(t(`全社方針を「${policyName(id)}」にしました`, `Company policy set to “${policyName(id)}”`));
      after(ctx);
      close();
    });
    list.append(b);
  }
  panel.append(list);
  const foot = h('div', 'isl-pol-foot');
  foot.append(
    btn(o.mine ? t('あとで決める（バランスのまま）', 'Decide later (stay Balanced)') : t('閉じる', 'Close'), () => {
      if (o.mine) s.flags.policyAsked = true;
      ctx.save();
      close();
    }, 'isl-pol-later'),
  );
  panel.append(foot);
  m.append(panel);
  m.addEventListener('click', (e) => e.stopPropagation());
  ctx.root.append(m);
  ctx.sfx?.('page');
}

/** 経営企画の「受け箱」の上の 1 枚：いまの全社方針・事業別の方針の数と「方針を見る」 */
export function policyCard(ctx: Ctx): HTMLElement {
  const s = ctx.s();
  const c = h('div', 'isl-card2 isl-pol-card');
  const corp = corpOf(s).map((id) => POLICY_OF[id]);
  const n = slotsOf(s);
  c.append(h('h3', '', t('経営方針', 'Management policy')));
  const row = h('div', 'isl-pol-row');
  const txt = h('div', '');
  txt.append(h('b', '', corp.map(label).join(dot())), h('small', 'isl-dim', t(`全社方針 ${corp.length} / ${n} 枠・事業別 ${presDepts(s).filter((d) => deptPolicyOf(s, d)).length} 部門・選べる方針 ${openPolicies(s).length} / ${POLICIES.length}`, `Company ${corp.length} / ${n} · ${presDepts(s).filter((d) => deptPolicyOf(s, d)).length} division policies · ${openPolicies(s).length} / ${POLICIES.length} unlocked`)));
  const free = corp.length < n && openPolicies(s, 'corp').length > corp.length;
  const gift = slotPending(s) > 0;
  if (gift) txt.append(h('small', 'isl-pol-gift', t('🎁 全社方針の枠 +1 が受け取れます', '🎁 A free +1 policy slot is ready')));
  else if (free) txt.append(h('small', 'isl-pol-free', t('空いた枠があります', 'A slot is free')));
  row.append(txt, btn(t('方針を見る', 'Policies'), () => openPolicyView(ctx), `isl-pol-change ${gift ? 'is-glow' : ''}`));
  c.append(row);
  return c;
}

// ---------------------------------------------------------------- 段 K：方針の画面

/** 方針の画面（経営企画 → 受け箱の上の札 →「方針を見る」） */
export function openPolicyView(ctx: Ctx) {
  open(ctx, t('経営方針', 'Management policy'), (body) => {
    const s = ctx.s();
    body.classList.add('isl-pv');
    const lock = meetingsOn(s);
    body.append(h('p', 'isl-dim isl-pv-lead', lock ? t('方針は毎年、年初の経営会議（経営方針発表会）で決めます。空いた枠・方針の無い部門は、いつでも埋められます。主要な効き目は＋だけで、部門のレベル（理解度）と部長の能力で強くなります。副次効果には＋も−もあります。', 'Policies are set each year at the opening board meeting. Empty slots and divisions without a policy can be filled anytime. Main effects are positive and grow with department level and the head’s ability; side effects can cut both ways.') : t('方針はいつでも変えられます（Rare から、年初の経営会議で決めるようになります）。主要な効き目は＋だけで、部門のレベル（理解度）と部長の能力で強くなります。副次効果には＋も−もあります。', 'You can change policies anytime (from Rare they’re set at the opening board meeting). Main effects are positive and grow with department level and the head’s ability; side effects can cut both ways.')));
    // 全社方針
    const n = slotsOf(s);
    const corp = corpOf(s);
    const c1 = h('div', 'isl-card2 isl-pv-sec');
    const hd = h('div', 'isl-pol-row');
    hd.append(h('h3', '', t(`全社方針（${corp.length} / ${n} 枠）`, `Company policies (${corp.length} / ${n})`)), btn(t('選び直す', 'Choose'), () => openCorpPick(ctx), 'isl-pv-pick'));
    c1.append(hd);
    for (const id of corp) c1.append(polRow(s, POLICY_OF[id]));
    if (corp.length < n) c1.append(h('p', 'isl-pol-free', t(`空いた枠 ${n - corp.length}（選ぶと効き目が重なります）`, `${n - corp.length} free slot(s) — effects stack`)));
    // 段 K2：ランクアップの特別なパネル（受け取る）と、まだ取れない枠の条件
    const gift = slotClaim(ctx);
    if (gift) c1.append(gift);
    const locked = slotLocked(s).filter((x) => x.n > n + slotPending(s));
    if (locked.length) {
      const ul = h('div', 'isl-pv-slots');
      for (const x of locked) ul.append(h('small', 'isl-pv-slot', t(`🔒 ${x.n} 枠目：${TIER_EN[x.tier]} の町に進出すると取れる`, `🔒 Slot ${x.n}: expand to a ${TIER_EN[x.tier]} town`)));
      c1.append(ul);
    }
    if (n < 5 && !gift) c1.append(h('small', 'isl-dim', t('枠は、上のランクの町に初めて進出するたびに 1 つ増えます（無償の特別なパネル。Legendary の進出で 5 つ）。', 'You gain a slot each time you first expand to a higher-rank town (a free special panel; 5 at Legendary).')));
    body.append(c1);
    // 事業別の方針
    const c2 = h('div', 'isl-card2 isl-pv-sec');
    c2.append(h('h3', '', t('事業別の方針', 'Division policies')));
    const ds = presDepts(s);
    if (!ds.length) c2.append(h('p', 'isl-dim', t('まだ選べる事業別の方針がありません（スキルツリーの各部門の「経営方針」パネルと、石板のノウハウで開きます）。', 'No division policies yet (unlock them with each department’s “Policy” panel and tablet know-how).')));
    for (const d of ds) {
      const id = deptPolicyOf(s, d);
      const H = headOf(s, d);
      const row = h('div', 'isl-pv-dept');
      const top = h('div', 'isl-pol-row');
      const nm = h('div', '');
      nm.append(h('b', '', `${DEPT[d].icon} ${DEPT[d].name}`), h('small', 'isl-dim', H ? t(`部長 ${heroNm(H.hero)}`, `Head ${heroNm(H.hero)}`) : t('部長なし（社長が決める）', 'No head (you decide)')));
      top.append(nm);
      if (canSetDept(s, d) || !lock) top.append(btn(id ? t('変える', 'Change') : t('選ぶ', 'Choose'), () => openDeptPick(ctx, d), 'isl-pv-pick'));
      row.append(top);
      if (id) row.append(polRow(s, POLICY_OF[id]));
      else row.append(h('p', 'isl-pol-free', t('方針なし（選ぶと効き目が付きます）', 'No policy (choose one to add its effect)')));
      c2.append(row);
    }
    body.append(c2);
    // 開放の一覧
    const c3 = h('div', 'isl-card2 isl-pv-sec');
    c3.append(h('h3', '', t(`開放の一覧（${openPolicies(s).length} / ${POLICIES.length}）`, `Unlocks (${openPolicies(s).length} / ${POLICIES.length})`)));
    for (const [kind, title] of [['corp', t('全社方針', 'Company')], ['dept', t('事業別', 'Division')]] as const) {
      c3.append(h('h4', 'isl-pv-h', title));
      const grid = h('div', 'isl-pv-grid');
      for (const p of POLICIES.filter((x) => x.kind === kind)) {
        const ok = isOpen(s, p.id);
        const e = h('div', `isl-pv-item ${ok ? 'is-open' : 'is-lock'}`);
        e.dataset.policy = p.id;
        const tag = kind === 'dept' ? `${DEPT[p.dept].icon} ` : '';
        e.append(h('b', '', ok ? `${tag}${label(p)}` : `${tag}🔒 ${p.name}`));
        e.append(h('small', '', ok ? `${p.note}` : openText(s, p)));
        if (ok) e.append(h('small', 'isl-pol-fx', baseFxText(p)));
        grid.append(e);
      }
      c3.append(grid);
    }
    body.append(c3);
  });
}
const TIER_EN: Record<Tier, string> = { C: 'Common', U: 'Uncommon', R: 'Rare', E: 'Epic', L: 'Legendary' };
/**
 * 段 K2：特別なパネル「全社方針の枠 +1」（ランクアップの特典・費用 0）。受け取れるときだけ、光るパネルの形で出す。押すと枠が増え、方針の画面を描き直す
 */
function slotClaim(ctx: Ctx): HTMLElement | null {
  const s = ctx.s();
  const tier = slotNextTier(s);
  if (!tier) return null;
  const n = slotsOf(s);
  const b = h('button', 'isl-pv-gift');
  b.type = 'button';
  b.append(
    h('i', 'isl-pv-gift-ic', '🎁'),
    h('b', '', t('全社方針の枠 +1', 'Company policy slot +1')),
    h('small', '', t(`${TIER_EN[tier]} の町に進出した特典。無償（お金・RP 0）で、全社方針が ${n} → ${n + 1} 枠に`, `Reward for reaching a ${TIER_EN[tier]} town. Free (no money or RP): ${n} → ${n + 1} slots`)),
    h('span', 'isl-pv-gift-go', t('受け取る', 'Claim')),
  );
  b.addEventListener('click', () => {
    const m = claimSlot(s);
    if (m == null) return;
    ctx.sfx?.('okay');
    ctx.toast(t(`🎁 全社方針の枠が ${m} つになりました。空いた枠に方針を選べます`, `🎁 You now have ${m} company policy slots — fill the new one`));
    ctx.save();
    after(ctx);
    openPolicyView(ctx);
  });
  return b;
}
/** いまの方針の 1 行（名前・手法の要点・効き目の数字） */
function polRow(s: P1State, p: PolicyDef): HTMLElement {
  const e = h('div', 'isl-pv-row');
  e.dataset.policy = p.id;
  e.append(h('b', '', label(p)), h('small', 'isl-dim', p.note));
  for (const x of powerLines(s, p)) e.append(h('small', 'isl-pol-fx', x));
  // 段 K3：副次効果（＋も−も。発表会のカードの詳細と同じ中身）
  e.append(h('small', 'isl-pol-side', t(`副次効果：${sideText(p)}`, `Side effects: ${sideText(p)}`)));
  return e;
}

/** 全社方針を選ぶ窓（枠の数まで。会議が始まったあとは、いまの方針を外せない＝空いた枠を埋めるだけ） */
export function openCorpPick(ctx: Ctx) {
  const s = ctx.s();
  const n = slotsOf(s);
  const keep = meetingsOn(s) ? corpOf(s) : [];
  let pick = [...corpOf(s)];
  modal(ctx, t(`全社方針を選ぶ（${n} 枠まで）`, `Choose company policies (up to ${n})`), (panel, close) => {
    panel.append(h('p', 'isl-pol-lead', keep.length ? t('いま選んでいる方針は、年初の経営会議まで替えられません。空いた枠に足せます。', 'Current policies stay until the opening board meeting; you can fill empty slots.') : t('選んだ方針の重みを合わせて推奨を決めます。効き目は重なります。', 'Recommendations blend the chosen policies; effects stack.')));
    const cnt = h('b', 'isl-pol-count');
    const list = h('div', 'isl-pol-list');
    const draw = () => {
      cnt.textContent = t(`選んだ ${pick.length} / ${n}`, `${pick.length} / ${n} chosen`);
      list.querySelectorAll<HTMLElement>('.isl-pol-opt').forEach((b) => b.classList.toggle('is-on', pick.includes(b.dataset.policy!)));
    };
    for (const p of openPolicies(s, 'corp')) {
      const b = h('button', 'isl-pol-opt');
      b.type = 'button';
      b.dataset.policy = p.id;
      b.disabled = keep.includes(p.id);
      b.append(h('b', '', label(p)), h('small', '', p.note), h('small', 'isl-pol-fx', nowText(s, p)), h('small', 'isl-pol-side', sideText(p)));
      b.addEventListener('click', () => {
        if (pick.includes(p.id)) pick = pick.filter((x) => x !== p.id);
        else if (pick.length < n) pick.push(p.id);
        else pick = [...pick.slice(0, n - 1), p.id].filter((x, i, a) => a.indexOf(x) === i);
        for (const k of keep) if (!pick.includes(k)) pick.unshift(k);
        ctx.sfx?.('tap');
        draw();
      });
      list.append(b);
    }
    panel.append(cnt, list);
    draw();
    const foot = h('div', 'isl-pol-foot');
    foot.append(
      btn(t('閉じる', 'Close'), close, 'isl-pol-later'),
      btn(t('決める', 'Set'), () => {
        if (canSetCorp(s, pick) && setCorp(s, pick)) {
          ctx.toast(t(`全社方針：${pick.map(policyName).join(dot())}`, `Company policies: ${pick.map(policyName).join(dot())}`));
          ctx.save();
          after(ctx);
        }
        close();
      }, 'is-on'),
    );
    panel.append(foot);
  });
}
/** 事業別の方針を選ぶ窓 */
export function openDeptPick(ctx: Ctx, d: DeptId) {
  const s = ctx.s();
  const cur = deptPolicyOf(s, d);
  modal(ctx, t(`${DEPT[d].icon} ${DEPT[d].name}の方針`, `${DEPT[d].icon} ${DEPT[d].name} policy`), (panel, close) => {
    const list = h('div', 'isl-pol-list');
    for (const p of openPolicies(s, 'dept', d)) {
      const b = h('button', `isl-pol-opt ${p.id === cur ? 'is-on' : ''}`);
      b.type = 'button';
      b.dataset.policy = p.id;
      b.append(recLine(label(p), p.id === recDept(s, d)), h('small', '', p.note), h('small', 'isl-pol-fx', nowText(s, p)), h('small', 'isl-pol-side', sideText(p)));
      b.addEventListener('click', () => {
        if (setDept(s, d, p.id)) {
          ctx.toast(t(`${DEPT[d].name}の方針を「${p.name}」にしました`, `${DEPT[d].name} policy set to “${p.name}”`));
          ctx.save();
          after(ctx);
        }
        close();
      });
      list.append(b);
    }
    panel.append(list);
    const foot = h('div', 'isl-pol-foot');
    foot.append(btn(t('閉じる', 'Close'), close, 'isl-pol-later'));
    panel.append(foot);
  });
}
/** 方針の窓（.isl-modal・時間が止まる） */
function modal(ctx: Ctx, title: string, fill: (panel: HTMLElement, close: () => void) => void) {
  ctx.root.querySelector('.isl-pol')?.remove();
  const m = h('div', 'isl-modal isl-pol');
  const panel = h('div', 'isl-pol-panel');
  const head = h('div', 'isl-pol-head');
  head.append(h('h3', '', title));
  panel.append(head);
  const close = () => m.remove();
  fill(panel, close);
  m.append(panel);
  m.addEventListener('click', (e) => e.stopPropagation());
  ctx.root.append(m);
  ctx.sfx?.('page');
}

// 段 K3：経営方針発表会（段 I2 の年初の経営会議）は、カードを机に差し出す場面に替えた（policycardsui.ts）
