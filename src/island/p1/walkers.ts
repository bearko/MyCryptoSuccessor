/**
 * 名前のない歩く人（段 ART1。PixelLab で MCH のヒーローを画風の手本にして作った 64×64。public/island/char）。
 * MCH のヒーローの一覧（heroById）には入れない（図鑑・採用に出さない）。drawWalker・heroIcon・heroName が、ヒーローに無い id のときにここを見る。
 */
import { t } from '../../i18n';

export interface WalkerArt {
  image: string;
  /** 足もとの横の位置（64 の中。ヒーローの cx と同じ） */
  cx: number;
  name: () => string;
}

/** 発掘隊の隊員 5 人（スカーフの色違い） */
export const CREW_IDS = [90001, 90002, 90003, 90004, 90005] as const;
/** となり町の問屋の人（輸入の荷を担いで境界をこえてくる） */
export const PORTER_ID = 90011;

const CX = [34.7, 35.3, 35.5, 33.8, 34.3];

export const WALKER_ART = new Map<number, WalkerArt>([
  ...CREW_IDS.map((id, k): [number, WalkerArt] => [id, { image: `island/char/miner_${k + 1}.png`, cx: CX[k], name: () => t('発掘隊の隊員', 'Dig crew member') }]),
  [PORTER_ID, { image: 'island/char/porter.png', cx: 31.3, name: () => t('となり町の問屋の人', 'Porter from the next town') }],
]);
