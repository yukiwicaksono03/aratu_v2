import { FILTERS, initialState, History, clamp, fitPreview } from './core.js';
import { render, loadImage, importFile, overlayBounds, composeCollage } from './renderer.js';
import { saveProject, listProjects, deleteProject } from './storage.js';
import { icon } from './icons.js';
import { PanelViewMemory } from './panel-view.js';

const $ = selector => document.querySelector(selector);
const panelView = new PanelViewMemory();
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let state = initialState(), history = new History(state), tool = 'beauty', category = 'Semua';
let selected = null, zoom = 1, compare = false, renderedCanvas, paintVersion = 0, paintFrame, saveTimer;
let activeProject = crypto.randomUUID(), dirty = false, storageWarning = false, installPrompt, isBusy = false;
let brush = { mode: 'draw', size: 3, color: '#ffffff', opacity: 100 }, drag = null;
let collageSources = [], collageVersion = 0;
let beautyControl = 'smooth', adjustmentControl = 'exposure', toolSession;
let flashControl = 'intensity';
const adjustmentOptions = [['exposure', 'Eksposur', 'sun'], ['contrast', 'Kontras', 'contrast'], ['highlights', 'Highlight', 'sun'], ['shadows', 'Bayangan', 'moon'], ['saturation', 'Saturasi', 'filters'], ['warmth', 'Temperatur', 'temperature'], ['tint', 'Tint', 'filters'], ['fade', 'Fade', 'contrast'], ['grain', 'Grain', 'grain'], ['vignette', 'Vignette', 'frame']];
const tools = [
  ['filters', 'filters', 'Filter'], ['flash', 'flash', 'Flash'], ['adjust', 'sliders', 'Sesuaikan'], ['beauty', 'face', 'Retouch'], ['crop', 'crop', 'Potong'],
  ['text', 'text', 'Teks'], ['stickers', 'sticker', 'Stiker'], ['brush', 'brush', 'Kuas'], ['frame', 'frame', 'Bingkai'], ['collage', 'collage', 'Kolase'],
];

const btn = (action, label, ico, cls = '', attrs = '') => `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${ico ? icon(ico) : ''}${label}</button>`;
const range = (label, path, value, min = -100, max = 100) => `<label class="range-field"><span>${label}<output>${value}</output></span><input type="range" data-path="${path}" min="${min}" max="${max}" value="${value}" aria-label="${label}" style="--progress:${(value - min) / (max - min) * 100}%"></label>`;
const chip = (label, action, active, attrs = '') => btn(action, label, '', `chip ${active ? 'active' : ''}`, attrs);

function mount() {
  $('#app').innerHTML = `
  <header class="app-header">
    <a class="brand" href="./" aria-label="Aratu Studio"><span class="brand-mark">${icon('sparkle')}</span><span>aratu<span class="brand-studio">studio</span></span></a>
    <div class="document-info"><button class="document-name" data-action="rename" title="Ubah nama proyek">${escape(state.name)}</button><span id="save-status">Foto contoh · siap diedit</span></div>
    <div class="header-actions">${btn('projects', 'Proyek saya', 'folder', 'quiet desktop-label', 'aria-label="Proyek saya"')}${btn('upload', '<span class="button-label">Buka foto</span>', 'upload', 'button secondary upload-button', 'aria-label="Buka foto" title="Buka foto"')}${btn('export', 'Simpan', 'download', 'button primary')}</div>
  </header>
  <main class="editor-layout">
    <section class="workspace" aria-label="Kanvas editor">
      <div class="canvas-topbar"><span id="canvas-hint">Gunakan kontrol zoom untuk melihat detail foto</span>${btn('focus-canvas', '', 'expand', 'icon-button', 'aria-label="Perluas kanvas" aria-pressed="false" title="Perluas kanvas"')}</div>
      <div class="canvas-area" id="drop-zone">
        <div class="canvas-scroll" id="canvas-scroll"><div class="canvas-wrap"><canvas id="photo" tabindex="0" aria-label="Pratinjau foto. Teks dan stiker dapat digeser dengan mouse atau tombol panah."></canvas><span id="before-label" hidden>SEBELUM</span></div></div>
        <div class="canvas-loading" hidden><span class="spinner"></span>Menyiapkan foto…</div>
        <div class="drop-cover">${icon('upload')}Lepaskan foto di sini</div>
      </div>
      <div class="canvas-bottom">
        <div class="history-actions">${btn('undo', '', 'undo', 'icon-button', 'aria-label="Undo" title="Undo (⌘/Ctrl Z)" disabled')}${btn('redo', '', 'redo', 'icon-button', 'aria-label="Redo" title="Redo (⌘/Ctrl Shift Z)" disabled')}${btn('reset', '', 'rotate', 'icon-button', 'aria-label="Reset semua edit" title="Reset semua edit"')}</div>
        <span class="dimensions" id="dimensions"></span>
        <div class="preview-actions"><div class="zoom-controls">${btn('zoom-out', '', 'minus', 'icon-button', 'aria-label="Perkecil"')}<button data-action="fit" id="zoom-label" title="Pas ke layar">100%</button>${btn('zoom-in', '', 'plus', 'icon-button', 'aria-label="Perbesar"')}</div>${btn('compare', '<span>Sebelum / sesudah</span>', 'compare', 'compare-button', 'aria-label="Bandingkan sebelum dan sesudah" aria-pressed="false" title="Lihat sebelum / sesudah"')}</div>
      </div>
    </section>
    <aside class="settings" aria-label="Pengaturan editor">
      <div class="panel-toolbar">${btn('cancel-tool', '', 'close', 'icon-button', 'aria-label="Batalkan perubahan alat ini" title="Batalkan perubahan alat ini"')}<h1 id="panel-title">Retouch</h1>${btn('apply-tool', '', 'check', 'icon-button apply-button', 'aria-label="Terapkan perubahan" title="Terapkan perubahan"')}</div>
      <div id="panel"></div>
      <div class="panel-footer"><span class="panel-context" id="panel-context">${icon('face')}Sentuhan natural</span>${btn('reset-tool', 'Reset', 'rotate', 'quiet')}</div>
    </aside>
    <nav class="tool-rail" aria-label="Alat editor"><div class="tool-list">${tools.map(([id, ico, name]) => `<button class="tool-button ${tool === id ? 'active' : ''}" data-tool="${id}" aria-label="${name}" aria-pressed="${tool === id}">${icon(ico)}<span>${name}</span></button>`).join('')}</div><div class="rail-bottom">${btn('install', '', 'download', 'icon-button', 'aria-label="Instal aplikasi" title="Instal aplikasi"')}${btn('help', '', 'help', 'icon-button', 'aria-label="Bantuan" title="Bantuan & pintasan"')}</div></nav>
  </main>
  <footer class="workspace-footer"><span><i class="status-dot"></i><span id="offline-status">Studio pribadi Anda</span></span><span>${icon('shield')}Foto Anda tetap di perangkat</span></footer>`;
  panel(); bindCanvas(); schedulePaint(); beginToolSession();
  new ResizeObserver(() => fitCanvas()).observe($('#canvas-scroll'));
}
function beginToolSession() {
  toolSession = { state: structuredClone(state), entries: history.entries.slice(), index: history.index };
}
function chooseTool(nextTool) {
  tool = nextTool; brush.mode = tool === 'beauty' && beautyControl === 'brush' ? 'smooth' : 'draw'; selected = null;
  beginToolSession(); panel(); schedulePaint();
}
function subtool(id, label, ico, active, action) {
  return `<button class="subtool ${active ? 'active' : ''}" data-action="${action}" data-value="${id}" aria-pressed="${active}">${icon(ico)}<span>${label}</span><i></i></button>`;
}

function panel() {
  $('#panel-title').textContent = tools.find(t => t[0] === tool)[2];
  $('.settings').dataset.panel = tool;
  let html = '';
  if (tool === 'filters') {
    html += `<div class="filter-categories" role="group" aria-label="Kategori filter">${['Semua', 'Portrait', 'Film', 'B&W'].map(c => chip(c, 'category', c === category, `data-value="${c}"`)).join('')}</div><div class="filter-grid">${FILTERS.filter(f => category === 'Semua' || f.group === category).map(f => `<button class="filter-card ${state.filter === f.id ? 'selected' : ''}" data-action="filter" data-value="${f.id}" aria-pressed="${state.filter === f.id}"><div class="filter-thumbnail"><img ${f.id === 'ccd' ? 'data-flash-thumbnail' : ''} src="${escape(state.source)}" alt="" style="filter:${cssFilter(f)}"><span class="filter-check">${icon('check')}</span>${f.id === 'ccd' ? '<span class="new-tag">NEW</span>' : ''}</div><span>${f.name}</span></button>`).join('')}</div><div class="intensity-section">${range('Intensitas', 'intensity', state.intensity, 0, 100)}</div><div class="panel-tip">${icon('sparkle')}<div><strong>Temukan warna Anda</strong><p>Kombinasikan filter dengan penyesuaian untuk hasil yang lebih personal.</p></div></div>`;
  } else if (tool === 'flash') {
    const active = state.filter === 'ccd', settings = state.flash || initialState().flash;
    html += `<div class="control-tabs">${chip('Nonaktif', 'flash-mode', !active, 'data-value="off"')}${chip('Flash', 'flash-mode', active, 'data-value="on"')}</div>`;
    if (active) html += `<div class="subtool-row">${subtool('intensity', 'Kekuatan', 'flash', flashControl === 'intensity', 'flash-control')}${subtool('size', 'Area cahaya', 'expand', flashControl === 'size', 'flash-control')}</div><div class="single-slider">${flashControl === 'size' ? range('Area cahaya', 'flash.size', settings.size, 15, 100) : range('Kekuatan flash', 'intensity', state.intensity, 0, 100)}</div>`;
    else html += '<p class="field-hint centered">Aktifkan Flash untuk menerangi area foto seperti lampu kamera.</p>';
  } else if (tool === 'adjust') {
    const option = adjustmentOptions.find(([key]) => key === adjustmentControl);
    html += `<div class="control-tabs"><span class="control-tab active">Cahaya & warna</span>${btn('enhance', 'Auto', 'sparkle', 'auto-button')}</div><div class="subtool-row">${adjustmentOptions.map(([key, label, ico]) => subtool(key, label, ico, adjustmentControl === key, 'adjust-control')).join('')}</div><div class="single-slider">${range(option[1], `adjustments.${option[0]}`, state.adjustments[option[0]], ['fade', 'grain', 'vignette'].includes(option[0]) ? 0 : -100, 100)}</div>`;
  } else if (tool === 'beauty') {
    html += `<div class="control-tabs" role="group" aria-label="Jenis retouch">${chip('Kulit', 'beauty-tab', beautyControl !== 'brush', 'data-value="skin"')}${chip('Retouch lokal', 'beauty-tab', beautyControl === 'brush', 'data-value="local"')}</div>`;
    if (beautyControl === 'brush') {
      html += `<div class="subtool-row">${subtool('brush', 'Kuas halus', 'brush', true, 'beauty-control')}</div><div class="single-slider">${range('Ukuran kuas', 'brush.size', brush.size, 1, 25)}</div><p class="field-hint centered">Sapukan jari atau mouse pada area yang ingin dihaluskan.</p>`;
    } else {
      html += `<div class="subtool-row">${subtool('smooth', 'Haluskan', 'smooth', beautyControl === 'smooth', 'beauty-control')}${subtool('brighten', 'Cerahkan', 'sun', beautyControl === 'brighten', 'beauty-control')}</div><div class="single-slider">${range(beautyControl === 'smooth' ? 'Kehalusan kulit' : 'Kecerahan', `beauty.${beautyControl}`, state.beauty[beautyControl], 0, 100)}</div>`;
    }
  } else if (tool === 'crop') {
    html += `<div class="section-label">RASIO FOTO</div><div class="ratio-grid">${[['original', 'Original'], ['1:1', 'Persegi'], ['4:5', 'Instagram'], ['9:16', 'Story'], ['3:2', 'Landscape'], ['2:3', 'Portrait'], ['16:9', 'Wide']].map(([ratio, name]) => `<button data-action="ratio" data-value="${ratio}" class="ratio-button ${state.crop.ratio === ratio ? 'active' : ''}"><span class="ratio-shape" style="aspect-ratio:${ratio === 'original' ? '4/3' : ratio.replace(':', '/')}"></span><strong>${ratio === 'original' ? 'Asli' : ratio}</strong><small>${name}</small></button>`).join('')}</div><div class="section-label">POSISI POTONG</div>${range('Horizontal', 'crop.x', state.crop.x, 0, 100)}${range('Vertikal', 'crop.y', state.crop.y, 0, 100)}<div class="section-label">PUTAR & BALIK</div><div class="button-row">${btn('rotate', 'Putar 90°', 'rotate', 'button secondary')}${btn('flip-x', 'Horizontal', 'flip', 'button secondary')}</div>${btn('flip-y', 'Balik vertikal', 'flip', 'button secondary full')}<p class="field-hint">Pemotongan tetap dapat diubah. Foto sumber Anda tersimpan utuh.</p>`;
  } else if (tool === 'text') {
    html += btn('add-text', 'Tambahkan teks', 'plus', 'button primary full');
    const overlay = state.overlays.find(o => o.id === selected && o.kind === 'text');
    if (overlay) html += `<label class="input-label">Teks Anda<textarea id="overlay-text" maxlength="300" rows="3">${escape(overlay.text)}</textarea></label><label class="input-label">Font<select id="overlay-font">${[['Arial', 'Modern Sans'], ['Georgia', 'Editorial Serif'], ['Courier New', 'Typewriter'], ['cursive', 'Handwritten']].map(([font, name]) => `<option value="${font}" ${overlay.font === font ? 'selected' : ''}>${name}</option>`).join('')}</select></label>${overlayControls(overlay)}<label class="checkbox"><input type="checkbox" id="overlay-bold" ${overlay.bold ? 'checked' : ''}>Tebal</label><label class="checkbox"><input type="checkbox" id="overlay-shadow" ${overlay.shadow ? 'checked' : ''}>Bayangan teks</label>`;
    else html += '<div class="text-preview"><span>Aa</span><p>Every photo<br>has a story.</p></div><p class="field-hint">Tambahkan teks, lalu geser langsung di foto untuk mengatur posisinya.</p>';
    html += layers();
  } else if (tool === 'stickers') {
    html += `<div class="section-label">LITTLE THINGS, BIG FEELINGS</div><div class="sticker-grid">${['✦', '♡', '✿', '☀', '☾', '☺', '✨', '🌼', '🌷', '🦋', '🍒', '🍋', '🎀', '🤍', '🌈', '⭐', '🪩', '🌿', '☁️', '💌'].map(s => `<button data-action="add-sticker" data-value="${s}" aria-label="Tambahkan stiker ${s}">${s}</button>`).join('')}</div>`;
    const o = state.overlays.find(o => o.id === selected && o.kind === 'sticker');
    if (o) html += overlayControls(o);
    html += '<p class="field-hint">Klik untuk menambahkan. Geser stiker di foto untuk mengatur posisi.</p>' + layers();
  } else if (tool === 'brush') {
    html += `<div class="brush-preview"><span style="background:${brush.color}"></span>${icon('brush')}</div><div class="section-label">KUAS KREATIF</div>${range('Ukuran kuas', 'brush.size', brush.size, 1, 25)}${range('Opasitas', 'brush.opacity', brush.opacity, 10, 100)}<label class="color-field">Warna kuas<input type="color" data-color="brush" value="${brush.color}"></label><div class="swatches">${['#ffffff', '#29252f', '#b899ea', '#f6a6bc', '#f3bd69', '#a9c6aa'].map(c => `<button aria-label="Warna ${c}" data-action="brush-color" data-value="${c}" style="background:${c}"></button>`).join('')}</div><p class="field-hint">Gambar langsung di kanvas dengan jari atau mouse. Sapuan ikut tersimpan dalam hasil ekspor.</p>${btn('clear-strokes', 'Hapus semua sapuan', 'trash', 'button secondary full')}`;
  } else if (tool === 'frame') {
    html += `<div class="frame-presets">${[['none', 'Tanpa bingkai'], ['classic', 'Classic'], ['polaroid', 'Polaroid'], ['dark', 'Midnight']].map(([id, name]) => `<button class="frame-preset" data-action="frame" data-value="${id}"><span class="frame-demo ${id}"><span></span></span>${name}</button>`).join('')}</div>${range('Lebar bingkai', 'frame.size', state.frame.size, 0, 20)}<label class="color-field">Warna bingkai<input type="color" data-color="frame" value="${state.frame.color}"></label><label class="checkbox"><input type="checkbox" id="frame-bottom" ${state.frame.bottom ? 'checked' : ''}>Ruang ekstra di bawah</label><p class="field-hint">Bingkai menambah ukuran kanvas tanpa memotong foto.</p>`;
  } else if (tool === 'collage') {
    html += `<div class="feature-art collage-art">${icon('collage')}<span>More moments. One story.</span></div><p class="field-hint">Pilih 2–4 foto, atur tata letak, lalu lanjutkan mengedit kolase Anda di studio.</p>${btn('collage-upload', 'Pilih foto untuk kolase', 'plus', 'button primary full')}<div class="panel-tip">${icon('image')}<div><strong>Ruang untuk semua cerita</strong><p>Grid, editorial, dan photo strip. Sesuaikan jarak serta warna latar.</p></div></div>`;
  }
  const view = tool === 'filters' ? category : tool === 'beauty' ? (beautyControl === 'brush' ? 'local' : 'skin') : tool === 'flash' ? (state.filter === 'ccd' ? 'on' : 'off') : '';
  panelView.replace($('#panel'), html, tool, view);
  const flashThumbnail = $('[data-flash-thumbnail]');
  if (flashThumbnail) {
    const preview = initialState(state.source); preview.filter = 'ccd'; preview.flash = state.flash;
    render(preview, 160).then(c => { if (flashThumbnail.isConnected) flashThumbnail.src = c.toDataURL('image/jpeg', .85); }).catch(() => {});
  }
  $('[data-action="reset-tool"]').hidden = tool === 'collage';
  $('#panel-context').innerHTML = `${icon(tool === 'beauty' ? 'face' : 'sliders')}<span>${tool === 'beauty' ? (beautyControl === 'brush' ? 'Sapukan pada foto' : 'Sentuhan natural') : 'Pratinjau langsung'}</span>`;
  if (tool === 'flash') $('#panel-context').innerHTML = `${icon('flash')}<span>${state.filter === 'ccd' ? 'Ketuk foto untuk arahkan cahaya' : 'Cocok untuk potret gelap'}</span>`;
  document.querySelectorAll('[data-tool]').forEach(el => { el.classList.toggle('active', el.dataset.tool === tool); el.setAttribute('aria-pressed', String(el.dataset.tool === tool)); });
  $('#photo')?.classList.toggle('drawing', tool === 'brush' || tool === 'beauty' && brush.mode === 'smooth');
}
function cssFilter(f) { return `contrast(${f.contrast}) saturate(${f.saturation}) sepia(${Math.max(0, f.tone[0]) / 70}) brightness(${1 + (f.fade || 0) / 100})`; }
function overlayControls(o) { return `<div class="section-label">PENGATURAN LAYER</div>${range('Ukuran', 'overlay.size', o.size, 2, 30)}${range('Rotasi', 'overlay.rotation', o.rotation || 0, -180, 180)}<label class="color-field">Warna<input type="color" data-color="overlay" value="${o.color}"></label>${btn('remove-overlay', 'Hapus layer', 'trash', 'quiet full')}`; }
function layers() { return state.overlays.length ? `<div class="section-label">LAYER · ${state.overlays.length}</div><div class="layers">${[...state.overlays].reverse().map(o => `<button class="layer ${o.id === selected ? 'selected' : ''}" data-action="select-overlay" data-value="${o.id}">${icon(o.kind === 'text' ? 'text' : 'sticker')}<span>${escape(o.text.slice(0, 28))}</span>${icon('chevron')}</button>`).join('')}</div>` : ''; }

function schedulePaint() { cancelAnimationFrame(paintFrame); paintFrame = requestAnimationFrame(paint); }
async function paint() {
  const version = ++paintVersion;
  try {
    const c = await render(structuredClone(state), 1100, compare);
    if (version !== paintVersion) return;
    renderedCanvas = c;
    const target = $('#photo'); target.width = c.width; target.height = c.height;
    const ctx = target.getContext('2d'); ctx.drawImage(c, 0, 0);
    if (tool === 'flash' && state.filter === 'ccd' && !compare) {
      const settings = state.flash || initialState().flash, rect = c.photoRect;
      const x = rect.x + settings.x / 100 * rect.width, y = rect.y + settings.y / 100 * rect.height;
      const radius = Math.max(7, c.width / 65);
      ctx.save(); ctx.strokeStyle = '#16b9ef'; ctx.lineWidth = Math.max(1.5, c.width / 500);
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.moveTo(x - radius / 2, y); ctx.lineTo(x + radius / 2, y); ctx.moveTo(x, y - radius / 2); ctx.lineTo(x, y + radius / 2); ctx.stroke(); ctx.restore();
    }
    const o = state.overlays.find(o => o.id === selected);
    if (o && !compare) {
      const b = overlayBounds(ctx, o, c.width, c.height);
      ctx.strokeStyle = '#16b9ef'; ctx.lineWidth = Math.max(2, c.width / 350); ctx.setLineDash([8, 5]); ctx.strokeRect(b.x, b.y, b.width, b.height);
    }
    const img = await loadImage(state.source);
    if (version !== paintVersion) return;
    const ratio = Math.min(1, 1100 / Math.max(img.width, img.height));
    $('#dimensions').textContent = `${Math.round(c.width / ratio)} × ${Math.round(c.height / ratio)} px`;
    $('#before-label').hidden = !compare;
    $('.canvas-loading').hidden = true;
    fitCanvas();
  } catch (e) { toast(e.message); $('.canvas-loading').hidden = true; }
}
function fitCanvas() {
  const c = $('#photo'), area = $('#canvas-scroll'); if (!c?.width || !area) return;
  const padding = area.clientWidth <= 800 ? 16 : 60;
  const size = fitPreview(c.width, c.height, area.clientWidth - padding, area.clientHeight - 16, zoom);
  c.style.width = `${size.width}px`; c.style.height = `${size.height}px`;
  $('#zoom-label').textContent = `${Math.round(zoom * 100)}%`;
}
function commit(refresh = false) {
  history.push(state); dirty = true; historyButtons(); schedulePaint();
  if (refresh) panel();
  $('.document-name').textContent = state.name;
  $('#save-status').textContent = 'Perubahan belum tersimpan';
  clearTimeout(saveTimer); saveTimer = setTimeout(() => autosave(), 900);
}
function historyButtons() { $('[data-action="undo"]').disabled = !history.canUndo; $('[data-action="redo"]').disabled = !history.canRedo; }
async function autosave() {
  const snapshot = structuredClone(state);
  try {
    await saveProject({ id: 'autosave', state: snapshot, activeProject, updated: Date.now() });
    if (JSON.stringify(state) === JSON.stringify(snapshot)) { dirty = false; $('#save-status').textContent = 'Tersimpan di perangkat'; }
  } catch {
    $('#save-status').textContent = 'Belum tersimpan · ekspor untuk menyimpan';
    if (!storageWarning) { toast('Penyimpanan browser tidak tersedia atau penuh. Ekspor foto untuk menyimpan hasil.'); storageWarning = true; }
  }
}
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').classList.remove('show'), 4000); }
function modal(title, body, cls = '') {
  const el = $('#modal');
  el.className = cls;
  el.innerHTML = `<div class="modal-header"><h2>${title}</h2>${btn('close-modal', '', 'close', 'icon-button', 'aria-label="Tutup dialog"')}</div>${body}`;
  if (!el.open) el.showModal();
}
function confirmAction(title, text, action, label = 'Lanjutkan') { modal(title, `<p class="modal-description">${text}</p><div class="modal-actions">${btn('close-modal', 'Batal', '', 'button secondary')}${btn(action, label, '', 'button primary')}</div>`); }
async function newDocument(source, name) {
  await loadImage(source);
  history.push(state);
  state = initialState(source, name); activeProject = crypto.randomUUID(); selected = null; zoom = 1; compare = false;
  $('[data-action="compare"]').setAttribute('aria-pressed', 'false');
  commit(true); beginToolSession();
}
async function backupBeforeReplace() {
  try { await persistProject(); }
  catch { toast('Cadangan proyek tidak tersimpan. Penyimpanan browser penuh atau tidak tersedia.'); }
}
function setCompare(value) { compare = value; $('[data-action="compare"]').setAttribute('aria-pressed', String(value)); schedulePaint(); }
function addOverlay(kind, text) {
  if (state.overlays.length >= 30) return toast('Maksimal 30 layer dalam satu foto.');
  const o = { id: crypto.randomUUID(), kind, text, x: .5, y: .55, size: kind === 'text' ? 7 : 13, font: 'Arial', color: '#ffffff', bold: false, shadow: kind === 'text', rotation: 0 };
  state.overlays.push(o); selected = o.id; commit(true);
}
function selection() { return state.overlays.find(o => o.id === selected); }
async function autoEnhance() {
  const source = initialState(state.source); source.crop = state.crop; source.rotation = state.rotation;
  const c = await render(source, 180), data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let total = 0, count = 0; for (let i = 0; i < data.length; i += 4) if (data[i + 3]) { total += .299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2]; count++; }
  state.adjustments.exposure = Math.round(clamp(Math.log2(132 / Math.max(1, total / Math.max(count, 1))) * 100, -45, 45));
  Object.assign(state.adjustments, { contrast: 9, saturation: 8, shadows: 14, highlights: -10 });
  commit(true); toast('Cahaya dan warna sudah diseimbangkan.');
}
async function projectGallery() {
  const projects = (await listProjects()).filter(p => p.id !== 'autosave').sort((a, b) => b.updated - a.updated);
  modal('Proyek saya', `<p class="modal-description">Tersimpan di browser pada perangkat ini.</p>${btn('save-project', 'Simpan proyek saat ini', 'save', 'button primary full')}<div class="projects-grid">${projects.length ? projects.map(p => `<article class="project-card"><button data-action="open-project" data-value="${p.id}"><img src="${escape(p.thumbnail)}" alt="${escape(p.state.name)}"><strong>${escape(p.state.name)}</strong><small>${new Date(p.updated).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</small></button>${btn('delete-project', '', 'trash', 'icon-button', `data-value="${p.id}" aria-label="Hapus ${escape(p.state.name)}"`)}</article>`).join('') : '<p class="empty-message">Cerita pertama Anda dimulai di sini.<br>Simpan proyek untuk melanjutkannya nanti.</p>'}</div>`, 'wide-modal');
}
async function exportModal() {
  modal('Siap untuk dibagikan.', `<p class="modal-description">Simpan momen Anda, tanpa watermark.</p><div class="export-preview"><img id="export-preview" alt="Pratinjau ekspor"></div><label class="input-label">Nama file<input id="export-name" value="${escape(state.name)}" maxlength="80"></label><div class="export-options"><label class="input-label">Format<select id="export-format"><option value="image/jpeg">JPG · ukuran kecil</option><option value="image/png">PNG · kualitas penuh</option><option value="image/webp">WebP · efisien</option></select></label><label class="input-label">Resolusi<select id="export-resolution"><option value="4096">Penuh (maks. 4096 px)</option><option value="2048">2048 px</option><option value="1080">1080 px</option></select></label></div>${range('Kualitas JPG / WebP', 'export-quality', 92, 50, 100)}${btn('download-file', 'Unduh foto', 'download', 'button primary full')}<p class="field-hint centered">Foto diproses di perangkat Anda.</p>`);
  const c = await render(structuredClone(state), 350); if ($('#export-preview')) $('#export-preview').src = c.toDataURL('image/jpeg', .85);
}
async function downloadFile() {
  const button = $('[data-action="download-file"]'); button.disabled = true; button.textContent = 'Menyiapkan foto…';
  const format = $('#export-format').value, max = +$('#export-resolution').value, quality = +$('[data-path="export-quality"]').value / 100;
  const name = ($('#export-name').value || 'aratu-photo').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');
  try {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    let c = await render(structuredClone(state), max);
    if (Math.max(c.width, c.height) > max) { const scaled = document.createElement('canvas'); const scale = max / Math.max(c.width, c.height); scaled.width = Math.round(c.width * scale); scaled.height = Math.round(c.height * scale); scaled.getContext('2d').drawImage(c, 0, 0, scaled.width, scaled.height); c = scaled; }
    if (format === 'image/jpeg') { const ctx = c.getContext('2d'); ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = 'white'; ctx.fillRect(0, 0, c.width, c.height); }
    const blob = await new Promise(resolve => c.toBlob(resolve, format, quality));
    if (!blob) throw new Error('Ekspor gagal. Coba resolusi lebih kecil.');
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `${name}.${blob.type.split('/')[1].replace('jpeg', 'jpg')}`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    $('#modal').close(); toast('Foto siap! Unduhan dimulai.');
  } finally { button.disabled = false; button.innerHTML = `${icon('download')}Unduh foto`; }
}
async function collageModal() {
  modal('Momen yang lebih lengkap.', `<p class="modal-description">${collageSources.length} foto dipilih · setiap foto dipotong dari tengah.</p><canvas id="collage-preview" aria-label="Pratinjau kolase"></canvas><label class="input-label">Tata letak<select id="collage-layout"><option value="grid">Grid klasik</option><option value="hero">Editorial</option><option value="strip">Photo strip</option></select></label>${range('Jarak antar foto', 'collage-gap', 12, 0, 40)}<label class="color-field">Warna latar<input type="color" id="collage-color" value="#ffffff"></label>${btn('collage-create', 'Buka kolase di editor', 'collage', 'button primary full')}<p class="field-hint">Proyek saat ini disimpan otomatis sebelum kolase dibuka.</p>`);
  await previewCollage();
}
async function previewCollage() {
  if (!$('#collage-layout')) return;
  const version = ++collageVersion;
  const c = await composeCollage(collageSources, $('#collage-layout').value, +$('[data-path="collage-gap"]').value, $('#collage-color').value);
  const preview = $('#collage-preview');
  if (!preview || version !== collageVersion) return;
  preview.width = c.width; preview.height = c.height; preview.getContext('2d').drawImage(c, 0, 0);
}
async function persistProject() {
  const snapshot = structuredClone(state), c = await render(snapshot, 300);
  await saveProject({ id: activeProject, state: snapshot, thumbnail: c.toDataURL('image/jpeg', .8), updated: Date.now() });
}

const actions = {
  'flash-mode': el => { state.filter = el.dataset.value === 'on' ? 'ccd' : 'original'; commit(true); },
  'flash-control': el => { flashControl = el.dataset.value; panel(); },
  'focus-canvas': el => { const focused = $('#app').classList.toggle('focus-mode'); el.setAttribute('aria-pressed', String(focused)); el.setAttribute('aria-label', focused ? 'Kembali ke panel edit' : 'Perluas kanvas'); fitCanvas(); },
  'beauty-control': el => { beautyControl = el.dataset.value; brush.mode = beautyControl === 'brush' ? 'smooth' : 'draw'; panel(); },
  'beauty-tab': el => { beautyControl = el.dataset.value === 'local' ? 'brush' : 'smooth'; brush.mode = beautyControl === 'brush' ? 'smooth' : 'draw'; if (beautyControl === 'brush') brush.size = 8; panel(); },
  'adjust-control': el => { adjustmentControl = el.dataset.value; panel(); },
  'cancel-tool': () => { if (!toolSession) return; state = structuredClone(toolSession.state); history.entries = toolSession.entries.slice(); history.index = toolSession.index; selected = null; commitAfterHistory(); beginToolSession(); toast('Perubahan pada alat ini dibatalkan.'); },
  'apply-tool': () => { history.push(state); selected = null; beginToolSession(); panel(); schedulePaint(); toast('Perubahan diterapkan.'); },
  'reset-tool': () => {
    const defaults = initialState();
    if (tool === 'beauty') { if (beautyControl === 'brush') state.strokes = state.strokes.filter(s => s.mode !== 'smooth'); else state.beauty[beautyControl] = 0; }
    else if (tool === 'adjust') state.adjustments[adjustmentControl] = 0;
    else if (tool === 'filters') { state.filter = 'original'; state.intensity = 80; }
    else if (tool === 'flash') { state.flash = defaults.flash; state.intensity = 80; commit(true); return; }
    else if (tool === 'crop') { state.crop = defaults.crop; state.rotation = 0; state.flipX = state.flipY = false; }
    else if (tool === 'frame') state.frame = defaults.frame;
    else if (tool === 'brush') state.strokes = state.strokes.filter(s => s.mode !== 'draw');
    else if (tool === 'text' || tool === 'stickers') { const kind = tool === 'text' ? 'text' : 'sticker'; state.overlays = state.overlays.filter(o => o.kind !== kind); selected = null; }
    else return;
    commit(true);
  },
  upload: () => $('#upload').click(),
  category: el => { category = el.dataset.value; panel(); },
  filter: el => { state.filter = el.dataset.value; commit(true); },
  undo: () => { state = history.undo(); selected = null; commitAfterHistory(); },
  redo: () => { state = history.redo(); selected = null; commitAfterHistory(); },
  reset: () => confirmAction('Rekomposisi dari awal?', 'Semua edit pada foto ini akan direset. Anda tetap dapat menggunakan Undo.', 'confirm-reset', 'Reset edit'),
  'confirm-reset': () => { state = initialState(state.source, state.name); selected = null; commit(true); $('#modal').close(); },
  'reset-adjust': () => { state.adjustments = initialState().adjustments; commit(true); },
  enhance: autoEnhance,
  ratio: el => { state.crop.ratio = el.dataset.value; commit(true); },
  rotate: () => { state.rotation = (state.rotation + 90) % 360; commit(); },
  'flip-x': () => { state.flipX = !state.flipX; commit(); },
  'flip-y': () => { state.flipY = !state.flipY; commit(); },
  'add-text': () => addOverlay('text', 'Your little moment'),
  'add-sticker': el => addOverlay('sticker', el.dataset.value),
  'select-overlay': el => { const overlay = state.overlays.find(o => o.id === el.dataset.value); if (!overlay) return; const nextTool = overlay.kind === 'text' ? 'text' : 'stickers'; if (nextTool !== tool) chooseTool(nextTool); selected = overlay.id; panel(); schedulePaint(); },
  'remove-overlay': () => { state.overlays = state.overlays.filter(o => o.id !== selected); selected = null; commit(true); },
  'brush-color': el => { brush.color = el.dataset.value; panel(); },
  'clear-strokes': () => { state.strokes = []; commit(); },
  'smooth-brush': () => { brush.mode = 'smooth'; brush.size = 8; selected = null; panel(); schedulePaint(); },
  'stop-brush': () => { brush.mode = 'draw'; panel(); },
  frame: el => { const id = el.dataset.value; state.frame = { size: id === 'none' ? 0 : 6, color: id === 'dark' ? '#25222c' : '#ffffff', bottom: id === 'polaroid' }; commit(true); },
  'zoom-in': () => { zoom = Math.min(3, zoom + .25); fitCanvas(); },
  'zoom-out': () => { zoom = Math.max(.5, zoom - .25); fitCanvas(); },
  fit: () => { zoom = 1; fitCanvas(); },
  compare: () => setCompare(!compare),
  rename: () => modal('Beri nama momen ini.', `<label class="input-label">Nama proyek<input id="project-name" value="${escape(state.name)}" maxlength="80" autofocus></label>${btn('confirm-rename', 'Simpan nama', 'check', 'button primary full')}`),
  'confirm-rename': () => { state.name = $('#project-name').value.trim() || 'Untitled moment'; commit(); $('#modal').close(); },
  projects: projectGallery,
  'save-project': async () => { await persistProject(); toast('Proyek tersimpan.'); await projectGallery(); },
  'open-project': async el => { await backupBeforeReplace(); const p = (await listProjects()).find(p => p.id === el.dataset.value); if (!p) return; await loadImage(p.state.source); history.push(state); state = p.state; activeProject = p.id; selected = null; compare = false; zoom = 1; $('[data-action="compare"]').setAttribute('aria-pressed', 'false'); $('#modal').close(); commit(true); beginToolSession(); },
  'delete-project': el => { const id = el.dataset.value; confirmAction('Hapus proyek?', 'Proyek tersimpan ini akan dihapus dari perangkat. Foto sumber di perangkat Anda tidak ikut dihapus.', 'confirm-delete', 'Hapus proyek'); $('[data-action="confirm-delete"]').dataset.value = id; },
  'confirm-delete': async el => { await deleteProject(el.dataset.value); await projectGallery(); },
  export: exportModal,
  'download-file': downloadFile,
  'close-modal': () => $('#modal').close(),
  'collage-upload': () => $('#collage-upload').click(),
  'collage-create': async () => { const c = await composeCollage(collageSources, $('#collage-layout').value, +$('[data-path="collage-gap"]').value, $('#collage-color').value); await backupBeforeReplace(); await newDocument(c.toDataURL('image/png'), 'My little moments'); tool = 'filters'; panel(); $('#modal').close(); },
  install: async () => {
    if (installPrompt) { await installPrompt.prompt(); const result = await installPrompt.userChoice; if (result.outcome === 'accepted') toast('Aratu Studio berhasil diinstal.'); installPrompt = null; }
    else modal('Studio, selalu dekat.', `<div class="install-art"><img src="./public/icon.svg" alt="Aratu Studio"></div><p class="modal-description">Tambahkan Aratu ke layar utama untuk membuka editor seperti aplikasi.</p><div class="help-item"><strong>iPhone / iPad</strong><p>Buka di Safari → Bagikan → Tambahkan ke Layar Utama.</p></div><div class="help-item"><strong>Android / Desktop</strong><p>Buka menu browser → Instal aplikasi atau Tambahkan ke layar utama. Instalasi tersedia melalui HTTPS atau localhost.</p></div><p class="field-hint">Setelah kunjungan pertama selesai dimuat, editor dapat dibuka offline.</p>`);
  },
  help: () => modal('A little help.', `<div class="help-item"><strong>Mulai dari momen Anda</strong><p>Buka foto atau seret foto ke kanvas. JPG, PNG, WebP, dan AVIF hingga 25 MB. Foto besar diperkecil ke sisi terpanjang 4096 px.</p></div><div class="help-item"><strong>Edit sesuka Anda</strong><p>Filter, warna, retouch, potong, teks, stiker, kuas, bingkai, dan kolase. Geser teks atau stiker langsung di foto.</p></div><div class="shortcuts"><span>Undo</span><kbd>⌘ / Ctrl Z</kbd><span>Redo</span><kbd>⌘ / Ctrl Shift Z</kbd><span>Simpan proyek</span><kbd>⌘ / Ctrl S</kbd><span>Lihat sebelum</span><kbd>Tahan Spasi</kbd><span>Geser layer</span><kbd>↑ ↓ ← →</kbd></div><div class="help-item"><strong>Pribadi, bahkan saat offline</strong><p>Foto diproses di perangkat Anda. Proyek disimpan di browser ini; menghapus data situs juga menghapus proyek. Ekspor untuk menyimpan salinan di luar browser.</p></div><div class="help-item"><strong>Tentang Aratu Studio</strong><p>Editor foto independen yang terinspirasi alur Meitu. Filter dan retouch menggunakan pengolahan gambar lokal. AI generatif, penghapus latar/objek otomatis, makeup, dan editor video belum tersedia.</p></div>`, 'wide-modal'),
};
function commitAfterHistory() { dirty = true; historyButtons(); panel(); schedulePaint(); $('.document-name').textContent = state.name; $('#save-status').textContent = 'Perubahan belum tersimpan'; clearTimeout(saveTimer); saveTimer = setTimeout(autosave, 900); }

document.addEventListener('click', async event => {
  const toolButton = event.target.closest('[data-tool]');
  if (toolButton) { if (!isBusy && toolButton.dataset.tool !== tool) chooseTool(toolButton.dataset.tool); return; }
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled || isBusy) return;
  const action = actions[target.dataset.action]; if (!action) return;
  try { const result = action(target); if (result?.then) { isBusy = true; await result; } }
  catch (e) { toast(e.message || 'Terjadi kendala. Coba lagi.'); }
  finally { isBusy = false; }
});
document.addEventListener('input', event => {
  const el = event.target;
  if (el.type === 'range') { el.closest('label').querySelector('output').textContent = el.value; el.style.setProperty('--progress', `${(+el.value - +el.min) / (+el.max - +el.min) * 100}%`); }
  const path = el.dataset.path;
  if (path) {
    if (path === 'export-quality') return;
    if (path === 'collage-gap') { previewCollage().catch(e => toast(e.message)); return; }
    const [group, key] = path.split('.');
    if (group === 'brush') brush[key] = +el.value;
    else if (group === 'overlay') { if (selection()) selection()[key] = +el.value; }
    else if (key) { state[group] ||= structuredClone(initialState()[group]); state[group][key] = +el.value; }
    else state[group] = +el.value;
    schedulePaint();
  }
  if (el.id === 'overlay-text' && selection()) { selection().text = el.value; schedulePaint(); }
  if (el.dataset.color) { if (el.dataset.color === 'brush') brush.color = el.value; else if (el.dataset.color === 'frame') state.frame.color = el.value; else if (selection()) selection().color = el.value; schedulePaint(); }
  if (el.id === 'collage-color') previewCollage().catch(e => toast(e.message));
});
document.addEventListener('change', event => {
  const el = event.target;
  if (el.dataset.path && !/^(brush\.|export-|collage-)/.test(el.dataset.path)) commit();
  if (el.id === 'overlay-text') commit();
  if (el.id === 'overlay-font' && selection()) { selection().font = el.value; commit(); }
  if (el.id === 'overlay-bold' && selection()) { selection().bold = el.checked; commit(); }
  if (el.id === 'overlay-shadow' && selection()) { selection().shadow = el.checked; commit(); }
  if (el.id === 'frame-bottom') { state.frame.bottom = el.checked; commit(); }
  if (el.dataset.color && el.dataset.color !== 'brush') commit();
  if (el.id === 'collage-layout') previewCollage().catch(e => toast(e.message));
});

async function receiveFile(file) {
  if (!file || isBusy) return;
  isBusy = true;
  $('.canvas-loading').hidden = false;
  try { const result = await importFile(file); await backupBeforeReplace(); await newDocument(result.source, result.name); toast(result.resized ? 'Foto dibuka dan disesuaikan ke 4096 px.' : 'Foto Anda siap diedit.'); }
  catch (e) { toast(e.message); }
  finally { isBusy = false; $('.canvas-loading').hidden = true; $('#upload').value = ''; }
}
$('#upload').addEventListener('change', event => receiveFile(event.target.files[0]));
$('#collage-upload').addEventListener('change', async event => {
  const files = [...event.target.files]; event.target.value = '';
  if (files.length < 2 || files.length > 4) return toast('Pilih 2 sampai 4 foto untuk kolase.');
  try { collageSources = []; for (const file of files) collageSources.push((await importFile(file)).source); await collageModal(); }
  catch (e) { toast(e.message); }
});
function bindCanvas() {
  const c = $('#photo'), drop = $('#drop-zone');
  const point = e => { const r = c.getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) }; };
  c.addEventListener('pointerdown', e => {
    if (compare || isBusy || e.button !== 0) return;
    const p = point(e);
    if (tool === 'flash' && state.filter === 'ccd') {
      const settings = state.flash ||= initialState().flash;
      // Canvas includes the frame; map taps back into photograph coordinates.
      const rect = renderedCanvas?.photoRect || { x: 0, y: 0, width: c.width, height: c.height };
      settings.x = Math.round(clamp((p.x * c.width - rect.x) / rect.width, 0, 1) * 100);
      settings.y = Math.round(clamp((p.y * c.height - rect.y) / rect.height, 0, 1) * 100);
      commit(); toast('Titik cahaya dipindahkan.'); return;
    }
    c.setPointerCapture(e.pointerId);
    if (tool === 'brush' || tool === 'beauty' && brush.mode === 'smooth') {
      if (state.strokes.length >= 100) return toast('Maksimal 100 sapuan. Ekspor dan buka ulang untuk melanjutkan.');
      const s = { ...brush, mode: tool === 'beauty' ? 'smooth' : 'draw', points: [p] }; state.strokes.push(s); drag = { type: 'stroke', stroke: s }; selected = null;
    } else {
      const ctx = c.getContext('2d');
      const o = [...state.overlays].reverse().find(o => { const b = overlayBounds(ctx, o, c.width, c.height); return p.x * c.width >= b.x && p.x * c.width <= b.x + b.width && p.y * c.height >= b.y && p.y * c.height <= b.y + b.height; });
      selected = o?.id || null;
      if (o) { const nextTool = o.kind === 'text' ? 'text' : 'stickers'; if (nextTool !== tool) chooseTool(nextTool); selected = o.id; drag = { type: 'overlay', dx: p.x - o.x, dy: p.y - o.y, moved: false }; panel(); }
    }
    schedulePaint();
  });
  c.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = point(e);
    if (drag.type === 'stroke') {
      const points = drag.stroke.points;
      if (points.length > 6000) return;
      const last = points.at(-1), dist = Math.hypot(p.x - last.x, p.y - last.y);
      const steps = Math.max(1, Math.ceil(dist / (drag.stroke.size / 400)));
      for (let i = 1; i <= steps; i++) points.push({ x: last.x + (p.x - last.x) * i / steps, y: last.y + (p.y - last.y) * i / steps });
    } else if (selection()) { selection().x = clamp(p.x - drag.dx, 0, 1); selection().y = clamp(p.y - drag.dy, 0, 1); drag.moved = true; }
    schedulePaint();
  });
  const end = () => { if (drag) { if (drag.type === 'stroke' || drag.moved) commit(); drag = null; } };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end); c.addEventListener('lostpointercapture', end);
  let depth = 0;
  drop.addEventListener('dragenter', e => { e.preventDefault(); depth++; drop.classList.add('drag-over'); });
  drop.addEventListener('dragover', e => e.preventDefault());
  drop.addEventListener('dragleave', () => { if (--depth <= 0) drop.classList.remove('drag-over'); });
  drop.addEventListener('drop', e => { e.preventDefault(); depth = 0; drop.classList.remove('drag-over'); receiveFile(e.dataTransfer.files[0]); });
  document.addEventListener('dragover', e => e.preventDefault()); document.addEventListener('drop', e => e.preventDefault());
}
document.addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || $('#modal').open) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); actions[e.shiftKey ? 'redo' : 'undo'](); }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); actions.redo(); }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); persistProject().then(() => toast('Proyek tersimpan.')).catch(() => toast('Penyimpanan gagal. Ekspor foto untuk menyimpan.')); }
  if (e.code === 'Space' && e.target.id === 'photo') { e.preventDefault(); setCompare(true); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selection()) { e.preventDefault(); actions['remove-overlay'](); }
  if (selection() && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault(); const o = selection(), amount = e.shiftKey ? .02 : .005;
    if (e.key === 'ArrowUp') o.y = clamp(o.y - amount, 0, 1);
    if (e.key === 'ArrowDown') o.y = clamp(o.y + amount, 0, 1);
    if (e.key === 'ArrowLeft') o.x = clamp(o.x - amount, 0, 1);
    if (e.key === 'ArrowRight') o.x = clamp(o.x + amount, 0, 1);
    commit();
  }
});
document.addEventListener('keyup', e => { if (e.code === 'Space' && compare) setCompare(false); });
window.addEventListener('blur', () => { if (compare) setCompare(false); });
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
window.addEventListener('appinstalled', () => { installPrompt = null; toast('Selamat datang di Aratu Studio.'); });
const networkStatus = () => { $('#offline-status').textContent = navigator.onLine ? 'Studio pribadi Anda' : 'Mode offline · tetap bisa berkarya'; };
window.addEventListener('online', networkStatus); window.addEventListener('offline', networkStatus);
mount(); networkStatus();
try {
  const saved = (await listProjects()).find(p => p.id === 'autosave');
  if (saved) { await loadImage(saved.state.source); state = saved.state; activeProject = saved.activeProject || crypto.randomUUID(); history = new History(state); panel(); $('.document-name').textContent = state.name; $('#save-status').textContent = 'Proyek terakhir dipulihkan'; beginToolSession(); schedulePaint(); }
} catch { /* Editing remains available when browser storage is unavailable. */ }
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').then(async () => { await navigator.serviceWorker.ready; if (navigator.onLine) $('#offline-status').textContent = 'Siap digunakan offline'; }).catch(() => { $('#offline-status').textContent = 'Mode online · offline belum tersedia'; });
