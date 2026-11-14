/**
 * 段 UIX5t：本体の関数の束（p1/uxt.ts が渡す）。部長との対話の新しい画面は、本体のモジュールを自分では読まず、ここから使う（T.htSummary(...) など）。
 * 型だけを読むので、この束（入のときだけ読む）と本体の束のあいだに、共有の束ができない。
 */
import type { UxtDeps } from '../../p1/uxt';

export let T = {} as UxtDeps;
export function setT(d: UxtDeps) {
  T = d;
}
