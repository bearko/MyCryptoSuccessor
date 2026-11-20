/**
 * bearko.games の共通基盤（共通ログイン・アチーブメント・総合スコア・RTA・全体チャット・遊んだ人の数）への窓口。
 * ほかのファイルは window.BearkoGames を直接触らず、ここの関数だけを呼ぶ（docs/PLATFORM.md）。
 *
 * 守ること：SDK が読めない（オフライン・ブロック）・通信に失敗する（タイトルの登録がまだ）ときも、ゲームは最後まで遊べる。
 * どの呼び出しも包み、失敗は console.warn だけ。ゲーム側は Cookie を触らない（ログイン状態は共通基盤が持つ）。
 */
import { version } from '../../package.json';

const GAME = 'successor';

/** ここで使う SDK の最小限（https://bearko.games/sdk/v1.js。npm の依存は足さない） */
interface Sdk {
  init(opts: Record<string, unknown>): Promise<unknown>;
  tutorialStep(step: number, id: string): void;
  unlockTrophy(id: string): Promise<unknown>;
  submitScore(metrics: Record<string, unknown>, opts?: { quiet?: boolean }): Promise<unknown>;
  setToastPosition(opts: { position: 'top' | 'bottom'; offset?: number }): void;
  rta: { start(opts: Record<string, unknown>): Promise<unknown>; checkpoint(id: string, opts?: { igtMs?: number }): Promise<unknown>; abort(): void };
  chat: { open(): void; isOpen(): boolean; onToggle(fn: (open: boolean) => void): unknown };
}

const found = (): Sdk | null => (window as unknown as { BearkoGames?: Sdk }).BearkoGames ?? null;
let ready = false;
const sdk = (): Sdk | null => (ready ? found() : null);

function guard<T>(what: string, run: (api: Sdk) => T): T | undefined {
  try {
    const api = sdk();
    if (!api) return undefined;
    const out = run(api);
    if (out instanceof Promise) out.catch((err) => console.warn(`[platform] ${what}`, err));
    return out;
  } catch (err) {
    console.warn(`[platform] ${what}`, err);
    return undefined;
  }
}

/** 共通基盤がつながる前に呼ばれたもの（チュートリアルの段・通知の置き場所・窓の開け閉めの受け手）は、つながったときに送る */
const waiting: [number, string][] = [];
let toastAt = 0;
const toggles: ((open: boolean) => void)[] = [];
/** つながった（init の返事が来た）あとに呼ぶもの（手元に貯めたアチーブメントを送る） */
const readyFns: (() => void)[] = [];
let inited = false;

/**
 * 起動のときに 1 回。SDK は defer なので、まだ無ければページの load を待つ。
 * チャット：地図と右の帯で横幅をいっぱいに使うので、右のドック（PC で 320px）は使わない。
 * 隅はどこもゲームのキーがある（右下は次の月へ）ので 💬 も出さず、設定の「全体チャットを開く」から開く。
 * 通知は画面の下（下の帯の上。toastPlace で場所を合わせる）。
 */
export function startPlatform(): void {
  const begin = (): void => {
    if (ready || !found()) return;
    ready = true;
    const r = guard('init', (api) => api.init({ game: GAME, version, chat: { layout: 'float', button: false }, toast: 'bottom', toastOffset: toastAt }));
    Promise.resolve(r)
      .catch(() => undefined)
      .then(() => {
        inited = true;
        for (const fn of readyFns.splice(0)) fn();
      })
      .catch((err) => console.warn('[platform] ready', err));
    for (const fn of toggles) guard('chat.onToggle', (api) => api.chat.onToggle(fn));
    for (const [step, id] of waiting) guard('tutorialStep', (api) => api.tutorialStep(step, id));
    waiting.length = 0;
  };
  try {
    begin();
    if (!ready) window.addEventListener('load', begin, { once: true });
  } catch (err) {
    console.warn('[platform] start', err);
  }
}

/** SDK がある（設定にチャットのキーを出せる） */
export const platformOn = (): boolean => ready;

export function openChat(): void {
  guard('chat.open', (api) => api.chat.open());
}

/** チャットの窓を開いた・閉じた（開いているあいだ時間を止める） */
export function onChatToggle(fn: (open: boolean) => void): void {
  toggles.push(fn);
  guard('chat.onToggle', (api) => api.chat.onToggle(fn));
}

/** 通知を画面の下から何 px 上に出すか（下の帯に重ねない）。変わったときだけ SDK に伝える */
export function toastPlace(offset: number): void {
  const px = Math.max(0, Math.round(offset));
  if (px === toastAt) return;
  toastAt = px;
  guard('setToastPosition', (api) => api.setToastPosition({ position: 'bottom', offset: px }));
}

// ---------------------------------------------------------------- チュートリアルの段（SDK 1.12.0。表は docs/PLATFORM.md）

/**
 * 1 か月目のチュートリアルの段。キーは p1/tut.ts の段の id（start・intro・done はこのファイルの決まり）。
 * 公開したあとは、番号と id を変えない（前後の数が比べられなくなる）。段を足すときは空いている番号に入れる。
 * 段の並びを変えても（TUT_VERSION）、ここの番号は変えない。
 */
export const TUT_STEPS: Record<string, [number, string]> = {
  start: [0, 'start'],
  intro: [3, 'intro_done'],
  wsWait: [10, 'ws_wait'],
  craft: [15, 'craft'],
  mats: [20, 'mats'],
  shop: [25, 'shop'],
  shopWait: [30, 'shop_wait'],
  sell: [35, 'sell'],
  haul: [40, 'haul'],
  firstSale: [45, 'first_sale'],
  scm: [50, 'scm'],
  recruit: [55, 'recruit'],
  hire: [60, 'hire'],
  month: [65, 'month'],
  ranking: [75, 'ranking'],
  done: [90, 'done'],
};

const sent = new Set<string>();

/** 段に着いた（キーは TUT_STEPS のキー。知らないキーは送らない。同じ段はページの中で 1 回） */
export function tutStep(key: string): void {
  const st = TUT_STEPS[key];
  if (!st || sent.has(key)) return;
  sent.add(key);
  if (!ready) waiting.push(st);
  else guard('tutorialStep', (api) => api.tutorialStep(st[0], st[1]));
}

// ---------------------------------------------------------------- アチーブメント・総合スコア・RTA
// （口だけ。何を送るかは共通基盤に定義を足してから決める。案は docs/PLATFORM.md）

export function unlockTrophy(name: string): void {
  guard('unlockTrophy', (api) => api.unlockTrophy(`${GAME}.${name}`));
}

/** つながったら 1 回呼ぶ（もうつながっていればすぐ） */
export function onPlatformReady(fn: () => void): void {
  if (inited) fn();
  else readyFns.push(fn);
}

/**
 * アチーブメントを 1 つ送り、受け付けられたら true（p1/trophyui.ts の syncTrophies が、手元に貯めたものを送るのに使う）。
 * 共通基盤に定義がまだ無い・通信に失敗した・SDK が無い → false（手元の記録は「まだ送っていない」のまま、次に送り直す）
 */
export function sendTrophy(name: string): Promise<boolean> {
  const out = guard('unlockTrophy', (api) => api.unlockTrophy(`${GAME}.${name}`));
  if (!out) return Promise.resolve(false);
  return out.then((r) => !!(r && (r as { ok?: boolean }).ok)).catch(() => false);
}

export function submitScore(metrics: Record<string, unknown>, quiet = false): void {
  guard('submitScore', (api) => api.submitScore(metrics, { quiet }));
}

export const rta = {
  start: (regulation: string): void => void guard('rta.start', (api) => api.rta.start({ regulation })),
  checkpoint: (id: string, igtMs?: number): void => void guard('rta.checkpoint', (api) => api.rta.checkpoint(id, { igtMs })),
  abort: (): void => void guard('rta.abort', (api) => api.rta.abort()),
};
