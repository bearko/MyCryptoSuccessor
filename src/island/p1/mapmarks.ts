/**
 * 段 L0：地図の印（困りごとのアイコン。DOM なし：main.ts が描き、テストが使う）。
 * Rare より前は、ヒーローからの提案カード（card.ts の stallDraft・staffDraft・heroDrafts・hrDrafts・noticeDrafts・stockDraft）を出さず、
 * 同じ下書きの元（詰まりの段：棚が空・素材切れ・人手不足・休みが要る・倉庫がいっぱい・空き店舗・問い合わせ）を、その建物の上に **アイコン 1 つ** で見せる。
 * - 文字なし。色と形：赤＝売れない・橙＝素材と製造・青＝人・灰＝疲れ・紫＝倉庫・緑＝空き店舗・黄＝お客さん（ISLAND_UX_CHARTER.md 2-3）
 * - 押すとその手の操作に飛ぶ（既存の画面を開くだけ。go）。時間は止めない。直れば消える（毎回いまの状態から作る）
 * - 同じ建物に複数あれば強いもの 1 つ＋「+N」（more）
 * - チュートリアルのあいだは出さない。チュートリアルのあと 2 か月目から（marksOn）
 * - 同じ困りごとが L0.marks.tipMonths 回の月の締めで出たら、それを無くすパネル（fix）に「💡」（noteMarks・tipPanels）
 */
import { t } from '../../i18n';
import { L0, SELF_RUN, SKILL } from './data';
import { DEF } from '../defs';
import { has, myShops, myWorkshop, stallOf, type P1State, type PBuilding, type Stall } from './model';
import { storeFull } from './stock';
import { csOn } from './cs';
import { propsOpen } from './stage';
import type { OrderKind } from './orders';

export type MarkKind = 'sell' | 'mats' | 'make' | 'people' | 'tired' | 'full' | 'vacant' | 'cs';
/** 押したときの行き先：建物の吹き出しの指示（orders.ts の OrderKind）・画面・建物の吹き出し */
export type MarkGo =
  | { k: 'order'; uid: number; order: OrderKind }
  | { k: 'screen'; id: 'buy' | 'staff' | 'store' | 'shop' | 'cs'; uid?: number }
  | { k: 'pop'; uid: number };
export interface MapMark {
  /** 印を出す建物 */
  uid: number;
  i: number;
  j: number;
  kind: MarkKind;
  /** 強さ（同じ建物では大きいもの 1 つ） */
  pri: number;
  go: MarkGo;
  /** 同じ建物のほかの印の数（「+N」） */
  more: number;
  /** それを無くすパネル（💡。無ければ null） */
  fix: string | null;
}

/** 種類ごとの色（CSS の --mk）と形（アイコン）。凡例と同じ */
export const MARK_KIND: Record<MarkKind, { icon: string; color: string; name: () => string }> = {
  sell: { icon: '🛒', color: '#f0565a', name: () => t('売れない', 'Not selling') },
  mats: { icon: '📦', color: '#f39a3c', name: () => t('素材', 'Materials') },
  make: { icon: '🔨', color: '#f39a3c', name: () => t('製造', 'Crafting') },
  people: { icon: '👤', color: '#4f8fe6', name: () => t('人', 'People') },
  tired: { icon: '💤', color: '#8a93a8', name: () => t('疲れ', 'Tired') },
  full: { icon: '🗄', color: '#b49bff', name: () => t('倉庫', 'Storage') },
  vacant: { icon: '🏬', color: '#6fd08c', name: () => t('空き店舗', 'Vacant') },
  cs: { icon: '💬', color: '#f2b544', name: () => t('お客さん', 'Customers') },
};
/** 凡例に並べる色（同じ色はまとめる）：赤・橙・青・灰・紫・黄（緑の空き店舗は Rare から出るので凡例に入れない） */
export const MARK_LEGEND: MarkKind[] = ['sell', 'mats', 'people', 'tired', 'full', 'cs'];

const inTut = (s: Pick<P1State, 'tut'>) => typeof s.tut === 'number' && s.tut < 99;
/** 印を出す段か：Rare より前（提案が届く前）・チュートリアルのあと 2 か月目から */
export const marksDue = (s: P1State) => !propsOpen(s) && !inTut(s) && s.reports.length >= 1;
/** 地図に出すか（marksDue ＋ 地図のトグル。既定オン） */
export const marksOn = (s: P1State) => marksDue(s) && s.flags.issueMarks !== false;

const wholesaleOf = (s: P1State): PBuilding | null => s.buildings.find((b) => b.owner === 'town' && b.id === 'wholesale' && b.left <= 0) ?? null;
const ON_JOB = new Set(['craft', 'shop', 'buy', 'transport']);

type Raw = Omit<MapMark, 'more' | 'i' | 'j'>;
/** 詰まりの段（stallOf：いまの状態）→ 印 */
function fromStall(st: Stall, ws: PBuilding, wh: PBuilding | null, out: Raw[]) {
  const buyAt = wh ?? ws;
  const at = (b: PBuilding, kind: MarkKind, pri: number, go: MarkGo, fix: string | null = null) => out.push({ uid: b.uid, kind, pri, go, fix });
  if (st.stage === 'buy') {
    if (st.why === 'none') at(buyAt, 'people', 82, wh ? { k: 'order', uid: wh.uid, order: 'buyer' } : { k: 'screen', id: 'staff' }, 'hire');
    else if (st.why === 'rest') at(buyAt, 'tired', 72, { k: 'screen', id: 'staff' }, 'relief');
    else if (st.why === 'full' || st.why === 'backlog') at(ws, 'full', 70, { k: 'screen', id: 'store' }, 'inventory');
    else at(buyAt, 'mats', 76, wh ? { k: 'order', uid: wh.uid, order: st.why === 'route' || st.why === 'cap' ? 'buyopen' : 'order' } : { k: 'screen', id: 'buy' }, 'auto_order');
  } else if (st.stage === 'craft') {
    if (st.why === 'noworker') at(ws, 'people', 84, { k: 'order', uid: ws.uid, order: 'crafter' }, 'hire');
    else at(ws, 'make', 78, { k: 'order', uid: ws.uid, order: 'make' });
  } else if (st.stage === 'haul') {
    if (st.why === 'rest') at(ws, 'tired', 72, { k: 'screen', id: 'staff' }, 'shift');
    else at(ws, 'people', 80, { k: 'screen', id: 'staff' }, st.why === 'backlog' ? 'timetable' : 'hire');
  }
  // 売り場（sell）は、お店ごとに下で見る
}

/** いまの地図の印（建物 1 つに 1 つ。強い順）。印を出す段でなければ空 */
export function marksOf(s: P1State): MapMark[] {
  if (!marksDue(s)) return [];
  const ws = myWorkshop(s);
  const shops = myShops(s);
  if (!ws || !shops.length) return [];
  const wh = wholesaleOf(s);
  const raw: Raw[] = [];
  const st = stallOf(s);
  if (st) fromStall(st, ws, wh, raw);
  // お店ごと：人がいない（青）・棚が空（赤）・休む日に回す人が足りない（青。お店の自走の提案の元）
  for (const b of shops) {
    const sh = s.shops[b.uid];
    if (!sh) continue;
    const open = sh.staff != null || sh.part > 0;
    if (!open) {
      raw.push({ uid: b.uid, kind: 'people', pri: 86, go: { k: 'order', uid: b.uid, order: 'clerk' }, fix: 'hire' });
      continue;
    }
    const stocked = sh.shelves.some((x) => x);
    const goods = Object.values(sh.shelf).reduce<number>((a, n) => a + (n ?? 0), 0) + Object.values(sh.storage).reduce<number>((a, n) => a + (n ?? 0), 0);
    if (!stocked || goods <= 0) raw.push({ uid: b.uid, kind: 'sell', pri: 90, go: { k: 'screen', id: 'shop', uid: b.uid }, fix: 'display' });
    if (sh.staff != null && (sh.offLast ?? 0) >= 2 && sh.part < SELF_RUN.min) raw.push({ uid: b.uid, kind: 'people', pri: 60, go: { k: 'order', uid: b.uid, order: 'staff' }, fix: null });
  }
  // 倉庫がいっぱい（倉庫の提案の元）
  if (storeFull(s) && !raw.some((x) => x.kind === 'full')) raw.push({ uid: ws.uid, kind: 'full', pri: 62, go: { k: 'screen', id: 'store' }, fix: 'inventory' });
  // 疲れ（持ち場の人のスタミナが L0.marks.tired を切った・まだ休んでいない）：その人の建物
  for (const x of s.staff) {
    if (!x.task || !ON_JOB.has(x.task) || x.resting || x.stamina > x.stats.hp * L0.marks.tired) continue;
    const b = x.task === 'shop' ? shops.find((y) => s.shops[y.uid]?.staff === x.hero) : x.task === 'buy' ? wh ?? ws : ws;
    if (b) raw.push({ uid: b.uid, kind: 'tired', pri: 50, go: { k: 'screen', id: 'staff' }, fix: 'shift' });
  }
  // 問い合わせ・炎上の予告（お客さん）：主力のお店（1 軒目）
  const cs = s.cs;
  if (csOn(s) && cs && (cs.inbox.length || (cs.warn && !cs.warn.done))) raw.push({ uid: shops[0].uid, kind: 'cs', pri: cs.warn && !cs.warn.done ? 88 : 45, go: { k: 'screen', id: 'cs' }, fix: null });
  // 空き店舗（緑。Rare の町から。いまは提案が届く段なので出ないが、元の表に合わせて置く）
  for (const v of s.area?.vacant ?? []) raw.push({ uid: v.uid, kind: 'vacant', pri: 40, go: { k: 'pop', uid: v.uid }, fix: null });
  // 建物ごとに強いもの 1 つ＋「+N」
  const by = new Map<number, Raw[]>();
  for (const r of raw) by.set(r.uid, [...(by.get(r.uid) ?? []), r]);
  const out: MapMark[] = [];
  for (const [uid, xs] of by) {
    const b = s.buildings.find((y) => y.uid === uid);
    if (!b) continue;
    xs.sort((a, c) => c.pri - a.pri);
    const kinds = new Set(xs.map((x) => x.kind));
    // 2 × 2 の建物（物流拠点など）は真ん中に
    const half = ((DEF[b.id]?.size ?? 1) - 1) / 2;
    out.push({ ...xs[0], i: b.i + half, j: b.j + half, more: kinds.size - 1 });
  }
  return out.sort((a, c) => c.pri - a.pri);
}

/** 月の締め（card.ts の cardsMonth。Rare より前）：いま出ている印の種類を数える（💡 の元。flags.markSeen） */
export function noteMarks(s: P1State) {
  if (!marksDue(s)) return;
  const seen = (s.flags.markSeen ??= {});
  const fixes = new Set<string>();
  for (const m of marksOf(s)) {
    seen[m.kind] = (seen[m.kind] ?? 0) + 1;
    if (m.fix) fixes.add(m.fix);
  }
  const fx = (s.flags.markFix ??= {});
  for (const id of fixes) fx[id] = (fx[id] ?? 0) + 1;
}
/** 「💡」を付けるパネル：何度も出た困りごと（L0.marks.tipMonths 回）を無くすパネルのうち、まだ取っていないもの */
export function tipPanels(s: P1State): Set<string> {
  const out = new Set<string>();
  if (propsOpen(s)) return out;
  for (const [id, n] of Object.entries(s.flags.markFix ?? {})) if (n >= L0.marks.tipMonths && SKILL[id] && !has(s, id)) out.add(id);
  return out;
}
/** 💡 の 1 行（パネルの説明に） */
export const tipLine = () => t('💡 地図の印によく出る困りごとを無くすパネル', '💡 Fixes a trouble that keeps showing on the map');
/** その印の 💡（何度も出ていて、まだ取っていないパネル）。無ければ null */
export const markTip = (s: P1State, m: Pick<MapMark, 'fix'>) => (m.fix && tipPanels(s).has(m.fix) ? m.fix : null);
