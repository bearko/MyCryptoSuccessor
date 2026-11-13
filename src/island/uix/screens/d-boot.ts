/**
 * 段 UIX3d：決める場面の新しい画面（提案のカード・提案書・経営会議・方針・部長との対話・任せる）を、差し込み口へ入れる（s-boot.ts の install から呼ぶ）。
 * 切のときは、このファイルも、ここから読む画面と CSS も読まない。
 */
import type { UxdDeps } from '../../p1/uxd';
import { setQ } from './d-deps';
import { uxd } from './d-slots';
import { cardPanelUx, goneUx, inboxUx, issuesUx } from './card';
import { openProposalUx } from './proposal';
import { openBoardUx } from './board';
import { openCorpPickUx, openDeptPickUx, openPolicyPickUx, openPolicyViewUx, policyCardUx } from './policy';

/** 本体の関数の束を受け取って、差し込み口へ入れる */
export function installD(d: UxdDeps) {
  setQ(d);
  uxd.cardPanel = cardPanelUx;
  uxd.inbox = inboxUx;
  uxd.gone = goneUx;
  uxd.issues = issuesUx;
  uxd.proposal = openProposalUx;
  uxd.board = openBoardUx;
  uxd.policyPick = openPolicyPickUx;
  uxd.policyCard = policyCardUx;
  uxd.policyView = openPolicyViewUx;
  uxd.corpPick = openCorpPickUx;
  uxd.deptPick = openDeptPickUx;
}
