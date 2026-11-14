/**
 * 人事の画面（段 E2。docs/ISLAND_PHASE1.md「カリスマ度」「士気と給与」）：
 * - カリスマ度の札（雇う画面の上・経営企画 → 経営者）：「カリスマ 42：レアまで雇える（エピックまで あと 18）」と、しきい値の目盛り・内訳
 * - 給与・労務（人事 → 給与・労務）：ヒーローごとの士気（帯と働きの速さ）・辞めたいの札と引き止めの面談・月給と相場・給与の段の上げ下げ・賞与・休み
 * - 月次報告の「👥 士気と給与」の文
 */
import { t } from '../../i18n';
import { CHARISMA, HERO_RARITY, HIRE_RARITIES, type HeroRarity } from './data';
import { rarityBadge } from './growthui';
import {
  capAt,
  charismaLine,
  charismaParts,
  hireCap,
  moraleBand,
  moraleMul,
  moraleOf,
  moraleParts,
  payGap,
  type MoraleBand,
} from './hr';
import { has, type P1State, type Report, type Staff } from './model';
import { type Ctx } from './screens';
import { h, heroName } from './ui';
import { PALETTE, legendEl, swatch } from './chartkit';
import { charismaSegs } from './dash';
import { uxh } from '../uix/screens/h-slots';

// ---------------------------------------------------------------- カリスマ度

/** カリスマ度の札：1 行（雇えるレアリティ）・0〜100 の目盛り（しきい値の印）・内訳 */
export function charismaCard(s: P1State, opts: { detail?: boolean } = {}): HTMLElement {
  const p = charismaParts(s);
  const v = p.total;
  const card = h('div', 'isl-card2 isl-charisma');
  const top = hireCap(s, v);
  card.style.setProperty('--c', HERO_RARITY[top].color);
  card.append(h('b', 'isl-charisma-line', `👑 ${charismaLine(s, v)}`));
  // 目盛り：しきい値ごとに印（届いた印は色つき）
  const track = h('div', 'isl-charisma-track');
  // 段 UI8c：棒は出どころごとの切れを積み上げ（色と模様。下に見本・名前・数）。しきい値の印はそのまま
  const segs = charismaSegs(p);
  let at0 = 0;
  for (const g of segs) {
    const seg = h('i', `isl-charisma-seg isl-cv-pseg is-${g.pat}`);
    seg.style.setProperty('--c', PALETTE[g.col]);
    seg.style.left = `${Math.min(100, (at0 / CHARISMA.max) * 100)}%`;
    seg.style.width = `${Math.max(0, Math.min(100 - (at0 / CHARISMA.max) * 100, (g.v / CHARISMA.max) * 100))}%`;
    track.append(seg);
    at0 += g.v;
  }
  track.setAttribute('role', 'img');
  track.setAttribute('aria-label', t(`カリスマ度 ${v} / ${CHARISMA.max}`, `Charisma ${v} / ${CHARISMA.max}`));
  for (const r of HIRE_RARITIES) {
    const at = capAt(r);
    if (!at) continue;
    const mk = h('span', `isl-charisma-mark ${v >= at ? 'is-on' : ''}`, HERO_RARITY[r].short);
    mk.style.left = `${(at / CHARISMA.max) * 100}%`;
    mk.style.setProperty('--c', HERO_RARITY[r].color);
    mk.title = t(`${HERO_RARITY[r].name}：カリスマ ${at} から`, `${HERO_RARITY[r].name}: from charisma ${at}`);
    track.append(mk);
  }
  card.append(track);
  // 内訳の見本（色だけに頼らない：模様と名前と数）と、次のしきい値まで
  if (segs.length) card.append(legendEl(segs.map((g) => ({ cls: '', name: `${g.name} +${g.v}`, sw: swatch(g) }))));
  else card.append(h('small', 'isl-dim', t('まだ 0。町を制覇すると上がる', 'Still 0. Conquer a town to raise it')));
  const nx = HIRE_RARITIES.find((r) => capAt(r) > v);
  if (nx) card.append(h('small', 'isl-dim isl-charisma-next', t(`次の「${HERO_RARITY[nx].name}」まで あと ${capAt(nx) - v}`, `${capAt(nx) - v} more to ${HERO_RARITY[nx].name}`)));
  if (opts.detail) {
    card.append(
      h(
        'p',
        'isl-dim',
        t(
          `上がり方：町の制覇（Common +${CHARISMA.clear.C}・Uncommon +${CHARISMA.clear.U}・Rare +${CHARISMA.clear.R}）・研究成果の発表（+${CHARISMA.present.C}〜${CHARISMA.present.R}）・ブランド力（いちばん高かった値 ${CHARISMA.brand.per} ごとに +1、+${CHARISMA.brand.max} まで）・人事のパネル「採用ブランド」（+${CHARISMA.panel}）。ランクアップの災害でも減りません。`,
          `Raised by conquering towns (Common +${CHARISMA.clear.C}, Uncommon +${CHARISMA.clear.U}, Rare +${CHARISMA.clear.R}), presenting findings (+${CHARISMA.present.C}–${CHARISMA.present.R}), brand (+1 per ${CHARISMA.brand.per} of your best brand, up to +${CHARISMA.brand.max}) and the HR panel Employer brand (+${CHARISMA.panel}). Disasters never lower it.`,
        ),
      ),
    );
    const rows = h('div', 'isl-charisma-rows');
    for (const r of HIRE_RARITIES) {
      const at = capAt(r);
      const row = h('div', `isl-charisma-row ${v >= at ? 'is-on' : ''}`);
      row.append(rarityBadge(r), h('span', '', HERO_RARITY[r].name), h('small', 'isl-dim', at ? t(`カリスマ ${at} から`, `From ${at}`) : t('最初から', 'From the start')), h('small', '', rarityHow(r)));
      rows.append(row);
    }
    card.append(rows);
  }
  return card;
}
/** レアリティの候補がどこから来るか（雇う画面の一言） */
export function rarityHow(r: HeroRarity): string {
  if (r === 'C') return t('人材の募集（ノービス・コモン）', 'Recruiting (Novice, Common)');
  if (r === 'U') return t('候補に来る（憧れの職場なら必ず 1 人）', 'Come as candidates (always one with Dream employer)');
  if (r === 'R') return t('パネル「ヘッドハンティング」で 1 人', 'One via the Headhunting panel');
  return t('毎月 1 人（格の候補）', 'One each month (prestige pick)');
}
/** 雇う画面の注意：パネルはあるのにカリスマ度が足りない */
export function charismaNeeds(s: P1State): string[] {
  const out: string[] = [];
  const cap = hireCap(s);
  const lack = (r: HeroRarity) => HIRE_RARITIES.indexOf(cap) < HIRE_RARITIES.indexOf(r);
  if (has(s, 'b_scout') && lack('U')) out.push(t(`憧れの職場のアンコモンの枠は、カリスマ ${capAt('U')} から来ます`, `Dream employer’s Uncommon slot opens at charisma ${capAt('U')}`));
  if (has(s, 'headhunt') && lack('R')) out.push(t(`ヘッドハンティングのレアは、カリスマ ${capAt('R')} から来ます`, `Headhunted Rares come from charisma ${capAt('R')}`));
  return out;
}

/** 経営企画 → 経営者：カリスマ度のくわしい札 */
export function openCharisma(ctx: Ctx) {
  // 段 UIX3h：新しい画面（uix/screens/hr.ts）
  return uxh.charisma!(ctx);
}

// ---------------------------------------------------------------- 士気と給与

export const BAND_NAME: Record<MoraleBand, string> = {
  high: t('やる気', 'Fired up'),
  ok: t('ふつう', 'Steady'),
  low: t('低い', 'Low'),
  bad: t('とても低い', 'Very low'),
};
const BAND_COLOR: Record<MoraleBand, string> = { high: 'var(--isl-gold)', ok: 'var(--isl-good)', low: '#ffb84d', bad: 'var(--isl-bad)' };
/** 士気の札（数・帯・働きの速さ） */
export function moraleChip(st: Staff): HTMLElement {
  const b = moraleBand(st);
  const m = Math.round(moraleOf(st));
  const mul = moraleMul(st);
  const e = h('span', `isl-morale is-${b}`, t(`士気 ${m}（${BAND_NAME[b]}・速さ ×${mul.toFixed(2)}）`, `Morale ${m} (${BAND_NAME[b]}, speed ×${mul.toFixed(2)})`));
  e.style.setProperty('--c', BAND_COLOR[b]);
  return e;
}
/** 相場との差の文 */
export function gapText(st: Staff): string {
  const g = payGap(st);
  if (Math.abs(g) < 0.25) return t('相場どおり', 'At market');
  const n = Math.abs(g) < 0.75 ? t('少し', 'a little') : t(`${Math.round(Math.abs(g))} 段`, `${Math.round(Math.abs(g))} step(s)`);
  return g > 0 ? t(`相場より${n}上`, `${n} above market`) : t(`相場より${n}下`, `${n} below market`);
}
/** 士気の目標の内訳（「目標 52 ＝ ふつう 55・給与 −10・職場 +4・同じ仕事 −2」） */
export function partsText(s: P1State, st: Staff): string {
  const p = moraleParts(s, st);
  const sg = (v: number) => (v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`);
  const xs = [
    t(`ふつう ${p.base}`, `base ${p.base}`),
    p.pay ? t(`給与 ${sg(p.pay)}`, `pay ${sg(p.pay)}`) : '',
    p.env ? t(`職場の環境 ${sg(p.env)}`, `workplace ${sg(p.env)}`) : '',
    p.role ? t(`役目 ${sg(p.role)}`, `role ${sg(p.role)}`) : '',
    p.table ? t(`給与テーブル ${sg(p.table)}`, `pay scale ${sg(p.table)}`) : '',
    p.same ? t(`同じ仕事の続きすぎ ${sg(p.same)}`, `same job too long ${sg(p.same)}`) : '',
    // 総務（段 F）：疲れ
    Math.round(p.tired) ? t(`疲れ ${sg(p.tired)}`, `fatigue ${sg(p.tired)}`) : '',
    // 段 P2：ヒーローの組み合わせ
    p.duo ? t(`組み合わせ ${sg(p.duo)}`, `pairing ${sg(p.duo)}`) : '',
    // 段 I2：経営会議の目標の重さ
    Math.round(p.goal) ? t(`目標の重さ ${sg(p.goal)}`, `target pressure ${sg(p.goal)}`) : '',
    // 段 K：経営方針
    Math.round(p.pol) ? t(`経営方針 ${sg(p.pol)}`, `policy ${sg(p.pol)}`) : '',
  ].filter(Boolean);
  return t(`士気の目標 ${Math.round(p.total)} ＝ ${xs.join('・')}`, `Morale target ${Math.round(p.total)} = ${xs.join(', ')}`);
}

/** 人事 → 給与・労務 */
export function openPayroll(ctx: Ctx) {
  return uxh.payroll!(ctx);
}

// ---------------------------------------------------------------- 月次報告

/** 月次報告の「👥 士気と給与」の文（長い・短い）。無ければ null */
export function hrReportText(r: Report): [string, string] | null {
  const x = r.hr;
  if (!x || x.avg == null) return null;
  const long = [
    t(`士気の平均 ${x.avg}`, `Avg morale ${x.avg}`),
    x.want ? t(`辞めたい ${x.want} 人`, `${x.want} want to quit`) : '',
    x.stay.length ? t(`思いとどまった ${x.stay.length} 人`, `${x.stay.length} stayed`) : '',
    x.quit.length ? t(`辞めた ${x.quit.map(heroName).join('・')}`, `Quit: ${x.quit.map(heroName).join(', ')}`) : '',
    x.charisma ? t(`カリスマ +${x.charisma}（いま ${x.ch}）`, `Charisma +${x.charisma} (now ${x.ch})`) : '',
  ].filter(Boolean);
  const short = [
    t(`士気 ${x.avg}`, `Morale ${x.avg}`),
    x.want ? t(`辞めたい ${x.want}`, `Quitting ${x.want}`) : '',
    x.quit.length ? t(`辞めた ${x.quit.length}`, `Quit ${x.quit.length}`) : '',
    x.charisma ? t(`カリスマ +${x.charisma}`, `Charisma +${x.charisma}`) : '',
  ].filter(Boolean);
  return [long.join(t('・', ', ')), short.join(t('・', ', '))];
}
