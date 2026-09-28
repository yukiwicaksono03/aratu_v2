// Keep navigation state outside photo history: editing must not reset the user's place.
const SCROLL_REGIONS = ['.filter-grid', '.subtool-row', '.ratio-grid', '.filter-categories', '.layers'];
const CONTROLS = 'button, input, textarea, select';
const position = node => ({ left: node.scrollLeft, top: node.scrollTop });
function identify(node) {
  return JSON.stringify([node.tagName, node.id, node.dataset.action, node.dataset.value, node.dataset.path, node.dataset.color]);
}

export class PanelViewMemory {
  constructor() { this.views = new Map(); this.current = null; }

  replace(root, html, tool, view = '') {
    const key = JSON.stringify([tool, view]);
    const focused = root.ownerDocument.activeElement;
    const focusIdentity = this.current?.tool === tool && root.contains(focused) && focused.matches(CONTROLS)
      ? identify(focused) : null;
    if (this.current) {
      const regions = new Map();
      for (const selector of SCROLL_REGIONS) {
        const node = root.querySelector(selector);
        if (node) regions.set(selector, position(node));
      }
      this.views.set(this.current.key, { root: position(root), regions });
    }

    root.innerHTML = html;
    this.current = { key, tool };
    // Restoring keyboard focus must not scroll the panel or its surrounding page.
    if (focusIdentity) {
      const replacement = [...root.querySelectorAll(CONTROLS)].find(node => identify(node) === focusIdentity);
      replacement?.focus({ preventScroll: true });
    }
    const saved = this.views.get(key);
    for (const selector of SCROLL_REGIONS) {
      const node = root.querySelector(selector), offset = saved?.regions.get(selector);
      if (node) { node.scrollLeft = offset?.left || 0; node.scrollTop = offset?.top || 0; }
    }
    // Restore synchronously after layout is available; no delayed callback can undo a new swipe.
    root.scrollLeft = saved?.root.left || 0;
    root.scrollTop = saved?.root.top || 0;
  }
}
