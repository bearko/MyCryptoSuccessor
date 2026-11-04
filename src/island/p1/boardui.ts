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
import { BOARD, DEPT } from './data';
import {
  askLine,
  auditLines,
  auditSee,
  boardFinish,
  boardOf,
  boardSummary,
  budgetOptText,
  budgetOpts,
  budgetWhy,
  canRaise,
  decide,
  isYearOpening,
  itemTitle,
  yearOfBoard,
  moraleHint,
  otherLine,
  planLine,
  planOptText,
  reportLine,
  roleOf,
  type BoardAgenda,
  type BoardItem,
  type BoardPick,
} from './board';
import type { P1State } from './model';
import { lineOf } from './voice';
import { heroNm } from './deleg';
import { FX_PAL, fxAtEl, fxLevel } from '../fx/layer';
import type { Sfx } from './sfx';
import type { Bgm } from '../../audio';
import type { Ctx } from './screens';
import { btn, h, heroIcon, recLine } from './ui';
import { pickHead } from './delegui';
import { STAGE_JA, causeChips, causeName, coLive, forecastHint, leverOpts, leverWhy, ofSlack, styleOfHero, type Lever } from './boardplan';
import { styleTags } from './voice';
import { segBar } from './slideui';
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

/**
 * 段 K へのつなぎ口：入場のあと・1 人目の発表の前に差し込む場面（年初の回の「経営方針発表会」：社長が全社方針を選ぶ → 部長が事業別の方針を発表する、など）。
 * when が true の場面を順に出す。run は panel を自分で描き、終わったら next を呼ぶ（next を呼ぶと次の場面か、1 人目の発表へ）。
 * 一括承認・飛ばすで会議を閉じたときは出さない（決めることは board.ts の BOARD_FINISH_HOOKS で）
 */
export interface BoardScene {
  id: string;
  when: (s: P1State, a: BoardAgenda) => boolean;
  run: (ctx: Ctx, a: BoardAgenda, panel: HTMLElement, next: () => void, hooks: BoardHooks) => void;
}
export const BOARD_SCENES: BoardScene[] = [];
/**
 * 段 K へのつなぎ口：部長 1 人ずつの発表に足す行（「事業別の方針」など）。② 来期の計画の前に、返した数だけ段として並べる（無ければ null）
 */
export type BoardItemLine = (s: P1State, it: BoardItem, a: BoardAgenda) => { title: string; say: string; note?: string; el?: HTMLElement } | null;
export const BOARD_ITEM_LINES: BoardItemLine[] = [];

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
    // 年初の回（段 K で「経営方針発表会」を兼ねる）
    if (isYearOpening(A!)) box.append(h('p', 'isl-bm-year', t(`📅 ${yearOfBoard(A!)} 年目の年初の会議`, `📅 Opening meeting of year ${yearOfBoard(A!)}`)));
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
      btn(t('▶ 会議を始める', '▶ Start'), () => scenes(0), 'is-on isl-bm-start'),
      btn(t('⚡ 全員 推奨で一括承認', '⚡ Approve all as recommended'), () => bulk(), 'isl-bm-bulk'),
    );
    box.append(row);
    panel.append(box);
    hooks.sfx('page');
  }

  // ---- 差し込みの場面（段 K。入場のあと・1 人目の前）
  function scenes(i: number) {
    const xs = BOARD_SCENES.filter((x) => x.when(s, A!));
    if (i >= xs.length) return speaker();
    panel.replaceChildren();
    panel.scrollTop = 0;
    let gone = false;
    xs[i].run(ctx, A!, panel, () => {
      if (gone) return;
      gone = true;
      scenes(i + 1);
    }, hooks);
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
    // 段 I2b：施策が無かった・少なかった原因（見出し・大きな札・数字のチップ）
    if (it.why) {
      const cz = h('div', `isl-bm-cause is-${it.why.k}`);
      cz.append(h('small', 'isl-bm-klab', t('原因', 'Cause')), h('b', 'isl-bm-kbig', causeName(it.why)));
      const cc = h('div', 'isl-bm-nums');
      for (const x of causeChips(it.why)) cc.append(chip(x));
      cz.append(cc);
      b1.append(cz);
    }
    card.append(b1);
    // 監査の指摘
    const al = auditLines(it);
    if (it.audit) {
      const ab = h('div', `isl-bm-audit ${al.length ? 'is-flag' : 'is-ok'}`);
      ab.append(h('b', '', al.length ? t('🔍 監査の指摘', '🔍 Audit findings') : t('🔍 監査：指摘なし', '🔍 Audit: no findings')));
      for (const x of al) ab.append(h('p', '', x));
      card.append(ab);
    }
    // 段 K へのつなぎ口：足す行（事業別の方針など）
    for (const f of BOARD_ITEM_LINES) {
      const x = f(s, it, A!);
      if (!x) continue;
      const bx = block('isl-bm-bx', x.title, x.say);
      if (x.note) bx.append(h('small', 'isl-bm-dim', x.note));
      // 段 K：選択肢（事業別の方針の承認・別の方針の指示）
      if (x.el) bx.append(x.el);
      card.append(bx);
    }
    // ② 来期の計画
    const b2 = block('isl-bm-b2', t('② 来期の計画', '② Plan'), planLine(it));
    if (it.plan.moves.length) b2.append(h('small', 'isl-bm-dim', t(`次の施策：${it.plan.moves.join('・')}`, `Next: ${it.plan.moves.join(', ')}`)));
    // 段 I2b：来期の打ち手（パネルを開く・従業員の上限）。承認でその場で開く
    if (it.lever) b2.append(leverEl(it, it.lever, pick));
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
    if (!raiseOk) b2.append(h('small', 'isl-bm-dim isl-bm-fhint', forecastHint(it.lever, it.why)));
    card.append(b2);
    // ③ 必要予算
    const b3 = block('isl-bm-b3', t('③ 必要予算', '③ Budget'), askLine(it));
    b3.append(options([0, 1, 2].map((x) => budgetOptText(it, x)), it.rec.budget, () => pick.budget, (v) => ((pick.budget = v as BoardPick['budget']), upd())));
    // 段 I2b：会社の余力のメーター（選んだ額で動く）・推奨の理由
    const slack = h('div', 'isl-bm-slack');
    const why3 = h('small', 'isl-bm-recwhy');
    if (it.kind === 'dept') b3.append(slack, why3);
    card.append(b3);
    // ④ その他の要求
    const ol = otherLine(it);
    if (ol) {
      const b4 = block('isl-bm-b4', t('④ その他の要求', '④ Other request'), ol);
      const o = it.other!;
      const otherVal = o.k === 'hero' ? t(`${heroNm(o.hero)}を${DEPT[o.dept].name}部長に`, `${heroNm(o.hero)} heads ${DEPT[o.dept].name}`) : t(`${o.rp} RP を使う`, `Spend ${o.rp} RP`);
      b4.append(options([{ name: t('承認', 'Approve'), val: otherVal }, { name: t('否認', 'Deny'), val: o.k === 'hero' ? (o.lvl < BOARD.heroAt ? t(`空席のまま（理解度 ${o.lvl}／${BOARD.heroAt}）`, `Leave empty (level ${o.lvl}/${BOARD.heroAt})`) : t('空席のまま', 'Leave it empty')) : t('RP を使わない', 'No RP') }], it.rec.other, () => pick.other, (v) => (pick.other = v as BoardPick['other'])));
      // ヒーローの追加：候補を自分で選ぶ（段 UI7a の任命の引き出し pickHead → pickFor。選んだ人で承認）
      if (o.k === 'hero') {
        b4.append(
          btn(
            t('👤 ほかの候補から選ぶ', '👤 Choose another candidate'),
            () =>
              pickHead(ctx, o.dept, null, (hero) => {
                o.hero = hero;
                it.pick = { ...pick, other: 0 };
                ctx.save();
                speaker();
              }),
            'isl-bm-pick',
          ),
        );
      }
      card.append(b4);
    }
    // 目標の重さの見込み（士気）
    function upd() {
      if (it.kind === 'dept') {
        drawSlack(slack, s, it, pick);
        why3.textContent = t('推奨の理由：', 'Why: ') + budgetWhy(it, coLive(s, A!.co));
      }
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
      // 予算：選んだ手の名前と、いまの額 → 決めたあとの額（同じ比べで読める。budgetOptText）
      const bo = budgetOptText(it, it.pick.budget);
      tags.append(tag(t(`予算 ${bo.name}・${bo.val}`, `Budget ${bo.name} · ${bo.val}`), it.pick.budget === 1 ? 'is-up' : it.pick.budget === 2 ? 'is-no' : 'is-ok'));
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
    // 社長の手柄（ビジョン 0 章）：決めたのは社長
    box.append(h('p', 'isl-bm-praise', t(`社長の決裁で、第 ${A!.q} 四半期の計画が動き出します。部長たちはもう走り出しています。`, `Your sign-off sets Q${A!.q} in motion. The heads are already on it.`)));
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

  /** 段 I2b：来期の打ち手のカード（何を・効き目・費用・部長の好み）と、承認・見送るの選択 */
  function leverEl(it: BoardItem, L: Lever, pick: BoardPick): HTMLElement {
    const box = h('div', `isl-bm-lever is-${L.k}`);
    const top = h('div', 'isl-bm-lhead');
    top.append(h('small', 'isl-bm-klab', L.k === 'budget' ? t('来期の打ち手（③ の増額）', 'Next move (raise in ③)') : t('来期の打ち手', 'Next move')));
    for (const x of styleTags(styleOfHero(it.hero))) top.append(h('span', 'isl-bm-style', x));
    box.append(top);
    const big = h('div', 'isl-bm-lbig');
    if (L.k === 'panel') {
      big.append(h('b', 'isl-bm-lname', t(`『${L.nm}』${L.lv ? 'の強化' : ''}`, `“${L.nm}”${L.lv ? ' upgrade' : ''}`)));
      const num = h('div', 'isl-bm-lnum');
      // 段 I2c：税・経費の手は、月の減り（税・経費の内訳）を大きく
      if (L.save && L.units < 0.5)
        num.append(
          h('b', '', t(`税・経費 −${g(L.save.total)}/月`, `Tax & costs −${g(L.save.total)}/mo`)),
          h('small', '', [L.save.tax > 0 ? t(`税 −${g(L.save.tax)}`, `tax −${g(L.save.tax)}`) : '', L.save.cost > 0 ? t(`経費 −${g(L.save.cost)}（税引き後で合計）`, `costs −${g(L.save.cost)} (total after tax)`) : ''].filter(Boolean).join(t('・', ' · ')) + t('（直近の決算と帳簿から）', ' (from recent quarters and books)')),
        );
      else
        num.append(
          h('b', '', t(`+${fmt1(L.units)} 個/月`, `+${fmt1(L.units)}/mo`)),
          h('small', '', t(`${STAGE_JA[L.stage]()}（${L.now ? 'いまの詰まり' : '次の詰まり'}）・月 +${g(L.val)}${L.save ? `（税・経費 −${g(L.save.total)} を含む）` : ''}`, `${STAGE_JA[L.stage]()} (${L.now ? 'bottleneck now' : 'next bottleneck'}) · +${g(L.val)}/mo${L.save ? ` (incl. tax & costs −${g(L.save.total)})` : ''}`)),
        );
      big.append(num);
      const preJa = L.pre.map((x) => t(`『${x}』`, `“${x}”`)).join(t('・', ', '));
      if (L.pre.length) box.append(big, h('small', 'isl-bm-dim', t(`前提のパネル：${preJa} から順に開く`, `Opens ${preJa} first`)));
      else box.append(big);
    } else if (L.k === 'crew') {
      big.append(h('b', 'isl-bm-lname', t(`従業員の上限 ${L.cap} 人`, `Staff cap ${L.cap}`)));
      const num = h('div', 'isl-bm-lnum');
      num.append(h('b', '', t(`+${L.add} 人`, `+${L.add}`)), h('small', '', t(`足りない人手 ${L.lab} 人日を埋める`, `Covers ${L.lab} person-days`)));
      big.append(num);
      box.append(big);
    } else {
      big.append(h('b', 'isl-bm-lname', `「${L.nm}」`));
      const num = h('div', 'isl-bm-lnum');
      num.append(h('b', '', t(`月 ${g(L.amt)}`, `${g(L.amt)}/mo`)), h('small', '', L.val > 0 ? t(`見込み +${g(L.val)}`, `Worth +${g(L.val)}`) : t('打つのに要る予算', 'Budget to run it')));
      big.append(num);
      box.append(big);
      return box;
    }
    const rec = it.rec.lever ?? 0;
    box.append(options(leverOpts(L), rec, () => pick.lever ?? rec, (v) => (pick.lever = v as 0 | 1)), h('small', 'isl-bm-recwhy', t('推奨の理由：', 'Why: ') + leverWhy(s, L, rec)));
    return box;
  }

  if (k > 0) speaker();
  else intro();
  return true;
}

const fmt1 = (v: number) => (v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));
/**
 * 段 I2b：会社の余力のメーター（UI7d のスライドの予算のメーターと同じ流儀）：上に 3 つの数（見出し・大きな数字・小さなラベル）、
 * 下に区切りの棒（ほかの部門の予算・この部門・増額・余力。月の利益を超えた分は斜線）。選んだ額で描き直す
 */
function drawSlack(el: HTMLElement, s: P1State, it: BoardItem, pick: BoardPick) {
  el.replaceChildren();
  // 余力は、先に決めた人の予算を入れた「いま」の値（この人の分は、まだ決める前の額）
  const co = coLive(s, boardOf(s).agenda?.co);
  const v = budgetOpts(it)[pick.budget];
  const d = v - it.ask.cur;
  const caps = co.caps + d;
  const left = co.earn - caps;
  const kp = h('div', 'isl-bm-mk');
  const cell = (lab: string, big: string, sub: string, cls = '') => {
    const c = h('div', `isl-bm-mkc ${cls}`);
    c.append(h('small', '', lab), h('b', '', big), h('small', '', sub));
    kp.append(c);
  };
  cell(t('会社の余力（月）', 'Company slack (per month)'), g(left), d ? t(`いま ${g(co.slack)} から ${d > 0 ? '増額' : '減額'} ${g(Math.abs(d))}`, `now ${g(co.slack)}, ${d > 0 ? 'raise' : 'cut'} ${g(Math.abs(d))}`) : t('あと月これだけ増やしても、月の利益の内', 'How much more fits within monthly profit'), `is-main ${left < 0 ? 'is-bad' : 'is-good'}`);
  const r0 = co.earn > 0 ? Math.round((co.caps / co.earn) * 100) : null;
  const r1 = co.earn > 0 ? Math.round((caps / co.earn) * 100) : null;
  cell(t('全部門の予算', 'All budgets'), r1 == null ? t('利益なし', 'No profit') : t(`利益の ${r1}%`, `${r1}% of profit`), r0 != null && r0 !== r1 ? t(`いま ${r0}% ・月 ${g(caps)}`, `now ${r0}% · ${g(caps)}/mo`) : t(`月 ${g(caps)}`, `${g(caps)}/mo`), r1 != null && r1 > 100 ? 'is-bad' : '');
  if (it.left != null) cell(t('今期の予算の残り', 'Unspent this quarter'), g(it.left), t('繰り越さない（会社の資金に残る）', 'Not carried over (stays in cash)'));
  el.append(kp);
  const total = Math.max(co.earn, caps, 1);
  const mine = Math.min(v, it.ask.cur);
  el.append(
    segBar(
      [
        { v: Math.max(0, co.caps - it.ask.cur), cls: 'is-used', lab: t(`ほかの部門 ${g(Math.max(0, co.caps - it.ask.cur))}`, `Others ${g(Math.max(0, co.caps - it.ask.cur))}`) },
        { v: mine, cls: 'is-mine', lab: t(`この部門 ${g(mine)}`, `This ${g(mine)}`) },
        ...(d > 0 ? [{ v: d, cls: 'is-up', lab: t(`増額 ${g(d)}`, `Raise ${g(d)}`) }] : []),
        ...(left > 0 ? [{ v: left, cls: 'is-left2', lab: t(`余力 ${g(left)}`, `Slack ${g(left)}`) }] : [{ v: -left, cls: 'is-over', lab: t(`利益を超える ${g(-left)}`, `Over profit ${g(-left)}`) }]),
      ],
      total,
      { at: Math.max(0, co.earn), lab: t(`月の利益 ${g(co.earn)}（部門の予算を使う前）`, `Monthly profit ${g(co.earn)} (before budgets)`) },
    ),
  );
  if (d > 0 && left > 0) el.append(h('small', 'isl-bm-dim', t(`この増額は${ofSlack(d, co.slack)}`, `This raise is ${ofSlack(d, co.slack)}`)));
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
    // 推奨の札（段 UI5d の共通部品。1 行目の頭に朱の札）
    b.append(recLine(x.name, n === rec));
    if (x.val) b.append(h('small', '', x.val));
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
