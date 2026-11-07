// 段 UI10：スマホのピンチで地図の縮尺を変える・地図の表示の切り替えを設定の画面へ（ユーザーの声 2026-11-07）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapGesture, pinchCam, PINCH_QUIET_MS, type GCam } from '../src/island/p1/gesture';

const src = (f: string) => readFileSync(new URL(`../src/island/p1/${f}`, import.meta.url), 'utf8');

function host(zoom = 0.3, lo = 0.2) {
  const cam: GCam = { x: 0, y: 0, zoom };
  const taps: [number, number][] = [];
  const ends: number[] = [];
  let moved = 0;
  const g = mapGesture({
    cam,
    size: () => ({ W: 390, H: 844 }),
    clampZoom: (z) => Math.max(lo, Math.min(2, z)),
    moved: () => moved++,
    tap: (x, y) => taps.push([x, y]),
    pinchEnd: (z0) => ends.push(z0),
  });
  return { cam, g, taps, ends, moved: () => moved };
}
/** 2 本の指を広げる（a は左上へ・b は右下へ） */
function spread(g: ReturnType<typeof host>['g'], a: [number, number], b: [number, number], k: number) {
  for (let n = 1; n <= k; n++) {
    g.move(1, a[0] - 6 * n, a[1] - 6 * n);
    g.move(2, b[0] + 6 * n, b[1] + 6 * n);
  }
}

describe('1. ピンチで縮尺を変える', () => {
  it('canvas の上で 2 本の指を広げると cam.zoom が大きくなる。離してもタップにしない', () => {
    const h = host();
    h.g.down(1, 180, 400, true);
    h.g.down(2, 240, 460, true);
    expect(h.g.pinching).toBe(true);
    spread(h.g, [180, 400], [240, 460], 10);
    expect(h.cam.zoom).toBeCloseTo(0.9, 5);
    h.g.up(1, 120, 340, 1000);
    h.g.up(2, 300, 520, 1000);
    expect(h.taps).toEqual([]);
    expect(h.ends).toEqual([0.3]);
    expect(h.moved()).toBeGreaterThan(0);
  });
  it('印や札の上から始めても（1 本目が canvas の外）ピンチになる', () => {
    const h = host();
    h.g.down(1, 180, 400, false);
    h.g.down(2, 240, 460, true);
    spread(h.g, [180, 400], [240, 460], 10);
    expect(h.cam.zoom).toBeGreaterThan(0.8);
    // 2 本とも印の上でも
    const k = host(1);
    k.g.down(5, 100, 300, false);
    k.g.down(6, 300, 500, false);
    k.g.move(5, 150, 350);
    k.g.move(6, 250, 450);
    expect(k.cam.zoom).toBeCloseTo(0.5, 5);
  });
  it('ピンチのあいだと直後は印・札の click を捨てる（指を離したあと吹き出しや画面が開かない）', () => {
    const h = host();
    h.g.down(1, 180, 400, false);
    h.g.down(2, 240, 460, true);
    expect(h.g.quiet(0)).toBe(true);
    h.g.up(2, 240, 460, 1000);
    expect(h.g.quiet(1000 + PINCH_QUIET_MS - 1)).toBe(true);
    h.g.up(1, 180, 400, 1010);
    expect(h.g.quiet(1010 + PINCH_QUIET_MS + 1)).toBe(false);
    expect(h.taps).toEqual([]);
  });
  it('2 本の指のまんなかの下の地図の点が、指のまんなかに付いてくる（拡大・縮小しながら動かせる）', () => {
    const W = 390;
    const H = 844;
    const cam = { x: 120, y: 900, zoom: 0.5 };
    const st = { mid: { x: 100, y: 300 }, d: 100, cam };
    const world = (c: GCam, x: number, y: number) => [c.x + (x - W / 2) / c.zoom, c.y + (y - H / 2) / c.zoom];
    const before = world(cam, 100, 300);
    const c = pinchCam(st, { x: 100, y: 400 }, { x: 300, y: 400 }, W, H, (z) => z);
    expect(c.zoom).toBeCloseTo(1, 5);
    const after = world(c, 200, 400);
    expect(after[0]).toBeCloseTo(before[0], 5);
    expect(after[1]).toBeCloseTo(before[1], 5);
  });
  it('関所の前（最小 0.2）でも、0.2〜2 の幅でピンチできる（それより外は止まる）', () => {
    const h = host(0.5, 0.2);
    h.g.down(1, 100, 100, true);
    h.g.down(2, 300, 300, true);
    h.g.move(1, 195, 195);
    h.g.move(2, 205, 205);
    expect(h.cam.zoom).toBeCloseTo(0.2, 5);
    const k = host(1, 0.2);
    k.g.down(1, 190, 400, true);
    k.g.down(2, 200, 400, true);
    k.g.move(1, 0, 400);
    k.g.move(2, 390, 400);
    expect(k.cam.zoom).toBe(2);
  });
  it('1 本の指：canvas はドラッグで動かす・動かさずに離せばタップ。印の上から始めた 1 本は何もしない（印のボタンの動きのまま）', () => {
    const h = host(0.5);
    h.g.down(1, 100, 100, true);
    h.g.up(1, 102, 101);
    expect(h.taps).toEqual([[102, 101]]);
    h.g.down(2, 100, 100, true);
    h.g.move(2, 150, 100);
    expect(h.cam.x).toBeCloseTo(-100, 5);
    h.g.up(2, 150, 100);
    expect(h.taps).toHaveLength(1);
    const k = host(0.5);
    k.g.down(3, 100, 100, false);
    k.g.move(3, 200, 100);
    k.g.up(3, 200, 100);
    expect(k.cam.x).toBe(0);
    expect(k.taps).toEqual([]);
    expect(k.g.quiet(1e9)).toBe(false);
  });
  it('地図の操作は窓で先に受け、地図の上の層（印・札・吹き出し）から始めた指も数える。印の層は指を受けない', () => {
    const m = src('main.ts');
    expect(m).toContain("const MAP_LAYERS = '.isl-marks, .isl-world, .isl-meet, .isl-chief, .isl-pop';");
    expect(m).toContain("addEventListener(\n  'pointerdown',");
    expect(m).not.toContain("canvas.addEventListener('pointerdown'");
    const c = src('p1.css');
    const i = c.indexOf('.isl-marks {');
    expect(c.slice(i, i + 120)).toContain('pointer-events: none !important;');
  });
});

describe('2. 「流れ」「印」「商圏」を設定の画面へ', () => {
  it('設定の画面に「🗺 地図の表示」の節（設定の次）。前の key systems:mapset でもその節へ', async () => {
    const { SUB_DEFS, resolveSub } = await import('../src/island/p1/menus');
    const set = SUB_DEFS().systems.find((x) => x.key === 'settings')!;
    expect(set.parts).toEqual(['settings', 'mapset', 'pace', 'save', 'trophy']);
    expect(resolveSub('systems', 'mapset', ['systems'])).toEqual({ m: 'systems', key: 'settings', part: 'mapset' });
  });
  it('3 項目（物の流れの線・困りごとの印・お店の商圏）。既定は 流れ＝オン・印＝オン・商圏＝オフ（古いセーブの値はそのまま）', async () => {
    const { MAPSET_ITEMS, mapSetOn, toggleMapSet } = await import('../src/island/p1/mapsetui');
    const { newP1, serializeP1, deserializeP1 } = await import('../src/island/p1/model');
    expect(MAPSET_ITEMS.map((x) => x.key)).toEqual(['flow', 'marks', 'area']);
    const s = newP1(1);
    expect([mapSetOn(s, 'flow'), mapSetOn(s, 'marks'), mapSetOn(s, 'area')]).toEqual([true, true, false]);
    expect(toggleMapSet(s, 'flow')).toBe(false);
    expect(toggleMapSet(s, 'area')).toBe(true);
    expect(toggleMapSet(s, 'marks')).toBe(false);
    expect(s.flags).toMatchObject({ flowLines: false, areaShow: true, issueMarks: false });
    // 古いセーブ（前のボタンで切り替えた値）もそのまま
    const old = newP1(2);
    old.flags.flowLines = false;
    old.flags.areaShow = true;
    const back = deserializeP1(serializeP1(old))!;
    expect([mapSetOn(back, 'flow'), mapSetOn(back, 'area')]).toEqual([false, true]);
  });
  it('困りごとの印は Rare からは押せない（灰色・「Rare からは部長の提案に替わる」）。それより前は「Rare より前の町で出る」', async () => {
    const { MAPSET_ITEMS, mapSetLocked } = await import('../src/island/p1/mapsetui');
    const { newP1 } = await import('../src/island/p1/model');
    const { openTier } = await import('./l0util');
    const s = newP1(1);
    const marks = MAPSET_ITEMS.find((x) => x.key === 'marks')!;
    expect(mapSetLocked(s, 'marks')).toBe(false);
    expect(marks.when!(s)).toContain('Rare より前の町で出ます');
    openTier(s, 'R');
    expect(mapSetLocked(s, 'marks')).toBe(true);
    expect(mapSetLocked(s, 'flow') || mapSetLocked(s, 'area')).toBe(false);
    expect(marks.when!(s)).toBe('Rare からは部長の提案に替わります');
  });
  it('地図の右下のボタン 3 つと凡例は外した。チュートリアルの流れの案内の強制オン・店を押したときの商圏・置くモードの商圏は残す', () => {
    const m = src('main.ts');
    for (const x of ['vizBox', 'flowBtn', 'marksBtn', 'areaBtn', 'vizLegend', "'isl-viz'"]) expect(m).not.toContain(x);
    expect(m).toContain("const flowOn = () => mapSetOn(s, 'flow') || !!tour;");
    expect(m).toContain("area: placing ? (P1B[placing.id]?.kind === 'shop' ? { only: null } : null) : areaOn() ? { only: null } : selShop ? { only: selShop.uid } : null");
    expect(src('p1.css')).not.toContain('.isl-viz {');
  });
  it('「地図で商圏を見る」で出したときだけ、地図の上に「🏪 商圏を表示中 ✕」（押すと消す）', () => {
    const m = src('main.ts');
    expect(m).toContain("areaPill.replaceChildren(h('span', '', t('🏪 商圏を表示中', '🏪 Showing trade areas')), h('b', '', '✕'));");
    expect(m).toContain('areaPill.hidden = !areaOverlay.on || !s.area;');
  });
});
