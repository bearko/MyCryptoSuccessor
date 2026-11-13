/**
 * 段 UIX3h：人と管理の新しい画面（職人・採用・ヒーロー・育成・人事と給与・法務・トロフィー・図鑑 ほか）を、差し込み口へ入れる（s-boot.ts の install から呼ぶ）。
 * 切のときは、このファイルも、ここから読む画面と CSS も読まない。
 */
import type { UxhDeps } from '../../p1/uxh';
import { setH } from './h-deps';
import { uxh } from './h-slots';
import { openHireUx, openStaffUx } from './staff';
import { openCharismaUx, openPayrollUx } from './hr';
import { lessonPopUx, openGrowthUx, openLessonsUx, playPromotionUx } from './hero';
import { openMuseumUx, openTrophiesUx, trophyPopUx } from './trophy';

/** 本体の関数の束を受け取って、差し込み口へ入れる */
export function installH(d: UxhDeps) {
  setH(d);
  uxh.staff = openStaffUx;
  uxh.hire = openHireUx;
  uxh.charisma = openCharismaUx;
  uxh.payroll = openPayrollUx;
  uxh.growth = openGrowthUx;
  uxh.promotion = playPromotionUx;
  uxh.lessons = openLessonsUx;
  uxh.lessonPop = lessonPopUx;
  uxh.trophies = openTrophiesUx;
  uxh.trophyPop = trophyPopUx;
  uxh.museum = openMuseumUx;
}
