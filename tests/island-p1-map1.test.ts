// 段 MAP1：街づくりの見える化（文字より色・形・動き）。表示と操作だけで、ゲームの数字・判断は変えない
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MARKET } from '../src/island/p1/data';
import { allowedDirs, build, doorOf, myShops, myWorkshop, newP1, oneWay, shopArea, siteInfo, step, wholesaler, type P1State } from '../src/island/p1/model';
import { AREA_D0, AREA_RIVAL, areaCells, daysHeat, diamondCells, landZoomSteps, popPlace, routeLines, shopHeat, shopHeatAt } from '../src/island/p1/mapviz';

const src = (f: string) => readFileSync(new URL(`../src/island/p1/${f}`, import.meta.url), 'utf8');

function spots(s: P1State, id: string) {
  const out: [number, number, 'rd' | 'ld' | 'ru' | 'lu'][] = [];
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const ds = allowedDirs(s, id, i, j);
      if (ds.length) out.push([i, j, ds[0]]);
    }
  return out;
}
/** 工房と、離れたお店 2 軒のある町 */
function town(seed = 7): P1State {
  const s = newP1(seed);
  s.money = 1e6;
  const ws = spots(s, 'workshop').sort((x, y) => Math.abs(x[0] - 7) + Math.abs(x[1] - 8) - (Math.abs(y[0] - 7) + Math.abs(y[1] - 8)))[0];
  build(s, 'workshop', ...ws);
  for (let k = 0; k < 5; k++) step(s);
  const far = [...spots(s, 'general_store')].sort((x, y) => Math.abs(y[0] - ws[0]) + Math.abs(y[1] - ws[1]) - (Math.abs(x[0] - ws[0]) + Math.abs(x[1] - ws[1])));
  build(s, 'general_store', ...far[0]);
  for (let k = 0; k < 6; k++) step(s);
  const near = spots(s, 'general_store').sort((x, y) => Math.abs(x[0] - ws[0]) + Math.abs(x[1] - ws[1]) - (Math.abs(y[0] - ws[0]) + Math.abs(y[1] - ws[1])))[0];
  build(s, 'general_store', ...near);
  for (let k = 0; k < 6; k++) step(s);
  return s;
}

describe('1. サプライチェーンの線', () => {
  it('輸送の線はお店ごとに 1 本。出発（oneWay の from）の入口から店の入口までで、日数は oneWay と一致', () => {
    const s = town();
    const shops = myShops(s);
    expect(shops.length).toBe(2);
    const lines = routeLines(s);
    for (const shop of shops) {
      const l = lines.find((x) => x.kind === 'haul' && x.shop === shop.uid)!;
      expect(l).toBeTruthy();
      const way = oneWay(s, shop);
      expect(l.days).toBe(way.days);
      expect(l.cells[0]).toEqual(doorOf(way.from!));
      expect(l.cells[l.cells.length - 1]).toEqual(doorOf(shop));
    }
  });
  it('調達の線は問屋の入口から工房の入口まで（橙）。工房が無ければ線は無い', () => {
    const s = town();
    const l = routeLines(s).find((x) => x.kind === 'supply')!;
    expect(l.cells[0]).toEqual(doorOf(wholesaler(s)!));
    expect(l.cells[l.cells.length - 1]).toEqual(doorOf(myWorkshop(s)!));
    expect(routeLines(newP1(7))).toEqual([]);
  });
  it('荷が動いているときだけ流れる（trips にその店の便があれば moving）', () => {
    const s = town();
    const shop = myShops(s)[0];
    expect(routeLines(s).find((x) => x.shop === shop.uid)!.moving).toBe(false);
    s.trips.push({ hauler: 1, to: shop.uid, cargo: {}, left: 2, total: 2 });
    expect(routeLines(s).find((x) => x.shop === shop.uid)!.moving).toBe(true);
  });
  it('線は地面の層（建物・荷車より前）に描き、reduced-motion では流さない。トグルは既定オン・案内のあいだは強制オン', () => {
    const r = src('render.ts');
    expect(r.indexOf('drawRoutes(ctx, s, cam.zoom, now, visible)')).toBeLessThan(r.indexOf('type Item = { depth: number; draw: () => void }'));
    expect(r).toContain('const flow = !reducedMotion();');
    const m = src('main.ts');
    // 段 UI10：切り替えは設定の「🗺 地図の表示」（mapsetui.ts）。地図の右下のボタンは外した
    expect(m).toContain("const flowOn = () => mapSetOn(s, 'flow') || !!tour;");
    expect(m).not.toContain("btn(t('🔗 流れ', '🔗 Flow')");
  });
});

describe('2. お店の集客エリア', () => {
  it('自店の塗りの範囲は shopArea の MARKET.d0 と一致し、家の数も一致。他店は × 1.5', () => {
    const s = town();
    expect(AREA_D0).toBe(MARKET.d0);
    expect(AREA_RIVAL).toBe(MARKET.d0 * 1.5);
    const shop = myShops(s)[0];
    const ac = areaCells(s, { only: shop.uid });
    const cells = diamondCells(s, shop.i, shop.j, MARKET.d0);
    expect([...ac.mine.keys()].sort()).toEqual([...cells].sort());
    // 範囲の中の家の数は shopArea.homes と同じ
    const homes = s.buildings.filter((b) => b.owner === 'town' && MARKET.pop[b.id] && ac.mine.has(b.j * s.n + b.i)).length;
    expect(homes).toBe(shopArea(s, shop).homes);
    for (const rb of s.buildings.filter((b) => s.rivals.some((r) => r.id === b.owner))) {
      for (const k of diamondCells(s, rb.i, rb.j, MARKET.d0 * 1.5)) expect(ac.rival.has(k)).toBe(true);
    }
  });
  it('自店どうしの被りは 2 以上（濃く塗る）。ゴーストも自店として数える', () => {
    const s = town();
    const [a] = myShops(s);
    const ac = areaCells(s, { ghost: { i: a.i, j: a.j } });
    expect(ac.mine.get(a.j * s.n + a.i)).toBe(2);
    const only = areaCells(s, { only: a.uid });
    expect(Math.max(...only.mine.values())).toBe(1);
  });
  it('置くときは常に出し、ふだんは設定の「お店の商圏」（既定オフ）。店を押すとその店だけ', () => {
    const m = src('main.ts');
    expect(m).toContain("const areaOn = () => mapSetOn(s, 'area');");
    expect(m).toContain("area: placing ? (P1B[placing.id]?.kind === 'shop' ? { only: null } : null) : areaOn() ? { only: null } : selShop ? { only: selShop.uid } : null");
  });
});

describe('3. 空き地の見込み客（ヒートマップ）', () => {
  it('ヒートマップの家の数・競合は siteInfo と一致し、被りは自店の商圏に入る家の数', () => {
    const s = town();
    const heat = shopHeat(s, 'general_store');
    expect(heat.cells.size).toBe(spots(s, 'general_store').length);
    for (const c of [...heat.cells.values()].slice(0, 20)) {
      const i = c.k % s.n;
      const j = Math.floor(c.k / s.n);
      const info = siteInfo(s, 'general_store', i, j, allowedDirs(s, 'general_store', i, j)[0])!;
      expect(c.homes).toBe(info.homes);
      expect(c.rivals).toBe(info.rivals);
      expect(c.overlap).toBeLessThanOrEqual(c.homes);
      expect(c.est).toBeLessThanOrEqual(c.homes * Math.max(...Object.values(MARKET.pop)) + 1e-9);
      expect(shopHeatAt(s, i, j)).toEqual({ est: c.est, homes: c.homes, overlap: c.overlap, rivals: c.rivals });
    }
    // 自店の真上（移転のとき自分は除く）：被りがあると見込みが減る
    const [a] = myShops(s);
    const atA = shopHeatAt(s, a.i, a.j, a.uid);
    const withA = shopHeatAt(s, a.i, a.j);
    expect(withA.est).toBeLessThanOrEqual(atA.est);
    expect(withA.overlap).toBeGreaterThanOrEqual(atA.overlap);
  });
  it('5 段（0〜4）に分ける。最小は 0 段・最大は 4 段', () => {
    const s = town();
    const heat = shopHeat(s, 'general_store');
    expect(heat.band(heat.min)).toBe(0);
    expect(heat.band(heat.max)).toBe(4);
    expect(heat.band((heat.min + heat.max) / 2)).toBe(2);
  });
  it('倉庫を置くときは工房からの日数（近いほど小さい）', () => {
    const s = town();
    const heat = daysHeat(s, 'warehouse');
    const ws = myWorkshop(s)!;
    const cs = [...heat.cells.values()].sort((a, b) => Math.abs(a.k % s.n - ws.i) + Math.abs(Math.floor(a.k / s.n) - ws.j) - (Math.abs(b.k % s.n - ws.i) + Math.abs(Math.floor(b.k / s.n) - ws.j)));
    expect(cs[0].est).toBeLessThan(cs[cs.length - 1].est);
    expect(heat.band(heat.min)).toBe(0);
  });
  it('固定バーに「見込み N 軒・被り N」、計算は置くモードに入ったとき 1 回（memo）', () => {
    const m = src('main.ts');
    expect(m).toContain('見込み ${Math.round(v.est)} 軒');
    expect(m).toContain('被り ${v.overlap}');
    expect(m).toContain('if (heatCache?.key === key) return heatCache.heat;');
  });
});

describe('4. ポップアップと会話', () => {
  it('PC で下にはみ出すなら建物の左か右（中央より左なら右・右なら左）に出し、縦は画面に収まる', () => {
    const base = { zoom: 1, W: 1280, H: 800, right: 1180, bottom: 792, need: 700, pc: true, top0: 120 };
    const r = popPlace({ ...base, sx: 300, sy: 400 });
    expect(r.side).toBe('right');
    expect(r.left).toBeGreaterThan(300);
    expect(r.top).toBeGreaterThanOrEqual(128);
    expect(r.top + Math.min(r.maxHeight, base.need)).toBeLessThanOrEqual(792);
    const l = popPlace({ ...base, sx: 900, sy: 700 });
    expect(l.side).toBe('left');
    expect(l.left + l.width).toBeLessThan(900);
    expect(l.top + Math.min(l.maxHeight, base.need)).toBeLessThanOrEqual(792);
    // 下に入るなら下のまま。スマホ（pc: false）はいままでどおり下
    expect(popPlace({ ...base, sx: 300, sy: 100, need: 300 }).side).toBe('below');
    expect(popPlace({ ...base, sx: 300, sy: 400, pc: false, W: 390, right: 390 }).side).toBe('below');
  });
  it('アクションは吹き出しの下部に固定（sticky）・44px 以上。中身だけスクロール', () => {
    const m = src('main.ts');
    expect(m).toContain("popActs.replaceChildren(...body.querySelectorAll<HTMLElement>('.isl-pop-acts'))");
    expect(m).toContain('popEl.append(popTail, popHead, popBody, popActs);');
    const c = src('p1.css');
    const i = c.indexOf('.isl-pop-acts-fix {');
    expect(c.slice(i, i + 300)).toContain('position: sticky;');
    expect(c.slice(i, i + 300)).toContain('bottom: 0;');
    const j = c.indexOf('.isl-pop-acts-fix .isl-pop-acts .isl-btn {');
    expect(c.slice(j, j + 200)).toContain('min-height: 44px;');
    expect(c).toContain('.isl-pop-scroll {\n  flex: 1 1 auto;\n  min-height: 0;\n}');
    // 「ここに建てる」「通行料を払って開通」「空き店舗に出店」も固定のボタンに
    expect((src('tile.ts').match(/isl-row isl-pop-acts/g) ?? []).length).toBeGreaterThanOrEqual(11);
  });
  it('会話の暗幕のどこを押しても次へ。最後の枚もどこを押しても閉じる（選択肢があるときは選択肢だけ）。「次へ」のキーは残す', () => {
    // 段 UIX5a：会話は新しい画面（uix/screens/talk.ts）だけ。暗幕を押したときの決まりは tapAct（段 UIX3a のテストが中身を確かめる）
    const m = readFileSync(new URL('../src/island/uix/screens/talk.ts', import.meta.url), 'utf8');
    const i = m.indexOf("m.addEventListener('click', (e) => {");
    expect(i).toBeGreaterThan(0);
    expect(m.slice(i, m.indexOf('});', i))).toContain('tap(false);');
    expect(m).toContain("if (o.k < o.n - 1) return 'next';");
    expect(m).toContain("return o.button ? 'stay' : 'done';");
    expect(m).toContain("t('つぎへ', 'Next')");
  });
});

describe('5. ランドの段階ズーム', () => {
  it('いちばん縮小から 0.25 までを 5 段（等比）に。町の段（0.25・0.5・1・2）はそのまま', () => {
    const zs = landZoomSteps(0.05);
    expect(zs[0]).toBe(0.05);
    expect(zs.filter((z) => z < 0.25)).toHaveLength(5);
    expect(zs.slice(-4)).toEqual([0.25, 0.5, 1, 2]);
    for (let k = 1; k < 5; k++) expect(zs[k] / zs[k - 1]).toBeCloseTo(Math.pow(0.25 / 0.05, 1 / 5), 1);
    expect(landZoomSteps(0.3)).toEqual([0.25, 0.3, 0.5, 1, 2]);
    expect(src('main.ts')).toContain('return s.land ? landZoomSteps(lo) :');
  });
});
