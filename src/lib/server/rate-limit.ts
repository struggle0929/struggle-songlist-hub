import { tenantId } from '$lib/server/tenant';
import { supabaseAdmin } from '$lib/server/supabase';
import { createHash } from 'node:crypto';

export const rateLimitKey = (value: string) => createHash('sha256').update(value).digest('hex');

// Uses the existing atomic database RPC, shared by every deployment instance.
export async function consumeSharedRateLimit(clientKey: string, maxRequests: number, windowMs: number) {
  const { data, error } = await supabaseAdmin.rpc('consume_request_rate_limit', {
    p_client_key: clientKey,
    p_max_requests: maxRequests,
    p_window_seconds: Math.ceil(windowMs / 1000)
  });
  if (error) throw error;
  return data === true;
}

export async function consumeLoginRateLimit(address: string, email: string) {
  const windowMs = 10 * 60 * 1000;
  const account = email.trim().toLowerCase();
  if (!(await consumeSharedRateLimit('login:ip:' + rateLimitKey(address), 30, windowMs))) return false;
  if (!(await consumeSharedRateLimit('login:pair:' + rateLimitKey(address + ':' + account), 10, windowMs)))
    return false;
  return consumeSharedRateLimit('login:account:' + rateLimitKey(account), 50, windowMs);
}

export const consumeRequestRateLimit = async ({
  clientKey,
  maxRequests,
  windowMs
}: {
  clientKey: string;
  maxRequests: number;
  windowMs: number;
}) => {
  const globalLimit = await supabaseAdmin.rpc('consume_request_rate_limit', {
    p_client_key: 'global:' + clientKey,
    p_max_requests: maxRequests * 5,
    p_window_seconds: Math.ceil(windowMs / 1000)
  });
  if (globalLimit.error) throw globalLimit.error;
  if (globalLimit.data !== true) return false;
  const { data, error } = await supabaseAdmin.rpc('consume_request_rate_limit', {
    p_client_key: tenantId() + ':' + clientKey,
    p_max_requests: maxRequests,
    p_window_seconds: Math.ceil(windowMs / 1000)
  });

  if (error) {
    throw error;
  }

  return data === true;
};
