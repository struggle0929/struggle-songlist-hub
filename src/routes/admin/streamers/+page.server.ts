import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { z } from 'zod';
import {
  createStreamer,
  editStreamer,
  assignAccount,
  revokeAccount,
  listMembers,
  listStreamers
} from '$lib/server/streamers';
import { requirePlatformAdmin } from '$lib/server/tenant';
import { streamerUrl } from '$lib/streamers';
import { getErrorMessage } from '$lib/server/errors';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  requirePlatformAdmin();
  const [streamers, members] = await Promise.all([listStreamers(true), listMembers()]);
  return {
    streamers: streamers.map((s) => ({
      ...s,
      href: streamerUrl(s.slug, url, env.PUBLIC_ROOT_DOMAIN || 'xs0929.cn', '/admin')
    })),
    members
  };
};

const uuid = z.string().uuid();
const attempt = async (run: () => Promise<void>, message: string) => {
  requirePlatformAdmin();
  try {
    await run();
    return { message };
  } catch (e) {
    return fail(400, { error: e instanceof z.ZodError ? e.issues[0].message : getErrorMessage(e) });
  }
};
export const actions: Actions = {
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
    return attempt(async () => {
      const userId = String(form.get('userId') || '').trim();
      await assignAccount(
        uuid.parse(form.get('streamerId')),
        userId
          ? { userId: uuid.parse(userId) }
          : {
              email: z
                .string()
                .email()
                .parse(String(form.get('email') || '').trim()),
              password: String(form.get('password') || '')
            }
      );
    }, '账号已分配，可登录对应主播后台。');
  },
  revoke: async ({ request }) => {
    const form = await request.formData();
    return attempt(
      () => revokeAccount(uuid.parse(form.get('streamerId')), uuid.parse(form.get('userId'))),
      '授权已撤销，下次请求立即生效。'
    );
  }
};
