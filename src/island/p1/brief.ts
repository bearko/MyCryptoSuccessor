/**
 * 段 UI7b：判断しやすい提案書の中身（DOM なし：proposalui.ts とテストが使う。自動プレイには効かない＝表示だけ）。
 * plan.ts の Plan（変更の中身）から、提案書の上から順の材料を作る：
 * 1. 承認してほしいこと：ヒーローの口からの要約の一言（pitch）・承認事項の箇条（部門の札・ほかの部門の手は「○○部に依頼」）・
 *    要点（導入費用・月の利益の差・この部門の予算の内外）・推奨（承認か見送るか）・会社全体の材料（受け箱のほかの提案・資金）
 * 2. 課題の背景（根拠の数字つき）
 * 3. 期待効果：「このまま」→「承認後」と差。費用は導入（1 回）と月の費用（続く）に分けて内訳を出す。宣伝は効く日数で日割り
 * 4. 予想されるリスク：下振れ・売れ残り・ほかの部門への影響・予算の超過・承認したあとの資金
 * 段 UI7c：期待効果の指標（短期利益・長期利益・士気・顧客満足度・ブランド力・研究ポイント）を、いまのモデルの効き方から見積もり（valuesOf）、
 * 経営方針（policy.ts・data.ts の POLICY）の重みで「価値」にして推奨を決める。方針はゲームの数字に効かせない。
 * 仕様は docs/ISLAND_PHASE1.md「判断しやすい提案書（段 UI7b）」「経営方針とお金以外の期待効果（段 UI7c）」。
 */
import { isEn, t } from '../../i18n';
import { DEF } from '../defs';
import { ADS, BRAND, CS, DELEG, MORALE, DEPT, DIG_BALANCE, INVEST, MATS, P1B, POLICY, SKILL, deptOf, type DeptId, type PolicyId, type Sku, type ValueKey } from './data';
import { DAYS, LOT, bottleneck, crewMul, fxSum, has, lvMul, lvOf, poolCap, poolUsed, stageCaps, stockAll, unitCost, type P1State, type Stage } from './model';
import { brandCap } from './company';
import { careMul, centerRate, csOn } from './cs';
import { moraleAvg as moraleNow, moraleTarget, payGap, wantsToQuit } from './hr';
import { fatigueAvg } from './ga';
import { envPanels } from './hr';
import { corpOf, deptPolicyOf, POL_OFF, policyName, policyOf, weightsOf } from './policy';
import { afterOf, baseOf, flowOf, planBlock, planCost, planOf, planTitle, stockPlan, type Plan, type PlanCost } from './plan';
import { heroNm, reserveOf, type PropAct, type Proposal } from './deleg';
import { amountOf, budgetDepts, budgetOpen, deptBudget, restOf } from './budget';
import { cardInbox } from './card';
import { goodsName } from './moves';
import { heroSay, say as toneSay, toneOf, type Tone } from './persona';
import { voiceOf, voiceSay } from './voice';

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
  /** 段 UI7c：課題の背景の種類（提案の主な手から）と、その種類のヒーローのセリフ（お金の種類は null：カードのセリフのまま） */
  theme: Theme;
  say: string | null;
  risks: string[];
  /** 会社全体：受け箱のほかの提案の件数と合計の費用・いまの資金・承認したあとの資金・ひと月の固定費の目安 */
  co: { n: number; money: number; cash: number; left: number; reserve: number };
  /** 段 UI7c：期待効果の指標（短期・長期・士気・満足度・ブランド・研究）と、経営方針の価値 */
  vals: Values;
  /** 推奨（承認・見送る）と、その理由の 1 行（方針つき） */
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
    case 'skill': {
      // 名前が「〜の導入」で終わるパネルは「の導入」を重ねない
      const nm = SKILL[a.id]?.name ?? a.id;
      return t(nm.endsWith('導入') ? `『${nm}』` : `『${nm}』の導入`, `the ${nm} panel`); // i18n-ja
    }
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
const PITCH: Record<Tone, { up: (m: string) => string; main: (x: string) => string; also: (y: string) => string; ask: (y: string, d: string) => string }> = {
  polite: { up: (m) => `${m}が上がります。`, main: (x) => `${x}をしましょう。`, also: (y) => `${y}も進めたいです。`, ask: (y, d) => `${y}は${d}にお願いしたいです。` }, // i18n-ja
  warrior: { up: (m) => `${m}が上がるぞ。`, main: (x) => `${x}で攻めるべし。`, also: (y) => `${y}も手配いたす。`, ask: (y, d) => `${y}は${d}に頼み申す。` }, // i18n-ja
  leader: { up: (m) => `${m}を上げる。`, main: (x) => `${x}を打つべきだ。`, also: (y) => `${y}も進める。`, ask: (y, d) => `${y}は${d}に任せたい。` }, // i18n-ja
  scholar: { up: (m) => `${m}が向上します。`, main: (x) => `${x}が最善です。`, also: (y) => `${y}も併せて行います。`, ask: (y, d) => `${y}は${d}に依頼します。` }, // i18n-ja
  cheer: { up: (m) => `${m}が上がるよ！`, main: (x) => `${x}をやろうよ！`, also: (y) => `${y}もね！`, ask: (y, d) => `${y}は${d}にお願い！` }, // i18n-ja
  merchant: { up: (m) => `${m}が伸びますよ。`, main: (x) => `${x}で稼ぎましょう。`, also: (y) => `${y}も仕込みます。`, ask: (y, d) => `${y}は${d}に頼みます。` }, // i18n-ja
  easy: { up: (m) => `${m}が上がるねえ。`, main: (x) => `${x}、やってみようかねえ。`, also: (y) => `${y}もねえ。`, ask: (y, d) => `${y}は${d}に任せようかねえ。` }, // i18n-ja
  quiet: { up: (m) => `${m}、上がる。`, main: (x) => `${x}を推す。`, also: (y) => `${y}も。`, ask: (y, d) => `${y}は${d}へ依頼。` }, // i18n-ja
};
/** 段 UI7c：方針の大事な指標の名前（要約の一言の頭「ブランドが上がります。」）。動かないなら付けない */
const LEAD: Record<PolicyId, { key: ValueKey; ja: string; en: string } | null> = {
  balance: null,
  profit: { key: 'short', ja: '利益', en: 'profit' }, // i18n-ja
  growth: { key: 'long', ja: '先の利益', en: 'long-term profit' }, // i18n-ja
  brand: { key: 'brand', ja: 'ブランド', en: 'the brand' }, // i18n-ja
  people: { key: 'morale', ja: '士気', en: 'morale' }, // i18n-ja
  customer: { key: 'sat', ja: 'お客さんの満足度', en: 'customer satisfaction' }, // i18n-ja
  research: { key: 'rp', ja: '研究', en: 'research' }, // i18n-ja
};
/** 方針と指標から、要約の一言の頭に付ける指標（方針の大事な指標が上がるときだけ） */
export function leadOf(policy: PolicyId, v: Pick<Values, 'list'>): string | null {
  const L = LEAD[policy];
  if (!L) return null;
  const m = v.list.find((x) => x.key === L.key);
  return m && m.d > 0 ? t(L.ja, L.en) : null;
}
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
export function pitchOf(hero: number | null, acts: PropAct[], dept: DeptId | null, lead: string | null = null): string {
  if (!acts.length) return t('このまま進めましょう。', 'Let’s keep going as is.');
  const d0 = dept ?? actDept(acts[0]);
  const ownFirst = [...acts].sort((a, b) => Number(actDept(b) === d0) - Number(actDept(a) === d0));
  const main = ownFirst[0];
  const rest = ownFirst.slice(1);
  const sub = rest.find((a) => actDept(a) !== d0) ?? rest[0] ?? null;
  const more = rest.length > 1;
  if (isEn) {
    const a = `${lead ? `It lifts ${lead}. ` : ''}Let’s go for ${actNoun(main)}.`;
    if (!sub) return a;
    return actDept(sub) !== d0 ? `${a} I’d ask ${DEPT[actDept(sub)].name} for ${actNoun(sub)}${more ? ' and more' : ''}.` : `${a} Also ${actNoun(sub)}${more ? ' and more' : ''}.`;
  }
  const tone: Tone = hero != null ? toneOf(hero) : 'polite';
  const T = PITCH[tone];
  const y = sub ? `${actNoun(sub)}${more ? 'など' : ''}` : ''; // i18n-ja
  const second = sub ? (actDept(sub) !== d0 ? T.ask(y, deptShort(actDept(sub))) : T.also(y)) : '';
  // 自分の部門の手が無い（予算の頼みでほかの部門のパネルなど）：主な手から「○○部に…」
  const first = actDept(main) !== d0 ? T.ask(actNoun(main), deptShort(actDept(main))) : T.main(actNoun(main));
  // 段 UI7c：方針の大事な指標が上がるなら、それを先に（「ブランドが上がります。店頭イベントをしましょう。」）
  const up = lead ? T.up(lead) : '';
  const body = `${up}${first}${second}`;
  // 呼び方：史実の調査のあるヒーローはその人の呼び方（「殿」「社長」）。マインちゃんは「社長」
  const to = hero == null ? '社長' : (voiceOf(hero)?.to ?? null); // i18n-ja
  // 呼び方は短いときだけ（25 字前後に）。長ければ呼び方 → 2 つ目の手 → 指標の頭の順に落とす
  if (to && plen(`${to}、${body}`) <= PITCH_AIM) return `${to}、${body}`;
  if (plen(body) <= PITCH_MAX) return body;
  if (plen(`${up}${first}`) <= PITCH_MAX) return `${up}${first}`;
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
  /** カードで推奨の手から開いたか（段 UI7c から推奨は経営方針の価値で決めるので、使わない。呼び出しの形を変えないために残す） */
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
  const vals = valuesOf(s, p, { base, after, now, aft, cost, so });
  const b: Brief = {
    dept,
    pitch: pitchOf(p.hero, p.acts, dept, leadOf(vals.policy, vals)),
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
    vals,
    theme: 'flow',
    say: null,
    rec: 'skip',
    why: '',
  };
  b.theme = themeOf(p, dept);
  b.bg = bgOf(s, p, b);
  b.say = sayOfTheme(s, p, b);
  b.risks = risksOf(s, p, b, base, after);
  const r = recOf(b);
  b.rec = r.rec;
  b.why = r.why;
  return b;
}

/**
 * 推奨（段 UI7c：経営方針の価値で決める）：払えない・資金が足りなくなる → 見送る。ほかは方針の価値（brief.vals.value）がプラスなら承認。
 * 理由の 1 行に方針を出す（「社長の方針（ブランド重視）なら承認：短期 −2,247 G でも ★ +12」）
 */
export function recOf(b: Pick<Brief, 'block' | 'co' | 'vals'>): { rec: 'ok' | 'skip'; why: string } {
  if (b.block.length) return { rec: 'skip', why: t('見送る：いまは払えません', 'Pass: can’t afford it now') };
  if (b.co.left < 0) return { rec: 'skip', why: t('見送る：資金が足りなくなります', 'Pass: it would overdraw funds') };
  const v = b.vals;
  // 方針の名前（かっこの添え書きは外す：「人を大事に（士気）」→「人を大事に」）
  const pn = (v.names ?? [v.policy]).map((x) => policyName(x).replace(/（.*）$/, '').replace(/ \(.*\)$/, '')).join(t('・', ', '));
  const goods = v.list.filter((m) => m.d > 0 && v.parts[m.key] > 0).sort((x, y) => v.parts[y.key] - v.parts[x.key]);
  const bads = v.list.filter((m) => m.d < 0 && v.parts[m.key] < 0).sort((x, y) => v.parts[x.key] - v.parts[y.key]);
  if (v.value > 0) {
    const plus = goods.slice(0, 2).map(chip).join(t('・', ', ')) || t('効き目あり', 'it helps');
    const minus = bads[0];
    return { rec: 'ok', why: minus ? t(`社長の方針（${pn}）なら承認：${chip(minus)} でも ${plus}`, `Under your policy (${pn}): approve — ${chip(minus)}, but ${plus}`) : t(`社長の方針（${pn}）なら承認：${plus}`, `Under your policy (${pn}): approve — ${plus}`) };
  }
  const minus = bads.slice(0, 2).map(chip).join(t('・', ', '));
  return { rec: 'skip', why: minus ? t(`社長の方針（${pn}）なら見送る：${minus}`, `Under your policy (${pn}): pass — ${minus}`) : t(`社長の方針（${pn}）なら見送る：効き目が方針の大事なものに届かない`, `Under your policy (${pn}): pass — not enough of what you value`) };
}

// ---------------------------------------------------------------- 段 UI7c：お金以外の期待効果と、経営方針の価値

/** 指標 1 つ：このまま → 承認後 → 差と、どう見積もったかの 1 行 */
export interface Metric {
  key: ValueKey;
  now: number;
  after: number;
  d: number;
  why: string;
}
export interface Values {
  policy: PolicyId;
  /** 段 K：推奨に使った方針（全社方針 ＋ 提案の部門の事業別の方針）。無ければ policy だけ */
  names?: PolicyId[];
  /** 動く指標（短期・長期はいつも。ほかは動くときだけ）。並びは 短期・長期・士気・満足度・ブランド・研究 */
  list: Metric[];
  /** 方針の価値（G。プラスなら承認）と、指標ごとの分 */
  value: number;
  parts: Record<ValueKey, number>;
  /** お金以外の 1 つぶんを G に直す目安（月の売上 × POLICY.unit。下限 POLICY.floor）・RP 1 の値段 */
  scale: number;
  rpG: number;
}
/** 指標のアイコンと名前 */
export const METRIC_TEXT: Record<ValueKey, { icon: string; name: () => string; short: () => string }> = {
  short: { icon: '💰', name: () => t('短期利益（1 か月）', 'Short-term (1 mo)'), short: () => t('短期', 'Short') },
  long: { icon: '📈', name: () => t(`長期利益（${POLICY.months} か月）`, `Long-term (${POLICY.months} mo)`), short: () => t('長期', 'Long') },
  morale: { icon: '😊', name: () => t('士気', 'Morale'), short: () => '😊' },
  sat: { icon: '🤝', name: () => t('顧客満足度', 'Satisfaction'), short: () => '🤝' },
  brand: { icon: '★', name: () => t(`ブランド力（${POLICY.months} か月）`, `Brand (${POLICY.months} mo)`), short: () => '★' },
  rp: { icon: '🔬', name: () => t(`研究（${POLICY.months} か月）`, `Research (${POLICY.months} mo)`), short: () => '🔬' },
};
const sn = (v: number) => `${v >= 0.5 ? '+' : v <= -0.5 ? '−' : '±'}${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
/** 要点の札（「短期 −2,247 G」「★ +12」） */
export function chip(m: Pick<Metric, 'key' | 'd'>): string {
  const T = METRIC_TEXT[m.key];
  if (m.key === 'short' || m.key === 'long') return t(`${T.short()} ${sg(m.d)}`, `${T.short()} ${sg(m.d)}`);
  return m.key === 'rp' ? `${T.short()} ${sn(m.d)} RP` : `${T.short()} ${sn(m.d)}`;
}

/** 全員の士気の目指す値（hr.ts の moraleTarget）の平均。人がいなければ null */
export function moraleAvg(st: P1State): number | null {
  if (!st.staff.length) return null;
  return st.staff.reduce((a, x) => a + moraleTarget(st, x), 0) / st.staff.length;
}
/**
 * 顧客満足度の落ち着く先（cs.ts の月の締めと返事と同じ動き）：先月の問い合わせ（届いた数・自動で受けた・返事した・合う返事・期限切れ）から、
 * その状態のパネルで 1 か月に動く量 flow を出し、はじめの値へ戻る力（CS.drift）と釣り合う所 ＝ CS.start + flow ÷ drift（0〜100）。
 * - FAQ：届く数 ×(1 − CS.faq)。サポートセンター：自動で受ける割合（centerRate）× 合う返事の CS.center.q。満足度の調査：合う返事 ×careMul。
 * - 返品の決まり：返事の期限が CS.expire → CS.policyDays 日になる分だけ、期限切れが減る（期限切れ × expire ÷ policyDays）。
 * - 社長が返事する割合・合う返事の割合・期限切れの割合は先月のまま。Uncommon より前の町・問い合わせの記録が無ければ null
 */
export function satSettle(s: P1State, st: P1State): number | null {
  if (!csOn(st)) return null;
  const r = [...s.reports].reverse().find((x) => x.cs);
  if (!r?.cs) return null;
  const c = r.cs;
  const faq = (x: P1State) => (has(x, 'cs_faq') ? 1 - CS.faq : 1);
  const raw = c.got / faq(s);
  const left0 = Math.max(1, c.got - c.auto);
  const ans = c.answered / left0;
  const fit = c.answered > 0 ? c.good / c.answered : 1;
  const exp0 = c.expired / left0;
  const exp = has(st, 'cs_policy') && !has(s, 'cs_policy') ? (exp0 * CS.expire) / CS.policyDays : exp0;
  const n = raw * faq(st);
  const rate = centerRate(st);
  const flow = rate * n * CS.good * CS.center.q * careMul(st) + (1 - rate) * n * (ans * (fit * CS.good * careMul(st) + (1 - fit) * CS.ok) + exp * CS.ignore);
  return Math.max(0, Math.min(100, CS.start + flow / CS.drift));
}
/** ブランド力の月の増え（model.ts の月の締めと同じ：ブランド広告・広報室・取り組みのパネル・満足度が高い／低い） */
export function brandRate(st: P1State, sat: number | null): number {
  let v = 0;
  if (has(st, 'b_ads')) v += Math.round(BRAND.adsSkill * lvMul(st, 'b_ads'));
  if (has(st, 'pr')) v += lvOf(st, 'pr');
  v += Math.max(0, Math.round(fxSum(st, 'brand')));
  if (sat != null) v += sat >= CS.brandHi ? 1 : sat <= CS.brandLo ? -1 : 0;
  return v;
}
/** 研究ポイントの月の見込み：先月の発掘の RP × 発掘の倍率（掘る人の数の効き・掘る力）の変わり方 */
export function rpRate(s: P1State, st: P1State): number {
  const r = [...s.reports].reverse().find((x) => x.dig);
  const got = r?.dig?.rp ?? 0;
  if (!got) return 0;
  const mul = (x: P1State) => crewMul(x) * (1 + fxSum(x, 'dig.power'));
  return (got * mul(st)) / Math.max(0.01, mul(s));
}
/**
 * 落ち着いたときの状態（長期利益の 2 か月目から）：宣伝は切れる・士気は目指す値に・満足度は落ち着く先に・ブランド力は
 * 12 か月の真ん中（6 か月ぶん）だけ増えたものとして（いまのモデルの売り場の強さ・来店・働きの速さの効き方のまま）
 */
function settleOf(st: P1State, sat: number | null, brandPM: number): P1State {
  const c = structuredClone(st);
  for (const k of Object.keys(c.ads)) c.ads[k] = 0;
  for (const x of c.staff) x.morale = moraleTarget(c, x);
  if (sat != null && c.cs) c.cs.sat = sat;
  c.brand = Math.max(0, Math.min(brandCap(c), (c.brand ?? 0) + brandPM * (POLICY.months / 2)));
  return c;
}

/** このまま側の見込み（同じ base で何度も使う：束ね方・並べ替え） */
const baseCache = new WeakMap<P1State, { sat: number | null; brand: number; rp: number; morale: number | null; settled: Month[] }>();
function baseInfo(s: P1State, base: P1State, so: boolean) {
  let x = baseCache.get(base);
  if (!x) {
    const sat = satSettle(s, base);
    const brand = brandRate(base, sat ?? (csOn(base) ? base.cs?.sat ?? null : null));
    x = { sat, brand, rp: rpRate(s, base), morale: moraleAvg(base), settled: [] };
    baseCache.set(base, x);
  }
  const k = so ? 1 : 0;
  x.settled[k] ??= monthOf(settleOf(base, x.sat, x.brand), 0, so);
  return x;
}

/**
 * 期待効果の指標と方針の価値（段 UI7c）。式：
 * - 短期利益 ＝ 次の 1 か月の利益の差 − 導入
 * - 長期利益 ＝ 1 か月目の差 ＋ 落ち着いたとき（settleOf）の月の差 × 11 − 導入（宣伝は 1 か月目だけ効く）
 * - 士気・満足度：上の moraleAvg・satSettle の差。ブランド：月の増え × 12。研究：月の見込み × 12 − 使う RP
 * - 価値 ＝ Σ 方針の重み × 指標（お金以外は scale × POLICY.unit・RP は寄付の値段で G に）。使う RP は短期の重みで引く
 */
export function valuesOf(s: P1State, p: Plan, o: { base?: P1State; after?: P1State; now?: Month; aft?: Month; cost?: PlanCost; so?: boolean } = {}): Values {
  const so = o.so ?? stockPlan(p);
  const base = o.base ?? baseOf(s);
  const after = o.after ?? afterOf(s, p);
  const cost = o.cost ?? planCost(s, p);
  const now = o.now ?? monthOf(base, 0, so);
  const aft = o.aft ?? monthOf(after, cost.monthly, so);
  const B = baseInfo(s, base, so);
  const sat1 = satSettle(s, after);
  const brand1 = brandRate(after, sat1 ?? (csOn(after) ? after.cs?.sat ?? null : null));
  const morale1 = moraleAvg(after);
  const rp1 = rpRate(s, after);
  const set1 = monthOf(settleOf(after, sat1, brand1), cost.monthly, so);
  const M = POLICY.months;
  const list: Metric[] = [];
  const shortNow = now.profit;
  const shortAft = aft.profit - cost.money;
  list.push({ key: 'short', now: shortNow, after: shortAft, d: shortAft - shortNow, why: t('短期：次の 1 か月の利益（宣伝は効く日数で日割り）から導入の費用を引いたもの', 'Short: next month’s profit (ads pro-rated) minus setup') });
  const longNow = now.profit + B.settled[so ? 1 : 0].profit * (M - 1);
  const longAft = aft.profit + set1.profit * (M - 1) - cost.money;
  list.push({ key: 'long', now: longNow, after: longAft, d: longAft - longNow, why: t(`長期：1 か月目 ＋ 落ち着いたときの月の利益 × ${M - 1} − 導入（宣伝は 1 か月目だけ。士気・満足度・ブランドの売上への効きも入れる）`, `Month 1 + settled monthly profit × ${M - 1} − setup (ads only in month 1; includes morale, satisfaction and brand effects on sales)`) });
  if (B.morale != null && morale1 != null && Math.abs(morale1 - B.morale) >= 0.5) list.push({ key: 'morale', now: B.morale, after: morale1, d: morale1 - B.morale, why: t('士気：給与・職場の環境のパネル・役目などで決まる、全員の士気の目指す値の平均（人事）', 'Average morale target from pay, workplace panels, roles (HR)') });
  if (B.sat != null && sat1 != null && Math.abs(sat1 - B.sat) >= 0.5) {
    const r = [...s.reports].reverse().find((x) => x.cs);
    list.push({ key: 'sat', now: B.sat, after: sat1, d: sat1 - B.sat, why: t(`満足度：先月の問い合わせ ${r?.cs?.got ?? 0} 件と、自動で受ける割合・調査の効きから、落ち着く先（CS）`, `Where it settles, from last month’s ${r?.cs?.got ?? 0} inquiries, auto-handling and survey effects (CS)`) });
  }
  if (Math.abs(brand1 - B.brand) >= 0.5) list.push({ key: 'brand', now: B.brand * M, after: brand1 * M, d: (brand1 - B.brand) * M, why: t(`ブランド：月の増え ${sn(B.brand)} → ${sn(brand1)}（ブランド広告・広報室・取り組みのパネル・満足度 ${CS.brandHi} 以上）× ${M} か月`, `Monthly gain ${sn(B.brand)} → ${sn(brand1)} (brand ads, PR, initiatives, satisfaction ≥ ${CS.brandHi}) × ${M}`) });
  const rpNow = B.rp * M;
  const rpAft = rp1 * M - cost.rp;
  if (Math.abs(rpAft - rpNow) >= 1) list.push({ key: 'rp', now: rpNow, after: rpAft, d: rpAft - rpNow, why: cost.rp ? t(`研究：使う ${cost.rp} RP と、先月の発掘の RP × 発掘の倍率 × ${M} か月`, `${cost.rp} RP spent, plus last month’s dig RP × dig multipliers × ${M}`) : t(`研究：先月の発掘の RP × 発掘の倍率 × ${M} か月`, `Last month’s dig RP × dig multipliers × ${M}`) });
  // 方針の価値
  const policy = policyOf(s);
  // 段 K：選んだ全社方針と、提案の部門の事業別の方針の重みの平均
  const W = weightsOf(s, p.dept);
  const dp = p.dept ? deptPolicyOf(s, p.dept) : null;
  const names = POL_OFF.on ? [policy] : [...corpOf(s), ...(dp ? [dp] : [])];
  const scale = Math.max(POLICY.floor, now.sales);
  const rpG = DIG_BALANCE.buyRp.cost / DIG_BALANCE.buyRp.rp;
  const parts: Record<ValueKey, number> = { short: 0, long: 0, morale: 0, sat: 0, brand: 0, rp: 0 };
  for (const m of list) {
    if (m.key === 'short' || m.key === 'long') parts[m.key] = W[m.key] * m.d;
    else if (m.key === 'rp') parts.rp = (W.rp * (rp1 - B.rp) * M - W.short * cost.rp) * rpG;
    else parts[m.key] = W[m.key] * m.d * POLICY.unit[m.key] * scale;
  }
  const value = Object.values(parts).reduce((a, x) => a + x, 0);
  return { policy, names, list, value, parts, scale, rpG };
}

/** 方針の価値（束ね方・並べ替えの比べ用。同じ base を渡すと、このまま側の計算を 1 回に） */
export const valueOfPlan = (s: P1State, p: Plan, base = baseOf(s)) => valuesOf(s, p, { base }).value;
/** 部長の提案を、方針の価値の大きい順に（画面の並びだけ。自動プレイ・部長の自動の施策は前のまま） */
export function policySort<T extends Pick<Proposal, 'act' | 'hero' | 'dept'>>(s: P1State, xs: T[]): T[] {
  if (xs.length < 2) return xs;
  const base = baseOf(s);
  const v = new Map(xs.map((x) => [x, valueOfPlan(s, planOf(s, [x.act], { hero: x.hero, dept: x.dept }), base)]));
  return [...xs].sort((a, b) => (v.get(b) ?? 0) - (v.get(a) ?? 0));
}

// ---------------------------------------------------------------- 背景・リスク

const STAGE: Record<Stage, () => string> = {
  buy: () => t('調達', 'buying'),
  craft: () => t('製造', 'crafting'),
  haul: () => t('輸送', 'hauling'),
  sell: () => t('販売', 'selling'),
};
const kinds = (p: Plan) => new Set(p.acts.map((a) => a.k));

/**
 * 段 UI7c：課題の背景の種類。提案の主な手（提案した部門の手を先に）から決める：
 * sell（宣伝・棚・従業員・名物店主・売りさばき・出店）・store（使い切り・倉庫と拠点）・morale（人事のパネル）・workplace（総務のパネル）・
 * people（雇う・持ち場・採用のパネル）・sat（CS のパネル）・brand（マーケのパネル）・rp（R&D のパネル・発掘許可）・legal（特許・M&A・法務のパネル）・
 * cost（経理のパネル）・flow（ほか：物流・システム・経営企画のパネル・設備）。表は docs/ISLAND_PHASE1.md「課題の背景の種類（段 UI7c）」
 */
export type Theme = 'sell' | 'store' | 'morale' | 'workplace' | 'people' | 'sat' | 'brand' | 'rp' | 'legal' | 'cost' | 'flow';
/** 採用のパネル（人を増やす。士気でなく人の数の話） */
const HIRE_PANELS = ['hire', 'slots', 'b_scout', 'headhunt', 'd_people', 'hr_brand'];
export function actTheme(a: PropAct): Theme {
  switch (a.k) {
    case 'ad':
    case 'stock':
    case 'part':
    case 'staff':
    case 'famous':
    case 'clear':
    case 'vacant':
      return 'sell';
    case 'useup':
    case 'order':
      return 'store';
    case 'hire':
    case 'assign':
      return 'people';
    case 'permit':
      return 'rp';
    case 'patent':
    case 'ma':
      return 'legal';
    case 'build':
      return P1B[a.id]?.kind === 'shop' ? 'sell' : a.id === 'warehouse' || a.id === 'logistics' ? 'store' : 'flow';
    case 'invest':
      return a.id === 'rack' || a.id === 'dock' ? 'store' : INVEST[a.id]?.kind === 'shop' ? 'sell' : 'flow';
    case 'skill':
    case 'level': {
      if (HIRE_PANELS.includes(a.id)) return 'people';
      const d = actDept(a);
      return ({ hr: 'morale', general: 'workplace', support: 'sat', marketing: 'brand', rnd: 'rp', legal: 'legal', accounting: 'cost' } as Partial<Record<DeptId, Theme>>)[d] ?? 'flow';
    }
  }
}
/** 提案の背景の種類（提案した部門の手を先に） */
export function themeOf(p: Plan, dept: DeptId | null): Theme {
  if (!p.acts.length) return 'flow';
  const own = p.acts.find((a) => dept == null || actDept(a) === dept) ?? p.acts[0];
  return actTheme(own);
}
const mval = (b: Pick<Brief, 'vals'>, k: ValueKey) => b.vals.list.find((x) => x.key === k);

/** 課題の背景：いま何が起きているか（提案の手の種類に合った根拠の数字と、どこから言っているか）。3 つまで */
export function bgOf(s: P1State, p: Plan, b: Pick<Brief, 'now' | 'vals' | 'theme'>): string[] {
  const out: string[] = [];
  const k = kinds(p);
  const r = s.reports[s.reports.length - 1];
  const th = b.theme;
  const moraleLines = () => {
    const now = moraleNow(s);
    const tg = moraleAvg(s);
    if (now != null && tg != null) out.push(t(`士気の平均 ${now}（いまの職場で目指す値 ${Math.round(tg)}）— 人事`, `Average morale ${now} (target with today’s workplace ${Math.round(tg)}) — HR`));
    const low = s.staff.filter((x) => (x.morale ?? MORALE.start) < MORALE.warn).length;
    const quit = wantsToQuit(s).length;
    out.push(t(`士気が ${MORALE.warn} 未満の人 ${low} 人・辞めたいと言っている人 ${quit} 人 — 人事`, `${low} below morale ${MORALE.warn}, ${quit} want to quit — HR`));
  };
  switch (th) {
    case 'morale': {
      moraleLines();
      const under = s.staff.filter((x) => payGap(x) < -0.5).length;
      out.push(t(`給与が相場より低い人 ${under} 人 — 給与・労務`, `${under} paid below market — Pay`));
      break;
    }
    case 'workplace': {
      out.push(t(`疲れの平均 ${Math.round(fatigueAvg(s) * 100)}%（60% を超えると士気が下がる）— 総務`, `Average fatigue ${Math.round(fatigueAvg(s) * 100)}% (morale drops past 60%) — General affairs`));
      moraleLines();
      out.push(t(`職場の環境のパネル ${envPanels(s)} 個（士気の目指す値 +${MORALE.env}／個）— 総務`, `${envPanels(s)} workplace panels (+${MORALE.env} morale target each) — General affairs`));
      break;
    }
    case 'people': {
      const idle = s.staff.filter((x) => x.task == null && !x.heads?.length).length;
      out.push(t(`ヒーロー ${s.staff.length} 人・待機中 ${idle} 人 — 人事`, `${s.staff.length} heroes, ${idle} idle — HR`));
      out.push(t(`雇える候補 ${s.hirePool.length} 人 — 人材登用`, `${s.hirePool.length} candidates — Recruiting`));
      break;
    }
    case 'sat': {
      const c = [...s.reports].reverse().find((x) => x.cs)?.cs;
      if (!csOn(s)) out.push(t('顧客満足度は Uncommon の町から効く — CS', 'Satisfaction matters from Uncommon towns — CS'));
      else {
        out.push(t(`顧客満足度 ${Math.round(s.cs?.sat ?? CS.start)}${c ? `（先月 ${c.prev}）` : ''}— CS`, `Satisfaction ${Math.round(s.cs?.sat ?? CS.start)}${c ? ` (last month ${c.prev})` : ''} — CS`));
        if (c) out.push(t(`先月の問い合わせ ${c.got} 件（自動 ${c.auto}・返事 ${c.answered}・合う返事 ${c.good}・期限切れ ${c.expired}）— CS`, `Last month: ${c.got} inquiries (auto ${c.auto}, answered ${c.answered}, good ${c.good}, expired ${c.expired}) — CS`));
        if (s.cs?.warn) out.push(t('炎上のおそれ（品切れ・放っておいた問い合わせ）— CS', 'Backlash warning (sell-outs, ignored inquiries) — CS'));
      }
      break;
    }
    case 'brand': {
      out.push(t(`ブランド力 ${Math.round(s.brand ?? 0)} / 上限 ${brandCap(s)} — 企業ランキング`, `Brand ${Math.round(s.brand ?? 0)} / cap ${brandCap(s)} — Ranking`));
      const m = mval(b, 'brand');
      const rate = m ? m.now / POLICY.months : brandRate(s, csOn(s) ? s.cs?.sat ?? null : null);
      out.push(t(`ブランド力の月の増え ${sn(rate)}（ブランド広告・広報室・取り組みのパネル・満足度）— 月次報告`, `Brand gain ${sn(rate)}/mo (brand ads, PR, initiatives, satisfaction) — monthly report`));
      if (r) out.push(t(`エリア ${r.rank} 位 — 企業ランキング`, `Area rank #${r.rank} — Ranking`));
      break;
    }
    case 'rp': {
      out.push(t(`研究ポイント ${Math.round(s.rp ?? 0).toLocaleString('en-US')} RP — 手持ち`, `${Math.round(s.rp ?? 0).toLocaleString('en-US')} RP on hand`));
      const d = [...s.reports].reverse().find((x) => x.dig)?.dig;
      out.push(d ? t(`先月の発掘 ${d.rp} RP（出土品 ${d.found}）— 研究ノート`, `Last month’s digs: ${d.rp} RP (${d.found} finds) — Notebook`) : t('先月は発掘の RP なし — 研究ノート', 'No dig RP last month — Notebook'));
      break;
    }
    case 'cost': {
      if (r) {
        const c = r.costs;
        out.push(t(`先月の費用：材料 ${g(c.materials)}・給料 ${g(c.wages + c.part)}・維持費 ${g(c.upkeep)}・宣伝 ${g(c.ads)} — 月次報告`, `Last month’s costs: materials ${g(c.materials)}, wages ${g(c.wages + c.part)}, upkeep ${g(c.upkeep)}, ads ${g(c.ads)} — monthly report`));
      }
      break;
    }
    default: {
      const sells = th === 'sell';
      // 売れていない商品（棚に並んでいるのに月 0 個）
      if (sells) {
        const f = flowOf(s);
        const zero = f.goods.filter((x) => x.units < 0.5);
        if (zero.length) {
          const nm = zero
            .slice(0, 2)
            .map((x) => goodsName(x.x))
            .join(t('・', ', '));
          out.push(t(`棚の ${zero.length} 品が月 0 個（${nm}${zero.length > 2 ? t(' ほか', '') : ''}）— いまの売れ方の見込み`, `${zero.length} items sell 0 a month (${nm}) — current estimate`));
        }
      }
      if (k.has('ad')) {
        const on = ADS.filter((a) => (s.ads[a.id] ?? 0) > 0);
        const list = on.map((a) => t(`${a.name}（あと ${s.ads[a.id]} 日）`, `${a.name} (${s.ads[a.id]} d left)`)).join(t('・', ', '));
        out.push(on.length ? t(`いま出している宣伝：${list}`, `Running ads: ${list}`) : t('いまは宣伝を出していない', 'No ads running now'));
      }
      // 置き場所
      if (th === 'store') {
        const cap = poolCap(s);
        out.push(t(`置き場所 ${Math.round((poolUsed(s) / Math.max(1, cap)) * 100)}%（${poolUsed(s)} / ${cap} 個）— 倉庫の数字`, `Storage ${Math.round((poolUsed(s) / Math.max(1, cap)) * 100)}% (${poolUsed(s)} / ${cap}) — warehouse`));
      }
      // 4 段の細いところ（物流・設備・システム・経営企画）
      if (th === 'flow' || th === 'legal') {
        const c = stageCaps(s, true);
        const bn = bottleneck(c);
        out.push(t(`4 段のうち細いのは${STAGE[bn]()}：月 ${Math.round(c[bn].perMonth)} 個 — 流れの数字`, `The narrowest of the 4 stages is ${STAGE[bn]()}: ${Math.round(c[bn].perMonth)}/mo — flow`));
      }
    }
  }
  // お金の締め（どの種類でも、残りの 1 行に）
  if (r) out.push(t(`先月の売上 ${g(r.revenue)}・利益 ${g(r.profit)} — 月次報告`, `Last month: sales ${g(r.revenue)}, profit ${g(r.profit)} — monthly report`));
  else out.push(t(`売上の見込み 月 ${g(b.now.sales)} — いまの見込み`, `Sales estimate ${g(b.now.sales)}/mo — current estimate`));
  return out.slice(0, 3);
}

/**
 * 段 UI7c：お金以外の種類（士気・職場・満足度・ブランド・研究）の提案は、ヒーローのセリフ（課題）も、その種類の数字で作る（カードのセリフは
 * お金の流れの話なので）。口調は persona.ts の型・史実の調査のあるヒーローは呼び方（card.ts の sayOf と同じ）。お金の種類は null（カードのセリフのまま）
 */
export function sayOfTheme(s: P1State, p: Plan, b: Pick<Brief, 'vals' | 'theme'>): string | null {
  const n = (v: number) => Math.round(v);
  let core: string | null = null;
  const mo = mval(b, 'morale');
  switch (b.theme) {
    case 'morale':
    case 'workplace': {
      const now = moraleNow(s);
      const quit = wantsToQuit(s).length;
      const tired = fatigueAvg(s);
      if (b.theme === 'workplace' && tired > 0.6) core = t(`みんな疲れがたまっている（疲れ[[ ${n(tired * 100)}%]]）`, `everyone is worn out ([[${n(tired * 100)}%]] fatigue)`);
      else if (quit > 0) core = t(`辞めたいと言う人が[[ ${quit} 人]]いて、士気の平均は[[ ${now}]]`, `[[${quit}]] want to quit, and average morale is [[${now}]]`);
      else if (mo) core = t(`士気の平均は[[ ${now}]]。職場を整えれば目指す値が[[ ${n(mo.now)} → ${n(mo.after)}]]に上がる`, `average morale is [[${now}]]. A better workplace lifts the target [[${n(mo.now)} → ${n(mo.after)}]]`);
      else core = t(`士気の平均は[[ ${now}]]`, `average morale is [[${now}]]`);
      break;
    }
    case 'sat': {
      const m = mval(b, 'sat');
      const v = n(s.cs?.sat ?? CS.start);
      core = m ? t(`顧客満足度は[[ ${v}]]。手を打てば[[ ${n(m.after)}]]まで上がる`, `satisfaction is [[${v}]]; this lifts it to [[${n(m.after)}]]`) : t(`顧客満足度は[[ ${v}]]`, `satisfaction is [[${v}]]`);
      break;
    }
    case 'brand': {
      const m = mval(b, 'brand');
      core = m ? t(`ブランド力は[[ ${n(s.brand ?? 0)}]]で、月に[[ ${sn(m.now / POLICY.months)}]]しか伸びていない`, `the brand is at [[${n(s.brand ?? 0)}]] and grows only [[${sn(m.now / POLICY.months)}]] a month`) : t(`ブランド力は[[ ${n(s.brand ?? 0)}]]`, `the brand is at [[${n(s.brand ?? 0)}]]`);
      break;
    }
    case 'rp': {
      const m = mval(b, 'rp');
      core = t(`研究ポイントは月[[ ${n((m?.now ?? 0) / POLICY.months)} RP]]ほどしか入っていない`, `we earn only about [[${n((m?.now ?? 0) / POLICY.months)} RP]] a month`);
      break;
    }
    default:
      return null;
  }
  if (p.hero == null) return toneSay('polite', core);
  return voiceSay(p.hero, core) ?? heroSay(p.hero, core);
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
