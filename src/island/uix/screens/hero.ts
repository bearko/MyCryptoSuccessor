/**
 * 段 UIX3h：ヒーローの人事票・育成・昇格・教えの図鑑・組み合わせ図鑑。方向 C「管制卓」。入のときだけ（docs/ISLAND_UIX.md「画面：ヒーローの人事票と育成」）。
 * 出す中身・計算・押す先は今の画面（p1/growthui.ts の growthCard・itemsCard・playPromotion・openGrowth、p1/p2ui.ts の fitBlock・dexCard、
 * p1/lessonui.ts の lessonCard・openLessons・lessonPopEl）と同じ。本体の関数は束（H）から使う。
 *
 * - 人事票（選ぶ引き出しの器）：顔（2 倍）・段の札・Lv と経験値・いまの仕事・スタミナ・士気・能力の縦の棒・史実の適性・パッシブ。
 *   「担当を外す」は取り返しのつかない操作ではないが、持ち場が止まるので、今の引き出しと同じ 2 回押し（1 回目で「もう一度で外す」・3 秒で戻る）
 * - 育成：強化アイテムの棚・受け継いだ教え（型ごとの縦の棒）・組み合わせ図鑑・ヒーローごとの人事票の札（Lv・経験値の計器・パッシブ・昇格のキー）
 * - 昇格：段の札がめくれて上がる（もとの段 → 新しい段）・顔・「昇格！」・マインちゃんの一言（押すと閉じる）
 * - 教えの図鑑：型ごとの縦の棒（上限の線）・受け継いだ教え（紙）・まだの人（影）
 */
import { isEn, t } from '../../../i18n';
import { el, type Kid } from '../dom';
import { shake, uxKey, uxLamp, uxMeter } from '../parts';
import { sparks } from '../fx';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { uxpBars, uxpDrawer, uxpPaper, uxpStamp } from '../sparts';
import { H } from './h-deps';
import { aptBars, bestLine, enter, face, hIcon, heroCard, keepOpen, keyLabel, lite, liveDraw, mid, rarOf, rarTag, sect, hEmpty } from './h-kit';
import { moraleTag } from './hr';
import type { Ctx } from '../../p1/screens';
import type { HeroRarity, LessonType, PromoItem } from '../../p1/data';
import type { P1State, Staff } from '../../p1/model';

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）
/** 教えの型の絵（今の絵文字の代わり。色だけにしない：型の名前を必ず添える） */
export const LESSON_ICO: Record<LessonType, string> = { decide: 'target', speed: 'bolt', steady: 'brick', novel: 'bulb', people: 'people', customer: 'cart', numbers: 'bars', deal: 'share' };
/** 組み合わせの種類の絵 */
export const DUO_ICO: Record<string, string> = { ally: 'share', kin: 'pair', mentor: 'book', rival: 'arrow', tension: 'bolt' };
/** 外すの 2 回押し：1 回目から戻るまで */
export const RELEASE_MS = 3000;
/** 昇格の札がめくれる（もとの段が縮んで、新しい段が開く） */
export const PROMO_FLIP_MS = 420;

// ================================================================= 人事票（1 人）
/** ヒーローの人事票を引き出しで開く（スタッフの名簿・そのほかの仕事・育成の札から） */
export function openHeroSheet(ctx: Ctx, hero: number) {
  const s = ctx.s();
  const st = H.staffOf(s, hero);
  if (!st) return;
  const d = uxpDrawer({ root: ctx.root, title: t('人事票', 'Profile'), cls: 'uxh-sheet' });
  d.body.append(...sheetBody(ctx, s, st, d.close));
}

function sheetBody(ctx: Ctx, s: P1State, st: Staff, close: () => void): HTMLElement[] {
  const rar = rarOf(st);
  const need = H.xpNeed(st.level ?? 1);
  const cap = H.atCap(st);
  const xp = uxMeter(cap ? 1 : (st.xp ?? 0) / need, cap ? '' : 'cyan');
  const sta = st.stamina / st.stats.hp;
  const sm = uxMeter(sta, sta > 0.3 ? 'good' : '');
  sm.el.classList.add(sta > 0.3 ? 'is-ok' : 'is-low');
  const out: HTMLElement[] = [];
  out.push(
    el(
      'div.uxh-prof',
      el('span.uxh-prof-pic', face(st.hero, 128, { scale: 2, breathe: st.task == null })),
      el(
        'span.uxh-prof-b',
        el('span.uxh-name', el('b', H.heroName(st.hero)), rarTag(rar)),
        el('span.uxh-prof-lv', el('b.ux-num', `Lv ${st.level ?? 1}`), el('span.ux-num.uxh-dim', `/ ${H.capOf(st)}`)),
        xp.el,
        el('span.uxh-dim', cap ? t('上限 Lv（経験値は入りません）', 'Level cap (no more XP)') : t(`経験値 ${Math.floor(st.xp ?? 0)} / ${need}`, `XP ${Math.floor(st.xp ?? 0)} / ${need}`)),
        el('span.uxh-prof-job', hIcon('compass', lite), el('span', H.jobLabel(ctx.s(), st))),
        el('span.uxh-sta', el('span.uxh-sta-k', t('スタミナ', 'Stamina')), sm.el, el('span.ux-num.uxh-dim', st.resting ? t('休憩中', 'Resting') : `${Math.round(st.stamina)}/${st.stats.hp}`)),
        moraleTag(st),
      ),
    ),
  );
  out.push(el('section.uxh-sec', sect(t('能力（仕事ごとの向き不向き）', 'Aptitude by job'), 'bars', { kind: 'dark', right: bestLine(st.stats, t('いちばん', 'Best')) }), aptBars(st.stats).el));
  const fb = fitPanel(s, st.hero, !!st.resting);
  if (fb) out.push(fb);
  out.push(passives(st));
  // 担当を外す：今の引き出しと同じ 2 回押し（止まる持ち場があるとき、外すと止まる）
  const keys: Kid[] = [];
  const canFree = st.task != null && st.task !== 'train' && st.task !== 'manager' && st.task !== 'lead';
  if (canFree) {
    let armed = 0;
    const lab = el('b', t('担当を外す', 'Unassign'));
    const k = uxKey([hIcon('close', lite), lab], () => {
      if (!armed) {
        armed = window.setTimeout(() => {
          armed = 0;
          lab.textContent = t('担当を外す', 'Unassign');
          k.classList.remove('is-armed');
        }, RELEASE_MS);
        lab.textContent = t('もう一度で外す', 'Tap again to unassign');
        k.classList.add('is-armed');
        uxSfx('deny');
        shake(k);
        return;
      }
      clearTimeout(armed);
      if (!H.releaseHero(ctx.s(), st.hero)) return;
      close();
      H.after(ctx);
    }, { kind: 'danger', ico: null, cls: 'uxh-free', attrs: { 'data-ux-quiet': '' } });
    keys.push(k);
  }
  keys.push(uxKey(keyLabel('rankup', t('育成', 'Growth')), () => (close(), H.openGrowth(ctx, st.hero)), { kind: 'weak', ico: null }));
  keys.push(uxKey(keyLabel('coin', t('給与・労務', 'Pay & welfare')), () => (close(), H.openPayroll(ctx)), { kind: 'weak', ico: null }));
  out.push(el('div.uxh-keys.uxh-prof-keys', keys));
  return out;
}

/** 史実の適性（向いている役の札・根拠・ひとこと・部門と役職ごとの 16 の札・組み合わせの数）。調査の無いヒーローは null（今の fitBlock と同じ） */
export function fitPanel(s: P1State, hero: number, resting = false): HTMLElement | null {
  const best = H.bestFits(hero);
  if (!best.length) return null;
  const chip = (k: (typeof best)[number], short = false) => {
    const g = H.gradeOf(hero, k);
    if (!g) return null;
    const e = el(`span.uxh-grade.is-${g.toLowerCase()}`, { title: H.whyOf(hero, k) || undefined }, short ? null : el('span', H.fitName(k)), el('b.ux-num', g));
    e.style.setProperty('--hc', H.GRADE_COLOR[g]);
    return e;
  };
  const box = el('section.uxh-sec.uxh-fit', sect(t('史実の適性', 'Historical fit'), 'book', { kind: 'dark' }), el('div.uxh-fit-best', best.map((k) => chip(k))));
  const top = best.find((k) => H.whyOf(hero, k));
  if (top) box.append(el('p.uxh-note', H.fitLine(hero, top)));
  const say = H.lineOf(hero, resting ? 'tired' : 'greet', s.day >> 4);
  if (say) box.append(uxpPaper({ plain: true, cls: 'uxh-say' }, el('p', t(`「${say}」`, `“${say}”`))));
  const det = el('details.uxh-fit-all', el('summary', t('部門・役職ごとの適性', 'Fit by department and role')));
  const grid = el('div.uxh-fit-grid');
  for (const k of H.FIT_KEYS) {
    const c = chip(k);
    if (!c) continue;
    const w = H.whyOf(hero, k);
    grid.append(el('div.uxh-fit-cell', c, w ? el('span.uxh-dim', w) : null));
  }
  det.append(grid);
  box.append(det);
  const ds = H.duosOfHero(hero);
  if (ds.length) box.append(el('p.uxh-dim', t(`組み合わせ：${ds.filter((d) => s.duo?.found[d.id]).length} / ${ds.length} を見つけた`, `Pairings: found ${ds.filter((d) => s.duo?.found[d.id]).length} / ${ds.length}`)));
  return box;
}

/** パッシブ（開いたもの・次の節目の予告） */
function passives(st: Staff): HTMLElement {
  const pct = (v: number) => Math.round(v * 1000) / 10;
  const row = (slot: number, k: Parameters<typeof H.passiveName>[2], tier: number | null, at?: number) =>
    el(
      `div.uxh-pas${tier == null ? '.is-next' : ''}`,
      uxLamp('good', tier != null),
      el('span.uxh-pas-b', el('b', H.passiveName(st.hero, slot, k, isEn) + (tier != null && tier > 1 ? ` ${'+'.repeat(Math.min(5, tier - 1))}` : '')), el('span.uxh-dim', H.PASSIVES[k].note(pct(H.passiveValue(k, tier ?? 1))))),
      tier == null && at ? el('span.uxh-pas-at.ux-tape', el('b', t(`Lv ${at} で`, `Lv ${at}`))) : null,
    );
  const list = el('div.uxh-pas-list');
  (st.passives ?? []).forEach((p, k) => list.append(row(k, p.k, p.tier)));
  const nx = H.nextPassive(st);
  if (nx) list.append(row(nx.slot, nx.k, null, nx.at));
  if (!(st.passives ?? []).length && !nx) list.append(el('p.uxh-dim', t('パッシブはありません', 'No passives')));
  return el('section.uxh-sec', sect(t('パッシブ', 'Passives'), 'star4', { kind: 'dark' }), list);
}

// ================================================================= ヒーローの育成
/** 強化アイテムの絵（仮の絵：CSS の菱形。段の色） */
export function itemIco(k: PromoItem, big = false): HTMLElement {
  const e = el(`span.uxh-item.is-${k.toLowerCase()}${big ? '.is-big' : ''}`, { title: H.PROMO_ITEM[k].name, 'aria-hidden': 'true' });
  e.style.setProperty('--hc', H.HERO_RARITY[k].color);
  return e;
}
/** 昇格できない理由・できるときの一言（今の promoText と同じ） */
function promoText(s: P1State, st: Staff): string {
  const e = H.promoLock(st, s.heroItems);
  const next = H.promoItemOf(st);
  if (e === 'top') return t('最高のレアリティです', 'Highest rarity');
  if (e === 'born') return t('これ以上は、生まれつきの Legendary だけ', 'Only born-Legendary heroes go further');
  if (e === 'cap') return t(`Lv ${H.capOf(st)} に届くと昇格できます`, `Reach Lv ${H.capOf(st)} to promote`);
  if (e === 'item' && next) return t(`「${H.PROMO_ITEM[next].name}」が要ります（いま 0）`, `Needs a ${H.PROMO_ITEM[next].name} (you have 0)`);
  return next ? t(`「${H.PROMO_ITEM[next].name}」を 1 つ使って ${H.HERO_RARITY[next].name} へ`, `Use a ${H.PROMO_ITEM[next].name} → ${H.HERO_RARITY[next].name}`) : '';
}

let growthFocus: number | undefined;
export function openGrowthUx(ctx: Ctx, focus?: number) {
  growthFocus = focus;
  keepOpen(ctx, t('ヒーローの育成', 'Hero growth'), growthScreen);
}

function growthScreen(ctx: Ctx, body: HTMLElement) {
  const page = el('div.uxh-page.uxh-grow');
  body.append(page);
  let scrolled = false;
  return liveDraw(page, (anim: boolean) => {
    const s = ctx.s();
    const motion = anim && !isCalm();
    const out: HTMLElement[] = [];
    out.push(el('p.uxh-note', t('働くと経験値が入り、Lv が上がるほど能力が少しずつ上がります。Lv の節目でパッシブが開きます。上限 Lv に届いたら、強化アイテムで昇格（レアリティが 1 段上がる）できます。', 'Heroes gain XP by working; each level raises their stats a little. Passives open at milestone levels. At the level cap, use a promotion item to raise their rarity one step.')));
    // ---- 強化アイテムの棚
    const shelf = el('div.uxh-items');
    for (const k of H.PROMO_ITEMS) {
      const n = s.heroItems?.[k] ?? 0;
      const prev = H.HERO_RARITIES[H.HERO_RARITIES.indexOf(k) - 1];
      shelf.append(el(`div.uxh-itemx${n ? '' : '.is-none'}`, { title: t(`${H.PROMO_ITEM[k].name}：${H.PROMO_ITEM[k].note}`, `${H.PROMO_ITEM[k].name}: ${H.PROMO_ITEM[k].note}`) }, itemIco(k), el('b.ux-num', `×${n}`), el('span.uxh-itemx-n', H.PROMO_ITEM[k].name), el('span.uxh-itemx-r', rarTag(prev), hIcon('next', dimIco), rarTag(k))));
    }
    out.push(el('section.uxh-sec', sect(t('強化アイテム', 'Promotion items'), 'gem'), shelf, el('p.uxh-note', t('入り方：研究成果の発表・町の制覇・依頼の報酬・ダンジョンの奥の層（上の段ほど珍しい）。ランクアップの災害でも失いません。', 'From: presenting findings, conquering towns, request rewards, deep dungeon layers (higher tiers are rarer). Never lost in rank-up disasters.'))));
    // ---- 受け継いだ教え（段 S1）・組み合わせ図鑑（段 P2）
    out.push(lessonPanel(ctx, s), dexPanel(s));
    // ---- ヒーローごと（昇格できる人 → Lv の高い順）
    const list = [...s.staff].sort((a, b) => Number(!H.promoLock(b, s.heroItems)) - Number(!H.promoLock(a, s.heroItems)) || (b.level ?? 1) - (a.level ?? 1));
    const grid = el('div.uxh-grow-list');
    // 主のキー（前の層・光の帯）は 1 画面に 1 つ：いちばん上の「昇格する」だけ。ほかは、ふつうのキー
    let mainLeft = 1;
    for (const st of list) grid.append(growthCard(ctx, s, st, () => mainLeft-- > 0));
    out.push(el('section.uxh-sec', sect(t('ヒーローごと', 'By hero'), 'people', { kind: 'dark' }), list.length ? grid : hEmpty(t('まだヒーローがいません。', 'No heroes yet.'), { ico: 'people' })));
    page.replaceChildren(...out);
    if (motion) enter([...grid.children] as HTMLElement[]);
    if (!scrolled && growthFocus != null) {
      scrolled = true;
      const f = grid.querySelector<HTMLElement>(`[data-hero="${growthFocus}"]`);
      if (f) requestAnimationFrame(() => f.scrollIntoView({ block: 'center' }));
    }
  });
}
const dimIco = { color: '#97a1cf', hi: '#c9cff0', lo: '#0b0d17', scale: 1 };

/** ヒーローのカード（育成）：人事票の札 */
function growthCard(ctx: Ctx, s: P1State, st: Staff, takeMain: () => boolean): HTMLElement {
  const rar = rarOf(st);
  const cap = H.atCap(st);
  const up = H.promoItemOf(st);
  const can = !!up && H.promoLock(st, { [up]: 1 }) == null;
  const need = H.xpNeed(st.level ?? 1);
  const xp = uxMeter(cap ? 1 : (st.xp ?? 0) / need, cap ? '' : 'cyan');
  const e = H.promoLock(st, s.heroItems);
  const next = H.promoItemOf(st);
  const promo: Kid[] = [];
  if (!e && next) {
    const isMain = takeMain();
    promo.push(
      uxKey([itemIco(next), el('b', t(`昇格する（${H.HERO_RARITY[next].name}へ）`, `Promote (to ${H.HERO_RARITY[next].name})`))], (b) => {
        const r = H.promote(ctx.s(), st.hero);
        if (typeof r !== 'object') return;
        ctx.sfx?.('levelup');
        const from = mid(b);
        H.after(ctx);
        playPromotionUx(ctx.root, st.hero, r.from, r.to, undefined, from);
      }, { kind: isMain ? 'main' : '', ico: null, cls: 'uxh-promo isl-hpromo-go' }),
    );
  }
  promo.push(el(`span.uxh-promo-t${e ? '.uxh-dim' : '.is-good'}`, promoText(s, st)));
  const card = heroCard(st.hero, {
    rarity: rar,
    level: null,
    more: [el('span.uxh-prof-lv', el('b.ux-num', `Lv ${st.level ?? 1}`), el('span.ux-num.uxh-dim', `/ ${H.capOf(st)}`)), can ? el('span.uxh-can.ux-tape.ux-tape--amber', el('b', t('昇格できる', 'Can promote'))) : null],
    desc: bestLine(st.stats, t('いちばん向いている', 'Best at')),
    foot: [el('span.uxh-xp', xp.el, el('span.uxh-dim', cap ? t('上限 Lv（経験値は入りません）', 'Level cap (no more XP)') : t(`経験値 ${Math.floor(st.xp ?? 0)} / ${need}`, `XP ${Math.floor(st.xp ?? 0)} / ${need}`))), passives(st), el('div.uxh-promo-row.isl-hpromo', promo)],
    right: uxKey(keyLabel('doc', t('人事票', 'Profile')), () => openHeroSheet(ctx, st.hero), { kind: 'weak', ico: null, cls: 'uxh-k-sheet' }),
    cls: `uxh-gcard isl-hcard${cap ? ' is-cap' : ''}${st.hero === growthFocus ? ' is-focus' : ''}`,
  });
  card.style.setProperty('--hc', H.HERO_RARITY[rar].color);
  const fb = fitPanel(s, st.hero, !!st.resting);
  if (fb) card.querySelector('.uxp-card-foot')?.prepend(fb);
  return card;
}

// ================================================================= 昇格の演出
/**
 * 昇格：暗い幕・顔（3 倍）・段の札がめくれて上がる（もとの段が縮み、新しい段が開いて打たれる）・「昇格！」・マインちゃんの一言。押すと閉じる。
 * 動きを減らすときは、めくりも火花もなく、新しい段の札がすぐ出る
 */
export function playPromotionUx(root: HTMLElement, hero: number, from: HeroRarity, to: HeroRarity, done?: () => void, origin?: { x: number; y: number }) {
  const a = rarTag(from, true);
  const b = rarTag(to, true);
  const flip = el('span.uxh-pf-flip', a, b);
  const stamp = uxpStamp(t('昇格', 'Promoted'), { kind: 'good' });
  const line =
    to === 'LL'
      ? t(`すごい！ ${H.heroName(hero)}がリミテッド・レジェンドに！`, `Amazing! ${H.heroName(hero)} is now Limited Legendary!`)
      : t(`${H.heroName(hero)}が${H.HERO_RARITY[to].name}に昇格！ 上限 Lv ${H.HERO_GROWTH.cap[to]}`, `${H.heroName(hero)} is now ${H.HERO_RARITY[to].name}! Level cap ${H.HERO_GROWTH.cap[to]}`);
  const mine = el('img.uxh-pf-mine', { src: H.assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png'), alt: '' });
  const box = el(
    'div.uxh-pf-box.ux-plate',
    el('div.ux-screws'),
    el('span.uxh-pf-face', face(hero, 192, { scale: 3 })),
    el('b.uxh-pf-title', t('昇格！', 'Promoted!')),
    el('span.uxh-pf-badges', el('span.uxh-pf-from', rarTag(from, true)), hIcon('next', { ...lite, scale: 2 }), flip, stamp.el),
    el('div.uxh-pf-say', mine, uxpPaper({ plain: true }, el('p', line))),
    el('span.uxh-dim', t('タップで進む', 'Tap to continue')),
  );
  const ov = el(`div.isl-hpfx.uxh-pf.is-${to.toLowerCase()}`, { role: 'dialog', 'aria-label': line }, box);
  ov.style.setProperty('--hc', H.HERO_RARITY[to].color);
  const close = () => {
    ov.remove();
    done?.();
  };
  ov.addEventListener('click', close);
  root.append(ov);
  uxSfx('rankup');
  if (isCalm()) {
    flip.classList.add('is-done');
    stamp.show();
    return;
  }
  if (origin) sparks(origin, 12);
  setTimeout(() => {
    flip.classList.add('is-turn');
    uxSfx('page', { step: 4 });
  }, 360);
  setTimeout(() => {
    flip.classList.add('is-done');
    stamp.hit(box);
    sparks(mid(flip), 18, [H.HERO_RARITY[to].color, '#fffdf3', '#ffb81f']);
  }, 360 + PROMO_FLIP_MS);
}

// ================================================================= 教え（段 S1）
/** 型ごとの数の縦の棒（いつも同じ並び）。上限に届いた型は琥珀。上限は言葉で */
function lessonBars(s: P1State, height = 120) {
  const c = H.lessonCounts(s);
  const top = Math.max(H.LESSON.cap + 1, ...H.LESSON_TYPES.map((k) => c[k]));
  return uxpBars(
    H.LESSON_TYPES.map((k) => ({ label: H.lessonTypeName(k), value: c[k], text: String(c[k]), kind: c[k] >= H.LESSON.cap ? ('main' as const) : ('' as const) })),
    { max: top, height, cls: 'uxh-lsbars' },
  );
}
const typeChip = (k: LessonType, n?: number) => {
  const e = el('span.uxh-ltype', hIcon(LESSON_ICO[k], lite), el('span', H.lessonTypeName(k)), n != null ? el('b.ux-num', String(n)) : null);
  e.style.setProperty('--hc', H.LESSON_COLOR[k]);
  return e;
};
/** 人事 → ヒーローの育成の上：受け継いだ数と型ごとの棒（小）・図鑑を開く */
function lessonPanel(ctx: Ctx, s: P1State): HTMLElement {
  const d = H.lessonDex(s);
  return el(
    'section.uxh-sec.uxh-lsp',
    sect(t(`受け継いだ教え（${d.got.length} / ${d.total}）`, `Lessons inherited (${d.got.length} / ${d.total})`), 'book'),
    el('p.uxh-note', t('偉人たちと仕事を重ねると、その人の仕事の流儀が「教え」として社長に残ります。型ごとに、社長の判断が少し強くなります。', 'Work alongside the greats and their way of working stays with you as a lesson. Each type makes your calls a little stronger.')),
    lessonBars(s, 96).el,
    el('div.uxh-keys', uxKey(keyLabel('book', t('教えの図鑑を開く', 'Open lessons')), () => openLessonsUx(ctx), { ico: null, cls: 'uxh-ls-open isl-ls-open' })),
  );
}

/** 教えの図鑑（今と同じく、ほかの窓と同じ層の窓 .isl-modal に出す。閉じるキー・外・Esc で閉じる） */
export function openLessonsUx(ctx: Ctx) {
  ctx.root.querySelector('.isl-ls-modal')?.remove();
  const s = ctx.s();
  const d = H.lessonDex(s);
  const m = el('div.isl-modal.isl-ls-modal.uxh-lsm');
  const close = () => {
    m.remove();
    removeEventListener('keydown', onKey);
    uxSfx('close');
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const body = el('div.uxh-lsm-body');
  const panel = el('div.uxh-lsm-panel.ux-plate', { role: 'dialog', 'aria-label': t('教えの図鑑', 'Lessons') }, el('div.ux-screws'), el('div.uxh-lsm-head', hIcon('book', { ...lite, scale: 2 }), el('h2', t('教えの図鑑', 'Lessons')), uxKey('', close, { ico: 'close', cls: 'uxh-lsm-x', attrs: { 'aria-label': t('閉じる', 'Close') } })), body);
  m.append(panel);
  m.addEventListener('click', (e) => {
    if (e.target === m) close();
  });
  addEventListener('keydown', onKey);
  ctx.root.append(m);
  ctx.sfx?.('page');
  uxSfx('open');
  const counts = H.lessonCounts(s);
  const most = H.LESSON_TYPES.map((k) => [k, counts[k]] as const).sort((a, b) => b[1] - a[1])[0];
  const bars = lessonBars(s);
  body.append(
    el(
      'section.uxh-sec',
      sect(t(`受け継いだ教え ${d.got.length} / ${d.total}`, `Lessons inherited ${d.got.length} / ${d.total}`), 'book'),
      el(
        'p.uxh-note',
        t(
          `ヒーローの提案を承認して、翌月の締めで見込みどおりに数字が動いたとき、またはそのヒーローと ${H.LESSON.need} 回仕事でかかわったとき（カード・部長との会話・組み合わせ・経営会議）、月の締めで 1 人から 1 つ残ります（2 か月目から・1 回の締めで ${H.LESSON.perMonth} つまで）。`,
          `When a hero’s approved proposal moves the numbers as expected at next month’s close, or after working with them ${H.LESSON.need} times (cards, talks with heads, pairings, board meetings), one lesson per hero stays at the monthly close (from month 2; ${H.LESSON.perMonth} per close).`,
        ),
      ),
    ),
    el(
      'section.uxh-sec',
      sect(d.got.length ? t(`いちばん多いのは${H.lessonTypeName(most[0])}の教え（${most[1]} つ）`, `Most common: ${H.lessonTypeName(most[0])} (${most[1]})`) : t('型ごとの数（まだ 0）', 'By type (none yet)'), 'bars', { kind: 'dark' }),
      bars.el,
      el('div.uxh-ltypes', H.LESSON_TYPES.map((k) => el('span.uxh-ltrow', typeChip(k, counts[k]), el(`span${counts[k] ? '.is-good' : '.uxh-dim'}`, counts[k] ? H.fxLine(k, H.lessonLive(s, k)) : t('まだ', 'none yet'))))),
      el('p.uxh-note', t(`琥珀の棒＝効き目の上限に届いた型（1 つの型で ${H.LESSON.cap} つまで）`, `Amber bar = effect cap reached (${H.LESSON.cap} per type)`)),
    ),
  );
  const got = el('div.uxh-ls-got');
  for (const r of d.got) {
    const x = H.lessonText(r.hero);
    const g = r.got!;
    got.append(
      uxpPaper(
        { plain: true, cls: 'uxh-ls-row' },
        el('div.uxh-ls-row-h', face(r.hero, 40), typeChip(r.type), el('span', H.heroName(r.hero))),
        el('b.uxh-ls-name', x?.name ?? ''),
        x?.body ? el('p', t(`「${x.body}」`, `“${x.body}”`)) : null,
        x?.root ? el('p.uxh-ls-root', t(`もと：${x.root}`, `From: ${x.root}`)) : null,
        el('p.uxh-ls-root', g.via === 'prop' ? t(`承認した提案が効いて受け継いだ（${Math.floor(g.day / 30) + 1} か月目）`, `Inherited when an approved proposal worked (month ${Math.floor(g.day / 30) + 1})`) : t(`仕事を重ねて受け継いだ（${Math.floor(g.day / 30) + 1} か月目）`, `Inherited by working together (month ${Math.floor(g.day / 30) + 1})`)),
      ),
    );
  }
  body.append(el('section.uxh-sec', sect(t('受け継いだ教え', 'Inherited'), 'check', { kind: 'dark' }), d.got.length ? got : hEmpty(t('まだありません。ヒーローの提案を承認して、手が効くのを待とう。', 'None yet. Approve a hero’s proposal and wait for it to pay off.'), { ico: 'book' })));
  const near = el('div.uxh-ls-near');
  for (const r of d.near)
    near.append(
      el(
        'div.uxh-ls-sil',
        { title: t(`型：${H.lessonTypeName(r.type)}・かかわった回数 ${r.met} / ${H.LESSON.need}（提案を承認して効けば、すぐ受け継ぐ）`, `Type: ${H.lessonTypeName(r.type)} · worked together ${r.met} / ${H.LESSON.need} (or inherit right away when an approved proposal works)`) },
        face(r.hero, 40, { off: true }),
        el('span', H.heroName(r.hero)),
        el('span.uxh-ls-met', hIcon(LESSON_ICO[r.type], dimIco), el('span.ux-num', `${Math.min(r.met, H.LESSON.need)} / ${H.LESSON.need}`)),
      ),
    );
  body.append(
    el(
      'section.uxh-sec',
      sect(t(`まだの教え（いま会社にいる ${d.near.length} 人）`, `Not yet (${d.near.length} in your company)`), 'people', { kind: 'dark' }),
      d.near.length ? near : null,
      el('p.uxh-note', t(`ほかに ${d.rest} 人の偉人の教えがあります（雇うと、ここに並びます）。`, `${d.rest} more greats have lessons to share (hire them to see them here).`)),
    ),
  );
  if (!isCalm()) enter([...got.children, ...near.children] as HTMLElement[]);
}

/** 受け継いだときのお知らせ（トーストの列に入れる。押すと図鑑）。今の目印 .isl-toast.isl-ls-pop。帯の着せ替え（c-dress）が組み直さないよう、ランプを先頭に置く */
export function lessonPopUx(hero: number, onOpen?: () => void): HTMLElement {
  const x = H.lessonText(hero);
  const e = el('div.isl-toast.isl-ls-pop.uxh-lspop', uxLamp('good', true), face(hero, 40), el('span.uxh-lspop-t', x ? [el('span.uxh-dim', t(`${H.heroName(hero)}「${x.body}」`, `${H.heroName(hero)}: “${x.body}”`)), el('b', t(`教え：「${x.name}」を受け継いだ`, `Lesson inherited: “${x.name}”`)), el('span.uxh-lspop-fx', typeChip(x.type), el('span', H.fxLine(x.type)))] : null));
  if (onOpen) {
    e.classList.add('is-tap');
    e.addEventListener('click', onOpen);
  }
  if (!isCalm()) requestAnimationFrame(() => sparks(mid(e), 10, ['#36e08b', '#fffdf3', '#ffb81f']));
  return e;
}

// ================================================================= 組み合わせ図鑑（段 P2）
/** 見つけた組み合わせ（顔・名前・関係・条件・効き目・史実の一言・期限）。まだの物は数だけ（影の札） */
export function dexPanel(s: P1State): HTMLElement {
  const n = H.duoFoundN(s);
  const list = el('div.uxh-dex');
  let hidden = 0;
  for (const r of H.duoDex(s)) {
    if (!r.found) {
      hidden++;
      continue;
    }
    const d = r.def;
    const rec = s.duo?.found[d.id];
    const sep = t('・', ' · ');
    list.append(
      el(
        `div.uxh-dex-row.is-${d.kind}`,
        el('span.uxh-dex-faces', d.heroes.map((id) => face(id, 40))),
        el(
          'span.uxh-dex-b',
          el('b.uxh-it', hIcon(DUO_ICO[d.kind] ?? 'pair', lite), el('span', d.name())),
          el('span', `${H.kindName(d.kind)}${sep}${H.condName(d.cond)}${H.fxText(d.kind) ? `${sep}${H.fxText(d.kind)}` : ''}`),
          el('span.uxh-dim', d.note()),
          rec?.off ? el('span.is-good', t('いつもの効き目は止めてある', 'Usual effect turned off')) : rec?.until != null && rec.until > s.day ? el('span.is-good', t(`期限つきの効き目：あと ${rec.until - s.day} 日`, `Timed effect: ${rec.until - s.day} days left`)) : null,
        ),
      ),
    );
  }
  if (hidden) list.append(el('div.uxh-dex-row.is-hidden', el('span.uxh-dex-q.ux-num', '???'), el('span.uxh-dim', t(`まだ見つけていない組み合わせ ${hidden}`, `${hidden} pairings yet to find`))));
  return el(
    'section.uxh-sec.uxh-dexp',
    sect(t(`ヒーローの組み合わせ図鑑（${n} / ${H.DUOS.length}）`, `Hero pairings (${n} / ${H.DUOS.length})`), 'pair'),
    el('p.uxh-note', t('史実でつながりのあるヒーローが、同じ会社・町・部門にそろうと見つかります（2 か月目から）。見つけた組み合わせには小さな効き目があります。', 'Heroes linked in history are discovered when they share a company, town or department (from month 2). Found pairings have small effects.')),
    list,
  );
}
