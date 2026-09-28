import { cropRect, filterPixels, smoothSkin, boxBlur } from './core.js';
const images = new Map();
export function loadImage(source) {
  if (images.has(source)) return images.get(source);
  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { images.delete(source); reject(new Error('Foto tidak dapat dibuka. Gunakan JPG, PNG, WebP, atau AVIF.')); };
    img.src = source;
  });
  images.set(source, promise);
  // Keep the currently used image and a small decode cache; undo can reload older images.
  if (images.size > 8) images.delete(images.keys().next().value);
  return promise;
}
export function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
export async function importFile(file) {
  if (!file || !/^image\/(jpeg|png|webp|avif)$/.test(file.type)) throw new Error('Pilih foto JPG, PNG, WebP, atau AVIF.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Ukuran foto maksimal 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    if (img.width * img.height > 40000000) throw new Error('Foto maksimal 40 megapiksel. Kecilkan foto sebelum mengunggah.');
    const scale = Math.min(1, 4096 / Math.max(img.width, img.height));
    const c = canvas(img.width * scale, img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { source: c.toDataURL('image/png'), name: file.name.replace(/\.[^.]+$/, ''), resized: scale < 1 };
  } finally { URL.revokeObjectURL(url); images.delete(url); }
}
export async function render(state, maxEdge = 1000, original = false) {
  const img = await loadImage(state.source);
  const quarter = state.rotation % 180 !== 0;
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const rotated = canvas((quarter ? img.height : img.width) * scale, (quarter ? img.width : img.height) * scale);
  const rc = rotated.getContext('2d');
  rc.translate(rotated.width / 2, rotated.height / 2);
  rc.rotate(state.rotation * Math.PI / 180);
  rc.scale(state.flipX ? -1 : 1, state.flipY ? -1 : 1);
  rc.drawImage(img, -img.width * scale / 2, -img.height * scale / 2, img.width * scale, img.height * scale);
  const rect = cropRect(rotated.width, rotated.height, state.crop.ratio, state.crop.x, state.crop.y);
  const photo = canvas(rect.width, rect.height), ctx = photo.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(rotated, rect.x, rect.y, rect.width, rect.height, 0, 0, photo.width, photo.height);
  if (!original) {
    const pixels = ctx.getImageData(0, 0, photo.width, photo.height);
    smoothSkin(pixels.data, photo.width, photo.height, state.beauty.smooth);
    filterPixels(pixels.data, photo.width, photo.height, state);
    ctx.putImageData(pixels, 0, 0);
  }
  const pad = Math.round(Math.min(photo.width, photo.height) * state.frame.size / 100);
  const out = canvas(photo.width + pad * 2, photo.height + pad * (state.frame.bottom ? 4 : 2)), oc = out.getContext('2d');
  out.photoRect = { x: pad, y: pad, width: photo.width, height: photo.height };
  if (pad) { oc.fillStyle = state.frame.color; oc.fillRect(0, 0, out.width, out.height); }
  oc.drawImage(photo, pad, pad);
  if (!original) {
    drawStrokes(oc, state.strokes, out.width, out.height);
    for (const overlay of state.overlays) drawOverlay(oc, overlay, out.width, out.height);
  }
  return out;
}
function drawStrokes(ctx, strokes, w, h) {
  let blur;
  for (const s of strokes) {
    if (!s.points.length) continue;
    if (s.mode === 'smooth' && !blur) {
      const data = ctx.getImageData(0, 0, w, h);
      blur = canvas(w, h);
      blur.getContext('2d').putImageData(new ImageData(boxBlur(data.data, w, h, Math.max(3, Math.round(w / 100))), w, h), 0, 0);
    }
    ctx.save();
    const size = s.size / 100 * Math.min(w, h);
    if (s.mode === 'smooth') {
      // Interpolated points avoid gaps when dragging quickly.
      ctx.beginPath();
      for (const p of s.points) { ctx.moveTo(p.x * w + size / 2, p.y * h); ctx.arc(p.x * w, p.y * h, size / 2, 0, Math.PI * 2); }
      ctx.clip(); ctx.globalAlpha = .8; ctx.drawImage(blur, 0, 0);
    } else {
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = s.opacity / 100;
      if (s.points.length === 1) { ctx.beginPath(); ctx.arc(s.points[0].x * w, s.points[0].y * h, size / 2, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.beginPath(); s.points.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x * w, p.y * h)); ctx.stroke(); }
    }
    ctx.restore();
  }
}
export function overlayFont(o, width) { return `${o.bold ? '700' : '400'} ${o.size / 100 * width}px ${o.font || 'Arial'}`; }
export function drawOverlay(ctx, o, w, h) {
  ctx.save(); ctx.translate(o.x * w, o.y * h); ctx.rotate((o.rotation || 0) * Math.PI / 180);
  ctx.font = overlayFont(o, w); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = o.color;
  if (o.shadow) { ctx.shadowColor = '#00000066'; ctx.shadowBlur = w / 200; ctx.shadowOffsetY = w / 400; }
  const lines = o.text.split('\n'), lineHeight = o.size / 100 * w * 1.2;
  lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * lineHeight)); ctx.restore();
}
export function overlayBounds(ctx, o, w, h) {
  ctx.font = overlayFont(o, w);
  const lines = o.text.split('\n');
  const width = Math.max(...lines.map(line => ctx.measureText(line).width)) + 20;
  const height = o.size / 100 * w * lines.length * 1.2 + 12;
  // Axis-aligned bounds enclose rotated text as well.
  const rad = (o.rotation || 0) * Math.PI / 180;
  const bw = Math.abs(width * Math.cos(rad)) + Math.abs(height * Math.sin(rad));
  const bh = Math.abs(width * Math.sin(rad)) + Math.abs(height * Math.cos(rad));
  return { x: o.x * w - bw / 2, y: o.y * h - bh / 2, width: bw, height: bh };
}
export async function composeCollage(sources, layout, gap, color) {
  const w = 1600, h = layout === 'strip' ? 2000 : 1600, out = canvas(w, h), ctx = out.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
  const n = sources.length;
  let cells;
  if (layout === 'strip') cells = sources.map((_, i) => [0, i / n, 1, 1 / n]);
  else if (layout === 'hero' && n >= 3) cells = [[0, 0, .6, 1], ...sources.slice(1).map((_, i) => [.6, i / (n - 1), .4, 1 / (n - 1)])];
  else { const cols = n === 2 ? 2 : 2, rows = Math.ceil(n / cols); cells = sources.map((_, i) => [(i % cols) / cols, Math.floor(i / cols) / rows, n === 3 && i === 2 ? 1 : 1 / cols, 1 / rows]); }
  for (let i = 0; i < n; i++) {
    const img = await loadImage(sources[i]);
    const [x, y, cw, ch] = cells[i];
    const dw = cw * w - gap * 2, dh = ch * h - gap * 2;
    const r = cropRect(img.width, img.height, `${dw}:${dh}`);
    ctx.drawImage(img, r.x, r.y, r.width, r.height, x * w + gap, y * h + gap, dw, dh);
  }
  return out;
}
