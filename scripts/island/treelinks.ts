/**
 * スキルツリーのつながりの見直しの候補（段 ST1：上から下へ流れる形。DOM なし）。
 * 段 UI5b（放射状）では、線の交わりを 0 にするため「先に要る」を同じ束の中にまとめ直した（src/island/p1/treelinks.ts。値段・効き目は変えない）。
 * 上から下へ流れる形では、つながりはそのままで並びだけで交わりがほぼ 0 になるので、つながりは替えない。
 * ここでは、まだ残っている交わり・パネルの下を通る線について、同じレーン・同じ帯で、深さが同じか浅いパネルへ「先に要る」を付け替えた候補を
 * 試して、交わりが減るものを並べる（tests/island-p1-treeorder.test.ts の ISLAND_TREE_LINKS=1 が表示する。データは書き換えない）。
 */
import { SKILL } from '../../src/island/p1/data';
import { EDGES, crossings, groupOf, layoutTree } from '../../src/island/p1/treelayout';
import { hitsOf } from './treeopt';

export interface LinkIdea {
  id: string;
  from: string;
  to: string;
  /** 付け替えたときの交わり・パネルの下を通る数（いま → 付け替えたあと） */
  before: number;
  after: number;
}
/** 交わりにかかわる線の、付け替えの候補（交わり × 10 ＋ パネルの下 が減るもの） */
export function linkIdeas(table: Record<string, string[]> = {}): LinkIdea[] {
  layoutTree(table);
  const score = () => crossings().length * 10 + hitsOf();
  const base = score();
  const involved = new Set(crossings().flatMap((x) => x.split(' x ').map((y) => y.split('->')[1])));
  const out: LinkIdea[] = [];
  for (const id of involved) {
    const k = SKILL[id];
    const req0: string[] = k?.requires ?? [];
    if (!req0.length) continue;
    const g = groupOf(id)!;
    for (const from of req0) {
      for (const alt of g.skills) {
        if (alt.id === id || req0.includes(alt.id) || (alt.tier ?? 'C') !== (SKILL[from].tier ?? 'C')) continue;
        // 輪にならない（alt が id の先にある）ものは試さない
        if (EDGES.some((e) => e.from === id && e.to === alt.id)) continue;
        const keep: string[] = req0;
        k.requires = keep.map((r: string) => (r === from ? alt.id : r));
        try {
          layoutTree(table);
          const s = score();
          if (s < base) out.push({ id, from, to: alt.id, before: base, after: s });
        } catch {
          // 輪になった
        } finally {
          k.requires = keep;
        }
      }
    }
  }
  layoutTree(table);
  return out.sort((a, b) => a.after - b.after);
}
