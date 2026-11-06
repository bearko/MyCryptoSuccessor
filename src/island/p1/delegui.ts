/**
 * 任せ方の 4 段の画面（段 D）：部門の担当（チームリーダー・事業部長の任命）・部長の提案の受け箱（承認／却下／保留）・人事の役目の札。
 * 計算は deleg.ts（DOM なし）。仕様は docs/ISLAND_PHASE1.md「任せ方」。
 */
import { policySort } from './brief';
import { policyCard } from './policyui';
import { stockMsg, stockPlan } from './moves';
import { t } from '../../i18n';
import { DELEG, L0, DEPT, DEPT_DUTIES, DUTY, deptAptName, type DeptId, type DutyId } from './data';
import { deptLevel } from './dept';
import {
  actName,
  approve,
  bandText,
  dutyLine,
  headDepts,
  headLeft,
  headOf,
  othersCount,
  pickBest,
  pickList,
  heroNm,
  hold,
  leaderLeft,
  leaderOf,
  propEst,
  propWhy,
  qText,
  quality,
  qualityParts,
  reject,
  resultText,
  roleOf,
  roleText,
  runnerOf,
  sectorHeadOk,
  setHead,
  setLeader,
  type PickRole,
  type Proposal,
  type Role,
} from './deleg';
import { rarityBadge } from './growthui';
import { drawer, jobLabel } from './heroui';
import { staffOf, type P1State, type Staff } from './model';
import { after, open, type Ctx } from './screens';
import { sectorDef } from './company';
import { bar, btn, h, heroIcon, money, rich } from './ui';
import { cardInboxCard, goneBox, showCard } from './cardui';
import { openProposal } from './proposalui';
import { planOf } from './plan';
import { cardInbox, starOf, withdrawStale } from './card';
import { fitTag, sayToast } from './p2ui';
import { lineOf } from './voice';
import { budgetLine } from './budget';
import { isLocked, rankLocked, rankLockText, stageName } from './stage';

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** 役目の札（リーダー・部長・セクター長。形で見分ける：リーダーは角、部長は丸、セクター長は二重の枠） */
export function roleBadge(r: Role): HTMLElement {
  const kind = r.kind === 'leader' ? 'is-leader' : r.kind === 'head' ? 'is-head' : 'is-sector';
  const e = h('span', `isl-role ${kind}`, r.kind === 'leader' ? t('リーダー', 'Leader') : r.kind === 'head' ? t('部長', 'Head') : t('セクター長', 'Sector head'));
  if (r.kind !== 'sector') e.style.setProperty('--c', DEPT[r.dept].color);
  e.title = roleText(r);
  return e;
}
/** 出来の帯（0.7〜0.97 を 0〜100% の長さに。手でやると 100%） */
function qBar(q: number): HTMLElement {
  const wrap = h('span', 'isl-dl-q');
  wrap.append(bar(q, q >= 0.9 ? 'var(--isl-good)' : q >= 0.8 ? 'var(--isl-gold)' : 'var(--isl-warn, #f2b544)'), h('b', '', qText(q)));
  return wrap;
}
/** 段 UI7a：引き出しの説明の文（役ごと）。部長は持ち場の仕事と兼ねる・リーダーは選ぶと持ち場の仕事から外れる */
export function pickNote(dept: DeptId, want: PickRole): string {
  const base = t(`数字は「出来」（手でやると 100%）。${DEPT[dept].name}に向く能力値（${deptAptName(dept)}）・Lv・${DEPT[dept].name}のパッシブで上がります。`, `Numbers are quality (by hand = 100%). It rises with ${deptAptName(dept)}, level and ${DEPT[dept].name} passives. `);
  return want.kind === 'head'
    ? base + t('持ち場の仕事（製造・調達・バイトなど）はそのまま、部長と兼ねられます。ほかの部長・セクター長とは兼ねられません。', 'Their current job (crafting, buying, part-time…) stays — a head can do both. They can’t also head another division or sector.')
    : base + t('持ち場の仕事の人を選ぶと、その仕事から外れて、リーダーに専念します。', 'Picking someone with a job moves them off it to lead full-time.');
}
/**
 * 任命の候補の引き出し：出来の高い順（向く能力値・Lv・パッシブで）。いまの担当・役目は札で。
 * 段 UI5b：組織図からも使う（読みの確かさ ★ を添える。onClear があれば「外す（自分に戻す）」）
 * 段 UI7a：want（部長／リーダー）で見分ける。灰色は、ほかの部長・リーダー・セクター長だけ（初めは隠す。チェックボックスで出す）。
 * 持ち場の仕事の人は灰色にしない。おすすめは出している中の選べる人から
 */
export function pickFor(ctx: Ctx, want: PickRole, title: string, current: number | null, onPick: (hero: number) => void, onClear?: () => void) {
  const s = ctx.s();
  const dept = want.kind === 'head' ? want.dept : DUTY[want.duty].dept;
  let showOthers = false;
  drawer(ctx.root, title, pickNote(dept, want), (body, close) => {
    if (onClear && current != null)
      body.append(
        btn(t('外す（自分に戻す）', 'Remove (back to you)'), () => {
          close();
          onClear();
        }, 'isl-pick-clear'),
      );
    const others = othersCount(s, want, current);
    const fl = h('label', 'isl-make-filter isl-pick-others');
    const cb = h('input');
    cb.type = 'checkbox';
    cb.checked = showOthers;
    fl.append(cb, h('span', '', t(`ほかの部長・リーダー・セクター長も表示（${others} 人）`, `Show other heads, leaders and sector heads (${others})`)));
    const grid = h('div', 'isl-pick-grid');
    const render = () => {
      grid.replaceChildren();
      const list = pickList(s, want, current, showOthers);
      const best = pickBest(list);
      for (const { st, q, grey } of list) {
        const card = h('button', `isl-hero-pick ${st.hero === current ? 'is-on' : ''} ${grey ? 'is-grey' : ''}`);
        card.type = 'button';
        card.dataset.hero = String(st.hero);
        const lv = h('div', 'isl-row');
        lv.append(rarityBadge(st.rarity ?? 'C'), h('small', '', `Lv ${st.level ?? 1}`));
        const sn = starOf(q, st.level ?? 1);
        card.append(heroIcon(st.hero, 56), h('b', '', heroNm(st.hero)), lv, h('b', q >= 0.85 ? 'isl-good' : 'isl-gold', qText(q)), h('small', 'isl-pick-star', `${'★'.repeat(sn)}${'☆'.repeat(3 - sn)}`));
        // 段 P2：史実の適性（「人事 S：家臣の才を見抜き登用した」）
        const ft = fitTag(st.hero, dept);
        if (ft) card.append(ft);
        const r = roleOf(st);
        if (r) card.append(roleBadge(r));
        card.append(h('small', st.task == null && !grey ? 'isl-good isl-pick-job' : 'isl-dim isl-pick-job', st.hero === current ? t('いまの担当', 'Current') : jobLabel(s, st)));
        // 段 UI7a：リーダーは持ち場の仕事と兼ねない（選ぶと外れる）。部長は兼ねる
        if (want.kind === 'leader' && !grey && st.hero !== current && st.task != null && st.task !== 'lead') card.append(h('small', 'isl-warn isl-pick-move', t('選ぶと、この仕事から外れます', 'Leaves this job if picked')));
        if (st.hero === best) card.append(h('span', 'isl-best', t('マインちゃんのおすすめ', 'Mine-chan’s pick')));
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          close();
          onPick(st.hero);
          // 段 P2：着任のあいさつ（史実の調査のあるヒーロー）
          sayToast(ctx.toast, st.hero, 'greet', s.day);
        });
        grid.append(card);
      }
    };
    cb.addEventListener('change', () => {
      showOthers = cb.checked;
      render();
    });
    render();
    body.append(fl, grid);
  });
}

/** 段 UI6：初めて部長を任命するとき（候補を選ぶ前）のマインちゃんの一言。main.ts が first を結ぶ（一言のあとに go で候補を出す） */
export const headHooks: { first?: (go: () => void) => void } = {};
/**
 * 段 UI6：部長の候補を出す（部門の担当・組織図・部長との会話から）。まだ部長が 1 人もいなくて、初めて任命するときは、
 * 先にマインちゃんの一言（部長を選ぶと操作の仕方が大きく変わる）。onPick を省くと、その部門の部長にする
 */
export function pickHead(ctx: Ctx, dept: DeptId, current: number | null, onPick?: (hero: number) => void, onClear?: () => void) {
  const s = ctx.s();
  const d = DEPT[dept];
  const pick = onPick ?? ((hero: number) => done(ctx, setHead(s, dept, hero), t(`${heroNm(hero)}を${d.name}部長にしました！`, `${heroNm(hero)} now heads ${d.name}!`)));
  const go = () => pickFor(ctx, { kind: 'head', dept }, t(`${d.name}部長`, `${d.name} head`), current, pick, onClear);
  if (!s.flags.headPick && current == null && !headDepts(s).length && headHooks.first) {
    s.flags.headPick = true;
    ctx.save();
    headHooks.first(go);
    return;
  }
  go();
}

/** 部門の担当（部門の画面の上の帯の「担当」から）：事業部長・業務ごとのチームリーダー */
export function openDeleg(ctx: Ctx, dept: DeptId) {
  const d = DEPT[dept];
  open(ctx, t(`${d.icon} ${d.name}の担当`, `${d.icon} ${d.name}: delegation`), (body) => {
    const s = ctx.s();
    const lv = deptLevel(s, dept);
    body.classList.add('isl-dl');
    const intro = h('p', 'isl-dim');
    // 段 L0：リーダーは Uncommon の町から・部長は Rare の町から（それまでは自分で回す）
    intro.append(rich(t(`${stageName(L0.leaderFrom)} の町を開くと、理解度 ${DELEG.leaderAt} で業務を 1 つずつ[[チームリーダー]]に、${stageName(L0.headFrom)} の町を開くと部門を丸ごと[[事業部長]]に任せられます。任せたあとも、いつでも外して手に戻せます。`, `From a ${stageName(L0.leaderFrom)} town, at understanding ${DELEG.leaderAt} you can hand single tasks to [[team leaders]]; from a ${stageName(L0.headFrom)} town, the whole department to a [[division head]]. You can take any of it back at any time.`)));
    body.append(intro);
    const top = h('div', 'isl-dl-lv');
    top.append(h('b', '', t(`理解度 ${lv}`, `Understanding ${lv}`)), h('small', 'isl-dim', bandText(s, dept).long));
    body.append(top);

    // ---- 事業部長
    const hc = h('div', 'isl-card2 isl-dl-head');
    hc.style.setProperty('--br', d.color);
    hc.append(h('h3', '', t('事業部長（部門を丸ごと）', 'Division head (whole department)')));
    const hl = headLeft(s, dept) ?? 0;
    const H = headOf(s, dept);
    if (H) {
      hc.append(personRow(H, dept));
      const n = (s.deleg?.inbox ?? []).filter((p) => p.dept === dept).length;
      const st = h('p', 'isl-dl-on');
      st.append(h('span', 'isl-tag is-good', t('部長におまかせ中', 'Run by the head')), h('span', '', t(`この部門の業務はすべて自動で回ります・今月の提案 ${n}`, `All tasks here run on their own · proposals ${n}`)));
      hc.append(st);
      const row = h('div', 'isl-row');
      // 段 L0：古いセーブで Rare より前に置いてある部長は残す（外すと Rare の町まで置き直せない。替えるは出さない）
      row.append(
        btn(t('提案を見る', 'See proposals'), () => openProps(ctx), 'is-on'),
        ...(isLocked(hl) ? [] : [btn(t('替える', 'Change'), () => pickHead(ctx, dept, H.hero, (hero) => done(ctx, setHead(s, dept, hero), t(`${heroNm(hero)}を${d.name}部長にしました`, `${heroNm(hero)} now heads ${d.name}`))))]),
        btn(t('外す（手に戻す）', 'Dismiss (back to you)'), () => done(ctx, setHead(s, dept, null), t('部長を外しました。この部門は手で回します', 'Head dismissed. You run this department by hand'))),
      );
      hc.append(row);
    } else if (rankLocked(hl)) hc.append(h('p', 'isl-dim isl-dl-rank', rankLockText(hl)));
    else if (hl > 0) hc.append(h('p', 'isl-dim', t(`🔒 理解度 ${DELEG.headAt} で置けます（いま ${lv}・あと ${hl}）`, `🔒 Opens at understanding ${DELEG.headAt} (now ${lv}, ${hl} to go)`)));
    else {
      const add = btn(t('＋ 部長を置く', '+ Place a head'), () => pickHead(ctx, dept, null, (hero) => done(ctx, setHead(s, dept, hero), t(`${heroNm(hero)}を${d.name}部長にしました！`, `${heroNm(hero)} now heads ${d.name}!`))), 'is-on isl-dl-add');
      hc.append(add);
    }
    hc.append(h('small', 'isl-dim', t(`部長がいると、この部門の業務がすべて自動で回り、月に 1 回、提案を持ってきます（承認／却下／保留）。部門の効き目に小さな補正（出来しだい ±）。リーダーがいれば、部長の下で出来 +${Math.round(DELEG.q.underHead * 100)}%。`, `With a head, every task here runs on its own and a proposal arrives monthly (approve / reject / hold). A small ± to the department’s effects. Leaders under a head get +${Math.round(DELEG.q.underHead * 100)}% quality.`)));
    body.append(hc);

    // ---- チームリーダー（業務ごと）
    const lc = h('div', 'isl-card2 isl-dl-leads');
    lc.append(h('h3', '', t('チームリーダー（業務を 1 つずつ）', 'Team leaders (one task each)')));
    const duties = DEPT_DUTIES[dept];
    const ll = leaderLeft(s, dept) ?? 0;
    if (!duties.length) lc.append(h('p', 'isl-dim', t('この部門には、まだリーダーに任せられる業務がありません（部長の提案と補正だけ）。', 'No tasks to hand to leaders here yet (a head still brings proposals and a bonus).')));
    else if (rankLocked(ll)) lc.append(h('p', 'isl-dim isl-dl-rank', rankLockText(ll)));
    else if (ll > 0) lc.append(h('p', 'isl-dim', t(`🔒 理解度 ${DELEG.leaderAt} で置けます（いま ${lv}・あと ${ll}）`, `🔒 Opens at understanding ${DELEG.leaderAt} (now ${lv}, ${ll} to go)`)));
    for (const id of duties) lc.append(dutyCard(ctx, s, dept, id, isLocked(ll)));
    body.append(lc);
  });
}
/** ヒーローの 1 行（顔・名前・Lv・レアリティ・出来と内訳） */
function personRow(st: Staff, dept: DeptId, q?: number): HTMLElement {
  const row = h('div', 'isl-dl-person');
  const p = qualityParts(st, dept);
  const name = h('div', 'isl-dl-name');
  const lv = h('div', 'isl-row');
  lv.append(rarityBadge(st.rarity ?? 'C'), h('b', '', heroNm(st.hero)), h('small', 'isl-dim', `Lv ${st.level ?? 1}`));
  const fitTxt = Math.abs(p.fit) >= 0.005 ? `${p.fit > 0 ? '+' : '−'}${pct(Math.abs(p.fit))}` : '';
  name.append(lv, qBar(q ?? p.total), h('small', 'isl-dim', t(`内訳：能力値（${deptAptName(dept)}）${pct(p.base)}・Lv +${pct(p.lv)}・パッシブ +${pct(p.passive)}${fitTxt ? `・史実の適性 ${fitTxt}` : ''}${q != null && q > p.total ? `・部長の下 +${pct(q - p.total)}` : ''}`, `From ${deptAptName(dept)} ${pct(p.base)}, level +${pct(p.lv)}, passives +${pct(p.passive)}${fitTxt ? `, historical fit ${fitTxt}` : ''}${q != null && q > p.total ? `, under head +${pct(q - p.total)}` : ''}`)));
  // 段 P2：史実の適性の根拠
  const ft = fitTag(st.hero, dept);
  if (ft) name.append(ft);
  row.append(heroIcon(st.hero, 48), name);
  return row;
}
/** 業務 1 つ（いまの担当・今月の出来・置く／替える／外す） */
function dutyCard(ctx: Ctx, s: P1State, dept: DeptId, id: DutyId, locked: boolean): HTMLElement {
  const def = DUTY[id];
  const c = h('div', `isl-dl-duty ${locked ? 'is-lock' : ''}`);
  c.dataset.duty = id;
  const head = h('div', 'isl-row');
  head.append(h('b', '', `${def.icon} ${def.name}`));
  c.append(head, h('small', 'isl-dim', def.note));
  const L = leaderOf(s, id);
  const r = runnerOf(s, id);
  const stat = s.deleg?.stat[id];
  if (L) {
    c.append(personRow(L, dept, r?.q));
  } else if (r) c.append(h('p', 'isl-good', t(`部長（${heroNm(r.st.hero)}）がまとめて行っています（${qText(r.q)}）`, `The head (${heroNm(r.st.hero)}) handles it (${qText(r.q)})`)));
  else c.append(h('p', 'isl-dim', t('いまは手でやっています', 'You do this by hand now')));
  if (r && stat) c.append(h('small', 'isl-dl-stat', t(`今月：${dutyLine({ id, hero: r.st.hero, by: r.by, q: r.q, acts: stat.acts, miss: stat.miss, n: stat.n })}`, `This month: ${dutyLine({ id, hero: r.st.hero, by: r.by, q: r.q, acts: stat.acts, miss: stat.miss, n: stat.n })}`)));
  if (!locked) {
    const row = h('div', 'isl-row');
    const pick = () => pickFor(ctx, { kind: 'leader', duty: id }, t(`リーダー：${def.name}`, `Leader: ${def.name}`), L?.hero ?? null, (hero) => done(ctx, setLeader(s, id, hero), t(`${heroNm(hero)}をリーダー（${def.name}）にしました！`, `${heroNm(hero)} now leads ${def.name}!`)));
    if (L) row.append(btn(t('替える', 'Change'), pick), btn(t('外す（手に戻す）', 'Dismiss (back to you)'), () => done(ctx, setLeader(s, id, null), t(`${def.name}を手に戻しました`, `${def.name} is back in your hands`))));
    else row.append(btn(t('＋ チームリーダーを置く', '+ Place a team leader'), pick, 'is-on isl-dl-add'));
    c.append(row);
  }
  return c;
}
const ERR: Record<string, string> = {
  closed: t('この部門はまだ開いていません', 'This department is not open yet'),
  locked: t('理解度が足りません', 'Not enough understanding'),
  'no-staff': t('そのヒーローはいません', 'No such hero'),
  away: t('そのヒーローは、ほかのセクタのセクター長です', 'That hero heads another sector'),
  training: t('そのヒーローは修行中です', 'That hero is training'),
  busy: t('そのヒーローは、ほかの部長を務めています（役職の兼任はできません）', 'That hero already heads another division (no double posts)'),
};
export function done(ctx: Ctx, e: string | null, ok: string) {
  if (e) {
    ctx.sfx?.('error');
    ctx.toast(ERR[e] ?? e);
    return;
  }
  ctx.sfx?.('levelup');
  ctx.toast(ok);
  after(ctx);
}

/** 提案のカード（承認／却下／保留） */
function propCard(ctx: Ctx, s: P1State, p: Proposal): HTMLElement {
  const d = DEPT[p.dept];
  const c = h('div', `isl-card2 isl-prop ${p.status === 'held' ? 'is-held' : ''}`);
  c.style.setProperty('--br', d.color);
  c.dataset.prop = String(p.id);
  const head = h('div', 'isl-prop-head');
  const who = h('div', 'isl-prop-who');
  who.append(h('b', '', t(`${d.icon} ${d.name}部長`, `${d.icon} ${d.name} head`)), h('small', 'isl-dim', heroNm(p.hero)));
  head.append(heroIcon(p.hero, 44), who);
  if (p.status === 'held') head.append(h('span', `isl-tag ${p.note ? 'is-bad' : ''}`, p.note === 'money' ? t('資金不足で保留', 'Held: not enough funds') : p.note === 'rp' ? t('研究ポイント不足で保留', 'Held: not enough RP') : t('保留', 'On hold')));
  c.append(head);
  c.append(h('b', 'isl-prop-title', actName(s, p.act)));
  const why = h('p', 'isl-prop-why');
  why.append(rich(propWhy(s, p)));
  c.append(why, h('p', 'isl-prop-est isl-good', propEst(p)));
  const cost = p.act.k === 'hire' ? t(`費用：雇うのは無料・月給 ${money(p.cost || 0)}`, `Cost: free to hire, monthly wage applies`) : p.rp ? t(`費用：研究ポイント ${p.rp}（いま ${s.rp ?? 0}）`, `Cost: ${p.rp} RP (you have ${s.rp ?? 0})`) : p.cost > 0 ? t(`費用：${money(p.cost)}（払ったあとの資金 ${money(s.money - p.cost)}）`, `Cost: ${money(p.cost)} (funds after: ${money(s.money - p.cost)})`) : t('費用：無料', 'Cost: free');
  c.append(h('small', p.cost > s.money ? 'isl-bad' : 'isl-dim', cost));
  const row = h('div', 'isl-row isl-prop-btns');
  // 段 UI9：受け箱から直接は承認させない。承認は提案書（課題・推奨・効果）を開いてから（カードがあればカード、無ければ提案書）
  const seeProposal = () => {
    const c = cardInbox(s).find((x) => x.src === 'head' && x.pid === p.id);
    if (c) return showCard(ctx, c, { done: () => after(ctx) });
    const st = staffOf(s, p.hero);
    openProposal(ctx, planOf(s, [p.act], { hero: p.hero, q: st ? quality(st, p.dept) : DELEG.q.lo, dept: p.dept }), {
      src: 'head',
      role: t(`${d.name}部長`, `${d.name} head`),
      approve: () => {
        const name = actName(s, p.act);
        const act = p.act;
        const plan = act.k === 'stock' ? stockPlan(s, act) : null;
        const e = approve(s, p.id);
        if (e === 'money' || e === 'rp') return { ok: false, err: e, did: [] };
        if (e) return { ok: false, err: 'gone', did: [] };
        return { ok: true, did: [name, ...(plan && act.k === 'stock' ? [stockMsg(plan, act.key)] : [])] };
      },
      done: () => after(ctx),
    });
  };
  row.append(
    btn(t('📄 提案書を見る', '📄 See the proposal'), seeProposal, 'is-on'),
    btn(t('却下', 'Reject'), () => {
      reject(s, p.id);
      ctx.sfx?.('tap');
      after(ctx);
    }),
    btn(t('保留', 'Hold'), () => {
      hold(s, p.id);
      after(ctx);
    }),
  );
  c.append(row);
  return c;
}

/** 部長の提案の受け箱（経営企画 → 部長の提案・月次報告の「担当の報告」から） */
export function openProps(ctx: Ctx) {
  open(ctx, t('部長の提案', 'Proposals from your heads'), (body) => {
    const s = ctx.s();
    body.classList.add('isl-dl');
    // 段 UI1：ヒーローからの提案・報告のカード（時間を止めて出せなかったもの）と、任せている提案。
    // 段 UI3：受け箱は「押せるもの」を上に（承認まで 2 タップ）。カードが無ければ、説明は部長の提案の下へ
    // 段 UI7c：経営方針（推奨・並び・言い方を決める）。いつでも変えられる
    body.append(policyCard(ctx));
    // 段 UI7h：一覧に出すのは推奨が承認になるものだけ。ならなくなったものは取り下げて、理由の一行を上に
    withdrawStale(s);
    const gone = goneBox(s);
    if (gone) body.append(gone);
    const hasCards = cardInbox(s).some((x) => x.src !== 'head') || !!s.cards?.trust?.length;
    if (hasCards) body.append(cardInboxCard(ctx));
    const how = h('p', 'isl-dim', t('事業部長は、月に 1 回、いま打てる手の中から効き目の見込みが大きいものを持ってきます。部長の出来が高いほど、見込みの誤差が小さくなります。承認すると、すぐに実行します。', 'Each month your heads bring the move they expect to pay off most. Better heads misjudge less. Approving carries it out right away.'));
    const here = s.sector ?? 'c1';
    const inbox = (s.deleg?.inbox ?? []).filter((p) => (p.sector ?? here) === here);
    if (!inbox.length) {
      const hasHead = Object.keys(DEPT).some((d) => headOf(s, d as DeptId));
      body.append(h('p', 'isl-dim isl-prop-empty', hasHead ? t('いまは提案がありません（月の締めで届きます）。', 'No proposals right now (they arrive at the monthly close).') : t(`事業部長を置くと（部門の理解度 ${DELEG.headAt} から。部門の画面の上の「担当」）、ここに提案が届きます。`, `Place a division head (from understanding ${DELEG.headAt}, via “Lead” on a department’s band) to get proposals here.`)));
    }
    const grid = h('div', 'isl-prop-grid');
    // 段 UI7c：社長の経営方針の価値の大きい順に（画面の並びだけ。部長の自動の施策・自動プレイは前のまま）
    for (const p of policySort(s, inbox)) grid.append(propCard(ctx, s, p));
    body.append(grid, how);
    if (!hasCards) body.append(cardInboxCard(ctx));
    // 承認した提案（翌月の報告で結果）
    const done = (s.deleg?.done ?? []).filter((x) => (x.p.sector ?? here) === here);
    if (done.length) {
      const c = h('div', 'isl-card2 isl-prop-done');
      c.append(h('h3', '', t('承認した提案（翌月の報告で結果）', 'Approved (results in next month’s report)')));
      for (const x of done) c.append(h('p', 'isl-good', x.p.src ? t(`✔ ${heroNm(x.p.hero)}：${actName(s, x.p.act)}`, `✔ ${heroNm(x.p.hero)}: ${actName(s, x.p.act)}`) : t(`✔ ${DEPT[x.p.dept].name}部長：${actName(s, x.p.act)}`, `✔ ${DEPT[x.p.dept].name} head: ${actName(s, x.p.act)}`)));
      body.append(c);
    }
    // 先月の結果・担当の報告
    const last = [...s.reports].reverse().find((r) => r.deleg);
    if (last?.deleg) {
      const c = h('div', 'isl-card2 isl-prop-report');
      c.append(h('h3', '', t(`担当の報告（${last.month} か月目）`, `Delegation report (month ${last.month})`)));
      for (const x of last.deleg.results) c.append(h('p', x.real >= 0 ? 'isl-good' : 'isl-warn', t(`提案の結果：${resultText(s, x)}`, `Result: ${resultText(s, x)}`)));
      for (const x of last.deleg.duties) c.append(h('p', '', t(`${DUTY[x.id].icon} ${DUTY[x.id].name}（${heroNm(x.hero)}・${qText(x.q)}）：${dutyLine(x)}`, `${DUTY[x.id].icon} ${DUTY[x.id].name} (${heroNm(x.hero)}, ${qText(x.q)}): ${dutyLine(x)}`)));
      body.append(c);
    }
    // セクター長（任せきり）
    body.append(sectorCard(s));
  });
}
/** セクター長の 1 行ずつ（いまのセクタ以外。任せきり：部長たちの提案を自分で承認） */
export function sectorLines(s: P1State): string[] {
  const out: string[] = [];
  for (const id of s.land?.mine ?? []) {
    if (id === s.land?.cur) continue;
    const rec = s.land?.recs[id];
    if (!rec || rec.manager == null) continue;
    const st = s.staff.find((x) => x.hero === rec.manager && x.task === 'manager' && x.target === id);
    if (!st) continue;
    const last = rec.log[rec.log.length - 1];
    const hd = rec.heads;
    out.push(
      t(
        `${sectorDef(id).name}：セクター長 ${heroNm(st.hero)}${last ? `・先月の利益 ${money(last.profit)}` : ''}${hd ? `・部長の提案 ${hd.n} 件を自分で承認（投資 +${money(hd.invest)}）` : ''}`,
        `${sectorDef(id).name}: ${heroNm(st.hero)}${last ? `, last profit ${money(last.profit)}` : ''}${hd ? `, approved ${hd.n} proposals itself (+${money(hd.invest)} invested)` : ''}`,
      ),
    );
  }
  return out;
}
function sectorCard(s: P1State): HTMLElement {
  const c = h('div', 'isl-card2 isl-prop-sector');
  c.append(h('h3', '', t('セクター長（セクタを任せる）', 'Sector heads (whole sectors)')));
  const ok = sectorHeadOk(s);
  c.append(h('small', 'isl-dim', ok.ready ? t(`新しく任命する条件：事業部長が ${ok.need} 部門以上（いま ${ok.heads}）`, `To appoint: ${ok.need}+ division heads (now ${ok.heads})`) : t(`新しく任命する条件：事業部長が ${ok.need} 部門以上（いま ${ok.heads}。準備中：いまは条件なしで任命できます）`, `To appoint: ${ok.need}+ division heads (now ${ok.heads}; coming soon — no condition for now)`)));
  const lines = sectorLines(s);
  if (!lines.length) c.append(h('p', 'isl-dim', t('ほかのセクタに出店して離れるときに、セクター長を選びます（ランドマップ）。', 'You pick a sector head when you leave a sector you opened in (land map).')));
  for (const l of lines) c.append(h('p', '', `🏛 ${l}`));
  c.append(h('small', 'isl-dim', t('セクター長のいるセクタは任せきり：会社に事業部長がいれば、そのセクタでも部長たちが提案を出し、セクター長が自分で承認します（1 件ごとに利益の 1 割をそのセクタへ投資）。', 'Sectors with a head run on their own: if the company has division heads, their proposals there are approved by the sector head (each puts 10% of the profit back into that sector).')));
  return c;
}

/** 人事の画面の「役目」の列：役目のあるヒーロー（リーダー・部長・セクター長の札） */
export function rolesCard(ctx: Ctx, s: P1State): HTMLElement | null {
  const rows = s.staff.map((st) => ({ st, r: roleOf(st) })).filter((x): x is { st: Staff; r: Role } => !!x.r);
  const c = h('div', 'isl-card2 isl-roles');
  c.append(h('h3', '', t(`役目（${rows.length}）`, `Roles (${rows.length})`)));
  if (!rows.length) {
    c.append(h('small', 'isl-dim', t(`部門の理解度 ${DELEG.leaderAt} でチームリーダー、${DELEG.headAt} で事業部長を置けます（部門の画面の上の「担当」）。同じヒーローを リーダー → 部長 → セクター長 と昇進させられます。`, `At understanding ${DELEG.leaderAt} you can place team leaders, at ${DELEG.headAt} division heads (“Lead” on a department’s band). The same hero can rise from leader to head to sector head.`)));
    return c;
  }
  const order = { sector: 0, head: 1, leader: 2 } as const;
  rows.sort((a, b) => order[a.r.kind] - order[b.r.kind]);
  const list = h('div', 'isl-roles-list');
  for (const { st, r } of rows) {
    const row = h('button', 'isl-roles-row');
    row.type = 'button';
    const what = r.kind === 'leader' ? t(`${DEPT[r.dept].name}・${DUTY[r.duty].name}`, `${DEPT[r.dept].name} · ${DUTY[r.duty].name}`) : r.kind === 'head' ? t(`${DEPT[r.dept].name}を丸ごと`, `All of ${DEPT[r.dept].name}`) : sectorDef(r.sector).name;
    row.append(heroIcon(st.hero, 32), roleBadge(r), h('b', '', heroNm(st.hero)), h('small', 'isl-dim', what), h('small', '', `Lv ${st.level ?? 1}`));
    if (r.kind !== 'sector') row.addEventListener('click', () => openDeleg(ctx, r.dept));
    list.append(row);
  }
  c.append(list);
  return c;
}

/** 月次報告の「担当の報告」の文（長い・短い）。無ければ null */
export function delegReportText(s: P1State, r: { deleg?: import('./deleg').DelegReport; cards?: import('./card').CardReport; budget?: import('./budget').BudgetReport }): [string, string] | null {
  const d = r.deleg;
  const sec = sectorLines(s).length;
  const cr = r.cards;
  if (!d && !sec && !cr && !r.budget) return null;
  const parts: string[] = [];
  const short: string[] = [];
  if (d?.duties.length) {
    const top = [...d.duties].sort((a, b) => b.acts - a.acts)[0];
    parts.push(t(`${DUTY[top.id].name}（${heroNm(top.hero)}・${qText(top.q)}）${dutyLine(top)}${d.duties.length > 1 ? `・ほか ${d.duties.length - 1} 業務` : ''}`, `${DUTY[top.id].name} (${heroNm(top.hero)}, ${qText(top.q)}) ${dutyLine(top)}${d.duties.length > 1 ? ` + ${d.duties.length - 1} more` : ''}`));
    short.push(t(`業務 ${d.duties.length}`, `${d.duties.length} tasks`));
  }
  if (d && (d.props || d.waiting)) {
    parts.push(t(`部長の提案 ${d.props} 件（待ち ${d.waiting}）`, `${d.props} proposals (${d.waiting} waiting)`));
    short.push(t(`提案 ${d.waiting}`, `${d.waiting} prop.`));
  }
  if (d?.results.length) {
    // 段 P2：いちばんうまくいった提案のヒーローのひとこと（史実の調査のあるヒーロー）
    const win = [...d.results].filter((x) => x.real > 0).sort((a, b) => b.real - a.real)[0];
    const yay = win ? lineOf(win.hero, 'success', r.deleg?.props ?? 0) : null;
    parts.push(t(`提案の結果 ${d.results.length} 件${yay ? `（${heroNm(win!.hero)}「${yay}」）` : ''}`, `${d.results.length} results`));
    short.push(t(`結果 ${d.results.length}`, `${d.results.length} res.`));
  }
  // 段 UI1：任せた提案（自分で実行して報告）・ヒーローからの提案のカード
  if (cr?.auto.length) {
    const x = cr.auto[0];
    parts.push(t(`🤝 任せた提案：${heroNm(x.hero)}が「${actName(s, x.act)}」を実行${cr.auto.length > 1 ? `ほか ${cr.auto.length - 1} 件` : ''}`, `🤝 Trusted: ${heroNm(x.hero)} did “${actName(s, x.act)}”${cr.auto.length > 1 ? ` + ${cr.auto.length - 1}` : ''}`));
    short.push(t(`任せた ${cr.auto.length}`, `${cr.auto.length} trusted`));
  }
  if (cr?.made) {
    parts.push(t(`提案のカード ${cr.made} 件（受け箱 ${cr.boxed}）`, `${cr.made} proposal cards (${cr.boxed} to inbox)`));
    short.push(t(`カード ${cr.made}`, `${cr.made} cards`));
  }
  // 段 I1：予算で任せた部門（施策・従業員・頼み）
  const bl = budgetLine(r as { budget?: import('./budget').BudgetReport });
  if (bl) {
    parts.push(bl[0]);
    short.push(bl[1]);
  }
  if (sec) {
    parts.push(t(`セクター長 ${sec} 町`, `${sec} sector heads`));
    short.push(t(`セクター長 ${sec}`, `${sec} sect.`));
  }
  if (!parts.length) return null;
  return [parts.join(t('／', ' / ')), short.join(t('・', ' · '))];
}
