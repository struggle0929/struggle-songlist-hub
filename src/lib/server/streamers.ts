import { randomUUID } from 'node:crypto';
import { supabaseAdmin, supabasePublic } from '$lib/server/supabase';
import { getDemoCatalog, localDemo } from '$lib/server/demo';
import { currentContext, requirePlatformAdmin, ownedStreamerAsset } from '$lib/server/tenant';
import { appearancePaths, parseAppearance } from '$lib/appearance';
import { settingsAssetBucket } from '$lib/server/settings';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { validSlug, type Streamer } from '$lib/streamers';
import { UserFacingError } from '$lib/server/errors';

export const demoStreamers: Streamer[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'siro0',
    name: 'Siro0',
    enabled: true,
    created_at: '2026-10-03T00:00:00Z'
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'xunxuntu',
    name: '薰薰兔',
    enabled: true,
    created_at: '2026-10-03T00:00:00Z'
  }
];
export async function resolveStreamer(slug: string) {
  if (!validSlug(slug)) return null;
  if (localDemo) return demoStreamers.find((s) => s.slug === slug) ?? null;
  const { data, error } = await supabasePublic
    .from('streamers')
    .select('*')
    .eq('slug', slug)
    .eq('enabled', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}
export async function permissions(userId: string, streamerId?: string) {
  const { data: platform, error } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (platform) return { isPlatformAdmin: true, isAdmin: Boolean(streamerId) };
  if (!streamerId) return { isPlatformAdmin: false, isAdmin: false };
  const { data: member, error: memberError } = await supabaseAdmin
    .from('streamer_members')
    .select('user_id')
    .eq('user_id', userId)
    .eq('streamer_id', streamerId)
    .maybeSingle();
  if (memberError) throw memberError;
  return { isPlatformAdmin: false, isAdmin: Boolean(member) };
}
export async function listStreamers(managed = false): Promise<Streamer[]> {
  if (localDemo) return demoStreamers;
  const context = currentContext();
  if (managed && !context.userId) return [];
  let query = (managed ? supabaseAdmin : supabasePublic).from('streamers').select('*').order('name').order('id');
  if (!managed) query = query.eq('enabled', true);
  if (managed && !context.isPlatformAdmin) {
    const { data, error } = await supabaseAdmin
      .from('streamer_members')
      .select('streamer_id')
      .eq('user_id', context.userId!);
    if (error) throw error;
    if (!data?.length) return [];
    query = query
      .in(
        'id',
        data.map((m) => m.streamer_id)
      )
      .eq('enabled', true);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
export async function createStreamer(slug: string, name: string) {
  requirePlatformAdmin();
  if (!validSlug(slug) || !name.trim() || name.trim().length > 80) throw new UserFacingError('主播标识或名称无效。');
  const { error } = await supabaseAdmin.rpc('create_streamer', {
    p_id: randomUUID(),
    p_slug: slug,
    p_name: name.trim()
  });
  if (error?.code === '23505') throw new UserFacingError('主播标识已存在。');
  if (error) throw error;
}
export async function editStreamer(id: string, name: string, enabled: boolean) {
  requirePlatformAdmin();
  if (!name.trim() || name.trim().length > 80) throw new UserFacingError('昵称须为 1～80 字。');
  const { error } = await supabaseAdmin.from('streamers').update({ name: name.trim(), enabled }).eq('id', id);
  if (error) throw error;
}
export async function listMembers() {
  requirePlatformAdmin();
  const { data, error } = await supabaseAdmin.from('streamer_members').select('*').order('created_at');
  if (error) throw error;
  return Promise.all(
    (data ?? []).map(async (member) => {
      const { data: account } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
      return { ...member, email: account.user?.email ?? null };
    })
  );
}
export async function deleteStreamer(id: string) {
  requirePlatformAdmin();
  let { data, error } = await supabaseAdmin.rpc('delete_streamer', { p_streamer_id: id });
  if (error?.code === '42883' || error?.code === 'PGRST202') {
    // Only an already running pre-migration dev:local fixture uses sequential cleanup.
    // Real projects always require the atomic RPC.
    const isLocalFixture =
      import.meta.env.DEV &&
      privateEnv.SUPABASE_SECRET_KEY === 'local-service-only-key' &&
      publicEnv.PUBLIC_SUPABASE_PUBLISHABLE_KEY === 'local-publishable-key' &&
      /^http:\/\/127\.0\.0\.1:\d+$/.test(publicEnv.PUBLIC_SUPABASE_URL || '');
    if (!isLocalFixture)
      throw new UserFacingError('删除功能的数据库升级尚未加载，请执行 20261003_delete_streamer.sql。');
    const { data: rows, error: readError } = await supabaseAdmin
      .from('settings')
      .select('key,value')
      .eq('streamer_id', id);
    if (readError) throw readError;
    data = Object.fromEntries((rows ?? []).map((row) => [row.key, row.value]));
    for (const table of ['requests', 'songs', 'settings', 'streamer_members'] as const) {
      const { error: removeError } = await supabaseAdmin.from(table).delete().eq('streamer_id', id);
      if (removeError) throw removeError;
    }
    const { error: removeError } = await supabaseAdmin.from('streamers').delete().eq('id', id);
    if (removeError) throw removeError;
    error = null;
  }
  if (error) throw error;
  const settings = data as Record<string, string>;
  const paths = [
    ...new Set(
      [settings.avatar_path, settings.background_path, ...appearancePaths(parseAppearance(settings.appearance))].filter(
        (path) => Boolean(path) && ownedStreamerAsset(path, id)
      )
    )
  ];
  if (paths.length) {
    const { error: cleanupError } = await supabaseAdmin.storage.from(settingsAssetBucket).remove(paths);
    if (cleanupError) {
      console.error('歌单已删除，但素材清理失败', id, cleanupError);
      return '歌单及授权已删除，但素材清理失败，请检查对象存储。账号仍保留。';
    }
  }
  return '歌单、歌曲、愿望、配置及授权已删除。登录账号仍保留，但已失去此歌单的管理权限；其他歌单权限不受影响。';
}
export async function assignAccount(streamerId: string, input: { userId?: string; email?: string; password?: string }) {
  requirePlatformAdmin();
  const { data: streamer, error: lookupError } = await supabaseAdmin
    .from('streamers')
    .select('id')
    .eq('id', streamerId)
    .single();
  if (lookupError || !streamer) throw new UserFacingError('主播不存在。');
  let userId = input.userId;
  let created = false;
  if (userId) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data.user) throw new UserFacingError('账号不存在。');
  } else {
    if (!input.email || !input.password || input.password.length < 12)
      throw new UserFacingError('新账号需有效邮箱及至少 12 位密码。');
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true
    });
    if (error || !data.user) throw new UserFacingError('无法创建账号，请检查邮箱是否已存在和密码要求。');
    userId = data.user.id;
    created = true;
  }
  const { error } = await supabaseAdmin
    .from('streamer_members')
    .upsert({ streamer_id: streamerId, user_id: userId }, { onConflict: 'streamer_id,user_id' });
  if (error) {
    if (created) {
      const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (rollbackError) console.error('账号授权失败后清理未授权账号失败', userId);
    }
    throw error;
  }
}
export async function revokeAccount(streamerId: string, userId: string) {
  requirePlatformAdmin();
  const { error } = await supabaseAdmin
    .from('streamer_members')
    .delete()
    .eq('streamer_id', streamerId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function listAccounts(page: number) {
  requirePlatformAdmin();
  const [{ data, error }, { data: admins, error: roleError }] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ page, perPage: 25 }),
    supabaseAdmin.from('platform_admins').select('user_id')
  ]);
  if (error) throw new UserFacingError('无法读取登录账号列表，请检查 Auth 服务。');
  if (roleError) throw roleError;
  return {
    page,
    hasNext: data.users.length === 25,
    users: data.users.map((user) => ({
      id: user.id,
      email: user.email || '',
      isPlatformAdmin: Boolean(admins?.some((admin) => admin.user_id === user.id))
    }))
  };
}

export async function deleteAccount(userId: string) {
  const operator = requirePlatformAdmin();
  if (userId === operator) throw new UserFacingError('不能删除当前登录账号。');
  const [{ data: admin, error: roleError }, { data: members, error: memberError }] = await Promise.all([
    supabaseAdmin.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    supabaseAdmin.from('streamer_members').select('streamer_id').eq('user_id', userId)
  ]);
  if (roleError) throw roleError;
  if (memberError) throw memberError;
  if (admin) throw new UserFacingError('平台管理员账号不能删除。');
  if (members?.length) throw new UserFacingError('账号仍有歌单授权，请先撤销全部授权（包括停用的歌单）。');
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error)
    throw new UserFacingError(
      '账号删除失败，账号未删除。请检查是否仍有授权或拥有 Storage 文件，并查看 Supabase Auth 日志。'
    );
}

export function emptyCatalog() {
  const catalog = getDemoCatalog();
  return { ...catalog, songs: [], tags: [] };
}
