import type { LayoutServerLoad } from './$types';
import { branding } from '$lib/branding';
import { getSettings } from '$lib/server/settings';
import { getDemoCatalog, localDemo } from '$lib/server/demo';
import { emptyAppearance } from '$lib/appearance';

export const load: LayoutServerLoad = async ({ locals, url }) => {
  // Client reroutes share route IDs; track the external URL to reload tenant data.
  void url.pathname;
  void url.hostname;
  const settings = locals.streamer
    ? localDemo
      ? { ...getDemoCatalog().settings, heroTitle: locals.streamer.name }
      : await getSettings()
    : null;
  const siteTitle = locals.streamer ? settings?.appearance.siteTitle || locals.streamer.name : branding.title;
  return {
    isAdmin: locals.isAdmin,
    isPlatformAdmin: locals.isPlatformAdmin,
    loggedIn: Boolean(locals.userId),
    streamer: locals.streamer,
    base: locals.base,
    siteTitle,
    siteDescription: locals.streamer
      ? settings?.appearance.siteDescription || `${locals.streamer.name}的公开歌单、搜索筛选与愿望单。`
      : branding.description,
    appearance: settings?.appearance || emptyAppearance()
  };
};
