/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Files the service worker caches at install: the app shell. The rest is cached on first use. */
const SHELL = [/^index\.html$/, /^assets\//, /^mch-atlas\//, /^icons\//, /^manifest\.webmanifest$/, /^mch\/Image\/(Icons|Characters|LandSectors)\//];

/** Writes dist/sw.js from scripts/sw-template.js with the precache list and a content hash. */
function pwa(): Plugin {
  let outDir = 'dist';
  return {
    name: 'mcs-pwa',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => f !== 'sw.js')
        .sort();
      // 段 UIX1a：新しい画面（入のときだけ読む分）は事前に保存しない：使ったときに覚える（sw-template.js の「初めて使ったときに保存」）。
      // 分かれた書体のファイル（120 個あまり）と、入口の boot・見本帳の kit（src/island/uix/boot.ts・kit.ts のチャンク）、
      // 段 UIX2s の新しい画面の束 s-boot（src/island/uix/screens/s-boot.ts のチャンク）
      const shell = files.filter((f) => SHELL.some((re) => re.test(f)) && !/\.woff2?$/.test(f) && !/^assets\/(boot|kit|s-boot)-/.test(f));
      const hash = createHash('sha256');
      for (const f of shell) hash.update(f).update(readFileSync(join(outDir, f)));
      const precache = ['./', ...shell.filter((f) => f !== 'index.html')];
      const sw = readFileSync('scripts/sw-template.js', 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__PRECACHE__', JSON.stringify(precache));
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

/**
 * 段 UIX1a：新しい画面（方向 C「管制卓」）の書体（@fontsource/dotgothic16・@fontsource/jersey-10。SIL Open Font License。文は public/fonts/）。
 * unicode-range で分かれた woff2 を自前で配る（外部の CDN からは読まない）。古いブラウザ向けの woff は配らない：CSS から外す。
 * 書体は入のとき（src/island/uix/boot.ts）だけ読む。ブラウザは、画面に出た字を含むファイルだけを取りに行く。
 */
function uxFonts(): Plugin {
  return {
    name: 'mcs-ux-fonts',
    enforce: 'pre',
    transform(code, id) {
      if (!/@fontsource[\\/][^?]+\.css/.test(id)) return null;
      return { code: code.replace(/,\s*url\([^)]*\.woff\)\s*format\('woff'\)/g, ''), map: null };
    },
  };
}

/**
 * The site's address for link previews (og:image and og:url must be absolute): SITE_URL if set,
 * else the Cloudflare domain when built on Workers Builds (WORKERS_CI), else relative paths.
 */
const CLOUDFLARE_SITE_URL = 'https://successor.bearko.games';

function siteUrl(): Plugin {
  const domain = process.env.SITE_URL || (process.env.WORKERS_CI ? CLOUDFLARE_SITE_URL : '');
  const base = domain ? `${domain.replace(/\/+$/, '')}/` : './';
  return {
    name: 'mcs-site-url',
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', base),
  };
}

export default defineConfig({
  // Relative base so the build works from any sub-path (static hosting).
  base: './',
  build: {
    assetsInlineLimit: 0,
  },
  plugins: [uxFonts(), pwa(), siteUrl()],
  test: {
    // CI の機械は手元より遅く、町を何年ぶんも回すテストが既定の 5 秒を超えることがある
    // CI は 2 CPU で並列に回すので、性質のテスト（何か月も回す）が 60 秒を超えることがある
    testTimeout: 180_000,
    // ほかの作業の一時的な worktree（.claude/worktrees）のテストを拾わない
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
});
