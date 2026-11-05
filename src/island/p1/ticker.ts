/**
 * 段 N1：ニュースのテロップ（上の帯のすぐ下の黒い帯。日々の知らせを右から左へ流す）。
 * いままで左上にトーストで積んでいた「できた・届けた・完成した…」の知らせはここへ。プレイヤーが手を止めて見るべき知らせ
 * （トロフィー・レベルアップ・災害・辞めたい・炎上など）と、押したことへの返事は、いままでどおり画面の中のトースト（main.ts の toast）。
 * どれを帯に・どれを画面に残すかの表は docs/ISLAND_PHASE1.md「ニュースのテロップ」。
 *
 * - 帯の左に「NEWS」の札。知らせは 1 本の流れで、前の知らせのしっぽが通ったら次が入ってくる（◆ で区切る）。
 * - 同じ知らせは束ねる（まだ流れていない・いま流れている同じ文は「×2」）。段 N2：同じ種類の知らせ（kind と group が同じ）は意味のある 1 文に
 *   束ねる（「よろず屋 4 軒で売上 +34,980 G」「3 人がレベルアップ（A・B・C）」「素材が 3 種届いた（木材・鉄・布）」）。たまっても省かず、速めるだけ。
 * - 段 N2：1 件ごとに種類のアイコン（💰 売上・📦 物流・⭐ 人事・🏗 建築・📣 宣伝・⚠ 困りごと）。困りごとは注意色。
 * - 会話・カード・提案書・会議などの窓・流れの案内・発掘の画面のあいだは止める（窓の暗幕の下で、続きから流す）。時間を止めていても流し続ける。
 * - 帯を押すと、最近の 20 件の一覧（日付つき）。一覧を開いているあいだも止める。PC はマウスを乗せているあいだ止める。
 * - prefers-reduced-motion では流さず、1 件ずつ切り替えて出す。
 * - 段 UX1（C-11）：**常に見出しを流す**。たまっている知らせが無いときは、一覧（最近 20 件）の見出しを古い順に繰り返し流し続ける
 *   （前は「▸ 最近のニュース N 件（押すと一覧）」の待機の文で、タップしないと中身が見えなかった）。新しい知らせはいま流れている文のあとに
 *   割り込み、また繰り返しに戻る。一覧が空（ゲームの最初）のときだけ「ニュースはまだありません」を流す。
 */
import './ticker.css';
import { t } from '../../i18n';
import { h } from './ui';

/** 一覧に残す知らせ */
export type NewsItem = { text: string; n: number; when: string; kind?: NewsKind };
/** 段 N2：知らせの種類（先頭のアイコン。trouble は注意色） */
export type NewsKind = 'sale' | 'logi' | 'hr' | 'build' | 'promo' | 'trouble';
export const NEWS_ICON: Record<NewsKind, string> = { sale: '💰', logi: '📦', hr: '⭐', build: '🏗', promo: '📣', trouble: '⚠' };
/**
 * 段 N2：束ねる単位。同じ kind と group の知らせを 1 文にする（文は mergedText）。
 * - name：束ねたときに並べる名前（ヒーロー・素材・お店…）。同じ名前は 1 つに数える
 * - value：束ねたときに足す数（G・個…）
 */
export type NewsOpt = { kind?: NewsKind; group?: NewsGroup; name?: string; value?: number };
export type NewsGroup = 'sector' | 'levelup' | 'delivered' | 'built' | 'stay' | 'closed' | 'late' | 'grew' | 'route' | 'developed' | 'learned' | 'passive' | 'revive' | 'brand' | 'item' | 'rp';
type Part = { name?: string; value?: number };
/** 流す前の知らせ（parts：束ねた中身（2 つ以上なら束ねた文）。row：一覧の行（束ねたら書き直す）） */
export type Queued = { text: string; n: number; kind?: NewsKind; group?: NewsGroup; parts?: Part[]; row?: NewsItem };
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
/** 知らせと知らせのあいだ（px） */
const GAP = 44;
/**
 * 段 UX1（C-11）：たまっている知らせが無いときに流す見出し（純粋な関数。テストあり）。
 * hist（新しい順）の最近 NEWS_LIST 件を古い順に、k 番目（繰り返し）。空なら「ニュースはまだありません」
 */
export function replayPick(hist: readonly NewsItem[], k: number): Queued {
  const xs = hist.slice(0, NEWS_LIST).reverse();
  if (!xs.length) return { text: t('ニュースはまだありません', 'No news yet'), n: 1 };
  const x = xs[((k % xs.length) + xs.length) % xs.length];
  return { text: x.text, n: 1, kind: x.kind };
}
/** 速める上限（たまっている数。× 0.2 で最大 1.6 倍。段 UX1（C-8）：2.2 倍は速すぎて読めなかった → 1.6 倍） */
const SPEED_CAP = 3;

/** 流す速さ（px/秒）：スマホ 84・PC 100。たまっているほど速く（段 N2：省かない。段 UX1：最大でおよそ 1.6 倍） */
export function newsSpeed(wide: boolean, waiting: number): number {
  const base = wide ? 100 : 84;
  return base * (1 + Math.min(SPEED_CAP, Math.max(0, waiting)) * 0.2);
}

const G = (v: number) => `${v < 0 ? '−' : '+'}${Math.abs(Math.round(v)).toLocaleString('en-US')} G`;
/** 名前を「・」でつなぐ（同じ名前は 1 つ。5 つより多いときは 4 つと「ほか N」） */
function joinNames(parts: Part[], unit: string): string {
  const names = [...new Set(parts.map((p) => p.name).filter((x): x is string => !!x))];
  const shown = names.length > 5 ? [...names.slice(0, 4), t(`ほか ${names.length - 4} ${unit}`, `${names.length - 4} more`)] : names;
  return shown.join(t('・', ', '));
}
const countOf = (parts: Part[]) => new Set(parts.map((p) => p.name ?? '')).size;
const sumOf = (parts: Part[]) => parts.reduce((a, p) => a + (p.value ?? 0), 0);

/**
 * 段 N2：同じ種類の知らせを 1 文に（純粋な関数。テストあり）。parts が 2 つ以上のときだけ呼ぶ
 * 「よろず屋 4 軒で売上 +34,980 G」「3 人がレベルアップ（A・B・C）」「素材が 3 種届いた（木材・鉄・布）」
 */
export function mergedText(group: NewsGroup, parts: Part[]): string {
  const k = countOf(parts);
  const v = sumOf(parts);
  const ns = (unit: string) => joinNames(parts, unit);
  switch (group) {
    case 'sector':
      return v >= 0 ? t(`${k} つのセクタで利益 ${G(v)}（${ns('つ')}）`, `${k} sectors: profit ${G(v)} (${ns('')})`) : t(`${k} つのセクタで赤字 ${G(v)}（${ns('つ')}・本社が負担）`, `${k} sectors: loss ${G(v)} (${ns('')}, paid by HQ)`);
    case 'levelup':
      return t(`${k} 人がレベルアップ（${ns('人')}）`, `${k} heroes leveled up (${ns('')})`);
    case 'delivered':
      return t(`素材が ${k} 種届いた（${ns('種')}・計 ${v} 個）`, `${k} materials arrived (${ns('')}, ${v} in all)`);
    case 'built':
      return t(`${k} 軒が完成した（${ns('軒')}）`, `${k} buildings completed (${ns('')})`);
    case 'stay':
      return t(`${k} 人が思いとどまってくれた（${ns('人')}）`, `${k} heroes decided to stay (${ns('')})`);
    case 'closed':
      return t(`${k} 軒が閉まった（店長が休み：${ns('軒')}）`, `${k} shops closed (manager off: ${ns('')})`);
    case 'late':
      return t(`依頼が ${k} 件期限切れ…仲が下がった（${ns('件')}）`, `${k} requests expired… relations fell (${ns('')})`);
    case 'grew':
      return t(`${k} 人の能力が上がった（バイトの経験：${ns('人')}）`, `${k} heroes gained a stat (part-time work: ${ns('')})`);
    case 'route':
      return t(`${k} 本のルートを開拓した（${ns('本')}）`, `Opened ${k} routes (${ns('')})`);
    case 'developed':
      return t(`${k} 品のアンコモンを開発した（${ns('品')}）`, `Developed ${k} Uncommons (${ns('')})`);
    case 'learned':
      return t(`${k} 人が技を身につけた（${ns('人')}）`, `${k} heroes mastered a skill (${ns('')})`);
    case 'passive':
      return t(`${k} 人のパッシブが開いた（${ns('人')}）`, `${k} heroes unlocked a passive (${ns('')})`);
    case 'revive':
      return t(`復興で ${v} 軒を直した（${ns('つ')}）`, `Rebuilt ${v} shops (${ns('')})`);
    case 'brand':
      return t(`ブランド力 ${v < 0 ? '−' : '+'}${Math.abs(v)}（${parts.length} 件）`, `Brand ${v < 0 ? '−' : '+'}${Math.abs(v)} (${parts.length} changes)`);
    case 'item':
      return t(`強化アイテムを ${k} 種手に入れた（${ns('種')}）`, `Got ${k} promotion items (${ns('')})`);
    case 'rp':
      return t(`研究ポイント +${v}（${parts.length} 回）`, `Research points +${v} (${parts.length} times)`);
  }
}

/**
 * たまった知らせに 1 件足す（純粋な関数。テストあり）：
 * 同じ文は「×2」。同じ種類（kind と group が同じ）は 1 文に束ねる（mergedText）。種類の無い知らせは束ねない。
 * 省かない（「ほか N 件」は作らない）。順は古い順のまま。返すのは新しい列（元の列は変えない）
 */
export function mergeQueue(q: Queued[], it: Queued): Queued[] {
  const out = q.map((x) => ({ ...x, parts: x.parts?.map((p) => ({ ...p })) }));
  const same = out.find((x) => x.text === it.text && x.group === it.group);
  if (same) {
    same.n++;
    // 束ねる単位のあるものは中身（数）も足しておく（あとで別の名前と束なったとき、合計に入る）
    if (it.parts) same.parts = [...(same.parts ?? []), ...it.parts];
    return out;
  }
  if (it.kind && it.group) {
    const hit = out.find((x) => x.kind === it.kind && x.group === it.group);
    if (hit) {
      hit.parts = [...(hit.parts ?? []), ...(it.parts ?? [{}])];
      hit.text = mergedText(it.group, hit.parts);
      hit.n = 1;
      return out;
    }
  }
  out.push({ ...it, parts: it.parts?.map((p) => ({ ...p })) });
  return out;
}
/** 列の中の、この知らせが入った所（同じ文、または同じ種類の束） */
export function slotOf(q: Queued[], it: Queued): Queued | undefined {
  return q.find((x) => x.text === it.text && x.group === it.group) ?? (it.kind && it.group ? q.find((x) => x.kind === it.kind && x.group === it.group) : undefined);
}

export type Ticker = {
  el: HTMLElement;
  /** 知らせを流す（opt：種類・束ねる単位。段 N2） */
  push: (text: string, opt?: NewsOpt) => void;
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
  /** 読み上げ用（流れる字は読み上げにくいので、新しい知らせをそのまま入れる） */
  const live = h('span', 'isl-news-sr');
  live.setAttribute('aria-live', 'polite');
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
  /** 段 UX1（C-11）：繰り返し流している見出しの番号（古い順） */
  let loopK = 0;

  const held = () => !!listEl || hover || hooks.hold();
  const wide = () => innerWidth >= 600;

  function relabel() {
    tag.replaceChildren(h('i', '', '📰'), h('b', '', t('NEWS', 'NEWS')));
    el.setAttribute('aria-label', t('ニュース（押すと最近の知らせの一覧）', 'News (tap for recent news)'));
    kick();
  }
  /** 段 UX1（C-11）：次に流すもの。たまっていればそれ、無ければ一覧の見出しを古い順に繰り返し（replay） */
  function nextItem(): { q: Queued; replay: boolean } {
    const q = queue.shift();
    if (q) return { q, replay: false };
    return { q: replayPick(hist, loopK++), replay: true };
  }

  function itemEl(q: Queued) {
    const e = h('span', `isl-news-item${q.kind === 'trouble' ? ' is-trouble' : ''}`);
    e.append(h('i', 'isl-news-dot', '◆'));
    if (q.kind) e.append(h('i', 'isl-news-ico', NEWS_ICON[q.kind]));
    e.append(h('span', '', q.text));
    if (q.n > 1) e.append(h('b', 'isl-news-n', `×${q.n}`));
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
    const { q, replay } = nextItem();
    const e = itemEl(q);
    if (replay) e.classList.add('is-replay');
    track.append(e);
    const tw = track.clientWidth;
    const prev = onBand[onBand.length - 1];
    const x = Math.max(tw, prev ? prev.x + prev.w + GAP : tw);
    // 繰り返しの見出しは text を空に（新しい同じ知らせを ×2 に束ねない）
    const it: Live = { el: e, text: replay || (q.parts?.length ?? 0) > 1 ? '' : q.text, n: q.n, x, w: e.offsetWidth };
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
      // 段 UX1（C-11）：しっぽが通ったら次（たまっていなければ一覧の見出しの繰り返し）。帯は空にしない
      if (!tail || tail.x + tail.w + GAP <= tw) spawn();
    }
    kick();
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
      // 段 UX1（C-11）：たまっていなければ一覧の見出しを 1 件ずつ（常に見出しを出す）
      const { q, replay } = nextItem();
      still = null;
      const e = itemEl(q);
      e.classList.add('is-still');
      if (replay) e.classList.add('is-replay');
      track.append(e);
      onBand.push({ el: e, text: replay || (q.parts?.length ?? 0) > 1 ? '' : q.text, n: q.n, x: 0, w: e.offsetWidth });
      // 字数に合わせて 2.5〜5 秒（たまっていたら短く）
      const ms = Math.min(5000, Math.max(2500, q.text.length * 130)) * (queue.length > 2 ? 0.6 : 1);
      still = { text: q.text, until: now + ms };
      stillTimer = window.setTimeout(tick, 300);
    };
    tick();
  }

  // ---------------------------------------------------------------- 知らせを受ける
  function push(text: string, opt: NewsOpt = {}) {
    if (!text) return;
    const when = hooks.when();
    live.textContent = text;
    // いま流れている同じ知らせ（まだ右半分にあるもの）は、×2 にする
    const on = onBand.find((x) => x.text === text && x.x + x.w > track.clientWidth * 0.3);
    if (on) {
      on.n++;
      setCount(on);
      const top = hist.find((x) => x.text === text);
      if (top) top.n++;
      else hist.unshift({ text, n: 1, when, kind: opt.kind });
    } else {
      // 段 N2：同じ文は ×2・同じ種類は 1 文に束ねる。一覧の行も束ねた文に書き直す（日付は最初のまま）
      const it: Queued = { text, n: 1, kind: opt.kind, group: opt.group, parts: opt.group ? [{ name: opt.name, value: opt.value }] : undefined };
      queue = mergeQueue(queue, it);
      const slot = slotOf(queue, it);
      if (slot?.row) {
        slot.row.text = slot.text;
        slot.row.n = slot.n;
      } else {
        const row: NewsItem = { text, n: 1, when, kind: opt.kind };
        hist.unshift(row);
        if (slot) slot.row = row;
      }
    }
    if (hist.length > NEWS_LIST * 2) hist.length = NEWS_LIST * 2;
    if (listEl) renderList();
    kick();
  }

  // ---------------------------------------------------------------- 一覧
  function renderList() {
    if (!listEl) return;
    const box = listEl.querySelector('.isl-news-rows')!;
    const rows = hist.slice(0, NEWS_LIST).map((x) => {
      const li = h('li', `isl-news-row${x.kind === 'trouble' ? ' is-trouble' : ''}`);
      const body = h('span', '');
      if (x.kind) body.append(h('i', 'isl-news-ico', NEWS_ICON[x.kind]));
      body.append(x.text);
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
