import { describe, expect, it } from 'vitest';

// Every game module builds its text at load time, so the language is forced before importing.
(globalThis as { MCW_LANG?: string }).MCW_LANG = 'en';

const JAPANESE = /[぀-ヿ㐀-鿿＀-￯]/;

describe('English', () => {
  it('numbers use K / M / B units', async () => {
    const { fmt, secs } = await import('../src/game/format');
    expect(fmt(1234)).toBe('1,234');
    expect(fmt(12345)).toBe('12.3K');
    expect(fmt(4.56e9)).toBe('4.56B');
    expect(secs(3)).toBe('3.00s');
  });

  it('the catalog uses English names', async () => {
    const { series, RARITY_JA, FAMILIES } = await import('../src/game/catalog');
    expect(series[0].name).toBe('Blade');
    expect(series[0].items[0].name).toBe('Novice Blade');
    expect(series.every((s) => !JAPANESE.test(s.name) && s.items.every((e) => !JAPANESE.test(e.name)))).toBe(true);
    expect(RARITY_JA.Legendary).toBe('Legendary');
    expect(Object.values(FAMILIES).every((f) => !JAPANESE.test(f.name))).toBe(true);
  });

  it('every Japanese literal in src/ has an English side (scripts/i18n-check.mjs)', async () => {
    // (Imported by name so the browser tsconfig, without Node types, still compiles.)
    const childProcess = 'node:child_process';
    const { execFileSync } = await import(/* @vite-ignore */ childProcess);
    expect(() => execFileSync('node', ['scripts/i18n-check.mjs'], { encoding: 'utf8' })).not.toThrow();
  });
});
