/**
 * スキルツリーの並び（段 ST1：上から下へ流れる形。treelayout.ts の段の並び・treeorder.ts の TREE_ORDER）：つながりの線が交わらない・パネルの下を通らない。
 * ISLAND_TREE_OPT=1 で回すと、scripts/island/treeopt.ts で並びを探して src/island/p1/treeorder.ts を書き直す（スキルを足したあとに）。
 * ISLAND_TREE_LINKS=1 で回すと、scripts/island/treelinks.ts で、残っている交わりを減らす「先に要る」の付け替えの候補を表示する（データは書き換えない）。
 * ふだんは、いまの並びの線の交わりを数える（四角＝研究・菱形＝お金の大きさ）。放射状の配置のときと同じく、描く曲線どうしで数える。
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { optimize } from '../scripts/island/treeopt';
import { linkIdeas } from '../scripts/island/treelinks';
import { EDGES, EDGE_CLEAR, LANES, POS, SQ_SIDE, PANEL, crossings, edgePoly, halfOf, laneCross, polyHits, shapeById } from '../src/island/p1/treelayout';
import { SKILL, SKILLS, isResearch } from '../src/island/p1/data';
import { TREE_ORDER } from '../src/island/p1/treeorder';

/**
 * 線どうしの交わりの上限（描く曲線どうし。端のパネルを共有する線は数えない）。放射状のときは段 UI5b でつながりを見直して 0。
 * 上から下へ流れる形（段 ST1）は、つながりを替えずに、レーンごとに段の並びを探して 0（重心法だけでは 2：R&D の「両方要る」の線）
 */
export const CROSS_NOW = 0;
/** 線がほかのパネルの下を通る数の上限 */
export const HIT_NOW = 0;

describe.runIf(!!process.env.ISLAND_TREE_OPT)('並びを探す（ISLAND_TREE_OPT=1）', () => {
  it('レーンごとに並べ直して、treeorder.ts に書く', () => {
    const r = optimize({ seed: 1, tries: Number(process.env.ISLAND_TREE_ITERS ?? 400), keep: 8 });
    process.stderr.write(`OPT: cross ${r.cross} curve ${r.curve} hits ${r.hits}\n`);
    const body = Object.entries(r.table)
      .map(([k, v]) => `  '${k}': [${v.map((x) => `'${x}'`).join(', ')}],`)
      .join('\n');
    writeFileSync(
      'src/island/p1/treeorder.ts',
      `/**\n * スキルツリーの段の並び（段 ST1：上から下へ流れる形。key はレーン|帯|帯の中の段（-2 根もと・-1 帯の入口）→ 並び（パネルの id・通り道「~id#段」・帯の入口「@g:U」））。\n * つながりの線が交わらないように選んだもの。tests/island-p1-treeorder.test.ts（ISLAND_TREE_OPT=1）が scripts/island/treeopt.ts で探して書く。手で直さない。\n * 表に無い段・中身が変わった段は、読み込んだときに重心法で並べる（treelayout.ts の orderLane）。\n */\nexport const TREE_ORDER: Record<string, string[]> = {\n${body}\n};\n`,
    );
    expect(r.curve).toBeLessThanOrEqual(CROSS_NOW + 2);
  }, 3_600_000);
});

describe.runIf(!!process.env.ISLAND_TREE_LINKS)('つながりの付け替えの候補（ISLAND_TREE_LINKS=1）', () => {
  it('残っている交わりを減らす付け替えを表示する', () => {
    const ideas = linkIdeas(TREE_ORDER);
    process.stderr.write(`LINKS: ${ideas.length}\n${ideas.slice(0, 20).map((x) => `${x.from} → ${x.id} を ${x.to} → ${x.id} に：${x.before} → ${x.after}`).join('\n')}\n`);
    expect(Array.isArray(ideas)).toBe(true);
  }, 3_600_000);
});

describe('スキルツリーの並び：線が交わらない（上から下へ流れる形）', () => {
  it(`つながりの線どうしの交わりが ${CROSS_NOW} 以下（描く曲線で数える。並びの数え方でも同じ）`, () => {
    const x = crossings();
    expect(x.length, x.slice(0, 30).join('\n')).toBeLessThanOrEqual(CROSS_NOW);
    expect(LANES.reduce((a, L) => a + laneCross(L), 0)).toBeLessThanOrEqual(CROSS_NOW);
  });
  it('線は、ほかのパネル（四角は四角・菱形は菱形の大きさ）の下を通らない', () => {
    const out: string[] = [];
    for (const e of EDGES) {
      const pts = edgePoly(e.pts, 40);
      const hit = [...POS].filter(([id, p]) => id !== e.from && id !== e.to && polyHits(pts, id, p, EDGE_CLEAR));
      if (hit.length) out.push(`${e.from ?? '(根もと)'}→${e.to}（${hit.map(([id]) => id).join('・')}）`);
    }
    expect(out.length, out.slice(0, 20).join('\n')).toBeLessThanOrEqual(HIT_NOW);
  });
  it('数える関数：交わる 2 本は数える・端を共有する線は数えない', () => {
    const a = { from: 'a', to: 'b', br: 'logistics', g: 'x', kind: 'all', pts: [{ x: 0, y: 0 }, { x: 2, y: 2 }] } as const;
    const b = { from: 'c', to: 'd', br: 'logistics', g: 'x', kind: 'all', pts: [{ x: 2.1, y: 0.1 }, { x: 0.1, y: 2.3 }] } as const;
    const c = { from: 'a', to: 'e', br: 'logistics', g: 'x', kind: 'all', pts: [{ x: 0, y: 0 }, { x: 0.5, y: 2 }] } as const;
    expect(crossings([{ ...a, pts: [...a.pts] }, { ...b, pts: [...b.pts] }])).toHaveLength(1);
    expect(crossings([{ ...a, pts: [...a.pts] }, { ...c, pts: [...c.pts] }])).toHaveLength(0);
  });
  it('どのパネルも、払うものと形が合っている：研究ポイント（RP）は四角・お金は菱形（形の大きさもそれぞれ）', () => {
    expect(SKILLS.length).toBeGreaterThan(300);
    for (const k of SKILLS) expect(shapeById(k.id), k.id).toBe(isResearch(k) ? 'square' : 'diamond');
    // 無限の強化パネルは RP・研究への寄付はお金
    expect(shapeById('u_dig_speed_inf')).toBe('square');
    expect(shapeById('dig_donate')).toBe('diamond');
    expect(halfOf('dig_donate')).toBeCloseTo(PANEL / 2);
    expect(halfOf('hire')).toBeCloseTo(SQ_SIDE / 2);
    expect(SKILL.hire.cat).toBe('research');
  });
});
