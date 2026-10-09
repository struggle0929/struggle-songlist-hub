import { fail, redirect } from '@sveltejs/kit';

import { loginAdmin, setAdminSession } from '$lib/server/auth';
import { permissions } from '$lib/server/streamers';
import { getValidationMessage, getErrorMessage } from '$lib/server/errors';
import { loginFormSchema } from '$lib/server/form-schemas';
import { consumeLoginRateLimit } from '$lib/server/rate-limit';

import type { Actions } from './$types';

export const actions: Actions = {
  default: async ({ request, cookies, locals, getClientAddress, setHeaders }) => {
    const parsed = loginFormSchema.safeParse(await request.formData());

    if (!parsed.success) {
      return fail(400, {
        message: getValidationMessage(parsed.error),
        values: {
          email: ''
        }
      });
    }

    const { email, password } = parsed.data;

    try {
      if (!(await consumeLoginRateLimit(getClientAddress(), email))) {
        setHeaders({ 'Retry-After': '600' });
        return fail(429, { message: '登录尝试过于频繁，请在 10 分钟后重试。', values: { email } });
      }
    } catch (error) {
      return fail(503, { message: getErrorMessage(error), values: { email } });
    }

    const result = await loginAdmin({ email, password });

    if (!result.ok) {
      return fail(400, {
        message: result.message,
        values: {
          email
        }
      });
    }

    const access = await permissions(result.userId, locals.streamer?.id);
    if (locals.streamer && !access.isAdmin) return fail(403, { message: '没有管理此主播的权限。', values: { email } });
    setAdminSession(cookies, result.session);
    redirect(303, `${locals.base}/admin`);
  }
};
