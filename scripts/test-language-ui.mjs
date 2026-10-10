import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { stringify } from 'devalue';
import { startLocalBackend, localKey, localSecret } from './lib/local-backend.mjs';

const backend = await startLocalBackend();
Object.assign(process.env, {
  PUBLIC_SUPABASE_URL: backend.url,
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: localKey,
  SUPABASE_SECRET_KEY: localSecret,
  AUTH_SECRET: 'language-ui-test-only',
  LOCAL_DEMO: 'false',
  PUBLIC_ROOT_DOMAIN: 'xs0929.cn'
});
const { createServer } = await import('vite');
const app = await createServer({
  cacheDir: 'node_modules/.vite-tests/language-ui',
  server: { host: '127.0.0.1', port: 5196, strictPort: true }
});
await app.listen();
const api = (await import('@neteasecloudmusicapienhanced/api')).default;
const originalLyric = api.lyric;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  api.lyric = async ({ id }) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (String(id) === '996216') return { body: { code: 200 } };
    return { body: { code: 200, lrc: { lyric: 'きらめく夢を追いかけてどこまでも飛んでゆこう' } } };
  };
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:5196/s/siro0/admin/login');
  await page.locator('[name=email]').fill('siro0@local.test');
  await page.locator('[name=password]').fill(backend.password);
  await page.getByRole('button', { name: '登录后台' }).click();
  await page.waitForURL('**/s/siro0/admin');
  await page.waitForLoadState('networkidle');
  let generation = 0;
  await page.route('**/*', async (route) => {
    if (!route.request().url().includes('?/previewMusic')) return route.continue();
    const mixed = generation === 2;
    const start = 996000 + generation++ * 100;
    const data = {
      kind: 'preview-ready',
      adminMessage: 'UI fixture',
      importPreview: {
        provider: 'netease',
        sourceKind: 'playlist',
        sourceInput: 'https://music.163.com/playlist?id=1',
        status: 'ready',
        songs: Array.from({ length: mixed ? 17 : 14 }, (_, i) => ({
          title: `Language UI ${start + i}`,
          artist: 'Artist',
          language: mixed && i < 2 ? '中文' : '其他',
          languageSource: mixed && i < 2 ? 'lyrics' : 'unknown',
          neteaseId: String(start + i),
          tagsInput: ''
        }))
      }
    };
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ type: 'success', status: 200, data: stringify(data) })
    });
  });
  async function openPreview() {
    await page.getByRole('tab', { name: '歌曲软件导入' }).click();
    await page.locator('[name=musicInput]').fill('https://music.163.com/playlist?id=1');
    await page.locator('form[action="?/previewMusic"] button[type=submit]').click();
    await page.getByRole('dialog').waitFor();
  }
  await openPreview();
  const dialog = page.getByRole('dialog');
  const first = dialog.locator('tbody tr').first();
  await first.locator('button.select-trigger').click();
  await page.getByRole('option', { name: '中文', exact: true }).click();
  await dialog.getByText('歌词检查：14/14；待核对：0', { exact: true }).waitFor({ timeout: 15000 });
  assert.equal(await first.locator('[name=songLanguage]').inputValue(), '中文');
  assert.equal(await dialog.locator('tbody tr').last().locator('[name=songLanguage]').inputValue(), '日语');
  assert.ok(await first.getByText('手动选择', { exact: true }).isVisible());
  await dialog.getByRole('button', { name: '导入勾选歌曲' }).click();
  await dialog.waitFor({ state: 'hidden' });
  const saved = (
    await backend.db.query("select title,language from songs where title like 'Language UI %' order by title")
  ).rows;
  assert.equal(saved.length, 14);
  assert.equal(saved[0].language, '中文');
  assert.equal(saved.at(-1).language, '日语');
  console.log('PASS all batches finish and manual changes survive delayed automatic results and import');
  await openPreview();
  await dialog.getByRole('button', { name: '停止识别，手动核对' }).click();
  assert.equal(await dialog.getByRole('button', { name: '导入勾选歌曲' }).isEnabled(), true);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await openPreview();
  const unresolved = dialog.locator('tbody tr').filter({ hasText: 'Language UI 996216' });
  await unresolved.locator('[name=songTagsInput]').fill('流行');
  await unresolved.locator('[name=selectedSong]').uncheck();
  await dialog.getByText('歌词检查：17/17；待核对：1', { exact: true }).waitFor({ timeout: 15000 });
  assert.equal(await dialog.locator('[data-song-list]').evaluate((node) => node.scrollTop), 0);
  assert.ok(await dialog.locator('tbody tr').first().getByText('Language UI 996216', { exact: true }).isVisible());
  assert.equal(await unresolved.locator('[name=songTagsInput]').inputValue(), '流行');
  assert.equal(await unresolved.locator('[name=selectedSong]').isChecked(), false);
  for (const viewport of [
    { width: 1920, height: 948 },
    { width: 1366, height: 768 },
    { width: 1280, height: 600 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    const button = await dialog.getByRole('button', { name: '导入勾选歌曲' }).boundingBox();
    assert.ok(button && button.y >= 0 && button.y + button.height <= viewport.height, JSON.stringify(viewport));
    assert.ok(await dialog.evaluate((node) => node.scrollHeight <= node.clientHeight + 1));
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: `${process.env.TEMP}/songlist-import-layout.png` });
  await unresolved.locator('button.select-trigger').click();
  await page.getByRole('option', { name: '英语', exact: true }).click();
  await dialog.getByText('歌词检查：17/17；待核对：0', { exact: true }).waitFor();
  assert.equal(await unresolved.locator('[name=selectedSong]').isChecked(), false);
  await dialog.getByRole('button', { name: '导入勾选歌曲' }).click();
  await dialog.waitFor({ state: 'hidden' });
  const mixedSaved = (await backend.db.query("select title from songs where title like 'Language UI 9962%'")).rows;
  assert.equal(mixedSaved.length, 16);
  assert.ok(mixedSaved.every((song) => song.title !== 'Language UI 996216'));
  console.log(
    'PASS total progress, unresolved-first ordering, preserved row edits and visible footer across viewport sizes'
  );
  assert.deepEqual(errors, []);
  console.log('PASS cancellation keeps manual import available and closing the modal has no runtime errors');
} finally {
  api.lyric = originalLyric;
  await browser.close();
  await app.close();
  await backend.close();
}
