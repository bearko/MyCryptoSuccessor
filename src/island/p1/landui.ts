/**
 * 会社ぜんたいの画面：ランドマップ（関所の先のセクタ・セクタマネージャー）・決算書（四半期の P/L・B/S）・ブランド力。
 * docs/ISLAND_PHASE1.md「ランドマップとセクタ」「決算書」「ブランド力」。
 */
import { t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { BRAND, BRAND_CAP, SECTORS, SKILLS, type SectorDef } from './data';
import { gradeName, gradeNext, gradeOf } from './mkt';
import { flameCard } from './csui';
import { TIER_NAME, brandCap, brandPull, topTierOf, sectorDef, sectorState, tierLabel, type SectorState } from './company';
import { letterLockOf, hasBusiness, moveTo, type MoveErr } from './land';
import { reviveView } from './reset';
import { date, lvMul, type P1State } from './model';
import { sectorHeadOk } from './deleg';
import { pickHero } from './heroui';
import { adjacent } from './world';
import { open, type Ctx } from './screens';
import { h, heroName, money, signed } from './ui';
import { arw, histBox, type TSer } from './chartkit';
import { brandHist } from './dash';
import { uxw } from '../uix/screens/w-slots';
import { uxk } from '../uix/screens/k-slots';
import { uxr } from '../uix/screens/r-slots';

// ---------------------------------------------------------------- ランドマップ

/**
 * 地図の上の道（セクタどうしのつながり）。同じランクの中は、つながった地図の隣どうし（grid が上下左右に 1 違い）。
 * ランクの間は、上のランクへ進む道（つながった地図ではつながらない。ランクが違えば別の階層）。
 */
export const ROADS: [string, string][] = [
  ...SECTORS.flatMap((a) => SECTORS.filter((b) => a.id < b.id && adjacent(a.id, b.id)).map((b): [string, string] => [a.id, b.id])),
  ['c3', 'u1'],
  ['c6', 'u2'],
  ['c8', 'u3'],
  ['u4', 'r1'],
  ['u5', 'r2'],
  ['r3', 'e1'],
  ['r4', 'e3'],
  ['r3', 'l1'],
  ['r4', 'l1'],
  ['e2', 'l1'],
];

/** ランドセクタの絵（MCH のランドセクタ。はじまりの国 Lime の 5 ランク） */
const TIER_IMG: Record<SectorDef['tier'], string> = { C: '1_Common', U: '2_Uncommon', R: '3_Rare', E: '4_Epic', L: '5_Legendary' };
export const sectorIcon = (tier: SectorDef['tier']) => assetUrl(`mch/Image/LandSectors/04_Lime_${TIER_IMG[tier]}.png`);

export const TIER_NOTE: Record<SectorDef['tier'], string> = {
  C: t('いまと同じくらいの広さと商売敵。出店許可申請の費用も軽い。', 'About the same size and rivals as now. The permit is cheap.'),
  U: t('地図が広く、商売敵の規模が大きい。1 位を取ると、他社がセールで巻き返してくる。Common の商品は相手にされにくいので、エクステのランクアップが鍵（サプライチェーンの強化を楽しむセクタ）。', 'A wider map with bigger rivals who strike back with sales when you take #1. Common goods barely sell here, so ranking up your extensions is key.'),
  R: t('他社のお店が乱立する、栄えた市場。お客さんは近くの店へ行くので、店の場所で商圏を取り合う。他社の店を撤退させ、空いた店舗にすかさず出店しよう（営業の部門が開く）。', 'A crowded, thriving market. Customers shop nearby, so you fight over trade areas with where you build. Drive rival stores out and move into the vacancies (the Sales department opens).'),
  E: t('Rare よりさらに大きな商売敵が店を並べる大きな市場（商圏の取り合いもある）。Epic の復刻品と、ダンジョンで掘ってきた骨董がよく売れる。法務の部門が開き、他社を M&A で買収できる町。', 'A big market where even larger rivals line up their stores (trade areas too). Epic revivals and antiques from your dungeon digs sell well. The Legal department opens, and you can acquire rivals through M&A.'),
  L: t('ブランド力で売る総力戦。街そのものを作り変える（準備中）。', 'A brand-power showdown where you reshape the city (coming soon).'),
};

export const stateText = (s: P1State, d: SectorDef, st: SectorState): string => {
  switch (st) {
    case 'here':
      return t('いまここ', 'You are here');
    case 'mine': {
      const rec = s.land?.recs[d.id];
      const m = rec?.manager != null ? heroName(rec.manager) : null;
      return m ? t(`セクター長：${m}`, `Sector head: ${m}`) : t('出店済み', 'Opened');
    }
    case 'open':
      return t(`出店許可 ${money(d.fee)}`, `Permit ${money(d.fee)}`);
    case 'soon':
      return t('準備中', 'Coming soon');
    case 'locked':
      return t('まだ開放されていない', 'Locked');
    case 'cloud':
      return t('雲に覆われている', 'Under clouds');
  }
};

/** 開放の条件（Rare など） */
export function needText(s: P1State, d: SectorDef): string {
  if (!d.need) return '';
  const have = (s.land?.mine ?? []).filter((x) => sectorDef(x).tier === d.need!.tier).length;
  const tier = tierLabel(d.need.tier);
  return t(`${tier}に ${d.need.n} つ出店で開放（いま ${have}/${d.need.n}）`, `Opens after opening in ${d.need.n} ${tier}s (now ${have}/${d.need.n})`);
}

const ERR: Record<MoveErr, string> = {
  'no-land': t('関所を開くと、ほかのセクタへ行けます', 'Open the gate to reach other sectors'),
  here: t('いまいるセクタです', 'You are already here'),
  cloud: t('雲に覆われていて、まだ行けません', 'Still under clouds'),
  locked: t('まだ開放されていません', 'Not unlocked yet'),
  soon: t('このセクタは準備中です', 'This sector is coming soon'),
  letter: '',
  money: t('資金が足りません', 'Not enough funds'),
  manager: t('セクター長を選んでください', 'Pick a sector head'),
  busy: t('そのヒーローは、ほかのセクタのセクター長です', 'That hero heads another sector'),
};

/** 移る：いまのセクタに建物があれば、まずマネージャーを選ぶ（ランドマップの「出店する」・地図の「このセクタに進出」） */
export function startMove(ctx: Ctx, target: string) {
  const s = ctx.s();
  const cur = sectorDef(s.land!.cur);
  const go = (hero: number | null) => {
    const fresh = sectorState(s.land!, target) === 'open';
    // 開放の条件があるセクタ（Rare など）が、この出店で開くか
    const gated = SECTORS.filter((x) => x.need && sectorState(s.land!, x.id) === 'locked').map((x) => x.id);
    const e = moveTo(s, target, hero);
    if (e) {
      ctx.toast(e === 'letter' ? letterLockOf(s, target) : ERR[e]);
      ctx.sfx?.('error');
      return;
    }
    ctx.save();
    ctx.moved?.(target, fresh, hero);
    const opened = gated.filter((id) => sectorState(s.land!, id) !== 'locked');
    // 段 UIX3w：管制卓のお知らせの帯で出す（文は同じ）
    const road = (text: string) => uxw.road!({ host: ctx.root, text, names: opened.map((id) => sectorDef(id).name) });
    if (opened.length === 1) road(t(`${sectorDef(opened[0]).name}への道が開いた！（遊びは次の更新で）`, `The road to ${sectorDef(opened[0]).name} is open! (Playable in a future update)`));
    else if (opened.length) {
      const tier = tierLabel(sectorDef(opened[0]).tier);
      road(t(`${tier} ${opened.length} つへの道が開いた！（遊びは次の更新で）`, `Roads to ${opened.length} ${tier}s are open! (Playable in a future update)`));
    }
  };
  if (!hasBusiness(s)) return go(null);
  pickHero(ctx.root, s, {
    title: t(`「${cur.name}」のセクター長`, `Sector head for ${cur.name}`),
    task: 'manager',
    current: null,
    note:
      t(
        '離れているあいだ、このセクタの運営を任せるヒーロー（セクター長）を選びます。能力値の合計が高いほど売上が上がりやすく、低いと下振れします（赤字もあります）。ほかのヒーローは一緒に移ります。リーダー・部長からも昇進できます。',
        'Pick the hero who runs this sector while you are away (sector head). Higher total stats tend to raise sales; low ones can mean losses. Everyone else comes with you. Leaders and heads can be promoted.',
      ) + sectorNeedNote(s),
    onPick: (hero) => hero != null && go(hero),
  });
}

/** セクター長の任命の条件（段 D。事業部長が 3 部門以上。いまは表示だけ＝準備中） */
function sectorNeedNote(s: P1State): string {
  const ok = sectorHeadOk(s);
  return ok.ready
    ? t(`（条件：事業部長が ${ok.need} 部門以上・いま ${ok.heads}）`, ` (Needs ${ok.need}+ division heads; now ${ok.heads})`)
    : t(`（セクター長の条件「事業部長が ${ok.need} 部門以上」は準備中：いま ${ok.heads} 部門。いまは条件なしで任命できます）`, ` (The “${ok.need}+ division heads” condition is coming soon: now ${ok.heads}. No condition for now)`);
}

/** 復興の札の 1 行：「🏚 復興 3 / 8 軒・支援金 残り 42,000 G・担当 ○○」 */
export function reviveLine(rv: NonNullable<ReturnType<typeof reviveView>>): string {
  const who = rv.hero != null ? t(`・担当 ${heroName(rv.hero)}`, ` · ${heroName(rv.hero)}`) : t('・担当なし', ' · no one assigned');
  const funded = rv.fund > 0 || (rv.rec.revive?.spent ?? 0) > 0;
  const fund = rv.out ? t('・支援金が尽きた', ' · funds ran out') : funded ? t(`・支援金 残り ${money(rv.fund)}`, ` · ${money(rv.fund)} left`) : t('・支援金なし', ' · no funds');
  return t(`🏚 復興 ${rv.fixed} / ${rv.all} 軒`, `🏚 Rebuilt ${rv.fixed} / ${rv.all}`) + fund + who;
}

/**
 * ランクアップの進出の確認（発掘 v2 の 7 段目）：失うもの・残るもの・マインちゃんの一言（寄付パネルを開く）・「進出する」「まだやめておく」。
 * 進出すると、いまのセクタのマネージャーを選んで（いまの流れ）、災害と徴収の演出（disaster.ts）へ
 */
export function openRankUp(ctx: Ctx, target: string) {
  // 段 UIX3w：管制卓の画面へ
  return uxw.rankUp!(ctx, target);
}

/**
 * 被災した町（ほかのセクタ）の復興の箱：進み・支援金・担当・「復興を任せる」（ヒーローと支援金）。お題と出土品は手で掘る
 */
export function reviveBox(ctx: Ctx, s: P1State, id: string): HTMLElement {
  // 段 UIX4r：管制卓の箱へ
  return uxr.reviveBox!(ctx, s, id);
}

/** 復興を任せる画面：担当（いまの担当 or ほかのヒーロー）と、送る支援金（3 つの額） */
export function openDelegate(ctx: Ctx, id: string, hero0?: number) {
  return uxr.delegate!(ctx, id, hero0);
}

export function openLand(ctx: Ctx) {
  // 段 UIX3w：管制卓の航路図へ
  return uxw.land!(ctx);
}

/** マネージャーが運営しているセクタ：担当・先月の結果・投資の割合 */
export function managerBox(ctx: Ctx, s: P1State, id: string): HTMLElement {
  return uxr.managerBox!(ctx, s, id);
}

export function openBooks(ctx: Ctx) {
  // 段 UIX3k：新しい画面（uix/screens/books.ts）へ
  return uxk.books!(ctx);
}

// ---------------------------------------------------------------- ブランド力

export function openBrand(ctx: Ctx) {
  open(ctx, t('ブランド力', 'Brand power'), (body) => {
    const s = ctx.s();
    const v = s.brand ?? 0;
    // 段 G：炎上のおそれ・炎上中の札（スマホは上の帯のブランド力の札の印から来る）
    const fc = flameCard(ctx, s);
    if (fc) body.append(fc);
    const top = h('div', 'isl-card2 isl-brand-top');
    top.append(h('small', 'isl-dim', t('いまのブランド力', 'Brand power')), h('b', 'isl-brand-big', `★ ${v}`), h('small', 'isl-good', t(`売り場の強さ +${Math.round((brandPull(v, lvMul(s, 'd_ops')) - 1) * 100)}%（最大 +${Math.round(BRAND.pullCap * (1 + lvMul(s, 'd_ops')) * 100)}%）`, `Shop pull +${Math.round((brandPull(v, lvMul(s, 'd_ops')) - 1) * 100)}% (max +${Math.round(BRAND.pullCap * (1 + lvMul(s, 'd_ops')) * 100)}%)`)));
    // 段 H1：ブランド力の上限（出店したいちばん上のランクで決まる。上のランクの町に出店すると上がる）
    const cap = brandCap(s);
    const top0 = topTierOf(s);
    const up = (['U', 'R', 'E', 'L'] as const).find((x) => BRAND_CAP[x] > cap);
    top.append(
      h(
        'small',
        v >= cap ? 'isl-warn' : 'isl-dim',
        up
          ? t(`上限 ★ ${cap}（${TIER_NAME[top0]}。${TIER_NAME[up]} の町に出店すると ★ ${BRAND_CAP[up]} に）`, `Cap ★ ${cap} (${TIER_NAME[top0]}; ★ ${BRAND_CAP[up]} once you open in a ${TIER_NAME[up]} town)`)
          : t(`上限 ★ ${cap}`, `Cap ★ ${cap}`),
      ),
    );
    // 段 G：企業の格（ブランド力から決まる段。くわしくはマーケ → 広報と企業の格）
    const nx = gradeNext(s);
    top.append(h('small', 'isl-dim', nx ? t(`企業の格：${gradeName(gradeOf(s))}（次の「${nx.name}」まで あと ${nx.need}）`, `Standing: ${gradeName(gradeOf(s))} (${nx.need} more to “${nx.name}”)`) : t(`企業の格：${gradeName(gradeOf(s))}`, `Standing: ${gradeName(gradeOf(s))}`)));
    body.append(top);
    // 段 UI8b：ブランド力の推移（月の締め）と上限の線。記録の無い以前の月は、月の増えからさかのぼった値（点線）
    const bh = brandHist(s.reports, s.brandStart ?? v);
    const rec = bh.map((x) => (x.est ? null : x.v));
    const est = bh.map((x, k) => (x.est || (k > 0 && bh[k - 1].est && !x.est) ? x.v : null));
    const series: TSer[] = [{ name: t('ブランド力', 'Brand'), kind: 'line', cls: 'is-gold', vals: rec }];
    if (bh.some((x) => x.est)) series.push({ name: t('さかのぼった値', 'Back-calculated'), kind: 'dash', cls: 'is-grey', vals: est });
    const d1 = bh.length >= 2 ? bh[bh.length - 1].v - bh[bh.length - 2].v : 0;
    const bx = histBox({
      title: t('ブランド力の推移（月の締め）', 'Brand at each close'),
      note: t(`先月の締めから ${arw(d1)} ${signed(d1)}・上限 ★ ${cap}`, `${arw(d1)} ${signed(d1)} since last close · cap ★ ${cap}`),
      months: bh.map((x) => x.month),
      series,
      refs: [{ v: cap, label: t(`上限 ★ ${cap}`, `Cap ★ ${cap}`), cls: 'is-goal' }],
      lo: 0,
      fmt: (x) => `★ ${Math.round(x)}`,
      aria: t(`ブランド力の推移：いま ★ ${v}・上限 ★ ${cap}`, `Brand: now ★ ${v}, cap ★ ${cap}`),
    });
    if (bx) body.append(bx);
    // ブランド力が要るスキル
    const sk = h('div', 'isl-card2');
    sk.append(h('h3', '', t('ブランド力で開くスキル', 'Skills unlocked by brand')));
    for (const k of SKILLS.filter((x) => x.brand).sort((a, b) => (a.brand ?? 0) - (b.brand ?? 0))) {
      // v2：ブランド力が要るパネルは外周（Uncommon・Rare）。外周が開いていなければ、エリアの名前を添える
      const tier = k.tier ?? 'C';
      const closed = tier !== 'C' && !s.flags.rings?.includes(tier);
      const r = h('div', `isl-brand-skill ${v >= (k.brand ?? 0) && !closed ? 'is-on' : ''}`);
      r.append(h('b', '', `★ ${k.brand}`), h('span', '', k.name), h('small', 'isl-dim', closed ? t(`${k.note}（${TIER_NAME[tier]} のセクタに進出すると開く）`, `${k.note} (opens in a ${TIER_NAME[tier]} sector)`) : k.note));
      sk.append(r);
    }
    body.append(sk);
    const how = h('div', 'isl-card2');
    how.append(h('h3', '', t('上がるとき・下がるとき', 'What moves it')));
    const ul = h('ul', 'isl-brand-how');
    for (const line of [
      t(`ランドセクタを制覇（2 か月続けて 1 位）：+${BRAND.sectorTop}（そのあと守った月は +${BRAND.stayTop}）`, `Conquer a land sector (#1 two months running): +${BRAND.sectorTop} (+${BRAND.stayTop} each month you stay)`),
      t(`順位が上がる：1 つにつき +${BRAND.rankUp}`, `Rank up: +${BRAND.rankUp} per place`),
      t(`依頼を達成：+${BRAND.mission}・アンコモンを開発：+${BRAND.uncommon}・関所を開通：+${BRAND.gate}`, `Request: +${BRAND.mission} · Uncommon: +${BRAND.uncommon} · Gate: +${BRAND.gate}`),
      t(`新しいセクタに出店：Common +${BRAND.enter.C}・Uncommon +${BRAND.enter.U}`, `Open in a new sector: Common +${BRAND.enter.C} · Uncommon +${BRAND.enter.U}`),
      t(`順位が 2 つ以上下がる：1 つにつき −${BRAND.rankDown}`, `Rank falls 2+ places: −${BRAND.rankDown} per place`),
      t(`不祥事が発覚する（妨害工作など。これから）：−${BRAND.scandal}`, `Scandals (sabotage, later): −${BRAND.scandal}`),
    ])
      ul.append(h('li', '', line));
    how.append(ul);
    body.append(how);
    const log = h('div', 'isl-card2');
    log.append(h('h3', '', t('最近の動き', 'Recent changes')));
    if (!s.brandLog?.length) log.append(h('p', 'isl-dim', t('まだありません。最初の売上や依頼の達成で上がります。', 'Nothing yet. Your first sale or request will raise it.')));
    for (const e of s.brandLog ?? []) {
      const r = h('div', 'isl-brand-log');
      r.append(h('b', e.d > 0 ? 'isl-good' : 'isl-bad', signed(e.d)), h('span', '', e.why), h('small', 'isl-dim', dayLabel(s, e.day)));
      log.append(r);
    }
    body.append(log);
  });
}

function dayLabel(s: P1State, day: number): string {
  const d = date({ day, open: s.open });
  return d ? t(`${d.year} 年目 ${d.month} 月 ${d.day} 日`, `Y${d.year} M${d.month} D${d.day}`) : t(`${day} 日目`, `Day ${day}`);
}
