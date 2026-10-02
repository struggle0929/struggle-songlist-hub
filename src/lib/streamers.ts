export interface Streamer {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  created_at: string;
}

export const reservedSlugs = new Set(['www', 'admin', 'api', 'auth', 'assets', 's', 'localhost', 'mail']);
export const validSlug = (slug: string) =>
  /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(slug) && !reservedSlugs.has(slug);

// Path fallback keeps previews and localhost usable without wildcard DNS.
export function pathContext(pathname: string) {
  const match = /^\/s\/([a-z0-9-]+)(\/.*)?$/.exec(pathname);
  return match
    ? { slug: match[1], base: `/s/${match[1]}`, pathname: match[2] || '/' }
    : { slug: null, base: '', pathname };
}

export function hostSlug(hostname: string, rootDomain: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const root = rootDomain.toLowerCase().replace(/\.$/, '');
  const suffix = host.endsWith('.localhost') ? '.localhost' : `.${root}`;
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  // Nested or malformed subdomains never select a tenant.
  return validSlug(slug) ? slug : null;
}

export function streamerUrl(slug: string, url: URL, rootDomain: string, suffix = '/') {
  if (!validSlug(slug)) throw new Error('主播标识无效。');
  if (url.hostname === rootDomain || url.hostname.endsWith(`.${rootDomain}`))
    return `https://${slug}.${rootDomain}${suffix}`;
  if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost'))
    return `${url.protocol}//${slug}.localhost${url.port ? `:${url.port}` : ''}${suffix}`;
  return `/s/${slug}${suffix}`;
}
