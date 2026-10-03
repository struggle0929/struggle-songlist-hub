import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { z } from 'zod';
import {
  createStreamer,
  editStreamer,
  assignAccount,
  revokeAccount,
  deleteStreamer,
  listAccounts,
  deleteAccount,
  listMembers,
  listStreamers
} from '$lib/server/streamers';
import { requirePlatformAdmin } from '$lib/server/tenant';
import { streamerUrl } from '$lib/streamers';
import { getErrorMessage, UserFacingError } from '$lib/server/errors';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  requirePlatformAdmin();
  const accountPage = Math.max(1, Math.min(100000, Number.parseInt(url.searchParams.get('accountPage') || '1') || 1));
  const [streamers, members, accountResult] = await Promise.all([
    listStreamers(true),
    listMembers(),
    listAccounts(accountPage)
      .then((accounts) => ({ accounts, accountError: '' }))
      .catch((error) => ({
        accounts: { page: accountPage, hasNext: false, users: [] },
        accountError: getErrorMessage(error)
      }))
  ]);
  return {
    streamers: streamers.map((s) => ({
      ...s,
      href: streamerUrl(s.slug, url, env.PUBLIC_ROOT_DOMAIN || 'xs0929.cn', '/admin')
    })),
    members,
    ...accountResult
  };
};

const uuid = z.string().uuid();
const attempt = async (run: () => Promise<void>, message: string, section = 'general') => {
  requirePlatformAdmin();
  try {
    await run();
    return { message, section };
  } catch (e) {
    return fail(400, { error: e instanceof z.ZodError ? e.issues[0].message : getErrorMessage(e), section });
  }
};
export const actions: Actions = {
  deleteAccount: async ({ request }) => {
    const form = await request.formData();
    return attempt(
      () => deleteAccount(uuid.parse(form.get('userId'))),
      '登录账号已从 Supabase Auth 永久删除，无法再登录。',
      'accounts'
    );
  },
  delete: async ({ request }) => {
    requirePlatformAdmin();
    const form = await request.formData();
    const targetId = String(form.get('id') || '');
    try {
      return { message: await deleteStreamer(uuid.parse(targetId)), section: 'delete', targetId };
    } catch (e) {
      return fail(400, {
        error: e instanceof z.ZodError ? e.issues[0].message : getErrorMessage(e),
        section: 'delete',
        targetId
      });
    }
  },
  create: async ({ request }) => {
    const form = await request.formData();
    return attempt(
      () => createStreamer(String(form.get('slug') || ''), String(form.get('name') || '')),
      '歌单已创建，可继续分配账号。'
    );
  },
  edit: async ({ request }) => {
    const form = await request.formData();
    return attempt(
      () => editStreamer(uuid.parse(form.get('id')), String(form.get('name') || ''), form.get('enabled') === 'on'),
      '主播资料已保存。'
    );
  },
  assign: async ({ request }) => {
    const form = await request.formData();
    return attempt(
      async () => {
        const userId = String(form.get('userId') || '').trim();
        const mode = String(form.get('mode') || (userId ? 'existing' : 'create'));
        if (!['existing', 'create'].includes(mode)) throw new UserFacingError('请选择创建新账号或关联现有账号。');
        await assignAccount(
          uuid.parse(form.get('streamerId')),
          mode === 'existing'
            ? {
                userId: z
                  .string()
                  .uuid(
                    '现有账号 ID 必须是完整的 Supabase 用户 UUID，不能填写主播标识或昵称。创建新账号请选择“创建新账号”。'
                  )
                  .parse(userId)
              }
            : {
                email: z
                  .string()
                  .email('请填写有效的新账号邮箱。')
                  .parse(String(form.get('email') || '').trim()),
                password: String(form.get('password') || '')
              }
        );
      },
      '账号已分配，可登录对应主播后台。',
      'assign'
    );
  },
  revoke: async ({ request }) => {
    const form = await request.formData();
    return attempt(
      () => revokeAccount(uuid.parse(form.get('streamerId')), uuid.parse(form.get('userId'))),
      '授权已撤销，下次请求立即生效。'
    );
  }
};
