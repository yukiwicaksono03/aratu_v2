import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFlash, filterPixels, initialState, History } from '../src/core.js';

function portrait(size = 80) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const subject = x >= size * .3 && x < size * .7 && y >= size * .2 && y < size * .85;
    data.set(subject ? [95, 65, 48, 255] : [160, 155, 170, 255], (y * size + x) * 4);
  }
  return data;
}
const pixel = (data, size, x, y) => [...data.slice((y * size + x) * 4, (y * size + x) * 4 + 4)];

test('zero flash intensity is a pixel-exact no-op including transparent colors', () => {
  const input = portrait(); input[3] = 0;
  assert.deepEqual(applyFlash(input.slice(), 80, 80, 0), input);
});
test('flash lights an underexposed central subject and preserves distant background', () => {
  const input = portrait(), output = applyFlash(input.slice(), 80, 80, 100);
  const before = pixel(input, 80, 40, 40), after = pixel(output, 80, 40, 40);
  assert.ok(after[0] > before[0] + 50);
  assert.ok(after[1] > before[1] + 40);
  for (const [x, y] of [[0, 0], [40, 0], [79, 40], [5, 50]]) {
    assert.deepEqual(pixel(output, 80, x, y), pixel(input, 80, x, y));
  }
});
test('intensity blends progressively between original and full flash', () => {
  const input = portrait(), half = applyFlash(input.slice(), 80, 80, 50), full = applyFlash(input.slice(), 80, 80, 100);
  const i = (40 * 80 + 40) * 4;
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(half[i + c] - (input[i + c] + full[i + c]) / 2) <= 1);
});
test('moving the light point illuminates the intended side of the photo', () => {
  const size = 80, input = portrait();
  for (let y = 20; y < 60; y++) for (let x = 0; x < size; x++) {
    const subject = x >= 12 && x <= 28 || x >= 52 && x <= 68;
    input.set(subject ? [95, 65, 48, 255] : [160, 155, 170, 255], (y * size + x) * 4);
  }
  const left = applyFlash(input.slice(), size, size, 100, { x: 25, y: 50, size: 25 });
  const right = applyFlash(input.slice(), size, size, 100, { x: 75, y: 50, size: 25 });
  assert.ok(pixel(left, size, 20, 40)[0] > pixel(right, size, 20, 40)[0] + 40);
  assert.ok(pixel(right, size, 60, 40)[0] > pixel(left, size, 60, 40)[0] + 40);
});
test('flash preserves alpha and fully transparent pixel contents', () => {
  const input = portrait();
  const transparent = (40 * 80 + 40) * 4;
  input[transparent + 3] = 0;
  input[transparent + 7] = 123;
  const output = applyFlash(input.slice(), 80, 80, 100);
  assert.deepEqual(output.slice(transparent, transparent + 4), input.slice(transparent, transparent + 4));
  for (let i = 3; i < input.length; i += 4) assert.equal(output[i], input[i]);
});
test('black remains black and bright whites retain tonal ordering', () => {
  assert.deepEqual([...applyFlash(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1, 100)], [0, 0, 0, 255]);
  const values = [200, 220, 240, 250].map(v => applyFlash(new Uint8ClampedArray([v, v, v, 255]), 1, 1, 100)[0]);
  assert.ok(values.every((v, i) => !i || v > values[i - 1]));
  assert.ok(values.at(-1) < 255);
});
test('legacy projects without flash settings use the same default effect', () => {
  const state = initialState(); state.filter = 'ccd';
  const legacy = structuredClone(state); delete legacy.flash;
  const input = portrait();
  assert.deepEqual(filterPixels(input.slice(), 80, 80, legacy), filterPixels(input.slice(), 80, 80, state));
});
test('light position and radius survive project serialization and undo/redo', () => {
  const state = initialState(), history = new History(state);
  state.filter = 'ccd'; state.flash = { x: 30, y: 45, size: 70 }; history.push(state);
  const restored = JSON.parse(JSON.stringify(state));
  assert.deepEqual(restored.flash, state.flash);
  assert.deepEqual(history.undo().flash, initialState().flash);
  assert.deepEqual(history.redo().flash, state.flash);
});
