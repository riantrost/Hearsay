// ui.js — tiny DOM helpers and a modal/sheet system shared by every screen.
// No framework: el() builds nodes, mount() swaps a screen, openSheet() shows a
// bottom sheet / dialog. Kept deliberately small so the app stays buildless.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'value') node.value = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

const root = () => document.getElementById('app');

export function mount(node) {
  const r = root();
  clear(r);
  r.appendChild(node);
}

// ---- bottom-sheet / dialog -------------------------------------------------

let sheetEl = null;

export function openSheet(title, bodyNode, { wide = false } = {}) {
  closeSheet();
  const panel = el('div', { class: 'sheet' + (wide ? ' sheet--wide' : '') }, [
    el('div', { class: 'sheet__grip' }),
    el('div', { class: 'sheet__head' }, [
      el('h2', { text: title }),
      el('button', { class: 'iconbtn', 'aria-label': 'Close', onclick: closeSheet, html: '&times;' }),
    ]),
    el('div', { class: 'sheet__body' }, bodyNode),
  ]);
  const overlay = el('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) closeSheet(); } }, [panel]);
  sheetEl = overlay;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('overlay--in'));
  return overlay;
}

export function closeSheet() {
  if (!sheetEl) return;
  const n = sheetEl;
  sheetEl = null;
  n.classList.remove('overlay--in');
  setTimeout(() => n.remove(), 180);
}

export function toast(msg) {
  const t = el('div', { class: 'toast', text: msg });
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast--in'));
  setTimeout(() => { t.classList.remove('toast--in'); setTimeout(() => t.remove(), 250); }, 2200);
}

export function confirmDialog(message, { danger = false, okLabel = 'Confirm' } = {}) {
  return new Promise((resolve) => {
    const body = el('div', {}, [
      el('p', { class: 'muted', text: message, style: { marginTop: '0' } }),
      el('div', { class: 'row row--end' }, [
        el('button', { class: 'btn', text: 'Cancel', onclick: () => { closeSheet(); resolve(false); } }),
        el('button', { class: 'btn ' + (danger ? 'btn--danger' : 'btn--primary'), text: okLabel,
          onclick: () => { closeSheet(); resolve(true); } }),
      ]),
    ]);
    openSheet('', body);
  });
}
