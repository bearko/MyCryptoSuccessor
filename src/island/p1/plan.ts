/**
 * 担当者からの提案書（段 UI5a。DOM なし：proposalui.ts・card.ts・deleg.ts・report.ts・自動プレイ・テストが使う）。
 * 1 つの提案（いまある手 PropAct）を、それを打つと一緒に変わるもの全部（棚の増設・作業台の追加と切り替え・担当の持ち場・調達の品目と素材の注文・
 * 主力商品・パネル・建築・従業員）に広げた「変更の中身」（Plan）にまとめる。
 * - 提案書の画面（As-Is ／ To-Be・期待効果・導入コスト）はこの Plan から作る（planRows・planEffect・planCost）。
 * - 承認したときも、カードで選んだときも、店長・職人への指示で手で選んだときも、同じ applyPlan で一気に実行する。
 * 効き目・値段はいまの手のまま（deleg.ts の execute・model.ts の invest・order・assign・setMain）。
 * 仕様は docs/ISLAND_PHASE1.md「担当者からの提案書（段 UI5a）」。
 */
import { t } from '../../i18n';
import { DEF } from '../defs';
import { ADS, CLEAR, DELEG, INVEST, MATS, P1B, PRODUCT, SKILL, isResearch, rpCost, sku, type DeptId, type Mat, type Sku } from './data';
import {
  DAYS,
  LOT,
  assign,
  craftCheck,
  has,
  hasRoute,
  invLv,
  investCost,
  invest,
  matPrice,
  madeSkus,
  myShops,
  myWorkshop,
  order,
  partMax,
  poolFree,
  priceOf,
  procLeft,
  recipeOf,
  sellNow,
  setMain,
  stageCaps,
  staffOf,
  syncShelves,
  goodsSales,
  adCost,
  syncFacilities,
  syncShop,
  setClear,
  useUp,
  lotsHave,
  batchOf,
  clearSkus,
  poolRate,
  poolUsed,
  poolCap,
  poolParts,
  myWarehouses,
  stockAll,
  type P1State,
  type Stage,
} from './model';
import { execute, heroNm, newDeleg, type PropAct } from './deleg';
import { grossRate, goodsName, partMonthly } from './moves';

// ---------------------------------------------------------------- 型

/** 変更の 1 つ（実行の順に並べる） */
export type Step =
  /** いまある手（パネル・設備投資・建築・雇う・宣伝・アルバイト・名物店主・発掘許可 ほか）をそのまま */
  | { k: 'act'; a: PropAct }
  /** お店の棚を 1 段増やす（設備投資「棚」） */
  | { k: 'shelf'; uid: number }
  /** 工房の作業台を 1 台足す（設備投資「作業台」） */
  | { k: 'bench' }
  /** 作業台 slot に職人 hero を置く（待機中の人） */
  | { k: 'worker'; slot: number; hero: number }
  /** 作業台 slot で x を作る（動いていれば、いまのロットが終わってから） */
  | { k: 'make'; slot: number; x: Sku }
  /** 素材を lots ロット注文する（作り始めに切らさないように） */
  | { k: 'order'; m: Mat; lots: number }
  /** お店の主力商品を x に */
  | { k: 'main'; uid: number; x: Sku }
  /** お店の従業員（アルバイト）を n 人に（控室の増設が要るときは別の act で先に） */
  | { k: 'staff'; uid: number; n: number }
  /** 段 UI5c：お店の方針「在庫を優先して売りさばく」（cut：値引きの段の番号。null でオフ） */
  | { k: 'clear'; uid: number; cut: number | null }
  /** 段 UI5c：作業台 slot で、手持ちの素材で作れるだけ x を作る（作り終えたらいまの商品に戻る） */
  | { k: 'useup'; slot: number; x: Sku };

export interface Plan {
  /** 話し手（担当者）と読みの確かさ（出来）・部門 */
  hero: number | null;
  q: number;
  dept: DeptId | null;
  /** もとの手（提案の 1 行の名前・カードの選択肢と結ぶ） */
  acts: PropAct[];
  steps: Step[];
  /** 新しく並ぶ・作る商品（As-Is／To-Be の商品の行） */
  goods?: Sku[];
  /** 入れ替えで作らなくなる商品 */
  drop?: Sku | null;
}

// ---------------------------------------------------------------- 広げる（PropAct → Plan）

const isFree = (s: P1State, hero: number) => {
  const st = staffOf(s, hero);
  return !!st && st.task == null && !st.resting;
};
/** 作業台に置ける待機中の人（製造の適性の高い順） */
function freeCrafter(s: P1State, x: Sku, used: Set<number>): number | null {
  const xs = s.staff.filter((st) => st.task == null && !st.resting && !used.has(st.hero) && !craftBlocks(craftCheck(s, x, st.hero)));
  xs.sort((a, b) => b.stats.agi + b.stats.int - (a.stats.agi + a.stats.int));
  return xs[0]?.hero ?? null;
}
const craftBlocks = (e: string | null) => !!e && e !== 'mats' && e !== 'full';

/** 作り始めに要る素材の注文（ルートがあり、手元と注文中で 2 ロットぶんに足りない素材を 1 ロットずつ） */
function ordersFor(s: P1State, x: Sku): Step[] {
  const out: Step[] = [];
  for (const [m, q] of Object.entries(recipeOf(x)) as [Mat, number][]) {
    if (!hasRoute(s, m)) continue;
    const have = (s.mats[m] ?? 0) + (s.orders ?? []).filter((o) => o.m === m).reduce((a, o) => a + o.qty, 0);
    if (have >= (q ?? 0) * 2) continue;
    out.push({ k: 'order', m, lots: Math.max(1, Math.ceil(((q ?? 0) * 2 - have) / LOT)) });
  }
  return out;
}

/**
 * 商品 x を作る段取り：もう作っていれば何もしない。make（替える台）があればそこ、無ければ作業台を足して待機中の人を置く。
 * 素材の注文も添える。作れなければ空
 */
function makeSteps(s: P1State, x: Sku, make: number | undefined, used: Set<number>, bench = false): Step[] {
  if (madeSkus(s).includes(x)) return [];
  const out: Step[] = [];
  // 替える台が無く、作業台も足さない（在庫を売り切るだけの手）
  if ((make == null || !s.slots[make]) && !bench) return [];
  if (make != null && s.slots[make]) {
    out.push({ k: 'make', slot: make, x });
    if (s.slots[make].worker == null) {
      const h = freeCrafter(s, x, used);
      if (h != null) {
        used.add(h);
        out.push({ k: 'worker', slot: make, hero: h });
      }
    }
  } else {
    const ws = myWorkshop(s);
    const h = freeCrafter(s, x, used);
    if (!ws || investCost(ws, 'bench') == null || h == null) return [];
    used.add(h);
    const slot = s.slots.length;
    out.push({ k: 'bench' }, { k: 'worker', slot, hero: h }, { k: 'make', slot, x });
  }
  out.push(...ordersFor(s, x));
  return out;
}

/** 手 1 つを、一緒に変わるもの全部に広げる */
export function stepsOf(s: P1State, a: PropAct, used = new Set<number>()): { steps: Step[]; goods?: Sku[]; drop?: Sku | null } {
  switch (a.k) {
    case 'stock': {
      const x = sku(a.key, a.rar);
      const sh = s.shops[a.uid];
      const steps: Step[] = [];
      if (a.add) steps.push({ k: 'shelf', uid: a.uid });
      // 入れ替え（空き棚でない棚）：その棚の商品を作っている台を替える（ほかの台でも作っていれば、その台はそのまま）
      const prev = !a.add && sh ? sh.shelves[a.idx] ?? null : null;
      let make = a.make;
      if (prev && make == null) {
        const k = s.slots.findIndex((sl) => sl.sku === prev);
        if (k >= 0) make = k;
      }
      steps.push(...makeSteps(s, x, make, used, a.make === -1));
      // 主力を入れ替えるとき（1 番目の棚）は、新しい商品を主力に
      if (prev && sh?.shelves[0] === prev) steps.push({ k: 'main', uid: a.uid, x });
      const drop = make != null && s.slots[make]?.sku && s.slots[make].sku !== x && s.slots.filter((sl) => sl.sku === s.slots[make!].sku).length === 1 ? s.slots[make].sku : null;
      return { steps, goods: [x], drop };
    }
    case 'part': {
      const sh = s.shops[a.uid];
      return { steps: sh ? [{ k: 'staff', uid: a.uid, n: sh.part + 1 }] : [] };
    }
    case 'staff': {
      const sh = s.shops[a.uid];
      if (!sh) return { steps: [] };
      // 控室が要る人数なら、先に控室を増設する
      const steps: Step[] = partMax(s, a.uid) < a.n ? [{ k: 'act', a: { k: 'invest', id: 'staffroom', uid: a.uid } }] : [];
      steps.push({ k: 'staff', uid: a.uid, n: a.n });
      return { steps };
    }
    case 'skill': {
      const steps: Step[] = [{ k: 'act', a }];
      // 調達の交代要員：待機中の人がいれば、2 人目の調達係に置く
      if (a.id === 'relief') {
        const h = s.staff.filter((st) => st.task == null && !st.resting && !used.has(st.hero)).sort((p, q) => q.stats.agi - p.stats.agi)[0];
        if (h) {
          used.add(h.hero);
          steps.push({ k: 'act', a: { k: 'assign', hero: h.hero, task: 'buy', target: null } });
        }
      }
      return { steps };
    }
    case 'build': {
      // お店を出す：売り場の人つき（待機中の人がいれば店長に、従業員 1 人。毎月の費用は従業員の分）
      const steps: Step[] = [{ k: 'act', a }];
      if (P1B[a.id]?.kind === 'shop') {
        const h = s.staff.filter((st) => st.task == null && !st.resting && !used.has(st.hero)).sort((p, q) => q.stats.int + q.stats.agi - (p.stats.int + p.stats.agi))[0];
        if (h) {
          used.add(h.hero);
          steps.push({ k: 'act', a: { k: 'assign', hero: h.hero, task: 'shop', target: -1 } });
        }
        steps.push({ k: 'staff', uid: -1, n: 1 });
      }
      return { steps };
    }
    case 'clear': {
      const uids = a.uid === -1 ? myShops(s).map((b) => b.uid).filter((u) => s.shops[u]) : [a.uid];
      return { steps: uids.map((uid) => ({ k: 'clear' as const, uid, cut: a.cut })) };
    }
    case 'useup': {
      const x = sku(a.key, a.rar);
      return { steps: [{ k: 'useup', slot: a.slot, x }], goods: [x] };
    }
    default:
      return { steps: [{ k: 'act', a }] };
  }
}

/** 提案書（Plan）を作る。acts：提案の手（1〜3 つ。2 つ目からは同じ担当のほかの改善案） */
export function planOf(s: P1State, acts: PropAct[], who: { hero: number | null; q?: number; dept?: DeptId | null } = { hero: null }): Plan {
  const used = new Set<number>();
  const steps: Step[] = [];
  const goods: Sku[] = [];
  let drop: Sku | null = null;
  for (const a of acts) {
    const r = stepsOf(s, a, used);
    // 同じ注文は 1 つに
    for (const st of r.steps) {
      if (st.k === 'order') {
        const same = steps.find((y) => y.k === 'order' && y.m === st.m) as Extract<Step, { k: 'order' }> | undefined;
        if (same) {
          same.lots = Math.max(same.lots, st.lots);
          continue;
        }
      }
      steps.push(st);
    }
    goods.push(...(r.goods ?? []));
    drop ??= r.drop ?? null;
  }
  return { hero: who.hero, q: who.q ?? DELEG.q.lo, dept: who.dept ?? null, acts, steps, ...(goods.length ? { goods } : {}), drop };
}

/** 手で選んだ変更（工房の作る物・主力・従業員）を Plan に（同じ applyPlan で実行する） */
export const manualPlan = (steps: Step[], hero: number | null = null): Plan => ({ hero, q: DELEG.q.lo, dept: null, acts: [], steps });

// ---------------------------------------------------------------- 導入コスト

export interface PlanCost {
  /** 1 回の費用（G）・研究ポイント・毎月の費用（G）・建築の日数 */
  money: number;
  rp: number;
  monthly: number;
  days: number;
  /** 払うものの内訳（「棚の増設 1,500 G」） */
  items: { label: string; money?: number; rp?: number; monthly?: number; days?: number }[];
}
const nameOfB = (id: string) => DEF[id]?.name ?? id;
const shopNm = (s: P1State, uid: number) => {
  const b = s.buildings.find((x) => x.uid === uid);
  const all = myShops(s).filter((x) => x.id === b?.id);
  return b ? (all.length > 1 ? `${nameOfB(b.id)} ${all.indexOf(b) + 1}` : nameOfB(b.id)) : t('お店', 'Shop');
};
const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;
/** 増えたものの印（To-Be の「＋」） */
const PLUS = () => t('＋', '+');
const COLON = () => t('：', ': ');

export function planCost(s: P1State, p: Plan): PlanCost {
  const c: PlanCost = { money: 0, rp: 0, monthly: 0, days: 0, items: [] };
  const add = (label: string, x: { money?: number; rp?: number; monthly?: number; days?: number }) => {
    c.money += x.money ?? 0;
    c.rp += x.rp ?? 0;
    c.monthly += x.monthly ?? 0;
    c.days = Math.max(c.days, x.days ?? 0);
    c.items.push({ label, ...x });
  };
  // 同じ建物の設備を 2 段上げるときの 2 段目の値段
  const lv: Record<string, number> = {};
  const investAt = (uid: number, id: string) => {
    const b = s.buildings.find((x) => x.uid === uid);
    if (!b) return null;
    const k = `${uid}:${id}`;
    const n = lv[k] ?? 0;
    lv[k] = n + 1;
    return investCost({ ...b, inv: { ...b.inv, [id]: invLv(b, id) + n } }, id);
  };
  for (const st of p.steps) {
    switch (st.k) {
      case 'shelf': {
        const v = investAt(st.uid, 'shelves');
        if (v != null) add(t(`棚の増設（${shopNm(s, st.uid)}）`, `Extra shelf (${shopNm(s, st.uid)})`), { money: v });
        break;
      }
      case 'bench': {
        const ws = myWorkshop(s);
        const v = ws ? investAt(ws.uid, 'bench') : null;
        if (v != null) add(t('作業台の増設', 'Extra workbench'), { money: v });
        break;
      }
      case 'worker':
        add(t(`持ち場の移動：${heroNm(st.hero)} → 作業台 ${st.slot + 1}`, `Move ${heroNm(st.hero)} → bench ${st.slot + 1}`), {});
        break;
      case 'order':
        add(t(`素材の注文：${MATS[st.m].name} ×${st.lots * LOT}`, `Materials: ${MATS[st.m].name} ×${st.lots * LOT}`), { money: matPrice(s, st.m) * st.lots * LOT });
        break;
      case 'staff': {
        const sh = s.shops[st.uid];
        const more = Math.max(0, st.n - (sh?.part ?? 0));
        if (more > 0) add(t(`従業員 +${more} 人（${shopNm(s, st.uid)}）`, `+${more} staff (${shopNm(s, st.uid)})`), { monthly: more * partMonthly() });
        break;
      }
      case 'clear':
        if (st.cut != null && (CLEAR.cuts[st.cut] ?? 0) > 0) add(t(`値引き ${Math.round(CLEAR.cuts[st.cut] * 10)} 割（${shopNm(s, st.uid)}・在庫品だけ）`, `${Math.round(CLEAR.cuts[st.cut] * 100)}% off (${shopNm(s, st.uid)}, stock items only)`), {});
        break;
      case 'useup':
        add(t(`作業台 ${st.slot + 1}：手持ちの素材で${goodsName(st.x)}×${lotsHave(s, st.x) * batchOf(st.x, s)}（素材は買い足さない）`, `Bench ${st.slot + 1}: ${goodsName(st.x)} ×${lotsHave(s, st.x) * batchOf(st.x, s)} from stock (no new materials)`), {});
        break;
      case 'act': {
        const a = st.a;
        if (a.k === 'invest') {
          const v = investAt(a.uid, a.id);
          if (v != null) add(t(`${INVEST[a.id]?.name ?? a.id}（${nameOfB(s.buildings.find((x) => x.uid === a.uid)?.id ?? '')}）`, `${INVEST[a.id]?.name ?? a.id}`), { money: v });
        } else if (a.k === 'skill') {
          const k = SKILL[a.id];
          if (k) add(t(`パネルの解放「${k.name}」`, `Unlock panel: ${k.name}`), isResearch(k) ? { rp: rpCost(k) } : { money: k.cost });
        } else if (a.k === 'build') {
          add(t(`${nameOfB(a.id)}の建築`, `Build ${nameOfB(a.id)}`), { money: P1B[a.id]?.cost ?? 0, days: P1B[a.id]?.days ?? 0, ...(P1B[a.id]?.upkeep ? { monthly: P1B[a.id].upkeep } : {}) });
        } else if (a.k === 'hire') {
          add(t(`${heroNm(a.hero)}を雇う`, `Hire ${heroNm(a.hero)}`), { monthly: 0 });
        } else if (a.k === 'assign') {
          add(t(`持ち場の移動：${heroNm(a.hero)}`, `Move ${heroNm(a.hero)}`), {});
        } else if (a.k === 'ad') {
          const ad = ADS.find((x) => x.id === a.id);
          add(t(`宣伝「${ad?.name ?? a.id}」`, `Ad: ${ad?.name ?? a.id}`), { money: adCost(s, a.id) });
        } else if (a.k === 'part') {
          add(t('従業員 +1 人', '+1 staff'), { monthly: partMonthly() });
        } else if (a.k === 'famous') {
          const k = SKILL.d_shop;
          if (!has(s, 'd_shop') && k) add(t(`パネルの解放「${k.name}」`, `Unlock panel: ${k.name}`), isResearch(k) ? { rp: rpCost(k) } : { money: k.cost });
        } else if (a.k === 'level') {
          const k = SKILL[a.id];
          if (k) add(t(`パネルのレベル上げ「${k.name}」`, `Level up: ${k.name}`), {});
        } else add(t('実行', 'Do it'), {});
        break;
      }
      default:
        break;
    }
  }
  return c;
}

/** 払えないもの（承認を押せない理由。赤で）。無ければ空 */
export function planBlock(s: P1State, p: Plan, c = planCost(s, p)): string[] {
  const out: string[] = [];
  if (c.money > s.money) out.push(t(`資金不足（あと ${g(c.money - s.money)}）`, `${g(c.money - s.money)} short`));
  if (c.rp > (s.rp ?? 0)) out.push(t(`研究ポイント不足（あと ${c.rp - (s.rp ?? 0)} RP）`, `${c.rp - (s.rp ?? 0)} RP short`));
  for (const st of p.steps) {
    if (st.k === 'order' && st.lots * LOT > Math.min(procLeft(s), poolFree(s) + 0)) {
      out.push(procLeft(s) < st.lots * LOT ? t('今月の調達の上限に届いています', 'This month’s buying limit is reached') : t('素材の置き場所が足りません', 'Not enough storage for materials'));
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- 実行（一気に）

export interface PlanRes {
  ok: boolean;
  err?: 'money' | 'rp' | 'gone';
  /** やったこと（トーストのまとめ。「棚 2 段目にリボン・作業台 2 でリボン（担当 ▲▲）・素材 □□×50 を注文」） */
  did: string[];
}

/** 1 つずつ実行する（払えないものがあれば、何もせず money／rp を返す）。素材の注文が置き場所・上限で入らなかったときは飛ばす */
export function applyPlan(s: P1State, p: Plan): PlanRes {
  const c = planCost(s, p);
  if (c.money > s.money) return { ok: false, err: 'money', did: [] };
  if (c.rp > (s.rp ?? 0)) return { ok: false, err: 'rp', did: [] };
  const did: string[] = [];
  let core = 0;
  let fail: PlanRes['err'] | null = null;
  /** この提案で建てたお店（uid -1 の行き先） */
  let built: number | null = null;
  const uidOf = (u: number) => (u === -1 ? built : u);
  for (const st0 of p.steps) {
    let st = st0;
    if (st.k === 'staff' && st.uid === -1) {
      const u = uidOf(-1);
      if (u == null) continue;
      st = { ...st, uid: u };
    }
    if (st.k === 'act' && st.a.k === 'assign' && st.a.task === 'shop' && st.a.target === -1) {
      const u = uidOf(-1);
      if (u == null) continue;
      st = { ...st, a: { ...st.a, target: u } };
    }
    switch (st.k) {
      case 'shelf': {
        const e = invest(s, st.uid, 'shelves');
        if (e) fail ??= e === 'money' ? 'money' : 'gone';
        else {
          core++;
          did.push(t(`${shopNm(s, st.uid)}の棚を ${s.shops[st.uid]?.shelves.length ?? 0} 段に`, `${shopNm(s, st.uid)} now has ${s.shops[st.uid]?.shelves.length ?? 0} shelves`));
        }
        break;
      }
      case 'bench': {
        const ws = myWorkshop(s);
        const e = ws ? invest(s, ws.uid, 'bench') : 'gone';
        if (e) fail ??= e === 'money' ? 'money' : 'gone';
        else {
          core++;
          did.push(t(`作業台 ${s.slots.length} を増設`, `Added bench ${s.slots.length}`));
        }
        break;
      }
      case 'worker': {
        if (!s.slots[st.slot] || !isFree(s, st.hero)) break;
        if (!assign(s, st.hero, 'craft', st.slot)) did.push(t(`作業台 ${st.slot + 1} の担当に${heroNm(st.hero)}`, `${heroNm(st.hero)} on bench ${st.slot + 1}`));
        break;
      }
      case 'make': {
        const sl = s.slots[st.slot];
        if (!sl) {
          fail ??= 'gone';
          break;
        }
        // 段 UI5c：使い切りの製造をしていた台は、ふつうの自動製造に
        delete sl.back;
        if (sl.sku !== st.x) {
          if (sl.running) (s.deleg ??= newDeleg()).pend[st.slot] = st.x;
          else Object.assign(sl, { sku: st.x, repeat: true, left: 0, progress: 0 });
          if (s.proc.items.length && !s.proc.items.includes(st.x)) s.proc.items.push(st.x);
          core++;
          did.push(
            sl.running
              ? t(`作業台 ${st.slot + 1} は、いまのロットのあと${goodsName(st.x)}に`, `Bench ${st.slot + 1} switches to ${goodsName(st.x)} after this lot`)
              : t(`作業台 ${st.slot + 1} で${goodsName(st.x)}${sl.worker != null ? `（担当 ${heroNm(sl.worker)}）` : ''}`, `Bench ${st.slot + 1} makes ${goodsName(st.x)}${sl.worker != null ? ` (${heroNm(sl.worker)})` : ''}`),
          );
        } else sl.repeat = true;
        break;
      }
      case 'order': {
        const e = order(s, st.m, st.lots);
        if (!e) did.push(t(`素材 ${MATS[st.m].name}×${st.lots * LOT} を注文`, `Ordered ${MATS[st.m].name} ×${st.lots * LOT}`));
        break;
      }
      case 'main': {
        if (setMain(s, st.uid, st.x)) {
          core++;
          did.push(t(`${shopNm(s, st.uid)}の主力を${goodsName(st.x)}に`, `${goodsName(st.x)} is now the main item at ${shopNm(s, st.uid)}`));
        }
        break;
      }
      case 'staff': {
        const sh = s.shops[st.uid];
        if (!sh) break;
        const n = Math.max(0, Math.min(partMax(s, st.uid), st.n));
        if (n !== sh.part) {
          sh.part = n;
          core++;
          did.push(t(`${shopNm(s, st.uid)}の従業員を ${n} 人に`, `${shopNm(s, st.uid)} staff: ${n}`));
        }
        break;
      }
      case 'clear': {
        const sh = s.shops[st.uid];
        if (!sh || sh.clear === (st.cut ?? undefined)) break;
        if (setClear(s, st.uid, st.cut)) {
          core++;
          did.push(st.cut == null ? t(`${shopNm(s, st.uid)}の売りさばきをやめた`, `${shopNm(s, st.uid)} stops clearing stock`) : t(`${shopNm(s, st.uid)}は在庫品を先に（${clearName(st.cut)}）`, `${shopNm(s, st.uid)} clears stock first (${clearName(st.cut)})`));
        }
        break;
      }
      case 'useup': {
        const n = useUp(s, st.slot, st.x);
        if (n > 0) {
          core++;
          did.push(t(`作業台 ${st.slot + 1} で${goodsName(st.x)}を ${n} 個（素材を使い切り）`, `Bench ${st.slot + 1} makes ${n} ${goodsName(st.x)} from stock`));
        } else fail ??= 'gone';
        break;
      }
      case 'act': {
        const before = s.nextUid;
        const e = execute(s, st.a);
        if (e === 'money' || e === 'rp') fail ??= e;
        else if (e) fail ??= 'gone';
        else {
          core++;
          did.push(actDid(s, st.a));
          if (st.a.k === 'build' && P1B[st.a.id]?.kind === 'shop') {
            const b = s.buildings.find((x) => x.uid >= before && x.owner === 'me' && x.id === (st.a as { id: string }).id);
            if (b) {
              built = b.uid;
              // 工事中でも、店長と従業員は先に決めておく（開店した日から開く）
              syncShop(s, b);
            }
          }
        }
        break;
      }
    }
  }
  // 棚は製造に連動（すぐ並べ替える。まだ 1 個もできていない商品は、できてから並ぶ）
  syncShelves(s);
  if (!core && fail) return { ok: false, err: fail, did };
  return { ok: true, did };
}
/** 実行した手の短い文（トーストのまとめ） */
function actDid(_s: P1State, a: PropAct): string {
  switch (a.k) {
    case 'skill':
      return t(`パネル「${SKILL[a.id]?.name ?? a.id}」を解放`, `Unlocked ${SKILL[a.id]?.name ?? a.id}`);
    case 'level':
      return t(`「${SKILL[a.id]?.name ?? a.id}」のレベルを上げた`, `Leveled up ${SKILL[a.id]?.name ?? a.id}`);
    case 'invest':
      return t(`${INVEST[a.id]?.name ?? a.id}を導入`, `Installed ${INVEST[a.id]?.name ?? a.id}`);
    case 'build':
      return t(`${nameOfB(a.id)}の建築を開始`, `Started building ${nameOfB(a.id)}`);
    case 'hire':
      return t(`${heroNm(a.hero)}を雇った`, `Hired ${heroNm(a.hero)}`);
    case 'assign':
      return t(`${heroNm(a.hero)}を持ち場へ`, `${heroNm(a.hero)} put to work`);
    case 'ad':
      return t(`宣伝「${ADS.find((x) => x.id === a.id)?.name ?? a.id}」を開始`, `Started ad: ${ADS.find((x) => x.id === a.id)?.name ?? a.id}`);
    case 'part':
      return t('従業員を 1 人増やした', 'Added 1 staff');
    case 'famous':
      return t('名物店主を置いた', 'Celebrity shopkeeper set');
    case 'permit':
      return t(`荒れ地 ${a.site + 1} の発掘許可`, `Permit for wasteland ${a.site + 1}`);
    case 'order':
      return t(`素材 ${MATS[a.m].name}×${a.lots * LOT} を注文`, `Ordered ${MATS[a.m].name} ×${a.lots * LOT}`);
    default:
      return t('実行した', 'Done');
  }
}

// ---------------------------------------------------------------- 見込み（As-Is ／ To-Be・期待効果）

/** 状態の写し（提案書の見込み用。元の状態は書き換えない） */
export const clone = (s: P1State): P1State => structuredClone(s);

/** その Plan を写しに当てた状態（お金・研究ポイントは足りるものとして。作り始めた商品は在庫があるものとして並べる） */
export function afterOf(s: P1State, p: Plan): P1State {
  const c = clone(s);
  c.money = Math.max(c.money, 0) + 1e9;
  c.rp = (c.rp ?? 0) + 1e6;
  applyPlan(c, p);
  // 建てた建物は、できあがったものとして見る
  for (const b of c.buildings) if (b.owner === 'me' && b.left > 0 && !s.buildings.some((x) => x.uid === b.uid)) b.left = 0;
  syncFacilities(c);
  // いまのロットが終わってから替わる台は、替わったあとで見る
  for (const [k, x] of Object.entries(c.deleg?.pend ?? {})) {
    const sl = c.slots[Number(k)];
    if (sl) Object.assign(sl, sl.back !== undefined ? { sku: x, running: false, progress: 0 } : { sku: x, running: false, repeat: true, left: 0, progress: 0 });
  }
  if (c.deleg) c.deleg.pend = {};
  syncShelves(c, true);
  c.money = s.money;
  c.rp = s.rp;
  return c;
}

export interface FlowNow {
  /** ひと月に売れる数（4 段のいちばん細いところ）・売上（G／月）・毎月の費用（素材代の割合 ＋ 毎月かかる費用）・利益 */
  units: number;
  sales: number;
  cost: number;
  profit: number;
  /** 商品ごと（ひと月の数・1 日の売上） */
  goods: { x: Sku; units: number; perDay: number }[];
  caps: Record<Stage, number>;
}
/** いまの流れ（月あたり）。売れる数は 4 段（調達・製造・物流・販売）の細いところで頭打ち */
export function flowOf(s: P1State, extraMonthly = 0, sellOnly = false): FlowNow {
  const c = stageCaps(s, true);
  const caps = { buy: c.buy.stopped ? 0 : c.buy.perMonth, craft: c.craft.stopped ? 0 : c.craft.perMonth, haul: c.haul.stopped ? 0 : c.haul.perMonth, sell: c.sell.stopped ? 0 : c.sell.perMonth } as Record<Stage, number>;
  const sold = sellNow(s);
  // 段 UI5c：在庫の売りさばき・使い切りの製造は、いまある在庫と素材を売る手なので、売り場の段だけで頭打ち（調達・製造が止まっていても売れる）
  const lim = sellOnly ? caps.sell : Math.min(caps.buy, caps.craft, caps.haul, caps.sell);
  const k = sold.units > 0 ? Math.min(1, lim / sold.units) : 0;
  const units = sold.units * k;
  const sales = sold.yen * k;
  const gs = goodsSales(s);
  const goods = Object.entries(gs).map(([x, v]) => ({ x: x as Sku, units: (v?.units ?? 0) * k, perDay: ((v?.units ?? 0) * k * priceOf(s, x as Sku)) / DAYS }));
  const cost = sales * (1 - grossRate(s)) + extraMonthly;
  return { units, sales, cost, profit: sales - cost, goods, caps };
}

export interface Effect {
  now: FlowNow;
  after: FlowNow;
  /** 誤差（±割合。担当の読みの確かさ ★ から） */
  err: number;
}
/** 期待効果：売上・コスト・利益の「今 → 後」（月あたり）。後の毎月の費用には、増えるアルバイト・維持費を入れる */
export function planEffect(s: P1State, p: Plan, after = afterOf(s, p)): Effect {
  const c = planCost(s, p);
  const so = stockPlan(p);
  return { now: flowOf(s, 0, so), after: flowOf(after, c.monthly, so), err: Math.round((1 - p.q) * DELEG.prop.err * 100) / 100 };
}

// ---------------------------------------------------------------- As-Is ／ To-Be の行

export type RowKind = 'shelf' | 'craft' | 'goods' | 'buy' | 'staff' | 'panel' | 'build' | 'ad' | 'other';
export interface Cell {
  /** 文（1 行）。plus：新しく増えたもの（「＋」と色） */
  text: string;
  plus?: boolean;
  /** 商品の行：アイコンと数字 */
  goods?: { x: Sku; units: number; perDay: number; plus?: boolean }[];
  /** 棚の行：お店のイメージ（段の数と並ぶ商品） */
  shelves?: (Sku | null)[];
}
export interface Row {
  kind: RowKind;
  label: string;
  asIs: Cell;
  toBe: Cell;
  changed: boolean;
}

const fmtUnits = (v: number) => `${Math.round(v)}`;
const benchText = (s: P1State, k: number) => {
  const sl = s.slots[k];
  if (!sl) return '—';
  const x = s.deleg?.pend?.[k] ?? sl.sku;
  const who = sl.worker != null ? heroNm(sl.worker) : t('担当なし', 'nobody');
  // 段 UI5c：使い切りの製造（作れるだけ作って、もとの商品に戻る）
  if (x && sl.back !== undefined) {
    // いま動いているロットが別の商品（ロットのあとに替わる）なら、数は替わったあとの分だけ
    const n = (sl.left ?? 0) + (sl.running && x === sl.sku ? batchOf(x, s) : 0);
    return sl.back ? t(`作業台 ${k + 1} で${goodsName(x)}を ${n} 個（素材を使い切り）→ そのあと${goodsName(sl.back)}`, `Bench ${k + 1}: ${n} ${goodsName(x)} from stock → then ${goodsName(sl.back)}`) : t(`作業台 ${k + 1} で${goodsName(x)}を ${n} 個（素材を使い切り）`, `Bench ${k + 1}: ${n} ${goodsName(x)} from stock`);
  }
  return x ? t(`作業台 ${k + 1} で${goodsName(x)}を${who}が担当`, `Bench ${k + 1}: ${goodsName(x)} by ${who}`) : t(`作業台 ${k + 1}：作るものなし`, `Bench ${k + 1}: idle`);
};
const matsText = (s: P1State, mats: Mat[]) => mats.map((m) => `${MATS[m].name}×${Math.round((s.mats[m] ?? 0) + (s.orders ?? []).filter((o) => o.m === m).reduce((a, o) => a + o.qty, 0))}`).join(t(' ／ ', ' / '));

/** As-Is（左）・To-Be（右）の行。変わらない段は「※ ○○は変更なし」の 1 行（unchanged）にまとめる */
export function planRows(s: P1State, p: Plan, after = afterOf(s, p)): { rows: Row[]; unchanged: string[] } {
  const rows: Row[] = [];
  const touched = new Set<Stage>();
  // 棚（お店ごと）
  const shopIds = new Set<number>();
  for (const st of p.steps) if (st.k === 'shelf' || st.k === 'main' || st.k === 'staff' || st.k === 'clear') shopIds.add(st.uid);
  if (p.goods?.length) for (const b of myShops(s)) if (after.shops[b.uid]?.shelves.some((x) => x && p.goods!.includes(x))) shopIds.add(b.uid);
  for (const uid of shopIds) {
    const a = s.shops[uid];
    const b = after.shops[uid];
    if (!a || !b) continue;
    const n0 = a.shelves.length;
    const n1 = b.shelves.length;
    const same = n0 === n1 && a.shelves.every((x, k) => x === b.shelves[k]);
    if (!same) {
      touched.add('sell');
      rows.push({
        kind: 'shelf',
        label: t(`棚（${shopNm(s, uid)}）`, `Shelves (${shopNm(s, uid)})`),
        asIs: { text: t(`${n0} 段`, `${n0}`), shelves: [...a.shelves] },
        toBe: { text: t(`${n1} 段`, `${n1}`), plus: n1 > n0, shelves: [...b.shelves] },
        changed: true,
      });
    }
    if (b.part !== a.part) {
      touched.add('sell');
      rows.push({ kind: 'staff', label: t(`従業員（${shopNm(s, uid)}）`, `Staff (${shopNm(s, uid)})`), asIs: { text: t(`${a.part} 人`, `${a.part}`) }, toBe: { text: t(`${b.part} 人`, `${b.part}`), plus: b.part > a.part }, changed: true });
    }
  }
  // 段 UI5c：販売の方針（在庫の売りさばき）と倉庫
  for (const st of p.steps) {
    if (st.k !== 'clear') continue;
    const a = s.shops[st.uid];
    const b = after.shops[st.uid];
    if (!a || !b) continue;
    touched.add('sell');
    rows.push({ kind: 'shelf', label: t(`売り方（${shopNm(s, st.uid)}）`, `Selling (${shopNm(s, st.uid)})`), asIs: { text: a.clear == null ? t('作っている商品から並べる', 'What we make goes first') : t(`在庫品を先に（${clearName(a.clear)}）`, `Stock first (${clearName(a.clear)})`) }, toBe: { text: b.clear == null ? t('作っている商品から並べる', 'What we make goes first') : t(`在庫品を先に（${clearName(b.clear)}）`, `Stock first (${clearName(b.clear)})`), plus: b.clear != null }, changed: a.clear !== b.clear });
  }
  if (p.steps.some((st) => st.k === 'clear' || st.k === 'useup')) {
    const it0 = clearSkus(s);
    const it1 = clearSkus(after);
    const gs = goodsSales(after);
    const sellOut = it1.reduce((a2, x) => a2 + Math.min(gs[x]?.units ?? 0, stockAll(after, x)), 0);
    const n0 = it0.reduce((a2, x) => a2 + stockAll(s, x), 0);
    const mk = p.steps.filter((x): x is Extract<Step, { k: 'useup' }> => x.k === 'useup');
    const matsUse = mk.reduce((a2, x) => a2 + Object.values(recipeOf(x.x)).reduce<number>((c, q) => c + (q ?? 0), 0) * lotsHave(s, x.x), 0);
    rows.push({
      kind: 'buy',
      label: t('倉庫', 'Storage'),
      asIs: { text: t(`${Math.round(poolRate(s) * 100)}%（${poolUsed(s)} / ${poolCap(s)} 個）・在庫品 ${n0} 個`, `${Math.round(poolRate(s) * 100)}% (${poolUsed(s)} / ${poolCap(s)}) · ${n0} stock items`) },
      toBe: { text: [matsUse > 0 ? t(`素材 −${matsUse} 個（商品にする）`, `−${matsUse} materials (made into goods)`) : '', sellOut > 0.5 ? t(`在庫品が月 ${Math.round(sellOut)} 個ほど売れていく`, `~${Math.round(sellOut)} stock items sell a month`) : ''].filter(Boolean).join(t('・', ' · ')) || t('—', '—'), plus: true },
      changed: true,
    });
  }
  // 段 UI5d：置き場所（倉庫・物流拠点を建てる・強化する手）。埋まり方の今 → 後
  const cap0 = poolCap(s);
  const cap1 = poolCap(after);
  if (cap1 !== cap0) {
    touched.add('buy');
    const used = poolUsed(s);
    const pc = (v: number) => Math.round((used / Math.max(1, v)) * 100);
    const parts = (x: P1State) => {
      const q = poolParts(x);
      return [t(`工房 ${q.base}`, `workshop ${q.base}`), q.warehouse ? t(`倉庫 ${q.warehouse}`, `warehouses ${q.warehouse}`) : '', q.depot ? t(`拠点 ${q.depot}`, `hub ${q.depot}`) : ''].filter(Boolean).join(t('・', ' · '));
    };
    rows.push({
      kind: 'buy',
      label: t('置き場所', 'Storage space'),
      asIs: { text: t(`${cap0} 個（${parts(s)}）・${pc(cap0)}% 埋まり`, `${cap0} (${parts(s)}) · ${pc(cap0)}% full`) },
      toBe: { text: t(`${cap1} 個（${cap1 > cap0 ? '+' : ''}${cap1 - cap0}）・${pc(cap1)}% 埋まり`, `${cap1} (${cap1 > cap0 ? '+' : ''}${cap1 - cap0}) · ${pc(cap1)}% full`), plus: cap1 > cap0 },
      changed: true,
    });
  }
  // 製造（作業台ごと）
  for (let k = 0; k < Math.max(s.slots.length, after.slots.length); k++) {
    const t0 = k < s.slots.length ? benchText(s, k) : null;
    const t1 = benchText(after, k);
    if (t0 === t1) continue;
    touched.add('craft');
    rows.push({ kind: 'craft', label: t('製造', 'Crafting'), asIs: { text: t0 ?? '—' }, toBe: { text: t0 == null ? `${PLUS()}${t1}` : t1, plus: t0 == null }, changed: true });
  }
  // 商品（売る商品：アイコン・ひと月の数・1 日の売上）
  const so = stockPlan(p);
  const f0 = flowOf(s, 0, so);
  const f1 = flowOf(after, 0, so);
  const k0 = new Set(f0.goods.filter((x) => x.units > 0.05).map((x) => x.x));
  const k1 = new Set(f1.goods.filter((x) => x.units > 0.05).map((x) => x.x));
  for (const x of madeSkus(after)) k1.add(x);
  // 作っているがまだ売れていない商品は、As-Is にも同じく入れる（変わっていないのに「＋」と出さない）
  for (const x of madeSkus(s)) if (k1.has(x)) k0.add(x);
  const goodsChanged = [...k1].some((x) => !k0.has(x)) || [...k0].some((x) => !k1.has(x));
  if (goodsChanged || p.goods?.length) {
    touched.add('sell');
    const row0 = [...k0].map((x) => ({ x, units: f0.goods.find((y) => y.x === x)?.units ?? 0, perDay: f0.goods.find((y) => y.x === x)?.perDay ?? 0 }));
    const row1 = [...k1].map((x) => ({ x, units: f1.goods.find((y) => y.x === x)?.units ?? 0, perDay: f1.goods.find((y) => y.x === x)?.perDay ?? 0, plus: !k0.has(x) }));
    rows.push({
      kind: 'goods',
      label: t('商品', 'Goods'),
      asIs: { text: row0.length ? row0.map((y) => goodsName(y.x)).join(t('・', ', ')) : t('なし', 'None'), goods: row0 },
      toBe: { text: row1.map((y) => `${y.plus ? PLUS() : ''}${goodsName(y.x)}`).join(t('・', ', ')), goods: row1, plus: row1.some((y) => y.plus) },
      changed: goodsChanged,
    });
  }
  // 調達（作っている商品の素材：手元と注文中の数）
  const orders = p.steps.filter((x): x is Extract<Step, { k: 'order' }> => x.k === 'order');
  const mats0 = [...new Set(madeSkus(s).flatMap((x) => Object.keys(recipeOf(x)) as Mat[]))];
  const mats1 = [...new Set(madeSkus(after).flatMap((x) => Object.keys(recipeOf(x)) as Mat[]))];
  if (orders.length || mats1.some((m) => !mats0.includes(m))) {
    touched.add('buy');
    const newM = mats1.filter((m) => !mats0.includes(m));
    rows.push({
      kind: 'buy',
      label: t('調達', 'Buying'),
      asIs: { text: mats0.length ? matsText(s, mats0) : t('なし', 'None') },
      toBe: { text: [mats0.length ? matsText(after, mats0.filter((m) => mats1.includes(m))) : '', ...newM.map((m) => `${PLUS()}${MATS[m].name}×${Math.round(after.mats[m] ?? 0) + (after.orders ?? []).filter((o) => o.m === m).reduce((a, o) => a + o.qty, 0)}`)].filter(Boolean).join(t(' ／ ', ' / ')), plus: newM.length > 0 || orders.length > 0 },
      changed: true,
    });
  }
  // そのほかの手（パネル・建築・宣伝・人）
  for (const st of p.steps) {
    if (st.k !== 'act') continue;
    const a = st.a;
    if (a.k === 'skill' || a.k === 'level' || a.k === 'famous') {
      const id = a.k === 'famous' ? 'd_shop' : a.id;
      if (a.k === 'famous' && has(s, 'd_shop')) {
        rows.push({ kind: 'other', label: t('名物店主', 'Celebrity'), asIs: { text: t('なし', 'None') }, toBe: { text: `${PLUS()}${shopNm(s, a.uid)}`, plus: true }, changed: true });
        touched.add('sell');
        continue;
      }
      rows.push({ kind: 'panel', label: t('パネル', 'Panel'), asIs: { text: a.k === 'level' ? `${SKILL[id]?.name} Lv ${(s.skillLv?.[id] ?? 1)}` : t('未解放', 'Locked') }, toBe: { text: a.k === 'level' ? `${SKILL[id]?.name} Lv ${(s.skillLv?.[id] ?? 1) + 1}` : `${PLUS()}${SKILL[id]?.name ?? id}`, plus: true }, changed: true });
    } else if (a.k === 'build') {
      rows.push({ kind: 'build', label: t('建物', 'Building'), asIs: { text: t('—', '—') }, toBe: { text: t(`＋${nameOfB(a.id)}（${P1B[a.id]?.days ?? 0} 日で完成）`, `+${nameOfB(a.id)} (${P1B[a.id]?.days ?? 0} days)`), plus: true }, changed: true });
      // 段 UI5d：倉庫は調達（置き場所）、物流拠点は物流の段
      const bk = P1B[a.id]?.kind;
      touched.add(bk === 'shop' ? 'sell' : bk === 'warehouse' ? 'buy' : bk === 'depot' ? 'haul' : 'craft');
    } else if (a.k === 'ad') {
      const ad = ADS.find((x) => x.id === a.id);
      rows.push({ kind: 'ad', label: t('宣伝', 'Ads'), asIs: { text: t('なし', 'None') }, toBe: { text: t(`＋${ad?.name ?? a.id}（${ad?.days ?? 0} 日）`, `+${ad?.name ?? a.id} (${ad?.days ?? 0} d)`), plus: true }, changed: true });
      touched.add('sell');
    } else if (a.k === 'hire' || a.k === 'assign') {
      const task = a.task;
      rows.push({ kind: 'other', label: t('人', 'People'), asIs: { text: a.k === 'hire' ? t('—', '—') : t(`${heroNm(a.hero)}：待機中`, `${heroNm(a.hero)}: idle`) }, toBe: { text: `${PLUS()}${heroNm(a.hero)}${COLON()}${TASK_JA(task)}`, plus: true }, changed: true });
      if (task === 'buy') touched.add('buy');
      else if (task === 'craft') touched.add('craft');
      else if (task === 'transport') touched.add('haul');
      else if (task === 'shop') touched.add('sell');
    } else if (a.k === 'invest') {
      const b = s.buildings.find((x) => x.uid === a.uid);
      const lv0 = b ? invLv(b, a.id) : 0;
      const mx = INVEST[a.id]?.cost.length ?? 0;
      const lvTxt = (n: number) => (mx > 1 ? t(`${n}/${mx} 段`, `${n}/${mx}`) : `${n}`);
      rows.push({ kind: 'other', label: t('設備', 'Equipment'), asIs: { text: `${INVEST[a.id]?.name ?? a.id} ${lvTxt(lv0)}` }, toBe: { text: `${INVEST[a.id]?.name ?? a.id} ${lvTxt(lv0 + 1)}`, plus: true }, changed: true });
      touched.add(INVEST[a.id]?.kind === 'shop' ? 'sell' : INVEST[a.id]?.kind === 'warehouse' || INVEST[a.id]?.kind === 'depot' ? 'buy' : 'craft');
    } else if (a.k !== 'stock' && a.k !== 'part') {
      rows.push({ kind: 'other', label: t('ほか', 'Other'), asIs: { text: '—' }, toBe: { text: `${PLUS()}${actLabel(a)}`, plus: true }, changed: true });
    }
  }
  // パネル・設備の効き目で流せる数が変わる段も「変わる」に入れる（変更なしの 1 行に出さない）
  for (const st of ['buy', 'craft', 'haul', 'sell'] as Stage[]) if (Math.abs(f1.caps[st] - f0.caps[st]) > 0.5) touched.add(st);
  // 変わらない段：変更後も回るか（後の流れの見込みに対して、その段の流せる数）
  const unchanged: string[] = [];
  const need = f1.units;
  for (const st of ['buy', 'craft', 'haul', 'sell'] as Stage[]) {
    if (touched.has(st)) continue;
    const ok = f1.caps[st] >= need * 0.98;
    unchanged.push(ok ? t(`※${STAGE_JA[st]()}は変更なし（変更後も充分回る見込み）`, `* ${STAGE_JA[st]()} unchanged (still enough after)`) : t(`※${STAGE_JA[st]()}は変更なし（変更後はここが細くなる見込み：月 ${fmtUnits(f1.caps[st])} 個）`, `* ${STAGE_JA[st]()} unchanged (becomes the narrow point: ${fmtUnits(f1.caps[st])}/mo)`));
  }
  return { rows, unchanged };
}
const STAGE_JA: Record<Stage, () => string> = { buy: () => t('調達', 'Buying'), craft: () => t('製造', 'Crafting'), haul: () => t('輸送', 'Hauling'), sell: () => t('販売', 'Selling') };
const TASK_JA = (k: string) => ({ craft: t('製造', 'crafting'), transport: t('輸送', 'hauling'), buy: t('調達', 'buying'), shop: t('販売', 'selling'), dig: t('発掘', 'digging'), intel: t('調査', 'research') } as Record<string, string>)[k] ?? k;
const actLabel = (a: PropAct): string => {
  switch (a.k) {
    case 'permit':
      return t(`荒れ地 ${a.site + 1} の発掘許可`, `Permit for wasteland ${a.site + 1}`);
    case 'vacant':
      return t('空き店舗に入る', 'Take the vacant store');
    case 'patent':
      return t(`『${PRODUCT[a.key]?.name ?? a.key}』の特許`, `Patent ${PRODUCT[a.key]?.name ?? a.key}`);
    case 'ma':
      return t('買収の打診', 'Acquisition talks');
    case 'order':
      return t(`素材 ${MATS[a.m].name}×${a.lots * LOT}`, `${MATS[a.m].name} ×${a.lots * LOT}`);
    default:
      return a.k;
  }
};

/** 提案の 1 行（「棚を 1 段増やし、リボンも作って並べる」）。手の名前を「、」でつなぐ */
export function planTitle(s: P1State, p: Plan): string {
  const bits: string[] = [];
  for (const st of p.steps) {
    if (st.k === 'shelf') bits.push(t(`${shopNm(s, st.uid)}の棚を 1 段増やす`, `add a shelf at ${shopNm(s, st.uid)}`));
    else if (st.k === 'bench') bits.push(t('作業台を 1 台足す', 'add a bench'));
    else if (st.k === 'make') bits.push(t(`${goodsName(st.x)}を作って並べる`, `make and sell ${goodsName(st.x)}`));
    else if (st.k === 'main' && !p.steps.some((y) => y.k === 'make')) bits.push(t(`主力を${goodsName(st.x)}に`, `make ${goodsName(st.x)} the main item`));
    else if (st.k === 'staff') bits.push(t(`従業員を ${st.n} 人に`, `${st.n} staff`));
    else if (st.k === 'clear') bits.push(st.cut == null ? t('在庫の売りさばきをやめる', 'stop clearing stock') : t(`在庫を優先して売りさばく（${clearName(st.cut)}）`, `clear stock first (${clearName(st.cut)})`));
    else if (st.k === 'useup') bits.push(t(`いまある素材で${goodsName(st.x)}を作る`, `make ${goodsName(st.x)} from what we have`));
    else if (st.k === 'act' && st.a.k !== 'assign') bits.push(actShort(st.a, s));
  }
  const uniq = [...new Set(bits)];
  return uniq.length ? uniq.join(t('、', ', ')) : t('いまのまま', 'Keep as is');
}
const actShort = (a: PropAct, s?: P1State): string => {
  switch (a.k) {
    case 'skill':
      return t(`パネル「${SKILL[a.id]?.name ?? a.id}」を解放`, `unlock ${SKILL[a.id]?.name ?? a.id}`);
    case 'level':
      return t(`「${SKILL[a.id]?.name ?? a.id}」を Lv アップ`, `level up ${SKILL[a.id]?.name ?? a.id}`);
    case 'invest': {
      // 段 UI5d：倉庫・物流拠点の強化は段で（「倉庫を強化する（2/3 段目）」）
      if ((a.id === 'rack' || a.id === 'dock') && s) {
        const b = s.buildings.find((x) => x.uid === a.uid);
        const lv = invLv(b, a.id) + 1;
        const max = INVEST[a.id].cost.length;
        return a.id === 'rack' ? t(`倉庫を強化する（${lv}/${max} 段目）`, `upgrade the warehouse (level ${lv}/${max})`) : t(`物流拠点の保管を強化する（${lv}/${max} 段目）`, `upgrade hub storage (level ${lv}/${max})`);
      }
      return t(`${INVEST[a.id]?.name ?? a.id}を導入`, `install ${INVEST[a.id]?.name ?? a.id}`);
    }
    case 'build':
      return a.id === 'warehouse' ? (s && myWarehouses(s).length ? t('倉庫をもう 1 棟建てる', 'build one more warehouse') : t('倉庫を建てる', 'build a warehouse')) : a.id === 'logistics' ? t('物流拠点を建てる', 'build a hub') : t(`${nameOfB(a.id)}を出店`, `open a ${nameOfB(a.id)}`);
    case 'hire':
      return t(`${heroNm(a.hero)}を雇う`, `hire ${heroNm(a.hero)}`);
    case 'ad':
      return t(`宣伝「${ADS.find((x) => x.id === a.id)?.name ?? a.id}」を出す`, `run ${ADS.find((x) => x.id === a.id)?.name ?? a.id}`);
    case 'part':
      return t('従業員を 1 人増やす', 'one more staff');
    case 'famous':
      return t('名物店主を置く', 'set a celebrity shopkeeper');
    default:
      return actLabel(a);
  }
};
/** 段 UI5c：在庫と素材を売る手（売りさばき・使い切りの製造）だけの提案書 */
const stockPlan = (p: Plan) => p.steps.length > 0 && p.steps.every((x) => x.k === 'clear' || x.k === 'useup' || x.k === 'worker');
/** 値引きの段の名前 */
const clearName = (k: number) => ((CLEAR.cuts[k] ?? 0) > 0 ? t(`${Math.round(CLEAR.cuts[k] * 10)} 割引`, `${Math.round(CLEAR.cuts[k] * 100)}% off`) : t('値引きなし', 'no discount'));
/** 作る物を替えたときに止まる商品（ほかの台で作っていない） */
export const planDrop = (p: Plan) => p.drop ?? null;
