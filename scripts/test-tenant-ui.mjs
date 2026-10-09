import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
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
const production = process.env.SECURITY_PRODUCTION_TEST === 'true';
if (production) {
  await new Promise((resolve, reject) => {
    const build = spawn(process.execPath, [process.env.npm_execpath, 'run', 'build'], {
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: 'inherit'
    });
    build.on('error', reject);
    build.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Production build exited ${code}`))));
  });
}
const { createServer, preview } = await import('vite');
const config = {
  cacheDir: 'node_modules/.vite-tests/tenant-ui',
  server: { host: '127.0.0.1', port: 5194, strictPort: true },
  preview: { host: '127.0.0.1', port: 5194, strictPort: true }
};
const app = production ? await preview(config) : await createServer(config);
if (!production) await app.listen();
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
  page.on('console', (message) => {
    if (message.type() === 'error' && /content security policy|refused to execute/i.test(message.text()))
      errors.push(message.text());
  });
  await test('directory navigation hydrates and loads only the selected streamer', async () => {
    const response = await page.goto(origin, { waitUntil: 'networkidle' });
    if (production) {
      const csp = response.headers()['content-security-policy'];
      assert.ok(csp.includes('script-src') && csp.includes("'nonce-"), csp);
      assert.ok(
        await page
          .locator('script:not([src])')
          .evaluateAll((scripts) =>
            scripts.filter((s) => !s.type || s.type === 'module').every((s) => Boolean(s.nonce))
          )
      );
    }
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
    const assign = admin.locator('form[action="?/assign"]');
    const card = admin
      .locator('section')
      .filter({ has: admin.getByRole('heading', { name: '浏览器新主播 · browser-host' }) });
    const streamer = (await backend.db.query("select id from streamers where slug='browser-host'")).rows[0];
    await test('saving enabled state or nickname preserves form values and survives repeated saves and reloads', async () => {
      const edit = admin.locator(`form[action="?/edit"]:has(input[name="id"][value="${streamer.id}"])`);
      for (const [name, enabled] of [
        ['浏览器新主播', false],
        ['浏览器新主播', true],
        ['修改后的昵称', true],
        ['浏览器新主播', true]
      ]) {
        await edit.locator('[name=name]').fill(name);
        await edit.locator('[name=enabled]').setChecked(enabled);
        const response = admin.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('?/edit'));
        await edit.getByRole('button', { name: '保存', exact: true }).click();
        await response;
        await admin.waitForLoadState('networkidle');
        assert.equal(await edit.locator('[name=name]').inputValue(), name);
        assert.equal(await edit.locator('[name=enabled]').isChecked(), enabled);
        const saved = (await backend.db.query('select name,enabled from streamers where id=$1', [streamer.id])).rows[0];
        assert.deepEqual(saved, { name, enabled });
      }
      await admin.reload({ waitUntil: 'networkidle' });
      assert.equal(await edit.locator('[name=name]').inputValue(), '浏览器新主播');
      assert.equal(await edit.locator('[name=enabled]').isChecked(), true);
    });
    await test('invalid existing account ID shows an inline explanation and preserves the selected streamer', async () => {
      await assign.locator('[name=mode]').selectOption('existing');
      await assign.locator('[name=streamerId]').selectOption(streamer.id);
      await assign.locator('[name=userId]').fill('111');
      await assign.getByRole('button', { name: '分配管理权限', exact: true }).click();
      await assign.getByRole('alert').filter({ hasText: '必须是完整的 Supabase 用户 UUID' }).waitFor();
      assert.equal(await assign.locator('[name=userId]').inputValue(), '111');
      assert.equal(await assign.locator('[name=streamerId]').inputValue(), streamer.id);
      assert.equal(
        (await backend.db.query('select * from streamer_members where streamer_id=$1', [streamer.id])).rows.length,
        0
      );
    });
    await test('creating an account grants permission, refreshes the member list and allows streamer login', async () => {
      await assign.locator('[name=mode]').selectOption('create');
      assert.equal(await assign.locator('[name=userId]').count(), 0);
      await assign.locator('[name=email]').fill('111@local.test');
      await assign.locator('[name=password]').fill(backend.password);
      await assign.getByRole('button', { name: '分配管理权限', exact: true }).click();
      await assign.getByRole('status').filter({ hasText: '账号已分配' }).waitFor();
      const member = (
        await backend.db.query('select user_id from streamer_members where streamer_id=$1', [streamer.id])
      ).rows[0];
      assert.ok(member);
      await card.getByText(member.user_id, { exact: true }).waitFor();
      await admin.reload({ waitUntil: 'networkidle' });
      await card.getByText(member.user_id, { exact: true }).waitFor();
      const newContext = await browser.newContext();
      try {
        const login = await newContext.newPage();
        await login.goto(origin + '/s/browser-host/admin/login', { waitUntil: 'networkidle' });
        await login.locator('[name=email]').fill('111@local.test');
        await login.locator('[name=password]').fill(backend.password);
        await login.getByRole('button', { name: '登录后台', exact: true }).click();
        await login.getByRole('heading', { name: '管理歌曲与愿望单' }).waitFor();
      } finally {
        await newContext.close();
      }
    });
    await test('revocation confirmation can cancel safely or confirm and refresh membership', async () => {
      await card.getByText('111@local.test', { exact: true }).waitFor();
      admin.once('dialog', async (dialog) => {
        assert.ok(dialog.message().includes('是否确认撤销授权'));
        await dialog.dismiss();
      });
      await card.getByRole('button', { name: '撤销授权', exact: true }).click();
      await admin.reload({ waitUntil: 'networkidle' });
      await card.getByText('111@local.test', { exact: true }).waitFor();
      admin.once('dialog', async (dialog) => {
        await dialog.accept();
      });
      await card.getByRole('button', { name: '撤销授权', exact: true }).click();
      await card.getByText('尚未分配账号。', { exact: true }).waitFor();
      assert.equal(
        (await backend.db.query('select * from streamer_members where streamer_id=$1', [streamer.id])).rows.length,
        0
      );
    });
    await test('deletion confirmation can cancel or remove a disabled streamer without deleting its account or another songlist', async () => {
      const ownAsset = streamer.id + '/profile/delete.png';
      const otherAsset = backend.ids.b + '/profile/keep.png';
      backend.files.set(ownAsset, { bytes: Buffer.from('delete'), type: 'image/png' });
      backend.files.set(otherAsset, { bytes: Buffer.from('keep'), type: 'image/png' });
      await backend.db.query("update settings set value=$2 where streamer_id=$1 and key='background_path'", [
        streamer.id,
        ownAsset
      ]);
      await backend.db.query('update streamers set enabled=false where id=$1', [streamer.id]);
      await admin.reload({ waitUntil: 'networkidle' });
      const bSongs = (await backend.db.query('select * from songs where streamer_id=$1 order by id', [backend.ids.b]))
        .rows;
      admin.once('dialog', async (dialog) => {
        assert.ok(dialog.message().includes('是否确认删除歌单'));
        assert.ok(dialog.message().includes('无法撤销'));
        await dialog.dismiss();
      });
      await card.getByRole('button', { name: '删除歌单', exact: true }).click();
      await admin.reload({ waitUntil: 'networkidle' });
      await card.waitFor();
      assert.ok(backend.files.has(ownAsset));
      admin.once('dialog', async (dialog) => {
        await dialog.accept();
      });
      await card.getByRole('button', { name: '删除歌单', exact: true }).click();
      await card.waitFor({ state: 'detached' });
      assert.equal((await backend.db.query('select * from streamers where id=$1', [streamer.id])).rows.length, 0);
      assert.equal(backend.files.has(ownAsset), false);
      assert.ok(backend.files.has(otherAsset));
      assert.deepEqual(
        (await backend.db.query('select * from songs where streamer_id=$1 order by id', [backend.ids.b])).rows,
        bSongs
      );
      const login = await admin.request.post(backend.url + '/auth/v1/token?grant_type=password', {
        data: { email: '111@local.test', password: backend.password }
      });
      assert.equal(login.status(), 200);
    });
    await test(
      production
        ? 'production rejects missing deletion RPC without using the development fallback'
        : 'an already running legacy local fixture can delete one songlist without restarting or clearing others',
      async () => {
        const oldId = '77777777-7777-4777-8777-777777777777';
        await backend.db.query('select create_streamer($1,$2,$3)', [oldId, 'legacy-local', '旧本地实验']);
        await backend.db.exec('drop function public.delete_streamer(uuid)');
        const before = (await backend.db.query('select * from songs where streamer_id=$1 order by id', [backend.ids.b]))
          .rows;
        await admin.reload({ waitUntil: 'networkidle' });
        const oldCard = admin
          .locator('section')
          .filter({ has: admin.getByRole('heading', { name: '旧本地实验 · legacy-local' }) });
        admin.once('dialog', async (dialog) => {
          await dialog.accept();
        });
        const deleted = admin.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/delete'));
        await oldCard.getByRole('button', { name: '删除歌单', exact: true }).click();
        const deleteResult = await (await deleted).json();
        assert.equal(deleteResult.type, production ? 'failure' : 'success');
        if (production)
          await oldCard
            .getByText('删除功能的数据库升级尚未加载，请执行 20261003_delete_streamer.sql。', { exact: true })
            .waitFor();
        else await oldCard.waitFor({ state: 'detached' });
        assert.equal(
          (await backend.db.query('select * from streamers where id=$1', [oldId])).rows.length,
          production ? 1 : 0
        );
        assert.deepEqual(
          (await backend.db.query('select * from songs where streamer_id=$1 order by id', [backend.ids.b])).rows,
          before
        );
      }
    );
    await test('only unassigned accounts can be permanently deleted after confirmation; deletion prevents login', async () => {
      await admin.reload({ waitUntil: 'networkidle' });
      const accounts = admin.locator('#accounts');
      assert.equal(
        await accounts
          .locator(`[data-account-id="${backend.ids.admin}"]`)
          .getByRole('button', { name: '删除登录账号' })
          .count(),
        0
      );
      assert.equal(
        await accounts
          .locator(`[data-account-id="${backend.ids.aUser}"]`)
          .getByRole('button', { name: '删除登录账号' })
          .count(),
        0
      );
      for (const userId of [backend.ids.admin, backend.ids.aUser]) {
        // Use the actual browser session, including Secure loopback cookies.
        const status = await admin.evaluate(async (userId) => {
          const response = await fetch('/admin/streamers?/deleteAccount', {
            method: 'POST',
            body: new URLSearchParams({ userId }),
            headers: { Accept: 'text/html' },
            redirect: 'manual'
          });
          return response.status;
        }, userId);
        assert.equal(status, 400);
        assert.ok(backend.users.has(userId));
      }
      const user = [...backend.users.values()].find((u) => u.email === '111@local.test');
      assert.ok(user);
      const row = accounts.locator(`[data-account-id="${user.id}"]`);
      admin.once('dialog', async (dialog) => {
        assert.ok(dialog.message().includes('无法撤销'));
        await dialog.dismiss();
      });
      await row.getByRole('button', { name: '删除登录账号', exact: true }).click();
      await admin.reload({ waitUntil: 'networkidle' });
      await row.waitFor();
      assert.ok(backend.users.has(user.id));
      admin.once('dialog', async (dialog) => {
        await dialog.accept();
      });
      await row.getByRole('button', { name: '删除登录账号', exact: true }).click();
      await row.waitFor({ state: 'detached' });
      await accounts.getByRole('status').filter({ hasText: '永久删除' }).waitFor();
      assert.equal(backend.users.has(user.id), false);
      assert.equal((await backend.db.query('select * from auth.users where id=$1', [user.id])).rows.length, 0);
      const login = await admin.request.post(backend.url + '/auth/v1/token?grant_type=password', {
        data: { email: user.email, password: backend.password }
      });
      assert.equal(login.status(), 400);
      assert.ok(backend.users.has(backend.ids.aUser));
    });
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
  if (production) await new Promise((resolve) => app.httpServer.close(resolve));
  else await app.close();
  await backend.close();
}
