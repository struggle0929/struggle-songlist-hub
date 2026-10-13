import { dev } from '$app/environment';
import { injectAnalytics } from '@vercel/analytics/sveltekit';

if (!dev) {
  injectAnalytics({
    mode: 'production',
    beforeSend(event) {
      const url = new URL(event.url);
      // Only count public pages; never report admin URLs or query parameters.
      if (/(?:^|\/)admin(?:\/|$)/.test(url.pathname)) return null;
      url.search = '';
      url.hash = '';
      return { ...event, url: url.href };
    }
  });
}
