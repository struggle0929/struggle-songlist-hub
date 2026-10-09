import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { startLocalBackend, localKey, localSecret } from './lib/local-backend.mjs';

const backend = await startLocalBackend();
Object.assign(process.env, {
  PUBLIC_SUPABASE_URL: backend.url,
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: localKey,
  SUPABASE_SECRET_KEY: localSecret,
  AUTH_SECRET: 'http-test-only-session-secret',
  LOCAL_DEMO: 'false',
  PUBLIC_ROOT_DOMAIN: 'xs0929.cn'
});
const { createServer } = await import('vite');
const app = await createServer({
  cacheDir: 'node_modules/.vite-tests/tenant-http',
  server: { host: '127.0.0.1', port: 5193, strictPort: true }
});
await app.listen();
const origin = 'http://127.0.0.1:5193';
let passed = 0;
const request = async (path, cookie = '', options = {}) => {
  if (options.headers?.Host)
    return new Promise((resolve, reject) => {
      const req = httpRequest(origin + path, { headers: options.headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers }))
        );
      });
      req.on('error', reject);
      req.end();
    });
  const response = await fetch(origin + path, {
    redirect: 'manual',
    ...options,
    headers: { Accept: 'text/html', Origin: origin, Cookie: cookie, ...(options.headers || {}) }
  });
  if (response.status === 308) return request(response.headers.get('location'), cookie, options);
  return response;
};
const form = (path, fields, cookie = '') =>
  request(path, cookie, { method: 'POST', body: new URLSearchParams(fields) });
const json = (path, data, cookie) =>
  request(path, cookie, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
const cookieOf = (response) =>
  response.headers
    .getSetCookie()
    .find((c) => c.startsWith('songlist_admin_session_v2='))
    ?.split(';')[0] || '';
async function login(email, path = '/admin/login') {
  const response = await form(path, { email, password: backend.password });
  assert.equal(response.status, 303, (await response.text()).slice(-2000));
  const cookie = cookieOf(response);
  assert.ok(cookie);
  return cookie;
}
async function test(name, run) {
  await run();
  passed++;
  console.log('PASS', name);
}
try {
  await test('hub, fallback paths and real subdomain hosts resolve independent catalogs', async () => {
    const hub = await (await request('/')).text();
    assert.ok(hub.includes('Siro0'));
    assert.ok(hub.includes('薰薰兔'));
    const ar = await request('/s/siro0/');
    const a = await ar.text();
    assert.equal(ar.status, 200, a.slice(-4000));
    assert.ok(a.includes('Siro0 本地歌曲'), a.slice(-4000));
    assert.ok(!a.includes('薰薰兔本地歌曲'));
    assert.ok(!a.includes('（私有）'));
    const b = await (await request('/s/xunxuntu/')).text();
    assert.ok(b.includes('薰薰兔本地歌曲'));
    assert.ok(!b.includes('Siro0 本地歌曲'));
    const hosted = await request('/', '', { headers: { Host: 'siro0.localhost:5193' } });
    assert.equal(hosted.status, 200);
    const hostedText = await hosted.text();
    assert.ok(hostedText.includes('Siro0 本地歌曲'), hostedText.slice(-3500));
    assert.equal((await request('/s/unknown/')).status, 404);
    assert.equal((await request('/s/xunxuntu', '', { headers: { Host: 'siro0.localhost:5193' } })).status, 400);
  });
  await test('unauthenticated routes redirect, unauthorized accounts cannot log into a streamer', async () => {
    assert.equal((await request('/s/siro0/admin')).status, 303);
    const denied = await form('/s/siro0/admin/login', { email: 'xunxuntu@local.test', password: backend.password });
    const deniedText = await denied.text();
    assert.equal(denied.status, 403, deniedText.slice(-5500));
    assert.equal(cookieOf(denied), '');
  });
  const aCookie = await login('siro0@local.test', '/s/siro0/admin/login');
  const bCookie = await login('xunxuntu@local.test', '/s/xunxuntu/admin/login');
  const platformCookie = await login('platform@local.test');
  await test('authenticated dashboard is scoped; cross-streamer reads and mutations are forbidden', async () => {
    const response = await request('/s/siro0/admin', aCookie);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('（私有）'));
    assert.ok(!html.includes('薰薰兔本地歌曲'));
    for (const path of ['/s/xunxuntu/admin', '/s/xunxuntu/admin/database/export', '/admin/streamers'])
      assert.equal((await request(path, aCookie)).status, 403);
    assert.equal((await form('/s/xunxuntu/admin?/resetDatabase', {}, aCookie)).status, 403);
  });
  await test('forged song IDs and bulk selection cannot modify another streamer', async () => {
    const b = (await backend.db.query('select * from songs where streamer_id=$1 order by id', [backend.ids.b])).rows;
    const response = await form(
      '/s/siro0/admin?/saveSong',
      { id: b[0].id, title: 'forged', artist: '', language: '中文', status: 'ready', tagsInput: '', isPublic: 'on' },
      aCookie
    );
    assert.ok(response.status >= 400);
    assert.ok(
      (await form('/s/siro0/admin?/bulkUpdateSongs', { bulkAction: 'delete', id: b[0].id }, aCookie)).status >= 400
    );
    assert.deepEqual(
      (await backend.db.query('select * from songs where streamer_id=$1 order by id', [backend.ids.b])).rows,
      b
    );
  });
  await test('song save, settings and public wishes retain current streamer ownership', async () => {
    const saved = await form(
      '/s/siro0/admin?/saveSong',
      { title: '新歌曲', artist: '新原唱', language: '中文', status: 'ready', tagsInput: '流行,测试', isPublic: 'on' },
      aCookie
    );
    assert.equal(saved.status, 200, (await saved.text()).slice(-2000));
    assert.equal(
      (await backend.db.query('select streamer_id from songs where title=$1', ['新歌曲'])).rows[0].streamer_id,
      backend.ids.a
    );
    const settings = await form(
      '/s/siro0/admin?/saveHeader',
      { headerField: 'headerTitle', headerTitle: 'A 新标题' },
      aCookie
    );
    assert.equal(settings.status, 200, (await settings.text()).slice(-2000));
    assert.equal(
      (await backend.db.query("select value from settings where streamer_id=$1 and key='appearance'", [backend.ids.b]))
        .rows[0].value,
      ''
    );
    const wish = await form('/s/siro0/?/submitRequest', {
      songInput: '',
      songTitle: 'A 愿望',
      artist: '',
      language: '中文',
      message: '请收录',
      requesterName: '观众'
    });
    assert.equal(wish.status, 200, (await wish.text()).slice(-2000));
    assert.equal(
      (await backend.db.query('select streamer_id from requests where song_title=$1', ['A 愿望'])).rows[0].streamer_id,
      backend.ids.a
    );
  });
  await test('export includes only target records; legacy restore changes no other streamer', async () => {
    const manifest = await (await request('/s/siro0/admin/database/export', aCookie)).json();
    assert.equal(manifest.version, 2);
    assert.equal(manifest.streamer.slug, 'siro0');
    assert.ok(manifest.data.songs.every((s) => !s.title.includes('薰薰兔')));
    const bBefore = (await backend.db.query('select * from songs where streamer_id=$1 order by id', [backend.ids.b]))
      .rows;
    const preparation = await (await json('/s/siro0/admin/database/import/prepare', { assets: [] }, aCookie)).json();
    const restored = await json(
      '/s/siro0/admin/database/import/complete',
      { restoreId: preparation.restoreId, data: manifest.data, assets: [] },
      aCookie
    );
    assert.equal(restored.status, 200, (await restored.text()).slice(-2000));
    assert.deepEqual(
      (await backend.db.query('select * from songs where streamer_id=$1 order by id', [backend.ids.b])).rows,
      bBefore
    );
  });
  await test('forged restore asset paths are rejected before touching another streamer', async () => {
    const manifest = await (await request('/s/siro0/admin/database/export', aCookie)).json();
    const restored = await json(
      '/s/siro0/admin/database/import/complete',
      {
        restoreId: '77777777-7777-4777-8777-777777777777',
        data: manifest.data,
        assets: [
          {
            originalPath: 'other.png',
            path: backend.ids.b + '/restores/77777777-7777-4777-8777-777777777777/a.png',
            size: 1
          }
        ]
      },
      aCookie
    );
    assert.equal(restored.status, 400);
  });
  await test('platform creates streamer and account, with no permission escalation for broadcasters', async () => {
    const created = await form('/admin/streamers?/create', { slug: 'new-host', name: '新主播' }, platformCookie);
    assert.equal(created.status, 200, (await created.text()).slice(-2000));
    const streamer = (await backend.db.query('select * from streamers where slug=$1', ['new-host'])).rows[0];
    const assigned = await form(
      '/admin/streamers?/assign',
      { streamerId: streamer.id, email: 'new@local.test', password: 'New-local-account-123!' },
      platformCookie
    );
    assert.equal(assigned.status, 200, (await assigned.text()).slice(-2000));
    assert.equal(
      (await backend.db.query('select count(*)::int n from streamer_members where streamer_id=$1', [streamer.id]))
        .rows[0].n,
      1
    );
    assert.equal((await form('/admin/streamers?/create', { slug: 'forged', name: 'forged' }, aCookie)).status, 403);
    assert.equal((await request('/admin/streamers', platformCookie)).status, 200);
  });
  await test('membership revocation invalidates an existing signed session on the next request', async () => {
    const revoked = await form(
      '/admin/streamers?/revoke',
      { streamerId: backend.ids.a, userId: backend.ids.aUser },
      platformCookie
    );
    assert.equal(revoked.status, 200, (await revoked.text()).slice(-2000));
    assert.equal((await request('/s/siro0/admin', aCookie)).status, 403);
    assert.equal((await request('/s/xunxuntu/admin', bCookie)).status, 200);
  });
  await test('cross-origin mutations and tampered cookies are rejected', async () => {
    const response = await request('/admin/streamers?/create', platformCookie, {
      method: 'POST',
      body: new URLSearchParams({ slug: 'csrf', name: 'csrf' }),
      headers: { Origin: 'https://evil.test' }
    });
    assert.equal(response.status, 403);
    assert.equal((await request('/admin/streamers', platformCookie + 'x')).status, 303);
  });
  await test('platform reset of A preserves every B record', async () => {
    const before = (await backend.db.query('select * from songs where streamer_id=$1 order by id', [backend.ids.b]))
      .rows;
    const response = await form('/s/siro0/admin?/resetDatabase', {}, platformCookie);
    assert.equal(response.status, 200, (await response.text()).slice(-2000));
    assert.deepEqual(
      (await backend.db.query('select * from songs where streamer_id=$1 order by id', [backend.ids.b])).rows,
      before
    );
    assert.equal(
      (await backend.db.query('select count(*)::int n from songs where streamer_id=$1', [backend.ids.a])).rows[0].n,
      0
    );
  });
  await test('security headers do not expose or cache private HTML', async () => {
    const response = await request('/s/xunxuntu/');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.ok(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  });
  await test('login limit shares counters across streamer paths and normalized email addresses', async () => {
    for (let i = 0; i < 10; i++) {
      const response = await form(i % 2 ? '/admin/login' : '/s/xunxuntu/admin/login', {
        email: i % 2 ? 'Rate-limit@local.test' : 'rate-limit@local.test',
        password: 'Wrong-password-123!'
      });
      assert.equal(response.status, 400);
    }
    const blocked = await form('/s/siro0/admin/login', {
      email: 'rate-limit@local.test',
      password: 'Wrong-password-123!'
    });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get('retry-after'), '600');
    assert.equal(cookieOf(blocked), '');
    assert.equal((await request('/s/xunxuntu/admin', bCookie)).status, 200);
    const rows = (await backend.db.query("select client_key from request_rate_limits where client_key like 'login:%'"))
      .rows;
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => !r.client_key.includes('@') && !r.client_key.includes('127.0.0.1')));
  });
  await test('public read protection returns 429 before catalog queries and preserves admin access', async () => {
    const { consumePublicRead } = await app.ssrLoadModule('/src/lib/server/security.ts');
    for (let i = 0; i < 240; i++) consumePublicRead('127.0.0.1');
    const response = await request('/s/xunxuntu/');
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '60');
    assert.equal((await request('/admin/streamers', platformCookie)).status, 200);
  });
  console.log(`${passed} HTTP integration tests passed using local PostgreSQL and isolated auth/storage fixtures.`);
} finally {
  await app.close();
  await backend.close();
}
