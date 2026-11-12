/**
 * 段 UIX2m：上の帯（資金・今月の売上・エリアの順位・ブランド力・日付と 1 日の進み・速さ）・ニュースのテロップ・
 * 地図の上の札（ミッション・拡大縮小・印）を、方向 C「管制卓」の部品で組む（docs/ISLAND_UIX.md「画面：上と下の帯」）。
 * 手触りラボ C（public/uixlab/c/js/hud.js）の構図を移し、本体の本物のデータへ広げた。
 *
 * 作り方：今の帯の要素（.isl-stat ほか）は消さない。数字の札は新しい計器の下に透明のまま重ねて、押す先・読み上げ・
 * 手応えの場所（ブランド力の光など）に使う。速さのボタン・タブ・ミッションは今の要素をそのまま着せ替える
 * （チュートリアルの目印 is-guide・is-lock はそのまま効く）。出す・隠すは今の描き直し（renderHud）が決めた値を読む。
 *
 * 本体のコード（p1/）は import しない（型だけ）：要る関数は p1/main.ts から host.api で受け取る。
 * 入のときだけ読むこの束が、本体の束（切のときに読む束）の分かれ方を変えないようにするため。
 */
import { isEn, t } from '../../../i18n';
import { el, fmtN } from '../dom';
import { Odo, uxLamp, uxTape } from '../parts';
import { isCalm } from '../prefs';
import { uxMusic, uxSfx } from '../sound';
import type { UxmHost } from './mhooks';
import { MARK_ICO, NEWS_ICO, STAGE_ICO, mIcon } from './micons';

/** 桁の数（頭の 0 を含めて見せる最小の桁） */
export const digitsFor = (v: number, min: number) => Math.max(min, String(Math.abs(Math.round(v))).length);
/** カウンターの大きさ：2 つの計器の桁の合計が多いときは、小さい数字にする（390 で 2 段に収める） */
export const odoSize = (fundsDigits: number, salesDigits: number): '' | 's' => (fundsDigits + salesDigits > 13 ? 's' : '');
/** 日付の札（帯に収まる短い書き方）。d：開店後の日付（開店前は null）。prep：開業準備の何日目か */
export function dateText(d: { year: number; month: number; day: number } | null, prep: number): string {
  if (d) return isEn ? `Y${d.year} M${d.month} D${d.day}` : `${d.year}年目 ${d.month}月${d.day}日`; // i18n-ja
  return t(`開業準備 ${prep}日目`, `Prep day ${prep}`);
}
/** 月の進み（0〜1。今日の進み frac を足す）。left：締めまでの日数・days：ひと月の日数。開店前（open が偽）は 0 */
export function monthFrac(open: boolean, left: number, days: number, frac: number): number {
  if (!open) return 0;
  return Math.max(0, Math.min(1, (days - left + Math.max(0, Math.min(1, frac))) / days));
}
/** 1 日の進みの目盛り（12 段） */
export const dayStep = (frac: number) => Math.round(Math.max(0, Math.min(1, frac)) * 12) / 12;

/** 今の札（透明のまま重ねる）を、新しい見た目の箱に入れる */
function ghost(box: HTMLElement, legacy: HTMLElement): HTMLElement {
  legacy.classList.add('uxm-ghost');
  box.append(legacy);
  return box;
}

export function buildHud(host: UxmHost) {
  const { hud, api } = host;
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => hud.querySelector<T>(sel);
  // 今の並び：資金・ブランド力・炎上・売上・順位・セクタ・日付・課題・効き目・受け箱・（すきま）・速さ
  const kids = [...hud.children] as HTMLElement[];
  const statMoney = kids[0];
  const statSales = kids[3];
  const statRank = kids[4];
  const statBrand = q('.isl-stat-brand')!;
  const statFlame = q('.isl-stat-flame')!;
  const statSector = q('.isl-stat-sector')!;
  const statDate = q('.isl-stat-date')!;
  const statJam = q('.isl-stat-jam')!;
  const statEv = q('.isl-stat-ev')!;
  const statInbox = q('.isl-stat-inbox')!;
  const speedBox = q('.isl-speed')!;
  for (const e of [statMoney, statSales, statDate]) e.classList.add('uxm-legacy');

  // ---- 資金・今月の売上（桁の回るカウンター）
  const s0 = host.s();
  let fundsV = Math.round(s0.money - host.unpaid());
  let salesV = Math.round(api.monthRevenue(s0) - host.unpaid());
  let fd = digitsFor(fundsV, 6);
  let sd = digitsFor(salesV, 7);
  let size = odoSize(fd, sd);
  let funds = new Odo({ digits: fd, size, value: Math.abs(fundsV) });
  let sales = new Odo({ digits: sd, size, value: Math.max(0, salesV), cls: 'ux-odo--amber' });
  const fundsD = el('span.uxm-delta.ux-num', { 'aria-hidden': 'true' });
  const minus = el('span.uxm-minus.ux-num', { hidden: true }, '-');
  const fundsWin = el('span.ux-gauge-win', minus, funds.el, el('span.ux-unit.ux-num', 'G'));
  const salesWin = el('span.ux-gauge-win', sales.el, el('span.ux-unit.ux-num', 'G'));
  const fundsTape = uxTape(t('資金', 'Funds'));
  const gFunds = el('div.uxm-gauge', { 'aria-hidden': 'true' }, fundsTape, fundsD, fundsWin);
  const gSales = el('div.uxm-gauge', { 'aria-hidden': 'true' }, uxTape(t('今月の売上', 'Sales')), salesWin);

  // ---- エリアの順位（押すと企業ランキング）
  const rankNum = el('span.uxm-flap.ux-num', '--');
  // 英語は「#2」、日本語は「2 位」
  const rankUnit = el('span.uxm-rank-unit', t('位', '#'));
  const rankFace = el('span.uxm-face', { 'aria-hidden': 'true' }, uxTape(t('エリア', 'Area')), el('span.uxm-rank-win', isEn ? rankUnit : null, rankNum, isEn ? null : rankUnit));
  const gRank = ghost(el('div.uxm-rank', rankFace), statRank);

  // ---- ブランド力（押すとブランド力の画面）。炎上のおそれ・炎上中は、右上のランプ
  const brandNum = el('b.ux-num', '0');
  const brandLamp = uxLamp('bad');
  const gBrand = ghost(el('div.uxm-chip', el('span.uxm-face', { 'aria-hidden': 'true' }, mIcon('star', { color: '#ffb81f' }), brandNum, brandLamp)), statBrand);

  // ---- 日付・1 日の進み・月の進み（計画中は貼り札）
  const dateTxt = el('span.uxm-date-txt');
  const heldIco = mIcon('pause', { color: '#5fe4ff', scale: 1, cls: 'uxm-held' });
  const dayBar = el('i');
  const monthBar = el('i');
  const dayMeter = el('div.ux-meter.ux-meter--cyan.uxm-day', dayBar);
  const monthMeter = el('div.uxm-month', monthBar);
  const plan = el('span.ux-tape.ux-tape--amber.uxm-plan', { hidden: true });
  const gDate = el('div.uxm-date', el('span.uxm-date-row', heldIco, dateTxt), dayMeter, monthMeter, plan);

  // ---- 速さ（今のボタンに、ドットの絵を入れる。点いているキーは琥珀：その上では絵を濃い色に）
  const SPEED: [string, string][] = [
    ['pause', t('一時停止', 'Pause')],
    ['play', t('再生', 'Play')],
    ['ff', t('早送り', 'Fast forward')],
  ];
  [...speedBox.querySelectorAll<HTMLButtonElement>('.isl-btn')].forEach((b, k) => {
    const [ico, label] = SPEED[k] ?? SPEED[1];
    b.replaceChildren(mIcon(ico, { cls: 'is-dim' }), mIcon(ico, { color: '#1a1c2e', hi: '#1a1c2e', cls: 'is-lit' }), el('span.ux-vh', label));
    b.setAttribute('aria-label', label);
  });
  speedBox.setAttribute('role', 'group');
  speedBox.setAttribute('aria-label', t('時間の進み', 'Game speed'));

  // ---- 印の列（今いる町・課題・効き目・受け箱・炎上）：ランプと貼り札。押す先は今の札
  const tagOf = (legacy: HTMLElement, kind: string) => {
    const face = el('span.uxm-face.uxm-tag-in', { 'aria-hidden': 'true' });
    return { box: ghost(el(`div.uxm-tag.uxm-tag--${kind}`, face), legacy), face, legacy, key: '' };
  };
  const tSector = tagOf(statSector, 'sector');
  const tJam = tagOf(statJam, 'jam');
  const tEv = tagOf(statEv, 'ev');
  const tInbox = tagOf(statInbox, 'inbox');
  const tFlame = tagOf(statFlame, 'flame');
  const tags = el('div.uxm-tags', tSector.box, tJam.box, tFlame.box, tEv.box, tInbox.box);

  const plate = el('div.uxm-hud.ux-plate.ux-root', el('div.ux-screws'), gFunds, gSales, gRank, gBrand, gDate, speedBox, tags);
  hud.prepend(plate);

  const paintTag = (tg: ReturnType<typeof tagOf>, key: string, make: () => (Node | string | null)[]) => {
    const off = tg.legacy.hidden;
    if (tg.box.hidden !== off) tg.box.hidden = off;
    if (off || key === tg.key) return;
    tg.key = key;
    tg.face.replaceChildren(...make().filter((x): x is Node | string => x != null));
  };

  let lastRank: number | null = null;
  let lastDate = '';
  let lastBrand: number | null = null;
  let deltaAcc = 0;
  let deltaAt = 0;
  const showDelta = (n: number) => {
    fundsD.replaceChildren(n < 0 ? mIcon('down', { color: '#ff5964', scale: 1 }) : '', `${n < 0 ? '-' : '+'}${fmtN(Math.abs(n))}`);
    fundsD.classList.toggle('is-down', n < 0);
    fundsD.classList.remove('is-on');
    void fundsD.offsetWidth;
    fundsD.classList.add('is-on');
  };
  const flip = (e: HTMLElement) => {
    e.classList.remove('is-flip');
    void e.offsetWidth;
    e.classList.add('is-flip');
  };

  /** 今の状態を帯に写す（renderHud のたび） */
  function sync() {
    const s = host.s();
    const now = performance.now();
    // 資金・売上：桁が足りなくなったら、計器を作り直す
    const fv = Math.round(s.money - host.unpaid());
    const sv = Math.round(api.monthRevenue(s) - host.unpaid());
    const nfd = digitsFor(fv, 6);
    const nsd = digitsFor(sv, 7);
    if (nfd > fd || nsd > sd || odoSize(Math.max(fd, nfd), Math.max(sd, nsd)) !== size) {
      fd = Math.max(fd, nfd);
      sd = Math.max(sd, nsd);
      size = odoSize(fd, sd);
      const nf = new Odo({ digits: fd, size, value: funds.shown });
      const ns = new Odo({ digits: sd, size, value: sales.shown, cls: 'ux-odo--amber' });
      funds.el.replaceWith(nf.el);
      sales.el.replaceWith(ns.el);
      funds = nf;
      sales = ns;
    }
    if (fv !== fundsV) {
      // 増えた・減ったぶんは、数字の上に小さく出す（日々の出入りはまとめて、0.9 秒に 1 回まで）
      deltaAcc += fv - fundsV;
      fundsV = fv;
      funds.set(Math.abs(fv), { dur: 700 });
      if (now - deltaAt > 900 && Math.abs(deltaAcc) >= 1) {
        showDelta(deltaAcc);
        deltaAcc = 0;
        deltaAt = now;
      }
    }
    minus.hidden = fv >= 0;
    gFunds.classList.toggle('is-bad', fv < 0);
    fundsTape.classList.toggle('uxm-tape-bad', fv < 0);
    if (sv !== salesV) {
      // 月が替わって 0 に戻るときは、回さずに替える
      sales.set(Math.max(0, sv), { dur: sv < salesV ? 0 : 600 });
      salesV = sv;
    }
    // 順位：変わったら札がめくれる（上がったら音）
    const last = s.reports[s.reports.length - 1];
    const rank = last?.rank ?? null;
    gRank.classList.toggle('is-none', rank == null);
    if (rank !== lastRank) {
      const better = lastRank != null && rank != null && rank < lastRank;
      const first = lastRank == null;
      lastRank = rank;
      const txt = rank == null ? '--' : String(rank);
      if (first || isCalm()) rankNum.textContent = txt;
      else {
        flip(rankNum);
        setTimeout(() => (rankNum.textContent = txt), 140);
        if (better) uxSfx('rankup');
      }
      gRank.classList.toggle('is-top', rank === 1);
    }
    // ブランド力・炎上の印
    const brand = s.brand ?? 0;
    if (brand !== lastBrand) {
      if (lastBrand != null) flip(brandNum);
      lastBrand = brand;
      brandNum.textContent = String(brand);
    }
    const flameOn = !statFlame.hidden;
    const fire = flameOn && statFlame.classList.contains('is-fire');
    brandLamp.classList.toggle('is-on', flameOn);
    brandLamp.classList.toggle('is-blink', fire);
    // 日付（変わると札がめくれる）・計画中
    const day = api.date(s);
    const dt = dateText(day, s.day - (s.arrived ?? 0) + 1);
    if (dt !== lastDate) {
      if (lastDate) flip(dateTxt);
      lastDate = dt;
      dateTxt.textContent = dt;
    }
    const planOn = !!s.monthPause && !s.digRun;
    if (plan.hidden === planOn) plan.hidden = !planOn;
    gDate.classList.toggle('is-plan', planOn);
    if (planOn) {
      const d = day;
      const txt = d ? t(`計画中 ▶ ${d.month}月へ`, `Planning ▶ M${d.month}`) : t('計画中 ▶ 次の月へ', 'Planning ▶ next');
      if (plan.textContent !== txt) plan.textContent = txt;
    }
    gDate.classList.toggle('is-held', statDate.classList.contains('is-held'));
    const left = api.daysToClose(s);
    monthMeter.classList.toggle('is-near', !!day && left <= 5);
    gDate.title = day ? t(`月の締めまで あと ${left} 日`, `${left} days to the monthly close`) : '';
    paintMeters();
    // 印の列
    paintTag(tSector, `${s.land?.cur}|${isEn}`, () => {
      const d = api.sectorDef(s.land!.cur);
      tSector.box.style.setProperty('--tc', api.tierColor(d.tier));
      return [mIcon('pin', { color: '#1a1c2e', hi: '#f4ecd4', scale: 1 }), el('small.uxm-long', api.tierLabel(d.tier)), el('small.uxm-short', d.tier), el('b', d.name)];
    });
    const c = api.chipOf(s);
    paintTag(tJam, c ? `${c.k}|${c.k === 'jam' ? c.stage : ''}|${isEn}` : '', () => {
      if (!c) return [];
      tJam.box.classList.toggle('is-build', c.k !== 'jam');
      const name = statJam.querySelector('b')?.textContent?.replace(/^\S+\s/, '') ?? '';
      const ico = c.k === 'jam' ? STAGE_ICO[c.stage] : c.k === 'ws' ? 'hammer' : 'shop';
      return [uxLamp(c.k === 'jam' ? 'bad' : '', true, true), el('small', c.k === 'jam' ? t('課題', 'Issue') : t('次の一手', 'Next')), mIcon(ico, { color: '#1a1c2e', hi: '#f4ecd4', lo: '#1a1c2e', scale: 1 }), el('b', name)];
    });
    const fxs = statEv.hidden ? [] : api.activeFx(s);
    paintTag(tEv, fxs.length ? `${fxs.length}|${Math.max(...fxs.map((f) => f.until - s.day))}|${statEv.classList.contains('is-bad')}|${isEn}` : '', () => {
      const d = Math.max(...fxs.map((f) => f.until - s.day));
      const bad = statEv.classList.contains('is-bad');
      return [uxLamp(bad ? 'bad' : 'good', true), el('small', t('効き目', 'Effect')), mIcon('bolt', { color: '#1a1c2e', scale: 1 }), el('b', `${fxs.length > 1 ? `×${fxs.length} ` : ''}${t(`${d}日`, `${d}d`)}`)];
    });
    const inboxN = statInbox.hidden ? 0 : Number(statInbox.textContent?.match(/\d+/)?.[0] ?? 0);
    paintTag(tInbox, `${inboxN}|${isEn}`, () => [uxLamp('', true, true), mIcon('inbox', { color: '#1a1c2e', scale: 1 }), el('small.uxm-long', t('受け箱', 'Inbox')), el('b.ux-num', String(inboxN))]);
    paintTag(tFlame, `${fire}|${statFlame.querySelector('b')?.textContent}|${isEn}`, () => {
      const pct = statFlame.querySelector('b')?.textContent?.match(/\d+%/)?.[0] ?? '';
      return [uxLamp('bad', true, fire), mIcon(fire ? 'fire' : 'warn', { color: '#1a1c2e', lo: '#f4ecd4', scale: 1 }), el('b', fire ? t('炎上中', 'Backlash') : t('炎上のおそれ', 'Risk')), pct ? el('b.ux-num', pct) : null];
    });
    tags.hidden = [tSector, tJam, tEv, tInbox, tFlame].every((x) => x.box.hidden);
  }

  let lastDay = -1;
  let lastMonth = -1;
  function paintMeters() {
    const f = host.frac();
    const dq = dayStep(f);
    if (dq !== lastDay) {
      lastDay = dq;
      dayBar.style.transform = `scaleX(${dq})`;
    }
    const s = host.s();
    const mq = Math.round(monthFrac(!!api.date(s), api.daysToClose(s), api.DAYS, f) * 60) / 60;
    if (mq !== lastMonth) {
      lastMonth = mq;
      monthBar.style.transform = `scaleX(${mq})`;
    }
  }

  return { plate, sync, paintMeters, fundsEl: () => funds.el };
}

// ---------------------------------------------------------------- ニュースのテロップ

/** テロップ（今の仕組みのまま）に、管制卓の札・BGM の層のランプ・一覧の札を足す */
export function dressTicker(news: HTMLElement) {
  const lamps = Array.from({ length: 5 }, () => uxLamp('cyan'));
  const layers = el('span.uxm-layers', { title: t('BGM の層', 'Music layers'), 'aria-hidden': 'true' }, mIcon('note', { color: '#5fe4ff', scale: 1 }), lamps);
  const list = el('span.uxm-newslist', { 'aria-hidden': 'true' }, mIcon('list', { color: '#1a1c2e', scale: 1 }), el('b', t('一覧', 'List')));
  news.append(layers, list);
  news.classList.add('uxm-ticker');
  const tag = news.querySelector<HTMLElement>('.isl-news-tag');
  const dressTag = () => {
    const i = tag?.querySelector('i');
    if (i && !i.classList.contains('ux-lamp')) i.replaceWith(uxLamp('bad', true, true));
  };
  dressTag();
  // 流れてくる知らせ・一覧の行の種類の印を、ドットの絵に
  const dressIco = (root: ParentNode) => {
    for (const i of root.querySelectorAll<HTMLElement>('.isl-news-ico:not(.uxm-done)')) {
      i.classList.add('uxm-done');
      const name = NEWS_ICO[i.textContent ?? ''];
      if (name) i.replaceChildren(mIcon(name, { color: name === 'warn' ? '#ff5964' : '#ffb81f', lo: '#17120a', scale: 1 }));
    }
  };
  if (typeof MutationObserver === 'function') {
    new MutationObserver(() => {
      dressTag();
      dressIco(news);
    }).observe(news, { childList: true, subtree: true });
    // 一覧（#isl-ui の直下に出る。出たら、その中の行の書き直しも見る）
    const root = news.parentElement;
    let seen: HTMLElement | null = null;
    if (root) {
      const dressList = () => {
        const l = root.querySelector<HTMLElement>(':scope > .isl-news-list');
        if (!l) return void (seen = null);
        if (l !== seen) {
          seen = l;
          new MutationObserver(dressList).observe(l, { childList: true, subtree: true });
        }
        dressIco(l);
        const x = l.querySelector<HTMLElement>('.isl-news-x:not(.uxm-done)');
        if (x) {
          x.classList.add('uxm-done');
          x.replaceChildren(mIcon('close'));
        }
        const hb = l.querySelector<HTMLElement>('.isl-news-list-head > b:not(.uxm-done)');
        if (hb) {
          hb.classList.add('uxm-done');
          hb.textContent = (hb.textContent ?? '').replace(/^\S+\s/, '');
        }
      };
      new MutationObserver(dressList).observe(root, { childList: true });
    }
  }
  let lastN = -1;
  let lastBeat = false;
  return {
    /** 毎コマ：いまの曲の層と拍 */
    frame() {
      const m = uxMusic();
      const n = m ? m.layers.length : 0;
      if (n !== lastN) {
        lastN = n;
        lamps.forEach((l, i) => l.classList.toggle('is-on', i < n));
      }
      const beat = !!m && m.frac < 0.18;
      if (beat !== lastBeat) {
        lastBeat = beat;
        news.classList.toggle('is-beat', beat);
      }
    },
  };
}

// ---------------------------------------------------------------- 地図の上の札・ボタン

/** 拡大縮小のボタン・ミッションの札・地図の印・指さし：今の要素を管制卓の部品に着せ替える */
export function dressMapUi(root: HTMLElement) {
  const zoom = root.querySelector<HTMLElement>(':scope > .isl-zoom');
  if (zoom) {
    const [zin, zout] = [...zoom.querySelectorAll<HTMLButtonElement>('.isl-btn')];
    if (zin) {
      zin.replaceChildren(mIcon('plus'));
      zin.setAttribute('aria-label', t('拡大', 'Zoom in'));
    }
    if (zout) {
      zout.replaceChildren(mIcon('minus'));
      zout.setAttribute('aria-label', t('縮小', 'Zoom out'));
    }
  }
  // 建物を指さす印（チュートリアル）：指の絵文字 → 矢印と貼り札
  const point = root.querySelector<HTMLElement>(':scope > .isl-point');
  if (point) point.replaceChildren(mIcon('left', { color: '#ffb81f', hi: '#ffe394' }), uxTape(t('ここを押す', 'Tap here'), 'amber'));

  const dress = () => {
    // 地図の印（困りごと）：種類の絵文字 → ドットの絵
    for (const b of root.querySelectorAll<HTMLElement>('.isl-mark-pin:not(.uxm-done)')) {
      b.classList.add('uxm-done');
      const ic = b.querySelector('.isl-mark-icon');
      const name = MARK_ICO[b.dataset.kind ?? ''];
      if (ic && name) ic.replaceChildren(mIcon(name, { color: '#1a1c2e', hi: '#f4ecd4', lo: '#1a1c2e' }));
    }
    // ミッションの小さなチェックの数（建物を指さしているあいだは、チェックをたたんで数だけ出す：札が建物を隠さないように）
    for (const row of root.querySelectorAll<HTMLElement>('.isl-missions .isl-mis.is-tut:not(.uxm-done)')) {
      row.classList.add('uxm-done');
      const checks = row.querySelectorAll('.isl-mis-check');
      if (!checks.length) continue;
      const on = row.querySelectorAll('.isl-mis-check.is-on').length;
      row.append(el('small.uxm-mis-sum', t(`チェック ${on} / ${checks.length}`, `Checks ${on} / ${checks.length}`)));
    }
    for (const b of root.querySelectorAll<HTMLElement>('.isl-mark-tip:not(.uxm-done)')) {
      b.classList.add('uxm-done');
      b.replaceChildren(mIcon('bulb', { color: '#1a1c2e', hi: '#ffe394', scale: 1 }));
    }
  };
  dress();
  // 見るのは、印の層とミッションの札だけ（札の中身の作り直しのたびに、画面ぜんたいを調べない）
  if (typeof MutationObserver === 'function') {
    const mo = new MutationObserver(dress);
    for (const sel of [':scope > .isl-marks', ':scope > .isl-missions']) {
      const e = root.querySelector(sel);
      if (e) mo.observe(e, { childList: true, subtree: true });
    }
  }
  let pointing = false;
  /** 毎コマ：建物を指さしているか（チュートリアル） */
  const frame = () => {
    const p = !!point && !point.hidden;
    if (p !== pointing) {
      pointing = p;
      root.classList.toggle('uxm-pointing', p);
    }
  };
  // 今の要素が自分で書き直す印（手紙・タップ・強調の矢印）は、CSS の変数に入れたドットの絵で出す
  const url = (name: string, color: string, hi = '#fffdf3') => {
    try {
      return `url(${mIcon(name, { color, hi }).toDataURL()})`;
    } catch {
      return 'none';
    }
  };
  const st = root.style;
  st.setProperty('--uxm-i-down', url('down', '#ffb81f', '#ffe394'));
  st.setProperty('--uxm-i-mail', url('mail', '#ffb81f', '#1a1c2e'));
  st.setProperty('--uxm-i-lock', url('lock', '#97a1cf', '#151829'));
  st.setProperty('--uxm-i-unlock', url('unlock', '#ffb81f', '#151829'));
  return { frame };
}
