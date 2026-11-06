/**
 * 段 L0：ヒーローの力を借りる段（DOM なし）。ユーザーの声（2026-11-06）「0 → 1 はプレイヤー、1 → 10 はヒーローの力を借りてプレイヤー、10 → 100 はヒーロー」。
 * - 段は、会社が出店したことのある最高ランク（company.ts の topTierOf）で決まる：Common → 'C'・Uncommon → 'U'・Rare 以上 → 'R'
 * - チームリーダー（L0.leaderFrom）・事業部長（L0.headFrom）・ヒーローからの提案（L0.propFrom）の判定は、すべてここを通す（散らさない）
 * 数字は data.ts の L0 の 1 か所。docs/ISLAND_PHASE1.md「任せ方」「提案は Rare から（段 L0）」。
 */
import { t } from '../../i18n';
import { L0, type Tier } from './data';
import { topTierOf } from './company';

export type HeroStage = 'C' | 'U' | 'R';
const ORDER: HeroStage[] = ['C', 'U', 'R'];
const NAME: Record<HeroStage, string> = { C: 'Common', U: 'Uncommon', R: 'Rare' };

/** いまの段（Rare 以上は 'R'） */
export function heroStage(s: { tier?: Tier; land?: { mine: string[] } }): HeroStage {
  const top = topTierOf(s);
  return top === 'C' ? 'C' : top === 'U' ? 'U' : 'R';
}
/** その段に届いているか */
export const stageAt = (s: { tier?: Tier; land?: { mine: string[] } }, from: HeroStage) => ORDER.indexOf(heroStage(s)) >= ORDER.indexOf(from);
/** チームリーダーを置ける段か（理解度は deleg.ts の leaderLeft） */
export const leadersOpen = (s: { tier?: Tier; land?: { mine: string[] } }) => stageAt(s, L0.leaderFrom);
/** 事業部長（経営企画の部長・予算・会議の側も）を置ける段か */
export const headsOpen = (s: { tier?: Tier; land?: { mine: string[] } }) => stageAt(s, L0.headFrom);
/** ヒーロー・部長からの提案（承認を求めるもの）が届く段か。届く前は地図の印 */
export const propsOpen = (s: { tier?: Tier; land?: { mine: string[] } }) => stageAt(s, L0.propFrom);

/**
 * 置けるまでの残り（deleg.ts の leaderLeft・headLeft の返り値）：0 は置ける・正の数は理解度のあと・'U'／'R' はそのランクの町を開くまで・null は部門が無い
 */
export type Left = number | HeroStage | null;
/** まだ置けない（理解度かランク） */
export const isLocked = (x: Left) => x != null && x !== 0;
/** ランクで止まっている */
export const rankLocked = (x: Left): x is HeroStage => typeof x === 'string';
/** 「🔒 Rare の町を開くと」 */
export const rankLockText = (r: HeroStage) => t(`🔒 ${NAME[r]} の町を開くと`, `🔒 Opens with a ${NAME[r]} town`);
export const stageName = (r: HeroStage) => NAME[r];
