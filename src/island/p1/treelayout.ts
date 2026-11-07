/**
 * スキルツリーの配置（DOM なし。tree.ts・テスト・scripts/island/treeopt.ts が使う）。段 ST1：上から下へ流れる形。
 *
 * - いちばん上に本社。その下に部門の列を左から右へ（DEPTS の順＝下の帯のタブの並び：マーケ・物流・営業・CS・システム・R&D・法務・人事・総務・経理・経営企画）。
 *   物流は 5 つの束（④ 販売・③ 運搬・② 製造・技・① 調達）を、列の中の小さな列（レーン）として並べる。ほかの部門は 1 レーン。
 * - 縦はランクの帯（Common・Uncommon・Rare・Epic・Legendary。BANDS）。帯の中は、前提の深さ（同じ帯の中の「先に要る」の最長の段数）の順に下へ。
 *   1 段に CAP 枚を超えるときは、段を分けて下へ積む（前提の深さの順は崩さない）。帯の高さは、どのレーンでもそろえる（帯の境の横線と札）。
 * - 線はどれも上から下へ（先に要るパネル → パネル）。2 段以上をまたぐ線は、あいだの段に「通り道」（DUMMY_W の幅の空き）を取って、パネルの下を通らない。
 *   線の形は、通る点を縦の向きのなめらかな曲線（3 次ベジェ。端で縦向き）でつなぐ。
 * - 先に要るものが無いパネル：Common の帯は列の根もと（部門の札か、物流の束の札）から。Uncommon より下の帯は、その帯の入口（帯の境の小さな点。GATES：帯が開くと通れる）から。
 * - 「n 個要る」（anyOf）は点線で、パネルの上の頂点に集まる。そのすぐ上（JUNCTIONS）に「2/3」のような札（tree.ts）。
 * - 段の中の並び：レーンごとに、線の交わりが少なくなるように並べる（重心法で上下に何度も並べ替え → 隣どうしの入れ替え）。
 *   TREE_ORDER（treeorder.ts。scripts/island/treeopt.ts が探して書く）に段の並びがあれば、それを使う。
 * docs/ISLAND_PHASE1.md「スキルツリー」「部門」、docs/ISLAND_UX_CHARTER.md「線の種類と帯」。
 */
import { t } from '../../i18n';
import { DEPTS, DEPT_SKILLS, SKILL, SKILLS, isResearch, type Branch, type DeptId, type Skill, type Tier } from './data';
import { TREE_ORDER } from './treeorder';

export type P = { x: number; y: number };

/** スキルのランク（帯）。無ければ C */
const tierOf = (k: { tier?: Tier }): Tier => k.tier ?? 'C';
/** 帯の順（上から） */
export const BAND_TIERS: Tier[] = ['C', 'U', 'R', 'E', 'L'];
const bandIx = (k: Skill) => BAND_TIERS.indexOf(tierOf(k));

export const UNIT = 96;
/**
 * パネルの大きさ（単位：UNIT）：お金のパネルは菱形（正方形を 45° 回す。PANEL は外接の幅＝64px）、研究ポイント（RP）のパネルは四角（辺は SQ_SIDE）。
 * 中のアイコンは正立のまま。線がパネルの下を通らないかの判定は、四角は L∞・菱形は L1
 */
export const PANEL = 2 / 3;
export const SQ_SIDE = PANEL * 0.78;
export type PanelShape = 'square' | 'diamond';
export const shapeOf = (k: { id: string; cat?: string }): PanelShape => (isResearch(k as never) ? 'square' : 'diamond');
export const shapeById = (id: string): PanelShape => (SKILL[id] ? shapeOf(SKILL[id]) : 'diamond');
/** パネルの形の半分の大きさ（線との距離の判定。余白は含まない） */
export const halfOf = (id: string) => (shapeById(id) === 'square' ? SQ_SIDE / 2 : PANEL / 2);
/** 横のパネルの間（中心どうし）・縦の段の間。すき間はひし形の幅の 0.8〜1 枚分 */
export const GAP = 1.22;
export const STEP = 1.3;
/** 線の通り道（あいだの段をまたぐ線のために空ける幅）・帯の入口の点の幅 */
export const DUMMY_W = 0.42;
const GATE_W = 0.7;
/** 1 段に並べるパネルの数の上限（超えたら段を分ける） */
export const CAP = 4;
/** レーンのあいだ（同じ部門の束どうし）・部門の列のあいだ（余白。単位：UNIT） */
const LANE_PAD = 0.45;
const DEPT_PAD = 0.95;
/** 部門の列の最小の幅（見出しの札が入る幅） */
const COL_MIN = 1.7;
/** 縦の位置：本社・部門の見出し・物流の束の札・Common の帯の 1 段目 */
export const HQ_Y = 0;
export const HEAD_Y = 1.7;
export const KNOT_Y = HEAD_Y + 0.85;
const BAND0_Y = HEAD_Y + 2.15;
/** 帯の境：前の帯の最後の段から次の帯の 1 段目まで。境の横線は 1 段目の LINE_DY 上、帯の入口の点は GATE_DY 上 */
const BAND_GAP = 2.2;
export const LINE_DY = 1.1;
export const GATE_DY = 0.62;
/** 「n 個要る」の合流点の札：パネルの JUNC_DY 上（線はパネルの上の頂点に集まる） */
export const JUNC_DY = 0.66;
/** 部門の見出しの札の大きさ（単位：UNIT。2 行の札「🔒 Uncommon で開く」も入る大きさ） */
export const HUB_BOX = { w: 1.5, h: 0.5 };
export const hubClear = (_d: DeptId) => HUB_BOX;

/** 物流の列の中の束（もとの枝）。並びは左から */
const LOGI_ORDER: Branch[] = ['shop', 'logi', 'craft', 'tech', 'buy'];
/** 束の名前（詳細カードの「（物流・② 製造）」・束の札） */
export const GROUP_STAGE: Partial<Record<Branch, string>> = {
  shop: t('④ 販売', '④ Sell'),
  logi: t('③ 運搬', '③ Haul'),
  craft: t('② 製造', '② Craft'),
  tech: t('技', 'Crafts'),
  buy: t('① 調達', '① Buy'),
};

/** 部門の列の中の束（レーン。物流は 5 つ、ほかは 1 つ） */
export interface Group {
  key: string;
  dept: DeptId;
  branch?: Branch;
  skills: Skill[];
  /** レーンの左右の端と真ん中（単位：UNIT。本社が x = 0） */
  x0: number;
  x1: number;
  cx: number;
}
export interface DeptLayout {
  color: string;
  groups: Group[];
  /** 列の左右の端と真ん中 */
  x0: number;
  x1: number;
  cx: number;
}
/**
 * つながりの線：from（先に要るパネル。null は根もと＝列の根もとの札か、帯の入口）→ to。
 * kind：all＝全部要る（requires。実線）・any＝n 個要る（anyOf。点線で合流点へ）。gate：帯の入口から（Uncommon より下の帯の、先に要るものが無いパネル）。
 * cross：ほかのレーン（ほかの部門）のパネルが先に要る線（細い点線。いまは無い）。pts：線が通る点（上から下へ）
 */
export type TreeEdge = { from: string | null; to: string; br: DeptId; g: string; kind: 'all' | 'any'; gate?: Tier; cross?: boolean; pts: P[] };

export const GROUPS: Group[] = [];
const GROUP_OF = new Map<string, Group>();
export const DEPT_LAYOUT = {} as Record<DeptId, DeptLayout>;
for (const d of DEPTS) {
  const list = DEPT_SKILLS[d.id];
  const parts: [string, Branch | undefined, Skill[]][] = d.id === 'logistics' ? LOGI_ORDER.map((b) => [`logistics:${b}`, b, list.filter((k) => k.branch === b)]) : [[d.id, undefined, list]];
  DEPT_LAYOUT[d.id] = { color: d.color, groups: [], x0: 0, x1: 0, cx: 0 };
  for (const [key, branch, skills] of parts) {
    if (!skills.length) continue;
    const g: Group = { key, dept: d.id, branch, skills, x0: 0, x1: 0, cx: 0 };
    GROUPS.push(g);
    GROUP_OF.set(key, g);
    DEPT_LAYOUT[d.id].groups.push(g);
  }
}
const GROUP_BY_ID = new Map<string, Group>();
for (const g of GROUPS) for (const k of g.skills) GROUP_BY_ID.set(k.id, g);
/** パネルの束（レーン） */
export const groupOf = (id: string) => GROUP_BY_ID.get(id) ?? null;
/** もとの枝（SCM ダッシュボードの「スキルツリーで見る」）の束 */
export const groupOfBranch = (br: string) => GROUPS.find((g) => g.branch === br) ?? GROUPS.find((g) => g.skills.some((k) => k.branch === br)) ?? null;

/** 先に要るもの（同じ帯の深さ・線）：全部要る（requires）と n 個要る（anyOf）。封印のパネルは、ひとつ上の帯のまんなかのパネルから */
function predsOf(k: Skill, g: Group): { id: string; kind: 'all' | 'any' }[] {
  if (k.sealed) {
    const inner = g.skills.filter((x) => !x.big && bandIx(x) === bandIx(k) - 1);
    return inner.length ? [{ id: inner[Math.floor(inner.length / 2)].id, kind: 'all' }] : [];
  }
  return [...(k.requires ?? []).map((id) => ({ id, kind: 'all' as const })), ...(k.anyOf?.ids ?? []).filter((id) => !(k.requires ?? []).includes(id)).map((id) => ({ id, kind: 'any' as const }))];
}

// ---------------------------------------------------------------- レーンの段（行）と並び

/** レーンの 1 段：y（本社からの縦の位置。帯の高さをそろえる前は帯の中の番号）と、並び（パネル・通り道・帯の入口・根もと） */
interface Row {
  band: number;
  /** 帯の中の段の番号（-1：帯の入口の段・-2：根もとの段） */
  at: number;
  items: string[];
}
/** 段の中のものの id：パネルの id・根もと「@h」・帯の入口「@g:C」など・通り道「~from>to」 */
const HEAD = '@h';
const gateId = (tier: Tier) => `@g:${tier}`;
/** 通り道は、同じパネルから出る線どうしで 1 つ（束ねる。下の段で分かれる） */
const dummyId = (from: string, r: number) => `~${from}#${r}`;
const isDummy = (id: string) => id.startsWith('~');
const widthOf = (id: string) => (isDummy(id) ? DUMMY_W : id.startsWith('@g') ? GATE_W : id === HEAD ? 0 : GAP);

/** レーンの組み立て（段・線の通る点）。order：段の並びの表（無ければ重心法で並べる） */
export interface LaneBuild {
  g: Group;
  rows: Row[];
  /** 線（from は、根もとなら HEAD、帯の入口なら gateId） */
  links: { from: string; to: string; kind: 'all' | 'any'; chain: string[] }[];
  /** 段ごとの帯の中の段の数（帯の高さをそろえるのに使う） */
  bandRows: number[];
}
/** 段の中の位置の表（row → id → 何番目） */
const posMap = (rows: Row[]) => rows.map((r) => new Map(r.items.map((id, i) => [id, i] as const)));

export function buildLane(g: Group): LaneBuild {
  const ids = new Set(g.skills.map((k) => k.id));
  // 帯の中の深さ（同じレーン・同じ帯の先に要るもの）
  const depth = new Map<string, number>();
  const dep = (id: string, stack: string[] = []): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (stack.includes(id)) throw new Error(`skill tree cycle: ${[...stack, id].join(' -> ')}`);
    const k = SKILL[id];
    const ps = predsOf(k, g).filter((p) => ids.has(p.id) && bandIx(SKILL[p.id]) === bandIx(k));
    const d = ps.length ? 1 + Math.max(...ps.map((p) => dep(p.id, [...stack, id]))) : 0;
    depth.set(id, d);
    return d;
  };
  for (const k of g.skills) dep(k.id);
  const rows: Row[] = [{ band: -1, at: -2, items: [HEAD] }];
  const rowOf = new Map<string, number>();
  rowOf.set(HEAD, 0);
  const bandRows: number[] = [];
  const childIn = (id: string) => g.skills.some((x) => predsOf(x, g).some((p) => p.id === id) && bandIx(x) === bandIx(SKILL[id]));
  for (let b = 0; b < BAND_TIERS.length; b++) {
    const tier = BAND_TIERS[b];
    const ks = g.skills.filter((k) => bandIx(k) === b);
    if (!ks.length) {
      bandRows.push(0);
      continue;
    }
    // 帯の入口（Uncommon より下の帯で、先に要るものが無いパネルがあれば）
    const roots = ks.filter((k) => !predsOf(k, g).some((p) => ids.has(p.id)));
    if (b > 0 && roots.length) {
      rows.push({ band: b, at: -1, items: [gateId(tier)] });
      rowOf.set(gateId(tier), rows.length - 1);
    }
    let n = 0;
    const maxD = Math.max(...ks.map((k) => depth.get(k.id)!));
    for (let d = 0; d <= maxD; d++) {
      const at = ks.filter((k) => depth.get(k.id) === d);
      const parts = Math.ceil(at.length / CAP);
      if (!parts) continue;
      // 段を分けるとき：この帯の中に子があるパネルを後ろの段へ（子に近く）。ほかは前の段から順に
      const sorted = [...at.filter((k) => !childIn(k.id)), ...at.filter((k) => childIn(k.id))];
      const per = Math.ceil(at.length / parts);
      for (let p = 0; p < parts; p++) {
        const chunk = sorted.slice(p * per, (p + 1) * per);
        rows.push({ band: b, at: n++, items: chunk.map((k) => k.id) });
        for (const k of chunk) rowOf.set(k.id, rows.length - 1);
      }
    }
    bandRows.push(n);
  }
  // 線と通り道（あいだの段に 1 つずつ）
  const links: LaneBuild['links'] = [];
  for (const k of g.skills) {
    const ps = predsOf(k, g).filter((p) => ids.has(p.id));
    const list = ps.length ? ps.map((p) => ({ from: p.id, kind: p.kind })) : [{ from: bandIx(k) === 0 ? HEAD : gateId(tierOf(k)), kind: 'all' as const }];
    for (const { from, kind } of list) {
      const r0 = rowOf.get(from)!;
      const r1 = rowOf.get(k.id)!;
      if (!(r1 > r0)) throw new Error(`skill tree edge goes up: ${from} -> ${k.id}`);
      const chain = [from];
      for (let r = r0 + 1; r < r1; r++) {
        const dmy = dummyId(from, r);
        if (!rows[r].items.includes(dmy)) rows[r].items.push(dmy);
        chain.push(dmy);
      }
      chain.push(k.id);
      links.push({ from, to: k.id, kind, chain });
    }
  }
  return { g, rows, links, bandRows };
}

/** 隣の段どうしの線の区間（上の段の id・下の段の id）。段 r と r + 1 のあいだ */
function segsOf(L: LaneBuild): [string, string][][] {
  const out: [string, string][][] = L.rows.map(() => []);
  const rowIx = new Map<string, number>();
  L.rows.forEach((r, i) => r.items.forEach((id) => rowIx.set(id, i)));
  for (const l of L.links) for (let i = 1; i < l.chain.length; i++) out[rowIx.get(l.chain[i - 1])!].push([l.chain[i - 1], l.chain[i]]);
  return out;
}
/** 段 r と r + 1 のあいだの交わりの数（並びの入れ替わり。端を共有する区間は数えない） */
function crossAt(segs: [string, string][], up: Map<string, number>, dn: Map<string, number>): number {
  let n = 0;
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const a = (up.get(segs[i][0])! - up.get(segs[j][0])!) * (dn.get(segs[i][1])! - dn.get(segs[j][1])!);
      if (a < 0) n++;
    }
  return n;
}
/** レーンの交わりの合計（並びの数え方） */
export function laneCross(L: LaneBuild): number {
  const segs = segsOf(L);
  const pm = posMap(L.rows);
  let n = 0;
  for (let r = 0; r + 1 < L.rows.length; r++) n += crossAt(segs[r], pm[r], pm[r + 1]);
  return n;
}
/** 段の並びの表の key（レーン・帯・帯の中の段） */
export const rowKey = (g: string, r: Row) => `${g}|${BAND_TIERS[r.band] ?? 'H'}|${r.at}`;
/** 乱数（並びを探すとき。固定の種） */
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * 並べる（重心法 → 隣どうしの入れ替え）。rnd があれば、はじめの並びを混ぜる（並びを探すとき）。
 * いちばん交わりの少なかった並びを L.rows に残し、その交わりの数を返す
 */
export function orderLane(L: LaneBuild, rnd?: () => number): number {
  const segs = segsOf(L);
  const R = L.rows;
  if (rnd) for (const r of R) for (let i = r.items.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [r.items[i], r.items[j]] = [r.items[j], r.items[i]];
  }
  const ups = R.map(() => new Map<string, string[]>());
  const dns = R.map(() => new Map<string, string[]>());
  segs.forEach((ss, r) => {
    for (const [a, b] of ss) {
      (dns[r].get(a) ?? dns[r].set(a, []).get(a)!).push(b);
      (ups[r + 1].get(b) ?? ups[r + 1].set(b, []).get(b)!).push(a);
    }
  });
  const total = () => laneCross(L);
  let best = total();
  let snap = R.map((r) => [...r.items]);
  const sortRow = (r: number, nb: Map<string, string[]>, other: Map<string, number>) => {
    const cur = new Map(R[r].items.map((id, i) => [id, i] as const));
    const key = (id: string) => {
      const ns = nb.get(id);
      if (!ns?.length) return cur.get(id)!;
      return ns.reduce((a, x) => a + other.get(x)!, 0) / ns.length;
    };
    const ks = new Map(R[r].items.map((id) => [id, key(id)] as const));
    R[r].items.sort((a, b) => ks.get(a)! - ks.get(b)! || cur.get(a)! - cur.get(b)!);
  };
  for (let it = 0; it < 24 && best > 0; it++) {
    for (let r = 1; r < R.length; r++) sortRow(r, ups[r], new Map(R[r - 1].items.map((id, i) => [id, i] as const)));
    for (let r = R.length - 2; r >= 0; r--) sortRow(r, dns[r], new Map(R[r + 1].items.map((id, i) => [id, i] as const)));
    const n = total();
    if (n < best) {
      best = n;
      snap = R.map((r) => [...r.items]);
    }
  }
  R.forEach((r, i) => (r.items = snap[i]));
  // 隣どうしの入れ替え（上下の段との交わりが減るなら）
  const local = (r: number) => {
    const pm = new Map(R[r].items.map((id, i) => [id, i] as const));
    let n = 0;
    if (r > 0) n += crossAt(segs[r - 1], new Map(R[r - 1].items.map((id, i) => [id, i] as const)), pm);
    if (r + 1 < R.length) n += crossAt(segs[r], pm, new Map(R[r + 1].items.map((id, i) => [id, i] as const)));
    return n;
  };
  for (let pass = 0; pass < 12; pass++) {
    let better = false;
    for (let r = 0; r < R.length; r++) {
      const it = R[r].items;
      for (let i = 0; i + 1 < it.length; i++) {
        const before = local(r);
        [it[i], it[i + 1]] = [it[i + 1], it[i]];
        if (local(r) < before) better = true;
        else [it[i], it[i + 1]] = [it[i + 1], it[i]];
      }
    }
    if (!better) break;
  }
  return total();
}
/** 表の並びを使う（同じものがそろっている段だけ） */
function applyTable(L: LaneBuild, table: Record<string, string[]>): boolean {
  let all = true;
  for (const r of L.rows) {
    const o = table[rowKey(L.g.key, r)];
    if (o && o.length === r.items.length && r.items.every((id) => o.includes(id))) r.items = [...o];
    else all = false;
  }
  return all;
}

// ---------------------------------------------------------------- 横の位置

/** 単調な回帰（隣どうしの順を守って、望む位置にいちばん近く） */
function isotonic(v: number[]): number[] {
  const blocks: { s: number; n: number }[] = [];
  for (const x of v) {
    blocks.push({ s: x, n: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].s / blocks[blocks.length - 2].n > blocks[blocks.length - 1].s / blocks[blocks.length - 1].n) {
      const b = blocks.pop()!;
      blocks[blocks.length - 1].s += b.s;
      blocks[blocks.length - 1].n += b.n;
    }
  }
  return blocks.flatMap((b) => Array(b.n).fill(b.s / b.n));
}
/** レーンの中の横の位置（レーンの左端から）。幅は、いちばん広い段 */
function placeLane(L: LaneBuild): { w: number; x: Map<string, number> } {
  const w = Math.max(COL_MIN / Math.max(1, DEPT_LAYOUT[L.g.dept].groups.length), ...L.rows.map((r) => r.items.reduce((a, id) => a + widthOf(id), 0)));
  const x = new Map<string, number>();
  const offs = (r: Row) => {
    const o: number[] = [];
    let acc = 0;
    r.items.forEach((id, i) => {
      if (i) acc += (widthOf(r.items[i - 1]) + widthOf(id)) / 2;
      o.push(acc);
    });
    return o;
  };
  const fit = (r: Row, want: number[]) => {
    const o = offs(r);
    const lo = widthOf(r.items[0]) / 2;
    const hi = w - widthOf(r.items[r.items.length - 1]) / 2 - o[o.length - 1];
    const y = isotonic(want.map((v, i) => v - o[i])).map((v) => Math.max(lo, Math.min(hi, v)));
    r.items.forEach((id, i) => x.set(id, y[i] + o[i]));
  };
  // はじめは段ごとに真ん中寄せ
  for (const r of L.rows) {
    if (r.items[0] === HEAD) {
      x.set(HEAD, w / 2);
      continue;
    }
    const o = offs(r);
    const left = (w - (o[o.length - 1] ?? 0)) / 2;
    r.items.forEach((id, i) => x.set(id, left + o[i]));
  }
  // つながっている上下のものの平均へ寄せる（上から・下から 6 回ずつ）
  const nb = new Map<string, string[]>();
  for (const l of L.links)
    for (let i = 1; i < l.chain.length; i++) {
      (nb.get(l.chain[i]) ?? nb.set(l.chain[i], []).get(l.chain[i])!).push(l.chain[i - 1]);
      (nb.get(l.chain[i - 1]) ?? nb.set(l.chain[i - 1], []).get(l.chain[i - 1])!).push(l.chain[i]);
    }
  for (let it = 0; it < 12; it++) {
    const rs = it % 2 ? [...L.rows].reverse() : L.rows;
    for (const r of rs) {
      if (r.items[0] === HEAD) continue;
      // 通り道は上下の点をまっすぐ結ぶ所へ・パネルは、上のつながり（親）の平均を重く
      fit(
        r,
        r.items.map((id) => {
          const ns = nb.get(id) ?? [];
          return ns.length ? ns.reduce((a, q) => a + x.get(q)!, 0) / ns.length : x.get(id)!;
        }),
      );
    }
  }
  return { w, x };
}

// ---------------------------------------------------------------- 全体の組み立て

/** パネルの位置（単位：UNIT。本社が (0, 0)。下が +y） */
export const POS = new Map<string, P>();
/** 部門の見出しの札（列の上） */
export const HUBPOS = new Map<DeptId, P>();
/** 物流の束の札（④ 販売 … ① 調達） */
export const KNOTPOS = new Map<string, P>();
/** 帯の入口（key：束の key|ランク） */
export const GATES = new Map<string, P>();
/** 「n 個要る」の合流点（パネルの id → 合流点の位置） */
export const JUNCTIONS = new Map<string, P>();
/** 帯：1 段目の y・境の横線の y・段の数（どのレーンでもそろえる） */
export const BANDS = {} as Record<Tier, { y: number; line: number; rows: number; bottom: number }>;
export const EDGES: TreeEdge[] = [];
/** レーンの組み立て（テスト・並びを探すスクリプトが見る） */
export const LANES: LaneBuild[] = [];
/** 並べたあとの交わり（並びの数え方。テストの上限と比べる） */
export let ORDER_CROSS = 0;

/** 組み立てる（読み込んだときに 1 回。table：段の並びの表） */
export function layoutTree(table: Record<string, string[]> = TREE_ORDER) {
  POS.clear();
  HUBPOS.clear();
  KNOTPOS.clear();
  GATES.clear();
  JUNCTIONS.clear();
  EDGES.length = 0;
  LANES.length = 0;
  ORDER_CROSS = 0;
  const builds = GROUPS.map((g) => {
    const L = buildLane(g);
    if (!applyTable(L, table)) orderLane(L);
    ORDER_CROSS += laneCross(L);
    LANES.push(L);
    return L;
  });
  // 帯の高さ（どのレーンでもそろえる）
  let y = BAND0_Y;
  BAND_TIERS.forEach((tier, b) => {
    const rows = Math.max(1, ...builds.map((L) => L.bandRows[b] ?? 0));
    BANDS[tier] = { y, line: y - LINE_DY, rows, bottom: y + (rows - 1) * STEP };
    y += (rows - 1) * STEP + BAND_GAP;
  });
  const rowY = (r: Row) => (r.at === -2 ? 0 : r.at === -1 ? BANDS[BAND_TIERS[r.band]].y - GATE_DY : BANDS[BAND_TIERS[r.band]].y + r.at * STEP);
  // 横：レーンを左から並べる（部門の列のあいだは広く）
  let x = 0;
  const placed = builds.map((L) => placeLane(L));
  let prev: DeptId | null = null;
  builds.forEach((L, i) => {
    const g = L.g;
    if (prev) x += prev === g.dept ? LANE_PAD : DEPT_PAD;
    prev = g.dept;
    g.x0 = x;
    g.x1 = x + placed[i].w;
    g.cx = (g.x0 + g.x1) / 2;
    x = g.x1;
  });
  // 本社が x = 0 になるように、全体の真ん中へ寄せる
  const mid = x / 2;
  for (const g of GROUPS) {
    g.x0 -= mid;
    g.x1 -= mid;
    g.cx -= mid;
  }
  for (const d of DEPTS) {
    const L = DEPT_LAYOUT[d.id];
    L.x0 = Math.min(...L.groups.map((g) => g.x0));
    L.x1 = Math.max(...L.groups.map((g) => g.x1));
    L.cx = (L.x0 + L.x1) / 2;
    HUBPOS.set(d.id, { x: L.cx, y: HEAD_Y });
    if (L.groups.length > 1) for (const g of L.groups) KNOTPOS.set(g.key, { x: g.cx, y: KNOT_Y });
  }
  builds.forEach((L, i) => {
    const g = L.g;
    const at = new Map<string, P>();
    for (const r of L.rows)
      for (const id of r.items) {
        const p = { x: g.x0 + placed[i].x.get(id)!, y: rowY(r) };
        at.set(id, p);
        if (id === HEAD) continue;
        if (id.startsWith('@g:')) GATES.set(`${g.key}|${id.slice(3)}`, p);
        else if (!isDummy(id)) POS.set(id, p);
      }
    // 根もと：物流は束の札・ほかは部門の見出し
    at.set(HEAD, KNOTPOS.get(g.key) ?? HUBPOS.get(g.dept)!);
    for (const l of L.links) {
      // 「n 個要る」の線も、パネルの上の頂点に集まる（合流点の札はそのすぐ上）
      const end = at.get(l.to)!;
      if (l.kind === 'any') JUNCTIONS.set(l.to, { x: end.x, y: end.y - JUNC_DY });
      const from = l.from === HEAD || l.from.startsWith('@g:') ? null : l.from;
      EDGES.push({ from, to: l.to, br: g.dept, g: g.key, kind: l.kind, ...(l.from.startsWith('@g:') ? { gate: l.from.slice(3) as Tier } : {}), pts: [...l.chain.slice(0, -1).map((id) => at.get(id)!), end] });
    }
  });
  // ほかのレーンのパネルが先に要る線（いまは無い。あれば細い点線で、まっすぐ下へ）
  for (const k of SKILLS) {
    const g = groupOf(k.id);
    if (!g) continue;
    for (const p of predsOf(k, g))
      if (groupOf(p.id) !== g && POS.has(p.id)) EDGES.push({ from: p.id, to: k.id, br: g.dept, g: g.key, kind: p.kind, cross: true, pts: [POS.get(p.id)!, POS.get(k.id)!] });
  }
  for (const k of SKILLS) if (!POS.has(k.id)) POS.set(k.id, { x: 0, y: 0 });
  const xs = [...POS.values(), ...HUBPOS.values()];
  BOUNDS.x0 = Math.min(...xs.map((p) => p.x)) - GAP / 2;
  BOUNDS.x1 = Math.max(...xs.map((p) => p.x)) + GAP / 2;
  BOUNDS.y0 = HQ_Y - 0.6;
  BOUNDS.y1 = Math.max(...xs.map((p) => p.y)) + 0.6;
}
export const BOUNDS = { x0: 0, x1: 0, y0: 0, y1: 0 };
layoutTree();
/** 並べ忘れたスキル（テストで 0 件） */
export const UNPLACED = SKILLS.filter((k) => !groupOf(k.id)).map((k) => k.id);
/** パネルの位置（テスト用） */
export const treePos = (id: string) => POS.get(id) ?? null;
/** 束の根もと（物流は束の札、ほかは部門の見出し） */
export const rootOf = (g: string) => KNOTPOS.get(g) ?? HUBPOS.get(GROUP_OF.get(g)?.dept ?? (g as DeptId))!;
/** 線の端の位置（null は束の根もと） */
export const edgeEnd = (id: string | null, g: string) => (id ? POS.get(id)! : rootOf(g));
/** 部門の列の真ん中（見出しの下の、Common の帯の 2 段目あたり）。チップ・「この部門のパネルを見る」から飛ぶ先 */
export const deptCenter = (d: DeptId): P => ({ x: DEPT_LAYOUT[d].cx, y: BANDS.C.y + STEP });
/** 束の真ん中 */
export const groupCenter = (g: Group): P => ({ x: g.cx, y: BANDS.C.y + STEP });
/** いま見ている x がどの部門の列か（列のあいだは近いほう） */
export function deptAtX(x: number): DeptId {
  let best: DeptId = DEPTS[0].id;
  let bd = Infinity;
  for (const d of DEPTS) {
    const L = DEPT_LAYOUT[d.id];
    const dd = x < L.x0 ? L.x0 - x : x > L.x1 ? x - L.x1 : 0;
    if (dd < bd) {
      bd = dd;
      best = d.id;
    }
  }
  return best;
}

// ---------------------------------------------------------------- 線の形

/** 2 点を、端で縦向きのなめらかな曲線でつなぐ 3 次ベジェの制御点 */
export function segCtrl(a: P, b: P) {
  const m = (b.y - a.y) / 2;
  return { c1: { x: a.x, y: a.y + m }, c2: { x: b.x, y: b.y - m } };
}
/** 3 次ベジェの点 */
export function bez(a: P, c1: P, c2: P, b: P, t0: number): P {
  const u = 1 - t0;
  return { x: u * u * u * a.x + 3 * u * u * t0 * c1.x + 3 * u * t0 * t0 * c2.x + t0 * t0 * t0 * b.x, y: u * u * u * a.y + 3 * u * u * t0 * c1.y + 3 * u * t0 * t0 * c2.y + t0 * t0 * t0 * b.y };
}
/** 線（通る点）を細かい折れ線に（区間ごとに n 等分） */
export function edgePoly(pts: P[], n = 24): P[] {
  const out: P[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const { c1, c2 } = segCtrl(pts[i - 1], pts[i]);
    for (let k = 1; k <= n; k++) out.push(bez(pts[i - 1], c1, c2, pts[i], k / n));
  }
  return out;
}
/** 線の SVG の道（px：木の上の位置 → 画面の位置）。端はパネルの縁で切る（上の端は下へ a0、下の端は上へ b0 だけ縮める） */
export function edgePath(pts: P[], px: (p: P) => P, a0 = 0, b0 = 0): string {
  const q = pts.map((p) => ({ ...p }));
  q[0] = { x: q[0].x, y: q[0].y + a0 };
  q[q.length - 1] = { x: q[q.length - 1].x, y: q[q.length - 1].y - b0 };
  const P0 = px(q[0]);
  let d = `M${P0.x.toFixed(1)} ${P0.y.toFixed(1)}`;
  for (let i = 1; i < q.length; i++) {
    const { c1, c2 } = segCtrl(q[i - 1], q[i]);
    const [C1, C2, B] = [px(c1), px(c2), px(q[i])];
    d += Math.abs(q[i].x - q[i - 1].x) < 1e-6 ? `L${B.x.toFixed(1)} ${B.y.toFixed(1)}` : `C${C1.x.toFixed(1)} ${C1.y.toFixed(1)} ${C2.x.toFixed(1)} ${C2.y.toFixed(1)} ${B.x.toFixed(1)} ${B.y.toFixed(1)}`;
  }
  return d;
}
/** 線の長さ（折れ線で。伸びる演出） */
export const polyLen = (pts: P[]) => pts.reduce((a, p, i) => (i ? a + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);

// ---------------------------------------------------------------- 判定（テスト・並びを探すスクリプト）

/** 点 p と線分 q0–q1 の L1 の距離（菱形） */
export function l1Seg(p: P, q0: P, q1: P) {
  const dx = q1.x - q0.x;
  const dy = q1.y - q0.y;
  let best = Math.min(Math.abs(q0.x - p.x) + Math.abs(q0.y - p.y), Math.abs(q1.x - p.x) + Math.abs(q1.y - p.y));
  for (const tt of [dx ? (p.x - q0.x) / dx : -1, dy ? (p.y - q0.y) / dy : -1]) if (tt > 0 && tt < 1) best = Math.min(best, Math.abs(q0.x + dx * tt - p.x) + Math.abs(q0.y + dy * tt - p.y));
  return best;
}
/** 点 p と線分 q0–q1 の L∞ の距離（四角のパネル） */
export function linfSeg(p: P, q0: P, q1: P) {
  const dx = q1.x - q0.x;
  const dy = q1.y - q0.y;
  const f = (tt: number) => Math.max(Math.abs(q0.x + dx * tt - p.x), Math.abs(q0.y + dy * tt - p.y));
  let best = Math.min(f(0), f(1));
  const ax = q0.x - p.x;
  const ay = q0.y - p.y;
  for (const sg of [1, -1]) {
    const den = dx - sg * dy;
    if (Math.abs(den) > 1e-12) {
      const tt = -(ax - sg * ay) / den;
      if (tt > 0 && tt < 1) best = Math.min(best, f(tt));
    }
    const den2 = dx + sg * dy;
    if (Math.abs(den2) > 1e-12) {
      const tt = -(ax + sg * ay) / den2;
      if (tt > 0 && tt < 1) best = Math.min(best, f(tt));
    }
  }
  return best;
}
/** 線とパネルのすき間 */
export const EDGE_CLEAR = 0.06;
/** 折れ線が、パネル id（位置 p）の形（余白つき）に入るか */
export function polyHits(pts: P[], id: string, p: P, pad = EDGE_CLEAR) {
  const r = halfOf(id) + pad;
  const sq = shapeById(id) === 'square';
  for (let i = 1; i < pts.length; i++) {
    const q0 = pts[i - 1];
    const q1 = pts[i];
    if (p.x + r < Math.min(q0.x, q1.x) || p.x - r > Math.max(q0.x, q1.x) || p.y + r < Math.min(q0.y, q1.y) || p.y - r > Math.max(q0.y, q1.y)) continue;
    if ((sq ? linfSeg(p, q0, q1) : l1Seg(p, q0, q1)) < r) return true;
  }
  return false;
}
/** 折れ線が、中心 c・大きさ box の札（長方形）の中を通るか */
export function polyInBox(pts: P[], c: P, box: { w: number; h: number }) {
  const x0 = c.x - box.w / 2;
  const x1 = c.x + box.w / 2;
  const y0 = c.y - box.h / 2;
  const y1 = c.y + box.h / 2;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1];
    const dx = pts[i].x - p.x;
    const dy = pts[i].y - p.y;
    let lo = 0;
    let hi = 1;
    let ok = true;
    for (const [q, d] of [
      [-dx, p.x - x0],
      [dx, x1 - p.x],
      [-dy, p.y - y0],
      [dy, y1 - p.y],
    ]) {
      if (q === 0) {
        if (d < 0) ok = false;
        continue;
      }
      const tt = d / q;
      if (q < 0) lo = Math.max(lo, tt);
      else hi = Math.min(hi, tt);
    }
    if (ok && lo <= hi) return true;
  }
  return false;
}
/** 線分どうしが交わるか（端の重なりは数えない） */
const orient = (p: P, q: P, r: P) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
export const segX = (a: P, b: P, c: P, d: P) => orient(c, d, a) * orient(c, d, b) < -1e-12 && orient(a, b, c) * orient(a, b, d) < -1e-12;
/** 線どうしの交わり（描く曲線どうし。端のパネルを共有する線は数えない）。組の一覧 */
export function crossings(edges: TreeEdge[] = EDGES): string[] {
  const polys = edges.map((e) => {
    const pts = edgePoly(e.pts, 16);
    const xs = pts.map((p) => p.x);
    return { e, pts, x0: Math.min(...xs), x1: Math.max(...xs), y0: pts[0].y, y1: pts[pts.length - 1].y };
  });
  const out: string[] = [];
  const shareEnd = (A: TreeEdge, B: TreeEdge) => (A.from == null ? B.from == null && A.g === B.g && A.gate === B.gate : A.from === B.from) || A.to === B.to || (A.from != null && A.from === B.to) || (B.from != null && A.to === B.from);
  for (let i = 0; i < polys.length; i++)
    for (let j = i + 1; j < polys.length; j++) {
      const A = polys[i];
      const B = polys[j];
      if (A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0 || shareEnd(A.e, B.e)) continue;
      let hit = false;
      for (let a = 1; a < A.pts.length && !hit; a++) for (let b = 1; b < B.pts.length; b++) if (segX(A.pts[a - 1], A.pts[a], B.pts[b - 1], B.pts[b])) hit = true;
      if (hit) out.push(`${A.e.from ?? '(root)'}->${A.e.to} x ${B.e.from ?? '(root)'}->${B.e.to}`);
    }
  return out;
}
