/**
 * 段 UI7c：経営方針を選ぶ画面（policy.ts）。
 * - openPolicyPick：7 つの方針から 1 つ（いまの方針に印）。マインちゃんが聞くとき（最初の提案書を開く前に 1 回だけ）は、上にマインちゃんの一言と
 *   「あとで決める（バランスのまま）」。選ぶと then（提案書を開く）。
 * - policyCard：経営企画の「受け箱」の上の 1 枚（いまの方針・変える）。
 */
import { t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { POLICY, type PolicyId } from './data';
import { askLine, policyName, policyOf, POLICY_TEXT, setPolicy } from './policy';
import { after, type Ctx } from './screens';
import { btn, h } from './ui';

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
  } else head.append(h('h3', '', t('経営方針（社長の価値観）', 'Management policy (your values)')));
  panel.append(head);
  panel.append(h('p', 'isl-pol-lead', t('提案書の推奨・ヒーローの言い方・部長の提案の並びが、この方針で変わります（ゲームの数字は変わりません）。', 'This shapes recommendations, how heroes pitch, and how proposals are ordered (game numbers don’t change).')));
  const list = h('div', 'isl-pol-list');
  const cur = policyOf(s);
  const close = () => {
    m.remove();
    o.then?.();
  };
  for (const id of POLICY.ids) {
    const T = POLICY_TEXT[id];
    const b = h('button', `isl-pol-opt ${id === cur ? 'is-on' : ''}`);
    b.type = 'button';
    b.dataset.policy = id;
    const top = h('b', '', `${T.icon} ${T.name()}`);
    if (id === cur) top.append(h('span', 'isl-pol-cur', t('いまの方針', 'Current')));
    b.append(top, h('small', '', T.note()));
    b.addEventListener('click', () => {
      pick(ctx, id);
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
function pick(ctx: Ctx, id: PolicyId) {
  setPolicy(ctx.s(), id);
  ctx.sfx?.('tap');
  ctx.toast(t(`経営方針を「${policyName(id)}」にしました`, `Policy set to “${policyName(id)}”`));
  after(ctx);
}

/** 経営企画の「受け箱」の上の 1 枚：いまの方針と「変える」 */
export function policyCard(ctx: Ctx): HTMLElement {
  const s = ctx.s();
  const c = h('div', 'isl-card2 isl-pol-card');
  const T = POLICY_TEXT[policyOf(s)];
  c.append(h('h3', '', t('経営方針', 'Management policy')));
  const row = h('div', 'isl-pol-row');
  const txt = h('div', '');
  txt.append(h('b', '', `${T.icon} ${T.name()}`), h('small', 'isl-dim', T.note()));
  row.append(txt, btn(t('変える', 'Change'), () => openPolicyPick(ctx), 'isl-pol-change'));
  c.append(row);
  return c;
}
