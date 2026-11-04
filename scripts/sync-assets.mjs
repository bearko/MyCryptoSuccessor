#!/usr/bin/env node
// Builds the game catalog from the My Crypto Heroes asset database
// (https://github.com/bearko/mycryptoheroes) and copies only the files the game uses.
//
//   node scripts/sync-assets.mjs
//
// Source directory: $MCH_ASSETS_DIR, else vendor/mycryptoheroes (git submodule).
// Outputs: public/mch/** (copied assets), public/mch-atlas/*.png (sprite sheets),
// public/icons/*.png (app icons) and src/generated/catalog.json.
// Only what the island (src/island/) shows is copied; the rest of the database stays out of dist/.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';

const { PNG } = pngjs;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, process.env.MCH_ASSETS_DIR ?? 'vendor/mycryptoheroes');
const outPublic = join(root, 'public', 'mch');
const outAtlas = join(root, 'public', 'mch-atlas');
const outCatalog = join(root, 'src', 'generated', 'catalog.json');

if (!existsSync(join(src, 'Data'))) {
  console.error(`[sync-assets] asset database not found at ${src}`);
  console.error('Run `git submodule update --init` or set MCH_ASSETS_DIR.');
  process.exit(1);
}

const readJson = (p) => JSON.parse(readFileSync(join(src, p), 'utf8'));
const copied = new Set();
/** Copies a file from the asset DB and returns its URL path relative to the site root. */
function use(relPath) {
  if (!copied.has(relPath)) {
    const from = join(src, relPath);
    if (!existsSync(from)) throw new Error(`missing asset: ${relPath}`);
    const to = join(outPublic, relPath);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    copied.add(relPath);
  }
  return `mch/${relPath}`;
}

rmSync(outPublic, { recursive: true, force: true });
rmSync(outAtlas, { recursive: true, force: true });

// ---------------------------------------------------------------- sprite atlases
// 64×64 pixel-art sprites (extensions, heroes) are packed into sheets of 16×16 cells.
// A sprite is referenced as "#<sheet>/<cell>", e.g. "#ext-0/37".
const CELL = 64;
const SHEET_COLS = { ext: 16, hero: 16 };
const atlasQueues = {};
const spriteRefs = new Map();
/** Queues a 64×64 sprite for an atlas and returns its reference (or a plain file for odd sizes). */
function sprite(kind, relPath) {
  const known = spriteRefs.get(relPath);
  if (known) return known;
  const ref = packSprite(kind, relPath);
  spriteRefs.set(relPath, ref);
  return ref;
}

function packSprite(kind, relPath) {
  const png = PNG.sync.read(readFileSync(join(src, relPath)));
  if (png.width !== CELL || png.height !== CELL) return use(relPath);
  const queue = (atlasQueues[kind] ??= []);
  const index = queue.length;
  const perSheet = SHEET_COLS[kind] ** 2;
  queue.push(png);
  return `#${kind}-${Math.floor(index / perSheet)}/${index % perSheet}`;
}

/**
 * Writes a generated image under mch-atlas/ with a content hash in its name and returns its URL.
 * The cell numbers in the catalog change whenever a sheet's contents do, so a sheet must never be
 * served from an old cache under the same name (the service worker serves these cache-first).
 */
function writeHashed(name, buf) {
  const file = `${name}.${createHash('sha256').update(buf).digest('hex').slice(0, 10)}.png`;
  mkdirSync(outAtlas, { recursive: true });
  writeFileSync(join(outAtlas, file), buf);
  return `mch-atlas/${file}`;
}

function writeAtlases() {
  const sheets = {};
  mkdirSync(outAtlas, { recursive: true });
  for (const [kind, pngs] of Object.entries(atlasQueues)) {
    const cols = SHEET_COLS[kind];
    const perSheet = cols * cols;
    for (let page = 0; page * perSheet < pngs.length; page++) {
      const cells = pngs.slice(page * perSheet, (page + 1) * perSheet);
      const rows = Math.ceil(cells.length / cols);
      const sheet = new PNG({ width: cols * CELL, height: rows * CELL });
      cells.forEach((png, i) => {
        PNG.bitblt(png, sheet, 0, 0, CELL, CELL, (i % cols) * CELL, Math.floor(i / cols) * CELL);
      });
      const name = `${kind}-${page}`;
      sheets[name] = { url: writeHashed(name, PNG.sync.write(sheet, { deflateLevel: 9 })), cols, rows, cell: CELL };
    }
  }
  return sheets;
}


// What the game uses right now is packed first, so the first sheet of each atlas covers it.
const content = JSON.parse(readFileSync(join(root, 'src', 'game', 'content.json'), 'utf8'));
const firstBy = (isFirst) => (a, b) => Number(isFirst(b)) - Number(isFirst(a));

/** English names from the database, tidied: a few still use Japanese punctuation or text. */
const EN_FIXES = { 'ディープ・ヨシュカ': 'Deep Yoshka' };
const en = (name) => {
  const text = EN_FIXES[name] ?? name ?? '';
  return text.replaceAll('・', '·').replaceAll('（', ' (').replaceAll('）', ')').replace('<破>', '<Ha>');
};

// ---------------------------------------------------------------- extensions (all series)
// Every Legacy and Modern extension, grouped by series. Which series the game uses is decided
// in src/game/catalog.ts. "真" re-releases (ids 55xx/56xx) are flagged with `shin`.
const activeKeys = content.activeSeries.map((s) => s.key);
const isActiveExt = (e) => e.category === 'legacy' && activeKeys.includes(e.series.name.en);
const extensions = readJson('Data/Extensions/extensions.json')
  .filter((e) => e.category === 'legacy' || e.category === 'modern')
  .sort((a, b) => a.id - b.id)
  .sort(firstBy(isActiveExt));
const seriesMap = new Map();
for (const e of extensions) {
  const key = `${e.category}:${e.series.name.en}`;
  if (!seriesMap.has(key)) {
    seriesMap.set(key, { key: e.series.name.en, name: e.series.name.ja, nameEn: en(e.series.name.en), expansion: e.category, items: [] });
  }
  seriesMap.get(key).items.push({
    id: e.id,
    name: e.name.ja,
    nameEn: en(e.name.en),
    rarity: e.rarity.name,
    shin: e.category === 'legacy' && e.id >= 5500,
    skill: e.active_skill?.name?.ja ?? '',
    skillEn: en(e.active_skill?.name?.en),
    stats: e.max_level_stats,
    image: sprite('ext', e.image_file_path),
  });
}
const series = [...seriesMap.values()].sort((a, b) => a.items[0].id - b.items[0].id);
for (const s of series) s.items.sort((a, b) => a.id - b.id);

/**
 * Horizontal centre of a sprite's body (mean x of its opaque pixels, 0–64). Sprites are not
 * centred in their 64px cell; the game stands and mirrors heroes on this line so turning
 * around does not make them jump sideways.
 */
function bodyCenterX(relPath) {
  const png = PNG.sync.read(readFileSync(join(src, relPath)));
  let sum = 0;
  let n = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] > 0) {
        sum += x + 0.5;
        n++;
      }
    }
  }
  return n ? Math.round((sum / n / png.width) * CELL * 10) / 10 : CELL / 2;
}

// ---------------------------------------------------------------- heroes (all usable)
// Original, novice and replica heroes (staff and visitors on the island).
// Characters in content.json's excludedHeroIds (third-party copyrights) are never written to the
// catalog or the sprite sheets.
const excludedHeroes = new Set(content.excludedHeroIds);
const heroSource = readJson('Data/Heroes/heroes.json').filter((h) => !excludedHeroes.has(h.id));
const heroes = heroSource
  .filter((h) => ['original', 'novice', 'replica'].includes(h.category))
  .sort(firstBy((h) => h.category === 'original'))
  .map((h) => ({
    id: h.id,
    name: h.name.ja,
    nameEn: en(h.name.en),
    rarity: h.rarity?.name ?? null,
    category: h.category,
    faction: h.faction?.name?.ja ?? '',
    passive: h.passive?.name?.ja ?? '',
    passiveEn: en(h.passive?.name?.en),
    attributes: (h.attributes ?? []).map((a) => a.name.ja),
    // 島づくりの従業員の適性（HP はスタミナ）。最大レベルの値
    stats: h.max_level_stats ? { hp: h.max_level_stats.hp, phy: h.max_level_stats.phy, int: h.max_level_stats.int, agi: h.max_level_stats.agi } : null,
    // ヒーローの育成（段 E1）：Lv1 の値。最大 Lv との比で、どの能力値がよく伸びるか（伸びの個性）を決める
    initial: h.initial_stats ? { hp: h.initial_stats.hp, phy: h.initial_stats.phy, int: h.initial_stats.int, agi: h.initial_stats.agi } : null,
    image: sprite('hero', h.image_file_path),
    cx: bodyCenterX(h.image_file_path),
  }));

// ---------------------------------------------------------------- window views
// Battle backgrounds are 1000×1500; the shop screen's window only shows a 2:1 strip, so a small
// box-filtered crop is written instead of shipping the full image.
const WINDOW_W = 320;
const WINDOW_H = 160;
function windowCrop(relPath, key) {
  const png = PNG.sync.read(readFileSync(join(src, relPath)));
  const cropH = Math.round(png.width / 2);
  const y0 = Math.round(png.height * 0.3);
  const out = new PNG({ width: WINDOW_W, height: WINDOW_H });
  const sx = png.width / WINDOW_W;
  const sy = cropH / WINDOW_H;
  for (let y = 0; y < WINDOW_H; y++) {
    for (let x = 0; x < WINDOW_W; x++) {
      const acc = [0, 0, 0, 0];
      let n = 0;
      for (let v = Math.floor(y0 + y * sy); v < Math.floor(y0 + (y + 1) * sy); v++) {
        for (let u = Math.floor(x * sx); u < Math.floor((x + 1) * sx); u++) {
          const i = (v * png.width + u) * 4;
          for (let c = 0; c < 4; c++) acc[c] += png.data[i + c];
          n++;
        }
      }
      const o = (y * WINDOW_W + x) * 4;
      for (let c = 0; c < 4; c++) out.data[o + c] = Math.round(acc[c] / Math.max(1, n));
    }
  }
  return writeHashed(`window-${key}`, PNG.sync.write(out, { deflateLevel: 9 }));
}

// Scenery seen through the shop screen's window.
const windowView = windowCrop('Image/Backgrounds/1056.png', 'default');

// Files the island refers to by path (src/island/): the guide's portraits, the workshop screen's
// background, the GUM coin and emblem, the land sector art of Lime, and sounds.
const FILES = [
  'Image/Characters/navi_ain_speak_00_talk.png',
  'Image/Characters/navi_ain_cross_01_smile.png',
  'Image/CraftBackgrounds/Base/100.webp',
  'Image/CraftBackgrounds/Base/200.gif',
  'Image/CraftBackgrounds/Stages/201.gif',
  'Image/Icons/gum.png',
  'Image/Icons/emblem.webp',
  ...['1_Common', '2_Uncommon', '3_Rare', '4_Epic', '5_Legendary'].map((r) => `Image/LandSectors/04_Lime_${r}.png`),
  // src/island/p1/sfx.ts
  'Audio/SE/Actions/open_treasure.mp3',
  'Audio/SE/Actions/cp-mining-complete.mp3',
  // src/island/p1/sfx.ts: the board meeting (approve, raise, reject or cut, bulk approval and targets met)
  'Audio/SE/Actions/insp.mp3',
  'Audio/SE/Battle/4_buff.mp3',
  'Audio/SE/Battle/1_single_damage.mp3',
  'Audio/SE/Jingles/win.mp3',
];
for (const f of FILES) use(f);

// BGM played through src/audio.ts.
const audio = {
  // The island's main theme (a 1:48 track filed under SE in the database)
  bgmCraft: use('Audio/SE/Actions/craft.mp3'),
  // While digging
  bgmDig: use('Audio/BGM/land.mp3'),
  // The board meeting, from the entrance to the summary (stage I2)
  bgmBoard: use('Audio/BGM/9on9.mp3'),
};

const atlases = writeAtlases();

const catalog = {
  generatedFrom: 'https://github.com/bearko/mycryptoheroes',
  atlases,
  series,
  heroes,
  windowView,
  audio,
};

mkdirSync(dirname(outCatalog), { recursive: true });
writeFileSync(outCatalog, JSON.stringify(catalog, null, 1));

// ---------------------------------------------------------------- app icons (PWA / home screen)
// The GUM coin (64px pixel art) scaled up without smoothing onto the island's night blue (theme-color). The
// coin stays inside the central 80% so the same file works as a maskable icon.
const outIcons = join(root, 'public', 'icons');
mkdirSync(outIcons, { recursive: true });
const coin = PNG.sync.read(readFileSync(join(src, 'Image/Icons/gum.png')));
for (const size of [192, 512]) {
  const scale = Math.floor((size * 0.72) / coin.width);
  const offset = Math.floor((size - coin.width * scale) / 2);
  const out = new PNG({ width: size, height: size });
  for (let i = 0; i < size * size; i++) out.data.set([0x1d, 0x2a, 0x44, 0xff], i * 4);
  for (let y = 0; y < coin.height * scale; y++) {
    for (let x = 0; x < coin.width * scale; x++) {
      const si = (Math.floor(y / scale) * coin.width + Math.floor(x / scale)) * 4;
      const a = coin.data[si + 3] / 255;
      const di = ((y + offset) * size + x + offset) * 4;
      for (let c = 0; c < 3; c++) out.data[di + c] = Math.round(coin.data[si + c] * a + out.data[di + c] * (1 - a));
    }
  }
  writeFileSync(join(outIcons, `icon-${size}.png`), PNG.sync.write(out));
}
console.log(
  `[sync-assets] ${series.length} series / ${extensions.length} extensions, ${heroes.length} heroes, ` +
    `${Object.keys(atlases).length} atlas sheets, ${copied.size} other files`,
);
