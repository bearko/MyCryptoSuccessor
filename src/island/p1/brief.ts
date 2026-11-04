/**
 * 段 UI7b：判断しやすい提案書の中身（DOM なし：proposalui.ts とテストが使う。自動プレイには効かない＝表示だけ）。
 * plan.ts の Plan（変更の中身）から、提案書の上から順の材料を作る：
 * 1. 承認してほしいこと：ヒーローの口からの要約の一言（pitch）・承認事項の箇条（部門の札・ほかの部門の手は「○○部に依頼」）・
 *    要点（導入費用・月の利益の差・この部門の予算の内外）・推奨（承認か見送るか）・会社全体の材料（受け箱のほかの提案・資金）
 * 2. 課題の背景（根拠の数字つき）
 * 3. 期待効果：「このまま」→「承認後」と差。費用は導入（1 回）と月の費用（続く）に分けて内訳を出す。宣伝は効く日数で日割り
 * 4. 予想されるリスク：下振れ・売れ残り・ほかの部門への影響・予算の超過・承認したあとの資金
 * 仕様は docs/ISLAND_PHASE1.md「判断しやすい提案書（段 UI7b）」。
 */
import { isEn, t } from '../../i18n';
import { DEF } from '../defs';
import { ADS, DELEG, DEPT, INVEST, MATS, P1B, SKILL, deptOf, type DeptId, type Sku } from './data';
import { DAYS, LOT, bottleneck, poolCap, poolUsed, stageCaps, stockAll, unitCost, type P1State, type Stage } from './model';
import { afterOf, baseOf, flowOf, planBlock, planCost, planOf, planTitle, stockPlan, type Plan, type PlanCost } from './plan';
import { heroNm, reserveOf, type PropAct } from './deleg';
import { amountOf, budgetDepts, budgetOpen, deptBudget, restOf } from './budget';
import { cardInbox } from './card';
import { goodsName } from './moves';
import { toneOf, type Tone } from './persona';
import { voiceOf } from './voice';

// ---------------------------------------------------------------- 型

/** 承認事項の 1 行（acts の 1 つ） */
export interface Ask {
  /** acts の何番目か（① ② …）・その手を受け持つ部門・提案した部門の手か（違えば「○○部に依頼」） */
  n: number;
  dept: DeptId;
  own: boolean;
  /** 「宣伝：店頭イベント 5 日」 */
  what: string;
  /** その手の費用（導入 1 回・研究ポイント・毎月） */
  money: number;
  rp: number;
  monthly: number;
}
/** 月あたりの見込み（宣伝は効く日数で日割り） */
export interface Month {
  sales: number;
  units: number;
  /** 商品ごと：ひと月の数・1 個の材料費 */
  goods: { x: Sku; units: number; unit: number }[];
  /** 材料費（売れる数 × 1 個の材料費）・毎月の費用（従業員・維持費）・合計・利益 */
  mats: number;
  monthly: number;
  cost: number;
  profit: number;
  /** 宣伝が効く日（この月のうち）。0 なら宣伝なし */
  adDays: number;
}
/** 月の費用の内訳の 1 行（このまま → 承認後） */
export interface CostRow {
  label: string;
  now: number;
  after: number;
}
/** 期待効果の部門ごとの分（acts を順に足したときの増え方） */
export interface Part {
  n: number;
  dept: DeptId;
  own: boolean;
  what: string;
  dSales: number;
  dProfit: number;
}
/** この部門の予算の内外 */
export interface BudgetFit {
  dept: DeptId;
  amt: number;
  used: number;
  rest: number;
  /** この部門の手の導入費用 */
  need: number;
  inside: boolean;
}
export interface Brief {
  dept: DeptId | null;
  pitch: string;
  asks: Ask[];
  cost: PlanCost;
  block: string[];
  now: Month;
  after: Month;
  err: number;
  dSales: number;
  dProfit: number;
  /** 差の割合（前が 0 なら null） */
  pSales: number | null;
  pProfit: number | null;
  costs: CostRow[];
  parts: Part[];
  /** 部門の予算（予算がまだ無い町・部門は null） */
  budget: BudgetFit | null;
  bg: string[];
  risks: string[];
  /** 会社全体：受け箱のほかの提案の件数と合計の費用・いまの資金・承認したあとの資金・ひと月の固定費の目安 */
  co: { n: number; money: number; cash: number; left: number; reserve: number };
  /** 推奨（承認・見送る）と、その理由の 1 行 */
  rec: 'ok' | 'skip';
  why: string;
}

// ---------------------------------------------------------------- 手 → 部門・名前

/** その手を受け持つ部門（宣伝 → マーケ・人を雇う／持ち場 → 人事・パネル → パネルの部門・発掘 → R&D・特許と M&A → 法務・ほかは物流） */
export function actDept(a: PropAct): DeptId {
  switch (a.k) {
    case 'ad':
      return 'marketing';
    case 'skill':
    case 'level':
      return SKILL[a.id] ? deptOf(SKILL[a.id]) : 'logistics';
    case 'hire':
    case 'assign':
      return 'hr';
    case 'permit':
      return 'rnd';
    case 'patent':
    case 'ma':
      return 'legal';
    default:
      return 'logistics';
  }
}
/** 「○○部」（短い名前。要約の一言）・「○○部に依頼」（承認事項） */
export const deptShort = (d: DeptId) => t(`${DEPT[d].short}部`, DEPT[d].short);
export const askTo = (d: DeptId) => t(`${DEPT[d].name}部に依頼`, `Ask ${DEPT[d].name}`);

const nameOfB = (id: string) => DEF[id]?.name ?? id;
const adOf = (id: string) => ADS.find((x) => x.id === id);

/** 要約の一言に入れる、手の短い名前（名詞。日本語は「〜をしましょう」に入る形） */
export function actNoun(a: PropAct): string {
  switch (a.k) {
    case 'ad':
      return adOf(a.id)?.name ?? a.id;
    case 'stock':
      return a.add ? t('棚の増設と新商品', 'a new shelf and item') : t('商品の入れ替え', 'a product swap');
    case 'part':
    case 'staff':
      return t('従業員の増員', 'more staff');
    case 'skill':
      return t(`『${SKILL[a.id]?.name ?? a.id}』の導入`, `the ${SKILL[a.id]?.name ?? a.id} panel`);
    case 'level':
      return t(`『${SKILL[a.id]?.name ?? a.id}』の強化`, `a stronger ${SKILL[a.id]?.name ?? a.id}`);
    case 'invest':
      return a.id === 'rack' ? t('倉庫の強化', 'a warehouse upgrade') : a.id === 'dock' ? t('保管の強化', 'more hub storage') : t(`${INVEST[a.id]?.name ?? a.id}の導入`, INVEST[a.id]?.name ?? a.id);
    case 'build':
      return a.id === 'warehouse' ? t('倉庫の建設', 'a warehouse') : a.id === 'logistics' ? t('物流拠点の建設', 'a hub') : P1B[a.id]?.kind === 'shop' ? t('出店', 'a new shop') : t(`${nameOfB(a.id)}の建設`, nameOfB(a.id));
    case 'hire':
      return t(`${heroNm(a.hero)}の採用`, `hiring ${heroNm(a.hero)}`);
    case 'assign':
      return t('人の配置', 'a staffing move');
    case 'clear':
      return t('在庫の売りさばき', 'clearing stock');
    case 'useup':
      return t('手持ちの素材での製造', 'crafting from stock');
    case 'permit':
      return t('発掘許可', 'a dig permit');
    case 'patent':
      return t('特許の出願', 'a patent');
    case 'ma':
      return t('買収の打診', 'acquisition talks');
    case 'order':
      return t('素材の注文', 'a materials order');
    case 'vacant':
      return t('空き店舗への出店', 'the vacant store');
    case 'famous':
      return t('名物店主', 'a celebrity shopkeeper');
  }
}
/** 承認事項の 1 行の頭（種類） */
function askCat(a: PropAct): string {
  switch (a.k) {
    case 'ad':
      return t('宣伝', 'Ad');
    case 'stock':
      return t('商品', 'Goods');
    case 'part':
    case 'staff':
      return t('従業員', 'Staff');
    case 'skill':
    case 'level':
      return t('パネル', 'Panel');
    case 'invest':
      return t('設備', 'Equipment');
    case 'build':
    case 'vacant':
      return t('建物', 'Building');
    case 'hire':
    case 'assign':
      return t('人', 'People');
    case 'clear':
    case 'useup':
      return t('在庫', 'Stock');
    case 'order':
      return t('調達', 'Buying');
    case 'permit':
      return t('発掘', 'Digging');
    case 'patent':
    case 'ma':
      return t('法務', 'Legal');
    case 'famous':
      return t('お店', 'Shop');
  }
}
/** 承認事項の 1 行：「宣伝：店頭イベント 5 日」「商品：よろず屋 2の棚にランタンを作って並べる」 */
function askWhat(s: P1State, p: Plan, k: number): string {
  const a = p.acts[k];
  if (a.k === 'ad') {
    const ad = adOf(a.id);
    return t(`宣伝：${ad?.name ?? a.id} ${ad?.days ?? 0} 日`, `Ad: ${ad?.name ?? a.id}, ${ad?.days ?? 0} days`);
  }
  const sub: Plan = {
    ...p,
    acts: [a],
    steps: p.steps.filter((_, i) => (p.of?.[i] ?? 0) === k),
  };
  const tt = planTitle(s, sub);
  // 「パネル「…」を解放」のように、もう種類で始まる文はそのまま
  return tt.startsWith(askCat(a)) ? tt : `${askCat(a)}${t('：', ': ')}${tt}`; // i18n-ja
}

// ---------------------------------------------------------------- 要約の一言（ヒーローの口から）

/** 口調の型ごとの言い回し：主な手・同じ部門のもう 1 つの手・ほかの部門に頼む手 */
const PITCH: Record<Tone, { main: (x: string) => string; also: (y: string) => string; ask: (y: string, d: string) => string }> = {
  polite: { main: (x) => `${x}をしましょう。`, also: (y) => `${y}も進めたいです。`, ask: (y, d) => `${y}は${d}にお願いしたいです。` }, // i18n-ja
  warrior: { main: (x) => `${x}で攻めるべし。`, also: (y) => `${y}も手配いたす。`, ask: (y, d) => `${y}は${d}に頼み申す。` }, // i18n-ja
  leader: { main: (x) => `${x}を打つべきだ。`, also: (y) => `${y}も進める。`, ask: (y, d) => `${y}は${d}に任せたい。` }, // i18n-ja
  scholar: { main: (x) => `${x}が最善です。`, also: (y) => `${y}も併せて行います。`, ask: (y, d) => `${y}は${d}に依頼します。` }, // i18n-ja
  cheer: { main: (x) => `${x}をやろうよ！`, also: (y) => `${y}もね！`, ask: (y, d) => `${y}は${d}にお願い！` }, // i18n-ja
  merchant: { main: (x) => `${x}で稼ぎましょう。`, also: (y) => `${y}も仕込みます。`, ask: (y, d) => `${y}は${d}に頼みます。` }, // i18n-ja
  easy: { main: (x) => `${x}、やってみようかねえ。`, also: (y) => `${y}もねえ。`, ask: (y, d) => `${y}は${d}に任せようかねえ。` }, // i18n-ja
  quiet: { main: (x) => `${x}を推す。`, also: (y) => `${y}も。`, ask: (y, d) => `${y}は${d}へ依頼。` }, // i18n-ja
};
/** 要約の一言の上限（字）。カードの課題のセリフと同じ */
export const PITCH_MAX = 60;
/** 目安の長さ（呼び方「社長、」を頭に付けるのはこの字数まで） */
const PITCH_AIM = 36;
const plen = (x: string) => [...x].length;

/**
 * ヒーローの口からの要約の一言（「店頭イベントをしましょう。商品の入れ替えは物流部にお願いしたいです。」）。
 * 口調は persona.ts の型、呼び方は史実の調査のあるヒーローなら voice.ts の呼び方。テンプレートと差し込みで作り、PITCH_MAX 字に収める
 * （長ければ呼び方 → 2 つ目の手の順に落とす）。dept：提案した部門（ほかの部門の手は「○○部に…」）
 */
export function pitchOf(hero: number | null, acts: PropAct[], dept: DeptId | null): string {
  if (!acts.length) return t('このまま進めましょう。', 'Let’s keep going as is.');
  const d0 = dept ?? actDept(acts[0]);
  const ownFirst = [...acts].sort((a, b) => Number(actDept(b) === d0) - Number(actDept(a) === d0));
  const main = ownFirst[0];
  const rest = ownFirst.slice(1);
  const sub = rest.find((a) => actDept(a) !== d0) ?? rest[0] ?? null;
  const more = rest.length > 1;
  if (isEn) {
    const a = `Let’s go for ${actNoun(main)}.`;
    if (!sub) return a;
    return actDept(sub) !== d0 ? `${a} I’d ask ${DEPT[actDept(sub)].name} for ${actNoun(sub)}${more ? ' and more' : ''}.` : `${a} Also ${actNoun(sub)}${more ? ' and more' : ''}.`;
  }
  const tone: Tone = hero != null ? toneOf(hero) : 'polite';
  const T = PITCH[tone];
  const y = sub ? `${actNoun(sub)}${more ? 'など' : ''}` : ''; // i18n-ja
  const second = sub ? (actDept(sub) !== d0 ? T.ask(y, deptShort(actDept(sub))) : T.also(y)) : '';
  // 自分の部門の手が無い（予算の頼みでほかの部門のパネルなど）：主な手から「○○部に…」
  const first = actDept(main) !== d0 ? T.ask(actNoun(main), deptShort(actDept(main))) : T.main(actNoun(main));
  const body = `${first}${second}`;
  // 呼び方：史実の調査のあるヒーローはその人の呼び方（「殿」「社長」）。マインちゃんは「社長」
  const to = hero == null ? '社長' : (voiceOf(hero)?.to ?? null); // i18n-ja
  // 呼び方は短いときだけ（25 字前後に）。長ければ呼び方 → 2 つ目の手の順に落とす
  if (to && plen(`${to}、${body}`) <= PITCH_AIM) return `${to}、${body}`;
  if (plen(body) <= PITCH_MAX) return body;
  const one = first;
  return plen(one) <= PITCH_MAX ? one : [...one].slice(0, PITCH_MAX).join('');
}

// ---------------------------------------------------------------- 月あたりの見込み

/** その状態の月あたり（宣伝はいま効いている日数で日割り。材料費は売れる数 × 1 個の材料費） */
export function monthOf(st: P1State, monthly: number, sellOnly = false): Month {
  const on = flowOf(st, 0, sellOnly);
  const adDays = Math.min(DAYS, Math.max(0, ...ADS.map((a) => st.ads[a.id] ?? 0)));
  let off = on;
  let k = 1;
  if (adDays > 0 && adDays < DAYS) {
    off = flowOf(
      {
        ...st,
        ads: Object.fromEntries(Object.keys(st.ads).map((x) => [x, 0])),
      },
      0,
      sellOnly,
    );
    k = adDays / DAYS;
  }
  const mix = (a: number, b: number) => b + (a - b) * k;
  const xs = new Set<Sku>([...on.goods.map((g) => g.x), ...off.goods.map((g) => g.x)]);
  const goods = [...xs].map((x) => ({
    x,
    units: mix(on.goods.find((g) => g.x === x)?.units ?? 0, off.goods.find((g) => g.x === x)?.units ?? 0),
    unit: unitCost(st, x),
  }));
  const sales = mix(on.sales, off.sales);
  const mats = goods.reduce((a, g) => a + g.units * g.unit, 0);
  return {
    sales,
    units: mix(on.units, off.units),
    goods,
    mats,
    monthly,
    cost: mats + monthly,
    profit: sales - mats - monthly,
    adDays,
  };
}

/** 割合の差（前が 0 なら null） */
const pctOf = (a: number, b: number) => (Math.abs(a) > 0.5 ? (b - a) / Math.abs(a) : null);
const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;
const sg = (v: number) => `${v >= 0.5 ? '+' : v <= -0.5 ? '−' : '±'}${Math.abs(Math.round(v)).toLocaleString('en-US')} G`;

/** 月の費用の内訳（材料費は商品ごとにまとめて 1 行・毎月の費用は払うものごと）。合計の差は after.cost − now.cost と一致する */
export function costRows(now: Month, after: Month, cost: PlanCost): CostRow[] {
  const rows: CostRow[] = [{ label: t('材料費', 'Materials'), now: now.mats, after: after.mats }];
  for (const it of cost.items) if (it.monthly) rows.push({ label: it.label, now: 0, after: it.monthly });
  return rows;
}

// ---------------------------------------------------------------- まとめ

export interface BriefOpts {
  /** カードで推奨の手から開いたか（true：推奨は承認・false：カードの推奨はほかの手・無し：数字で決める） */
  rec?: boolean;
  /** いま開いているカードの id（受け箱のほかの提案から除く） */
  card?: number;
}

/** 提案書の中身を作る。base・after は渡せば使う（計算を 1 回に） */
export function briefOf(s: P1State, p: Plan, o: BriefOpts = {}, base = baseOf(s), after = afterOf(s, p)): Brief {
  const cost = planCost(s, p);
  const block = planBlock(s, p, cost);
  const so = stockPlan(p);
  const dept = p.dept ?? (p.acts[0] ? actDept(p.acts[0]) : null);
  const now = monthOf(base, 0, so);
  const aft = monthOf(after, cost.monthly, so);
  const err = Math.round((1 - p.q) * DELEG.prop.err * 100) / 100;
  // 承認事項（acts ごと。費用は planCost の内訳を、その手の step の分だけ足す）
  const asks: Ask[] = p.acts.map((a, k) => {
    const its = cost.items.filter((it) => (p.of?.[it.at ?? -1] ?? 0) === k);
    const d = actDept(a);
    return {
      n: k,
      dept: d,
      own: dept == null || d === dept,
      what: askWhat(s, p, k),
      money: its.reduce((x, it) => x + (it.money ?? 0), 0),
      rp: its.reduce((x, it) => x + (it.rp ?? 0), 0),
      monthly: its.reduce((x, it) => x + (it.monthly ?? 0), 0),
    };
  });
  // 部門ごとの分：手を 1 つずつ足して、増えた分をその手の分に（最後は提案の全部と同じ）
  const parts: Part[] = [];
  if (p.acts.length > 1) {
    let prev = now;
    p.acts.forEach((_a, k) => {
      const sub =
        k === p.acts.length - 1
          ? p
          : planOf(s, p.acts.slice(0, k + 1), {
              hero: p.hero,
              q: p.q,
              dept: p.dept,
            });
      const m = k === p.acts.length - 1 ? aft : monthOf(afterOf(s, sub), planCost(s, sub).monthly, so);
      parts.push({
        n: k,
        dept: asks[k].dept,
        own: asks[k].own,
        what: asks[k].what,
        dSales: m.sales - prev.sales,
        dProfit: m.profit - prev.profit,
      });
      prev = m;
    });
  }
  // この部門の予算（Rare から）
  let budget: BudgetFit | null = null;
  if (dept && budgetOpen(s) && budgetDepts(s).includes(dept)) {
    const B = deptBudget(s, dept);
    const need = asks.filter((x) => x.dept === dept).reduce((a, x) => a + x.money, 0);
    const rest = restOf(s, dept);
    budget = {
      dept,
      amt: amountOf(s, dept),
      used: B.used,
      rest,
      need,
      inside: need <= rest,
    };
  }
  // 会社全体：受け箱のほかの提案（カード）と、その費用（推奨の手の費用）
  const others = cardInbox(s).filter((c) => c.id !== o.card && c.choices.some((x) => x.act.k === 'do' || x.act.k === 'approve' || x.act.k === 'budget'));
  const otherMoney = others.reduce((a, c) => a + ((c.choices.find((x) => x.rec) ?? c.choices[0])?.cost ?? 0), 0);
  const reserve = reserveOf(s);
  const co = {
    n: others.length,
    money: otherMoney,
    cash: s.money,
    left: s.money - cost.money,
    reserve,
  };
  const dSales = aft.sales - now.sales;
  const dProfit = aft.profit - now.profit;
  const b: Brief = {
    dept,
    pitch: pitchOf(p.hero, p.acts, dept),
    asks,
    cost,
    block,
    now,
    after: aft,
    err,
    dSales,
    dProfit,
    pSales: pctOf(now.sales, aft.sales),
    pProfit: pctOf(now.profit, aft.profit),
    costs: costRows(now, aft, cost),
    parts,
    budget,
    bg: [],
    risks: [],
    co,
    rec: 'skip',
    why: '',
  };
  b.bg = bgOf(s, p, b);
  b.risks = risksOf(s, p, b, base, after);
  const r = recOf(b, o.rec);
  b.rec = r.rec;
  b.why = r.why;
  return b;
}

/** 推奨：払えない・資金が足りなくなる → 見送る。カードの推奨から開いた → 承認。カードの推奨がほかの手 → 見送る。ほかは月の利益が増えるなら承認 */
export function recOf(b: Pick<Brief, 'block' | 'co' | 'dProfit' | 'err' | 'after' | 'now'>, hint?: boolean): { rec: 'ok' | 'skip'; why: string } {
  if (b.block.length) return { rec: 'skip', why: t('いまは払えません', 'Can’t afford it now') };
  if (b.co.left < 0)
    return {
      rec: 'skip',
      why: t('資金が足りなくなります', 'It would overdraw funds'),
    };
  if (hint === false)
    return {
      rec: 'skip',
      why: t('カードの推奨はほかの手です', 'The card recommends another move'),
    };
  const up = b.dProfit > 0.5;
  // カードの推奨から開いても、束ねたほかの手で月の利益がはっきり減るなら見送る（利益の 1%・500 G より大きく減る）
  if (hint === true && b.dProfit < -Math.max(500, Math.abs(b.now.profit) * 0.01))
    return {
      rec: 'skip',
      why: t(`月の利益が ${sg(b.dProfit)} の見込み`, `Profit ${sg(b.dProfit)}/mo`),
    };
  if (hint === true)
    return {
      rec: 'ok',
      why: up ? t(`月の利益 ${sg(b.dProfit)} の見込み`, `Profit ${sg(b.dProfit)}/mo`) : t('いまの課題を片づける手です', 'It fixes the current issue'),
    };
  if (up)
    return {
      rec: 'ok',
      why: t(`月の利益 ${sg(b.dProfit)} の見込み`, `Profit ${sg(b.dProfit)}/mo`),
    };
  return {
    rec: 'skip',
    why: t('月の利益が増えない見込みです', 'No profit gain expected'),
  };
}

// ---------------------------------------------------------------- 背景・リスク

const STAGE: Record<Stage, () => string> = {
  buy: () => t('調達', 'buying'),
  craft: () => t('製造', 'crafting'),
  haul: () => t('輸送', 'hauling'),
  sell: () => t('販売', 'selling'),
};
const kinds = (p: Plan) => new Set(p.acts.map((a) => a.k));

/** 課題の背景：いま何が起きているか（根拠の数字と、どこから言っているか）。3 つまで */
export function bgOf(s: P1State, p: Plan, b: Pick<Brief, 'now'>): string[] {
  const out: string[] = [];
  const k = kinds(p);
  const r = s.reports[s.reports.length - 1];
  const sells = k.has('ad') || k.has('stock') || k.has('part') || k.has('staff') || k.has('famous') || k.has('clear');
  // 売れていない商品（棚に並んでいるのに月 0 個）
  if (sells) {
    const f = flowOf(s);
    const zero = f.goods.filter((x) => x.units < 0.5);
    if (zero.length)
      out.push(
        t(
          `棚の ${zero.length} 品が月 0 個（${zero
            .slice(0, 2)
            .map((x) => goodsName(x.x))
            .join(t('・', ', '))}${zero.length > 2 ? t(' ほか', '') : ''}）— いまの売れ方の見込み`,
          `${zero.length} items sell 0 a month (${zero
            .slice(0, 2)
            .map((x) => goodsName(x.x))
            .join(', ')}) — current estimate`,
        ),
      );
  }
  if (k.has('ad')) {
    const on = ADS.filter((a) => (s.ads[a.id] ?? 0) > 0);
    const list = on.map((a) => t(`${a.name}（あと ${s.ads[a.id]} 日）`, `${a.name} (${s.ads[a.id]} d left)`)).join(t('・', ', '));
    out.push(on.length ? t(`いま出している宣伝：${list}`, `Running ads: ${list}`) : t('いまは宣伝を出していない', 'No ads running now'));
  }
  // 置き場所
  if (k.has('clear') || k.has('useup') || p.acts.some((a) => (a.k === 'invest' && (a.id === 'rack' || a.id === 'dock')) || (a.k === 'build' && (a.id === 'warehouse' || a.id === 'logistics')))) {
    const cap = poolCap(s);
    out.push(t(`置き場所 ${Math.round((poolUsed(s) / Math.max(1, cap)) * 100)}%（${poolUsed(s)} / ${cap} 個）— 倉庫の数字`, `Storage ${Math.round((poolUsed(s) / Math.max(1, cap)) * 100)}% (${poolUsed(s)} / ${cap}) — warehouse`));
  }
  // 4 段の細いところ（パネル・設備・人の手）
  if (!sells || k.has('skill') || k.has('level') || k.has('invest') || k.has('hire') || k.has('assign')) {
    const c = stageCaps(s, true);
    const bn = bottleneck(c);
    out.push(t(`4 段のうち細いのは${STAGE[bn]()}：月 ${Math.round(c[bn].perMonth)} 個 — 流れの数字`, `The narrowest of the 4 stages is ${STAGE[bn]()}: ${Math.round(c[bn].perMonth)}/mo — flow`));
  }
  if (r) out.push(t(`先月の売上 ${g(r.revenue)}・利益 ${g(r.profit)} — 月次報告`, `Last month: sales ${g(r.revenue)}, profit ${g(r.profit)} — monthly report`));
  else out.push(t(`売上の見込み 月 ${g(b.now.sales)} — いまの見込み`, `Sales estimate ${g(b.now.sales)}/mo — current estimate`));
  return out.slice(0, 3);
}

/** 予想されるリスク（下振れ・一時的な効き目・売れ残り・ほかの部門への影響・予算の超過・承認したあとの資金） */
export function risksOf(s: P1State, p: Plan, b: Brief, base: P1State, after: P1State): string[] {
  const out: string[] = [];
  // 読みの下振れ（読みの確かさの誤差だけ、効き目が小さかったとき）
  if (Math.abs(b.dProfit) >= 0.5 && b.err > 0) {
    const low = b.dProfit - Math.abs(b.dSales) * b.err;
    out.push(t(`読みが外れて売上の増えが ${Math.round(b.err * 100)}% 小さいとき：月の利益 ${sg(low)}（${g(b.now.profit + low)}）`, `If the sales gain is ${Math.round(b.err * 100)}% smaller: profit ${sg(low)}/mo (${g(b.now.profit + low)})`));
  }
  // 宣伝は効く日数だけ
  for (const a of p.acts) {
    if (a.k !== 'ad') continue;
    const ad = adOf(a.id);
    if (!ad) continue;
    const cost = b.asks.find((x) => p.acts[x.n] === a)?.money ?? 0;
    out.push(t(`宣伝は ${ad.days} 日だけ効く（期待効果は日割り）。続けるなら、そのたびに ${g(cost)}`, `The ad lasts ${ad.days} days (effect pro-rated). Repeating costs ${g(cost)} each time`));
    if (ad.days < DAYS && b.parts.length === 0 && b.dProfit < cost) out.push(t(`この宣伝だけでは、費用 ${g(cost)} を月の利益の増え（${sg(b.dProfit)}）で取り戻せない見込み`, `The extra profit (${sg(b.dProfit)}) won’t cover the ${g(cost)} cost`));
  }
  // 売れ残り・在庫：作らなくなる商品・注文する素材
  if (p.drop) {
    const n = stockAll(s, p.drop);
    out.push(t(`作らなくなる${goodsName(p.drop)}の在庫 ${n} 個は、空いた棚で売り切るまで並ぶ`, `${n} ${goodsName(p.drop)} left in stock sell off from spare shelves`));
  }
  const orders = p.steps.filter((x): x is Extract<Plan['steps'][number], { k: 'order' }> => x.k === 'order');
  if (orders.length) {
    const n = orders.reduce((a, x) => a + x.lots * LOT, 0);
    out.push(
      t(
        `素材を ${n} 個注文（${orders.map((x) => MATS[x.m].name).join('・')}）。売れ方が読みより悪いと倉庫に残る（置き場所 ${poolUsed(s) + n} / ${poolCap(s)} 個）`,
        `Orders ${n} materials. If sales lag, they sit in storage (${poolUsed(s) + n} / ${poolCap(s)})`,
      ),
    );
  }
  // 新しく作る商品のうち、売れる見込みが小さいもの
  const thin = (p.goods ?? []).filter((x) => (b.after.goods.find((y) => y.x === x)?.units ?? 0) < 3);
  if (thin.length) out.push(t(`新しい商品（${thin.map((x) => goodsName(x)).join('・')}）は売れ方が読みにくい（月 3 個未満の見込み）`, `New items (${thin.map((x) => goodsName(x)).join(', ')}) are hard to read (<3/mo)`));
  // ほかの部門への影響（製造の切り替え・人の移動・依頼する手）
  for (const st of p.steps) {
    if (st.k === 'make') {
      const sl = s.slots[st.slot];
      if (sl?.sku && sl.sku !== st.x)
        out.push(
          t(
            `製造：作業台 ${st.slot + 1} は${sl.running ? 'いまのロットのあとで' : 'すぐに'}${goodsName(st.x)}へ切り替え（${goodsName(sl.sku)}はこの台では作らなくなる）`,
            `Crafting: bench ${st.slot + 1} switches to ${goodsName(st.x)}${sl.running ? ' after this lot' : ''} (stops ${goodsName(sl.sku)} there)`,
          ),
        );
    } else if (st.k === 'worker') out.push(t(`人：待機中の${heroNm(st.hero)}を作業台 ${st.slot + 1} の担当へ`, `People: idle ${heroNm(st.hero)} goes to bench ${st.slot + 1}`));
  }
  for (const a of b.asks) if (!a.own) out.push(t(`${DEPT[a.dept].name}部の手が要る：${a.what}`, `Needs ${DEPT[a.dept].name}: ${a.what}`));
  // 流れの細いところが移る
  const c0 = stageCaps(base, true);
  const c1 = stageCaps(after, true);
  const bn0 = bottleneck(c0);
  const bn1 = bottleneck(c1);
  if (bn1 !== bn0) out.push(t(`承認後は${STAGE[bn1]()}が細くなる見込み（月 ${Math.round(c1[bn1].perMonth)} 個）`, `${STAGE[bn1]()} becomes the narrow point (${Math.round(c1[bn1].perMonth)}/mo)`));
  // 予算の超過
  if (b.budget && !b.budget.inside)
    out.push(t(`${DEPT[b.budget.dept].name}部の予算を ${g(b.budget.need - b.budget.rest)} 超える（社長の承認なので会社の資金から払う）`, `Over the ${DEPT[b.budget.dept].name} budget by ${g(b.budget.need - b.budget.rest)} (paid from company funds)`));
  // 承認したあとの資金
  out.push(
    b.co.left < b.co.reserve
      ? t(`承認後の資金は ${g(b.co.left)}。ひと月の給料・維持費の目安 ${g(b.co.reserve)} を下回る`, `Funds after: ${g(b.co.left)}, below a month of wages and upkeep (${g(b.co.reserve)})`)
      : t(`承認後の資金は ${g(b.co.left)}（ひと月の給料・維持費の目安 ${g(b.co.reserve)} は残る）`, `Funds after: ${g(b.co.left)} (a month of wages and upkeep, ${g(b.co.reserve)}, stays covered)`),
  );
  return out;
}
