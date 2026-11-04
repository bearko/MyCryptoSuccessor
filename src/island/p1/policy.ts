/**
 * 経営方針（DOM なし）。段 UI7c：社長の価値観（推奨・並び・言い方）。段 K：全社方針と事業別の方針・効き目・開放・経営方針発表会。
 * 表は data.ts の POLICIES（1 か所）、数字は POL。仕様は docs/ISLAND_PHASE1.md「経営方針（段 K）」。
 *
 * - 全社方針：社長が選ぶ（枠の数まで。はじめ 1 つ）。段 UI7c の 7 つの価値観は、はじめから選べる全社方針。
 *   段 K2：枠は、会社として初めて上のランクの町に進出するたびに（U・R・E・L）、無償の特別なパネル「全社方針の枠 +1」を受け取って 1 つずつ増える（5 つまで。claimSlot）。
 * - 事業別の方針：部門ごとに 1 つ（開いた方針の中から）。経営会議（段 I2）の年初の回＝経営方針発表会で、部長が発表して社長が承認する（部長がいなければ社長が選ぶ）。
 * - 効き目（＋だけ）：強さ ＝ 基本 × 部門のレベル（理解度）× 部長の能力（polPower）。汎用の効き目は model.ts の fxSum に足す（polFx）。
 *   士気（hr.ts）・研究ポイント（model.ts の gainRp）・顧客満足度（cs.ts の careMul）・部長の労力（budget.ts の laborCap）は方針だけの種類。
 *   チュートリアル（1 か月目）のあいだは効かない（growthOn）。
 * - 推奨：選んだ全社方針（と、提案の部門の事業別の方針）の重みの平均（weightsOf）。提案の傾向：方針の推す種類の提案は × (1 + POL.tilt)（tiltOf）。
 * - 開放：はじめから・石板（読む）・スキルツリーの「経営方針」パネル。開いた順は s.pol.got（polSync）。
 * - 変え方：経営会議が始まる前（予算で任せるが開く前＝Rare の前）は、いつでも変えられる。始まったあとは、空いた枠・方針の無い部門はいつでも埋められ、
 *   選んである方針を替えるのは年初の経営方針発表会で（canReplace）。
 * - セーブは s.pol（版 27・段 K2 の枠は版 28）。段 UI7c の s.policy は、全社方針の 1 つ目として読む。
 */
import { t } from '../../i18n';
import { DEPT, DEPTS, FX_DOWN, FX_LABEL, POL, POLICIES, POLICY, POLICY_OF, SKILL, TABLET, TABLET_KNOW, type DeptId, type PolFxKind, type PolicyDef, type PolicyId, type PolTheme, type Tier, type ValueKey } from './data';
import { growthOn, lvOf, tierEntered, type P1State } from './model';
import { deptLevel } from './dept';
import { headOf, quality } from './deleg';
import { BOARD_OFF, sectorHeads, sectorQ, yearOfBoard, type BoardAgenda } from './board';
import { budgetOpen } from './budget';

// ---------------------------------------------------------------- 型・セーブ

export interface PolState {
  /** 全社方針（並び＝枠の順。枠より多いぶんは効かない） */
  corp: string[];
  /** 事業別の方針（部門ごとに 1 つ） */
  dept: Partial<Record<DeptId, string>>;
  /** 経営方針発表会を開いた会社の年（yearOfBoard。無ければまだ） */
  year?: number;
  /** 開いた順（方針の id） */
  got: string[];
  /** まだ知らせていない、新しく開いた方針（main.ts のトースト） */
  news?: string[];
  /** 発表会の途中の選び（決めるのは board.ts の BOARD_FINISH_HOOKS） */
  pres?: { q: number; corp?: string[]; dept: Partial<Record<DeptId, string>> };
  /** 記録：発表会の数（1 人ずつ・一括・飛ばす・自動）・部長の発表を替えた数 */
  stat?: { held: number; changed: number };
  /** 段 K2：受け取った「全社方針の枠 +1」の数（ランクアップの特別なパネル） */
  slots?: number;
  /** 段 K2：段 K の旧パネル「全社方針の枠」で増えていた枠の数（版 28 の読み込みで残す。減らさない） */
  keep?: number;
  /** 段 K2：知らせた（トースト・マインちゃん）受け取れる枠の数 */
  told?: number;
}
/** 段 K を止める（計測の比べ・テスト）。止めると効き目・傾向は 0、推奨は段 UI7c と同じ（全社方針の 1 つ目だけ）、発表会は開かない */
export const POL_OFF = { on: false };

const START = POLICIES.filter((p) => p.open.k === 'start').map((p) => p.id);
/** 方針の状態（無ければ作る。段 UI7c の s.policy を全社方針の 1 つ目に） */
export function polOf(s: P1State): PolState {
  if (!s.pol) s.pol = { corp: [s.policy && POLICY_OF[s.policy] ? s.policy : 'balance'], dept: {}, got: [...START] };
  return s.pol;
}
/** 読むだけ（作らない） */
const peek = (s: Pick<P1State, 'pol' | 'policy'>): Pick<PolState, 'corp' | 'dept'> => s.pol ?? { corp: [s.policy && POLICY_OF[s.policy] ? s.policy : 'balance'], dept: {} };

/** 版 26 → 27：方針の状態を作る（全社方針は s.policy から）。開いた順は、いま開いている方針を表の順に（知らせない） */
export function migratePol(s: P1State): void {
  const P = polOf(s);
  P.got = POLICIES.filter((p) => isOpen(s, p.id)).map((p) => p.id);
  delete P.news;
}

// ---------------------------------------------------------------- 開放

/** 方針が開いているか（はじめから・石板をすべて読んだ・パネルを取った） */
export function isOpen(s: Pick<P1State, 'skills' | 'tablets'>, id: string): boolean {
  const p = POLICY_OF[id];
  if (!p) return false;
  if (p.open.k === 'start') return true;
  if (p.open.k === 'panel') return s.skills.includes(p.open.id);
  return p.open.ids.every((x) => (s.tablets ?? []).includes(x));
}
/** 開いている方針（種類・部門で絞る。並びは表の順） */
export const openPolicies = (s: Pick<P1State, 'skills' | 'tablets'>, kind?: 'corp' | 'dept', d?: DeptId) => POLICIES.filter((p) => (!kind || p.kind === kind) && (!d || p.dept === d) && isOpen(s, p.id));
/** 石板で開く方針：読んだ枚数 */
export const tabletsRead = (s: Pick<P1State, 'tablets'>, p: PolicyDef) => (p.open.k === 'tablet' ? p.open.ids.filter((x) => (s.tablets ?? []).includes(x)).length : 0);
/** その石板で開く方針 */
export const policyOfTablet = (tab: string): PolicyDef | undefined => POLICIES.find((p) => p.open.k === 'tablet' && p.open.ids.includes(tab));
/** そのパネルで開く方針 */
export const policyOfPanel = (id: string): PolicyDef | undefined => POLICIES.find((p) => p.open.k === 'panel' && p.open.id === id);
/** 新しく開いた方針を開いた順に残す（model.ts の step・石板・パネル）。新しく開いたものを返す */
export function polSync(s: P1State): string[] {
  if (POL_OFF.on) return [];
  const P = polOf(s);
  const fresh: string[] = [];
  for (const p of POLICIES) if (!P.got.includes(p.id) && isOpen(s, p.id)) fresh.push(p.id);
  if (!fresh.length) return fresh;
  P.got.push(...fresh);
  P.news = [...(P.news ?? []), ...fresh];
  return fresh;
}
/** 知らせていない新しい方針を取り出す（main.ts のトースト） */
export function takePolNews(s: P1State): string[] {
  const xs = s.pol?.news ?? [];
  if (s.pol) delete s.pol.news;
  return xs;
}

/**
 * 版 27 → 28（段 K2）：段 K の旧パネル「全社方針の枠」（経営企画のお金パネル・Lv1〜4）を取っていたセーブは、そのぶんの枠を残す（keep。減らさない）。
 * パネルはスキルから外す（もう無い）。新しい道（ランクアップの特別なパネル）は keep を超えたぶんから増える
 */
export function migrateSlots(s: P1State): void {
  if (!s.skills.includes('pol_slots')) return;
  const lv = lvOf(s, 'pol_slots');
  s.skills = s.skills.filter((x) => x !== 'pol_slots');
  if (s.skillLv) delete s.skillLv.pol_slots;
  const P = polOf(s);
  P.keep = Math.max(P.keep ?? 0, Math.min(POL.max - POL.slots, lv));
}

// ---------------------------------------------------------------- 枠（段 K2：ランクアップの特別なパネル）

type SlotSrc = Pick<P1State, 'pol' | 'land' | 'tier'>;
/** 全社方針の枠 +1 が取れるようになったランク（会社として進出した U・R・E・L。並びは POL.grant の順） */
export const slotGrants = (s: Pick<P1State, 'land' | 'tier'>): Tier[] => POL.grant.filter((x) => tierEntered(s, x));
/** 増えている枠（受け取った数と、段 K の旧パネルで増えていた数の大きいほう） */
const extraOf = (s: SlotSrc) => Math.min(POL.max - POL.slots, Math.max(s.pol?.slots ?? 0, s.pol?.keep ?? 0));
/** 全社方針の枠（はじめ POL.slots・ランクアップの特別なパネルを受け取るごとに +1。POL.max まで） */
export const slotsOf = (s: SlotSrc) => POL.slots + extraOf(s);
/** 受け取れる「全社方針の枠 +1」の数（取れるようになったランクの数 − 増えている枠） */
export const slotPending = (s: SlotSrc) => Math.max(0, Math.min(POL.max - POL.slots, slotGrants(s).length) - extraOf(s));
/** 次に受け取る枠が、どのランクの進出のものか（受け取れなければ null） */
export const slotNextTier = (s: SlotSrc): Tier | null => (slotPending(s) > 0 ? POL.grant[extraOf(s)] ?? null : null);
/** まだ取れない枠と、その条件のランク（方針の画面の未開放の枠：「Rare の町に進出すると取れる」） */
export const slotLocked = (s: SlotSrc): { n: number; tier: Tier }[] => {
  const g = slotGrants(s).length;
  return POL.grant.map((tier, k) => ({ n: POL.slots + k + 1, tier })).filter((x, k) => k >= g && x.n <= POL.max);
};
/** 特別なパネル「全社方針の枠 +1」を受け取る（費用 0）。受け取れたら新しい枠の数・できなければ null */
export function claimSlot(s: P1State): number | null {
  if (slotPending(s) <= 0) return null;
  const P = polOf(s);
  P.slots = extraOf(s) + 1;
  polTouch();
  return slotsOf(s);
}
/** 知らせていない、受け取れる枠が増えたか（増えていれば知らせたことにして true） */
export function slotNews(s: P1State): boolean {
  const g = slotGrants(s).length;
  const P = polOf(s);
  if (slotPending(s) <= 0 || (P.told ?? 0) >= g) return false;
  P.told = g;
  return true;
}

// ---------------------------------------------------------------- いまの方針

/** いまの全社方針（開いているもの・枠の数まで） */
export function corpOf(s: P1State): string[] {
  const xs = [...new Set(peek(s).corp)].filter((id) => POLICY_OF[id]?.kind === 'corp' && isOpen(s, id));
  return (xs.length ? xs : ['balance']).slice(0, slotsOf(s));
}
/** その部門の事業別の方針（開いているものだけ。無ければ null） */
export function deptPolicyOf(s: P1State, d: DeptId): string | null {
  const id = peek(s).dept[d];
  return id && POLICY_OF[id]?.kind === 'dept' && POLICY_OF[id].dept === d && isOpen(s, id) ? id : null;
}
/** 効いている方針（全社 ＋ 事業別） */
export function activePolicies(s: P1State): PolicyDef[] {
  const out = corpOf(s).map((id) => POLICY_OF[id]);
  for (const d of DEPTS) {
    const id = deptPolicyOf(s, d.id);
    if (id) out.push(POLICY_OF[id]);
  }
  return out;
}

/** 段 UI7c：いまの経営方針（全社方針の 1 つ目） */
export const policyOf = (s: P1State): PolicyId => corpOf(s)[0] as PolicyId;
/** 段 UI7c：経営方針を決める（マインちゃんの問い・テスト）：全社方針の 1 つ目にする。聞いたことにする */
export function setPolicy(s: P1State, id: PolicyId): void {
  if (POLICY_OF[id]?.kind !== 'corp') return;
  const P = polOf(s);
  P.corp = [id, ...P.corp.filter((x) => x !== id)];
  s.policy = id;
  s.flags.policyAsked = true;
  polTouch();
}

// ---------------------------------------------------------------- 変える

/** 経営会議が始まったか（始まると、選んである方針を替えるのは年初の発表会で） */
export const meetingsOn = (s: P1State) => !BOARD_OFF.on && !POL_OFF.on && budgetOpen(s);
/**
 * 全社方針を替えられるか：会議が始まる前はいつでも。始まったあとは、いま選んでいる方針を残して空いた枠を埋めるときだけ（替えるのは発表会で）
 */
export function canSetCorp(s: P1State, ids: string[]): boolean {
  if (!meetingsOn(s)) return true;
  const cur = corpOf(s);
  return cur.every((x) => ids.includes(x));
}
/** 全社方針を決める（開いているもの・枠の数まで。force：発表会） */
export function setCorp(s: P1State, ids: string[], force = false): boolean {
  const xs = [...new Set(ids)].filter((id) => POLICY_OF[id]?.kind === 'corp' && isOpen(s, id)).slice(0, slotsOf(s));
  if (!xs.length) return false;
  if (!force && !canSetCorp(s, xs)) return false;
  const P = polOf(s);
  P.corp = xs;
  s.policy = xs[0] as PolicyId;
  s.flags.policyAsked = true;
  polTouch();
  return true;
}
/** 事業別の方針を替えられるか（会議の前はいつでも。始まったあとは、方針の無い部門だけ） */
export const canSetDept = (s: P1State, d: DeptId) => !meetingsOn(s) || !deptPolicyOf(s, d);
/** 事業別の方針を決める（開いているもの。force：発表会） */
export function setDept(s: P1State, d: DeptId, id: string | null, force = false): boolean {
  if (id != null && (POLICY_OF[id]?.kind !== 'dept' || POLICY_OF[id].dept !== d || !isOpen(s, id))) return false;
  if (!force && !canSetDept(s, d)) return false;
  const P = polOf(s);
  if (id == null) delete P.dept[d];
  else P.dept[d] = id;
  polTouch();
  return true;
}

// ---------------------------------------------------------------- 強さ・効き目

/** 方針の強さの内訳：基本 × 部門のレベル（lv）× 部長の能力（head）＝ mul */
export interface PolPower {
  lv: number;
  head: number;
  mul: number;
  /** 部門の理解度・能力の持ち主（部長・セクター長の平均。いなければ null） */
  level: number;
  who: number | null;
  q: number | null;
}
const band = (v: number) => Math.max(0, Math.min(1, v));
/** 方針の強さ（部門のレベルと、部長（セクター長の方針はセクター長の平均）の能力） */
export function polPower(s: P1State, p: PolicyDef): PolPower {
  const level = deptLevel(s, p.dept);
  const lv = 1 + POL.lv * Math.min(POL.lvCap, level);
  let head = 1;
  let who: number | null = null;
  let q: number | null = null;
  if (p.sector) {
    const xs = sectorHeads(s);
    if (xs.length) {
      q = xs.reduce((a, x) => a + sectorQ(x.st), 0) / xs.length;
      head = 1 + POL.head * band((q - 0.5) / 0.45);
      who = xs[0].st.hero;
    }
  } else {
    const H = headOf(s, p.dept);
    if (H) {
      q = quality(H, p.dept);
      head = 1 + POL.head * band((q - 0.7) / 0.27);
      who = H.hero;
    }
  }
  return { lv, head, mul: lv * head, level, who, q };
}
/** 方針 1 つの効き目（種類 → 値。強さを掛けたもの） */
export function polFxOf(s: P1State, p: PolicyDef): { k: PolFxKind; base: number; v: number }[] {
  const m = polPower(s, p).mul;
  return p.fx.map((f) => ({ k: f.k, base: f.v, v: f.v * m }));
}

/** 効き目のキャッシュ（日・方針の版・パネルの数とレベルで作り直す） */
let epoch = 0;
/** 方針・部長が変わった（効き目のキャッシュを作り直す） */
export const polTouch = () => {
  epoch++;
};
type FxHit = { day: number; ep: number; ns: number; nst: number; corp: unknown; dept: unknown; nt: number; lv: unknown; sums: Partial<Record<PolFxKind, number>> };
const fxCache = new WeakMap<object, FxHit>();
const NO_POL: Pick<PolState, 'corp' | 'dept'> = { corp: ['balance'], dept: {} };
/** 効いているか（チュートリアルのあいだ・止めたときは効かない。部分の写し＝スキルだけの見積もりは 0） */
const live = (s: Partial<P1State>): s is P1State => !POL_OFF.on && !!s.staff && !!s.flags && Array.isArray(s.reports) && growthOn(s as P1State);
/** 経営方針の効き目の合計（その種類）。model.ts の fxSum・hr.ts・cs.ts・budget.ts が使う */
export function polFx(s: Partial<P1State>, k: PolFxKind): number {
  if (!live(s)) return 0;
  const P = s.pol ?? (s.policy ? polOf(s) : NO_POL);
  const hit = fxCache.get(s);
  if (hit && hit.day === s.day && hit.ep === epoch && hit.ns === s.skills.length && hit.nst === s.staff.length && hit.corp === P.corp && hit.dept === P.dept && hit.nt === (s.tablets ?? []).length && hit.lv === s.skillLv) return hit.sums[k] ?? 0;
  const sums: Partial<Record<PolFxKind, number>> = {};
  for (const p of activePolicies(s)) for (const f of polFxOf(s, p)) sums[f.k] = (sums[f.k] ?? 0) + f.v;
  fxCache.set(s, { day: s.day, ep: epoch, ns: s.skills.length, nst: s.staff.length, corp: P.corp, dept: P.dept, nt: (s.tablets ?? []).length, lv: s.skillLv, sums });
  return sums[k] ?? 0;
}

// ---------------------------------------------------------------- 推奨の重み・提案の傾向

/** 方針の重み（段 UI7c）：選んだ全社方針と、その部門の事業別の方針（あれば）の重みの平均 */
export function weightsOf(s: P1State, d?: DeptId | null): Record<ValueKey, number> {
  if (POL_OFF.on) return POLICY_OF[policyOf(s)].w;
  const xs = corpOf(s).map((id) => POLICY_OF[id].w);
  const dp = d ? deptPolicyOf(s, d) : null;
  if (dp) xs.push(POLICY_OF[dp].w);
  const out = { short: 0, long: 0, morale: 0, sat: 0, brand: 0, rp: 0 } as Record<ValueKey, number>;
  for (const w of xs) for (const k of Object.keys(out) as ValueKey[]) out[k] += w[k] / xs.length;
  return out;
}
/** 方針の推す提案の種類（全社方針 ＋ その部門の事業別の方針） */
export function themesOf(s: P1State, d?: DeptId | null): Set<PolTheme> {
  const out = new Set<PolTheme>();
  if (POL_OFF.on) return out;
  for (const id of corpOf(s)) for (const x of POLICY_OF[id].themes) out.add(x);
  const dp = d ? deptPolicyOf(s, d) : null;
  if (dp) for (const x of POLICY_OF[dp].themes) out.add(x);
  return out;
}
/** 提案の出やすさ・並びの重み：方針の推す種類なら × (1 + POL.tilt)、ほかは 1 */
export const tiltOf = (s: P1State, theme: PolTheme | null | undefined, d?: DeptId | null) => (theme && themesOf(s, d).has(theme) ? 1 + POL.tilt : 1);

// ---------------------------------------------------------------- 経営方針発表会（段 I2 の年初の経営会議）

/** 発表会を開く会議か：その会社の年に、まだ発表会を開いていない（年初の回。年の途中で初めて会議が開いたときはその回） */
export const presDue = (s: P1State, a: Pick<BoardAgenda, 'q'>) => !POL_OFF.on && !BOARD_OFF.on && yearOfBoard(a) > (s.pol?.year ?? 0);
/** 方針を選べる部門（開いている事業別の方針がある部門。並びは部門の順） */
export const presDepts = (s: P1State): DeptId[] => DEPTS.map((d) => d.id).filter((d) => openPolicies(s, 'dept', d).length > 0);
/**
 * 全社方針の推奨（自動プレイの標準）：いまの方針をそのまま残し、空いた枠は開いた順に埋める（はじめはバランス）
 */
export function recCorp(s: P1State): string[] {
  const out = corpOf(s);
  const n = slotsOf(s);
  for (const id of polOf(s).got) {
    if (out.length >= n) break;
    if (POLICY_OF[id]?.kind === 'corp' && isOpen(s, id) && !out.includes(id)) out.push(id);
  }
  return out;
}
/** 全社方針の重みと、事業別の方針の重みの近さ（推奨の決め手） */
function fit(corp: string[], p: PolicyDef): number {
  let v = 0;
  for (const id of corp) for (const k of Object.keys(p.w) as ValueKey[]) v += POLICY_OF[id].w[k] * p.w[k];
  return v;
}
/**
 * 事業別の方針の推奨（部長の推奨・自動プレイの標準）：いまの方針があればそのまま。無ければ、全社方針の重みにいちばん合うもの（同じなら表の順）
 */
export function recDept(s: P1State, d: DeptId, corp: string[] = corpOf(s)): string | null {
  const cur = deptPolicyOf(s, d);
  const xs = openPolicies(s, 'dept', d);
  if (!xs.length) return null;
  if (cur) return cur;
  return [...xs].sort((a, b) => fit(corp, b) - fit(corp, a))[0].id;
}
/** 発表会の途中の選び（その会議のもの。無ければ作る） */
export function presOf(s: P1State, a: Pick<BoardAgenda, 'q'>): NonNullable<PolState['pres']> {
  const P = polOf(s);
  if (!P.pres || P.pres.q !== a.q) P.pres = { q: a.q, dept: {} };
  return P.pres;
}
/** 発表会で選んだ全社方針（決めていなければ推奨） */
export const presCorp = (s: P1State, a: Pick<BoardAgenda, 'q'>) => presOf(s, a).corp ?? recCorp(s);
/** 発表会で部門の方針を選ぶ（部長の発表を承認・別の方針を指示） */
export function presPickDept(s: P1State, a: Pick<BoardAgenda, 'q'>, d: DeptId, id: string) {
  if (POLICY_OF[id]?.kind === 'dept' && POLICY_OF[id].dept === d && isOpen(s, id)) presOf(s, a).dept[d] = id;
}
/** 発表会で全社方針を選ぶ */
export function presPickCorp(s: P1State, a: Pick<BoardAgenda, 'q'>, ids: string[]) {
  const xs = [...new Set(ids)].filter((id) => POLICY_OF[id]?.kind === 'corp' && isOpen(s, id)).slice(0, slotsOf(s));
  if (xs.length) presOf(s, a).corp = xs;
}
/** 部長の推奨（発表会のその部門。全社方針は発表会で選んだもの） */
export const presRec = (s: P1State, a: Pick<BoardAgenda, 'q'>, d: DeptId) => recDept(s, d, presCorp(s, a));
/**
 * 発表会を締める（board.ts の boardFinish が、どの閉じ方でも BOARD_FINISH_HOOKS の前に呼ぶ）：選んだもの（選んでいなければ推奨）で、全社方針と事業別の方針を決める
 */
export function presFinish(s: P1State, a: BoardAgenda): void {
  if (!presDue(s, a)) return;
  const P = polOf(s);
  const pr = P.pres?.q === a.q ? P.pres : null;
  const corp = pr?.corp ?? recCorp(s);
  setCorp(s, corp, true);
  let changed = 0;
  for (const d of presDepts(s)) {
    const rec = recDept(s, d, corp);
    const id = pr?.dept[d] ?? rec;
    if (id && id !== rec) changed++;
    if (id) setDept(s, d, id, true);
  }
  P.year = yearOfBoard(a);
  delete P.pres;
  P.stat = { held: (P.stat?.held ?? 0) + 1, changed: (P.stat?.changed ?? 0) + changed };
}
/**
 * 自動プレイの標準の選び方（会議の外）：空いた枠を開いた順に埋め、方針の無い部門は推奨で（会議の前も、あとも「空いたところを埋める」だけ）
 */
export function polAutoFill(s: P1State): void {
  if (POL_OFF.on) return;
  polSync(s);
  const want = recCorp(s);
  if (want.join() !== corpOf(s).join()) setCorp(s, want);
  for (const d of presDepts(s)) if (!deptPolicyOf(s, d)) setDept(s, d, recDept(s, d));
}

// ---------------------------------------------------------------- 画面の文

/** 名前（アイコンつきは icon） */
export const policyName = (id: string) => POLICY_OF[id]?.name ?? id;
/** 段 UI7c の画面（7 つの価値観）の名前・アイコン・一言 */
export const POLICY_TEXT: Record<string, { icon: string; name: () => string; note: () => string }> = Object.fromEntries(POLICIES.map((p) => [p.id, { icon: p.icon, name: () => p.name, note: () => p.note }]));
const pc = (v: number) => {
  const x = Math.round(v * 1000) / 10;
  return `${x % 1 ? x.toFixed(1) : x}%`;
};
const num = (v: number) => (Math.round(v * 10) / 10).toString();
/** 効き目の名前 */
export function fxName(k: PolFxKind): string {
  if (k === 'morale') return t('全員の士気の目指す値', 'Everyone’s morale target');
  if (k === 'rp') return t('入る研究ポイント', 'Research points earned');
  if (k === 'sat') return t('返事で上がる顧客満足度', 'Satisfaction gained from replies');
  if (k === 'labor') return t('部長の施策に使える労力', 'Labor for heads’ moves');
  return FX_LABEL[k];
}
/** 効き目の値の文（+3%・−4%・+2） */
export function fxVal(k: PolFxKind, v: number): string {
  const count = k === 'morale' || k === 'apt' || k === 'brand';
  const down = (FX_DOWN as string[]).includes(k);
  return `${down ? '−' : '+'}${count ? num(v) : pc(v)}`;
}
/** 効き目の 1 行（「需要 +2.6%」） */
export const fxLine = (k: PolFxKind, v: number) => `${fxName(k)} ${fxVal(k, v)}`;
/** 方針の効き目の一言（基本の値） */
export const baseFxText = (p: PolicyDef) => p.fx.map((f) => fxLine(f.k, f.v)).join(t('・', ', '));
const TIER_NAME: Record<string, string> = { c: 'Common', u: 'Uncommon', r: 'Rare', e: 'Epic' };
/** 開く条件の文（未開放のとき。石板の場所は町のランクまで） */
export function openText(s: P1State, p: PolicyDef): string {
  const o = p.open;
  if (o.k === 'start') return t('はじめから', 'From the start');
  if (o.k === 'panel') {
    const k = SKILL[o.id];
    return t(`スキルツリー：${DEPT[p.dept].name}の「${k?.name ?? o.id}」（理解度 ${k?.deptLv ?? 0}）`, `Skill tree: ${DEPT[p.dept].name} “${k?.name ?? o.id}” (understanding ${k?.deptLv ?? 0})`);
  }
  const tier = TIER_NAME[TABLET[o.ids[0]]?.sector?.[0] ?? 'c'] ?? 'Common';
  const n = o.ids.length;
  const got = tabletsRead(s, p);
  return n > 1 ? t(`${tier} の町の石板 ${n} 枚（${got} / ${n} 枚 読んだ）`, `${n} tablets in a ${tier} town (${got} / ${n} read)`) : t(`${tier} の町の石板`, `A tablet in a ${tier} town`);
}
/** 石板のノウハウの文（研究ノート・読み物の窓）：一節と、開いた方針（2 枚で 1 つの前半は「あと 1 枚」） */
export function tabletKnow(s: Pick<P1State, 'tablets'>, tab: string): { know: string; line: string; open: boolean; policy: PolicyDef } | null {
  const p = policyOfTablet(tab);
  const know = TABLET_KNOW[tab];
  if (!p || !know) return null;
  const ids = p.open.k === 'tablet' ? p.open.ids : [];
  const open = ids.every((x) => (s.tablets ?? []).includes(x));
  const kind = p.kind === 'corp' ? t('全社方針', 'company policy') : t(`${DEPT[p.dept].name}の事業別の方針`, `${DEPT[p.dept].name} policy`);
  const line = open ? t(`📜 ${kind}「${p.name}」が選べるようになった`, `📜 You can now choose the ${kind} “${p.name}”`) : t(`📜 ${kind}「${p.name}」のノウハウの片方。同じ町のもう 1 枚で選べるようになる`, `📜 Half of the know-how for the ${kind} “${p.name}”. The other tablet in this town completes it`);
  return { know, line, open, policy: p };
}
/** マインちゃんの一言（初めて石板のノウハウを読んだとき・初めて全社方針の枠が増えたとき。60 字まで） */
export const KNOW_TALK = () => [t('石板には、昔の Lime の[[運営のノウハウ]]も刻まれていたんだ！ 読むと[[経営方針]]が増えるよ。', 'The tablets also hold old Lime’s [[know-how]]! Reading them adds [[management policies]].'), t('選べる方針は、経営企画の[[受け箱]]の上の「経営方針」で見られるよ。', 'See your policies under Strategy → [[Inbox]] → “Management policy”.')];
/** 段 K2：初めて「全社方針の枠 +1」が受け取れるようになったとき（段 K の「初めて枠が増えたとき」の一言をまとめた） */
export const SLOT_TALK = (n: number) => [t(`社長、全社方針をもう 1 つ掲げられます！ 進出の特典で[[枠 +1]]が無償で受け取れるよ。`, `Chief, you can raise one more company policy! Expanding earned a free [[+1 slot]].`), t(`方針の画面で受け取ると[[ ${n} 枠]]に。方針を組み合わせると効き目が重なるの。`, `Claim it on the policy screen for [[${n} slots]]. Policies stack their effects.`)];

/** マインちゃんが方針を聞く時期：チュートリアルのあと・まだ聞いていない（最初の提案書を開くとき） */
export const askDue = (s: P1State) => !s.flags.policyAsked && !(typeof s.tut === 'number' && s.tut < 99);
/** マインちゃんの一言（1 回だけ） */
export const askLine = () => t('社長、提案を判断する前に 1 つだけ。社長は何をいちばん大事にしますか？ 推奨の出し方がこれで変わります（あとで経営企画の「受け箱」から変えられます）。', 'Chief, one thing before you judge proposals: what matters most to you? It shapes my recommendations (change it later under Strategy → Inbox).');
/** 段 UI7c の 7 つ（マインちゃんが聞くとき） */
export const START_IDS = POLICY.ids;
