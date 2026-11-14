// 段 UIX5t：部長との対話を、会話の器と画面の部品で組み直した（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：部長との対話」）。
// 入のときだけ新しい画面に分かれること・押した先は今の画面と同じ関数（選択肢の中身を 1 か所で作る）こと・出す中身が今の画面とそろうこと・
// 新しい画面の束が本体のモジュールを読まないこと・主役（レバー・主のキー）・動きを減らすと全部すぐ出ること。
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { uxtDeps, htSummary, htOrg, htHire, htDeleg, htItem } from '../src/island/p1/uxt';
import { uxsDeps } from '../src/island/p1/uxs';
import { newP1 } from '../src/island/p1/model';
import { charismaLine, moraleAvg, payroll, wantsToQuit } from '../src/island/p1/hr';
import { orgChart } from '../src/island/p1/org';
import { DEPT_DUTIES } from '../src/island/p1/data';
import { uxt } from '../src/island/uix/screens/t-slots';
import { LEVER, leverCore } from '../src/island/uix/parts';

const src = (f: string) => readFileSync(new URL(`../src/island/${f}`, import.meta.url), 'utf8');
const T_FILES = ['t-talk.ts', 't-boot.ts', 't-deps.ts', 't-slots.ts'];
const noComment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

afterEach(() => {
  for (const k of Object.keys(uxt)) delete (uxt as Record<string, unknown>)[k];
});

describe('切り替え：入のときだけ新しい画面に分かれる（切のときは今の画面のまま）', () => {
  it('差し込み口は、はじめは空。入れ物は uix/hooks.ts・中身を入れるのは t-boot.ts（s-boot.ts の install から 1 行で呼ぶ）', () => {
    expect(Object.keys(uxt)).toEqual([]);
    expect(src('uix/screens/t-slots.ts').match(/^import (?!type )/gm)).toBeNull();
    expect(src('uix/screens/t-slots.ts')).toContain("export { uxtSlots as uxt } from '../hooks';");
    expect(src('uix/hooks.ts')).toContain('export const uxtSlots: UxtScreens = {};');
    expect(src('uix/screens/s-boot.ts')).toContain('installT(d.t);');
    expect(src('p1/uxs.ts')).toContain('t: uxtDeps,');
    expect(uxsDeps.t).toBe(uxtDeps);
  });
  it('本体の入口は、描く関数の頭の 1 行の分かれ道。描く前の決まり（prep）は今の画面と同じ所を通る', () => {
    const H = src('p1/headtalkui.ts');
    const r = H.slice(H.indexOf('function render('));
    expect(r.split('\n').slice(1, 4).join('\n')).toContain('if (uxt.headTalk) return uxt.headTalk(body, htCall(ctx, hooks));');
    expect(H).toContain('const { c, s, dept, mode, H, items, item } = prep(ctx);');
    // 着せ替えはやめた（UIX3d の headtalk.ts は無い）
    expect(H).not.toContain('uxd.headTalk');
    expect(() => src('uix/screens/headtalk.ts')).toThrow();
  });
  it('選択肢（字・並び・押した先）は 1 か所（optList）で作り、今の画面のボタンと新しい画面のキーの両方がそれを使う', () => {
    const H = src('p1/headtalkui.ts');
    expect(H).toContain('for (const { label, on, cls } of optList(ctx, s, dept, mode, item, hooks)) {');
    expect(H).toContain('opts: last ? optList(ctx, s, dept, mode, item, hooks) : [],');
    // 承認はレバー（今と同じ字の決まり：「✔ 承認」で始まる）・却下・あとでは押すキー
    const U = src('uix/screens/t-talk.ts');
    expect(U).toContain('/^✔ (承認|Approve)/.test(o.label)');
    expect(U).toContain('uxLever({');
    expect(U).toContain("const kind = o.k === 'reject' || o.k === 'later' || o.k === 'back' ? 'weak' : rec ? 'main' : '';");
    // 押した先は今の関数（o.on・c.plan・c.detail・c.more）だけ
    expect(U).toContain('o.on();');
    expect(U).toContain('c.plan(');
    expect(U).toContain('c.detail()');
    expect(U).toContain('c.more()');
  });
});

describe('束の分かれ方：新しい画面の束は本体のモジュールを読まない（型だけ）。関数は p1/uxt.ts から渡す', () => {
  it('本体のモジュールは型だけ・T.x はすべて uxtDeps にある', () => {
    for (const f of T_FILES) {
      const code = src(`uix/screens/${f}`);
      for (const m of code.matchAll(/^import (type )?[^;]*? from '([^']+)';/gms)) {
        const outside = /^\.\.\/\.\.\//.test(m[2]);
        if (outside && !m[1]) expect(m[2], `${f}: ${m[0].slice(0, 60)}`).toBe('../../../i18n');
      }
      for (const m of code.matchAll(/\bT\.([A-Za-z_]\w*)/g)) expect(Object.keys(uxtDeps), `${f}: T.${m[1]}`).toContain(m[1]);
    }
  });
  it('p1/uxt.ts は CSS を持つモジュール（headtalkui.ts ほか）を読まない・名前空間ごと束ねない', () => {
    const U = src('p1/uxt.ts');
    expect(U).not.toMatch(/import \* as/);
    for (const m of U.matchAll(/^import (?!type )[^;]*? from '\.\/([^']+)';/gm)) {
      const f = src(`p1/${m[1]}.ts`);
      expect(f, m[1]).not.toMatch(/^import '\.\/[^']+\.css';/m);
    }
  });
});

describe('見た目の決まり：新しい CSS は html.is-uxc の内側・接頭辞 uxt-・角は丸めない・16px から・層を残さない', () => {
  it('t-talk.css', () => {
    const css = noComment(src('uix/screens/t-talk.css'));
    const flat = css.replace(/@(media|supports)[^{]*\{/g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    for (const m of flat.matchAll(/(^|\})\s*([^{}@]+)\{/g)) for (const sel of m[2].split(',')) if (sel.trim()) expect(sel.trim()).toMatch(/^html\.is-uxc[ .:]/);
    expect(css).not.toMatch(/border-radius\s*:\s*[1-9.]/);
    expect(css).not.toMatch(/backdrop-filter/);
    expect(css).not.toMatch(/filter\s*:\s*(blur|drop-shadow)/);
    for (const m of css.matchAll(/font-size:\s*([\d.]+)(px|rem)/g)) expect(Number(m[1]) * (m[2] === 'rem' ? 16 : 1), m[0]).toBeGreaterThanOrEqual(16);
    for (const m of css.matchAll(/@keyframes\s+([\w-]+)/g)) expect(m[1]).toMatch(/^uxt-/);
    for (const m of css.matchAll(/\.(ux[a-z]-[\w-]+)/g)) expect(m[1]).toMatch(/^(uxt|uxp|uxh)-/);
    expect(css).not.toMatch(/\b(forwards|both)\b/);
    expect(css).not.toMatch(/will-change/);
  });
  it('動きを減らす：入る動き・判の写し・1 字ずつは出さない（isCalm で分かれる）', () => {
    const U = src('uix/screens/t-talk.ts');
    expect(U).toContain("if (fresh && !isCalm()) parts.slice(1).forEach");
    expect(U).toContain('if (!g || isCalm()) return;');
    expect(U).toContain("${fresh && !isCalm() ? '.is-fresh' : ''}");
    // 同じ場面の描き直しは、喋り直さない（すぐ全部）
    expect(U).toContain('bubble.skip();');
  });
  it('主役：承認のレバー（前の層）と、推奨の選択肢は主のキー', () => {
    const U = src('uix/screens/t-talk.ts');
    expect(U).toContain("uxKey(t('つぎへ', 'Next'), () => c.more(), { kind: 'main'");
    expect(U).toContain("rec ? 'main' : ''");
  });
});

describe('出す中身：今の画面と同じ計算', () => {
  const st = () => {
    const s = newP1(3);
    s.tut = 99;
    return s;
  };
  it('はじめ（数字の札・カリスマ・部長が回している業務）', () => {
    const s = st();
    const v = htSummary(s, 'hr', 'head');
    expect(v.heroes).toBe(s.staff.length);
    expect(v.idle).toBe(s.staff.filter((x) => x.task == null && !x.heads?.length).length);
    expect(v.avg).toBe(moraleAvg(s) ?? null);
    expect(v.quit).toBe(wantsToQuit(s).length);
    expect(v.pay).toBe(payroll(s));
    expect(v.cands).toBe(s.hirePool.length);
    expect(v.charisma).toBe(charismaLine(s));
    expect(v.duties?.length).toBe(DEPT_DUTIES.hr.length);
    expect(htSummary(s, 'hr', 'mine').heads).not.toBeNull();
  });
  it('組織のこと（部門の行・気にかけたい人は 5 人まで）・採用の状況・任せ方', () => {
    const s = st();
    const o = htOrg(s);
    expect(o.depts.map((d) => d.dept)).toEqual(orgChart(s).depts.map((d) => d.dept));
    expect(o.people.length).toBeLessThanOrEqual(5);
    const h = htHire(s, null, -1);
    expect(h.offer).toBeNull();
    expect(h.pool.map((x) => x.hero)).toEqual(s.hirePool);
    if (s.staff[0]) expect(htDeleg(s, 'hr', s.staff[0].hero).duties.length).toBe(DEPT_DUTIES.hr.length);
  });
  it('確認事項 1 件（部長の提案）：理由・見込み・費用', () => {
    const s = st();
    const hero = s.staff[0]?.hero ?? 1;
    const p = { id: 5, dept: 'hr', hero, month: 1, act: { k: 'hire', hero } as never, est: 10, err: 0.1, unit: 'units', cost: 500, status: 'new' } as never;
    const v = htItem(s, { k: 'prop', p });
    expect(v.k).toBe('prop');
    if (v.k === 'prop') {
      expect(v.cost).toBe(500);
      expect(v.money).toBe(s.money);
    }
  });
});

describe('せまい画面の小さいレバー（引く距離 40px・高さ 92px）', () => {
  it('土台のレバーは、引く距離を渡せる（既定は今と同じ 104px）', () => {
    let n = 0;
    const big = leverCore({ engage: () => n++ });
    big.down(0);
    big.move(60);
    expect(big.engaged).toBe(false);
    big.move(LEVER.travel);
    expect(big.pos).toBe(LEVER.travel);
    const small = leverCore({ engage: () => n++ }, () => false, 40);
    small.down(0);
    small.move(16);
    small.up();
    expect(small.engaged).toBe(false);
    const s2 = leverCore({ engage: () => n++ }, () => false, 40);
    s2.down(0);
    s2.move(40);
    expect(s2.engaged).toBe(true);
    expect(s2.pos).toBe(40);
    expect(n).toBe(2);
  });
  it('せまい札（幅 480px 未満）だけ、小さい形の class と引く距離を渡す。高さは CSS で 8＋36＋40＋8＝92px', () => {
    const U = src('uix/screens/t-talk.ts');
    expect(U).toContain('travel: small ? SMALL_TRAVEL : undefined,');
    expect(U).toContain("const small = body.clientWidth > 0 && body.clientWidth < SMALL_W;");
    const css = src('uix/screens/t-talk.css');
    expect(css).toContain('html.is-uxc #isl-ui .uxt-lever--s .ux-lever {\n  width: 88px;\n  height: 92px;');
    // 土台の CSS（ほかの画面のレバー）は変えていない
    expect(src('uix/parts.css')).toContain('  width: 108px;\n  height: 172px;');
  });
});
