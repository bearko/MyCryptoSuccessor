/**
 * SCM ダッシュボード：① 調達 → ② 製造 → ③ 物流 → ④ 販売 の流れを、ヒーローとエクステの絵で見せる。
 * 段ごとに「ひと月に回せる数」を比べて、いちばん細いところ（ボトルネック）を目立たせ、
 * その場でヒーローの割り当て・スキル・雇う・建てる画面へ行けるようにする（docs/ISLAND_PHASE1.md「SCM ダッシュボード」）。
 */
import { t } from '../../i18n';
import { DEF } from '../defs';
import { INVEST, MARKET, PRODUCT, SKILL, SKILLS, TRANSPORT, skuPrice, type Sku } from './data';
import { has, invest, skillLock, type PBuilding, jamOf, oneWay, craftCheck, matDays, myShops, myWorkshop, poolFree, stageCaps, staffOf, type GoodsWhy, type P1State, type SellInfo, type SellWhy, type Stage, type StageIf, type WhatIf } from './model';
import { TASK_NAME } from './heroui';
import { after, openAds, openBuy, openData, openHire, openShop, openStaff, openWorkshop, type Ctx } from './screens';
import { openSkills } from './tree';
import { goodsName, type SellMove } from './moves';
import { execute } from './deleg';
import { heroName, money, skuName } from './ui';
import { uxb } from '../uix/screens/b-slots';

export type Lamp = 'ok' | 'warn' | 'stop';
export const LAMP_NAME: Record<Lamp, string> = { ok: t('順調', 'Running'), warn: t('注意', 'Watch'), stop: t('停止', 'Stopped') };
export const STAGE: Record<Stage, { n: string; name: string; branch: string; what: string }> = {
  buy: { n: '①', name: t('調達', 'Buy'), branch: 'buy', what: t('素材', 'materials') },
  craft: { n: '②', name: t('製造', 'Craft'), branch: 'craft', what: t('作った', 'made') },
  haul: { n: '③', name: t('物流', 'Haul'), branch: 'logi', what: t('運んだ', 'hauled') },
  sell: { n: '④', name: t('販売', 'Sell'), branch: 'shop', what: t('売れた', 'sold') },
};

/** いま取れる（資金・研究ポイントだけが足りないものも含む）スキルか。外周・エンブレム・ブランド力・大きめの研究パネルは除く */
const canNow = (s: P1State, id: string) => {
  const k = SKILL[id];
  if (!k || k.big) return false;
  const e = skillLock(s, k);
  return e === null || e === 'money' || e === 'rp';
};
/** まだ取れるスキル（先に要るものを取ってあるもの）を、その段の系統から 2 つ */
export function nextSkills(s: P1State, branch: string) {
  return SKILLS.filter((k) => k.branch === branch && canNow(s, k.id)).slice(0, 2);
}

const ORDER: Stage[] = ['buy', 'craft', 'haul', 'sell'];

/** ダッシュボードの詰まり：月次報告（report.ts の reportJam）と同じ判定 */
export const scmJam = (s: P1State): Stage => jamOf(s);

/** 平均の単価：今月（無ければ先月）の売上 ÷ 売れた数。まだ売れていなければ、並べている・作っている商品の値段の平均 */
export function avgPrice(s: P1State): number {
  const units = Object.values(s.monthUnits).reduce<number>((a, n) => a + (n ?? 0), 0);
  const rev = Object.values(s.monthSales).reduce<number>((a, n) => a + (n ?? 0), 0);
  if (units > 0) return rev / units;
  const last = s.reports[s.reports.length - 1];
  if (last?.flow && last.flow.sold > 0) return last.revenue / last.flow.sold;
  const xs = [...myShops(s).flatMap((b) => s.shops[b.uid].shelves), ...s.slots.map((sl) => sl.sku)].filter((x): x is Sku => !!x);
  return xs.length ? xs.reduce((a, x) => a + skuPrice(x), 0) / xs.length : 0;
}

/**
 * 詰まりを太くしたときの見込み：次に細い段との差（個／月）× 平均の単価。
 * 止まっている段は 0 として数える。差が無ければ null
 */
export function jamGain(s: P1State, caps: ReturnType<typeof stageCaps>, bn: Stage): { n: number; g: number } | null {
  const cur = caps[bn].stopped ? 0 : caps[bn].perMonth;
  const others = ORDER.filter((k) => k !== bn && !caps[k].stopped).map((k) => caps[k].perMonth);
  if (!others.length) return null;
  const n = Math.round(Math.min(...others) - cur);
  if (n <= 0) return null;
  return { n, g: Math.round(n * avgPrice(s)) };
}

/** 「数字を上げるには」の 1 つ（buy：その場で設備を買う。short：資金が足りない） */
export interface Up {
  label: string;
  sub: string;
  go: () => void;
  buy?: boolean;
  short?: boolean;
}

/** 段ごとの「人を置く」の名前 */
const PERSON_LABEL: Record<Exclude<Stage, 'sell'>, string> = {
  buy: t('調達係を置く', 'Assign a buyer'),
  craft: t('空いた作業台に職人を置く', 'Staff the free bench'),
  haul: t('運搬係をもう 1 人', 'One more hauler'),
};
/**
 * 段ごとの打ち手（whatIf）1 つを、ボタンに。見込み（+N 個／月）を先に出す。
 * 設備投資はその場で導入（チュートリアル中は出さない）、スキル・人はその画面へ。④ 販売は販売の内訳の打ち手と同じ
 */
export function moveUp(ctx: Ctx, s: P1State, w: StageIf): Up {
  const gain = t(`+${Math.round(w.units)} 個／月`, `+${Math.round(w.units)} / mo`);
  const m = w.move;
  switch (m.kind) {
    case 'invest': {
      const b = s.buildings.find((x) => x.uid === m.uid);
      const short = s.money < m.cost;
      return {
        label: m.id === 'bench' ? t(`${INVEST[m.id].name}（職人つき）`, `${INVEST[m.id].name} (staffed)`) : INVEST[m.id].name,
        sub: short ? t(`${gain}・あと ${money(m.cost - s.money)}`, `${gain} · ${money(m.cost - s.money)} short`) : t(`${gain}・設備投資 ${money(m.cost)}`, `${gain} · invest ${money(m.cost)}`),
        buy: true,
        short,
        go: () => {
          const e = invest(s, m.uid, m.id);
          if (e === 'money') {
            ctx.sfx?.('error');
            ctx.toast(t('資金が足りません', 'Not enough funds'));
          } else if (!e) {
            ctx.sfx?.('spend');
            ctx.toast(t(`「${INVEST[m.id].name}」を導入しました（${b ? DEF[b.id].name : ''}）`, `Installed: ${INVEST[m.id].name} (${b ? DEF[b.id].name : ''})`));
          }
          after(ctx);
          // 作業台を増やしたら、人を置く画面へ
          if (!e && m.id === 'bench') openWorkshop(ctx);
        },
      };
    }
    case 'skill':
      // スキルツリーの 2 区分：研究パネルは「研究する 40 RP」、お金パネルは「開放する 4,000 G」（詳細カードのボタンと同じ言い方）
      if (m.rp != null) {
        const short = (s.rp ?? 0) < m.rp;
        return {
          label: SKILL[m.id].name,
          sub: short ? t(`${gain}・あと ${m.rp - (s.rp ?? 0)} RP`, `${gain} · ${m.rp - (s.rp ?? 0)} RP short`) : t(`${gain}・研究する ${m.rp} RP`, `${gain} · research ${m.rp} RP`),
          short,
          go: () => openSkills(ctx, m.id),
        };
      }
      return { label: SKILL[m.id].name, sub: t(`${gain}・開放する ${money(m.cost)}`, `${gain} · unlock ${money(m.cost)}`), short: s.money < m.cost, go: () => openSkills(ctx, m.id) };
    case 'level':
      return { label: SKILL[m.id].name, sub: t(`${gain}・Lv${m.lv} に上げる ${money(m.cost)}`, `${gain} · level up to Lv${m.lv} ${money(m.cost)}`), short: s.money < m.cost, go: () => openSkills(ctx, m.id) };
    case 'person': {
      const who = m.hire ? t(`雇う：${heroName(m.hero)}（月給 ${money(m.cost)}）`, `Hire ${heroName(m.hero)} (${money(m.cost)}/mo)`) : heroName(m.hero);
      const label = m.replace != null ? t(`${TASK_NAME[m.task]}の得意な人に替える`, `A better ${TASK_NAME[m.task]} hand`) : PERSON_LABEL[w.stage as Exclude<Stage, 'sell'>];
      return { label, sub: t(`${gain}・${who}`, `${gain} · ${who}`), go: () => (m.hire ? openHire(ctx) : openStaff(ctx)) };
    }
    case 'build': {
      const short = s.money < m.cost;
      return {
        label: t(`${DEF[m.id].name}を建てる`, `Build a ${DEF[m.id].name}`),
        sub: short ? t(`${gain}・あと ${money(m.cost - s.money)}`, `${gain} · ${money(m.cost - s.money)} short`) : t(`${gain}・建築 ${money(m.cost)}`, `${gain} · build ${money(m.cost)}`),
        short,
        go: () => ctx.build?.(m.id),
      };
    }
    case 'sell': {
      const u = whatIfUp(ctx, s, m.w);
      return { label: u.label, sub: gain, go: u.go };
    }
  }
}

/** その段の数字を上げる手：見込み（whatIf）の大きい順に（スマホ 2 つ・PC 3 つ）。チュートリアル中は設備投資を出さない */
export function upsOf(ctx: Ctx, s: P1State, list: StageIf[]): Up[] {
  const n = innerWidth < 600 ? 2 : 3;
  const tut = !!ctx.step?.();
  return list
    .filter((w) => w.ok && !(tut && w.move.kind === 'invest'))
    .slice(0, n)
    .map((w) => moveUp(ctx, s, w));
}

// ---------------------------------------------------------------- ④ 販売の内訳（docs/ISLAND_PHASE1.md「販売の内訳」）

const pct = (v: number) => `${Math.round(v * 100)}%`;
export const shopLabel = (s: P1State, b: PBuilding) => {
  const all = myShops(s).filter((x) => x.id === b.id);
  return all.length > 1 ? `${DEF[b.id].name} ${all.indexOf(b) + 1}` : DEF[b.id].name;
};
/** 打ち手の効き目：+N 個／月（≒ +M G） */
export const gainText = (w: WhatIf) => {
  const n = Math.round(w.units);
  // 効かない手は小数 1 桁（+1.6 を「+2」と丸めて「効かない」と並べない）
  const d = Math.round(w.units * 10) / 10;
  if (!w.ok) return d < 0 ? t(`${d} 個／月（減る）`, `${d} / mo (fewer)`) : t(`+${Math.max(0, d)} 個／月（いまは効かない）`, `+${Math.max(0, d)} / mo (no effect now)`);
  return t(`+${n} 個／月（≒ +${money(w.yen)}）`, `+${n} / mo (≈ +${money(w.yen)})`);
};
/** 打ち手 1 つの名前・説明・行き先 */
export function whatIfUp(ctx: Ctx, s: P1State, w: WhatIf): { label: string; sub: string; go: () => void } {
  const shop = w.uid != null ? s.buildings.find((b) => b.uid === w.uid) : undefined;
  const at = shop ? shopLabel(s, shop) : '';
  switch (w.kind) {
    case 'goods': {
      const name = PRODUCT[w.key ?? '']?.name ?? w.key ?? '';
      return {
        label: t(`別の商品「${name}」を並べる`, `Stock another item: ${name}`),
        sub: w.replace ? t(`${at}の「${skuName(w.replace)}」と入れ替え（市場データ）`, `Swap ${skuName(w.replace)} at ${at} (market data)`) : t(`${at}の空き棚に（市場データ）`, `On a free shelf at ${at} (market data)`),
        go: () => openData(ctx),
      };
    }
    case 'shelf': {
      const name = PRODUCT[w.key ?? '']?.name ?? w.key ?? '';
      return {
        label: t('棚 +1（別の商品を並べると売上が増える）', 'Shelf +1 (a new item adds sales)'),
        sub: t(`${at}の設備投資 ${money(w.cost ?? 0)}・「${name}」を並べる`, `Invest ${money(w.cost ?? 0)} at ${at}, stock ${name}`),
        go: () => {
          if (w.uid == null) return;
          const e = invest(s, w.uid, 'shelves');
          if (e === 'money') {
            ctx.sfx?.('error');
            ctx.toast(t('資金が足りません', 'Not enough funds'));
            return;
          }
          if (!e) {
            ctx.sfx?.('spend');
            ctx.toast(t(`「${INVEST.shelves.name}」を導入しました（${at}）`, `Installed: ${INVEST.shelves.name} (${at})`));
          }
          after(ctx);
          openShop(ctx, w.uid);
        },
      };
    }
    case 'shop':
      return {
        label: myShops(s).length >= 2 ? t('次のお店を建てる', 'Build another shop') : t('2 軒目のお店を建てる', 'Build a 2nd shop'),
        sub: w.hot ? t('お客さんの多い区画に・売り場の人つき（建築）', 'In a busy block, staffed (build)') : t('まだ届いていない家の近くに・売り場の人つき（建築）', 'Near homes you don’t reach yet, staffed (build)'),
        go: () => ctx.build?.('general_store', w.at),
      };
    case 'pull':
      return { label: t('売り場の強さ +15%', 'Shop pull +15%'), sub: t('接客の研修・看板・ブランド力', 'Service training, signboards, brand'), go: () => openSkills(ctx, canNow(s, 'host') ? 'host' : 'shop') };
    case 'known':
      return { label: t('認知を 100% に', 'Make items fully known'), sub: t('宣伝（マーケ）', 'Advertising (marketing)'), go: () => openAds(ctx) };
    case 'part':
      return { label: t('アルバイト +1', 'One more part-timer'), sub: t(`${at}（お店の画面）`, `${at} (shop screen)`), go: () => w.uid != null && openShop(ctx, w.uid) };
    case 'fixtures':
      return { label: t('陳列の什器 +1', 'Display fixtures +1'), sub: t(`${at}（お店の設備投資）`, `${at} (shop investment)`), go: () => w.uid != null && openShop(ctx, w.uid) };
  }
}

/**
 * 販売の手（moves.ts。毎月の費用を引いた利益の見込みの順）1 つを、大きいボタンに（段 UI1）。
 * 打てる手（棚 +1 と商品・空き棚に商品・アルバイト・什器・パネル・名物店主・宣伝）はその場で打ち、建てる手は置くモードへ
 */
export function sellBigUp(ctx: Ctx, s: P1State, m: SellMove): Up {
  const gain = m.monthly > 0 ? t(`+${Math.round(m.units)} 個／月・毎月の費用を引いて ${m.net >= 0 ? '+' : '−'}${money(Math.abs(m.net))}`, `+${Math.round(m.units)} / mo, ${m.net >= 0 ? '+' : '−'}${money(Math.abs(m.net))} after monthly costs`) : t(`+${Math.round(m.units)} 個／月（粗利 ≒ +${money(m.net)}）`, `+${Math.round(m.units)} / mo (≈ +${money(m.net)} margin)`);
  const shop = m.uid != null ? s.buildings.find((b) => b.uid === m.uid) : undefined;
  const at = shop ? shopLabel(s, shop) : '';
  const cost = m.rp ? t(`研究 ${m.rp} RP`, `${m.rp} RP`) : m.cost > 0 ? money(m.cost) : t('費用なし', 'free');
  const run = (ok: string) => () => {
    // 打てない（作り手がいない商品など）：お店か工房の画面へ
    if (!m.act) {
      if (m.kind === 'goods' || m.kind === 'shelf') openWorkshop(ctx);
      else if (m.uid != null) openShop(ctx, m.uid);
      return;
    }
    if (m.act.k === 'build') {
      ctx.build?.(m.act.id, [m.act.i, m.act.j]);
      return;
    }
    const e = execute(s, m.act as Parameters<typeof execute>[1]);
    if (e === 'money' || e === 'rp') {
      ctx.sfx?.('error');
      ctx.toast(e === 'money' ? t(`資金が足りません（あと ${money(Math.max(0, m.cost - s.money))}）`, `Not enough funds (${money(Math.max(0, m.cost - s.money))} short)`) : t('研究ポイントが足りません', 'Not enough RP'));
      return;
    }
    if (e) {
      ctx.sfx?.('error');
      ctx.toast(t('いまは打てない手でした', 'That move is not possible now'));
      after(ctx);
      return;
    }
    ctx.sfx?.('spend');
    ctx.toast(ok);
    after(ctx);
    if (m.act.k === 'stock' && m.uid != null) {
      openShop(ctx, m.uid);
    }
  };
  const nm = m.key ? goodsName(m.key) : '';
  switch (m.kind) {
    case 'shelf':
      return { label: t(`棚をもう 1 段、「${nm}」も並べる`, `One more shelf, and stock ${nm}`), sub: t(`${gain}・${at}の設備投資 ${cost}`, `${gain} · invest ${cost} at ${at}`), buy: true, short: s.money < m.cost, go: run(t(`棚を増やして「${nm}」を並べました（${at}）`, `Added a shelf with ${nm} (${at})`)) };
    case 'goods':
      return { label: m.replace ? t(`「${goodsName(m.replace)}」を「${nm}」に替える`, `Swap ${goodsName(m.replace)} for ${nm}`) : t(`空いた棚に「${nm}」を並べる`, `Stock ${nm} on the free shelf`), sub: t(`${gain}・${at}`, `${gain} · ${at}`), go: run(t(`「${nm}」を並べました（${at}）`, `Stocked ${nm} (${at})`)) };
    case 'shop':
      return { label: myShops(s).length >= 2 ? t('次のお店を建てる', 'Build another shop') : t('2 軒目のお店を建てる', 'Build a 2nd shop'), sub: t(`${gain}・建築 ${cost}＋毎月 ${money(m.monthly)}（食い合いあり）`, `${gain} · build ${cost} + ${money(m.monthly)}/mo (shares customers)`), short: s.money < m.cost, go: run('') };
    case 'part':
      return { label: t('アルバイト +1', 'One more part-timer'), sub: t(`${gain}・${at}`, `${gain} · ${at}`), go: run(t('アルバイトを 1 人増やしました', 'Added a part-timer')) };
    case 'fixtures':
      return { label: t('陳列の什器 +1', 'Display fixtures +1'), sub: t(`${gain}・${at}の設備投資 ${cost}`, `${gain} · invest ${cost} at ${at}`), buy: true, short: s.money < m.cost, go: run(t(`「${INVEST.fixtures.name}」を導入しました（${at}）`, `Installed: ${INVEST.fixtures.name} (${at})`)) };
    case 'famous':
      return { label: t('名物店主を置く', 'Celebrity shopkeeper'), sub: t(`${gain}・${cost}`, `${gain} · ${cost}`), short: (s.rp ?? 0) < (m.rp ?? 0) || s.money < m.cost, go: run(t('名物店主を置きました', 'Celebrity shopkeeper set')) };
    case 'ad':
      return { label: t('宣伝を出す', 'Run an ad'), sub: t(`期間で +${money(m.net)}（費用を引いて）・${cost}`, `+${money(m.net)} over the run, net · ${cost}`), short: s.money < m.cost, go: run(t('宣伝を始めました', 'Ad started')) };
    default: {
      const id = m.act && m.act.k === 'skill' ? m.act.id : 'host';
      return { label: t(`「${SKILL[id]?.name ?? id}」を取る`, `Take ${SKILL[id]?.name ?? id}`), sub: t(`${gain}・${cost}`, `${gain} · ${cost}`), short: (s.rp ?? 0) < (m.rp ?? 0) || s.money < m.cost, go: m.act ? run(t(`「${SKILL[id]?.name ?? id}」を取りました`, `Took ${SKILL[id]?.name ?? id}`)) : () => openSkills(ctx, id) };
    }
  }
}

export const WHY_NAME: Record<SellWhy, string> = {
  capacity: t('お店の処理力（品出し）が足りない', 'Shops can’t shelve fast enough'),
  demand: t('並べている商品の需要が小さい／他社と取り合っている', 'Your items have little demand or are shared with rivals'),
  far: t('遠くて届かないお客さんが多い', 'Many customers live too far away'),
  known: t('新しい商品がまだ知られていない', 'Your new items aren’t known yet'),
  rival: t('他社の売り場が強い', 'Rival shops pull harder'),
};
export const GOODS_WHY: Record<GoodsWhy, string> = {
  saturated: t('飽和', 'Saturated'),
  known: t('認知が低い', 'Little known'),
  far: t('遠い', 'Far'),
  rival: t('他社が強い', 'Rivals strong'),
  ok: t('取れている', 'Doing well'),
};

/** 頭打ちの理由の説明（数字つき）と、すぐの打ち手 */
export function whyLine(ctx: Ctx, s: P1State, info: SellInfo, best: WhatIf | undefined): { text: string; act: [string, () => void] } {
  const demand = Math.round(info.goods.reduce((a, g) => a + g.demand, 0));
  switch (info.why) {
    case 'capacity': {
      const shop = myShops(s)[0];
      return {
        text: t(`需要からは月 ${Math.round(info.potential)} 個売れるのに、お店が棚に並べられるのは月 ${Math.round(info.capacity)} 個。品出しを速くすると、そのぶん売れます。`, `Demand allows ${Math.round(info.potential)} / mo, but your shops shelve only ${Math.round(info.capacity)} / mo. Faster shelving sells the difference.`),
        act: [t('お店を開く（アルバイト・陳列の什器）', 'Open the shop (part-timers, fixtures)'), () => shop && openShop(ctx, shop.uid)],
      };
    }
    case 'demand':
      return {
        text:
          info.satShare >= 0.5
            ? t(`並べている商品の需要の ${pct(info.satShare)} は、他社 2 社以上が扱う飽和した商品です（売り場の強さ ×${MARKET.saturated}）。棚やお店を増やしても伸びません。`, `${pct(info.satShare)} of your items’ demand is saturated by 2+ rivals (pull ×${MARKET.saturated}). More shelves or shops won’t help.`)
            : t(`並べている商品の需要 月 ${demand} 個のうち、もう ${pct(info.share)} を取れています。これより先は別の商品で。`, `You already take ${pct(info.share)} of your items’ ${demand} / mo demand. Grow with another item.`),
        act: [t('市場データで別の商品を探す', 'Find another item (market data)'), () => openData(ctx)],
      };
    case 'far':
      return {
        text: t(`お客さんの ${pct(info.far)} は、どのお店からも遠い（4 マス以上）家に住んでいます。同じ場所にお店を足しても、自社どうしで取り合うだけです。`, `${pct(info.far)} of customers live 4+ tiles from every shop. A shop next to yours only splits your own customers.`),
        act: [t('離れた区画に 2 軒目', 'A 2nd shop far away'), () => ctx.build?.('general_store', best?.kind === 'shop' ? best.at : undefined)],
      };
    case 'known':
      return {
        text: t(`並べている商品の認知は平均 ${pct(info.known)}。知られていないぶん、売り場の強さが下がっています。`, `Your items are ${pct(info.known)} known on average, which cuts your pull.`),
        act: [t('宣伝する', 'Advertise'), () => openAds(ctx)],
      };
    default:
      return {
        text: t(`自社の取り分は ${pct(info.share)}。同じ商品を売る他社の売り場のほうが強く、お客さんが流れています。`, `Your share is ${pct(info.share)}; rivals selling the same items pull harder.`),
        act: [t('売り場を強くする（スキル）', 'Stronger shops (skills)'), () => openSkills(ctx, canNow(s, 'host') ? 'host' : 'shop')],
      };
  }
}

/** 商品の「なぜ取れていないか」の 1 行 */
export function goodsReason(s: P1State, g: SellInfo['goods'][number]): string {
  const rivals = s.rivals.filter((r) => (r.sells[g.key] ?? 0) > 0).length;
  switch (g.why) {
    case 'saturated':
      return t(`他社 ${rivals} 社が扱っていて飽和（売り場の強さ ×${MARKET.saturated}）。棚を増やしても伸びません。別の商品と入れ替えを。`, `${rivals} rivals sell it: saturated (pull ×${MARKET.saturated}). Swap it for another item.`);
    case 'known':
      return t(`まだ知られていません（認知 ${pct(g.known)}）。並べている日と宣伝で育ちます。`, `Not well known yet (${pct(g.known)}). It grows on shelves and with ads.`);
    case 'far':
      return t(`お客さんの ${pct(g.far)} が、この商品を並べているどのお店からも遠い。離れた家の近くのお店にも並べましょう。`, `${pct(g.far)} of customers are far from every shop stocking it. Stock it at a shop near them.`);
    case 'rival':
      return t(`他社 ${rivals} 社と取り合っています（取り分 ${pct(g.share)}）。看板・接客・ブランド力で売り場を強く。`, `Shared with ${rivals} rival(s) (share ${pct(g.share)}). Strengthen with signs, service and brand.`);
    default:
      return t(`よく取れています（取り分 ${pct(g.share)}）。伸ばすなら別の商品か、遠い家の近くに 2 軒目。`, `Doing well (${pct(g.share)}). To grow: another item, or a 2nd shop near far homes.`);
  }
}

const sumOf = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((a, n) => a + (n ?? 0), 0);

/** 段ごとの状態（ランプ）と課題の文・行き先（openSupply と、段 UIX3b の新しい画面が同じものを使う） */
export type ScmIssues = Record<Stage, { lamp: Lamp; lines: string[]; acts: [string, () => void, string?][] }>;
export function scmIssues(ctx: Ctx, s: P1State, caps: ReturnType<typeof stageCaps>): ScmIssues {
  const ws = myWorkshop(s);
  const shops = myShops(s);
  const buyer = s.staff.find((x) => x.task === 'buy');
  const haulers = s.staff.filter((x) => x.task === 'transport');
  const stock = sumOf(s.stock);
  // ---------------------------------------------------------------- 段ごとの状態と課題
  const issues: Record<Stage, { lamp: Lamp; lines: string[]; acts: [string, () => void, string?][] }> = {
    buy: { lamp: 'ok', lines: [], acts: [[t('調達を開く', 'Open buying'), () => openBuy(ctx), 'is-on']] },
    craft: { lamp: 'ok', lines: [], acts: [[t('工房を開く', 'Open workshop'), () => openWorkshop(ctx), 'is-on']] },
    haul: { lamp: 'ok', lines: [], acts: [[t('ヒーローの配置', 'Assign heroes'), () => openStaff(ctx), 'is-on']] },
    sell: { lamp: 'ok', lines: [], acts: [] },
  };
  const worse = (k: Stage, l: Lamp, line: string) => {
    const order: Lamp[] = ['ok', 'warn', 'stop'];
    if (order.indexOf(l) > order.indexOf(issues[k].lamp)) issues[k].lamp = l;
    issues[k].lines.push(line);
  };
  // ① 調達
  const days = matDays(s);
  if (!buyer) {
    worse('buy', caps.buy.stopped ? 'stop' : 'warn', t('調達係がいないので、素材は手で買っています。ヒーローを雇って調達係にすると自動になります。', 'No buyer: you buy by hand. Hire a hero as buyer to automate it.'));
    issues.buy.acts.push([t('人材登用', 'Recruit'), () => openHire(ctx)]);
  } else if (buyer.resting) worse('buy', 'warn', t('調達係が休憩中です。', 'The buyer is resting.'));
  const tripLeft = s.buyTrip ? Math.max(1, Math.ceil(s.buyTrip.left)) : null;
  if (days != null && days < 4) {
    if (tripLeft != null) worse('buy', 'warn', t(`素材が残り少なめ。調達係があと ${tripLeft} 日で買い付けから戻ります。`, `Materials are low; the buyer returns in ${tripLeft} d.`));
    else worse('buy', days < 1 ? 'stop' : 'warn', t(`素材があと約 ${Math.max(0, Math.floor(days))} 日ぶんしかありません。`, `Only ~${Math.max(0, Math.floor(days))} days of materials left.`));
  }
  if (poolFree(s) <= 2) {
    worse('buy', 'stop', t('置き場所がいっぱいで、これ以上買えません。倉庫を建てましょう。', 'Storage is full; build a warehouse to buy more.'));
    issues.buy.acts.push([t('倉庫を建てる', 'Build a warehouse'), () => ctx.build?.('warehouse')]);
  }
  // ② 製造
  if (!ws) worse('craft', 'stop', t('工房がありません。', 'No workshop yet.'));
  s.slots.forEach((sl, k) => {
    const st = sl.worker != null ? staffOf(s, sl.worker) : null;
    if (!st) worse('craft', 'stop', t(`作業台 ${k + 1} に職人がいません。`, `Bench ${k + 1} has no crafter.`));
    else if (!sl.sku) worse('craft', 'stop', t(`作業台 ${k + 1} で作るものが決まっていません。`, `Bench ${k + 1} has nothing to make.`));
    else if (st.resting) worse('craft', 'warn', t(`作業台 ${k + 1} の職人が休憩中です。`, `Bench ${k + 1}'s crafter is resting.`));
    else if (!sl.running) {
      const e = craftCheck(s, sl.sku, sl.worker);
      if (e === 'mats')
        worse(
          'craft',
          tripLeft != null ? 'warn' : 'stop',
          tripLeft != null ? t(`作業台 ${k + 1}：素材待ち（調達係があと ${tripLeft} 日で戻ります）。`, `Bench ${k + 1}: waiting for materials (buyer back in ${tripLeft} d).`) : t(`作業台 ${k + 1}：素材が足りません。`, `Bench ${k + 1}: not enough materials.`),
        );
      else if (e === 'full') worse('craft', 'stop', t(`作業台 ${k + 1}：置き場所がいっぱいです。`, `Bench ${k + 1}: storage is full.`));
    }
  });
  // 作っているのに、どのお店にも並べていない
  for (const x of new Set(s.slots.map((y) => y.sku).filter((y): y is Sku => !!y)))
    if (shops.length && !shops.some((b) => s.shops[b.uid].shelves.includes(x))) worse('craft', 'warn', t(`「${skuName(x)}」を並べているお店がありません。`, `No shop sells ${skuName(x)}.`));
  // ③ 物流
  if (!haulers.length && shops.length) worse('haul', 'stop', t('物流の担当がいないので、商品がお店に届きません。', 'No hauler: goods never reach the shops.'));
  else if (haulers.every((x) => x.resting) && haulers.length) worse('haul', 'warn', t('運搬係が全員休憩中です。', 'All haulers are resting.'));
  if (stock > TRANSPORT.cap * 2) worse('haul', 'warn', t(`工房に運ぶ前の商品が ${stock} 個たまっています。`, `${stock} goods are waiting at the workshop.`));
  // 工房から遠いお店：運ぶのに日数がかかる（物流拠点・トラックで縮む）
  for (const b of shops) {
    const way = oneWay(s, b);
    if (way.days > 2.5) {
      worse('haul', 'warn', t(`${DEF[b.id].name}は工房から遠く、片道 ${way.days.toFixed(1)} 日かかります。`, `${DEF[b.id].name} is far: ${way.days.toFixed(1)} days one way.`));
      if (!issues.haul.acts.some((a) => a[2] === 'hub')) issues.haul.acts.push(has(s, 'hub') ? [t('物流拠点を建てる', 'Build a hub'), () => ctx.build?.('logistics'), 'hub'] : [t('物流拠点を調べる', 'About hubs'), () => openSkills(ctx, 'logi'), 'hub']);
    }
  }
  // ④ 販売
  if (!shops.length) {
    worse('sell', 'stop', t('お店がありません。', 'No shop yet.'));
    issues.sell.acts.push([t('お店を建てる', 'Build a shop'), () => ctx.build?.('general_store'), 'is-on']);
  }
  for (const b of shops) {
    const sh = s.shops[b.uid];
    const st = sh.staff != null ? staffOf(s, sh.staff) : null;
    const name = DEF[b.id].name;
    if (!sh.shelves[0]) worse('sell', 'stop', t(`${name}：並べる商品が決まっていません。`, `${name}: no product chosen.`));
    if (!st && sh.part === 0) worse('sell', 'stop', t(`${name}：売り場に人がいません。`, `${name}: nobody on the floor.`));
    else if (st?.resting && sh.part === 0) worse('sell', 'warn', t(`${name}：店員が休憩中です。`, `${name}: the clerk is resting.`));
    const main = sh.shelves[0];
    const making = s.slots.map((y) => y.sku).filter((y): y is Sku => !!y);
    if (main && !making.includes(main) && (sh.shelf[main] ?? 0) <= 0 && (sh.storage[main] ?? 0) <= 0 && !(s.stock[main] ?? 0))
      worse('sell', 'stop', t(`${name}：「${skuName(main)}」は工房で作っていません。作っているものを並べましょう。`, `${name}: ${skuName(main)} isn't being crafted. Shelve what you make.`));
    else if (main && (sh.shelf[main] ?? 0) <= 0 && (sh.storage[main] ?? 0) <= 0) worse('sell', 'warn', t(`${name}：主力商品が品切れです。`, `${name}: the main product is sold out.`));
    if ((sh.aw ?? 1) < 0.7) worse('sell', 'warn', t(`${name}：まだ知られていません（認知度 ${Math.round((sh.aw ?? 1) * 100)}%）。宣伝すると早く広まります。`, `${name}: not well known yet (${Math.round((sh.aw ?? 1) * 100)}%). Ads help.`));
  }
  if (shops.length) issues.sell.acts.push([t('お店を開く', 'Open shop'), () => openShop(ctx, shops[0].uid), 'is-on'], [t('宣伝広報', 'Advertising'), () => openAds(ctx)]);
  return issues;
}

/** SCM ダッシュボード。breakdown：④ 販売の内訳を開いた状態にして、そこまで送る（販売管理の「販売の内訳」から） */
export function openSupply(ctx: Ctx, opt: { breakdown?: boolean } = {}) {
  // 段 UIX3b：新しい画面（uix/screens/supply.ts）
  return uxb.supply!(ctx, opt);
}
