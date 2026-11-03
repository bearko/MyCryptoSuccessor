/**
 * スキルツリーの配置（DOM なし。tree.ts とテストが使う）。
 * 段 B（部門の土台）：本社から 11 本の部門の枝。枝の角度の幅は、その部門のパネルが収まる幅（内側の段・外周の段のどれもが隣の枝と重ならない幅）
 * に、残りの角度をパネルの数に応じて足して決める。パネルの無い部門（営業・カスタマーサポート・法務・経理）は細い枝で、鍵の札だけ。
 * 物流の枝は、もとの 5 本（④ 販売の売り場の運営・③ 運搬・② 製造・技・① 調達）を小さな束（グループ）として並べる。
 * 内側（Common）の段を根もとから外へ、外周（U・R・E・L）は前と同じ半径の同心円に並べる。
 * docs/ISLAND_PHASE1.md「スキルツリー」「部門」。
 */
import { t } from '../../i18n';
import { CS_SKILLS, DEPTS, DEPT_SKILLS, GA_SKILLS, MKT_SKILLS, SKILL, SKILLS, deptOf, isResearch, type Branch, type DeptId, type Skill, type Tier } from './data';
import { ROW_CAP } from './skillsx';
import { TREE_ORDER } from './treeorder';

/** スキルのランク（外周）。無ければ C */
const tierOf = (k: { tier?: Tier }): Tier => k.tier ?? 'C';

export const UNIT = 96;
/**
 * パネルの大きさ（単位：UNIT）：どのパネルも同じ大きさのひし形（正方形を 45° 回す）。PANEL はひし形の外接の幅（角から角まで。64px）。
 * 中のアイコンは正立のまま、ひし形の内側に収まる正方形（幅の半分＝32px。64×64 のエクステの絵はちょうど 1/2）
 */
export const PANEL = 2 / 3;
/**
 * パネルの形は **払うもので決まる**：研究ポイント（RP）で開くパネルは **四角**（辺は SQ_SIDE。傾けない）、お金（資金）で開くパネルは **菱形**（PANEL）。
 * 四角の辺は菱形の外接の幅の 0.78 倍（50px。見た目の大きさをそろえる）。線がパネルの下を通らないかの判定は、四角は L∞（四角そのもの）・菱形は L1
 */
export const SQ_SIDE = PANEL * 0.78;
export type PanelShape = 'square' | 'diamond';
export const shapeOf = (k: { id: string; cat?: string }): PanelShape => (isResearch(k as never) ? 'square' : 'diamond');
export const shapeById = (id: string): PanelShape => (SKILL[id] ? shapeOf(SKILL[id]) : 'diamond');
/** パネルの形の半分の大きさ（線との距離の判定に使う。余白は含まない）：四角は辺の半分（L∞）・菱形は外接の幅の半分（L1） */
export const halfOf = (id: string) => (shapeById(id) === 'square' ? SQ_SIDE / 2 : PANEL / 2);
/** 内側（Common）の段：1 段目の半径・段の間・パネルの間（弧の長さ）。パネルのすき間はひし形の幅の 0.8〜1 枚分 */
export const R0 = 3.6;
export const STEP = 1.3;
export const GAP = 1.22;
/** 枝の根もと（ハブ。部門の名前と理解度の札）の距離。隣の札と近い枝は少し外へずらす（hubR） */
export const HUB = 1.55;
/** 札の大きさ（単位：UNIT。1 行の札「物流 12」）。隣の札と重なるときは外へ（HUB2） */
export const HUB_BOX = { w: 0.82, h: 0.34 };
/**
 * つながりの線が下を通らないようにする札の大きさ（単位：UNIT。日本語・英語の長いほうが入る大きさ）：
 * 1 行の札「システム 12」・2 行の札（開くランクに達していないあいだ「総務 0／🔒 Uncommon で開く」）
 */
export const HUB_CLEAR: Record<'C' | 'U' | 'RE', { w: number; h: number }> = { C: { w: 1.0, h: 0.32 }, U: { w: 1.47, h: 0.43 }, RE: { w: 1.12, h: 0.43 } };
export const hubClear = (d: DeptId) => {
  const o = DEPTS.find((x) => x.id === d)?.opens ?? 'C';
  return HUB_CLEAR[o === 'C' ? 'C' : o === 'U' ? 'U' : 'RE'];
};
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
  // 段 E2：面談（OJT の先）・キャリアの道すじ（インセンティブの先）
  hr: [['hire'], ['manual', 'slots'], ['ojt', 'incentive'], ['hr_talk', 'hr_career']],
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
// 段 G：マーケの Uncommon の外周にパネルが増えたので、ブランドの看板（物流の Rare の外周へ線が伸びる）を物流の側の端へ（線がマーケのパネルを横切らないように）
const OUTER_AT: Record<string, number> = { u_dig_mat: 3, b_sign: 3 };
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
    // 段 G で販売の枝に足したカスタマーサポート・マーケのパネルは数えない（半径を前と変えない。部門の枝の幅で収める）
    const rows = Math.max(1, ...OLD_BR.map((br) => Math.ceil(outerOf(SKILLS.filter((k) => k.branch === br && !CS_SKILLS.includes(k) && !MKT_SKILLS.includes(k)), tier).length / (br === 'dig' ? 3 : cap))));
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

/** 外周だけにパネルのある、あとから足した部門（収まる幅だけ。余りの角度を取らない） */
const NARROW: DeptId[] = ['sales', 'accounting', 'support', 'legal'];
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
      // 営業（段 C。Rare の外周だけ）・経理（段 F。Uncommon の外周だけ）は、収まる幅だけ（余りの角度を取らない＝ほかの枝の幅を前と変えない）。
      // 総務は段 F で足した 3 枚（GA_SKILLS）・マーケは段 G で足した 5 枚（MKT_SKILLS）を余りの数に入れない（ほかの枝の幅を前と変えない）。
      // カスタマーサポート（段 G。Uncommon の外周だけ）は営業・経理と同じく収まる幅だけ
      items.push({ d: d.id, g, need: needOf(key, skills), n: NARROW.includes(d.id) ? 0 : skills.filter((k) => !GA_SKILLS.includes(k) && !MKT_SKILLS.includes(k)).length });
    }
  }
  // 段 C：営業の枝（パネルの無い細い枝だったもの）が広がったぶんは、ほかのパネルの無い部門の枝から分けてもらう
  // （パネルのある部門の枝の幅・角度を前と変えない）。段 F の経理も同じ
  // 段 H2：法務にもパネルができた（Epic の外周だけ）。段 G のときの法務の幅（下の「2 本ぶんの幅」から CS の幅を引いた残り）を下限にして、
  // パネルが収まる幅がそれより広いぶんだけ、ほかの枝の余りの角度から分けてもらう
  const lg = items.find((x) => x.d === 'legal' && x.g);
  const grown = items.filter((x) => NARROW.includes(x.d) && x.d !== 'support' && x.d !== 'legal' && x.g).reduce((a, x) => a + (x.need - EMPTY_W), 0);
  const empty = items.filter((x) => !x.g || x === lg);
  // 段 G：カスタマーサポートにパネルができて、パネルの無い枝は法務だけになった。段 F のとき（パネルの無い 2 本で分けた細さ）の 2 本ぶんの幅を、
  // カスタマーサポート（収まる幅）と法務（残り）で分ける（ほかの部門の枝の幅・角度を前と変えない）
  const cs = items.find((x) => x.d === 'support' && x.g);
  const pair = 2 * Math.max(0.08, EMPTY_W - grown / 2);
  if (grown > 0 && empty.length) for (const x of empty) x.need = Math.max(x === lg ? x.need : 0.08, (cs ? pair - cs.need : pair / 2) / (cs ? empty.length : 1));
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
  // 段 G：法務（パネルの無い枝）の札は、段 F のときと同じ向きに残す（カスタマーサポートが広がったぶん、法務の枝の真ん中が隣の人事へ寄って、札がパネルに近づかないように）
  if (cs && grown > 0) for (const x of empty) if (!x.g) DEPT_LAYOUT[x.d].angle -= (((cs.need - pair / 2) / 2) * 180) / Math.PI;
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
  // 段 F：内側（Common）のパネルが無い細い枝（経理）の札が、まだほかの札と重なるときは、さらに外へ（内側の段の手前まで）
  for (const d of ids) {
    const L = DEPT_LAYOUT[d];
    if (!L.groups.length || DEPT_SKILLS[d].some((k) => tierOf(k) === 'C')) continue;
    const hit = () => ids.some((e) => e !== d && clash(boxAt(d, L.hubR), boxAt(e, DEPT_LAYOUT[e].hubR)));
    for (let r = L.hubR; hit() && r < R0 - 0.5; r += 0.25) L.hubR = r + 0.25;
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
/**
 * パネルを置く場所（段）ごとの組：同じ段（内側の 1 段・束のあるランクの外周）のパネルと、その段の場所の並び。
 * 並びの入れ替え（TREE_ORDER。線が交わらないように選んだもの）は、同じ組の中でだけ（内側は同じ段の中・外周は束とランクの中）
 */
export interface Pool {
  key: string;
  /** 初めの並び（根もとから外へ・角度の小さい側から） */
  ids: string[];
  /** 場所（ids と同じ数） */
  slots: { x: number; y: number }[];
}
export const POOLS: Pool[] = [];
for (const d of DEPTS) {
  const L = DEPT_LAYOUT[d.id];
  HUBPOS.set(d.id, polar(deptAngle(d.id), L.hubR));
  for (const g of L.groups) {
    if (L.groups.length > 1) KNOTPOS.set(g.key, polar(g.a, KNOT));
    const row = (n: number, r: number) => Array.from({ length: n }, (_, i) => polar(g.a + ((i - (n - 1) / 2) * GAP) / r, r));
    (INNER[g.key] ?? []).forEach((ids, k) => POOLS.push({ key: `${g.key}|C|${k}`, ids, slots: row(ids.length, R0 + STEP * k) }));
    for (const tier of OUTER) {
      const ids = outerOf(g.skills, tier).map((k) => k.id);
      if (!ids.length) continue;
      let at = 0;
      const slots: { x: number; y: number }[] = [];
      for (const r of RING_ROWS[tier]) {
        const c = capAt(g.w, r);
        slots.push(...row(ids.slice(at, at + c).length, r));
        at += c;
      }
      POOLS.push({ key: `${g.key}|${tier}`, ids, slots });
    }
  }
}
/** 並びの表から、組の並びを決める（表が無い・パネルが変わっていれば、初めの並び） */
export const orderOf = (p: Pool, table: Record<string, string[]> = TREE_ORDER) => {
  const o = table[p.key];
  return o && o.length === p.ids.length && p.ids.every((id) => o.includes(id)) ? o : p.ids;
};
for (const p of POOLS) orderOf(p).forEach((id, i) => POS.set(id, p.slots[i]));
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
 * 線の曲げ方（どれも 3 次ベジェで描く。制御点は線を 3 等分した点から横へずらす。線の向きには進むだけなので、弧が線の上で折り返さない）。
 * - 数 m：左右対称のゆるい弧（2 次ベジェの制御点を真ん中から横へ m×2 と同じ。いちばん膨らむ所で線から m。正は進む向きの左。0 はまっすぐ）
 * - { h1, h2 }：根もと側・先側の制御点を、それぞれ横へ h1・h2 ずらした弧（左右で膨らみが違う弧や、ゆるい S 字）。
 *   左右対称の弧ではどう曲げてもほかのパネルを横切る線だけ、パネルのすき間を縫うのに使う
 */
export type Bend = number | { h1: number; h2: number };
/** 曲げの大きさの上限（弧が、まっすぐな線からいちばん離れる所の距離。単位：UNIT） */
export const BEND_MAX = 1.6;
/** 線とパネルのすき間：ひし形（L1 の半径 PANEL / 2）のまわりに、この余白を足した形を横切らない */
export const EDGE_CLEAR = 0.06;
/** 弧の横のずれ（線からの距離。t は 0〜1） */
const sideAt = (h1: number, h2: number, t: number) => 3 * (1 - t) * t * ((1 - t) * h1 + t * h2);
/** 弧が、まっすぐな線からいちばん離れる所の距離 */
export const bendSize = (m: Bend) => {
  if (typeof m === 'number') return Math.abs(m);
  let d = 0;
  for (let i = 1; i < 40; i++) d = Math.max(d, Math.abs(sideAt(m.h1, m.h2, i / 40)));
  return d;
};
/** 左右で違う弧の候補（膨らみの小さい順。同じなら左右の差の小さい順）。左右対称の弧（h1 = h2）は先に試すので除く */
const TWO: { h1: number; h2: number }[] = [];
for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) if (i !== j) TWO.push({ h1: i / 5, h2: j / 5 });
const TWO_OK = TWO.map((m) => ({ m, d: bendSize(m) }))
  .filter((x) => x.d <= BEND_MAX + 1e-9)
  .sort((x, y) => x.d - y.d || Math.abs(x.m.h1 - x.m.h2) - Math.abs(y.m.h1 - y.m.h2))
  .map((x) => x.m);
/**
 * 線が、ほかのパネルの上を横切るときは、ゆるい弧にする（曲げ方。横切るパネルが無ければ 0）。
 * 1. 左右対称の弧：曲げる量を 0.1 刻みで左右交互に試し、横切るパネルが 0 になる最小の曲げ。
 * 2. それでも横切るなら、左右で膨らみの違う弧（TWO_OK）を膨らみの小さい順に試し、横切るパネルが 0 になる最初のもの。
 * どれでも横切るなら、左右対称の弧のうち横切るパネルがいちばん少ないもの（テストで 0 本を確かめる）
 */
export function edgeBend(a: { x: number; y: number }, b: { x: number; y: number }, skip: (id: string) => boolean, hubs: HubBox[] = [], at: Map<string, { x: number; y: number }> = POS): Bend {
  // 近くのパネルだけ調べる（弧は線から BEND_MAX より離れない。その外＋ひし形の半分は見ない）。at：パネルの位置（並びを探すとき・段 UI5b のつながりの見直しは、試しの位置で）
  const pad = BEND_MAX + PANEL;
  const near = [...at].filter(([id, p]) => !skip(id) && p.x > Math.min(a.x, b.x) - pad && p.x < Math.max(a.x, b.x) + pad && p.y > Math.min(a.y, b.y) - pad && p.y < Math.max(a.y, b.y) + pad);
  const nearHubs = hubs.filter((p) => p.x > Math.min(a.x, b.x) - pad - p.w && p.x < Math.max(a.x, b.x) + pad + p.w && p.y > Math.min(a.y, b.y) - pad - p.h && p.y < Math.max(a.y, b.y) + pad + p.h);
  // 判定はテスト（折れ線にして 120 区間）よりほんの少し広い余白で（細かさの違いで、かすめる線を見落とさない）
  const rOf = (id: string) => halfOf(id) + EDGE_CLEAR + 0.005;
  const sq = (id: string) => shapeById(id) === 'square';
  // パネルを横切らないのが先（札の下を通るのは、パネルを横切るより軽い）
  const hits = (m: Bend) => {
    const pts = curvePoly(a, b, m);
    return near.filter(([id, p]) => polyNear(pts, p, rOf(id), sq(id))).length * 10 + nearHubs.filter((p) => polyInBox(pts, p, p)).length;
  };
  let bestN = hits(0);
  if (!bestN) return 0;
  let best: Bend = 0;
  for (let k = 1; k <= BEND_MAX * 10 + 1e-9; k++)
    for (const m of [k / 10, -k / 10]) {
      const n = hits(m);
      if (!n) return m;
      if (n < bestN) {
        best = m;
        bestN = n;
      }
    }
  for (const m of TWO_OK) {
    const pts = curvePoly(a, b, m);
    if (!near.some(([id, p]) => polyNear(pts, p, rOf(id), sq(id))) && !nearHubs.some((p) => polyInBox(pts, p, p))) return m;
  }
  return best;
}
/** 部門の札の位置と大きさ */
export type HubBox = { d: DeptId; x: number; y: number; w: number; h: number };
/** 線の下に来ないようにする、ほかの部門の札（根もと（札・束の節）から出る線の、その部門の札は除く） */
export function hubsAround(e: TreeEdge): HubBox[] {
  const own = e.from == null ? (GROUP_OF.get(e.g)?.dept ?? (e.g as DeptId)) : null;
  return [...HUBPOS].filter(([d]) => d !== own).map(([d, p]) => ({ d, ...p, ...hubClear(d) }));
}
let bends: Map<TreeEdge, Bend> | null = null;
/** どの線をどれだけ曲げるか（配置は変わらないので、はじめて使うときに 1 回だけ数える） */
export function edgeBends(): Map<TreeEdge, Bend> {
  if (bends) return bends;
  bends = new Map();
  for (const e of EDGES) {
    const m = edgeBend(edgeEnd(e.from, e.g), edgeEnd(e.to, e.g), (id) => id === e.from || id === e.to, hubsAround(e));
    if (m) bends.set(e, m);
  }
  return bends;
}
/** 弧の 2 つの制御点（3 次ベジェ）。左右対称の弧 m は、h1 = h2 = m × 4/3（2 次ベジェの制御点を真ん中から横へ m×2 と同じ形） */
export function curveCtrl(a: { x: number; y: number }, b: { x: number; y: number }, m: Bend) {
  const h1 = typeof m === 'number' ? (m * 4) / 3 : m.h1;
  const h2 = typeof m === 'number' ? (m * 4) / 3 : m.h2;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  return {
    c1: { x: a.x + (b.x - a.x) / 3 + nx * h1, y: a.y + (b.y - a.y) / 3 + ny * h1 },
    c2: { x: b.x - (b.x - a.x) / 3 + nx * h2, y: b.y - (b.y - a.y) / 3 + ny * h2 },
  };
}
/** 弧の上の点（t は 0〜1） */
export function curveAt(a: { x: number; y: number }, b: { x: number; y: number }, m: Bend, t: number) {
  const { c1, c2 } = curveCtrl(a, b, m);
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return { x: w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x, y: w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y };
}
/** 弧の [t0, t1] の部分（3 次ベジェの 4 点。縁で切った線を描く） */
export function curvePart(a: { x: number; y: number }, b: { x: number; y: number }, m: Bend, t0: number, t1: number) {
  const { c1, c2 } = curveCtrl(a, b, m);
  // blossom：P(u, v, w) = 3 次ベジェの極形式。部分の制御点は P(t0,t0,t0)・P(t0,t0,t1)・P(t0,t1,t1)・P(t1,t1,t1)
  const P = (u: number, v: number, w: number) => {
    const q = [a, c1, c2, b];
    const lerp = (p: { x: number; y: number }, r: { x: number; y: number }, t: number) => ({ x: p.x + (r.x - p.x) * t, y: p.y + (r.y - p.y) * t });
    const l1 = [lerp(q[0], q[1], u), lerp(q[1], q[2], u), lerp(q[2], q[3], u)];
    const l2 = [lerp(l1[0], l1[1], v), lerp(l1[1], l1[2], v)];
    return lerp(l2[0], l2[1], w);
  };
  return [P(t0, t0, t0), P(t0, t0, t1), P(t0, t1, t1), P(t1, t1, t1)];
}
/** 点 p と線分 q0–q1 の L1 の距離（L1 の距離は線分の上で凸の折れ線なので、両端と折れ目だけ調べる） */
function l1Seg(p: { x: number; y: number }, q0: { x: number; y: number }, q1: { x: number; y: number }) {
  const dx = q1.x - q0.x;
  const dy = q1.y - q0.y;
  let best = Math.min(Math.abs(q0.x - p.x) + Math.abs(q0.y - p.y), Math.abs(q1.x - p.x) + Math.abs(q1.y - p.y));
  for (const t of [dx ? (p.x - q0.x) / dx : -1, dy ? (p.y - q0.y) / dy : -1]) if (t > 0 && t < 1) best = Math.min(best, Math.abs(q0.x + dx * t - p.x) + Math.abs(q0.y + dy * t - p.y));
  return best;
}
/** 弧を 60 区間の折れ線に */
export function curvePoly(a: { x: number; y: number }, b: { x: number; y: number }, m: Bend) {
  const { c1, c2 } = curveCtrl(a, b, m);
  const pts = [a];
  for (let i = 1; i <= 60; i++) {
    const t = i / 60;
    const u = 1 - t;
    pts.push({ x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y });
  }
  return pts;
}
/** 折れ線が、点 p のひし形（L1 の半径 r）に入るか（区間ごとに。区間の箱から離れていれば調べない） */
export function polyNear(pts: { x: number; y: number }[], p: { x: number; y: number }, r: number, square = false) {
  for (let i = 1; i < pts.length; i++) {
    const q0 = pts[i - 1];
    const q1 = pts[i];
    if (p.x + r < Math.min(q0.x, q1.x) || p.x - r > Math.max(q0.x, q1.x) || p.y + r < Math.min(q0.y, q1.y) || p.y - r > Math.max(q0.y, q1.y)) continue;
    if ((square ? linfSeg(p, q0, q1) : l1Seg(p, q0, q1)) < r) return true;
  }
  return false;
}
/** 点 p と線分 q0–q1 の L∞ の距離（四角のパネル。|dx| と |dy| が等しくなる所と両端を調べる） */
export function linfSeg(p: { x: number; y: number }, q0: { x: number; y: number }, q1: { x: number; y: number }) {
  const dx = q1.x - q0.x;
  const dy = q1.y - q0.y;
  const f = (t: number) => Math.max(Math.abs(q0.x + dx * t - p.x), Math.abs(q0.y + dy * t - p.y));
  let best = Math.min(f(0), f(1));
  // |q.x − p.x| = |q.y − p.y| になる t（4 通り）
  const ax = q0.x - p.x;
  const ay = q0.y - p.y;
  for (const sg of [1, -1]) {
    const den = dx - sg * dy;
    if (Math.abs(den) > 1e-12) {
      const t = -(ax - sg * ay) / den;
      if (t > 0 && t < 1) best = Math.min(best, f(t));
    }
    const den2 = dx + sg * dy;
    if (Math.abs(den2) > 1e-12) {
      const t = -(ax + sg * ay) / den2;
      if (t > 0 && t < 1) best = Math.min(best, f(t));
    }
  }
  return best;
}
/** 折れ線が、中心 c・大きさ box の札（長方形）の中を通るか（区間ごとに、長方形で切り取って調べる） */
export function polyInBox(pts: { x: number; y: number }[], c: { x: number; y: number }, box: { w: number; h: number }) {
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
      const t = d / q;
      if (q < 0) lo = Math.max(lo, t);
      else hi = Math.min(hi, t);
    }
    if (ok && lo <= hi) return true;
  }
  return false;
}
/** 弧が、点 p のひし形（L1 の半径 r）に入るか（弧を 60 区間の折れ線にして、区間ごとに調べる。点だけで調べると、ひし形の角をかすめる線を見落とす） */
export const curveNear = (a: { x: number; y: number }, b: { x: number; y: number }, m: Bend, p: { x: number; y: number }, r: number) => polyNear(curvePoly(a, b, m), p, r);

export const BOUNDS = [...POS.values()].reduce((b, p) => ({ x0: Math.min(b.x0, p.x), x1: Math.max(b.x1, p.x), y0: Math.min(b.y0, p.y), y1: Math.max(b.y1, p.y) }), { x0: 0, x1: 0, y0: 0, y1: 0 });
