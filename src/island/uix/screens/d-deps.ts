/**
 * 段 UIX3d：本体の関数の束（p1/uxd.ts が渡す）。決める場面の新しい画面は、本体のモジュールを自分では読まず、ここから使う（Q.cardView(...) など）。
 * 型だけを読むので、この束（入のときだけ読む）と本体の束のあいだに、共有の束ができない。
 */
import type { UxdDeps } from '../../p1/uxd';

export let Q = {} as UxdDeps;
export function setQ(d: UxdDeps) {
  Q = d;
}
