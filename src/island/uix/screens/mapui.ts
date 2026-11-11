/**
 * 段 UIX2m：地図の上の常設の UI を、新しい画面（方向 C「管制卓」）へ入れ替える入口（入のときだけ p1/main.ts が動的に読む）。
 * 上の帯・テロップ・地図の上の札（hud.ts）・下の帯（dock.ts）・建物の吹き出し（pop.ts）。docs/ISLAND_UIX.md の「画面：」の節。
 */
import './hud.css';
import './pop.css';
import { buildHud, dressMapUi, dressTicker } from './hud';
import { dressDock } from './dock';
import { uxm, type UxmHost } from './mhooks';
import { installPop } from './pop';

let done = false;
export function installMapUi(host: UxmHost) {
  if (done || typeof document === 'undefined') return;
  done = true;
  const { root } = host;
  const hud = buildHud(host);
  const ticker = dressTicker(host.news);
  dressMapUi(root);
  dressDock(host.foot);
  const pop = installPop(host);
  root.classList.add('uxm-on');

  /** 札が地図を覆っているあいだ（幕が閉じきったあと）は、見えない動きを休ませる */
  let rest = false;
  const resting = () => !!root.querySelector(':scope > .isl-sheet:not(.ux-wait)');
  uxm.hud = () => hud.sync();
  uxm.frame = () => {
    const r = resting();
    if (r !== rest) {
      rest = r;
      root.classList.toggle('uxm-rest', r);
    }
    if (r) return;
    hud.paintMeters();
    ticker.frame();
  };
  uxm.pop = (title) => pop.render(title);
  uxm.placePop = () => pop.place();
  uxm.popCam = (i, j, size) => pop.cam(i, j, size);
  uxm.popClose = () => pop.close();
  // 組み終えたら、今の描き直しをもう一度（帯の高さ・札の置き場所を新しい寸法で決め直す）
  host.refresh();
}
