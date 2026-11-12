/**
 * 段 UIX3a：選ぶ引き出し（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：選ぶ引き出し」）。
 * 下から出る板・一覧・選ぶと手応え・下に貼りつく決めるキー（主役：前の層）。器は画面の部品の uxpDrawer。
 * - ヒーローを選ぶ（pickHero）：待機中が先・適性の高い順。押して選び、下のキーで決める。ほかの担当の人は、選んで決めると付け替える
 *   （今の「付け替えますか？」の確かめは、決めるキーの上の一言にまとめた）。
 * - エクステを選ぶ（pickExt・作る物を選ぶ pickMake）：今のカード（extCard）を管制卓の板に。並びの切り替え・絞り込み・ランクアップは今と同じ。
 * - ほかの引き出し（drawer を直接使う所）：器だけ替え、中身は今のまま入れる。
 * 選べる物・押せる操作・出す数字は、今の引き出し（p1/heroui.ts）と同じ。決まり（誰を選べるか・付け替え・外す）は本体の関数のまま。
 */
import { t } from '../../../i18n';
import { el, type Kid } from '../dom';
import { uxIcon } from '../icons';
import { later } from '../loop';
import { uxKey, uxMeter, uxTape, uxToggle } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { uxpCard, uxpDrawer, uxpEmpty, uxpFace, uxpNum, uxpSeg, uxpSelect, uxpStamp, type UxpDrawer } from '../sparts';
import { C } from './c-deps';
import { mIcon } from './micons';
import './picker.css';
import type { Sku } from '../../p1/data';
import type { drawer, pickExt, pickHero, PickKind } from '../../p1/heroui';
import type { Staff } from '../../p1/model';

/** 決めてから、引き出しをしまうまで（「決定」の札が打たれるのを見せる。ms） */
export const PICK_STAMP_MS = 240;

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）

/** 並び：待機中 → いまの担当 → ほかの担当 → 休憩中 → 修行中（今の引き出しと同じ） */
export const KIND_ORDER: Record<PickKind, number> = { free: 0, current: 1, busy: 2, resting: 3, training: 4 };
/**
 * カードを押したときにすること（今の引き出しと同じ決まり）：
 * select＝選ぶ（決めるキーで確定）・swap＝選ぶ（決めると、元の担当から外してここに付ける）・promo＝選ぶ（セクター長へ昇進）・
 * rest＝休憩中（選べない：あと何日かを知らせる）・busy＝ほかの担当（チュートリアル中は付け替えない）・none＝選べない
 */
export type TapKind = 'select' | 'swap' | 'promo' | 'rest' | 'busy' | 'none';
export function heroTap(kind: PickKind, o: { promoLead: boolean; canSwap: boolean }): TapKind {
  if (kind === 'training') return 'none';
  if (kind === 'resting') return 'rest';
  if (o.promoLead) return 'promo';
  if (kind === 'busy') return o.canSwap ? 'swap' : 'busy';
  return 'select';
}
/** はじめに選んでおく人：空いている枠（いまの担当なし）なら、いちばん向いている待機中の人。担当がいる枠は、その人 */
export function preselect<T extends { hero: number; kind: PickKind; apt: number }>(list: T[], current: number | null): number | null {
  if (current != null) return list.some((x) => x.hero === current) ? current : null;
  const free = list.filter((x) => x.kind === 'free');
  if (!free.length) return null;
  return free.reduce((a, b) => (b.apt > a.apt ? b : a)).hero;
}
/** 作る物の並び（今の引き出しと同じ）：売れない物 → 技がまだの物をうしろへ、あとは 1 日あたりの粗利の高い順。印をつけた物は先頭 */
export function extOrder<T>(items: T[], o: { off: (x: T) => number; locked: (x: T) => number; profit: (x: T) => number; first?: T | null; keep?: boolean }): T[] {
  const list = o.keep ? [...items] : [...items].sort((a, b) => o.off(a) - o.off(b) || o.locked(a) - o.locked(b) || o.profit(b) - o.profit(a));
  if (o.first != null && list.includes(o.first)) list.splice(0, 0, ...list.splice(list.indexOf(o.first), 1));
  return list;
}

// ---------------------------------------------------------------- 小さな道具

const RANK_TONE: Record<string, string> = { S: 'amber', A: 'amber', B: 'good', C: 'good', D: '', E: '', F: 'dim', G: 'dim' };
/** 適性の段と数（「E 45」）。段の字は貼り札、数は数字の書体 */
function rankChip(apt: number): HTMLElement {
  const r = C.rankOf(apt);
  return el(`span.uxc-rank${RANK_TONE[r] ? '.is-' + RANK_TONE[r] : ''}`, { title: t('適性', 'Aptitude') }, el('b', r), el('span.ux-num', String(C.aptShow(apt))));
}
/** 決めたあと：「決定」の札を打って、少し見せてから引き出しをしまい、本体の処理を呼ぶ（動きを減らすときは、すぐ） */
function decideAndClose(d: UxpDrawer, card: HTMLElement | null, fn: () => void) {
  if (isCalm() || !card) {
    d.drop();
    fn();
    return;
  }
  const st = uxpStamp(t('決定', 'Set'));
  st.el.classList.add('uxc-pick-stamp');
  card.append(st.el);
  st.hit(card);
  d.el.classList.add('is-busy');
  later(PICK_STAMP_MS, () => {
    d.drop();
    fn();
  });
}
/** 一覧の札が、上から順に入る（はじめの 8 枚だけ。あとはすぐ出す） */
const stagger = (cards: HTMLElement[]) => cards.forEach((c, i) => c.style.setProperty('--i', String(Math.min(i, 8))));

// ---------------------------------------------------------------- 器だけ替える引き出し（中身は今のまま）

/** p1/heroui.ts の drawer と同じ呼び方：器は新しい引き出し、中身（fill）は今のまま入れる */
export const drawerUx: (...a: Parameters<typeof drawer>) => () => void = (root, title, note, fill) => {
  const d = uxpDrawer({ root, title: title.replace(/^\P{L}+\s*/u, ''), note: note || undefined, cls: 'uxc-drawer-legacy' });
  // 今の中身の並べ方（.isl-picker-body）はそのまま効かせる
  d.body.classList.add('isl-picker-body');
  fill(d.body, () => d.drop());
  return () => d.drop();
};

// ---------------------------------------------------------------- ヒーローを選ぶ

export const pickHeroUx: (...a: Parameters<typeof pickHero>) => void = (root, s, o) => {
  const promo = o.task === 'manager';
  const tut = !!C.pickHooks.tutorial?.();
  const aptOf = (st: Staff) => Math.round(C.aptitude(st.stats, o.task));
  const list = [...s.staff].filter((x) => x.task !== 'manager' && (x.task !== 'lead' || promo)).sort((a, b) => KIND_ORDER[C.pickKind(a, o.current)] - KIND_ORDER[C.pickKind(b, o.current)] || C.aptitude(b.stats, o.task) - C.aptitude(a.stats, o.task));
  const best = Math.max(0, ...list.filter((x) => x.task !== 'train' && !x.resting).map(aptOf));
  const taskName = C.TASK_NAME[o.task];
  const note =
    o.note ??
    (tut
      ? t(`数字は「${taskName}」の適性です。押して選び、下のキーで決めます。灰色のヒーローは、ほかの担当か休憩中です。`, `Numbers are ${taskName} aptitude. Tap to pick, then confirm below. Grey heroes are busy or resting.`)
      : t(`数字は「${taskName}」の適性です。押して選び、下のキーで決めます。ほかの担当の人も、選んで決めればここへ付け替えられます（「外す」で、担当を外すだけもできます）。`, `Numbers are ${taskName} aptitude. Tap to pick, then confirm below. Pick a busy hero to move them here (or use “Free” to just unassign).`));
  const warn = el('div.uxc-pick-warn', { hidden: true, role: 'status' });
  const side =
    o.current != null
      ? uxKey(t('担当を外す', 'Unassign'), () => {
          d.drop();
          o.onPick(null);
        }, { kind: 'weak', cls: 'uxc-pick-none' })
      : null;
  const d = uxpDrawer({ root, title: o.title, note, ico: 'people', cls: 'uxc-pick uxc-pick-hero', side, decide: { label: t('決める', 'Confirm'), onDecide: () => decide() } });
  d.foot?.before(warn);
  let sel: Staff | null = null;
  const cards = new Map<number, HTMLElement>();
  /** 「外す」を 1 回押して、もう一度で外す形になっているカード（ほかを押すか 3 秒で戻る） */
  let armed: { hero: number; off: () => void } | null = null;
  const disarm = () => {
    armed?.off();
    armed = null;
  };

  function setSel(st: Staff | null, feel: boolean) {
    sel = st;
    for (const [hero, c] of cards) uxpSelect(c, hero === st?.hero, feel && hero === st?.hero);
    if (!st) {
      warn.hidden = true;
      d.setDecide({ name: null, label: t('決める', 'Confirm'), on: false });
      return;
    }
    const kind = C.pickKind(st, o.current);
    const act = heroTap(kind, { promoLead: promo && st.task === 'lead', canSwap: C.swapOn(st) });
    const name = C.heroName(st.hero);
    // ほかの担当の人：決めると、元の担当から外してここに付ける（今の「付け替えますか？」の確かめの中身）
    if (act === 'swap') {
      const from = C.jobLabel(s, st);
      warn.replaceChildren(el('p', uxIcon('next', { scale: 1, color: '#ffe394' }), t(`${name} は いま『${from}』の担当です。決めると、外して、ここに付けます。`, `${name} is now on “${from}”. Confirming moves them here.`)));
      if (C.swapStops(s, st.hero, o.task)) warn.append(el('p.uxc-pick-stop', uxIcon('down', { scale: 1, color: '#ff5964' }), t(`${from} は担当がいなくなり、止まります`, `${from} will have no one and stop`)));
      warn.hidden = false;
    } else warn.hidden = true;
    d.setDecide({
      name: [uxIcon('check', { scale: 1, color: '#ffe394' }), el('b', name), rankChip(aptOf(st))],
      label: act === 'swap' ? t('付け替えて決める', 'Move here') : act === 'promo' ? t('昇進させる', 'Promote') : kind === 'current' ? t('このままにする', 'Keep') : t('この人に決める', 'Confirm'),
      on: true,
    });
  }

  function decide() {
    const st = sel;
    if (!st) return;
    const kind = C.pickKind(st, o.current);
    const act = heroTap(kind, { promoLead: promo && st.task === 'lead', canSwap: C.swapOn(st) });
    const card = cards.get(st.hero) ?? null;
    if (act === 'swap') {
      const from = C.jobLabel(s, st);
      if (!C.releaseForSwap(s, st.hero)) return;
      decideAndClose(d, card, () => {
        o.onPick(st.hero);
        const to = C.staffOf(s, st.hero);
        const dest = to && to.task != null ? C.jobLabel(s, to) : o.title;
        C.pickHooks.toast?.(t(`${C.heroName(st.hero)} を『${from}』から『${dest}』に付け替えました`, `Moved ${C.heroName(st.hero)} from “${from}” to “${dest}”`));
        C.pickHooks.changed?.();
      });
      return;
    }
    if (act !== 'select' && act !== 'promo') return;
    decideAndClose(d, card, () => o.onPick(st.hero));
  }

  function tap(st: Staff) {
    disarm();
    const kind = C.pickKind(st, o.current);
    const act = heroTap(kind, { promoLead: promo && st.task === 'lead', canSwap: C.swapOn(st) });
    if (act === 'rest') {
      uxSfx('deny');
      const n = C.restDaysLeft(s, st);
      C.pickHooks.toast?.(t(`休憩中（あと ${n} 日）`, `Resting (${n} more ${n === 1 ? 'day' : 'days'})`));
      return;
    }
    if (act === 'busy') {
      uxSfx('deny');
      C.pickHooks.toast?.(t(`いまは「${C.jobLabel(s, st)}」の担当です。「外す」で外すと選べます`, `Busy with ${C.jobLabel(s, st)}. Use “Free” to unassign them first`));
      return;
    }
    if (act === 'none') return;
    setSel(st, true);
  }

  function build(st: Staff): HTMLElement {
    const kind = C.pickKind(st, o.current);
    const apt = aptOf(st);
    const grey = kind === 'busy' || kind === 'resting' || kind === 'training';
    const v = st.stamina / st.stats.hp;
    const m = uxMeter(v, 'good');
    m.el.classList.add('uxc-pick-stamina');
    m.el.classList.toggle('is-low', v <= 0.3);
    m.el.title = t(`スタミナ ${Math.round(v * 100)}%`, `Stamina ${Math.round(v * 100)}%`);
    const job = kind === 'current' ? t('いまの担当', 'Current') : C.jobLabel(s, st);
    const jobTape = uxTape(job, kind === 'free' ? 'good' : kind === 'current' ? 'amber' : 'dark');
    jobTape.classList.add('uxc-pick-job');
    const fit = C.TASK_FIT[o.task] ? C.gradeChip(st.hero, C.TASK_FIT[o.task]!) : null;
    const ex = kind !== 'training' ? o.extra?.(st) : null;
    const desc: Kid[] = [el('span.uxc-pick-line', mIcon('bolt', { scale: 1, color: '#97a1cf' }), el('span.ux-vh', t('スタミナ', 'Stamina')), m.el, kind === 'resting' ? el('span.ux-t-bad', t(`スタミナ ${Math.round(v * 100)}%`, `Stamina ${Math.round(v * 100)}%`)) : null)];
    if (kind === 'resting') desc.push(el('span.uxc-pick-line', mIcon('zzz', { scale: 1, color: '#97a1cf' }), t('休憩中', 'Resting')));
    if (ex) desc.push(el('span.ux-t-amber', ex));
    if (fit) desc.push(el('span.uxc-pick-line', fit));
    const isBest = kind !== 'training' && kind !== 'resting' && best > 0 && apt === best;
    const badge = promo && st.task === 'lead' ? t('セクター長へ昇進', 'Promote to sector head') : isBest ? (o.badge ?? t('いちばん向いている', 'Best fit')) : undefined;
    // 「外す」：ほかの担当の人の担当を外す（選べる状態に戻る）。1 回目で確かめ、もう一度で外す
    let free: HTMLButtonElement | null = null;
    if (C.canRelease(st, o.current)) {
      const label = el('b', t('外す', 'Free'));
      free = uxKey(label, () => {
        if (armed?.hero === st.hero) {
          disarm();
          if (!C.releaseHero(s, st.hero)) return;
          uxSfx('toggle', { step: 0 });
          C.pickHooks.changed?.();
          if (sel?.hero === st.hero) setSel(null, false);
          redraw(st);
          return;
        }
        disarm();
        label.textContent = t('もう一度で外す', 'Tap again');
        free?.classList.add('ux-key--danger');
        const id = setTimeout(() => disarm(), 3000);
        armed = {
          hero: st.hero,
          off: () => {
            clearTimeout(id);
            label.textContent = t('外す', 'Free');
            free?.classList.remove('ux-key--danger');
          },
        };
      }, { kind: 'weak', cls: 'uxc-pick-free', attrs: { title: t('担当を外す', 'Unassign') } });
    }
    const card = uxpCard({
      pic: uxpFace(C.heroIcon(st.hero, 64), { win: 56, off: grey, breathe: kind === 'free' }),
      name: C.heroName(st.hero),
      tags: [rankChip(apt), jobTape],
      desc,
      right: free,
      badge,
      off: grey,
      selected: sel?.hero === st.hero,
      onTap: () => tap(st),
      // 確かめ・撮影の目印：data-hero（誰か）・data-best（いちばん向いている人）
      cls: `uxc-pick-card is-${kind}`,
      attrs: { 'data-hero': String(st.hero), ...(isBest ? { 'data-best': '' } : {}) },
    });
    if (kind === 'training') card.setAttribute('aria-disabled', 'true');
    return card;
  }
  function redraw(st: Staff) {
    const old = cards.get(st.hero);
    const c = build(st);
    cards.set(st.hero, c);
    old?.replaceWith(c);
  }

  const listEl = el('div.uxp-list');
  for (const st of list) {
    const c = build(st);
    cards.set(st.hero, c);
    listEl.append(c);
  }
  stagger([...cards.values()]);
  if (!list.length) d.body.append(uxpEmpty(t('まだ、選べるヒーローがいません', 'No heroes to pick yet'), { ico: 'people', sub: t('人事の「採用」で雇えます。', 'Hire them under HR → Hiring.') }));
  else d.body.append(listEl);
  // はじめに選んでおく：空いている枠は、いちばん向いている待機中の人（そのまま下のキーで決められる）
  const pre = preselect(list.map((st) => ({ hero: st.hero, kind: C.pickKind(st, o.current), apt: aptOf(st) })), o.current);
  const preSt = pre != null ? list.find((x) => x.hero === pre) : null;
  if (preSt) {
    setSel(preSt, false);
    requestAnimationFrame(() => cards.get(preSt.hero)?.scrollIntoView({ block: 'nearest' }));
  } else setSel(null, false);
};

// ---------------------------------------------------------------- エクステを選ぶ（作る物・棚に並べる物）

type ExtOpts = Parameters<typeof pickExt>[2];
type CraftOpts = NonNullable<ExtOpts['craft']>;

export const pickExtUx: (...a: Parameters<typeof pickExt>) => void = (root, s, o) => {
  const craft = o.craft ?? null;
  let tab: 'all' | 'stock' = craft?.tab ?? 'all';
  const locked = (x: Sku) => Number(C.craftCheck(s, x, null) === 'tech');
  const off = (x: Sku) => Number(!!o.blocked?.(x));
  const defNote = t('素材 → 商品のつながりと、今の素材で何ロット作れるか、1 日あたりの粗利を見比べて、押して選び、下のキーで決めます。', 'Compare materials → product, lots your stock makes and gross profit per day. Tap to pick, then confirm below.');
  const side =
    o.allowNone && o.current
      ? uxKey(t('並べない', 'Clear'), () => {
          d.drop();
          o.onPick(null);
        }, { kind: 'weak', cls: 'uxc-pick-none' })
      : null;
  const d = uxpDrawer({ root, title: o.title.replace(/^\P{L}+\s*/u, ''), note: craft ? (o.note ?? undefined) : (o.note ?? defNote), ico: 'hammer', cls: 'uxc-pick uxc-pick-ext', side, decide: { label: t('決める', 'Confirm'), onDecide: () => decide() } });
  const grid = el('div.uxs-cmp-grid.uxc-ext-grid');
  const lead = el('p.uxc-pick-lead.ux-t-dim');
  /** 選んでいる物と、決めたときにすること */
  let sel: { x: Sku; card: HTMLElement; go: () => void } | null = null;
  const cards = new Map<Sku, HTMLElement>();

  function setSel(x: Sku | null, go: (() => void) | null, feel: boolean, label?: string) {
    const card = x ? (cards.get(x) ?? null) : null;
    for (const [k, c] of cards) {
      const on = k === x;
      c.classList.toggle('is-sel', on);
      c.setAttribute('aria-pressed', String(on));
      if (on && feel) {
        uxSfx('toggle', { step: 1 });
        c.classList.remove('is-pick');
        void c.offsetWidth;
        c.classList.add('is-pick');
      }
    }
    if (!x || !card || !go) {
      sel = null;
      d.setDecide({ name: null, label: t('決める', 'Confirm'), on: false });
      return;
    }
    sel = { x, card, go };
    const ico = C.skuIcon(x, 32);
    ico.classList.add('ux-ext');
    d.setDecide({ name: [ico, el('b', C.skuName(x)), uxpNum(C.money(C.profitPerDay(s, x)) + t('／日', ' / day'), 'uxc-pick-ppd')], label: label ?? (x === o.current ? t('このままにする', 'Keep') : craft ? t('これを作る', 'Make this') : t('これに決める', 'Confirm')), on: true });
  }
  function decide() {
    const cur = sel;
    if (!cur) return;
    decideAndClose(d, cur.card, cur.go);
  }
  /** 今のカード（extCard）を、押して選ぶ形で作る */
  function add(x: Sku, opt: { badge?: string; best?: boolean; go: () => void; label?: string; extra?: (card: HTMLElement) => void; wrap?: boolean }): HTMLElement {
    const blocked = !!o.blocked?.(x);
    const card = C.extCard(s, x, {
      worker: o.worker,
      on: x === o.current,
      best: !opt.badge && !!opt.best,
      badge: opt.badge,
      making: o.making?.includes(x),
      off: blocked,
      onTap: () => {
        // この町で売れない商品（棚）：灰色で、押すと止める（引き出しは閉じない・選ばない）
        if (blocked) {
          uxSfx('deny');
          o.onBlocked?.(x);
          return;
        }
        setSel(x, opt.go, true, opt.label);
      },
    });
    card.classList.add('uxc-ext-card');
    card.dataset.sku = x;
    card.setAttribute('aria-pressed', 'false');
    card.setAttribute('data-ux-quiet', '');
    const g = o.gain?.(x);
    if (g) card.querySelector('.isl-ext-r')?.prepend(el('div.isl-ext-gain', g));
    opt.extra?.(card);
    cards.set(x, card);
    return card;
  }

  // ---- 棚に並べる物・1 つを選ぶだけの引き出し
  function renderPlain() {
    const list = extOrder(o.items, { off, locked, profit: (x) => C.profitPerDay(s, x), first: o.badge?.x, keep: o.keep });
    const ok = list.filter((x) => !off(x) && C.lotsFromStock(s, x) > 0 && !C.craftCheck(s, x, o.worker ?? null));
    const best = ok[0] ?? null;
    cards.clear();
    const els = list.map((x) =>
      add(x, {
        best: !o.badge && x === best,
        badge: o.badge?.x === x ? o.badge.text : undefined,
        go: () => o.onPick(x),
      }),
    );
    stagger(els);
    grid.replaceChildren(...els);
    if (!els.length) grid.append(uxpEmpty(t('いま、選べる商品がありません', 'Nothing to pick right now'), { ico: 'hammer' }));
    // はじめに選んでおく：いま並べている物 → 印をつけた物 → いちばん効率のよい物
    const pre = [o.current, o.badge?.x, best].find((x): x is Sku => !!x && cards.has(x) && !off(x));
    if (pre) setSel(pre, () => o.onPick(pre), false);
    else setSel(null, null, false);
  }

  // ---- 作業台の作る物（並びの切り替え・絞り込み・ランクアップ）
  function renderCraft(c: CraftOpts, first: boolean) {
    cards.clear();
    const cur = o.current ? s.slots.find((y) => y.sku === o.current) : undefined;
    const backTo = cur?.back !== undefined ? cur.back : o.current;
    lead.textContent =
      tab === 'stock'
        ? t(`手持ちの素材で作れるだけ作ります（素材は買い足さない）。${backTo ? `作り終えたら${C.skuName(backTo)}に戻ります。` : ''}`, `Makes as many as your stock allows (no new materials).${backTo ? ` Then back to ${C.skuName(backTo)}.` : ''}`)
        : t('素材 → 商品のつながりと、今の素材で何ロット作れるか、1 日あたりの粗利を見比べて選びましょう。', 'Compare materials → product, how many lots your stock makes, and gross profit per day.');
    const els: HTMLElement[] = [];
    const wrapOf = (x: Sku, card: HTMLElement): HTMLElement => {
      const no = C.sellNo(s, x);
      if (no) card.querySelector('.isl-ext-l')?.append(el('div.isl-ext-no', uxIcon('close', { scale: 1, color: '#ff5964' }), no));
      const wrap = el('div.uxc-ext-wrap', card);
      // ランクアップ（Common → Uncommon）：そのまま進めるキー（できない理由は 1 行で）
      const ru = C.rankable(s, x) ? C.rankUp(s, x, o.worker ?? null) : null;
      if (ru) {
        const go = uxKey(ru.next === 'make' ? t(`ランクアップ（${C.skuName(ru.to)}を作る）`, `Rank up (make ${C.skuName(ru.to)})`) : t('ランクアップ', 'Rank up'), () => {
          if (ru.next === 'make') {
            d.drop();
            o.onPick(ru.to);
            return;
          }
          c.rank(x, () => d.drop());
        }, { ico: 'up', cls: 'uxc-rankup-key' });
        wrap.append(el(`div.uxc-rankup${ru.why ? '.is-why' : ''}`, go, el('span.uxc-rankup-note', ru.why ?? (ru.next === 'dev' ? t(`開発 ${C.money(ru.cost)}・${ru.days} 日で ${C.money(C.upPrice(x))} の品に`, `Develop ${C.money(ru.cost)}, ${ru.days} d → a ${C.money(C.upPrice(x))} item`) : t(`${C.money(C.upPrice(x))} の品`, `a ${C.money(C.upPrice(x))} item`)))));
      }
      return wrap;
    };
    let pre: { x: Sku; go: () => void; label?: string } | null = null;
    if (tab === 'stock') {
      const xs = C.fromStock(s, o.worker ?? null, C.makeView.sellable);
      if (!xs.length) els.push(uxpEmpty(C.makeView.sellable ? t('いまの素材だけで作れて、この町で売れる商品はありません。', 'Nothing sellable here can be made from stock alone.') : t('いまの素材だけで作れる商品はありません。', 'Nothing can be made from stock alone.'), { ico: 'box' }));
      for (const p of xs) {
        const go = () => c.stock(p.x);
        const label = t('いまの素材で作る', 'Make from stock');
        const card = add(p.x, {
          badge: p.rec ? t('いまの素材でのおすすめ', 'Best from stock') : undefined,
          go,
          label,
          extra: (cd) => {
            const g = el('div.isl-ext-gain.is-stock', el('b', t(`いまの素材で ${p.units} 個`, `${p.units} from stock`)));
            if (!p.no) g.append(el('small', t(`この町で月 ${Math.round(p.sell)} 個売れる見込み`, `~${Math.round(p.sell)}/mo sell here`)));
            if (p.spareRate >= 0.5) g.append(el('span.isl-tag.is-good.isl-ext-spare', t('余った素材を使う', 'Uses spare materials')));
            cd.querySelector('.isl-ext-r')?.prepend(g);
          },
        });
        els.push(wrapOf(p.x, card));
        if (p.rec && !pre) pre = { x: p.x, go, label };
      }
    } else {
      const items = C.sellFilter(s, o.items, C.makeView.sellable);
      const list = extOrder(items, { off: (x) => Number(!!C.sellNo(s, x)), locked, profit: (x) => C.profitPerDay(s, x), first: o.badge?.x });
      const best = list.find((x) => !C.sellNo(s, x) && C.lotsFromStock(s, x) > 0 && !C.craftCheck(s, x, o.worker ?? null)) ?? null;
      const hidden = o.items.length - items.length;
      if (hidden > 0) els.push(el('p.uxc-make-hidden.ux-t-dim', t(`この町で売れない ${hidden} 品を隠しています（「今のセクタで売れるもの」を切ると出ます）`, `${hidden} item(s) that won’t sell here are hidden (turn the filter off to show)`)));
      for (const x of list) {
        const go = () => o.onPick(x);
        els.push(wrapOf(x, add(x, { badge: o.badge?.x === x ? o.badge.text : undefined, best: x === best, go })));
      }
      const p0 = [o.current, o.badge?.x, best].find((x): x is Sku => !!x && cards.has(x));
      if (p0) pre = { x: p0, go: () => o.onPick(p0) };
    }
    stagger(els);
    grid.replaceChildren(...els);
    if (!first && !isCalm()) {
      grid.classList.remove('is-in');
      void grid.offsetWidth;
      grid.classList.add('is-in');
    }
    if (pre) setSel(pre.x, pre.go, false, pre.label);
    else setSel(null, null, false);
  }

  if (craft) {
    const seg = uxpSeg<'all' | 'stock'>(
      [
        { value: 'all', label: t('おすすめ（効率）', 'Best (efficiency)') },
        { value: 'stock', label: t('いまの素材で作れる', 'From what we have') },
      ],
      tab,
      (v) => {
        tab = v;
        uxSfx('tab');
        renderCraft(craft, false);
      },
      { label: t('並び', 'Order'), cls: 'uxc-make-tabs' },
    );
    const filter = uxToggle({
      label: t('今のセクタで売れるもの', 'Sells in this sector'),
      value: C.makeView.sellable,
      onChange: (v) => {
        C.makeView.sellable = v;
        renderCraft(craft, false);
      },
    });
    d.body.append(el('div.uxc-make-bar', seg.el, el('label.uxc-make-filter', el('span', t('今のセクタで売れるもの', 'Sells in this sector')), filter.el)), lead, grid);
    renderCraft(craft, true);
  } else {
    d.body.append(grid);
    renderPlain();
  }
  requestAnimationFrame(() => sel?.card.scrollIntoView({ block: 'nearest' }));
};
