/**
 * 段 UIX4r：依頼（ミッション）の一覧（p1/screens.ts の openMissions。器は今の札・押した先は今と同じ関数）。
 * 依頼は一覧のカード：差出人の貼り札・題・中身・進みの計器・報酬（金貨の絵と数字）。受ける・受け取るは押し込むと札が打たれる。
 */
import { t } from '../../../i18n';
import type { Ctx } from '../../p1/screens';
import type { Mission } from '../../p1/data';
import { el } from '../dom';
import { uxKey, uxLamp, uxMeter, uxTape } from '../parts';
import { uxpCard, uxpEmpty, uxpStamp } from '../sparts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { R } from './r-deps';
import { hIcon, keyLabel } from './h-kit';
import { rHead, rLine } from './sector';

const ink = { color: '#1a1c2e', hi: '#1a1c2e', lo: '#8a7f5c', scale: 1 };
const amb = { color: '#ffb81f', hi: '#ffe394', lo: '#7a3f06', scale: 1 };

/** 主役のキー（前の層）にする依頼：受け取れる報酬があればそれ、無ければ（まだ受けられるとき）届いている最初の依頼 */
export function mainMission<M>(active: M[], offers: M[], done: (m: M) => boolean, max: number): M | undefined {
  return active.find(done) ?? (active.length < max ? offers[0] : undefined);
}

export function missionsUx(ctx: Ctx) {
  R.open(ctx, t('依頼（ミッション）', 'Requests (missions)'), (body) => {
    const s = ctx.s();
    body.classList.add('uxr-mi-body');
    const root = el('div.uxr-mi.ux-root');
    root.append(rLine('note', t(`エリアの人たちからの依頼です。受けた依頼は右上の「ミッション」に出て、達成すると報酬がもらえます（同時に ${R.MISSION_MAX} つまで）。`, `Requests from people in the area. Accepted ones appear under Missions at the top right; complete them for a reward (up to ${R.MISSION_MAX} at once).`), 'dim'));
    const active = R.activeMissions(s);
    const offers = R.offeredMissions(s);
    const main = mainMission(active, offers, (m) => s.missions[m.id] === 'done', R.MISSION_MAX);
    let i = 0;
    const card = (m: Mission) => {
      const st = s.missions[m.id];
      const stamp = uxpStamp(st === 'done' ? t('受取済', 'Claimed') : t('受注', 'Accepted'), { kind: st === 'done' ? 'amber' : 'good' });
      const pr = R.missionProgress(s, m.id);
      const foot: HTMLElement[] = [];
      if (pr && st === 'accepted') {
        const mt = uxMeter(isCalm() ? pr[0] / pr[1] : 0, 'good');
        if (!isCalm()) requestAnimationFrame(() => requestAnimationFrame(() => mt.set(pr[0] / pr[1])));
        foot.push(el('span.uxr-mi-pr', mt.el, el('span.ux-num', `${pr[0]} / ${pr[1]}`)));
      }
      foot.push(el('span.uxr-mi-rw', hIcon('coin', amb), el('b', R.rewardText(m))));
      if (m.note && !st) foot.push(rLine('warn', m.note, 'warn'));
      let right: HTMLElement;
      let c: HTMLElement;
      if (st === 'done')
        right = uxKey(
          keyLabel('coin', t('報酬を受け取る', 'Claim')),
          () => {
            const e = R.claim(s, m.id);
            if (!e) {
              uxSfx('cash');
              stamp.hit(c);
              ctx.toast(t(`${R.rewardText(m)} を受け取りました`, `Received: ${R.rewardText(m)}`));
            }
            if (isCalm()) R.after(ctx);
            else setTimeout(() => R.after(ctx), 360);
          },
          { kind: m === main ? 'main' : '', cls: 'uxr-mi-key' },
        );
      else if (st === 'accepted') right = el('span.uxr-mi-on', uxLamp('good', true, !isCalm()), el('b', t('進行中', 'In progress')));
      else
        right = uxKey(
          keyLabel('check', t('依頼を受ける', 'Accept')),
          () => {
            const e = R.accept(s, m.id);
            if (e === 'full') {
              uxSfx('deny');
              ctx.toast(t(`同時に受けられるのは ${R.MISSION_MAX} つまでです`, `Up to ${R.MISSION_MAX} at once`));
              return;
            }
            if (!e && s.missions[m.id] === 'done') {
              // 受けた時点で条件を満たしていた：その場で達成。報酬は「報酬を受け取る」で
              R.after(ctx);
              ctx.sfx?.('mission');
              ctx.toast(t('もう達成しているね！ 報酬を受け取ろう', 'Already done! Claim the reward'));
              return;
            }
            if (!e) {
              stamp.hit(c);
              ctx.toast(t(`「${m.title}」を受けました。右上のミッションに出ます`, `Accepted “${m.title}”. It shows under Missions at the top right`));
            }
            if (isCalm()) R.after(ctx);
            else setTimeout(() => R.after(ctx), 360);
          },
          { kind: m === main ? 'main' : '', cls: 'uxr-mi-key' },
        );
      c = uxpCard({
        pic: el('span.uxr-mi-pic', hIcon(st === 'done' ? 'trophy' : st === 'accepted' ? 'flag' : 'mail', { ...(st ? amb : { ...amb, color: '#f4ecd4', hi: '#fffdf3', lo: '#0b0d17' }), scale: 3 })),
        name: el('span.uxr-mi-name', el('b', m.title), stamp.el),
        tags: uxTape(el('b', m.from), 'dark'),
        desc: m.text,
        foot,
        right,
        cls: `uxr-mi-card isl-mission${st === 'done' ? ' is-done' : ''}${st === 'accepted' ? ' is-on' : ''}`,
        attrs: { 'data-mission': m.id, style: `--d:${Math.min(i++, 8) * 40}ms` },
      });
      return c;
    };
    // 受けている依頼（数のランプ：受けた数 / 同時に受けられる数）
    const lamps = el('span.uxr-mi-lamps', Array.from({ length: R.MISSION_MAX }, (_, k) => uxLamp('', k < active.length)));
    if (active.length) root.append(rHead(t('受けている依頼', 'Accepted'), 'flag', { right: lamps }), el('div.uxp-list', active.map(card)));
    root.append(rHead(t('届いている依頼', 'Offers'), 'mail', { kind: 'dark', right: active.length ? null : lamps }));
    if (!offers.length) root.append(uxpEmpty(t('いまは新しい依頼がありません。', 'No new requests right now.'), { ico: 'note' }));
    else root.append(el('div.uxp-list', offers.map(card)));
    const n = R.MISSIONS.filter((m) => s.missions[m.id] === 'claimed').length;
    const mt = uxMeter(n / Math.max(1, R.MISSIONS.length), 'cyan');
    root.append(el('div.uxr-mi-sum', el('span', hIcon('trophy', { ...ink, color: '#97a1cf', hi: '#c9cff0', lo: '#0b0d17' }), t('報酬を受け取った依頼', 'Claimed')), mt.el, el('b.ux-num', `${n} / ${R.MISSIONS.length}`)));
    body.append(root);
  });
}
