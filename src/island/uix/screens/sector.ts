/**
 * 段 UIX4r：セクター長の箱・復興の箱・復興を任せる・任せる画面の「セクター長」の節（docs/ISLAND_UIX.md「画面：残りの画面」）。
 * 中身・押した先は今の画面（p1/landui.ts の managerBox・reviveBox・openDelegate、p1/delegui.ts の sectorCard）と同じ関数を同じ引数で呼ぶ。
 * 本体のモジュールは読まない（R に束で受け取る）。class の接頭辞は uxr-。
 */
import { t } from '../../../i18n';
import type { Ctx } from '../../p1/screens';
import type { P1State } from '../../p1/model';
import { el, type Kid } from '../dom';
import { uxKey, uxLamp, uxMeter } from '../parts';
import { uxpBars, uxpCard, uxpEmpty, uxpGap, uxpHead, uxpRow, uxpSeg, uxpStamp, uxpStat, uxpShort } from '../sparts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { R } from './r-deps';
import { face, hIcon, ink, keyLabel, lite, rankChip } from './h-kit';
import './r-screens.css';

const dim = { color: '#97a1cf', hi: '#c9cff0', lo: '#0b0d17', scale: 1 };
const amb = { color: '#ffb81f', hi: '#ffe394', lo: '#7a3f06', scale: 1 };
/** 1 行の知らせ（絵・字。tone で色。色だけに頼らず、絵と言葉で伝える） */
export const rLine = (ico: string | null, text: Kid, tone: '' | 'good' | 'warn' | 'bad' | 'dim' | 'gold' = '') =>
  el(`p.uxr-line${tone ? '.is-' + tone : ''}`, ico ? hIcon(ico, tone === 'warn' || tone === 'gold' ? amb : tone === 'bad' ? { ...amb, color: '#ff5964', hi: '#ffb3b8', lo: '#5a0d14' } : tone === 'good' ? { ...amb, color: '#36e08b', hi: '#b4f7d2', lo: '#0d4a2c' } : dim) : null, el('span', text));
/** 節の見出し（絵は、この段・ほかの段の絵も描ける） */
export const rHead = (title: string, ico: string, o: { kind?: 'amber' | 'dark'; right?: Kid } = {}) => uxpHead([hIcon(ico, o.kind === 'dark' ? lite : ink), el('b', title)], { kind: o.kind ?? 'amber', right: o.right ?? undefined });

// ---------------------------------------------------------------- セクター長の箱

/** マネージャーが運営しているセクタ：担当・先月の結果・投資の割合（今の managerBox と同じ中身） */
export function managerBoxUx(ctx: Ctx, s: P1State, id: string): HTMLElement {
  const rec = R.recOf(s, id);
  const box = el('div.uxr-box.uxr-mgr.isl-land-mgr', { 'data-uxr': 'mgr' });
  box.append(rHead(t('セクター長', 'Sector head'), 'office', { kind: 'dark' }));
  if (!rec.snap) {
    box.append(uxpEmpty(t('まだお店がありません。', 'No business here yet.'), { ico: 'shop' }));
    return box;
  }
  const m = rec.manager != null ? R.staffOf(s, rec.manager) : null;
  const change = uxKey(keyLabel('people', t('替える', 'Change')), () =>
    R.pickHero(ctx.root, s, {
      title: t(`「${R.sectorDef(id).name}」のセクター長`, `Sector head for ${R.sectorDef(id).name}`),
      task: 'manager',
      current: null,
      onPick: (hero) => {
        if (hero == null) return;
        // 今の画面と同じ関数（役職は兼任しない）
        if (R.setSectorHead(s, id, hero)) ctx.toast(t('いまの仕事・役目を外して、セクター長にしました', 'Moved from their current job or role'));
        R.after(ctx);
      },
    }),
  );
  if (m && m.task === 'manager') {
    const apt = R.aptitude(m.stats, 'manager');
    const rate = R.managerRate(apt);
    box.append(
      uxpCard({
        pic: face(m.hero, 56, { breathe: !isCalm() }),
        name: el('span.uxr-name', el('b', R.heroName(m.hero)), rankChip(apt)),
        desc: el('span.uxr-rate', el('span', t('売上の目安', 'Sales')), el('b.ux-num', `×${rate.toFixed(2)}`), uxLamp(rate >= 1 ? 'good' : '', true)),
        right: change,
        cls: 'uxr-head-card',
        attrs: { 'data-hero': String(m.hero) },
      }),
    );
  } else {
    box.append(
      uxpCard({
        pic: el('span.uxr-nohead', hIcon('person', { ...dim, scale: 3 })),
        name: el('b', t('セクター長が不在', 'No sector head')),
        tags: uxLamp('bad', true, true),
        desc: t('売上が大きく下がります。', 'Sales drop a lot.'),
        right: change,
        cls: 'uxr-head-card is-none',
      }),
    );
  }
  if (rec.base) box.append(uxpRow(t('離れたときの月の売上', 'Sales when you left'), R.money(rec.base.rev)), uxpRow(t('投資の合計', 'Invested'), R.money(rec.capital)));
  else box.append(rLine('warn', t('離れる前に月の締めが無かったので、売上はまだ立ちません。戻って 1 か月営業しましょう。', 'No monthly close before you left, so it earns nothing yet. Come back and run it for a month.'), 'warn'));
  const last = rec.log[rec.log.length - 1];
  if (last) {
    const k = `uxr-mgr-${id}`;
    box.append(
      el(
        'div.uxp-stats.uxr-stats',
        uxpStat(t('先月の売上', 'Last sales'), last.rev, { key: `${k}-rev`, unit: 'G' }).el,
        uxpStat(t('利益', 'Profit'), last.profit, { key: `${k}-pro`, unit: 'G', tone: last.profit < 0 ? 'bad' : 'good', note: last.profit < 0 ? t('赤字', 'Loss') : undefined }).el,
        uxpStat(t('このセクタへ投資', 'Reinvested'), last.invest, { key: `${k}-inv`, unit: 'G' }).el,
        uxpStat(t('本社へ', 'To HQ'), last.toHQ, { key: `${k}-hq`, unit: 'G', tone: last.toHQ < 0 ? 'bad' : '' }).el,
      ),
    );
    // 月ごとの結果（今の線と棒 → 縦の棒 2 つ：売上・利益）
    const lg = R.sectorHist(rec);
    if (lg.length) {
      const mon = (m: number) => String(m);
      box.append(
        rHead(t('セクター長の月ごとの結果', 'Sector head, month by month'), 'chart', { kind: 'dark', right: el('span.uxr-dim', t(`先月の売上 ${R.money(last.rev)}`, `Last sales ${R.money(last.rev)}`)) }),
        el(
          'div.uxr-charts',
          chartBox(t('売上', 'Sales'), uxpBars(lg.map((x, i) => ({ label: mon(x.m), value: x.rev, kind: i === lg.length - 1 ? 'main' : '' })), { height: 132 }).el),
          chartBox(t('利益', 'Profit'), uxpBars(lg.map((x) => ({ label: mon(x.m), value: x.profit, text: (x.profit < 0 ? '-' : '') + uxpShort(Math.abs(x.profit)) })), { height: 132 }).el),
        ),
        el('p.uxr-dim', t('下の数字は、会社の何か月目か', 'Numbers below: company month')),
      );
    }
  }
  // 投資の割合
  const seg = uxpSeg(
    R.MANAGER.choices.map((v) => ({ value: v, label: `${Math.round(v * 100)}%` })),
    rec.invest,
    (v) => {
      rec.invest = v;
      R.after(ctx);
    },
    { label: t('利益のうち、このセクタへ投資する割合', 'Share of profit reinvested here'), cls: 'uxr-seg' },
  );
  box.append(rHead(t('利益のうち、このセクタへ投資する割合', 'Share of profit reinvested here'), 'coin', { kind: 'dark' }), seg.el, rLine(null, t(`投資 1 G で、このセクタの月の売上が ${R.MANAGER.roi} G 伸びます（戻ってきたときは、お客さんが増えています）。`, `Each 1 G reinvested raises monthly sales by ${R.MANAGER.roi} G (and brings more customers when you return).`), 'dim'));
  return box;
}

/** グラフの箱：列が多いときは 1 列の幅を保って横に送る（はじめは新しい月が見える右端） */
function chartBox(name: string, bars: HTMLElement): HTMLElement {
  const wrap = el('div.uxr-chart-scroll', bars);
  requestAnimationFrame(() => (wrap.scrollLeft = wrap.scrollWidth));
  return el('div.uxr-chart', el('span.uxr-chart-k', name), wrap);
}

// ---------------------------------------------------------------- 復興の箱

type RV = NonNullable<ReturnType<typeof R.reviveView>>;
/** 復興の進み（計器と数字の札）：直した軒数・支援金の残り・使った額・担当 */
function reviveGauge(rv: RV, key: string): HTMLElement {
  const spent = rv.rec.revive?.spent ?? 0;
  const funded = rv.fund > 0 || spent > 0;
  const m = uxMeter(isCalm() ? rv.fixed / Math.max(1, rv.all) : 0, rv.fixed >= rv.all ? 'good' : '');
  if (!isCalm()) requestAnimationFrame(() => requestAnimationFrame(() => m.set(rv.fixed / Math.max(1, rv.all))));
  const who = rv.hero != null ? el('span.uxr-who', face(rv.hero, 32), el('b', R.heroName(rv.hero))) : el('span.uxr-who.is-none', uxLamp('', true), el('b', t('担当なし', 'No one assigned')));
  return el(
    'div.uxr-revive-g',
    el('div.uxr-revive-top', el('span.uxr-revive-k', hIcon('hammer', amb), el('b', t('復興', 'Rebuilt'))), el('span.uxr-revive-n', el('b.ux-num', String(rv.fixed)), el('span', ' / '), el('b.ux-num', String(rv.all)), el('span', t(' 軒', '')))),
    m.el,
    el(
      'div.uxp-stats.uxr-stats',
      uxpStat(t('支援金の残り', 'Funds left'), rv.fund, { key: `${key}-fund`, unit: 'G', tone: rv.out ? 'bad' : '', note: rv.out ? t('支援金が尽きた', 'Funds ran out') : funded ? undefined : t('支援金なし', 'No funds') }).el,
      uxpStat(t('使った額', 'Spent'), spent, { key: `${key}-spent`, unit: 'G' }).el,
    ),
    el('div.uxr-revive-who', el('span.uxr-dim', t('担当', 'In charge')), who),
  );
}

/** 被災した町（ほかのセクタ）の復興の箱：進み・支援金・担当・「復興を任せる」（今の reviveBox と同じ中身） */
export function reviveBoxUx(ctx: Ctx, s: P1State, id: string): HTMLElement {
  const rv = R.reviveView(s, id)!;
  const box = el('div.uxr-box.uxr-revive.isl-land-mgr.isl-revive-box', { 'data-uxr': 'revive' });
  box.append(rHead(t('被災した町の復興', 'Recovery'), 'hammer', { kind: 'dark', right: rv.out ? el('span.ux-tape.ux-tape--bad', el('b', t('支援金が尽きた', 'Funds ran out'))) : null }));
  box.append(reviveGauge(rv, `uxr-rv-${id}`));
  const spent = rv.rec.revive?.spent ?? 0;
  if (rv.hero != null && (rv.fund > 0 || spent > 0)) {
    const st = R.staffOf(s, rv.hero);
    const per = st ? R.revivePerMonth(st.stats) : 1;
    box.append(rLine('cal', t(`${R.heroName(rv.hero)}が毎月の締めで 1 か月に ${per} 軒ずつ直していく（1 軒は手で直す値段の ${R.RESET.delegate.costMul} 倍）。直ったお店の割合で、セクター長の売上が戻る。`, `${R.heroName(rv.hero)} rebuilds ${per} per month at each close (${R.RESET.delegate.costMul}× the hand-repair price). The sector head’s sales return as shops come back.`), 'dim'));
  } else box.append(rLine('coin', t('ヒーローに復興支援金を送ると、毎月の締めで廃墟を直していってくれる（手で直すより割高だけど、自動で進む）。', 'Send recovery funds to a hero and they rebuild the ruins at each monthly close (pricier than by hand, but automatic).'), 'dim'));
  box.append(rLine('pick', t('お題と出土品は手で掘ろう（任せた町でも、荒れ地はまた掘れる）', 'Dig the targets and finds yourself (the wastelands can be dug again)'), 'gold'));
  const label = rv.fund > 0 || spent > 0 ? t('支援金を送る・担当を替える', 'Send funds / change hero') : t('復興を任せる', 'Leave the recovery');
  box.append(el('div.uxr-keys', uxKey(keyLabel('hammer', label), () => R.openDelegate(ctx, id), { kind: 'main', cls: 'uxr-go' })));
  return box;
}

// ---------------------------------------------------------------- 復興を任せる

/** 支援金の 3 つの額のうち、主のキーにする額：直しきれる額のうち、いちばん安い払える額（無ければ、払えるいちばん大きい額。払える額が無ければ無し） */
export function bestFund<T extends { v: number; n: number; e: string | null }>(amts: T[], short: number, ruins: number): T | null {
  const ok = amts.filter((a) => !a.e);
  return ok.find((a) => a.v >= short || a.n >= ruins) ?? ok[ok.length - 1] ?? null;
}

/** 復興を任せる画面：担当（いまの担当 or ほかのヒーロー）と、送る支援金（3 つの額）。器は今の札 */
export function delegateUx(ctx: Ctx, id: string, hero0?: number) {
  const d = R.sectorDef(id);
  R.open(ctx, t(`「${d.name}」の復興を任せる`, `Leave ${d.name}’s recovery`), (body) => {
    const s = ctx.s();
    const rv = R.reviveView(s, id);
    body.classList.add('uxr-del-body');
    if (!rv) {
      body.append(uxpEmpty(t('この町は被災していません。', 'This town was not hit.'), { ico: 'check' }));
      return;
    }
    const hero = hero0 ?? rv.hero ?? R.recOf(s, id).manager ?? null;
    const root = el('div.uxr-del.ux-root');
    root.append(reviveGauge(rv, `uxr-del-${id}`));
    // 担当
    root.append(rHead(t('担当のヒーロー', 'Hero in charge'), 'people'));
    const st = hero != null ? R.staffOf(s, hero) : null;
    const pick = uxKey(keyLabel('people', t('ヒーローを選ぶ', 'Pick a hero')), () =>
      R.pickHero(ctx.root, s, {
        title: t(`「${d.name}」の復興の担当`, `Recovery lead for ${d.name}`),
        task: 'manager',
        current: null,
        note: t('能力値の平均が高いほど、1 か月に直せる数が多い（1〜3 軒）。担当になったヒーローは、能力値が大きく伸びます。', 'Higher average stats rebuild more per month (1–3). The hero in charge grows a lot.'),
        onPick: (h0) => h0 != null && R.openDelegate(ctx, id, h0),
      }),
    );
    if (st) {
      const per = R.revivePerMonth(st.stats);
      root.append(
        uxpCard({
          pic: face(st.hero, 56, { breathe: !isCalm() }),
          name: el('span.uxr-name', el('b', R.heroName(st.hero)), rankChip(R.aptitude(st.stats, 'manager'))),
          desc: el('span.uxr-rate', el('span', t('1 か月に', 'Per month')), el('b.ux-num', String(per)), el('span', t('軒', ''))),
          foot: rLine('up', t('復興の担当は、毎月 能力値が大きく伸びる（2 つが +2〜3）', 'The hero in charge grows a lot each month (two stats +2–3)'), 'good'),
          right: pick,
          cls: 'uxr-head-card',
          attrs: { 'data-hero': String(st.hero) },
        }),
      );
    } else root.append(uxpCard({ pic: el('span.uxr-nohead', hIcon('person', { ...dim, scale: 3 })), name: el('b', t('担当を選んでください', 'Pick a hero')), tags: uxLamp('', true, true), right: pick, cls: 'uxr-head-card is-none' }));
    // 支援金
    const short = R.fundShort(s, id);
    const bs = ((R.recOf(s, id).snap?.buildings as { id: string; owner?: string }[] | undefined) ?? []).filter((b) => b.owner === R.RUIN);
    const cheap = bs.map((b) => R.delegateCostOf(b.id)).sort((a, b) => a - b);
    root.append(
      rHead(t('復興支援金を送る（所持金から）', 'Send recovery funds (from your funds)'), 'coin'),
      uxpRow(t(`残り ${bs.length} 軒を直しきるには`, `To rebuild the last ${bs.length}`), t(`あと ${R.money(short)}`, `${R.money(short)} more`), { note: t(`1 軒 ${R.money(cheap[0] ?? 0)}〜`, `from ${R.money(cheap[0] ?? 0)} each`) }),
    );
    const amts = R.fundsOf(d.tier).map((v) => {
      let left = v + rv.fund;
      let n = 0;
      for (const c of cheap) {
        if (left < c) break;
        left -= c;
        n++;
      }
      return { v, n, e: hero != null ? R.delegateLock(s, id, hero, v) : ('hero' as const) };
    });
    const best = bestFund(amts, short, bs.length);
    const list = el('div.uxp-list.uxr-funds');
    for (const a of amts) {
      const stamp = uxpStamp(t('送金済', 'Sent'), { kind: 'good' });
      const gap = uxpGap(s.money, a.v);
      let card: HTMLElement;
      const send = uxKey(
        keyLabel(a === best ? 'coin' : null, t('送る', 'Send')),
        () => {
          if (hero == null) return;
          if (a.e === 'money' || s.money < a.v) {
            gap.nudge();
            return;
          }
          const r = R.delegate(s, id, hero, a.v);
          if (r) {
            ctx.toast(r === 'money' ? t('資金が足りません', 'Not enough funds') : t('いまは任せられません', 'Cannot assign now'));
            uxSfx('deny');
            return;
          }
          uxSfx('cash');
          stamp.hit(card);
          ctx.sfx?.('spend');
          ctx.toast(t(`${R.heroName(hero)}に「${d.name}」の復興を任せた（支援金 ${R.money(a.v)}）`, `${R.heroName(hero)} now leads ${d.name}’s recovery (${R.money(a.v)})`));
          const go = () => {
            R.openLand(ctx);
            ctx.delegated?.(id);
          };
          if (isCalm()) go();
          else setTimeout(go, 360);
        },
        { kind: a === best ? 'main' : '', disabled: !!a.e && a.e !== 'money', cls: 'uxr-send' },
      );
      card = uxpCard({
        pic: el('span.uxr-amt-pic', hIcon('coin', { ...amb, scale: 2 })),
        name: el('span.uxr-amt', el('b.ux-num', R.money(a.v))),
        tags: stamp.el,
        desc: t(`${a.n} 軒ぶんの見込み`, `about ${a.n} buildings`),
        foot: [gap.el, a.e && a.e !== 'money' ? rLine('lock', a.e === 'hero' ? t('担当を選ぶと送れます', 'Pick a hero first') : t('いまは任せられません', 'Cannot assign now'), 'dim') : null],
        right: send,
        off: !!a.e && a.e !== 'money',
        cls: `uxr-fund${a === best ? ' is-best' : ''}`,
      });
      list.append(card);
    }
    root.append(list, rLine('pick', t('自動でやってくれるのは、お店の復興と売上まで。お題と出土品は自分で掘りに行こう。', 'The hero handles shops and sales. Dig the targets and finds yourself.'), 'gold'));
    body.append(root);
  });
}

// ---------------------------------------------------------------- 任せる画面の「セクター長」の節

/** セクター長（任せきり）：町ごとの札（顔・名前・町・先月の利益・部長の提案を自分で承認した数）。今の sectorCard と同じ中身 */
export function sectorHeadsUx(s: P1State): HTMLElement {
  const ok = R.sectorHeadOk(s);
  const sec = el('section.uxr-heads.isl-prop-sector');
  const rows: HTMLElement[] = [];
  for (const id of s.land?.mine ?? []) {
    if (id === s.land?.cur) continue;
    const rec = s.land?.recs[id];
    if (!rec || rec.manager == null) continue;
    const st = s.staff.find((x) => x.hero === rec.manager && x.task === 'manager' && x.target === id);
    if (!st) continue;
    const last = rec.log[rec.log.length - 1];
    const hd = rec.heads;
    rows.push(
      uxpCard({
        pic: face(st.hero, 48),
        name: el('span.uxr-name', el('b', R.heroName(st.hero)), el('span.ux-tape.ux-tape--dark.uxr-town', hIcon('office', lite), el('b', R.sectorDef(id).name))),
        desc: last ? uxpRow(t('先月の利益', 'Last profit'), R.money(last.profit), { tone: last.profit < 0 ? 'bad' : 'good' }) : null,
        foot: hd ? rLine('check', t(`部長の提案 ${hd.n} 件を自分で承認（投資 +${R.money(hd.invest)}）`, `Approved ${hd.n} proposals itself (+${R.money(hd.invest)} invested)`), 'good') : null,
        cls: 'uxr-head-row',
        attrs: { 'data-sector': id },
      }),
    );
  }
  sec.append(
    rHead(t('セクター長（セクタを任せる）', 'Sector heads (whole sectors)'), 'office', { kind: 'dark', right: el('span.ux-num.uxr-cnt', String(rows.length)) }),
    rLine(
      'people',
      ok.ready ? t(`新しく任命する条件：事業部長が ${ok.need} 部門以上（いま ${ok.heads}）`, `To appoint: ${ok.need}+ division heads (now ${ok.heads})`) : t(`新しく任命する条件：事業部長が ${ok.need} 部門以上（いま ${ok.heads}。準備中：いまは条件なしで任命できます）`, `To appoint: ${ok.need}+ division heads (now ${ok.heads}; coming soon — no condition for now)`),
      'dim',
    ),
    rows.length ? el('div.uxp-list', rows) : uxpEmpty(t('ほかのセクタに出店して離れるときに、セクター長を選びます（ランドマップ）。', 'You pick a sector head when you leave a sector you opened in (land map).'), { ico: 'list' }),
    rLine(null, t('セクター長のいるセクタは任せきり：会社に事業部長がいれば、そのセクタでも部長たちが提案を出し、セクター長が自分で承認します（1 件ごとに利益の 1 割をそのセクタへ投資）。', 'Sectors with a head run on their own: if the company has division heads, their proposals there are approved by the sector head (each puts 10% of the profit back into that sector).'), 'dim'),
  );
  return sec;
}
