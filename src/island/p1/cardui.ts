/**
 * 提案・報告のカードの画面（段 UI1）：画面いっぱいのポップアップ（端に少し隙間を空けて後ろの町が見える）。
 * 顔（大きく）・肩書きの札（部門の色）・名前・小さい一行（Lv・適性・性格の一言）・ウィットの一言・課題のセリフ・下にそろえた 2〜3 択（おすすめは金色）・
 * 下の一行（読みの確かさ ★・あと何件）。出ているあいだは時間が止まり（.isl-modal）、選ぶ以外の操作はできない（暗幕）。
 * 計算と文は card.ts（DOM なし）。仕様は docs/ISLAND_PHASE1.md「提案・報告のカード」。
 */
import { t } from '../../i18n';
import { aptitude, type Task } from './data';
import {
  approveCard,
  planOfChoice,
  shownRec,
  PROPOSAL_SRC,
  canTrust,
  cardInbox,
  cardStar,
  choiceText,
  eventHead,
  chooseCard,
  markSeen,
  popLeft,
  quipOfCard,
  roleOfCard,
  sayOf,
  trustCard,
  trustName,
  trustText,
  untrust,
  type Card,
  type ChooseRes,
} from './card';
import { rankOf } from './heroui';
import { staffOf, type P1State } from './model';
import { traitOf } from './persona';
import { landDef, relOf, relTeaser } from './diplo';
import { after, type Ctx } from './screens';
import { openProposal, storeBlock } from './proposalui';
import { afterOf, planOf } from './plan';
import { shelfGate } from './stock';
import { openShelfChoice } from './stockui';
import { btn, h, heroIcon, heroName, money, recLine, rich } from './ui';
import { assetUrl } from '../../render/images';
import { cardReact, sayToast } from './p2ui';
import { DUO_BY_ID } from './duo';

/** 小さい一行の適性（話し手の持ち場の仕事） */
const TASK_OF: Partial<Record<Card['src'], Task>> = { clerk: 'shop', crafter: 'craft', buyer: 'buy', cs: 'shop' };
const TASK_NM: Partial<Record<Task, () => string>> = { shop: () => t('販売', 'Selling'), craft: () => t('製造', 'Crafting'), buy: () => t('調達', 'Buying') };

export interface CardHooks {
  /** 選んで閉じたあと（地図・上の帯を描き直す。次のカードがあれば出す） */
  done: () => void;
  /** 画面を開く選択肢（税と節税・宣伝） */
  open?: (to: 'tax' | 'ads') => void;
}

/** 画面を開く選択肢の行き先（main.ts が結びつける。受け箱から開いたカードも同じ） */
export const cardNav: { open?: (to: 'tax' | 'ads') => void; done?: () => void } = {};

const ERR: Record<string, () => string> = {
  money: () => t('資金が足りません（受け箱に残しました）', 'Not enough funds (kept in the inbox)'),
  rp: () => t('研究ポイントが足りません（受け箱に残しました）', 'Not enough RP (kept in the inbox)'),
  stock: () => t('在庫がありません', 'No stock'),
  cool: () => t('まだ打てません', 'Not available yet'),
  gone: () => t('もう打てない手でした（受け箱から消しました）', 'That move is no longer possible (removed)'),
};

/** 段 P2：いま選んだ選択肢（閉じるときの承認／却下の反応） */
let picked: Card['choices'][number] | null = null;
/** カードの中身（顔・肩書き・名前・一言・セリフ・選択肢・下の一行） */
function panel(ctx: Ctx, s: P1State, c: Card, close: (res: ChooseRes | null, label: string) => void, quiet: () => void): HTMLElement {
  const role = roleOfCard(s, c);
  const p = h('div', `isl-cardm-panel is-${c.src}`);
  p.style.setProperty('--c', role.color);
  p.dataset.card = String(c.id);
  const inner = h('div', 'isl-cardm-in');
  // 上（話し手・一言・課題）と下（選択肢）。スマホは縦に並べて選択肢を下にそろえ、PC は左右に分ける
  const body = h('div', 'isl-cardm-body');
  const main = h('div', 'isl-cardm-main');
  // 話し手
  const who = h('div', 'isl-cardm-who');
  const face = h('div', 'isl-cardm-face');
  const eh = eventHead(s, c);
  if (c.src === 'diplo' && c.dip) {
    // 使者の顔（仮の絵：ランドの色と紋。docs/ISLAND_ART_TODO.md）
    const L = landDef(c.dip.land);
    const crest = h('div', 'isl-crest', L.icon);
    crest.style.setProperty('--lc', L.color);
    face.append(crest);
  } else if (c.hero != null) face.append(heroIcon(c.hero, 120));
  else {
    const mi = h('img');
    mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
    mi.alt = '';
    face.append(mi);
  }
  const id = h('div', 'isl-cardm-id');
  const nameTxt = eh && (c.hero == null || c.src === 'diplo') ? eh.title : c.hero != null ? heroName(c.hero) : t('マインちゃん', 'Mine-chan');
  id.append(h('span', 'isl-cardm-role', `${role.icon} ${role.text}`), h('b', 'isl-cardm-name', nameTxt));
  const st = c.hero != null ? staffOf(s, c.hero) : null;
  if (eh) id.append(h('small', 'isl-cardm-tag', c.hero != null && (c.src === 'event' || c.src === 'duo') ? eh.title : eh.tag));
  else if (st && c.hero != null) {
    const bits = [`Lv ${st.level ?? 1}`];
    const task = TASK_OF[c.src];
    if (task) bits.push(t(`${TASK_NM[task]?.() ?? ''}の適性 ${rankOf(aptitude(st.stats, task))}`, `${TASK_NM[task]?.() ?? ''} ${rankOf(aptitude(st.stats, task))}`));
    bits.push(t(`「${traitOf(c.hero)}」`, `“${traitOf(c.hero)}”`));
    id.append(h('small', 'isl-cardm-tag', bits.join(t(' ・ ', ' · '))));
  }
  who.append(face, id);
  main.append(who);
  // ウィットの一言（課題の説明とは分けて、吹き出しの上の 1 行）
  const quip = quipOfCard(c);
  if (quip) main.append(h('p', 'isl-cardm-quip', t(`— ${quip}`, `— ${quip}`)));
  // 課題のセリフ（数字の要所だけ色）
  const say = h('div', 'isl-cardm-say');
  say.append(t('「', '“'), rich(sayOf(s, c)), t('」', '”'));
  main.append(say);
  // 段 UI7f：倉庫の提案は、セリフが指すグラフ（月末の中身の棒・容量・同じペースの予想。推奨の手の承認後も重ねる）
  if (c.issue.k === 'store') {
    const ch = c.choices[shownRec(s, c)];
    const aft = ch?.act.k === 'do' ? afterOf(s, planOf(s, [ch.act.a], { hero: c.hero, q: c.q, dept: c.dept })) : null;
    const box = h('div', 'isl-cardm-chart');
    box.append(storeBlock(s, aft));
    main.append(box);
  }
  // 段 P2：組み合わせは、史実の一言（伝承・創作はそう書いてある）
  if (c.src === 'duo' && c.duo) main.append(h('small', 'isl-cardm-note', DUO_BY_ID[c.duo.id]?.note() ?? ''));
  body.append(main, h('div', 'isl-cardm-gap'));
  // 選択肢（下にそろえる。おすすめは金色）
  const chs = h('div', 'isl-cardm-ch');
  // 並び：おすすめ（金色）を 1 つ目に、ほかはもとの順（見込みの大きい順。「このまま」は最後）。選ぶときはもとの番号で
  // 段 UI7c：推奨の札は社長の経営方針の価値で（card.ts の shownRec）。任せる（★3）の手は、もとの推奨（お金の見込み）のまま
  const rk = shownRec(s, c);
  const order = c.choices.map((_, k) => k).sort((a, b) => Number(b === rk) - Number(a === rk) || a - b);
  for (const k of order) {
    const ch = c.choices[k];
    const isRec = k === rk;
    const x = choiceText(s, c, ch);
    const b = h('button', `isl-cardm-btn ${isRec ? 'is-rec' : ''}`);
    b.type = 'button';
    b.dataset.k = String(k);
    // 払えない手は理由を赤で（資金・研究ポイント）。おすすめは払える手のうち見込みのいちばん大きいもの
    const shortG = ch.cost > s.money && ch.act.k !== 'skip' ? ch.cost - s.money : 0;
    const shortRp = (ch.rp ?? 0) > (s.rp ?? 0) ? (ch.rp ?? 0) - (s.rp ?? 0) : 0;
    const why = shortRp ? t(`研究ポイント不足（あと ${shortRp} RP）`, `Short ${shortRp} RP`) : shortG ? t(`資金不足（あと ${money(shortG)}）`, `${money(shortG)} short`) : '';
    const lab = h('span', 'isl-cardm-lab');
    const sub = h('small', '');
    // 2 行目は「・」の区切りでだけ折り返す（「G／月」の途中で折り返さない）
    x.sub.split(/\s*・\s*/).forEach((part, n) => {
      if (n) sub.append(t('・', ' · '));
      sub.append(h('span', 'isl-nw', part));
    });
    // 段 UI5d：推奨の手には「推奨」の札。段 UI7b：提案書へ進む選択肢は「📄 提案書を見る」（部長との会話と同じ文言）
    lab.append(recLine(`${x.icon} ${x.label}`, isRec), sub);
    if (ch.act.k === 'do' || (ch.act.k === 'approve' && s.deleg?.inbox.some((p) => p.id === (ch.act as { pid: number }).pid))) lab.append(h('small', 'isl-cardm-go', t('📄 提案書を見る ›', '📄 See the proposal ›')));
    if (why) lab.append(h('small', 'isl-bad', why));
    b.append(lab);
    b.addEventListener('click', () => {
      // 段 UI5a：手のある選択肢（ヒーローの提案・部長の提案）は、担当者からの提案書を開く（As-Is／To-Be・期待効果・導入コスト → 承認でハンコ → 一気に変更）
      const plan = ch.act.k === 'do' || ch.act.k === 'approve' ? planOfChoice(s, c, k) : null;
      if (plan) {
        const prop = (p: typeof plan) =>
          openProposal(ctx, p, {
            say: sayOf(s, c),
            role: roleOfCard(s, c).text,
            later: true,
            rec: isRec,
            card: c.id,
            // 段 UI7d：出どころ（部長の提案・部長からの頼み。倉庫・在庫・担当者は手から決める）
            ...(c.src === 'head' ? { src: 'head' as const } : c.src === 'budget' ? { src: 'budget' as const } : {}),
            approve: (pp) => approveCard(s, c.id, pp),
            done: (w) => {
              // 段 P2：提案書を承認したら、承認の反応（史実の調査のあるヒーロー）
              if (w === 'ok' && PROPOSAL_SRC.includes(c.src)) sayToast(ctx.toast, c.hero, 'approved', c.id);
              if (w === 'ok' || w === 'later') quiet();
            },
          });
        // 段 UI5d：売りさばきで棚が 1 段のお店の主力が外れるときは、先に 3 択（主力を外す・残す・棚を拡張する（推奨））
        const gate = shelfGate(s, plan);
        if (gate.length) {
          openShelfChoice(ctx, plan, gate, (p) => {
            if (p) return prop(p);
            // 主力を残す（ほかに変えるものが無い）：このカードは「いまはこのままで」
            const skip = c.choices.findIndex((y) => y.act.k === 'skip');
            if (skip < 0) return;
            picked = c.choices[skip];
            close(chooseCard(s, c.id, skip), choiceText(s, c, c.choices[skip]).label);
          });
          return;
        }
        prop(plan);
        return;
      }
      const res = chooseCard(s, c.id, k);
      picked = ch;
      close(res, x.label);
    });
    chs.append(b);
  }
  if (canTrust(s, c)) {
    const x = trustText();
    const b = h('button', 'isl-cardm-btn is-trust');
    b.type = 'button';
    const lab = h('span', 'isl-cardm-lab');
    lab.append(h('b', '', `${x.icon} ${x.label}`), h('small', '', x.sub));
    b.append(lab);
    const rec = c.choices.find((y) => y.rec);
    const recLabel = rec ? choiceText(s, c, rec).label : '';
    b.addEventListener('click', () => close(trustCard(s, c.id), t(`🤝 ${heroName(c.hero!)}に任せました（${recLabel}）`, `🤝 Trusted ${heroName(c.hero!)} (${recLabel})`)));
    chs.append(b);
  }
  body.append(chs);
  inner.append(body);
  // 下の一行：読みの確かさ・あと何件
  const foot = h('div', 'isl-cardm-foot');
  const star = cardStar(s, c);
  if (c.src === 'diplo' && c.dip) foot.append(h('span', '', relTeaser(relOf(s, c.dip.land))));
  else if (c.src === 'event' && eh) foot.append(h('span', '', eh.tag));
  // 段 P2：組み合わせは、関係と条件
  else if (c.src === 'duo' && eh) foot.append(h('span', '', eh.tag));
  else if (star) foot.append(h('span', '', t(`読みの確かさ ${'★'.repeat(star)}${'☆'.repeat(3 - star)}（誤差 ±${Math.round((1 - c.q) * 100)}%）`, `Read ${'★'.repeat(star)}${'☆'.repeat(3 - star)} (±${Math.round((1 - c.q) * 100)}%)`)));
  else if (c.src === 'quit' && st) foot.append(h('span', '', t(`士気 ${Math.round(st.morale ?? 0)}`, `Morale ${Math.round(st.morale ?? 0)}`)));
  else foot.append(h('span', '', ''));
  const left = popLeft(s) - (c.seen ? 0 : 1);
  const box = cardInbox(s).length - 1;
  foot.append(h('span', '', left > 0 ? t(`あと ${left} 件`, `${left} more`) : box > 0 ? t(`受け箱 ${box} 件`, `${box} in inbox`) : ''));
  inner.append(foot);
  p.append(inner);
  return p;
}

/** カードを出す（時間が止まる）。選ぶと手を打って閉じる。足りないときはトーストで知らせてカードを残す */
export function showCard(ctx: Ctx, c: Card, hooks: CardHooks) {
  const s = ctx.s();
  markSeen(s, c.id);
  ctx.root.querySelector('.isl-cardm')?.remove();
  const m = h('div', 'isl-modal isl-cardm');
  const close = (res: ChooseRes | null, label: string) => {
    if (res && !res.ok && (res.err === 'money' || res.err === 'rp' || res.err === 'stock' || res.err === 'cool')) {
      ctx.sfx?.('error');
      ctx.toast(ERR[res.err]());
      if (res.err !== 'money' && res.err !== 'rp') return;
    } else if (res && !res.ok) {
      ctx.sfx?.('error');
      ctx.toast(ERR.gone());
    } else if (res?.ok) {
      ctx.sfx?.(label && res.open ? 'page' : 'levelup');
      if (!res.open) ctx.toast(res.did ? `✔ ${res.did}` : label.startsWith('🤝') ? label : t(`✔ ${label}`, `✔ ${label}`));
    }
    // 段 P2：承認／却下の反応（史実の調査のあるヒーロー。トーストはカードを閉じたあとに出る）
    if (res && picked) cardReact(ctx.toast, c, picked, res);
    picked = null;
    m.remove();
    ctx.save();
    if (res?.open) hooks.open?.(res.open);
    hooks.done();
  };
  // 提案書から承認した・あとでにした：カードを閉じる（トーストは提案書が出した）
  const quiet = () => {
    m.remove();
    ctx.save();
    hooks.done();
  };
  m.append(panel(ctx, s, c, close, quiet));
  ctx.root.append(m);
  ctx.sfx?.('page');
}

/** 受け箱（経営企画 → 部長の提案）の上の「ヒーローからの提案・報告」と「任せている提案」 */
export function cardInboxCard(ctx: Ctx): HTMLElement {
  const s = ctx.s();
  const hooks: CardHooks = { done: () => (cardNav.done ? cardNav.done() : after(ctx)), open: (to) => cardNav.open?.(to) };
  const c = h('div', 'isl-card2 isl-cardbox');
  const list = cardInbox(s).filter((x) => x.src !== 'head');
  c.append(h('h3', '', t(`ヒーローからの提案・報告（${list.length}）`, `From your heroes (${list.length})`)));
  if (!list.length) c.append(h('small', 'isl-dim', t('月の締めのあとに、持ち場のヒーローや手の空いたヒーローが提案を持ってきます。時間を止めて出すのは月に数枚まで（あふれたものはここに入ります）。', 'After each monthly close, heroes at their posts or with free hands bring proposals. Only a few a month pop up; the rest wait here.')));
  for (const x of list) {
    const role = roleOfCard(s, x);
    const row = h('button', 'isl-cardbox-row');
    row.type = 'button';
    row.style.setProperty('--c', role.color);
    if (x.hero != null) row.append(heroIcon(x.hero, 40));
    const txt = h('span', 'isl-cardbox-txt');
    const say = h('small', '');
    say.append(rich(sayOf(s, x)));
    txt.append(h('b', '', `${role.icon} ${role.text}${x.hero != null ? `・${heroName(x.hero)}` : ''}`), say);
    row.append(txt, h('span', 'isl-tag', x.held ? t('資金不足', 'Short of funds') : t('開く', 'Open')));
    row.addEventListener('click', () => showCard(ctx, x, hooks));
    c.append(row);
  }
  const tr = s.cards?.trust ?? [];
  if (tr.length) {
    c.append(h('h4', '', t('任せている提案（自分で実行して報告）', 'Trusted (they act, then report)')));
    for (const key of tr) {
      const row = h('div', 'isl-row isl-cardbox-trust');
      row.append(h('span', '', `🤝 ${trustName(key)}`), btn(t('戻す', 'Undo'), () => {
        untrust(s, key);
        ctx.toast(t('任せるのをやめました。次からカードで聞きます', 'No longer trusted. They will ask you again'));
        after(ctx);
      }));
      c.append(row);
    }
  }
  return c;
}
