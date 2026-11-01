// 生成した画像（スプライトシート・窓の景色）の URL には中身のハッシュが入る。
// シートの中身（セルの番号）が変わると URL も変わるので、古いキャッシュの絵がずれて出ることがない
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import raw from '../src/generated/catalog.json';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });

describe('生成した画像の URL', () => {
  it('mch-atlas/ の URL はすべて <名前>.<ハッシュ 10 桁>.png', () => {
    const urls = JSON.stringify(raw).match(/mch-atlas\/[^"]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(5);
    expect(urls.filter((u) => !/^mch-atlas\/[\w-]+\.[0-9a-f]{10}\.png$/.test(u))).toEqual([]);
  });
});

describe('アイランドが使う MCH の素材', () => {
  it('src/island/ が名前で指している mch/ のファイルは、scripts/sync-assets.mjs が public/mch/ に写している', () => {
    const refs = new Set(files('src/island').flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/['"`](mch\/[\w/.-]+\.(?:png|webp|gif|mp3))['"`]/g)].map((m) => m[1])));
    expect(refs.size).toBeGreaterThan(5);
    expect([...refs].filter((r) => !existsSync(join('public', r)))).toEqual([]);
  });

  it('BGM のファイルが public/mch/ にある', () => {
    expect(Object.values(raw.audio).filter((f) => !existsSync(join('public', f)))).toEqual([]);
  });
});
