import test from 'node:test';
import assert from 'node:assert/strict';
import { cropRect, filterPixels, smoothSkin, boxBlur, History, initialState, FILTERS, fitPreview } from '../src/core.js';

test('preview fits portrait and landscape photos within narrow mobile viewports', () => {
  for (const viewport of [320, 360, 375, 390, 430, 768]) {
    for (const [width, height] of [[1024, 1536], [4096, 1024], [1024, 4096], [1000, 1000]]) {
      const availableWidth = viewport - 16, availableHeight = 210;
      const fitted = fitPreview(width, height, availableWidth, availableHeight);
      assert.ok(fitted.width <= availableWidth + 1e-8);
      assert.ok(fitted.height <= availableHeight + 1e-8);
      assert.ok(Math.abs(fitted.width / fitted.height - width / height) < 1e-8);
    }
  }
});
test('short preview does not force the previous 80 pixel minimum width', () => {
  assert.deepEqual(fitPreview(1000, 4000, 304, 100), { width: 25, height: 100 });
});
test('hidden or temporarily collapsed preview never produces negative dimensions', () => {
  for (const [width, height] of [[-16, 100], [300, -16], [0, 0]]) {
    assert.deepEqual(fitPreview(1000, 1500, width, height), { width: 0, height: 0 });
  }
});
test('explicit zoom enlarges the fitted preview without changing its aspect ratio', () => {
  const fit = fitPreview(1000, 1500, 304, 200);
  const zoomed = fitPreview(1000, 1500, 304, 200, 2);
  assert.equal(zoomed.width, fit.width * 2);
  assert.equal(zoomed.height, fit.height * 2);
});

test('original preserves pixels including transparency', () => {
  const pixels = new Uint8ClampedArray([10, 45, 199, 255, 200, 115, 100, 0]);
  assert.deepEqual(filterPixels(pixels.slice(), 2, 1, initialState()), pixels);
});
test('square crop is centered and horizontal position reaches both edges', () => {
  assert.deepEqual(cropRect(1600, 900, '1:1'), { x: 350, y: 0, width: 900, height: 900 });
  assert.equal(cropRect(1600, 900, '1:1', 0).x, 0);
  assert.equal(cropRect(1600, 900, '1:1', 100).x, 700);
});
test('portrait crop can pan vertically, original does not crop', () => {
  assert.deepEqual(cropRect(1000, 1500, 'original'), { x: 0, y: 0, width: 1000, height: 1500 });
  assert.deepEqual(cropRect(1000, 1500, '1:1', 50, 100), { x: 0, y: 500, width: 1000, height: 1000 });
});
test('filter intensity zero is identity and full mono has equal channels', () => {
  const s = initialState(), pixel = new Uint8ClampedArray([190, 120, 70, 255]);
  s.filter = 'mono'; s.intensity = 0;
  assert.deepEqual(filterPixels(pixel.slice(), 1, 1, s), pixel);
  s.intensity = 100; const out = filterPixels(pixel.slice(), 1, 1, s);
  assert.equal(out[0], out[1]); assert.equal(out[1], out[2]);
});
test('all non-original filters change a representative pixel', () => {
  const pixel = new Uint8ClampedArray([160, 120, 70, 255]);
  for (const filter of FILTERS.slice(1)) {
    const s = initialState(); s.filter = filter.id; s.intensity = 100;
    assert.notDeepEqual(filterPixels(pixel.slice(), 1, 1, s), pixel, filter.id);
  }
});
test('exposure one stop doubles values and clamps highlights', () => {
  const s = initialState(); s.adjustments.exposure = 100;
  const out = filterPixels(new Uint8ClampedArray([50, 100, 200, 111]), 1, 1, s);
  assert.deepEqual([...out], [100, 200, 255, 111]);
});
test('grain is deterministic so exported pixels do not vary across renders', () => {
  const s = initialState(); s.adjustments.grain = 80;
  const input = new Uint8ClampedArray(64).fill(128);
  assert.deepEqual(filterPixels(input.slice(), 4, 4, s), filterPixels(input.slice(), 4, 4, s));
});
test('box blur preserves constant fields, dimensions and alpha at edges', () => {
  const data = new Uint8ClampedArray([100, 100, 100, 255, 100, 100, 100, 127]);
  assert.deepEqual(boxBlur(data, 2, 1, 4), data);
});
test('skin smoothing leaves cool blue areas intact', () => {
  const data = new Uint8ClampedArray([10, 80, 200, 255, 40, 30, 160, 255]);
  const before = data.slice(); smoothSkin(data, 2, 1, 100); assert.deepEqual(data, before);
});
test('history supports undo/redo, drops redo branch and isolates snapshots', () => {
  const s = initialState(), h = new History(s);
  s.adjustments.exposure = 50; h.push(s);
  assert.equal(h.undo().adjustments.exposure, 0);
  assert.equal(h.redo().adjustments.exposure, 50);
  const undone = h.undo(); undone.adjustments.contrast = 30; h.push(undone);
  assert.equal(h.canRedo, false);
  assert.equal(h.undo().adjustments.contrast, 0);
});
test('history is bounded and ignores unchanged states', () => {
  const s = initialState(), h = new History(s, 3); h.push(s); assert.equal(h.entries.length, 1);
  for (let i = 1; i <= 5; i++) { s.intensity = i; h.push(s); }
  assert.equal(h.entries.length, 3); assert.equal(h.undo().intensity, 4); assert.equal(h.undo().intensity, 3);
});
