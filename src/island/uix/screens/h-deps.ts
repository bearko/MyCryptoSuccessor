/**
 * 段 UIX3h：本体の関数の束（p1/uxh.ts が渡す）。人と管理の新しい画面は、本体のモジュールを自分では読まず、ここから使う（H.heroName(...) など）。
 * 型だけを読むので、この束（入のときだけ読む）と本体の束のあいだに、共有の束ができない。
 */
import type { UxhDeps } from '../../p1/uxh';

export let H = {} as UxhDeps;
export function setH(d: UxhDeps) {
  H = d;
}
