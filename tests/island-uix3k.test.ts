// 段 UIX3k：経営企画の新しい画面（スキルツリー・企業ランキング・設備投資・決算書・税・職場・予算。方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md）。
// 入のときだけ新しい画面に分かれること・今の目印が残ること・出す中身が今の画面とそろうこと・主役のキーが前の層に出ること・
// 動きを減らすと全部すぐ出ること。
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { uxkDeps } from '../src/island/p1/uxk';
import { uxsDeps } from '../src/island/p1/uxs';
import { EDGES, POS } from '../src/island/p1/treelayout';
import { SKILLS } from '../src/island/p1/data';
import { FRONT_SEL } from '../src/island/uix/front';
import { UX_ICONS } from '../src/island/uix/icons';
import { K_ART, K_EMOJI, K_ICONS, headEmoji, noEmoji } from '../src/island/uix/screens/k-icons';
import { uxk } from '../src/island/uix/screens/k-slots';
import { S_ICONS } from '../src/island/uix/screens/s-icons';
import { W_ICONS } from '../src/island/uix/screens/w-icons';
import { histHeight, moveWord, rankMove, rankRatio } from '../src/island/uix/screens/ranking';
import { BUY_MS, INVEST_ICO, buyState, gainText, mainPick } from '../src/island/uix/screens/invest';
import { INVESTS } from '../src/island/p1/data';
import { CHAMFER, chainOf, descKey, gaugeSteps, lampOf, routeWires, stairDiamond, stateWord, type NodeDesc } from '../src/island/uix/screens/tree';

const src = (f: string) => readFileSync(new URL(`../src/island/${f}`, import.meta.url), 'utf8');
const TREE = src('p1/tree.ts');
const TR = src('uix/screens/tree.ts');
export const K_FILES = ['tree.ts', 'ranking.ts', 'invest.ts', 'k-icons.ts', 'k-boot.ts', 'k-deps.ts', 'k-slots.ts'];
export const K_CSS = ['tree.css', 'k-screens.css'];
const noComment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

afterEach(() => {
  for (const k of Object.keys(uxk)) delete (uxk as Record<string, unknown>)[k];
});

describe('切り替え：入のときだけ新しい画面に分かれる（切のときは今の画面のまま）', () => {
  it('差し込み口は、はじめは空。入れ物は uix/hooks.ts・中身を入れるのは k-boot.ts（s-boot.ts の install から 1 行で呼ぶ）', () => {
    expect(Object.keys(uxk)).toEqual([]);
    expect(src('uix/screens/k-slots.ts').match(/^import (?!type )/gm)).toBeNull();
    expect(src('uix/screens/k-slots.ts')).toContain("export { uxkSlots as uxk } from '../hooks';");
    expect(src('uix/hooks.ts')).toContain('export const uxkSlots: UxkScreens = {};');
    expect(src('uix/screens/s-boot.ts')).toContain('installK(d.k);');
    expect(src('p1/uxs.ts')).toContain('k: uxkDeps,');
    expect(uxsDeps.k).toBe(uxkDeps);
  });
  it('新しい画面の束は、本体のモジュールを自分では読まない（型だけ）。関数は p1/uxk.ts から渡す', () => {
    for (const f of K_FILES) {
      const code = src(`uix/screens/${f}`);
      // ほかの段の束（上と下の帯）の部品も読まない（共有の束ができて、事前に保存する一覧が変わる）
      expect(code, f).not.toMatch(/from '\.\/(micons|mhooks|mapui|hud|pop|dock)'/);
      for (const m of code.matchAll(/^import (type )?[^;]*? from '([^']+)';/gms)) {
        const outside = /^\.\.\/\.\.\//.test(m[2]);
        if (outside && !m[1]) expect(m[2], `${f}: ${m[0].slice(0, 60)}`).toBe('../../../i18n');
      }
      for (const m of code.matchAll(/\bK\.([A-Za-z_]\w*)/g)) expect(Object.keys(uxkDeps), `${f}: K.${m[1]}`).toContain(m[1]);
      for (const m of code.matchAll(/\bT\.([A-Za-z_]\w*)/g)) if (f === 'tree.ts') expect(Object.keys(uxkDeps.tree), `${f}: T.${m[1]}`).toContain(m[1]);
    }
  });
  it('新しい CSS は、すべて html.is-uxc の内側。class の接頭辞は uxk-。角は丸めない・字は 16px 以上・ぼかさない', () => {
    for (const f of K_CSS) {
      const css = noComment(src(`uix/screens/${f}`));
      const flat = css.replace(/@(media|supports)[^{]*\{/g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
      for (const m of flat.matchAll(/(^|\})\s*([^{}@]+)\{/g)) for (const sel of m[2].split(',')) if (sel.trim()) expect(sel.trim(), f).toMatch(/^html\.is-uxc[ .:]/);
      expect(css, f).not.toMatch(/border-radius\s*:\s*[1-9.]/);
      expect(css, f).not.toMatch(/backdrop-filter/);
      expect(css, f).not.toMatch(/filter\s*:\s*(blur|drop-shadow)/);
      for (const m of css.matchAll(/font-size:\s*([\d.]+)(px|rem)/g)) expect(Number(m[1]) * (m[2] === 'rem' ? 16 : 1), `${f}: ${m[0]}`).toBeGreaterThanOrEqual(16);
      for (const m of css.matchAll(/@keyframes\s+([\w-]+)/g)) expect(m[1], f).toMatch(/^uxk-/);
      // 新しい class は uxk-（土台の部品 ux-・画面の部品 uxp- は使ってよい。今の要素の目印は、今の class のまま）
      for (const m of css.matchAll(/\.(ux[a-z]-[\w-]+)/g)) expect(m[1], f).toMatch(/^(uxk|uxp)-/);
      // 層を残さない：出入りの動きに forwards・both・will-change を付けたままにしない（雲が消える 1 回だけは、消えたままにする）
      expect(css.replace(/uxk-leave[^;]*;/g, ''), f).not.toMatch(/\b(forwards|both)\b/);
      expect(css, f).not.toMatch(/will-change/);
    }
  });
  it('足したアイコンは 12×12・土台や同じ束の絵と名前がぶつからない。絵文字の表の絵は、どれかの表にある', () => {
    for (const [k, art] of Object.entries(K_ART)) {
      expect(art.length, k).toBe(12);
      for (const row of art) expect(row.length, k).toBe(12);
      expect(UX_ICONS, k).not.toContain(k);
    }
    const all = new Set([...UX_ICONS, ...K_ICONS, ...S_ICONS, ...W_ICONS]);
    for (const [e, name] of Object.entries(K_EMOJI)) expect(all.has(name), `${e} → ${name}`).toBe(true);
    expect(headEmoji('🔒 ブランド力 30 が要る')).toEqual(['lock', 'ブランド力 30 が要る']);
    expect(headEmoji('ふつうの文')).toEqual([null, 'ふつうの文']);
    expect(noEmoji('🔬 研究の施策')).toBe('研究の施策');
  });
});

describe('スキルツリー（回路図）', () => {
  it('入口：openSkills が、差し込み口が入っているときだけ新しい画面へ渡す（見ている場所・選んだパネルは同じ物）', () => {
    expect(TREE).toMatch(/if \(uxk\.tree\) \{\s*const lift = liftOnce;\s*liftOnce = false;\s*return uxk\.tree\(ctx, \{ lift \}\);\s*\}\s*open\(ctx, t\('スキルツリー', 'Skill tree'\)/);
    expect(src('uix/screens/k-boot.ts')).toContain('uxk.tree = openSkillsUx;');
    expect(uxkDeps.tree.view).toBeDefined();
    expect(uxkDeps.tree.DOUBLE_MS).toBe(420);
    // 切のときの作りは、そのまま残っている（選ぶたびに描き直す今の画面）
    expect(TREE).toContain("const n = h('button', `isl-tree-node ${shape} is-${st}");
    expect(TREE).toContain('view.sel = k.id;\n          after(ctx);');
  });
  it('今の目印：.isl-tree・.isl-tree-root・.isl-tree-node（is-hot・is-sel・is-done）・.isl-tree-detail .isl-btn.is-on。2 度押しで研究・ほかのパネルはマインちゃんが止める', () => {
    expect(TR).toContain('div.isl-tree.uxk-tree');
    expect(TR).toContain("'button.isl-tree-root.uxk-root'");
    expect(TR).toContain("const cls = ['isl-tree-node', 'uxk-node', shape, `is-${d.st}`];");
    expect(TR).toContain("if (d.hot) cls.push('is-hot');");
    expect(TR).toContain("if (V.sel === k.id) cls.push('is-sel');");
    expect(TR).toContain("board.className = 'uxk-board isl-tree-detail';");
    expect(TR).toContain('button.isl-btn.uxk-go${on ? \'.is-on.ux-front\' : \'\'}');
    expect(TR).toContain('if (only && k.id !== only) return halt();');
    expect(TR).toContain("ちょっと待って！ いまは光っている「人材の募集」を研究しよう！");
    expect(TR).toContain('const yes = !!lastTap && lastTap.id === id && now - lastTap.t < T.DOUBLE_MS;');
    // 札の器・一言・✕ の強調は今のまま
    expect(TR).toContain("K.mineTip(ctx, 'skills', tip);");
    expect(TR).toContain(".classList.toggle('is-guide', !!only && K.has(s, only));");
    expect(TR).toMatch(/K\.open\(\s*ctx,\s*t\('スキルツリー', 'Skill tree'\)/);
  });
  it('主役のキー（研究する・開放する）は前の層（ux-front）。帯が開いたあとの「OK」は主のキー', () => {
    expect(FRONT_SEL).toContain('.ux-front');
    expect(TR).toContain("{ kind: 'main', cls: 'uxk-ring-ok' }");
  });
  it('重さ：選び直しで木を作り直さない（選んだ印・つながり・くわしい板だけ直す。その場で並べ直しを起こさない）', () => {
    const sel = TR.slice(TR.indexOf('function select('), TR.indexOf('function reveal('));
    expect(sel).not.toContain('K.after(');
    expect(sel).not.toContain('sync()');
    expect(sel).not.toContain('offsetWidth');
    expect(sel).not.toContain('replay(');
    expect(sel).toContain('drawBoard(S());');
    // 板の高さを測るのは次のコマ
    expect(sel).toMatch(/requestAnimationFrame\(\(\) => \{\s*if \(!alive\) return;\s*measure\(\);/);
    // 札は「作り直さない」で開く（keep）
    expect(TR).toMatch(/inst = null;\s*\},\s*true,\s*\);/);
  });
  it('配線：縦と横でつなぎ、角は面取り。線は必ずパネルの縁から縁へ。同じ所から出る線は 1 本の母線を分け合い、枝分かれに接点', () => {
    const px = (p: { x: number; y: number }) => ({ x: p.x * 96, y: p.y * 96 });
    const rows = new Set([...POS.values()].map((p) => Math.round(p.y * 100)));
    // 上の端：パネルからは縁まで（36px）・見出しや帯の入口からは少し（8px）。下の端：パネルの縁まで
    const top = (e: { from: string | null }) => (e.from ? 36 : 8);
    const r = routeWires(EDGES, { px, cutTop: top, cutBot: () => 36, isRow: (y) => rows.has(Math.round(y * 100)) });
    expect(r.wires.length).toBe(EDGES.length);
    EDGES.forEach((e, i) => {
      const w = r.wires[i];
      const a = px(e.pts[0]);
      const b = px(e.pts[e.pts.length - 1]);
      expect(w.poly[0]).toEqual([a.x, a.y + top(e)]);
      const last = w.poly[w.poly.length - 1];
      // 1px に満たない横のずれは、まっすぐ下ろす
      expect(Math.abs(last[0] - b.x)).toBeLessThan(1);
      expect(last[1]).toBe(b.y - 36);
      expect(w.d.startsWith('M')).toBe(true);
      // どの辺も、縦・横・45° のどれか（面取りは CHAMFER まで）
      for (let k = 1; k < w.poly.length; k++) {
        const dx = Math.abs(w.poly[k][0] - w.poly[k - 1][0]);
        const dy = w.poly[k][1] - w.poly[k - 1][1];
        expect(dy, `${e.to} ${k}`).toBeGreaterThanOrEqual(-0.01);
        if (dx > 0.01 && dy > 0.01) {
          expect(Math.abs(dx - dy), `${e.to} ${k}`).toBeLessThan(0.01);
          expect(dx).toBeLessThanOrEqual(CHAMFER + 0.01);
        }
      }
    });
    // 小さな例：1 つの親から 3 つの子へ（真下と左右）→ 母線は 1 本・接点は親の真下に 1 つ
    const E = [-1, 0, 1].map((x) => ({ from: 'p', to: `c${x}`, br: 'logistics' as const, g: 'g', kind: 'all' as const, pts: [{ x: 0, y: 0 }, { x, y: 1 }] }));
    const s = routeWires(E, { px: (p) => ({ x: p.x * 100, y: p.y * 100 }), cutTop: () => 10, cutBot: () => 10, isRow: () => false });
    const busY = s.wires[0].poly[2][1];
    expect(s.wires[2].poly[2][1]).toBe(busY);
    expect(s.wires[1].poly).toEqual([[0, 10], [0, 90]]);
    expect(s.dots).toEqual([{ x: 0, y: busY, e: 0 }]);
  });
  it('つながり：先に要る側は根もとまで・その先は 1 段。今の画面の強調と同じたどり方', () => {
    const E = [
      { from: null, to: 'a' },
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'b', to: 'd' },
      { from: 'x', to: 'c' },
    ];
    const c = chainOf('b', E);
    expect(c.up.sort()).toEqual([0, 1]);
    expect(c.down.sort()).toEqual([2, 3]);
    expect(c.rel.sort()).toEqual(['a', 'c', 'd']);
    // 木の全部のパネルで、たどりが止まる
    for (const k of SKILLS.slice(0, 40)) expect(chainOf(k.id, EDGES).up.length).toBeLessThanOrEqual(EDGES.length);
  });
  it('状態は色だけに頼らない：ランプ（点く・またたく・消える）・言葉・足りないときの目盛り', () => {
    expect(lampOf('done')).toEqual({ kind: 'good', on: true, blink: false });
    expect(lampOf('open')).toEqual({ kind: '', on: true, blink: true });
    expect(lampOf('training')).toEqual({ kind: 'cyan', on: true, blink: true });
    expect(lampOf('locked').on).toBe(false);
    expect(lampOf('poor').on).toBe(false);
    const words = (['done', 'training', 'open', 'poor', 'locked', 'ring', 'sealed', 'soon', 'hidden'] as const).map((st) => stateWord(st, true));
    expect(new Set(words).size).toBe(words.length);
    expect(stateWord('done', false)).not.toBe(stateWord('done', true));
    // 目盛り：0〜3 段（足りていない）。少しでもあれば 1 段は点ける
    expect(gaugeSteps(0, 100)).toBe(0);
    expect(gaugeSteps(1, 100)).toBe(1);
    expect(gaugeSteps(50, 100)).toBe(2);
    expect(gaugeSteps(99, 100)).toBe(3);
    // 足りないときは責めない言い方（「あと N」と目盛り）
    expect(TR).toContain('gap = uxpGap(sh.have, sh.cost, { unit: sh.unit, hint: sh.hint });');
    expect(TR).toContain('if (gap?.short) return gap.nudge();');
    expect(TR).not.toMatch(/足りません/);
  });
  it('様子が同じパネルは描き直さない（鍵が同じ）。変わると鍵が変わる', () => {
    const d: NodeDesc = { st: 'open', goalTier: false, lv: 0, mx: 5, canUp: false, inf: false, donate: 0, train: -1, carried: false, tip: false, hot: false, step: -1, goal: false, wait: '', dim: false, brand: 0, brandOk: true, emblem: 0, emblemOk: true, gauge: -1 };
    expect(descKey({ ...d })).toBe(descKey(d));
    for (const patch of [{ st: 'done' }, { lv: 1 }, { canUp: true }, { hot: true }, { step: 0 }, { dim: true }, { gauge: 2 }, { train: 0.5 }, { wait: '★80' }, { brand: 30, brandOk: false }] as Partial<NodeDesc>[]) expect(descKey({ ...d, ...patch }), JSON.stringify(patch)).not.toBe(descKey(d));
    expect(TR).toContain('if (dk !== nv.key) {');
  });
  it('研究の手応え：数字が回って減る → パネルに電気が入る → つながる先が順に点く。動きを減らすと、すぐ結果になる', () => {
    const p = TR.slice(TR.indexOf('function powerOn('), TR.indexOf('function pulse('));
    expect(p).toContain("uxSfx('cash');");
    expect(p).toContain('uxPlus(rpOdo.el, -pay.rp');
    expect(p).toContain('K.after(ctx);');
    expect(p).toContain('if (isCalm()) return;');
    expect(p).toContain("replay(n, 'is-poweron');");
    expect(p).toContain('pulse(routed.wires[x.i].poly');
    expect(p).toContain("uxSfx('lamp', { step: n2 });");
    expect(TR).toContain("fundsOdo.set(Math.max(0, s.money), { dur: 700, onTick: () => uxSfx('tick') });");
    // 電気の粒は transform だけで動かす
    expect(TR).toMatch(/const frames = poly\.map\(\(p, i\) => \(\{ transform: `translate3d\(/);
    const css = noComment(src('uix/screens/tree.css'));
    expect(css).toMatch(/html\.is-uxc\.is-calm #isl-ui \.uxk-tree \*[^{]*\{\s*animation: none !important;/);
    // 菱形の縁は階段（角を丸めない・斜めの線にしない）
    const poly = stairDiamond(64);
    const pts = poly.slice(8, -1).split(',').map((q) => q.split(' ').map((v) => parseFloat(v)));
    expect(pts.length).toBe(64);
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      expect(x0 === x1 || y0 === y1, `${i}`).toBe(true);
    }
  });
  it('今の画面と同じ中身：通貨・上げられる・絞り込み・研究の施策・目標の帯・部門の見出し・帯の札・合流点・雲・修行・寄付・ズーム', () => {
    for (const k of ['fundsOdo', 'rpOdo', 'brandV', 'embV', 'K.affordableSkills(s)', 'K.bestSkillMove(S())', 'F.panel = !F.panel', 'K.studyEl(s,', 'K.rpStackEl(s)', 'K.goalPath(s, goal)', 'K.goalNext(s)', 'K.goalMonths(s)', 'K.setGoal(s, isGoal ? null : sel.id)', 'K.deptLevel(s, hd.d)', 'K.deptLockText(hd.d)', 'K.JUNCTIONS', 'K.GATES', 'K.KNOTPOS', 'T.DIG_PUFFS', 'K.trainingOf(s, k.id)', 'K.pickHero(ctx.root, s,', 'K.donate(s)', 'T.donateLabel(s)', 'K.carriedRp(s, k.id)', 'K.missingFront(s, k.id)', 'K.tipPanels(s)', 'K.condsOf(s, k)', 'K.shownOf(k)', 'T.infText(s, k, lv + 1)', 'K.ringsDue(s)', 'K.openRing(s, due[0])', 'K.openHQ(s)', 'sendCol(-1)', 'stepZoom(1)', 'V.zoom = T.ALL;', "vp.addEventListener(\n    'wheel'"]) expect(TR, k).toContain(k);
    // 絵文字は出さない（仮に絵文字で置いてあるパネルの絵は、ドットの絵に替える）
    expect(TR).toContain("if (!e.classList.contains('isl-tree-emoji')) {");
    expect(TR.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});

describe('企業ランキング', () => {
  const RK = src('uix/screens/ranking.ts');
  const SCR = src('p1/screens.ts');
  const UXK = src('p1/uxk.ts');
  it('入口：openRanking が、差し込み口が入っているときだけ新しい画面へ渡す（はじめのタブも渡す）。器は今の札（open）', () => {
    expect(SCR).toContain('if (uxk.ranking) return uxk.ranking(ctx, tab);');
    expect(src('uix/screens/k-boot.ts')).toContain('uxk.ranking = openRankingUx;');
    expect(RK).toContain("K.open(ctx, t('企業ランキング（月の売上）', 'Company ranking (monthly sales)')");
  });
  it('今の目印：マインちゃんの一言と ✕ の強調（mineTip の ranking）を、今の画面と同じく札の中身に。チュートリアルはこれで「見た」になる', () => {
    expect(RK).toContain("K.mineTip(ctx, 'ranking', body);");
  });
  it('出す中身は今の画面と同じ計算（rankingView）：エリア・ランド・世界・反撃・セール・次の順位までの差／2 位との差・順位の推移・世界の見込みの順位', () => {
    for (const k of ['areaRanking(s, mine,', 'LAND_COMPANIES', 'WORLD_COMPANIES', 'Math.max(9, Math.round(4000 / Math.max(1, Math.log10(Math.max(10, mine)))))', 'est * 37', 'rivalAreaMul(s, selling.rid) / edgeMul(s)', 'saleBonus(s, selling.rid)', 'rankHist(s.reports)', 'MARKET.rally']) expect(UXK, k).toContain(k);
    for (const k of ["key: 'area'", "key: 'land'", "key: 'world'", 'v.rally', 'v.sale', 'uxpGap(v.mine, v.gap.top', "t('2 位との差', 'Ahead of #2')", 'v.hist', 'v.worldMe', "t('同じエリアで物販をしている同業他社です。"]) expect(RK, k).toContain(k);
  });
  it('順位は横の棒（uxpRank）・わが社の行は琥珀（me）・1 位と 2 位のあいだにゴールの線。推移は縦の棒（上位ほど高い）', () => {
    expect(RK).toContain('uxpRank({');
    expect(RK).toContain('me: r.me');
    expect(RK).toContain("div.uxk-rk-goal");
    expect(histHeight(1, 5)).toBe(5);
    expect(histHeight(5, 5)).toBe(1);
    expect(rankRatio(0, 100)).toBeGreaterThan(0);
    expect(rankRatio(100, 100)).toBe(1);
  });
  it('順位の札は上の帯の札と同じ言葉と色（「エリア」・N 位・1 位は琥珀・報告が無いあいだは「--」）。順位が動いた月は、先月の順位から札がめくれる（月に 1 回）', () => {
    expect(RK).toContain("uxTape(t('エリア', 'Area'))");
    expect(RK).toContain("if (shown == null) num.textContent = '--';");
    expect(RK).toContain("num.classList.add('is-flip');");
    expect(RK).toContain('flippedMonth !== v.month');
    expect(rankMove(2, 3)).toBe('up');
    expect(rankMove(3, 2)).toBe('down');
    expect(rankMove(1, 1)).toBe('keep');
    expect(rankMove(4, null)).toBe('new');
    expect(rankMove(null, null)).toBe('est');
    // 色だけに頼らない：言葉が付く
    expect(moveWord('up', 3)).toContain('ランクアップ');
    expect(moveWord('down', 1)).toContain('ランクダウン');
  });
  it('動きを減らす：めくり・行の打ち込み・棒の伸びをせず、すぐ出る', () => {
    expect(RK).toContain('const flip = first && !isCalm()');
    expect(RK).toContain('if (first && !isCalm()) {');
    expect(RK).toMatch(/function grow\(bars: HTMLElement\[\], delay = 0\) \{\s*if \(isCalm\(\)\) return;/);
    expect(noComment(src('uix/screens/k-screens.css'))).toMatch(/html\.is-uxc\.is-calm #isl-ui \.uxk-calm \*::after \{\s*animation: none !important;/);
    expect(RK).toContain("el('div.uxk-rk.uxk-calm')");
  });
});

describe('設備投資', () => {
  const IV = src('uix/screens/invest.ts');
  const UXK = src('p1/uxk.ts');
  it('入口：openInvest が、差し込み口が入っているときだけ新しい画面へ渡す。器は今の札（open・keep：作り直さずに値だけ合わせる）', () => {
    expect(src('p1/screens.ts')).toContain('if (uxk.invest) return uxk.invest(ctx);');
    expect(src('uix/screens/k-boot.ts')).toContain('uxk.invest = openInvestUx;');
    expect(IV).toMatch(/K\.open\(\s*ctx,\s*t\('設備投資', 'Capital investment'\),[\s\S]*?undefined,\s*true,\s*\);/);
  });
  it('中身は今の画面と同じ（自社の建物・屋台の類は除く・その種類の設備・お店はいま効く順・チュートリアルのあいだは並べ替えない・今の目印 data-invest）', () => {
    for (const k of ["b.owner === 'me' && P1B[b.id]?.kind !== 'food'", 'shopInvestOrder(s, b)', "kind === 'shop' && b.left <= 0 && s.shops[b.uid] && !tut", 'INVESTS.filter((v) => v.kind === kind)', 'investCost(b, x.id)', 'invLv(b, x.id)']) expect(UXK, k).toContain(k);
    expect(IV).toContain("attrs: { 'data-invest': it0.id }");
    expect(IV).toContain("t('建物ごとに設備を良くします。地図で自社の建物をタップしても投資できます。'");
    expect(IV).toContain("t('まだ建物がありません。', 'No buildings yet.')");
    expect(IV).toContain('t(`工事中 あと ${b.left} 日`');
    // 設備の絵は、どれも描ける名前
    for (const x of INVESTS) expect(INVEST_ICO[x.id], x.id).toBeTruthy();
  });
  it('キーの様子：導入済・工事中は平ら・足りないときは押せて目盛りが動く（責めない）・買える', () => {
    expect(buyState({ cost: null }, 100, 0)).toBe('max');
    expect(buyState({ cost: 500 }, 100, 3)).toBe('busy');
    expect(buyState({ cost: 500 }, 100, 0)).toBe('short');
    expect(buyState({ cost: 500 }, 900, 0)).toBe('buy');
    expect(IV).toContain("if (st === 'short') return gap.nudge();");
    expect(gainText('sign', { weak: true, units: 0 })).toContain('いまは効かない');
    expect(gainText('shelves', { weak: false, units: 3.2 })).toContain('別の商品を並べて +3.2');
  });
  it('主役のキーは 1 つ（前の層）：上から見て、いま買える・効くいちばん上の設備', () => {
    const v = [
      { uid: 1, id: 'general_store', kind: 'shop', name: 'A', left: 0, items: [{ id: 'sign', name: 's', note: '', lv: 0, max: 3, cost: 9000, gain: null }, { id: 'backroom', name: 'b', note: '', lv: 0, max: 3, cost: 1000, gain: { weak: true, units: 0 } }, { id: 'fixtures', name: 'f', note: '', lv: 0, max: 2, cost: 2500, gain: null }] },
      { uid: 2, id: 'workshop', kind: 'workshop', name: 'B', left: 0, items: [{ id: 'tools', name: 't', note: '', lv: 0, max: 3, cost: 2000, gain: null }] },
    ] as never;
    expect(mainPick(v, 3000)).toBe('1:fixtures');
    expect(mainPick(v, 500)).toBeNull();
    expect(IV).toContain("key.classList.toggle('ux-key--main', main && !key.disabled);");
    expect(FRONT_SEL).toContain('.ux-key--main');
  });
  it('買う手応え：レジの音・金貨が資金から飛ぶ・資金が回って減る・光って揺れる → 420ms 後に段のランプと「導入済」。動きを減らすと、すぐ', () => {
    expect(BUY_MS).toBe(420);
    for (const k of ["uxSfx('cash')", 'coinsFly(from,', 'funds.set(Math.max(0, s.money), 700)', "uxpReplay(c, 'is-bought')", 'shake(c)', 'later(isCalm() ? 0 : BUY_MS', "uxSfx('stamp')", 'stamp.hit(c)', "uxpReplay(lit, 'is-new')", 'ctx.toast(t(`「${name}」を導入しました`']) expect(IV, k).toContain(k);
  });
});
