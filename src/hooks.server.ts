import { error, redirect, type Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { verifyAdminSession } from '$lib/server/auth';
import { localDemo } from '$lib/server/demo';
import { resolveStreamer, permissions } from '$lib/server/streamers';
import { tenantContext } from '$lib/server/tenant';
import { hostSlug, pathContext, validSlug } from '$lib/streamers';

export const handle: Handle = async ({ event, resolve }) => {
  const path = pathContext(event.url.pathname);
  const host = hostSlug(event.url.hostname, env.PUBLIC_ROOT_DOMAIN || 'xs0929.cn');
  if (host && path.slug && host !== path.slug) error(400, '主播子域名和路径不一致。');
  if (path.slug && !validSlug(path.slug)) error(404, '主播不存在。');
  const slug = host || path.slug;
  const streamer = slug ? await resolveStreamer(slug) : null;
  if (slug && !streamer) error(404, '主播不存在或已停用。');
  if (localDemo && !['GET', 'HEAD', 'OPTIONS'].includes(event.request.method)) error(503, '只读演示不支持提交或登录。');
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) &&
    event.request.headers.get('origin') !== event.url.origin
  )
    error(403, '请求来源无效，请从当前网站提交。');
  const userId = localDemo ? null : await verifyAdminSession(event.cookies);
  const access = userId ? await permissions(userId, streamer?.id) : { isAdmin: false, isPlatformAdmin: false };
  const context = { streamer, userId, ...access, base: path.base };
  Object.assign(event.locals, context);
  const pathname = path.pathname;
  const isLogin = pathname === '/admin/login';
  const isAdminArea = pathname === '/admin' || pathname.startsWith('/admin/');
  if (isAdminArea && !isLogin) {
    if (!userId) redirect(303, `${path.base}/admin/login`);
    if (streamer && !access.isAdmin) error(403, '没有管理此主播的权限。');
    if (pathname.startsWith('/admin/streamers') && !access.isPlatformAdmin) error(403, '需要平台管理员权限。');
    if (!streamer && pathname === '/admin' && event.request.method === 'POST' && !event.url.searchParams.has('/logout'))
      error(400, '请先选择主播。');
    if (!streamer && pathname !== '/admin' && !pathname.startsWith('/admin/streamers')) error(400, '请先选择主播。');
  }
  if (isLogin && userId && (!streamer || access.isAdmin)) redirect(303, `${path.base}/admin`);
  if (!streamer && pathname === '/' && !['GET', 'HEAD'].includes(event.request.method))
    error(400, '请在主播歌单内提交愿望。');
  return tenantContext.run(context, async () => {
    const response = await resolve(event);
    // Avoid caching private data or tenant-specific HTML between hosts/sessions.
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  });
};
