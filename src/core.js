export const clamp = (n, min = 0, max = 255) => Math.min(max, Math.max(min, n));
export function fitPreview(width, height, availableWidth, availableHeight, zoom = 1) {
  if (width <= 0 || height <= 0 || availableWidth <= 0 || availableHeight <= 0) return { width: 0, height: 0 };
  const scale = Math.min(availableWidth / width, availableHeight / height, 1) * zoom;
  return { width: width * scale, height: height * scale };
}
export const FILTERS = [
  { id: 'original', name: 'Original', group: 'Semua', tone: [0, 0, 0], contrast: 1, saturation: 1 },
  { id: 'glow', name: 'Soft glow', group: 'Portrait', tone: [11, 3, 4], contrast: .93, saturation: .94 },
  { id: 'film', name: 'Film 01', group: 'Film', tone: [15, 8, -7], contrast: .9, saturation: .78, fade: 9 },
  { id: 'peach', name: 'Peach', group: 'Portrait', tone: [18, 3, -4], contrast: 1.02, saturation: .9 },
  { id: 'clean', name: 'Clean', group: 'Portrait', tone: [3, 4, 6], contrast: 1.06, saturation: .85 },
  { id: 'golden', name: 'Golden', group: 'Film', tone: [18, 8, -15], contrast: 1.08, saturation: 1.05 },
  { id: 'rosy', name: 'Rosy', group: 'Portrait', tone: [13, -5, 8], contrast: .95, saturation: .88 },
  { id: 'ccd', name: 'Flash', group: 'Film', tone: [0, 0, 0], contrast: 1, saturation: 1 },
  { id: 'mocha', name: 'Mocha', group: 'Film', tone: [13, 5, -5], contrast: 1.12, saturation: .6 },
  { id: 'faded', name: 'Faded', group: 'Film', tone: [3, 7, 8], contrast: .8, saturation: .65, fade: 12 },
  { id: 'mono', name: 'Mono', group: 'B&W', tone: [0, 0, 0], contrast: 1.1, saturation: 0 },
  { id: 'noir', name: 'Noir', group: 'B&W', tone: [0, 0, 0], contrast: 1.4, saturation: 0 },
];
export function initialState(source = './public/assets/portrait.jpg', name = 'Golden afternoon') {
  return { source, name, filter: 'original', intensity: 80, flash: { x: 50, y: 55, size: 55 }, adjustments: { exposure: 0, contrast: 0, saturation: 0, warmth: 0, tint: 0, highlights: 0, shadows: 0, fade: 0, grain: 0, vignette: 0 }, beauty: { smooth: 0, brighten: 0 }, crop: { ratio: 'original', x: 50, y: 50 }, rotation: 0, flipX: false, flipY: false, frame: { size: 0, color: '#ffffff', bottom: false }, overlays: [], strokes: [] };
}
function smoothstep(lo, hi, value) {
  const t = clamp((value - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
}
// A movable, feathered light footprint approximates direct flash without a subject model.
// Coordinates are relative to the cropped photograph, before frames and overlays.
export function applyFlash(data, width, height, intensity, settings = {}) {
  const amount = clamp(intensity, 0, 100) / 100;
  if (!amount) return data;
  const cx = clamp(settings.x ?? 50, 0, 100) / 100;
  const cy = clamp(settings.y ?? 55, 0, 100) / 100;
  const size = clamp(settings.size ?? 55, 15, 100) / 100;
  const radiusX = .14 + size * .52, radiusY = .2 + size * .7;
  // Estimate the distant scene from both image edges, then smooth along rows.
  // This suppresses the light halo on skies/walls with colors similar to the edges.
  const edges = new Float32Array(height * 6), background = new Float32Array(height * 6);
  const edgeWidth = Math.max(1, Math.round(width * .065));
  if (width >= 16) {
    for (let y = 0; y < height; y++) for (let side = 0; side < 2; side++) {
      let weight = 0;
      for (let x = 0; x < edgeWidth; x++) {
        const i = (y * width + (side ? width - 1 - x : x)) * 4, alpha = data[i + 3] / 255;
        weight += alpha;
        for (let c = 0; c < 3; c++) edges[y * 6 + side * 3 + c] += data[i + c] * alpha;
      }
      for (let c = 0; c < 3; c++) edges[y * 6 + side * 3 + c] /= weight || 1;
    }
    const radius = Math.max(1, Math.round(height / 60));
    for (let c = 0; c < 6; c++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += edges[clamp(k, 0, height - 1) * 6 + c];
      for (let y = 0; y < height; y++) {
        background[y * 6 + c] = sum / (2 * radius + 1);
        sum += edges[clamp(y + radius + 1, 0, height - 1) * 6 + c] - edges[clamp(y - radius, 0, height - 1) * 6 + c];
      }
    }
  }
  // Build the illumination mask at a bounded resolution, then feather it. The mask
  // must not follow skin texture pixel by pixel, which creates blotchy highlights.
  const mw = Math.min(width, 160), mh = Math.min(height, 160);
  const mask = new Float32Array(mw * mh), histogram = new Float32Array(256);
  let totalWeight = 0;
  for (let my = 0; my < mh; my++) for (let mx = 0; mx < mw; mx++) {
    const nx = (mx + .5) / mw, ny = (my + .5) / mh;
    const dx = (nx - cx) / radiusX, dy = (ny - cy) / radiusY;
    let light = 1 - smoothstep(.12, 1, dx * dx + dy * dy);
    if (!light) continue;
    const x = Math.min(width - 1, Math.floor(nx * width)), y = Math.min(height - 1, Math.floor(ny * height));
    const i = (y * width + x) * 4;
    if (!data[i + 3]) continue;
    const luminance = (.299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2]) / 255;
    if (width >= 16) {
      let difference = 0;
      for (let c = 0; c < 3; c++) {
        const ambient = background[y * 6 + c] + (background[y * 6 + 3 + c] - background[y * 6 + c]) * nx;
        difference += (data[i + c] - ambient) ** 2;
      }
      const skin = smoothstep(2, 14, data[i] - data[i + 1]) * smoothstep(5, 24, data[i] - data[i + 2])
        * smoothstep(.12, .24, luminance) * (1 - smoothstep(.5, .67, luminance));
      light *= Math.max(smoothstep(100, 2500, difference / 3), skin * .95) * smoothstep(36, 256, difference / 3);
    }
    mask[my * mw + mx] = light;
    if (luminance > .08) { histogram[Math.round(luminance * 255)] += light; totalWeight += light; }
  }
  let cumulative = 0, percentile = .4;
  for (let i = 0; i < histogram.length && totalWeight; i++) {
    cumulative += histogram[i];
    if (cumulative >= totalWeight * .65) { percentile = i / 255; break; }
  }
  const boost = 3.6 * (1 - .86 * smoothstep(.25, .72, percentile));
  const feathered = new Float32Array(mask.length), temporary = new Float32Array(mask.length), eroded = new Float32Array(mask.length);
  const radius = Math.max(1, Math.round(Math.min(mw, mh) / 50)), span = radius * 2 + 1;
  // Pull the mask inward before feathering so illumination does not bleed into the sky.
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    let minimum = 1; for (let k = -radius; k <= radius; k++) minimum = Math.min(minimum, mask[y * mw + clamp(x + k, 0, mw - 1)]);
    temporary[y * mw + x] = minimum;
  }
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    let minimum = 1; for (let k = -radius; k <= radius; k++) minimum = Math.min(minimum, temporary[clamp(y + k, 0, mh - 1) * mw + x]);
    eroded[y * mw + x] = minimum;
  }
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    let sum = 0; for (let k = -radius; k <= radius; k++) sum += eroded[y * mw + clamp(x + k, 0, mw - 1)];
    temporary[y * mw + x] = sum / span;
  }
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    let sum = 0; for (let k = -radius; k <= radius; k++) sum += temporary[clamp(y + k, 0, mh - 1) * mw + x];
    feathered[y * mw + x] = sum / span;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (!data[i + 3]) continue;
    const u = clamp((x + .5) / width * mw - .5, 0, mw - 1), v = clamp((y + .5) / height * mh - .5, 0, mh - 1);
    const x0 = Math.floor(u), y0 = Math.floor(v), x1 = Math.min(mw - 1, x0 + 1), y1 = Math.min(mh - 1, y0 + 1);
    const top = feathered[y0 * mw + x0] * (1 - u + x0) + feathered[y0 * mw + x1] * (u - x0);
    const bottom = feathered[y1 * mw + x0] * (1 - u + x0) + feathered[y1 * mw + x1] * (u - x0);
    let light = top * (1 - v + y0) + bottom * (v - y0);
    const luminance = (.299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2]) / 255;
    const gain = 1 + boost * light * smoothstep(.035, .25, luminance);
    for (let channel = 0; channel < 3; channel++) {
      const original = data[i + channel] / 255;
      // Monotonic shoulder approaches white smoothly, with no hard clipping.
      const lit = 1 - (1 - original) ** gain;
      data[i + channel] = clamp((original + (lit - original) * amount) * 255);
    }
  }
  return data;
}
export function cropRect(width, height, ratio, x = 50, y = 50) {
  const target = ratio === 'original' ? width / height : Number(ratio.split(':')[0]) / Number(ratio.split(':')[1]);
  let w = width, h = height;
  if (width / height > target) w = height * target; else h = width / target;
  return { x: (width - w) * clamp(x, 0, 100) / 100, y: (height - h) * clamp(y, 0, 100) / 100, width: w, height: h };
}
export function filterPixels(data, width, height, state) {
  const a = state.adjustments;
  const f = FILTERS.find(f => f.id === state.filter) || FILTERS[0];
  const mix = state.filter === 'original' ? 0 : state.intensity / 100;
  if (state.filter === 'ccd') applyFlash(data, width, height, state.intensity, state.flash);
  const exp = 2 ** (a.exposure / 100), contrast = (1 + a.contrast / 100) * (1 + (f.contrast - 1) * mix);
  const saturation = (1 + a.saturation / 100) * (1 + (f.saturation - 1) * mix);
  const fade = a.fade * .35 + (f.fade || 0) * mix;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    const l = .299 * r + .587 * g + .114 * b;
    const lighting = a.shadows * (1 - l / 255) ** 3 * .9 + a.highlights * (l / 255) ** 3 * .9;
    r = (r * exp - 128) * contrast + 128 + lighting + f.tone[0] * mix + a.warmth * .28 + a.tint * .12;
    g = (g * exp - 128) * contrast + 128 + lighting + f.tone[1] * mix - a.tint * .2;
    b = (b * exp - 128) * contrast + 128 + lighting + f.tone[2] * mix - a.warmth * .28 + a.tint * .12;
    const gray = .299 * r + .587 * g + .114 * b;
    r = gray + (r - gray) * saturation; g = gray + (g - gray) * saturation; b = gray + (b - gray) * saturation;
    const grain = a.grain ? (noise(i / 4) - .5) * a.grain * .7 : 0;
    let vignette = 1;
    if (a.vignette) {
      const x = ((i / 4) % width) / width - .5, y = Math.floor(i / 4 / width) / height - .5;
      vignette = 1 - Math.min(1, (x * x + y * y) * 1.8) * a.vignette / 100;
    }
    const bright = state.beauty.brighten * .2;
    data[i] = clamp((r + fade + grain + bright) * vignette);
    data[i + 1] = clamp((g + fade + grain + bright) * vignette);
    data[i + 2] = clamp((b + fade + grain + bright) * vignette);
  }
  return data;
}
function noise(n) { const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); }
export function boxBlur(data, w, h, radius) {
  const temp = new Float32Array(data.length), out = new Uint8ClampedArray(data.length), span = radius * 2 + 1;
  for (let y = 0; y < h; y++) for (let ch = 0; ch < 3; ch++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += data[(y * w + clamp(k, 0, w - 1)) * 4 + ch];
    for (let x = 0; x < w; x++) {
      temp[(y * w + x) * 4 + ch] = sum / span;
      sum += data[(y * w + clamp(x + radius + 1, 0, w - 1)) * 4 + ch] - data[(y * w + clamp(x - radius, 0, w - 1)) * 4 + ch];
    }
  }
  for (let x = 0; x < w; x++) for (let ch = 0; ch < 3; ch++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += temp[(clamp(k, 0, h - 1) * w + x) * 4 + ch];
    for (let y = 0; y < h; y++) {
      out[(y * w + x) * 4 + ch] = sum / span;
      sum += temp[(clamp(y + radius + 1, 0, h - 1) * w + x) * 4 + ch] - temp[(clamp(y - radius, 0, h - 1) * w + x) * 4 + ch];
    }
  }
  for (let i = 3; i < out.length; i += 4) out[i] = data[i];
  return out;
}
export function smoothSkin(data, w, h, amount) {
  if (!amount) return;
  const blurred = boxBlur(data, w, h, Math.max(2, Math.round(w / 180)));
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const cb = 128 - .168736 * r - .331264 * g + .5 * b;
    const cr = 128 + .5 * r - .418688 * g - .081312 * b;
    const skin = r > 60 && cr > 132 && cr < 178 && cb > 75 && cb < 128;
    if (skin) for (let c = 0; c < 3; c++) data[i + c] += (blurred[i + c] - data[i + c]) * amount / 125;
  }
}
export class History {
  constructor(state, limit = 35) { this.entries = [structuredClone(state)]; this.index = 0; this.limit = limit; }
  push(state) {
    if (JSON.stringify(this.entries[this.index]) === JSON.stringify(state)) return;
    this.entries.splice(this.index + 1);
    this.entries.push(structuredClone(state));
    if (this.entries.length > this.limit) this.entries.shift();
    this.index = this.entries.length - 1;
  }
  undo() { if (this.index > 0) this.index--; return structuredClone(this.entries[this.index]); }
  redo() { if (this.index < this.entries.length - 1) this.index++; return structuredClone(this.entries[this.index]); }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.entries.length - 1; }
}
