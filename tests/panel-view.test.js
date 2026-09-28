import test from 'node:test';
import assert from 'node:assert/strict';
import { PanelViewMemory } from '../src/panel-view.js';

// Model DOM replacement explicitly: every render creates new controls and scroll containers.
// Browser layout itself is not simulated; these tests cover preservation across replacement.
function fixture() {
  const document = { activeElement: null };
  const root = {
    ownerDocument: document, scrollLeft: 0, scrollTop: 0, regions: new Map(), controls: [],
    querySelector(selector) { return this.regions.get(selector) || null; },
    querySelectorAll() { return this.controls; },
    contains(node) { return this.controls.includes(node); },
    set innerHTML({ region, controls = [] }) {
      this.scrollLeft = this.scrollTop = 0;
      this.regions = new Map(region ? [[region, { scrollLeft: 0, scrollTop: 0 }]] : []);
      this.controls = controls.map(value => ({
        tagName: 'BUTTON', id: '', dataset: { action: 'choose', value },
        matches: () => true,
        focus(options) { this.focusOptions = options; document.activeElement = this; },
      }));
    },
  };
  return root;
}

for (const [tool, region] of [['filters', '.filter-grid'], ['adjust', '.subtool-row'], ['crop', '.ratio-grid']]) {
  test(`${tool}: choosing an option preserves horizontal and vertical scroll after panel replacement`, () => {
    const memory = new PanelViewMemory(), root = fixture(), content = { region, controls: ['first', 'last'] };
    memory.replace(root, content, tool);
    root.scrollTop = 124; root.querySelector(region).scrollLeft = 386;
    const oldRegion = root.querySelector(region);
    memory.replace(root, content, tool);
    assert.notEqual(root.querySelector(region), oldRegion);
    assert.equal(root.querySelector(region).scrollLeft, 386);
    assert.equal(root.scrollTop, 124);
  });
}
test('each filter category and tool remembers its own position when revisited', () => {
  const memory = new PanelViewMemory(), root = fixture(), filters = { region: '.filter-grid' };
  memory.replace(root, filters, 'filters', 'Semua');
  root.querySelector('.filter-grid').scrollLeft = 410; root.scrollTop = 20;
  memory.replace(root, filters, 'filters', 'Film');
  assert.equal(root.querySelector('.filter-grid').scrollLeft, 0);
  root.querySelector('.filter-grid').scrollLeft = 190;
  memory.replace(root, { region: '.subtool-row' }, 'adjust');
  root.querySelector('.subtool-row').scrollLeft = 270;
  memory.replace(root, filters, 'filters', 'Semua');
  assert.equal(root.querySelector('.filter-grid').scrollLeft, 410);
  assert.equal(root.scrollTop, 20);
  memory.replace(root, filters, 'filters', 'Film');
  assert.equal(root.querySelector('.filter-grid').scrollLeft, 190);
  memory.replace(root, { region: '.subtool-row' }, 'adjust');
  assert.equal(root.querySelector('.subtool-row').scrollLeft, 270);
});
test('the selected keyboard control regains focus without scrolling', () => {
  const memory = new PanelViewMemory(), root = fixture(), content = { region: '.filter-grid', controls: ['first', 'noir'] };
  memory.replace(root, content, 'filters');
  root.ownerDocument.activeElement = root.controls[1];
  root.querySelector('.filter-grid').scrollLeft = 420;
  memory.replace(root, content, 'filters');
  assert.equal(root.ownerDocument.activeElement, root.controls[1]);
  assert.deepEqual(root.controls[1].focusOptions, { preventScroll: true });
  assert.equal(root.querySelector('.filter-grid').scrollLeft, 420);
});
test('changing tools does not steal focus from the main toolbar', () => {
  const memory = new PanelViewMemory(), root = fixture(), toolbarButton = {};
  memory.replace(root, { controls: ['first'] }, 'filters');
  root.ownerDocument.activeElement = toolbarButton;
  memory.replace(root, { controls: ['first'] }, 'adjust');
  assert.equal(root.ownerDocument.activeElement, toolbarButton);
});
test('removing a selected layer tolerates its focus target disappearing', () => {
  const memory = new PanelViewMemory(), root = fixture();
  memory.replace(root, { region: '.layers', controls: ['layer-1'] }, 'text');
  root.ownerDocument.activeElement = root.controls[0];
  assert.doesNotThrow(() => memory.replace(root, { controls: [] }, 'text'));
});
