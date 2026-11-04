/**
 * 段 UI6：部門の画面を「部長との会話」に（人事で作って見せる）。計算と文は headtalk.ts（DOM なし）。
 * - 上〜中：その部門のデータ（話題に合わせて切り替え）。下：部長の顔・名前・肩書きと会話の箱（60 字・タップで送る）＋話題の選択肢 2〜4。
 * - 部長の「確認したいこと」（提案のカード・部長の提案）は「今月の確認事項」の話題の中で 1 件ずつ（承認・却下・あとで）。
 * - 部長がいない（置ける）ときはマインちゃん：「任せる人を選ぶ？」→ 候補／いまの細かい操作の画面。
 * - いまの細かい操作の画面へは、会話の箱の「詳しい画面」と下のサブタブからいつでも行ける。
 * 打つ手はいまの関数（カード：chooseCard・approveCard、部長の提案：approve・reject・hold、提案書：openProposal）をそのまま使う。
 */
import './ui6.css';
import { meetHero } from './lesson';
import { t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { DEPT, DEPT_DUTIES, DUTY, TASKS, aptitude, type DeptId } from './data';
import { actName, approve, headFx, pickList, headOf, heroNm, hold, propEst, propWhy, qText, quality, reject, setHead } from './deleg';
import { approveCard, choiceText, chooseCard, goneLine, planOfChoice, quipOfCard, roleOfCard, sayOf, shownRec, starOf, withdrawStale, type Card, type Choice } from './card';
import { charismaLine, moraleAvg, payroll, wantsToQuit } from './hr';
import { hrReportText, moraleChip } from './hrui';
import { orgChart } from './org';
import { applyPlan, planTitle, type Plan } from './plan';
import { openProposal } from './proposalui';
import { heroStats, staffOf, wageOf, type P1State } from './model';
import { heroRarityOf } from './hero';
import { rarityBadge } from './growthui';
import { rankEl } from './heroui';
import { fitTag, gradeChip, sayToast } from './p2ui';
import { bestFits, fitLine, voiceQuip } from './voice';
import { quipOf } from './persona';
import { done as delegDone, pickHead } from './delegui';
import { after, open, type Ctx } from './screens';
import { btn, h, heroIcon, money, recLine, recTag, rich } from './ui';
import { checkItems, detailOf, doneLine, laterLine, hireCard, itemLine, openLine, talkMode, topicLine, topicsOf, type CheckItem, type TopicId } from './headtalk';

export interface TalkHooks {
  /** 詳しい画面（その部門のサブタブ key）を開く */
  detail: (key: string) => void;
}

const stars = (n: number) => `${'★'.repeat(n)}${'☆'.repeat(3 - n)}`;
/** いまの会話（開いている部門・話題・確認事項の何件目・ひと言を上書きするとき） */
let cur: { dept: DeptId; topic: TopicId | null; k: number; say: string | null; page: number } | null = null;
/** データの部分のスクロール（話題ごと。1 日ごとの描き直しで戻らないように） */
const scrollOf = new Map<string, number>();

/** 部門の会話を開く（topic：はじめにその話題） */
export function openHeadTalk(ctx: Ctx, dept: DeptId, hooks: TalkHooks, topic: TopicId | null = null) {
  cur = { dept, topic, k: 0, say: null, page: 0 };
  const D = DEPT[dept];
  open(
    ctx,
    `${D.icon} ${D.name}`,
    (body) => render(ctx, body, hooks),
    () => {
      cur = null;
    },
  );
}
/** 会話が開いているか（テスト・撮影） */
export const headTalkOpen = () => !!cur;

/** 話題を変える */
function go(ctx: Ctx, topic: TopicId | null, say: string | null = null) {
  if (!cur) return;
  // 段 S1：部長と話した（教えの回数。同じ日は 1 回）
  if (topic) meetHero(ctx.s(), headOf(ctx.s(), cur.dept)?.hero);
  cur.topic = topic;
  cur.k = 0;
  cur.say = say;
  cur.page = 0;
  ctx.sfx?.('tap');
  after(ctx);
}

function render(ctx: Ctx, body: HTMLElement, hooks: TalkHooks) {
  if (!cur) return;
  const c = cur;
  const s = ctx.s();
  const dept = c.dept;
  const mode = talkMode(s, dept) ?? 'mine';
  // 部長を外した・いなくなった：会話の相手が替わったので、はじめから
  if (mode === 'mine' && c.topic && c.topic !== 'check' && c.topic !== 'pick' && c.topic !== 'self') {
    c.topic = null;
    c.say = null;
  }
  body.classList.add('isl-ht');
  body.closest('.isl-sheet')?.classList.add('has-ht');
  // 段 UI7h：推奨が承認にならなくなった提案は、確認事項に出さずに取り下げ（理由の一行をトーストで）
  for (const g of withdrawStale(s)) ctx.toast(`🗂 ${goneLine(g)}`);
  const H = headOf(s, dept);
  const items = checkItems(s, dept);
  if (c.topic === 'check' && c.k >= items.length && !c.say) {
    c.topic = null;
    c.say = items.length ? laterLine(s, dept, items.length) : doneLine(s, dept);
  }
  const item = c.topic === 'check' ? (items[c.k] ?? null) : null;

  // ---- 上〜中：データ
  const data = h('div', 'isl-ht-data');
  const key = `${dept}:${c.topic ?? ''}:${c.k}`;
  data.addEventListener('scroll', () => scrollOf.set(key, data.scrollTop));
  if (item) data.append(itemData(ctx, s, item));
  else if (c.topic === 'hire') data.append(...hireData(ctx, s));
  else if (c.topic === 'org') data.append(...orgData(s));
  else if (c.topic === 'deleg' && H) data.append(...delegData(s, dept, H.hero));
  else data.append(...summaryData(s, dept, mode));

  // ---- 下：会話の箱
  const box = h('div', `isl-ht-talk ${mode === 'mine' ? 'is-mine' : ''}`);
  const who = h('div', 'isl-ht-who');
  const id = h('div', 'isl-ht-id');
  if (H) {
    const st = staffOf(s, H.hero);
    const q = st ? quality(st, dept) : 0.7;
    const star = starOf(q, st?.level ?? 1);
    who.append(heroIcon(H.hero, innerWidth < 600 ? (innerHeight < 780 ? 44 : 56) : 72));
    const meta = h('small', 'isl-ht-meta', t(`${stars(star)} ・ Lv ${st?.level ?? 1}`, `${stars(star)} · Lv ${st?.level ?? 1}`));
    const ft = gradeChip(H.hero, dept);
    if (ft) meta.append(' ', ft);
    id.append(h('span', 'isl-ht-role', t(`${DEPT[dept].icon} ${DEPT[dept].name}部長`, `${DEPT[dept].icon} ${DEPT[dept].name} head`)), h('b', 'isl-ht-name', heroNm(H.hero)), meta);
  } else {
    const mi = h('img', 'isl-ht-mine');
    mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
    mi.alt = '';
    who.append(mi);
    id.append(h('span', 'isl-ht-role', t(`${DEPT[dept].icon} ${DEPT[dept].name}・部長はいません`, `${DEPT[dept].icon} ${DEPT[dept].name} · no head`)), h('b', 'isl-ht-name', t('マインちゃん', 'Mine-chan')));
  }
  who.append(id);
  const det = btn(t('🔧 詳しい画面', '🔧 Details'), () => hooks.detail(detailOf(dept)), 'isl-ht-detail');
  det.title = t('いままでの細かい操作の画面を開く', 'Open the detailed screens');
  who.append(det);
  box.append(who);

  // ひと言（ページ：60 字ずつ。タップで送る）
  const pages = linesOf(s, dept, c, item);
  const pg = Math.min(c.page, pages.length - 1);
  const last = pg >= pages.length - 1;
  // ウィットの一言（部長。あいさつのときだけ）
  if (H && !c.topic && !c.say) {
    const quip = voiceQuip(H.hero, 'idle', s.day) ?? quipOf(H.hero, 'idle', s.day);
    if (quip) box.append(h('p', 'isl-ht-quip', `— ${quip}`));
  }
  const text = h('p', `isl-ht-text ${last ? '' : 'is-more'}`);
  text.append(rich(pages[pg]));
  if (!last) {
    text.append(h('span', 'isl-ht-next', '▼'));
    text.addEventListener('click', () => {
      c.page = pg + 1;
      after(ctx);
    });
  }
  box.append(text);
  if (last) box.append(optsOf(ctx, s, dept, mode, item, items.length, hooks));
  body.append(data, box);
  const y = scrollOf.get(key);
  if (y) requestAnimationFrame(() => (data.scrollTop = y));
}

/** そのときのひと言（1 枚 60 字。ページに分けたもの） */
function linesOf(s: P1State, dept: DeptId, c: NonNullable<typeof cur>, item: CheckItem | null): string[] {
  if (c.say) return [c.say];
  if (item) return [itemLine(s, dept, item)];
  if (c.topic && c.topic !== 'check') return [topicLine(s, dept, c.topic)];
  return [openLine(s, dept)];
}

// ---------------------------------------------------------------- 選択肢

/** 選択肢（2〜4）。話題・確認事項の 1 件・戻る */
function optsOf(ctx: Ctx, s: P1State, dept: DeptId, mode: 'head' | 'mine', item: CheckItem | null, n: number, hooks: TalkHooks): HTMLElement {
  const row = h('div', 'isl-ht-opts');
  const c = cur!;
  // 段 UI5d：提案の推奨の選択肢（is-rec。話題の一覧の金色は除く）には「推奨」の札
  const opt = (label: string, on: () => void, cls = '') => {
    const b = btn(label, on, `isl-ht-opt ${cls}`);
    if (/\bis-rec\b/.test(cls) && label.startsWith('✔')) b.prepend(recTag());
    row.append(b);
  };
  const back = () => opt(t('← 話題に戻る', '← Back'), () => go(ctx, null), 'is-back');
  if (item) {
    itemOpts(ctx, s, item, opt);
    return row;
  }
  switch (c.topic) {
    case 'hire': {
      const card = hireCard(s);
      const k = card ? recIndex(s, card) : -1;
      if (card && k >= 0) {
        opt(t(`✔ 承認：${choiceText(s, card, card.choices[k]).label}`, `✔ Approve: ${choiceText(s, card, card.choices[k]).label}`), () => decideCard(ctx, card, k), 'is-rec');
        const plan = planOfChoice(s, card, k);
        if (plan) opt(t('📄 提案書を見る', '📄 See the proposal'), () => showPlan(ctx, card, plan, true, k));
      }
      opt(t('人材登用を開く', 'Open recruiting'), () => hooks.detail('hire'));
      back();
      return row;
    }
    case 'org':
      opt(t('組織図を開く', 'Open org chart'), () => hooks.detail('org'));
      opt(t('給与・労務を開く', 'Open pay & welfare'), () => hooks.detail('pay'));
      back();
      return row;
    case 'deleg': {
      const H = headOf(s, dept);
      opt(t('部長を替える', 'Change the head'), () => pickHead(ctx, dept, H?.hero ?? null, (hero) => {
        delegDone(ctx, setHead(s, dept, hero), t(`${heroNm(hero)}を${DEPT[dept].name}部長にしました`, `${heroNm(hero)} now heads ${DEPT[dept].name}`));
        go(ctx, null);
      }));
      opt(t('部長を外す（自分で決める）', 'Remove the head (do it myself)'), () => {
        if (H) sayToast(ctx.toast, H.hero, 'rejected', s.day);
        delegDone(ctx, setHead(s, dept, null), t(`${DEPT[dept].name}部長を外しました。細かいことも全部あなたが決めます`, `Head removed. Every decision in ${DEPT[dept].name} is yours now`));
        go(ctx, null);
      });
      back();
      return row;
    }
  }
  // 話題の一覧（はじめ・片づいたあと）
  for (const x of topicsOf(s, dept, mode)) {
    const cls = x.id === 'check' ? 'is-rec' : x.id === 'pick' ? 'is-rec' : '';
    opt(x.label, () => {
      if (x.id === 'self') return hooks.detail(detailOf(dept));
      if (x.id === 'pick')
        return pickHead(ctx, dept, null, (hero) => {
          delegDone(ctx, setHead(s, dept, hero), t(`${heroNm(hero)}を${DEPT[dept].name}部長にしました！`, `${heroNm(hero)} now heads ${DEPT[dept].name}!`));
          go(ctx, null);
        });
      go(ctx, x.id);
    }, cls);
  }
  void n;
  return row;
}

/** カードのおすすめの手（無ければ最初の手）。手が無ければ −1 */
function recIndex(s: P1State, c: Card): number {
  // 段 UI7c：推奨は社長の経営方針の価値で（card.ts の shownRec）
  const r = shownRec(s, c);
  const k = r >= 0 && c.choices[r].act.k !== 'skip' && c.choices[r].act.k !== 'reject' && c.choices[r].act.k !== 'hold' ? r : -1;
  return k >= 0 ? k : c.choices.findIndex((x) => x.act.k !== 'skip' && x.act.k !== 'reject' && x.act.k !== 'hold');
}
const isNo = (x: Choice) => x.act.k === 'skip' || x.act.k === 'reject';

/** 確認事項 1 件の選択肢：承認（手が 2 つなら 2 つ）・却下・あとで（4 つまで） */
function itemOpts(ctx: Ctx, s: P1State, item: CheckItem, opt: (label: string, on: () => void, cls?: string) => void) {
  const next = () => {
    cur!.k++;
    cur!.page = 0;
    after(ctx);
  };
  if (item.k === 'prop') {
    const p = item.p;
    opt(t('✔ 承認', '✔ Approve'), () => {
      const e = approve(s, p.id);
      if (e === 'money' || e === 'rp') {
        ctx.sfx?.('error');
        ctx.toast(e === 'money' ? t(`資金不足：あと ${money(Math.max(0, p.cost - s.money))}（保留にしました）`, `Not enough funds: ${money(Math.max(0, p.cost - s.money))} short (held)`) : t('研究ポイント不足（保留にしました）', 'Not enough RP (held)'));
        return next();
      }
      if (e) ctx.toast(t('もう打てない手でした（受け箱から消しました）', 'That move is no longer possible (removed)'));
      else {
        ctx.sfx?.('levelup');
        ctx.toast(t(`✔ 承認：${actName(s, p.act)}`, `✔ Approved: ${actName(s, p.act)}`));
        sayToast(ctx.toast, p.hero, 'approved', p.id);
      }
      after(ctx);
    }, 'is-rec');
    opt(t('✖ 却下', '✖ Reject'), () => {
      reject(s, p.id);
      sayToast(ctx.toast, p.hero, 'rejected', p.id);
      ctx.sfx?.('tap');
      after(ctx);
    });
    opt(t('⏳ あとで', '⏳ Later'), () => {
      hold(s, p.id);
      next();
    });
    return;
  }
  const card = item.c;
  const acts = card.choices.map((x, k) => ({ x, k })).filter(({ x }) => !isNo(x) && x.act.k !== 'hold');
  const rk = shownRec(s, card);
  acts.sort((a, b) => Number(b.k === rk) - Number(a.k === rk) || a.k - b.k);
  const no = card.choices.findIndex(isNo);
  const room = 4 - 1 - (no >= 0 ? 1 : 0);
  for (const { x, k } of acts.slice(0, room)) {
    const label = choiceText(s, card, x).label;
    opt(acts.length === 1 || k === rk ? t(`✔ ${label}`, `✔ ${label}`) : label, () => decideCard(ctx, card, k), k === rk ? 'is-rec' : '');
  }
  if (no >= 0) opt(t('✖ 却下', '✖ Reject'), () => decideCard(ctx, card, no));
  opt(t('⏳ あとで', '⏳ Later'), next);
}

const CARD_ERR: Record<string, () => string> = {
  money: () => t('資金が足りません（受け箱に残しました）', 'Not enough funds (kept in the inbox)'),
  rp: () => t('研究ポイントが足りません（受け箱に残しました）', 'Not enough RP (kept in the inbox)'),
  stock: () => t('在庫がありません', 'No stock'),
  cool: () => t('まだ打てません', 'Not available yet'),
};
/**
 * カードの選択肢 k を選ぶ（受け箱のカードと、会話の中の仮のカード id −1）。手のある選択肢は提案書の中身（planOfChoice）を一気に実行（applyPlan）。
 * 手の無い選択肢（面談・昇給・このまま など）は chooseCard
 */
export function decideCard(ctx: Ctx, card: Card, k: number) {
  const s = ctx.s();
  const ch = card.choices[k];
  if (!ch) return;
  const plan = ch.act.k === 'do' || ch.act.k === 'approve' ? planOfChoice(s, card, k) : null;
  if (plan) {
    const r = card.id < 0 ? applyPlan(s, plan) : approveCard(s, card.id, plan);
    if (!r.ok) {
      ctx.sfx?.('error');
      ctx.toast(r.err === 'money' ? CARD_ERR.money() : r.err === 'rp' ? CARD_ERR.rp() : t('もう打てない手でした', 'That move is no longer possible'));
    } else {
      ctx.sfx?.('levelup');
      ctx.toast(`✔ ${r.did.length ? r.did.slice(0, 4).join(t('・', ' · ')) : planTitle(s, plan)}`); // i18n-ja
      sayToast(ctx.toast, card.hero, 'approved', card.id + s.day);
    }
    after(ctx);
    return;
  }
  if (card.id < 0) return;
  const res = chooseCard(s, card.id, k);
  if (!res.ok) {
    ctx.sfx?.('error');
    ctx.toast(CARD_ERR[res.err ?? '']?.() ?? t('もう打てない手でした（受け箱から消しました）', 'That move is no longer possible (removed)'));
  } else {
    ctx.sfx?.('levelup');
    ctx.toast(res.did ? `✔ ${res.did}` : t(`✔ ${choiceText(s, card, ch).label}`, `✔ ${choiceText(s, card, ch).label}`));
    if (isNo(ch)) sayToast(ctx.toast, card.hero, 'rejected', card.id);
  }
  after(ctx);
}
/** 提案書を開く（承認すると会話に戻る） */
function showPlan(ctx: Ctx, card: Card, plan: Plan, rec = false, pick?: number) {
  const s = ctx.s();
  openProposal(ctx, plan, {
    rec,
    src: 'talk',
    say: sayOf(s, card, pick),
    role: roleOfCard(s, card).text,
    later: card.id >= 0,
    card: card.id,
    ...(card.id >= 0 ? { approve: (p: Plan) => approveCard(s, card.id, p) } : {}),
    done: (w) => {
      if (w === 'ok') sayToast(ctx.toast, card.hero, 'approved', card.id + s.day);
      after(ctx);
    },
  });
}

// ---------------------------------------------------------------- データ（上〜中）

/** 数字の札（大きい数・小さい名前） */
function kpi(label: string, value: string, cls = ''): HTMLElement {
  const e = h('div', `isl-ht-kpi ${cls}`);
  e.append(h('b', '', value), h('small', '', label));
  return e;
}
/** はじめ：その部門の数字（人事：人数・士気・辞めたい・給料・候補・カリスマ）と先月の報告・部長がしていること */
function summaryData(s: P1State, dept: DeptId, mode: 'head' | 'mine'): HTMLElement[] {
  const out: HTMLElement[] = [];
  const grid = h('div', 'isl-ht-kpis');
  const idle = s.staff.filter((x) => x.task == null && !x.heads?.length).length;
  const quit = wantsToQuit(s).length;
  grid.append(
    kpi(t('ヒーロー', 'Heroes'), t(`${s.staff.length} 人`, `${s.staff.length}`)),
    kpi(t('待機中', 'Idle'), t(`${idle} 人`, `${idle}`), idle ? 'is-warn' : ''),
    kpi(t('士気の平均', 'Avg morale'), String(moraleAvg(s) ?? '—')),
    kpi(t('辞めたい', 'Want to quit'), t(`${quit} 人`, `${quit}`), quit ? 'is-bad' : ''),
    kpi(t('月の給料', 'Payroll / mo'), money(payroll(s))),
    kpi(t('採用の候補', 'Candidates'), t(`${s.hirePool.length} 人`, `${s.hirePool.length}`)),
  );
  out.push(grid);
  out.push(h('p', 'isl-ht-line', `👑 ${charismaLine(s)}`));
  const last = [...s.reports].reverse().find((r) => r.hr);
  const rep = last ? hrReportText(last) : null;
  if (rep) out.push(h('p', 'isl-ht-line isl-dim', t(`先月（${last!.month} か月目）：${rep[0]}`, `Last month (${last!.month}): ${rep[0]}`)));
  if (mode === 'head') {
    const card = h('div', 'isl-card2 isl-ht-duties');
    card.append(h('h3', '', t('部長が回している業務', 'Run by your head')));
    for (const u of DEPT_DUTIES[dept]) card.append(h('p', '', t(`${DUTY[u].icon} ${DUTY[u].name}：${DUTY[u].note}`, `${DUTY[u].icon} ${DUTY[u].name}: ${DUTY[u].note}`)));
    card.append(h('small', 'isl-dim', t('細かい配置・休ませ方は部長に任せています。確認したいことがあれば、部長から聞いてきます。', 'Your head handles staffing and rest; they’ll ask you when they need your OK.')));
    out.push(card);
  } else {
    // 部長の候補（出来の高い順に 3 人）
    const card = h('div', 'isl-card2 isl-ht-cands');
    card.append(h('h3', '', t(`${DEPT[dept].name}部長の候補`, `Candidates for ${DEPT[dept].name} head`)));
    // 段 UI7a：ほかの部長・リーダー・セクター長は候補に出さない（任命の引き出しと同じ）
    for (const { st, q } of pickList(s, { kind: 'head', dept }, headOf(s, dept)?.hero ?? null, false).slice(0, 3)) {
      const r = h('div', 'isl-ht-row');
      const sn = starOf(q, st.level ?? 1);
      r.append(heroIcon(st.hero, 40), h('b', '', heroNm(st.hero)), h('small', 'isl-ht-star', `${'★'.repeat(sn)}${'☆'.repeat(3 - sn)}`), h('small', q >= 0.85 ? 'isl-good' : 'isl-gold', qText(q)));
      const ft = fitTag(st.hero, dept);
      if (ft) r.append(ft);
      card.append(r);
    }
    card.append(h('small', 'isl-dim', t('部長を置くと、配置換え・休ませ方は部長が回し、あなたには確認したいことだけを聞いてきます。', 'With a head, staffing and rest run on their own; you only answer what they ask.')));
    out.push(card);
  }
  return out;
}

/** 採用の状況：雇う提案（あれば）・候補の一覧・カリスマ */
function hireData(ctx: Ctx, s: P1State): HTMLElement[] {
  const out: HTMLElement[] = [];
  const card = hireCard(s);
  const k = card ? recIndex(s, card) : -1;
  if (card && k >= 0) {
    const box = h('div', 'isl-card2 isl-ht-offer');
    box.append(h('h3', '', t('部長の提案', 'Your head suggests')));
    const ch = card.choices[k];
    const x = choiceText(s, card, ch);
    box.append(h('b', '', `${x.icon} ${x.label}`), h('small', '', x.sub));
    const plan = planOfChoice(s, card, k);
    if (plan) box.append(btn(t('📄 提案書を見る', '📄 See the proposal'), () => showPlan(ctx, card, plan, true, k), 'isl-ht-plan'));
    out.push(box);
  }
  const list = h('div', 'isl-card2 isl-ht-hire');
  list.append(h('h3', '', t(`雇える候補（${s.hirePool.length}）`, `Candidates (${s.hirePool.length})`)));
  if (!s.hirePool.length) list.append(h('p', 'isl-dim', t('いまは候補がいません。毎月入れ替わります。', 'No candidates now. They change every month.')));
  for (const id of s.hirePool) {
    const st = heroStats(id);
    const best = TASKS.reduce((a, b) => (aptitude(st, b.key) > aptitude(st, a.key) ? b : a), TASKS[0]);
    const r = h('div', 'isl-ht-row');
    r.append(heroIcon(id, 40), rarityBadge(heroRarityOf(id)), h('b', '', heroNm(id)));
    const fit = h('small', 'isl-ht-fit');
    fit.append(t(`${best.name} `, `${best.name} `), rankEl(aptitude(st, best.key)));
    r.append(fit);
    const bf = bestFits(id)[0];
    const g = bf ? gradeChip(id, bf) : null;
    if (g) r.append(g);
    r.append(h('small', 'isl-dim isl-ht-wage', t(`月給 ${money(wageOf(id))}`, `${money(wageOf(id))}/mo`)));
    list.append(r);
  }
  out.push(list);
  out.push(h('p', 'isl-ht-line', `👑 ${charismaLine(s)}`));
  return out;
}

/** 組織のこと：部門ごとの部長・リーダー・持ち場、待機中と辞めたい人 */
function orgData(s: P1State): HTMLElement[] {
  const o = orgChart(s);
  const box = h('div', 'isl-card2 isl-ht-org');
  box.append(h('h3', '', t('組織（本社）', 'Organization (head office)')));
  for (const d of o.depts) {
    const D = DEPT[d.dept];
    const r = h('div', 'isl-ht-row isl-ht-orgrow');
    r.style.setProperty('--c', D.color);
    const head = d.byCeo ? t('社長（あなた）', 'You (president)') : d.head.hero != null ? heroNm(d.head.hero) : d.head.open ? t('あなた（置ける）', 'You (can appoint)') : t(`あなた・🔒 ${d.head.lock?.at ?? ''}`, `You · 🔒 ${d.head.lock?.at ?? ''}`);
    const leads = d.leaders.filter((x) => x.hero != null).length;
    r.append(h('b', 'isl-ht-dname', `${D.icon} ${D.name}`), h('span', d.head.hero != null ? 'isl-good' : 'isl-dim', head));
    if (d.leaders.length) r.append(h('small', 'isl-dim', t(`リーダー ${leads}/${d.leaders.length}`, `Leaders ${leads}/${d.leaders.length}`)));
    r.append(h('small', 'isl-dim', t(`持ち場 ${d.posts.length}`, `Posts ${d.posts.length}`)));
    box.append(r);
  }
  const out: HTMLElement[] = [box];
  const people = h('div', 'isl-card2 isl-ht-people');
  people.append(h('h3', '', t('気にかけたい人', 'People to watch')));
  const quit = wantsToQuit(s);
  const idle = s.staff.filter((x) => x.task == null && !x.heads?.length);
  const low = [...s.staff].sort((a, b) => (a.morale ?? 70) - (b.morale ?? 70)).slice(0, 3);
  for (const st of [...quit, ...idle, ...low].filter((x, k, a) => a.indexOf(x) === k).slice(0, 5)) {
    const r = h('div', 'isl-ht-row');
    r.append(heroIcon(st.hero, 32), h('b', '', heroNm(st.hero)), moraleChip(st));
    if (st.quit != null) r.append(h('span', 'isl-tag is-bad', t('辞めたい', 'Wants to quit')));
    else if (st.task == null && !st.heads?.length) r.append(h('span', 'isl-tag', t('待機中', 'Idle')));
    people.append(r);
  }
  out.push(people);
  return out;
}

/** 任せ方：部長の出来・適性・回している業務・部門の効き目の補正 */
function delegData(s: P1State, dept: DeptId, hero: number): HTMLElement[] {
  const st = staffOf(s, hero);
  const box = h('div', 'isl-card2 isl-ht-headcard');
  const top = h('div', 'isl-ht-row');
  const q = st ? quality(st, dept) : 0.7;
  const sn = starOf(q, st?.level ?? 1);
  top.append(heroIcon(hero, 64));
  const nm = h('div', 'isl-ht-hname');
  nm.append(h('b', '', heroNm(hero)), h('small', '', t(`${stars(sn)} ・ ${qText(q)} ・ Lv ${st?.level ?? 1}`, `${stars(sn)} · ${qText(q)} · Lv ${st?.level ?? 1}`)));
  top.append(nm);
  box.append(top);
  const fl = fitLine(hero, dept);
  if (fl) box.append(h('p', 'isl-ht-fitline', fl));
  const fx = headFx(s, dept);
  box.append(h('p', 'isl-dim', t(`部門の効き目の補正 ${fx >= 0 ? '+' : ''}${(fx * 100).toFixed(1)}%（出来しだい）`, `Department effect ${fx >= 0 ? '+' : ''}${(fx * 100).toFixed(1)}% (by quality)`)));
  const duties = h('div', 'isl-card2 isl-ht-duties');
  duties.append(h('h3', '', t('部長が回している業務', 'Run by your head')));
  for (const u of DEPT_DUTIES[dept]) duties.append(h('p', '', t(`${DUTY[u].icon} ${DUTY[u].name}：${DUTY[u].note}`, `${DUTY[u].icon} ${DUTY[u].name}: ${DUTY[u].note}`)));
  duties.append(h('small', 'isl-dim', t('部長を外すと、この部門の細かいことは全部あなたが決めます（詳しい画面で）。', 'Remove the head and you make every call here yourself (in the detailed screens).')));
  return [box, duties];
}

/** 確認事項 1 件：話し手・セリフ・選択肢の見込み（カード）／提案の理由と見込み（部長の提案） */
function itemData(ctx: Ctx, s: P1State, item: CheckItem): HTMLElement {
  const n = checkItems(s, cur!.dept).length;
  const box = h('div', 'isl-card2 isl-ht-item');
  box.append(h('small', 'isl-ht-count', t(`確認事項 ${cur!.k + 1} / ${n}`, `Item ${cur!.k + 1} of ${n}`)));
  if (item.k === 'prop') {
    const p = item.p;
    const top = h('div', 'isl-ht-row');
    top.append(heroIcon(p.hero, 48), h('b', '', actName(s, p.act)));
    box.append(top);
    const why = h('p', '');
    why.append(rich(propWhy(s, p)));
    box.append(why, h('p', 'isl-good', propEst(p)), h('small', p.cost > s.money ? 'isl-bad' : 'isl-dim', p.rp ? t(`費用：研究ポイント ${p.rp}`, `Cost: ${p.rp} RP`) : t(`費用：${money(p.cost)}`, `Cost: ${money(p.cost)}`)));
    return box;
  }
  const c = item.c;
  const role = roleOfCard(s, c);
  const top = h('div', 'isl-ht-row');
  top.style.setProperty('--c', role.color);
  if (c.hero != null) top.append(heroIcon(c.hero, 48));
  top.append(h('span', 'isl-ht-role', `${role.icon} ${role.text}`), h('b', '', c.hero != null ? heroNm(c.hero) : t('マインちゃん', 'Mine-chan')));
  box.append(top);
  const quip = quipOfCard(c);
  if (quip) box.append(h('p', 'isl-ht-quip', `— ${quip}`));
  const say = h('p', 'isl-ht-say');
  say.append(t('「', '“'), rich(sayOf(s, c)), t('」', '”'));
  box.append(say);
  const list = h('div', 'isl-ht-choices');
  const rk = shownRec(s, c);
  c.choices.forEach((ch, k) => {
    const x = choiceText(s, c, ch);
    const r = h('div', `isl-ht-choice ${k === rk ? 'is-rec' : ''}`);
    r.append(recLine(`${x.icon} ${x.label}`, k === rk), h('small', '', x.sub));
    const plan = ch.act.k === 'do' || ch.act.k === 'approve' ? planOfChoice(s, c, k) : null;
    if (plan) r.append(btn(t('📄 提案書を見る', '📄 See the proposal'), () => showPlan(ctx, c, plan, k === rk, k), 'isl-ht-plan'));
    list.append(r);
  });
  box.append(list);
  return box;
}
