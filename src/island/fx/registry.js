// アイランドで使うドット絵のエフェクトの一覧（pixelfx の core と、使う効果だけ）。型は registry.d.ts。
// 効果を足すときは：pixelfx/fx/<分類>/<名前>.js に写す（または fx/island/ に自作する）→ ここに足す → registry.d.ts の FxId に足す。
// 決まりは docs/ISLAND_FX.md。
export { createFrame, clearFrame, createFx, composite } from './pixelfx/core/index.js';
import * as confetti from './pixelfx/fx/ui/confetti.js';
import * as collectBurst from './pixelfx/fx/pickups/collect-burst.js';
import * as fireworkBurst from './pixelfx/fx/explosions/firework-burst.js';
import * as coinPop from './pixelfx/fx/island/coin-pop.js';
import * as lootBeam from './pixelfx/fx/pickups/loot-beam.js';
import * as powerStar from './pixelfx/fx/pickups/power-star.js';
import * as sunburst from './pixelfx/fx/holy/sunburst.js';
import * as healingBloom from './pixelfx/fx/nature/healing-bloom.js';
import * as summonRise from './pixelfx/fx/spawn/summon-rise.js';
import * as poof from './pixelfx/fx/spawn/poof.js';
import * as hammerSparks from './pixelfx/fx/island/hammer-sparks.js';

export const EFFECTS = {
  confetti,
  'collect-burst': collectBurst,
  'firework-burst': fireworkBurst,
  'coin-pop': coinPop,
  'loot-beam': lootBeam,
  'power-star': powerStar,
  sunburst,
  'healing-bloom': healingBloom,
  'summon-rise': summonRise,
  poof,
  'hammer-sparks': hammerSparks,
};
