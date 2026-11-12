// 段 UIX2m：上と下の帯・建物の吹き出しを、新しい画面（方向 C「管制卓」）へ（docs/ISLAND_UIX.md「画面：上と下の帯」「画面：建物の吹き出し」）。
// 入のときだけ新しい画面に分かれること・今の目印（チュートリアルが指す所）が残ること・出す中身が今の画面とそろうこと・
// 計器の桁と大きさ・日付と進み・吹き出しのセリフ・カメラの寄り先・置き場所・足りないときの目盛り・絵（ドットのアイコン）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UX_ICONS } from '../src/island/uix/icons';
import { dateText, dayStep, digitsFor, monthFrac, odoSize } from '../src/island/uix/screens/hud';
import { uxm } from '../src/island/uix/screens/mhooks';
import { DEPT_ICO, LABEL_ICO, MARK_ICO, M_ART, NEWS_ICO, STAGE_ICO } from '../src/island/uix/screens/micons';
import { POP_W, gapMeter, isWide, popCamTarget, popLines, popPlaceUx, popZoom, shortOf, splitEmoji, unquote, voiceOf } from '../src/island/uix/screens/pop';
import { DEPTS, DEPT_GROUPS } from '../src/island/p1/data';
import { MARK_KIND } from '../src/island/p1/mapmarks';
import { DAYS, date, daysToClose, newP1 } from '../src/island/p1/model';
import { NEWS_ICON } from '../src/island/p1/ticker';

const src = (f: string) => readFileSync(new URL(`../src/island/${f}`, import.meta.url), 'utf8');
const MAIN = src('p1/main.ts');
const HUD_CSS = src('uix/screens/hud.css');
const POP_CSS = src('uix/screens/pop.css');

describe('入のときだけ、新しい画面に分かれる', () => {
  it('切のとき、口は空（p1/main.ts は uxm.x?.() と書くので、何も起きない）', () => {
    expect(Object.keys(uxm)).toEqual([]);
  });
  it('p1/main.ts に足すのは短い分岐だけ：口を呼ぶ所と、入のときだけ動的に読む 1 行', () => {
    for (const call of ['uxm.hud?.()', 'uxm.frame?.(now)', 'uxm.pop?.(title)', 'uxm.placePop?.()', 'uxm.popCam?.(', 'uxm.popClose?.()']) expect(MAIN, call).toContain(call);
    // 新しい画面の本体は、入のときだけ読む（切のときに読むのは、型と空の口の mhooks.ts だけ）
    expect(MAIN).toMatch(/if \(uxOn\(\)\) void import\('\.\.\/uix\/screens\/mapui'\)/);
    const statics = [...MAIN.matchAll(/^import .* from '\.\.\/uix\/screens\/([a-z]+)';$/gm)].map((m) => m[1]);
    expect(statics).toEqual(['mhooks']);
    // 口のファイルは、型と空の入れ物だけ（中身を読み込まない）
    const hooks = src('uix/screens/mhooks.ts');
    expect([...hooks.matchAll(/^import (type )?/gm)].every((m) => m[1] === 'type ')).toBe(true);
    // 新しい画面の束（入のときだけ読む）は、本体のコード（p1/）を import しない（型だけ）。要る関数は host.api で渡す：
    // 本体の束（切のときに読む束）の分かれ方を変えないため
    for (const f of ['mapui', 'hud', 'dock', 'pop', 'micons', 'mhooks']) {
      const body = src(`uix/screens/${f}.ts`);
      const runtime = [...body.matchAll(/^import (type )?[^;]*from '(?:\.\.\/){2}(?:p1\/[a-z]+|render|defs)';$/gm)].filter((m) => !m[1]);
      expect(runtime.map((m) => m[0]), f).toEqual([]);
    }
    expect(MAIN).toMatch(/api: \{ DAYS, date, daysToClose, monthRevenue, moveCost, chipOf, activeFx, sectorDef, tierLabel, tierColor: /);
    // 足した行は 20 行まで
    const added = MAIN.split('\n').filter((l) => /uxm\.|UIX2m/.test(l)).length;
    expect(added).toBeLessThanOrEqual(20);
  });
  it('新しい CSS のセレクタは、すべて .is-uxc の内側。角は丸めない。今の CSS の class とぶつからない', () => {
    for (const [name, css] of [
      ['hud.css', HUD_CSS],
      ['pop.css', POP_CSS],
    ] as const) {
      const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
      let depth = 0;
      let inKeyframes = -1;
      let buf = '';
      const bad: string[] = [];
      for (const ch of body) {
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
      expect(bad, name).toEqual([]);
      expect(body.match(/border-radius:\s*(?!0\b)[^;]+/g) ?? [], name).toEqual([]);
      // 動かすのは transform と opacity（と、ずらすだけの translate・rotate・枠の色）
      const moved = [...body.matchAll(/transition:\s*([a-z-]+)/g)].map((m) => m[1]);
      expect(moved.filter((x) => !['transform', 'opacity', 'translate'].includes(x)), name).toEqual([]);
    }
    // 新しい class の接頭辞は uxm-。今の CSS には無い名前
    for (const f of ['island.css', 'p1/p1.css', 'p1/ticker.css', 'uix/parts.css', 'uix/legacy.css']) expect(src(f).includes('uxm-'), f).toBe(false);
    const names = new Set([...(HUD_CSS + POP_CSS).matchAll(/\.(uxm-[a-z0-9-]+)/g)].map((m) => m[1]));
    expect(names.size).toBeGreaterThan(30);
    // @keyframes の名前も uxm-
    for (const m of (HUD_CSS + POP_CSS).matchAll(/@keyframes ([a-z-]+)/g)) expect(m[1].startsWith('uxm-'), m[1]).toBe(true);
  });
});

describe('今の目印（チュートリアルが指す所）が残る', () => {
  it('タブ・速さ・ミッション・吹き出しの中身は、今の要素を作り直さずに着せ替える', () => {
    // 下の帯：今の .isl-tab をそのまま使う（新しいボタンは作らない）
    const dock = src('uix/screens/dock.ts');
    expect(dock).not.toMatch(/el(<[^>]+>)?\('button/);
    expect(dock).toContain("b.classList.add('uxm-done')");
    // 上の帯：今の札（押す先）と速さの箱を、新しい板の中へ入れる
    const hud = src('uix/screens/hud.ts');
    for (const c of ['.isl-stat-brand', '.isl-stat-flame', '.isl-stat-sector', '.isl-stat-date', '.isl-stat-jam', '.isl-stat-ev', '.isl-stat-inbox', '.isl-speed']) expect(hud, c).toContain(c);
    // 吹き出し：今の中身（.isl-pop-scroll）と下のボタン（.isl-pop-acts-fix）を、そのまま新しい器へ
    const pop = src('uix/screens/pop.ts');
    expect(pop).toContain("'.isl-pop-scroll'");
    expect(pop).toContain("'.isl-pop-acts-fix'");
    // 閉じるキーは、今の ✕ を押す（閉じ方は今のまま）
    expect(pop).toContain('legacyX?.click()');
  });
  it('強調・ロック・届いた印の見た目が、新しい帯と吹き出しにもある', () => {
    for (const sel of ['.isl-tab.is-guide::before', '.isl-tab.is-guide::after', '.isl-tab.is-lock', '.isl-tab.is-off', '.isl-tab.has-dot', '.isl-tab.has-num', '.isl-speed.is-guide', '.isl-speed .isl-btn.is-guide', '.isl-speed.is-off', '.isl-sub.is-guide', '.isl-sub.is-lock', '.isl-mis.is-cleared', '.isl-point']) expect(HUD_CSS, sel).toContain(sel);
    expect(POP_CSS).toContain('.isl-btn.is-guide');
    // 光っている枠（is-hot）・確かめの枠が「くわしく」の中にあれば、開いた形で出す
    expect(src('uix/screens/pop.ts')).toContain(".is-hot, .is-guide, .isl-pop-confirm, .isl-pop-act");
  });
  it('動きを減らす・札が地図を覆っているあいだ：止める決まりがある', () => {
    expect(HUD_CSS).toContain('html.is-uxc.is-calm #isl-ui.uxm-on');
    expect(HUD_CSS).toContain('.uxm-rest');
    expect(HUD_CSS).toContain('animation-play-state: paused');
    const pop = src('uix/screens/pop.ts');
    // 動きを減らす：吹き出しはすぐ出る・カメラはすぐ寄る
    expect(pop).toMatch(/if \(isCalm\(\) \|\| !camMoving\) rise\(\)/);
    expect(pop).toMatch(/dur: isCalm\(\) \? 1 : 480/);
  });
});

describe('上の帯の計器', () => {
  it('桁：資金は 6 桁・売上は 7 桁から。足りなくなったら増える。負の額は絶対値の桁', () => {
    expect(digitsFor(0, 6)).toBe(6);
    expect(digitsFor(30000, 6)).toBe(6);
    expect(digitsFor(1234567, 6)).toBe(7);
    expect(digitsFor(-3450, 6)).toBe(6);
    expect(digitsFor(123456789, 7)).toBe(9);
  });
  it('大きさ：2 つの計器の桁の合計が 13 を超えたら小さい数字（390 で 2 段に収める）', () => {
    expect(odoSize(6, 7)).toBe('');
    expect(odoSize(7, 7)).toBe('s');
    expect(odoSize(9, 7)).toBe('s');
  });
  it('日付：開店前は「開業準備 N日目」、開店後は「Y年目 M月D日」。月の進みは 0〜1', () => {
    const s = newP1();
    // 本体の関数（date・daysToClose）は、p1/main.ts が host.api で渡す。ここでは同じ関数を直に使う
    const text = () => dateText(date(s), s.day - (s.arrived ?? 0) + 1);
    const frac = (f: number) => monthFrac(!!date(s), daysToClose(s), DAYS, f);
    expect(text()).toBe('開業準備 1日目');
    expect(frac(0.5)).toBe(0);
    s.open = s.day;
    expect(text()).toBe('1年目 1月1日');
    expect(frac(0)).toBe(0);
    expect(frac(1)).toBeCloseTo(1 / DAYS, 5);
    s.day += DAYS - 1;
    expect(text()).toBe(`1年目 1月${DAYS}日`);
    expect(frac(1)).toBe(1);
    expect(frac(9)).toBe(1);
  });
  it('1 日の進みは 12 段', () => {
    expect(dayStep(0)).toBe(0);
    expect(dayStep(0.5)).toBe(0.5);
    expect(dayStep(0.49)).toBeCloseTo(6 / 12, 5);
    expect(dayStep(2)).toBe(1);
    expect(dayStep(-1)).toBe(0);
  });
});

describe('建物の吹き出し', () => {
  it('セリフの並び：担当のひと言 → いまの様子 → 建物の説明。何も無ければ建物の名前', () => {
    expect(popLines({ greet: 'いらっしゃい', status: '今月 0 個', desc: ['本店です。'], title: '工房' })).toEqual(['いらっしゃい', '今月 0 個', '本店です。']);
    expect(popLines({ desc: ['道路です。', ' '], title: '道路' })).toEqual(['道路です。']);
    expect(popLines({ desc: [], title: '海' })).toEqual(['海']);
  });
  it('寄ったときの倍率：1 マスは等倍。大きい建物はスマホで 0.75。いまより引かない', () => {
    expect(popZoom(390, 1, 0.3)).toBe(1);
    expect(popZoom(390, 2, 0.3)).toBe(0.75);
    expect(popZoom(1280, 2, 0.5)).toBe(1);
    expect(popZoom(390, 1, 2)).toBe(2);
    expect(isWide(699)).toBe(false);
    expect(isWide(700)).toBe(true);
  });
  it('カメラの寄り先：建物が上の帯の下（スマホ）・上の帯の右（PC）に来る', () => {
    const m = popCamTarget({ i: 5, j: 11, size: 1, W: 390, H: 844, zoom: 0.3, hudBottom: 190, hudRight: 384 });
    // 画面 = (world − cam) × zoom ＋ 画面の半分
    expect(((5 - 11) * 100 - m.x) * m.zoom + 390 / 2).toBeCloseTo(m.sx, 5);
    expect(((5 + 11) * 55 - m.y) * m.zoom + 844 / 2).toBeCloseTo(m.sy, 5);
    expect(m.sy - 170 * m.zoom).toBeGreaterThanOrEqual(190);
    expect(m.sy).toBeLessThanOrEqual(844 / 2);
    const pc = popCamTarget({ i: 5, j: 11, size: 1, W: 1280, H: 800, zoom: 0.5, hudBottom: 190, hudRight: 532 });
    expect(pc.sx - 100 * pc.zoom).toBeGreaterThanOrEqual(532);
    expect(pc.zoom).toBe(1);
  });
  it('置き場所：建物の入口の下から。画面の左右と、下のキーに重ねない', () => {
    const a = popPlaceUx({ sx: 234, sy: 378, zoom: 1, W: 390, right: 390, bw: POP_W, top0: 250, maxTop: 500 });
    expect(a.left).toBe(8);
    expect(a.top).toBe(378 + 46 + 8);
    expect(a.tail).toBe(234 - 8);
    // 下のキーに重なるときは、上へ寄せる。上の帯より上へは行かない
    expect(popPlaceUx({ sx: 234, sy: 600, zoom: 1, W: 390, right: 390, bw: POP_W, top0: 250, maxTop: 500 }).top).toBe(500);
    expect(popPlaceUx({ sx: 234, sy: 100, zoom: 1, W: 390, right: 390, bw: POP_W, top0: 250, maxTop: 500 }).top).toBe(250);
    // 右の端
    expect(popPlaceUx({ sx: 1100, sy: 300, zoom: 1, W: 1280, right: 1160, bw: POP_W, top0: 200, maxTop: 700 }).left).toBe(1160 - POP_W - 8);
  });
  it('足りないとき：「あと N G」を読み取り、目盛りで返す（責めない）', () => {
    expect(shortOf('あと 1,880 G 足りません。')).toBe(1880);
    expect(shortOf('あと 300 G')).toBe(300);
    expect(shortOf('1,200 G short.')).toBe(1200);
    expect(shortOf('工房はもう建っている')).toBeNull();
    expect(gapMeter(120, 1880)).toBe(0.05);
    expect(gapMeter(1000, 1000)).toBe(0.5);
    expect(gapMeter(0, 500)).toBe(0.05);
    expect(gapMeter(-50, 500)).toBe(0.05);
  });
  it('担当のひと言はかぎかっこを外して喋る。声は名前から決まる（同じ人はいつも同じ声）', () => {
    expect(unquote('「データは揃っています。ご指示を。」')).toBe('データは揃っています。ご指示を。');
    expect(unquote('“Awaiting your command!”')).toBe('Awaiting your command!');
    expect(unquote('そのまま')).toBe('そのまま');
    expect(voiceOf('達磨')).toBe(voiceOf('達磨'));
    expect(voiceOf('達磨')).not.toBe(voiceOf('森蘭丸'));
    expect(Number.isInteger(voiceOf('MCHアーティスト'))).toBe(true);
  });
  it('キーの字の頭の絵文字は、ドットの絵に替える（字はそのまま）', () => {
    expect(splitEmoji('🔨 修繕する（1,000 G・2 日）')).toEqual({ emoji: '🔨', rest: '修繕する（1,000 G・2 日）' });
    expect(splitEmoji('⛏ 発掘する（15 秒）').emoji).toBe('⛏');
    expect(splitEmoji('工房を開く')).toEqual({ emoji: '', rest: '工房を開く' });
    for (const name of Object.values(LABEL_ICO)) expect(M_ART[name] ?? UX_ICONS.includes(name), name).toBeTruthy();
  });
});

describe('ドットのアイコン（足した絵）', () => {
  it('どの絵も 12×12・決まった記号だけ', () => {
    for (const [name, art] of Object.entries(M_ART)) {
      expect(art.length, name).toBe(12);
      for (const row of art) expect(row, name).toMatch(/^[.#+\-argcwk]{12}$/);
    }
  });
  it('部門・グループ・地図の印・テロップの種類・流れの段に、絵が全部ある（絵文字は残らない）', () => {
    const has = (n: string) => !!M_ART[n] || UX_ICONS.includes(n);
    for (const d of DEPTS) expect(has(DEPT_ICO[d.id]), d.id).toBe(true);
    for (const g of DEPT_GROUPS) expect(has(DEPT_ICO[g.id]), g.id).toBe(true);
    for (const k of Object.keys(MARK_KIND)) expect(has(MARK_ICO[k]), k).toBe(true);
    for (const e of Object.values(NEWS_ICON)) expect(has(NEWS_ICO[e]), e).toBe(true);
    for (const k of ['buy', 'craft', 'haul', 'sell']) expect(has(STAGE_ICO[k]), k).toBe(true);
  });
});
