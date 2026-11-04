/**
 * 段 I2：経営会議の画面（ミニゲーム）。中身の計算は board.ts（DOM なし）。
 * 入場 → 1 人ずつの発表（予実の報告 → 来期の計画 → 必要予算 ＋ その他の要求・監査の指摘）→ 3 つの選択（推奨を選んだ状態から）→ ハンコ → 結果のまとめ。
 * - 押すだけで進む：どの話し手も「推奨」が選ばれた状態で出るので、「決定」を押すだけで次へ。入場と発表の途中で「全員 推奨で一括承認」、右上の ✕ で飛ばす（推奨で決める）。
 * - 演出：席の入場・話し手の席が光る・ハンコ（承認は会社の赤い丸印・却下や減額は青い「否」）と、演出の層 playFx（承認 collect-burst・却下 poof・一括承認と
 *   目標の達成 firework-burst）。演出の設定が「なし」なら効果の層は出さず（playFx が false）、CSS の動きも止めて待ち時間を短く。
 * - 音：入場から結果まで BGM 9on9（hooks.bgm）、閉じたら元の BGM。SE は承認 okay・上げる buff・却下と減額 deny・一括承認と目標の達成 jingle・ハンコ place（UI5a と同じ）。
 * - 会議室の絵（壁・長い机・座る部長）は CSS の仮の絵（docs/ISLAND_ART_TODO.md に PixelLab への指示）。
 */
import { t } from '../../i18n';
import { BOARD } from './data';
import {
  askLine,
  auditLines,
  auditSee,
  boardFinish,
  boardOf,
  boardSummary,
  budgetOptText,
  canRaise,
  decide,
  itemTitle,
  moraleHint,
  otherLine,
  planLine,
  planOptText,
  reportLine,
  roleOf,
  type BoardItem,
  type BoardPick,
} from './board';
import { lineOf } from './voice';
import { heroNm } from './deleg';
import { FX_PAL, fxAtEl, fxLevel } from '../fx/layer';
import type { Sfx } from './sfx';
import type { Bgm } from '../../audio';
import type { Ctx } from './screens';
import { btn, h, heroIcon } from './ui';
import './board.css';

const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;
const stars = (n: number) => `${'★'.repeat(n)}${'☆'.repeat(3 - n)}`;

export interface BoardHooks {
  sfx: (k: Sfx, gain?: number, rate?: number) => void;
  /** BGM を替える（入場で 9on9、閉じたら元へ） */
  bgm: (k: Bgm) => void;
  bgmNow: () => Bgm | null;
  /** 閉じた（時間を戻す・描き直す） */
  done: () => void;
}

/** いまの演出が「なし」か（CSS の動きも止める） */
const still = () => fxLevel() === 'off';

/**
 * 経営会議を開く（議題が無ければ何もしない）。閉じるときは hooks.done
 */
export function openBoard(ctx: Ctx, hooks: BoardHooks): boolean {
  const s = ctx.s();
  const A = boardOf(s).agenda;
  if (!A || !A.items.some((x) => !x.done)) return false;
  const prevBgm = hooks.bgmNow();
  hooks.bgm('bgmBoard');
  const items = A.items;
  let k = items.findIndex((x) => !x.done);
  let busy = false;
  let jingled = false;

  const m = h('div', 'isl-modal isl-board');
  m.classList.toggle('is-still', still());
  const wrap = h('div', 'isl-bm');
  // ---- 会議室（CSS の仮の絵）
  const room = h('div', 'isl-bm-room');
  const wall = h('div', 'isl-bm-wall');
  wall.append(h('span', 'isl-bm-plate', s.storeName || t('本社 会議室', 'HQ boardroom')));
  const table = h('div', 'isl-bm-table');
  const seats = h('div', 'isl-bm-seats');
  const seatEls = items.map((it, n) => {
    const seat = h('div', 'isl-bm-seat');
    seat.style.setProperty('--d', `${n * 70}ms`);
    seat.append(heroIcon(it.hero, 40), h('span', 'isl-bm-mark', ''));
    seat.title = t(`${heroNm(it.hero)}（${roleOf(it)}）`, `${heroNm(it.hero)} (${roleOf(it)})`);
    seats.append(seat);
    return seat;
  });
  const chair = h('div', 'isl-bm-chair', t('社長', 'CEO'));
  room.append(wall, table, seats, chair);
  const skip = btn('✕', () => finish('skip'), 'isl-bm-skip');
  skip.title = t('飛ばす（全員 推奨で決める）', 'Skip (decide all as recommended)');
  skip.setAttribute('aria-label', skip.title);
  const panel = h('div', 'isl-bm-panel');
  wrap.append(room, panel, skip);
  m.append(wrap);
  m.addEventListener('click', (e) => e.stopPropagation());
  ctx.root.append(m);
  // 席の大きさ：机の幅に全員が並ぶように（22〜44 px）
  const fitSeats = () => {
    const w = seats.clientWidth || 300;
    seats.style.setProperty('--sz', `${Math.max(22, Math.min(44, Math.floor((w - 4 * (items.length - 1)) / items.length)))}px`);
  };
  fitSeats();

  const total = items.length;
  const heads = items.filter((x) => x.kind === 'dept').length;
  const secs = total - heads;

  // ---- 入場
  function intro() {
    panel.replaceChildren();
    const box = h('div', 'isl-bm-intro');
    box.append(h('h2', 'isl-bm-title', t(`🏛 第 ${A!.q} 四半期 経営会議`, `🏛 Q${A!.q} board meeting`)));
    const secTxt = secs ? t(`・セクター長 ${secs} 人`, `, ${secs} sector heads`) : '';
    box.append(h('p', 'isl-bm-lead', t(`出席：事業部長 ${heads} 人${secTxt}。1 人ずつ「予実の報告 → 来期の計画 → 必要予算」を聞いて、承認するか決めます。`, `Attending: ${heads} division heads${secTxt}. Hear each one’s results, plan and budget, then decide.`)));
    const au = A!.auditor;
    box.append(
      h(
        'p',
        au ? 'isl-bm-audit-on' : 'isl-bm-dim',
        au
          ? t(`🔍 社内監査：経理部長 ${heroNm(au.hero)}（${stars(au.star)}）。盛りが ${Math.round(auditSee(au.star) * 100)}% 以上なら見抜く`, `🔍 Audit: ${heroNm(au.hero)} (${stars(au.star)}), catches padding over ${Math.round(auditSee(au.star) * 100)}%`)
          : t('🔍 社内監査：なし（経理に部長を置くと、盛った報告・甘い計画を見抜ける）', '🔍 No audit (put a head in Accounting to catch padded reports)'),
      ),
    );
    const row = h('div', 'isl-bm-foot');
    row.append(
      btn(t('▶ 会議を始める', '▶ Start'), () => speaker(), 'is-on isl-bm-start'),
      btn(t('⚡ 全員 推奨で一括承認', '⚡ Approve all as recommended'), () => bulk(), 'isl-bm-bulk'),
    );
    box.append(row);
    panel.append(box);
    hooks.sfx('page');
  }

  // ---- 1 人ずつの発表
  function speaker() {
    k = items.findIndex((x) => !x.done);
    if (k < 0) return result();
    const it = items[k];
    seatEls.forEach((e, n) => e.classList.toggle('is-on', n === k));
    panel.replaceChildren();
    panel.scrollTop = 0;
    const card = h('div', 'isl-bm-talk');
    // 話し手
    const who = h('div', 'isl-bm-who');
    const face = h('div', 'isl-bm-face');
    face.append(heroIcon(it.hero, 52));
    const nm = h('div', 'isl-bm-name');
    nm.append(h('b', '', heroNm(it.hero)), h('small', '', `${itemTitle(it)} · ${roleOf(it)}`), h('small', 'isl-bm-star', stars(it.star)));
    who.append(face, nm, h('span', 'isl-bm-count', `${k + 1} / ${total}`));
    card.append(who);
    const pick: BoardPick = { ...it.pick };
    // ① 予実の報告
    const b1 = block('isl-bm-b1', t('① 予実の報告', '① Results'), reportLine(it));
    const nums = h('div', 'isl-bm-nums');
    if ('acts' in it.was) {
      nums.append(chip(t(`予算 ${g(it.was.amt)}`, `Budget ${g(it.was.amt)}`)), chip(t(`使った ${g(it.was.used)}`, `Spent ${g(it.was.used)}`)), chip(t(`施策 ${it.was.acts} 件`, `${it.was.acts} moves`)));
      if (it.was.names.length) nums.append(chip(it.was.names.slice(0, 2).join(t('・', ' · ')), 'is-wide'));
    } else nums.append(chip(t(`利益 ${g(it.was.profit)}`, `Profit ${g(it.was.profit)}`)), chip(t(`投資 ${g(it.was.invest)}`, `Reinvested ${g(it.was.invest)}`)), chip(t(`本社へ ${g(it.was.toHQ)}`, `To HQ ${g(it.was.toHQ)}`)));
    if (it.prev) nums.append(chip(it.prev.okRep ? t(`✔ 目標に届いた（報告）`, '✔ Target met (reported)') : t('✖ 目標に届かなかった', '✖ Target missed'), it.prev.okRep ? 'is-good' : 'is-bad'));
    b1.append(nums);
    card.append(b1);
    // 監査の指摘
    const al = auditLines(it);
    if (it.audit) {
      const ab = h('div', `isl-bm-audit ${al.length ? 'is-flag' : 'is-ok'}`);
      ab.append(h('b', '', al.length ? t('🔍 監査の指摘', '🔍 Audit findings') : t('🔍 監査：指摘なし', '🔍 Audit: no findings')));
      for (const x of al) ab.append(h('p', '', x));
      card.append(ab);
    }
    // ② 来期の計画
    const b2 = block('isl-bm-b2', t('② 来期の計画', '② Plan'), planLine(it));
    if (it.plan.moves.length) b2.append(h('small', 'isl-bm-dim', t(`次の施策：${it.plan.moves.join('・')}`, `Next: ${it.plan.moves.join(', ')}`)));
    const hint = h('small', 'isl-bm-hint');
    const raiseOk = canRaise(it);
    b2.append(
      options(
        [0, 1, 2].map((x) => ({ name: planOptText(x), val: !raiseOk ? (x ? t('見込みが無い', 'No forecast') : t('目標なし', 'No target')) : t(`目標 ${g(it.plan.rep * (1 + BOARD.plan[x]))}`, `Target ${g(it.plan.rep * (1 + BOARD.plan[x]))}`), off: x > 0 && !raiseOk })),
        it.rec.plan,
        () => pick.plan,
        (v) => ((pick.plan = v as BoardPick['plan']), upd()),
      ),
      hint,
    );
    card.append(b2);
    // ③ 必要予算
    const b3 = block('isl-bm-b3', t('③ 必要予算', '③ Budget'), askLine(it));
    b3.append(options([0, 1, 2].map((x) => budgetOptText(it, x)), it.rec.budget, () => pick.budget, (v) => ((pick.budget = v as BoardPick['budget']), upd())));
    card.append(b3);
    // ④ その他の要求
    const ol = otherLine(it);
    if (ol) {
      const b4 = block('isl-bm-b4', t('④ その他の要求', '④ Other request'), ol);
      b4.append(options([{ name: t('承認', 'Approve'), val: '' }, { name: t('否認', 'Deny'), val: '' }], it.rec.other, () => pick.other, (v) => (pick.other = v as BoardPick['other'])));
      card.append(b4);
    }
    // 目標の重さの見込み（士気）
    function upd() {
      const v = moraleHint(it, pick);
      hint.textContent = v ? t(`${heroNm(it.hero)}の士気の目標 ${v > 0 ? '+' : '−'}${Math.abs(Math.round(v))}（目標の重さ）`, `${heroNm(it.hero)}’s morale target ${v > 0 ? '+' : '−'}${Math.abs(Math.round(v))}`) : '';
      hint.hidden = !v;
    }
    upd();
    const foot = h('div', 'isl-bm-foot');
    const ok = btn(t('🖋 決定（ハンコ）', '🖋 Decide (stamp)'), () => stamp(it, pick), 'is-on isl-bm-ok');
    foot.append(ok);
    if (items.filter((x) => !x.done).length > 1) foot.append(btn(t('⚡ 残りを推奨で一括承認', '⚡ Approve the rest as recommended'), () => bulk(), 'isl-bm-bulk'));
    card.append(foot);
    panel.append(card);
    hooks.sfx('page');
  }

  /** ハンコ → 次の話し手 */
  function stamp(it: BoardItem, pick: BoardPick) {
    if (busy) return;
    busy = true;
    const neg = pick.budget === 2 || (!!it.other && pick.other === 1);
    const up = pick.plan > 0 || pick.budget === 1;
    decide(s, it, pick);
    ctx.save();
    const st = h('span', `isl-bm-stamp ${neg ? 'is-no' : ''}`);
    st.textContent = neg ? t('否', 'NO') : s.storeName || t('承認', 'OK');
    st.classList.toggle('is-long', !neg && [...(s.storeName || '')].length > 4);
    const at = h('div', 'isl-bm-stampat');
    at.append(st);
    panel.append(at);
    void st.offsetWidth;
    st.classList.add('is-down');
    const seat = seatEls[items.indexOf(it)];
    const quick = still();
    window.setTimeout(
      () => {
        hooks.sfx('place', 1.2, 0.8);
        hooks.sfx(neg ? 'deny' : up ? 'buff' : 'okay');
        if (neg) fxAtEl('poof', st, { palette: FX_PAL.smoke, dy: 10 });
        else fxAtEl('collect-burst', st, { palette: FX_PAL.gold, dy: 30 });
        seat?.classList.add(neg ? 'is-no' : 'is-ok');
        if (seat) seat.querySelector('.isl-bm-mark')!.textContent = neg ? '✖' : '✔';
        // 話し手のひと言（承認・却下の声。無ければ出さない）
        const say = lineOf(it.hero, neg ? 'rejected' : 'approved', it.key.length);
        if (say) {
          const bub = h('div', 'isl-bm-react', `「${say}」`);
          panel.append(bub);
        }
      },
      quick ? 0 : 240,
    );
    window.setTimeout(
      () => {
        busy = false;
        speaker();
      },
      quick ? 260 : 900,
    );
  }

  /** 残り全員を推奨で（ハンコが席に並んで押される） */
  function bulk() {
    if (busy) return;
    busy = true;
    const rest = items.filter((x) => !x.done);
    boardFinish(s, 'bulk');
    ctx.save();
    const quick = still();
    rest.forEach((it, n) => {
      const seat = seatEls[items.indexOf(it)];
      const neg = it.pick.budget === 2 || (!!it.other && it.pick.other === 1);
      window.setTimeout(
        () => {
          seat?.classList.add(neg ? 'is-no' : 'is-ok', 'is-pop');
          if (seat) seat.querySelector('.isl-bm-mark')!.textContent = neg ? '✖' : '✔';
          if (n < 6) hooks.sfx('place', 0.8, 0.9 + n * 0.04);
        },
        quick ? 0 : 80 * n,
      );
    });
    window.setTimeout(
      () => {
        hooks.sfx('jingle');
        jingled = true;
        fxAtEl('firework-burst', room, { palette: FX_PAL.ours, opts: { core: FX_PAL.core }, dy: -10 });
        busy = false;
        result(true);
      },
      quick ? 100 : Math.min(900, 80 * rest.length + 300),
    );
  }

  /** 結果のまとめ */
  function result(fromBulk = false) {
    const B = boardOf(s);
    // 1 人ずつ決め終えた：会議を閉じる（議題を消す）
    if (B.agenda) boardFinish(s, 'one');
    ctx.save();
    seatEls.forEach((e) => e.classList.remove('is-on'));
    panel.replaceChildren();
    const box = h('div', 'isl-bm-result');
    const sm = boardSummary(items);
    box.append(h('h2', 'isl-bm-title', t(`🏛 第 ${A!.q} 四半期の決定`, `🏛 Q${A!.q} decisions`)));
    const kp = h('div', 'isl-bm-kpis');
    const kpi = (k2: string, v: string, cls = '') => {
      const e = h('div', `isl-bm-kpi ${cls}`);
      e.append(h('small', '', k2), h('b', '', v));
      kp.append(e);
    };
    kpi(t('そのまま承認', 'Approved'), `${sm.ok} / ${items.length}`, 'is-good');
    kpi(t('目標を上げた', 'Targets raised'), String(sm.raised));
    kpi(t('予算を増やした', 'Budget raised'), String(sm.up));
    kpi(t('減額・否認', 'Cut / denied'), String(sm.cut + sm.denied), sm.cut + sm.denied ? 'is-bad' : '');
    box.append(kp);
    const list = h('div', 'isl-bm-list');
    for (const it of items) {
      const row = h('div', 'isl-bm-row');
      row.append(heroIcon(it.hero, 30));
      const nm = h('div', 'isl-bm-row-nm');
      nm.append(h('b', '', heroNm(it.hero)), h('small', '', itemTitle(it)));
      const tags = h('div', 'isl-bm-row-tags');
      tags.append(tag(it.pick.plan ? planOptText(it.pick.plan) : t('計画 承認', 'Plan OK'), it.pick.plan ? 'is-up' : 'is-ok'));
      const bo = budgetOptText(it, it.pick.budget);
      const bn = it.pick.budget === 0 ? t('予算 承認', 'Budget OK') : bo.name;
      tags.append(tag(t(`${bn}・${bo.val}`, `${bn} · ${bo.val}`), it.pick.budget === 1 ? 'is-up' : it.pick.budget === 2 ? 'is-no' : 'is-ok'));
      if (it.other) tags.append(tag(it.pick.other ? t('要求 否認', 'Request denied') : t('要求 承認', 'Request OK'), it.pick.other ? 'is-no' : 'is-ok'));
      row.append(nm, tags);
      list.append(row);
    }
    box.append(list);
    // 前の四半期の目標の結果（本当の数字は監査があるときだけ）
    const last = B.last;
    if (last.length) {
      const met = last.filter((x) => (A!.auditor ? x.ok : x.okRep)).length;
      box.append(h('p', 'isl-bm-dim', t(`前の四半期の目標：${last.length} 人中 ${met} 人が届いた${A!.auditor ? '（監査の数字）' : '（報告の数字）'}`, `Last quarter: ${met} of ${last.length} met their targets${A!.auditor ? ' (audited)' : ' (reported)'}`)));
      if (!jingled && met * 2 >= last.length && met > 0) {
        hooks.sfx('jingle');
        jingled = true;
      }
    }
    box.append(h('p', 'isl-bm-dim', t('決めた予算・目標は、この四半期のあいだ効きます。目標を上げた部長は士気の目標が下がり、届けば上がります。', 'Budgets and targets apply this quarter. Raised targets weigh on morale until met.')));
    const row = h('div', 'isl-bm-foot');
    row.append(btn(t('閉じる', 'Close'), () => close(), 'is-on isl-bm-close'));
    box.append(row);
    panel.append(box);
    if (!fromBulk) hooks.sfx('levelup');
  }

  function finish(how: 'skip') {
    if (busy) return;
    boardFinish(s, how);
    ctx.save();
    ctx.toast(t('🏛 経営会議：全員 推奨で決めました', '🏛 Board meeting: all decided as recommended'));
    close();
  }
  function close() {
    m.remove();
    hooks.bgm(prevBgm && prevBgm !== 'bgmBoard' ? prevBgm : 'bgmCraft');
    hooks.done();
  }

  if (k > 0) speaker();
  else intro();
  return true;
}

/** 発表の 1 つの段（見出し・ひと言） */
function block(cls: string, title: string, say: string): HTMLElement {
  const b = h('div', `isl-bm-block ${cls}`);
  b.append(h('b', 'isl-bm-bt', title), h('p', 'isl-bm-say', say));
  return b;
}
const chip = (text: string, cls = '') => h('span', `isl-bm-chip ${cls}`, text);
const tag = (text: string, cls = '') => h('span', `isl-bm-tag ${cls}`, text);
/** 選択肢の並び（推奨の札つき。押すと選ぶ） */
function options(xs: { name: string; val: string; off?: boolean }[], rec: number, cur: () => number, set: (v: number) => void): HTMLElement {
  const row = h('div', `isl-bm-opts is-${xs.length}`);
  const bs = xs.map((x, n) => {
    const b = h('button', 'isl-bm-opt');
    b.type = 'button';
    b.disabled = !!x.off;
    b.append(h('b', '', x.name));
    if (x.val) b.append(h('small', '', x.val));
    if (n === rec) b.append(h('span', 'isl-bm-rec', t('推奨', 'Rec.')));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      set(n);
      bs.forEach((y, k) => y.classList.toggle('is-on', k === cur()));
    });
    b.classList.toggle('is-on', n === cur());
    return b;
  });
  row.append(...bs);
  return row;
}
