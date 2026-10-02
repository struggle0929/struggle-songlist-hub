import { AsyncLocalStorage } from 'node:async_hooks';
import type { Streamer } from '$lib/streamers';
import { UserFacingError } from '$lib/server/errors';

export interface TenantContext {
  streamer: Streamer | null;
  userId: string | null;
  isAdmin: boolean;
  isPlatformAdmin: boolean;
  base: string;
}

export const tenantContext = new AsyncLocalStorage<TenantContext>();
export function currentContext() {
  const context = tenantContext.getStore();
  if (!context) throw new UserFacingError('缺少请求上下文。');
  return context;
}
export function tenantId(write = false) {
  const context = currentContext();
  if (!context.streamer?.enabled) throw new UserFacingError('请先选择有效的主播歌单。');
  if (write && (!context.userId || !context.isAdmin)) throw new UserFacingError('没有管理此主播的权限。');
  return context.streamer.id;
}
export function requirePlatformAdmin() {
  const context = currentContext();
  if (!context.userId || !context.isPlatformAdmin) throw new UserFacingError('需要平台管理员权限。');
  return context.userId;
}
export function tenantAssetPath(relative: string) {
  return `${tenantId(true)}/${relative}`;
}
export function ownedAsset(path: string) {
  const id = tenantId();
  const prefix =
    path.startsWith(id + '/') ||
    (id === '00000000-0000-4000-8000-000000000001' && /^(profile|appearance|restores)\//.test(path));
  return (
    prefix && !path.split('/').some((part) => part === '.' || part === '..' || part === '') && !path.includes('\\')
  );
}
export function assertOwnedAssets(paths: string[]) {
  if (paths.some((path) => !ownedAsset(path))) throw new UserFacingError('素材不属于当前主播。');
}
export const adminPath = (path: string) => `${currentContext().base}${path}`;
