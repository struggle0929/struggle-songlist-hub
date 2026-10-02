import type { TenantContext } from '$lib/server/tenant';
declare global {
  namespace App {
    interface Locals extends TenantContext {}
  }
}
export {};
