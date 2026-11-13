/**
 * 段 UIX3d：経営会議（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：経営会議」）。
 * 器は今の窓（.isl-modal.isl-board：開いているあいだ時間が止まる）。決める処理・中身の計算・文は今の画面と同じ（board.ts・boardplan.ts を同じ引数で）。
 * - 上：会議の流れの帯（議題 → 意見 → 決議のランプ）・発表の進み（n / N）・飛ばす（推奨で決める）
 * - 席：出席者の札（顔の窓・発表中は琥珀の枠・決めた人は ✔／✖ の印とランプ）。社長の席
 * - 議題：出席者の一覧（紙）・社内監査のランプ → 「会議を始める」（主のキー）／全員 推奨で一括承認
 * - 意見：話し手が大きく立ち、吹き出しで ① 予実の報告 → ② 来期の計画 → ③ 必要予算 → ④ その他の要求。
 *   選ぶのは押せる札（推奨の貼り札・選んだ札はランプと琥珀の枠）。決めるのは主のキー「決定（判を押す）」→ 判が打たれ、席のランプが点く
 * - 決議：数字の札（そのまま承認・目標を上げた・予算を増やした・減額と否認）と、出席者ごとの決議の行に判
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { ux } from '../hooks';
import { later } from '../loop';
import { isCalm } from '../prefs';
import { uxCloseKey, uxKey, uxLamp, uxTape } from '../parts';
import { uxSfx } from '../sound';
import { uxpCard, uxpFace, uxpFoot, uxpHead, uxpPaper, uxpSelect, uxpStamp, uxpStat } from '../sparts';
import { sparks } from '../fx';
import type { Ctx } from '../../p1/screens';
import type { BoardHooks } from '../../p1/boardui';
import type { BoardItem, BoardPick } from '../../p1/board';
import type { Lever } from '../../p1/boardplan';
import { Q } from './d-deps';
import { INK, LITE, dDept, dText } from './d-kit';
import { dotEmoji, kIcon } from './k-icons';
import './d-card.css';
import './d-board.css';

const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;
const stars = (n: number) => `${'★'.repeat(n)}${'☆'.repeat(3 - n)}`;
const fmt1 = (v: number) => (v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));
/** 判を打ってから次の話し手まで（今と同じ：900ms・演出なしは 260ms） */
export const NEXT_MS = 900;
/** 会議の流れの 3 段 */
export const FLOW = ['agenda', 'talk', 'result'] as const;

/** 選択肢の札の並び（今の options と同じ中身：名前・値・推奨・押せないもの）。押すと選ぶ */
function options(xs: { name: string; val: string; off?: boolean }[], rec: number, cur: () => number, set: (v: number) => void): HTMLElement {
  const row = el(`div.uxp-grid.uxd-bd-opts.is-${xs.length}`, {
    role: 'radiogroup',
  });
  const cards = xs.map((x, n) =>
    uxpCard({
      name: dText(x.name),
      tags: n === rec ? uxTape(el('b', t('推奨', 'Rec.')), 'amber') : null,
      desc: x.val ? dText(x.val) : null,
      selected: n === cur(),
      off: !!x.off,
      cls: 'uxd-bd-opt',
      onTap: x.off
        ? undefined
        : () => {
            set(n);
            cards.forEach((c, k) => uxpSelect(c, k === cur(), k === n));
          },
    }),
  );
  row.append(...cards);
  return row;
}
/** 発表の 1 つの段：見出しの貼り札と、話し手の吹き出し */
function block(cls: string, title: string, say: string): HTMLElement {
  return el(`section.uxd-bd-block.${cls}`, uxpHead(title, { kind: 'dark' }), el('p.uxd-bd-say', dText(say)));
}
const chip = (text: string, kind: '' | 'good' | 'bad' = '') => el(`span.uxd-bd-chip${kind ? '.is-' + kind : ''}`, kind ? uxLamp(kind === 'good' ? 'good' : 'bad', true) : null, el('span', dText(text)));

/** 経営会議を開く（議題が無ければ何もしない）。閉じるときは hooks.done */
export function openBoardUx(ctx: Ctx, hooks: BoardHooks): boolean {
  const B = Q.boardKit;
  const s = ctx.s();
  const A = B.boardOf(s).agenda;
  if (!A || !A.items.some((x) => !x.done)) return false;
  const prevBgm = hooks.bgmNow();
  hooks.bgm('bgmBoard');
  const items = A.items;
  let k = items.findIndex((x) => !x.done);
  let busy = false;
  let jingled = false;
  const still = () => B.fxLevel() === 'off' || isCalm();

  const m = el('div.isl-modal.isl-board');
  ux.modal?.(m, 'board');
  // ---- 流れの帯（議題 → 意見 → 決議）
  const flowLamps = FLOW.map((f) => el(`span.uxd-bd-flow-s.is-${f}`, uxLamp(f === 'result' ? 'good' : '', false), el('b', f === 'agenda' ? t('議題', 'Agenda') : f === 'talk' ? t('意見', 'Views') : t('決議', 'Resolution'))));
  const count = el('span.uxd-bd-count.ux-num');
  const flow = el(
    'div.uxd-bd-flow',
    { role: 'list', 'aria-label': t('会議の流れ', 'Meeting flow') },
    flowLamps.flatMap((x, i) => (i ? [el('i.uxd-bd-flow-arw', '›'), x] : [x])),
    count,
  );
  const setFlow = (f: (typeof FLOW)[number]) => {
    const n = FLOW.indexOf(f);
    flowLamps.forEach((x, i) => {
      x.classList.toggle('is-cur', i === n);
      x.querySelector('.ux-lamp')?.classList.toggle('is-on', i <= n);
      x.setAttribute('aria-current', i === n ? 'step' : 'false');
    });
    const done = items.filter((x) => x.done).length;
    count.textContent = f === 'talk' ? `${Math.min(items.length, done + 1)} / ${items.length}` : f === 'result' ? `${items.length} / ${items.length}` : `0 / ${items.length}`;
  };
  // ---- 席（出席者の札）
  const seatEls = items.map((it) => {
    const mark = el('b.uxd-bd-mark');
    const lamp = uxLamp('good', false);
    const seat = el(
      'div.uxd-bd-seat.isl-bm-seat',
      {
        title: t(`${B.heroNm(it.hero)}（${B.roleOf(it)}）`, `${B.heroNm(it.hero)} (${B.roleOf(it)})`),
      },
      uxpFace(Q.heroIcon(it.hero, 64), { win: 40 }),
      el('span.uxd-bd-seat-r', lamp, mark),
    );
    return seat;
  });
  const seats = el('div.uxd-bd-seats.isl-bm-room', seatEls, el('div.uxd-bd-chair', kIcon('crown', { ...LITE, color: '#ffb81f' }), el('b', t('社長', 'CEO'))));
  const markSeat = (it: BoardItem, neg: boolean) => {
    const seat = seatEls[items.indexOf(it)];
    if (!seat) return;
    seat.classList.add(neg ? 'is-no' : 'is-ok');
    seat.classList.remove('is-on');
    const lamp = seat.querySelector('.ux-lamp');
    lamp?.classList.add('is-on');
    lamp?.classList.toggle('ux-lamp--bad', neg);
    seat.querySelector('.uxd-bd-mark')!.textContent = neg ? '✖' : '✔';
  };
  const skip = uxCloseKey(() => finish('skip'));
  skip.setAttribute('aria-label', t('飛ばす（全員 推奨で決める）', 'Skip (decide all as recommended)'));
  skip.title = skip.getAttribute('aria-label')!;
  const title = el('div.uxd-bd-top', uxTape([kIcon('office', INK), el('b', t(`第 ${A.q} 四半期 経営会議`, `Q${A.q} board meeting`))], 'amber'), el('span.uxd-bd-plate', dText(s.storeName || t('本社 会議室', 'HQ boardroom'))), skip);
  const panel = el('div.uxd-bd-panel');
  const footSlot = el('div.uxd-bd-footslot');
  // 今の目印（isl-bm・isl-bm-room・isl-bm-seat）：差し込みの場面（方針発表会）が、席の反応・会議室の演出の置き場所に使う
  const plate = el('div.uxd-bd.isl-bm.ux-plate.ux-root', { role: 'dialog', 'aria-label': t('経営会議', 'Board meeting') }, el('div.ux-screws'), title, flow, seats, panel, footSlot);
  m.append(plate);
  m.addEventListener('click', (e) => e.stopPropagation());
  ctx.root.append(m);

  const total = items.length;
  const heads = items.filter((x) => x.kind === 'dept').length;
  const secs = total - heads;

  // ---- 議題（入場）
  function intro() {
    setFlow('agenda');
    panel.replaceChildren();
    const list = el('ol.uxd-bd-agenda');
    for (const it of items)
      list.append(el('li', uxpFace(Q.heroIcon(it.hero, 64), { win: 40 }), el('span.uxd-bd-agenda-t', el('b', dText(B.heroNm(it.hero))), el('span', dText(`${B.itemTitle(it)} · ${B.roleOf(it)}`))), it.dept ? dDept(it.dept) : null));
    const au = A!.auditor;
    const secTxt = secs ? t(`・セクター長 ${secs} 人`, `, ${secs} sector heads`) : '';
    panel.append(
      el(
        'div.uxd-bd-intro',
        B.isYearOpening(A!) ? el('p.uxd-bd-year', uxTape(el('b', t(`${B.yearOfBoard(A!)} 年目の年初の会議`, `Opening meeting of year ${B.yearOfBoard(A!)}`)), 'good')) : null,
        el(
          'p.uxd-bd-lead',
          t(`出席：事業部長 ${heads} 人${secTxt}。1 人ずつ「予実の報告 → 来期の計画 → 必要予算」を聞いて、承認するか決めます。`, `Attending: ${heads} division heads${secTxt}. Hear each one’s results, plan and budget, then decide.`),
        ),
        uxpPaper({ cls: 'uxd-bd-agpaper' }, uxpHead(t('議題：出席者', 'Agenda: attendees'), { kind: 'dark' }), list),
        el(
          `p.uxd-bd-audit.${au ? 'is-on' : 'is-off'}`,
          uxLamp(au ? 'good' : '', !!au),
          kIcon('search', LITE),
          el(
            'span',
            au
              ? t(
                  `社内監査：経理部長 ${B.heroNm(au.hero)}（${stars(au.star)}）。盛りが ${Math.round(B.auditSee(au.star) * 100)}% 以上なら見抜く`,
                  `Audit: ${B.heroNm(au.hero)} (${stars(au.star)}), catches padding over ${Math.round(B.auditSee(au.star) * 100)}%`,
                )
              : t('社内監査：なし（経理に部長を置くと、盛った報告・甘い計画を見抜ける）', 'No audit (put a head in Accounting to catch padded reports)'),
          ),
        ),
      ),
    );
    footSlot.replaceChildren(
      uxpFoot(
        uxKey(t('全員 推奨で一括承認', 'Approve all as recommended'), () => bulk(), { kind: 'weak', cls: 'uxd-bd-bulk' }),
        el(
          'span.uxp-foot-main',
          uxKey(t('会議を始める', 'Start'), () => scenes(0), {
            kind: 'main',
            big: true,
            ico: 'play',
            cls: 'uxd-bd-start',
          }),
        ),
      ),
    );
    hooks.sfx('page');
  }

  // ---- 差し込みの場面（段 K。入場のあと・1 人目の前）：今の画面と同じく、中身の板（panel）に描いてもらう
  function scenes(i: number) {
    const xs = B.scenes.filter((x) => x.when(s, A!));
    if (i >= xs.length) return speaker();
    panel.replaceChildren();
    footSlot.replaceChildren();
    panel.scrollTop = 0;
    let gone = false;
    xs[i].run(
      ctx,
      A!,
      panel,
      () => {
        if (gone) return;
        gone = true;
        scenes(i + 1);
      },
      hooks,
    );
  }

  // ---- 1 人ずつの意見
  function speaker() {
    k = items.findIndex((x) => !x.done);
    if (k < 0) return result();
    setFlow('talk');
    const it = items[k];
    seatEls.forEach((e, n) => e.classList.toggle('is-on', n === k));
    panel.replaceChildren();
    panel.scrollTop = 0;
    const pick: BoardPick = { ...it.pick };
    const who = el(
      'div.uxd-bd-who',
      uxpFace(Q.heroIcon(it.hero, 128), { scale: 2, win: 96, breathe: true }),
      el(
        'div.uxd-bd-name',
        uxTape(el('b', dText(B.heroNm(it.hero))), 'dark'),
        el('span', dText(`${B.itemTitle(it)} · ${B.roleOf(it)}`)),
        el(
          'span.uxd-bd-star',
          [0, 1, 2].map((i) => uxLamp('', i < it.star)),
          el('span', t('読みの確かさ', 'Confidence')),
        ),
      ),
    );
    const card = el('div.uxd-bd-talk', who);
    // ① 予実の報告
    const b1 = block('is-b1', t('① 予実の報告', '① Results'), B.reportLine(it));
    const meters = el('div.uxd-bd-meters');
    if (it.prev)
      meters.append(
        B.bulletEl({
          label: t('前期の成果（報告）', 'Last quarter (reported)'),
          v: it.prev.claimed,
          target: it.prev.targetRep,
          tName: t('目標', 'Target'),
          fmt: g,
        }),
      );
    if ('acts' in it.was && it.was.amt > 0)
      meters.append(
        B.bulletEl({
          label: t('予算の使い方', 'Budget use'),
          v: it.was.used,
          target: it.was.amt,
          tName: t('予算', 'Budget'),
          fmt: g,
          over: 'cap',
        }),
      );
    if (meters.childElementCount) b1.append(meters);
    const nums = el('div.uxd-bd-nums');
    if ('acts' in it.was) {
      nums.append(chip(t(`施策 ${it.was.acts} 件`, `${it.was.acts} moves`)));
      if (it.was.names.length) nums.append(chip(it.was.names.slice(0, 2).join(t('・', ' · '))));
    } else nums.append(chip(t(`利益 ${g(it.was.profit)}`, `Profit ${g(it.was.profit)}`)), chip(t(`投資 ${g(it.was.invest)}`, `Reinvested ${g(it.was.invest)}`)), chip(t(`本社へ ${g(it.was.toHQ)}`, `To HQ ${g(it.was.toHQ)}`)));
    if (it.prev) nums.append(chip(it.prev.okRep ? t('目標に届いた（報告）', 'Target met (reported)') : t('目標に届かなかった', 'Target missed'), it.prev.okRep ? 'good' : 'bad'));
    b1.append(nums);
    if (it.why) {
      const cc = el('div.uxd-bd-nums');
      for (const x of B.causeChips(it.why)) cc.append(chip(x));
      b1.append(el(`div.uxd-bd-cause.is-${it.why.k}`, uxTape(el('b', t('原因', 'Cause')), 'dark'), el('b.uxd-bd-kbig', dText(B.causeName(it.why))), cc));
    }
    card.append(b1);
    // 監査の指摘
    const al = B.auditLines(it);
    if (it.audit)
      card.append(
        el(
          `div.uxd-bd-audit2.${al.length ? 'is-flag' : 'is-ok'}`,
          el('b', uxLamp(al.length ? 'bad' : 'good', true, al.length > 0), kIcon('search', LITE), al.length ? t('監査の指摘', 'Audit findings') : t('監査：指摘なし', 'Audit: no findings')),
          ...al.map((x) => el('p', dText(x))),
        ),
      );
    // 段 K へのつなぎ口：足す行（事業別の方針など）
    for (const f of B.itemLines) {
      const x = f(s, it, A!);
      if (!x) continue;
      const bx = block('is-bx', x.title, x.say);
      if (x.note) bx.append(el('p.uxd-bd-dim', dText(x.note)));
      if (x.el) bx.append(x.el);
      card.append(bx);
    }
    // ② 来期の計画
    const b2 = block('is-b2', t('② 来期の計画', '② Plan'), B.planLine(it));
    if (it.plan.moves.length) b2.append(el('p.uxd-bd-dim', t(`次の施策：${it.plan.moves.join('・')}`, `Next: ${it.plan.moves.join(', ')}`)));
    if (it.lever) b2.append(leverEl(it, it.lever, pick));
    const hint = el('p.uxd-bd-hint');
    const raiseOk = B.canRaise(it);
    b2.append(
      options(
        [0, 1, 2].map((x) => ({
          name: B.planOptText(x),
          val: !raiseOk ? (x ? t('見込みが無い', 'No forecast') : t('目標なし', 'No target')) : t(`目標 ${g(it.plan.rep * (1 + B.BOARD.plan[x]))}`, `Target ${g(it.plan.rep * (1 + B.BOARD.plan[x]))}`),
          off: x > 0 && !raiseOk,
        })),
        it.rec.plan,
        () => pick.plan,
        (v) => ((pick.plan = v as BoardPick['plan']), upd()),
      ),
      hint,
    );
    if (!raiseOk) b2.append(el('p.uxd-bd-dim', dText(B.forecastHint(it.lever, it.why))));
    card.append(b2);
    // ③ 必要予算
    const b3 = block('is-b3', t('③ 必要予算', '③ Budget'), B.askLine(it));
    b3.append(
      options(
        [0, 1, 2].map((x) => B.budgetOptText(it, x)),
        it.rec.budget,
        () => pick.budget,
        (v) => ((pick.budget = v as BoardPick['budget']), upd()),
      ),
    );
    const slack = el('div.uxd-bd-slack');
    const why3 = el('p.uxd-bd-recwhy');
    if (it.kind === 'dept') b3.append(slack, why3);
    card.append(b3);
    // ④ その他の要求
    const ol = B.otherLine(it);
    if (ol) {
      const b4 = block('is-b4', t('④ その他の要求', '④ Other request'), ol);
      const o = it.other!;
      const otherVal = o.k === 'hero' ? t(`${B.heroNm(o.hero)}を${B.DEPT[o.dept].name}部長に`, `${B.heroNm(o.hero)} heads ${B.DEPT[o.dept].name}`) : t(`${o.rp} RP を使う`, `Spend ${o.rp} RP`);
      b4.append(
        options(
          [
            { name: t('承認', 'Approve'), val: otherVal },
            {
              name: t('否認', 'Deny'),
              val: o.k === 'hero' ? (o.lvl < B.BOARD.heroAt ? t(`空席のまま（理解度 ${o.lvl}／${B.BOARD.heroAt}）`, `Leave empty (level ${o.lvl}/${B.BOARD.heroAt})`) : t('空席のまま', 'Leave it empty')) : t('RP を使わない', 'No RP'),
            },
          ],
          it.rec.other,
          () => pick.other,
          (v) => (pick.other = v as BoardPick['other']),
        ),
      );
      if (o.k === 'hero')
        b4.append(
          uxKey(
            t('ほかの候補から選ぶ', 'Choose another candidate'),
            () =>
              B.pickHead(ctx, o.dept, null, (hero: number) => {
                o.hero = hero;
                it.pick = { ...pick, other: 0 };
                ctx.save();
                speaker();
              }),
            { cls: 'uxd-bd-pick', ico: 'people' },
          ),
        );
      card.append(b4);
    }
    function upd() {
      if (it.kind === 'dept') {
        B.drawSlack(slack, s, it, pick);
        dotEmoji(slack);
        why3.textContent = t('推奨の理由：', 'Why: ') + dText(B.budgetWhy(it, B.coLive(s, A!.co)));
      }
      const v = B.moraleHint(it, pick);
      hint.textContent = v ? t(`${B.heroNm(it.hero)}の士気の目標 ${v > 0 ? '+' : '−'}${Math.abs(Math.round(v))}（目標の重さ）`, `${B.heroNm(it.hero)}’s morale target ${v > 0 ? '+' : '−'}${Math.abs(Math.round(v))}`) : '';
      hint.hidden = !v;
    }
    upd();
    dotEmoji(card);
    panel.append(card);
    const ok = uxKey(t('判を押す', 'Stamp it'), () => stamp(it, pick, card), { kind: 'main', big: true, ico: 'check', cls: 'uxd-bd-ok', strong: true });
    footSlot.replaceChildren(uxpFoot(items.filter((x) => !x.done).length > 1 ? uxKey(t('残りを推奨で一括承認', 'Approve the rest as recommended'), () => bulk(), { kind: 'weak', cls: 'uxd-bd-bulk' }) : null, el('span.uxp-foot-main', ok)));
    hooks.sfx('page');
  }

  /** 判 → 次の話し手 */
  function stamp(it: BoardItem, pick: BoardPick, card: HTMLElement) {
    if (busy) return;
    busy = true;
    const neg = pick.budget === 2 || (!!it.other && pick.other === 1);
    const up = pick.plan > 0 || pick.budget === 1;
    B.decide(s, it, pick);
    ctx.save();
    const st = uxpStamp(neg ? t('否', 'NO') : s.storeName || t('承認', 'OK'), {
      kind: neg ? 'dark' : 'amber',
      ico: null,
    });
    st.el.classList.add('uxd-bd-stamp', neg ? 'is-no' : 'is-ok');
    const quick = still();
    // 判は、送っている位置によらず見える所（板のまん中）に打つ
    plate.querySelector('.uxd-bd-stampat')?.remove();
    const at = el('div.uxd-bd-stampat', st.el);
    plate.append(at);
    later(quick ? 260 : NEXT_MS, () => at.remove());
    later(quick ? 0 : 240, () => {
      st.hit(plate);
      hooks.sfx(neg ? 'deny' : up ? 'buff' : 'okay');
      markSeat(it, neg);
      if (!quick) {
        const r = st.el.getBoundingClientRect();
        sparks({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 12, neg ? ['#97a1cf', '#fffdf3'] : ['#ffb81f', '#fffdf3', '#ff5964']);
      }
      // 話し手のひと言（承認・却下の声。無ければ出さない）
      const say = B.lineOf(it.hero, neg ? 'rejected' : 'approved', it.key.length);
      if (say) card.querySelector('.uxd-bd-who')?.append(el('p.uxd-bd-react', `「${dText(say)}」`));
    });
    later(quick ? 260 : NEXT_MS, () => {
      busy = false;
      speaker();
    });
  }

  /** 残り全員を推奨で（席のランプが順に点く） */
  function bulk() {
    if (busy) return;
    busy = true;
    const rest = items.filter((x) => !x.done);
    B.boardFinish(s, 'bulk');
    ctx.save();
    const quick = still();
    rest.forEach((it, n) => {
      const neg = it.pick.budget === 2 || (!!it.other && it.pick.other === 1);
      later(quick ? 0 : 80 * n, () => {
        markSeat(it, neg);
        seatEls[items.indexOf(it)]?.classList.add('is-pop');
        if (n < 6) hooks.sfx('place', 0.8, 0.9 + n * 0.04);
      });
    });
    later(quick ? 100 : Math.min(900, 80 * rest.length + 300), () => {
      hooks.sfx('jingle');
      jingled = true;
      busy = false;
      result(true);
    });
  }

  /** 決議（結果のまとめ） */
  function result(fromBulk = false) {
    const BB = B.boardOf(s);
    if (BB.agenda) B.boardFinish(s, 'one');
    ctx.save();
    setFlow('result');
    seatEls.forEach((e) => e.classList.remove('is-on'));
    panel.replaceChildren();
    const sm = B.boardSummary(items);
    const stats = el(
      'div.uxp-stats.uxd-bd-stats',
      uxpStat(t('そのまま承認', 'Approved'), sm.ok, {
        unit: `/ ${items.length}`,
        tone: 'good',
        digits: 2,
      }).el,
      uxpStat(t('目標を上げた', 'Targets raised'), sm.raised, { digits: 2 }).el,
      uxpStat(t('予算を増やした', 'Budget raised'), sm.up, { digits: 2 }).el,
      uxpStat(t('減額・否認', 'Cut / denied'), sm.cut + sm.denied, {
        digits: 2,
        tone: sm.cut + sm.denied ? 'bad' : '',
      }).el,
    );
    const list = el('div.uxd-bd-list');
    for (const it of items) {
      const tags = el('div.uxd-bd-tags');
      const tag = (text: string, kind: 'ok' | 'up' | 'no') => el(`span.uxd-bd-tag.is-${kind}`, uxLamp(kind === 'no' ? 'bad' : kind === 'up' ? '' : 'good', true), el('span', dText(text)));
      tags.append(tag(it.pick.plan ? B.planOptText(it.pick.plan) : t('計画 承認', 'Plan OK'), it.pick.plan ? 'up' : 'ok'));
      const bo = B.budgetOptText(it, it.pick.budget);
      tags.append(tag(t(`予算 ${bo.name}・${bo.val}`, `Budget ${bo.name} · ${bo.val}`), it.pick.budget === 1 ? 'up' : it.pick.budget === 2 ? 'no' : 'ok'));
      if (it.other) tags.append(tag(it.pick.other ? t('要求 否認', 'Request denied') : t('要求 承認', 'Request OK'), it.pick.other ? 'no' : 'ok'));
      const neg = it.pick.budget === 2 || (!!it.other && it.pick.other === 1);
      const st = uxpStamp(neg ? t('否', 'NO') : t('決議', 'Resolved'), {
        kind: neg ? 'dark' : 'good',
        ico: neg ? null : 'check',
      });
      st.show();
      list.append(el('div.uxd-bd-row', uxpFace(Q.heroIcon(it.hero, 64), { win: 40 }), el('div.uxd-bd-row-nm', el('b', dText(B.heroNm(it.hero))), el('span', dText(B.itemTitle(it)))), tags, st.el));
    }
    const last = BB.last;
    let lastLine: HTMLElement | null = null;
    if (last.length) {
      const met = last.filter((x) => (A!.auditor ? x.ok : x.okRep)).length;
      lastLine = el(
        'p.uxd-bd-dim',
        t(`前の四半期の目標：${last.length} 人中 ${met} 人が届いた${A!.auditor ? '（監査の数字）' : '（報告の数字）'}`, `Last quarter: ${met} of ${last.length} met their targets${A!.auditor ? ' (audited)' : ' (reported)'}`),
      );
      if (!jingled && met * 2 >= last.length && met > 0) {
        hooks.sfx('jingle');
        jingled = true;
      }
    }
    panel.append(
      uxpPaper(
        { cls: 'uxd-bd-resolve' },
        uxpHead(t(`第 ${A!.q} 四半期の決議`, `Q${A!.q} resolutions`), {
          kind: 'dark',
          ico: 'check',
        }),
        stats,
        list,
        lastLine,
        el('p.uxd-bd-praise', t(`社長の決裁で、第 ${A!.q} 四半期の計画が動き出します。部長たちはもう走り出しています。`, `Your sign-off sets Q${A!.q} in motion. The heads are already on it.`)),
        el('p.uxd-bd-dim', t('決めた予算・目標は、この四半期のあいだ効きます。目標を上げた部長は士気の目標が下がり、届けば上がります。', 'Budgets and targets apply this quarter. Raised targets weigh on morale until met.')),
      ),
    );
    footSlot.replaceChildren(
      uxpFoot(
        null,
        el(
          'span.uxp-foot-main',
          uxKey(t('閉じる', 'Close'), () => close(), {
            kind: 'main',
            big: true,
            ico: 'check',
            cls: 'uxd-bd-close',
          }),
        ),
      ),
    );
    if (!fromBulk) hooks.sfx('levelup');
    uxSfx('confirm');
  }

  function finish(how: 'skip') {
    if (busy) return;
    B.boardFinish(s, how);
    ctx.save();
    ctx.toast(t('🏛 経営会議：全員 推奨で決めました', '🏛 Board meeting: all decided as recommended'));
    close();
  }
  function close() {
    m.remove();
    hooks.bgm(prevBgm && prevBgm !== 'bgmBoard' ? prevBgm : 'bgmCraft');
    hooks.done();
  }

  /** 来期の打ち手の札（何を・効き目・費用・部長の好み）と、承認・見送るの選択（今の leverEl と同じ中身） */
  function leverEl(it: BoardItem, L: Lever, pick: BoardPick): HTMLElement {
    const head = el(
      'div.uxd-bd-lhead',
      uxTape(el('b', L.k === 'budget' ? t('来期の打ち手（③ の増額）', 'Next move (raise in ③)') : t('来期の打ち手', 'Next move')), 'amber'),
      ...B.styleTags(B.styleOfHero(it.hero)).map((x: string) => el('span.uxd-bd-style', dText(x))),
    );
    const box = el(`div.uxd-bd-lever.is-${L.k}`, head);
    const big = el('div.uxd-bd-lbig');
    if (L.k === 'panel') {
      big.append(el('b.uxd-bd-lname', t(`『${L.nm}』${L.lv ? 'の強化' : ''}`, `“${L.nm}”${L.lv ? ' upgrade' : ''}`)));
      if (L.save && L.units < B.unitsX(0.5))
        big.append(
          el(
            'div.uxd-bd-lnum',
            el('b', t(`税・経費 −${g(L.save.total)}/月`, `Tax & costs −${g(L.save.total)}/mo`)),
            el(
              'span',
              [L.save.tax > 0 ? t(`税 −${g(L.save.tax)}`, `tax −${g(L.save.tax)}`) : '', L.save.cost > 0 ? t(`経費 −${g(L.save.cost)}（税引き後で合計）`, `costs −${g(L.save.cost)} (total after tax)`) : ''].filter(Boolean).join(t('・', ' · ')) +
                t('（直近の決算と帳簿から）', ' (from recent quarters and books)'),
            ),
          ),
        );
      else
        big.append(
          el(
            'div.uxd-bd-lnum',
            el('b', t(`+${fmt1(L.units)} 個/月`, `+${fmt1(L.units)}/mo`)),
            el(
              'span',
              t(
                `${B.STAGE_JA[L.stage]()}（${L.now ? 'いまのボトルネック' : '次のボトルネック'}）・月 +${g(L.val)}${L.save ? `（税・経費 −${g(L.save.total)} を含む）` : ''}`,
                `${B.STAGE_JA[L.stage]()} (${L.now ? 'bottleneck now' : 'next bottleneck'}) · +${g(L.val)}/mo${L.save ? ` (incl. tax & costs −${g(L.save.total)})` : ''}`,
              ),
            ),
          ),
        );
      box.append(big);
      if (L.pre.length) {
        const preJa = L.pre.map((x: string) => t(`『${x}』`, `“${x}”`)).join(t('・', ', '));
        box.append(el('p.uxd-bd-dim', t(`前提のパネル：${preJa} から順に開く`, `Opens ${preJa} first`)));
      }
    } else if (L.k === 'crew') {
      big.append(el('b.uxd-bd-lname', t(`従業員の上限 ${L.cap} 人`, `Staff cap ${L.cap}`)), el('div.uxd-bd-lnum', el('b', t(`+${L.add} 人`, `+${L.add}`)), el('span', t(`足りない人手 ${L.lab} 人日を埋める`, `Covers ${L.lab} person-days`))));
      box.append(big);
    } else {
      big.append(el('b.uxd-bd-lname', `「${L.nm}」`), el('div.uxd-bd-lnum', el('b', t(`月 ${g(L.amt)}`, `${g(L.amt)}/mo`)), el('span', L.val > 0 ? t(`見込み +${g(L.val)}`, `Worth +${g(L.val)}`) : t('打つのに要る予算', 'Budget to run it'))));
      box.append(big);
      return box;
    }
    const rec = it.rec.lever ?? 0;
    box.append(
      options(
        B.leverOpts(L),
        rec,
        () => pick.lever ?? rec,
        (v) => (pick.lever = v as 0 | 1),
      ),
      el('p.uxd-bd-recwhy', t('推奨の理由：', 'Why: ') + dText(B.leverWhy(s, L, rec))),
    );
    return box;
  }

  if (k > 0) speaker();
  else intro();
  return true;
}
