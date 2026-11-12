/**
 * 段 UIX3b：本体の関数の束（p1/uxb.ts が渡す）。事業の画面（調達・お店・サプライチェーン ほか）は、本体のモジュールを自分では読まず、
 * ここから使う（B.unitPrice(...) など）。型だけを読むので、この束（入のときだけ読む）と本体の束のあいだに、共有の束ができない。
 */
import type { UxbDeps } from '../../p1/uxb';

export let B = {} as UxbDeps;
export function setB(d: UxbDeps) {
  B = d;
}
