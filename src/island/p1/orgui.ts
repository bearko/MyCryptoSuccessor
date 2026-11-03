/**
 * 組織図の画面（段 UI5b。人材管理の「組織管理」：人事 → ヒーローの配置の中。org.ts の orgChart を木の形で描く）。
 * 初めはどの席も「あなた（自分）」。席を押すと候補のヒーロー（出来・★・いまの持ち場）から選んで決める。外す（自分に戻す）もここから。
 * 顔を押すとそのヒーローの詳細（育成）。役職（事業部長・セクター長）は兼任しない（固有の能力のヒーローを除く。model.ts の canHoldRole）。
 * スマホでも読めるように、字は 12px 以上・縦に 1 列の木。
 */
import { t } from '../../i18n';
import { DEPT, DUTY, MORALE, aptitude } from './data';
import { sectorDef } from './company';
import { heroNm, setHead, setLeader } from './deleg';
import { done, pickFor, pickHead } from './delegui';
import { openGrowth } from './growthui';
import { jobLabel, pickHero } from './heroui';
import { orgChart, orgCounts, type Seat } from './org';
import { setSectorHead, staffOf, type P1State } from './model';
import { after, open, type Ctx } from './screens';
import { h, heroIcon } from './ui';

const stars = (n: number) => `${'★'.repeat(n)}${'☆'.repeat(3 - n)}`;

/** 席の 1 行：左に顔（押すと詳細）・右に役目と人（押すと割り当て）。空席は「あなた」（自分で回している） */
function seatEl(ctx: Ctx, s: P1State, seat: Seat, label: string, onAssign: (() => void) | null): HTMLElement {
  const row = h('div', `isl-org-seat is-${seat.kind} ${seat.hero == null ? (seat.open ? 'is-me' : 'is-lock') : ''}`);
  if (seat.dept) row.style.setProperty('--c', DEPT[seat.dept].color);
  const role = h('small', 'isl-org-role', label);
  const info = h('button', 'isl-org-info');
  info.type = 'button';
  if (seat.hero != null) {
    const st = staffOf(s, seat.hero);
    const face = h('button', 'isl-org-facebtn');
    face.type = 'button';
    face.append(heroIcon(seat.hero, 36));
    face.title = t(`${heroNm(seat.hero)}の詳細（育成）`, `${heroNm(seat.hero)}: details (growth)`);
    face.addEventListener('click', () => openGrowth(ctx, seat.hero!));
    const meta = h('span', 'isl-org-meta');
    if (seat.star) meta.append(h('span', 'isl-org-star', stars(seat.star)));
    if (seat.morale != null) meta.append(h('span', `isl-org-morale ${seat.morale < MORALE.band.lo ? 'is-low' : ''}`, t(`士気 ${seat.morale}`, `Morale ${seat.morale}`)));
    // 部長が町の持ち場も持っている（兼ねてよい）
    if (st && (seat.kind === 'post' || (seat.kind === 'head' && st.task))) meta.append(h('span', 'isl-dim', jobLabel(s, st)));
    info.append(role, h('b', '', heroNm(seat.hero)), meta);
    row.append(face, info);
  } else {
    info.append(role, h('b', '', seat.open || seat.kind === 'sector' ? t('あなた（押して人を置く）', 'You (tap to appoint)') : seat.lock ? t(`あなた・🔒 理解度 ${seat.lock.at} で人を置ける（いま ${seat.lock.now}）`, `You · 🔒 appoint at understanding ${seat.lock.at} (now ${seat.lock.now})`) : t('あなた', 'You')));
    row.append(h('span', 'isl-org-face', seat.open || seat.kind === 'sector' ? '👤' : '🔒'), info);
  }
  if (onAssign && (seat.hero != null || seat.open || seat.kind === 'sector')) info.addEventListener('click', onAssign);
  else info.disabled = true;
  return row;
}

/** 組織図（人事 → ヒーローの配置にまとめた画面の 1 つ） */
export function openOrg(ctx: Ctx) {
  open(ctx, t('組織図', 'Org chart'), (body) => {
    const s = ctx.s();
    const o = orgChart(s);
    const n = orgCounts(o);
    body.classList.add('isl-org');
    body.append(h('p', 'isl-dim isl-org-lead', t(`初めはどの席も「あなた」。席を押すとヒーローを置けます（外すとあなたに戻る）。部長は町の持ち場と兼ねてよく、部長・セクター長どうしは兼ねられません。人を置いた席 ${n.filled}・置ける席 ${n.open}。`, `Every seat starts as “you”. Tap a seat to appoint a hero (remove to take it back). Heads may also work a post, but can’t hold two head posts. Filled ${n.filled} · open ${n.open}.`)));
    const tree = h('div', 'isl-org-tree');
    // 社長（プレイヤー）
    const ceo = h('div', 'isl-org-ceo');
    const ci = h('span', 'isl-org-info');
    ci.append(h('small', 'isl-org-role', t('社長・経営企画部', 'President · Strategy')), h('b', '', t('あなた', 'You')));
    ceo.append(h('span', 'isl-org-face is-ceo', '👑'), ci);
    tree.append(ceo);
    // 本社：事業部長とチームリーダー・持ち場
    const hq = h('div', 'isl-org-branch');
    hq.append(h('h3', 'isl-org-h', t('本社（事業部長）', 'Head office (division heads)')));
    for (const d of o.depts) {
      const D = DEPT[d.dept];
      const box = h('div', 'isl-org-dept');
      box.style.setProperty('--c', D.color);
      const head = h('div', 'isl-org-dhead');
      head.append(h('b', 'isl-org-dname', `${D.icon} ${D.name}`));
      box.append(head);
      const headTitle = t(`${D.name}部長`, `${D.name} head`);
      if (d.byCeo) box.append(h('small', 'isl-dim isl-org-note', t('部長は社長（あなた）', 'Run by you, the president')));
      else
        box.append(
          seatEl(ctx, s, d.head, headTitle, () =>
            pickHead(
              ctx,
              d.dept,
              d.head.hero,
              (hero) => done(ctx, setHead(s, d.dept, hero), t(`${heroNm(hero)}を${D.name}部長にしました`, `${heroNm(hero)} now heads ${D.name}`)),
              () => done(ctx, setHead(s, d.dept, null), t(`${D.name}部長を外しました（あなたに戻る）`, `${D.name} head removed (back to you)`)),
            ),
          ),
        );
      const sub = h('div', 'isl-org-sub');
      for (const L of d.leaders) {
        const title = t(`リーダー・${DUTY[L.duty!].name}`, `Leader · ${DUTY[L.duty!].name}`);
        sub.append(
          seatEl(ctx, s, L, title, () =>
            pickFor(
              ctx,
              d.dept,
              title,
              L.hero,
              (hero) => done(ctx, setLeader(s, L.duty!, hero), t(`${heroNm(hero)}を${DUTY[L.duty!].name}のリーダーにしました`, `${heroNm(hero)} now leads ${DUTY[L.duty!].name}`)),
              () => done(ctx, setLeader(s, L.duty!, null), t('リーダーを外しました（あなたに戻る）', 'Leader removed (back to you)')),
            ),
          ),
        );
      }
      if (d.posts.length) {
        const posts = h('div', 'isl-org-posts');
        posts.append(h('small', 'isl-org-role', t(`持ち場（${d.posts.length}）`, `Posts (${d.posts.length})`)));
        for (const p of d.posts) posts.append(seatEl(ctx, s, p, t('持ち場', 'Post'), null));
        sub.append(posts);
      }
      if (sub.childElementCount) box.append(sub);
      hq.append(box);
    }
    tree.append(hq);
    // セクター長
    const sec = h('div', 'isl-org-branch');
    sec.append(h('h3', 'isl-org-h', t('セクター長（町ごと）', 'Sector heads (per town)')));
    for (const x of o.sectors) {
      const box = h('div', 'isl-org-dept is-sector');
      const head = h('div', 'isl-org-dhead');
      head.append(h('b', 'isl-org-dname', `🏛 ${sectorDef(x.sector).name}`), h('small', 'isl-dim', x.people == null ? '' : t(`従業員 ${x.people} 人`, `${x.people} staff`)));
      box.append(head);
      const title = t(`「${sectorDef(x.sector).name}」のセクター長`, `Sector head for ${sectorDef(x.sector).name}`);
      if (x.here) box.append(h('small', 'isl-dim isl-org-note', t('いま居る町：あなたが直接見ています', 'Where you are: run by you directly')));
      else
        box.append(
          seatEl(ctx, s, x.head, t('セクター長', 'Sector head'), () =>
            pickHero(ctx.root, s, {
              title,
              task: 'manager',
              current: x.head.hero,
              extra: (st) => t(`経営の適性 ${Math.round(aptitude(st.stats, 'manager'))}`, `Mgmt ${Math.round(aptitude(st.stats, 'manager'))}`),
              onPick: (hero) => {
                if (hero == null) {
                  // 外す：その町はセクター長なし（あなたが遠くから見る）
                  const cur = x.head.hero != null ? staffOf(s, x.head.hero) : null;
                  if (cur && cur.task === 'manager') {
                    cur.task = null;
                    cur.target = null;
                  }
                  const rec = s.land?.recs[x.sector];
                  if (rec) rec.manager = null;
                  ctx.toast(t('セクター長を外しました（あなたに戻る）', 'Sector head removed (back to you)'));
                } else if (setSectorHead(s, x.sector, hero)) ctx.toast(t('いまの仕事・役目を外して、セクター長にしました', 'Moved from their current job or role'));
                after(ctx);
              },
            }),
          ),
        );
      sec.append(box);
    }
    tree.append(sec);
    // 待機中
    if (o.idle.length) {
      const idle = h('div', 'isl-org-branch');
      idle.append(h('h3', 'isl-org-h', t(`待機中（${o.idle.length}）`, `Free (${o.idle.length})`)));
      const row = h('div', 'isl-org-idle');
      for (const id of o.idle) {
        const b = h('button', 'isl-org-chip');
        b.type = 'button';
        b.append(heroIcon(id, 28), h('span', '', heroNm(id)));
        b.addEventListener('click', () => openGrowth(ctx, id));
        row.append(b);
      }
      idle.append(row);
      tree.append(idle);
    }
    body.append(tree);
  });
}
