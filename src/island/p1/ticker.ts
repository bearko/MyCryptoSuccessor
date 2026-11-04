/**
 * 段 N1：ニュースのテロップ（上の帯のすぐ下の黒い帯。日々の知らせを右から左へ流す）。
 * いままで左上にトーストで積んでいた「できた・届けた・完成した…」の知らせはここへ。プレイヤーが手を止めて見るべき知らせ
 * （トロフィー・レベルアップ・災害・辞めたい・炎上など）と、押したことへの返事は、いままでどおり画面の中のトースト（main.ts の toast）。
 * どれを帯に・どれを画面に残すかの表は docs/ISLAND_PHASE1.md「ニュースのテロップ」。
 *
 * - 帯の左に「NEWS」の札。知らせは 1 本の流れで、前の知らせのしっぽが通ったら次が入ってくる（◆ で区切る）。
 * - 同じ知らせは束ねる（まだ流れていない・いま流れている同じ文は「×2」）。たまったら速める。もっとたまったら古いものを「ほか N 件」にまとめる。
 * - 会話・カード・提案書・会議などの窓・流れの案内・発掘の画面のあいだは止める（窓の暗幕の下で、続きから流す）。時間を止めていても流し続ける。
 * - 帯を押すと、最近の 20 件の一覧（日付つき）。一覧を開いているあいだも止める。PC はマウスを乗せているあいだ止める。
 * - prefers-reduced-motion では流さず、1 件ずつ切り替えて出す。
 */
import './ticker.css';
import { t } from '../../i18n';
import { h } from './ui';

/** 一覧に残す知らせ */
export type NewsItem = { text: string; n: number; when: string };
/** 流す前の知らせ（sum：「ほか N 件」のまとめ） */
type Queued = { text: string; n: number; sum?: number };
/** いま帯の上を流れている知らせ */
type Live = { el: HTMLElement; text: string; n: number; x: number; w: number };

export type TickerHooks = {
  /** 止めるとき（会話・窓・流れの案内・発掘） */
  hold: () => boolean;
  /** いまの日付の札（一覧に添える） */
  when: () => string;
};

/** 一覧に出す数 */
export const NEWS_LIST = 20;
/** これより多くたまったら、古いものを「ほか N 件」にまとめる */
const NEWS_MAX_QUEUE = 6;
/** まとめたあとに残す新しい知らせの数 */
const NEWS_KEEP = 3;
/** 知らせと知らせのあいだ（px） */
const GAP = 44;

/** 流す速さ（px/秒）：スマホ 84・PC 100。たまっているほど速く（最大でおよそ 1.8 倍） */
export function newsSpeed(wide: boolean, waiting: number): number {
  const base = wide ? 100 : 84;
  return base * (1 + Math.min(4, Math.max(0, waiting)) * 0.2);
}

/**
 * たまった知らせを詰める（純粋な関数。テストあり）：同じ文は束ね、多すぎたら古いものを「ほか N 件」に。
 * 返すのは新しい列（元の列は変えない）
 */
export function packQueue(q: Queued[], text: string): Queued[] {
  const out = q.map((x) => ({ ...x }));
  const same = out.find((x) => !x.sum && x.text === text);
  if (same) same.n++;
  else out.push({ text, n: 1 });
  const items = out.filter((x) => !x.sum);
  if (items.length <= NEWS_MAX_QUEUE) return out;
  const prev = out.find((x) => x.sum)?.sum ?? 0;
  const drop = items.slice(0, items.length - NEWS_KEEP);
  const k = prev + drop.reduce((a, x) => a + x.n, 0);
  return [{ text: t(`…ほか ${k} 件（帯を押すと一覧）`, `…and ${k} more (tap the band for the list)`), n: 1, sum: k }, ...items.slice(-NEWS_KEEP)];
}

export type Ticker = {
  el: HTMLElement;
  /** 知らせを流す */
  push: (text: string) => void;
  /** 最近の知らせ（新しい順） */
  list: () => NewsItem[];
  /** 流す前にたまっている数 */
  waiting: () => number;
  /** 一覧を開く・閉じる */
  openList: () => void;
  closeList: () => void;
  /** 言葉を切り替えたとき（札・一覧の見出しを書き直す） */
  relabel: () => void;
};

export function makeTicker(root: HTMLElement, hooks: TickerHooks): Ticker {
  const el = h('div', 'isl-news');
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  const tag = h('span', 'isl-news-tag');
  const track = h('div', 'isl-news-track');
  const idle = h('span', 'isl-news-idle');
  /** 読み上げ用（流れる字は読み上げにくいので、新しい知らせをそのまま入れる） */
  const live = h('span', 'isl-news-sr');
  live.setAttribute('aria-live', 'polite');
  track.append(idle);
  el.append(tag, track, live);

  const hist: NewsItem[] = [];
  let queue: Queued[] = [];
  const onBand: Live[] = [];
  let listEl: HTMLElement | null = null;
  let hover = false;
  let raf = 0;
  let last = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  /** 1 件ずつ切り替える（動きを減らす設定）：いま出している知らせと、次へ切り替える時刻 */
  let still: { text: string; until: number } | null = null;
  let stillTimer = 0;

  const held = () => !!listEl || hover || hooks.hold();
  const wide = () => innerWidth >= 600;

  function relabel() {
    tag.replaceChildren(h('i', '', '📰'), h('b', '', t('NEWS', 'NEWS')));
    el.setAttribute('aria-label', t('ニュース（押すと最近の知らせの一覧）', 'News (tap for recent news)'));
    showIdle();
  }
  function showIdle() {
    const empty = !onBand.length && !queue.length && !still;
    idle.hidden = !empty;
    if (!empty) return;
    idle.textContent = hist.length ? t(`▸ 最近のニュース ${Math.min(hist.length, NEWS_LIST)} 件（押すと一覧）`, `▸ ${Math.min(hist.length, NEWS_LIST)} recent news (tap for the list)`) : t('ニュースはまだありません', 'No news yet');
  }

  function itemEl(text: string, n: number, sum?: boolean) {
    const e = h('span', `isl-news-item${sum ? ' is-sum' : ''}`);
    e.append(h('i', 'isl-news-dot', '◆'), h('span', '', text));
    if (n > 1) e.append(h('b', 'isl-news-n', `×${n}`));
    return e;
  }
  function setCount(x: Live) {
    let b = x.el.querySelector('.isl-news-n');
    if (!b) {
      b = h('b', 'isl-news-n');
      x.el.append(b);
    }
    b.textContent = `×${x.n}`;
    x.w = x.el.offsetWidth;
  }

  // ---------------------------------------------------------------- 流す
  function spawn() {
    const q = queue.shift();
    if (!q) return;
    const e = itemEl(q.text, q.n, !!q.sum);
    track.append(e);
    const tw = track.clientWidth;
    const prev = onBand[onBand.length - 1];
    const x = Math.max(tw, prev ? prev.x + prev.w + GAP : tw);
    const it: Live = { el: e, text: q.sum ? '' : q.text, n: q.n, x, w: e.offsetWidth };
    e.style.transform = `translateX(${x}px)`;
    onBand.push(it);
  }
  function frame(now: number) {
    raf = 0;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (!el.isConnected) return;
    if (!held()) {
      const tw = track.clientWidth;
      const v = newsSpeed(wide(), queue.length);
      for (const it of onBand) {
        it.x -= v * dt;
        it.el.style.transform = `translateX(${Math.round(it.x)}px)`;
      }
      while (onBand.length && onBand[0].x + onBand[0].w < 0) onBand.shift()!.el.remove();
      const tail = onBand[onBand.length - 1];
      if (queue.length && (!tail || tail.x + tail.w + GAP <= tw)) spawn();
    }
    showIdle();
    if (onBand.length || queue.length) kick();
  }
  function kick() {
    if (reduce.matches) return stepStill();
    if (raf) return;
    raf = requestAnimationFrame((now) => {
      if (!last || now - last > 200) last = now;
      frame(now);
    });
  }

  // ---------------------------------------------------------------- 動きを減らす設定：1 件ずつ切り替える
  function stepStill() {
    if (stillTimer) return;
    const tick = () => {
      stillTimer = 0;
      if (!el.isConnected) return;
      const now = performance.now();
      if (still && (now < still.until || held())) {
        stillTimer = window.setTimeout(tick, 300);
        return;
      }
      for (const it of onBand.splice(0)) it.el.remove();
      const q = queue.shift();
      still = null;
      if (q) {
        const e = itemEl(q.text, q.n, !!q.sum);
        e.classList.add('is-still');
        track.append(e);
        onBand.push({ el: e, text: q.sum ? '' : q.text, n: q.n, x: 0, w: e.offsetWidth });
        // 字数に合わせて 2.5〜5 秒（たまっていたら短く）
        const ms = Math.min(5000, Math.max(2500, q.text.length * 130)) * (queue.length > 2 ? 0.6 : 1);
        still = { text: q.text, until: now + ms };
        stillTimer = window.setTimeout(tick, 300);
      } else {
        // 最後の 1 件は、しばらく残してから消す
        onBand.length = 0;
      }
      showIdle();
    };
    tick();
  }

  // ---------------------------------------------------------------- 知らせを受ける
  function push(text: string) {
    if (!text) return;
    const when = hooks.when();
    const top = hist[0];
    if (top && top.text === text && top.when === when) top.n++;
    else {
      hist.unshift({ text, n: 1, when });
      if (hist.length > NEWS_LIST * 2) hist.length = NEWS_LIST * 2;
    }
    live.textContent = text;
    // いま流れている同じ知らせ（まだ右半分にあるもの）は、×2 にする
    const on = onBand.find((x) => x.text === text && x.x + x.w > track.clientWidth * 0.3);
    if (on) {
      on.n++;
      setCount(on);
    } else queue = packQueue(queue, text);
    if (listEl) renderList();
    kick();
  }

  // ---------------------------------------------------------------- 一覧
  function renderList() {
    if (!listEl) return;
    const box = listEl.querySelector('.isl-news-rows')!;
    const rows = hist.slice(0, NEWS_LIST).map((x) => {
      const li = h('li', 'isl-news-row');
      const body = h('span', '', x.text);
      if (x.n > 1) body.append(h('b', 'isl-news-n', `×${x.n}`));
      li.append(h('small', '', x.when), body);
      return li;
    });
    box.replaceChildren(...(rows.length ? rows : [h('li', 'isl-news-row is-empty', t('ニュースはまだありません', 'No news yet'))]));
  }
  function openList() {
    if (listEl) return;
    const m = h('div', 'isl-news-list');
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-label', t('最近のニュース', 'Recent news'));
    const head = h('div', 'isl-news-list-head');
    const x = h('button', 'isl-btn isl-news-x', '✕');
    x.type = 'button';
    x.setAttribute('aria-label', t('閉じる', 'Close'));
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      closeList();
    });
    head.append(h('b', '', t(`📰 最近のニュース（${NEWS_LIST} 件まで）`, `📰 Recent news (up to ${NEWS_LIST})`)), x);
    m.append(head, h('ul', 'isl-news-rows'));
    m.style.top = `${Math.round(el.getBoundingClientRect().bottom + 4)}px`;
    listEl = m;
    root.append(m);
    renderList();
    el.classList.add('is-open');
    el.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    document.addEventListener('keydown', esc);
  }
  function closeList() {
    if (!listEl) return;
    listEl.remove();
    listEl = null;
    el.classList.remove('is-open');
    el.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', esc);
    kick();
  }
  const outside = (e: Event) => {
    const n = e.target as Node;
    if (listEl?.contains(n) || el.contains(n)) return;
    closeList();
  };
  const esc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeList();
  };

  el.addEventListener('click', () => (listEl ? closeList() : openList()));
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (listEl) closeList();
    else openList();
  });
  el.addEventListener('mouseenter', (e) => {
    if ((e as MouseEvent).buttons === 0 && matchMedia('(hover: hover)').matches) hover = true;
  });
  el.addEventListener('mouseleave', () => {
    hover = false;
    kick();
  });
  reduce.addEventListener?.('change', () => {
    for (const it of onBand.splice(0)) it.el.remove();
    still = null;
    kick();
  });

  relabel();
  return { el, push, list: () => hist.slice(0, NEWS_LIST), waiting: () => queue.length, openList, closeList, relabel };
}

/**
 * 同じ日にできた物を 1 つの知らせに（純粋な関数。テストあり）。
 * 「復刻 ブレイブホースができました」「A・B（2 個）ができました」「A・B・ほか 2 種類ができました」
 */
export function craftedText(names: string[]): string {
  const c = new Map<string, number>();
  for (const n of names) c.set(n, (c.get(n) ?? 0) + 1);
  const xs = [...c].map(([n, k]) => (k > 1 ? t(`${n}（${k} 個）`, `${n} (${k})`) : n));
  const shown = xs.length > 3 ? [...xs.slice(0, 2), t(`ほか ${xs.length - 2} 種類`, `${xs.length - 2} more`)] : xs;
  return t(`${shown.join('・')}ができました`, `Crafted: ${shown.join(', ')}`);
}
