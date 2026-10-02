import { startLocalBackend, localKey, localSecret } from './lib/local-backend.mjs';
const backend = await startLocalBackend();
Object.assign(process.env, {
  PUBLIC_SUPABASE_URL: backend.url,
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: localKey,
  SUPABASE_SECRET_KEY: localSecret,
  AUTH_SECRET: 'local-only-session-secret-do-not-use-in-production',
  LOCAL_DEMO: 'false',
  PUBLIC_ROOT_DOMAIN: 'xs0929.cn'
});
const { createServer } = await import('vite');
const app = await createServer({ server: { host: '127.0.0.1', port: 5173, strictPort: true } });
await app.listen();
console.log('本地内存测试环境（退出后清空，不连接正式 Supabase）：');
console.log(
  '目录 http://127.0.0.1:5173/ · Siro0 http://127.0.0.1:5173/s/siro0/ · 薰薰兔 http://127.0.0.1:5173/s/xunxuntu/'
);
console.log('也可使用 http://siro0.localhost:5173/ 与 http://xunxuntu.localhost:5173/');
console.log('测试账号 platform@local.test / siro0@local.test / xunxuntu@local.test / outsider@local.test');
console.log('测试密码均为 Local-only-0929!，只用于本地，不可部署此脚本。');
async function close() {
  await app.close();
  await backend.close();
  process.exit();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
