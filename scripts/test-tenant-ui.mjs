import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startLocalBackend, localKey, localSecret } from './lib/local-backend.mjs';

const backend = await startLocalBackend();
Object.assign(process.env, {
  PUBLIC_SUPABASE_URL: backend.url,
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: localKey,
  SUPABASE_SECRET_KEY: localSecret,
  AUTH_SECRET: 'ui-test-only-session-secret',
  LOCAL_DEMO: 'false',
  PUBLIC_ROOT_DOMAIN: 'xs0929.cn'
});
const { createServer } = await import('vite');
const app = await createServer({
  cacheDir: 'node_modules/.vite-tests/tenant-ui',
  server: { host: '127.0.0.1', port: 5194, strictPort: true }
});
await app.listen();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL === 'chromium' ? {} : { channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' })
});
const origin = 'http://127.0.0.1:5194';
const errors = [];
let passed = 0;
async function test(name, run) {
  await run();
  passed++;
  console.log('PASS', name);
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await test('directory navigation hydrates and loads only the selected streamer', async () => {
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: /Siro0/ }).click();
    await page.getByRole('heading', { name: 'Siro0 歌单' }).waitFor();
    assert.ok(!(await page.locator('body').innerText()).includes('薰薰兔本地歌曲'));
    assert.ok((await page.locator('body').innerText()).includes('Siro0 本地歌曲'));
  });
  await test('real login and enhanced forms save independent navigation settings', async () => {
    await page.getByRole('link', { name: '后台管理', exact: true }).click();
    await page.locator('[name=email]').fill('siro0@local.test');
    await page.locator('[name=password]').fill(backend.password);
    await page.getByRole('button', { name: '登录后台', exact: true }).click();
    await page.getByRole('heading', { name: '管理歌曲与愿望单' }).waitFor();
    await page.getByRole('button', { name: '页面配置', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('[name=headerTitle]').fill('Siro0 独立标题');
    const saved = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('saveHeader'));
    await dialog.getByRole('button', { name: '确认小标题', exact: true }).click();
    assert.equal((await saved).status(), 200);
    await page.locator('header').getByText('Siro0 独立标题', { exact: true }).waitFor();
    const bSettings = (
      await backend.db.query("select value from settings where streamer_id=$1 and key='appearance'", [backend.ids.b])
    ).rows[0].value;
    assert.equal(bSettings, '');
  });
  await test('background upload and blur preview persist within the current streamer', async () => {
    const dialog = page.getByRole('dialog');
    await dialog.locator('[name=background]').setInputFiles({
      name: 'background.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=',
        'base64'
      )
    });
    await dialog.locator('[name=backgroundBlur]').fill('25');
    assert.ok((await dialog.getByAltText('背景预览').evaluate((el) => getComputedStyle(el).filter)).includes('25px'));
    const saved = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('saveProfile'));
    await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
    await saved;
    await page.getByText('页面配置已更新。', { exact: true }).waitFor();
    const settings = (await backend.db.query('select * from settings where streamer_id=$1', [backend.ids.a])).rows;
    assert.ok(settings.find((s) => s.key === 'background_path').value.startsWith(backend.ids.a + '/profile/'));
    assert.equal(JSON.parse(settings.find((s) => s.key === 'appearance').value).backgroundBlur, 25);
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  });
  let backup;
  await test('browser downloads v2 backup with source identity and owned assets', async () => {
    await page.getByRole('button', { name: '数据配置', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出并下载备份', exact: true }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream(),
      chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    backup = JSON.parse(Buffer.concat(chunks));
    assert.equal(backup.version, 2);
    assert.equal(backup.streamer.slug, 'siro0');
    assert.equal(backup.assets.length, 1);
    assert.ok(backup.assets[0].originalPath.startsWith(backend.ids.a + '/'));
  });
  await test('signed browser uploads restore one streamer without changing another', async () => {
    const b = (await backend.db.query('select * from songs where streamer_id=$1 order by id', [backend.ids.b])).rows;
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '加载数据库', exact: true }).click();
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'local-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup))
    });
    await dialog.getByText('备份检查通过', { exact: false }).waitFor();
    await dialog.getByRole('button', { name: '确认加载并覆盖当前数据', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(
      (await backend.db.query('select * from songs where streamer_id=$1 order by id', [backend.ids.b])).rows,
      b
    );
    assert.ok(
      (
        await backend.db.query("select value from settings where streamer_id=$1 and key='background_path'", [
          backend.ids.a
        ])
      ).rows[0].value.startsWith(backend.ids.a + '/restores/')
    );
  });
  await test('desktop and mobile keep working without horizontal overflow or runtime errors', async () => {
    await page.screenshot({ path: join(tmpdir(), 'songlist-hub-admin-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(tmpdir(), 'songlist-hub-admin-mobile.png'), fullPage: true });
    await page.goto(origin + '/s/xunxuntu', { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '薰薰兔歌单' }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(!(await page.locator('body').innerText()).includes('Siro0 独立标题'));
    await page.screenshot({ path: join(tmpdir(), 'songlist-hub-public-mobile.png'), fullPage: true });
  });
  await test('platform management forms create a streamer from a real browser login', async () => {
    const platform = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const admin = await platform.newPage();
    admin.on('pageerror', (e) => errors.push(e.message));
    await admin.goto(origin + '/admin/login', { waitUntil: 'networkidle' });
    await admin.locator('[name=email]').fill('platform@local.test');
    await admin.locator('[name=password]').fill(backend.password);
    await admin.getByRole('button', { name: '登录后台', exact: true }).click();
    await admin.getByRole('link', { name: '管理主播与账号授权', exact: true }).click();
    await admin.locator('[name=slug]').fill('browser-host');
    await admin.locator('form[action="?/create"] [name=name]').fill('浏览器新主播');
    await admin.getByRole('button', { name: '创建歌单', exact: true }).click();
    await admin.getByRole('heading', { name: '浏览器新主播 · browser-host' }).waitFor();
    assert.ok(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await admin.screenshot({ path: join(tmpdir(), 'songlist-hub-platform-mobile.png'), fullPage: true });
    await platform.close();
  });
  await test('nickname-first localhost subdomain supports its own public page and admin login', async () => {
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    hostPage.on('pageerror', (e) => errors.push(e.message));
    await hostPage.goto('http://siro0.localhost:5194/', { waitUntil: 'networkidle' });
    await hostPage.getByRole('heading', { name: 'Siro0 歌单' }).waitFor();
    await hostPage.getByRole('link', { name: '后台管理', exact: true }).click();
    await hostPage.locator('[name=email]').fill('siro0@local.test');
    await hostPage.locator('[name=password]').fill(backend.password);
    await hostPage.getByRole('button', { name: '登录后台', exact: true }).click();
    await hostPage.getByRole('heading', { name: '管理歌曲与愿望单' }).waitFor();
    assert.equal(new URL(hostPage.url()).hostname, 'siro0.localhost');
    await hostContext.close();
  });
  assert.deepEqual(errors, []);
  console.log(
    `${passed} real browser integration tests passed; desktop/mobile screenshots saved to the OS temp directory.`
  );
} finally {
  await browser.close();
  await app.close();
  await backend.close();
}
