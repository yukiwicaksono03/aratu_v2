import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
function environment(overrides = {}) {
  const handlers = {}, stored = new Map(), removed = [];
  const cache = {
    addAll: async files => { for (const file of files) stored.set(file, `cached:${file}`); },
    put: async (request, response) => stored.set(request.url, response),
  };
  const context = {
    URL, Response,
    self: { addEventListener: (type, handler) => { handlers[type] = handler; }, location: { origin: 'https://studio.example' }, registration: { scope: 'https://studio.example/editor/' }, clients: { claim: async () => {} } },
    caches: { open: async () => cache, keys: async () => ['aratu-studio-v0', 'unrelated-app'], delete: async key => { removed.push(key); }, match: async request => stored.get(typeof request === 'string' ? request : request.url) },
    fetch: async () => { throw new Error('offline'); },
    ...overrides,
  };
  vm.runInNewContext(source, context);
  async function fire(type, request) {
    const pending = []; let response;
    handlers[type]({ request, waitUntil: promise => pending.push(promise), respondWith: promise => { response = promise; pending.push(promise); } });
    await Promise.all(pending);
    return response ? await response : undefined;
  }
  return { fire, stored, removed };
}
test('PWA install precaches every required local asset, including demo image', async () => {
  const env = environment(); await env.fire('install');
  assert.ok(env.stored.has('./src/app.js')); assert.ok(env.stored.has('./public/assets/portrait.jpg'));
  for (const file of env.stored.keys()) await access(new URL(`../${file === './' ? 'index.html' : file}`, import.meta.url));
});
test('activation removes only obsolete Aratu caches', async () => {
  const env = environment(); await env.fire('activate'); assert.deepEqual(env.removed, ['aratu-studio-v0']);
});
test('offline navigation returns cached app shell within deployment subpath', async () => {
  const env = environment(); await env.fire('install');
  assert.equal(await env.fire('fetch', { method: 'GET', url: 'https://studio.example/editor/', mode: 'navigate' }), 'cached:./index.html');
});
test('offline fetch returns cached assets and never intercepts external origins', async () => {
  const env = environment(); env.stored.set('https://studio.example/editor/src/app.js', 'app-code');
  assert.equal(await env.fire('fetch', { method: 'GET', url: 'https://studio.example/editor/src/app.js', mode: 'cors' }), 'app-code');
  assert.equal(await env.fire('fetch', { method: 'GET', url: 'https://external.example/image.jpg' }), undefined);
  assert.equal(await env.fire('fetch', { method: 'POST', url: 'https://studio.example/editor/' }), undefined);
});
test('successful network response refreshes shell cache', async () => {
  const env = environment({ fetch: async () => new Response('fresh-code', { status: 200 }) });
  const url = 'https://studio.example/editor/src/app.js';
  const result = await env.fire('fetch', { method: 'GET', url, mode: 'cors' });
  assert.equal(await result.text(), 'fresh-code');
  assert.equal(await env.stored.get(url).text(), 'fresh-code');
});
test('manifest icons are real PNGs with declared installable dimensions', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.scope, './');
  for (const icon of manifest.icons) {
    const buffer = await readFile(new URL(`../${icon.src}`, import.meta.url));
    assert.equal(buffer.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(`${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`, icon.sizes);
  }
});
