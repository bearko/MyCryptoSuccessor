/**
 * 段 ST1・R2：研究ポイント（RP）の入り口の画面の部品（研究ノートの上・スキルツリーの「🔬 研究の施策」）。
 * - 月の RP の入り方：入り口ごとの縦の積み上げ棒（過去 5 か月 ＋ 今月）。色と模様と名前の凡例（色だけで伝えない）。数は model.ts の Report.rpSrc・P1State.rpSrc。
 * - 研究の施策（出土品の整理・文献調査）：Rare より前（R&D 部長がいない）はボタンで手で行う。部長がいれば「部長が予算で行う」と見せる。
 * 計算は r2.ts（DOM なし）。
 */
import { t } from '../../i18n';
import { PALETTE } from './chartkit';
import type { P1State } from './model';
import { RP_SRCS, STUDY_KINDS, retestRp, museumRp, rpSrcName, runStudy, studyByHead, studyCost, studyDone, studyLock, studyName, studyRp, type RpSrc } from './r2';
import { btn, h, money } from './ui';

/** 入り口の色と模様（棒と凡例で同じ） */
const COL: Record<RpSrc, string> = { dig: PALETTE[5], present: PALETTE[1], study: PALETTE[2], retest: PALETTE[0], museum: PALETTE[3], donate: PALETTE[6], other: PALETTE[4] };
const PAT: Record<RpSrc, string> = { dig: '', present: 'is-dots', study: 'is-hatch', retest: '', museum: 'is-dots', donate: 'is-hatch', other: '' };

/** 月の RP の入り方の縦の積み上げ棒（過去 5 か月 ＋ 今月） */
export function rpStackEl(s: P1State): HTMLElement {
  const box = h('div', 'isl-r2-box');
  const months = s.reports.slice(-5).map((r) => ({ name: t(`${r.month} 月`, `M${r.month}`), v: r.rpSrc ?? {} }));
  months.push({ name: t('今月', 'Now'), v: s.rpSrc ?? {} });
  const tot = (v: Partial<Record<RpSrc, number>>) => RP_SRCS.reduce((a, k) => a + (v[k] ?? 0), 0);
  const hi = Math.max(10, ...months.map((m) => tot(m.v)));
  const chart = h('div', 'isl-r2-bars');
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', t('月の研究ポイントの入り方（入り口ごとの積み上げ）', 'Monthly RP by source (stacked)'));
  for (const m of months) {
    const col = h('div', 'isl-r2-col');
    const bar = h('div', 'isl-r2-bar');
    for (const k of RP_SRCS) {
      const v = m.v[k] ?? 0;
      if (v <= 0) continue;
      const seg = h('i', `isl-r2-seg ${PAT[k]}`);
      seg.style.height = `${(v / hi) * 100}%`;
      seg.style.background = COL[k];
      seg.title = `${rpSrcName(k)} +${Math.round(v)} RP`;
      bar.append(seg);
    }
    col.append(h('small', 'isl-r2-v', `${Math.round(tot(m.v))}`), bar, h('small', 'isl-r2-m', m.name));
    chart.append(col);
  }
  const leg = h('div', 'isl-r2-leg');
  for (const k of RP_SRCS) {
    const it = h('span', 'isl-r2-key');
    const sw = h('i', `isl-r2-sw ${PAT[k]}`);
    sw.style.background = COL[k];
    it.append(sw, h('small', '', rpSrcName(k)));
    leg.append(it);
  }
  box.append(h('b', 'isl-r2-h', t('月の研究ポイントの入り方', 'Monthly RP by source')), chart, leg);
  // 毎月入る見込み（追試・展示館）
  const per = h('small', 'isl-dim isl-r2-per', t(`毎月：追試 +${retestRp(s)} RP・展示館 +${museumRp(s)} RP`, `Monthly: follow-ups +${retestRp(s)} RP · museum +${museumRp(s)} RP`));
  box.append(per);
  return box;
}

/** 研究の施策のボタン（出土品の整理・文献調査。月に 1 回ずつ）。done：押したあと（描き直し） */
export function studyEl(s: P1State, o: { done: () => void; toast: (m: string) => void; sfx?: (k: 'error' | 'levelup') => void }): HTMLElement {
  const box = h('div', 'isl-r2-study');
  if (studyByHead(s)) {
    box.append(h('small', 'isl-dim', t('研究の施策（出土品の整理・文献調査）は R&D 部長が予算で毎月行います', 'The R&D head runs sorting and surveys from the budget every month')));
    return box;
  }
  for (const k of STUDY_KINDS) {
    const e = studyLock(s, k);
    if (e === 'hidden') continue;
    const label = studyDone(s, k) ? t(`${studyName(k)}（今月は済み）`, `${studyName(k)} (done this month)`) : t(`${studyName(k)} ${money(studyCost(s, k))} → +${studyRp(s, k)} RP`, `${studyName(k)} ${money(studyCost(s, k))} → +${studyRp(s, k)} RP`);
    const b = btn(label, () => {
      const r = runStudy(s, k);
      if (typeof r === 'string') {
        o.sfx?.('error');
        o.toast(r === 'money' ? t(`資金が足りません（${money(studyCost(s, k))}）`, `Not enough funds (${money(studyCost(s, k))})`) : t('今月はもう行いました', 'Already done this month'));
        return;
      }
      o.sfx?.('levelup');
      o.toast(t(`${studyName(k)}：+${r.rp} RP`, `${studyName(k)}: +${r.rp} RP`));
      o.done();
    }, e == null ? 'is-on' : '');
    b.disabled = e != null;
    box.append(b);
  }
  if (box.children.length) box.prepend(h('small', 'isl-dim', t('研究の施策（月に 1 回ずつ・Rare からは R&D 部長が予算で）', 'Research work (once a month each; from Rare the R&D head does it)')));
  return box;
}
