/**
 * 段 FACTORY1a：工房の建て替え（町工場 1×2・大工場 2×2）の小さな箱。工房の吹き出しと工房の画面で使う。
 * 右脳で分かるように、段の形（1×1 → 1×2 → 2×2 のマス）を並べ、いまの段を光らせる。押すと地図で置き方を選ぶ（main.ts の startRebuild）。
 * class は isl-fac-*（p1.css の既存の class とぶつけない）
 */
import { t } from '../../i18n';
import { FACTORY } from './data';
import { benchCount, facLv, invLv, jamOf, myShops, upCheck, upSpots, wsAny, type P1State, type UpErr } from './model';
import { bar, btn, h, money } from './ui';
import type { Ctx } from './screens';
import './factory.css';

/** 押せない理由（短く） */
export function upWhy(s: P1State, err: UpErr, lv: 1 | 2 | null, cost: number, days: number): string {
  if (err === 'bench') return t('作業台を 2 段目まで増やすと建て替えられます', 'Upgrade benches to level 2 first');
  if (err === 'tier') return t('大工場は Rare 以上の町で建てられます', 'Big factories need a Rare town or higher');
  if (err === 'room') return lv === 2 ? t('2×2 の空きがありません。荒れ地を掘って復興すると置けます', 'No free 2×2 spot. Dig out and revive wasteland to make room') : t('1×2 の空きがありません。となりの建物を移すと置けます', 'No free 1×2 spot. Move a neighbor to make room');
  if (err === 'money') return t(`資金が足りません（あと ${money(cost - s.money)}）`, `Not enough funds (${money(cost - s.money)} short)`);
  if (err === 'busy') return t(`建て替え中（あと ${days} 日）・そのあいだも作り続けます`, `Rebuilding (${days}d left); still working meanwhile`);
  if (err === 'building') return t('工事が終わってから建て替えられます', 'Finish construction first');
  if (err === 'max') return t('いちばん大きな大工場です', 'Already the biggest factory');
  return t('工房がありません', 'No workshop');
}

/** 段の形のマス（1×1・1×2・2×2）。いまの段は塗り、次の段は点線 */
function shapeIcon(lv: number, cls: string) {
  const g = h('span', `isl-fac-shape is-s${lv} ${cls}`);
  const n = lv === 0 ? 1 : lv === 1 ? 2 : 4;
  for (let k = 0; k < n; k++) g.append(h('i'));
  return g;
}

/** 段の並び（工房 → 町工場 → 大工場） */
function steps(cur: number, next: number | null) {
  const row = h('div', 'isl-fac-steps');
  FACTORY.name.forEach((nm, lv) => {
    if (lv) row.append(h('span', 'isl-fac-arrow', '→'));
    const cls = lv === cur ? 'is-cur' : lv === next ? 'is-next' : lv < cur ? 'is-done' : '';
    const c = h('span', `isl-fac-step ${cls}`);
    c.append(shapeIcon(lv, cls), h('small', '', nm));
    row.append(c);
  });
  return row;
}

/**
 * 建て替えの箱：段の並び・ボタン（押せないときは理由）・建て替え中の進み。
 * マインちゃんの一言：作業台が 3 台で製造が詰まっていて、町工場に建て替えられる（または資金だけ足りない）とき
 */
export function facBox(ctx: Ctx, s: P1State): HTMLElement | null {
  const ws = wsAny(s);
  if (!ws || ws.left > 0) return null;
  const cur = facLv(s);
  const c = upCheck(s);
  const box = h('div', 'isl-fac-box');
  box.append(steps(cur, c.lv));
  if (ws.up) {
    const p = h('div', 'isl-fac-prog');
    p.append(h('span', '', t(`🏗 ${FACTORY.name[ws.up.lv]}へ建て替え中`, `🏗 Rebuilding into a ${FACTORY.name[ws.up.lv]}`)), bar(1 - ws.up.left / ws.up.days, 'var(--isl-gold)'), h('small', 'isl-dim', t(`あと ${ws.up.left} 日・作り続けています`, `${ws.up.left}d left · still working`)));
    box.append(p);
    return box;
  }
  if (c.lv) {
    const label = t(`🏭 ${FACTORY.name[c.lv]}にする（${FACTORY.shape[c.lv]}）`, `🏭 Make it a ${FACTORY.name[c.lv]} (${FACTORY.shape[c.lv]})`);
    const go = btn(`${label} ${money(c.cost)}`, () => ctx.rebuild?.(), `isl-fac-go ${c.err ? '' : 'is-on'}`);
    go.disabled = !!c.err;
    box.append(go);
    const gain = t(`作業台 ${benchAfter(s, c.lv)} 台・物置 +${FACTORY.pool[c.lv]}・工期 ${c.days} 日（そのあいだも作り続けます）`, `${benchAfter(s, c.lv)} benches · storage +${FACTORY.pool[c.lv]} · ${c.days} days (keeps working)`);
    box.append(h('small', c.err ? 'isl-fac-why' : 'isl-dim', c.err ? upWhy(s, c.err, c.lv, c.cost, c.days) : gain));
    if (!c.err) {
      const here = upSpots(s, c.lv)[0]?.here;
      box.append(h('small', 'isl-dim', here ? t('となりが空いているので、その場で広げられます', 'The lot next door is free: it can grow in place') : t('となりが空いていないので、光った場所へ移って建て替えます', 'No room next door: it moves to a glowing spot')));
    }
  } else box.append(h('small', 'isl-dim', upWhy(s, 'max', null, 0, 0)));
  // マインちゃんの助言（作業台が 3 台で製造が詰まっているとき）
  if (cur === 0 && c.lv === 1 && (!c.err || c.err === 'money') && benchCount(s) >= 3 && myShops(s).length && jamOf(s) === 'craft') {
    const tip = h('p', 'isl-fac-tip');
    tip.append(h('b', '', t('マインちゃん', 'Mine-chan')), h('span', '', t('工房を町工場に建て替えると、作業台が 4 台になるよ', 'Rebuild into a town factory and you get 4 benches')));
    box.append(tip);
  }
  return box;
}

/** 建て替えたあとの作業台の数（作業台 2 段目のあと。いまの設備投資の段で） */
export function benchAfter(s: P1State, lv: 1 | 2): number {
  const inv = invLv(wsAny(s), 'bench');
  return 1 + inv + (inv >= FACTORY.needBench ? FACTORY.bench[lv] : 0);
}
