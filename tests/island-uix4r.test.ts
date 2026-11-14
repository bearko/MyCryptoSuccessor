// 段 UIX4r：残りの画面（セクター長の箱・復興の箱・復興を任せる・建築の札・ミッションの一覧・設定）と、下の帯のタブ・速さのキーの強調（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：残りの画面」）。
// 入のときだけ新しい画面に分かれること・今の目印が残ること・出す中身が今の画面とそろうこと・主役のキーが前の層に出ること・動きを減らすと全部すぐ出ること。
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { uxrDeps } from '../src/island/p1/uxr';
import { uxsDeps } from '../src/island/p1/uxs';
import { BUILD_CATS } from '../src/island/p1/data';
import { UX_ICONS } from '../src/island/uix/icons';
import { uxr } from '../src/island/uix/screens/r-slots';
import { H_ICONS } from '../src/island/uix/screens/h-icons';
import { K_ICONS } from '../src/island/uix/screens/k-icons';
import { S_ICONS } from '../src/island/uix/screens/s-icons';
import { W_ICONS } from '../src/island/uix/screens/w-icons';
import { GUIDE_SEL } from '../src/island/uix/screens/c-dress';
import { TAB_GUIDE } from '../src/island/uix/screens/r-boot';
import { CAT_ICO } from '../src/island/uix/screens/build';
import { bestFund } from '../src/island/uix/screens/sector';
import { mainMission } from '../src/island/uix/screens/mission';

const src = (f: string) => readFileSync(new URL(`../src/island/${f}`, import.meta.url), 'utf8');
const R_FILES = ['r-boot.ts', 'r-deps.ts', 'r-slots.ts', 'sector.ts', 'mission.ts', 'build.ts', 'sys.ts'];
const noComment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const ALL_ICONS = new Set([...UX_ICONS, ...K_ICONS, ...S_ICONS, ...W_ICONS, ...H_ICONS]);
const MAIN = src('p1/main.ts');
const LAND = src('p1/landui.ts');

afterEach(() => {
  for (const k of Object.keys(uxr)) delete (uxr as Record<string, unknown>)[k];
});

describe('切り替え：入のときだけ新しい画面に分かれる（切のときは今の画面のまま）', () => {
  it('差し込み口は、はじめは空。入れ物は uix/hooks.ts・中身を入れるのは r-boot.ts（s-boot.ts の install から 1 行で呼ぶ）', () => {
    expect(Object.keys(uxr)).toEqual([]);
    expect(src('uix/screens/r-slots.ts').match(/^import (?!type )/gm)).toBeNull();
    expect(src('uix/screens/r-slots.ts')).toContain("export { uxrSlots as uxr } from '../hooks';");
    expect(src('uix/hooks.ts')).toContain('export const uxrSlots: UxrScreens = {};');
    expect(src('uix/screens/s-boot.ts')).toContain('installR(d.r);');
    expect(src('p1/uxs.ts')).toContain('r: uxrDeps,');
    expect(uxsDeps.r).toBe(uxrDeps);
  });
  it('本体の入口は、関数の頭の分かれ道だけ（切のときの作りは今のまま）', () => {
    expect(LAND).toMatch(/export function reviveBox\(ctx: Ctx, s: P1State, id: string\): HTMLElement \{\n[^\n]*\n  if \(uxr\.reviveBox\) return uxr\.reviveBox\(ctx, s, id\);\n  const rv = reviveView/);
    expect(LAND).toMatch(/export function openDelegate\(ctx: Ctx, id: string, hero0\?: number\) \{\n  if \(uxr\.delegate\) return uxr\.delegate\(ctx, id, hero0\);\n  const d = sectorDef\(id\);/);
    expect(LAND).toMatch(/export function managerBox\(ctx: Ctx, s: P1State, id: string\): HTMLElement \{\n  if \(uxr\.managerBox\) return uxr\.managerBox\(ctx, s, id\);\n  const rec = recOf/);
    expect(src('p1/screens.ts')).toMatch(/export function openMissions\(ctx: Ctx\) \{\n[^\n]*\n  if \(uxr\.missions\) return uxr\.missions\(ctx\);\n  open\(ctx, t\('依頼（ミッション）'/);
    expect(MAIN).toMatch(/function openSettings\(\) \{\n[^\n]*\n  if \(uxr\.settings\) return openSettingsUx\(\);\n  sysSheet\(/);
    // 建築の札：器（openSheet）・チュートリアルの一言（mineTip）は今のまま。分かれ道は器の中
    expect(MAIN).toMatch(/mineTip\(ctx, 'build', body\);\n[\s\S]{0,1600}if \(uxr\.build\) \{/);
    // 任せる画面（UIX3d の deleg.ts）のセクター長の節・ランドマップ（UIX3w の land.ts）の箱
    expect(src('uix/screens/deleg.ts')).toContain('if (uxr.sectorHeads) {\n    body.append(uxr.sectorHeads(s));\n    return;\n  }');
    expect(src('uix/screens/land.ts')).toContain('box.append(mb.dataset.uxr ? mb : legacyBox(mb));');
    const boot = src('uix/screens/r-boot.ts');
    for (const k of ['managerBox', 'reviveBox', 'delegate', 'sectorHeads', 'missions', 'build', 'settings']) expect(boot, k).toMatch(new RegExp(`uxr\\.${k} = \\w+;`));
  });
  it('建築の札の押した先は、切のときと同じ関数（pickCard。切のときの札も同じ関数を呼ぶ）', () => {
    expect(MAIN).toContain("c.addEventListener('click', () => pickCard(id));");
    expect(MAIN).toMatch(/guide: guideId === id, pick: \(\) => pickCard\(id\)/);
    // 設定：入のときの欄（文字の大きさ ほか）は、このあとに今のまま足す
    expect(MAIN).toMatch(/uxr\.settings!\(body, \{[\s\S]*\}\);\n    ux\.settings\?\.\(body\);/);
  });
  it('新しい画面の束は、本体のモジュールを自分では読まない（型だけ）。関数は p1/uxr.ts から渡す', () => {
    for (const f of R_FILES) {
      const code = src(`uix/screens/${f}`);
      for (const m of code.matchAll(/^import (type )?[^;]*? from '([^']+)';/gms)) {
        const outside = /^\.\.\/\.\.\//.test(m[2]);
        if (outside && !m[1]) expect(m[2], `${f}: ${m[0].slice(0, 60)}`).toBe('../../../i18n');
      }
      for (const m of code.matchAll(/\bR\.([A-Za-z_]\w*)/g)) expect(Object.keys(uxrDeps), `${f}: R.${m[1]}`).toContain(m[1]);
    }
    // 本体の束を名前空間ごと渡さない（本番の束の分かれ方が変わる）
    expect(src('p1/uxr.ts')).not.toMatch(/^import \* as/m);
  });
  it('新しい CSS は、すべて html.is-uxc の内側。class の接頭辞は uxr-。角は丸めない・字は 16px 以上・ぼかさない・層を残さない', () => {
    const css = noComment(src('uix/screens/r-screens.css'));
    const flat = css.replace(/@(media|supports)[^{]*\{/g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').replace(/:is\([^)]*\)/g, ':is()');
    for (const m of flat.matchAll(/(^|\})\s*([^{}@]+)\{/g)) for (const sel of m[2].split(',')) if (sel.trim()) expect(sel.trim()).toMatch(/^html\.is-uxc[ .:]/);
    expect(css).not.toMatch(/border-radius\s*:\s*[1-9.]/);
    expect(css).not.toMatch(/backdrop-filter/);
    expect(css).not.toMatch(/filter\s*:\s*(blur|drop-shadow)/);
    for (const m of css.matchAll(/font-size:\s*([\d.]+)(px|rem)/g)) expect(Number(m[1]) * (m[2] === 'rem' ? 16 : 1), m[0]).toBeGreaterThanOrEqual(16);
    for (const m of css.matchAll(/@keyframes\s+([\w-]+)/g)) expect(m[1]).toMatch(/^uxr-/);
    // 自分の class は uxr-。ほかは画面の部品（uxp-）と、強調をそろえる上の帯（uxm-）だけ
    for (const m of css.matchAll(/\.(ux[a-z]-[\w-]+)/g)) expect(m[1]).toMatch(/^(uxr|uxp|uxm)-/);
    expect(css).not.toMatch(/\b(forwards|both)\b/);
    expect(css).not.toMatch(/will-change/);
    // 押せる所は 44px 以上
    for (const m of css.matchAll(/min-height:\s*(\d+)px/g)) if (/key|bcat|seg|on\b/.test(css.slice(Math.max(0, m.index! - 200), m.index!))) expect(Number(m[1])).toBeGreaterThanOrEqual(44);
    // 動きを減らす：この段の入る動きは、全部止める
    expect(css).toMatch(/html\.is-uxc\.is-calm #isl-ui :is\(\.uxr-box, \.uxr-del > \*, \.isl-bcard\.uxr-bcard, \.uxr-bcat, \.uxr-mi-card, \.uxr-set-row > \*\) \{ animation: none; \}/);
  });
  it('絵文字を出さない（この段の画面のコードに、絵文字の字を書かない）', () => {
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
    for (const f of R_FILES) expect(src(`uix/screens/${f}`), f).not.toMatch(emoji);
  });
  it('使う絵は、どれも描ける名前（知らない名前は空の四角になる）', () => {
    for (const f of ['sector.ts', 'mission.ts', 'build.ts', 'sys.ts'])
      for (const m of src(`uix/screens/${f}`).matchAll(/hIcon\('([\w-]+)'/g)) expect(ALL_ICONS, `${f}: ${m[1]}`).toContain(m[1]);
    for (const m of src('p1/main.ts').matchAll(/title: t\('[^']+', '[^']+'\),\n\s+ico: '([\w-]+)'/g)) expect(ALL_ICONS, m[1]).toContain(m[1]);
    for (const c of BUILD_CATS) expect(ALL_ICONS, c.id).toContain(CAT_ICO[c.id]);
  });
});

describe('セクター長の箱・復興の箱・復興を任せる', () => {
  const S = src('uix/screens/sector.ts');
  it('今の目印：箱は .isl-land-mgr（復興は .isl-revive-box）・ランドマップが着せ替えの板に入れない印 data-uxr', () => {
    expect(S).toContain("el('div.uxr-box.uxr-mgr.isl-land-mgr', { 'data-uxr': 'mgr' })");
    expect(S).toContain("el('div.uxr-box.uxr-revive.isl-land-mgr.isl-revive-box', { 'data-uxr': 'revive' })");
  });
  it('出す中身が今の箱とそろう：担当・売上の目安・不在・離れたときの売上と投資・先月の 4 つの数字・月ごとの結果・投資の割合', () => {
    for (const x of ["t('売上の目安', 'Sales')", "t('セクター長が不在'", "t('離れたときの月の売上'", "t('投資の合計'", "t('先月の売上'", "t('利益'", "t('このセクタへ投資'", "t('本社へ'", "t('セクター長の月ごとの結果'", 'R.MANAGER.choices', 'R.MANAGER.roi', "t('離れる前に月の締めが無かったので"]) expect(S).toContain(x);
    // 替える：今と同じ関数（setSectorHead）を同じ引数で
    expect(S).toContain('if (R.setSectorHead(s, id, hero)) ctx.toast(');
  });
  it('復興：進み（直した数 / 全部）・支援金の残り・使った額・担当・尽きた・説明 3 つ・主のキー（今と同じ字）', () => {
    for (const x of ["t('支援金の残り'", "t('使った額'", "t('支援金が尽きた'", "t('担当なし'", 'R.revivePerMonth(st.stats)', 'R.RESET.delegate.costMul', "t('ヒーローに復興支援金を送ると", "t('お題と出土品は手で掘ろう", "t('支援金を送る・担当を替える'", "t('復興を任せる'"]) expect(S).toContain(x);
    expect(S).toMatch(/uxKey\(keyLabel\('hammer', label\), \(\) => R\.openDelegate\(ctx, id\), \{ kind: 'main'/);
  });
  it('復興を任せる：担当（1 か月に N 軒・伸びる）・ヒーローを選ぶ（選ぶ引き出し）・支援金 3 つ（N 軒ぶんの見込み・足りなければ「あと N G」）・送ると今と同じ関数', () => {
    for (const x of ["t('ヒーローを選ぶ'", 'R.pickHero(ctx.root, s, {', "task: 'manager'", "t('復興の担当は、毎月 能力値が大きく伸びる", 'R.fundsOf(d.tier)', "t(`${a.n} 軒ぶんの見込み`", 'uxpGap(s.money, a.v)', 'R.delegate(s, id, hero, a.v)', 'R.openLand(ctx);', 'ctx.delegated?.(id);', "t('自動でやってくれるのは"]) expect(S).toContain(x);
    // 足りないときは責めない（押すと目盛りが進む）
    expect(S).toMatch(/if \(a\.e === 'money' \|\| s\.money < a\.v\) \{\n\s+gap\.nudge\(\);/);
  });
  it('主のキーにする額：直しきれるいちばん安い払える額 → 無ければ払えるいちばん大きい額 → 払えなければ無し', () => {
    const A = (e1: string | null, e2: string | null, e3: string | null) => [
      { v: 20000, n: 1, e: e1 },
      { v: 50000, n: 3, e: e2 },
      { v: 120000, n: 5, e: e3 },
    ];
    expect(bestFund(A(null, null, null), 40000, 5)?.v).toBe(50000);
    expect(bestFund(A(null, null, null), 0, 2)?.v).toBe(20000);
    expect(bestFund(A(null, null, 'money'), 200000, 9)?.v).toBe(50000);
    expect(bestFund(A('money', 'money', 'money'), 1000, 1)).toBeNull();
  });
  it('任せる画面のセクター長の節：今の 1 行と同じ中身（町・担当・先月の利益・自分で承認した数と投資）・条件の一言', () => {
    for (const x of ["t('セクター長（セクタを任せる）'", "t('先月の利益'", "t(`部長の提案 ${hd.n} 件を自分で承認", "t(`新しく任命する条件", "t('ほかのセクタに出店して離れるときに", "t('セクター長のいるセクタは任せきり"]) expect(S).toContain(x);
  });
  it('動きを減らす：計器は、はじめから今の値', () => {
    expect(S).toContain("uxMeter(isCalm() ? rv.fixed / Math.max(1, rv.all) : 0");
    expect(S).toMatch(/if \(isCalm\(\)\) go\(\);\n\s+else setTimeout\(go, 360\);/);
  });
});

describe('建築の札', () => {
  const B = src('uix/screens/build.ts');
  it('今の目印：建物は .isl-bcard（is-guide・is-poor・is-off・is-secret）・並びは .isl-bgrid。押す順は今と同じ（札を 1 回押す）', () => {
    expect(B).toContain("button.isl-bcard.uxr-bcard${c.secret ? '.is-secret' : ''}${poor ? '.is-poor' : ''}${off ? '.is-off' : ''}${c.guide ? '.is-guide.ux-front' : ''}");
    expect(B).toContain("el('div.isl-bgrid.uxr-bgrid'");
    expect(B).toContain('press(card, () => c.pick());');
    // 光る枠（c-dress.ts）は、札の中の .isl-bcard.is-guide を指す（今と同じ）
    expect(GUIDE_SEL).toContain('.isl-sheet .isl-bcard.is-guide');
  });
  it('出す中身が今の札とそろう：種類（名前・N/M・錠・開いたばかり）・建物（絵・名前・値段／建設済み／条件・種類の一言・工期と維持費・あと N G）・？の札', () => {
    for (const x of ['c.known}/${c.total}', 'c.isNew', "c.err === 'limit'", "c.err === 'locked'", 'uxpPrice(c.costN)', 'c.note', 'c.spec', 'uxpGap(money, c.costN)', "'???'", 'c.hint', 'v.lotNote', 'v.emptyNote']) expect(B).toContain(x);
    for (const x of ["t(`工期 ${b.days} 日・維持費 ${money(b.upkeep)}/月`", 'secretHint(id)', 'lockNote(id)', "t('建設済み', 'Built')", 'kindNote(b)']) expect(MAIN).toContain(x);
  });
  it('主役：チュートリアルで押す札だけが前の層（ux-front）', () => {
    expect(B).toContain("c.guide ? '.is-guide.ux-front' : ''");
  });
});

describe('ミッションの一覧', () => {
  const M = src('uix/screens/mission.ts');
  it('出す中身が今の一覧とそろう：説明・受けている依頼・届いている依頼・差出人・題・中身・進み・報酬・気をつけること・受け取った数', () => {
    for (const x of ["t('受けている依頼'", "t('届いている依頼'", "t('いまは新しい依頼がありません。'", 'm.from', 'm.title', 'm.text', 'R.missionProgress(s, m.id)', 'R.rewardText(m)', 'm.note && !st', "t('報酬を受け取った依頼'", "t('進行中', 'In progress')"]) expect(M).toContain(x);
    expect(M).toContain("cls: `uxr-mi-card isl-mission${st === 'done' ? ' is-done' : ''}${st === 'accepted' ? ' is-on' : ''}`");
  });
  it('押した先は今と同じ関数・同じお知らせ（受ける・受け取る・上限・もう達成）', () => {
    for (const x of ['R.claim(s, m.id)', 'R.accept(s, m.id)', "e === 'full'", "ctx.sfx?.('mission')", "t('もう達成しているね！ 報酬を受け取ろう'", "t(`「${m.title}」を受けました。右上のミッションに出ます`"]) expect(M).toContain(x);
  });
  it('主役のキー：受け取れる報酬 → 無ければ受けられる最初の依頼（上限のときは無し）', () => {
    expect(mainMission(['a', 'b'], ['c'], (m) => m === 'b', 3)).toBe('b');
    expect(mainMission(['a'], ['c', 'd'], () => false, 3)).toBe('c');
    expect(mainMission(['a', 'b', 'e'], ['c'], () => false, 3)).toBeUndefined();
  });
});

describe('設定', () => {
  it('今のキーの列と同じ項目・同じ押した先（言語・案内・音量と消音・街の人通り・演出・チュートリアルを終える。段 UIX5a で「新しい画面」の切り替えは外した）', () => {
    const body = MAIN.slice(MAIN.indexOf('function openSettingsUx()'), MAIN.indexOf('/** 進行速度'));
    for (const x of ["setLang(x === 'en' ? 'en' : 'ja')", 'localStorage.setItem(GUIDE', 'uxSetVol({ bgm: n })', 'uxSetVol({ se: n })', 'uxSetVol({ mute: x })', 'localStorage.setItem(CROWD_KEY', 'setFxLevel(next)', 'tutOf(s) < TUT_DONE', 's.tut = TUT_DONE;']) expect(body).toContain(x);
    expect(body).not.toContain('setUx(');
    // 器は今の札（openSheet）。入のときの欄はこのあと
    expect(body).toContain("openSheet(ctx, t('設定', 'Settings'), (body) => {");
  });
  it('見本の手触り：入り切りはスイッチ（role=switch）・音量はつまみ（role=slider）・選ぶ物は琥珀の点くキー', () => {
    const Y = src('uix/screens/sys.ts');
    expect(Y).toContain('uxToggle({ label: r.label');
    expect(Y).toContain('uxFader({ min: 0, max: r.max');
    expect(Y).toContain("b.style.setProperty('--ux-lit', 'var(--ux-amber)');");
  });
});

describe('下の帯のタブ・サブタブ・速さのキーの強調：光る枠にそろえる', () => {
  it('光る枠の相手の一覧のうしろに足す（札・吹き出しの中の相手が先）・帯の側のかぎとまたたく縁は止める', () => {
    expect(TAB_GUIDE).toEqual(['.uxm-hud .isl-speed .isl-btn.is-guide', '.uxm-hud .isl-speed.is-guide', '.isl-sub.is-guide', '.isl-tab.is-guide']);
    expect(src('uix/screens/r-boot.ts')).toContain('for (const sel of TAB_GUIDE) if (!GUIDE_SEL.includes(sel)) GUIDE_SEL.push(sel);');
    const css = src('uix/screens/r-screens.css');
    expect(css).toContain('html.is-uxc.uxr-tg #isl-ui.uxm-on .isl-tab.is-guide::before,\nhtml.is-uxc.uxr-tg #isl-ui.uxm-on .uxm-hud .isl-speed.is-guide::before {\n  content: none;');
    expect(css).toContain('html.is-uxc.uxr-tg #isl-ui.uxm-on .isl-sub.is-guide {\n  outline: 0;');
    // 切のとき（r-boot を読まない）は、光る枠の相手は今のまま
    expect(GUIDE_SEL.some((x) => TAB_GUIDE.includes(x))).toBe(false);
  });
});
