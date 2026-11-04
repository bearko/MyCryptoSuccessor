/**
 * 段 UI7c：経営方針（社長の価値観。DOM なし）。重みの表は data.ts の POLICY（1 か所）。
 * - 方針はゲームの数字に効かせない：提案書の推奨（brief.ts の価値）・ヒーローの要約の一言・部長の提案の並び・カードの束ね方だけに使う。
 * - 選ぶ場所は経営企画の「受け箱」の上（policyui.ts）。最初の提案書が出るころに、マインちゃんが 1 回だけ聞く（askDue）。
 * - 段 I2 の経営会議からは setPolicy を呼べばよい。
 * - セーブは s.policy（無くてよい。無ければ balance）。版は上げない。
 * 仕様は docs/ISLAND_PHASE1.md「経営方針とお金以外の期待効果（段 UI7c）」。
 */
import { t } from '../../i18n';
import { POLICY, type PolicyId, type ValueKey } from './data';
import type { P1State } from './model';

/** いまの経営方針（無ければバランス） */
export const policyOf = (s: Pick<P1State, 'policy'>): PolicyId => (s.policy && POLICY.ids.includes(s.policy) ? s.policy : 'balance');
/** 経営方針を決める（経営企画の画面・マインちゃんの問い・段 I2 の経営会議から）。聞いたことにする */
export function setPolicy(s: P1State, id: PolicyId): void {
  if (!POLICY.ids.includes(id)) return;
  s.policy = id;
  s.flags.policyAsked = true;
}
/** 方針の重み */
export const weightsOf = (s: Pick<P1State, 'policy'>): Record<ValueKey, number> => POLICY.w[policyOf(s)];

/** 名前・アイコン・一言（画面） */
export const POLICY_TEXT: Record<PolicyId, { icon: string; name: () => string; note: () => string }> = {
  balance: { icon: '⚖', name: () => t('バランス', 'Balanced'), note: () => t('利益もお金以外の効き目も、ほどよく見る', 'Weigh profit and everything else evenly') },
  profit: { icon: '💰', name: () => t('利益重視', 'Profit first'), note: () => t('お金になる提案だけを通す', 'Approve what makes money') },
  growth: { icon: '📈', name: () => t('成長重視（長期）', 'Growth (long term)'), note: () => t('目先が赤字でも、1 年で取り戻せれば通す', 'Accept a dip if it pays back within a year') },
  brand: { icon: '★', name: () => t('ブランド重視', 'Brand first'), note: () => t('ブランド力が上がる提案を大事にする', 'Value what lifts the brand') },
  people: { icon: '😊', name: () => t('人を大事に（士気）', 'People first (morale)'), note: () => t('働く人の士気が上がる提案を大事にする', 'Value what lifts staff morale') },
  customer: { icon: '🤝', name: () => t('お客様第一（満足度）', 'Customers first'), note: () => t('顧客満足度が上がる提案を大事にする', 'Value what lifts customer satisfaction') },
  research: { icon: '🔬', name: () => t('研究重視', 'Research first'), note: () => t('研究ポイントが増える提案を大事にする', 'Value what earns research points') },
};
export const policyName = (id: PolicyId) => POLICY_TEXT[id].name();

/** マインちゃんが方針を聞く時期：チュートリアルのあと・まだ聞いていない（最初の提案書を開くとき） */
export const askDue = (s: P1State) => !s.flags.policyAsked && !(typeof s.tut === 'number' && s.tut < 99);
/** マインちゃんの一言（1 回だけ） */
export const askLine = () => t('社長、提案を判断する前に 1 つだけ。社長は何をいちばん大事にしますか？ 推奨の出し方がこれで変わります（あとで経営企画の「受け箱」から変えられます）。', 'Chief, one thing before you judge proposals: what matters most to you? It shapes my recommendations (change it later under Strategy → Inbox).');
