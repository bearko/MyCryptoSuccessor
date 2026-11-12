/**
 * 段 UIX3k：本体の関数の束（p1/uxk.ts が渡す）。経営企画の新しい画面は、本体のモジュールを自分では読まず、ここから使う（K.money(...) など）。
 * 型だけを読むので、この束（入のときだけ読む）と本体の束のあいだに、共有の束ができない。
 */
import type { UxkDeps } from '../../p1/uxk';

export let K = {} as UxkDeps;
export function setK(d: UxkDeps) {
  K = d;
}
