/**
 * 段 UIX3w：世界の場面（町の制覇・ランドマップと進出・発掘）の新しい画面の差し込み口（docs/ISLAND_UIX.md「画面：町の制覇」ほか）。
 * 切のときは何も入っていない（呼ぶ側は `if (uxw.x) return uxw.x(...)` と書く：今の画面がそのまま開く）。
 * 入のときだけ、w-boot.ts（s-boot.ts から呼ぶ。動的に読む）が中身を入れる。型だけを読むので、切のときも数行ぶんしか増えない。
 */
import type { SectorState } from '../../p1/company';
import type { Tier } from '../../p1/data';
import type { DigStatus } from '../../p1/digview';
import type { DigHit } from '../../p1/model';
import type { Ctx } from '../../p1/screens';

/** 押せる選択肢（今の modal() の actions と同じ形：字・押したとき・class。'is-on' が主役） */
export type UxwAct = [string, () => void, string?];

/** 研究成果の発表・調査依頼状・制覇の発表（p1/main.ts の showLetter が出していた中身） */
export interface LetterView {
  /** 窓を入れる所（#isl-ui） */
  host: HTMLElement;
  /** 今回の研究ポイント */
  rp: number;
  /** 受け取った調査依頼状（無ければ null） */
  letter: Tier | null;
  /** 「Uncommon の調査依頼状」 */
  letterName: string;
  /** 調査依頼状の絵（今の仮の絵。128px） */
  letterIcon: HTMLElement | null;
  /** 「町の長 ○○より」（町の長がいないときは空） */
  from: string;
  /** この発表で制覇した */
  conquered: boolean;
  /** 町の名前 */
  town: string;
  /** 見出し（今の窓の題。絵文字つき：新しい画面で外す） */
  title: string;
  /** 制覇の条件の 2 行（「2 か月続けて 1 位」「研究成果の発表」） */
  conds: string[];
  /** マインちゃんのひと言（[[ ]] で囲んだ言葉は強調） */
  say: string;
  /** カットインに立つヒーロー（自社の 1 人目。いなければ町の長）の絵を作る */
  hero: ((size: number) => HTMLElement) | null;
  /** 今の選択肢（押すと窓を閉じてから動く。初めての制覇なら、お祝いの窓へ続く） */
  actions: UxwAct[];
  /** 今の花火（ドットの効果）。札が出たときに鳴らす */
  fx: () => void;
}

/** お祝いの窓（フェーズ 1 クリア・ランド制覇）。p1/main.ts の clearModal・sectorChecks が出していた中身 */
export interface CheerView {
  host: HTMLElement;
  /** 'clear'：初めての制覇／'land'：ランクのランドを全部制覇 */
  kind: 'clear' | 'land';
  title: string;
  /** 本文（[[ ]] は強調） */
  say: string;
  /** 添える数字（「ブランド力 +N」） */
  bonus?: { label: string; n: number };
  actions: UxwAct[];
}

/** となりの町の窓（境界の町の名前・縮小の札から。p1/main.ts の openSectorCard が出していた中身） */
export interface SectorCardView {
  host: HTMLElement;
  id: string;
  state: SectorState;
  /** 進出の決め方（world.ts の advanceOf：go・move・short・rankup・letter・locked） */
  kind: 'go' | 'move' | 'short' | 'rankup' | 'letter' | 'locked';
  fee: number;
  money: number;
  /** 進出できない理由（今の文） */
  why: string;
  rivals: number;
  /** 需要の多い商品（絵と名前） */
  hot: { icon: HTMLElement; name: string }[];
  /** 進出・移動する（今の動き。窓は先に閉じる） */
  go: () => void;
}

/** 発掘終了の札（p1/digui.ts の showEndCard が出していた中身） */
export interface DigEndView {
  /** 今回の出土の数字（名前・値。「+9」「0」） */
  lines: [string, string][];
  /** 見つけた出土品（見つけた順） */
  finds: { kind: string; rank: string; icon: HTMLElement; tag: string; name: string; rp: number; recipe: boolean; big: boolean; first: boolean; note: string; read: (() => void) | null }[];
  bombs: number;
  /** ダンジョン：いちばん深い層・新記録か */
  deep: { deep: number; record: boolean } | null;
  /** 掘りきったときのひと言（無ければ空） */
  note: string;
  /** 新しいレシピ（復刻品） */
  recipes: { icon: HTMLElement; name: string; note: string; series: { text: string; good: boolean } | null; make: () => void }[];
  /** 次の強化のおすすめ */
  rec: { text: string; go: () => void } | null;
  /** 選択肢（月次報告へ／もう一度・町に戻る） */
  acts: UxwAct[];
  /** 選択肢を出したとき */
  shown: () => void;
  /** 何も出なかったとき：6 秒たったら呼ぶ（町に戻る） */
  auto: (() => void) | null;
}
/** 発掘の画面への差し込み（今の画面の要素 el＝.isl-dig に、管制卓の帯・計器・手応えを足す） */
export interface DigUx {
  /** 画面を作った直後 */
  open: (el: HTMLElement) => void;
  /** 帯・道具・壁を描き直したあと */
  sync: (el: HTMLElement, st: DigStatus, o: { run: boolean; over: boolean }) => void;
  /** 毎コマ：残り時間（作業の外は null） */
  timer: (el: HTMLElement, rb: { sec: string; frac: number; warn: boolean; tick: boolean } | null) => void;
  /** 打った（はがれた・出てきた）。big：いちばん大きい演出の種類 */
  hits: (el: HTMLElement, hits: DigHit[], cellAt: (x: number, y: number) => HTMLElement | null, big: string | null) => void;
  /** 発掘終了の札 */
  end: (el: HTMLElement, v: DigEndView) => void;
  /** 閉じる */
  close: (el: HTMLElement) => void;
}

export interface UxwScreens {
  /** 研究成果の発表・調査依頼状・制覇 */
  letter?: (v: LetterView) => void;
  /** お祝いの窓 */
  cheer?: (v: CheerView) => void;
  /** ランドマップ */
  land?: (ctx: Ctx) => void;
  /** ランクが上がる進出の確かめ */
  rankUp?: (ctx: Ctx, target: string) => void;
  /** となりの町の窓 */
  sectorCard?: (v: SectorCardView) => void;
  /** 発掘の画面 */
  dig?: DigUx;
  /** 地図の上の札（縮小の札）・となりの町の吹き出し：今の要素の絵文字をドットの絵に替える（見た目は CSS で着せ替える） */
  deco?: (e: HTMLElement, kind: 'badge' | 'pop') => void;
}
export const uxw: UxwScreens = {};
