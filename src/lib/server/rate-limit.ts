import { tenantId } from '$lib/server/tenant';
import { supabaseAdmin } from '$lib/server/supabase';

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
