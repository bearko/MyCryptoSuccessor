// 段 UIX1a：新しい画面（方向 C「管制卓」）の土台（docs/ISLAND_UIX.md）。
// 目印（既定で入・前の切り替えは読まない）・値の名前・ボタンの種類・器の開閉で消すのを待つこと・桁の回り方・レバー・動きを減らす・音の口
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initUx, resolveUx, uxOn } from '../src/island/uix/flag';
import { ux } from '../src/island/uix/hooks';
import { WIPE, wipe, wipeOrder } from '../src/island/uix/fx';
import { SWAP_MS, deferClose, wipeLabel } from '../src/island/uix/legacy';
import { KEY_KINDS, LEVER, PRESS_MIN_MS, forgetRoll, keyClass, leverCore, meterStep, odoPositions, rollDelta, rollValue, typePause } from '../src/island/uix/parts';
import { PREFS_DEF, TALK_CPS, calmOf, cleanPrefs } from '../src/island/uix/prefs';
import { UX_SFX, uxSfx } from '../src/island/uix/sound';
import { fxOn } from '../src/island/fx/layer';
import { sheet } from '../src/island/p1/ui';

const css = (f: string) => readFileSync(new URL(`../src/island/uix/${f}`, import.meta.url), 'utf8');
const G = globalThis as unknown as Record<string, unknown>;

/** DOM の無いテスト環境なので、要る分だけの document・window・localStorage を置く */
function fakePage(search = '', stored: Record<string, string> = {}) {
  const cls = new Set<string>();
  const events: { type: string; detail: unknown }[] = [];
  const store = { ...stored };
  const prev = { document: G.document, window: G.window, localStorage: G.localStorage, location: G.location, CustomEvent: G.CustomEvent };
  G.document = {
    documentElement: {
      classList: {
        toggle: (c: string, on: boolean) => (on ? cls.add(c) : cls.delete(c)),
        contains: (c: string) => cls.has(c),
        add: (c: string) => cls.add(c),
        remove: (c: string) => cls.delete(c),
      },
    },
  };
  G.CustomEvent = class {
    constructor(
      public type: string,
      public init?: { detail?: unknown },
    ) {}
  };
  G.window = { dispatchEvent: (e: { type: string; init?: { detail?: unknown } }) => events.push({ type: e.type, detail: e.init?.detail }) };
  G.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: (k: string) => void delete store[k] };
  G.location = { search };
  return {
    cls,
    events,
    store,
    restore() {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete G[k];
        else G[k] = v;
      }
    },
  };
}
let page: ReturnType<typeof fakePage> | null = null;
afterEach(() => {
  page?.restore();
  page = null;
  for (const k of Object.keys(ux)) delete (ux as Record<string, unknown>)[k];
});

describe('目印（<html class="is-uxc">。段 UIX5a から既定で入）', () => {
  it('URL によらず入。?uix=kit は見本帳。前の ?uix=0・?uix=1 は読まない', () => {
    expect(resolveUx('')).toEqual({ on: true, kit: false });
    expect(resolveUx('?test=2')).toEqual({ on: true, kit: false });
    expect(resolveUx('?uix=0')).toEqual({ on: true, kit: false });
    expect(resolveUx('?uix=1')).toEqual({ on: true, kit: false });
    expect(resolveUx('?uix=kit')).toEqual({ on: true, kit: true });
  });
  it('起動：何も無くても class が付く。前の切り替えで覚えた値（isl.uxc）は、読まずに消す', () => {
    page = fakePage('', { 'isl.uxc': '0', other: 'x' });
    const c = initUx('');
    expect(c.on).toBe(true);
    expect(uxOn()).toBe(true);
    expect(page.cls.has('is-uxc')).toBe(true);
    expect(page.store).toEqual({ other: 'x' });
    // 音の担当へ：いまの状態を知らせる
    expect(page.events).toEqual([{ type: 'uxc:change', detail: { on: true } }]);
  });
  it('?uix=0 を付けても入のまま（覚えない）', () => {
    page = fakePage('?uix=0');
    initUx('?uix=0');
    expect(uxOn()).toBe(true);
    expect(page.store).toEqual({});
  });
  it('起動の前は、差し込み口は空（呼ぶ側は ux.x?.() と書くので、何も起きない）', () => {
    expect(Object.keys(ux)).toEqual([]);
  });
});

describe('値（tokens.css）と、.is-uxc の内側だけに書く決まり', () => {
  const tokens = css('tokens.css');
  it('色・升目・切り欠き・網目・字の段・数字の段・動き・重なりの段が、--ux-* の名前でそろっている', () => {
    const names = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'paper', 'paper2', 'paper3', 'ink', 'amber', 'amber-hi', 'amber-lo', 'good', 'good-lo', 'bad', 'bad-lo', 'cyan', 'cyan-lo', 'white', 'jp', 'num', 'u', 't1', 't15', 't2', 't3', 'n15', 'n2', 'n3', 'n4', 'notch', 'notch4', 'dz50', 'dz25', 'dz50w', 'dz25w', 'd-press', 'e-press', 'd-in', 'e-in', 'd-out', 'd-page', 'e-page', 'd-big', 'z-sheet', 'z-fx', 'z-wipe', 'z-toast', 'z-crt'];
    for (const n of names) expect(tokens, `--ux-${n}`).toMatch(new RegExp(`--ux-${n}:`));
    // 見本の値そのまま
    expect(tokens).toContain('--ux-k0: #0b0d17;');
    expect(tokens).toContain('--ux-amber: #ffb81f;');
    expect(tokens).toContain('--ux-paper: #f4ecd4;');
    expect(tokens).toContain('--ux-u: 2px;');
  });
  it('色の組は 2 つ：色覚に配慮（is-cvd）は、良い＝青・急ぎ＝橙', () => {
    const cvd = tokens.slice(tokens.indexOf('html.is-uxc.is-cvd'));
    expect(cvd).toContain('--ux-good: #4cc3ff;');
    expect(cvd).toContain('--ux-bad: #ff9a3c;');
  });
  it('文字の大きさは 100・115・130%', () => {
    expect(tokens).toMatch(/html\.is-uxc \{ font-size: 16px; \}/);
    expect(tokens).toMatch(/html\.is-uxc\.is-t115 \{ font-size: 18\.4px; \}/);
    expect(tokens).toMatch(/html\.is-uxc\.is-t130 \{ font-size: 20\.8px; \}/);
  });
  it('動きの長さ：押す 60〜90ms・出入り 180〜260ms・めくり 500〜700ms・大きな演出 1.5〜3s', () => {
    const ms = (n: string) => Number(new RegExp(`--ux-${n}: (\\d+)ms;`).exec(tokens)![1]);
    for (const n of ['d-press', 'd-switch']) expect(ms(n)).toBeGreaterThanOrEqual(60), expect(ms(n)).toBeLessThanOrEqual(90);
    for (const n of ['d-out', 'd-in']) expect(ms(n)).toBeGreaterThanOrEqual(180), expect(ms(n)).toBeLessThanOrEqual(260);
    expect(ms('d-page')).toBeGreaterThanOrEqual(500);
    expect(ms('d-page')).toBeLessThanOrEqual(700);
    expect(ms('d-big')).toBeGreaterThanOrEqual(1500);
    expect(ms('d-big')).toBeLessThanOrEqual(3000);
    // 網目の幕：閉じる＋止まる＋晴れるで 500〜700ms
    const total = WIPE.inMs + WIPE.holdMs + WIPE.outMs;
    expect(total).toBeGreaterThanOrEqual(500);
    expect(total).toBeLessThanOrEqual(700);
  });
  it('新しい CSS のセレクタは、すべて .is-uxc の内側（切のときは 1 つも当たらない）。角は丸めない', () => {
    for (const f of ['tokens.css', 'base.css', 'parts.css', 'sparts.css', 'legacy.css', 'kit.css']) {
      const src = css(f).replace(/\/\*[\s\S]*?\*\//g, '');
      let depth = 0;
      let inKeyframes = -1;
      let buf = '';
      const bad: string[] = [];
      for (const ch of src) {
        if (ch === '{') {
          const sel = buf.trim();
          if (sel.startsWith('@keyframes')) inKeyframes = depth;
          else if (!sel.startsWith('@') && inKeyframes < 0) for (const one of sel.split(/,(?![^(]*\))/)) if (!/is-uxc/.test(one)) bad.push(one.trim());
          depth++;
          buf = '';
        } else if (ch === '}') {
          depth--;
          if (inKeyframes >= 0 && depth <= inKeyframes) inKeyframes = -1;
          buf = '';
        } else if (ch === ';') buf = '';
        else buf += ch;
      }
      expect(bad, f).toEqual([]);
      // 丸みは、外す決まり（0）だけ
      const radius = [...src.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim());
      expect(radius.every((v) => /^0( !important)?$/.test(v)), `${f} ${radius.join('|')}`).toBe(true);
    }
  });
  it('新しい部品の中の字は、12px を下回らない（rem・em・変数で書く。px の小さい字は無い）', () => {
    for (const f of ['parts.css', 'sparts.css', 'legacy.css', 'kit.css']) {
      const px = [...css(f).matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
      expect(px.every((v) => v >= 16), `${f} ${px.join(',')}`).toBe(true);
      const rem = [...css(f).matchAll(/font-size:\s*(\d+(?:\.\d+)?)rem/g)].map((m) => Number(m[1]));
      expect(rem.every((v) => v >= 1), `${f} ${rem.join(',')}`).toBe(true);
    }
  });
});

describe('ボタン（キー）', () => {
  it('種類は 4 つまで：主（琥珀）・ふつう・弱い・危ない。押せないものは平ら', () => {
    expect(KEY_KINDS).toEqual(['main', '', 'weak', 'danger']);
    expect(keyClass()).toBe('ux-key');
    expect(keyClass({ kind: 'main', big: true })).toBe('ux-key ux-key--main ux-key--big');
    expect(keyClass({ kind: 'danger', cls: 'x' })).toBe('ux-key ux-key--danger x');
    // 押せないときは、種類によらず平ら
    expect(keyClass({ kind: 'main', disabled: true })).toBe('ux-key ux-key--flat');
    const parts = css('parts.css');
    for (const k of ['main', 'weak', 'danger', 'flat']) expect(parts).toContain(`.ux-key--${k}`);
    // 見本の値：押すと 4px 沈む・60ms・2 段
    expect(parts).toMatch(/\.ux-key\.is-ux-down > \.ux-cap,[\s\S]{0,80}transform: translateY\(4px\)/);
    expect(parts).toContain('transition: transform 60ms steps(2, end);');
    expect(PRESS_MIN_MS).toBeGreaterThanOrEqual(60);
    expect(PRESS_MIN_MS).toBeLessThanOrEqual(90);
  });
  it('いまのボタン（.isl-btn）：入のときの字は 16px のドットの字（無効だった font の短縮形を、入の決まりの中で決め直す）', () => {
    const legacy = css('legacy.css');
    expect(legacy).toContain('font: 400 1rem/1.25 var(--ux-jp);');
    expect(legacy).toMatch(/\.isl-btn\.is-ux-down \{\s*translate: 0 4px;/);
    // 押せる所は 44px 以上
    expect(legacy).toMatch(/\.isl-btn \{[\s\S]*?min-width: 44px;\s*min-height: 44px;/);
  });
});

describe('器の開閉：閉じるのは、幕が閉じきるのを待ってから消す', () => {
  const fakeEl = () => ({ isConnected: true, dataset: {} as Record<string, string | undefined>, classList: { list: [] as string[], add(c: string) { this.list.push(c); } } });
  it('deferClose：幕が閉じきる（mid）まで消さない。2 回目の呼び出しは何もしない', () => {
    const e = fakeEl();
    let mid: (() => void) | null = null;
    const fn = vi.fn();
    expect(deferClose(e, (m) => (mid = m), fn)).toBe(true);
    expect(fn).not.toHaveBeenCalled();
    expect(e.classList.list).toContain('ux-leaving');
    // ✕ の連打・外側の押し直し
    expect(deferClose(e, () => expect.unreachable(), fn)).toBe(false);
    mid!();
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('待っているあいだに別の経路で消えていたら、もう呼ばない（2 重に閉じない）', () => {
    const e = fakeEl();
    let mid: (() => void) | null = null;
    const fn = vi.fn();
    deferClose(e, (m) => (mid = m), fn);
    e.isConnected = false;
    mid!();
    expect(fn).not.toHaveBeenCalled();
  });

  /** sheet() を、要る分だけの DOM で動かす */
  class El {
    className = '';
    textContent = '';
    type = '';
    children: El[] = [];
    removed = false;
    listeners: Record<string, ((e: unknown) => void)[]> = {};
    constructor(public tag: string) {}
    append(...kids: El[]) {
      this.children.push(...kids);
    }
    addEventListener(t: string, f: (e: unknown) => void) {
      (this.listeners[t] ??= []).push(f);
    }
    remove() {
      this.removed = true;
    }
    click() {
      for (const f of this.listeners.click ?? []) f({ target: this, stopPropagation: () => undefined });
    }
  }
  const withDom = (f: (root: El) => void) => {
    const prev = G.document;
    G.document = { createElement: (t: string) => new El(t) };
    try {
      f(new El('div'));
    } finally {
      if (prev === undefined) delete G.document;
      else G.document = prev;
    }
  };
  const closeBtn = (el: El) => el.children[0].children[0].children[1];
  it('切（差し込み口が空）：✕ を押すと、今までどおりすぐ消える', () => {
    withDom((root) => {
      const onClose = vi.fn();
      const onUser = vi.fn();
      const sh = sheet(root as unknown as HTMLElement, 'x', onClose, onUser);
      const e = sh.el as unknown as El;
      closeBtn(e).click();
      expect(e.removed).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onUser).toHaveBeenCalledTimes(1);
    });
  });
  it('入：✕ を押しても、幕が閉じきるまでは消えない。閉じきったら消えて、閉じたあとの処理が 1 回走る', () => {
    withDom((root) => {
      const opened = vi.fn();
      let go: (() => void) | null = null;
      ux.sheetOpen = opened;
      ux.sheetLeave = (_e, fn) => (go = fn);
      const closed = vi.fn();
      ux.sheetClosed = closed;
      const onClose = vi.fn();
      const onUser = vi.fn();
      const sh = sheet(root as unknown as HTMLElement, 'title', onClose, onUser);
      const e = sh.el as unknown as El;
      expect(opened).toHaveBeenCalledWith(sh.el, 'title');
      closeBtn(e).click();
      expect(e.removed).toBe(false);
      expect(onClose).not.toHaveBeenCalled();
      go!();
      expect(e.removed).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onUser).toHaveBeenCalledTimes(1);
      expect(closed).toHaveBeenCalledTimes(1);
    });
  });
  it('入：コードから閉じる（別の札への切り替え）は待たない', () => {
    withDom((root) => {
      ux.sheetLeave = () => expect.unreachable();
      const onClose = vi.fn();
      const sh = sheet(root as unknown as HTMLElement, 'x', onClose);
      sh.close();
      expect((sh.el as unknown as El).removed).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
  it('幕の上の行き先の札：長い見出しは切る。札から札への切り替えは短い間で見分ける', () => {
    expect(wipeLabel('調達')).toBe('調達');
    expect(wipeLabel('サプライチェーン（SCM）')).toBe('サプライチェーン');
    expect([...wipeLabel('とてもとてもとても長い見出しの画面')].length).toBeLessThanOrEqual(11);
    expect(SWAP_MS).toBeLessThan(200);
  });
  it('網目の幕：押した場所から埋まる（押した升がいちばん先・遠い升があと）', () => {
    const W = 39;
    const H = 85;
    const th = wipeOrder(W, H, 30, 80);
    const at = (x: number, y: number) => th[y * W + x];
    expect(Math.min(...th)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...th)).toBeLessThanOrEqual(1);
    // 網目（4×4 の順序）の幅 0.26 より離れた升は、必ずあとに埋まる
    expect(at(0, 0)).toBeGreaterThan(at(30, 80) + 0.26);
    expect(at(30, 40)).toBeGreaterThan(at(30, 78));
  });
});

describe('桁の回るカウンター', () => {
  it('止まっているとき：桁ごとの数字', () => {
    expect(odoPositions(1234, 4)).toEqual([4, 3, 2, 1]);
    expect(odoPositions(7, 3)).toEqual([7, 0, 0]);
  });
  it('下の桁が 9→0 に回るあいだだけ、上の桁が一緒に回る', () => {
    // 123.5：1 の位だけが回っている
    expect(odoPositions(123.5, 3)).toEqual([3.5, 2, 1]);
    // 129.5：1 の位が 9→0。10 の位も一緒に回る。100 の位は動かない
    expect(odoPositions(129.5, 3)).toEqual([9.5, 2.5, 1]);
    // 199.5：みんな一緒に回る
    expect(odoPositions(199.5, 3)).toEqual([9.5, 9.5, 1.5]);
    // 位置は 1/20 刻み
    expect(odoPositions(5.33, 1)).toEqual([5.35]);
  });
  it('回っている途中の値：はじめは前の値・終わりは新しい値・あいだは行き過ぎない', () => {
    expect(rollValue(100, 500, 0)).toBe(100);
    expect(rollValue(100, 500, 1)).toBe(500);
    expect(rollValue(100, 500, 2)).toBe(500);
    let last = 100;
    for (let i = 1; i <= 9; i++) {
      const v = rollValue(100, 500, i / 10);
      expect(v).toBeGreaterThan(last);
      expect(v).toBeLessThan(500);
      last = v;
    }
    // 減るときも同じ
    expect(rollValue(500, 100, 0.5)).toBeLessThan(500);
    expect(rollValue(500, 100, 0.5)).toBeGreaterThan(100);
  });
  it('画面を作り直しても、前の値との差を覚えている（after() の描き直しの前後）', () => {
    forgetRoll();
    // はじめて出すときは、回さない
    expect(rollDelta('funds', 1000)).toEqual({ from: 1000, delta: 0 });
    // 作り直したら値が増えていた：前の値から回す
    expect(rollDelta('funds', 1300)).toEqual({ from: 1000, delta: 300 });
    expect(rollDelta('funds', 1300)).toEqual({ from: 1300, delta: 0 });
    expect(rollDelta('funds', 900)).toEqual({ from: 1300, delta: -400 });
    // 鍵ごとに別
    expect(rollDelta('sales', 5)).toEqual({ from: 5, delta: 0 });
    forgetRoll('funds');
    expect(rollDelta('funds', 10)).toEqual({ from: 10, delta: 0 });
  });
  it('計器（進みのバー）は 20 段の目盛りに乗る', () => {
    expect(meterStep(0.33)).toBe(0.35);
    expect(meterStep(-1)).toBe(0);
    expect(meterStep(2)).toBe(1);
  });
});

describe('レバー（承認の手応え）', () => {
  const run = (c: ReturnType<typeof leverCore>, ms: number) => {
    for (let t = 0; t < ms; t += 16) c.step(16);
  };
  it('押すだけで落ちる：目盛りの「カチ」が順に鳴り、下で 1 回だけ「ガチャン」', () => {
    const engage = vi.fn();
    const detent: number[] = [];
    const c = leverCore({ engage, detent: (p) => detent.push(p) });
    expect(c.down(100)).toBe(true);
    c.up(); // 動かさずに離した＝押した
    expect(c.busy).toBe(true);
    run(c, LEVER.fallMs + 40);
    expect(c.engaged).toBe(true);
    expect(c.pos).toBe(LEVER.travel);
    expect(engage).toHaveBeenCalledTimes(1);
    // 落ちるあいだ、目盛りは下へ順に（8 つ。速い所では、1 コマで 2 つ越えて 1 回になることがある）
    expect(detent.length).toBeGreaterThanOrEqual(6);
    expect(detent.length).toBeLessThanOrEqual(Math.floor(LEVER.travel / LEVER.detent));
    expect([...detent].sort((a, b) => a - b)).toEqual(detent);
    // 落ちたあとは、もう動かない・もう呼ばない
    c.pull();
    expect(c.down(0)).toBe(false);
    run(c, 500);
    expect(engage).toHaveBeenCalledTimes(1);
  });
  it('引いても落ちる：下まで引いたら、その場で 1 回だけ', () => {
    const engage = vi.fn();
    const c = leverCore({ engage });
    c.down(10);
    c.move(60);
    expect(c.pos).toBe(50);
    expect(c.engaged).toBe(false);
    c.move(10 + LEVER.travel + 30);
    expect(c.engaged).toBe(true);
    c.move(300);
    c.up();
    run(c, 300);
    expect(engage).toHaveBeenCalledTimes(1);
  });
  it('6 割を越えて離したら落ちきる。手前で離したら戻る（承認しない）', () => {
    const engage = vi.fn();
    const back = vi.fn();
    const c = leverCore({ engage, back });
    c.down(0);
    c.move(LEVER.travel * 0.4);
    c.up();
    expect(back).toHaveBeenCalledTimes(1);
    run(c, LEVER.backMs + 40);
    expect(c.pos).toBe(0);
    expect(engage).not.toHaveBeenCalled();
    c.down(0);
    c.move(LEVER.travel * 0.7);
    c.up();
    run(c, LEVER.snapMs + 40);
    expect(engage).toHaveBeenCalledTimes(1);
  });
  it('落ちている途中に押し直しても、2 回は呼ばない', () => {
    const engage = vi.fn();
    const c = leverCore({ engage });
    c.pull();
    c.pull();
    expect(c.down(0)).toBe(false);
    run(c, 400);
    expect(engage).toHaveBeenCalledTimes(1);
  });
  it('動きを減らす：落ちる動きを待たずに、すぐ落ちる', () => {
    const engage = vi.fn();
    const c = leverCore({ engage }, () => true);
    c.pull();
    c.step(16);
    expect(engage).toHaveBeenCalledTimes(1);
  });
  it('長さは見本の値：落ちる 170ms・戻る 150ms', () => {
    expect(LEVER).toMatchObject({ travel: 104, detent: 12, fallMs: 170, backMs: 150 });
  });
});

describe('動きを減らす（設定と端末の設定の両方で止まる）', () => {
  it('自動：端末の設定に合わせる。入：いつも減らす。切：端末が「減らす」でも動かす', () => {
    expect(calmOf('auto', false)).toBe(false);
    expect(calmOf('auto', true)).toBe(true);
    expect(calmOf('on', false)).toBe(true);
    expect(calmOf('off', true)).toBe(false);
  });
  it('設定のはじめの値と、壊れた値の直し方', () => {
    expect(PREFS_DEF).toEqual({ text: 100, calm: 'auto', cvd: false, talk: 2, crt: true });
    expect(cleanPrefs(null)).toEqual(PREFS_DEF);
    expect(cleanPrefs({ text: 999, calm: 'x', cvd: 1, talk: 9, crt: 0 })).toEqual(PREFS_DEF);
    expect(cleanPrefs({ text: 130, calm: 'on', cvd: true, talk: 4, crt: false })).toEqual({ text: 130, calm: 'on', cvd: true, talk: 4, crt: false });
    // 吹き出しの速さ：すぐ（4）は 1 字ずつ出さない
    expect(TALK_CPS[4]).toBe(0);
    expect(TALK_CPS[1]).toBeLessThan(TALK_CPS[2]);
    expect(TALK_CPS[2]).toBe(26);
  });
  it('CSS：is-calm のあいだ、すべての動き（いまの画面の @keyframes も）を止める。光の帯・走査線の流れは出さない', () => {
    const base = css('base.css');
    const i = base.indexOf('html.is-uxc.is-calm *,');
    expect(i).toBeGreaterThan(0);
    const rule = base.slice(i, base.indexOf('}', i));
    expect(rule).toContain('animation-duration: 0.01ms !important;');
    expect(rule).toContain('animation-iteration-count: 1 !important;');
    expect(rule).toContain('transition-duration: 0.01ms !important;');
    expect(base).toMatch(/is-calm \.ux-key--main > \.ux-cap::after[\s\S]{0,120}display: none;/);
  });
  it('幕：動きを減らすとき（と、画面の無い所）では、すぐ中身を入れ替える', async () => {
    const mid = vi.fn();
    await wipe({ x: 0, y: 0 }, mid);
    expect(mid).toHaveBeenCalledTimes(1);
  });
  it('ドットの効果（pixelfx）：入で「動きを減らす」のあいだは出さない。切のときは、今までどおり', () => {
    page = fakePage('');
    page.store['isl.fxLevel'] = 'full';
    expect(fxOn()).toBe(true);
    // 切（is-uxc なし）で is-calm だけ付いていても、変わらない
    page.cls.add('is-calm');
    expect(fxOn()).toBe(true);
    page.cls.add('is-uxc');
    expect(fxOn()).toBe(false);
    page.cls.delete('is-calm');
    expect(fxOn()).toBe(true);
  });
  it('1 字ずつ喋る：句読点で息をつく', () => {
    expect(typePause('あ', 10)).toBe(10);
    expect(typePause('、', 10)).toBe(40);
    expect(typePause('。', 10)).toBe(70);
  });
});

describe('音の口（uxSfx）', () => {
  it('名前は約束のとおり', () => {
    expect([...UX_SFX]).toEqual(['press', 'release', 'open', 'close', 'page', 'tab', 'lever', 'clunk', 'lamp', 'coin', 'cash', 'deny', 'confirm', 'rankup', 'conquest', 'build', 'done', 'tick', 'blip', 'toggle', 'slide', 'error']);
  });
  it('音が始まっていなくても、知らない名前でも落ちない（鳴らす中身は音の土台の段。tests/island-uix1s.test.ts）', () => {
    expect(() => uxSfx('open')).not.toThrow();
    expect(() => uxSfx('no-such-sound')).not.toThrow();
  });
});
