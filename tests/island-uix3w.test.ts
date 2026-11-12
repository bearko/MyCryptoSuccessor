// 段 UIX3w：世界の場面（町の制覇・ランドマップと進出・発掘）の新しい画面（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md）。
// 入のときだけ新しい画面に分かれること・今の目印が残ること・出す中身が今の画面とそろうこと・主役のキーが前の層に出ること・
// 動きを減らすと全部すぐ出ること。
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uxsDeps } from '../src/island/p1/uxs';
import { uxwDeps } from '../src/island/p1/uxw';
import { FRONT_SEL } from '../src/island/uix/front';
import { CUT_CALM_MS, CUT_MS, CUT_OUT_MS, ROLL_MS, bare, barWait, cutCore, letterKind, nameParts, plainSay, rpDigits, sayParts } from '../src/island/uix/screens/conquer';
import { NAME_W, gapRate, goKind, nodeLook } from '../src/island/uix/screens/land';
import { uxw } from '../src/island/uix/screens/w-slots';

const src = (f: string) => readFileSync(new URL(`../src/island/${f}`, import.meta.url), 'utf8');
const MAIN = src('p1/main.ts');
const CQ = src('uix/screens/conquer.ts');
const LN = src('uix/screens/land.ts');
const LANDUI = src('p1/landui.ts');
const FILES = ['conquer.ts', 'land.ts', 'w-boot.ts', 'w-deps.ts', 'w-slots.ts'];
const CSS_FILES = ['conquer.css', 'land.css'];
const CSS = CSS_FILES.map((f) => [f, src(`uix/screens/${f}`).replace(/\/\*[\s\S]*?\*\//g, '')] as const);

afterEach(() => {
  for (const k of Object.keys(uxw)) delete (uxw as Record<string, unknown>)[k];
});

describe('切り替え：入のときだけ新しい画面に分かれる（切のときは今の画面のまま）', () => {
  it('差し込み口は、はじめは空。中身を入れるのは w-boot.ts（s-boot.ts の install から 1 行で呼ぶ）', () => {
    expect(Object.keys(uxw)).toEqual([]);
    expect(src('uix/screens/w-slots.ts').match(/^import (?!type )/gm)).toBeNull();
    expect(src('uix/screens/s-boot.ts')).toContain('installW(d.w);');
    expect(src('p1/uxs.ts')).toContain('w: uxwDeps,');
    expect(uxsDeps.w).toBe(uxwDeps);
    const boot = src('uix/screens/w-boot.ts');
    for (const k of ['letter', 'cheer', 'land', 'rankUp', 'sectorCard', 'deco']) expect(boot).toContain(`uxw.${k} = `);
    // 本体から新しい画面を直接読んでいる所は無い（読んでよいのは、空の差し込み口だけ）
    for (const f of ['p1/main.ts', 'p1/landui.ts', 'p1/digui.ts', 'p1/uxw.ts']) expect(src(f), f).not.toMatch(/from '\.\.\/uix\/screens\/(?!s-slots'|w-slots'|mhooks')/);
  });
  it('新しい画面の束は、本体のモジュールを自分では読まない（型だけ）。関数は p1/uxw.ts から渡す', () => {
    for (const f of FILES) {
      const code = src(`uix/screens/${f}`);
      for (const m of code.matchAll(/^import (type )?[^;]*? from '([^']+)';/gms)) {
        const outside = /^\.\.\/\.\.\//.test(m[2]);
        if (outside && !m[1]) expect(m[2], `${f}: ${m[0].slice(0, 60)}`).toBe('../../../i18n');
      }
      for (const m of code.matchAll(/\bW\.([A-Za-z_]\w*)/g)) expect(Object.keys(uxwDeps), `${f}: W.${m[1]}`).toContain(m[1]);
    }
  });
  it('新しい CSS は、すべて html.is-uxc の内側。class の接頭辞は uxw-。角は丸めない', () => {
    for (const [f, css] of CSS) {
      const flat = css.replace(/@(media|supports)[^{]*\{/g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
      for (const m of flat.matchAll(/(^|\})\s*([^{}@]+)\{/g)) for (const sel of m[2].split(',')) if (sel.trim()) expect(sel.trim(), f).toMatch(/^html\.is-uxc[ .:]/);
      expect(css, f).not.toMatch(/border-radius\s*:\s*[1-9.]/);
      expect(css, f).not.toMatch(/backdrop-filter/);
      // 字は 16px（1rem）以上
      for (const m of css.matchAll(/font-size:\s*([\d.]+)(px|rem)/g)) expect(Number(m[1]) * (m[2] === 'rem' ? 16 : 1), `${f}: ${m[0]}`).toBeGreaterThanOrEqual(16);
      for (const m of css.matchAll(/@keyframes\s+([\w-]+)/g)) expect(m[1], f).toMatch(/^uxw-/);
    }
  });
});

describe('町の制覇・研究成果の発表・調査依頼状', () => {
  it('入口：showLetter・clearModal・ランド制覇のお祝いが、差し込み口が入っているときだけ新しい画面へ渡す', () => {
    expect(MAIN).toContain('if (uxw.letter) {');
    expect(MAIN).toMatch(/if \(uxw\.cheer\) return uxw\.cheer\(\{ host: root, kind: 'clear'/);
    expect(MAIN).toMatch(/if \(uxw\.cheer\) uxw\.cheer\(\{ host: root, kind: 'land'/);
    // 切のときの窓（今の modal()）は、そのまま残っている
    expect(MAIN).toContain('modal(title, body, acts, true);');
    // 音は今のまま（入のとき、制覇は小太鼓 → 一撃 → 祝いの曲）
    expect(MAIN).toContain("if (conquered && uxOn()) uxSfx('conquest');");
  });
  it('出す中身が今の窓とそろう：依頼状の絵と名前・差出人・研究ポイント・制覇の 2 条件・ひと言・今の選択肢・今の花火', () => {
    for (const k of ['letterName:', 'letterIcon:', 'from:', 'rp,', 'conds:', 'say: presentAfter(', 'actions: acts', 'fx: () => letterFx(conquered)', 'town:']) expect(MAIN, k).toContain(k);
    for (const k of ['v.letterName', 'v.letterIcon', 'v.from', 'v.rp', 'v.conds', 'v.say', 'v.actions', 'v.fx()', 'v.town', 'v.hero']) expect(CQ, k).toContain(k);
    // 初めての制覇のお祝いへ続く流れ（then）は、今のまま選択肢に入っている
    expect(MAIN).toMatch(/const acts: UxwAct\[\] = letter === 'U'[^\n]*then\(\(\) => openLand\(ctx\)\)/);
  });
  it('今の目印：窓は .isl-modal.is-letter（開いているあいだ時間が止まる・ほかの案内が重ならない）', () => {
    expect(CQ).toContain('el(`div.isl-modal.ux-root.uxw-cq${cls}`)');
    expect(CQ).toContain("shell('.is-letter')");
    expect(MAIN).toContain("!!root.querySelector('.isl-modal')");
  });
  it('場面の種類：制覇（カットインあり）／調査依頼状／発表だけ', () => {
    expect(letterKind({ conquered: true, letter: 'U' })).toBe('conquest');
    expect(letterKind({ conquered: true, letter: null })).toBe('conquest');
    expect(letterKind({ conquered: false, letter: 'R' })).toBe('letter');
    expect(letterKind({ conquered: false, letter: null })).toBe('present');
  });
  it('カットインは、祝いの曲が始まる小節の頭に合わせる（先読みに間に合わなければ、次の小節）', () => {
    const beat = 60000 / 116;
    expect(barWait(null)).toBe(ROLL_MS);
    expect(barWait({ beat: 0, frac: 0 })).toBe(Math.round(beat * 4));
    expect(barWait({ beat: 2, frac: 0.5 })).toBe(Math.round(beat * 1.5));
    // 小節の頭まで 0.5 秒を切っていたら、もう 1 小節待つ
    expect(barWait({ beat: 3, frac: 0.5 })).toBe(Math.round(beat * 4.5));
    // 待ちは、長くても 2 小節半（約 2.6 秒）まで
    for (let b = 0; b < 4; b++) for (let f = 0; f < 1; f += 0.1) expect(barWait({ beat: b, frac: f })).toBeLessThanOrEqual(Math.round(beat * 5));
    // 決めの演出は 2〜3 秒（見本の値）
    expect([CUT_MS, CUT_CALM_MS, CUT_OUT_MS]).toEqual([2600, 1800, 220]);
  });
  it('場面の進み：判定 → カットイン → 札。押すと、どの段からでも札へ飛ぶ。札は 1 回だけ', () => {
    const log: string[] = [];
    const ev = { pre: () => log.push('pre'), cut: () => log.push('cut'), card: () => log.push('card') };
    const a = cutCore('conquest', ev);
    a.start();
    a.end(); // まだ判定の途中：何も起きない
    a.bar();
    a.bar();
    a.end();
    a.skip();
    a.end();
    expect(log).toEqual(['pre', 'cut', 'card']);
    log.length = 0;
    const b = cutCore('conquest', ev);
    b.start();
    b.skip();
    b.bar();
    b.end();
    expect(log).toEqual(['pre', 'card']);
    log.length = 0;
    const c = cutCore('conquest', ev);
    c.start();
    c.bar();
    c.skip();
    expect(log).toEqual(['pre', 'cut', 'card']);
    // 制覇でない発表は、はじめから札
    log.length = 0;
    cutCore('letter', ev).start();
    cutCore('present', ev).start();
    expect(log).toEqual(['card', 'card']);
  });
  it('文：絵文字は外す（✔ は言葉に）。[[ ]] の強調は、1 字ずつ出すあいだは外し、出しきったら色で付ける', () => {
    expect(bare('👑 研究成果を発表して制覇！')).toBe('研究成果を発表して制覇！');
    expect(bare('2 か月続けて 1 位 ✔')).toMatch(/^2 か月続けて 1 位 (済|done)$/);
    expect(plainSay('[[制覇]]おめでとう！')).toBe('制覇おめでとう！');
    expect(sayParts('[[制覇]]おめでとう！ [[関所]]へ')).toEqual([
      ['制覇', true],
      ['おめでとう！ ', false],
      ['関所', true],
      ['へ', false],
    ]);
    expect(nameParts('Uncommon の調査依頼状')).toEqual(['Uncommon', 'の調査依頼状']);
    expect(nameParts('調査依頼状')).toEqual(['調査依頼状']);
    expect([rpDigits(5), rpDigits(120), rpDigits(12345)]).toEqual([2, 3, 5]);
  });
  it('主役のキーは 1 つだけ主のキー（前の層に出る）。押すと、窓を閉じてから今の動き。続く click は呑む', () => {
    expect(FRONT_SEL).toContain('.ux-key--main');
    expect(CQ).toContain("k === main ? { kind: 'main', big: true, strong: true } : {}");
    expect(CQ).toMatch(/safe\(\(\) => \{\s*close\(\);\s*fn\(\);\s*\}\)/);
    const spy = vi.fn();
    uxw.letter = spy;
    expect(spy).not.toHaveBeenCalled();
  });
  it('動きを減らす：判定のランプは全部点き、火花と揺れは出さず、数字とひと言はすぐ出る（部品の決まり）', () => {
    expect(CQ).toContain('if (!isCalm()) {');
    expect(CQ).toContain('isCalm() ? CUT_CALM_MS : CUT_MS');
    expect(CQ).toContain('if (cut.isConnected && !isCalm())');
    expect(CQ).toMatch(/if \(isCalm\(\)\) \{\s*lamps\.forEach\(\(l\) => l\.classList\.add\('is-on'\)\);/);
  });
  it('音：見本と同じ（制覇の音は本体が鳴らす）。札・ランプ・数え上げ・飛ばす・閉じる', () => {
    for (const k of ["uxSfx('flap')", "uxSfx('lamp', { step: i })", "uxSfx('coin')", "uxSfx('close')", "uxSfx('rankup')", "'open' : 'clunk'"]) expect(CQ, k).toContain(k);
    expect(CQ).toContain('barWait(uxMusic())');
  });
});

describe('ランドマップ（航路図）・進出', () => {
  it('入口：openLand・openRankUp・openSectorCard が、差し込み口が入っているときだけ新しい画面へ渡す。地図の上の札は今の要素を着せ替える', () => {
    expect(LANDUI).toContain('if (uxw.land) return uxw.land(ctx);');
    expect(LANDUI).toContain('if (uxw.rankUp) return uxw.rankUp(ctx, target);');
    expect(MAIN).toContain('if (uxw.sectorCard) {');
    expect(MAIN.match(/uxw\.deco\?\.\(el, 'badge'\)/g)?.length).toBe(3);
    expect(MAIN).toContain("uxw.deco?.(body, 'pop');");
    const ctx = {} as never;
    const land = vi.fn();
    const rank = vi.fn();
    uxw.land = land;
    uxw.rankUp = rank;
    return import('../src/island/p1/landui').then((m) => {
      m.openLand(ctx);
      m.openRankUp(ctx, 'r1');
      expect(land).toHaveBeenCalledWith(ctx);
      expect(rank).toHaveBeenCalledWith(ctx, 'r1');
    });
  });
  it('器は今の札（open()）。曲はセクタ選択。今の目印（となりの町の窓の .isl-sectm と data-sector）が残る', () => {
    expect(LN).toMatch(/W\.open\(\s*ctx,\s*t\('ランドマップ', 'Land map'\)/);
    expect(LN).toContain("sceneOff ??= uxScene('sector');");
    expect(LN).toContain("el('div.isl-modal.isl-sectm.ux-root.uxw-sc')");
    expect(LN).toContain('m.dataset.sector = v.id;');
  });
  it('札の見分け：状態ごとに絵と言葉がある（色だけにしない）。行ける所だけ「行ける」', () => {
    const all = (['here', 'mine', 'open', 'soon', 'locked', 'cloud'] as const).map((st) => nodeLook(st));
    expect(new Set(all.map((x) => x.word)).size).toBe(6);
    expect(all.filter((x) => x.ico).length).toBe(5);
    expect(all.map((x) => x.can)).toEqual([false, true, true, false, false, false]);
    // 調査依頼状が無い町は、開いていても行けない（手紙の絵）
    expect(nodeLook('open', true)).toMatchObject({ ico: 'mail', can: false });
    for (const k of ['C', 'U', 'R', 'E', 'L']) expect(NAME_W[k]).toBeGreaterThan(20);
  });
  it('進出の決め方：今の画面と同じ分かれ方（いまここ・移動・出店・足りない・ランクアップ・依頼状・開放前・準備中・雲）', () => {
    const o = { noLetter: false, rankUp: false, fee: 100, money: 500 };
    expect(goKind('here', o)).toBe('here');
    expect(goKind('mine', o)).toBe('go');
    expect(goKind('open', o)).toBe('move');
    expect(goKind('open', { ...o, money: 99 })).toBe('short');
    expect(goKind('open', { ...o, rankUp: true, money: 0 })).toBe('rankup');
    expect(goKind('open', { ...o, noLetter: true, rankUp: true })).toBe('letter');
    expect([goKind('locked', o), goKind('soon', o), goKind('cloud', o)]).toEqual(['locked', 'soon', 'cloud']);
    expect([gapRate(50, 200), gapRate(300, 200), gapRate(0, 0), gapRate(-5, 10)]).toEqual([0.25, 1, 1, 0]);
  });
  it('出す中身が今の画面とそろう（主な言葉と操作）', () => {
    for (const k of [
      'いまいるランドの全体図。',
      '雲に覆われていて、まだ移動できない。',
      '目標：2 か月続けてエリア 1 位＋研究成果の発表',
      '研究成果の発表：まだ（このセクタのお題をそろえよう）',
      'いまこのセクタを経営しています。',
      'いまのセクタは、セクター長に任せます（次に選びます）。',
      'このセクタへ移動する',
      '開放されました！ このセクタの遊びは準備中です。',
      'セクタごとの先月の売上',
      '失うもの',
      '残るもの',
      'すべてのセクタの建物（お店・工房・倉庫・展示館など。中の在庫・素材も）',
      'ダンジョンの最深記録・研究への寄付の回数',
      '寄付パネルを開く',
      'まだやめておく',
      'ランドのふちの関所を開くと、ほかのランドセクタへ行けるようになります。',
    ]) {
      expect(LANDUI, k).toContain(k);
      expect(LN, k).toContain(k);
    }
    // 操作：出店（レバー）・移動・ランクアップの確かめ・セクター長と復興の箱（今の要素）・寄付パネル・戻る
    for (const k of ['W.startMove(ctx, id)', 'W.startMove(ctx, target)', 'openRankUpUx(ctx, id)', 'W.managerBox(ctx, s, id)', 'W.reviveBox(ctx, s, id)', "ctx.skills?.('dig_donate')", 'W.openLand(ctx)', 'W.letterLockOf(s, id)', 'W.needText(s, d)', 'W.TIER_NOTE[d.tier]', 'W.sectorBars(', 'W.antiquesHeld(s, d.tier)', 'W.grantOf(d.tier)', 'W.DONATE_LINE()', 'W.clearCondText(']) expect(LN, k).toContain(k);
    // となりの町の窓：他社の数・需要の多い商品・入国料・理由
    for (const k of ['v.rivals', 'v.hot', 'v.fee', 'v.why', 'v.go()']) expect(LN, k).toContain(k);
  });
  it('決める所の手応え：入国料を払う進出・ランクが上がる進出はレバー。足りないときは「あと N G」と目盛り（責めない）', () => {
    expect(LN.match(/leverBox\(\{/g)?.length).toBe(3);
    expect(LN).toContain('uxLever({ label: o.label, aria: o.what, cap: o.cap, doneText: o.done, onDone:');
    expect(LN).toContain('売上がたまれば届きます。');
    expect(LN).toContain("gapBox(t('出店許可申請', 'Permit'), d.fee, s.money)");
    expect(LN).toContain("gapBox(t('入国料', 'Permit'), v.fee, v.money)");
    // 主役は、レバーか主のキーの 1 つ（どちらも前の層に出る）
    expect(FRONT_SEL).toContain('.ux-lever');
    expect(LN.match(/kind: 'main'/g)?.length).toBe(4);
  });
  it('絵文字は使わない：今の要素の中の絵文字は、ドットの絵に替える', () => {
    expect(LN).toContain('export function swapEmoji(');
    expect(LN).toContain("swapEmoji(box, '#ffb81f');");
    const strip = LN.replace(/const EMOJI_ICO[^\n]*\n/, '');
    expect(strip).not.toMatch(/\p{Extended_Pictographic}/u);
    // 制覇の画面：絵文字は、外すための決まり（bare）の中にしか無い
    expect(CQ.replace(/\n\s*\.replace\([^\n]*/g, '').replace(/✔/g, '')).not.toMatch(/\p{Extended_Pictographic}/u);
  });
  it('動きを減らす：目盛りはすぐ出て、レバーのあとの待ちは無い', () => {
    expect(LN).toContain('if (isCalm()) m.set(gapRate(have, need));');
    expect(LN).toContain('later(isCalm() ? 0 : 260, safe(o.go))');
  });
});
