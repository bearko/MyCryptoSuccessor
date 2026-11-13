/**
 * 段 UIX3h：人事（カリスマ度・経営者・給与と労務）。方向 C「管制卓」。入のときだけ（docs/ISLAND_UIX.md「画面：人事と給与」）。
 * 出す中身・計算・押す先は今の画面（p1/hrui.ts の charismaCard・openCharisma・openPayroll・payCard・moraleChip）と同じ。本体の関数は束（H）から使う。
 *
 * - カリスマ度の札：大きな数字（桁が回る）・雇えるレアリティの一言・しきい値の印のついた計器（届いた段は点く）・出どころの行・次の段まであと N
 * - 経営者：カリスマ度の札（くわしく：上がり方・段ごとの行）・推移の縦の棒・いまのヒーローのもとのレアリティ
 * - 給与と労務：数字の札（月の給料の合計と相場との差・士気の平均と先月の締めからの差・辞めたい人）・士気の平均の推移（縦の棒。速くなる／遅くなる所の目盛り）・
 *   ヒーローごとの札（士気の計器と内訳・辞めたいの紙と引き止めのキー・給与明細の紙（右そろえ）と ± 1 段・スタミナ・休ませる・賞与）
 * 器は今の札（open()。keep：描き直しは値だけ合わせ、数字は前の値から回る）。
 */
import { t } from '../../../i18n';
import { el, type Kid } from '../dom';
import { isCalm } from '../prefs';
import { uxKey, uxLamp, uxMeter, Odo } from '../parts';
import { uxSfx } from '../sound';
import { uxpBars, uxpPaper, uxpRow, uxpStamp, uxpStat, uxpGap } from '../sparts';
import { H } from './h-deps';
import { enter, face, hIcon, ink, keepOpen, keyLabel, lite, liveDraw, rarTag, sect, hEmpty } from './h-kit';
import type { Ctx } from '../../p1/screens';
import type { HeroRarity } from '../../p1/data';
import type { P1State, Staff } from '../../p1/model';

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）
/** 士気の帯の計器の色（色だけにしない：帯の名前と数を必ず添える） */
export const MORALE_LAMP: Record<string, '' | 'good' | 'bad' | 'cyan'> = { high: 'cyan', ok: 'good', low: '', bad: 'bad' };
/** しきい値の印の位置（0〜100%） */
export const markAt = (at: number, max: number) => Math.max(0, Math.min(100, (at / Math.max(1, max)) * 100));
/** 差の言葉（▲▼ と符号。0 は「同じ」） */
export function diffWord(d: number | null, fmt: (v: number) => string = (v) => String(v)): string | null {
  if (d == null) return null;
  const r = Math.round(d);
  if (!r) return t('同じ', 'Same');
  return r > 0 ? `▲ +${fmt(r)}` : `▼ −${fmt(-r)}`;
}

// ================================================================= カリスマ度の札
/** カリスマ度の札（雇う画面の上・経営者）。detail：上がり方と段ごとの行 */
export function charismaPanel(s: P1State, o: { detail?: boolean } = {}): HTMLElement {
  const p = H.charismaParts(s);
  const v = p.total;
  const max = H.CHARISMA.max;
  const top = H.hireCap(s, v);
  const odo = new Odo({ digits: 3, size: 's', value: v });
  const meter = uxMeter(v / max);
  meter.el.setAttribute('aria-label', t(`カリスマ度 ${v} / ${max}`, `Charisma ${v} / ${max}`));
  const marks = el('span.uxh-cha-marks');
  for (const r of H.HIRE_RARITIES) {
    const at = H.capAt(r);
    if (!at) continue;
    const m = el(`span.uxh-cha-mark${v >= at ? '.is-on' : ''}`, { title: t(`${H.HERO_RARITY[r].name}：カリスマ ${at} から`, `${H.HERO_RARITY[r].name}: from charisma ${at}`) }, el('i'), rarTag(r));
    m.style.left = `${markAt(at, max)}%`;
    marks.append(m);
  }
  const segs = H.charismaSegs(p);
  const nx = H.HIRE_RARITIES.find((r) => H.capAt(r) > v);
  const box = el(
    'section.uxh-sec.uxh-cha.isl-charisma',
    sect(t('カリスマ度', 'Charisma'), 'crown', { right: el('span.uxh-cha-v', odo.el, el('span.ux-num.uxh-dim', `/ ${max}`)) }),
    el('p.uxh-cha-line', rarTag(top), el('b', H.charismaLine(s, v))),
    el('div.uxh-cha-gauge', meter.el, marks),
    segs.length ? el('div.uxh-rows', segs.map((g) => uxpRow(g.name, `+${g.v}`, { tone: 'good' }))) : el('p.uxh-dim', t('まだ 0。町を制覇すると上がる', 'Still 0. Conquer a town to raise it')),
    nx ? el('p.uxh-cha-next', hIcon('up', { ...lite, color: '#ffb81f' }), el('span', t(`次の「${H.HERO_RARITY[nx].name}」まで あと ${H.capAt(nx) - v}`, `${H.capAt(nx) - v} more to ${H.HERO_RARITY[nx].name}`))) : null,
  );
  box.style.setProperty('--hc', H.HERO_RARITY[top].color);
  if (o.detail) {
    box.append(
      el(
        'p.uxh-note',
        t(
          `上がり方：町の制覇（Common +${H.CHARISMA.clear.C}・Uncommon +${H.CHARISMA.clear.U}・Rare +${H.CHARISMA.clear.R}）・研究成果の発表（+${H.CHARISMA.present.C}〜${H.CHARISMA.present.R}）・ブランド力（いちばん高かった値 ${H.CHARISMA.brand.per} ごとに +1、+${H.CHARISMA.brand.max} まで）・人事のパネル「採用ブランド」（+${H.CHARISMA.panel}）。ランクアップの災害でも減りません。`,
          `Raised by conquering towns (Common +${H.CHARISMA.clear.C}, Uncommon +${H.CHARISMA.clear.U}, Rare +${H.CHARISMA.clear.R}), presenting findings (+${H.CHARISMA.present.C}–${H.CHARISMA.present.R}), brand (+1 per ${H.CHARISMA.brand.per} of your best brand, up to +${H.CHARISMA.brand.max}) and the HR panel Employer brand (+${H.CHARISMA.panel}). Disasters never lower it.`,
        ),
      ),
    );
    const rows = el('div.uxh-cha-rows');
    for (const r of H.HIRE_RARITIES) {
      const at = H.capAt(r);
      rows.append(
        el(
          `div.uxh-cha-row${v >= at ? '.is-on' : ''}`,
          uxLamp('good', v >= at),
          rarTag(r),
          el('span.uxh-cha-row-b', el('b', H.HERO_RARITY[r].name), el('span', H.rarityHow(r))),
          el('span.uxh-cha-row-at', at ? t(`カリスマ ${at} から`, `From ${at}`) : t('最初から', 'From the start')),
        ),
      );
    }
    box.append(rows);
  }
  if (!isCalm()) requestAnimationFrame(() => {
    meter.set(0);
    requestAnimationFrame(() => meter.set(v / max));
  });
  return box;
}

// ================================================================= 経営者（カリスマ度）
export function openCharismaUx(ctx: Ctx) {
  keepOpen(ctx, t('経営者（カリスマ度）', 'Executive (charisma)'), (c, body) => {
    const page = el('div.uxh-page.uxh-ceo');
    body.append(page);
    return liveDraw(page, () => {
      const s = c.s();
      const out: HTMLElement[] = [charismaPanel(s, { detail: true })];
      // カリスマ度の推移（月の締め）：縦の棒・雇えるレアリティが増えるところは言葉で
      const ch = H.charismaHist(s.reports);
      const v = H.charismaOf(s);
      if (ch.length) {
        const bars = uxpBars(
          ch.map((x, k) => ({ label: H.monLab(x.month, k === 0), value: x.v, text: String(x.v), kind: k === ch.length - 1 ? ('main' as const) : ('' as const) })),
          { max: H.CHARISMA.max, height: 150, cls: 'uxh-hist' },
        );
        const lines = H.HIRE_RARITIES.filter((r) => H.capAt(r) > 0 && H.capAt(r) <= Math.max(v, ...ch.map((x) => x.v)) + 20).map((r) => `${H.HERO_RARITY[r].name} ${H.capAt(r)}`);
        out.push(el('section.uxh-sec', sect(t('カリスマ度の推移（月の締め）', 'Charisma at each close'), 'bars', { kind: 'dark' }), bars.el, lines.length ? el('p.uxh-note', t(`雇えるレアリティが増えるところ：${lines.join('・')}`, `Where a new rarity opens: ${lines.join(', ')}`)) : null));
      }
      // いまの会社のヒーローのレアリティ（雇ったもとのレアリティ）
      const by = new Map<HeroRarity, number>();
      for (const st of s.staff) {
        const r = (st.baseRarity ?? 'C') as HeroRarity;
        by.set(r, (by.get(r) ?? 0) + 1);
      }
      const have = el('div.uxh-have');
      for (const r of ['N', ...H.HIRE_RARITIES] as HeroRarity[]) {
        const n = by.get(r);
        if (n) have.append(el('span.uxh-have-x', rarTag(r), el('b.ux-num', `× ${n}`)));
      }
      out.push(el('section.uxh-sec.isl-charisma-have', sect(t('いまのヒーロー（もとのレアリティ）', 'Your heroes (original rarity)'), 'people', { kind: 'dark' }), have.childElementCount ? have : hEmpty(t('まだヒーローがいません。', 'No heroes yet.'), { ico: 'people' })));
      page.replaceChildren(...out);
    });
  });
}

// ================================================================= 給与と労務
/** 士気の札（数・帯・働きの速さ。今の moraleChip と同じ中身） */
export function moraleTag(st: Staff): HTMLElement {
  const b = H.moraleBand(st);
  const m = Math.round(H.moraleOf(st));
  return el(`span.uxh-mor.is-${b}`, uxLamp(MORALE_LAMP[b], true, b === 'bad'), el('span', t(`士気 ${m}（${H.BAND_NAME[b]}・速さ ×${H.moraleMul(st).toFixed(2)}）`, `Morale ${m} (${H.BAND_NAME[b]}, speed ×${H.moraleMul(st).toFixed(2)})`)));
}

export function openPayrollUx(ctx: Ctx) {
  keepOpen(ctx, t('給与・労務', 'Pay & welfare'), payScreen);
}

function payScreen(ctx: Ctx, body: HTMLElement) {
  const page = el('div.uxh-page.uxh-pay');
  body.append(page);
  /** いま押した人と、打つ札（描き直したあと、その札に打つ） */
  let just: { hero: number; label: string } | null = null;
  const prevMor = new Map<number, number>();
  return liveDraw(page, (anim: boolean) => {
    const s = ctx.s();
    const motion = anim && !isCalm();
    const total = H.payroll(s);
    const market = Math.round(s.staff.reduce((a, x) => a + H.marketPay(s, x), 0));
    const quitting = H.wantsToQuit(s);
    const avg = H.moraleAvg(s);
    const hist = H.moraleHist(s.reports);
    const prevAvg = hist.length ? hist[hist.length - 1].v : null;
    const out: HTMLElement[] = [];
    // ---- 数字の札
    const d1 = diffWord(total - market, (v) => H.money(v));
    const d2 = avg != null ? diffWord(H.delta(avg, prevAvg)) : null;
    out.push(
      el(
        'div.uxp-stats.uxh-stats',
        uxpStat(t('月の給料の合計', 'Monthly payroll'), Math.round(total), { key: 'uxh.pay.total', unit: 'G', size: 's', note: t(`相場どおりなら ${H.money(market)}${d1 ? `（相場と比べて ${d1}）` : ''}`, `At market: ${H.money(market)}${d1 ? ` (vs market ${d1})` : ''}`) }).el,
        uxpStat(t('士気の平均', 'Average morale'), avg ?? 0, { key: 'uxh.pay.avg', digits: 3, size: 's', tone: avg != null && avg < H.MORALE.band.lo ? 'bad' : '', note: avg == null ? '—' : t(`${H.MORALE.band.hi} 超えで速く・${H.MORALE.band.lo} 未満で遅く${d2 ? `（先月の締めから ${d2}）` : ''}`, `>${H.MORALE.band.hi} faster · <${H.MORALE.band.lo} slower${d2 ? ` (since last close ${d2})` : ''}`) }).el,
        el(
          `div.uxp-stat.uxh-quitstat${quitting.length ? '.is-bad' : ''}`,
          el('span.uxp-stat-k', uxLamp('bad', quitting.length > 0, quitting.length > 0), t('辞めたい', 'Want to quit')),
          el('span.uxp-stat-v', el('b.ux-num.uxh-big', String(quitting.length)), el('span.uxp-stat-u', t('人', ''))),
          el('span.uxp-stat-note', quitting.length ? t('下の札で引き止めを', 'Talk them round below') : t('いまはいない', 'Nobody right now')),
        ),
      ),
    );
    out.push(
      el(
        'p.uxh-note',
        t(
          `給料は月の締めに払います。相場（レアリティと Lv で決まる）より上だと士気が上がり、下だと下がります。士気が ${H.MORALE.band.hi} を超えると働きが速くなり（100 で ×${H.MORALE.band.top}）、${H.MORALE.band.lo} を切ると遅くなります。休ませる・昇給・賞与・昇進で上がり、働きすぎ（スタミナが尽きるまで）と同じ仕事の続きすぎで下がります。`,
          `Wages are paid at each month’s close. Paying above market (set by rarity and Lv) lifts morale; below it, morale drops. Over ${H.MORALE.band.hi} heroes work faster (×${H.MORALE.band.top} at 100); under ${H.MORALE.band.lo} they slow down. Rest, raises, bonuses and promotions lift it; overwork (running out of stamina) and staying in one job too long lower it.`,
        ),
      ),
    );
    // ---- 士気の平均の推移（縦の棒）
    if (hist.length >= 2) {
      const bars = uxpBars(
        hist.map((x, k) => ({ label: H.monLab(x.month, k === 0), value: x.v, text: String(Math.round(x.v)), kind: x.v < H.MORALE.band.lo ? ('bad' as const) : x.v > H.MORALE.band.hi ? ('good' as const) : ('' as const) })),
        { max: 100, height: 150, cls: 'uxh-hist' },
      );
      out.push(
        el(
          'section.uxh-sec',
          sect(t('士気の平均の推移（月の締め）', 'Average morale at each close'), 'heart', { kind: 'dark' }),
          bars.el,
          el('p.uxh-note', t(`${H.MORALE.band.hi} より上（緑）で働きが速く、${H.MORALE.band.lo} より下（赤）で遅くなる`, `Above ${H.MORALE.band.hi} (green) work speeds up; below ${H.MORALE.band.lo} (red) it slows`)),
        ),
      );
    }
    // ---- ヒーローごと（辞めたい人 → 士気の低い順）
    const list = [...s.staff].sort((a, b) => Number(b.quit != null) - Number(a.quit != null) || H.moraleOf(a) - H.moraleOf(b));
    const cards = el('div.uxh-paylist');
    let hit: { card: HTMLElement; stamp: ReturnType<typeof uxpStamp> } | null = null;
    for (const st of list) {
      const r = payCard(st);
      cards.append(r.card);
      if (just && just.hero === st.hero) hit = r;
    }
    out.push(el('section.uxh-sec', sect(t('ヒーローごと', 'By hero'), 'people', { kind: 'dark' }), list.length ? cards : hEmpty(t('まだヒーローがいません。', 'No heroes yet.'), { ico: 'people' })));
    out.push(el('p.uxh-note', H.has(s, 'lounge') ? t('休憩室があるので、スタミナの戻りが 1.5 倍です。', 'The lounge makes stamina recover 1.5× faster.') : t('スキル「休憩室」（総務）で、スタミナの戻りが速くなります。', 'The Lounge skill (General Affairs) speeds up stamina recovery.')));
    page.replaceChildren(...out);
    if (motion) enter([...cards.children] as HTMLElement[]);
    if (hit) {
      const h0 = hit;
      requestAnimationFrame(() => h0.stamp.hit(h0.card));
    }
    just = null;

    function payCard(st: Staff) {
      const rar = (st.rarity ?? 'C') as HeroRarity;
      const mor = H.moraleOf(st);
      const band = H.moraleBand(st);
      const from = prevMor.get(st.hero);
      prevMor.set(st.hero, mor);
      const mm = uxMeter((from ?? mor) / 100, band === 'bad' ? '' : band === 'high' ? 'cyan' : 'good');
      mm.el.classList.add(`is-${band}`);
      if (from != null && from !== mor) requestAnimationFrame(() => mm.set(mor / 100));
      const stamp = uxpStamp(just?.hero === st.hero ? just.label : '', { kind: 'good' });
      const card = el(`div.uxh-paycard.isl-paycard${st.quit != null ? '.is-quit' : ''}`, { 'data-hero': String(st.hero) });
      card.style.setProperty('--hc', H.HERO_RARITY[rar].color);
      const act = (label: string, fn: () => unknown) => () => {
        fn();
        just = { hero: st.hero, label };
        H.after(ctx);
      };
      card.append(
        el(
          'div.uxh-paycard-top',
          face(st.hero, 56, { off: !!st.resting }),
          el('span.uxh-paycard-n', el('span.uxh-name', el('b', H.heroName(st.hero)), rarTag(rar), el('span.uxh-lv.ux-num', `Lv ${st.level ?? 1}`), stamp.el), moraleTag(st)),
        ),
        el('div.uxh-paycard-mor', mm.el, el('span.uxh-dim', H.partsText(s, st))),
      );
      // 辞めたい：予告と引き止め
      if (st.quit != null) {
        const left = H.quitLeft(s, st) ?? 0;
        const talked = !!st.talked;
        const tk = uxKey(
          keyLabel('voice', talked ? t('面談済み', 'Talked') : t(`引き止めの面談（士気 +${H.has(s, 'hr_talk') ? H.MORALE.quit.talkPanel : H.MORALE.quit.talk}）`, `Stay talk (morale +${H.has(s, 'hr_talk') ? H.MORALE.quit.talkPanel : H.MORALE.quit.talk})`), !talked),
          () => {
            if (!H.talk(s, st.hero)) ctx.toast(t(`${H.heroName(st.hero)}と話し合いました`, `You talked with ${H.heroName(st.hero)}`));
            just = { hero: st.hero, label: t('面談済み', 'Talked') };
            H.after(ctx);
          },
          { kind: talked ? 'weak' : 'main', ico: null, disabled: talked, cls: 'uxh-talk isl-quit-talk' },
        );
        card.append(
          uxpPaper(
            { plain: true, cls: 'uxh-quit isl-quit' },
            el('p.uxh-quit-h', hIcon('warn', ink), el('b', t(`辞めたい（あと ${left} 日で辞めます）`, `Wants to quit (leaves in ${left} days)`))),
            el('p', t(`士気が ${H.MORALE.quit.safe} に戻れば思いとどまります。面談・休み・昇給・賞与で上げよう。`, `They stay if morale gets back to ${H.MORALE.quit.safe}. Talk, rest, raise or bonus.`)),
            tk,
          ),
        );
      }
      // 給与明細（紙・右そろえ）と ± 1 段
      const lvP = H.payStep(st);
      const step = Math.round(H.stepWage(st.hero) * H.wageMul(s));
      card.append(
        uxpPaper(
          { plain: true, cls: 'uxh-slip' },
          uxpRow(t('月給', 'Pay'), H.money(Math.round(H.payOf(s, st))), { num: true }),
          uxpRow(t('相場', 'Market'), H.money(Math.round(H.marketPay(s, st))), { num: true, note: H.gapText(st) }),
          uxpRow(t('給与の段', 'Pay step'), `${lvP > 0 ? '+' : ''}${lvP}`, { num: true, note: t(`相場の段 ${H.marketStep(st).toFixed(1)}`, `market ${H.marketStep(st).toFixed(1)}`) }),
        ),
      );
      const downOff = lvP <= H.SALARY.min || st.wage - H.stepWage(st.hero) < 0;
      const upMax = lvP >= H.PAY.raiseMax;
      card.append(
        el(
          'div.uxh-keys',
          uxKey(keyLabel('down', t(`− 1 段（−${H.money(step)}）`, `− 1 step (−${H.money(step)})`)), act(t('減給', 'Cut'), () => {
            if (!H.cutPay(s, st.hero)) ctx.toast(t(`${H.heroName(st.hero)}の給与を下げました（士気 ${H.MORALE.ev.cut}）`, `Cut ${H.heroName(st.hero)}’s pay (morale ${H.MORALE.ev.cut})`));
          }), { kind: 'weak', ico: null, disabled: downOff, cls: 'uxh-down' }),
          uxKey(keyLabel('up', upMax ? t('＋ 1 段（上限）', '+ 1 step (max)') : t(`＋ 1 段（+${H.money(step)}）`, `+ 1 step (+${H.money(step)})`)), act(t('昇給', 'Raised'), () => {
            uxSfx('cash');
            if (!H.raise(s, st.hero)) ctx.toast(t(`${H.heroName(st.hero)}を昇給しました（士気 +${H.MORALE.ev.raise}）`, `Gave ${H.heroName(st.hero)} a raise (morale +${H.MORALE.ev.raise})`));
          }), { ico: null, disabled: upMax, cls: 'uxh-up' }),
        ),
      );
      // スタミナ・休み・賞与
      const sta = st.stamina / st.stats.hp;
      const sm = uxMeter(sta, sta > 0.3 ? 'good' : '');
      sm.el.classList.add(sta > 0.3 ? 'is-ok' : 'is-low');
      card.append(el('div.uxh-sta', el('span.uxh-sta-k', t('スタミナ', 'Stamina')), sm.el, el('span.ux-num.uxh-dim', st.resting ? t('休憩中', 'Resting') : `${Math.round(st.stamina)}/${st.stats.hp}`)));
      const cost = H.bonusCost(st);
      const gap = uxpGap(s.money, cost, { hint: '' });
      const bonusKey = uxKey(keyLabel('coin', t(`賞与 ${H.money(cost)}（士気 +${H.MORALE.ev.bonus}・スタミナ満タン）`, `Bonus ${H.money(cost)} (morale +${H.MORALE.ev.bonus}, full stamina)`)), () => {
        if (s.money < cost) {
          gap.nudge();
          return;
        }
        uxSfx('cash');
        if (H.bonus(s, st.hero)) ctx.toast(t('資金が足りません', 'Not enough funds'));
        else ctx.toast(t(`${H.heroName(st.hero)}が元気になりました`, `${H.heroName(st.hero)} is refreshed`));
        just = { hero: st.hero, label: t('賞与', 'Bonus') };
        H.after(ctx);
      }, { ico: null, cls: 'uxh-bonus' });
      const restKey = uxKey(keyLabel(st.resting ? 'play' : 'moon', st.resting ? t('休憩をやめる', 'Stop resting') : t('休ませる', 'Rest')), act(st.resting ? t('仕事へ', 'Back') : t('休憩中', 'Resting'), () => H.setRest(s, st.hero, !st.resting)), { ico: null, cls: 'uxh-rest' });
      card.append(el('div.uxh-keys', restKey, bonusKey), gap.el);
      return { card, stamp };
    }
  });
}

/** 段の札の並び（Kid） */
export const rarRow = (rs: HeroRarity[]): Kid[] => rs.map((r) => rarTag(r));
