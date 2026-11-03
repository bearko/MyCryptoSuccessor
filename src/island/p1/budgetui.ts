/**
 * 段 I1：予算と部門の画面（経営企画 → 予算）。部門の一覧に「担当・予算（使った／月）・従業員・今月の施策と成果」と、予算の設定（段・数字・従業員の上限）を 1 画面にまとめる。
 * 計算は budget.ts（DOM なし）。部長を置く・替えるは delegui.ts の pickHead（組織図・部門の担当と同じ）。
 */
import { t } from '../../i18n';
import { BUDGET, DEPT, type DeptId } from './data';
import {
  BUDGET_LVS,
  amountFor,
  amountOf,
  askText,
  budgetDepts,
  budgetOpen,
  budgetRetry,
  costNeed,
  laborNeed,
  crewWageMonth,
  deptBudget,
  effParts,
  headStar,
  laborCap,
  lvName,
  nextMoves,
  nextUp,
  setBudget,
  setBudgets,
  setCrewCap,
  type NextMove,
} from './budget';
import { actName, approve, heroNm, headOf, ifsOf, resultText, setHead } from './deleg';
import { done, pickHead } from './delegui';
import { openGrowth } from './growthui';
import type { P1State } from './model';
import { after, open, type Ctx } from './screens';
import { bar, btn, h, heroIcon, recTag, rich } from './ui';
import './i1.css';

const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;
const sg = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
const stars = (n: number) => `${'★'.repeat(n)}${'☆'.repeat(3 - n)}`;
const FIT_TAG: Record<NextMove['fit'], () => [string, string]> = {
  ok: () => [t('予算の中', 'In budget'), 'is-ok'],
  hire: () => [t('人を雇えば打てる', 'Hire to do it'), 'is-ok'],
  over: () => [t('予算オーバー', 'Over budget'), 'is-over'],
  labor: () => [t('人手不足', 'Short-handed'), 'is-over'],
};

/** 1 つの施策の行：名前・費用（G）・労力（人日） */
function moveRow(nm: string, cost: number, labor: number, tag?: [string, string]): HTMLElement {
  const row = h('div', 'isl-bd-move');
  row.append(h('span', 'isl-bd-move-nm', nm));
  const nums = h('span', 'isl-bd-move-nums');
  nums.append(h('span', 'isl-bd-cost', `💰 ${g(cost)}`), h('span', 'isl-bd-labor', t(`👥 ${labor} 人日`, `👥 ${labor} p-days`)));
  if (tag) nums.append(h('span', `isl-bd-tag ${tag[1]}`, tag[0]));
  row.append(nums);
  return row;
}

/** 部門 1 つ（担当・予算・従業員・施策と成果・頼み） */
function deptCard(ctx: Ctx, s: P1State, d: DeptId, ifs: ReturnType<typeof ifsOf>): HTMLElement {
  const D = DEPT[d];
  const B = deptBudget(s, d);
  const H = headOf(s, d);
  const card = h('div', `isl-bd-dept ${H ? '' : 'is-nohead'}`);
  card.style.setProperty('--c', D.color);
  card.dataset.dept = d;
  // 見出し：部門・担当
  const top = h('div', 'isl-bd-top');
  top.append(h('b', 'isl-bd-name', `${D.icon} ${D.name}`));
  const who = h('div', 'isl-bd-who');
  if (H) {
    const face = h('button', 'isl-bd-face');
    face.type = 'button';
    face.append(heroIcon(H.hero, 30));
    face.title = t(`${heroNm(H.hero)}の詳細（育成）`, `${heroNm(H.hero)}: details`);
    face.addEventListener('click', () => openGrowth(ctx, H.hero));
    const st = headStar(s, d) ?? 1;
    const nm = h('button', 'isl-bd-head');
    nm.type = 'button';
    nm.append(h('span', '', heroNm(H.hero)), h('small', 'isl-bd-star', stars(st)));
    nm.title = t('部長を替える', 'Change the head');
    nm.addEventListener('click', () =>
      pickHead(
        ctx,
        d,
        H.hero,
        (hero) => done(ctx, setHead(s, d, hero), t(`${heroNm(hero)}を${D.name}部長にしました`, `${heroNm(hero)} now heads ${D.name}`)),
        () => done(ctx, setHead(s, d, null), t(`${D.name}部長を外しました（あなたに戻る）`, `${D.name} head removed (back to you)`)),
      ),
    );
    who.append(face, nm);
  } else {
    who.append(h('span', 'isl-dim', t('部長なし（あなた）', 'No head (you)')), btn(t('＋ 部長を置く', '+ Appoint'), () => pickHead(ctx, d, null), 'is-on isl-bd-add'));
  }
  top.append(who);
  card.append(top);

  // 予算：使った／月・段の切り替え
  const amt = amountOf(s, d);
  const bud = h('div', 'isl-bd-row');
  const lab = h('div', 'isl-bd-line');
  lab.append(h('small', 'isl-bd-k', t('予算', 'Budget')), h('b', B.used > amt ? 'isl-bad' : '', `${g(B.used)} / ${g(amt)}`), h('small', 'isl-dim', t('／月（使った／予算）', '/mo (used / budget)')));
  bud.append(lab, bar(amt > 0 ? B.used / amt : 0, B.used >= amt * BUDGET.ask.spent ? 'var(--isl-bad)' : 'var(--isl-gold)'));
  const seg = h('div', 'isl-bd-seg');
  for (const lv of BUDGET_LVS) {
    const v = lv === 'X' ? null : amountFor(s, lv);
    const b = btn(`${lvName(lv)}${v != null ? ` ${Math.round(v / 1000)}k` : ''}`, () => {
      if (lv === 'X') {
        numEdit(ctx, s, d, card);
        return;
      }
      setBudget(s, d, lv);
      ctx.toast(t(`${D.name}の予算を「${lvName(lv)}」（${g(amountOf(s, d))}／月）にしました`, `${D.name} budget set to ${lvName(lv)} (${g(amountOf(s, d))}/mo)`));
      if (B.ask && budgetRetry(s, d) === 'done') ctx.toast(t(`${D.name}部長が施策を実行しました`, `${D.name} head carried out a move`));
      after(ctx);
    }, `isl-bd-lv ${B.lv === lv ? 'is-on' : ''}`);
    b.dataset.lv = lv;
    seg.append(b);
  }
  bud.append(seg);
  card.append(bud);

  // 従業員：人数／上限・労力・予算の効き
  const crew = h('div', 'isl-bd-row isl-bd-crew');
  const cl = h('div', 'isl-bd-line');
  cl.append(h('small', 'isl-bd-k', t('従業員', 'Staff')), h('b', '', t(`${B.crew} 人`, `${B.crew}`)), h('small', 'isl-dim', t(`上限 ${B.cap} 人・1 人 ${g(crewWageMonth())}／月`, `cap ${B.cap} · ${g(crewWageMonth())}/mo each`)));
  const step = h('div', 'isl-bd-step');
  step.append(
    btn('−', () => {
      setCrewCap(s, d, B.cap - 1);
      after(ctx);
    }, 'isl-bd-pm'),
    h('small', '', t('上限', 'Cap')),
    btn('+', () => {
      setCrewCap(s, d, B.cap + 1);
      if (B.ask?.why === 'labor' && budgetRetry(s, d) === 'done') ctx.toast(t(`${D.name}部長が施策を実行しました`, `${D.name} head carried out a move`));
      after(ctx);
    }, 'isl-bd-pm'),
  );
  cl.append(step);
  crew.append(cl);
  if (H) {
    const cap = laborCap(s, d);
    const e = effParts(s, d);
    const info = h('div', 'isl-bd-line isl-bd-sub');
    info.append(
      h('small', '', t(`労力 ${B.labor} / ${cap} 人日（部長の手 ${cap - B.crew * BUDGET.crew.labor}＋従業員 ${B.crew * BUDGET.crew.labor}）`, `Labor ${B.labor} / ${cap} p-days (head ${cap - B.crew * BUDGET.crew.labor} + staff ${B.crew * BUDGET.crew.labor})`)),
      h('small', e.total > 1 ? 'isl-good' : e.total < 1 ? 'isl-bad' : 'isl-dim', e.grade ? t(`予算の効き ×${e.total.toFixed(2)}（★ ${sg(e.star)}・適性 ${e.grade} ${sg(e.fit)}）`, `Budget power ×${e.total.toFixed(2)} (★ ${sg(e.star)} · fit ${e.grade} ${sg(e.fit)})`) : t(`予算の効き ×${e.total.toFixed(2)}（★ ${sg(e.star)}）`, `Budget power ×${e.total.toFixed(2)} (★ ${sg(e.star)})`)),
    );
    crew.append(info);
  }
  // お店の従業員（段 UI5a）：同じ「人数の数字」。店長が管理し、給料はお店の売上から（部門の予算には入れない）
  if (d === 'logistics') {
    const part = Object.values(s.shops).reduce((a, sh) => a + (sh?.part ?? 0), 0);
    if (part) crew.append(h('small', 'isl-dim isl-bd-sub', t(`ほかに、お店の従業員 ${part} 人（店長が管理・給料はお店の売上から）`, `Plus ${part} shop staff (run by shopkeepers, paid from shop sales)`)));
  }
  card.append(crew);

  // 今月の施策（部長が予算の中で実行したもの）・次に打ちたい施策・先月の成果
  const acts = h('div', 'isl-bd-acts');
  if (B.acts.length) {
    acts.append(h('small', 'isl-bd-k', t('今月の施策（実行済み）', 'This month (done)')));
    for (const x of B.acts) acts.append(moveRow(`✔ ${x.nm}`, x.cost, x.labor));
  }
  // 予算・労力が足りず、部長の提案として受け箱で待っている施策（承認すれば打てる）
  const wait = (s.deleg?.inbox ?? []).filter((p) => p.dept === d && !p.src && (p.sector ?? s.sector) === s.sector);
  if (wait.length) {
    acts.append(h('small', 'isl-bd-k', t('予算の外：承認を待っている施策', 'Outside the budget: awaiting approval')));
    for (const p of wait.slice(0, 2)) {
      const row = moveRow(actName(s, p.act), costNeed(s, d, p.cost), laborNeed(s, d, p.act), [t('承認待ち', 'Awaiting'), 'is-over']);
      // 段 UI5d：行の額は予算から払う額（予算の効きで割り引き後）。直接の承認は会社のお金で定価を払うので、ボタンに額を書く
      row.append(
        btn(p.cost > 0 ? t(`✔ 承認（${g(p.cost)}）`, `✔ Approve (${g(p.cost)})`) : t('✔ 承認', '✔ Approve'), () => {
          const e = approve(s, p.id);
          if (e === 'money' || e === 'rp') ctx.toast(e === 'money' ? t('資金が足りません', 'Not enough money') : t('研究ポイントが足りません', 'Not enough RP'));
          else ctx.toast(e ? t('もう打てない施策でした', 'That move is gone') : t(`承認：${actName(s, p.act)}`, `Approved: ${actName(s, p.act)}`));
          after(ctx);
        }, 'is-on isl-bd-ok'),
      );
      acts.append(row);
    }
  }
  if (H) {
    const next = nextMoves(s, d, 2, ifs);
    if (next.length) {
      acts.append(h('small', 'isl-bd-k', t('次に打ちたい施策（月の締めで部長が実行）', 'Next moves (the head acts at month end)')));
      for (const x of next) acts.append(moveRow(x.nm, x.cost, x.labor, FIT_TAG[x.fit]()));
    } else if (!B.acts.length) acts.append(h('small', 'isl-dim', t('いま打てる施策はありません。', 'No moves available right now.')));
  } else acts.append(h('small', 'isl-dim', t('部長を置くと、予算の中で施策を選んで実行します。', 'Appoint a head to spend this budget on moves.')));
  const res = (s.reports[s.reports.length - 1]?.deleg?.results ?? []).filter((x) => x.dept === d);
  if (res.length) {
    acts.append(h('small', 'isl-bd-k', t('先月の施策の成果', 'Last month’s results')));
    for (const x of res) acts.append(h('div', `isl-bd-res ${x.real > 0 ? 'isl-good' : 'isl-dim'}`, resultText(s, x)));
  } else if (B.last?.acts.length) acts.append(h('small', 'isl-dim', t(`先月の施策 ${B.last.acts.length} 件（${g(B.last.used)} 使った）`, `${B.last.acts.length} moves last month (${g(B.last.used)} used)`)));
  card.append(acts);

  // 部長からの頼み
  if (H && B.ask) {
    const ask = h('div', 'isl-bd-ask');
    ask.append(h('span', 'isl-bd-ask-txt', `💬 ${askText(s, d, B.ask)}`));
    if (B.ask.why === 'labor')
      ask.append(recBtn(t(`上限を ${Math.min(BUDGET.crew.capMax, B.cap + 2)} 人に`, `Cap to ${Math.min(BUDGET.crew.capMax, B.cap + 2)}`), () => {
        setCrewCap(s, d, B.cap + 2);
        const r = budgetRetry(s, d);
        ctx.toast(r === 'done' ? t(`${D.name}部長が施策を実行しました`, `${D.name} head carried out a move`) : t('従業員の上限を上げました', 'Staff cap raised'));
        after(ctx);
      }, 'is-on'));
    else {
      const up = nextUp(s, d, B.ask.cost ?? 0);
      ask.append(recBtn(t(`予算を ${g(up.to)} に`, `Budget to ${g(up.to)}`), () => {
        setBudget(s, d, up.lv, up.amt);
        const r = budgetRetry(s, d);
        ctx.toast(r === 'done' ? t(`${D.name}部長が施策を実行しました`, `${D.name} head carried out a move`) : t('予算を上げました', 'Budget raised'));
        after(ctx);
      }, 'is-on'));
    }
    card.append(ask);
  }
  return card;
}

/** 段 UI5d：推奨の答えのボタン（頭に「推奨」の札。決まり：docs/ISLAND_UX_CHARTER.md の 2-1） */
function recBtn(text: string, on: () => void, cls = ''): HTMLButtonElement {
  const b = btn(text, on, cls);
  b.prepend(recTag());
  return b;
}

/** 数字で予算を決める（その部門の札の中に入れる欄） */
function numEdit(ctx: Ctx, s: P1State, d: DeptId, card: HTMLElement) {
  card.querySelector('.isl-bd-num')?.remove();
  const box = h('div', 'isl-bd-num');
  const inp = h('input', 'isl-bd-input');
  inp.type = 'number';
  inp.min = '0';
  inp.max = String(BUDGET.max);
  inp.step = String(BUDGET.round);
  inp.value = String(amountOf(s, d));
  inp.inputMode = 'numeric';
  box.append(h('small', '', t('月の予算（G）', 'Monthly budget (G)')), inp, btn(t('決める', 'Set'), () => {
    const v = Number(inp.value);
    if (!Number.isFinite(v) || v < 0) return ctx.toast(t('0 以上の数を入れてください', 'Enter a number of 0 or more'));
    setBudget(s, d, 'X', v);
    ctx.toast(t(`${DEPT[d].name}の予算を ${g(amountOf(s, d))}／月にしました`, `${DEPT[d].name} budget set to ${g(amountOf(s, d))}/mo`));
    if (deptBudget(s, d).ask) budgetRetry(s, d);
    after(ctx);
  }, 'is-on'));
  card.querySelector('.isl-bd-seg')?.after(box);
  inp.focus();
}

/** 予算と部門の画面 */
export function openBudget(ctx: Ctx) {
  open(ctx, t('予算と部門', 'Budgets'), (body) => {
    const s = ctx.s();
    body.classList.add('isl-bd');
    if (!budgetOpen(s)) {
      body.append(h('p', 'isl-dim', t('🔒 Rare の町に出店すると開きます。全部門に部長を置き、月の予算を渡して任せられるようになります。', '🔒 Opens once you open in a Rare town: appoint heads in every department and hand them a monthly budget.')));
      return;
    }
    const ds = budgetDepts(s);
    const tot = ds.reduce((a, d) => a + (headOf(s, d) ? amountOf(s, d) : 0), 0);
    const used = ds.reduce((a, d) => a + deptBudget(s, d).used, 0);
    const crew = ds.reduce((a, d) => a + deptBudget(s, d).crew, 0);
    const asks = ds.filter((d) => headOf(s, d) && deptBudget(s, d).ask).length;
    body.append(h('p', 'isl-dim isl-bd-lead', ''));
    body.lastElementChild!.append(rich(t(`部長に[[月の予算]]を渡して任せます。部長は月の締めに、予算と[[労力]]（部長の手＋従業員）の中で施策を選んで実行します。余った予算は会社に戻ります。足りない施策は、いままでどおり部長の提案として届きます。`, `Hand each head a [[monthly budget]]. At month end they pick and run moves within the budget and their [[labor]] (their own hands + staff). Leftovers stay with the company; anything that doesn’t fit arrives as a proposal as before.`)));
    const kpi = h('div', 'isl-bd-kpis');
    const k = (label: string, v: string, cls = '') => {
      const e = h('div', `isl-bd-kpi ${cls}`);
      e.append(h('small', '', label), h('b', '', v));
      return e;
    };
    kpi.append(k(t('今月の予算（部長のいる部門）', 'Budget (headed depts)'), g(tot)), k(t('使った', 'Used'), g(used)), k(t('従業員', 'Staff'), t(`${crew} 人`, `${crew}`)), k(t('部長からの頼み', 'Requests'), String(asks), asks ? 'is-warn' : ''));
    body.append(kpi);
    // まとめて：全部門の予算の段
    const bulk = h('div', 'isl-bd-bulk');
    bulk.append(h('small', '', t('全部門の予算を', 'All departments:')));
    for (const lv of ['S', 'M', 'L'] as const)
      bulk.append(
        btn(t(`${lvName(lv)}（${Math.round(amountFor(s, lv) / 1000)}k）`, `${lvName(lv)} (${Math.round(amountFor(s, lv) / 1000)}k)`), () => {
          setBudgets(s, Object.fromEntries(ds.map((d) => [d, { lv }])));
          ctx.toast(t(`全部門の予算を「${lvName(lv)}」にしました`, `All budgets set to ${lvName(lv)}`));
          after(ctx);
        }, 'isl-bd-lv'),
      );
    body.append(bulk);
    body.append(h('small', 'isl-dim isl-bd-note', t(`段の額は、いまの町の先月の売上 × 小 ${BUDGET.rate.S * 100}%・中 ${BUDGET.rate.M * 100}%・大 ${BUDGET.rate.L * 100}%（部門ごと）。「数字」で好きな額にも。`, `Levels are last month’s sales here × S ${BUDGET.rate.S * 100}% · M ${BUDGET.rate.M * 100}% · L ${BUDGET.rate.L * 100}% per department, or set any amount.`)));
    const ifs = ifsOf(s);
    // 部長のいる部門を先に
    const list = h('div', 'isl-bd-list');
    for (const d of [...ds].sort((a, b) => Number(!!headOf(s, b)) - Number(!!headOf(s, a)))) list.append(deptCard(ctx, s, d, ifs));
    body.append(list);
  });
}
