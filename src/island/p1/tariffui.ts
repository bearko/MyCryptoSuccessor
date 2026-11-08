/**
 * 段 TRADE1a：となり町の取り寄せの見せ方（DOM）。卸問屋の吹き出し（tile.ts）と調達の画面（screens.ts）の素材の行に出す「となり町」の札。
 * ここの値段と、隣町の値段 ＋ 関税 ＝ 合計を縦に並べ、安いほうに金色の枠と「安い」の札（色だけに頼らない）。数字は tariff.ts。
 */
import { t } from '../../i18n';
import { h, money } from './ui';

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
  const total = c.base + c.duty;
  const there = total < c.here;
  const el = h('div', 'isl-tradecmp');
  el.append(h('span', 'isl-tradecmp-tag', t('🗺 となり町', '🗺 Next town')));
  const row = (cls: string, who: string, parts: HTMLElement[], win: boolean) => {
    const r = h('div', `isl-tradecmp-row ${cls} ${win ? 'is-win' : ''}`);
    r.append(h('span', 'isl-tradecmp-who', who), ...parts);
    if (win) r.append(h('b', 'isl-tradecmp-win', t('安い', 'Cheaper')));
    el.append(r);
  };
  row('is-here', t('ここ', 'Here'), [h('b', 'isl-tradecmp-sum', money(c.here))], !there);
  const sum = h('span', 'isl-tradecmp-calc');
  sum.append(h('span', '', money(c.base)), h('span', 'isl-tradecmp-duty', t(` ＋ 関税 ${money(c.duty)}`, ` + duty ${money(c.duty)}`)), h('span', '', t(' ＝ ', ' = ')), h('b', 'isl-tradecmp-sum', money(total)));
  row('is-there', c.name, [sum], there);
  const foot = [c.rate, t(`納期 ${c.days} 日`, `${c.days}-day lead`)];
  if (c.cheap) foot.unshift(t('相手の特産 −20%', 'Their specialty −20%'));
  el.append(h('small', 'isl-tradecmp-foot', foot.join(t('・', ' · '))));
  return el;
}
