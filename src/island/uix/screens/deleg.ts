/**
 * 段 UIX3d：任せる（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：任せる」）。
 * 決まり・文・押した先は今の画面と同じ（deleg.ts ほかを同じ引数で。部長の提案の「提案書を見る」は切り出した propSee）。
 * - 任せ先を選ぶ：選ぶ引き出し（ヒーローの札：顔・名前・レアリティ・Lv・出来・★・史実の適性・役目・いまの仕事・おすすめ）→ 下の主のキー
 * - 部門の担当：役目の札（事業部長・チームリーダー）に、ヒーローの札の並び。「おまかせ中」の札
 * - 部長の提案の受け箱：提案の札（部門の色の帯・顔・理由・見込み・費用・提案書を見る／却下／保留）
 * - 人事の「役目」の列：役目の札とヒーローの札
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { uxKey, uxLamp, uxMeter, uxTape, uxToggle } from '../parts';
import { uxpCard, uxpDrawer, uxpEmpty, uxpFace, uxpHead, uxpPaper, uxpSelect, uxpStamp } from '../sparts';
import type { Ctx } from '../../p1/screens';
import type { DeptId, DutyId } from '../../p1/data';
import type { P1State, Staff } from '../../p1/model';
import type { PickRole, Proposal, Role } from '../../p1/deleg';
import { Q } from './d-deps';
import { LITE, dDept, dIco, dRich, dText } from './d-kit';
import { dotEmoji, kIcon } from './k-icons';
import './d-card.css';
import './d-deleg.css';

const stars = (n: number) => `${'★'.repeat(n)}${'☆'.repeat(3 - n)}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
/** 役目の札（部長・リーダー・セクター長） */
function roleTape(r: Role): HTMLElement {
  const e = uxTape(el('b', dText(Q.delegKit.roleText(r))), r.kind === 'sector' ? 'amber' : r.kind === 'head' ? 'good' : '');
  e.classList.add('uxd-role-tape');
  return e;
}
/** 出来の計器（20 段）と字 */
function qMeter(q: number): HTMLElement {
  const m = uxMeter(Math.max(0, Math.min(1, q)), q >= 0.85 ? 'good' : '');
  return el('span.uxd-dl-q', m.el, el('b', dText(Q.delegKit.qText(q))));
}

// ---------------------------------------------------------------- 任せ先を選ぶ引き出し
export function pickForUx(ctx: Ctx, want: PickRole, title: string, current: number | null, onPick: (hero: number) => void, onClear?: () => void) {
  const K = Q.delegKit;
  const s = ctx.s();
  const dept: DeptId = want.kind === 'head' ? want.dept : K.DUTY[want.duty].dept;
  let showOthers = false;
  let sel: number | null = null;
  const clear =
    onClear && current != null
      ? uxKey(t('外す（自分に戻す）', 'Remove (back to you)'), () => {
          dr.drop();
          onClear();
        }, { kind: 'weak', cls: 'isl-pick-clear' })
      : null;
  const dr = uxpDrawer({
    root: ctx.root,
    title: dText(title),
    note: dText(K.pickNote(dept, want)),
    ico: 'people',
    cls: 'uxd-dl-dr',
    decide: { label: t('この人に任せる', 'Hand it to them'), onDecide: () => go() },
    side: clear,
  });
  const others = K.othersCount(s, want, current);
  const sw = uxToggle({ label: t('ほかの部長・リーダー・セクター長も表示', 'Show other heads, leaders and sector heads'), value: false, onChange: (v) => ((showOthers = v), render()) });
  const grid = el('div.uxp-list.uxd-dl-list');
  dr.body.append(el('div.uxd-dl-others.isl-pick-others', sw.el, el('span', t(`ほかの部長・リーダー・セクター長も表示（${others} 人）`, `Show other heads, leaders and sector heads (${others})`))), grid);
  function render() {
    grid.replaceChildren();
    const list = K.pickList(s, want, current, showOthers);
    const best = K.pickBest(list);
    if (!list.length) grid.append(uxpEmpty(t('選べる人がいません', 'Nobody available'), { ico: 'people' }));
    for (const { st, q, grey } of list) {
      const sn = Q.starOf(q, st.level ?? 1);
      const r = K.roleOf(st);
      const ft = K.fitTag(st.hero, dept);
      if (ft) dotEmoji(ft);
      const job = st.hero === current ? t('いまの担当', 'Current') : K.jobLabel(s, st);
      const card = uxpCard({
        pic: uxpFace(Q.heroIcon(st.hero, 64), { win: 56, off: grey }),
        name: dText(Q.heroNm(st.hero)),
        tags: [uxTape(el('b', st.rarity ?? 'C'), 'dark'), el('span.ux-num.uxd-dl-lv', `Lv ${st.level ?? 1}`), r ? roleTape(r) : null],
        desc: el('span.uxd-dl-pd', qMeter(q), el('span.uxd-dl-star', [0, 1, 2].map((i) => uxLamp('', i < sn)), el('span.ux-vh', stars(sn))), ft),
        foot: el('span.uxd-dl-job', st.task == null && !grey ? uxLamp('good', true) : uxLamp('', false), el('span', dText(job)), want.kind === 'leader' && !grey && st.hero !== current && st.task != null && st.task !== 'lead' ? el('span.uxd-dl-move', t('選ぶと、この仕事から外れます', 'Leaves this job if picked')) : null),
        badge: st.hero === best ? t('マインちゃんのおすすめ', 'Mine-chan’s pick') : undefined,
        selected: false,
        off: grey,
        cls: `uxd-dl-pick${st.hero === current ? ' is-cur' : ''}`,
        attrs: { 'data-hero': String(st.hero), ...(st.hero === best ? { 'data-best': '1' } : {}) },
        onTap: (c) => {
          sel = st.hero;
          grid.querySelectorAll<HTMLElement>('.uxp-card').forEach((x) => uxpSelect(x, x === c, x === c));
          dr.setDecide({ on: true, name: dText(Q.heroNm(st.hero)) });
        },
      });
      grid.append(card);
    }
    // はじめにマインちゃんのおすすめを選んでおく（開いてすぐ主のキーで決められる：押す回数は今と同じ。UIX3a の選ぶ引き出しと同じ）
    sel = null;
    dr.setDecide({ on: false, name: null });
    const bc = best != null && best !== current ? grid.querySelector<HTMLElement>(`.uxp-card[data-hero="${best}"]:not(.is-off)`) : null;
    if (bc && best != null) {
      sel = best;
      uxpSelect(bc, true);
      dr.setDecide({ on: true, name: dText(Q.heroNm(best)) });
    }
  }
  render();
  function go() {
    if (sel == null) return;
    const hero = sel;
    dr.drop();
    onPick(hero);
    // 段 P2：着任のあいさつ（史実の調査のあるヒーロー）
    K.sayToast(ctx.toast, hero, 'greet', s.day);
  }
}

// ---------------------------------------------------------------- 部門の担当
/** ヒーローの札（顔・名前・Lv・レアリティ・出来の計器と内訳・史実の適性） */
function personCard(_s: P1State, st: Staff, dept: DeptId, q?: number, right?: HTMLElement | null): HTMLElement {
  const K = Q.delegKit;
  const p = K.qualityParts(st, dept);
  const fitTxt = Math.abs(p.fit) >= 0.005 ? `${p.fit > 0 ? '+' : '−'}${pct(Math.abs(p.fit))}` : '';
  const ft = K.fitTag(st.hero, dept);
  if (ft) dotEmoji(ft);
  return uxpCard({
    pic: uxpFace(Q.heroIcon(st.hero, 64), { win: 56, breathe: true }),
    name: dText(Q.heroNm(st.hero)),
    tags: [uxTape(el('b', st.rarity ?? 'C'), 'dark'), el('span.ux-num.uxd-dl-lv', `Lv ${st.level ?? 1}`)],
    desc: el('span.uxd-dl-pd', qMeter(q ?? p.total), ft),
    foot: el('span.uxd-dl-why', t(`内訳：能力値（${K.deptAptName(dept)}）${pct(p.base)}・Lv +${pct(p.lv)}・パッシブ +${pct(p.passive)}${fitTxt ? `・史実の適性 ${fitTxt}` : ''}${q != null && q > p.total ? `・部長の下 +${pct(q - p.total)}` : ''}`, `From ${K.deptAptName(dept)} ${pct(p.base)}, level +${pct(p.lv)}, passives +${pct(p.passive)}${fitTxt ? `, historical fit ${fitTxt}` : ''}${q != null && q > p.total ? `, under head +${pct(q - p.total)}` : ''}`)),
    right: right ?? null,
    cls: 'uxd-dl-person',
    attrs: { 'data-hero': String(st.hero) },
  });
}
/** 部門の担当の画面の中身（器は今の札 open のまま） */
export function delegBody(ctx: Ctx, dept: DeptId, body: HTMLElement) {
  const K = Q.delegKit;
  const s = ctx.s();
  const d = Q.DEPT[dept];
  const lv = K.deptLevel(s, dept);
  body.classList.add('isl-dl', 'uxd-dl', 'ux-root');
  body.style.setProperty('--d', d.color);
  body.append(el('p.uxd-dl-lead', dRich(t(`${K.stageName(K.L0.leaderFrom)} の町を開くと、理解度 ${K.DELEG.leaderAt} で業務を 1 つずつ[[チームリーダー]]に、${K.stageName(K.L0.headFrom)} の町を開くと部門を丸ごと[[事業部長]]に任せられます。任せたあとも、いつでも外して手に戻せます。`, `From a ${K.stageName(K.L0.leaderFrom)} town, at understanding ${K.DELEG.leaderAt} you can hand single tasks to [[team leaders]]; from a ${K.stageName(K.L0.headFrom)} town, the whole department to a [[division head]]. You can take any of it back at any time.`))));
  body.append(el('div.uxd-dl-lvrow', dDept(dept), uxTape(el('b', t(`理解度 ${lv}`, `Understanding ${lv}`)), 'amber'), el('span', dText(K.bandText(s, dept).long))));
  // ---- 事業部長（役目の札）
  const hl = K.headLeft(s, dept) ?? 0;
  const H = K.headOf(s, dept);
  const hc = el('section.uxd-dl-role.isl-dl-head', uxpHead(t('事業部長（部門を丸ごと）', 'Division head (whole department)'), { kind: 'amber', ico: 'office' }));
  if (H) {
    const n = (s.deleg?.inbox ?? []).filter((p) => p.dept === dept).length;
    const st = uxpStamp(t('おまかせ中', 'Delegated'), { kind: 'good' });
    st.show();
    hc.append(personCard(s, H, dept), el('p.uxd-dl-on', st.el, el('span', t(`この部門の業務はすべて自動で回ります・今月の提案 ${n}`, `All tasks here run on their own · proposals ${n}`))));
    hc.append(
      el(
        'div.uxd-dl-keys',
        uxKey(t('提案を見る', 'See proposals'), () => Q.delegOpenProps(ctx), { kind: 'main', cls: 'uxd-dl-props' }),
        K.isLocked(hl) ? null : uxKey(t('替える', 'Change'), () => K.pickHead(ctx, dept, H.hero, (hero: number) => K.done(ctx, K.setHead(s, dept, hero), t(`${Q.heroNm(hero)}を${d.name}部長にしました`, `${Q.heroNm(hero)} now heads ${d.name}`)))),
        uxKey(t('外す（手に戻す）', 'Dismiss (back to you)'), () => K.done(ctx, K.setHead(s, dept, null), t('部長を外しました。この部門は手で回します', 'Head dismissed. You run this department by hand')), { kind: 'weak' }),
      ),
    );
  } else if (K.rankLocked(hl)) hc.append(el('p.uxd-dl-lock.isl-dl-rank', kIcon('lock', LITE), el('span', dText(K.rankLockText(hl)))));
  else if (hl > 0) hc.append(el('p.uxd-dl-lock', kIcon('lock', LITE), el('span', t(`理解度 ${K.DELEG.headAt} で置けます（いま ${lv}・あと ${hl}）`, `Opens at understanding ${K.DELEG.headAt} (now ${lv}, ${hl} to go)`))));
  else hc.append(el('div.uxd-dl-keys', uxKey(t('部長を置く', 'Place a head'), () => K.pickHead(ctx, dept, null, (hero: number) => K.done(ctx, K.setHead(s, dept, hero), t(`${Q.heroNm(hero)}を${d.name}部長にしました！`, `${Q.heroNm(hero)} now heads ${d.name}!`))), { kind: 'main', ico: 'people', cls: 'isl-dl-add' })));
  hc.append(el('p.uxd-dl-dim', t(`部長がいると、この部門の業務がすべて自動で回り、月に 1 回、提案を持ってきます（承認／却下／保留）。部門の効き目に小さな補正（出来しだい ±）。リーダーがいれば、部長の下で出来 +${Math.round(K.DELEG.q.underHead * 100)}%。`, `With a head, every task here runs on its own and a proposal arrives monthly (approve / reject / hold). A small ± to the department’s effects. Leaders under a head get +${Math.round(K.DELEG.q.underHead * 100)}% quality.`)));
  body.append(hc);
  // ---- チームリーダー（業務ごとの役目の札）
  const lc = el('section.uxd-dl-role.isl-dl-leads', uxpHead(t('チームリーダー（業務を 1 つずつ）', 'Team leaders (one task each)'), { kind: 'amber', ico: 'people' }));
  const duties = K.DEPT_DUTIES[dept];
  const ll = K.leaderLeft(s, dept) ?? 0;
  if (!duties.length) lc.append(uxpEmpty(t('この部門には、まだリーダーに任せられる業務がありません', 'No tasks to hand to leaders here yet'), { ico: 'people', sub: t('部長の提案と補正だけ', 'A head still brings proposals and a bonus') }));
  else if (K.rankLocked(ll)) lc.append(el('p.uxd-dl-lock.isl-dl-rank', kIcon('lock', LITE), el('span', dText(K.rankLockText(ll)))));
  else if (ll > 0) lc.append(el('p.uxd-dl-lock', kIcon('lock', LITE), el('span', t(`理解度 ${K.DELEG.leaderAt} で置けます（いま ${lv}・あと ${ll}）`, `Opens at understanding ${K.DELEG.leaderAt} (now ${lv}, ${ll} to go)`))));
  for (const id of duties) lc.append(dutyCard(ctx, s, dept, id, K.isLocked(ll)));
  body.append(lc);
}
/** 業務 1 つ（いまの担当・今月の出来・置く／替える／外す） */
function dutyCard(ctx: Ctx, s: P1State, dept: DeptId, id: DutyId, locked: boolean): HTMLElement {
  const K = Q.delegKit;
  const def = K.DUTY[id];
  const L = K.leaderOf(s, id);
  const r = K.runnerOf(s, id);
  const stat = s.deleg?.stat[id];
  const c = el(`div.uxd-dl-duty.isl-dl-duty${locked ? '.is-lock' : ''}`, { 'data-duty': id }, el('div.uxd-dl-dh', dIco(def.icon, LITE, 'gear'), el('b', dText(def.name))), el('p.uxd-dl-dim', dText(def.note)));
  if (L) c.append(personCard(s, L, dept, r?.q));
  else if (r) c.append(el('p.uxd-dl-runs', uxLamp('good', true), el('span', t(`部長（${Q.heroNm(r.st.hero)}）がまとめて行っています（${K.qText(r.q)}）`, `The head (${Q.heroNm(r.st.hero)}) handles it (${K.qText(r.q)})`))));
  else if (K.autoDuty(s, id)) c.append(el('p.uxd-dl-runs', uxLamp('good', true), kIcon('gear', LITE), el('span', t('仕組みで自動（スキルツリーのパネル）', 'Runs on its own (skill-tree panel)'))));
  else c.append(el('p.uxd-dl-runs.is-hand', uxLamp('', false), el('span', t('いまは手でやっています', 'You do this by hand now'))));
  if (r && stat) c.append(el('p.uxd-dl-stat', t(`今月：${K.dutyLine({ id, hero: r.st.hero, by: r.by, q: r.q, acts: stat.acts, miss: stat.miss, n: stat.n })}`, `This month: ${K.dutyLine({ id, hero: r.st.hero, by: r.by, q: r.q, acts: stat.acts, miss: stat.miss, n: stat.n })}`)));
  if (!locked) {
    const pick = () => K.pickFor(ctx, { kind: 'leader', duty: id }, t(`リーダー：${def.name}`, `Leader: ${def.name}`), L?.hero ?? null, (hero: number) => K.done(ctx, K.setLeader(s, id, hero), t(`${Q.heroNm(hero)}をリーダー（${def.name}）にしました！`, `${Q.heroNm(hero)} now leads ${def.name}!`)));
    c.append(el('div.uxd-dl-keys', L ? [uxKey(t('替える', 'Change'), pick), uxKey(t('外す（手に戻す）', 'Dismiss (back to you)'), () => K.done(ctx, K.setLeader(s, id, null), t(`${def.name}を手に戻しました`, `${def.name} is back in your hands`)), { kind: 'weak' })] : uxKey(t('チームリーダーを置く', 'Place a team leader'), pick, { ico: 'people', cls: 'isl-dl-add' })));
  }
  return c;
}

// ---------------------------------------------------------------- 部長の提案の受け箱
/** 提案の札（部門の色の帯・顔・理由・見込み・費用・提案書を見る／却下／保留） */
function propCardUx(ctx: Ctx, s: P1State, p: Proposal): HTMLElement {
  const K = Q.delegKit;
  const d = Q.DEPT[p.dept];
  const held = p.status === 'held' ? uxTape(el('b', p.note === 'money' ? t('資金不足で保留', 'Held: not enough funds') : p.note === 'rp' ? t('研究ポイント不足で保留', 'Held: not enough RP') : t('保留', 'On hold')), p.note ? 'amber' : 'dark') : null;
  const cost = p.act.k === 'hire' ? t(`費用：雇うのは無料・月給 ${Q.money(p.cost || 0)}`, `Cost: free to hire, monthly wage applies`) : p.rp ? t(`費用：研究ポイント ${p.rp}（いま ${s.rp ?? 0}）`, `Cost: ${p.rp} RP (you have ${s.rp ?? 0})`) : p.cost > 0 ? t(`費用：${Q.money(p.cost)}（払ったあとの資金 ${Q.money(s.money - p.cost)}）`, `Cost: ${Q.money(p.cost)} (funds after: ${Q.money(s.money - p.cost)})`) : t('費用：無料', 'Cost: free');
  const c = el(
    `div.uxd-pp.isl-prop${p.status === 'held' ? '.is-held' : ''}`,
    { 'data-prop': String(p.id) },
    el('div.uxd-pp-head', uxpFace(Q.heroIcon(p.hero, 64), { win: 48 }), el('div.uxd-pp-who', el('span.uxd-pp-role', dDept(p.dept), el('b', t(`${d.name}部長`, `${d.name} head`))), el('span', dText(Q.heroNm(p.hero)))), held),
    el('b.uxd-pp-title', dText(K.actName(s, p.act))),
    uxpPaper({ plain: true, cls: 'uxd-pp-why' }, el('p', dRich(K.propWhy(s, p)))),
    el('p.uxd-pp-est', kIcon('up', { ...LITE, color: '#36e08b' }), el('span', dText(K.propEst(p)))),
    el(`p.uxd-pp-cost${p.cost > s.money ? '.is-short' : ''}`, kIcon('coin', LITE), el('span', cost)),
    el(
      'div.uxd-dl-keys.uxd-pp-keys',
      uxKey(t('提案書を見る', 'See the proposal'), () => K.propSee(ctx, s, p), { ico: 'note', cls: 'uxd-pp-see' }),
      uxKey(t('却下', 'Reject'), () => {
        K.reject(s, p.id);
        ctx.sfx?.('tap');
        Q.after(ctx);
      }, { kind: 'weak' }),
      uxKey(t('保留', 'Hold'), () => {
        K.hold(s, p.id);
        Q.after(ctx);
      }, { kind: 'weak' }),
    ),
  );
  c.style.setProperty('--d', d.color);
  return c;
}
/** 部長の提案の受け箱の中身（器は今の札 open のまま） */
export function propsBody(ctx: Ctx, body: HTMLElement) {
  const K = Q.delegKit;
  const s = ctx.s();
  body.classList.add('isl-dl', 'uxd-dl', 'ux-root');
  body.append(K.policyCard(ctx));
  K.withdrawStale(s);
  const gone = K.goneBox(s);
  if (gone) body.append(gone);
  const hasCards = K.cardInbox(s).some((x) => x.src !== 'head') || !!s.cards?.trust?.length;
  if (hasCards) body.append(K.cardInboxCard(ctx));
  const here = s.sector ?? 'c1';
  const inbox = (s.deleg?.inbox ?? []).filter((p) => (p.sector ?? here) === here);
  body.append(uxpHead(t('部長の提案', 'Proposals from your heads'), { kind: 'amber', ico: 'office', right: el('span.ux-num.uxd-dl-cnt', String(inbox.length)) }));
  if (!inbox.length) {
    const hasHead = Object.keys(Q.DEPT).some((d) => K.headOf(s, d as DeptId));
    body.append(uxpEmpty(hasHead ? t('いまは提案がありません（月の締めで届きます）', 'No proposals right now (they arrive at the monthly close)') : t(`事業部長を置くと（部門の理解度 ${K.DELEG.headAt} から。部門の画面の上の「担当」）、ここに提案が届きます`, `Place a division head (from understanding ${K.DELEG.headAt}, via “Lead” on a department’s band) to get proposals here`), { ico: 'mail' }));
  }
  const grid = el('div.uxd-pp-grid');
  for (const p of K.policySort(s, inbox)) grid.append(propCardUx(ctx, s, p));
  body.append(grid, el('p.uxd-dl-dim', t('事業部長は、月に 1 回、いま打てる手の中から効き目の見込みが大きいものを持ってきます。部長の出来が高いほど、見込みの誤差が小さくなります。承認すると、すぐに実行します。', 'Each month your heads bring the move they expect to pay off most. Better heads misjudge less. Approving carries it out right away.')));
  if (!hasCards) body.append(K.cardInboxCard(ctx));
  const done = (s.deleg?.done ?? []).filter((x) => (x.p.sector ?? here) === here);
  if (done.length) {
    body.append(uxpHead(t('承認した提案（翌月の報告で結果）', 'Approved (results in next month’s report)'), { kind: 'dark', ico: 'check' }));
    body.append(uxpPaper({ plain: true, cls: 'uxd-dl-paper' }, ...done.map((x) => el('p.uxd-dl-done', kIcon('check', { ...LITE, color: '#14804c' }), el('span', x.p.src ? t(`${Q.heroNm(x.p.hero)}：${K.actName(s, x.p.act)}`, `${Q.heroNm(x.p.hero)}: ${K.actName(s, x.p.act)}`) : t(`${Q.DEPT[x.p.dept].name}部長：${K.actName(s, x.p.act)}`, `${Q.DEPT[x.p.dept].name} head: ${K.actName(s, x.p.act)}`))))));
  }
  const last = [...s.reports].reverse().find((r) => r.deleg);
  if (last?.deleg) {
    body.append(uxpHead(t(`担当の報告（${last.month} か月目）`, `Delegation report (month ${last.month})`), { kind: 'dark', ico: 'note' }));
    body.append(
      uxpPaper(
        { plain: true, cls: 'uxd-dl-paper' },
        ...last.deleg.results.map((x) => el(`p.uxd-dl-res.${x.real >= 0 ? 'is-good' : 'is-warn'}`, t(`提案の結果：${dText(K.resultText(s, x))}`, `Result: ${dText(K.resultText(s, x))}`))),
        ...last.deleg.duties.map((x) => el('p', dIco(K.DUTY[x.id].icon, { ...LITE, color: '#1a1c2e', hi: '#1a1c2e', lo: '#8a7f5c' }, 'gear'), t(`${K.DUTY[x.id].name}（${Q.heroNm(x.hero)}・${K.qText(x.q)}）：${K.dutyLine(x)}`, `${K.DUTY[x.id].name} (${Q.heroNm(x.hero)}, ${K.qText(x.q)}): ${K.dutyLine(x)}`))),
      ),
    );
  }
  // セクター長（任せきり）
  const ok = K.sectorHeadOk(s);
  const lines = K.sectorLines(s);
  body.append(
    el(
      'section.uxd-dl-role.isl-prop-sector',
      uxpHead(t('セクター長（セクタを任せる）', 'Sector heads (whole sectors)'), { kind: 'dark', ico: 'office' }),
      el('p.uxd-dl-dim', ok.ready ? t(`新しく任命する条件：事業部長が ${ok.need} 部門以上（いま ${ok.heads}）`, `To appoint: ${ok.need}+ division heads (now ${ok.heads})`) : t(`新しく任命する条件：事業部長が ${ok.need} 部門以上（いま ${ok.heads}。準備中：いまは条件なしで任命できます）`, `To appoint: ${ok.need}+ division heads (now ${ok.heads}; coming soon — no condition for now)`)),
      lines.length ? lines.map((l: string) => el('p.uxd-dl-sec', kIcon('office', LITE), el('span', dText(l)))) : el('p.uxd-dl-dim', t('ほかのセクタに出店して離れるときに、セクター長を選びます（ランドマップ）。', 'You pick a sector head when you leave a sector you opened in (land map).')),
      el('p.uxd-dl-dim', t('セクター長のいるセクタは任せきり：会社に事業部長がいれば、そのセクタでも部長たちが提案を出し、セクター長が自分で承認します（1 件ごとに利益の 1 割をそのセクタへ投資）。', 'Sectors with a head run on their own: if the company has division heads, their proposals there are approved by the sector head (each puts 10% of the profit back into that sector).')),
    ),
  );
}

// ---------------------------------------------------------------- 人事の「役目」の列
export function rolesCardUx(ctx: Ctx, s: P1State): HTMLElement | null {
  const K = Q.delegKit;
  const rows = s.staff.map((st) => ({ st, r: K.roleOf(st) as Role | null })).filter((x): x is { st: Staff; r: Role } => !!x.r);
  const c = el('div.uxd-roles.isl-roles.ux-root', uxpHead(t('役目', 'Roles'), { kind: 'amber', ico: 'people', right: el('span.ux-num.uxd-dl-cnt', String(rows.length)) }));
  if (!rows.length) {
    c.append(uxpEmpty(t('役目のあるヒーローはまだいません', 'No heroes with roles yet'), { ico: 'people', sub: t(`部門の理解度 ${K.DELEG.leaderAt} でチームリーダー、${K.DELEG.headAt} で事業部長を置けます（部門の画面の上の「担当」）。同じヒーローを リーダー → 部長 → セクター長 と昇進させられます。`, `At understanding ${K.DELEG.leaderAt} you can place team leaders, at ${K.DELEG.headAt} division heads (“Lead” on a department’s band). The same hero can rise from leader to head to sector head.`) }));
    return c;
  }
  const order = { sector: 0, head: 1, leader: 2 } as const;
  rows.sort((a, b) => order[a.r.kind] - order[b.r.kind]);
  const list = el('div.uxp-list.uxd-roles-list');
  for (const { st, r } of rows) {
    const what = r.kind === 'leader' ? t(`${Q.DEPT[r.dept].name}・${K.DUTY[r.duty].name}`, `${Q.DEPT[r.dept].name} · ${K.DUTY[r.duty].name}`) : r.kind === 'head' ? t(`${Q.DEPT[r.dept].name}を丸ごと`, `All of ${Q.DEPT[r.dept].name}`) : K.sectorDef(r.sector).name;
    list.append(
      uxpCard({
        pic: uxpFace(Q.heroIcon(st.hero, 64), { win: 48 }),
        name: dText(Q.heroNm(st.hero)),
        tags: [roleTape(r), el('span.ux-num.uxd-dl-lv', `Lv ${st.level ?? 1}`)],
        desc: [r.kind !== 'sector' ? dDept(r.dept) : null, el('span', dText(what))],
        cls: 'uxd-roles-row isl-roles-row',
        onTap: r.kind !== 'sector' ? () => Q.delegOpen(ctx, r.dept) : undefined,
      }),
    );
  }
  c.append(list);
  return c;
}

/** 部門の担当（器は今の札。題も今のまま） */
export function openDelegUx(ctx: Ctx, dept: DeptId) {
  const d = Q.DEPT[dept];
  Q.open(ctx, t(`${d.icon} ${d.name}の担当`, `${d.icon} ${d.name}: delegation`), (body: HTMLElement) => delegBody(ctx, dept, body));
}
/** 部長の提案の受け箱（器は今の札。題も今のまま） */
export function openPropsUx(ctx: Ctx) {
  Q.open(ctx, t('部長の提案', 'Proposals from your heads'), (body: HTMLElement) => propsBody(ctx, body));
}
