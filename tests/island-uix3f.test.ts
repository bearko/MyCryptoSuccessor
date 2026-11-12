// 段 UIX3f：前の層（docs/ISLAND_UIX.md「前の層」）。
// 走査線の 1 枚に、主役のボタンの形の窓を開ける：選ぶもの・形の読み方（箱の外は除く）・隠れている物には開けないこと・窓の形
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FRONT_MAX, FRONT_SEL, PROBE_EVERY, boxOf, cross, frontBoxes, holePath, onTop, shapeOf, snap, type Box, type FrontEnv } from '../src/island/uix/front';

const src = (f: string) => readFileSync(new URL(`../src/island/${f}`, import.meta.url), 'utf8');

/** テスト用の要素：形と、中に含む要素だけを持つ */
function fakeEl(r: Box, o: { disabled?: boolean; kids?: object[] } = {}) {
  const e = {
    disabled: !!o.disabled,
    getBoundingClientRect: () => ({ left: r.x, top: r.y, width: r.w, height: r.h }),
    contains: (x: unknown) => x === e || (o.kids ?? []).includes(x as object),
  };
  return e as unknown as Element;
}
/** テスト用の画面：probe は「その点でいちばん手前」を tops から引く（無ければ要素そのもの） */
function env(o: Partial<FrontEnv> & { top?: (x: number, y: number) => Element | null } = {}): FrontEnv {
  return { W: 390, H: 844, probe: o.top ?? (() => null), clips: () => [], inert: () => false, shown: () => true, ...o };
}

describe('段 UIX3f：前の層', () => {
  it('前の層に出すのは、主のキー・承認のレバー・下の帯の主・推奨の選択肢・名指しした物（ふつうのキーは入れない）', () => {
    const sel = FRONT_SEL.split(',').map((s) => s.trim());
    expect(sel).toContain('.ux-front');
    expect(sel).toContain('.ux-key--main');
    expect(sel).toContain('.ux-lever');
    expect(sel.some((s) => s.endsWith('.isl-tab.is-center'))).toBe(true);
    expect(sel.some((s) => s.endsWith('.isl-cardm-btn.is-rec'))).toBe(true);
    // 主役だけ：ふつうのキー・今のボタン全部・押せないキーを丸ごと入れる選び方はしない
    for (const s of sel) expect(['.ux-key', '.isl-btn', 'button', '.ux-key--flat']).not.toContain(s);
    expect(FRONT_MAX).toBeGreaterThanOrEqual(4);
    expect(PROBE_EVERY).toBeGreaterThanOrEqual(2);
  });

  it('四角の重なり：重なった分だけ。離れていれば無し', () => {
    expect(cross({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 6, w: 10, h: 10 })).toEqual({ x: 5, y: 6, w: 5, h: 4 });
    expect(cross({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBeNull();
    expect(cross({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 20, w: 5, h: 5 })).toBeNull();
  });

  it('画素の升目にそろえる：外へは広げない。小さすぎる物（8px 未満）は開けない', () => {
    expect(snap({ x: 10.4, y: 20.6, w: 100.2, h: 44.9 })).toEqual({ x: 11, y: 21, w: 99, h: 44 });
    expect(snap({ x: 12, y: 632, w: 366, h: 58 })).toEqual({ x: 12, y: 632, w: 366, h: 58 });
    expect(snap({ x: 0, y: 0, w: 7, h: 40 })).toBeNull();
    expect(snap({ x: 0, y: 0, w: 40, h: 6.5 })).toBeNull();
  });

  it('窓の形：画面いっぱいの四角から、窓を 1 つずつ抜く。窓が無ければ空（切り抜かない）', () => {
    expect(holePath(390, 844, [])).toBe('');
    expect(holePath(390, 844, [{ x: 12, y: 632, w: 366, h: 58 }])).toBe('M0 0H390V844H0ZM12 632h366v58h-366Z');
    const two = holePath(1280, 800, [
      { x: 1, y: 2, w: 30, h: 40 },
      { x: 500, y: 600, w: 10, h: 20 },
    ]);
    expect(two.startsWith('M0 0H1280V800H0Z')).toBe(true);
    expect(two.match(/Z/g)).toHaveLength(3);
  });

  it('形：画面の外・はみ出しを切る箱の外は除く（札の中を送って半分隠れたキーは、見えている分だけ）', () => {
    const key = fakeEl({ x: 36, y: 703, w: 318, h: 44 });
    // 札の中の箱（310〜730）で下が切れる
    const e = env({ clips: () => [{ x: 20, y: 310, w: 350, h: 420 }] });
    expect(shapeOf(key, e)).toEqual({ x: 36, y: 703, w: 318, h: 27 });
    // 箱の外へ送りきったら無し
    expect(shapeOf(fakeEl({ x: 36, y: 231, w: 318, h: 56 }), e)).toBeNull();
    // 画面の下へはみ出した分は除く
    expect(shapeOf(fakeEl({ x: 0, y: 820, w: 100, h: 60 }), env())).toEqual({ x: 0, y: 820, w: 100, h: 24 });
    // 見えていない物（display・visibility・opacity）は無し
    expect(shapeOf(key, env({ shown: () => false }))).toBeNull();
  });

  it('手前かの確かめ：上・中・下の 3 点とも、その要素（か中の要素）が手前のときだけ開ける', () => {
    const kid = {};
    const key = fakeEl({ x: 12, y: 632, w: 366, h: 58 }, { kids: [kid] });
    const b = { x: 12, y: 632, w: 366, h: 58 };
    const seen: number[] = [];
    expect(
      onTop(
        key,
        b,
        env({
          top: (_x, y) => {
            seen.push(y);
            return kid as Element;
          },
        }),
      ),
    ).toBe(true);
    expect(seen).toEqual([635, 661, 687]);
    // 上に別の窓（暗い幕）がかぶっている：開けない
    const modal = fakeEl({ x: 0, y: 0, w: 390, h: 844 });
    expect(onTop(key, b, env({ top: () => modal }))).toBe(false);
    // 上だけ別の物に隠れている（貼りついた見出しの下へ入りかけ）：開けない
    expect(onTop(key, b, env({ top: (_x, y) => (y < 640 ? modal : key) }))).toBe(false);
    expect(boxOf(key, env({ top: () => modal }))).toBeNull();
    expect(boxOf(key, env({ top: () => key }))).toEqual(b);
  });

  it('押せない設定のあいだ（開いた直後の守り）は probe に出ない：見えているなら開ける', () => {
    const key = fakeEl({ x: 12, y: 632, w: 366, h: 58 });
    expect(boxOf(key, env({ top: () => null, inert: () => true }))).toEqual({ x: 12, y: 632, w: 366, h: 58 });
    expect(boxOf(key, env({ top: () => null, inert: () => false }))).toBeNull();
  });

  it('窓の一覧：押せないキーは除く。数は上限まで', () => {
    const live = fakeEl({ x: 10, y: 10, w: 100, h: 44 });
    const dead = fakeEl({ x: 10, y: 80, w: 100, h: 44 }, { disabled: true });
    const e = env({ top: (_x, y) => (y < 60 ? live : dead) });
    expect(frontBoxes([live, dead], e)).toEqual([{ x: 10, y: 10, w: 100, h: 44 }]);
    const many = Array.from({ length: FRONT_MAX + 5 }, (_, i) => fakeEl({ x: 0, y: i * 50, w: 100, h: 44 }));
    const top = (_x: number, y: number) => many[Math.floor(y / 50)] ?? null;
    expect(frontBoxes(many, env({ H: 5000, top }))).toHaveLength(FRONT_MAX);
  });

  it('走査線の線は独立した 1 枚（.ux-crt-lines）。流れる帯は今のまま。起動のときに作って前の層へ渡す', () => {
    const css = src('uix/parts.css');
    expect(css).toMatch(/html\.is-uxc \.ux-crt > \.ux-crt-lines \{[^}]*repeating-linear-gradient/);
    expect(css).not.toMatch(/\.ux-crt::before/);
    expect(css).toMatch(/html\.is-uxc \.ux-crt::after \{/);
    const boot = src('uix/boot.ts');
    expect(boot).toMatch(/lines\.className = 'ux-crt-lines'/);
    expect(boot).toMatch(/initFront\(lines\)/);
  });

  it('窓は、走査線が入のときだけ。幕が出ているあいだは開けない。clip-path の path() が使えなければ何もしない', () => {
    const f = src('uix/front.ts');
    expect(f).toMatch(/classList\.contains\('is-crt'\) && !wipeIsBusy\(\)/);
    expect(f).toMatch(/CSS\.supports\('clip-path', 'path\(evenodd/);
    // 変わったときだけ書きこむ
    expect(f).toMatch(/if \(d !== last\) \{/);
  });

  it('吹き出しの主役のキー（並びの先頭の琥珀のキー）は、前の層に出す', () => {
    expect(src('uix/screens/pop.ts')).toMatch(/\.isl-btn\.is-on:not\(:disabled\)'\)\?\.classList\.add\('ux-front'\)/);
  });
});
