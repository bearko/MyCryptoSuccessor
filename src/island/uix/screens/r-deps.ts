/**
 * 段 UIX4r：本体の関数の束（p1/uxr.ts が渡す）。残りの画面は、本体のモジュールを自分では読まず、ここから使う（R.money(...) など）。
 * 型だけを読むので、この束（入のときだけ読む）と本体の束のあいだに、共有の束ができない。
 */
import type { UxrDeps } from '../../p1/uxr';

export let R = {} as UxrDeps;
export function setR(d: UxrDeps) {
  R = d;
}
