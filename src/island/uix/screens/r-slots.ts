/**
 * 段 UIX4r：残りの画面（セクター長の箱・復興の箱・建築の札・ミッションの一覧・設定）の新しい画面の差し込み口（docs/ISLAND_UIX.md「画面：残りの画面」）。
 * 切のときは何も入っていない（呼ぶ側は `if (uxr.x) return uxr.x(...)` と書く：今の画面がそのまま開く）。
 * 入のときだけ、r-boot.ts（s-boot.ts から呼ぶ。動的に読む）が中身を入れる。型だけを読むので、切のときも数行ぶんしか増えない。
 */
import type { Ctx } from '../../p1/screens';
import type { P1State } from '../../p1/model';

/** 建築の札：種類のキー（今の .isl-bcat と同じ中身） */
export interface BuildCatView {
  id: string;
  /** 今の絵文字（新しい画面では、絵の名前に替えて出す） */
  icon: string;
  name: string;
  known: number;
  total: number;
  open: boolean;
  /** 開いたばかり（一度だけ錠が外れる演出） */
  isNew: boolean;
  on: boolean;
  pick: () => void;
}
/** 建築の札：建物の札（今の .isl-bcard と同じ中身） */
export interface BuildCardView {
  id: string;
  secret: boolean;
  /** 条件の一言（secret のとき） */
  hint: string;
  name: string;
  img: HTMLElement | null;
  /** 値段の字（建設済み・条件・無料・N G） */
  cost: string;
  /** 値段の数（足りない計算用。0 は無料） */
  costN: number;
  /** canBuild の理由（null は建てられる） */
  err: string | null;
  note: string;
  spec: string;
  guide: boolean;
  /** 押したとき（今の札と同じ処理：建てられなければ音とお知らせ） */
  pick: () => void;
}
export interface BuildView {
  money: number;
  /** 選んだマスに建てる（今の一言） */
  lotNote: string | null;
  /** このカテゴリの建物はまだ（今の一言） */
  emptyNote: string | null;
  cats: BuildCatView[];
  cards: BuildCardView[];
}

/** 設定：1 行（今のキーの列の 1 つと同じ中身・同じ押した先） */
export type SetRow =
  | { k: 'seg'; id: string; label: string; opts: { value: string; label: string }[]; value: string; set: (v: string) => void; note?: string }
  | { k: 'switch'; id: string; label: string; value: boolean; set: (v: boolean) => void; on?: string; off?: string; note?: string }
  | { k: 'fader'; id: string; label: string; value: number; max: number; set: (v: number) => void; note?: string }
  | { k: 'key'; id: string; label: string; fn: () => void; note?: string; danger?: boolean };
export interface SettingsView {
  note: string;
  groups: { title: string; ico: string; rows: SetRow[] }[];
}

export interface UxrScreens {
  /** ランドマップ：セクター長が運営している町の箱（担当・先月の結果・投資の割合） */
  managerBox?: (ctx: Ctx, s: P1State, id: string) => HTMLElement;
  /** ランドマップ：被災した町の復興の箱 */
  reviveBox?: (ctx: Ctx, s: P1State, id: string) => HTMLElement;
  /** 復興を任せる（担当と支援金。器は今の札） */
  delegate?: (ctx: Ctx, id: string, hero0?: number) => void;
  /** 任せる画面の「セクター長」の節（任せきりの町の札） */
  sectorHeads?: (s: P1State) => HTMLElement;
  /** 依頼（ミッション）の一覧（器は今の札） */
  missions?: (ctx: Ctx) => void;
  /** 建築の札の中身（器は今の札。押した先・チュートリアルの目印は今のまま） */
  build?: (body: HTMLElement, v: BuildView) => void;
  /** 設定の中身（器は今の札。入のときの欄 ux.settings はこのあとに今のまま足す） */
  settings?: (body: HTMLElement, v: SettingsView) => void;
}
export { uxrSlots as uxr } from '../hooks';
