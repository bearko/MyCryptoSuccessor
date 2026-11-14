/**
 * 提案・報告のカードの画面（段 UI1）：画面いっぱいのポップアップ（端に少し隙間を空けて後ろの町が見える）。
 * 顔（大きく）・肩書きの札（部門の色）・名前・小さい一行（Lv・適性・性格の一言）・ウィットの一言・課題のセリフ・下にそろえた 2〜3 択（おすすめは金色）・
 * 下の一行（読みの確かさ ★・あと何件）。出ているあいだは時間が止まり（.isl-modal）、選ぶ以外の操作はできない（暗幕）。
 * 計算と文は card.ts（DOM なし）。仕様は docs/ISLAND_PHASE1.md「提案・報告のカード」。
 */
import { t } from '../../i18n';
import {
  approveCard,
  planOfChoice,
  PROPOSAL_SRC,
  choiceText,
  goneLine,
  staleCard,
  chooseCard,
  markSeen,
  roleOfCard,
  sayOf,
  trustOn,
  speechOf,
  type Card,
  type ChooseRes,
} from './card';
import { type P1State } from './model';
import { type Ctx } from './screens';
import { openProposal } from './proposalui';
import { shelfGate } from './stock';
import { openShelfChoice } from './stockui';
import { h, heroName } from './ui';
import { ux } from '../uix/hooks';
import { uxd } from '../uix/screens/d-slots';
import { cardReact, sayToast } from './p2ui';
import { DUO_BY_ID } from './duo';

/** 段 UIX3d：組み合わせのカードの史実の一言（新しい画面へ渡す。今の画面の duo の行と同じ中身） */
export const duoNoteOf = (c: Card) => (c.src === 'duo' && c.duo ? (DUO_BY_ID[c.duo.id]?.note() ?? '') : null);

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

/**
 * 選択肢を選んだ（段 UIX3d：今の画面と新しい画面で同じ処理を使うために切り出した。段 UIX5a から新しい画面だけが使う）：
 * 手のある選択肢は提案書を開く（棚が 1 段のお店は先に 3 択）。ほかはその場で手を打って閉じる
 */
export function cardChoose(ctx: Ctx, s: P1State, c: Card, k: number, isRec: boolean, label: string, close: (res: ChooseRes | null, label: string) => void, quiet: () => void, delegOn: () => boolean) {
  const ch = c.choices[k];
  // 段 UI5a：手のある選択肢（ヒーローの提案・部長の提案）は、担当者からの提案書を開く（As-Is／To-Be・期待効果・導入コスト → 承認でハンコ → 一気に変更）
  const plan = ch.act.k === 'do' || ch.act.k === 'approve' ? planOfChoice(s, c, k) : null;
  if (plan) {
    const prop = (p: typeof plan) =>
      openProposal(ctx, p, {
        say: sayOf(s, c, k),
        speech: speechOf(s, c, k) ?? undefined,
        role: roleOfCard(s, c).text,
        later: true,
        rec: isRec,
        card: c.id,
        iss: c.issues,
        // 段 UI7d：出どころ（部長の提案・部長からの頼み。倉庫・在庫・担当者は手から決める）
        ...(c.src === 'head' ? { src: 'head' as const } : c.src === 'budget' ? { src: 'budget' as const } : {}),
        approve: (pp) => approveCard(s, c.id, pp),
        done: (w) => {
          // 段 UI9b：「今後の判断を委任」がオンなら、承認したあと同じ種類の手は次からこの担当に任せる
          if (w === 'ok' && delegOn() && trustOn(s, c)) ctx.toast(t(`🤝 ${heroName(c.hero!)}に、同じ種類の手を任せました（受け箱からいつでも戻せます）`, `🤝 Trusted ${heroName(c.hero!)} with this kind of move (undo any time from the inbox)`));
          // 段 P2：提案書を承認したら、承認の反応（史実の調査のあるヒーロー）
          if (w === 'ok' && PROPOSAL_SRC.includes(c.src)) sayToast(ctx.toast, c.hero, 'approved', c.id);
          if (w === 'ok' || w === 'later' || w === 'gone') quiet();
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
  close(res, label);
}

/** カードを出す（時間が止まる）。選ぶと手を打って閉じる。足りないときはトーストで知らせてカードを残す */
export function showCard(ctx: Ctx, c: Card, hooks: CardHooks) {
  const s = ctx.s();
  // 段 UI7h：開く前に同じ判断でもう一度見る。推奨が承認にならなくなっていたら、見せずに取り下げ（理由の一行）
  const g = staleCard(s, c);
  if (g) {
    ctx.toast(`🗂 ${goneLine(g)}`);
    ctx.save();
    hooks.done();
    return;
  }
  markSeen(s, c.id);
  ctx.root.querySelector('.isl-cardm')?.remove();
  const m = h('div', 'isl-modal isl-cardm');
  ux.modal?.(m, 'card');
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
  // 段 UIX3d：新しい画面の中身（器・閉じ方は今のまま）
  m.append(uxd.cardPanel!(ctx, c, { close, quiet }));
  ctx.root.append(m);
  ctx.sfx?.('page');
}

/** 受け箱（経営企画 → 部長の提案）の上の「ヒーローからの提案・報告」と「任せている提案」 */
export function cardInboxCard(ctx: Ctx): HTMLElement {
  return uxd.inbox!(ctx);
}

/** 段 UI7h：今月取り下げた提案の一行ずつ（「状況が変わったので、○○は取り下げました（理由：…）」）。無ければ null */
export function goneBox(s: P1State): HTMLElement | null {
  return uxd.gone!(s);
}
export function issueList(s: P1State): HTMLElement {
  return uxd.issues!(s);
}
