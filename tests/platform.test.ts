// bearko.games の共通基盤への窓口（src/island/platform.ts・docs/PLATFORM.md）。
// SDK が無くても・壊れていても例外を出さない／つながる前の段はつながったときに送る／段の番号と id の決まり。
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TUT } from '../src/island/p1/tut';

type Win = { BearkoGames?: unknown; addEventListener: (type: string, fn: () => void) => void };
const g = globalThis as unknown as { window?: Win };

/** 窓口をまっさらに読み直す（つながったかどうかをモジュールが覚えているため） */
async function fresh() {
  vi.resetModules();
  return import('../src/island/platform');
}

function fakeWindow() {
  const loads: (() => void)[] = [];
  const win: Win = { addEventListener: (type, fn) => type === 'load' && loads.push(fn) };
  g.window = win;
  return { win, load: () => loads.splice(0).forEach((fn) => fn()) };
}

function fakeSdk() {
  const calls: [string, unknown[]][] = [];
  const rec =
    (name: string, out?: unknown) =>
    (...args: unknown[]) => {
      calls.push([name, args]);
      return out;
    };
  const sdk = {
    init: rec('init', Promise.resolve({ ok: true })),
    tutorialStep: rec('tutorialStep'),
    unlockTrophy: rec('unlockTrophy', Promise.resolve({ ok: false })),
    submitScore: rec('submitScore', Promise.resolve({ ok: false })),
    setToastPosition: rec('setToastPosition'),
    rta: { start: rec('rta.start', Promise.resolve({})), checkpoint: rec('rta.checkpoint', Promise.resolve({})), abort: rec('rta.abort') },
    chat: { open: rec('chat.open'), isOpen: () => false, onToggle: rec('chat.onToggle') },
  };
  return { sdk, calls };
}

afterEach(() => {
  delete g.window;
  vi.restoreAllMocks();
});

describe('チュートリアルの段の決まり', () => {
  it('番号は 0〜99 の整数で重ならず、id は英小文字・数字・_・- の 40 字まで。始めは 0、最後は done', async () => {
    const { TUT_STEPS } = await fresh();
    const list = Object.values(TUT_STEPS);
    for (const [n, id] of list) {
      expect(Number.isInteger(n) && n >= 0 && n <= 99).toBe(true);
      expect(id).toMatch(/^[a-z0-9_-]{1,40}$/);
    }
    expect(new Set(list.map(([n]) => n)).size).toBe(list.length);
    expect(new Set(list.map(([, id]) => id)).size).toBe(list.length);
    expect(TUT_STEPS.start).toEqual([0, 'start']);
    expect(TUT_STEPS.done[1]).toBe('done');
    expect(Math.max(...list.map(([n]) => n))).toBe(TUT_STEPS.done[0]);
  });

  it('1 か月目の段（最初の工房の段は「始めた」と同じなので除く）は、どれも表にある', async () => {
    const { TUT_STEPS } = await fresh();
    const missing = TUT.slice(1).map((x) => x.id).filter((id) => !TUT_STEPS[id]);
    expect(missing).toEqual([]);
  });

  it('公開した番号と id は変えない（変えるときはこのテストも直す前に、docs/PLATFORM.md の決まりを読む）', async () => {
    const { TUT_STEPS } = await fresh();
    expect(Object.values(TUT_STEPS).map(([n, id]) => `${n}:${id}`)).toEqual(['0:start', '3:intro_done', '10:ws_wait', '15:craft', '20:mats', '25:shop', '30:shop_wait', '35:sell', '40:haul', '45:first_sale', '50:scm', '55:recruit', '60:hire', '65:month', '75:ranking', '90:done']);
  });
});

describe('SDK が無い・壊れているときも遊べる', () => {
  it('window も SDK も無い（テスト・ボット）：どれを呼んでも例外を出さない', async () => {
    const p = await fresh();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => {
      p.startPlatform();
      p.tutStep('start');
      p.openChat();
      p.toastPlace(80);
      p.onChatToggle(() => undefined);
      p.unlockTrophy('first_sale');
      p.submitScore({ conquered: 1 }, true);
      p.rta.start('successor-c1');
      p.rta.checkpoint('c1', 1000);
      p.rta.abort();
    }).not.toThrow();
    expect(p.platformOn()).toBe(false);
  });

  it('SDK が読めない（オフライン）：load のあとも無ければ、つながらないまま何もしない', async () => {
    const { load } = fakeWindow();
    const p = await fresh();
    p.startPlatform();
    p.tutStep('start');
    load();
    expect(p.platformOn()).toBe(false);
  });

  it('SDK の関数が例外を出しても、ゲームには出さない（console.warn だけ）', async () => {
    const { win } = fakeWindow();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const boom = () => {
      throw new Error('boom');
    };
    win.BearkoGames = { init: boom, tutorialStep: boom, chat: { open: boom, onToggle: boom }, unlockTrophy: () => Promise.reject(new Error('net')) };
    const p = await fresh();
    expect(() => {
      p.startPlatform();
      p.tutStep('craft');
      p.openChat();
      p.unlockTrophy('x');
    }).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});

describe('つなぐ', () => {
  it('SDK があとから読まれる：load で init（タイトル successor・版・チャットは窓でボタンなし・通知は下）。それまでの段はそのとき送る', async () => {
    const { win, load } = fakeWindow();
    const p = await fresh();
    p.startPlatform();
    p.toastPlace(96);
    p.tutStep('start');
    p.tutStep('intro');
    p.tutStep('start');
    const fn = () => undefined;
    p.onChatToggle(fn);
    const { sdk, calls } = fakeSdk();
    win.BearkoGames = sdk;
    load();
    expect(p.platformOn()).toBe(true);
    const init = calls.find(([n]) => n === 'init')![1][0] as Record<string, unknown>;
    expect(init.game).toBe('successor');
    expect(init.version).toBe(JSON.parse(readFileSync('package.json', 'utf8')).version);
    expect(init.chat).toEqual({ layout: 'float', button: false });
    expect(init.toast).toBe('bottom');
    expect(init.toastOffset).toBe(96);
    expect(init.presence).toBeUndefined();
    expect(calls.filter(([n]) => n === 'tutorialStep').map(([, a]) => a)).toEqual([
      [0, 'start'],
      [3, 'intro_done'],
    ]);
    expect(calls.filter(([n]) => n === 'chat.onToggle').map(([, a]) => a[0])).toEqual([fn]);
  });

  it('つながったあと：段は 1 回だけ・知らない段は送らない・アチーブメントは successor. を付ける・通知の場所は変わったときだけ', async () => {
    const { win } = fakeWindow();
    const { sdk, calls } = fakeSdk();
    win.BearkoGames = sdk;
    const p = await fresh();
    p.startPlatform();
    p.tutStep('done');
    p.tutStep('done');
    p.tutStep('nope');
    p.unlockTrophy('first_sale');
    p.toastPlace(16);
    p.toastPlace(16);
    p.openChat();
    expect(calls.filter(([n]) => n === 'tutorialStep').map(([, a]) => a)).toEqual([[90, 'done']]);
    expect(calls.find(([n]) => n === 'unlockTrophy')![1]).toEqual(['successor.first_sale']);
    expect(calls.filter(([n]) => n === 'setToastPosition').map(([, a]) => a[0])).toEqual([{ position: 'bottom', offset: 16 }]);
    expect(calls.some(([n]) => n === 'chat.open')).toBe(true);
  });
});

describe('index.html', () => {
  it('SDK は head の中・ゲームの本体より前に、defer で読む', () => {
    const html = readFileSync('index.html', 'utf8');
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toContain('<script defer src="https://bearko.games/sdk/v1.js"></script>');
    expect(html.indexOf('bearko.games/sdk/v1.js')).toBeLessThan(html.indexOf('type="module"'));
  });
});

describe('アチーブメント', () => {
  it('sendTrophy：受け付けられたら true・定義が無い（400）・通信の失敗・SDK が無いときは false。つながったら onPlatformReady を呼ぶ', async () => {
    const { win } = fakeWindow();
    const { sdk } = fakeSdk();
    const answers: Record<string, () => Promise<unknown>> = { 'successor.ok': () => Promise.resolve({ ok: true, unlocked: [] }), 'successor.no': () => Promise.resolve({ ok: false, status: 400 }), 'successor.net': () => Promise.reject(new Error('net')) };
    sdk.unlockTrophy = (id: unknown) => answers[id as string]() as Promise<{ ok: boolean }>;
    win.BearkoGames = sdk;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const p = await fresh();
    expect(await p.sendTrophy('ok')).toBe(false); // まだつないでいない
    let readyCalls = 0;
    p.onPlatformReady(() => readyCalls++);
    p.startPlatform();
    await new Promise((r) => setTimeout(r, 0));
    expect(readyCalls).toBe(1);
    p.onPlatformReady(() => readyCalls++);
    expect(readyCalls).toBe(2);
    expect(await p.sendTrophy('ok')).toBe(true);
    expect(await p.sendTrophy('no')).toBe(false);
    expect(await p.sendTrophy('net')).toBe(false);
  });

  it('手元に貯めたアチーブメント：受け付けられたものだけ「送った」にして保存し、受け付けられなかったものは次に送り直す', async () => {
    vi.resetModules();
    const accepted = new Set(['first_clear']);
    const sentIds: string[] = [];
    vi.doMock('../src/island/platform', () => ({
      platformOn: () => true,
      sendTrophy: (id: string) => (sentIds.push(id), Promise.resolve(accepted.has(id))),
    }));
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    try {
      const { TROPHY_KEY } = await import('../src/island/p1/trophy');
      store.set(TROPHY_KEY, JSON.stringify({ v: 1, game: 'successor', got: { first_clear: { at: '2026-11-20T00:00:00.000Z', day: 40 }, first_head: { at: '2026-11-20T00:00:00.000Z', day: 50 }, first_duo: { at: '2026-11-20T00:00:00.000Z', day: 10, sent: true } } }));
      const ui = await import('../src/island/p1/trophyui');
      ui.resetTrophyBook();
      ui.syncTrophies();
      await new Promise((r) => setTimeout(r, 0));
      expect(sentIds.sort()).toEqual(['first_clear', 'first_head']);
      const saved = JSON.parse(store.get(TROPHY_KEY)!);
      expect(saved.got.first_clear.sent).toBe(true);
      expect(saved.got.first_head.sent).toBeFalsy();
      sentIds.length = 0;
      ui.syncTrophies();
      await new Promise((r) => setTimeout(r, 0));
      expect(sentIds).toEqual(['first_head']);
    } finally {
      vi.doUnmock('../src/island/platform');
      delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    }
  });
});
