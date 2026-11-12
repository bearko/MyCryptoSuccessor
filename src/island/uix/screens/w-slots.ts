/**
 * 段 UIX3w：世界の場面（町の制覇・ランドマップと進出・発掘）の新しい画面の差し込み口（docs/ISLAND_UIX.md「画面：町の制覇」ほか）。
 * 切のときは何も入っていない（呼ぶ側は `if (uxw.x) return uxw.x(...)` と書く：今の画面がそのまま開く）。
 * 入のときだけ、w-boot.ts（s-boot.ts から呼ぶ。動的に読む）が中身を入れる。型だけを読むので、切のときも数行ぶんしか増えない。
 */
import type { Tier } from '../../p1/data';
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

export interface UxwScreens {
  /** 研究成果の発表・調査依頼状・制覇 */
  letter?: (v: LetterView) => void;
  /** お祝いの窓 */
  cheer?: (v: CheerView) => void;
  /** ランドマップ */
  land?: (ctx: Ctx) => void;
  /** ランクが上がる進出の確かめ */
  rankUp?: (ctx: Ctx, target: string) => void;
}
export const uxw: UxwScreens = {};
