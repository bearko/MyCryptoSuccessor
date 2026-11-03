# Notices

This folder holds parts of **pixelfx** 0.3.0 (https://github.com/patch-gg/pixelfx), MIT License,
Copyright (c) 2026 Patch, Copyright (c) 2026 Hugo Duprez. See `LICENSE`.

- `core/` : `math.js`, `color.js`, `particles.js`, `shapes.js`, `sim.js`, `painter.js`, `font.js` unchanged;
  `fx.js` and `index.js` trimmed (no stock actor, acts, rig, poses, chains or backdrops).
- `fx/ui/confetti.js`, `fx/explosions/firework-burst.js`, `fx/pickups/collect-burst.js`, `fx/holy/sunburst.js`,
  `fx/nature/healing-bloom.js`, `fx/spawn/poof.js` unchanged;
  `fx/pickups/loot-beam.js` (an `item` option to leave out the sword), `fx/pickups/power-star.js` (a `shadow` option)
  and `fx/spawn/summon-rise.js` (`beast` and `dust` options) changed as noted at the top of each file;
  `fx/pickups/_lib.js` trimmed to `Layer`, `blobShadow`, `glint`, `pool` and `coin`; `fx/holy/_lib.js` trimmed to
  `GOLD`; `fx/nature/_lib.js` trimmed to `drawLeaf`.

**Hugo Duprez.** `core/sim.js` and the effects that say so at the top of their file adapt Sprite Fusion's
open-source pixel art VFX (https://www.spritefusion.com/pixel-art-vfx), Copyright (c) 2026 Hugo Duprez, MIT License.

`fx/island/` is the game's own (My Crypto Successor), written against this core in the same style.
