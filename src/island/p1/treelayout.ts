/**
 * スキルツリーの配置（DOM なし。tree.ts とテストが使う）。
 * 段 B（部門の土台）：本社から 11 本の部門の枝。枝の角度の幅は、その部門のパネルが収まる幅（内側の段・外周の段のどれもが隣の枝と重ならない幅）
 * に、残りの角度をパネルの数に応じて足して決める。パネルの無い部門（営業・カスタマーサポート・法務・経理）は細い枝で、鍵の札だけ。
 * 物流の枝は、もとの 5 本（④ 販売の売り場の運営・③ 運搬・② 製造・技・① 調達）を小さな束（グループ）として並べる。
 * 内側（Common）の段を根もとから外へ、外周（U・R・E・L）は前と同じ半径の同心円に並べる。
 * docs/ISLAND_PHASE1.md「スキルツリー」「部門」。
 */
import { t } from '../../i18n';
import { DEPTS, DEPT_SKILLS, SKILLS, deptOf, type Branch, type DeptId, type Skill, type Tier } from './data';
import { ROW_CAP } from './skillsx';

/** スキルのランク（外周）。無ければ C */
const tierOf = (k: { tier?: Tier }): Tier => k.tier ?? 'C';

export const UNIT = 96;
/**
 * パネルの大きさ（単位：UNIT）：どのパネルも同じ大きさのひし形（正方形を 45° 回す）。PANEL はひし形の外接の幅（角から角まで。64px）。
 * 中のアイコンは正立のまま、ひし形の内側に収まる正方形（幅の半分＝32px。64×64 のエクステの絵はちょうど 1/2）
 */
export const PANEL = 2 / 3;
/** 内側（Common）の段：1 段目の半径・段の間・パネルの間（弧の長さ）。パネルのすき間はひし形の幅の 0.8〜1 枚分 */
export const R0 = 3.6;
export const STEP = 1.3;
export const GAP = 1.22;
/** 枝の根もと（ハブ。部門の名前と理解度の札）の距離。隣の札と近い枝は少し外へずらす（hubR） */
export const HUB = 1.55;
/** 札の大きさ（単位：UNIT。1 行の札「物流 12」）。隣の札と重なるときは外へ（HUB2） */
export const HUB_BOX = { w: 0.82, h: 0.34 };
export const HUB2 = 2.05;
/** 物流のように束（グループ）が複数ある部門：束の根もと（小さな節）の距離 */
export const KNOT = 2.1;
/** 大きめの研究パネル（以前の ✨）・研究への寄付：根もとの近く（束の向きから少し横へ） */
export const DUST_R = 2.6;
/** 根もとの近くのパネルの、束の向きからのずれ（ラジアン。0.15〜DUST_A のうち、ほかのパネル・札からいちばん離れる所） */
export const DUST_A = 0.32;
/** パネルの無い部門の枝の札の距離（細い枝の先。隣どうしは互い違い） */
export const EMPTY_R = [4.7, 6.3];
/** パネルの無い部門の枝の幅（ラジアン） */
export const EMPTY_W = 0.2;
/** 隣の枝のパネルとのすき間（弧の長さ。ひし形どうしの中心の距離がひし形の幅の 1.6 倍を超える） */
const EDGE_PAD = 1.08;
/** もとの 8 本の枝の幅（度）。外周の段の半径は、ROW_CAP 枚がこの幅に収まる大きさから（前と同じ半径） */
export const WEDGE = 41.75;

/** 物流の枝の真ん中の向き（度）。札が横に並ぶ下側に、間の狭い部門が来ないように */
export const LOGI_AT = -168;
/** 物流の枝の中の束（もとの枝）。並びは角度の順（マーケの側から） */
const LOGI_ORDER: Branch[] = ['shop', 'logi', 'craft', 'tech', 'buy'];
/** 束の名前（詳細カードの「（物流・② 製造）」） */
export const GROUP_STAGE: Partial<Record<Branch, string>> = {
  shop: t('④ 販売', '④ Sell'),
  logi: t('③ 運搬', '③ Haul'),
  craft: t('② 製造', '② Craft'),
  tech: t('技', 'Crafts'),
  buy: t('① 調達', '① Buy'),
};
/**
 * 内側（Common）の段（根もとから外へ。束ごと）。並べ忘れは UNPLACED（テストで 0 件）。
 * 段の中の並びは、角度の小さい側（反時計回り）から
 */
const INNER: Record<string, string[][]> = {
  // マーケの 1 段目は、もとの経営の枝の大きめの研究パネル（ブランド戦略室。先に要るものが無い）
  marketing: [['d_ops'], ['vmd', 'pop'], ['golden', 'point'], ['set']],
  'logistics:shop': [['host'], ['display', 'shop2'], ['hours', 'shop3']],
  'logistics:logi': [['loading'], ['shortcut', 'timetable'], ['route_opt', 'hub']],
  'logistics:craft': [['jig'], ['pot', 'five_s'], ['jig2', 'lot'], ['kaizen', 'chair']],
  'logistics:tech': [['t_wood'], ['t_paper', 't_metal'], ['t_clay', 't_glass'], ['t_textile', 't_jewel', 't_master']],
  'logistics:buy': [['stock1'], ['bulk', 'route_cloth'], ['abc', 'swift', 'route_paper'], ['bulk2', 'stock2', 'eye', 'scoutmap'], ['stock3', 'route_gem']],
  systems: [['pos'], ['auto_order', 'inventory']],
  rnd: [['dig_ext'], ['dig_power', 'dig_lamp'], ['dig_speed', 'dig_office', 'dig_deep'], ['dig_reach', 'dig_crew', 'dig_blast'], ['dig_study', 'dig_drill']],
  hr: [['hire'], ['manual', 'slots'], ['ojt', 'incentive']],
  general: [['lounge'], ['shift'], ['welfare']],
  strategy: [['pace1'], ['budget', 'pace2'], ['pdca']],
};

/** 部門の枝の中の束（物流は 5 つ、ほかは 1 つ。パネルの無い部門は 0） */
export interface Group {
  key: string;
  dept: DeptId;
  branch?: Branch;
  /** 束の向き（ラジアン）と幅 */
  a: number;
  w: number;
  skills: Skill[];
}
export interface DeptLayout {
  /** 枝の向き（度。0 = 右、90 = 下）・幅（ラジアン）・色 */
  angle: number;
  w: number;
  color: string;
  groups: Group[];
  /** 根もとの札の距離 */
  hubR: number;
}

/**
 * 外周（ランクのエリア）：束ごとに、そのランクのパネルを内側の段から外へ、段の半径で入るだけ並べる（Common の内側と同じ流儀）。
 * 段の数と半径は前の 9 本の枝のときと同じ（もとの枝ごとの ROW_CAP 枚で数える）。ランクのあいだに境目の円（RING_EDGE）。
 */
export const OUTER: Tier[] = ['U', 'R', 'E', 'L'];
/** ランクごとの段の半径（内側から） */
export const RING_ROWS = {} as Record<Tier, number[]>;
/** ランクのいちばん内側の段（RING_R）と、いちばん外の段（RING_OUT）・境目の円（RING_EDGE） */
export const RING_R = { C: 0 } as Record<Tier, number>;
export const RING_OUT = { C: R0 + STEP * (Math.max(...Object.values(INNER).map((x) => x.length)) - 1) } as Record<Tier, number>;
export const RING_EDGE = { C: 0 } as Record<Tier, number>;
/** 外周のパネルの並び（既存のパネル → 追加のパネル → 大きめの研究パネル） */
/**
 * 外周の並びの入れ替え（id → 並びの何番目に置くか）。根もとから線が伸びるパネル（先に要るものが無い）を、
 * 内側のパネルを横切らない場所へ
 */
const OUTER_AT: Record<string, number> = { u_dig_mat: 3 };
function outerOf(list: Skill[], tier: Tier): Skill[] {
  const out = [...list.filter((k) => tierOf(k) === tier && !k.big && !k.donate), ...list.filter((k) => tierOf(k) === tier && k.big)];
  for (const [id, at] of Object.entries(OUTER_AT)) {
    const i = out.findIndex((k) => k.id === id);
    if (i >= 0) out.splice(at, 0, ...out.splice(i, 1));
  }
  return out;
}
{
  // 段の数は、もとの 9 本の枝（発掘は 1 段 3 枚）で数える（半径を前と変えない）
  const OLD_BR: Branch[] = ['shop', 'craft', 'logi', 'buy', 'people', 'ops', 'sys', 'tech', 'dig'];
  let r = 9.0;
  const SPAN = (WEDGE * Math.PI) / 180;
  for (const tier of OUTER) {
    const cap = ROW_CAP[tier as Exclude<Tier, 'C'>];
    r = Math.max(r, (GAP * (cap - 1) + 1.15) / SPAN);
    const rows = Math.max(1, ...OLD_BR.map((br) => Math.ceil(outerOf(SKILLS.filter((k) => k.branch === br), tier).length / (br === 'dig' ? 3 : cap))));
    RING_EDGE[tier] = r - 0.85;
    RING_R[tier] = r;
    RING_ROWS[tier] = Array.from({ length: rows }, (_, k) => r + STEP * k);
    RING_OUT[tier] = RING_ROWS[tier][rows - 1];
    r = RING_OUT[tier] + 1.6;
  }
}
export const polar = (a: number, r: number) => ({ x: Math.cos(a) * r, y: Math.sin(a) * r });
/** 幅 w の束の、半径 r の段に並べられる枚数 */
const capAt = (w: number, r: number) => Math.max(1, Math.floor((w * r - EDGE_PAD) / GAP + 1e-9) + 1);
/** 束に要る幅（内側の段・外周の各ランクの段のどれもが収まる） */
function needOf(key: string, list: Skill[]): number {
  let w = 0;
  (INNER[key] ?? []).forEach((ids, k) => {
    if (ids.length) w = Math.max(w, (GAP * (ids.length - 1) + EDGE_PAD) / (R0 + STEP * k));
  });
  // 大きめの研究パネル（根もとの近く）
  if (list.some((k) => tierOf(k) === 'C' && (k.big || k.donate) && !Object.values(INNER).flat(2).includes(k.id))) w = Math.max(w, EDGE_PAD / DUST_R);
  for (const tier of OUTER) {
    const n = outerOf(list, tier).length;
    if (!n) continue;
    let lo = w;
    while (RING_ROWS[tier].reduce((a, r) => a + capAt(lo, r), 0) < n) lo += 0.005;
    w = Math.max(w, lo);
  }
  return w;
}

/** 部門の枝の配置 */
export const DEPT_LAYOUT = {} as Record<DeptId, DeptLayout>;
export const GROUPS: Group[] = [];
const GROUP_OF = new Map<string, Group>();
/** 枝の幅の余り（パネルの数に応じて足した角度の合計。テスト用：0 以上） */
export let SLACK = 0;
{
  const items: { d: DeptId; g: Group | null; need: number; n: number }[] = [];
  for (const d of DEPTS) {
    const list = DEPT_SKILLS[d.id];
    if (!list.length) {
      items.push({ d: d.id, g: null, need: EMPTY_W, n: 0 });
      continue;
    }
    const parts: [string, Branch | undefined, Skill[]][] = d.id === 'logistics' ? LOGI_ORDER.map((b) => [`logistics:${b}`, b, list.filter((k) => k.branch === b)]) : [[d.id, undefined, list]];
    for (const [key, branch, skills] of parts) {
      const g: Group = { key, dept: d.id, branch, a: 0, w: 0, skills };
      // 営業（段 C。Rare の外周だけ）は、収まる幅だけ（余りの角度を取らない＝ほかの枝の幅を前と変えない）
      items.push({ d: d.id, g, need: needOf(key, skills), n: d.id === 'sales' ? 0 : skills.length });
    }
  }
  // 段 C：営業の枝（パネルの無い細い枝だったもの）が広がったぶんは、ほかのパネルの無い部門の枝から分けてもらう
  // （パネルのある部門の枝の幅・角度を前と変えない）
  const sales = items.find((x) => x.d === 'sales' && x.g);
  const empty = items.filter((x) => !x.g);
  if (sales && empty.length) for (const x of empty) x.need = Math.max(0.08, EMPTY_W - (sales.need - EMPTY_W) / empty.length);
  const total = items.reduce((a, x) => a + x.need, 0);
  SLACK = Math.PI * 2 - total;
  const nAll = items.reduce((a, x) => a + x.n, 0);
  // 物流の真ん中が左（LOGI_AT）に来るように回す
  let a = 0;
  for (const x of items) {
    const w = x.need + (Math.max(0, SLACK) * x.n) / nAll;
    if (x.g) {
      x.g.a = a + w / 2;
      x.g.w = w;
      GROUPS.push(x.g);
      GROUP_OF.set(x.g.key, x.g);
    }
    const L = (DEPT_LAYOUT[x.d] ??= { angle: 0, w: 0, color: DEPTS.find((y) => y.id === x.d)!.color, groups: [], hubR: HUB });
    if (!L.w) L.angle = a;
    L.w += w;
    if (x.g) L.groups.push(x.g);
    a += w;
  }
  const logi = DEPT_LAYOUT.logistics;
  const rot = (LOGI_AT * Math.PI) / 180 - (logi.angle + logi.w / 2);
  for (const g of GROUPS) g.a += rot;
  for (const L of Object.values(DEPT_LAYOUT)) L.angle = ((L.angle + L.w / 2 + rot) * 180) / Math.PI;
  // パネルの無い部門は、細い枝の先に札（隣どうしは互い違いの距離）
  let k = 0;
  for (const d of DEPTS) {
    const L = DEPT_LAYOUT[d.id];
    if (!L.groups.length) L.hubR = EMPTY_R[k++ % 2];
    else k = 0;
  }
  // 札どうしが重なる（隣の枝の根もとの札と、札の箱が重なる）ときは、少し外へ（HUB2）
  const ids = DEPTS.map((d) => d.id);
  const boxAt = (d: DeptId, r: number) => polar(((DEPT_LAYOUT[d].angle * Math.PI) / 180), r);
  const clash = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) < HUB_BOX.w + 0.06 && Math.abs(a.y - b.y) < HUB_BOX.h + 0.06;
  for (let i = 0; i < ids.length; i++) {
    const L = DEPT_LAYOUT[ids[i]];
    if (!L.groups.length) continue;
    // ひとつ前の、パネルのある部門（あいだのパネルの無い部門は細い枝なので、その先の札とも重なりうる。段 C の営業とシステム）
    let P = ids[(i + ids.length - 1) % ids.length];
    for (let k = 1; k < ids.length && !DEPT_LAYOUT[P].groups.length; k++) P = ids[(i + ids.length - 1 - k) % ids.length];
    if (P === ids[i] || DEPT_LAYOUT[P].hubR !== HUB || !clash(boxAt(ids[i], HUB), boxAt(P, HUB))) continue;
    // 外へずらすのは、根もとの近くに大きめの研究パネルが無いほう
    const bigAt = (d: DeptId) => DEPT_SKILLS[d].some((k) => tierOf(k) === 'C' && (k.big || k.donate));
    if (bigAt(ids[i]) && !bigAt(P)) DEPT_LAYOUT[P].hubR = HUB2;
    else L.hubR = HUB2;
  }
}
/** 部門の枝の真ん中の向き（ラジアン） */
export const deptAngle = (d: DeptId) => (DEPT_LAYOUT[d].angle * Math.PI) / 180;
/** パネルの束 */
export const groupOf = (id: string) => GROUP_BY_ID.get(id) ?? null;
const GROUP_BY_ID = new Map<string, Group>();
for (const g of GROUPS) for (const k of g.skills) GROUP_BY_ID.set(k.id, g);
/** もとの枝（SCM ダッシュボードの「スキルツリーで見る」）の束 */
export const groupOfBranch = (br: string) => GROUPS.find((g) => g.branch === br) ?? GROUPS.find((g) => g.skills.some((k) => k.branch === br)) ?? null;

/** エリアの札を置く向き（パネルの無い部門の枝：営業とカスタマーサポートのあいだ） */
export const LABEL_A = (deptAngle('sales') + deptAngle('support')) / 2;
/** 木の上の位置（単位：UNIT）。本社が (0, 0) */
export const POS = new Map<string, { x: number; y: number }>();
/** 部門の根もとの札 */
export const HUBPOS = new Map<DeptId, { x: number; y: number }>();
/** 束の根もとの節（物流のように束が複数ある部門だけ） */
export const KNOTPOS = new Map<string, { x: number; y: number }>();
for (const d of DEPTS) {
  const L = DEPT_LAYOUT[d.id];
  HUBPOS.set(d.id, polar(deptAngle(d.id), L.hubR));
  for (const g of L.groups) {
    if (L.groups.length > 1) KNOTPOS.set(g.key, polar(g.a, KNOT));
    const row = (ids: string[], r: number) => ids.forEach((id, i) => POS.set(id, polar(g.a + ((i - (ids.length - 1) / 2) * GAP) / r, r)));
    (INNER[g.key] ?? []).forEach((ids, k) => row(ids, R0 + STEP * k));
    for (const tier of OUTER) {
      const ids = outerOf(g.skills, tier).map((k) => k.id);
      let at = 0;
      for (const r of RING_ROWS[tier]) {
        const c = capAt(g.w, r);
        row(ids.slice(at, at + c), r);
        at += c;
      }
    }
  }
}
// 大きめの研究パネル・研究への寄付：根もとの近くの横（束の向きから左右どちらか。ほかのパネル・札からいちばん離れる側）
// （先に置いた枝の側に寄らないように、3 回置き直す。内側の段に並べたものは除く）
const INNER_IDS = new Set(Object.values(INNER).flat(2));
for (let pass = 0; pass < 3; pass++)
  for (const g of GROUPS)
    for (const k of g.skills) {
      if (!((k.big || k.donate) && tierOf(k) === 'C') || INNER_IDS.has(k.id)) continue;
      POS.delete(k.id);
      const far = (p: { x: number; y: number }) => Math.min(...[...POS.values(), ...HUBPOS.values(), ...KNOTPOS.values()].map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
      const cand: number[] = [];
      for (let d = 0.15; d <= DUST_A + 1e-9; d += 0.01) cand.push(d, -d);
      POS.set(k.id, cand.map((d) => polar(g.a + d, DUST_R)).sort((a, b) => far(b) - far(a))[0]);
    }
// 並べ忘れたスキルは、本社に（テストで 0 件を確かめる）
export const UNPLACED = SKILLS.filter((k) => !POS.has(k.id)).map((k) => k.id);
for (const id of UNPLACED) POS.set(id, { x: 0, y: 0 });
/** パネルの位置（テスト用：重なっていないか） */
export const treePos = (id: string) => POS.get(id) ?? null;

/**
 * つながりの線：from（先に要るパネル。null は束の根もと＝ハブか節）→ to。先に要るものが無ければ根もとから。
 * 封印（sealed）は、ひとつ内側の外周のまんなかのパネル（無ければ根もと）から。
 * br は線の先（to）の部門・g はその束（根もとの位置と色）。部門をまたぐ線（販売 → マーケなど）もある
 */
export type TreeEdge = { from: string | null; to: string; br: DeptId; g: string };
export const EDGES: TreeEdge[] = [];
for (const g of GROUPS) {
  for (const k of g.skills) {
    const br = deptOf(k);
    if (k.sealed) {
      const tier = tierOf(k);
      const inner = g.skills.filter((x) => !x.big && OUTER.indexOf(tierOf(x)) === OUTER.indexOf(tier) - 1);
      EDGES.push({ from: inner.length ? inner[Math.floor(inner.length / 2)].id : null, to: k.id, br, g: g.key });
      continue;
    }
    if (k.requires?.length) for (const r of k.requires) EDGES.push({ from: r, to: k.id, br, g: g.key });
    else EDGES.push({ from: null, to: k.id, br, g: g.key });
  }
}
/** 束の根もと（節があれば節、無ければ部門の札） */
export const rootOf = (g: string) => KNOTPOS.get(g) ?? HUBPOS.get(GROUP_OF.get(g)?.dept ?? (g as DeptId))!;
/** 線の端の位置（木の上。null は束の根もと） */
export const edgeEnd = (id: string | null, g: string) => (id ? POS.get(id)! : rootOf(g));
/**
 * 線をパネルのひし形の縁で切る：中心 c から向き (ux, uy) に進んで、ひし形（L1 の半径 r）の縁に着くまでの距離。
 * ひし形は |x| + |y| ≤ r なので、r / (|ux| + |uy|)
 */
export const rimDist = (ux: number, uy: number, r = PANEL / 2) => r / Math.max(1e-6, Math.abs(ux) + Math.abs(uy));
/**
 * 線が、ほかのパネルの上を横切るときは、ゆるい弧にする（曲げる量。単位：UNIT。正は進む向きの左）。
 * 横切るパネルが無ければ 0。どちらに曲げても横切るなら、横切るパネルが少ない側
 */
export function edgeBend(a: { x: number; y: number }, b: { x: number; y: number }, skip: (id: string) => boolean): number {
  // 近くのパネルだけ調べる（弧が膨らむぶん＋ひし形の半分の外は見ない）
  const pad = 1.6 + PANEL;
  const near = [...POS].filter(([id, p]) => !skip(id) && p.x > Math.min(a.x, b.x) - pad && p.x < Math.max(a.x, b.x) + pad && p.y > Math.min(a.y, b.y) - pad && p.y < Math.max(a.y, b.y) + pad);
  const hits = (bend: number) => near.filter(([, p]) => curveNear(a, b, bend, p, PANEL / 2 + 0.06)).length;
  let bestN = hits(0);
  if (!bestN) return 0;
  // 小さい曲げから順に（同じ数なら曲げの小さいほう）。左右を交互に
  let best = 0;
  for (let k = 1; k <= 16 && bestN; k++)
    for (const m of [k * 0.1, -k * 0.1]) {
      const n = hits(m);
      if (n < bestN) {
        best = m;
        bestN = n;
        if (!n) break;
      }
    }
  return Math.round(best * 10) / 10;
}
let bends: Map<TreeEdge, number> | null = null;
/** どの線をどれだけ曲げるか（配置は変わらないので、はじめて使うときに 1 回だけ数える） */
export function edgeBends(): Map<TreeEdge, number> {
  if (bends) return bends;
  bends = new Map();
  for (const e of EDGES) {
    const m = edgeBend(edgeEnd(e.from, e.g), edgeEnd(e.to, e.g), (id) => id === e.from || id === e.to);
    if (m) bends.set(e, m);
  }
  return bends;
}
/** 弧（2 次ベジェ。制御点は真ん中から横へ bend×2）の上の点 */
export function curveAt(a: { x: number; y: number }, b: { x: number; y: number }, bend: number, t: number) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const cx = (a.x + b.x) / 2 + nx * bend * 2;
  const cy = (a.y + b.y) / 2 + ny * bend * 2;
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y, cx, cy };
}
/** 弧が、点 p のひし形（L1 の半径 r）に入るか */
export function curveNear(a: { x: number; y: number }, b: { x: number; y: number }, bend: number, p: { x: number; y: number }, r: number) {
  for (let i = 1; i < 60; i++) {
    const q = curveAt(a, b, bend, i / 60);
    if (Math.abs(q.x - p.x) + Math.abs(q.y - p.y) < r) return true;
  }
  return false;
}

export const BOUNDS = [...POS.values()].reduce((b, p) => ({ x0: Math.min(b.x0, p.x), x1: Math.max(b.x1, p.x), y0: Math.min(b.y0, p.y), y1: Math.max(b.y1, p.y) }), { x0: 0, x1: 0, y0: 0, y1: 0 });
