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
      // 段 UIX5a：新しい画面が既定になったので、その束（boot・s-boot・sparts・micons ほか）と分かれた書体のファイル（125 個・合わせて約 0.8MB。
      // 事前に保存する分の約 7%）も事前に保存する（はじめて開いたあと、通信が無くても同じ見た目で遊べるように）。
      // 見本帳の kit（src/island/uix/kit.ts のチャンク）だけは、使ったときに覚える（sw-template.js の「初めて使ったときに保存」）
      const shell = files.filter((f) => SHELL.some((re) => re.test(f)) && !/^assets\/kit-/.test(f));
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
 * 書体は src/island/uix/boot.ts が読む。ブラウザは、画面に出た字を含むファイルだけを取りに行く（サービスワーカーは全部を事前に保存する）。
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
 * 段 UIX5a：起動で読む束を、入口の HTML で先に取りにいく（`<link rel="modulepreload">`・CSS は `<link rel="preload" as="style">`）。
 * 入口（src/island/main.ts）は、新しい画面の値と部品（boot）→ 画面の束（s-boot）→ 本体（p1/main）→ 上と下の帯（mapui）の順に読む。
 * 読む順（JS を動かす順・CSS を当てる順）はそのままで、取りにいくのだけを並べて早める（いちばん大きい本体の JS が、前の束を待たずに届く）。
 * CSS は preload なので、当てるのは今までどおり入口が stylesheet を足したとき（重なりの順は変わらない）。
 */
const START = ['src/island/uix/boot.ts', 'src/island/uix/screens/s-boot.ts', 'src/island/p1/main.ts', 'src/island/uix/screens/mapui.ts'];
function startPreload(): Plugin {
  return {
    name: 'mcs-start-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return;
        const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
        const byFile = new Map(chunks.map((c) => [c.fileName, c]));
        const js: string[] = [];
        const css: string[] = [];
        const add = (file: string) => {
          const c = byFile.get(file);
          if (!c || js.includes(file) || c.isEntry) return;
          for (const d of c.imports) add(d);
          js.push(file);
          for (const f of (c as { viteMetadata?: { importedCss?: Set<string> } }).viteMetadata?.importedCss ?? []) if (!css.includes(f)) css.push(f);
        };
        for (const id of START) {
          const c = chunks.find((x) => x.facadeModuleId?.split(sep).join('/').endsWith(id));
          if (c) add(c.fileName);
        }
        return [
          ...css.map((f) => ({ tag: 'link', attrs: { rel: 'preload', as: 'style', crossorigin: true, href: `./${f}` }, injectTo: 'head' as const })),
          ...js.map((f) => ({ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href: `./${f}` }, injectTo: 'head' as const })),
        ];
      },
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
  plugins: [uxFonts(), pwa(), siteUrl(), startPreload()],
  test: {
    // CI の機械は手元より遅く、町を何年ぶんも回すテストが既定の 5 秒を超えることがある
    // CI は 2 CPU で並列に回すので、性質のテスト（何か月も回す）が 60 秒を超えることがある
    testTimeout: 180_000,
    // ほかの作業の一時的な worktree（.claude/worktrees）のテストを拾わない
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
});
