/**
 * アイランド（フェーズ 1）の高速自動プレイ：クリア時間の計測ハーネス（UI なし・モデル層だけ）。
 * 3 つの遊び方（最短 rta／通常 normal／100% full）で、セクタごとの「制覇（2 か月続けて 1 位）までの月数」と実時間の見積もりを出す。
 * 実行：`npm run island:sim`（tests/island-p1-sim.test.ts から呼ぶ。結果は console と docs/ISLAND_BALANCE.md）。
 * ゲームの数値（data.ts・式）は変えない。ここは計測だけ。
 */
import { writeFileSync } from 'node:fs';
import { AD_TIER, HERO_GROWTH, HERO_RARITIES, aptitude, anyOfMet, ADS, RESET, RARE_RIVAL, RIVAL_TUNE, fundsOf, DIG_BALANCE, DIG_PANELS, INF_PANELS, infCost, INVEST, MISSIONS, P1B, PRODUCT, PRODUCTS, relicSells, isAntique, areaTuneOf, SECTORS, SKILL, SKILLS, donateCost, isResearch, maxLv, rpCost, type Skill, TIERS, UNCOMMON, UNCOMMON_RIVAL, sku, skuParts, techSkill, type Mat, type Sku, type Task, type Tier, RARE_AREA, EPIC_RIVAL, ANTIQUE, BRAND_CAP } from '../../src/island/p1/data';
import { managerApt, RUIN, sectorDef, type RuinLike } from '../../src/island/p1/company';
import { crowned, moveFee, moveTo } from '../../src/island/p1/land';
import { delegate, rankUpTier, repairAll, reviveView } from '../../src/island/p1/reset';
import { MEET_IDLE_DAYS } from '../../src/island/p1/digmeet';
import { siteCandidates } from '../../src/island/p1/trade';
import { HR_OFF, baseWage, charismaOf, moraleOf, payroll, talk, toMarket } from '../../src/island/p1/hr';
import { ACCT_OFF, quarterNow, taxPlan, taxOn } from '../../src/island/p1/acct';
import { fatigueAvg, fatigueMul, fatigueOf, gaOn } from '../../src/island/p1/ga';
import { CS_OFF, apologize, bestReply, putLock, putOut, reply } from '../../src/island/p1/cs';
import { copyIn, forecast, gradeOf, prLock, publish } from '../../src/island/p1/mkt';
import { LEGAL_OFF, clauseSlots, dealOf, filePatent, guidePrice, infringers, keepRate, legalHere, maLock, offerChance, offerLock, openSuits, patentLock, patentOf, patentable, rivalSales, sendOffer, setLicense, settle, signSupply, startDD, startDeal, sueInfringer, suitChance, supplyLock, type Clauses, type OfferLevel } from '../../src/island/p1/legal';
import { BOARD, LEGAL } from '../../src/island/p1/data';
import { bonus as giveBonus, bonusCost, raise, raiseStep, setRest, wageMul } from '../../src/island/p1/model';
import { CHARISMA, CS, CSM_RP, FATIGUE, FLAME, GRADE, GRADE_NAME, MORALE, PAY, TAX, deptOf } from '../../src/island/p1/data';
// v22（段 G）：販売の枝に足したカスタマーサポート・マーケの研究パネル（CSM_RP）は、通常の「詰まりの段の枝の研究パネル」には数えない（売り場の段に効かない）
import { approve, delegatedDuties, headDepts, headLeft, headOf, leaderLeft, leaderOf, quality, runnerOf, setHead, setLeader } from '../../src/island/p1/deleg';
import { propsOpen } from '../../src/island/p1/stage';
import { DELEG, DEPTS, type DeptId, type DutyId } from '../../src/island/p1/data';
import { deptLevel } from '../../src/island/p1/dept';
import { BUDGET_OFF, budgetHeads, crewTotal, type BudgetStat } from '../../src/island/p1/budget';
import { BOARD_OFF, boardAuto, boardDue, type BoardStat } from '../../src/island/p1/board';
import { POL_OFF, claimSlot, corpOf, deptPolicyOf, polAutoFill, presDepts, slotPending, slotsOf } from '../../src/island/p1/policy';
import { LESSON, POL, POL_PANELS, POL_SKILLS } from '../../src/island/p1/data';
import { BUDGET } from '../../src/island/p1/data';
import { CARD_SRCS, SIM_CARD_TAKE, cardInbox, chooseCard, simMarkTake, simTake, type Card, type CardSrc, type CardStat } from '../../src/island/p1/card';
import { EVENT_OFF, EV_KINDS, GOOD_KINDS, lightOpt, newEventStat, optName, type EvKind, type EventStat } from '../../src/island/p1/events';
import { LAND_IDS, dipOpts, landName, newDipStat, type DipStat } from '../../src/island/p1/diplo';
import { DIPLO, EVENT } from '../../src/island/p1/data';
import { CARD } from '../../src/island/p1/data';
import { DUO, HERO_FIT } from '../../src/island/p1/data';
import { P2_OFF } from '../../src/island/p1/voice';
import { DUOS, type DuoOptId } from '../../src/island/p1/duo';
import { lessonCounts, LESSON_TYPES } from '../../src/island/p1/lesson';
/** v25：通常の方針が受けるカードの手の名前（表 19） */
const TAKE_NAME: Record<string, string> = { shelf: '棚 +1 と商品', goods: '品ぞろえの入れ替え', invest: '設備投資', part: 'アルバイト', famous: '名物店主', permit: '発掘許可', ad: '宣伝' };
/** v25：カードの出どころの名前（表 19） */
const SRC_NAME: Record<CardSrc, string> = { hr: '人事（雇う）', clerk: '店員', crafter: '職人', buyer: '調達係', idle: '手の空いた人', head: '部長', cs: '問い合わせ', flame: '炎上の予告', quit: '辞めたい', tax: '経理の助言', rally: '巻き返し・反撃', event: 'できごと', diplo: '外交', stall: '流れが止まった', duo: '組み合わせ', stock: '倉庫の売りさばき', budget: '部長の頼み（予算・人手）' };
import {
  promote,
  takeVacant,
  accept,
  allowedDirs,
  assign,
  build,
  buy,
  canBuild,
  claim,
  craftDays,
  dig,
  drill,
  hasDrill,
  digNext,
  digPower,
  digSite,
  digLayouts,
  siteState,
  DUNGEON,
  autoExhibit,
  extRank,
  museumSlots,
  findCells,
  layerOpen,
  clearGoal,
  clearWaiting,
  sessionSec,
  siteDiggable,
  skillLock,
  hasLetter,
  peekView,
  applyPermit,
  endRun,
  grantFirst,
  permitFee,
  siteTopic,
  startRun,
  presentLock,
  topicProgress,
  present,
  batchOf,
  develop,
  gapOf,
  gateToll,
  has,
  hasRoute,
  knownOf,
  needFor,
  recommend,
  tierOk,
  relicMinCraft,
  heroStats,
  hire,
  invest,
  investCost,
  invLv,
  learn,
  levelUp,
  donate,
  donateLock,
  donations,
  nextLevelRp,
  levelLock,
  lvOf,
  nextLevelCost,
  myShops,
  myShare,
  rivalStores,
  craftCheck,
  myWorkshop,
  newP1,
  offeredMissions,
  openGate,
  poolCap,
  poolFree,
  poolUsed,
  priceOf,
  procItems,
  procLeft,
  procMats,
  recipeOf,
  runAd,
  sellEstimate,
  setPart,
  setShelf,
  shelvesAuto,
  shelfCount,
  siteInfo,
  stageCaps,
  bottleneck,
  whatIf,
  startCraft,
  step,
  toggleProcItem,
  tutSpot,
  unitCost,
  matPrice,
  LEARNABLE,
  openRing,
  ringOpen,
  ringsDue,
  setDustShop,
  skillSoon,
  skillTier,
  type P1State,
  type PBuilding,
  type Report,
  type Stage,
  productsOf,
} from '../../src/island/p1/model';

// ---------------------------------------------------------------- 実時間の単価（docs/ISLAND_UX_CHARTER.md「5. 進行とテンポ」）

/**
 * 1 日 1.2 秒・ひと月 36 秒。rta は ⏩（×4）常用でひと月 9 秒、行動 1 回 2 秒、月末ポーズ 10 秒。
 * normal は ×1 でひと月 36 秒、行動 1 回 4 秒、月末ポーズ 60 秒、チュートリアル 10 分。full は normal と同じ単価。
 */
export const SIM_TIME = {
  rta: { month: 9, action: 2, pause: 10, tutorial: 0, talk: 3, digOpen: 2 },
  normal: { month: 36, action: 4, pause: 60, tutorial: 600, talk: 20, digOpen: 6 },
  full: { month: 36, action: 4, pause: 60, tutorial: 600, talk: 20, digOpen: 6 },
} as const;
/*
 * v13：digOpen＝発掘作業 1 回の「開く・閉じる」の秒数（荒れ地の吹き出し → 全画面の発掘画面が開くまでと、
 * 終わりの札（出土品・新レシピ）を読んで閉じるまで。作業の 15 秒〜はゲームの時間が流れるのでひと月の時間に重なるが、
 * 終わりの札のあいだは時間が止まるので、ここは足す）。作業を始める操作（行動 1 回）とは別
 */

/**
 * v9：発掘作業の仮定（docs/ISLAND_BALANCE.md「v9 の計算・方針の変更」）。v10：発掘のスキルツリー（tree）。
 * - 1 回の発掘作業は現実の 15 秒（sessionSec。v10 は追加申請で延びる）。そのあいだもゲームの時間は流れる（ひと月の秒数 SIM_TIME.month で日数に直す：
 *   通常・100% は ×1 で 12.5 日、最短は ⏩ ×4 で 50 日）。作業のあいだに打つ数は 15 秒 × DIG_BALANCE.simTapsPerSec（1 秒に 4 打）を、作業の日数に均して打つ。
 * - 作業の時間はひと月の時間に重なるので、実時間には足さない（荒れ地を押して始める 1 回を行動 1 回に数える）。
 * - perMonth：ひと月に始める作業の回数のめやす（前の作業が終わってから。×1 では 1 回 12.5 日なので、続けて掘っても 2.4 回まで）。
 *   null は、前の作業が終わったらすぐ次を始める（続けて掘る）。
 * - target：打つマスの選び方。know＝配置を知っている（同じセクタはいつも同じ配置）→ お題の範囲を手前から。sweep（v11）＝覗き見が出ているマス → 取りかけ → 浅いマス。
 * - permit：次の荒れ地の発掘許可を申請する目安（申請料の何倍の資金があれば。最短はお題のある荒れ地だけ）。
 * - digger：発掘隊（作業のあいだだけ手伝う）の担当（0＝置かない／1＝いつも 1 人）。
 * - tree（v10）：発掘の枝のパネルの上げ方。'deep'＝お題のための「深い層の許可」Lv1 だけ（最短）／'share'＝月末に、月の売上の share（20%）を積み立てた枠で（買ったあとも 1 万 G 残るとき。研究の目利き Lv2 を先に）
 *   発掘のパネルの安い順に（お題が許可の無い層に残っていれば深い層の許可を先に。通常）／'all'＝ほかのスキルと同じく安い順にまとめて全部 Lv5 まで（100%）。
 *   以前の道具（ツルハシ・ランタン・発破の道具）はパネルに移ったので、道具は買わない。段 DIG3（v42）：発破は地中に埋まった爆弾になった（掘り出すと勝手に爆発。費用なし）。打つ数は変えない。
 */
export const SIM_DIG = {
  rta: { perMonth: null as number | null, pending: 0, target: 'know', permit: 2, digger: 0, tree: 'deep' as 'deep' | 'share' | 'all', share: 0, dungeon: 0, museum: null as number | null },
  normal: { perMonth: 2 as number | null, pending: 1, target: 'sweep', permit: 5, digger: 0, tree: 'share' as 'deep' | 'share' | 'all', share: 0.2, dungeon: 1, museum: 40000 as number | null },
  full: { perMonth: null as number | null, pending: 0, target: 'sweep', permit: 1.5, digger: 1, tree: 'all' as 'deep' | 'share' | 'all', share: 0, dungeon: 3, museum: 20000 as number | null },
} as const;
/*
 * v13（発掘 v2 の 5 段目）：pending＝お題がまだ（研究成果を発表していない）セクタで、ひと月の作業を何回増やすか（通常 2 → 3 回）。
 * 1 位を 2 か月続けたのに発表がまだ（制覇待ち）のあいだは、どの方針も続けて掘る（perMonth が null と同じ）
 */
/*
 * v12（発掘 v2 の 4 段目）：dungeon＝ひと月に潜る回数のめやす（掘れる荒れ地が無いときだけ。最短は潜らない＝今どおり）。
 * museum＝遺物の展示館を建てる目安（建てたあとも残る資金。null は建てない）。建てたら月末に価値の高い遺物から飾る（autoExhibit）。
 * 100% は資金に余裕があれば展示室の増築も。ダンジョンでは、上のランクの覗き見 → いちばん深いマス（縦に掘り進める）を打つ
 */
/** 作業 1 回のゲームの日数（その方針の速さで、現実の作業時間が何日か。s があればそのときの作業時間＝追加申請で延びる） */
export const runDays = (p: PolicyId, s?: P1State) => (s ? sessionSec(s) : DIG_BALANCE.sessionSec) / (SIM_TIME[p].month / 30);
/** 作業 1 回で手で打つ数（作業時間 × 1 秒に 4 打） */
export const runTaps = (s?: P1State) => (s ? sessionSec(s) : DIG_BALANCE.sessionSec) * DIG_BALANCE.simTapsPerSec;
/** 100%：セクタの荒れ地 4 か所をぜんぶ掘りきるまで次へ移らない（制覇のあと、この月数まで待つ） */
export const FULL_DIG_WAIT = 24;

/** 1 セクタの打ち切り（か月） */
export const MONTH_CAP = 120;

export type PolicyId = 'rta' | 'normal' | 'full';
export const POLICY_NAME: Record<PolicyId, string> = { rta: '最短', normal: '通常', full: '100%' };

// ---------------------------------------------------------------- 記録

export interface SectorRun {
  id: string;
  tier: Tier;
  /** 着いた日・開店の日・制覇の月の締めの日・離れた日（ゲームの日） */
  arrived: number;
  open: number | null;
  topDay: number | null;
  left: number | null;
  /** 制覇（2 か月続けて 1 位）までの月数（開店からの月の締めの回数）。v3 までは「1 位までの月数」 */
  months: number | null;
  /** 初めて 1 位になった月 */
  first: number | null;
  /** 制覇の月の売上・そのときの資金・スキル数 */
  rev: number;
  money: number;
  skills: number;
  /** 制覇までの行動の数・月の締めの数 / 離れるまで */
  actTop: number;
  pauseTop: number;
  act: number;
  pause: number;
  /** v10c：着いてから離れるまでの売上の合計・うち復刻品 */
  allRev: number;
  relicRev: number;
  /** v16b：うち Rare の復刻品（売れるシリーズ） */
  relicRRev: number;
  /** v23（段 H1）：うち Epic の復刻品・骨董（その町で骨董として売れた復刻品） */
  relicERev?: number;
  antRev?: number;
  /** v9：発掘（打った数：手・自動（発掘隊）・発破、作業の回数・許可の数、入った RP、研究パネルを開けた枚数、RP が足りなくて止まった月） */
  dig: DigRec;
  /** 月ごとの締め（順位・売上・資金・ボトルネック） */
  /** bn：ゲームの bottleneck()（月の締め）、read：人が読むボトルネック（readBn） */
  log: { m: number; rank: number; rev: number; top: number; money: number; bn: Stage | undefined; read: Stage }[];
  /** v15：他社の巻き返し（Uncommon のセール）が始まった回数 */
  comeback: number;
  /** v16c（Rare の町 ②）：最後の月の締めの時点の自社の店の数・撤退させた他社の店・空き店舗に入った数・自社の取り分 */
  area?: { shops: number; closed: number; took: number; share: number; n0: number; rivals: number[]; companies: number[]; refill: number; back: number; zero: number };
  /** v14：100% の再発掘の周回（被災した Common の町に戻って、荒れ地を掘り直す。表の「1 町の平均」には入れない） */
  revisit?: boolean;
  /** v17（段 E1：ヒーローの育成）：離れたときのヒーローの Lv（全員） */
  lv?: number[];
}

export interface DigRec {
  /** 手で打った数（発掘作業のあいだ） */
  mid: number;
  /** 発掘作業の回数・発掘許可をもらった荒れ地の数 */
  runs: number;
  permits: number;
  auto: number;
  blast: number;
  /** 調整 v44：掘削ドリルを使った回数（100%） */
  drill?: number;
  rp: number;
  research: number;
  rpBlocked: number;
  /** 会話（発掘との出会い・研究成果の発表）の数 */
  talks: number;
  talksTop: number;
  /** v13：制覇までの発掘作業の回数（実時間の「開く・閉じる」に使う）・1 位を 2 か月続けたのに発表を待った月の締め */
  runsTop: number;
  waitPresent: number;
  /** お題がそろった月（着いてからの月の締めの回数）・依頼状を待った月（制覇のあと、依頼状が無くて移れなかった月） */
  topicsAt: number | null;
  letterWait: number;
  /** 掘りきった荒れ地の数・掘り残したマス（離れたとき） */
  done: number;
  left: number;
  /** v14a：お題はそろったのに、研究 Lv の条件（Uncommon）が足りなくて発表できなかった月の締め */
  resWait: number;
}
const newDigRec = (): DigRec => ({ mid: 0, runs: 0, permits: 0, auto: 0, blast: 0, rp: 0, research: 0, rpBlocked: 0, talks: 0, talksTop: 0, runsTop: 0, waitPresent: 0, topicsAt: null, letterWait: 0, done: 0, left: 0, resWait: 0 });

export interface RunResult {
  policy: PolicyId;
  seed: number;
  sectors: SectorRun[];
  /** 全部の行動の数（種類ごと） */
  actions: Record<string, number>;
  days: number;
  /** ゴールに届いた（rta：Uncommon で 1 位／normal：5 セクタ／full：全部） */
  done: boolean;
  /** 打ち切りの理由 */
  stop?: string;
  skillsAt: { id: string; day: number; sector: string }[];
  /** 100% のゴールの中身 */
  goal?: { crowns: number; skills: number; maxed?: number; levels?: number; missions: number; missing?: string[] };
  /** v8：お金の使い道（G）：お金パネル（開放・レベル上げ）・発掘の道具（発破の火薬代を含む）・関所と出店許可・最後に残った資金 */
  spend: { money: number; tools: number; fees: number; end: number };
  /** v8：研究パネルを開けた枚数（ランクごと）・C の研究パネルがそろったときにいたセクタの番号（1 始まり） */
  research: { C: number; U: number; allC: number | null };
  /** v10c：開いた復刻品のレシピの数（最後） */
  recipes: number;
  /** v13：RP の余り（最後に残った RP・C と U の研究パネルを全部開けたあとに入った RP・そのときにいたセクタ） */
  rpLeft: { end: number; afterAll: number; allAt: string | null };
  /** v12：復興・ダンジョン・展示館（最後に：復興した荒れ地の合計・ダンジョンの数・潜った回数・最深・見つけた上のランクの種類と数・展示館の収入の合計・節目） */
  v12: { revived: number; dungeons: number; dives: number; best: number; found: Record<'U' | 'R' | 'E' | 'L', number>; got: Record<'U' | 'R' | 'E' | 'L', number>; museum: boolean; income: number; marks: number };
  /** v14a：研究への寄付（回数・払った G・受け取った RP）・無限の強化パネルの Lv（最後）と払った RP・入った RP の合計（寄付を除く） */
  v14: { donations: number; donateG: number; donateRp: number; inf: Record<string, number>; infRp: number; rpDug: number };
  /**
   * v14（発掘 v2 の 7 段目：ランクアップの災害と復興）：徴収額・支度金・移る前に押した寄付の回数・失ったお金のパネルの数・任せた町の数・
   * 任せた町の復興にかかった月数（全部直った町だけ）・直しきれなかった町・支援金の合計・担当の能力値の伸び（合計）・再発掘で入った RP（100% の周回）・研究待ちの月（Uncommon）
   */
  v14b: { levy: number; grant: number; preDonate: number; lost: number; delegated: number; doneMonths: number[]; undone: number; funds: number; grow: number; growHeroes: number; redigRp: number; resWaitU: number };
  /**
   * v16（Rare の町 ①：2 回目のランクアップ）：2 回目の徴収額・支度金・移る前の寄付・失ったお金のパネル・被災した町の数（C・U）・
   * 2 回目のあと任せた町（うち Uncommon の町）・研究待ちの月（Rare）・巻き返しの回数（Rare）
   */
  v16: { levy: number; grant: number; preDonate: number; lost: number; hitC: number; hitU: number; delegated: number; delegatedU: number; resWaitR: number; comebackR: number };
  /**
   * v17（段 E1：ヒーローの育成）：昇格の回数・最後に開いていたパッシブの数・手に入れた強化アイテム（合計）・最後の Lv・レアリティ（全員）・
   * ランクの終わり（そのランクの最後のセクタを離れたとき）の Lv
   */
  v17: { promos: number; passives: number; items: number; lvEnd: number[]; rarEnd: string[]; byTier: Partial<Record<Tier, number[]>> };
  /**
   * v18（段 D：任せ方の 4 段）：任せた業務の数（いちばん多かったとき・最後）・事業部長の数（同）・届いた提案・承認した提案・
   * セクター長が自分で承認した提案（会社の月の締め）・リーダー（部長）が手を打った数・最初にリーダーを置いた日・最初に部長を置いた日
   */
  v18: { duties: number; dutiesEnd: number; heads: number; headsEnd: number; props: number; approved: number; sectorOk: number; acts: number; firstLead: number | null; firstHead: number | null };
  /**
   * v19（段 E2：カリスマ度・士気・給与）：ランクの終わり（そのランクの最後のセクタを離れたとき）のカリスマ度・最後のカリスマ度・
   * 雇ったヒーローのもとのレアリティの数・月の締めの士気の平均（全部の月の平均と、いちばん低かった月）・辞めたいの予告・思いとどまった・辞めた人の数・
   * 給与の合計 ÷ 給与の段が 0 のときの合計（月の締めの合計どうし）
   */
  v19: { chEnd: Partial<Record<Tier, number>>; ch: number; hired: Record<string, number>; morale: number[]; want: number; stay: number; quit: number; pay: number; pay0: number };
  /**
   * v20（段 F：経理と総務）：払った税・節税で減らした税・税のかかった四半期の数・決算の前の節税の投資（回数と G）・
   * Uncommon 以上の町の毎日の疲れの平均と士気の平均（持ち場のある人）・疲れで遅くなった割合の平均
   */
  v20: { paid: number; saved: number; quarters: number; preInv: number; preG: number; fatigue: number[]; morale: number[]; slow: number[] };
  /** v21（調整 1）：Uncommon 以上の町の月の締めの売上・給与の合計と月の数・士気の平均（月ごと）・士気 70 以上の人の割合（月ごと） */
  v21: { rev: number; wages: number; months: number; morale: number[]; high: number[] };
  /**
   * v22（段 G：カスタマーサポートとマーケ）：届いた問い合わせ・返事（手とリーダー）・サポートセンターが受けた数・期限切れ・合う返事・
   * Uncommon 以上の町の月の締めの満足度（月ごと）・炎上のおそれ・炎上の回数・炎上中の月・広報の発表の回数と上がったブランド力・火消し・お詫びの告知・
   * 市場調査を見て打った宣伝・ランクの終わり（そのランクの最後の月の締め）のブランド力と企業の格
   */
  v22: { got: number; answered: number; auto: number; expired: number; good: number; sat: number[]; warns: number; flames: number; flameMonths: number; pr: number; prBrand: number; put: number; notice: number; ads: number; brandEnd: Partial<Record<Tier, number>>; gradeEnd: Partial<Record<Tier, number>> };
  /**
   * v23（段 H1：Epic の町 ①・3 回目のランクアップ）：3 回目の徴収額・支度金・移る前の寄付・失ったお金のパネル・被災した町の数（C・U・R）・
   * 運んだ骨董の数・3 回目のあと任せた町（うち Rare の町）・研究待ちの月（Epic）・巻き返しの回数（Epic）
   */
  v23: { levy: number; grant: number; preDonate: number; lost: number; hitC: number; hitU: number; hitR: number; kept: number; delegated: number; delegatedR: number; resWaitE: number; comebackE: number };
  /**
   * v24（段 H2：法務と M&A）：買収の数と使った金額（隠れた借金を含む）・引き継いだ商売の売上・特許（特許になった数・止めた追随・使用料）・
   * 訴え（受けた・起こした数・勝ち・負け・和解）・仕入れの契約（結んだ数・安くなったぶん・違約金）・3 回目の災害の前の寄付に払った額
   */
  v24: { ma: number; maG: number; acqRev: number; patents: number; stopped: number; royalty: number; suits: number; won: number; lost: number; settled: number; contracts: number; saved: number; penalty: number; preDonateG: number };
  /** v25（段 UI1：提案・報告のカード）：カードの数え（ランクごと：出た・時間を止めて出した・上限で受け箱へ・任せて実行・締めの回数／出どころごと：出た・受けた） */
  v25: CardStat;
  /** v26（段 UI4：突発のできごと・外交）：できごとの数え（ランク・種類と選んだ手・良い／困りごと・選んだ手の見込みの合計）・外交（会ったランドと仲・交易・依頼） */
  v26: { ev: EventStat; dip: DipStat; rel: Record<string, number> };
  /** v28（段 P2：ヒーローの組み合わせ）：見つけた組み合わせ・出したカードの数・選んだ手 */
  v28: { found: string[]; made: number; opt: Partial<Record<DuoOptId, number>> };
  /** v30（段 I1：予算で任せる）：部長が予算の中で実行した施策の数と額・予算の効きで浮いた額・雇った／減らした従業員・給料・頼みの数・終わりの従業員と予算で任せた部門 */
  v30?: BudgetStat & { crewEnd: number; heads: number };
  /** v32（段 I2：経営会議と社内監査）：会議の数（自動プレイは全部「推奨」）・話し手・選んだ番号・期末の結果・監査の指摘 */
  v32?: BoardStat;
  /** v33（段 K：経営方針）：発表会の数・部長の発表を替えた数・終わりの枠と方針の数・開いた方針・取った方針のパネル・受け取った枠（v34 から。段 K2 のランクアップの特別なパネル） */
  v33?: { held: number; changed: number; slots: number; corp: number; dept: number; open: number; panels: number; slotLv: number };
  /** v37（段 S1：教え）：受け継いだ教えの数（型ごと）・提案の結果で残った数 */
  v37?: { n: number; prop: number; by: Record<string, number> };
}

/**
 * v14：ランクアップの災害と復興の手（発掘 v2 の 7 段目）。移る前の寄付（お金は徴収されるので、押せるだけ。上限 donate 回）・
 * 被災した町に任せる数（towns。お店の売上の大きい町から）と、送る支援金（少ない／多いとき）・手元に残す資金・100% の再発掘の周回（お題がそろうか months か月まで）
 */
export const SIM_RESET: Record<PolicyId, { donate: number; towns: number; fund: [number, number]; keep: number; revisit: boolean; months: number }> = {
  rta: { donate: 3, towns: 1, fund: [10000, 10000], keep: 15000, revisit: false, months: 0 },
  normal: { donate: 5, towns: 2, fund: [10000, 30000], keep: 20000, revisit: false, months: 0 },
  full: { donate: 60, towns: 99, fund: [30000, 80000], keep: 20000, revisit: true, months: 3 },
};

// ---------------------------------------------------------------- 方針

/**
 * 枝の中で、普通の人が説明を読んで選ぶ順（詰まりを直すのに効く順）。
 * 「@id:段」は設備投資（その段まで。お店・倉庫は全部の棟を。v4：棚・作業台・荷車などはスキルから建物ごとの設備投資へ移った）
 */
const BRANCH_ORDER: Record<Stage, string[]> = {
  // v5：スキルツリー v2 の新しいパネル（ABC 分析・POS・自動発注・5S・ロット・カイゼン・定期便・配送ルート・VMD・ゴールデンゾーン など）。外周（U・R）は開いてから
  // 段 UI5a：調達の交代要員（大口契約のあと。調達係が休む日も止めない）
  buy: ['stock1', 'bulk', 'abc', 'swift', '@stockroom:1', 'eye', 'pos', 'auto_order', 'stock2', 'relief', 'bulk2', '@rack:1', 'stock3', 'contract', 'b_partner', 'direct'],
  craft: ['@bench:1', 'jig', 'five_s', 'chair', 'jig2', 'lot', 'kaizen', '@bench:2', 'pot', 'night', 'mold', 'line'],
  haul: ['loading', '@carts:1', 'shortcut', 'timetable', '@backroom:1', 'route_opt', '@truck:1', '@carts:2', 'hub', 'joint', 'crossdock', 'fleet'],
  sell: ['@shelves:1', 'host', '@staffroom:1', 'display', 'vmd', 'hours', 'shop2', 'golden', 'pop', '@shelves:2', 'set', 'point', 'shop3', 'b_sign', 'order', 'fair', 'concierge', 'b_premium'],
};
/** 詰まりの段 → スキルツリーの枝 */
const STAGE_BRANCH: Record<Stage, string> = { buy: 'buy', craft: 'craft', haul: 'logi', sell: 'shop' };
/** 詰まりの段 → その段の大きめの研究パネル（以前の ✨）。通常の方針は、RP がたまったら詰まりの段のものを取る */
const DUST_OF: Record<Stage, string> = { buy: 'd_buy', craft: 'd_craft', haul: 'd_logi', sell: 'd_shop' };
/**
 * 100% のゴール：Common・Uncommon の外周までの取れるパネル（Rare 以降のセクタはまだ遊べないので外周が開かない）。
 * v8：先に要るパネルが準備中のものは、いまは取れないので数えない（「技能の大会」は先に要るものを Uncommon の技「伝統工芸の継承」に替えたので、いまは 0 件）
 */
/** 100% のゴールのパネル（C・U の取れるパネル）。v14a：無限の強化パネル（Lv の上限なし）はゴールに入れない（余った RP の使い道。infSpend） */
export const fullSkills = () => LEARNABLE().filter((k) => ['C', 'U'].includes(skillTier(k)) && !k.inf && !(k.requires ?? []).some((r) => SKILL[r] && skillSoon(SKILL[r])));

/** 最短：知っている人の取り方（アンコモンへ一直線、そのあと売り場と運搬）。「@id:段」は設備投資 */
const RTA_SKILLS = [
  'hire', '@bench:1', 'pot', 'route_cloth', 'route_paper', '@shelves:1', 'host', '@carts:1', 'loading', 'stock1', 'jig', 'bulk', '@stockroom:1', 'b_sign', 'shop2', 'route_gem', '@truck:1', '@bench:2', 'jig2', 'stock2', '@shelves:2', 'display', '@staffroom:1', 'shortcut', '@backroom:1', 'chair', 'lounge', 'shop3', 'swift',
  // v5（スキルツリー v2）：売り場を強くする工夫 → ✨ 名物店主 → Uncommon の外周 → 製造・物流・調達の工夫
  'vmd', 'golden', 'pos', 'point', 'set', 'd_shop', 'order', 'fair', 'flow', 'dyn', 'five_s', 'kaizen', 'lot', 'night', 'mold', 'timetable', 'route_opt', 'joint', 'abc', 'auto_order', 'inventory', 'erp', 'manual', 'incentive',
];

/**
 * v15：Uncommon で決まった順を取り終えたあとの人の手（他社が強くなり、雇える候補を雇いきって店員・調達係が足りずに止まるシードが出た）。
 * 候補を 4 人・5 人（アンコモンも来る）に増やす
 */
const RTA_MORE_U = ['slots', 'b_scout'];

/**
 * v10：発掘の枝のパネルの次の一手（未取得なら開放、取得済みなら次の Lv）と値段。いま取れなければ null（資金だけが足りないときは値段を返す）
 */
export function digStep(s: P1State, id: string): { cost: number; run: () => string | null } | null {
  const k = SKILL[id];
  const lv = lvOf(s, id);
  // 発掘のパネルは研究パネル（RP で開く・レベルなし）：資金は要らない（RP が足りているものだけ）
  if (isResearch(k)) {
    if (lv > 0 || skillLock(s, k) !== null) return null;
    return { cost: 0, run: () => learn(s, id) };
  }
  if (lv === 0) {
    const e = skillLock(s, k);
    if (e !== null && e !== 'money') return null;
    return { cost: k.cost, run: () => learn(s, id) };
  }
  const e = levelLock(s, k);
  if (e !== null && e !== 'money') return null;
  return { cost: nextLevelCost(s, k), run: () => levelUp(s, id) };
}
/** まだ見つけていないお題が、いまの許可で掘れない層に眠っている（深い層の許可が要る） */
export function topicLocked(s: P1State): boolean {
  if (!s.dig) return false;
  return digLayouts(s.dig.sector).some((L) => {
    if (L.topic == null || s.dig!.topics.includes(L.topic)) return false;
    const f = L.finds.find((x) => x.item.kind === 'ext' && !!x.item.topic);
    return !!f && !layerOpen(s, L, f.layer);
  });
}
/**
 * v13（最短）：お題のための発掘の支度でお金を残す（発表がまだのセクタで、お題が許可の無い層に眠っている・お題のある荒れ地の発掘許可がまだ）。
 * 出会いの前・発表済みは false
 */
export function digSave(s: P1State): boolean {
  if (!s.flags.digMeet || !s.dig || clearGoal(s).present) return false;
  return topicLocked(s) || s.dig.sites.some((x, k) => !x.permit && siteTopic(s, k) === 'hidden');
}
/** 深い層の許可の次の Lv に要るもの（先に要るパネルが無ければ、その根もとから） */
export const DEEP_CHAIN = ['dig_ext', 'dig_lamp', 'dig_deep'];
/** 調整 v44（段 DIG3）：発掘隊の手際までの研究パネル（100% が先に開く） */
export const CREW_CHAIN = ['dig_ext', 'dig_office', 'dig_crew'];
/** 「@id:段」→ 設備投資の id と段 */
const invOf = (x: string): { id: string; lv: number } | null => {
  if (!x.startsWith('@')) return null;
  const [id, lv] = x.slice(1).split(':');
  return { id, lv: Number(lv) || 1 };
};
/** 設備投資を付ける建物（工事が終わったもの）。工房は 1 つ、お店・倉庫は全部の棟 */
const invTargets = (s: P1State, id: string): PBuilding[] => s.buildings.filter((b) => b.owner === 'me' && b.left <= 0 && P1B[b.id]?.kind === INVEST[id]?.kind);

interface Ctx {
  /** v10：通常の方針の発掘の枝の枠（月の売上の 20% を積み立てる） */
  digBudget?: number;
  policy: PolicyId;
  /** 行く順のセクタ */
  route: string[];
  /** いま目指しているセクタの番号 */
  at: number;
  lineup: Sku[];
  lineupDirty: boolean;
  /** 今月建てたお店の数 */
  shopsThisMonth: number;
  /** 月末の判断をする（normal・full は月末ポーズでまとめて考える） */
  monthEnd: Report | null;
  lastBn: Stage | null;
  /** 使わないスキル（効き目の比較用） */
  ban: Set<string>;
  /** 1 か所目だけで止める（効き目の比較用） */
  onlyFirst: boolean;
  /** 打ち切り */
  stop?: string;
  /** v8：発掘（月の締めからの日数・手の速さの端数・最短の道） */
  dayInMonth: number;
  handCarry: number;
  /** v8：今月の月末に開けた研究パネルの数 */
  rpMoves: number;
  /** 最短：いま狙っているもの（DigFind の番号） */
  digGoal?: number;
  /** v9：いまの発掘作業の残りの日数・今月始めた作業の回数 */
  runLeft: number;
  runsMonth: number;
  /** v20：決算の前に節税の投資をした回数と G */
  preInv: number;
  preG: number;
  /** v12：今月ダンジョンに潜った回数 */
  divesMonth?: number;
  /** v14：100% の再発掘の周回を足した・その町 */
  toured?: boolean;
  revisit?: Set<string>;
}

const DIRS = ['rd', 'ld', 'lu', 'ru'] as const;

/** 手の届く人（ほかのセクタのマネージャーと、技の修行中の人を除く） */
const crew = (s: P1State) => s.staff.filter((x) => x.task !== 'manager' && x.task !== 'train' && x.task !== 'lead');
const craftApt = (hero: number, s: P1State) => aptitude(s.staff.find((x) => x.hero === hero)!.stats, 'craft');

/** 道路に面した空き地（建物ごと）。お店は下見でいちばん売れる所（遠いと運ぶのに日数がかかるので少し引く） */
function pickLot(s: P1State, id: string, first: boolean): [number, number, (typeof DIRS)[number]] | null {
  if (P1B[id].kind === 'workshop') return tutSpot(s, id);
  if (P1B[id].kind === 'shop') {
    if (first) return tutSpot(s, id);
    let best: [number, number, (typeof DIRS)[number]] | null = null;
    let score = -Infinity;
    for (let j = 0; j < s.n; j++)
      for (let i = 0; i < s.n; i++)
        for (const d of allowedDirs(s, id, i, j)) {
          const si = siteInfo(s, id, i, j, d);
          if (!si) continue;
          const v = si.units - 0.5 * si.fromMine - 1.5 * si.days;
          if (v > score) {
            score = v;
            best = [i, j, d];
          }
        }
    return best;
  }
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const d = allowedDirs(s, id, i, j);
      if (d.length) return [i, j, d[0]];
    }
  return null;
}

/** その商品の素材のルートが全部ある（会社のルート ∪ セクタの特産） */
const routesOk = (s: P1State, x: Sku) => Object.keys(recipeOf(x)).every((m) => hasRoute(s, m as Mat));
/** その商品の技がある（技が要らない基礎の商品も true） */
const techOk = (s: P1State, key: string) => !PRODUCT[key].tech || has(s, techSkill(PRODUCT[key].tech!));
/** アンコモンを作れる職人（いまいる人） */
const uCrafters = (s: P1State) => crew(s).filter((x) => aptitude(x.stats, 'craft') >= UNCOMMON.minCraft);

/** v13：品ぞろえの点（売れる見込み × 粗利）。純粋な関数 */
export const lineupScore = (o: { units: number; margin: number }) => o.units * o.margin;
/** v13：品ぞろえの候補を点の大きい順に（同じ点なら SKU の順。純粋な関数） */
export function rankLineup<T extends { x: Sku; units: number; margin: number }>(cands: T[]): T[] {
  return [...cands].sort((a, b) => lineupScore(b) - lineupScore(a) || a.x.localeCompare(b.x));
}

/** 作業台ごとに作るもの：売れる見込み × 利益（作業台 1 つの月の量で頭打ち）の大きい順。アンコモンは作れるときだけ */
function chooseLineup(s: P1State, c: Ctx): Sku[] {
  const benches = Math.max(1, s.slots.length);
  // 並べられる種類：お店の棚の数（どのお店にも同じ並びを置く）
  const shopBs = s.buildings.filter((b) => b.owner === 'me' && P1B[b.id]?.kind === 'shop');
  // 棚はお店ごとの設備投資なので、いちばん棚の多いお店に合わせる（棚の少ないお店は前から並べる）
  const kinds = Math.max(1, Math.min(benches, Math.max(1, ...shopBs.map((b) => shelfCount(s, b)))));
  const tier = s.tier ?? 'C';
  const nU = uCrafters(s).length;
  // Rare の町 ①：Rare の復刻品は 1 段上の職人（DIG_BALANCE.relic.rare.minCraft）が要る
  const nR = crew(s).filter((x) => aptitude(x.stats, 'craft') >= DIG_BALANCE.relic.rare.minCraft).length;
  // v23（段 H1）：Epic の復刻品はさらに 1 段上の職人（DIG_BALANCE.relic.epic.minCraft）
  const nE = crew(s).filter((x) => aptitude(x.stats, 'craft') >= DIG_BALANCE.relic.epic.minCraft).length;
  const cands: { x: Sku; units: number; margin: number; key: string }[] = [];
  // v10c：通常・100% は、開いた復刻品も並べる候補に（遺物のランクだけ。技・魔法の釜・商品開発は要らない）
  for (const p of c.policy === 'rta' ? PRODUCTS : productsOf(s)) {
    if (!techOk(s, p.key) || !tierOk(p, tier)) continue;
    // v16b：この町で売れない復刻品（売れるシリーズに無い。Rare の町のダンジョン由来の Rare の復刻品）は並べない
    if (!relicSells(p, tier)) continue;
    for (const r of p.relic ? [p.relic.rank] : (['C', 'U'] as const)) {
      // 売れる見込み：飽和（他店で供給が足りている）を入れた見込み
      const est = Math.max(r === 'U' ? 4 : 1, sellEstimate(s, p.key, r));
      const x = sku(p.key, r);
      if (!routesOk(s, x)) continue;
      if (r === 'U' && (p.relic ? nU === 0 : !has(s, 'pot') || !s.dev.includes(p.key) || nU === 0)) continue;
      if (p.relic?.rare && nR === 0) continue;
      if (p.relic?.epic && nE === 0) continue;
      const pull = r === 'U' ? UNCOMMON.pull : TIERS[tier].commonPull;
      const perBench = ((30 * 0.85) / craftDays(s, x)) * batchOf(x);
      const units = Math.min(est * pull, perBench);
      cands.push({ x, units, margin: priceOf(s, x) - unitCost(s, x), key: p.key });
    }
  }
  // v13：毎月の締めで見直す（lineupDirty）。売れる見込み（飽和・後追い・他社の反撃を入れた sellEstimate）× 粗利の大きい順。
  // 真似されて見込みが落ちた商品は、ほかの商品・新しい復刻品より下がって棚から外れる
  const ranked = rankLineup(cands);
  cands.splice(0, cands.length, ...ranked);
  const out: Sku[] = [];
  let usedU = 0;
  // 依頼で要る商品（100% だけ）：受けている依頼の商品を 1 台ぶん入れる
  if (c.policy === 'full') {
    const want: Record<string, string> = { sensu100: 'Sensu', lantern50: 'Lantern', c2_goblet: 'Goblet', c3_knife: 'Knife' };
    for (const [m, key] of Object.entries(want)) {
      if (s.missions[m] !== 'accepted' || out.length >= kinds) continue;
      if (out.some((x) => skuParts(x)[0] === key)) continue;
      const cand = cands.find((o) => o.key === key && (skuParts(o.x)[1] === 'C' || usedU < nU));
      if (cand) {
        out.push(cand.x);
        if (skuParts(cand.x)[1] === 'U') usedU++;
      }
    }
    // アンコモンを 5 個売る依頼
    if (s.missions.uncommon === 'accepted' && !out.some((x) => skuParts(x)[1] === 'U') && usedU < nU) {
      const cand = cands.find((o) => skuParts(o.x)[1] === 'U');
      if (cand && out.length < kinds) {
        out.push(cand.x);
        usedU++;
      }
    }
  }
  for (const o of cands) {
    if (out.length >= kinds) break;
    if (out.some((x) => skuParts(x)[0] === o.key)) continue;
    if (skuParts(o.x)[1] === 'U') {
      if (usedU >= nU) continue;
      usedU++;
    }
    out.push(o.x);
  }
  // 残りの作業台は、並べている商品を重ねて作る（アンコモンは職人がいるぶんだけ。いなければ雇うのを待つ）
  const base = out.length;
  for (let k = 0; out.length < benches && base > 0; k++) out.push(out[k % base]);
  return out;
}

// ---------------------------------------------------------------- 行動

export interface Action {
  kind: string;
  run: () => unknown;
  /** v8：お金パネル（開放・レベル上げ）・発掘の道具の支出を数える */
  tag?: 'money' | 'tool';
}
/** 成功した（null・true・建物） */
const ok = (r: unknown) => r === null || r === true || (typeof r === 'object' && r !== undefined);

/**
 * v18（段 D：任せ方の 4 段）：通常の方針は、理解度 3 に届いた部門に順にチームリーダー（lead の業務。手でやっている手の中で、任せて困りにくいもの）、
 * 8 に届いたら事業部長（その部門のリーダーを昇進。いなければ待機中・雇った人）。最短・100% は手で（いまどおり）
 */
/** v25（段 UI1）：通常の方針がヒーローからの提案のカードを受ける（比べるときだけ止める） */
export const SIM_CARDS = { on: true };
/**
 * 段 M1：宣伝のはしご。自動の判断（部長の提案・カード・いちばん効く宣伝・販売の手）に、解禁した上の段（駅のサイネージから）を出すか。
 * 通常・最短は段 1〜3 のまま（Sim の時間を変えない）。100% だけ解禁した段も候補に
 */
export const SIM_AD: Record<PolicyId, boolean> = { rta: false, normal: false, full: true };
/**
 * v31（段 UI5d）：倉庫が 85% を超えたら、建てる前にいまある倉庫を強化するか（倉庫の提案の推奨と同じ手）。
 * 既定はオフ（以前どおり 2 棟まで建て、2 棟とも満杯なら強化）：オンにすると通常の合計 −5.5%・Uncommon −10%、100% の Uncommon +8%
 * （3 シード）と目安（合計 ±3%・ランクごと ±5%）を超えたため。比べるときは SIM_RACK_FIRST=1
 */
const SIM_RACK_FIRST = process.env.SIM_RACK_FIRST === '1';
/**
 * v18（段 D）：通常の方針だけ任せる。v45（段 L0）：リーダーは Uncommon の町から・部長と提案は Rare の町から（stage.ts の heroStage。
 * delegPlace の leaderLeft・headLeft がランクで止める。Rare より前は部長の提案の承認・simTake もしない）
 */
export const SIM_DELEG: Record<PolicyId, { on: boolean; lead: Partial<Record<DeptId, DutyId>> }> = {
  rta: { on: false, lead: {} },
  normal: { on: true, lead: { logistics: 'shelf', hr: 'rest', rnd: 'dig', marketing: 'ads', sales: 'vacant', support: 'reply' } },
  full: { on: false, lead: {} },
};
/** v18：任せないで回す（比べるためだけ。終わったら戻す） */
let delegOff = false;
export function withoutDeleg<T>(f: () => T): T {
  delegOff = true;
  try {
    return f();
  } finally {
    delegOff = false;
  }
}
/** 任命の人：待機中で出来のいちばん高い人。いなければ雇える候補から（1 日 1 人） */
function delegPlace(s: P1State, c: Ctx, acts: Action[], budget: number, reserve: number, hired: boolean, setHired: () => void) {
  if (!s.reports.length) return;
  // v28（段 P2）：配置の判断は変えない。候補の順は、史実の適性の倍率を入れない出来（段 P2 の前の candidatesFor と同じ並び）。倍率は選んだあとの出来に効く
  const idle = (d: DeptId) =>
    s.staff
      .filter((x) => x.task !== 'manager' && x.task !== 'train')
      .map((st) => ({ st, q: quality({ stats: st.stats, level: st.level, passives: st.passives }, d) }))
      .sort((a, b) => b.q - a.q || aptitude(b.st.stats, 'lead') - aptitude(a.st.stats, 'lead'))
      .filter((x) => x.st.task == null && !x.st.resting)[0]?.st.hero ?? null;
  // v22：カスタマーサポートのリーダーは待機中の人から（問い合わせは月に数件。そのために雇わない）
  const fromPool = (d: DeptId) => (has(s, 'hire') && !hired && budget > 3000 + reserve && d !== 'support' ? ([...s.hirePool].sort((a, b) => quality({ stats: heroStatsOf(b) }, d) - quality({ stats: heroStatsOf(a) }, d))[0] ?? null) : null);
  for (const def of DEPTS) {
    const d = def.id;
    // v30（段 I1）：Rare からは理解度に関係なく部長を置けるが、自動プレイの部長の置き方は前のまま（理解度 8 で。判断を変えない）
    if (headLeft(s, d) === 0 && deptLevel(s, d) >= DELEG.headAt && !headOf(s, d)) {
      const lead = SIM_DELEG[c.policy].lead[d];
      const L = lead ? leaderOf(s, lead) : null;
      const hero = L?.hero ?? idle(d);
      if (hero != null) {
        acts.push({ kind: 'lead', run: () => setHead(s, d, hero) });
        return;
      }
      const pick = fromPool(d);
      if (pick != null) {
        setHired();
        acts.push({ kind: 'hire', run: () => hire(s, pick) });
        acts.push({ kind: 'lead', run: () => setHead(s, d, pick) });
        return;
      }
      continue;
    }
    const duty = SIM_DELEG[c.policy].lead[d];
    if (!duty || leaderLeft(s, d) !== 0 || runnerOf(s, duty)) continue;
    const hero = idle(d);
    if (hero != null) {
      acts.push({ kind: 'lead', run: () => setLeader(s, duty, hero) });
      return;
    }
    const pick = fromPool(d);
    if (pick != null) {
      setHired();
      acts.push({ kind: 'hire', run: () => hire(s, pick) });
      acts.push({ kind: 'lead', run: () => setLeader(s, duty, pick) });
      return;
    }
  }
}

/**
 * v20（段 F：経理と総務）の方針。share：決算の前に節税の上限まで前倒しする投資の、手元の資金（手元に残す資金を除く）に対する上限。
 * donate：通常は研究への寄付（研究開発。RP も入る）を前倒しする回数の上限（そのあと見込みのある設備投資）。
 * env：100% は安い順のパネル・設備でも上限まで埋め、総務の環境（総務のパネル）を先に取り、疲れが FATIGUE.from を超えた持ち場の人を早めに休ませる（100%）。最短は節税を気にしない（null）
 */
export const SIM_TAX: Record<PolicyId, { share: number; env: boolean; donate: number } | null> = {
  rta: null,
  normal: { share: 0.5, env: false, donate: 8 },
  full: { share: 0.8, env: true, donate: 0 },
};
/** 1 日 1 回の判断：行動のリストを返す */
export function policy(s: P1State, c: Ctx): Action[] {
  const acts: Action[] = [];
  let budget = s.money;
  const spend = (v: number) => (budget -= v);
  // 手元に残す資金：ひと月の決まった費用（給与・維持費・アルバイト）＋ 少し
  const fixed = s.staff.reduce((a, x) => a + x.wage, 0) + s.buildings.filter((b) => b.owner === 'me').reduce((a, b) => a + (P1B[b.id]?.upkeep ?? 0), 0) + Object.values(s.shops).reduce((a, sh) => a + sh.part * 900, 0);
  const reserve = (c.policy === 'rta' ? 3000 : 6000) + fixed;
  const saving = s.cleared && c.at + 1 < c.route.length;

  // ---- 依頼：達成したら受け取る・空きがあれば受ける
  for (const m of MISSIONS) if (s.missions[m.id] === 'done') acts.push({ kind: 'claim', run: () => claim(s, m.id) });
  const accepted = MISSIONS.filter((m) => s.missions[m.id] === 'accepted').length;
  // v45（段 L0）：序盤の自動化を覚える依頼（teach）は遊ぶ人に教えるもの。最短・通常は受けない（依頼の手は前のまま）。
  // 100% は全部の依頼をこなす方針なので受ける（受けないと「全依頼」に届かず終わらない：計測 l0d の 100% +6.4%）
  if (accepted < 3) for (const m of offeredMissions(s).filter((x) => c.policy === 'full' || !x.teach).slice(0, 3 - accepted)) acts.push({ kind: 'accept', run: () => accept(s, m.id) });

  // ---- 工房
  const wsAny = s.buildings.find((b) => b.owner === 'me' && b.id === 'workshop');
  if (!wsAny) {
    const lot = pickLot(s, 'workshop', true);
    if (lot) acts.push({ kind: 'build', run: () => build(s, 'workshop', ...lot) });
    return acts;
  }
  const ws = myWorkshop(s);

  // ---- 外周：そのランクのセクタに出店したら、スキルツリーを開いて外周を開く（演出を見る）
  for (const tier of ringsDue(s)) openRing(s, tier);
  // ---- 名物店主（✨）：選んだお店がなければ、いちばん売れているお店に
  if (has(s, 'd_shop') && (s.dustShop == null || !s.shops[s.dustShop])) {
    const best = myShops(s).sort((a, b) => (s.shops[b.uid].last?.rev ?? s.shops[b.uid].rev) - (s.shops[a.uid].last?.rev ?? s.shops[a.uid].rev))[0];
    if (best) acts.push({ kind: 'skill', run: () => setDustShop(s, best.uid) || null });
  }
  // ---- スキル（人材の募集はチュートリアルでも取る）
  const pending = new Set<string>();
  let rpUsed = 0;
  const learnable = (id: string) => {
    const k = SKILL[id];
    if (!k) return false;
    // 技の修行は 1 つずつ（修行中・同じ日にもう 1 つ取ろうとしているときは待つ）
    if (k.train && (s.training || [...pending].some((x) => SKILL[x]?.train))) return false;
    // v5：外周（開いていない）・封印・準備中・エンブレム。v8：研究パネルは RP。v10：発掘の枝は出会いのあと（雲の中は取れない）・先に要るパネルの Lv
    if (k.sealed || skillSoon(k) || !ringOpen(s, skillTier(k)) || (s.emblem ?? 0) < (k.emblem ?? 0)) return false;
    // v14a：無限の強化パネル・研究への寄付は別の手（infSpend・donates）
    if (k.inf || k.donate) return false;
    // v33（段 K）：経営方針のパネルは部門の理解度が要る（別の手 simPolicy で取る）
    if (POL_PANELS.includes(k.id)) return false;
    if (k.branch === 'dig' && skillLock(s, k) === 'hidden') return false;
    if (isResearch(k) && (s.rp ?? 0) - rpUsed < rpCost(k)) return false;
    return !has(s, id) && !pending.has(id) && !c.ban.has(id) && !(k.requires ?? []).some((r) => (!has(s, r) && !pending.has(r)) || (has(s, r) && lvOf(s, r) < (k.reqLv?.[r] ?? 1))) && anyOfMet(k, (r) => has(s, r) || pending.has(r)) && (s.brand ?? 0) >= (k.brand ?? 0);
  };
  /** 設備投資「@id:段」：その段に届いていない建物ぜんぶ（無ければ取れない） */
  const invNeed = (x: string) => {
    const iv = invOf(x)!;
    if (c.ban.has(`@${iv.id}`) || pending.has(x)) return [];
    // 1 つ下の段まで来ている建物だけ（下の段は、枝の順で先に取る）
    return invTargets(s, iv.id).filter((b) => invLv(b, iv.id) === iv.lv - 1 && investCost(b, iv.id) != null);
  };
  const invCost = (x: string) => invNeed(x).reduce((a, b) => a + (investCost(b, invOf(x)!.id) ?? 0), 0);
  const takeInv = (x: string, keep = reserve) => {
    const bs = invNeed(x);
    const cost = invCost(x);
    if (!bs.length || budget < cost + keep) return false;
    spend(cost);
    pending.add(x);
    const iv = invOf(x)!;
    for (const b of bs) acts.push({ kind: 'invest', run: () => invest(s, b.uid, iv.id) });
    return true;
  };
  /** レベル上げ「lv:id」（v7）：次のレベル（v8：お金パネルだけ） */
  const lvTok = (id: string) => (id.startsWith('lv:') ? SKILL[id.slice(3)] : null);
  const lvCan = (k: Skill) => {
    if (k.inf || k.donate || pending.has(`lv:${k.id}`) || c.ban.has(k.id)) return false;
    const e = levelLock(s, k);
    return e === null || e === 'money';
  };
  const take = (id: string, keep = reserve) => {
    if (invOf(id)) return takeInv(id, keep);
    const lk = lvTok(id);
    if (lk) {
      const cost = nextLevelCost(s, lk);
      if (!lvCan(lk) || budget < cost + keep) return false;
      spend(cost);
      pending.add(id);
      acts.push({ kind: 'skill', run: () => levelUp(s, lk.id), tag: lk.branch === 'dig' ? 'tool' : 'money' });
      return true;
    }
    const research = isResearch(SKILL[id] ?? ({} as Skill));
    if (!learnable(id) || (!research && budget < SKILL[id].cost + keep)) return false;
    if (research) rpUsed += rpCost(SKILL[id]);
    else spend(SKILL[id].cost);
    pending.add(id);
    acts.push({ kind: 'skill', run: () => learn(s, id), tag: research ? undefined : SKILL[id].branch === 'dig' ? 'tool' : 'money' });
    return true;
  };
  /**
   * 段 UI5b：まだ取れないパネル id の、先に要るもの（たどって最初に取れるもの）。先に要るもの以外の理由（外周・エンブレム・ブランド力・RP）で取れないなら null
   */
  const missingPre = (id: string, seen = new Set<string>()): string | null => {
    const k = SKILL[id];
    if (!k || seen.has(id) || has(s, id) || pending.has(id)) return null;
    seen.add(id);
    for (const r of k.requires ?? []) {
      if (has(s, r) || pending.has(r)) continue;
      if (learnable(r)) return r;
      const deeper = missingPre(r, seen);
      if (deeper) return deeper;
    }
    return null;
  };
  /** 取れる（スキル：条件を満たしている／設備投資：その段に届いていない建物がある） */
  const can = (id: string) => (invOf(id) ? invNeed(id).length > 0 : lvTok(id) ? lvCan(lvTok(id)!) : learnable(id));
  const costOf = (id: string) => (invOf(id) ? invCost(id) : lvTok(id) ? nextLevelCost(s, lvTok(id)!) : SKILL[id] && isResearch(SKILL[id]) ? 0 : SKILL[id].cost);
  if (!has(s, 'hire')) take('hire', 0);

  // ---- お店（最初の 1 軒）
  const shopsAll = s.buildings.filter((b) => b.owner === 'me' && P1B[b.id]?.kind === 'shop');
  const shopKind = () => (canBuild(s, 'boutique') === null || (canBuild(s, 'boutique') === 'money' && has(s, 'shop3')) ? 'boutique' : has(s, 'shop2') ? 'import' : 'general_store');
  const buildShop = (kind = 'general_store') => {
    if (budget < P1B[kind].cost + reserve) return false;
    const lot = pickLot(s, kind, shopsAll.length === 0 && c.policy !== 'rta');
    if (!lot) return false;
    spend(P1B[kind].cost);
    c.shopsThisMonth++;
    acts.push({ kind: 'build', run: () => build(s, kind, ...lot) });
    return true;
  };
  if (shopsAll.length === 0 && ws) buildShop();
  if (!ws) return acts;

  // ---- 作るもの（月の締め・作業台が増えた・開発できた・セクタに着いたとき）
  // v18（段 D）：任せた業務は、手で決めない（リーダー・部長が回す。deleg.ts）
  const dg = (d: DutyId) => SIM_DELEG[c.policy].on && !delegOff && !!runnerOf(s, d);
  if (dg('craft')) {
    // 作るものの選択を任せた：作業台でいま作っているもの（任された人が決める）
    c.lineup = s.slots.map((sl) => sl.sku).filter((x): x is Sku => !!x);
    if (c.lineup.length < s.slots.length) c.lineup = s.slots.map((sl, k) => sl.sku ?? c.lineup[k % Math.max(1, c.lineup.length)]).filter((x): x is Sku => !!x);
  } else if (c.lineupDirty || c.lineup.length !== s.slots.length) {
    c.lineup = chooseLineup(s, c);
    c.lineupDirty = false;
  }
  const lineup = c.lineup;

  // ---- 資金が尽きたら他店でバイト（マインちゃんの案内）。手の空いた人、いなければ調達係・運搬係から
  // 資金が 0 を切ったら始め、5,000 G に戻るまで続ける
  const rescue = s.money < 5000 && (s.money < 0 || crew(s).some((x) => x.task === 'side'));
  if (s.money < 0 && !crew(s).some((x) => x.task === 'side')) {
    const pick = crew(s).find((x) => x.task == null) ?? (s.money < 0 ? crew(s).find((x) => x.task === 'buy') : undefined);
    if (pick) acts.push({ kind: 'side', run: () => assign(s, pick.hero, 'side', s.rivals[0].id) });
  }
  // ---- 人の割り当て（いまの担当を優先して入れ替えを少なく）
  const people = crew(s).filter((x) => x.task !== 'intel' && !(rescue && x.task === 'side'));
  const used = new Set<number>();
  const want: { task: Task; target: number | string | null; apt: Task; min?: number; cur: number | null }[] = [];
  s.slots.forEach((sl, k) => {
    const x = lineup[k];
    if (!x) return;
    want.push({ task: 'craft', target: k, apt: 'craft', min: skuParts(x)[1] === 'U' ? relicMinCraft(skuParts(x)[0]) : 0, cur: sl.worker });
  });
  // アンコモンの台を先に（適性の条件があるので）
  want.sort((a, b) => (b.min ?? 0) - (a.min ?? 0));
  // v15：調達係がいないのに雇える候補がもういないときは、お店の店員より先に調達係を決める（アルバイトのいるお店の店員を回す。下の v14 の手）
  const buyer0 = crew(s).find((x) => x.task === 'buy')?.hero ?? null;
  const buyFirst = buyer0 == null && !s.hirePool.length && has(s, 'hire');
  if (buyFirst) want.push({ task: 'buy', target: null, apt: 'buy', cur: null });
  for (const b of myShops(s)) want.push({ task: 'shop', target: b.uid, apt: 'shop', cur: s.shops[b.uid]?.staff ?? null });
  const haulers = crew(s).filter((x) => x.task === 'transport').map((x) => x.hero);
  const nHaul = Math.max(1, Math.min(3, c.policy === 'rta' ? (myShops(s).length >= 3 ? 2 : 1) : haulers.length || 1));
  for (let k = 0; k < nHaul; k++) want.push({ task: 'transport', target: null, apt: 'transport', cur: haulers[k] ?? null });
  const buyer = crew(s).find((x) => x.task === 'buy')?.hero ?? null;
  if (!buyFirst && (has(s, 'hire') || crew(s).length > 3)) want.push({ task: 'buy', target: null, apt: 'buy', cur: buyer });
  // v17：人が足りない（ランクアップの災害のあと、借金で雇えず、ほとんどがマネージャーに出ている）ときは、作業台 1 つ → 運搬 → お店 → 残りの作業台の順。
  // 2 つ目からの作業台の職人は、運搬・お店に回してよい（作業台が埋まって運ぶ人がいないまま売上 0 で止まる、を防ぐ。
  // ヒーローの育成でマネージャーに選ばれる人が変わり、100% の 3 シードとも Uncommon の 1 つ目でこの形になって止まった）
  const short = people.length < want.length && !!s.resets?.length;
  if (short) {
    const crafts = want.filter((w) => w.task === 'craft');
    const rest = want.filter((w) => w.task !== 'craft');
    want.splice(0, want.length, ...crafts.slice(0, 1), ...rest.filter((w) => w.task === 'transport'), ...rest.filter((w) => w.task !== 'transport'), ...crafts.slice(1));
  }
  let hired = false;
  // v18：配置換えを任せた：空いた持ち場に待機中の人が足りなければ、雇うだけ（置くのは任された人）
  if (dg('swap')) {
    const idleN = people.filter((x) => x.task == null).length;
    const open = want.filter((w) => w.cur == null || !people.some((x) => x.hero === w.cur));
    if (open.length > idleN && has(s, 'hire') && budget > 3000 + reserve / 2) {
      const w = open[0];
      const pick = [...s.hirePool].filter((id) => (w.min ? aptitude(heroStatsOf(id), 'craft') >= w.min : true)).sort((a, b) => aptitude(heroStatsOf(b), w.apt) - aptitude(heroStatsOf(a), w.apt))[0];
      if (pick != null) {
        hired = true;
        spend(1000);
        acts.push({ kind: 'hire', run: () => hire(s, pick) });
      }
    }
    want.length = 0;
  }
  for (const w of want) {
    let hero: number | null = null;
    if (w.cur != null && !used.has(w.cur) && people.some((x) => x.hero === w.cur) && craftOk(s, w.cur, w)) hero = w.cur;
    if (hero == null) {
      const free = people.filter((x) => !used.has(x.hero) && craftOk(s, x.hero, w)).sort((a, b) => aptitude(b.stats, w.apt) - aptitude(a.stats, w.apt));
      // ほかの担当からは引き抜かない（いま担当のない人だけ）。アンコモンの職人だけは引き抜く
      // （運搬係・調達係が 1 人しかいないときは引き抜かない。抜くと ③ 物流・① 調達が止まり、売上が 0 になって雇い直せなくなる）
      const only = (task: Task) => crew(s).filter((y) => y.task === task).length <= 1;
      const idle = free.filter((x) => x.task == null || (x.task === 'side' && !rescue) || (w.min && x.task !== 'craft' && !((x.task === 'transport' || x.task === 'buy') && only(x.task))) || (short && w.task !== 'craft' && x.task === 'craft'));
      hero = idle[0]?.hero ?? null;
      // v14：作業台に人がいないのに、雇える候補がもういない（候補を雇いきった）：アルバイトのいるお店の店員を職人に回す（お店はアルバイトで開いている）。
      // ランクアップの災害のあと、少ない支度金で立ち上げた順番によっては、店員だけが増えて作業台が空いたまま止まる（候補が尽きて雇い直せない）
      // v15：調達係も同じ（Uncommon の他社が強くなり、調達係がいないまま手で買う量で売上が頭打ちになって、資金だけが増えて止まるシードが出た）
      if (hero == null && (w.task === 'craft' || w.task === 'buy') && !s.hirePool.some((id) => (w.min ? aptitude(heroStatsOf(id), 'craft') >= w.min : true))) {
        const clerk = free.find((x) => x.task === 'shop' && (Object.values(s.shops).find((sh) => sh.staff === x.hero)?.part ?? 0) > 0);
        hero = clerk?.hero ?? null;
      }
    }
    if (hero == null) {
      // 雇う（1 日 1 人）
      if (!hired && has(s, 'hire') && budget > 3000 + reserve / 2) {
        const pick = [...s.hirePool].filter((id) => (w.min ? aptitude(heroStatsOf(id), 'craft') >= w.min : true)).sort((a, b) => aptitude(heroStatsOf(b), w.apt) - aptitude(heroStatsOf(a), w.apt))[0];
        if (pick != null) {
          hired = true;
          spend(1000);
          acts.push({ kind: 'hire', run: () => hire(s, pick) });
          const tgt = w.target;
          acts.push({ kind: 'assign', run: () => assign(s, pick, w.task, tgt) });
          used.add(pick);
        }
      }
      continue;
    }
    used.add(hero);
    const st = s.staff.find((x) => x.hero === hero)!;
    if (st.task !== w.task || st.target !== w.target) {
      const tgt = w.target;
      acts.push({ kind: 'assign', run: () => assign(s, hero!, w.task, tgt) });
    }
  }

  // ---- 作業台：作るものを始める（自動製造）。素材の買い付けの品目もそろえる
  const want2 = lineup.slice(0, s.slots.length);
  const kindsNow = [...new Set(want2)];
  const cur = procItems(s);
  if (!dg('order') && (s.proc.items.length || want2.some((x) => !cur.includes(x)) || cur.some((x) => !want2.includes(x)))) {
    for (const x of kindsNow) if (!s.proc.items.includes(x)) acts.push({ kind: 'proc', run: () => (toggleProcItem(s, x), null) });
    for (const x of s.proc.items) if (!kindsNow.includes(x)) acts.push({ kind: 'proc', run: () => (toggleProcItem(s, x), null) });
  }
  if (!dg('craft'))
    s.slots.forEach((sl, k) => {
      const x = want2[k];
      if (!x || sl.running) return;
      if (sl.sku === x && sl.repeat) return;
      acts.push({ kind: 'craft', run: () => startCraft(s, k, x) });
    });

  // ---- 素材：調達係がいないうちは手で買う（12 日ぶん）
  const hasBuyer = crew(s).some((x) => x.task === 'buy');
  if (!hasBuyer && !dg('order')) {
    for (const { m } of procMats(s)) {
      const need = want2.reduce((a, x) => a + ((recipeOf(x)[m] ?? 0) * 30) / craftDays(s, x), 0);
      const have = s.mats[m] ?? 0;
      if (have >= (need * 5) / 30) continue;
      const q = Math.floor(Math.min((need * 12) / 30 - have, procLeft(s), poolFree(s), budget / matPrice(s, m)));
      if (q > 0) {
        spend(q * matPrice(s, m));
        acts.push({ kind: 'buy', run: () => buy(s, m, q) });
      }
    }
  }

  // ---- 倉庫：置き場所が 85% を超えたら（2 棟まで）
  // v31（段 UI5d）：SIM_RACK_FIRST なら、建てる前にいまある倉庫を強化する（倉庫の提案の推奨と同じ。1 か月に 1 段。強化しきってから 2 棟目）
  const whs = s.buildings.filter((b) => b.owner === 'me' && b.id === 'warehouse').length;
  const rackAt = SIM_RACK_FIRST ? s.buildings.filter((b) => b.owner === 'me' && b.id === 'warehouse' && b.left <= 0 && investCost(b, 'rack') != null).sort((p, q) => invLv(p, 'rack') - invLv(q, 'rack'))[0] : undefined;
  if (poolUsed(s) > poolCap(s) * 0.85 && rackAt) {
    const cost = investCost(rackAt, 'rack')!;
    if (budget > cost + reserve) {
      spend(cost);
      acts.push({ kind: 'invest', run: () => invest(s, rackAt.uid, 'rack') });
    }
  } else if (poolUsed(s) > poolCap(s) * 0.85 && whs < 2 && !s.buildings.some((b) => b.owner === 'me' && b.id === 'warehouse' && b.left > 0)) {
    const lot = pickLot(s, 'warehouse', false);
    if (lot && budget > P1B.warehouse.cost + reserve) {
      spend(P1B.warehouse.cost);
      acts.push({ kind: 'build', run: () => build(s, 'warehouse', ...lot) });
    }
  }
  // v17：倉庫が 2 棟とも満杯（使わなくなった素材で埋まり、要る素材が買えない）なら、倉庫の高い棚・工房の物置の整理で置き場所を足す
  // （ヒーローの育成で流れが変わり、通常のシード 3 で置き場所が 0 のまま止まった。人なら気づいて足す手）
  if (whs >= 2 && poolFree(s) < poolCap(s) * 0.05) {
    let more = false;
    for (const b of s.buildings.filter((x) => x.owner === 'me' && x.left <= 0 && (x.id === 'warehouse' || P1B[x.id]?.kind === 'workshop'))) {
      const id = b.id === 'warehouse' ? 'rack' : 'stockroom';
      const cost = investCost(b, id);
      if (cost == null) continue;
      more = true;
      if (budget < cost + reserve) continue;
      spend(cost);
      acts.push({ kind: 'invest', run: () => invest(s, b.uid, id) });
    }
    // 調整 1：高い棚・物置も上げきって、置き場所が使わない素材で埋まり、作業台の素材が足りずに止まっているときは、倉庫をもう 1 棟（4 棟まで）。
    // （段 F を止めた比べの 100% のシード 3、ヤツカノタウン：布 349 個が残ったまま宝石・木材が買えず、売上 0 のまま 120 か月止まった。人なら倉庫を足す）
    // （士気の上の帯を強めた 100% のシード 1、カスミシティ：置き場所が上限を超えたまま、できた商品を置けずに作業台が止まった）
    // （作れない理由が「素材が足りない」か「できた商品を置く場所が無い」。100% のカスミシティでも、置き場所が上限を超えたまま作業台が止まった）
    const starved = s.slots.some((sl) => sl.sku && sl.worker != null && !sl.running && ['mats', 'full'].includes(craftCheck(s, sl.sku, sl.worker) ?? ''));
    if (!more && starved && whs < 4 && !s.buildings.some((b) => b.owner === 'me' && b.id === 'warehouse' && b.left > 0)) {
      const lot = pickLot(s, 'warehouse', false);
      if (lot && budget > P1B.warehouse.cost + reserve) {
        spend(P1B.warehouse.cost);
        acts.push({ kind: 'build', run: () => build(s, 'warehouse', ...lot) });
      }
    }
  }

  // ---- 段 UI5a：調達の交代要員を取ったら、手の空いた人を 2 人目の調達係に（雇い足しはしない）
  if (has(s, 'relief') && crew(s).filter((x) => x.task === 'buy').length === 1) {
    const idle = crew(s).find((x) => x.task == null && !x.resting && !used.has(x.hero));
    if (idle) acts.push({ kind: 'assign', run: () => assign(s, idle.hero, 'buy') });
  }

  // ---- お店：棚・アルバイト（段 UI5a：チュートリアルのあとは、棚は製造に合わせて自動で並ぶ（model.ts の syncShelves）。方針は棚を選ばない）
  for (const b of myShops(s)) {
    const sh = s.shops[b.uid];
    if (shelvesAuto(s)) {
      if (sh.part === 0 && !rescue) acts.push({ kind: 'part', run: () => setPart(s, b.uid, 1) });
      continue;
    }
    // 並べたい商品のうち棚に無いものを、並べなくなった商品・重なった棚・空の棚と替える（順番は気にしない）
    const left = (z: Sku) => (s.stock[z] ?? 0) + Object.values(s.shops).reduce((a, q) => a + (q.storage[z] ?? 0) + (q.shelf[z] ?? 0), 0) + s.trips.reduce((a, t) => a + (t.cargo[z] ?? 0), 0);
    const plan = [...sh.shelves];
    const missing = dg('shelf') ? [] : kindsNow.filter((y) => !plan.includes(y));
    if (!dg('shelf')) plan.forEach((x, k) => {
      const dup = x != null && plan.indexOf(x) !== k;
      if (x && kindsNow.includes(x) && !dup) return;
      // 古い商品が残っているうちは、新しい商品ができるまで売り切る
      const i = missing.findIndex((y) => x == null || dup || left(y) > 0);
      if (i < 0) return;
      const y = missing.splice(i, 1)[0];
      plan[k] = y;
      acts.push({ kind: 'shelf', run: () => setShelf(s, b.uid, k, y) });
    });
    // アルバイト：1 人（店員が休む日も開けておく）。「アルバイトの採用」で増やせる上限までは増やさない
    if (sh.part === 0 && !rescue) acts.push({ kind: 'part', run: () => setPart(s, b.uid, 1) });
  }

  // ---- 調査の依頼：手の空いた人に
  if (s.missions.research === 'accepted') {
    const idle = crew(s).find((x) => x.task == null && !used.has(x.hero));
    if (idle) acts.push({ kind: 'assign', run: () => assign(s, idle.hero, 'intel', s.rivals[0].id) });
  }

  // ---- 方針ごとの投資
  const bnNow = c.lastBn;
  const develops = () => {
    if (!has(s, 'pot') || s.lab) return;
    // アンコモンの価値が高い順。素材のルートが無ければルートのスキルを先に
    const order = PRODUCTS.filter((p) => techOk(s, p.key) && tierOk(p, s.tier ?? 'C'))
      .map((p) => p.key)
      .filter((k) => !s.dev.includes(k))
      .sort((a, b) => uValue(s, b) - uValue(s, a));
    for (const k of order) {
      const x = sku(k, 'U');
      if (!routesOk(s, x)) {
        for (const m of Object.keys(recipeOf(x)) as Mat[]) if (!s.routes.includes(m)) for (const r of routeChain(m)) take(r, 0);
        continue;
      }
      const cost = Math.round(PRODUCT[k].price * 4);
      if (budget < cost + reserve) return;
      spend(cost);
      acts.push({ kind: 'dev', run: () => develop(s, k) });
      return;
    }
  };
  /**
   * リサーチ（2 か所目以降）：市場データのおすすめ（recommend）と、このセクタの gap の商品に要る
   * 技 → 素材のルート →（Uncommon 以上）魔法の釜 → 商品開発 を順に取る。1 日に 1 つの商品ぶん
   */
  const researching = () => {
    if (!s.land || s.land.mine[0] === s.sector) return;
    const keys = [...new Set([recommend(s), ...gapOf(s)])].filter((k) => gapOf(s).includes(k));
    for (const key of keys) {
      const need = needFor(s, key);
      if (!need) continue;
      // 修行中：終わるまで待つあいだに、その商品の素材のルートを先に取っておく
      if (need.kind === 'tech' && s.training?.id === need.skill) {
        for (const m of Object.keys(recipeOf(sku(key, 'C'))) as Mat[]) if (!hasRoute(s, m)) for (const r of routeChain(m)) take(r, reserve / 2);
        return;
      }
      if (need.kind === 'tech') take(need.skill, reserve / 2);
      else if (need.kind === 'route') for (const r of routeChain(need.mat)) take(r, reserve / 2);
      else if (need.kind === 'pot') take('pot', 0);
      else if (need.kind === 'dev' && !s.lab && !pending.has('dev')) {
        const cost = Math.round(PRODUCT[key].price * 4);
        if (budget >= cost + reserve / 2) {
          spend(cost);
          pending.add('dev');
          acts.push({ kind: 'dev', run: () => develop(s, key) });
        }
      }
      return;
    }
  };
  if (!saving) researching();
  // 2 か所目以降：設備は建物ごと（セクタごと）なので、建てたら入れ直す。工房は作業台 → 荷車、お店は棚から
  if (!saving && s.land && s.land.mine[0] !== s.sector && c.policy !== 'rta') for (const x of ['@bench:1', '@carts:1', '@shelves:1']) take(x, reserve / 2);
  // 新商品の認知：gap の商品を並べたら、駅のポスター（30 日）で早く広める
  const gapOnShelf = myShops(s).some((b) => s.shops[b.uid].shelves.some((x) => x && gapOf(s).includes(skuParts(x)[0]) && knownOf(s, skuParts(x)[0]) < 1));
  if (gapOnShelf && (s.ads.poster ?? 0) <= 0 && !(dg('ads') && s.ads.poster != null)) {
    const ad = ADS.find((a) => a.id === 'poster')!;
    if (budget >= ad.cost + reserve / 2) {
      spend(ad.cost);
      acts.push({ kind: 'ad', run: () => runAd(s, 'poster') });
    }
  }
  const wantU = (s.tier ?? 'C') !== 'C' || c.policy === 'rta';
  if (c.policy === 'rta') {
    // v13：制覇に研究成果の発表が要るので、お題が許可の無い層・まだ許可の無い荒れ地にあるあいだは、投資の順番より発掘の支度（深い層の許可・発掘許可）のお金を先に残す
    if (!saving && !digSave(s)) {
      // 決まった順に 1 つずつ。資金が足りない所で止まって貯める（安いものに流れない）
      type Step = () => 'skip' | 'wait';
      const sk = (id: string): Step => () => {
        // 設備投資で、付ける工房・お店がまだ無い（これから建つ・工事中）なら待つ（できたらすぐ付ける）。倉庫は建てないこともあるので待たない
        const iv = invOf(id);
        const kind = iv ? INVEST[iv.id]?.kind : null;
        if (iv && !can(id) && kind !== 'warehouse' && !invTargets(s, iv.id).length) return 'wait';
        if (!can(id)) {
          // 段 UI5b：つながりの見直し（treelinks.ts）で先に要るものが変わったパネルは、まだの手前から順に取る（決まった順の意図を保つ）
          const pre = !iv && !lvTok(id) ? missingPre(id) : null;
          if (pre) return take(pre) ? 'wait' : 'wait';
          return 'skip';
        }
        return take(id) ? 'skip' : 'wait';
      };
      const shopUpTo = (n: number, onlyIfSell: boolean): Step => () => {
        if (shopsAll.length >= n) return 'skip';
        if (onlyIfSell && (bnNow !== 'sell' || shopsAll.some((b) => b.left > 0))) return 'skip';
        return buildShop(shopKind()) ? 'skip' : 'wait';
      };
      const dev1: Step = () => {
        if (!has(s, 'pot') || s.dev.length || s.lab) return 'skip';
        const before = acts.length;
        develops();
        return acts.length > before ? 'skip' : 'wait';
      };
      const devMore: Step = () => {
        if (!has(s, 'pot') || s.lab) return 'skip';
        develops();
        return 'skip';
      };
      const signs: Step = () => {
        for (const b of myShops(s)) {
          const cst = investCost(b, 'sign');
          if (cst == null) continue;
          if (budget < cst + reserve) return 'wait';
          spend(cst);
          acts.push({ kind: 'invest', run: () => invest(s, b.uid, 'sign') });
        }
        return 'skip';
      };
      const ad = (id: string): Step => () => {
        const x = ADS.find((a) => a.id === id)!;
        if ((s.ads[id] ?? 0) > 0 || !myShops(s).length) return 'skip';
        if (budget < x.cost + reserve) return 'wait';
        spend(x.cost);
        acts.push({ kind: 'ad', run: () => runAd(s, id) });
        return 'skip';
      };
      const queue: Step[] = [sk('hire'), shopUpTo(2, false), sk('@shelves:1'), sk('@bench:1'), sk('pot'), sk('route_cloth'), sk('route_paper'), dev1, sk('@shelves:1'), sk('host'), shopUpTo(5, true), sk('loading'), sk('@carts:1'), sk('stock1'), ad('poster'), sk('jig'), sk('bulk'), sk('@stockroom:1'), sk('b_sign'), sk('shop2'), sk('route_gem'), devMore, signs, ...RTA_SKILLS.map(sk), ad('flyer'), ...RTA_MORE_U.filter(() => s.tier === 'U').map(sk)];
      let waited = false;
      for (const q of queue)
        if (q() === 'wait') {
          waited = true;
          break;
        }
      // v13：決まった順を取り終えたら（資金が余っていく）、月末に通常と同じ「見込み（whatIf）の大きい順」に詰まりの段の手を
      // （v12 までは何もしないまま。Common をもう 1 つ回るようになり、Uncommon で順位が止まって資金だけ増えるシードが出た）
      if (!waited && c.monthEnd) byWhatIf(s, c, c.lastBn ?? 'sell', budget * 0.6, { take, spend, budget: () => budget, reserve, acts, hired: () => hired, setHired: () => (hired = true), buildShop: () => buildShop(shopKind()) });
    }
    // アンコモンの職人がいなければ、候補から雇っておく
    if (has(s, 'pot') && uCrafters(s).length < Math.min(2, s.slots.length) && !hired && budget > 4000) hireU(s, acts, () => (hired = true));
  } else {
    // 通常・100%：月末にまとめて考える
    const r = c.monthEnd;
    if (wantU && !saving) {
      // Uncommon のセクタに着いたら、案内に従って魔法の釜 → 商品開発
      take('pot', 0);
      develops();
      if (has(s, 'pot') && uCrafters(s).length === 0 && !hired) hireU(s, acts, () => (hired = true));
    } else if (has(s, 'pot')) develops();
    // v15：Uncommon で雇える候補を雇いきったら（他社が強くなって長くいる町で、店員・職人が足りずに頭打ちになる）、候補を増やすパネル
    if (r && !saving && ((s.tier ?? 'C') === 'U' || s.tier === 'R') && !s.hirePool.length) for (const id of RTA_MORE_U) if (take(id, reserve)) break;
    // マインちゃんの助言（タオックスの前半）：作業台が 1 台なら、2 台にすると作る数が倍（工房 → 設備投資）
    if (r && !saving && (s.sector ?? 'c1') === 'c1' && !s.cleared) take('@bench:1', reserve / 2);
    if (r && !saving) {
      const bn = c.lastBn ?? 'sell';
      // v16c（Rare の町 ②）：営業の画面の手。空き店舗が出たら入る → 「出店の候補地」の上位に店を出す → 宣伝で押す → 営業のパネル
      if (s.area) {
        const A = SIM_AREA;
        let took = 0;
        for (const cand of dg('vacant') ? [] : siteCandidates(s, 12)) {
          if (cand.vacant == null || took >= A.vacantPerMonth || cand.gain < A.minGain) continue;
          if (budget < cand.cost + reserve) break;
          spend(cand.cost);
          took++;
          const uid = cand.vacant;
          acts.push({ kind: 'vacant', run: () => { const x = takeVacant(s, uid); return typeof x === 'string' ? x : null; } });
        }
        const top = siteCandidates(s, 1).find((x) => x.vacant == null);
        if (!took && top && top.gain >= A.minGain && c.shopsThisMonth === 0 && shopsAll.every((b) => b.left <= 0) && shopsAll.length < A.maxShops && budget > top.cost + reserve) {
          spend(top.cost);
          c.shopsThisMonth++;
          acts.push({ kind: 'build', run: () => build(s, 'general_store', top.i, top.j, top.dir) });
        }
        for (const id of A.ads) {
          const ad = ADS.find((x) => x.id === id)!;
          if ((s.ads[id] ?? 0) > 0 || budget < ad.cost + reserve * 2 || (dg('ads') && s.ads[id] != null)) continue;
          spend(ad.cost);
          acts.push({ kind: 'ad', run: () => runAd(s, id) });
        }
        for (const id of A.panels) if (can(id) && take(id, reserve + budget * (1 - A.panelShare))) break;
      }
      // 売り場が細ければ、まずお店を 1 軒（月 1 軒まで。棚 2 の輸入品店は資金に余裕があるとき）
      else if (bn === 'sell' && c.shopsThisMonth === 0 && shopsAll.every((b) => b.left <= 0) && shopsAll.length < 5) {
        const kind = shopKind();
        buildShop(budget > P1B[kind].cost * 3 + reserve ? kind : 'general_store');
      }
      let cap = budget * 0.6;
      let n = 0;
      // v6（通常）：SCM ダッシュボードの「上げるには」と同じ見込み（whatIf）の大きい順に、詰まりの段の手を 2 つまで
      // v7：100% も同じ（開放とレベル上げを見込みの大きい順に混ぜる）
      n = byWhatIf(s, c, bn, cap, { take, spend, budget: () => budget, reserve, acts, hired: () => hired, setHired: () => (hired = true), buildShop: () => buildShop(shopKind()) });
      // 詰まっている段の枝から。取れるものが無ければ、次に細い段の枝から
      const caps = stageCaps(s);
      const order = n > 0 ? [] : [bn, ...(['buy', 'craft', 'haul', 'sell'] as Stage[]).filter((k) => k !== bn).sort((a, b) => caps[a].perMonth - caps[b].perMonth)];
      for (const st of order) {
        for (const id0 of BRANCH_ORDER[st]) {
          if (n >= 2) break;
          // 段 UI5b：先に要るものが変わったパネル（treelinks.ts）は、まだの手前を先に
          const id = can(id0) ? id0 : !invOf(id0) && !lvTok(id0) ? missingPre(id0) : null;
          if (!id || !can(id) || costOf(id) > cap) continue;
          const cost = costOf(id);
          if (take(id, 0)) {
            cap -= cost;
            n++;
          }
        }
        if (n > 0) break;
      }
      // v8：RP が残っていれば、詰まりの段の枝の研究パネルを説明の順（BRANCH_ORDER）→ 同じ枝の安い順に（見込みの手と合わせて RP_MOVES まで）
      if (c.policy === 'normal') {
        const ids = [...BRANCH_ORDER[bn].filter((id) => !invOf(id)), ...SKILLS.filter((k) => k.branch === STAGE_BRANCH[bn] && isResearch(k) && !k.big && CSM_RP[k.id] == null && !POL_PANELS.includes(k.id)).sort((a, b) => rpCost(a) - rpCost(b)).map((k) => k.id)];
        for (const id of ids) {
          if (c.rpMoves >= RP_MOVES) break;
          if (SKILL[id] && isResearch(SKILL[id]) && can(id) && take(id, 0)) c.rpMoves++;
        }
      }
      // RP がたまったら、詰まりの段の大きめの研究パネル（どこを重点的に伸ばすか）。100% は下でまとめて取る
      if (c.policy === 'normal') take(DUST_OF[bn] ?? 'd_logi', 0) || take('d_logi', 0);
      // 売り場が細いのに枝で取れるものが無ければ、お店（月 1 軒まで）・チラシ・看板
      if (bn === 'sell') {
        const ad = ADS[0];
        if ((s.ads.flyer ?? 0) <= 0 && budget > ad.cost + reserve * 2 && !(dg('ads') && s.ads.flyer != null)) {
          spend(ad.cost);
          acts.push({ kind: 'ad', run: () => runAd(s, 'flyer') });
        }
        const b0 = myShops(s).find((b) => investCost(b, 'sign') != null);
        if (b0 && budget > investCost(b0, 'sign')! + reserve * 2) {
          spend(investCost(b0, 'sign')!);
          acts.push({ kind: 'invest', run: () => invest(s, b0.uid, 'sign') });
        }
      }
      // 運ぶのが細ければ、運搬係をもう 1 人
      if (bn === 'haul' && crew(s).filter((x) => x.task === 'transport').length < 2 && !hired && has(s, 'hire')) {
        const pick = [...s.hirePool].sort((a, b) => aptitude(heroStatsOf(b), 'transport') - aptitude(heroStatsOf(a), 'transport'))[0];
        if (pick != null && budget > 3000) {
          hired = true;
          acts.push({ kind: 'hire', run: () => hire(s, pick) });
          acts.push({ kind: 'assign', run: () => assign(s, pick, 'transport') });
        }
      }
      // 100%：残りのスキルと設備投資も、資金の 4 割までで安い順に
      if (c.policy === 'full') {
        let rest = budget * 0.4;
        // v7：レベル上げ（lv:id）も。ゴールは C・U の取れるパネルをすべて Lv 最大
        const all = [...SKILLS.map((k) => k.id), ...SKILLS.filter((k) => ['C', 'U'].includes(skillTier(k))).map((k) => `lv:${k.id}`), ...Object.values(INVEST).flatMap((x) => x.cost.map((_, k) => `@${x.id}:${k + 1}`))].filter(can).sort((a, b) => costOf(a) - costOf(b));
        for (const id of all) {
          const cost = costOf(id);
          if (!can(id) || cost > rest) continue;
          if (take(id, 0)) rest -= cost;
        }
      }
      // v20（段 F）：決算の前（会社の四半期の締めまで 30 日以内の月末）に、節税の上限まで投資を前倒しする（SIM_TAX。最短は節税を気にしない）
      const T = SIM_TAX[c.policy];
      if (T && taxOn(s) && quarterNow(s).days <= 30) {
        const plan = taxPlan(s);
        const b0 = budget;
        // 通常：研究への寄付（研究開発。RP も入る）を前倒し → 残りは見込みのある設備投資（見込みの大きい順）
        if (!T.env && donateLock(s) !== 'hidden' && donateLock(s) !== 'closed') {
          let rnd = Math.min(plan.needRnd, Math.max(0, budget - reserve) * T.share);
          let n = 0;
          for (let k = donations(s); n < T.donate && donateCost(k) <= rnd; k++, n++) {
            rnd -= donateCost(k);
            spend(donateCost(k));
            acts.push({ kind: 'donate', run: () => (typeof donate(s) === 'string' ? 'none' : null) });
          }
        }
        let room = Math.min(plan.needCapex * (1 - (b0 - budget) / Math.max(1, plan.needRnd)), Math.max(0, budget - reserve) * T.share);
        if (room > 1000) {
          const b1 = budget;
          byWhatIf(s, c, bn, room, { take, spend, budget: () => budget, reserve, acts, hired: () => hired, setHired: () => (hired = true), buildShop: () => buildShop(shopKind()) });
          room -= b1 - budget;
          const pool = !T.env ? [] : [...SKILLS.filter((k) => !isResearch(k) && ['C', 'U'].includes(skillTier(k)) && (T.env || deptOf(k) !== 'general')).map((k) => (has(s, k.id) ? `lv:${k.id}` : k.id)), ...Object.values(INVEST).flatMap((x) => x.cost.map((_, k) => `@${x.id}:${k + 1}`))].filter(can).sort((a, b) => (T.env && deptOf(SKILL[b.replace('lv:', '')] ?? SKILLS[0]) === 'general' ? 1 : 0) - (T.env && deptOf(SKILL[a.replace('lv:', '')] ?? SKILLS[0]) === 'general' ? 1 : 0) || costOf(a) - costOf(b));
          for (const id of pool) {
            const cost = costOf(id);
            if (cost <= 0 || cost > room || !can(id)) continue;
            if (take(id, 0)) room -= cost;
          }
        }
        const used = b0 - budget;
        if (used > 0) {
          c.preInv++;
          c.preG += used;
        }
      }
    }
    // 100%：宣伝を 2 種類同時にする依頼（エムケーシティ）
    if (c.policy === 'full' && s.missions.u3_ads === 'accepted') {
      for (const a of ['flyer', 'event'] as const) {
        const ad = ADS.find((x) => x.id === a)!;
        if ((s.ads[a] ?? 0) <= 0 && budget > ad.cost) {
          spend(ad.cost);
          acts.push({ kind: 'ad', run: () => runAd(s, a) });
        }
      }
    }
    if (c.policy === 'full' && s.missions.ad === 'accepted' && (s.ads.flyer ?? 0) <= 0 && budget > 1500) acts.push({ kind: 'ad', run: () => runAd(s, 'flyer') });
    if (c.policy === 'full' && s.missions.two_shops === 'accepted' && shopsAll.length < 2 && c.shopsThisMonth === 0) buildShop();
  }
  // v14a（発掘 v2 の 6 段目）：月末に、100% は研究パネルを取り切ったあとの RP を無限の強化パネルへ（infSpend）。
  // 通常・100% は研究への寄付が開いたら（Common を 1 つ制覇・または Uncommon の調査依頼状）、資金に余裕がある月に寄付する（donates）
  if (c.monthEnd && c.policy === 'full') acts.push({ kind: 'skill', run: () => (infSpend(s) > 0 ? null : 'none') });
  // v18（段 D）：任せ方の 4 段。理解度 3 の部門に順にリーダー（SIM_DELEG.lead の業務）・8 で部長（その部門のリーダーを昇進）。
  // 提案は月末に、見込みがプラスなら承認（お金が足りなければ資金不足で保留）
  if (SIM_DELEG[c.policy].on && !delegOff && !saving) delegPlace(s, c, acts, budget, reserve, hired, () => (hired = true));
  // v45（段 L0）：Common ではリーダーを置かない・Rare より前は部長を置かない（deleg.ts の leaderLeft・headLeft がランクで止める）。
  // Rare より前は部長の提案を承認しない・ヒーローの提案のカードを受けない（simTake しない）。代わりに印の手（任せていない業務）を今どおり手で打つ
  const props = propsOpen(s);
  if (SIM_DELEG[c.policy].on && !delegOff && c.monthEnd && props)
    for (const pr of [...(s.deleg?.inbox ?? [])]) {
      if (pr.est <= 0) continue;
      acts.push({ kind: 'approve', run: () => (s.money - pr.cost < reserve ? 'none' : approve(s, pr.id) == null ? null : 'none') });
    }
  // v25（段 UI1）：ヒーローからの提案のカード（店員・職人・調達係・待機中の人）。部長の提案と同じ条件（見込みがプラス・払ったあとも手元に残すお金が残る）で、
  // おすすめ（金色）を受ける。最短・100% は手で（カードは使わない）。問い合わせ・炎上の予告・辞めたい・経理の助言・巻き返しは、いまの方針の手（SIM_CS・SIM_HR ほか）のまま
  if (SIM_DELEG[c.policy].on && !delegOff && c.monthEnd && SIM_CARDS.on && props) acts.push({ kind: 'approve', run: () => (simTake(s, reserve) > 0 ? null : 'none') });
  // v45（段 L0）：Rare より前は、地図の印の手（提案のカードと同じ下書きの元・同じ条件）を自分で打つ
  if (SIM_DELEG[c.policy].on && !delegOff && c.monthEnd && SIM_CARDS.on && !props) acts.push({ kind: 'mark', run: () => (simMarkTake(s, reserve) > 0 ? null : 'none') });
  if (c.monthEnd && c.policy !== 'rta' && donateLock(s) !== 'hidden' && donateLock(s) !== 'closed') {
    const next = c.route[c.at + 1];
    // v14：次がランクアップの進出なら、費用も立ち上げの資金も要らない（お金は徴収される）
    const saveNeed = saving && next && !rankUpTier(s, next) ? (s.land ? 0 : gateToll(s)) + sectorDef(next).fee + 12000 : 0;
    const keep = reserve + saveNeed + Math.max(SIM_DONATE.keep, c.monthEnd.revenue);
    let spare = budget - keep;
    let n = 0;
    for (let k = donations(s); n < SIM_DONATE.perMonth && donateCost(k) <= spare; k++, n++) spare -= donateCost(k);
    if (n > 0) {
      spend(budget - keep - spare);
      // 寄付の G は「お金パネル」の支出に入れない（表 6 に別に数える）
      for (let i = 0; i < n; i++) acts.push({ kind: 'donate', run: () => (typeof donate(s) === 'string' ? 'none' : null) });
    }
  }
  // v33（段 K）：経営方針。標準の選び方（全社方針の空いた枠は開いた順・方針の無い部門は部長の推奨）と、経営方針のパネル（SIM_POL）
  // v34（段 K2）：全社方針の枠 +1（ランクアップの特別なパネル）は、受け取れるようになった日にすぐ受け取る（どの方針も）
  if ((c.monthEnd || slotPending(s) > 0) && !POL_OFF.on) acts.push({ kind: 'skill', run: () => simPolicy(s, c.policy) });
  // v19（段 E2）：士気と給与の手（SIM_HR）
  if (!HR_OFF.on) hrPlace(s, c, acts, budget, reserve);
  // v22（段 G）：カスタマーサポートとマーケの手（SIM_CS）
  if (!CS_OFF.on) csPlace(s, c, acts, budget, reserve, take, can, dg);
  // v24（段 H2）：法務と M&A の手（SIM_LEGAL。Epic の町だけ）
  legalPlace(s, c, acts, budget, reserve, take, can, dg);
  // v26（段 UI4）：突発のできごと・外交のカード（出た日に選ぶ。SIM_EVENT）
  // v28（段 P2）：ヒーローの組み合わせのカードも、できごとと同じ方針で選ぶ（最短＝いまのまま・通常＝おすすめ・100%＝見込みのいちばん大きい手）
  for (const x of cardInbox(s)) if (x.src === 'event' || x.src === 'diplo' || x.src === 'duo') acts.push({ kind: 'event', run: () => simEvent(s, x, c.policy) });
  return acts;
}

/**
 * v33（段 K）：経営方針の自動プレイ。どの方針も、標準の選び方（policy.ts の polAutoFill：全社方針はバランスから、空いた枠は開いた順・
 * 事業別の方針は部長の推奨）。経営方針の研究パネルは、取れるようになったら RP が rpKeep を残して足りる月に取る。年初の経営会議（発表会）は全部「推奨」（board の boardAuto）。
 * v34（段 K2）：全社方針の枠のパネル（お金）はやめた。ランクアップの特別なパネル「全社方針の枠 +1」（無償）は、どの方針も受け取れるようになったらすぐ受け取る
 */
export const SIM_POL: Record<PolicyId, { panels: boolean; rpKeep: number }> = {
  rta: { panels: false, rpKeep: 0 },
  normal: { panels: true, rpKeep: 150 },
  full: { panels: true, rpKeep: 0 },
};
const polLog = { panels: 0, slots: 0 };
function simPolicy(s: P1State, p: PolicyId): string | null {
  const P = SIM_POL[p];
  let did = false;
  while (slotPending(s) > 0 && claimSlot(s) != null) {
    polLog.slots++;
    did = true;
  }
  if (P.panels)
    for (const k of POL_SKILLS) {
      if (!isResearch(k) || skillLock(s, k) !== null || (s.rp ?? 0) - rpCost(k) < P.rpKeep) continue;
      if (learn(s, k.id) == null) {
        polLog.panels++;
        did = true;
      }
    }
  const before = `${corpOf(s).join()}|${presDepts(s).map((d) => deptPolicyOf(s, d)).join()}`;
  polAutoFill(s);
  if (before !== `${corpOf(s).join()}|${presDepts(s).map((d) => deptPolicyOf(s, d)).join()}`) did = true;
  return did ? null : 'none';
}
/** v33（段 K）：経営方針を止めて回す（効き目・提案の傾向・発表会なし＝段 K の前と同じ。比べるためだけ。終わったら戻す） */
export function withoutPol<T>(f: () => T): T {
  POL_OFF.on = true;
  try {
    return f();
  } finally {
    POL_OFF.on = false;
  }
}

/**
 * v26（段 UI4）の方針：できごと＝最短は「様子を見る」系（おすすめでない、いちばん軽い手）・通常はおすすめ（金色）・100% は払える手のうち見込みのいちばん大きい手。
 * 外交＝最短は断る（Epic へ行かない）・通常と 100% は交易の約束と依頼を受けられるだけ受ける
 */
export const SIM_EVENT: Record<PolicyId, 'light' | 'rec' | 'best'> = { rta: 'light', normal: 'rec', full: 'best' };
function simEvent(s: P1State, x: Card, p: PolicyId): string | null {
  let k: number;
  const mode = SIM_EVENT[p];
  if (x.src === 'diplo' && x.dip) {
    const os = dipOpts(s, x.dip);
    k = mode === 'light' ? os.findIndex((o) => o.light) : os.findIndex((o) => o.id === 'sign' || o.id === 'accept');
  } else if (mode === 'light') k = x.ev ? lightOpt(x.ev) : x.choices.length - 1;
  else if (mode === 'rec') k = x.choices.findIndex((o) => o.rec);
  else k = x.choices.reduce((b, o, i) => (o.cost <= s.money && (b < 0 || (o.est ?? 0) > (x.choices[b].est ?? 0)) ? i : b), -1);
  if (k < 0) k = x.choices.length - 1;
  const r = chooseCard(s, x.id, k);
  // 払えなかった：軽い手で済ませる（次の日に持ち越さない）
  if (!r.ok && (r.err === 'money' || r.err === 'stock')) return chooseCard(s, x.id, x.ev ? lightOpt(x.ev) : x.choices.length - 1).ok ? null : 'none';
  return r.ok ? null : 'none';
}
/** v28（段 P2）：適性の倍率と組み合わせを止めて回す（fit：適性・duo：組み合わせ。両方止めると段 P2 の前と同じ。比べるためだけ。終わったら戻す） */
export function withoutP2<T>(f: () => T, o: { fit?: boolean; duo?: boolean } = { fit: true, duo: true }): T {
  const was = { ...P2_OFF };
  P2_OFF.fit = !!o.fit;
  P2_OFF.duo = !!o.duo;
  try {
    return f();
  } finally {
    Object.assign(P2_OFF, was);
  }
}
/** v26（段 UI4）：できごとと外交を止めて回す（段 UI4 の前と同じ。比べるためだけ。終わったら戻す） */
export function withoutEvents<T>(f: () => T): T {
  EVENT_OFF.on = true;
  try {
    return f();
  } finally {
    EVENT_OFF.on = false;
  }
}

/**
 * v24（段 H2：法務と M&A）の方針（Epic の町だけ）：
 * - 最短：使わない（Epic へ行かない）。
 * - 通常：着いたら仕入れの契約（6 か月・違約金なし）を結び、切れたら結び直す。売れている復刻品が来月真似されそう（市場の見通しの「真似してくるまで」1 か月）なら特許に。
 *   訴えられたら、勝ちの見込みが settle 未満なら和解。M&A は使わない（判断：通常は Epic の 1 町を自分の力で取る。手元のお金はほとんど寄付と次の準備に回る）。
 * - 100%：仕入れの契約（12 か月・条項は通せるだけ：違約金なし → 独占）。売れている Rare・Epic の復刻品はすべて特許に（Rare の復刻品は使用料で貸す）。
 *   特許を侵している他社は訴える。M&A：2 位以下で「引き継ぐ商売 ÷ 値段」がいちばん良い会社を、資金が値段の maMoney 倍あれば打診 → 調査 → 「ふつう」（断られたら「高く」）。
 *   条項は 従業員の引き継ぎ → 競業避止 → 分割 の順に通せるだけ。法務のパネルはほかのパネルと同じく安い順に取る
 */
export const SIM_LEGAL: Record<PolicyId, { supply: number; patent: 'soon' | 'all' | null; license: boolean; ma: boolean; maMoney: number; settle: number; sue: boolean }> = {
  rta: { supply: 0, patent: null, license: false, ma: false, maMoney: 0, settle: 0, sue: false },
  normal: { supply: 6, patent: 'soon', license: false, ma: false, maMoney: 0, settle: 0.45, sue: false },
  full: { supply: 12, patent: 'all', license: true, ma: true, maMoney: 2, settle: 0.4, sue: true },
};
/** v24 の計測の記録（買収の打診・調査・提示・断られた数） */
const lgLog = { offers: 0, dd: 0, sent: 0, refused: 0 };
export const legalLog = () => ({ ...lgLog });
function legalPlace(s: P1State, c: Ctx, acts: Action[], budget: number, reserve: number, take: (id: string, keep?: number) => boolean, can: (id: string) => boolean, dg: (d: DutyId) => boolean) {
  const P = SIM_LEGAL[c.policy];
  if (!legalHere(s) || c.policy === 'rta') return;
  void take;
  void can;
  // M&A の話（毎日）：調べてから「ふつう」、断られたら「高く」
  const d = P.ma ? dealOf(s) : null;
  if (d && d.stage === 'talk') {
    if (!d.dd) acts.push({ kind: 'legal', run: () => (startDD(s, d.id) == null ? (lgLog.dd++, null) : 'none') });
    else {
      const slots = clauseSlots(s);
      const c0: Clauses = {};
      for (const k of ['staff', 'noCompete', 'split'] as (keyof Clauses)[]) if (Object.keys(c0).length < slots) c0[k] = true;
      const lv: OfferLevel = d.refused && s.day < d.refused.until ? 'high' : 'mid';
      if (!offerLock(s, d, lv, c0)) acts.push({ kind: 'legal', run: () => (sendOffer(s, d.id, lv, c0) == null ? (lgLog.sent++, d.refused && lgLog.refused++, null) : 'none') });
    }
  }
  if (!c.monthEnd) return;
  const L = s.legal;
  // 仕入れの契約
  if (P.supply && !(L?.supply && s.day < L.supply.end)) {
    const slots = clauseSlots(s);
    const cl = c.policy === 'full' ? { noPenalty: true, ...(slots >= 2 ? { excl: true } : {}) } : { noPenalty: true };
    if (!supplyLock(s, P.supply, cl) && !dg('renew')) acts.push({ kind: 'legal', run: () => signSupply(s, P.supply, cl) });
  }
  // 特許
  if (P.patent && !dg('renew'))
    for (const k of patentable(s)) {
      const sold = c.monthEnd.bySeries[k] ?? 0;
      if (sold <= 0 || patentLock(s, k)) continue;
      const soon = (copyIn(s, k) ?? 99) <= 1;
      const fee = patentOf(s, k) ? LEGAL.patent.renew : LEGAL.patent.fee;
      if ((P.patent === 'soon' && !soon) || budget < fee + reserve * 3) continue;
      budget -= fee;
      acts.push({ kind: 'legal', run: () => filePatent(s, k) });
    }
  if (P.license) for (const p of L?.patents ?? []) if (!p.license && PRODUCT[p.key]?.relic && !PRODUCT[p.key].relic!.epic) acts.push({ kind: 'legal', run: () => (setLicense(s, p.key, true) ? null : 'none') });
  // 特許を侵している他社を訴える
  if (P.sue) for (const p of L?.patents ?? []) for (const rid of infringers(s, p.key)) acts.push({ kind: 'legal', run: () => sueInfringer(s, p.key, rid) });
  // 訴えられたら：勝ちの見込みが低ければ和解
  for (const x of openSuits(s)) if (x.side === 'def' && suitChance(s, x) < P.settle) acts.push({ kind: 'legal', run: () => (settle(s, x.id) ? null : 'none') });
  // M&A：2 位以下で「引き継ぐ商売 ÷ 値段」がいちばん良い会社
  if (P.ma && !dealOf(s)) {
    const best = s.rivals
      .filter((r) => !maLock(s, r.id))
      .map((r) => ({ r, price: guidePrice(s, r.id), gain: rivalSales(s, r) * keepRate(s, true) }))
      .sort((a, b) => b.gain / b.price - a.gain / a.price)[0];
    if (best && budget > best.price * P.maMoney + reserve && offerChance(s, best.r.id, 'mid') > 0)
      acts.push({ kind: 'legal', run: () => (typeof startDeal(s, best.r.id) === 'string' ? 'none' : (lgLog.offers++, null)) });
  }
}

/**
 * v22（段 G：カスタマーサポートとマーケ）の方針（月末に。問い合わせは月の締めに届く）：
 * - 最短：問い合わせは放っておく（期限で消える）・炎上のおそれにも手を打たない。
 * - 通常：問い合わせに合う返事（できなければ謝る）・炎上のおそれにお詫びの告知・カスタマーサポートのパネル（サポートセンター Lv3。お金だけ・理解度 3）を取って
 *   チームリーダー（問い合わせの返事）に任せる（SIM_DELEG）。
 * - 100%：通常の返事とお詫びに加えて、良いニュースを出せるたびに広報・炎上したら火消し・市場の見通しの「打ち時」（他社のセール・反撃・認知の低い商品）に、いちばん効く宣伝。
 *   パネルはほかのパネルと同じく安い順に取る
 */
export const SIM_CS: Record<PolicyId, { reply: boolean; warn: boolean; panels: string[]; pr: boolean; put: boolean; ads: boolean }> = {
  rta: { reply: false, warn: false, panels: [], pr: false, put: false, ads: false },
  normal: { reply: true, warn: true, panels: ['cs_center', 'lv:cs_center', 'lv:cs_center'], pr: false, put: false, ads: false },
  full: { reply: true, warn: true, panels: [], pr: true, put: true, ads: true },
};
/** v22：月末に数える（自動プレイの記録） */
const csLog = { pr: 0, prBrand: 0, put: 0, notice: 0, ads: 0 };
function csPlace(s: P1State, c: Ctx, acts: Action[], budget: number, reserve: number, take: (id: string, keep?: number) => boolean, can: (id: string) => boolean, dg: (d: DutyId) => boolean) {
  if (!c.monthEnd) return;
  const C = SIM_CS[c.policy];
  const town = (s.tier ?? 'C') !== 'C';
  if (town && C.reply && !dg('reply'))
    for (const q of [...(s.cs?.inbox ?? [])]) {
      const k = bestReply(s, q);
      acts.push({ kind: 'reply', run: () => reply(s, q.id, k === 'refund' && s.money < reserve ? 'sorry' : k) });
    }
  if (town && C.warn && s.cs?.warn && !s.cs.warn.done)
    acts.push({
      kind: 'notice',
      run: () => {
        const e = apologize(s);
        if (!e) csLog.notice++;
        return e;
      },
    });
  if (town && !c.ban.size) for (const id of C.panels) if (can(id) && take(id, reserve * 2)) break;
  if (C.put && putLock(s) === null && budget > reserve * 2)
    acts.push({
      kind: 'pr',
      run: () => {
        const e = putOut(s);
        if (!e) csLog.put++;
        return e;
      },
    });
  if (C.pr && prLock(s) === null && budget > reserve * 2)
    acts.push({
      kind: 'pr',
      run: () => {
        const g = publish(s);
        if (typeof g !== 'number') return g;
        csLog.pr++;
        csLog.prBrand += g;
        return null;
      },
    });
  if (C.ads && town && myShops(s).length) {
    const f = forecast(s);
    const hot = f.hints.some((x) => x.kind === 'sale' || x.kind === 'rally' || x.kind === 'known');
    const ad = f.bestAd ? ADS.find((x) => x.id === f.bestAd!.id) : null;
    if (hot && ad && f.bestAd!.gain > 0 && (s.ads[ad.id] ?? 0) <= 0 && budget > ad.cost + reserve * 2)
      acts.push({
        kind: 'ad',
        run: () => {
          const e = runAd(s, ad.id);
          if (!e) csLog.ads++;
          return e;
        },
      });
  }
}

/**
 * v19（段 E2：士気と給与）の方針：
 * - 通常：働いている人の士気が rest 未満なら休ませる。月末に、相場より 1 段以上下で士気が raiseBelow 未満の人を昇給（手元に残す資金を残せる月だけ）。
 *   辞めたいが出たら、引き止めの面談 → 昇給 → 賞与（お金があれば）。
 * - 100%：より丁寧に（休ませる目安が高い・相場より下の人は士気に関わらず昇給・士気がいちばん低い人に月 1 回の賞与）。
 * - 最短：辞めたいが出たときの面談だけ。
 */
/** v18（段 E2 の前の main）の合計の実時間（秒。同じ 3 シードの平均：最短 1,835・1,631・1,557／通常 6,937・7,719・7,813／100% 19,781・20,076・19,692） */
export const V18_TOTAL: Record<PolicyId, number> = { rta: (1835 + 1631 + 1557) / 3, normal: (6937 + 7719 + 7813) / 3, full: (19781 + 20076 + 19692) / 3 };
/** v19（段 F の前の main）の合計の実時間（秒。同じ 3 シード：最短 1,835・1,631・1,557／通常 7,815・7,013・7,211／100% 20,793・21,120・21,940） */
/** v20（調整 1 の前の main）の合計の実時間（秒。同じ 3 シードの平均。docs/ISLAND_BALANCE.md の v20 の節） */
export const V20_TOTAL: Record<PolicyId, number> = { rta: 1646, normal: 7014, full: 21556 };
/** v21（段 G の前の main・調整 1 のあと）の合計の実時間（秒。同じ 3 シード：最短 1,627・1,635・1,676／通常 6,831・7,015・7,197／100% 21,703・21,714・22,472） */
/**
 * v23（段 H1）：段 H1 の前の main（v22）で同じ 3 シードを回した、ランクごとの時間（秒。3 シードの平均。C はチュートリアルを含む。
 * R1 は Rare の 1 町目（グリーン・マウス）・redig は 100% の再発掘）。Common〜Rare の時間が変わらないかの比べ
 */
export const V22_TIER: Record<PolicyId, { total: number; C: number; U: number; R: number; R1: number; redig: number }> = {
  rta: { total: 1688, C: 768, U: 920, R: 0, R1: 0, redig: 0 },
  normal: { total: 7211, C: 3409, U: 2504, R: 1298, R1: 1298, redig: 0 },
  full: { total: 21397, C: 6927, U: 7564, R: 4084, R1: 1784, redig: 2822 },
};
/**
 * v24（段 H2）：段 H2 の前の main（v23）で同じ 3 シードを回した、ランクごとの時間（秒。3 シードの平均。C はチュートリアルを含む。
 * R1 は Rare の 1 町目（グリーン・マウス）・E1〜E3 は Epic の町ごと・redig は 100% の再発掘。levy は 3 回目の徴収額のシードごと）。
 * 最短 1,627・1,698・1,737／通常 9,215・9,661・10,255／100% 24,451・24,748・25,118
 */
export const V23_TIER: Record<PolicyId, { total: number; C: number; U: number; R: number; E: number; R1: number; E1: number; E2: number; E3: number; redig: number; levy: number[] }> = {
  rta: { total: (1627 + 1698 + 1737) / 3, C: (771 + 764 + 769) / 3, U: (857 + 935 + 969) / 3, R: 0, E: 0, R1: 0, E1: 0, E2: 0, E3: 0, redig: 0, levy: [] },
  normal: { total: (9215 + 9661 + 10255) / 3, C: (3409 + 3415 + 3403) / 3, U: (2130 + 2344 + 3040) / 3, R: (2226 + 2218 + 1978) / 3, E: (1451 + 1685 + 1835) / 3, R1: (1397 + 1369 + 1141) / 3, E1: (1451 + 1685 + 1835) / 3, E2: 0, E3: 0, redig: 0, levy: [9173, 1457473, 3437908] },
  full: { total: (24451 + 24748 + 25118) / 3, C: (6815 + 7036 + 6930) / 3, U: (7277 + 7865 + 7609) / 3, R: (4117 + 3638 + 4413) / 3, E: (3112 + 3021 + 3008) / 3, R1: (1837 + 1417 + 2089) / 3, E1: (1531 + 1460 + 1448) / 3, E2: (771 + 767 + 753) / 3, E3: (811 + 795 + 807) / 3, redig: (3130 + 3188 + 3158) / 3, levy: [38804676, 20779187, 10020335] },
};
/**
 * v25（段 UI1）：段 UI1 の前の main（v24）で同じ 3 シードを回した、ランクごとの時間（秒。C はチュートリアルを含む）。
 * 最短 1,627・1,698・1,737／通常 9,235・9,669・10,323／100% 24,587・24,954・25,334
 */
export const V24_TIER: Record<PolicyId, { total: number; C: number; U: number; R: number; E: number }> = {
  rta: { total: (1627 + 1698 + 1737) / 3, C: (771 + 764 + 769) / 3, U: (857 + 935 + 969) / 3, R: 0, E: 0 },
  normal: { total: (9235 + 9669 + 10323) / 3, C: (3409 + 3415 + 3403) / 3, U: (2130 + 2344 + 3040) / 3, R: (2226 + 2218 + 1978) / 3, E: (1471 + 1693 + 1903) / 3 },
  full: { total: (24587 + 24954 + 25334) / 3, C: (6815 + 7036 + 6930) / 3, U: (7277 + 7865 + 7609) / 3, R: (4117 + 3638 + 4413) / 3, E: (3252 + 3223 + 3232) / 3 },
};
/**
 * v26（段 UI4）：段 UI4 の前の main（v25）で同じ 3 シードを回した、ランクごとの時間（秒。C はチュートリアルを含む）。
 * 最短 1,627・1,698・1,737／通常 9,231・9,669・9,777／100% 24,587・24,954・25,334
 */
export const V25_TIER: Record<PolicyId, { total: number; C: number; U: number; R: number; E: number }> = {
  rta: { total: (1627.2 + 1698.2 + 1737.2) / 3, C: (770.5 + 763.5 + 768.5) / 3, U: (856.7 + 934.7 + 968.7) / 3, R: 0, E: 0 },
  normal: { total: (9230.8 + 9668.8 + 9776.8) / 3, C: (3408.8 + 3414.8 + 3402.8) / 3, U: (2129.6 + 2343.6 + 2529.6) / 3, R: (2201.6 + 2217.6 + 2189.6) / 3, E: (1490.8 + 1692.8 + 1654.8) / 3 },
  full: { total: (24587.2 + 24953.6 + 25333.6) / 3, C: (6815.2 + 7035.6 + 6929.6) / 3, U: (7276.8 + 7865.2 + 7608.8) / 3, R: (4117.2 + 3637.6 + 4413.2) / 3, E: (3252.4 + 3223.2 + 3232) / 3 },
};
/**
 * 調整 v25c：PR #29（v25b）の前の main（v25。e95a8eb）を 9 シード（1〜9）で回したランクごとの時間（秒の平均。C はチュートリアルを含む）。
 * sim-out/main--seeds-1-2-3-4-5-6-7-8-9 の表 19 の％を V24_TIER に掛けて戻した値（％が小数 1 桁なので ±0.05% ほどの丸め）。3 シードは V25_TIER
 */
export const V25_TIER9: Record<PolicyId, { total: number; C: number; U: number; R: number; E: number }> = {
  rta: { total: 1672.1, C: 758.8, U: 912.0, R: 0, E: 0 },
  normal: { total: 9878.7, C: 3562.4, U: 2554.8, R: 2194.2, E: 1564.0 },
  full: { total: 24708.8, C: 6934.0, U: 7485.1, R: 3922.2, E: 3290.7 },
};
export const V21_TOTAL: Record<PolicyId, number> = { rta: (1627 + 1635 + 1676) / 3, normal: (6831 + 7015 + 7197) / 3, full: (21703 + 21714 + 22472) / 3 };
export const V19_TOTAL: Record<PolicyId, number> = { rta: (1835 + 1631 + 1557) / 3, normal: (7815 + 7013 + 7211) / 3, full: (20793 + 21120 + 21940) / 3 };
export const SIM_HR: Record<PolicyId, { rest: number; raiseBelow: number; bonus: boolean }> = {
  rta: { rest: 0, raiseBelow: 0, bonus: false },
  normal: { rest: 38, raiseBelow: 55, bonus: false },
  full: { rest: 45, raiseBelow: 62, bonus: true },
};
/** 出ている途中の調達係・運搬係（休ませない） */
const onTrip = (s: P1State, st: { hero: number; task: Task | null }) => (st.task === 'buy' && s.buyTrip?.hero === st.hero) || (st.task === 'transport' && s.trips.some((x) => x.hauler === st.hero));
function hrPlace(s: P1State, c: Ctx, acts: Action[], budget: number, reserve: number) {
  const H = SIM_HR[c.policy];
  for (const st of s.staff) {
    if (st.quit != null && !st.talked) acts.push({ kind: 'talk', run: () => talk(s, st.hero) });
    // 休ませる：持ち場の人（リーダー・セクター長・修行・バイトは除く）
    if (H.rest && !st.resting && st.task && st.task !== 'lead' && st.task !== 'manager' && st.task !== 'train' && st.task !== 'side' && moraleOf(st) < H.rest && st.stamina < st.stats.hp * 0.6) acts.push({ kind: 'rest', run: () => (setRest(s, st.hero, true), null) });
    // v20（段 F）：100% は、疲れが FATIGUE.to に近い（くたくたの手前）持ち場の人を、月末に休ませる（押す数を増やしすぎない）
    else if (SIM_TAX[c.policy]?.env && c.monthEnd && gaOn(s) && !st.resting && st.task && st.task !== 'lead' && st.task !== 'manager' && st.task !== 'train' && st.task !== 'side' && fatigueOf(st) >= FATIGUE.from + 0.1 && !onTrip(s, st)) acts.push({ kind: 'rest', run: () => (setRest(s, st.hero, true), null) });
  }
  if (!c.monthEnd) return;
  let left = budget - reserve;
  for (const st of [...s.staff].sort((a, b) => moraleOf(a) - moraleOf(b))) {
    const want = st.quit != null || (c.policy !== 'rta' && toMarket(st) >= 1 && moraleOf(st) < H.raiseBelow);
    const cost = raiseStep(st.hero) * 3;
    if (want && (st.lv ?? 0) < PAY.raiseMax && left > cost) {
      left -= cost;
      acts.push({ kind: 'raise', run: () => raise(s, st.hero) });
    }
    if (st.quit != null && c.policy !== 'rta' && left > bonusCost(st)) {
      left -= bonusCost(st);
      acts.push({ kind: 'bonus', run: () => giveBonus(s, st.hero) });
    }
  }
  if (H.bonus && s.staff.length) {
    const low = [...s.staff].sort((a, b) => moraleOf(a) - moraleOf(b))[0];
    if (moraleOf(low) < MORALE.band.lo + 10 && left > bonusCost(low) * 20) acts.push({ kind: 'bonus', run: () => giveBonus(s, low.hero) });
  }
}

/**
 * v14a：研究への寄付の手（通常・100%）。月末に、手元に残す資金（決まった費用＋次のセクタへ移るお金＋ max(keep, 先月の売上)）を引いて余るぶんで、
 * 月に perMonth 回まで（値段は押すたびに上がるので、余りが少ない月は押さない）。最短は押さない
 */
export const SIM_DONATE = { keep: 100000, perMonth: 5 };
/**
 * v16c（Rare の町 ②）：通常・100% の Rare の町の営業の手（月末）。空き店舗にはひと月 vacantPerMonth 軒まで入る・
 * 候補地の 1 位に（自社の取り分の増えが minGain 以上なら）月 1 軒・maxShops 軒まで。宣伝（ads）は切れたら出し直す。
 * 営業のパネル（panels）は並びの順に、資金の panelShare までで 1 つずつ
 */
export const SIM_AREA = { vacantPerMonth: 2, maxShops: 8, minGain: 0.01, ads: ['flyer'], panels: ['sa_survey', 'sa_local', 'sa_dominant', 'sa_road', 'sa_nego', 'sa_edge'], panelShare: 0.3 };
/** 100% は C・U の研究パネル（無限の強化パネルを除く）を全部開けたら、RP を無限の強化パネルへ（次の Lv の安い順に、RP があるだけ）。上げた Lv の数 */
export function infSpend(s: P1State): number {
  if (!fullSkills().filter((k) => isResearch(k) && !k.inf).every((k) => has(s, k.id))) return 0;
  let n = 0;
  for (let guard = 0; guard < 200; guard++) {
    const cand = INF_PANELS.map((id) => SKILL[id])
      .map((k) => ({ k, cost: has(s, k.id) ? nextLevelRp(s, k) : rpCost(k), ok: has(s, k.id) ? levelLock(s, k) === null : skillLock(s, k) === null }))
      .filter((x) => x.ok)
      .sort((a, b) => a.cost - b.cost)[0];
    if (!cand) break;
    if ((has(s, cand.k.id) ? levelUp(s, cand.k.id) : learn(s, cand.k.id)) != null) break;
    n++;
  }
  return n;
}

/**
 * v6（通常の方針）：詰まりの段の打ち手を、見込み（whatIf：+N 個／月）の大きい順に、月の予算（cap）の中で 2 つまで。
 * 設備投資・スキル・人を置く・倉庫・④ 販売の打ち手（お店・アルバイト・什器・棚・宣伝・売り場の強さ）。取った数を返す
 */
interface WhatIfHooks {
  take: (id: string, keep?: number) => boolean;
  spend: (v: number) => number;
  budget: () => number;
  reserve: number;
  acts: Action[];
  hired: () => boolean;
  setHired: () => void;
  buildShop: () => boolean;
}
/** v8：月末に開ける研究パネルの数の上限（見込みの大きい順） */
const RP_MOVES = 2;
function byWhatIf(s: P1State, c: Ctx, bn: Stage, cap: number, k: WhatIfHooks): number {
  let n = 0;
  // 1 個あたりの粗利（先月の売上 ÷ 売れた数 − 素材代）。月々の費用（維持費・給料・アルバイト代）が、増える粗利より大きい手は取らない
  const r = c.monthEnd;
  const price = r && r.flow && r.flow.sold > 0 ? r.revenue / r.flow.sold : 1000;
  const xs = s.slots.map((x) => x.sku).filter((x): x is Sku => !!x);
  const margin = price - (xs.length ? xs.reduce((a, x) => a + unitCost(s, x), 0) / xs.length : 0);
  const monthly = (w: (typeof list)[number]): number => {
    const m = w.move;
    if (m.kind === 'person') return m.hire ? m.cost : 0;
    if (m.kind === 'build') return P1B[m.id]?.upkeep ?? 0;
    if (m.kind === 'sell' && m.w.kind === 'shop') return (P1B.general_store.upkeep ?? 0) + 900 + 300;
    if (m.kind === 'sell' && m.w.kind === 'part') return 900;
    return 0;
  };
  const list = whatIf(s, bn);
  // v8：研究パネル（RP で開く）は資金の手（2 つまで）と別に数える。見込みの大きい順に、RP があるだけ（RP_MOVES まで）
  c.rpMoves = 0;
  for (const w of list) {
    if (n >= 2 && c.rpMoves >= RP_MOVES) break;
    if (!w.ok || w.units * margin <= monthly(w)) continue;
    const m = w.move;
    if (m.kind === 'skill' && isResearch(SKILL[m.id])) {
      if (c.rpMoves < RP_MOVES && k.take(m.id, 0)) c.rpMoves++;
      continue;
    }
    if (n >= 2) continue;
    if (m.kind === 'invest') {
      if (c.ban.has(`@${m.id}`) || m.cost > cap || k.budget() < m.cost + k.reserve / 2) continue;
      k.spend(m.cost);
      cap -= m.cost;
      const uid = m.uid;
      const id = m.id;
      k.acts.push({ kind: 'invest', run: () => invest(s, uid, id) });
      n++;
    } else if (m.kind === 'skill') {
      if (SKILL[m.id].cost > cap || !k.take(m.id, 0)) continue;
      cap -= SKILL[m.id].cost;
      n++;
    } else if (m.kind === 'level') {
      // レベル上げ（v7）：見込みの大きい順に、開放と混ぜて
      if (m.cost > cap || k.budget() < m.cost + k.reserve / 2) continue;
      k.spend(m.cost);
      cap -= m.cost;
      const id = m.id;
      k.acts.push({ kind: 'skill', run: () => levelUp(s, id), tag: 'money' });
      n++;
    } else if (m.kind === 'person') {
      if (m.hire && (k.hired() || k.budget() < 3000 + k.reserve / 2)) continue;
      const hero = m.hero;
      const task = m.task;
      const target = m.target;
      if (m.hire) {
        k.setHired();
        k.acts.push({ kind: 'hire', run: () => hire(s, hero) });
      }
      if (m.replace != null) {
        const old = m.replace;
        k.acts.push({ kind: 'assign', run: () => assign(s, old, null) });
      }
      k.acts.push({ kind: 'assign', run: () => assign(s, hero, task, target) });
      n++;
    } else if (m.kind === 'build') {
      if (m.cost > cap || k.budget() < m.cost + k.reserve) continue;
      const lot = pickLot(s, m.id, false);
      if (!lot) continue;
      k.spend(m.cost);
      cap -= m.cost;
      const id = m.id;
      k.acts.push({ kind: 'build', run: () => build(s, id, ...lot) });
      n++;
    } else {
      const x = m.w;
      const b = x.uid != null ? s.buildings.find((y) => y.uid === x.uid) : undefined;
      if (x.kind === 'shop') {
        if (c.shopsThisMonth === 0 && k.buildShop()) n++;
      } else if (x.kind === 'part' && b) {
        const uid = b.uid;
        k.acts.push({ kind: 'part', run: () => setPart(s, uid, s.shops[uid].part + 1) });
        n++;
      } else if ((x.kind === 'fixtures' || x.kind === 'shelf') && b) {
        const id = x.kind === 'shelf' ? 'shelves' : 'fixtures';
        const cost = investCost(b, id);
        if (cost == null || c.ban.has(`@${id}`) || cost > cap || k.budget() < cost + k.reserve / 2) continue;
        k.spend(cost);
        cap -= cost;
        const uid = b.uid;
        k.acts.push({ kind: 'invest', run: () => invest(s, uid, id) });
        c.lineupDirty = true;
        n++;
      } else if (x.kind === 'pull') {
        if (['host', 'b_sign', 'concierge', 'pos', 'flow'].some((id) => SKILL[id].cost <= cap && k.take(id, 0))) n++;
      } else if (x.kind === 'known') {
        const ad = ADS.find((a) => a.id === 'poster')!;
        if ((s.ads.poster ?? 0) > 0 || k.budget() < ad.cost + k.reserve) continue;
        k.spend(ad.cost);
        k.acts.push({ kind: 'ad', run: () => runAd(s, 'poster') });
        n++;
      }
      // goods（別の商品）は、作るものの決め直し（chooseLineup）にまかせる
    }
  }
  return n;
}

function hireU(s: P1State, acts: Action[], done: () => void) {
  const pick = [...s.hirePool].filter((id) => aptitude(heroStatsOf(id), 'craft') >= UNCOMMON.minCraft).sort((a, b) => aptitude(heroStatsOf(b), 'craft') - aptitude(heroStatsOf(a), 'craft'))[0];
  if (pick == null) return;
  done();
  acts.push({ kind: 'hire', run: () => hire(s, pick) });
}

/** 担当の条件（アンコモンの台は製造の適性 31 以上） */
function craftOk(s: P1State, hero: number, w: { min?: number }) {
  return !w.min || craftApt(hero, s) >= w.min;
}

const heroStatsOf = (id: number) => heroStats(id);

/**
 * 人が SCM の画面から読むボトルネック。調達係がいると調達の量は製造に合わせて決まる（procQty）ので、
 * 調達と製造の棒が同じ長さになり、ゲームの bottleneck() は並んだときに先の「調達」を返す。人は同じ長さなら製造を直すので、そう読む。
 */
export function readBn(s: P1State): Stage {
  const c = stageCaps(s);
  const bn = bottleneck(c);
  // 調達係が休んでいる日は、手元の素材だけで数えるので棒が短く出る。担当がいれば同じく製造として読む
  const buyer = s.staff.some((x) => x.task === 'buy');
  if (bn === 'buy' && ((!c.buy.stopped && c.buy.perMonth >= c.craft.perMonth * 0.98) || buyer)) {
    const rest = (['craft', 'haul', 'sell'] as Stage[]).reduce((a, k) => (c[k].perMonth < c[a].perMonth ? k : a), 'craft' as Stage);
    return rest;
  }
  return bn;
}

/** 宝石は紙のあと、紙は布のあと（スキルの順） */
function routeChain(m: Mat): string[] {
  if (m === 'cloth') return ['route_cloth'];
  if (m === 'paper') return ['route_cloth', 'route_paper'];
  if (m === 'gem') return ['route_cloth', 'route_paper', 'route_gem'];
  return [];
}

/** アンコモンのひと月の粗利の目安（作業台 1 つ） */
function uValue(s: P1State, key: string) {
  const x = sku(key, 'U');
  const units = Math.min(Math.max(4, sellEstimate(s, key, 'U')) * UNCOMMON.pull, ((30 * 0.85) / craftDays(s, x)) * batchOf(x));
  return units * (priceOf(s, x) - unitCost(s, x));
}


// ---------------------------------------------------------------- 発掘（v8。v11：正面の壁を手前から奥へ）

/** 掘り残したマスの数（荒れ地 4 か所の合計。いちばん奥まで掘っていないマス） */
export const digLeft = (s: P1State) => (s.dig ? s.dig.sites.reduce((a, x, k) => a + x.depth.filter((v) => v < (digLayouts(s.dig!.sector)[k]?.depth ?? 0)).length, 0) : 0);
/** いま掘っている荒れ地の進み */
const curSt = (s: P1State) => siteState(s, s.dig!.cur)!;
/** マス k のいまの層を打てる（掘りきっていない・掘ってよい層・2 × 2 を待っていない） */
const canHit = (s: P1State, k: number) => {
  const L = digSite(s)!;
  const st = curSt(s);
  return st.depth[k] < L.depth && st.hp[k] > 0 && layerOpen(s, L, st.depth[k]);
};

/**
 * 配置を知っている人（最短）：まだのお題（なければ石板・エクステ）のうち、取るまでに打つ回数がいちばん少ないものを狙い、
 * その範囲のマスを手前から打つ。狙いは c.digGoal にとっておき、取れたら選び直す
 */
function knowTarget(s: P1State, c: Ctx): [number, number] | null {
  const L = digSite(s);
  if (!L || !s.dig) return null;
  const st = curSt(s);
  const pw = digPower(s);
  // 取るまでの打つ回数（範囲のマスの、その層まで。掘れない層があれば Infinity）
  const cost = (i: number) => {
    const f = L.finds[i];
    let v = 0;
    for (const k of findCells(L, f)) {
      if (st.depth[k] > f.layer) return Infinity;
      for (let n = st.depth[k]; n <= f.layer; n++) {
        if (!layerOpen(s, L, n)) return Infinity;
        v += Math.ceil((n === st.depth[k] ? st.hp[k] : L.cells[k].hard[n]) / pw - 1e-9);
      }
    }
    return v;
  };
  const live = (i: number) => {
    const it = L.finds[i].item;
    if (it.kind === 'ext' && it.topic && s.dig!.topics.includes(it.id)) return false;
    if (it.kind === 'tablet' && s.tablets.includes(it.id)) return false;
    return cost(i) < Infinity;
  };
  if (c.digGoal == null || !L.finds[c.digGoal] || !live(c.digGoal)) {
    c.digGoal = undefined;
    const idx = L.finds.map((_, i) => i).filter(live);
    const rank = (i: number) => {
      const it = L.finds[i].item;
      return it.kind === 'ext' && it.topic ? 3 : it.kind === 'tablet' ? 2 : it.kind === 'ext' ? 1 : 0;
    };
    const top = Math.max(0, ...idx.map(rank));
    const pickOne = idx.filter((i) => rank(i) === top && top > 0).sort((a, b) => cost(a) - cost(b))[0];
    if (pickOne == null) return digNext(s);
    c.digGoal = pickOne;
  }
  const f = L.finds[c.digGoal];
  const k = findCells(L, f).filter((x) => canHit(s, x) && st.depth[x] <= f.layer).sort((a, b) => st.depth[a] - st.depth[b])[0];
  return k == null ? digNext(s) : [k % L.w, Math.floor(k / L.w)];
}

/** 覗き見が出ているマス（お題 → 石板 → エクステ → 素材。手前のものほど先）→ 取りかけ・浅いマス（digNext） */
function sweepTarget(s: P1State, rule = 0): [number, number] | null {
  const L = digSite(s);
  if (!L || !s.dig) return null;
  let best: [number, number] | null = null;
  let score = 0;
  for (let k = 0; k < L.w * L.h; k++) {
    if (!canHit(s, k)) continue;
    const x = k % L.w;
    const y = Math.floor(k / L.w);
    const v = peekView(s, x, y);
    if (!v || v.hint) continue;
    const it = v.item;
    const rank = it.kind === 'ext' && it.topic ? 4 : it.kind === 'tablet' ? 3 : it.kind === 'ext' ? 2 : 1;
    const sc = rank * 100 - v.ahead * 10 + v.frac;
    if (sc > score) {
      score = sc;
      best = [x, y];
    }
  }
  return best ?? digNext(s, false, false, rule);
}

/**
 * v12：ダンジョンでは、上のランクの遺物の覗き見（いまの層。Epic 以上の 2 × 2 は取りかけの範囲）→ いちばん深いマス（縦に掘り進める。同じなら打ちかけ・真ん中寄り）
 */
function deepTarget(s: P1State): [number, number] | null {
  const L = digSite(s);
  if (!L || !s.dig) return null;
  const st = curSt(s);
  let best: [number, number] | null = null;
  let score = -Infinity;
  for (let k = 0; k < L.w * L.h; k++) {
    if (!canHit(s, k)) continue;
    const x = k % L.w;
    const y = Math.floor(k / L.w);
    const v = peekView(s, x, y);
    const up = v && !v.hint && v.ahead === 0 && v.item.kind === 'ext' && extRank(v.item.id) !== 'C' && extRank(v.item.id) !== L.tier ? 1e6 : 0;
    const sc = up + st.depth[k] * 1000 + (st.hp[k] < L.cells[k].hard[st.depth[k]] ? 500 : 0) - (Math.abs(x - 3) + Math.abs(y - 4));
    if (sc > score) {
      score = sc;
      best = [x, y];
    }
  }
  return best;
}
// 調整 v44（段 DIG3）：100% は覗き見の無いときに埋まっている爆弾のマスを先に掘る（掘りきりまで待つ方針なので、爆発で壁をまとめて崩す。前は火薬代で発破を打っていた）
const digTarget = (s: P1State, c: Ctx) => (s.digRun?.site === DUNGEON ? deepTarget(s) : SIM_DIG[c.policy].target === 'know' ? knowTarget(s, c) : sweepTarget(s, c.policy === 'full' ? 4 : 0));

/**
 * 手で n 回まで打つ（段 DIG3：爆弾を掘り出せば勝手に爆発する。爆発の数を rec.blast に）。打った数を返す。
 * 調整 v44：100% は資金に余裕があれば（5 万 G より多い。前の発破と同じ目安）掘削ドリル（燃料代。そのマスを奥へ一気に）で打つ。
 * 前は火薬代で発破を打っていた（お金で時間を買う手）。発破は無くなったので、残っているお金の手（ドリル）に置き換える
 */
function handDig(s: P1State, c: Ctx, n: number, rec: DigRec, spendTools: (v: number) => void): number {
  let k = 0;
  while (k < n && s.digRun) {
    const at = digTarget(s, c);
    if (!at) break;
    if (c.policy === 'full' && hasDrill(s) && s.money > 50000) {
      const m0 = s.money;
      const d = drill(s, at[0], at[1]);
      if (typeof d !== 'string') {
        rec.drill = (rec.drill ?? 0) + 1;
        rec.blast += d.flatMap((h) => [h, ...(h.extra ?? [])]).filter((h) => h.bomb).length;
        spendTools(m0 - s.money);
        k++;
        continue;
      }
    }
    const r = dig(s, at[0], at[1]);
    if (typeof r === 'string') break;
    rec.blast += [r, ...(r.extra ?? [])].filter((h) => h.bomb).length;
    k++;
  }
  return k;
}

/**
 * 次に掘る荒れ地（許可があって掘りきっていない所）：最短は、まだのお題のある荒れ地（無ければ石板・エクステの残り）。
 * 通常・100% は、いま掘っている所を掘りきるまで → まだ眠っているお題のある所 → 番号の順
 */
function pickSite(s: P1State, p: PolicyId, c?: Ctx): number | null {
  const d = s.dig!;
  // v10：いまの許可で掘れるマスが残っている所だけ（深い層の許可が要る所は、許可を取るまで掘らない）
  const open = d.sites.map((x, k) => ({ x, k })).filter(({ x, k }) => x.permit && !x.done && siteDiggable(s, k)).map(({ k }) => k);
  // v12：掘れる荒れ地が無ければ、ダンジョンに潜る（ひと月に SIM_DIG.dungeon 回まで。最短は潜らない）
  if (!open.length) return c && d.dungeon && (c.divesMonth ?? 0) < SIM_DIG[p].dungeon ? DUNGEON : null;
  const hidden = open.filter((k) => siteTopic(s, k) === 'hidden');
  if (p === 'rta') return hidden[0] ?? open.find((k) => k === d.cur) ?? open[0];
  // v13：発表がまだなら、お題の眠っている荒れ地を先に（いまの荒れ地を掘りきるのは、そのあと）
  if (!clearGoal(s).present && hidden.length) return hidden.includes(d.cur) ? d.cur : hidden[0];
  if (open.includes(d.cur)) return d.cur;
  return hidden[0] ?? open[0];
}
/** 次の荒れ地の発掘許可を申請する（資金が申請料の rate 倍あれば。最短は、まだのお題のある荒れ地だけ） */
function askPermits(s: P1State, p: PolicyId, rate: number): number {
  const d = s.dig!;
  let n = 0;
  for (let guard = 0; guard < 4; guard++) {
    const open = d.sites.filter((x, k) => x.permit && !x.done && siteDiggable(s, k)).length;
    const cand = d.sites.map((x, k) => ({ x, k })).filter(({ x }) => !x.permit);
    // v13：発表がまだで、許可のある荒れ地にもうお題が無ければ、お題のある荒れ地を（通常も）申請する
    const topicNeed = !clearGoal(s).present && !d.sites.some((x, k) => x.permit && !x.done && siteTopic(s, k) === 'hidden') ? cand.find(({ k }) => siteTopic(s, k) === 'hidden') : undefined;
    const pick = p === 'rta' ? cand.find(({ k }) => siteTopic(s, k) === 'hidden') : open === 0 || p === 'full' ? cand.find(({ k }) => siteTopic(s, k) === 'hidden') ?? cand[0] : topicNeed;
    if (!pick) break;
    const fee = permitFee(s);
    if (fee > 0 && s.money < fee * rate + 5000) break;
    if (typeof applyPermit(s, pick.k) === 'string') break;
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- ルート

/** v16：100% が回る Rare の町の数（計測の時間との兼ね合い。docs/ISLAND_BALANCE.md の v16） */
export const FULL_RARE = 4;
const byFee = (tier: Tier) => SECTORS.filter((x) => x.tier === tier && !x.cloud && !x.soon && x.id !== 'c1').sort((a, b) => a.fee - b.fee || a.id.localeCompare(b.id)).map((x) => x.id);
export function routeOf(p: PolicyId): string[] {
  // v13：Uncommon の調査依頼状は Common の 2 つの町の発表で届くので、最短も Common をもう 1 つ（出店許可のいちばん安い町）
  if (p === 'rta') return ['c1', byFee('C')[0], byFee('U')[0]];
  // v16（Rare の町 ①）：通常は Uncommon の 2 町で発表 → Rare の依頼状 → Rare の 1 町。100% は Rare の FULL_RARE 町まで
  // v23（段 H1：Epic の町 ①）：通常は Rare の 2 町で発表 → Epic の依頼状 → Epic の 1 町（3 回目の災害）。100% は Rare の FULL_RARE 町 → Epic の 3 町
  if (p === 'normal') return ['c1', ...byFee('C').slice(0, 2), ...byFee('U').slice(0, 2), ...byFee('R').slice(0, 2), ...byFee('E').slice(0, 1)];
  return ['c1', ...byFee('C'), ...byFee('U'), ...byFee('R').slice(0, FULL_RARE), ...byFee('E')];
}

// ---------------------------------------------------------------- 1 回の自動プレイ

export interface RunOpts {
  ban?: string[];
  /** 最初のセクタで 制覇したら止める */
  onlyFirst?: boolean;
  /** 月の締めごとに呼ぶ（調べもの用） */
  onMonth?: (s: P1State, sector: string, month: number) => void;
  /** 毎日の step のあとに呼ぶ（調べもの用） */
  onDay?: (s: P1State, sector: string) => void;
}

/**
 * 計測を分けて回すためのつなぎ口（scripts/island/simshard.ts・.github/workflows/sim.yml）。
 * 置かれていると、最初のセクタだけの回（onlyFirst）以外の runOnce を、ここに渡す（real で本当に回す）。ふだんは null
 */
export const SIM_SHARD: { hook: ((p: PolicyId, seed: number, o: RunOpts, real: () => RunResult) => RunResult) | null } = { hook: null };

export function runOnce(p: PolicyId, seed: number, o: RunOpts = {}): RunResult {
  if (SIM_SHARD.hook && !o.onlyFirst) {
    const h = SIM_SHARD.hook;
    SIM_SHARD.hook = null;
    try {
      return h(p, seed, o, () => runOnce(p, seed, o));
    } finally {
      SIM_SHARD.hook = h;
    }
  }
  const s = newP1(seed);
  Object.assign(csLog, { pr: 0, prBrand: 0, put: 0, notice: 0, ads: 0 });
  AD_TIER.auto.upper = SIM_AD[p];
  const c: Ctx = { policy: p, route: routeOf(p), at: 0, lineup: [], lineupDirty: true, shopsThisMonth: 0, monthEnd: null, lastBn: null, ban: new Set(o.ban ?? []), onlyFirst: !!o.onlyFirst, dayInMonth: 0, handCarry: 0, rpMoves: 0, runLeft: 0, runsMonth: 0, divesMonth: 0, preInv: 0, preG: 0 };
  const res: RunResult = { policy: p, seed, sectors: [], actions: {}, days: 0, done: false, skillsAt: [], spend: { money: 0, tools: 0, fees: 0, end: 0 }, research: { C: 0, U: 0, allC: null }, recipes: 0, rpLeft: { end: 0, afterAll: 0, allAt: null }, v12: { revived: 0, dungeons: 0, dives: 0, best: 0, found: { U: 0, R: 0, E: 0, L: 0 }, got: { U: 0, R: 0, E: 0, L: 0 }, museum: false, income: 0, marks: 0 }, v14: { donations: 0, donateG: 0, donateRp: 0, inf: {}, infRp: 0, rpDug: 0 }, v14b: { levy: 0, grant: 0, preDonate: 0, lost: 0, delegated: 0, doneMonths: [], undone: 0, funds: 0, grow: 0, growHeroes: 0, redigRp: 0, resWaitU: 0 }, v16: { levy: 0, grant: 0, preDonate: 0, lost: 0, hitC: 0, hitU: 0, delegated: 0, delegatedU: 0, resWaitR: 0, comebackR: 0 }, v17: { promos: 0, passives: 0, items: 0, lvEnd: [], rarEnd: [], byTier: {} }, v18: { duties: 0, dutiesEnd: 0, heads: 0, headsEnd: 0, props: 0, approved: 0, sectorOk: 0, acts: 0, firstLead: null, firstHead: null }, v19: { chEnd: {}, ch: 0, hired: {}, morale: [], want: 0, stay: 0, quit: 0, pay: 0, pay0: 0 }, v20: { paid: 0, saved: 0, quarters: 0, preInv: 0, preG: 0, fatigue: [], morale: [], slow: [] }, v21: { rev: 0, wages: 0, months: 0, morale: [], high: [] }, v22: { got: 0, answered: 0, auto: 0, expired: 0, good: 0, sat: [], warns: 0, flames: 0, flameMonths: 0, pr: 0, prBrand: 0, put: 0, notice: 0, ads: 0, brandEnd: {}, gradeEnd: {} }, v23: { levy: 0, grant: 0, preDonate: 0, lost: 0, hitC: 0, hitU: 0, hitR: 0, kept: 0, delegated: 0, delegatedR: 0, resWaitE: 0, comebackE: 0 }, v24: { ma: 0, maG: 0, acqRev: 0, patents: 0, stopped: 0, royalty: 0, suits: 0, won: 0, lost: 0, settled: 0, contracts: 0, saved: 0, penalty: 0, preDonateG: 0 }, v25: { made: {}, pop: {}, boxed: {}, auto: {}, months: {}, src: {} }, v26: { ev: newEventStat(), dip: newDipStat(), rel: {} }, v28: { found: [], made: 0, opt: {} } };
  /** v19：雇ったことのあるヒーロー（はじめの 3 人も入れる。新しく来た人を数える） */
  const heroSeen = new Set(s.staff.map((x) => x.hero));
  /** v14：任せた町の担当（能力値の伸びを数える） */
  const growHeroes = new Set<number>();
  const R = SIM_RESET[p];
  /** v12：復興した荒れ地（セクタを離れるときに足す） */
  let revivedDone = 0;
  const newRun = (id: string): SectorRun => ({ id, tier: sectorDef(id).tier, arrived: s.day, open: null, topDay: null, left: null, months: null, first: null, rev: 0, money: 0, skills: 0, actTop: 0, pauseTop: 0, act: 0, pause: 0, allRev: 0, relicRev: 0, relicRRev: 0, comeback: 0, dig: newDigRec(), log: [] });
  const D = SIM_DIG[p];
  const cResearch = SKILLS.filter((k) => skillTier(k) === 'C' && isResearch(k) && !skillSoon(k)).map((k) => k.id);
  /** v13：いま取れる C・U の研究パネル（全部開けたあとに入る RP は、使い道の無い余り） */
  const cuResearch = fullSkills().filter((k) => isResearch(k)).map((k) => k.id);
  let progress = { got: -1, claimed: -1, day: 0 };
  let cur = newRun('c1');
  res.sectors.push(cur);
  let skillsSeen = 0;
  const invSeen: { n: number; sector: string | undefined; by: Record<string, number> } = { n: 0, sector: s.sector, by: {} };
  const allSkills = fullSkills().length;
  // v16：100% の依頼は、回るセクタの依頼とどこでも受けられる依頼（Rare の回らない町の依頼は数えない）
  const missionsOnRoute = MISSIONS.filter((m) => !m.sector || c.route.includes(m.sector));
  const fullMissions = missionsOnRoute.length;

  for (let guard = 0; guard < 30 * 600; guard++) {
    // ---- 判断と行動（v8：この日が月末ポーズか。RP の支出は、入った RP を数えるのに使う）
    const atPause = c.monthEnd != null;
    const rpStart = s.rp ?? 0;
    let rpSpent = 0;
    const acts = policy(s, c);
    c.monthEnd = null;
    for (const a of acts) {
      const m0 = s.money;
      const rp0 = s.rp ?? 0;
      const r = a.run();
      rpSpent += Math.max(0, rp0 - (s.rp ?? 0));
      if (!ok(r)) continue;
      if (a.tag === 'money') res.spend.money += m0 - s.money;
      if (a.tag === 'tool') res.spend.tools += m0 - s.money;
      res.actions[a.kind] = (res.actions[a.kind] ?? 0) + 1;
      cur.act++;
      if (cur.topDay == null) cur.actTop++;
    }
    if (s.skills.length > skillsSeen) {
      for (const id of s.skills.slice(skillsSeen)) {
        res.skillsAt.push({ id, day: s.day, sector: s.sector ?? 'c1' });
        if (SKILL[id] && isResearch(SKILL[id])) cur.dig.research++;
      }
      if (res.research.allC == null && cResearch.every((id) => has(s, id))) res.research.allC = c.at + 1;
      skillsSeen = s.skills.length;
      c.lineupDirty = true;
    }
    // v17（段 E1）：強化アイテムが手に入ったら、能力値の高い順に昇格させる（通常・100%。最短は昇格しない）
    if (p !== 'rta' && s.heroItems && Object.values(s.heroItems).some((v) => (v ?? 0) > 0)) {
      const sum = (x: P1State['staff'][number]) => x.stats.phy + x.stats.int + x.stats.agi;
      for (const st of [...s.staff].sort((a, b) => sum(b) - sum(a))) {
        if (typeof promote(s, st.hero) !== 'object') continue;
        res.v17.promos++;
        res.actions.promote = (res.actions.promote ?? 0) + 1;
        cur.act++;
      }
    }
    // 設備投資（効き目の比較で外せるように「@id」で記録。作業台・棚が増えたら作るものを決め直す）
    for (const a of acts) if (a.kind === 'invest') c.lineupDirty = true;
    const invNow = s.buildings.filter((b) => b.owner === 'me').reduce((a, b) => a + Object.values(b.inv ?? {}).reduce<number>((x, v) => x + (v ?? 0), 0), 0);
    if (invNow > invSeen.n || invSeen.sector !== s.sector) {
      if (invSeen.sector === s.sector)
        for (const b of s.buildings.filter((x) => x.owner === 'me'))
          for (const [id, lv] of Object.entries(b.inv ?? {})) {
            const k = `${b.uid}:${id}`;
            if ((lv ?? 0) > (invSeen.by[k] ?? 0)) res.skillsAt.push({ id: `@${id}`, day: s.day, sector: s.sector ?? 'c1' });
            invSeen.by[k] = lv ?? 0;
          }
      else invSeen.by = {};
      invSeen.n = invNow;
      invSeen.sector = s.sector;
    }

    // ---- v14：被災した町の復興を任せる（月末。ランクアップの災害のあと・いまのセクタ以外）。お店の売上の大きい町から R.towns まで。
    // 支援金が尽きた・まだ送っていない町に、資金が「送る額 ＋ 手元に残す額」あれば送る（多ければ大きい額）。担当はいまのマネージャー（いなければ手の空いた人で能力値の高い人）
    if (atPause && R.towns > 0 && s.resets?.length && s.land) {
      const ids = s.land.mine
        .filter((id) => id !== s.land!.cur && (reviveView(s, id)?.ruins ?? 0) > 0)
        .sort((a, b) => (s.land!.recs[b].base?.rev ?? 0) - (s.land!.recs[a].base?.rev ?? 0));
      const chosen = ids.filter((id) => s.land!.recs[id].revive!.spent > 0 || s.land!.recs[id].revive!.fund > 0);
      for (const id of ids) {
        if (!chosen.includes(id) && chosen.length >= R.towns) continue;
        const rv = reviveView(s, id)!;
        const rest = ((s.land.recs[id].snap?.buildings as RuinLike[] | undefined) ?? []).filter((b) => b.owner === RUIN);
        if (rv.hero != null && rv.fund > 0 && !rv.out) continue;
        // v16：Uncommon の町は支援金の段が大きい（fundsOf）。SIM_RESET.fund は Common の町の段で、同じ番目の段を送る
        const F = fundsOf(sectorDef(id).tier);
        const at = (v: number) => F[Math.max(0, RESET.delegate.funds.indexOf(v as never))];
        const fund = s.money > at(R.fund[1]) * 3 + R.keep ? at(R.fund[1]) : at(R.fund[0]);
        if (s.money < fund + R.keep || !rest.length) continue;
        const mgr = s.land.recs[id].manager;
        const st0 = mgr != null ? s.staff.find((x) => x.hero === mgr) : null;
        const hero = rv.hero ?? (st0 && st0.task === 'manager' && st0.target === id ? st0.hero : null) ?? crew(s).filter((x) => x.task == null).sort((a, b) => managerApt(b.stats) - managerApt(a.stats))[0]?.hero;
        if (hero == null) continue;
        if (delegate(s, id, hero, fund) != null) continue;
        if (!chosen.includes(id)) {
          chosen.push(id);
          if ((s.resets?.length ?? 0) >= 3) {
            res.v23.delegated++;
            if (sectorDef(id).tier === 'R') res.v23.delegatedR++;
          } else if ((s.resets?.length ?? 0) >= 2) {
            res.v16.delegated++;
            if (sectorDef(id).tier === 'U') res.v16.delegatedU++;
          } else res.v14b.delegated++;
        }
        res.v14b.funds += fund;
        res.actions.delegate = (res.actions.delegate ?? 0) + 1;
        cur.act += 2;
        if (cur.topDay == null) cur.actTop += 2;
      }
      // 任せない町（廃墟だけで売上の無い町）のマネージャーは、いまの町の仕事に呼び戻す（任せる町がそろってから）
      if (chosen.length >= Math.min(R.towns, ids.length))
        for (const id of ids) {
          if (chosen.includes(id)) continue;
          const mg = s.land.recs[id].manager;
          const st = mg != null ? s.staff.find((x) => x.hero === mg) : null;
          if (!st || st.task !== 'manager' || st.target !== id) continue;
          st.task = null;
          st.target = null;
          s.land.recs[id].manager = null;
          res.actions.recall = (res.actions.recall ?? 0) + 1;
          cur.act++;
        }
    }

    // ---- 発掘（v9。SIM_DIG：15 秒の発掘作業・許可・道具・発掘隊・発表）
    // 発掘との出会い：最初の月の締めのあと、操作がないまま 5 日（月の途中はふつう手が空く）。1 か所目の許可は手紙で済む
    if (!s.flags.digMeet && s.reports.length >= 1 && c.dayInMonth >= MEET_IDLE_DAYS && s.dig && !atPause) {
      s.flags.digMeet = 'done';
      grantFirst(s);
      cur.dig.permits++;
      cur.dig.talks++;
      if (cur.topDay == null) cur.dig.talksTop++;
    }
    if (s.flags.digMeet && s.dig) {
      const all = topicProgress(s)[1];
      const spendTools = (v: number) => (res.spend.tools += v);
      // v10：発掘の枝（以前の道具はパネルに移った）。最短：お題が許可の無い層に残っていれば、深い層の許可の次の Lv（根もとから）。
      // 通常：月末に、その月の売上の 20% までを、発掘のパネルの安い順に（お題が許可の無い層にあれば深い層の許可を先に）。100%：方針のスキルの一覧でまとめて
      // v14：お店が 1 軒もない立ち上げのあいだ（ランクアップの災害のあとは支度金だけ）は、発掘にお金を使わない（お店を先に）
      // v16：2 回目のランクアップ（Rare）のあとは人が多く給与が重いので、まだ売上の立たない（月の締めの売上が 0 の）あいだも、
      // 資金が少なければ発掘にお金を使わない（お店と素材を先に。発掘許可に払って素材が買えず、売上 0 のまま 120 か月止まるシードが出た）
      const startup = !s.buildings.some((b) => b.owner === 'me' && P1B[b.id]?.kind === 'shop') || ((s.resets?.length ?? 0) >= 2 && s.reports.every((r) => r.revenue <= 0) && s.money < 100000);
      const take = (id: string, keep: number) => {
        if (startup) return 0;
        const st = digStep(s, id);
        if (!st || s.money < st.cost + keep) return 0;
        const m0 = s.money;
        if (st.run() != null) return 0;
        spendTools(m0 - s.money);
        res.actions.skill = (res.actions.skill ?? 0) + 1;
        cur.act++;
        if (cur.topDay == null) cur.actTop++;
        return m0 - s.money;
      };
      const deepNext = () => DEEP_CHAIN.find((id) => lvOf(s, id) === 0) ?? 'dig_deep';
      // 掘れずに止まっている（許可のある荒れ地に、いまの許可で掘れるマスが無い）・お題が許可の無い層にある
      const blocked = s.dig.sites.some((x, k) => x.permit && !x.done && !siteDiggable(s, k));
      if (D.tree === 'deep' && topicLocked(s)) take(deepNext(), 3000);
      // 通常・100%：掘れずに止まっている・お題が許可の無い層にあれば、深い層の許可を先に（売上の 20% の枠や、制覇のあと資金をためている月に関係なく。
      // 止まったままだと RP が入らず、研究パネルが開けなくなる）
      if (D.tree !== 'deep' && (blocked || topicLocked(s)) && lvOf(s, 'dig_deep') < 5) take(deepNext(), 10000);
      // 調整 v44（段 DIG3）：100% は v41 までと同じく発掘隊を最初から使う（前は発掘の担当のヒーローを 1 人置いていた：D.digger）。
      // 隊員はシャドーヒーローになったので、発掘隊の手際までの研究パネル（RP）を RP がたまりしだい先に開く
      if (D.digger > 0 && lvOf(s, 'dig_crew') === 0) take(CREW_CHAIN.find((id) => lvOf(s, id) === 0) ?? 'dig_crew', 0);
      if (D.tree === 'share' && atPause) {
        // 枠は月の売上の 20% を積み立てる（使わなかったぶんは翌月へ。1 枚がその月の枠より高くても、たまれば買える）
        c.digBudget = (c.digBudget ?? 0) + (s.reports.at(-1)?.revenue ?? 0) * D.share;
        let cap = c.digBudget;
        for (let guard = 0; guard < 20; guard++) {
          // 研究 Lv の上限（研究の目利き Lv2 まで）を先に：上限で止まっていたエクステの Lv と RP がまとめて入る（RP が尽きて研究パネルが開けなくなるのを防ぐ）
          const study = lvOf(s, 'dig_study') < 2 ? (['dig_ext', 'dig_lamp', 'dig_deep', 'dig_study'].find((id) => lvOf(s, id) === 0) ?? 'dig_study') : null;
          const need = topicLocked(s) ? deepNext() : study;
          // 調整 v25c：発掘のパネルは研究パネル（RP）になって資金の枠（売上の 20%）に掛からなくなったので、急ぎでないもの（need 以外）は
          // 手元の RP の 20%（D.share）までの値段のものだけ（v25 で売上の 20% の枠の中で買っていたのと同じく、ほかの研究の RP を食わない）
          const cand = need ? [need] : [...DIG_PANELS].filter((id) => digStep(s, id) && rpCost(SKILL[id]) <= (s.rp ?? 0) * D.share).sort((a, b) => digStep(s, a)!.cost - digStep(s, b)!.cost || rpCost(SKILL[a]) - rpCost(SKILL[b]));
          const id = cand[0];
          const st = id ? digStep(s, id) : null;
          if (!st || st.cost > cap) break;
          // 余裕があるとき：その月の売上の 20% の枠の中で、買ったあとも 1 万 G 残る
          const v = take(id, 10000);
          if (!v) break;
          cap -= v;
        }
        c.digBudget = cap;
      }
      // v12：遺物の展示館（復興した土地ができたら。会社で 1 つ）を建てて、月末に価値の高い遺物から飾る。100% は展示室の増築も
      if (D.museum != null && atPause) {
        if (!s.museum?.at && canBuild(s, 'museum') == null && s.money >= (P1B.museum?.cost ?? 0) + D.museum) {
          let at: [number, number, (typeof DIRS)[number]] | null = null;
          for (let j = 0; j < s.n && !at; j++) for (let i = 0; i < s.n && !at; i++) {
            const dd = allowedDirs(s, 'museum', i, j);
            if (dd.length) at = [i, j, dd[0]];
          }
          if (at && typeof build(s, 'museum', ...at) !== 'string') {
            res.actions.build = (res.actions.build ?? 0) + 1;
            cur.act++;
          }
        }
        if (s.museum?.at) {
          if (autoExhibit(s)) cur.act++;
          const mb = s.buildings.find((b) => b.id === 'museum' && b.uid === s.museum?.at?.uid);
          const cost = mb ? investCost(mb, 'hall') : null;
          if (p === 'full' && mb && mb.left <= 0 && cost != null && s.money > cost * 2 + 50000 && (s.museum.items.filter((x) => x != null).length >= museumSlots(s)) && invest(s, mb.uid, 'hall') == null) {
            res.actions.invest = (res.actions.invest ?? 0) + 1;
            cur.act++;
            autoExhibit(s);
          }
        }
      }
      // 発掘許可：資金に余裕があれば、次の荒れ地を申請する（月末か、掘れる荒れ地が無くなったとき）
      // v13：お題のある荒れ地の許可がまだで、許可のある荒れ地にはもうお題が無い（発表に要る）ときも、作業のあいだに申請する
      const topicPermit = !clearGoal(s).present && !s.dig.sites.some((x, k) => x.permit && !x.done && siteTopic(s, k) === 'hidden') && s.dig.sites.some((x, k) => !x.permit && siteTopic(s, k) === 'hidden');
      if (!s.digRun && !startup && (atPause || pickSite(s, p) == null || topicPermit)) {
        const n = askPermits(s, p, D.permit);
        if (n) {
          cur.dig.permits += n;
          res.actions.permit = (res.actions.permit ?? 0) + n;
          cur.act += n;
          if (cur.topDay == null) cur.actTop += n;
        }
      }
      // 発掘隊（作業のあいだだけ手伝う）
      // v13：作業台に人のいない台があるあいだは発掘隊を置かない（人が足りない＝雇えないとき、職人を先に。
      // 置き場所が発掘の素材であふれ、職人がいなくて使えず、布・紙が買えなくなって止まるシードが出た）
      const benchShort = s.slots.some((sl) => sl.worker == null);
      const want = benchShort ? 0 : D.digger;
      const diggers = s.staff.filter((x) => x.task === 'dig').length;
      if (benchShort && diggers > 0) {
        const dg = s.staff.find((x) => x.task === 'dig');
        if (dg && assign(s, dg.hero, null) == null) cur.act++;
      }
      if (diggers < want && s.money > 20000) {
        const idle = crew(s).filter((x) => x.task == null).sort((a, b) => aptitude(b.stats, 'dig') - aptitude(a.stats, 'dig'))[0];
        let hero = idle?.hero ?? null;
        if (hero == null) {
          const pick = [...s.hirePool].sort((a, b) => aptitude(heroStatsOf(b), 'dig') - aptitude(heroStatsOf(a), 'dig'))[0];
          if (pick != null && has(s, 'hire') && hire(s, pick) == null) {
            hero = pick;
            res.actions.hire = (res.actions.hire ?? 0) + 1;
            cur.act++;
          }
        }
        if (hero != null && assign(s, hero, 'dig') == null) {
          res.actions.assign = (res.actions.assign ?? 0) + 1;
          cur.act++;
        }
      }
      // 発掘作業を始める：前の作業が終わっていて、今月の回数のめやすに届いていない（null は続けて）。通常は月の前半と後半に 1 回ずつ
      // v13：制覇に研究成果の発表が要るので、お題がまだのセクタでは作業の回数を増やす（通常：月 2 → 3 回。1 位を 2 か月続けて発表を待っているあいだは続けて掘る）
      const goal = clearGoal(s);
      const per = D.perMonth == null ? null : !goal.present && goal.top ? null : !goal.present ? D.perMonth + D.pending : D.perMonth;
      const due = per == null || (c.runsMonth < per && c.dayInMonth >= c.runsMonth * (30 / per) + 2);
      if (!s.digRun && due) {
        const k = pickSite(s, p, c);
        if (k != null && typeof startRun(s, k) !== 'string') {
          c.runLeft = runDays(p, s);
          c.runsMonth++;
          if (k === DUNGEON) {
            c.divesMonth = (c.divesMonth ?? 0) + 1;
            res.v12.dives++;
          }
          cur.dig.runs++;
          if (cur.topDay == null) cur.dig.runsTop++;
          c.digGoal = undefined;
          res.actions.dig = (res.actions.dig ?? 0) + 1;
          cur.act++;
          if (cur.topDay == null) cur.actTop++;
        }
      }
      // 作業のあいだ：1 日ぶんの手（15 秒で 60 打を、作業の日数に均して）
      if (s.digRun) {
        c.handCarry += runTaps(s) / runDays(p, s);
        const m = Math.floor(c.handCarry);
        c.handCarry -= m;
        cur.dig.mid += handDig(s, c, m, cur.dig, spendTools);
      }
      if (cur.dig.topicsAt == null && topicProgress(s)[0] >= all && all > 0) cur.dig.topicsAt = cur.log.length;
      // お題がそろったら、町の長に発表する（会話）
      if (presentLock(s) === null && typeof present(s) !== 'string') {
        res.actions.present = (res.actions.present ?? 0) + 1;
        cur.act++;
        cur.dig.talks++;
        if (cur.topDay == null) {
          cur.actTop++;
          cur.dig.talksTop++;
        }
      }
    }

    // ---- 1 日（v9：作業のあいだは発掘隊も打つ。作業の日数が尽きた・荒れ地を掘りきったら作業を終える）
    const d = step(s);
    // v32（段 I2）：経営会議は全部「推奨」で決める（画面の一括承認と同じ）
    if (boardDue(s)) boardAuto(s);
    o.onDay?.(s, cur.id);
    cur.dig.auto += d.dug?.length ?? 0;
    // v18：任せ方の記録
    {
      const nd = delegatedDuties(s).length;
      const nh = headDepts(s).length;
      res.v18.duties = Math.max(res.v18.duties, nd);
      res.v18.heads = Math.max(res.v18.heads, nh);
      if (nd && res.v18.firstLead == null) res.v18.firstLead = s.day;
      if (nh && res.v18.firstHead == null) res.v18.firstHead = s.day;
      if (d.report?.deleg) {
        res.v18.props += d.report.deleg.props;
        res.v18.acts += d.report.deleg.duties.reduce((a, x) => a + x.acts, 0);
      }
      for (const x of d.company?.managed ?? []) if (s.land?.recs[x.id]?.heads) res.v18.sectorOk += s.land.recs[x.id].heads!.n;
    }
    // v20：税と疲れの記録
    if (d.company?.tax) res.v20.quarters++;
    if (gaOn(s)) {
      const crew0 = s.staff.filter((x) => x.task && x.task !== 'manager' && x.task !== 'lead');
      if (crew0.length) {
        res.v20.fatigue.push(fatigueAvg(s));
        res.v20.morale.push(crew0.reduce((a, x) => a + moraleOf(x), 0) / crew0.length);
        res.v20.slow.push(crew0.reduce((a, x) => a + (1 - fatigueMul(s, x)), 0) / crew0.length);
      }
    }
    // v19：士気と給与・カリスマ度の記録
    if (d.hr) {
      res.v19.want += d.hr.want.length;
      res.v19.stay += d.hr.stay.length;
      res.v19.quit += d.hr.quit.length;
    }
    for (const x of s.staff)
      if (!heroSeen.has(x.hero)) {
        heroSeen.add(x.hero);
        const r = x.baseRarity ?? 'C';
        res.v19.hired[r] = (res.v19.hired[r] ?? 0) + 1;
      }
    // v22（段 G）：カスタマーサポートとマーケの記録
    if (d.report) {
      const cr = d.report.cs;
      if (cr) {
        res.v22.got += cr.got;
        res.v22.answered += cr.answered;
        res.v22.auto += cr.auto;
        res.v22.expired += cr.expired;
        res.v22.good += cr.good;
        res.v22.sat.push(cr.sat);
        if (cr.warn) res.v22.warns++;
        if (cr.ignited) res.v22.flames++;
        if (cr.heat) res.v22.flameMonths++;
      }
      const tr = s.tier ?? 'C';
      res.v22.brandEnd[tr] = s.brand ?? 0;
      res.v22.gradeEnd[tr] = gradeOf(s);
    }
    // v21（調整 1）：Uncommon 以上の町の売上と給与（士気の高い帯の効き目が、給与の増えより大きいか）
    if (d.report && (s.tier ?? 'C') !== 'C') {
      res.v21.rev += d.report.revenue;
      res.v21.wages += d.report.costs.wages;
      res.v21.months++;
      if (s.staff.length) {
        res.v21.morale.push(s.staff.reduce((a, x) => a + moraleOf(x), 0) / s.staff.length);
        res.v21.high.push(s.staff.filter((x) => moraleOf(x) >= MORALE.band.hi).length / s.staff.length);
      }
    }
    if (d.report?.hr?.avg != null) {
      res.v19.morale.push(d.report.hr.avg);
      res.v19.pay += payroll(s);
      res.v19.pay0 += s.staff.reduce((a, x) => a + baseWage(x), 0) * wageMul(s);
    }
    // v14：任せた町の担当の伸び
    for (const x of d.company?.managed ?? []) {
      const g = x.revive?.grow;
      if (!g) continue;
      res.v14b.grow += Object.values(g).reduce<number>((a, v) => a + (v ?? 0), 0);
      if (x.hero != null) growHeroes.add(x.hero);
    }
    if (s.digRun) {
      c.runLeft -= 1;
      if (c.runLeft <= 0 || s.dig?.sites[s.digRun.site]?.done) {
        endRun(s);
        c.handCarry = 0;
      }
    }
    cur.dig.rp += (s.rp ?? 0) - rpStart + rpSpent;
    if (res.rpLeft.allAt == null && cuResearch.every((id) => has(s, id))) res.rpLeft.allAt = cur.id;
    else if (res.rpLeft.allAt != null) res.rpLeft.afterAll += Math.max(0, (s.rp ?? 0) - rpStart + rpSpent);
    c.dayInMonth++;
    if (d.developed.length || d.finished.length) c.lineupDirty = true;
    if (cur.open == null && s.open != null) cur.open = s.open;
    // 日々の詰まり（最短は毎日見る）
    if (p === 'rta' && myShops(s).length) c.lastBn = readBn(s);
    if (d.report) {
      const r = d.report;
      if (process.env.SIM_DEBUG) {
        const cc = stageCaps(s);
        console.log(`m${r.month} rank${r.rank} rev${Math.round(r.revenue / 1000)}k flow ${JSON.stringify(r.flow)} caps ${cc.buy.perMonth}/${cc.craft.perMonth}/${cc.haul.perMonth}/${cc.sell.perMonth} shops ${myShops(s).length} slots ${s.slots.map((x) => x.sku + '@' + x.worker).join(',')} staff ${s.staff.map((x) => x.task).join(',')} money ${Math.round(s.money)} skills ${s.skills.length}`);
      }
      cur.pause++;
      if (cur.topDay == null) cur.pauseTop++;
      cur.allRev += r.revenue;
      cur.relicRev += r.relic ?? 0;
      cur.relicRRev += Object.entries(r.bySeries ?? {}).reduce<number>((a, [k, v]) => a + (PRODUCT[k]?.relic?.rare ? (v ?? 0) : 0), 0);
      // v23：Epic の復刻品・骨董の売上
      cur.relicERev = (cur.relicERev ?? 0) + Object.entries(r.bySeries ?? {}).reduce<number>((a, [k, v]) => a + (PRODUCT[k]?.relic?.epic && !isAntique(PRODUCT[k], s.tier ?? 'C') ? (v ?? 0) : 0), 0);
      cur.antRev = (cur.antRev ?? 0) + Object.entries(r.bySeries ?? {}).reduce<number>((a, [k, v]) => a + (isAntique(PRODUCT[k], s.tier ?? 'C') ? (v ?? 0) : 0), 0);
      // 調整 1：他社の店の数・営業している他社の数の月ごとの推移、他社が空き店舗に入った数・町に戻った会社の数・他社が 0 社だった月
      if (s.area) {
        const prevA = cur.area;
        const nRiv = rivalStores(s).length;
        const nCo = s.rivals.filter((x) => !x.gone).length;
        cur.area = { shops: myShops(s).length, closed: s.area.closed, took: s.area.took, share: myShare(s), n0: s.rivals.length * areaTuneOf(s.tier).stores, rivals: [...(prevA?.rivals ?? []), nRiv], companies: [...(prevA?.companies ?? []), nCo], refill: (prevA?.refill ?? 0) + (r.trade?.refill.length ?? 0), back: (prevA?.back ?? 0) + (r.trade?.back?.length ?? 0), zero: (prevA?.zero ?? 0) + (nCo === 0 ? 1 : 0) };
      }
      // v8：月の締め。RP が足りなくて止まった月＝詰まりの段に効く研究パネルがあるのに、どれも RP が足りない
      c.dayInMonth = 0;
      c.runsMonth = 0;
      c.divesMonth = 0;
      res.v12.income += r.museum?.income ?? 0;
      {
        const useful = whatIf(s, readBn(s)).filter((w) => w.ok && w.move.kind === 'skill' && isResearch(SKILL[w.move.id]));
        if (useful.length && useful.every((w) => w.move.kind === 'skill' && rpCost(SKILL[w.move.id]) > (s.rp ?? 0))) cur.dig.rpBlocked++;
      }
      {
        const nextId = c.route[c.at + 1];
        if (s.cleared && cur.topDay != null && nextId && sectorDef(nextId).tier !== 'C' && !hasLetter(s, sectorDef(nextId).tier)) cur.dig.letterWait++;
      }
      if (cur.topDay == null && clearWaiting(s)) cur.dig.waitPresent++;
      if (presentLock(s) === 'research') cur.dig.resWait++;
      // v15：他社の巻き返し（Uncommon のセール）が始まった月
      if (r.comeback) cur.comeback++;
      cur.log.push({ m: r.month, rank: r.rank, rev: r.revenue, top: Math.max(...r.area.filter((x) => !x.me).map((x) => x.sales)), money: Math.round(s.money), bn: r.bottleneck, read: readBn(s) });
      o.onMonth?.(s, cur.id, r.month);
      c.monthEnd = r;
      if (p !== 'rta') c.lastBn = readBn(s);
      c.shopsThisMonth = 0;
      c.lineupDirty = true;
      if (r.rank === 1 && r.revenue > 0 && cur.first == null) cur.first = r.month;
      // 制覇（2 か月続けて 1 位）の月
      if (s.cleared && cur.topDay == null) {
        cur.topDay = s.day;
        cur.months = r.month;
        cur.rev = r.revenue;
        cur.money = Math.round(s.money);
        cur.skills = s.skills.length;
        if (c.onlyFirst) {
          res.done = true;
          break;
        }
      }
      if (cur.topDay == null && r.month >= MONTH_CAP) {
        res.stop = `${cur.id} で ${MONTH_CAP} か月たっても制覇できない`;
        break;
      }
    }

    // ---- 制覇したら（2 か月続けて 1 位）、次のセクタへ（100% は依頼を済ませてから）
    if (s.cleared && cur.topDay != null) {
      // v14：100% の再発掘の周回：被災した Common の町（任せた町も）を回って、荒れ地を掘り直す（お題がそろうか R.months か月）
      if (cur.revisit) {
        const [g0, a0] = topicProgress(s);
        if (g0 < a0 && s.day - cur.arrived < 30 * R.months) continue;
      }
      if (!c.route[c.at + 1] && R.revisit && !c.toured && s.resets?.length) {
        c.toured = true;
        const back = (s.land?.mine ?? []).filter((id) => sectorDef(id).tier === 'C' && id !== s.sector);
        c.route.push(...back);
        c.revisit = new Set(back);
      }
      const next = c.route[c.at + 1];
      const sectorMissionsLeft = MISSIONS.some((m) => m.sector === s.sector && s.missions[m.id] !== 'claimed');
      if (!next) {
        if (p !== 'full') {
          res.done = true;
          break;
        }
        // 100%：全スキル・全依頼まで続ける
        const claimed = missionsOnRoute.filter((m) => s.missions[m.id] === 'claimed').length;
        // v8：C・U の取れるパネルをすべて開放（お金パネルは Lv 最大）
        const got = fullSkills().filter((k) => lvOf(s, k.id) >= maxLv(k)).length;
        if (got >= allSkills && claimed >= fullMissions) {
          res.done = true;
          break;
        }
        // v8：12 か月、パネルも依頼も進まなければ打ち切る（RP が足りない・掘る所が無い）
        if (got !== progress.got || claimed !== progress.claimed) progress = { got, claimed, day: s.day };
        if (s.day - progress.day > 30 * 12 || s.day - (cur.topDay ?? 0) > 30 * MONTH_CAP) {
          const rest = fullSkills().filter((k) => lvOf(s, k.id) < maxLv(k));
          res.stop = `全スキル・全依頼に届かない（残り ${rest.length} 枚：研究パネル ${rest.filter(isResearch).length} 枚・RP ${rest.filter(isResearch).reduce((a, k) => a + rpCost(k), 0)} が要る・いま ${Math.round(s.rp ?? 0)} RP）`;
          break;
        }
        continue;
      }
      if (p === 'full' && !cur.revisit && sectorMissionsLeft && s.day - cur.topDay < 30 * 12) continue;
      // v8：100% は発掘場をぜんぶ掘ってから。Uncommon へは調査依頼状が要る（Common のセクタのお題をそろえて発表する）
      if (p === 'full' && !cur.revisit && digLeft(s) > 0 && s.day - cur.topDay < 30 * FULL_DIG_WAIT) continue;
      if (sectorDef(next).tier !== 'C' && !hasLetter(s, sectorDef(next).tier)) continue;
      // 関所 → 出店許可（費用 ＋ 立ち上げの資金）。v14：ランクアップの進出は費用なし・お金は徴収されるので立ち上げの資金も要らない
      const up = rankUpTier(s, next);
      const fee = moveFee(s, next);
      const start = up ? 0 : p === 'rta' ? 8000 : 12000;
      if (!s.land) {
        if (s.money < gateToll(s) + fee + start) continue;
        const g0 = s.money;
        if (!openGate(s)) continue;
        res.spend.fees += g0 - s.money;
        res.actions.gate = (res.actions.gate ?? 0) + 1;
        cur.act++;
      }
      if (s.money < fee + start) continue;
      // マネージャー：最短は最も適性の高い人。通常・100% は、アンコモンの職人を 1 人は手元に残す
      const cands = crew(s).sort((a, b) => managerApt(b.stats) - managerApt(a.stats));
      let mgr = cands[0];
      if (p !== 'rta') {
        const keep = cands.filter((x) => aptitude(x.stats, 'craft') >= UNCOMMON.minCraft);
        if (keep.length === 1) mgr = cands.find((x) => x !== keep[0]) ?? mgr;
      }
      if (s.digRun) endRun(s);
      cur.dig.left = digLeft(s);
      cur.dig.done = s.dig?.sites.filter((x) => x.done).length ?? 0;
      revivedDone += s.dig?.sites.filter((x) => x.revived).length ?? 0;
      res.v12.best = Math.max(res.v12.best, s.dig?.dungeon?.best ?? 0);
      // v14：ランクアップの進出の前に、余ったお金で研究への寄付（どうせ徴収されるので、押せるだけ。上限 R.donate 回）
      // v16：2 回目（Uncommon → Rare）は res.v16 に。v23：3 回目（Rare → Epic）は res.v23 に
      const rec2 = up === 'E' ? res.v23 : up === 'R' ? res.v16 : res.v14b;
      if (up) {
        const m0 = s.money;
        for (let k = 0; k < R.donate && donateLock(s) === null; k++) {
          if (typeof donate(s) === 'string') break;
          rec2.preDonate++;
          res.actions.donate = (res.actions.donate ?? 0) + 1;
          cur.act++;
        }
        rec2.lost = s.skills.filter((id) => SKILL[id] && !isResearch(SKILL[id])).length;
        // v24：3 回目の災害の前の寄付に払った額（3 回目の徴収額のばらつきの確かめ）
        if (up === 'E') res.v24.preDonateG = m0 - s.money;
      }
      const f0 = s.money;
      const e = moveTo(s, next, mgr?.hero ?? null);
      if (up && s.resets?.length) {
        const rr = s.resets[s.resets.length - 1];
        rec2.levy = rr.levy;
        rec2.grant = rr.grant;
        if (up === 'R') {
          res.v16.hitC = Object.keys(rr.ruins).filter((id) => sectorDef(id).tier === 'C').length;
          res.v16.hitU = Object.keys(rr.ruins).filter((id) => sectorDef(id).tier === 'U').length;
        }
        if (up === 'E') {
          res.v23.hitC = Object.keys(rr.ruins).filter((id) => sectorDef(id).tier === 'C').length;
          res.v23.hitU = Object.keys(rr.ruins).filter((id) => sectorDef(id).tier === 'U').length;
          res.v23.hitR = Object.keys(rr.ruins).filter((id) => sectorDef(id).tier === 'R').length;
          res.v23.kept = Object.values(rr.keep ?? {}).reduce((a, n) => a + n, 0);
        }
      } else res.spend.fees += Math.max(0, f0 - s.money);
      if (e) {
        res.stop = `${next} へ移れない（${e}）`;
        break;
      }
      res.actions.move = (res.actions.move ?? 0) + 1;
      cur.act++;
      cur.left = s.day;
      cur.lv = s.staff.map((x) => x.level ?? 1);
      if (!cur.revisit) res.v19.chEnd[cur.tier] = charismaOf(s);
      c.at++;
      cur = newRun(next);
      if (c.revisit?.has(next)) {
        cur.revisit = true;
        // 手で直す（資金のあるだけ。工房 → 安い順）
        const r = repairAll(s);
        if (r.n) {
          res.actions.repair = (res.actions.repair ?? 0) + 1;
          cur.act++;
        }
      }
      res.sectors.push(cur);
      c.lineup = [];
      c.lineupDirty = true;
      c.lastBn = null;
      c.shopsThisMonth = 0;
      c.digGoal = undefined;
      c.dayInMonth = 0;
    }
  }
  if (!res.done && !res.stop) res.stop = '日数の上限';
  if (cur.left == null) {
    cur.left = s.day;
    cur.lv = s.staff.map((x) => x.level ?? 1);
    cur.dig.left = digLeft(s);
  }
  res.days = s.day;
  Object.assign(res.v22, { ...csLog });
  res.v20.paid = s.acct?.paid ?? 0;
  res.v20.preInv = c.preInv;
  res.v20.preG = c.preG;
  res.v20.saved = s.acct?.saved ?? 0;
  if (!cur.revisit) res.v19.chEnd[cur.tier] = charismaOf(s);
  res.v19.ch = charismaOf(s);
  res.v18.dutiesEnd = delegatedDuties(s).length;
  res.v18.headsEnd = headDepts(s).length;
  res.v18.approved = res.actions.approve ?? 0;
  // v17：育成の記録（ランクの終わりの Lv は、そのランクの最後に離れたセクタ）
  res.v17.passives = s.staff.reduce((a, x) => a + (x.passives?.length ?? 0), 0);
  res.v17.lvEnd = s.staff.map((x) => x.level ?? 1);
  res.v17.items = res.v17.promos + Object.values(s.heroItems ?? {}).reduce<number>((a, v) => a + (v ?? 0), 0);
  res.v17.rarEnd = s.staff.map((x) => x.rarity ?? 'C');
  for (const r of res.sectors) if (r.lv && !r.revisit) res.v17.byTier[r.tier] = r.lv;
  res.spend.end = Math.round(s.money);
  res.recipes = Object.keys(s.recipes ?? {}).length;
  // v14a：最後に残った RP も、100% は無限の強化パネルへ
  if (p === 'full') infSpend(s);
  res.rpLeft.end = Math.round(s.rp ?? 0);
  res.v14.donations = donations(s);
  for (let k = 0; k < donations(s); k++) res.v14.donateG += donateCost(k);
  res.v14.donateRp = donations(s) * DIG_BALANCE.buyRp.rp;
  for (const id of INF_PANELS) {
    const lv = lvOf(s, id);
    res.v14.inf[id] = lv;
    for (let k = 1; k <= lv; k++) res.v14.infRp += infCost(k);
  }
  res.v14.rpDug = res.sectors.reduce((a, r) => a + r.dig.rp, 0) - res.v14.donateRp;
  // v14：任せた町の復興（全部直った月数・直しきれなかった町）・担当の伸び・再発掘の RP・研究待ち（Uncommon）
  for (const id of s.land?.mine ?? []) {
    const rv = s.land?.recs[id]?.revive;
    if (!rv || !(rv.spent > 0)) continue;
    if (rv.doneAt != null) res.v14b.doneMonths.push(rv.doneAt);
    else res.v14b.undone++;
  }
  res.v14b.growHeroes = growHeroes.size;
  res.v14b.redigRp = res.sectors.filter((r) => r.revisit).reduce((a, r) => a + r.dig.rp, 0);
  res.v14b.resWaitU = res.sectors.filter((r) => r.tier === 'U').reduce((a, r) => a + r.dig.resWait, 0);
  res.v16.resWaitR = res.sectors.filter((r) => r.tier === 'R').reduce((a, r) => a + r.dig.resWait, 0);
  res.v16.comebackR = res.sectors.filter((r) => r.tier === 'R').reduce((a, r) => a + r.comeback, 0);
  res.v23.resWaitE = res.sectors.filter((r) => r.tier === 'E').reduce((a, r) => a + r.dig.resWait, 0);
  res.v23.comebackE = res.sectors.filter((r) => r.tier === 'E').reduce((a, r) => a + r.comeback, 0);
  res.rpLeft.afterAll = Math.round(res.rpLeft.afterAll);
  // v24（段 H2）：法務の記録（会社のもの）
  if (s.legal) Object.assign(res.v24, { ...s.legal.tot, acqRev: Math.round(s.legal.tot.acqRev), preDonateG: res.v24.preDonateG });
  // v25（段 UI1）：カードの数え（会社のもの）
  if (s.cards) res.v25 = JSON.parse(JSON.stringify(s.cards.stat));
  // v26（段 UI4）：できごと・外交の数え（会社のもの）
  if (s.events) res.v26.ev = JSON.parse(JSON.stringify(s.events.stat));
  // v28（段 P2）：ヒーローの組み合わせ（会社のもの）
  if (s.duo) res.v28 = { found: Object.keys(s.duo.found), made: s.duo.stat.made, opt: { ...s.duo.stat.opt } };
  // v30（段 I1）：予算で任せる（会社のもの）
  if (s.budget) res.v30 = { ...JSON.parse(JSON.stringify(s.budget.stat)), crewEnd: crewTotal(s), heads: budgetHeads(s) };
  // v32（段 I2）：経営会議（会社のもの）
  if (s.board) res.v32 = JSON.parse(JSON.stringify(s.board.stat));
  // v33（段 K）：経営方針（会社のもの）
  res.v33 = { held: s.pol?.stat?.held ?? 0, changed: s.pol?.stat?.changed ?? 0, slots: slotsOf(s), corp: corpOf(s).length, dept: presDepts(s).filter((d) => deptPolicyOf(s, d)).length, open: s.pol?.got.length ?? 0, panels: polLog.panels, slotLv: polLog.slots };
  polLog.panels = 0;
  polLog.slots = 0;
  // v37（段 S1）：教え（会社のもの）
  res.v37 = { n: s.lessons?.n ?? 0, prop: Object.values(s.lessons?.got ?? {}).filter((g) => g.via === 'prop').length, by: { ...lessonCounts(s) } };
  if (s.diplo) {
    res.v26.dip = { ...s.diplo.stat };
    res.v26.rel = Object.fromEntries(s.diplo.lands.map((x) => [x.id, Math.round(x.rel)]));
  }
  // v12：復興・ダンジョン・見つけた上のランクの遺物（研究ノート：種類と、掘った数）・展示館
  res.v12.revived = revivedDone + (s.dig?.sites.filter((x) => x.revived).length ?? 0);
  res.v12.dungeons = s.dungeons?.length ?? 0;
  res.v12.best = Math.max(res.v12.best, s.dig?.dungeon?.best ?? 0);
  for (const [id, n] of Object.entries(s.research ?? {})) {
    const rk = extRank(Number(id));
    if (rk === 'C' || !(n > 0)) continue;
    // Uncommon は、Common のセクタのダンジョンで出たものだけでなく、Uncommon のセクタの荒れ地のものも入る（R・E・L はダンジョンだけ）
    res.v12.found[rk]++;
    res.v12.got[rk] += Math.floor(n);
  }
  res.v12.museum = !!s.museum?.at;
  res.v12.marks = s.museum?.marks ?? 0;
  res.research.C = SKILLS.filter((k) => skillTier(k) === 'C' && isResearch(k) && has(s, k.id)).length;
  res.research.U = SKILLS.filter((k) => skillTier(k) === 'U' && isResearch(k) && !k.inf && has(s, k.id)).length;
  if (p === 'full') {
    const crowns = SECTORS.filter((x) => c.route.includes(x.id)).filter((x) => crowned(s, x.id)).length;
    res.goal = { crowns, skills: fullSkills().filter((k) => has(s, k.id)).length, maxed: fullSkills().filter((k) => lvOf(s, k.id) >= maxLv(k)).length, levels: fullSkills().reduce((a, k) => a + lvOf(s, k.id), 0), missions: MISSIONS.filter((m) => s.missions[m.id] === 'claimed').length, missing: MISSIONS.filter((m) => s.missions[m.id] !== 'claimed').map((m) => m.id) };
  }
  return res;
}

// ---------------------------------------------------------------- 実時間

/** セクタの区切りの実時間（秒）。until：'top'＝制覇まで、'left'＝離れるまで */
export function secOf(p: PolicyId, r: SectorRun, until: 'top' | 'left'): number | null {
  const T = SIM_TIME[p];
  const end = until === 'top' ? r.topDay : r.left;
  if (end == null) return null;
  const days = end - r.arrived;
  // v9：発掘作業（15 秒）のあいだも時間は流れるので、ひと月の時間に重なる（始める操作は行動 1 回）。足すのは会話（出会い・発表）
  const dig = (until === 'top' ? r.dig.talksTop : r.dig.talks) * T.talk + (until === 'top' ? r.dig.runsTop : r.dig.runs) * T.digOpen;
  return (days / 30) * T.month + (until === 'top' ? r.actTop : r.act) * T.action + (until === 'top' ? r.pauseTop : r.pause) * T.pause + dig;
}
export const totalSec = (x: RunResult) => SIM_TIME[x.policy].tutorial + x.sectors.reduce((a, r) => a + (secOf(x.policy, r, 'left') ?? 0), 0);

// ---------------------------------------------------------------- 表

const fmtMin = (sec: number) => `${Math.round(sec / 60)} 分`;
const fmtH = (sec: number) => `${(sec / 3600).toFixed(1)} h`;
const fmtG = (v: number) => `${Math.round(v / 1000).toLocaleString('en-US')}k`;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const range = (xs: number[], f: (v: number) => string = (v) => String(v)) => (xs.length ? (Math.min(...xs) === Math.max(...xs) ? f(xs[0]) : `${f(Math.min(...xs))}〜${f(Math.max(...xs))}`) : '—');

export interface Report2 {
  runs: RunResult[];
  ablation: { skill: string; base: number; without: number; n: number }[];
  /** 技を 1 つも取らない「通常」（gap の商品を立ち上げず、基礎の商品だけで戦う）。新しい商材が要るかの確かめ */
  noTech?: RunResult[];
  /** v17：ヒーローの育成なし（経験値 0）の 3 方針 × 3 シード */
  noGrowth?: RunResult[];
  /** v18：任せない通常（3 シード） */
  noDeleg?: RunResult[];
  /** v20：節税しない通常（SIM_TAX を止める）・段 F を止めた 3 方針（withoutAcct） */
  noSave?: RunResult[];
  noAcct?: RunResult[];
  /** v21（調整 1）：士気と給与の手を止めた 100%（3 シード） */
  noHrHands?: RunResult[];
  /** v22（段 G）：カスタマーサポートとマーケを止めた 3 方針（withoutCs。段 G の前と同じ） */
  noCs?: RunResult[];
  /** v24（段 H2）：M&A なし・特許なしの通常と 100%（withoutMA・withoutPatent） */
  noMA?: RunResult[];
  noPatent?: RunResult[];
  /** v26（段 UI4）：できごとなしの 3 方針（withoutEvents。段 UI4 の前と同じ） */
  noEvents?: RunResult[];
  /** v28（段 P2）：適性と組み合わせを止めた 3 方針（段 P2 の前と同じ）・組み合わせだけ止めた 3 方針 */
  noP2?: RunResult[];
  noDuo?: RunResult[];
  /** v30（段 I1）：予算で任せるを止めた通常（withoutBudget。段 I1 の前と同じ） */
  noBudget?: RunResult[];
  ms: number;
}

const sectorName = (id: string) => `${sectorDef(id).name}（${id}）`;

export function tables(rep: Report2): string {
  const out: string[] = [];
  const pols: PolicyId[] = ['rta', 'normal', 'full'];
  const seeds = [...new Set(rep.runs.map((r) => r.seed))];
  out.push('### 表 1：方針 × セクタの「制覇（2 か月続けて 1 位）までの月数」');
  out.push('');
  out.push(`シード ${seeds.join('・')} の平均（最小〜最大）。月数は開店からの月の締めの回数。「初の 1 位」は初めて 1 位になった月（v3 までの「1 位までの月数」と同じもの）。売上・資金は制覇した月の締めの時点。実時間は着いてから制覇の締めまで（単価は下の SIM_TIME）。`);
  out.push('');
  out.push('| 方針 | セクタ | ランク | 制覇までの月数 | 初の 1 位 | 制覇の月の売上 | そのときの資金 | スキル数 | 実時間（制覇まで） | 制覇できた |');
  out.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    for (const id of routeOf(p)) {
      const rs = runs.map((r) => r.sectors.find((x) => x.id === id && !x.revisit)).filter((x): x is SectorRun => !!x);
      const tops = rs.filter((x) => x.months != null);
      const months = tops.map((x) => x.months!);
      const secs = tops.map((x) => secOf(p, x, 'top')!);
      const reach = `${tops.length}/${runs.length}${rs.length < runs.length ? `（未到達 ${runs.length - rs.length}）` : ''}${rs.length > tops.length ? `（制覇できない ${rs.length - tops.length}）` : ''}`;
      const firsts = rs.map((x) => x.first).filter((v): v is number => v != null);
      out.push(
        `| ${POLICY_NAME[p]} | ${sectorName(id)} | ${sectorDef(id).tier} | ${tops.length ? `${mean(months).toFixed(1)}（${range(months)}）` : '制覇できない'} | ${firsts.length ? `${mean(firsts).toFixed(1)}（${range(firsts)}）` : '—'} | ${tops.length ? `${fmtG(mean(tops.map((x) => x.rev)))}（${range(tops.map((x) => x.rev), fmtG)}）` : '—'} | ${tops.length ? fmtG(mean(tops.map((x) => x.money))) : '—'} | ${tops.length ? mean(tops.map((x) => x.skills)).toFixed(0) : '—'} | ${tops.length ? `${fmtMin(mean(secs))}（${range(secs, fmtMin)}）` : '—'} | ${reach} |`,
      );
    }
  }
  out.push('');
  out.push('### 表 2：方針ごとの合計と、憲章の目標との差');
  out.push('');
  out.push('合計は、着いてから次のセクタへ移るまで（制覇のあと資金をためる月も含む）＋ チュートリアル。v16：Rare（通常は 1 町・100% は Rare の町も）を足した。v23：Epic（通常は Rare 2 町 → Epic 1 町・100% は Epic 3 町）を足した。Legendary は未実装。v14：「再発掘」は 100% が最後に被災した Common の町を回って掘り直した時間（合計に入る。「うち Common」には入れない）。「目安」は C＋U の目安のまま（Rare ができたので、Lime 全体の長さで測り直す。v16 の節）。');
  out.push('');
  out.push('| 方針 | 回ったセクタ | 合計の月数（ゲーム内） | 行動の数 | 合計の実時間 | うち Common | うち Uncommon | うち再発掘（v14） | うち Rare（v16） | うち Epic（v23） | 憲章の目標（Lime 全体） | 目標の配分での C＋U の目安 | 差 |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const target: Record<PolicyId, { label: string; cu: [number, number] }> = {
    // rta：1 セクタ 15 分 × C1・U1（Common やや短め）→ 25〜30 分
    rta: { label: '2 h（C〜L）', cu: [25 * 60, 30 * 60] },
    // normal：1 セクタ 40〜45 分 × C3・U2 → 200〜225 分（Common やや短め）
    normal: { label: '5〜6 h', cu: [190 * 60, 225 * 60] },
    // full：Lime 21 セクタのうち C8・U5。8 h 以上を 21 セクタで割ると 1 セクタ 23 分以上 → 13 セクタで 5 h 以上
    full: { label: '8 h 以上', cu: [5 * 3600, 6 * 3600] },
  };
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    const tot = runs.map(totalSec);
    const byTier = (tier: Tier) => runs.map((x) => x.sectors.filter((r) => r.tier === tier && !r.revisit).reduce((a, r) => a + (secOf(p, r, 'left') ?? 0), 0) + (tier === 'C' ? SIM_TIME[p].tutorial : 0));
    const redig = runs.map((x) => x.sectors.filter((r) => r.revisit).reduce((a, r) => a + (secOf(p, r, 'left') ?? 0), 0));
    const months = runs.map((x) => x.days / 30);
    const acts = runs.map((x) => Object.values(x.actions).reduce((a, b) => a + b, 0));
    const done = runs.filter((x) => x.done).length;
    const visited = mean(runs.map((x) => x.sectors.filter((r) => r.months != null && !r.revisit).length));
    const tg = target[p];
    const m = mean(tot);
    const diff = m < tg.cu[0] ? `目安より ${fmtMin(tg.cu[0] - m)} 短い` : m > tg.cu[1] ? `目安より ${fmtMin(m - tg.cu[1])} 長い` : '目安の範囲';
    out.push(
      `| ${POLICY_NAME[p]} | 制覇 ${visited.toFixed(1)} / ${routeOf(p).length}（完走 ${done}/${runs.length}） | ${mean(months).toFixed(1)}（${range(months.map((v) => Math.round(v)))}） | ${Math.round(mean(acts))} | ${fmtH(m)}（${range(tot, fmtH)}） | ${fmtH(mean(byTier('C')))} | ${fmtH(mean(byTier('U')))} | ${mean(redig) > 0 ? fmtH(mean(redig)) : '—'} | ${mean(byTier('R')) > 0 ? fmtH(mean(byTier('R'))) : '—'} | ${mean(byTier('E')) > 0 ? fmtH(mean(byTier('E'))) : '—'} | ${tg.label} | ${fmtH(tg.cu[0])}〜${fmtH(tg.cu[1])} | ${diff} |`,
    );
  }
  out.push('');
  // v13：ランクの順（Common 1 セクタの平均 < Uncommon 1 セクタの平均）と、制覇の 2 つ目の条件（研究成果の発表）
  out.push('### 表 5：1 セクタの平均の実時間（ランクの順）と、研究成果の発表（v13。発掘 v2 の 5 段目）');
  out.push('');
  out.push('1 セクタの平均は「着いてから離れるまで」（Common はタオックスを含む。チュートリアルは含まない）。「タオックスを除く」は 2 か所目からの Common。「発表待ち」は 1 位を 2 か月続けたのに研究成果の発表がまだで制覇にならなかった月の締め（制覇まで・回ったセクタの合計）。');
  out.push('');
  out.push('| 方針 | Common 1 セクタの平均 | うちタオックスを除く | Uncommon 1 セクタの平均 | Rare 1 セクタの平均（v16） | Epic 1 セクタの平均（v23） | ランクの順（C < U < R < E） | 発表待ちの月（合計） | 最後に残った RP | C・U の研究パネルを全部開けたあとに入った RP（そのときのセクタ） |');
  out.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    const per = (f: (r: SectorRun) => boolean) => {
      const xs = runs.flatMap((x) => x.sectors.filter(f).map((r) => secOf(p, r, 'left') ?? 0));
      return xs.length ? mean(xs) : null;
    };
    const c = per((r) => r.tier === 'C' && !r.revisit);
    const c2 = per((r) => r.tier === 'C' && r.id !== 'c1' && !r.revisit);
    const u = per((r) => r.tier === 'U');
    const rr = per((r) => r.tier === 'R');
    const ee = per((r) => r.tier === 'E' && !r.revisit);
    const at = runs.map((x) => x.rpLeft.allAt).filter((v): v is string => !!v);
    const order = c != null && u != null ? (c < u ? (rr == null ? '○（C < U）' : u < rr ? (ee == null || rr < ee ? '○' : '×（R ≧ E）') : '×（U ≧ R）') : '×（C ≧ U）') : '—';
    out.push(
      `| ${POLICY_NAME[p]} | ${c != null ? fmtMin(c) : '—'} | ${c2 != null ? fmtMin(c2) : '—'} | ${u != null ? fmtMin(u) : '—'} | ${rr != null ? fmtMin(rr) : '—'} | ${ee != null ? fmtMin(ee) : '—'} | ${order} | ${mean(runs.map((x) => x.sectors.reduce((a, r) => a + r.dig.waitPresent, 0))).toFixed(1)} | ${Math.round(mean(runs.map((x) => x.rpLeft.end))).toLocaleString('en-US')} | ${at.length ? `${Math.round(mean(runs.map((x) => x.rpLeft.afterAll))).toLocaleString('en-US')}（${[...new Set(at)].map(sectorName).join('・')}。${at.length}/${runs.length}）` : '—（全部は開けない）'} |`,
    );
  }
  out.push('');
  // v14a：RP の倍率なし・無限の強化パネル・研究への寄付・Uncommon の発表の研究 Lv
  out.push('### 表 6：研究ポイントの使い道（v14a。発掘 v2 の 6 段目）');
  out.push('');
  out.push(`3 シードの平均（最小〜最大）。「掘って入った RP」は寄付を除く合計。無限の強化パネルは 100% だけが上げる（C・U の研究パネルを全部開けたあとの RP。Lv1 ${infCost(1).toLocaleString('en-US')} RP・×${DIG_BALANCE.infinite.grow}）。寄付は通常・100% が Common を 1 つ制覇（または依頼状）のあと、資金に余裕のある月に（はじめ ${donateCost(0).toLocaleString('en-US')} G・×${DIG_BALANCE.buyRp.grow}・1 回 ${DIG_BALANCE.buyRp.rp} RP。\`SIM_DONATE\`）。「研究待ち」はお題がそろったのに Uncommon の発表の 2 つ目の条件（v14 から「この町の出土品 2 種を、この町で 3 個ずつ」。v14a は研究 Lv3）が足りず発表できなかった月の締め（Uncommon のセクタの合計）。`);
  out.push('');
  out.push('| 方針 | 掘って入った RP | 寄付の回数 | 寄付に払った G | 寄付で入った RP | 発掘の速さ ∞ | 掘る力 ∞ | 掘る範囲 ∞ | 無限の強化パネルに払った RP | 最後に残った RP | 研究待ちの月（Uncommon） |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    const v = (f: (x: RunResult['v14']) => number) => runs.map((r) => f(r.v14));
    const mr = (f: (x: RunResult['v14']) => number, d = 1, fm: (n: number) => string = (n) => n.toFixed(d)) => `${fm(mean(v(f)))}（${range(v(f), d ? (n) => String(Math.round(n)) : fm)}）`;
    const num = (n: number) => Math.round(n).toLocaleString('en-US');
    out.push(
      `| ${POLICY_NAME[p]} | ${mr((x) => x.rpDug, 0, num)} | ${mr((x) => x.donations)} | ${mr((x) => x.donateG, 0, fmtG)} | ${mr((x) => x.donateRp, 0, num)} | Lv ${mr((x) => x.inf.u_dig_speed_inf ?? 0)} | Lv ${mr((x) => x.inf.u_dig_power_inf ?? 0)} | Lv ${mr((x) => x.inf.u_dig_reach_inf ?? 0)} | ${mr((x) => x.infRp, 0, num)} | ${Math.round(mean(runs.map((x) => x.rpLeft.end))).toLocaleString('en-US')} | ${mean(runs.map((x) => x.sectors.filter((r) => r.tier === 'U').reduce((a, r) => a + r.dig.resWait, 0))).toFixed(1)} |`,
    );
  }
  out.push('');
  // v14：ランクアップの災害と復興
  out.push('### 表 7：ランクアップの災害と復興（v14。発掘 v2 の 7 段目）');
  out.push('');
  out.push(`3 シードの平均（最小〜最大）。Uncommon へ移るとき（会社として初めて）に、所持金を全額徴収 → 支度金 ${RESET.grant.toLocaleString('en-US')} G。移る前に余ったお金で寄付（\`SIM_RESET\`：最短 ${SIM_RESET.rta.donate}・通常 ${SIM_RESET.normal.donate}・100% ${SIM_RESET.full.donate} 回まで）。通常は売上の大きい Common の町 ${SIM_RESET.normal.towns} つまで、100% は全部の町にヒーローと支援金を送る（復興にかかった月数は、支援金を送ってから全部直るまでの、支援金のあった会社の月の締めの数）。担当の伸びは能力値の合計の伸び。100% は Uncommon のあと、被災した町を回って手で直し、荒れ地を掘り直す（再発掘の RP）。`);
  out.push('');
  out.push('| 方針 | 徴収額 | 支度金 | 移る前の寄付 | 失ったお金のパネル | 任せた町 | 復興にかかった月数（全部直った町） | 直しきれなかった町 | 送った支援金 | 担当の伸び（能力値の合計・人数） | 再発掘の RP | 研究待ちの月（Uncommon） |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    const v = (f: (x: RunResult['v14b']) => number) => runs.map((r) => f(r.v14b));
    const mr = (f: (x: RunResult['v14b']) => number, d = 1, fm: (n: number) => string = (n) => n.toFixed(d)) => `${fm(mean(v(f)))}（${range(v(f), d ? (n) => String(Math.round(n)) : fm)}）`;
    const num = (n: number) => Math.round(n).toLocaleString('en-US');
    const dm = runs.flatMap((r) => r.v14b.doneMonths);
    out.push(
      `| ${POLICY_NAME[p]} | ${mr((x) => x.levy, 0, fmtG)} | ${mr((x) => x.grant, 0, fmtG)} | ${mr((x) => x.preDonate)} 回 | ${mr((x) => x.lost)} 枚 | ${mr((x) => x.delegated)} | ${dm.length ? `${mean(dm).toFixed(1)} か月（${range(dm)}）` : '—'} | ${mr((x) => x.undone)} | ${mr((x) => x.funds, 0, fmtG)} | +${mr((x) => x.grow, 0, num)}・${mr((x) => x.growHeroes)} 人 | ${mr((x) => x.redigRp, 0, num)} | ${mr((x) => x.resWaitU)} |`,
    );
  }
  out.push('');
  // v15：Uncommon の他社の強さと巻き返し（発掘 v2 の 8 段目）
  out.push('### 表 8：Uncommon・Rare の他社と巻き返し（v15。v16 で Rare も）');
  out.push('');
  out.push(`3 シードの平均（最小〜最大）。Uncommon の他社のエクステ以外の月の売上は ×${UNCOMMON_RIVAL.base}（町の倍率：${Object.entries(UNCOMMON_RIVAL.town).map(([k, v]) => `${sectorDef(k).name} ×${v}`).join('・') || 'なし'}）、Rare は ×${RARE_RIVAL.base}（町の倍率：${Object.entries(RARE_RIVAL.town).map(([k, v]) => `${sectorDef(k).name} ×${v}`).join('・') || 'なし'}。ランクの倍率 ×${TIERS.R.rival} に掛ける）。「1 位の他社」は着いた最初の月の締めの、1 位の他社の売上。「初の 1 位 → 制覇」は初めて 1 位になった月から制覇の月まで。巻き返しは自社が 1 位の月の締めで、まだセールをしていない会社がセール（1 つの町で ${UNCOMMON_RIVAL.sale.max} 社まで・${UNCOMMON_RIVAL.sale.months} か月・自社の売上 ×${UNCOMMON_RIVAL.sale.target} を目指す）。`);
  out.push('');
  out.push('| 方針 | セクタ | 1 位の他社（最初の月） | 制覇までの月数 | 初の 1 位 | 初の 1 位 → 制覇 | 巻き返しの回数 | 実時間 |');
  out.push('|---|---|---|---|---|---|---|---|');
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    for (const id of routeOf(p).filter((x) => !!RIVAL_TUNE[sectorDef(x).tier])) {
      const rs = runs.flatMap((x) => x.sectors.filter((r) => r.id === id && !r.revisit));
      if (!rs.length) continue;
      const done = rs.filter((r) => r.months != null);
      const months = done.map((r) => r.months!);
      const firsts = done.map((r) => r.first ?? r.months!);
      const gap = done.map((r) => r.months! - (r.first ?? r.months!));
      const top0 = rs.map((r) => r.log[0]?.top ?? 0);
      const cb = rs.map((r) => r.comeback);
      const secs = rs.map((r) => secOf(p, r, 'left') ?? 0);
      out.push(
        `| ${POLICY_NAME[p]} | ${sectorName(id)} | ${fmtG(mean(top0))} | ${months.length ? `${mean(months).toFixed(1)}（${range(months)}）` : '制覇できない'}${done.length < rs.length ? `（制覇 ${done.length}/${rs.length}）` : ''} | ${firsts.length ? mean(firsts).toFixed(1) : '—'} | ${gap.length ? `${mean(gap).toFixed(1)}（${range(gap)}）` : '—'} | ${mean(cb).toFixed(1)}（${range(cb)}） | ${fmtMin(mean(secs))} |`,
      );
    }
  }
  out.push('');
  // v16：Rare の町 ①（2 回目のランクアップ・Rare の町）
  out.push('### 表 9：Rare の町と 2 回目のランクアップ（v16。Rare の町 ①）');
  out.push('');
  out.push(`3 シードの平均（最小〜最大）。Rare へ初めて進出するとき（2 回目のランクアップ）に、Common・Uncommon の全セクタが被災し、所持金を全額徴収 → 支度金 ${RESET.grantR.toLocaleString('en-US')} G（\`RESET.grantR\`）。「任せた町」は 2 回目のあとヒーローに支援金を送った町（うち Uncommon の町）。「研究待ち」は お題がそろったのに Rare の発表の 2 つ目の条件（この町の出土品 ${DIG_BALANCE.presentRes.R?.n} 種を この町で ${DIG_BALANCE.presentRes.R?.dug} 個ずつ）が足りず発表できなかった月の締め。最短は C＋U で止める（Rare へは行かない）。`);
  out.push('');
  out.push('| 方針 | 合計 | うち C | うち U | うち R | Rare 1 町の平均 | Rare の制覇までの月数 | 2 回目の徴収額 | 支度金 | 移る前の寄付 | 被災した町（C・U） | 任せた町（うち U） | Rare の研究待ち | 巻き返し（Rare の合計） |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    const v = (f: (x: RunResult['v16']) => number) => runs.map((r) => f(r.v16));
    const mr = (f: (x: RunResult['v16']) => number, d = 1, fm: (n: number) => string = (n) => n.toFixed(d)) => `${fm(mean(v(f)))}（${range(v(f), d ? (n) => String(Math.round(n)) : fm)}）`;
    const byTier = (tier: Tier) => mean(runs.map((x) => x.sectors.filter((r) => r.tier === tier && !r.revisit).reduce((a, r) => a + (secOf(p, r, 'left') ?? 0), 0) + (tier === 'C' ? SIM_TIME[p].tutorial : 0)));
    const rs = runs.flatMap((x) => x.sectors.filter((r) => r.tier === 'R'));
    const rMonths = rs.filter((r) => r.months != null).map((r) => r.months!);
    if (!rs.length) {
      out.push(`| ${POLICY_NAME[p]} | ${fmtH(mean(runs.map(totalSec)))} | ${fmtH(byTier('C'))} | ${fmtH(byTier('U'))} | — | — | — | — | — | — | — | — | — | — |`);
      continue;
    }
    out.push(
      `| ${POLICY_NAME[p]} | ${fmtH(mean(runs.map(totalSec)))} | ${fmtH(byTier('C'))} | ${fmtH(byTier('U'))} | ${fmtH(byTier('R'))} | ${fmtMin(mean(rs.map((r) => secOf(p, r, 'left') ?? 0)))} | ${rMonths.length ? `${mean(rMonths).toFixed(1)}（${range(rMonths)}）` : '制覇できない'}${rMonths.length < rs.length ? `（制覇 ${rMonths.length}/${rs.length}）` : ''} | ${mr((x) => x.levy, 0, fmtG)} | ${mr((x) => x.grant, 0, fmtG)} | ${mr((x) => x.preDonate)} 回 | ${mr((x) => x.hitC)}・${mr((x) => x.hitU)} | ${mr((x) => x.delegated)}（${mr((x) => x.delegatedU)}） | ${mr((x) => x.resWaitR)} | ${mr((x) => x.comebackR)} |`,
    );
  }
  out.push('');
  // v17：ヒーローの育成（段 E1）
  out.push('### 表 10：ヒーローの育成（v17。段 E1）');
  out.push('');
  out.push(`3 シードの平均（最小〜最大）。「育成なし」は同じ方針・シードを経験値 0（いつも Lv1）で回した合計（\`withoutGrowth\`）。「ランクの終わりの Lv」は、そのランクの最後のセクタを離れたとき（最後のセクタは終わったとき）の全員の Lv の 最小／中央／最大（3 シードの平均）。昇格は通常・100% だけ（強化アイテムが手に入ったら能力値の高い順）。上限 Lv：${HERO_RARITIES.map((r) => `${r} ${HERO_GROWTH.cap[r]}`).join('・')}。`);
  out.push('');
  out.push('| 方針 | 合計（育成あり） | 育成なし | 短くなったぶん | うち C（あり／なし） | うち U（あり／なし） | うち R（あり／なし） | C の終わりの Lv | U の終わりの Lv | R の終わりの Lv | 昇格の回数 | 開いたパッシブ（最後） | 手に入れた強化アイテム | 最後のレアリティ | 詰まって止まるシード（あり／なし） |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    const off = (rep.noGrowth ?? []).filter((r) => r.policy === p);
    const tot = mean(runs.map(totalSec));
    const tot0 = off.length ? mean(off.map(totalSec)) : NaN;
    const byTier = (rs: RunResult[], tier: Tier) => (rs.length ? mean(rs.map((x) => x.sectors.filter((r) => r.tier === tier && !r.revisit).reduce((a, r) => a + (secOf(p, r, 'left') ?? 0), 0) + (tier === 'C' ? SIM_TIME[p].tutorial : 0))) : NaN);
    const tierCell = (tier: Tier) => (runs.some((x) => x.sectors.some((r) => r.tier === tier)) ? `${fmtH(byTier(runs, tier))}／${off.length ? fmtH(byTier(off, tier)) : '—'}` : '—');
    const lvCell = (tier: Tier) => {
      const xs = runs.map((x) => x.v17.byTier[tier]).filter((v): v is number[] => !!v?.length);
      if (!xs.length) return '—';
      const q = (v: number[], f: number) => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * f))];
      return `${Math.round(mean(xs.map((v) => q(v, 0))))}／${Math.round(mean(xs.map((v) => q(v, 0.5))))}／${Math.round(mean(xs.map((v) => q(v, 1))))}`;
    };
    const rar = runs.flatMap((x) => x.v17.rarEnd);
    const rarTxt = HERO_RARITIES.filter((r) => rar.includes(r)).map((r) => `${r} ${(rar.filter((x) => x === r).length / runs.length).toFixed(1)}`).join('・');
    const stuck = runs.filter((r) => !r.done).length;
    const stuck0 = off.filter((r) => !r.done).length;
    const v = (f: (x: RunResult['v17']) => number) => runs.map((r) => f(r.v17));
    const mr = (f: (x: RunResult['v17']) => number) => `${mean(v(f)).toFixed(1)}（${range(v(f))}）`;
    out.push(
      `| ${POLICY_NAME[p]} | ${fmtH(tot)} | ${off.length ? fmtH(tot0) : '—'} | ${off.length ? `${Math.round((tot0 - tot) / 60)} 分（${(((tot0 - tot) / tot0) * 100).toFixed(1)}%）` : '—'} | ${tierCell('C')} | ${tierCell('U')} | ${tierCell('R')} | ${lvCell('C')} | ${lvCell('U')} | ${lvCell('R')} | ${mr((x) => x.promos)} | ${mr((x) => x.passives)} | ${mr((x) => x.items)} | ${rarTxt} | ${stuck}／${off.length ? stuck0 : '—'} |`,
    );
  }
  out.push('');
  // v32（段 I2）：経営会議と社内監査
  if (rep.runs.some((r) => r.v32)) {
    out.push('### 表 24：経営会議と社内監査（v32。段 I2）');
    out.push('');
    out.push(
      `シード ${seeds.join('・')} の平均。会社の四半期の締め（経理の決算）に、部長のいる部門とセクター長が「予実の報告 → 来期の計画 → 必要予算（＋その他の要求）」を話し、自動プレイは全員「推奨」で決める（計画は承認・据え置きの予算は承認・増額の要求は前の目標に届いた部長だけ承認・RP の使用は承認・部長のいない部門へのヒーローは理解度 ${BOARD.heroAt} から承認）。目標の上乗せは +${BOARD.plan.slice(1).map((x) => Math.round(x * 100)).join('%・+')}%（推奨はいつも承認なので、自動プレイでは使わない）。監査は経理部長（★ で見抜ける盛り：${Object.values(BOARD.audit.see).map((x) => Math.round(x * 100)).join('%・')}%）。時間の比べは、段 I2 の前の main（85809a3）の同じ 9 シード（下の「v32」の節）。`,
    );
    out.push('');
    out.push('| 方針 | 会議 | 話し手 | 計画（承認・+10%・+20%） | 予算（承認・増額・減額） | その他（承認・否認） | 期末（届いた・届かなかった） | 監査の指摘 |');
    out.push('|---|---|---|---|---|---|---|---|');
    for (const p of pols) {
      const runs = rep.runs.filter((r) => r.policy === p);
      if (!runs.length) continue;
      const v = (f: (x: BoardStat) => number) => mean(runs.map((r) => (r.v32 ? f(r.v32) : 0))).toFixed(1);
      out.push(`| ${POLICY_NAME[p]} | ${v((x) => x.held)} | ${v((x) => x.items)} | ${v((x) => x.plan[0])}・${v((x) => x.plan[1])}・${v((x) => x.plan[2])} | ${v((x) => x.budget[0])}・${v((x) => x.budget[1])}・${v((x) => x.budget[2])} | ${v((x) => x.other[0])}・${v((x) => x.other[1])} | ${v((x) => x.met)}・${v((x) => x.missed)} | ${v((x) => x.flags)} |`);
    }
    out.push('');
  }
  // v33（段 K）：経営方針
  if (rep.runs.some((r) => r.v33)) {
    out.push('### 表 26：経営方針（v33。段 K・v34 で段 K2）');
    out.push('');
    out.push(
      `シード ${seeds.join('・')} の平均（終わりの時点）。自動プレイの標準の選び方：全社方針はバランスから、空いた枠は開いた順・事業別の方針は部長の推奨（全社方針の重みにいちばん合うもの）・年初の経営会議（発表会）は全部「推奨」。経営方針の研究パネルは RP に余裕のある月に取る。v34（段 K2）：全社方針の枠は、上のランクの町に初めて進出したときの特別なパネル「枠 +1」（無償）を、どの方針もすぐ受け取る（U 2・R 3・E 4・L 5 枠）。効き目の基本の値は段 K の 1.5 倍。強さ ＝ 基本 ×（1 ＋ ${POL.lv} × 理解度（${POL.lvCap} まで））×（1 ＋ ${POL.head} × 部長の出来の帯）。提案の傾向 × ${1 + POL.tilt}。`,
    );
    out.push('');
    out.push('| 方針 | 発表会 | 部長の発表を替えた | 全社方針の枠 | 全社方針 | 事業別の方針の部門 | 開いた方針 | 取った方針のパネル | 受け取った枠 +1 |');
    out.push('|---|---|---|---|---|---|---|---|---|');
    for (const p of pols) {
      const runs = rep.runs.filter((r) => r.policy === p);
      if (!runs.length) continue;
      const v = (f: (x: NonNullable<RunResult['v33']>) => number) => mean(runs.map((r) => (r.v33 ? f(r.v33) : 0))).toFixed(1);
      out.push(`| ${POLICY_NAME[p]} | ${v((x) => x.held)} | ${v((x) => x.changed)} | ${v((x) => x.slots)} | ${v((x) => x.corp)} | ${v((x) => x.dept)} | ${v((x) => x.open)} | ${v((x) => x.panels)} | ${v((x) => x.slotLv)} |`);
    }
    out.push('');
  }
  // v37（段 S1）：教え
  if (rep.runs.some((r) => r.v37)) {
    out.push('### 表 27：教え（v37。段 S1）');
    out.push('');
    out.push(`シード ${seeds.join('・')} の平均（終わりの時点）。ヒーローの提案を承認して翌月に見込みの向きに動いた・${LESSON.need} 回かかわった（違う日のカード・部長の提案の承認／却下・組み合わせ・経営会議）ヒーローから、月の締めで ${LESSON.perMonth} つまで。型ごとに ${LESSON.cap} つまで効く。`);
    out.push('');
    out.push(`| 方針 | 教え | うち提案の結果 | ${LESSON_TYPES.join(' | ')} |`);
    out.push(`|---|---|---|${LESSON_TYPES.map(() => '---').join('|')}|`);
    for (const p of pols) {
      const runs = rep.runs.filter((r) => r.policy === p);
      if (!runs.length) continue;
      const v = (f: (x: NonNullable<RunResult['v37']>) => number) => mean(runs.map((r) => (r.v37 ? f(r.v37) : 0))).toFixed(1);
      out.push(`| ${POLICY_NAME[p]} | ${v((x) => x.n)} | ${v((x) => x.prop)} | ${LESSON_TYPES.map((k) => v((x) => x.by[k] ?? 0)).join(' | ')} |`);
    }
    out.push('');
  }
  // 表 25（段 I2 で足した。計測の比べ用）：方針 × ランクの実時間（秒。シードの平均）と、シードごとの合計（秒）
  {
    out.push('### 表 25：方針 × ランクの実時間（秒。シードの平均）');
    out.push('');
    out.push(`シード ${seeds.join('・')} の平均。ランクごとは、着いてから離れるまで（再発掘を除く。Common はチュートリアルを含む）。前後の比べ（目安：合計 ±3%・ランクごと ±5%）に使う。`);
    out.push('');
    out.push('| 方針 | 合計 | C | U | R | E | シードごとの合計 |');
    out.push('|---|---|---|---|---|---|---|');
    for (const p of pols) {
      const runs = rep.runs.filter((r) => r.policy === p);
      if (!runs.length) continue;
      const tierSec = (tier: Tier) => mean(runs.map((x) => x.sectors.filter((r) => r.tier === tier && !r.revisit).reduce((a, r) => a + (secOf(p, r, 'left') ?? 0), 0) + (tier === 'C' ? SIM_TIME[p].tutorial : 0)));
      const f = (v: number) => Math.round(v).toLocaleString('en-US');
      const bySeed = [...runs].sort((a, b) => a.seed - b.seed).map((r) => f(totalSec(r))).join('・');
      out.push(`| ${POLICY_NAME[p]} | ${f(mean(runs.map(totalSec)))} | ${f(tierSec('C'))} | ${f(tierSec('U'))} | ${f(tierSec('R'))} | ${f(tierSec('E'))} | ${bySeed} |`);
    }
    out.push('');
  }
  // v30（段 I1）：予算で任せる
  if (rep.noBudget?.length || rep.runs.some((r) => r.v30)) {
    out.push('### 表 23：予算で任せる（v30。段 I1）');
    out.push('');
    out.push(
      `シード ${seeds.join('・')} の平均。会社が Rare の町に出店すると、部長のいる部門は月の予算（自動プレイはどの部門も「中」＝いまの町の先月の売上 × ${BUDGET.rate.M}・下限 R ${BUDGET.floor.R.toLocaleString('en-US')} G）の中で、施策を見込みの大きい順に月 ${BUDGET.perHead} 件まで実行する。労力は部長の手（${BUDGET.hand.base}＋${BUDGET.hand.star}×(★−1) 人日）と従業員（1 人 ${BUDGET.crew.labor} 人日・1 日 ${BUDGET.crew.wage} G・上限 ${BUDGET.crew.cap} 人）。予算の効き：★ 1 つ ${BUDGET.eff.star}・適性 S ${BUDGET.eff.fit.S}〜D ${BUDGET.eff.fit.D}。予算・労力の足りない施策は前と同じ部長の提案（自動プレイが承認）。部長の置き方は前のまま（理解度 ${DELEG.headAt}）。「I1 なし」は同じシードの通常を \`withoutBudget\`（段 I1 の前の main と同じ通し）で回した値。括弧の中は「あり − なし」。目安は合計 ±3%・ランクごと ±5%。`,
    );
    out.push('');
    out.push('| 方針 | 合計（I1 なし・差） | うち C | うち U | うち R | うち E | 予算の中の施策（件・額） | 浮いた額 | 雇った／減らした従業員 | 給料 | 頼み（予算・使い切り・人手・成果なし） | 終わりの従業員・予算の部門 |');
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const p of pols) {
      const runs = rep.runs.filter((r) => r.policy === p);
      if (!runs.length) continue;
      const byTier = (xs: RunResult[], tier: Tier) => mean(xs.map((x) => x.sectors.filter((r) => r.tier === tier && !r.revisit).reduce((a, r) => a + (secOf(p, r, 'left') ?? 0), 0) + (tier === 'C' ? SIM_TIME[p].tutorial : 0)));
      const pc = (a: number, b: number) => (b > 0 ? `${fmtH(a)}（${fmtH(b)}・${a >= b ? '+' : '−'}${((Math.abs(a - b) / b) * 100).toFixed(1)}%）` : '—');
      const off = (rep.noBudget ?? []).filter((r) => r.policy === p);
      const tot = mean(runs.map(totalSec));
      const tierPc = (tier: Tier) => (off.length ? pc(byTier(runs, tier), byTier(off, tier)) : '—');
      const v = (f: (x: NonNullable<RunResult['v30']>) => number) => mean(runs.map((r) => (r.v30 ? f(r.v30) : 0)));
      const k = (x: number) => `${Math.round(x / 1000).toLocaleString('en-US')}k`;
      out.push(
        `| ${POLICY_NAME[p]} | ${off.length ? pc(tot, mean(off.map(totalSec))) : fmtH(tot)} | ${tierPc('C')} | ${tierPc('U')} | ${tierPc('R')} | ${tierPc('E')} | ${v((x) => x.acts).toFixed(1)} 件・${k(v((x) => x.spent))} G | ${k(v((x) => x.saved))} G | ${v((x) => x.hired).toFixed(1)}／${v((x) => x.fired).toFixed(1)} | ${k(v((x) => x.wages))} G | ${v((x) => x.asks.over ?? 0).toFixed(1)}・${v((x) => x.asks.spent ?? 0).toFixed(1)}・${v((x) => x.asks.labor ?? 0).toFixed(1)}・${v((x) => x.asks.idle ?? 0).toFixed(1)} | ${v((x) => x.crewEnd).toFixed(1)} 人・${v((x) => x.heads).toFixed(1)} |`,
      );
    }
    out.push('');
    out.push('シードごとの合計（秒。あり／I1 なし）');
    out.push('');
    out.push(`| 方針 | ${seeds.map((x) => `シード ${x}`).join(' | ')} |`);
    out.push(`|---|${seeds.map(() => '---').join('|')}|`);
    for (const p of pols) {
      if (!(rep.noBudget ?? []).some((x) => x.policy === p)) continue;
      const cell = (seed: number) => {
        const f = (xs: RunResult[] | undefined) => {
          const r = (xs ?? []).find((x) => x.policy === p && x.seed === seed);
          return r ? Math.round(totalSec(r)).toLocaleString('en-US') : '—';
        };
        return `${f(rep.runs)}／${f(rep.noBudget)}`;
      };
      out.push(`| ${POLICY_NAME[p]} | ${seeds.map(cell).join(' | ')} |`);
    }
    out.push('');
  }
  // v28（段 P2）：ヒーローの声と適性・組み合わせ
  if (rep.noP2?.length || rep.runs.some((r) => r.v28)) {
    out.push('### 表 22：ヒーローの適性と組み合わせ（v28。段 P2）');
    out.push('');
    out.push(
      `シード ${seeds.join('・')} の平均。「P2 なし」は同じ方針・シードを \`withoutP2\`（適性の倍率と組み合わせを止める＝段 P2 の前の main と同じ通し）で回した値、「組み合わせなし」は組み合わせだけ止めた値（適性の倍率は入る）。括弧の中は「あり − なし」。目安は ±3%。適性の倍率（\`HERO_FIT\`）：S ×${HERO_FIT.mul.S}・A ×${HERO_FIT.mul.A}・B ×${HERO_FIT.mul.B}・C ×${HERO_FIT.mul.C}・D ×${HERO_FIT.mul.D}（任せた部門の出来・持ち場の速さ・セクター長の売上）。組み合わせ（\`DUO\`）：${DUOS.length} 組・町の ${DUO.first} か月目の締めから・カードの上限の中で 1 か月 1 つまで。方針はできごとと同じ（最短＝いまのまま・通常＝おすすめ・100%＝見込みのいちばん大きい手）。雇い方は変えない（雇う候補の比べは適性を入れない出来のまま）。リーダー・部長の候補の順も、適性を入れない出来の順（段 P2 の前と同じ。配置の判断は変えない）。倍率は選んだあとの出来・速さに効く。`,
    );
    out.push('');
    out.push('| 方針 | 合計（P2 なし・差） | うち C | うち U | うち R | うち E | 合計（組み合わせなし・差） | 見つけた組み合わせ／通し | 選んだ手 | 詰まって止まるシード（あり／P2 なし） |');
    out.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const p of pols) {
      const runs = rep.runs.filter((r) => r.policy === p);
      if (!runs.length) continue;
      const byTier = (xs: RunResult[], tier: Tier) => mean(xs.map((x) => x.sectors.filter((r) => r.tier === tier && !r.revisit).reduce((a, r) => a + (secOf(p, r, 'left') ?? 0), 0) + (tier === 'C' ? SIM_TIME[p].tutorial : 0)));
      const pc = (a: number, b: number) => (b > 0 ? `${fmtH(a)}（${fmtH(b)}・${a >= b ? '+' : '−'}${((Math.abs(a - b) / b) * 100).toFixed(1)}%）` : '—');
      const off = (rep.noP2 ?? []).filter((r) => r.policy === p);
      const nod = (rep.noDuo ?? []).filter((r) => r.policy === p);
      const tot = mean(runs.map(totalSec));
      const tierPc = (tier: Tier) => (off.length ? pc(byTier(runs, tier), byTier(off, tier)) : '—');
      const found = mean(runs.map((r) => r.v28?.found.length ?? 0)).toFixed(1);
      const names = [...new Set(runs.flatMap((r) => r.v28?.found ?? []))].join('・') || '—';
      const opt: Record<string, number> = {};
      for (const r of runs) for (const [k, v] of Object.entries(r.v28?.opt ?? {})) opt[k] = (opt[k] ?? 0) + (v ?? 0);
      out.push(
        `| ${POLICY_NAME[p]} | ${off.length ? pc(tot, mean(off.map(totalSec))) : fmtH(tot)} | ${tierPc('C')} | ${tierPc('U')} | ${tierPc('R')} | ${tierPc('E')} | ${nod.length ? pc(tot, mean(nod.map(totalSec))) : '—'} | ${found}（${names}） | ${Object.entries(opt).map(([k, v]) => `${k} ${v}`).join('・') || '—'} | ${runs.filter((r) => !r.done).length}／${off.length ? off.filter((r) => !r.done).length : '—'} |`,
      );
    }
    out.push('');
    out.push('シードごとの合計（秒。あり／P2 なし／組み合わせなし）');
    out.push('');
    out.push(`| 方針 | ${seeds.map((x) => `シード ${x}`).join(' | ')} |`);
    out.push(`|---|${seeds.map(() => '---').join('|')}|`);
    for (const p of pols) {
      const cell = (seed: number) => {
        const f = (xs: RunResult[] | undefined) => {
          const r = (xs ?? []).find((x) => x.policy === p && x.seed === seed);
          return r ? Math.round(totalSec(r)).toLocaleString('en-US') : '—';
        };
        return `${f(rep.runs)}／${f(rep.noP2)}／${f(rep.noDuo)}`;
      };
      out.push(`| ${POLICY_NAME[p]} | ${seeds.map(cell).join(' | ')} |`);
    }
    out.push('');
  }
  // 調整 v25c：v25（PR #29 の前の main）とのランクごとの時間の差（どのランクも ±5% が目安）
  {
    const sd = [...new Set(rep.runs.map((r) => r.seed))].sort((a, b) => a - b).join(',');
    const key = sd === '1,2,3' ? '3' : sd === '1,2,3,4,5,6,7,8,9' ? '9' : null;
    out.push('### 表 21：調整 v25c（v25 との比べ）');
    out.push('');
    out.push(
      `${key ?? sd.split(',').length} シードの平均。「v25」は PR #29（発掘のパネルを RP に・カリスマだけで Uncommon が雇える）の前の main の同じシード（\`V25_TIER\`・\`V25_TIER9\`。3 シードと 9 シードだけ。v26 の突発のできごとも入った通し）。目安は C・U が v25 の ±5%、R・E は v25b より遅くしない（ユーザー決定 2026-11-03）。発掘の枝の研究パネルの効き目は Lv${DIG_BALANCE.tree.rpLv.lv}（${Object.entries(DIG_BALANCE.tree.rpLv.keep).map(([id, lv]) => `${SKILL[id]?.name ?? id} Lv${lv}`).join('・')}）・Common の発掘のパネルの RP 合計 ${DIG_PANELS.filter((id) => (SKILL[id].tier ?? 'C') === 'C').reduce((a, id) => a + rpCost(SKILL[id]), 0)}。`,
    );
    out.push('');
    out.push('| 方針 | 合計（v25） | うち C（v25） | うち U（v25） | うち R（v25） | うち E（v25） | 雇ったアンコモン | 詰まって止まるシード |');
    out.push('|---|---|---|---|---|---|---|---|');
    for (const p of pols) {
      const runs = rep.runs.filter((r) => r.policy === p);
      if (!runs.length) continue;
      const B = key === '3' ? V25_TIER[p] : key === '9' ? V25_TIER9[p] : null;
      const byTier = (tier: Tier) => mean(runs.map((x) => x.sectors.filter((r) => r.tier === tier && !r.revisit).reduce((a, r) => a + (secOf(p, r, 'left') ?? 0), 0) + (tier === 'C' ? SIM_TIME[p].tutorial : 0)));
      const pc = (a: number, b: number | undefined) => (b && b > 0 ? `${(a / 60).toFixed(1)} 分（${(b / 60).toFixed(1)} 分・${a >= b ? '+' : '−'}${((Math.abs(a - b) / b) * 100).toFixed(1)}%）` : a > 0 ? `${(a / 60).toFixed(1)} 分` : '—');
      const tot = mean(runs.map(totalSec));
      const hiredU = mean(runs.map((r) => r.v19.hired.U ?? 0));
      out.push(`| ${POLICY_NAME[p]} | ${pc(tot, B?.total)} | ${pc(byTier('C'), B?.C)} | ${pc(byTier('U'), B?.U)} | ${pc(byTier('R'), B?.R)} | ${pc(byTier('E'), B?.E)} | ${hiredU.toFixed(1)} | ${runs.filter((r) => !r.done).length} |`);
    }
    out.push('');
  }
  // v26（段 UI4）：突発のできごと・外交
  {
    out.push('### 表 20：突発のできごと・外交（v26。段 UI4）');
    out.push('');
    out.push(
      `シード ${seeds.join('・')} の平均。「なし」は同じ方針・シードを \`withoutEvents\`（できごと・外交を止める＝段 UI4 の前の main と同じ通し）で回した値で、括弧の中は「あり − なし」（できごとの差）。目安は C・U・R が ±3%・E が ±5%。できごとは町の ${EVENT.first} か月目の締めから ${EVENT.gap[0]}〜${EVENT.gap[1]} か月に 1 回（良いできごとと困りごとが交互）。方針（\`SIM_EVENT\`）：最短＝様子を見る系（いちばん軽い手）・通常＝おすすめ（金色）・100%＝払える手のうち見込みのいちばん大きい手。外交は通常・100% とも交易の約束と依頼を受けられるだけ受ける。「見込み」は選んだ手の見込みの合計（G）。`,
    );
    out.push('');
    out.push('| 方針 | 合計（なし・差） | うち C（なし・差） | うち U（なし・差） | うち R（なし・差） | うち E（なし・差） | できごと／通し（C・U・R・E） | 良い・困りごと | 見込み | 詰まって止まるシード（あり／なし） |');
    out.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const p of pols) {
      const runs = rep.runs.filter((r) => r.policy === p);
      if (!runs.length) continue;
      const byTier = (xs: RunResult[], tier: Tier) => mean(xs.map((x) => x.sectors.filter((r) => r.tier === tier && !r.revisit).reduce((a, r) => a + (secOf(p, r, 'left') ?? 0), 0) + (tier === 'C' ? SIM_TIME[p].tutorial : 0)));
      const pc = (a: number, b: number) => (b > 0 ? `${fmtH(a)}（${fmtH(b)}・${a >= b ? '+' : '−'}${((Math.abs(a - b) / b) * 100).toFixed(1)}%）` : '—');
      const off = (rep.noEvents ?? []).filter((r) => r.policy === p);
      const tot = mean(runs.map(totalSec));
      const offTot = off.length ? mean(off.map(totalSec)) : 0;
      const tierPc = (tier: Tier) => (off.length ? pc(byTier(runs, tier), byTier(off, tier)) : '—');
      const nT = (tier: Tier) => mean(runs.map((r) => r.v26.ev.tier[tier] ?? 0)).toFixed(1);
      out.push(
        `| ${POLICY_NAME[p]} | ${off.length ? pc(tot, offTot) : fmtH(tot)} | ${tierPc('C')} | ${tierPc('U')} | ${tierPc('R')} | ${tierPc('E')} | ${nT('C')}・${nT('U')}・${nT('R')}・${nT('E')} | ${mean(runs.map((r) => r.v26.ev.good)).toFixed(1)}・${mean(runs.map((r) => r.v26.ev.bad)).toFixed(1)} | ${fmtG(mean(runs.map((r) => r.v26.ev.ev)))} | ${runs.filter((r) => !r.done).length}／${off.length ? off.filter((r) => !r.done).length : '—'} |`,
      );
    }
    out.push('');
    out.push('シードごとの合計（秒。あり／なし）');
    out.push('');
    out.push(`| 方針 | ${seeds.map((x) => `シード ${x}`).join(' | ')} |`);
    out.push(`|---|${seeds.map(() => '---').join('|')}|`);
    for (const p of pols) {
      const cell = (seed: number) => {
        const a = rep.runs.find((r) => r.policy === p && r.seed === seed);
        const b = (rep.noEvents ?? []).find((r) => r.policy === p && r.seed === seed);
        return a ? `${Math.round(totalSec(a)).toLocaleString('en-US')}／${b ? Math.round(totalSec(b)).toLocaleString('en-US') : '—'}` : '—';
      };
      out.push(`| ${POLICY_NAME[p]} | ${seeds.map(cell).join(' | ')} |`);
    }
    out.push('');
    out.push(`できごとの種類ごと（3 方針 × ${seeds.length} シードの合計：出た数と、選んだ手の内訳）`);
    out.push('');
    out.push('| 種類 | 良い／困りごと | 最短 | 通常 | 100% |');
    out.push('|---|---|---|---|---|');
    for (const k of EV_KINDS as EvKind[]) {
      const cell = (p: PolicyId) => {
        const xs = rep.runs.filter((r) => r.policy === p).map((r) => r.v26.ev.kind[k]).filter((x): x is NonNullable<typeof x> => !!x);
        const n = xs.reduce((a, x) => a + x.n, 0);
        if (!n) return '—';
        const opt: Record<string, number> = {};
        for (const x of xs) for (const [o, v] of Object.entries(x.opt)) opt[o] = (opt[o] ?? 0) + v;
        return `${n}（${Object.entries(opt).map(([o, v]) => `${optName(k, o)} ${v}`).join('・')}）`;
      };
      out.push(`| ${k} | ${GOOD_KINDS.includes(k) ? '良い' : '困りごと'} | ${cell('rta')} | ${cell('normal')} | ${cell('full')} |`);
    }
    out.push('');
    out.push('外交（Epic。1 回の通しあたりの平均）');
    out.push('');
    out.push(`| 方針 | 会ったランド | 仲（${LAND_IDS.map(landName).join('・')}） | 交易の約束 | 届けた数 | 交易の売上 | 足りなかった月・罰 | 町を移って休んだ月 | 依頼（受けた・達成・期限切れ） | もてなした・断った |`);
    out.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const p of pols) {
      const runs = rep.runs.filter((r) => r.policy === p);
      if (!runs.length) continue;
      const d = (k: keyof DipStat) => mean(runs.map((r) => r.v26.dip[k] ?? 0));
      const rel = LAND_IDS.map((id) => {
        const xs = runs.map((r) => r.v26.rel[id]).filter((v): v is number => v != null);
        return xs.length ? mean(xs).toFixed(0) : '—';
      }).join('・');
      out.push(`| ${POLICY_NAME[p]} | ${d('met').toFixed(1)} | ${rel} | ${d('trades').toFixed(1)} | ${d('tradeN').toFixed(0)} | ${fmtG(d('tradeYen'))} | ${d('missed').toFixed(1)}・${fmtG(d('penalty'))} | ${d('rested').toFixed(1)} | ${d('reqs').toFixed(1)}・${d('reqDone').toFixed(1)}・${d('reqLate').toFixed(1)} | ${d('hosted').toFixed(1)}・${d('declined').toFixed(1)} |`);
    }
    out.push('');
    out.push(`外交の数字（\`DIPLO\`）：初めの仲 ${DIPLO.start}・初めての使者は Epic の町に着いて ${DIPLO.afterMonths} か月か石板 e3-b・次のランドは ${DIPLO.nextMonths} か月ごと・提案は ${DIPLO.every} か月ごと・交易は毎月（先月売れた復刻品・骨董の ${Math.round(DIPLO.trade.share * 100)}%・最低 ${DIPLO.trade.min} 個）を ${DIPLO.trade.months} か月・上乗せ ${Math.round(DIPLO.trade.bonus * 100)}% ＋ 仲 × ${DIPLO.trade.bonusRel * 100}%・罰の上限 ${DIPLO.trade.penaltyMax.toLocaleString('en-US')} G。`);
    out.push('');
  }
  // v25（段 UI1）：提案・報告のカード
  {
    out.push('### 表 19：提案・報告のカード（v25。段 UI1）');
    out.push('');
    out.push(
      `3 シードの平均（最小〜最大）。「v24」は段 UI1 の前の main の同じ 3 シード（\`V24_TIER\`）。C・U・R・E は ±5% が目安。カードの数はランクごとの月の締め 1 回あたり（出た・時間を止めて出した・上限で受け箱に回った）。上限は C ${CARD.cap.C}・U ${CARD.cap.U}・R 以上 ${CARD.cap.R} 枚／月・同じヒーロー月 1・同じ種類は ${CARD.kindGap} か月あける。方針：通常だけ、ヒーローの提案（店員・職人・調達係・手の空いた人）のおすすめを部長の提案と同じ条件で受ける（受ける手：${[...SIM_CARD_TAKE].map((k) => TAKE_NAME[k] ?? k).join('・')}。出店・品ぞろえの入れ替え・パネルの順・人の配置・宣伝は方針のまま）。最短・100% はカードを使わない（カードは作られるが選ばない）。「受けた」は、カードの手か、部長の提案を承認した数。`,
    );
    out.push('');
    out.push('| 方針 | 合計（v24） | うち C（v24） | うち U（v24） | うち R（v24） | うち E（v24） | カード／月 C（出す・受け箱） | U | R | E | 任せて実行 | 詰まって止まるシード |');
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const p of pols) {
      const runs = rep.runs.filter((r) => r.policy === p);
      if (!runs.length) continue;
      const B = V24_TIER[p];
      const byTier = (tier: Tier) => mean(runs.map((x) => x.sectors.filter((r) => r.tier === tier && !r.revisit).reduce((a, r) => a + (secOf(p, r, 'left') ?? 0), 0) + (tier === 'C' ? SIM_TIME[p].tutorial : 0)));
      const pc = (a: number, b: number) => (b > 0 ? `${fmtH(a)}（${fmtH(b)}・${a >= b ? '+' : '−'}${((Math.abs(a - b) / b) * 100).toFixed(1)}%）` : '—');
      const per = (tier: Tier) => {
        const m = runs.reduce((a, r) => a + (r.v25.months[tier] ?? 0), 0);
        if (!m) return '—';
        const f = (k: 'made' | 'pop' | 'boxed') => (runs.reduce((a, r) => a + (r.v25[k][tier] ?? 0), 0) / m).toFixed(2);
        return `${f('made')}（${f('pop')}・${f('boxed')}）`;
      };
      const tot = mean(runs.map(totalSec));
      const auto = mean(runs.map((r) => Object.values(r.v25.auto).reduce((a, n) => a + (n ?? 0), 0)));
      out.push(`| ${POLICY_NAME[p]} | ${pc(tot, B.total)} | ${pc(byTier('C'), B.C)} | ${pc(byTier('U'), B.U)} | ${pc(byTier('R'), B.R)} | ${pc(byTier('E'), B.E)} | ${per('C')} | ${per('U')} | ${per('R')} | ${per('E')} | ${auto.toFixed(1)} | ${runs.filter((r) => !r.done).length} |`);
    }
    out.push('');
    out.push('出どころごと（1 回の通しあたりの平均：出た数・受けた数と割合）');
    out.push('');
    out.push(`| 方針 | ${CARD_SRCS.map((x) => SRC_NAME[x]).join(' | ')} |`);
    out.push(`|---|${CARD_SRCS.map(() => '---').join('|')}|`);
    for (const p of pols) {
      const runs = rep.runs.filter((r) => r.policy === p);
      if (!runs.length) continue;
      const cell = (k: CardSrc) => {
        const made = mean(runs.map((r) => r.v25.src[k]?.made ?? 0));
        const taken = mean(runs.map((r) => r.v25.src[k]?.taken ?? 0));
        return made > 0 ? `${made.toFixed(1)}・${taken.toFixed(1)}（${Math.round((taken / made) * 100)}%）` : '—';
      };
      out.push(`| ${POLICY_NAME[p]} | ${CARD_SRCS.map(cell).join(' | ')} |`);
    }
    out.push('');
  }
  // v24（段 H2）：Epic の町 ②（法務と M&A）
  {
    out.push('### 表 18：法務と M&A（v24。段 H2：Epic の町 ②）');
    out.push('');
    out.push(
      `3 シードの平均（最小〜最大）。「v23」は段 H2 の前の main の同じ 3 シード（\`V23_TIER\`）。C・U・R は ±1%・通常の Epic 1 町は ±5% が目安。方針（\`SIM_LEGAL\`）：通常＝仕入れの契約 ${SIM_LEGAL.normal.supply} か月・真似されそうな復刻品だけ特許・M&A なし／100%＝仕入れの契約 ${SIM_LEGAL.full.supply} か月・売れている復刻品はすべて特許（Rare の復刻品は使用料で貸す）・特許の侵害を訴える・M&A（2 位以下で、引き継ぐ商売 ÷ 値段がいちばん良い会社。資金が値段の ${SIM_LEGAL.full.maMoney} 倍あるとき）。M&A の値段の目安は月の売上の ${LEGAL.ma.months[0]}〜${LEGAL.ma.months[1]} か月ぶん。「M&A なし」「特許なし」は同じ方針・シードを \`withoutMA\`・\`withoutPatent\` で回した合計。「買った店の売上の割合」は Epic の町の売上に占める引き継いだ商売の売上。「3 回目の前の寄付」は Epic へ移る直前の研究への寄付に払った額（徴収額のばらつきのもと）。`,
    );
    out.push('');
    out.push('| 方針 | 合計（v23） | うち C（v23） | うち U（v23） | うち R（v23） | うち E（v23） | Epic 1 町目（v23） | Epic 2・3 町目（v23） | M&A なし | 特許なし | M&A の回数 | M&A に使った金額 | 買った店の売上の割合 | 特許 | 止めた追随 | 使用料 | 訴え（勝ち・負け・和解） | 仕入れの契約（安くなったぶん） | 3 回目の徴収額（シードごと） | 3 回目の前の寄付 | 詰まって止まるシード（本番／M&A なし／特許なし） |');
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const p of pols) {
      const runs = rep.runs.filter((r) => r.policy === p);
      if (!runs.length) continue;
      const B = V23_TIER[p];
      const byTier = (rs: RunResult[], tier: Tier) => mean(rs.map((x) => x.sectors.filter((r) => r.tier === tier && !r.revisit).reduce((a, r) => a + (secOf(p, r, 'left') ?? 0), 0) + (tier === 'C' ? SIM_TIME[p].tutorial : 0)));
      const pc = (a: number, b: number) => (b > 0 ? `（${fmtH(b)}・${a >= b ? '+' : '−'}${((Math.abs(a - b) / b) * 100).toFixed(1)}%）` : '');
      const pcm = (a: number, b: number) => (b > 0 ? `${fmtMin(a)}（${fmtMin(b)}・${a >= b ? '+' : '−'}${((Math.abs(a - b) / b) * 100).toFixed(1)}%）` : '—');
      const secAt = (id: string) => mean(runs.map((x) => secOf(p, x.sectors.find((r) => r.id === id && !r.revisit) ?? ({} as SectorRun), 'left') ?? 0));
      const tot = mean(runs.map(totalSec));
      const offM = (rep.noMA ?? []).filter((r) => r.policy === p);
      const offP = (rep.noPatent ?? []).filter((r) => r.policy === p);
      const offCell = (xs: RunResult[]) => (xs.length ? `${fmtH(mean(xs.map(totalSec)))}（E ${fmtMin(byTier(xs, 'E'))}・${byTier(runs, 'E') >= byTier(xs, 'E') ? '+' : '−'}${((Math.abs(byTier(runs, 'E') - byTier(xs, 'E')) / Math.max(1, byTier(xs, 'E'))) * 100).toFixed(1)}%）` : '—');
      const v = (f: (x: RunResult['v24']) => number) => runs.map((r) => f(r.v24));
      const mr = (f: (x: RunResult['v24']) => number, fm: (n: number) => string = (n) => n.toFixed(1)) => `${fm(mean(v(f)))}（${range(v(f), (n) => fm(n))}）`;
      const es = runs.flatMap((x) => x.sectors.filter((r) => r.tier === 'E' && !r.revisit));
      const eRev = es.reduce((a, r) => a + r.allRev, 0);
      const acq = runs.reduce((a, r) => a + r.v24.acqRev, 0);
      if (!es.length) {
        out.push(`| ${POLICY_NAME[p]} | ${fmtH(tot)}${pc(tot, B.total)} | ${fmtH(byTier(runs, 'C'))}${pc(byTier(runs, 'C'), B.C)} | ${fmtH(byTier(runs, 'U'))}${pc(byTier(runs, 'U'), B.U)} | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | ${runs.filter((r) => !r.done).length} |`);
        continue;
      }
      out.push(
        `| ${POLICY_NAME[p]} | ${fmtH(tot)}${pc(tot, B.total)} | ${fmtH(byTier(runs, 'C'))}${pc(byTier(runs, 'C'), B.C)} | ${fmtH(byTier(runs, 'U'))}${pc(byTier(runs, 'U'), B.U)} | ${fmtH(byTier(runs, 'R'))}${pc(byTier(runs, 'R'), B.R)} | ${fmtH(byTier(runs, 'E'))}${pc(byTier(runs, 'E'), B.E)} | ${pcm(secAt('e1'), B.E1)} | ${B.E2 ? `${pcm(secAt('e2'), B.E2)}・${pcm(secAt('e3'), B.E3)}` : '—'} | ${offCell(offM)} | ${offCell(offP)} | ${mr((x) => x.ma)} | ${mr((x) => x.maG, fmtG)} | ${eRev > 0 ? `${((acq / eRev) * 100).toFixed(1)}%` : '—'} | ${mr((x) => x.patents)} | ${mr((x) => x.stopped)} | ${mr((x) => x.royalty, fmtG)} | ${mean(v((x) => x.suits)).toFixed(1)}（${mean(v((x) => x.won)).toFixed(1)}・${mean(v((x) => x.lost)).toFixed(1)}・${mean(v((x) => x.settled)).toFixed(1)}） | ${mean(v((x) => x.contracts)).toFixed(1)}（${fmtG(mean(v((x) => x.saved)))}） | ${runs.map((r) => fmtG(r.v23.levy)).join('・')}（v23：${B.levy.map(fmtG).join('・')}） | ${runs.map((r) => fmtG(r.v24.preDonateG)).join('・')} | ${runs.filter((r) => !r.done).length}／${offM.length ? offM.filter((r) => !r.done).length : '—'}／${offP.length ? offP.filter((r) => !r.done).length : '—'} |`,
      );
    }
    out.push('');
  }
  // v23（段 H1）：Epic の町 ①（3 回目のランクアップ・Epic の町・骨董の需要・ブランド力の上限）
  {
    out.push('### 表 17：Epic の町と 3 回目のランクアップ・骨董の需要（v23。段 H1：Epic の町 ①）');
    out.push('');
    out.push(
      `3 シードの平均（最小〜最大）。Epic へ初めて進出するとき（3 回目のランクアップ）に、Common・Uncommon・Rare の全セクタが被災し、所持金を全額徴収 → 支度金 ${RESET.grantE.toLocaleString('en-US')} G（\`RESET.grantE\`）。倉庫の骨董は失わずに運ぶ（自動プレイは Rare の町で売れない復刻品を作らないので、運ぶ骨董はいつも 0）。Epic の他社は ×${EPIC_RIVAL.base}（町の倍率：${Object.entries(EPIC_RIVAL.town).map(([k, v]) => `${sectorDef(k).name} ×${v}`).join('・')}。ランクの倍率 ×${TIERS.E.rival} に掛ける）。骨董は復刻品の値段 ×${ANTIQUE.price}・需要 ×${ANTIQUE.demand}。「v22」は段 H1 の前の main の同じ 3 シード（\`V22_TIER\`。通常の R は Rare の 1 町目＝グリーン・マウス。v23 の通常は Rare を 2 町回る）。「骨董の割合」「Epic の復刻品の割合」は Epic の町の売上に占める割合。ブランド力の上限は ${(['C', 'U', 'R', 'E'] as Tier[]).map((x) => `${x} ${BRAND_CAP[x]}`).join('・')}。最短は C＋U で止める。`,
    );
    out.push('');
    out.push('| 方針 | 合計 | うち C（v22） | うち U（v22） | うち R（v22） | うち Rare 1 町目（v22） | うち E | Epic 1 町の平均 | Rare 1 町の平均 | Epic の制覇までの月数 | 3 回目の徴収額 | 支度金 | 被災した町（C・U・R） | 任せた町（うち R） | Epic の研究待ち | 巻き返し（Epic） | Epic の町の売上（1 町） | 骨董の割合 | Epic の復刻品の割合 | 終わりの格 E | 詰まって止まるシード |');
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const p of pols) {
      const runs = rep.runs.filter((r) => r.policy === p);
      if (!runs.length) continue;
      const B = V22_TIER[p];
      const byTier = (tier: Tier) => mean(runs.map((x) => x.sectors.filter((r) => r.tier === tier && !r.revisit).reduce((a, r) => a + (secOf(p, r, 'left') ?? 0), 0) + (tier === 'C' ? SIM_TIME[p].tutorial : 0)));
      const pc = (a: number, b: number) => (b > 0 ? `（${fmtH(b)}・${a >= b ? '+' : '−'}${((Math.abs(a - b) / b) * 100).toFixed(1)}%）` : '');
      const r1 = mean(runs.map((x) => secOf(p, x.sectors.find((r) => r.id === 'r1' && !r.revisit) ?? ({} as SectorRun), 'left') ?? 0));
      const es = runs.flatMap((x) => x.sectors.filter((r) => r.tier === 'E' && !r.revisit));
      const rs = runs.flatMap((x) => x.sectors.filter((r) => r.tier === 'R' && !r.revisit));
      const v = (f: (x: RunResult['v23']) => number) => runs.map((r) => f(r.v23));
      const mr = (f: (x: RunResult['v23']) => number, d = 1, fm: (n: number) => string = (n) => n.toFixed(d)) => `${fm(mean(v(f)))}（${range(v(f), d ? (n) => String(Math.round(n)) : fm)}）`;
      const eMonths = es.filter((r) => r.months != null).map((r) => r.months!);
      const eRev = es.reduce((a, r) => a + r.allRev, 0);
      const ant = es.reduce((a, r) => a + (r.antRev ?? 0), 0);
      const er = es.reduce((a, r) => a + (r.relicERev ?? 0), 0);
      const pct = (x: number) => (eRev > 0 ? `${((x / eRev) * 100).toFixed(1)}%` : '—');
      const ge = runs.map((r) => r.v22.gradeEnd.E).filter((x): x is number => x != null);
      const be = runs.map((r) => r.v22.brandEnd.E).filter((x): x is number => x != null);
      if (!es.length) {
        out.push(`| ${POLICY_NAME[p]} | ${fmtH(mean(runs.map(totalSec)))} | ${fmtH(byTier('C'))}${pc(byTier('C'), B.C)} | ${fmtH(byTier('U'))}${pc(byTier('U'), B.U)} | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | ${runs.filter((r) => !r.done).length} |`);
        continue;
      }
      out.push(
        `| ${POLICY_NAME[p]} | ${fmtH(mean(runs.map(totalSec)))} | ${fmtH(byTier('C'))}${pc(byTier('C'), B.C)} | ${fmtH(byTier('U'))}${pc(byTier('U'), B.U)} | ${fmtH(byTier('R'))}${pc(byTier('R'), B.R)} | ${fmtMin(r1)}（${fmtMin(B.R1)}・${r1 >= B.R1 ? '+' : '−'}${((Math.abs(r1 - B.R1) / B.R1) * 100).toFixed(1)}%） | ${fmtH(byTier('E'))} | ${fmtMin(mean(es.map((r) => secOf(p, r, 'left') ?? 0)))} | ${fmtMin(mean(rs.map((r) => secOf(p, r, 'left') ?? 0)))} | ${eMonths.length ? `${mean(eMonths).toFixed(1)}（${range(eMonths)}）` : '制覇できない'}${eMonths.length < es.length ? `（制覇 ${eMonths.length}/${es.length}）` : ''} | ${mr((x) => x.levy, 0, fmtG)} | ${mr((x) => x.grant, 0, fmtG)} | ${mr((x) => x.hitC)}・${mr((x) => x.hitU)}・${mr((x) => x.hitR)} | ${mr((x) => x.delegated)}（${mr((x) => x.delegatedR)}） | ${mr((x) => x.resWaitE)} | ${mr((x) => x.comebackE)} | ${fmtG(eRev / es.length)} | ${pct(ant)} | ${pct(er)} | ${ge.length ? `${GRADE_NAME()[Math.round(mean(ge))]}（★ ${Math.round(mean(be))}）` : '—'} | ${runs.filter((r) => !r.done).length} |`,
      );
    }
    out.push('');
  }
  // v22（段 G）：カスタマーサポートとマーケ
  {
    out.push('### 表 16：カスタマーサポートとマーケ（v22。段 G）');
    out.push('');
    out.push(
      `3 シードの平均（最小〜最大）。問い合わせは Uncommon 以上の町だけ、先月の主力商品の品切れの日 ${CS.outPer} 日ごとに 1 件（${CS.outMax} 件まで）・閉まっていた日 ${CS.closedPer} 日ごとに 1 件（${CS.closedMax} 件まで）・値段が相場より ${Math.round(CS.priceAt * 100)}% 以上高いと 1 件。合う返事 +${CS.good}・合わない返事 +${CS.ok}・期限切れ ${CS.ignore}（期限 ${CS.expire} 日）。満足度（はじめ ${CS.start}）は来店に 100 で +${Math.round(CS.up * 100)}%・0 で −${Math.round(CS.down * 100)}%。炎上は品切れ ${FLAME.outDays} 日以上・期限切れ ${FLAME.ignored} 件以上の月が手を打たずに 2 か月続くと起き、来店 −${Math.round(FLAME.hit * 100)}%（${FLAME.months} か月で戻る）・ブランド力 −${FLAME.brand}。企業の格のしきい値（ブランド力）は ${GRADE.at.join('・')}。方針（\`SIM_CS\`）：最短＝放っておく／通常＝合う返事・お詫びの告知・サポートセンター Lv3 でリーダー（問い合わせの返事）に任せる／100%＝それに加えて広報・火消し・市場の見通しの打ち時に宣伝。「v21 の合計」は段 G の前の main の同じ 3 シードの平均（\`V21_TOTAL\`）、「段 G なし」は同じ方針・シードを \`withoutCs\` で回した合計。満足度は Uncommon 以上の町の月の締めの平均。格は、そのランクの最後の月の締めのブランド力と格。`,
    );
    out.push('');
    out.push('| 方針 | 合計 | v21 の合計 | 差 | 段 G なし | 問い合わせ | 返事（手・リーダー） | センターが受けた | 期限切れ | 合う返事 | 満足度の平均 | 炎上のおそれ | 炎上 | 炎上中の月 | 広報（回・★） | 市場調査の宣伝 | 終わりの格 C | U | R | E | 詰まって止まるシード（本番／段 G なし） |');
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const p of pols) {
      const runs = rep.runs.filter((r) => r.policy === p);
      if (!runs.length) continue;
      const tot = mean(runs.map(totalSec));
      const base = V21_TOTAL[p];
      const off = (rep.noCs ?? []).filter((r) => r.policy === p);
      const d = (a: number, b: number) => `${a >= b ? '+' : '−'}${Math.round(Math.abs(a - b) / 60)} 分（${a >= b ? '+' : '−'}${((Math.abs(a - b) / b) * 100).toFixed(1)}%）`;
      const v = (f: (x: RunResult['v22']) => number) => runs.map((r) => f(r.v22));
      const mr = (f: (x: RunResult['v22']) => number) => `${mean(v(f)).toFixed(1)}（${range(v(f), (x) => x.toFixed(0))}）`;
      const sat = runs.map((r) => (r.v22.sat.length ? mean(r.v22.sat) : NaN)).filter((x) => !Number.isNaN(x));
      const grade = (tier: Tier) => {
        const xs = runs.map((r) => r.v22.gradeEnd[tier]).filter((x): x is number => x != null);
        const bs = runs.map((r) => r.v22.brandEnd[tier]).filter((x): x is number => x != null);
        return xs.length ? `${GRADE_NAME()[Math.round(mean(xs))]}（★ ${Math.round(mean(bs))}）` : '—';
      };
      out.push(
        `| ${POLICY_NAME[p]} | ${fmtH(tot)} | ${fmtH(base)} | ${d(tot, base)} | ${off.length ? `${fmtH(mean(off.map(totalSec)))}（${d(tot, mean(off.map(totalSec)))}）` : '—'} | ${mr((x) => x.got)} | ${mr((x) => x.answered)} | ${mr((x) => x.auto)} | ${mr((x) => x.expired)} | ${mr((x) => x.good)} | ${sat.length ? mean(sat).toFixed(0) : '—'} | ${mr((x) => x.warns)} | ${mr((x) => x.flames)} | ${mr((x) => x.flameMonths)} | ${mean(v((x) => x.pr)).toFixed(1)}・★ ${mean(v((x) => x.prBrand)).toFixed(0)} | ${mean(v((x) => x.ads)).toFixed(1)} | ${grade('C')} | ${grade('U')} | ${grade('R')} | ${grade('E')} | ${runs.filter((r) => !r.done).length}／${off.length ? off.filter((r) => !r.done).length : '—'} |`,
      );
    }
    out.push('');
  }
  // v21（調整 1）：士気の高い帯の効き目と、士気と給与の手を止めた 100%
  {
    out.push('### 表 15：士気の高い帯と売上の伸び（v21。調整 1）');
    out.push('');
    out.push(
      `3 シードの平均（最小〜最大）。士気の効き目（\`MORALE.band\`）：${MORALE.band.lo}〜${MORALE.band.hi} は ×1、100 で ×${MORALE.band.top}、${MORALE.band.floor} 未満で ×${MORALE.band.low}。「v20 の合計」は調整 1 の前の main の同じ 3 シードの平均（\`V20_TOTAL\`）。「手なし」は同じ 100% を、士気と給与の手（\`SIM_HR\`：休ませる・昇給・賞与）を止めて回した合計（\`withoutHrHands\`。辞めたいの面談だけ）。売上・給与は Uncommon 以上の町の月の締めの、1 か月あたりの平均。士気の平均と「士気 70 以上」は Uncommon 以上の町の月の締めの全員。`,
    );
    out.push('');
    out.push('| 方針 | 合計 | v20 の合計 | 差 | 士気の平均（U 以上） | 士気 70 以上の人 | 手なしの合計 | 手あり − 手なし | 月の売上（手あり／手なし） | 月の給与（手あり／手なし） | 売上の増え − 給与の増え（1 か月） | 詰まって止まるシード（あり／手なし） |');
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const p of pols) {
      const runs = rep.runs.filter((r) => r.policy === p);
      if (!runs.length) continue;
      const tot = mean(runs.map(totalSec));
      const base = V20_TOTAL[p];
      const off = p === 'full' ? (rep.noHrHands ?? []) : [];
      const d = (a: number, b: number) => `${a >= b ? '+' : '−'}${Math.round(Math.abs(a - b) / 60)} 分（${a >= b ? '+' : '−'}${((Math.abs(a - b) / b) * 100).toFixed(1)}%）`;
      const perM = (rs: RunResult[], f: (x: RunResult['v21']) => number) => mean(rs.map((r) => f(r.v21) / Math.max(1, r.v21.months)));
      const mor = runs.map((r) => mean(r.v21.morale));
      const hi = runs.map((r) => mean(r.v21.high) * 100);
      const rev = perM(runs, (x) => x.rev);
      const wag = perM(runs, (x) => x.wages);
      const rev0 = off.length ? perM(off, (x) => x.rev) : NaN;
      const wag0 = off.length ? perM(off, (x) => x.wages) : NaN;
      out.push(
        `| ${POLICY_NAME[p]} | ${fmtH(tot)} | ${fmtH(base)} | ${d(tot, base)} | ${mean(mor).toFixed(0)}（${range(mor, (v) => v.toFixed(0))}） | ${mean(hi).toFixed(0)}% | ${off.length ? fmtH(mean(off.map(totalSec))) : '—'} | ${off.length ? `${tot >= mean(off.map(totalSec)) ? '+' : '−'}${Math.round(Math.abs(tot - mean(off.map(totalSec))) / 60)} 分` : '—'} | ${off.length ? `${fmtG(rev)}／${fmtG(rev0)}（${rev >= rev0 ? '+' : '−'}${fmtG(Math.abs(rev - rev0))}）` : fmtG(rev)} | ${off.length ? `${fmtG(wag)}／${fmtG(wag0)}（${wag >= wag0 ? '+' : '−'}${fmtG(Math.abs(wag - wag0))}）` : fmtG(wag)} | ${off.length ? `${rev - rev0 - (wag - wag0) >= 0 ? '+' : '−'}${fmtG(Math.abs(rev - rev0 - (wag - wag0)))}` : '—'} | ${runs.filter((r) => !r.done).length}／${off.length ? off.filter((r) => !r.done).length : '—'} |`,
      );
    }
    out.push('');
  }
  // v20：経理と総務（段 F）
  {
    out.push('### 表 14：経理と総務（v20。段 F）');
    out.push('');
    out.push(
      `3 シードの平均（最小〜最大）。税は会社の四半期（90 日）ごと、税率は会社の格（\`TAX.rate\`：U ${Math.round(TAX.rate.U * 100)}%・R ${Math.round(TAX.rate.R * 100)}%・E ${Math.round(TAX.rate.E * 100)}%）、Common の町の利益にはかけない。Uncommon からの町は単価が高い（\`TAX.price\`：U ×${TAX.price.U}・R ×${TAX.price.R}。自社も他社も）。節税は設備投資 ${Math.round(TAX.ded.capex * 100)}%・研究開発 ${Math.round(TAX.ded.rnd * 100)}%・総務の環境 ${Math.round(TAX.ded.env * 100)}% を差し引く（上限は利益の ${Math.round(TAX.cap * 100)}%）。疲れ（1 − スタミナ ÷ HP）は Uncommon から、${Math.round(FATIGUE.from * 100)}% を超えると働きの速さ（${Math.round(FATIGUE.to * 100)}% で −${Math.round(FATIGUE.work * 100)}%）と士気の目標（−${FATIGUE.morale}）が下がる。方針（\`SIM_TAX\`）：通常＝決算の前の月末に研究への寄付 → 見込みのある設備投資を、上限まで前倒し（手元の資金の ${Math.round((SIM_TAX.normal?.share ?? 0) * 100)}% まで）／100%＝それに加えて総務のパネル → 安い順のパネル・設備でも埋める（${Math.round((SIM_TAX.full?.share ?? 0) * 100)}% まで）、くたくたの手前の人を月末に休ませる／最短＝節税を気にしない。「v19 の合計」は段 F の前の main の同じ 3 シード（\`V19_TOTAL\`）、「段 F なし」は同じ方針・シードを \`withoutAcct\` で回した合計、「節税なし」は通常を \`withoutTaxSaving\` で回した合計。疲れ・士気・遅くなった割合は、Uncommon 以上の町の毎日の持ち場の人の平均。`,
    );
    out.push('');
    out.push('| 方針 | 合計 | v19 の合計 | 差 | 段 F なし | 節税なし（通常） | 払った税 | 節税で減らした税 | 税のかかった四半期 | 決算の前の節税の投資（回・G） | 疲れの平均 | 士気の平均 | 疲れで遅くなった割合 | 詰まって止まるシード |');
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const p of pols) {
      const runs = rep.runs.filter((r) => r.policy === p);
      if (!runs.length) continue;
      const tot = mean(runs.map(totalSec));
      const base = V19_TOTAL[p];
      const off = (rep.noAcct ?? []).filter((r) => r.policy === p);
      const ns = p === 'normal' ? (rep.noSave ?? []) : [];
      const d = (a: number, b: number) => `${a >= b ? '+' : '−'}${Math.round(Math.abs(a - b) / 60)} 分（${a >= b ? '+' : '−'}${((Math.abs(a - b) / b) * 100).toFixed(1)}%）`;
      const vv = (f: (x: RunResult['v20']) => number) => runs.map((r) => f(r.v20));
      const g = (f: (x: RunResult['v20']) => number) => `${fmtG(mean(vv(f)))}（${range(vv(f), fmtG)}）`;
      out.push(
        `| ${POLICY_NAME[p]} | ${fmtH(tot)} | ${fmtH(base)} | ${d(tot, base)} | ${off.length ? `${fmtH(mean(off.map(totalSec)))}（${d(tot, mean(off.map(totalSec)))}）` : '—'} | ${ns.length ? `${fmtH(mean(ns.map(totalSec)))}（節税で ${d(tot, mean(ns.map(totalSec)))}）` : '—'} | ${g((x) => x.paid)} | ${g((x) => x.saved)} | ${mean(vv((x) => x.quarters)).toFixed(1)} | ${mean(vv((x) => x.preInv)).toFixed(1)}・${fmtG(mean(vv((x) => x.preG)))} | ${(mean(runs.map((r) => mean(r.v20.fatigue))) * 100).toFixed(0)}% | ${mean(runs.map((r) => mean(r.v20.morale))).toFixed(0)} | ${(mean(runs.map((r) => mean(r.v20.slow))) * 100).toFixed(2)}% | ${runs.filter((r) => !r.done).length}${off.length ? `／段 F なし ${off.filter((r) => !r.done).length}` : ''} |`,
      );
    }
    out.push('');
  }
  // v19：カリスマ度・士気・給与（段 E2）
  {
    out.push('### 表 13：カリスマ度・士気・給与（v19。段 E2）');
    out.push('');
    out.push(
      `3 シードの平均（最小〜最大）。カリスマ度は記録から数え直す（\`CHARISMA\`：制覇 C +${CHARISMA.clear.C}・U +${CHARISMA.clear.U}・R +${CHARISMA.clear.R}／発表 +${CHARISMA.present.C}〜${CHARISMA.present.R}／ブランド力 ${CHARISMA.brand.per} ごとに +1（+${CHARISMA.brand.max} まで）／採用ブランド +${CHARISMA.panel}）。雇えるのは U ${CHARISMA.cap.U}・R ${CHARISMA.cap.R}・E ${CHARISMA.cap.E}・L ${CHARISMA.cap.L} から。士気と給与の手は \`SIM_HR\`（通常：士気 ${SIM_HR.normal.rest} 未満で疲れた持ち場の人を休ませる・月末に相場より 1 段以上下で士気 ${SIM_HR.normal.raiseBelow} 未満の人を昇給・辞めたいが出たら面談＋昇給＋賞与／100%：休ませる目安 ${SIM_HR.full.rest}・昇給の目安 ${SIM_HR.full.raiseBelow}・士気のいちばん低い人に賞与／最短：面談だけ）。「v18 の合計」は段 E2 の前の main の同じ 3 シード（\`V18_TOTAL\`）。給与の伸びは、月の締めの給与の合計 ÷ 給与の段が 0 のときの合計。`,
    );
    out.push('');
    out.push('| 方針 | 合計 | v18 の合計 | 差 | C の終わりのカリスマ度 | U の終わり | R の終わり | 最後 | 雇ったレアリティ（もとの） | 士気の平均（いちばん低い月） | 辞めたい／思いとどまった／辞めた | 給与の伸び | 昇給・賞与・休ませる・面談（回） | 詰まって止まるシード |');
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const p of pols) {
      const runs = rep.runs.filter((r) => r.policy === p);
      if (!runs.length) continue;
      const tot = mean(runs.map(totalSec));
      const base = V18_TOTAL[p];
      const chT = (tier: Tier) => {
        const xs = runs.map((r) => r.v19.chEnd[tier]).filter((x): x is number => x != null);
        return xs.length ? `${mean(xs).toFixed(1)}（${range(xs)}）` : '—';
      };
      const hired: Record<string, number> = {};
      for (const r of runs) for (const [k, n] of Object.entries(r.v19.hired)) hired[k] = (hired[k] ?? 0) + n / runs.length;
      const hiredTxt = ['N', 'C', 'U', 'R', 'E', 'L'].filter((k) => hired[k]).map((k) => `${k} ${hired[k].toFixed(1)}`).join('・') || '—';
      const mor = runs.map((r) => mean(r.v19.morale));
      const morMin = runs.map((r) => (r.v19.morale.length ? Math.min(...r.v19.morale) : 0));
      const pay = runs.map((r) => (r.v19.pay0 ? r.v19.pay / r.v19.pay0 - 1 : 0));
      const act = (k: string) => mean(runs.map((r) => r.actions[k] ?? 0)).toFixed(1);
      const m = (f: (x: RunResult['v19']) => number) => mean(runs.map((r) => f(r.v19))).toFixed(1);
      out.push(
        `| ${POLICY_NAME[p]} | ${fmtH(tot)} | ${fmtH(base)} | ${tot >= base ? '+' : '−'}${Math.round(Math.abs(tot - base) / 60)} 分（${tot >= base ? '+' : '−'}${((Math.abs(tot - base) / base) * 100).toFixed(1)}%） | ${chT('C')} | ${chT('U')} | ${chT('R')} | ${m((x) => x.ch)} | ${hiredTxt} | ${mean(mor).toFixed(0)}（${Math.min(...morMin)}） | ${m((x) => x.want)}／${m((x) => x.stay)}／${m((x) => x.quit)} | +${(mean(pay) * 100).toFixed(1)}% | ${act('raise')}・${act('bonus')}・${act('rest')}・${act('talk')} | ${runs.filter((r) => !r.done).length} |`,
      );
    }
    out.push('');
  }
  // v18：任せ方の 4 段（段 D）
  {
    out.push('### 表 12：任せ方の 4 段（v18。段 D）');
    out.push('');
    out.push(`3 シードの平均（最小〜最大）。任せるのは通常の方針だけ（\`SIM_DELEG\`：理解度 ${DELEG.leaderAt} に届いた部門に順にチームリーダー（物流＝品出し・人事＝休ませる・R&D＝荒れ地の採掘・マーケ＝宣伝の出し直し・営業＝空き店舗）・${DELEG.headAt} で事業部長（その部門のリーダーを昇進）・部長の提案は見込みがプラスなら承認）。最短・100% は手で（いまどおり）。「任せない」は同じシードの通常を任せずに回した合計（\`withoutDeleg\`）。任せた業務の手（品出し・発注・配置など）は行動に数えない（そのぶん実時間が短い）。`);
    out.push('');
    out.push('| 方針 | 合計（任せる） | 任せない | 短くなったぶん | うち C（任せる／任せない） | うち U | うち R | 任せた業務の数（最多） | 事業部長の数（最多） | 届いた提案 | 承認した提案 | セクター長が自分で承認（件） | リーダー・部長の手の数 | 最初のリーダー・部長（日） | 行動の数（任せる／任せない） | 詰まって止まるシード（任せる／任せない） |');
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const p of pols) {
      const runs = rep.runs.filter((r) => r.policy === p);
      const off = p === 'normal' ? (rep.noDeleg ?? []) : [];
      if (!runs.length) continue;
      const tot = mean(runs.map(totalSec));
      const tot0 = off.length ? mean(off.map(totalSec)) : NaN;
      const byTier = (rs: RunResult[], tier: Tier) => (rs.length ? mean(rs.map((x) => x.sectors.filter((r) => r.tier === tier && !r.revisit).reduce((a, r) => a + (secOf(p, r, 'left') ?? 0), 0) + (tier === 'C' ? SIM_TIME[p].tutorial : 0))) : NaN);
      const cell = (tier: Tier) => (off.length ? `${fmtH(byTier(runs, tier))}／${fmtH(byTier(off, tier))}` : fmtH(byTier(runs, tier)));
      const v = (f: (x: RunResult['v18']) => number) => runs.map((r) => f(r.v18));
      const mr = (f: (x: RunResult['v18']) => number) => `${mean(v(f)).toFixed(1)}（${range(v(f))}）`;
      const acts = (rs: RunResult[]) => mean(rs.map((r) => Object.values(r.actions).reduce((a, b) => a + b, 0)));
      const first = (f: (x: RunResult['v18']) => number | null) => {
        const xs = runs.map((r) => f(r.v18)).filter((x): x is number => x != null);
        return xs.length ? `${Math.round(mean(xs))}` : '—';
      };
      out.push(
        `| ${POLICY_NAME[p]} | ${fmtH(tot)} | ${off.length ? fmtH(tot0) : '—'} | ${off.length ? `${Math.round((tot0 - tot) / 60)} 分（${(((tot0 - tot) / tot0) * 100).toFixed(1)}%）` : '—'} | ${cell('C')} | ${cell('U')} | ${cell('R')} | ${mr((x) => x.duties)} | ${mr((x) => x.heads)} | ${mr((x) => x.props)} | ${mr((x) => x.approved)} | ${mr((x) => x.sectorOk)} | ${mr((x) => x.acts)} | ${first((x) => x.firstLead)}・${first((x) => x.firstHead)} | ${Math.round(acts(runs))}／${off.length ? Math.round(acts(off)) : '—'} | ${runs.filter((r) => !r.done).length}／${off.length ? off.filter((r) => !r.done).length : '—'} |`,
      );
    }
    out.push('');
  }
  // v16c：Rare の町 ②（商圏の取り合い・撤退と空き店舗）
  out.push('### 表 11：Rare の町 ②：商圏の取り合い（v16c。段 C：営業の始まり）');
  out.push('');
  out.push(`3 シードの平均（最小〜最大）。Rare の町の数字は制覇した月の締めの時点（\`RARE_AREA\`：距離の重み ${RARE_AREA.d0}・他社 1 社 ${RARE_AREA.stores} 軒・他社の店の引き ×${RARE_AREA.pull}・支店 ×${RARE_AREA.branch}・撤退は取り分が開店のときの ${Math.round(RARE_AREA.quitAt * 100)}% 未満が ${RARE_AREA.quitMonths} か月・空き店舗は撤退の ${RARE_AREA.refill} か月後の締めから毎月 ${Math.round(RARE_AREA.refillChance * 100)}%・${RARE_AREA.refillMax} か月までに必ず他社が入る（営業している他社がいなければ、町から撤退した会社が戻る。調整 1））。自動プレイの営業の手は \`SIM_AREA\`（空き店舗に入る → 候補地の 1 位に月 1 軒・${SIM_AREA.maxShops} 軒まで → チラシ → 営業のパネル）。「ランクの順」は Uncommon 1 町の平均 < Rare 1 町の平均（調整 1 の目標は、通常で Rare が 1 割以上長い）。「他社の店の数の推移」は 1 つ目の Rare の町（グリーン・マウス）の月の締めごとの他社の店の数（3 シードの平均。左端は町を作ったときの軒数）。`);
  out.push('');
  out.push('| 方針 | Uncommon 1 町の平均 | Rare 1 町の平均 | R ÷ U | Rare の制覇までの月数 | 自社の店の数 | 撤退させた他社の店 | 空き店舗に入った | 他社が空き店舗に入った | 町に戻った他社 | 他社が 0 社の月 | 他社の店の数の推移（グリーン・マウス） | 自社の取り分 | ランクの順（U < R） | 詰まって止まるシード |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    const us = runs.flatMap((x) => x.sectors.filter((r) => r.tier === 'U' && !r.revisit));
    const rs = runs.flatMap((x) => x.sectors.filter((r) => r.tier === 'R' && !r.revisit));
    const stuck = runs.filter((x) => !x.done).length;
    if (!rs.length) {
      out.push(`| ${POLICY_NAME[p]} | ${us.length ? fmtMin(mean(us.map((r) => secOf(p, r, 'left') ?? 0))) : '—'} | —（C＋U で止める） | — | — | — | — | — | — | — | — | — | — | — | ${stuck} |`);
      continue;
    }
    const uMin = mean(us.map((r) => secOf(p, r, 'left') ?? 0));
    const rSec = rs.map((r) => secOf(p, r, 'left') ?? 0);
    const rMonths = rs.filter((r) => r.months != null).map((r) => r.months!);
    const a = (f: (x: NonNullable<SectorRun['area']>) => number, d = 1) => {
      const v = rs.map((r) => (r.area ? f(r.area) : 0));
      return `${mean(v).toFixed(d)}（${range(v)}）`;
    };
    const share = rs.map((r) => (r.area?.share ?? 0) * 100);
    // 1 つ目の Rare の町の他社の店の数（月の締めごと。シードの平均。終わったシードは数えない）
    const r1s = runs.map((x) => x.sectors.find((r) => r.tier === 'R' && !r.revisit)?.area?.rivals ?? []);
    const len = Math.max(0, ...r1s.map((v) => v.length));
    const trend = Array.from({ length: len }, (_, k) => {
      const v = r1s.filter((x) => x.length > k).map((x) => x[k]);
      return Math.round(mean(v));
    });
    out.push(
      `| ${POLICY_NAME[p]} | ${fmtMin(uMin)} | ${fmtMin(mean(rSec))}（${range(rSec.map((x) => x / 60), (v) => String(Math.round(v)))} 分） | ×${(mean(rSec) / uMin).toFixed(2)} | ${rMonths.length ? `${mean(rMonths).toFixed(1)}（${range(rMonths)}）` : '—'} | ${a((x) => x.shops)} | ${a((x) => x.closed)} | ${a((x) => x.took)} | ${a((x) => x.refill ?? 0)} | ${a((x) => x.back ?? 0)} | ${a((x) => x.zero ?? 0)} | ${trend.length ? `${runs.find((x) => x.sectors.find((r) => r.tier === 'R')?.area)?.sectors.find((r) => r.tier === 'R')?.area?.n0 ?? '?'} → ${trend.join(' → ')}` : '—'} | ${mean(share).toFixed(1)}%（${range(share, (v) => v.toFixed(1))}%） | ${uMin < mean(rSec) ? '○' : '×'}（U ${fmtMin(uMin)} ${uMin < mean(rSec) ? '<' : '≧'} R ${fmtMin(mean(rSec))}） | ${stuck} |`,
    );
  }
  out.push('');
  // v10c：復刻品（研究 Lv3 で開く新商品）の売上の割合
  out.push('### 表 3：復刻品（v10c。研究 Lv3 で開く新商品）');
  out.push('');
  out.push('開いたレシピの数（最後）と、売上の合計（着いてから離れるまで）のうち復刻品の割合。最短は復刻品を並べない（いままでどおり）。');
  out.push('');
  out.push('| 方針 | 開いたレシピ | 復刻品の売上（合計） | 売上の合計 | 復刻品の割合 | うち Common | うち Uncommon | うち Rare（v16） | Rare の町の売上のうち Rare の復刻品（v16b） |');
  out.push('|---|---|---|---|---|---|---|---|---|');
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    const sum = (f: (r: SectorRun) => number, tier?: Tier) => mean(runs.map((x) => x.sectors.filter((r) => !tier || r.tier === tier).reduce((a, r) => a + f(r), 0)));
    const pct = (tier?: Tier) => {
      const all = sum((r) => r.allRev, tier);
      return all > 0 ? `${((sum((r) => r.relicRev, tier) / all) * 100).toFixed(1)}%` : '—';
    };
    const allR = sum((r) => r.allRev, 'R');
    const pctRR = allR > 0 ? `${((sum((r) => r.relicRRev, 'R') / allR) * 100).toFixed(1)}%` : '—';
    out.push(`| ${POLICY_NAME[p]} | ${mean(runs.map((x) => x.recipes)).toFixed(1)}（${range(runs.map((x) => x.recipes))}） | ${fmtG(sum((r) => r.relicRev))} | ${fmtG(sum((r) => r.allRev))} | ${pct()} | ${pct('C')} | ${pct('U')} | ${pct('R')} | ${pctRR} |`);
  }
  out.push('');
  // v12：復興・ダンジョン・遺物の展示館
  out.push('### 表 4：復興・ダンジョン・遺物の展示館（v12。発掘 v2 の 4 段目）');
  out.push('');
  out.push('最後の時点（3 シードの平均。最小〜最大）。復興は回ったセクタの合計（4 か所目はダンジョン）。見つけた上のランクの遺物は研究ノートの種類（掘った数）。Uncommon は Uncommon のセクタの荒れ地の出土品も入る（Rare・Epic・Legendary はダンジョンの奥だけ）。展示館の収入は入館料の合計。');
  out.push('');
  out.push('| 方針 | 復興した荒れ地 | ダンジョン | 潜った回数 | 最深 | Uncommon | Rare | Epic | Legendary | 展示館 | 展示館の収入（合計） | 節目 |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    const v = (f: (x: RunResult['v12']) => number) => runs.map((r) => f(r.v12));
    const mr = (f: (x: RunResult['v12']) => number, d = 1) => `${mean(v(f)).toFixed(d)}（${range(v(f))}）`;
    const rk = (k: 'U' | 'R' | 'E' | 'L') => `${mean(v((x) => x.found[k])).toFixed(1)} 種（${mean(v((x) => x.got[k])).toFixed(1)} 個）`;
    out.push(`| ${POLICY_NAME[p]} | ${mr((x) => x.revived)} | ${mr((x) => x.dungeons)} | ${mr((x) => x.dives)} | ${mr((x) => x.best)} | ${rk('U')} | ${rk('R')} | ${rk('E')} | ${rk('L')} | ${runs.filter((r) => r.v12.museum).length}/${runs.length} | ${fmtG(mean(v((x) => x.income)))}（${range(v((x) => x.income), fmtG)}） | ${mr((x) => x.marks)} |`);
  }
  out.push('');
  out.push('実時間の単価（`SIM_TIME`）：');
  out.push('');
  out.push('| 方針 | ひと月 | 行動 1 回 | 月末ポーズ | チュートリアル | 会話 1 回（v8） | 発掘作業 1 回（v9） | 発掘画面を開く・閉じる（v13） |');
  out.push('|---|---|---|---|---|---|---|---|');
  for (const p of pols) out.push(`| ${POLICY_NAME[p]} | ${SIM_TIME[p].month} 秒 | ${SIM_TIME[p].action} 秒 | ${SIM_TIME[p].pause} 秒 | ${SIM_TIME[p].tutorial / 60} 分 | ${SIM_TIME[p].talk} 秒 | ${DIG_BALANCE.sessionSec} 秒〜（ゲームの ${runDays(p).toFixed(1)} 日） | ${SIM_TIME[p].digOpen} 秒 |`);
  out.push('');
  out.push('発掘作業（15 秒〜。追加申請で延びる）とダンジョンに潜るあいだも時間は流れるので、作業の秒数はひと月の時間に重なる（実時間に入っている。荒れ地を押して始める 1 回を行動 1 回に数える）。v13 から、時間の止まる「開く・閉じる」（終わりの札を読んで閉じるまで）を 1 回ごとに足す。会話は発掘との出会いと研究成果の発表。');
  out.push('');
  out.push(`発掘作業の仮定（\`SIM_DIG\`。1 回 ${DIG_BALANCE.sessionSec} 秒 × 1 秒に ${DIG_BALANCE.simTapsPerSec} 打 ＝ ${runTaps()} 打を、作業の日数に均して打つ）：`);
  out.push('');
  out.push('| 方針 | ひと月の作業 | 打つマス | 発掘許可 | 発掘隊 | 発掘の枝（v10） |');
  out.push('|---|---|---|---|---|---|');
  const per = (p: PolicyId) => (SIM_DIG[p].perMonth == null ? `前の作業が終わったらすぐ次（続けて掘る。ひと月に ${(30 / runDays(p)).toFixed(1)} 回まで）` : `${SIM_DIG[p].perMonth} 回（月の前半と後半）。v13：発表がまだのセクタは ${SIM_DIG[p].perMonth + SIM_DIG[p].pending} 回、1 位を 2 か月続けて発表を待っているあいだは続けて掘る`);
  const tgt = (p: PolicyId) => (SIM_DIG[p].target === 'know' ? '配置を知っている：まだのお題のある荒れ地 → お題（無ければ石板・エクステ）の範囲を、取るまでの打つ回数が少ないものから手前の層へ' : 'v11：覗き見が出ているマス（お題 → 石板 → エクステ → 素材）→ 取りかけ・打ちかけ → 浅いマス（いまの荒れ地を掘りきるまで）→ お題の気配のある荒れ地');
  const pm = (p: PolicyId) => (p === 'rta' ? `まだのお題のある荒れ地だけ（申請料の ${SIM_DIG[p].permit} 倍＋5,000 G あれば。v13：作業のあいまにも。お金は投資の順番より先に残す）` : p === 'normal' ? `掘れる荒れ地が無くなったら次の 1 か所（申請料の ${SIM_DIG[p].permit} 倍＋5,000 G あれば）。v13：発表がまだで、許可のある荒れ地にお題が残っていなければ、お題のある荒れ地を先に` : `資金が申請料の ${SIM_DIG[p].permit} 倍＋5,000 G あれば、月末にあるだけ`);
  const dg = (p: PolicyId) => (SIM_DIG[p].digger === 0 ? '手際は研究パネルの順のまま' : '発掘隊の手際（役所 → 手際）を RP がたまりしだい先に（v44。v41 までは担当のヒーローを 1 人）');
  const tl = (p: PolicyId) => (SIM_DIG[p].tree === 'deep' ? 'お題が許可の無い層に残っていれば、深い層の許可 Lv1（根もとの追加申請・ランタンから）だけ' : SIM_DIG[p].tree === 'share' ? `月末に、月の売上の ${Math.round(SIM_DIG[p].share * 100)}% を積み立てた枠で（買ったあとも 1 万 G 残るとき）研究の目利き Lv2 → 安い順に（掘れずに止まっている・お題が許可の無い層にあれば、枠に関係なく深い層の許可を先に）` : 'ほかのスキルと同じく安い順にまとめて全部 Lv5 まで（掘れずに止まっていれば、資金をためている月も深い層の許可を先に）');
  for (const p of pols) out.push(`| ${POLICY_NAME[p]} | ${per(p)} | ${tgt(p)} | ${pm(p)} | ${dg(p)} | ${tl(p)} |`);
  return out.join('\n');
}

/** 詰まりの観察（数字だけ。文章は docs に手で書く） */
export function observations(rep: Report2): string {
  const out: string[] = [];
  out.push('### 計測の生データ（観察のもと）');
  out.push('');
  out.push('ボトルネック（制覇するまでの月の締め）の分布：ゲームの表示（`bottleneck()`）/ 人の読み（`readBn`：調達と製造の棒が同じ長さなら製造）');
  out.push('');
  out.push('| 方針 | ランク | 月数 | 調達 | 製造 | 運搬 | 販売 |');
  out.push('|---|---|---|---|---|---|---|');
  for (const p of ['rta', 'normal', 'full'] as PolicyId[]) {
    for (const tier of ['C', 'U', 'R'] as Tier[]) {
      const cnt: Record<string, [number, number]> = { buy: [0, 0], craft: [0, 0], haul: [0, 0], sell: [0, 0] };
      let n = 0;
      for (const r of rep.runs.filter((x) => x.policy === p))
        for (const sec of r.sectors.filter((x) => x.tier === tier))
          for (const l of sec.log) {
            if (sec.months != null && l.m > sec.months) continue;
            n++;
            if (l.bn) cnt[l.bn][0]++;
            cnt[l.read][1]++;
          }
      if (!n) continue;
      const f = (k: string) => `${cnt[k][0]} / ${cnt[k][1]}`;
      out.push(`| ${POLICY_NAME[p]} | ${tier} | ${n} | ${f('buy')} | ${f('craft')} | ${f('haul')} | ${f('sell')} |`);
    }
  }
  out.push('');
  out.push('月末の資金（制覇するまで）：最小・最大・「3,000 G 未満」の月・「10 万 G 以上」の月');
  out.push('');
  out.push('| 方針 | セクタ | 最小 | 最大 | 3,000 G 未満 | 10 万 G 以上 | 制覇の月の 1 位の他社の売上 |');
  out.push('|---|---|---|---|---|---|---|');
  for (const p of ['rta', 'normal', 'full'] as PolicyId[]) {
    for (const id of routeOf(p)) {
      const logs = rep.runs.filter((x) => x.policy === p).flatMap((r) => r.sectors.filter((x) => x.id === id).flatMap((x) => x.log.filter((l) => x.months == null || l.m <= x.months)));
      if (!logs.length) continue;
      const tops = rep.runs.filter((x) => x.policy === p).flatMap((r) => r.sectors.filter((x) => x.id === id && x.months != null).map((x) => x.log.find((l) => l.m === x.months)!.top));
      out.push(`| ${POLICY_NAME[p]} | ${id} | ${fmtG(Math.min(...logs.map((l) => l.money)))} | ${fmtG(Math.max(...logs.map((l) => l.money)))} | ${logs.filter((l) => l.money < 3000).length} | ${logs.filter((l) => l.money >= 100000).length} | ${tops.length ? fmtG(mean(tops)) : '—'} |`);
    }
  }
  out.push('');
  if (rep.ablation.length) {
    out.push(`スキル・設備投資の効き目（通常の方針・タオックスだけ・シード ${[...new Set(rep.runs.map((r) => r.seed))].join('・')}）：それを取らせないときの「制覇までの月数」。「@」は設備投資`);
    out.push('');
    out.push('| スキル・設備投資 | ふつう | 取らないとき | 差 |');
    out.push('|---|---|---|---|');
    for (const a of rep.ablation) out.push(`| ${SKILL[a.skill]?.name ?? INVEST[a.skill.slice(1)]?.name ?? a.skill}（${a.skill}） | ${a.base.toFixed(1)} | ${a.without.toFixed(1)} | ${(a.without - a.base >= 0 ? '+' : '') + (a.without - a.base).toFixed(1)} |`);
    out.push('');
  }
  if (rep.noTech?.length) {
    const base = rep.runs.filter((r) => r.policy === 'normal');
    out.push(`技なしとの比べ（通常の方針・シード ${rep.noTech.map((r) => r.seed).join('・')}）：技を 1 つも取らず、基礎の商品（多くは他店で供給が足りている）だけで戦ったときの「制覇までの月数」。${MONTH_CAP} か月で制覇できなければ「なれない」`);
    out.push('');
    out.push('| セクタ | ふつう | 技なし | 技なしで制覇できた |');
    out.push('|---|---|---|---|');
    for (const id of routeOf('normal')) {
      const m = (rs: RunResult[]) => rs.map((r) => r.sectors.find((x) => x.id === id)?.months).filter((v): v is number => v != null);
      const a = m(base);
      const b = m(rep.noTech);
      const reached = rep.noTech.filter((r) => r.sectors.some((x) => x.id === id)).length;
      out.push(`| ${sectorName(id)} | ${a.length ? mean(a).toFixed(1) : '—'} | ${b.length ? `${mean(b).toFixed(1)}（${range(b)}）` : 'なれない'} | ${b.length}/${reached}${reached < rep.noTech.length ? `（未到達 ${rep.noTech.length - reached}）` : ''} |`);
    }
    out.push('');
  }
  out.push(digObservations(rep));
  const KINDS = ['build', 'assign', 'hire', 'skill', 'craft', 'proc', 'buy', 'shelf', 'part', 'ad', 'invest', 'dev', 'accept', 'claim', 'gate', 'move', 'dig', 'permit', 'present'];
  out.push('行動の内訳（3 シードの平均。v9：dig＝発掘作業（15 秒）を始めた回、permit＝発掘許可の申請、present＝研究成果の発表）：');
  out.push('');
  out.push('| 方針 | ' + KINDS.join(' | ') + ' |');
  out.push('|---|' + '---|'.repeat(KINDS.length));
  for (const p of ['rta', 'normal', 'full'] as PolicyId[]) {
    const runs = rep.runs.filter((x) => x.policy === p);
    out.push(`| ${POLICY_NAME[p]} | ` + KINDS.map((k) => Math.round(mean(runs.map((r) => r.actions[k] ?? 0)))).join(' | ') + ' |');
  }
  out.push('');
  const fulls = rep.runs.filter((x) => x.policy === 'full');
  if (fulls.length) {
    out.push(`100% のゴールの到達（${fulls.length} シード）：` + fulls.map((r) => `seed ${r.seed}：👑 ${r.goal?.crowns}/${routeOf('full').length}・スキル ${r.goal?.skills}/${fullSkills().length}（C・U の取れるパネル。大きめの研究パネル ${fullSkills().filter((k) => k.big).length} 枚を含む）・Lv 最大 ${r.goal?.maxed}/${fullSkills().length}（レベルの合計 ${r.goal?.levels}/${fullSkills().reduce((a, k) => a + maxLv(k), 0)}）・依頼 ${r.goal?.missions}/${MISSIONS.length}${r.goal?.missing?.length ? `（残り：${r.goal.missing.join('・')}）` : ''}${r.stop ? `（${r.stop}）` : ''}`).join('／'));
    out.push('');
  }
  const stops = rep.runs.filter((r) => r.stop && r.policy !== 'full');
  if (stops.length) {
    out.push('打ち切り：' + stops.map((r) => `${POLICY_NAME[r.policy]} seed ${r.seed}：${r.stop}`).join('／'));
    out.push('');
  }
  return out.join('\n');
}

/** v8：発掘と研究ポイント・お金の使い道の表（数字だけ） */
export function digObservations(rep: Report2): string {
  const out: string[] = [];
  const pols: PolicyId[] = ['rta', 'normal', 'full'];
  out.push('発掘と研究ポイント（v9。セクタごと・3 シードの平均。打った数は着いてから離れるまで。研究パネルは、そのセクタにいるあいだに開けた枚数。「RP 不足」は、詰まりの段に効く研究パネルがあるのにどれも RP が足りなかった月の締め。「お題」はお題がそろった月（着いてからの月の締め）、「依頼状待ち」は制覇のあと依頼状が無くて Uncommon へ移れなかった月。「掘りきり」は離れたときに掘りきった荒れ地の数（4 か所のうち））：');
  out.push('');
  out.push('| 方針 | セクタ | 作業の回数 | 許可 | 手 | 発掘隊 | 爆発（ドリル） | 入った RP | 研究パネル | RP 不足の月 | お題 | 依頼状待ち | 掘りきり | 掘り残し（マス） |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    for (const id of routeOf(p)) {
      const rs = runs.map((r) => r.sectors.find((x) => x.id === id && !x.revisit)).filter((x): x is SectorRun => !!x);
      if (!rs.length) continue;
      const m = (f: (d: DigRec) => number) => Math.round(mean(rs.map((x) => f(x.dig))));
      const tops = rs.map((x) => x.dig.topicsAt).filter((v): v is number => v != null);
      out.push(
        `| ${POLICY_NAME[p]} | ${sectorName(id)} | ${m((d) => d.runs)} | ${mean(rs.map((x) => x.dig.permits)).toFixed(1)} | ${m((d) => d.mid)} | ${m((d) => d.auto)} | ${m((d) => d.blast)}（${m((d) => d.drill ?? 0)}） | ${m((d) => d.rp)} | ${m((d) => d.research)} | ${m((d) => d.rpBlocked)} | ${tops.length ? `${mean(tops).toFixed(1)}（${tops.length}/${rs.length}）` : '—'} | ${m((d) => d.letterWait)} | ${mean(rs.map((x) => x.dig.done)).toFixed(1)} | ${m((d) => d.left)} |`,
      );
    }
  }
  out.push('');
  const cN = SKILLS.filter((k) => skillTier(k) === 'C' && isResearch(k) && !skillSoon(k)).length;
  const uN = fullSkills().filter((k) => skillTier(k) === 'U' && isResearch(k)).length;
  out.push(`研究パネルを開けた枚数（最後に）と、お金の使い道（G。3 シードの平均）。C の研究パネル ${cN} 枚・U の研究パネル ${uN} 枚（いま取れるもの）。「C がそろったセクタ」は Common の研究パネルを全部開けたときにいたセクタの番号（回った順。1 か所目＝1）：`);
  out.push('');
  out.push('| 方針 | C の研究パネル | U の研究パネル | C がそろったセクタ | お金パネル（開放・レベル上げ。発掘の枝を除く） | 発掘の枝（開放・レベル上げ・火薬代・燃料代） | 関所・出店許可 | 最後に残った資金 |');
  out.push('|---|---|---|---|---|---|---|---|');
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    if (!runs.length) continue;
    const all = runs.map((r) => r.research.allC).filter((v): v is number => v != null);
    out.push(
      `| ${POLICY_NAME[p]} | ${mean(runs.map((r) => r.research.C)).toFixed(0)} / ${cN} | ${mean(runs.map((r) => r.research.U)).toFixed(0)} / ${uN} | ${all.length ? `${mean(all).toFixed(1)}（${all.length}/${runs.length}）` : 'そろわない'} | ${fmtG(mean(runs.map((r) => r.spend.money)))} | ${fmtG(mean(runs.map((r) => r.spend.tools)))} | ${fmtG(mean(runs.map((r) => r.spend.fees)))} | ${fmtG(mean(runs.map((r) => r.spend.end)))} |`,
    );
  }
  out.push('');
  return out.join('\n');
}

// ---------------------------------------------------------------- まとめて回す

/** 計測のシード。環境変数 SIM_SEEDS（例：1,2,3,4,5,6）で増やせる（比べの計測用。docs に書くのはふだんの 3 つ） */
export const SEEDS = process.env.SIM_SEEDS ? process.env.SIM_SEEDS.split(',').map(Number).filter((n) => n > 0) : [1, 2, 3];
/** v17：ヒーローの育成を止めて回す（経験値のランクの倍率を 0 に。比べるためだけ。終わったら戻す） */
export function withoutGrowth<T>(f: () => T): T {
  const tier = HERO_GROWTH.xp.tier as Record<string, number>;
  const saved = { ...tier };
  for (const k of Object.keys(tier)) tier[k] = 0;
  try {
    return f();
  } finally {
    Object.assign(tier, saved);
  }
}
/** v19（段 E2）：カリスマ度・士気・給与を止めて回す（段 E2 の前と同じ雇い方・士気 ×1。比べるためだけ。終わったら戻す） */
export function withoutHr<T>(f: () => T): T {
  HR_OFF.on = true;
  try {
    return f();
  } finally {
    HR_OFF.on = false;
  }
}
/** v20（段 F）：自動プレイの節税の手（SIM_TAX）を止めて回す（税はかかる。比べるためだけ） */
export function withoutTaxSaving<T>(f: () => T): T {
  const saved = { ...SIM_TAX };
  for (const k of Object.keys(SIM_TAX) as PolicyId[]) SIM_TAX[k] = null;
  try {
    return f();
  } finally {
    Object.assign(SIM_TAX, saved);
  }
}
/** v21（調整 1）：士気と給与の手（SIM_HR）を止めて回す（休ませる・昇給・賞与をしない。辞めたいの面談だけ。比べるためだけ。終わったら戻す） */
export function withoutHrHands<T>(f: () => T): T {
  const saved = Object.fromEntries(Object.entries(SIM_HR).map(([k, v]) => [k, { ...v }])) as typeof SIM_HR;
  for (const k of Object.keys(SIM_HR) as PolicyId[]) SIM_HR[k] = { rest: 0, raiseBelow: 0, bonus: false };
  try {
    return f();
  } finally {
    for (const k of Object.keys(SIM_HR) as PolicyId[]) SIM_HR[k] = saved[k];
  }
}
/** v20（段 F）：経理と総務を止めて回す（税 0・単価の倍率 1・疲れが効かない。段 F の前と同じ。比べるためだけ。終わったら戻す） */
export function withoutAcct<T>(f: () => T): T {
  ACCT_OFF.on = true;
  try {
    return f();
  } finally {
    ACCT_OFF.on = false;
  }
}
/** 技の枝のスキル（技なしの比較で外す） */
export const TECH_SKILLS = SKILLS.filter((k) => k.branch === 'tech').map((k) => k.id);

export function runAll(seeds = SEEDS, opts: { ablation?: boolean } = {}): Report2 {
  const t0 = performance.now();
  const runs: RunResult[] = [];
  for (const p of ['rta', 'normal', 'full'] as PolicyId[]) for (const seed of seeds) runs.push(runOnce(p, seed));
  const ablation: Report2['ablation'] = [];
  if (opts.ablation) {
    // 通常の方針がタオックスで取ったスキルを 1 つずつ外す
    const base = seeds.map((seed) => runOnce('normal', seed, { onlyFirst: true }));
    const baseM = mean(base.map((r) => r.sectors[0].months ?? MONTH_CAP));
    const taken = [...new Set(base.flatMap((r) => r.skillsAt.filter((k) => k.sector === 'c1' && k.day <= (r.sectors[0].topDay ?? Infinity)).map((k) => k.id)))].filter((id) => id !== 'hire');
    for (const id of taken) {
      const rs = seeds.map((seed) => runOnce('normal', seed, { onlyFirst: true, ban: [id] }));
      ablation.push({ skill: id, base: baseM, without: mean(rs.map((r) => r.sectors[0].months ?? MONTH_CAP)), n: rs.length });
    }
    ablation.sort((a, b) => a.without - a.base - (b.without - b.base));
  }
  const noTech = opts.ablation ? seeds.map((seed) => runOnce('normal', seed, { ban: TECH_SKILLS })) : undefined;
  // v17：ヒーローの育成なし（経験値 0＝いつも Lv1）で同じ 3 方針 × 3 シード。育成で短くなったぶんを比べる
  const noGrowth = opts.ablation ? (['rta', 'normal', 'full'] as PolicyId[]).flatMap((p) => seeds.map((seed) => withoutGrowth(() => runOnce(p, seed)))) : undefined;
  // v18：任せない通常（任せ方の 4 段を使わない）。任せて短くなったぶんを比べる
  const noDeleg = opts.ablation ? seeds.map((seed) => withoutDeleg(() => runOnce('normal', seed))) : undefined;
  // v20：節税しない通常（決算の前の前倒しをしない）・段 F を止めた 3 方針（税 0・単価 ×1・疲れなし。段 F の前と同じ）
  const noSave = opts.ablation ? seeds.map((seed) => withoutTaxSaving(() => runOnce('normal', seed))) : undefined;
  const noAcct = opts.ablation ? (['rta', 'normal', 'full'] as PolicyId[]).flatMap((p) => seeds.map((seed) => withoutAcct(() => runOnce(p, seed)))) : undefined;
  // v21（調整 1）：士気と給与の手を止めた 100%（士気の高い帯の効き目が、給与の増えより大きいか）
  const noHrHands = opts.ablation ? seeds.map((seed) => withoutHrHands(() => runOnce('full', seed))) : undefined;
  // v22（段 G）：カスタマーサポートとマーケを止めた 3 方針（段 G の前と同じ）
  const noCs = opts.ablation ? (['rta', 'normal', 'full'] as PolicyId[]).flatMap((p) => seeds.map((seed) => withoutCs(() => runOnce(p, seed)))) : undefined;
  // v24（段 H2）：M&A なし・特許なしの通常と 100%（それぞれの効き目）
  const noMA = opts.ablation ? (['normal', 'full'] as PolicyId[]).flatMap((p) => seeds.map((seed) => withoutMA(() => runOnce(p, seed)))) : undefined;
  const noPatent = opts.ablation ? (['normal', 'full'] as PolicyId[]).flatMap((p) => seeds.map((seed) => withoutPatent(() => runOnce(p, seed)))) : undefined;
  // v26（段 UI4）：できごとと外交を止めた 3 方針（段 UI4 の前と同じ）
  const noEvents = opts.ablation ? (['rta', 'normal', 'full'] as PolicyId[]).flatMap((p) => seeds.map((seed) => withoutEvents(() => runOnce(p, seed)))) : undefined;
  // v28（段 P2）：適性の倍率と組み合わせを止めた 3 方針（段 P2 の前と同じ）・組み合わせだけ止めた 3 方針
  const noP2 = opts.ablation ? (['rta', 'normal', 'full'] as PolicyId[]).flatMap((p) => seeds.map((seed) => withoutP2(() => runOnce(p, seed)))) : undefined;
  const noDuo = opts.ablation ? (['rta', 'normal', 'full'] as PolicyId[]).flatMap((p) => seeds.map((seed) => withoutP2(() => runOnce(p, seed), { duo: true }))) : undefined;
  // v30（段 I1）：予算で任せるを止めた通常（段 I1 の前と同じ。部長がいるのは通常の方針だけ）
  const noBudget = opts.ablation ? seeds.map((seed) => withoutBudget(() => runOnce('normal', seed))) : undefined;
  return { runs, ablation, noTech, noGrowth, noDeleg, noSave, noAcct, noHrHands, noCs, noMA, noPatent, noEvents, noP2, noDuo, noBudget, ms: performance.now() - t0 };
}

/** docs/ISLAND_BALANCE.md の「自動で書く」部分を差し替える（前後の手書きの文はそのまま） */
export const AUTO_BEGIN = '<!-- island:sim:begin（npm run island:sim が書き換える。手で直さない） -->';
export const AUTO_END = '<!-- island:sim:end -->';
export function writeDoc(path: string, rep: Report2, existing: string | null) {
  const body = [AUTO_BEGIN, '', `最終更新：npm run island:sim（${rep.runs.length} 回の自動プレイ・計測 ${(rep.ms / 1000).toFixed(1)} 秒）`, '', tables(rep), '', observations(rep), AUTO_END].join('\n');
  let doc: string;
  if (existing && existing.includes(AUTO_BEGIN) && existing.includes(AUTO_END)) doc = existing.slice(0, existing.indexOf(AUTO_BEGIN)) + body + existing.slice(existing.indexOf(AUTO_END) + AUTO_END.length);
  else doc = `# アイランドのバランス（自動プレイの計測）\n\n${body}\n`;
  writeFileSync(path, doc);
  return doc;
}
/** v22（段 G）：カスタマーサポートとマーケを止めて回す（問い合わせ・満足度の効き目・炎上・広報・企業の格の効き目なし。段 G の前と同じ。比べるためだけ。終わったら戻す） */
export function withoutCs<T>(f: () => T): T {
  CS_OFF.on = true;
  try {
    return f();
  } finally {
    CS_OFF.on = false;
  }
}

/** v30（段 I1）：予算で任せるを止めて回す（Rare からの部長の置き方・予算・従業員・頼みを止める＝段 I1 の前と同じ。比べるためだけ。終わったら戻す） */
export function withoutBudget<T>(f: () => T): T {
  BUDGET_OFF.on = true;
  try {
    return f();
  } finally {
    BUDGET_OFF.on = false;
  }
}
/** v24（段 H2）：M&A を止めて回す（打診できない。比べるためだけ。終わったら戻す） */
export function withoutMA<T>(f: () => T): T {
  LEGAL_OFF.ma = true;
  try {
    return f();
  } finally {
    LEGAL_OFF.ma = false;
  }
}
/** v24（段 H2）：特許を止めて回す（出願できず、追随も止めない。比べるためだけ。終わったら戻す） */
export function withoutPatent<T>(f: () => T): T {
  LEGAL_OFF.patent = true;
  try {
    return f();
  } finally {
    LEGAL_OFF.patent = false;
  }
}
/** v32（段 I2）：経営会議と社内監査を止めて回す（会議を作らず、目標も効かない＝段 I2 の前と同じ。比べるためだけ。終わったら戻す） */
export function withoutBoard<T>(f: () => T): T {
  BOARD_OFF.on = true;
  try {
    return f();
  } finally {
    BOARD_OFF.on = false;
  }
}
