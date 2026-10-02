export const testBase = (process.env.TEST_BASE_URL || 'http://127.0.0.1:5173/s/siro0').replace(/\/$/, '');
export async function loginTestPage(page) {
  const host = new URL(testBase).hostname;
  if (!['127.0.0.1', 'localhost'].includes(host) && !host.endsWith('.localhost'))
    throw new Error('UI regression scripts only support local test servers.');
  await page.goto(testBase + '/admin/login', { waitUntil: 'networkidle' });
  await page.locator('[name=email]').fill(process.env.TEST_EMAIL || 'siro0@local.test');
  await page.locator('[name=password]').fill(process.env.TEST_PASSWORD || 'Local-only-0929!');
  await page.getByRole('button', { name: '登录后台', exact: true }).click();
  await page.waitForURL(testBase + '/admin');
}
