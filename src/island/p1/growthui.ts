/**
 * ヒーローの育成の画面（段 E1。人事 → ヒーローの育成）：ヒーローごとのカード（Lv・経験値・レアリティの札・パッシブ・昇格のボタン）、
 * 強化アイテムの持ち物、昇格の演出。仕様は docs/ISLAND_PHASE1.md「ヒーローの育成」。
 */
import { isEn, t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { HERO_GROWTH, HERO_RARITIES, HERO_RARITY, PASSIVES, PROMO_ITEM, PROMO_ITEMS, TASKS, aptitude, type HeroRarity, type PassiveKind, type PromoItem } from './data';
import { atCap, capOf, nextPassive, passiveName, passiveValue, promoItemOf, promoLock, xpNeed } from './hero';
import { rankEl } from './heroui';
import { promote, type P1State, type Staff } from './model';
import { after, open, type Ctx } from './screens';
import { bar, btn, h, heroIcon, heroName } from './ui';
import { dexCard, fitBlock } from './p2ui';

const pct = (v: number) => Math.round(v * 1000) / 10;
/** レアリティの札（色の枠と文字。Limited Legendary は虹色の枠） */
export function rarityBadge(r: HeroRarity, big = false): HTMLElement {
  const e = h('span', `isl-hrar is-${r.toLowerCase()} ${big ? 'is-big' : ''}`, HERO_RARITY[r].short);
  e.style.setProperty('--c', HERO_RARITY[r].color);
  e.title = HERO_RARITY[r].name;
  return e;
}
/** 強化アイテムの札（仮の絵：コードで描いた菱形。docs/ISLAND_ART_TODO.md） */
export function itemIcon(k: PromoItem, size = 28): HTMLElement {
  const e = h('span', `isl-hitem is-${k.toLowerCase()}`);
  e.style.setProperty('--c', HERO_RARITY[k].color);
  e.style.setProperty('--s', `${size}px`);
  e.title = PROMO_ITEM[k].name;
  return e;
}
/** パッシブの 1 行（名前・効き目・段） */
function passiveRow(st: Staff, slot: number, k: PassiveKind, tier: number | null, at?: number): HTMLElement {
  const r = h('div', `isl-hpas ${tier == null ? 'is-next' : ''}`);
  r.style.setProperty('--c', '#9fb');
  const name = passiveName(st.hero, slot, k, isEn);
  const v = pct(passiveValue(k, tier ?? 1));
  r.append(h('b', '', name + (tier != null && tier > 1 ? ` ${'+'.repeat(Math.min(5, tier - 1))}` : '')), h('small', '', PASSIVES[k].note(v)));
  if (tier == null && at) r.prepend(h('span', 'isl-hpas-at', t(`Lv ${at} で`, `Lv ${at}`)));
  return r;
}
/** 昇格できない理由・できるときの一言 */
function promoText(s: P1State, st: Staff): string {
  const e = promoLock(st, s.heroItems);
  const next = promoItemOf(st);
  if (e === 'top') return t('最高のレアリティです', 'Highest rarity');
  if (e === 'born') return t('これ以上は、生まれつきの Legendary だけ', 'Only born-Legendary heroes go further');
  if (e === 'cap') return t(`Lv ${capOf(st)} に届くと昇格できます`, `Reach Lv ${capOf(st)} to promote`);
  if (e === 'item' && next) return t(`「${PROMO_ITEM[next].name}」が要ります（いま 0）`, `Needs a ${PROMO_ITEM[next].name} (you have 0)`);
  return next ? t(`「${PROMO_ITEM[next].name}」を 1 つ使って ${HERO_RARITY[next].name} へ`, `Use a ${PROMO_ITEM[next].name} → ${HERO_RARITY[next].name}`) : '';
}

/** ヒーローのカード（育成） */
export function growthCard(ctx: Ctx, s: P1State, st: Staff, onPromote: (st: Staff) => void): HTMLElement {
  const rar = st.rarity ?? 'C';
  const card = h('div', `isl-card2 isl-hcard ${atCap(st) ? 'is-cap' : ''}`);
  card.style.setProperty('--c', HERO_RARITY[rar].color);
  const top = h('div', 'isl-hcard-top');
  const name = h('div', 'isl-hcard-name');
  const lv = h('div', 'isl-row');
  lv.append(rarityBadge(rar), h('b', 'isl-hlv', `Lv ${st.level ?? 1}`), h('small', 'isl-dim', `/ ${capOf(st)}`));
  // 上限 Lv に届いて、上がある（アイテムが無くても札は出す。要るアイテムはカードの下に）
  const up = promoItemOf(st);
  if (up && promoLock(st, { [up]: 1 }) == null) lv.append(h('span', 'isl-hcan', t('昇格できる', 'Can promote')));
  name.append(h('b', '', heroName(st.hero)), lv);
  // いちばん向いている仕事（ランクと数。PHY などの元の数値は見せない）
  const best = TASKS.filter((k) => k.key !== 'side' && k.key !== 'manager' && k.key !== 'train' && k.key !== 'lead').reduce((a, k) => (aptitude(st.stats, k.key) > aptitude(st.stats, a.key) ? k : a));
  const fit = h('div', 'isl-row');
  fit.append(h('small', 'isl-dim', best.name), rankEl(aptitude(st.stats, best.key)));
  name.append(fit);
  top.append(heroIcon(st.hero, 56), name);
  card.append(top);
  // 段 P2：史実の適性（向いている役・根拠・ひとこと）
  const fb = fitBlock(s, st.hero, !!st.resting);
  if (fb) card.append(fb);
  // 経験値のバー
  const need = xpNeed(st.level ?? 1);
  const xpRow = h('div', 'isl-hxp');
  if (atCap(st)) xpRow.append(bar(1, 'var(--isl-gold)'), h('small', 'isl-gold', t('上限 Lv（経験値は入りません）', 'Level cap (no more XP)')));
  else xpRow.append(bar((st.xp ?? 0) / need, '#7fc8ff'), h('small', 'isl-dim', t(`経験値 ${Math.floor(st.xp ?? 0)} / ${need}`, `XP ${Math.floor(st.xp ?? 0)} / ${need}`)));
  card.append(xpRow);
  // パッシブ（開いたもの・次の節目の予告）
  const list = h('div', 'isl-hpas-list');
  (st.passives ?? []).forEach((p, k) => list.append(passiveRow(st, k, p.k, p.tier)));
  const nx = nextPassive(st);
  if (nx) list.append(passiveRow(st, nx.slot, nx.k, null, nx.at));
  if (!(st.passives ?? []).length && !nx) list.append(h('small', 'isl-dim', t('パッシブはありません', 'No passives')));
  card.append(list);
  // 昇格
  const pr = h('div', 'isl-hpromo');
  const e = promoLock(st, s.heroItems);
  const next = promoItemOf(st);
  if (!e && next) {
    const b = btn(t(`昇格する（${HERO_RARITY[next].name}へ）`, `Promote (to ${HERO_RARITY[next].name})`), () => onPromote(st), 'is-on isl-hpromo-go');
    b.prepend(itemIcon(next, 18));
    pr.append(b);
  }
  pr.append(h('small', e ? 'isl-dim' : 'isl-good', promoText(s, st)));
  card.append(pr);
  void ctx;
  return card;
}

/** 強化アイテムの持ち物（数と入り方） */
export function itemsCard(s: P1State): HTMLElement {
  const c = h('div', 'isl-card2 isl-hitems');
  c.append(h('h3', '', t('強化アイテム', 'Promotion items')));
  const row = h('div', 'isl-hitems-row');
  for (const k of PROMO_ITEMS) {
    const n = s.heroItems?.[k] ?? 0;
    const x = h('div', `isl-hitems-x ${n ? '' : 'is-none'}`);
    // 何から何へ（N → C・L → LL の短い札）。くわしい文はホバー
    const prev = HERO_RARITIES[HERO_RARITIES.indexOf(k) - 1];
    x.title = t(`${PROMO_ITEM[k].name}：${PROMO_ITEM[k].note}`, `${PROMO_ITEM[k].name}: ${PROMO_ITEM[k].note}`);
    x.append(itemIcon(k, 26), h('b', '', `×${n}`), h('small', '', PROMO_ITEM[k].name), h('small', 'isl-dim', `${HERO_RARITY[prev].short} → ${HERO_RARITY[k].short}`));
    row.append(x);
  }
  c.append(row);
  c.append(h('p', 'isl-dim', t('入り方：研究成果の発表・町の制覇・依頼の報酬・ダンジョンの奥の層（上の段ほど珍しい）。ランクアップの災害でも失いません。', 'From: presenting findings, conquering towns, request rewards, deep dungeon layers (higher tiers are rarer). Never lost in rank-up disasters.')));
  return c;
}

/** 昇格の演出：レアリティの色の光・札が変わる・マインちゃんの一言（タップで閉じる） */
export function playPromotion(root: HTMLElement, hero: number, from: HeroRarity, to: HeroRarity, done?: () => void) {
  const ov = h('div', `isl-hpfx is-${to.toLowerCase()}`);
  ov.style.setProperty('--c', HERO_RARITY[to].color);
  const glow = h('div', 'isl-hpfx-glow');
  const box = h('div', 'isl-hpfx-box');
  const badges = h('div', 'isl-hpfx-badges');
  const a = rarityBadge(from, true);
  a.classList.add('is-from');
  const b = rarityBadge(to, true);
  b.classList.add('is-to');
  badges.append(a, h('span', 'isl-hpfx-arrow', '→'), b);
  const say = h('div', 'isl-hpfx-say');
  const mi = h('img');
  mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
  mi.alt = '';
  const line =
    to === 'LL'
      ? t(`すごい！ ${heroName(hero)}が[[リミテッド・レジェンド]]に！`, `Amazing! ${heroName(hero)} is now [[Limited Legendary]]!`)
      : t(`${heroName(hero)}が${HERO_RARITY[to].name}に昇格！ 上限 Lv ${HERO_GROWTH.cap[to]}`, `${heroName(hero)} is now ${HERO_RARITY[to].name}! Level cap ${HERO_GROWTH.cap[to]}`);
  const p = h('p');
  p.textContent = line.replace(/\[\[(.+?)\]\]/g, '$1');
  say.append(mi, p);
  box.append(heroIcon(hero, 96), h('b', 'isl-hpfx-title', t('昇格！', 'Promoted!')), badges, say, h('small', 'isl-dim', t('▶ タップで進む', '▶ Tap to continue')));
  ov.append(glow, box);
  const close = () => {
    ov.remove();
    done?.();
  };
  ov.addEventListener('click', close);
  root.append(ov);
  requestAnimationFrame(() => ov.classList.add('is-in'));
}

/** 人事 → ヒーローの育成 */
export function openGrowth(ctx: Ctx, focus?: number) {
  open(ctx, t('ヒーローの育成', 'Hero growth'), (body) => {
    const s = ctx.s();
    body.append(h('p', 'isl-dim', t('働くと経験値が入り、Lv が上がるほど能力が少しずつ上がります。Lv の節目でパッシブが開きます。上限 Lv に届いたら、強化アイテムで昇格（レアリティが 1 段上がる）できます。', 'Heroes gain XP by working; each level raises their stats a little. Passives open at milestone levels. At the level cap, use a promotion item to raise their rarity one step.')));
    body.append(itemsCard(s));
    // 段 P2：ヒーローの組み合わせの図鑑
    body.append(dexCard(s));
    const grid = h('div', 'isl-hgrid');
    // 昇格できる人 → Lv の高い順
    const list = [...s.staff].sort((a, b) => Number(!promoLock(b, s.heroItems)) - Number(!promoLock(a, s.heroItems)) || (b.level ?? 1) - (a.level ?? 1));
    for (const st of list) {
      const card = growthCard(ctx, s, st, (x) => {
        const r = promote(s, x.hero);
        if (typeof r !== 'object') return;
        ctx.sfx?.('levelup');
        after(ctx);
        playPromotion(ctx.root, x.hero, r.from, r.to);
      });
      if (st.hero === focus) card.classList.add('is-focus');
      grid.append(card);
    }
    body.append(grid);
  });
}
