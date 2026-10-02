import { tenantId, ownedAsset, currentContext } from '$lib/server/tenant';
import { appearancePaths, parseAppearance } from '$lib/appearance';
import { collectTags, listPublicSongs, listSongs } from '$lib/server/songs';
import { countPendingRequests, listRequests } from '$lib/server/requests';
import {
  getSettings,
  listSettings,
  pageSettingsDefaults,
  pageSettingsKeys,
  pageSettingsReadKeys,
  settingsAssetBucket
} from '$lib/server/settings';
import { supabaseAdmin } from '$lib/server/supabase';
import { type AdminDashboardData, type PublicCatalog } from '$lib/types';
import { getDemoCatalog, localDemo } from '$lib/server/demo';

export const getPublicCatalog = async (): Promise<PublicCatalog> => {
  if (localDemo) {
    const catalog = getDemoCatalog();
    return {
      ...catalog,
      settings: { ...catalog.settings, heroTitle: currentContext().streamer?.name || catalog.settings.heroTitle }
    };
  }
  const [songs, settings] = await Promise.all([listPublicSongs(), getSettings()]);

  return {
    songs,
    tags: collectTags(songs),
    settings
  };
};

export const getAdminDashboardData = async (): Promise<AdminDashboardData> => {
  const [songs, requests, settings] = await Promise.all([listSongs(), listRequests(), getSettings()]);

  return {
    songs,
    requests,
    overview: {
      totalSongs: songs.length,
      publicSongs: songs.filter((song) => song.isPublic).length,
      pendingRequests: countPendingRequests(requests)
    },
    settings
  };
};

export const resetDatabase = async () => {
  const settings = await listSettings(pageSettingsReadKeys);
  const assetPaths = [
    settings[pageSettingsKeys.avatarPath],
    settings[pageSettingsKeys.backgroundPath],
    ...appearancePaths(parseAppearance(settings[pageSettingsKeys.appearance]))
  ].filter((path) => Boolean(path) && ownedAsset(path));

  const { error } = await supabaseAdmin.rpc('reset_admin_data', {
    p_streamer_id: tenantId(true),
    p_settings: pageSettingsDefaults
  });

  if (error) {
    throw error;
  }

  if (assetPaths.length > 0) {
    const { error: assetsError } = await supabaseAdmin.storage.from(settingsAssetBucket).remove(assetPaths);

    if (assetsError) {
      throw assetsError;
    }
  }
};
