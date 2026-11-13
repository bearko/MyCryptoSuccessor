/**
 * 段 UIX3d：提案・報告のカード（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：提案のカード」）。
 * 器は今の窓（.isl-modal.isl-cardm：開いているあいだ時間が止まる・お知らせを待たせる）。閉じ方・手を打つ処理は今の画面と同じ（cardChoose）。
 * - 上：札の種類（提案・報告・できごと…）の貼り札・肩書き（部門の色の帯）・あと N 件
 * - 話し手：顔の窓（息をする）・名前の貼り札・一行（Lv・適性・性格）・ウィットの一言
 * - セリフ：紙に印字（現状 → 原因 → 対応。数字に色）。紙を押すと、すぐ全部出る
 * - 課題の札（放置したときの 1 行・あと何日のランプ）・倉庫のグラフ（今の部品）
 * - 計器 4 つ：効き目・費用・期限・読みの確かさ（選んだ手で値が替わる・ランプ）
 * - 選択肢：押して選ぶ（ランプ・琥珀の枠）→ 下に貼りつく主のキーで決める。決めると判が打たれる
 *   （採用＝緑・見送り＝墨・保留＝琥珀・却下＝墨）。提案書へ進む手は、主のキーが「提案書を見る」
 * - 払えない手は、カードに「あと N G」と目盛り（押すと目盛りが進み、今と同じく受け箱に残して閉じる）
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { later } from '../loop';
import { isCalm } from '../prefs';
import { uxKey, uxLamp, uxTape, uxToggle } from '../parts';
import { uxSfx } from '../sound';
import { uxpCard, uxpEmpty, uxpFace, uxpFoot, uxpGap, uxpHead, uxpPaper, uxpPrice, uxpPrint, uxpSelect, uxpStamp } from '../sparts';
import type { Ctx } from '../../p1/screens';
import type { Card, ChooseRes } from '../../p1/card';
import type { P1State } from '../../p1/model';
import type { CardChoiceView, CardView } from '../../p1/uxd';
import { Q } from './d-deps';
import { INK, LITE, dDept, dFace, dIco, dMore, dRich, dStars, dText, sgnTxt } from './d-kit';
import { K_EMOJI, K_EMOJI_RE, kIcon } from './k-icons';
import './d-card.css';

/** 札の種類の貼り札（字と色） */
function kindOf(v: CardView): { text: string; kind: '' | 'amber' | 'good' | 'dark' } {
  if (v.src === 'event') return { text: t('できごと', 'Event'), kind: 'amber' };
  if (v.src === 'diplo') return { text: t('外交', 'Diplomacy'), kind: '' };
  if (v.src === 'duo') return { text: t('組み合わせ', 'Pairing'), kind: '' };
  if (v.src === 'quit') return { text: t('相談', 'A word'), kind: '' };
  if ((Q.PROPOSAL_SRC as readonly string[]).includes(v.src)) return { text: t('提案', 'Proposal'), kind: 'amber' };
  return { text: t('報告', 'Report'), kind: '' };
}
/** 決めたときの判（言葉と色） */
function stampOf(ch: CardChoiceView): { text: string; kind: '' | 'amber' | 'good' | 'dark' } {
  if (ch.act === 'skip') return { text: t('見送り', 'Passed'), kind: 'dark' };
  if (ch.act === 'hold') return { text: t('保留', 'On hold'), kind: 'amber' };
  if (ch.act === 'reject') return { text: t('却下', 'Rejected'), kind: 'dark' };
  return { text: t('採用', 'Adopted'), kind: 'good' };
}
/** 選択肢の絵：提案書へ進む手＝資料・見送り＝止める・保留＝砂時計・却下＝✕・任せる＝札。ほかは印の絵文字から */
function chIco(ch: CardChoiceView | null, trust: boolean): string {
  if (trust || !ch) return 'tag';
  if (ch.goProp) return 'sheet';
  if (ch.act === 'skip') return 'pause';
  if (ch.act === 'hold') return 'hourglass';
  if (ch.act === 'reject') return 'close';
  const m = K_EMOJI_RE.exec(ch.icon ?? '');
  return m ? K_EMOJI[m[1]] : 'next';
}
/** 決めるキーの字 */
function decideLabel(ch: CardChoiceView | null, trust: boolean): string {
  if (trust) return t('任せる', 'Trust them');
  if (!ch) return t('決める', 'Decide');
  if (ch.goProp) return t('提案書を見る', 'See the proposal');
  if (ch.act === 'skip') return t('見送る', 'Pass');
  if (ch.act === 'hold') return t('あとで決める', 'Decide later');
  if (ch.act === 'reject') return t('却下する', 'Reject');
  return t('これに決める', 'Go with this');
}

/** 計器 4 つ（効き目・費用・期限・読みの確かさ）。選んだ手で値が替わる */
function gauges(v: CardView) {
  const effV = el('b.uxd-g-v');
  const effL = uxLamp('good', false);
  const costV = el('span.uxd-g-v');
  const dueV = el('b.uxd-g-v');
  const dueL = uxLamp('bad', false);
  const g = (lab: string, ico: string, lamp: HTMLElement | null, val: HTMLElement, cls: string) => el(`div.uxd-g.${cls}`, el('span.uxd-g-k', kIcon(ico, LITE), el('span', lab), lamp), val);
  const days = v.iss?.days ?? null;
  dueV.textContent = days == null ? '—' : days < 1 ? t('発生中', 'Now') : t(`${Math.round(days)} 日後`, `in ${Math.round(days)} d`);
  dueL.classList.toggle('is-on', days != null);
  dueL.classList.toggle('is-blink', days != null && days < 7);
  const e = el(
    'div.uxd-gauges',
    g(t('効き目', 'Effect'), 'chart', effL, effV, 'is-eff'),
    g(t('費用', 'Cost'), 'coin', null, costV, 'is-cost'),
    g(t('期限', 'Deadline'), 'hourglass', dueL, dueV, 'is-due'),
    el('div.uxd-g.is-star', el('span.uxd-g-k', kIcon('target', LITE), el('span', t('読みの確かさ', 'Confidence'))), v.star ? dStars(v.star, v.err) : el('b.uxd-g-v', '—')),
  );
  const set = (ch: CardChoiceView | null) => {
    const gn = ch?.gain;
    effV.textContent = !gn ? '—' : gn.unit === 'units' ? t(`${sgnTxt(gn.v)} 個／月`, `${sgnTxt(gn.v)}/mo`) : gn.unit === 'ad' ? t(`期間で ${sgnTxt(gn.v, 'G')}`, `${sgnTxt(gn.v, 'G')} over the run`) : t(`月 ${sgnTxt(gn.v, 'G')}`, `${sgnTxt(gn.v, 'G')}/mo`);
    effV.classList.toggle('is-bad', !!gn && gn.v < 0);
    effL.classList.toggle('is-on', !!gn && gn.v > 0);
    costV.replaceChildren();
    if (!ch || (!ch.cost && !ch.rp && !ch.monthly)) costV.append(uxpPrice(0));
    else {
      if (ch.cost) costV.append(uxpPrice(ch.cost));
      if (ch.rp) costV.append(el('span.ux-num.uxd-g-rp', `${ch.rp} RP`));
      if (ch.monthly) costV.append(el('span.uxd-g-mo', t(`毎月 ${Q.money(ch.monthly)}`, `${Q.money(ch.monthly)}/mo`)));
    }
    uxpReplayIn(e);
  };
  return { el: e, set };
}
const uxpReplayIn = (e: HTMLElement) => {
  e.classList.remove('is-tick');
  void e.offsetWidth;
  e.classList.add('is-tick');
};

/** カードの中身（新しい画面）。close・quiet は今の画面と同じ閉じ方 */
export function cardPanelUx(ctx: Ctx, c: Card, o: { close: (res: ChooseRes | null, label: string) => void; quiet: () => void }): HTMLElement {
  const s = ctx.s();
  const v = Q.cardView(s, c);
  let delegOn = false;
  let busy = false;
  const kd = kindOf(v);
  // 上：札の種類・肩書き・あと N 件
  const role = el('span.uxd-role', dIco(v.roleIcon, LITE, 'person'), el('span', dText(v.roleText)));
  role.style.setProperty('--d', v.color);
  const top = el('div.uxd-card-top', uxTape(el('b', kd.text), kd.kind), role, v.left ? el('span.uxd-card-left', uxLamp('cyan', true), el('span', v.left)) : null);
  // 話し手
  const who = el(
    'div.uxd-card-who',
    el('span.uxd-card-face', dFace(v, 64)),
    el('span.uxd-card-id', uxTape(el('b', dText(v.name)), 'dark'), v.tagBits ? el('span.uxd-card-tag', v.tagBits.flatMap((b, i) => [i ? el('span.uxd-card-sep', t(' ・ ', ' · ')) : null, el('span.uxd-nw', dText(b))])) : v.tag ? el('span.uxd-card-tag', dText(v.tag)) : null),
  );
  // セリフ（紙に印字）
  const lines: HTMLElement[] = [];
  if (v.speech) {
    for (const [lab, x] of [
      [t('現状', 'Now'), v.speech.now],
      [t('原因', 'Cause'), v.speech.cause],
      [t('対応', 'Ask'), v.speech.ask],
    ] as const)
      if (x) lines.push(el('p.uxd-say-l', uxTape(el('b', lab), 'dark'), dRich(x)));
  } else lines.push(el('p.uxd-say-l', dRich(v.say)));
  const paper = uxpPaper({ plain: true, cls: 'uxd-say' }, lines);
  // 課題の札
  const iss = v.iss
    ? el(
        `div.uxd-iss.is-${v.iss.lv}`,
        { 'data-issue': v.iss.key },
        uxLamp('bad', true, v.iss.days != null && v.iss.days < 7),
        dIco(v.iss.icon, LITE, 'target'),
        el('span.uxd-iss-t', el('b', dText(v.iss.tag)), v.iss.loss ? el('span', dText(v.iss.loss)) : null),
      )
    : null;
  const gs = gauges(v);
  // 選択肢
  const list = el('div.uxp-list.uxd-chs', { role: 'listbox', 'aria-label': t('選択肢', 'Choices') });
  const cards: HTMLElement[] = [];
  const gaps: (ReturnType<typeof uxpGap> | null)[] = [];
  let sel = 0;
  const rows: { ch: CardChoiceView | null; trust: boolean }[] = v.choices.map((ch) => ({ ch, trust: false }));
  if (v.trust?.mode === 'row') rows.push({ ch: null, trust: true });
  rows.forEach((r, i) => {
    const ch = r.ch;
    const gap = ch && (ch.shortRp || ch.shortG) ? (ch.shortRp ? uxpGap(s.rp ?? 0, ch.rp, { unit: 'RP', hint: t('研究ポイントがたまれば届きます', 'More RP will get you there') }) : uxpGap(s.money, ch.cost)) : null;
    gaps.push(gap);
    const name = r.trust ? t(`${v.trust!.who}に任せる`, `Trust ${v.trust!.who}`) : ch!.move ? el('span.uxd-ch-move', dDept(ch!.move.dept), el('b', dText(ch!.move.text))) : dText(ch!.label);
    const card = uxpCard({
      pic: el('span.uxd-ch-ico', kIcon(chIco(ch, r.trust), LITE)),
      name,
      tags: [ch?.goProp ? uxTape(el('b', t('提案書', 'Proposal')), 'dark') : null, ch?.rec && v.tut ? uxTape(el('b', t('推奨', 'Rec.')), 'amber') : null],
      desc: r.trust ? dText(v.trust!.sub) : dText(ch!.sub),
      foot: gap ? gap.el : null,
      selected: false,
      cls: `uxd-ch${ch?.later ? ' is-later' : ''}${ch?.act === 'skip' || ch?.act === 'reject' ? ' is-pass' : ''}`,
      attrs: { 'data-k': r.trust ? 'trust' : String(ch!.k), ...(ch?.rec ? { 'data-rec': '1' } : {}) },
      onTap: () => pick(i, true),
    });
    cards.push(card);
    list.append(card);
  });
  // 今後の判断を委任（2 択のカード・★3 の担当だけ）
  const deleg = v.trust?.mode === 'switch' ? el('div.uxd-deleg', uxToggle({ label: v.trust.label, value: false, onChange: (x) => (delegOn = x) }).el ?? null, el('span.uxd-deleg-t', dText(v.trust.label))) : null;
  // 決めるキー（主のキー・前の層）
  const decLab = el('b', decideLabel(rows[0]?.ch ?? null, !!rows[0]?.trust));
  const decide = uxKey(decLab, () => go(), { kind: 'main', big: true, ico: 'check', cls: 'uxd-decide', strong: true, attrs: { 'data-ux-quiet': '' } });
  const foot = uxpFoot(el('span.uxd-foot-note', v.footNote && !v.star ? el('span', dText(v.footNote)) : null), el('span.uxp-foot-main', decide));
  // 計器は、どれかの手に値があるときだけ（知らせ・相談のカードは出さない）。送っても下に貼りつく
  const anyGauge = v.star > 0 || v.iss?.days != null || v.choices.some((ch) => ch.gain || ch.cost || ch.rp || ch.monthly);
  // 下に貼りつく帯：計器と、続きがあるときの「▼ 続き」（送り切ると消える）
  const more = dMore();
  const tail = el('div.uxd-tail', more, anyGauge ? gs.el : null);
  const body = el('div.uxd-card-body', who, v.quip ? el('p.uxd-quip', `— ${dText(v.quip)}`) : null, paper, iss, v.store ? el('div.uxd-store', v.store) : null, v.duoNote ? el('p.uxd-duo', dText(v.duoNote)) : null, uxpHead(t('どうする？', 'What now?'), { kind: 'dark' }), list, deleg, tail);
  const scroll = el('div.uxd-card-scroll', body);
  more.watch(scroll);
  const plate = el('div.uxd-card.ux-plate.ux-root', { 'data-card': String(v.id), role: 'dialog', 'aria-label': `${kd.text} ${dText(v.name)}` }, el('div.ux-screws'), top, scroll, foot);
  plate.style.setProperty('--d', v.color);
  function pick(i: number, feel: boolean) {
    if (busy) return;
    sel = i;
    cards.forEach((x, k) => uxpSelect(x, k === i, feel && k === i));
    const r = rows[i];
    decLab.textContent = decideLabel(r.ch, r.trust);
    gs.set(r.ch);
  }
  function go() {
    if (busy) return;
    const r = rows[sel];
    if (!r) return;
    // 提案書へ進む手：判は打たず、すぐ提案書へ（承認・見送りは提案書で）
    if (r.ch?.goProp) {
      uxSfx('page');
      Q.cardChoose(ctx, s, c, r.ch.k, r.ch.rec, r.ch.label, o.close, o.quiet, () => delegOn);
      return;
    }
    busy = true;
    const g = gaps[sel];
    if (g?.short) g.nudge();
    const st = r.trust ? { text: t('委任', 'Trusted'), kind: 'good' as const } : stampOf(r.ch!);
    const stamp = uxpStamp(st.text, { kind: st.kind || 'good', ico: st.kind === 'good' ? 'check' : null });
    stamp.el.classList.add('uxd-stamp', `is-${st.kind || 'plain'}`);
    // 判は、選んだ札の右上に打つ（板ごと揺れる）
    cards[sel]?.querySelector('.uxd-stampat')?.remove();
    const at = el('span.uxd-stampat', stamp.el);
    cards[sel]?.append(at);
    stamp.hit(plate);
    cards[sel]?.classList.add('is-stamped');
    decide.disabled = true;
    later(isCalm() ? 0 : 420, () => {
      if (r.trust) Q.cardTrustPick(s, c, o.close);
      else Q.cardChoose(ctx, s, c, r.ch!.k, r.ch!.rec, r.ch!.label, o.close, o.quiet, () => delegOn);
    });
  }
  // はじめは推奨（並びの先頭）を選んでおく：開いてすぐ、主のキーで決められる（押す回数は今と同じ）
  pick(0, false);
  // 開いたとき：紙に印字・計器が点く
  const pr = uxpPrint(lines, { gap: 140 });
  paper.addEventListener('click', () => pr.finish());
  plate.addEventListener('click', (e) => e.stopPropagation());
  uxSfx('open');
  return plate;
}

// ---------------------------------------------------------------- 受け箱（経営企画 → 部長の提案）の上
/** ヒーローからの提案・報告（受け箱）と、任せている提案 */
export function inboxUx(ctx: Ctx): HTMLElement {
  const s = ctx.s();
  const V = Q.inboxView(ctx);
  const box = el('div.uxd-inbox.ux-root');
  box.append(issuesUx(s));
  box.append(uxpHead(t('ヒーローからの提案・報告', 'From your heroes'), { right: el('span.uxd-count.ux-num', String(V.list.length)) }));
  if (!V.list.length) box.append(uxpEmpty(t('月の締めのあとに、持ち場のヒーローや手の空いたヒーローが提案を持ってきます。', 'After each monthly close, heroes at their posts or with free hands bring proposals.'), { ico: 'note', sub: t('時間を止めて出すのは月に数枚まで（あふれたものはここに入ります）', 'Only a few a month pop up; the rest wait here') }));
  const list = el('div.uxp-list.uxd-inbox-list');
  for (const x of V.list) {
    const say = dRich(x.say);
    const card = uxpCard({
      pic: x.hero != null ? uxpFace(Q.heroIcon(x.hero, 64), { win: 48 }) : el('span.uxd-ch-ico', dIco(x.roleIcon, LITE, 'person')),
      name: el('span.uxd-inbox-who', dIco(x.roleIcon, LITE, 'person'), el('b', dText(x.title))),
      tags: x.held ? uxTape(el('b', t('資金不足', 'Short of funds')), 'amber') : null,
      desc: say,
      foot: x.iss ? el('span.uxd-inbox-iss', dIco(x.iss.icon, LITE, 'target'), el('span', dText(x.iss.text))) : null,
      right: uxKey(t('開く', 'Open'), () => x.open(), { ico: 'next', cls: 'uxd-open' }),
      cls: 'uxd-inbox-row',
      attrs: { 'data-card': String(x.id) },
    });
    card.style.setProperty('--d', x.color);
    list.append(card);
  }
  if (V.list.length) box.append(list);
  if (V.trusted.length) {
    box.append(uxpHead(t('任せている提案（自分で実行して報告）', 'Trusted (they act, then report)'), { kind: 'dark' }));
    const tl = el('div.uxp-list.uxd-trust-list');
    for (const x of V.trusted) tl.append(uxpCard({ pic: el('span.uxd-ch-ico', dIco('🤝')), name: dText(x.name), tags: uxTape(el('b', t('委任中', 'Trusted')), 'good'), right: uxKey(t('戻す', 'Undo'), () => x.undo(), { cls: 'uxd-undo' }), cls: 'uxd-trust-row' }));
    box.append(tl);
  }
  return box;
}
/** 今月取り下げた提案：色あせた紙きれに「期限切れ」の判 */
export function goneUx(s: P1State): HTMLElement | null {
  const xs = Q.goneView(s);
  if (!xs.length) return null;
  const e = el('div.uxd-gone.ux-root');
  for (const g of xs) {
    const st = uxpStamp(t('期限切れ', 'Lapsed'), { kind: 'dark', ico: null });
    st.show();
    st.el.classList.add('uxd-gone-stamp');
    e.append(uxpPaper({ plain: true, cls: 'uxd-gone-row' }, g.hero != null ? uxpFace(Q.heroIcon(g.hero, 64), { win: 40, off: true }) : el('span.uxd-ch-ico', kIcon('doc', INK)), el('span.uxd-gone-t', dText(g.text)), st.el));
  }
  return e;
}
/** 会社の課題（優先の順）：優先のランプ・名前・根拠・放置したときの 1 行・受け箱の提案の数 */
export function issuesUx(s: P1State): HTMLElement {
  const xs = Q.issuesView(s);
  const e = el('div.uxd-issues.ux-root');
  e.append(uxpHead(t('会社の課題（優先の順）', 'Company issues (by priority)'), { kind: 'amber', ico: 'flag' }));
  if (!xs.length) {
    e.append(uxpEmpty(t('お店を開くと、課題がここに並びます', 'Open a shop to see issues here'), { ico: 'flag', sub: t('サプライチェーンのボトルネック・倉庫・資金・士気など', 'Supply chain bottleneck, storage, cash, morale...') }));
    return e;
  }
  const ol = el('ol.uxd-iss-list');
  for (const x of xs) {
    const lamps = el('span.uxd-iss-pri', { role: 'img', 'aria-label': t(`優先 ${x.pri}`, `P${x.pri}`) }, uxLamp(x.pri === 1 ? 'bad' : '', true, x.pri === 1), el('span.ux-num', `P${x.pri}`));
    ol.append(
      el(
        `li.uxd-iss-row${x.pri === 1 ? '.is-top' : ''}`,
        { 'data-issue': x.key },
        el('div.uxd-iss-top', lamps, dIco(x.icon, LITE, 'target'), el('b', dText(x.name)), uxTape(el('b', x.lvWord), x.lv === 'hi' ? 'amber' : 'dark'), x.n ? uxTape(el('b', t(`提案 ${x.n} 件`, `${x.n} proposal${x.n > 1 ? 's' : ''}`)), 'good') : null),
        el('span.uxd-iss-note', dText(x.note)),
        el('span.uxd-iss-loss', dText(x.loss)),
      ),
    );
  }
  e.append(ol);
  return e;
}
