/**
 * 人事の画面（段 E2。docs/ISLAND_PHASE1.md「カリスマ度」「士気と給与」）：
 * - カリスマ度の札（雇う画面の上・経営企画 → 経営者）：「カリスマ 42：レアまで雇える（エピックまで あと 18）」と、しきい値の目盛り・内訳
 * - 給与・労務（人事 → 給与・労務）：ヒーローごとの士気（帯と働きの速さ）・辞めたいの札と引き止めの面談・月給と相場・給与の段の上げ下げ・賞与・休み
 * - 月次報告の「👥 士気と給与」の文
 */
import { t } from '../../i18n';
import { CHARISMA, HERO_RARITY, HIRE_RARITIES, MORALE, PAY, SALARY, type HeroRarity } from './data';
import { rarityBadge } from './growthui';
import {
  capAt,
  charismaLine,
  charismaParts,
  cutPay,
  hireCap,
  marketPay,
  marketStep,
  moraleBand,
  moraleMul,
  moraleOf,
  moraleParts,
  payGap,
  payOf,
  payStep,
  payroll,
  quitLeft,
  stepWage,
  talk,
  wantsToQuit,
  moraleAvg,
  type MoraleBand,
} from './hr';
import { bonus, bonusCost, has, raise, setRest, wageMul, type P1State, type Report, type Staff } from './model';
import { after, open, type Ctx } from './screens';
import { bar, btn, h, heroIcon, heroName, money } from './ui';

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
  const fill = h('i', 'isl-charisma-fill');
  fill.style.width = `${Math.min(100, (v / CHARISMA.max) * 100)}%`;
  track.append(fill);
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
  const parts = [
    p.clear ? t(`町の制覇 +${p.clear}`, `Conquests +${p.clear}`) : '',
    p.present ? t(`研究成果の発表 +${p.present}`, `Findings +${p.present}`) : '',
    p.brand ? t(`ブランド力 +${p.brand}`, `Brand +${p.brand}`) : '',
    p.panel ? t(`採用ブランド +${p.panel}`, `Employer brand +${p.panel}`) : '',
    p.extra ? t(`テスト +${p.extra}`, `Test +${p.extra}`) : '',
  ].filter(Boolean);
  card.append(h('small', 'isl-dim', parts.length ? t(`内訳：${parts.join('・')}`, `From: ${parts.join(', ')}`) : t('まだ 0。町を制覇すると上がる', 'Still 0. Conquer a town to raise it')));
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
function rarityHow(r: HeroRarity): string {
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
  open(ctx, t('経営者（カリスマ度）', 'Executive (charisma)'), (body) => {
    const s = ctx.s();
    body.append(charismaCard(s, { detail: true }));
    // いまの会社のヒーローのレアリティ（雇ったもとのレアリティ）
    const by = new Map<HeroRarity, number>();
    for (const st of s.staff) {
      const r = st.baseRarity ?? 'C';
      by.set(r, (by.get(r) ?? 0) + 1);
    }
    const row = h('div', 'isl-row isl-charisma-have');
    row.append(h('small', 'isl-dim', t('いまのヒーロー（もとのレアリティ）', 'Your heroes (original rarity)')));
    for (const r of ['N', ...HIRE_RARITIES] as HeroRarity[]) {
      const n = by.get(r);
      if (!n) continue;
      const c = h('span', 'isl-chip');
      c.append(rarityBadge(r), h('small', '', `× ${n}`));
      row.append(c);
    }
    body.append(row);
  });
}

// ---------------------------------------------------------------- 士気と給与

const BAND_NAME: Record<MoraleBand, string> = {
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
function gapText(st: Staff): string {
  const g = payGap(st);
  if (Math.abs(g) < 0.25) return t('相場どおり', 'At market');
  const n = Math.abs(g) < 0.75 ? t('少し', 'a little') : t(`${Math.round(Math.abs(g))} 段`, `${Math.round(Math.abs(g))} step(s)`);
  return g > 0 ? t(`相場より${n}上`, `${n} above market`) : t(`相場より${n}下`, `${n} below market`);
}
/** 士気の目標の内訳（「目標 52 ＝ ふつう 55・給与 −10・職場 +4・同じ仕事 −2」） */
function partsText(s: P1State, st: Staff): string {
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
  open(ctx, t('給与・労務', 'Pay & welfare'), (body) => {
    const s = ctx.s();
    const total = payroll(s);
    const market = Math.round(s.staff.reduce((a, x) => a + marketPay(s, x), 0));
    const quitting = wantsToQuit(s);
    const head = h('div', 'isl-card2 isl-pay-head');
    const sum = h('div', 'isl-row');
    sum.append(h('b', 'isl-big', money(total)), h('small', 'isl-dim', t(`月の給料の合計（相場どおりなら ${money(market)}）`, `Monthly payroll (at market: ${money(market)})`)));
    const avg = moraleAvg(s);
    const mood = h('div', 'isl-row');
    if (avg != null) mood.append(h('span', '', t(`士気の平均 ${avg}`, `Average morale ${avg}`)));
    if (quitting.length) mood.append(h('span', 'isl-bad', t(`😣 辞めたい ${quitting.length} 人`, `😣 ${quitting.length} want to quit`)));
    head.append(
      h('h3', '', t('給与と士気', 'Pay and morale')),
      sum,
      mood,
      h(
        'p',
        'isl-dim',
        t(
          `給料は月の締めに払います。相場（レアリティと Lv で決まる）より上だと士気が上がり、下だと下がります。士気が ${MORALE.band.hi} を超えると働きが速くなり（100 で ×${MORALE.band.top}）、${MORALE.band.lo} を切ると遅くなります。休ませる・昇給・賞与・昇進で上がり、働きすぎ（スタミナが尽きるまで）と同じ仕事の続きすぎで下がります。`,
          `Wages are paid at each month’s close. Paying above market (set by rarity and Lv) lifts morale; below it, morale drops. Over ${MORALE.band.hi} heroes work faster (×${MORALE.band.top} at 100); under ${MORALE.band.lo} they slow down. Rest, raises, bonuses and promotions lift it; overwork (running out of stamina) and staying in one job too long lower it.`,
        ),
      ),
    );
    body.append(head);
    // 並び：辞めたい人 → 士気の低い順
    const list = [...s.staff].sort((a, b) => Number(b.quit != null) - Number(a.quit != null) || moraleOf(a) - moraleOf(b));
    const grid = h('div', 'isl-hgrid');
    for (const st of list) grid.append(payCard(ctx, s, st));
    body.append(grid);
    body.append(h('p', 'isl-dim', has(s, 'lounge') ? t('休憩室があるので、スタミナの戻りが 1.5 倍です。', 'The lounge makes stamina recover 1.5× faster.') : t('スキル「休憩室」（総務）で、スタミナの戻りが速くなります。', 'The Lounge skill (General Affairs) speeds up stamina recovery.')));
  });
}

/** 給与・労務のヒーローのカード */
function payCard(ctx: Ctx, s: P1State, st: Staff): HTMLElement {
  const rar = st.rarity ?? 'C';
  const card = h('div', `isl-card2 isl-hcard isl-paycard ${st.quit != null ? 'is-quit' : ''}`);
  card.dataset.hero = String(st.hero);
  card.style.setProperty('--c', HERO_RARITY[rar].color);
  const top = h('div', 'isl-hcard-top');
  const name = h('div', 'isl-hcard-name');
  const lv = h('div', 'isl-row');
  lv.append(rarityBadge(rar), h('b', '', heroName(st.hero)), h('small', 'isl-dim', `Lv ${st.level ?? 1}`));
  name.append(lv, moraleChip(st));
  top.append(heroIcon(st.hero, 44), name);
  card.append(top);
  // 士気のバー
  const mb = h('div', 'isl-hxp');
  mb.append(bar(moraleOf(st) / 100, BAND_COLOR[moraleBand(st)]), h('small', 'isl-dim', partsText(s, st)));
  card.append(mb);
  // 辞めたい：予告と引き止め
  if (st.quit != null) {
    const q = h('div', 'isl-quit');
    const left = quitLeft(s, st) ?? 0;
    q.append(
      h('b', '', t(`😣 辞めたい（あと ${left} 日で辞めます）`, `😣 Wants to quit (leaves in ${left} days)`)),
      h('small', '', t(`士気が ${MORALE.quit.safe} に戻れば思いとどまります。面談・休み・昇給・賞与で上げよう。`, `They stay if morale gets back to ${MORALE.quit.safe}. Talk, rest, raise or bonus.`)),
    );
    const tk = btn(
      st.talked ? t('面談済み', 'Talked') : t(`引き止めの面談（士気 +${has(s, 'hr_talk') ? MORALE.quit.talkPanel : MORALE.quit.talk}）`, `Stay talk (morale +${has(s, 'hr_talk') ? MORALE.quit.talkPanel : MORALE.quit.talk})`),
      () => {
        if (!talk(s, st.hero)) ctx.toast(t(`${heroName(st.hero)}と話し合いました`, `You talked with ${heroName(st.hero)}`));
        after(ctx);
      },
      'is-on isl-quit-talk',
    );
    tk.disabled = !!st.talked;
    q.append(tk);
    card.append(q);
  }
  // 月給と相場・給与の段
  const lvP = payStep(st);
  const step = Math.round(stepWage(st.hero) * wageMul(s));
  const pay = h('div', 'isl-pay-row');
  pay.append(
    h('span', '', t(`月給 ${money(Math.round(payOf(s, st)))}`, `Pay ${money(Math.round(payOf(s, st)))}`)),
    h('small', 'isl-dim', t(`相場 ${money(Math.round(marketPay(s, st)))}・${gapText(st)}`, `Market ${money(Math.round(marketPay(s, st)))}, ${gapText(st)}`)),
    h('small', 'isl-dim', t(`給与の段 ${lvP > 0 ? '+' : ''}${lvP}（相場の段 ${marketStep(st).toFixed(1)}）`, `Pay step ${lvP > 0 ? '+' : ''}${lvP} (market ${marketStep(st).toFixed(1)})`)),
  );
  card.append(pay);
  const row = h('div', 'isl-row isl-pay-btns');
  const down = btn(t(`− 1 段（−${money(step)}）`, `− 1 step (−${money(step)})`), () => {
    if (!cutPay(s, st.hero)) ctx.toast(t(`${heroName(st.hero)}の給与を下げました（士気 ${MORALE.ev.cut}）`, `Cut ${heroName(st.hero)}’s pay (morale ${MORALE.ev.cut})`));
    after(ctx);
  });
  down.disabled = lvP <= SALARY.min || st.wage - stepWage(st.hero) < 0;
  const up = btn(lvP >= PAY.raiseMax ? t('＋ 1 段（上限）', '+ 1 step (max)') : t(`＋ 1 段（+${money(step)}）`, `+ 1 step (+${money(step)})`), () => {
    if (!raise(s, st.hero)) ctx.toast(t(`${heroName(st.hero)}を昇給しました（士気 +${MORALE.ev.raise}）`, `Gave ${heroName(st.hero)} a raise (morale +${MORALE.ev.raise})`));
    after(ctx);
  }, 'is-on');
  up.disabled = lvP >= PAY.raiseMax;
  row.append(down, up);
  card.append(row);
  // スタミナ・休み・賞与
  const sta = h('div', 'isl-field');
  sta.append(h('span', '', t('スタミナ', 'Stamina')), bar(st.stamina / st.stats.hp, st.stamina / st.stats.hp > 0.3 ? 'var(--isl-good)' : 'var(--isl-bad)'), h('span', 'isl-dim', st.resting ? t('休憩中', 'Resting') : `${Math.round(st.stamina)}/${st.stats.hp}`));
  card.append(sta);
  const row2 = h('div', 'isl-row');
  const b1 = btn(t(`賞与 ${money(bonusCost(st))}（士気 +${MORALE.ev.bonus}・スタミナ満タン）`, `Bonus ${money(bonusCost(st))} (morale +${MORALE.ev.bonus}, full stamina)`), () => {
    if (bonus(s, st.hero)) ctx.toast(t('資金が足りません', 'Not enough funds'));
    else ctx.toast(t(`${heroName(st.hero)}が元気になりました`, `${heroName(st.hero)} is refreshed`));
    after(ctx);
  });
  b1.disabled = s.money < bonusCost(st);
  const b3 = btn(st.resting ? t('休憩をやめる', 'Stop resting') : t('休ませる', 'Rest'), () => {
    setRest(s, st.hero, !st.resting);
    after(ctx);
  });
  row2.append(b3, b1);
  card.append(row2);
  return card;
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
