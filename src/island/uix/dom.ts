/** 段 UIX1a：新しい部品の DOM の道具。el('div.ux-a.ux-b', {attrs}, ...children) */
export type Kid = Node | string | number | null | undefined | false | Kid[];
type Attrs = Record<string, unknown>;

export function el<T extends HTMLElement = HTMLElement>(sel: string, attrs?: Attrs | Kid, ...kids: Kid[]): T {
  const [tag, ...cls] = sel.split('.');
  const e = document.createElement(tag || 'div');
  if (cls.length) e.className = cls.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs as Kid);
    attrs = undefined;
  }
  if (attrs)
    for (const [k, v] of Object.entries(attrs as Attrs)) {
      if (v == null || v === false) continue;
      if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'html') e.innerHTML = String(v);
      else e.setAttribute(k, v === true ? '' : String(v));
    }
  const put = (k: Kid) => {
    if (k == null || k === false) return;
    if (Array.isArray(k)) k.forEach(put);
    else e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  };
  kids.forEach(put);
  return e as T;
}

/** 数字を 3 桁区切りに */
export const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');
