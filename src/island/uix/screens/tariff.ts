/**
 * 段 UIX3b：となり町の取り寄せの比べ（関税）。今の札（p1/tariffui.ts の tradeCmpEl）と同じ中身を、管制卓の計器で：
 * ここの値段と、となり町の値段 ＋ 関税 ＝ 合計を 2 段に並べ、安いほうに「安い」の札とランプ（色だけに頼らない）。
 * 卸問屋の吹き出し（建物の吹き出し）と、調達の画面の素材の札に出る。
 */
import { t } from '../../../i18n';
import { el, fmtN } from '../dom';
import { uxLamp, uxTape } from '../parts';
import { bDim } from './b-icons';
import type { TradeCmp } from '../../p1/tariffui';

/** 安いのはどちらか（合計が、ここより安ければ となり町） */
export const cheaperThere = (c: Pick<TradeCmp, 'here' | 'base' | 'duty'>) => c.base + c.duty < c.here;

export function tradeCmpUx(c: TradeCmp): HTMLElement {
  const total = c.base + c.duty;
  const there = cheaperThere(c);
  const g = (n: number) => el('span.ux-num', `${fmtN(n)} G`);
  const row = (who: string, win: boolean, ...parts: (HTMLElement | string)[]) =>
    el(`div.uxb-cmp-row${win ? '.is-win' : ''}`, uxLamp(win ? 'good' : '', win), el('span.uxb-cmp-who', who), el('span.uxb-cmp-calc', parts), win ? uxTape(t('安い', 'Cheaper'), 'good') : null);
  const foot = [c.rate, t(`納期 ${c.days} 日`, `${c.days}-day lead`)];
  if (c.cheap) foot.unshift(t('相手の特産 −20%', 'Their specialty −20%'));
  return el(
    'div.uxb-cmp.ux-root',
    el('span.uxb-cmp-tag', bDim('town'), t('となり町', 'Next town')),
    row(t('ここ', 'Here'), !there, el('b', g(c.here))),
    row(c.name, there, g(c.base), el('span.uxb-cmp-duty', t(' ＋ 関税 ', ' + duty '), g(c.duty)), el('span', t(' ＝ ', ' = ')), el('b', g(total))),
    el('span.uxb-cmp-foot', foot.join(t('・', ' · '))),
  );
}
