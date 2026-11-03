// Copied from pixelfx 0.3.0 (https://github.com/patch-gg/pixelfx), MIT License,
// Copyright (c) 2026 Patch, Copyright (c) 2026 Hugo Duprez. See ../LICENSE and ../NOTICE.md.
// Changed: only the parts the game uses (no actor, act, rig, poses, chain or scene).

// pixelfx core: everything an effect imports comes from here.

export * from "./math.js";
export * from "./color.js";
export * from "./particles.js";
export * from "./shapes.js";
export { Particles, Bits, Lights, Blazes, P, PF, B, GRAVITY, FIRE_RAMP, SMOKE_RAMP, sparkle, flare, band, crystal } from "./sim.js";
export { Painter } from "./painter.js";
export { FONTS, textWidth } from "./font.js";
export { createFrame, clearFrame, createFx, composite, painterFor, resolveOptions } from "./fx.js";
