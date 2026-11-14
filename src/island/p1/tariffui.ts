
import { uxb } from '../uix/screens/b-slots';

/** 比べる中身（1 個あたり） */
export interface TradeCmp {
  /** となり町の名前 */
  name: string;
  /** ここの卸問屋の値段 */
  here: number;
  /** 相手の町の値段・関税・関税の率の文（「関税 12% → 9%」）・納期（日） */
  base: number;
  duty: number;
  rate: string;
  days: number;
  /** 相手の特産（20% 引き） */
  cheap?: boolean;
}

/** 「となり町」の札：2 行（ここ／となり町）。安いほうに印 */
export function tradeCmpEl(c: TradeCmp): HTMLElement {
  // 段 UIX3b：新しい形（uix/screens/tariff.ts）
  return uxb.tradeCmp!(c);
}
