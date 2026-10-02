import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createServer } from 'vite';
const server = await createServer({
  configFile: false,
  cacheDir: resolve('node_modules/.vite-tests/tenant-context'),
  server: { middlewareMode: true },
  resolve: { alias: { $lib: resolve('src/lib') } }
});
let passed = 0;
async function test(name, run) {
  await run();
  passed++;
  console.log('PASS', name);
}
try {
  const scope = await server.ssrLoadModule('/src/lib/server/tenant.ts');
  const routes = await server.ssrLoadModule('/src/lib/streamers.ts');
  const context = (id) => ({
    streamer: { id, slug: 'siro0', name: '主播', enabled: true },
    userId: 'user',
    isAdmin: true,
    isPlatformAdmin: false,
    base: ''
  });
  const a = '00000000-0000-4000-8000-000000000001',
    b = '22222222-2222-4222-8222-222222222222';
  await test('concurrent asynchronous requests retain independent tenant IDs', async () => {
    const results = await Promise.all(
      [a, b].map((id, index) =>
        scope.tenantContext.run(context(id), async () => {
          await new Promise((r) => setTimeout(r, 20 - index * 10));
          return [scope.tenantId(), scope.tenantAssetPath('profile/a.png')];
        })
      )
    );
    assert.deepEqual(results, [
      [a, a + '/profile/a.png'],
      [b, b + '/profile/a.png']
    ]);
    assert.throws(() => scope.tenantId());
  });
  await test('missing identity, missing authorization and disabled tenants fail closed', async () => {
    for (const patch of [
      { userId: null },
      { isAdmin: false },
      { streamer: null },
      { streamer: { ...context(a).streamer, enabled: false } }
    ]) {
      scope.tenantContext.run({ ...context(a), ...patch }, () => assert.throws(() => scope.tenantId(true)));
    }
    scope.tenantContext.run(context(a), () => assert.throws(() => scope.requirePlatformAdmin()));
  });
  await test('asset traversal and cross-streamer paths are rejected; legacy keys belong only to siro0', async () => {
    for (const id of [a, b])
      scope.tenantContext.run(context(id), () => {
        assert.ok(scope.ownedAsset(id + '/profile/a.png'));
        for (const path of [
          id + '/../profile/a.png',
          id + '/profile//a.png',
          id + '/profile/./a.png',
          id + '\\profile\\a.png',
          (id === a ? b : a) + '/profile/a.png'
        ])
          assert.ok(!scope.ownedAsset(path));
        assert.equal(scope.ownedAsset('profile/legacy.jpg'), id === a);
      });
  });
  await test('subdomain parser validates root boundaries, reserved names and stable slugs', async () => {
    assert.equal(routes.hostSlug('siro0.xs0929.cn', 'xs0929.cn'), 'siro0');
    assert.equal(routes.hostSlug('SIRO0.XS0929.CN.', 'xs0929.cn'), 'siro0');
    assert.equal(routes.hostSlug('siro0.localhost', 'xs0929.cn'), 'siro0');
    for (const host of ['siro0.xs0929.cn.evil.test', 'a.b.xs0929.cn', 'admin.xs0929.cn', '-bad.xs0929.cn', 'xs0929.cn'])
      assert.equal(routes.hostSlug(host, 'xs0929.cn'), null);
    assert.equal(routes.validSlug('中文主播'), false);
  });
  await test('production entries keep nickname first while preview URLs use the supported fallback', async () => {
    assert.equal(
      routes.streamerUrl('siro0', new URL('https://xs0929.cn'), 'xs0929.cn', '/admin'),
      'https://siro0.xs0929.cn/admin'
    );
    assert.equal(
      routes.streamerUrl('siro0', new URL('http://localhost:5173'), 'xs0929.cn'),
      'http://siro0.localhost:5173/'
    );
    assert.equal(routes.streamerUrl('siro0', new URL('https://preview.vercel.app'), 'xs0929.cn'), '/s/siro0/');
  });
  console.log(`${passed} context and routing tests passed.`);
} finally {
  await server.close();
}
