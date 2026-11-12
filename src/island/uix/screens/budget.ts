/**
 * 段 UIX3k：予算と部門（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：予算と部門」）。
 * 出す中身・計算・押す先は今の画面（p1/budgetui.ts の openBudget・deptCard・numEdit）と同じ。本体の関数は束（K）から使う。
 * - 上：数字の札（今月の予算・使った・従業員・部長からの頼み：頼みがあれば赤いランプがまたたく）
 * - 部門ごとの予算の使い方（月の締め）：ます目の表（濃いほど使った・超えた月は「超」と赤）
 * - 全部門の予算：小・中・大のキー
 * - 部門の板：部門の色の帯と絵・部長（顔＝育成・名前と★＝替える／いなければ「部長を置く」）
 *   予算は「決める所」：段のキー（小・中・大・数字）で動かす → 予算の数字が回り、使った ／ 予算の計器が振れ、残りの言葉が替わる
 *   従業員の上限は −／＋ のキー（数字が回る）・労力・予算の効き・今月の施策（済み）・承認を待つ施策（レバー）・次に打ちたい施策・先月の成果
 *   部長からの頼み：顔と吹き出し・推奨の札のキー（いちばん上の頼みのキーが主のキー＝前の層）
 * 器は今の札（open()。keep：日ごとの描き直しは動きなしで値だけ合わせる。数字の札・計器は前の値から動く）。
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { ux } from '../hooks';
import { later } from '../loop';
import { uxKey, uxLamp, uxMeter, uxTape } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { uxpEmpty, uxpFace, uxpHead, uxpRow, uxpSeg, uxpStat, type Tone } from '../sparts';
import { K } from './k-deps';
import { kIcon, noEmoji } from './k-icons';
import { DEPT_ICO } from './tree';
import './k-screens.css';
import type { Ctx } from '../../p1/screens';
import type { P1State } from '../../p1/model';
import type { DeptId } from '../../p1/data';

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）
/** 次に打ちたい施策の札（今の FIT_TAG と同じ言葉）：ok・hire は緑、over・labor は赤 */
export const FIT_TAG: Record<'ok' | 'hire' | 'over' | 'labor', () => [string, 'good' | 'bad']> = {
  ok: () => [t('予算の中', 'In budget'), 'good'],
  hire: () => [t('人を雇えば打てる', 'Hire to do it'), 'good'],
  over: () => [t('予算オーバー', 'Over budget'), 'bad'],
  labor: () => [t('人手不足', 'Short-handed'), 'bad'],
};
/** 使った ／ 予算の計器（0〜1。予算が 0 なら 0）と、計器を赤にするか（頼みが出るほど使った：今の画面と同じ BUDGET.ask.spent） */
export const useRatio = (used: number, amt: number) => (amt > 0 ? Math.max(0, Math.min(1, used / amt)) : 0);
export const useHot = (used: number, amt: number, spent: number) => used >= amt * spent;
/** ます目の濃さの段（今の heatStep と同じ：0・〜50・〜90・〜110・超え）と、字（超えた月は「超」を付ける：色だけにしない） */
export const heatText = (pct: number, step: number) => (step >= 4 ? t(`超 ${pct}%`, `Over ${pct}%`) : `${pct}%`);
/** ★の数（1〜3。今の画面と同じ ★☆ の並び） */
export const stars = (n: number) => `${'★'.repeat(n)}${'☆'.repeat(3 - n)}`;
const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;
const sg = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;

// ---------------------------------------------------------------- 画面
const ink = { color: '#1a1c2e', hi: '#1a1c2e', lo: '#8a7f5c', scale: 1 };
const lite = { color: '#f4ecd4', hi: '#fffdf3', lo: '#0b0d17', scale: 1 };
const built = new WeakMap<HTMLElement, { draw: (anim: boolean) => void }>();
/** 計器の前の値（作り直しても前の値から振れる） */
const meterMemo = new Map<string, number>();

/** 予算と部門を開く（p1/budgetui.ts の openBudget から） */
export function openBudgetUx(ctx: Ctx) {
  K.open(
    ctx,
    t('予算と部門', 'Budgets'),
    (body) => {
      const cur = built.get(body);
      if (cur) return cur.draw(false);
      const draw = screen(ctx, body);
      built.set(body, { draw });
      draw(true);
    },
    undefined,
    true,
  );
}

function screen(ctx: Ctx, body: HTMLElement) {
  const root = el('div.uxk-bd.uxk-calm');
  const page = el('div.uxk-bd-page');
  root.append(page);
  body.append(root);
  /** 押したあとの描き直し：計器を前の値から振る（日ごとの描き直しは振らない） */
  let swing = false;
  /** 数字の欄を開いている部門 */
  let editing: DeptId | null = null;
  const redo = () => {
    swing = true;
    K.after(ctx);
  };

  return (anim: boolean) => {
    if (!root.isConnected) return;
    const s = ctx.s();
    const motion = (anim || swing) && !isCalm();
    swing = false;
    const meters: { m: ReturnType<typeof uxMeter>; v: number }[] = [];
    /** 計器：前の値から振る（はじめて開いたときは 0 から） */
    const meter = (key: string, v: number, kind: '' | 'good' | 'cyan' = '') => {
      const from = meterMemo.get(key);
      meterMemo.set(key, v);
      const m = uxMeter(motion ? (from ?? 0) : v, kind);
      if (motion) meters.push({ m, v });
      return m;
    };

    if (!K.budgetOpen(s)) {
      page.replaceChildren(uxpEmpty(t('Rare の町に出店すると開きます', 'Opens once you open in a Rare town'), { ico: 'lock', sub: t('全部門に部長を置き、月の予算を渡して任せられるようになります。', 'Appoint heads in every department and hand them a monthly budget.') }));
      return;
    }
    const ds: DeptId[] = K.budgetDepts(s);
    const tot = ds.reduce((a, d) => a + (K.headOf(s, d) ? K.amountOf(s, d) : 0), 0);
    const used = ds.reduce((a, d) => a + K.deptBudget(s, d).used, 0);
    const crew = ds.reduce((a, d) => a + K.deptBudget(s, d).crew, 0);
    const asks = ds.filter((d) => K.headOf(s, d) && K.deptBudget(s, d).ask).length;
    const out: HTMLElement[] = [];

    const lead = el('p.uxk-bd-lead');
    lead.append(K.rich(t(`部長に[[月の予算]]を渡して任せます。部長は月の締めに、予算と[[労力]]（部長の手＋従業員）の中で施策を選んで実行します。余った予算は会社に戻ります。足りない施策は、いままでどおり部長の提案として届きます。`, `Hand each head a [[monthly budget]]. At month end they pick and run moves within the budget and their [[labor]] (their own hands + staff). Leftovers stay with the company; anything that doesn’t fit arrives as a proposal as before.`)));
    out.push(lead);
    const askStat = uxpStat(t('部長からの頼み', 'Requests'), asks, { key: 'uxk.bd.asks', size: 's', digits: Math.max(1, String(Math.round(Math.max(0, asks))).length), tone: asks ? 'bad' : '' });
    if (asks) askStat.el.querySelector('.uxp-stat-k')?.prepend(uxLamp('bad', true, true));
    const useM = meter('all', useRatio(used, tot));
    out.push(
      el(
        'div.uxp-stats.uxk-bd-kpis',
        uxpStat(t('今月の予算（部長のいる部門）', 'Budget (headed depts)'), tot, { key: 'uxk.bd.tot', unit: 'G', size: 's', tone: 'amber' }).el,
        uxpStat(t('使った', 'Used'), used, { key: 'uxk.bd.used', unit: 'G', size: 's', note: useM.el }).el,
        uxpStat(t('従業員', 'Staff'), crew, { key: 'uxk.bd.crew', unit: t('人', ''), size: 's', digits: Math.max(1, String(Math.round(Math.max(0, crew))).length) }).el,
        askStat.el,
      ),
    );

    // ---- 部門ごとの予算の使い方（ます目の表）
    const heat = K.budgetHeat(s.reports);
    if (heat.cols.length && heat.rows.length) {
      const idle = heat.rows.filter((_: unknown, i: number) => heat.cells[i].every((c: { pct: number } | null) => !c || c.pct === 0)).map((r: { name: string }) => r.name);
      const grid = el('div.uxk-bd-heat', { role: 'table', 'aria-label': t('部門 × 月の予算の使い方', 'Budget use by department and month'), style: `--cols:${heat.cols.length}` });
      grid.append(el('span.uxk-bd-hc.is-corner', { role: 'columnheader' }), ...heat.cols.map((c: { label: string }) => el('span.uxk-bd-hc', { role: 'columnheader' }, c.label)));
      heat.rows.forEach((r: { key: DeptId; name: string; color: string }, i: number) => {
        grid.append(el('span.uxk-bd-hr', { role: 'rowheader', style: `--c:${r.color}` }, kIcon(DEPT_ICO[r.key] ?? 'star4', { ...lite, color: r.color }), el('span', r.name)));
        heat.cells[i].forEach((c: { pct: number; used: number; amt: number; acts: number } | null, k: number) => {
          if (!c) return grid.append(el('span.uxk-bd-cell.is-none', { role: 'cell', 'aria-label': t('記録なし', 'No record') }, '—'));
          const step = K.heatStep(c.pct);
          const tip = t(`${r.name}・${heat.cols[k].label}：${g(c.used)} / ${g(c.amt)}・施策 ${c.acts} 件`, `${r.name}, ${heat.cols[k].label}: ${g(c.used)} / ${g(c.amt)}, ${c.acts} moves`);
          grid.append(el(`span.uxk-bd-cell.is-h${step}`, { role: 'cell', title: tip, 'aria-label': tip }, heatText(c.pct, step)));
        });
      });
      out.push(el('section.uxk-sec', sect(t('部門ごとの予算の使い方（月の締め）', 'Budget use by department (month close)'), 'bars', { dark: true, note: idle.length ? t(`ずっと使っていない：${idle.join('・')}`, `Never used: ${idle.join(', ')}`) : t('濃いほど使った・「超」は予算を超えた', 'Darker = more used · “Over” = over budget') }), el('div.uxk-bd-heatwrap', grid)));
    }

    // ---- 全部門の予算
    const bulk = el(
      'div.uxk-bd-bulk',
      el('span.uxk-bd-k', t('全部門の予算を', 'All departments:')),
      ...(['S', 'M', 'L'] as const).map((lv) =>
        uxKey(t(`${K.lvName(lv)}（${Math.round(K.amountFor(s, lv) / 1000)}k）`, `${K.lvName(lv)} (${Math.round(K.amountFor(s, lv) / 1000)}k)`), () => {
          K.setBudgets(s, Object.fromEntries(ds.map((d) => [d, { lv }])));
          ctx.toast(t(`全部門の予算を「${K.lvName(lv)}」にしました`, `All budgets set to ${K.lvName(lv)}`));
          uxSfx('lever', { step: lv === 'S' ? 1 : lv === 'M' ? 3 : 5 });
          redo();
        }, { ico: null, cls: 'uxk-bd-bulkkey' }),
      ),
    );
    out.push(el('section.uxk-sec', bulk, el('p.uxk-note', t(`段の額は、いまの町の先月の売上 × 小 ${K.BUDGET.rate.S * 100}%・中 ${K.BUDGET.rate.M * 100}%・大 ${K.BUDGET.rate.L * 100}%（部門ごと）。「数字」で好きな額にも。`, `Levels are last month’s sales here × S ${K.BUDGET.rate.S * 100}% · M ${K.BUDGET.rate.M * 100}% · L ${K.BUDGET.rate.L * 100}% per department, or set any amount.`))));

    // ---- 部門の板（部長のいる部門を先に）
    const ifs = K.ifsOf(s);
    const order = [...ds].sort((a, b) => Number(!!K.headOf(s, b)) - Number(!!K.headOf(s, a)));
    const firstAsk = order.find((d) => K.headOf(s, d) && K.deptBudget(s, d).ask) ?? null;
    out.push(el('div.uxk-bd-list', order.map((d) => deptCard(s, d, ifs, d === firstAsk, meter))));

    page.replaceChildren(...out);
    if (meters.length) later(isCalm() ? 0 : 120, () => meters.forEach(({ m, v }) => m.set(v)));
    const num = editing ? page.querySelector<HTMLInputElement>(`.uxk-bd-dept[data-dept="${editing}"] .uxk-bd-input`) : null;
    num?.focus();
  };

  function sect(title: string, ico: string, o: { dark?: boolean; note?: string } = {}) {
    return uxpHead([kIcon(ico, o.dark ? lite : ink), el('b', title)], { kind: o.dark ? 'dark' : 'amber', note: o.note || undefined });
  }

  /** 部門 1 つ（担当・予算・従業員・施策と成果・頼み）。今の deptCard と同じ中身 */
  function deptCard(s: P1State, d: DeptId, ifs: ReturnType<typeof K.ifsOf>, mainAsk: boolean, meter: (key: string, v: number, kind?: '' | 'good' | 'cyan') => ReturnType<typeof uxMeter>): HTMLElement {
    const D = K.DEPT[d];
    const B = K.deptBudget(s, d);
    const H = K.headOf(s, d);
    const card = el(`section.uxk-bd-dept${H ? '' : '.is-nohead'}`, { 'data-dept': d, style: `--c:${D.color}` });

    // 見出し：部門・担当
    const who = el('div.uxk-bd-who');
    if (H) {
      const face = uxKey(uxpFace(K.heroIcon(H.hero, 64), { win: 40 }), () => K.openGrowth(ctx, H.hero), { ico: null, cls: 'uxk-bd-face', attrs: { title: t(`${K.heroNm(H.hero)}の詳細（育成）`, `${K.heroNm(H.hero)}: details`), 'aria-label': t(`${K.heroNm(H.hero)}の詳細（育成）`, `${K.heroNm(H.hero)}: details`) } });
      const st = K.headStar(s, d) ?? 1;
      const nm = uxKey([el('b', K.heroNm(H.hero)), el('span.uxk-bd-star', { 'aria-label': t(`★ ${st}`, `${st} stars`) }, stars(st))], () =>
        K.pickHead(
          ctx,
          d,
          H.hero,
          (hero: number) => K.delegDone(ctx, K.setHead(s, d, hero), t(`${K.heroNm(hero)}を${D.name}部長にしました`, `${K.heroNm(hero)} now heads ${D.name}`)),
          () => K.delegDone(ctx, K.setHead(s, d, null), t(`${D.name}部長を外しました（あなたに戻る）`, `${D.name} head removed (back to you)`)),
        ), { ico: null, cls: 'uxk-bd-head', attrs: { title: t('部長を替える', 'Change the head') } });
      who.append(face, nm);
    } else who.append(el('span.uxk-bd-nohead', t('部長なし（あなた）', 'No head (you)')), uxKey(t('部長を置く', 'Appoint'), () => K.pickHead(ctx, d, null), { ico: 'people', cls: 'uxk-bd-add' }));
    card.append(el('div.uxk-bd-top', el('span.uxk-bd-name', el('span.uxk-bd-ic', kIcon(DEPT_ICO[d] ?? 'star4', { ...lite, color: D.color, scale: 2 })), el('b', D.name)), who));

    // 予算：使った ／ 予算・段のキー（決める所：動かすと数字が回り、計器が振れる）
    const amt = K.amountOf(s, d);
    const hot = useHot(B.used, amt, K.BUDGET.ask.spent);
    const um = meter(`d.${d}`, useRatio(B.used, amt));
    if (hot) um.el.classList.add('is-hot');
    const rest = amt - B.used;
    const seg = uxpSeg(
      K.BUDGET_LVS.map((lv: 'S' | 'M' | 'L' | 'X') => {
        const v = lv === 'X' ? null : K.amountFor(s, lv);
        return { value: lv, label: `${K.lvName(lv)}${v != null ? ` ${Math.round(v / 1000)}k` : ''}` };
      }),
      B.lv,
      (lv: 'S' | 'M' | 'L' | 'X') => {
        if (lv === 'X') {
          editing = d;
          redo();
          return;
        }
        editing = null;
        K.setBudget(s, d, lv);
        ctx.toast(t(`${D.name}の予算を「${K.lvName(lv)}」（${g(K.amountOf(s, d))}／月）にしました`, `${D.name} budget set to ${K.lvName(lv)} (${g(K.amountOf(s, d))}/mo)`));
        if (B.ask && K.budgetRetry(s, d) === 'done') ctx.toast(t(`${D.name}部長が施策を実行しました`, `${D.name} head carried out a move`));
        redo();
      },
      { label: t(`${D.name}の予算の段`, `${D.name} budget level`), cls: 'uxk-bd-seg' },
    );
    seg.el.querySelectorAll('.uxp-seg-key').forEach((k, i) => k.setAttribute('data-lv', K.BUDGET_LVS[i]));
    const budget = el(
      'div.uxk-bd-row',
      el(
        'div.uxk-bd-line',
        el('span.uxk-bd-k', t('予算', 'Budget')),
        uxpStat(t('使った', 'Used'), B.used, { key: `uxk.bd.u.${d}`, unit: 'G', size: 's', tone: B.used > amt ? 'bad' : '' }).el,
        uxpStat(t('月の予算', 'Monthly budget'), amt, { key: `uxk.bd.a.${d}`, unit: 'G', size: 's', tone: 'amber' }).el,
      ),
      el('div.uxk-bd-gauge', um.el, el(`span.uxk-bd-rest${rest < 0 ? '.is-bad' : ''}`, rest >= 0 ? t(`残り ${g(rest)}`, `${g(rest)} left`) : t(`${g(-rest)} 超えた`, `${g(-rest)} over`))),
      seg.el,
    );
    card.append(budget);
    if (editing === d) card.append(numEdit(s, d));

    // 従業員：人数／上限・労力・予算の効き
    const capKeys = el(
      'span.uxk-bd-step',
      uxKey(kIcon('minus', { ...lite, scale: 2 }), () => {
        K.setCrewCap(s, d, B.cap - 1);
        uxSfx('tick');
        redo();
      }, { ico: null, cls: 'uxk-bd-pm', attrs: { 'aria-label': t('上限を 1 人減らす', 'Cap −1') } }),
      uxpStat(t('上限', 'Cap'), B.cap, { key: `uxk.bd.cap.${d}`, size: 's', digits: Math.max(1, String(Math.round(Math.max(0, B.cap))).length) }).el,
      uxKey(kIcon('plus', { ...lite, scale: 2 }), () => {
        K.setCrewCap(s, d, B.cap + 1);
        uxSfx('tick');
        if (B.ask?.why === 'labor' && K.budgetRetry(s, d) === 'done') ctx.toast(t(`${D.name}部長が施策を実行しました`, `${D.name} head carried out a move`));
        redo();
      }, { ico: null, cls: 'uxk-bd-pm', attrs: { 'aria-label': t('上限を 1 人増やす', 'Cap +1') } }),
    );
    const crewRow = el(
      'div.uxk-bd-row',
      el('div.uxk-bd-line', el('span.uxk-bd-k', t('従業員', 'Staff')), uxpStat(t('いま', 'Now'), B.crew, { key: `uxk.bd.c.${d}`, unit: t('人', ''), size: 's', digits: Math.max(1, String(Math.round(Math.max(0, B.crew))).length) }).el, capKeys),
      el('span.uxk-bd-fine', t(`1 人 ${g(K.crewWageMonth())}／月`, `${g(K.crewWageMonth())}/mo each`)),
    );
    if (H) {
      const cap = K.laborCap(s, d);
      const e = K.effParts(s, d);
      const lm = meter(`l.${d}`, cap > 0 ? Math.min(1, B.labor / cap) : 0, 'cyan');
      const effTone: Tone = e.total > 1 ? 'good' : e.total < 1 ? 'bad' : 'dim';
      crewRow.append(
        el('div.uxk-bd-gauge', lm.el, el('span.uxk-bd-rest', t(`労力 ${B.labor} / ${cap} 人日`, `Labor ${B.labor} / ${cap} p-days`))),
        el('span.uxk-bd-fine', t(`部長の手 ${cap - B.crew * K.BUDGET.crew.labor}＋従業員 ${B.crew * K.BUDGET.crew.labor}`, `head ${cap - B.crew * K.BUDGET.crew.labor} + staff ${B.crew * K.BUDGET.crew.labor}`)),
        uxpRow(t('予算の効き', 'Budget power'), `×${e.total.toFixed(2)}`, { tone: effTone, note: e.grade ? t(`★ ${sg(e.star)}・適性 ${e.grade} ${sg(e.fit)}`, `★ ${sg(e.star)} · fit ${e.grade} ${sg(e.fit)}`) : t(`★ ${sg(e.star)}`, `★ ${sg(e.star)}`) }),
      );
    }
    if (d === 'logistics') {
      const part = Object.values(s.shops).reduce((a: number, sh) => a + ((sh as { part?: number } | undefined)?.part ?? 0), 0);
      if (part) crewRow.append(el('span.uxk-bd-fine', t(`ほかに、お店の従業員 ${part} 人（店長が管理・給料はお店の売上から）`, `Plus ${part} shop staff (run by shopkeepers, paid from shop sales)`)));
    }
    card.append(crewRow);

    // 施策：今月（済み）・承認を待つ・次に打ちたい・先月の成果
    const acts = el('div.uxk-bd-acts');
    const moveRow = (nm: string, cost: number, labor: number, tag?: [string, 'good' | 'bad'], done = false) =>
      el(
        `div.uxk-bd-move${done ? '.is-done' : ''}`,
        el('span.uxk-bd-move-nm', done ? kIcon('check', { ...lite, color: '#36e08b' }) : null, el('span', nm)),
        el('span.uxk-bd-move-n', el('span.uxk-bd-cost', kIcon('coin', lite), el('span.ux-num', g(cost))), el('span.uxk-bd-labor', kIcon('people', lite), el('span', t(`${labor} 人日`, `${labor} p-days`))), tag ? el(`span.uxk-bd-tag.is-${tag[1]}`, uxLamp(tag[1] === 'good' ? 'good' : 'bad', true), el('span', tag[0])) : null),
      );
    if (B.acts.length) {
      acts.append(el('span.uxk-bd-k', t('今月の施策（実行済み）', 'This month (done)')));
      for (const x of B.acts) acts.append(moveRow(x.nm, x.cost, x.labor, undefined, true));
    }
    const wait = (s.deleg?.inbox ?? []).filter((p) => p.dept === d && !p.src && (p.sector ?? s.sector) === s.sector);
    if (wait.length) {
      acts.append(el('span.uxk-bd-k', t('予算の外：承認を待っている施策', 'Outside the budget: awaiting approval')));
      for (const p of wait.slice(0, 2)) {
        const row = moveRow(K.actName(s, p.act), K.costNeed(s, d, p.cost), K.laborNeed(s, d, p.act), [t('承認待ち', 'Awaiting'), 'bad']);
        // 直接の承認は会社のお金で定価を払うので、キーに額を書く（今の画面と同じ）
        const okLabel = p.cost > 0 ? t(`承認（${g(p.cost)}）`, `Approve (${g(p.cost)})`) : t('承認', 'Approve');
        const ok = uxKey(okLabel, () => {
          const e = K.approve(s, p.id);
          if (e === 'money' || e === 'rp') ctx.toast(e === 'money' ? t('資金が足りません', 'Not enough money') : t('研究ポイントが足りません', 'Not enough RP'));
          else ctx.toast(e ? t('もう打てない施策でした', 'That move is gone') : t(`承認：${K.actName(s, p.act)}`, `Approved: ${K.actName(s, p.act)}`));
          redo();
        }, { ico: null, cls: 'uxk-bd-ok' });
        // 承認はレバーを引き下ろす（今の画面の入のときと同じ）
        row.append(el('span.uxk-bd-okwrap', ux.lever?.(ok, okLabel) ?? ok));
        acts.append(row);
      }
    }
    if (H) {
      const next = K.nextMoves(s, d, 2, ifs);
      if (next.length) {
        acts.append(el('span.uxk-bd-k', t('次に打ちたい施策（月の締めで部長が実行）', 'Next moves (the head acts at month end)')));
        for (const x of next) acts.append(moveRow(x.nm, x.cost, x.labor, FIT_TAG[x.fit as keyof typeof FIT_TAG]()));
      } else if (!B.acts.length) acts.append(el('span.uxk-bd-fine', t('いま打てる施策はありません。', 'No moves available right now.')));
    } else acts.append(el('span.uxk-bd-fine', t('部長を置くと、予算の中で施策を選んで実行します。', 'Appoint a head to spend this budget on moves.')));
    const res = (s.reports[s.reports.length - 1]?.deleg?.results ?? []).filter((x) => x.dept === d);
    if (res.length) {
      acts.append(el('span.uxk-bd-k', t('先月の施策の成果', 'Last month’s results')));
      for (const x of res) acts.append(el(`div.uxk-bd-res${x.real > 0 ? '.is-good' : ''}`, uxLamp('good', x.real > 0), el('span', noEmoji(K.resultText(s, x)))));
    } else if (B.last?.acts.length) acts.append(el('span.uxk-bd-fine', t(`先月の施策 ${B.last.acts.length} 件（${g(B.last.used)} 使った）`, `${B.last.acts.length} moves last month (${g(B.last.used)} used)`)));
    card.append(acts);

    // 部長からの頼み：顔と吹き出し・推奨の札のキー
    if (H && B.ask) {
      const ask = B.ask;
      const rec = (label: string, fn: () => void) =>
        uxKey([uxTape(t('推奨', 'Recommended'), 'amber'), el('b', label)], fn, { kind: mainAsk ? 'main' : '', ico: null, cls: 'uxk-bd-rec', attrs: { 'aria-label': `${t('推奨', 'Recommended')} ${label}` } });
      let key: HTMLElement;
      if (ask.why === 'labor') {
        const to = Math.min(K.BUDGET.crew.capMax, B.cap + 2);
        key = rec(t(`上限を ${to} 人に`, `Cap to ${to}`), () => {
          K.setCrewCap(s, d, B.cap + 2);
          const r = K.budgetRetry(s, d);
          ctx.toast(r === 'done' ? t(`${D.name}部長が施策を実行しました`, `${D.name} head carried out a move`) : t('従業員の上限を上げました', 'Staff cap raised'));
          uxSfx('confirm');
          redo();
        });
      } else {
        const up = K.nextUp(s, d, ask.cost ?? 0);
        key = rec(t(`予算を ${g(up.to)} に`, `Budget to ${g(up.to)}`), () => {
          K.setBudget(s, d, up.lv, up.amt);
          const r = K.budgetRetry(s, d);
          ctx.toast(r === 'done' ? t(`${D.name}部長が施策を実行しました`, `${D.name} head carried out a move`) : t('予算を上げました', 'Budget raised'));
          uxSfx('confirm');
          redo();
        });
      }
      card.append(el('div.uxk-bd-ask', el('span.uxk-bd-ask-face', uxpFace(K.heroIcon(H.hero, 64), { win: 48 })), el('span.uxk-bd-ask-say', el('b', K.heroNm(H.hero)), el('span', noEmoji(K.askText(s, d, ask)))), el('span.uxk-bd-ask-key', key)));
    }
    return card;
  }

  /** 数字で予算を決める（その部門の板の中の欄。今の numEdit と同じ決まり） */
  function numEdit(s: P1State, d: DeptId): HTMLElement {
    const inp = el<HTMLInputElement>('input.uxk-bd-input', { type: 'number', min: '0', max: String(K.BUDGET.max), step: String(K.BUDGET.round), inputmode: 'numeric', 'aria-label': t('月の予算（G）', 'Monthly budget (G)') });
    inp.value = String(K.amountOf(s, d));
    const commit = () => {
      const v = Number(inp.value);
      if (!Number.isFinite(v) || v < 0) return ctx.toast(t('0 以上の数を入れてください', 'Enter a number of 0 or more'));
      K.setBudget(s, d, 'X', v);
      ctx.toast(t(`${K.DEPT[d].name}の予算を ${g(K.amountOf(s, d))}／月にしました`, `${K.DEPT[d].name} budget set to ${g(K.amountOf(s, d))}/mo`));
      if (K.deptBudget(s, d).ask) K.budgetRetry(s, d);
      editing = null;
      redo();
    };
    const set = uxKey(t('決める', 'Set'), commit, { ico: null, cls: 'uxk-bd-set' });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
    });
    return el('div.uxk-bd-num', el('span.uxk-bd-k', t('月の予算（G）', 'Monthly budget (G)')), inp, set);
  }
}
