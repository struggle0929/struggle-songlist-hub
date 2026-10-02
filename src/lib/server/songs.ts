import { UserFacingError } from '$lib/server/errors';
import { tenantId } from '$lib/server/tenant';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '$lib/server/database.types';
import { fetchSupabasePages } from '$lib/server/pagination';
import { supabaseAdmin, supabasePublic } from '$lib/server/supabase';
import { type Song, type SongLanguage, type SongStatus } from '$lib/types';
import { mergeTags } from '$lib/tags';
import { tagsInputSchema } from '$lib/validators';

type SongRow = Pick<
  Database['public']['Tables']['songs']['Row'],
  'id' | 'title' | 'artist' | 'language' | 'status' | 'tags' | 'is_public'
> & { created_at?: string };

const sortStrings = (values: Iterable<string>) => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));

const mapSongRow = (row: SongRow): Song => ({
  id: row.id,
  ...(row.created_at ? { createdAt: row.created_at } : {}),
  title: row.title,
  artist: row.artist,
  language: row.language,
  status: row.status,
  tags: row.tags,
  isPublic: row.is_public
});

const fetchSongs = async (supabase: SupabaseClient<Database>, isPublic?: boolean): Promise<Song[]> => {
  const rows = await fetchSupabasePages<SongRow>((from, to) => {
    let query = supabase
      .from('songs')
      .select(
        isPublic === undefined
          ? 'id, title, artist, language, status, tags, is_public, created_at'
          : 'id, title, artist, language, status, tags, is_public'
      )
      .eq('streamer_id', tenantId(isPublic === undefined))
      .order('title', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (isPublic !== undefined) {
      query = query.eq('is_public', isPublic);
    }

    return query.overrideTypes<SongRow[], { merge: false }>();
  });

  return rows.map(mapSongRow);
};

export const listPublicSongs = () => fetchSongs(supabasePublic, true);

export const listSongs = () => fetchSongs(supabaseAdmin);

export const saveSong = async ({
  id,
  title,
  artist,
  language,
  status,
  tags,
  isPublic
}: {
  id?: string;
  title: string;
  artist: string;
  language: SongLanguage;
  status: SongStatus;
  tags: string[];
  isPublic: boolean;
}) => {
  const row = {
    streamer_id: tenantId(true),
    title,
    artist,
    language,
    status,
    tags: sortStrings(tags),
    is_public: isPublic
  };

  const { error, count } = id
    ? await supabaseAdmin.from('songs').update(row, { count: 'exact' }).eq('streamer_id', tenantId(true)).eq('id', id)
    : await supabaseAdmin.from('songs').insert(row);

  if (error) {
    throw error;
  }
  if (id && count === 0) throw new UserFacingError('歌曲不存在或不属于当前主播。');
};

async function verifySongIds(ids: string[]) {
  const unique = [...new Set(ids)];
  for (let offset = 0; offset < unique.length; offset += 100) {
    const chunk = unique.slice(offset, offset + 100);
    const { data, error } = await supabaseAdmin
      .from('songs')
      .select('id')
      .eq('streamer_id', tenantId(true))
      .in('id', chunk);
    if (error) throw error;
    if (data?.length !== chunk.length) throw new UserFacingError('部分歌曲不存在或不属于当前主播。');
  }
}

export const deleteSong = async (id: string) => {
  const { error, count } = await supabaseAdmin
    .from('songs')
    .delete({ count: 'exact' })
    .eq('streamer_id', tenantId(true))
    .eq('id', id);

  if (error) {
    throw error;
  }
  if (count === 0) throw new UserFacingError('歌曲不存在或不属于当前主播。');
};

export const bulkDeleteSongs = async (ids: string[]) => {
  await verifySongIds(ids);
  const { error, count } = await supabaseAdmin
    .from('songs')
    .delete({ count: 'exact' })
    .eq('streamer_id', tenantId(true))
    .in('id', ids);

  if (error) {
    throw error;
  }

  return count!;
};

export const bulkSetSongsPublic = async (ids: string[], isPublic: boolean) => {
  await verifySongIds(ids);
  const { error, count } = await supabaseAdmin
    .from('songs')
    .update({ is_public: isPublic }, { count: 'exact' })
    .eq('streamer_id', tenantId(true))
    .in('id', ids);

  if (error) {
    throw error;
  }

  return count!;
};

export const bulkAppendSongTags = async (ids: string[], tags: string[]) => {
  const uniqueIds = [...new Set(ids)];
  const groups = new Map<string, { ids: string[]; before: string[]; after: string[] }>();
  // Validate every merged tag set before writing; chunk IDs to keep request URLs small.
  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const chunk = uniqueIds.slice(offset, offset + 100);
    const { data, error } = await supabaseAdmin
      .from('songs')
      .select('id, title, tags')
      .eq('streamer_id', tenantId(true))
      .in('id', chunk);
    if (error) throw error;
    if (!data || data.length !== chunk.length) throw new Error('部分歌曲已被删除，请刷新列表后重试。');
    for (const song of data) {
      const after = mergeTags(song.tags, tags);
      const valid = tagsInputSchema.safeParse(after.join(', '));
      if (!valid.success) throw new Error(`${song.title}：${valid.error.issues[0].message}，本次未修改任何歌曲。`);
      const key = JSON.stringify(mergeTags(song.tags));
      const group = groups.get(key) ?? { ids: [], before: song.tags, after };
      group.ids.push(song.id);
      groups.set(key, group);
    }
  }
  let completed = 0;
  try {
    for (const group of groups.values()) {
      for (let offset = 0; offset < group.ids.length; offset += 100) {
        const chunk = group.ids.slice(offset, offset + 100);
        // Guard against overwriting tag changes made concurrently by another admin.
        const { error, count } = await supabaseAdmin
          .from('songs')
          .update({ tags: group.after }, { count: 'exact' })
          .eq('streamer_id', tenantId(true))
          .in('id', chunk)
          .contains('tags', group.before)
          .containedBy('tags', group.before);
        if (error) throw error;
        completed += count ?? 0;
        if (count !== chunk.length) throw new Error('歌曲标签已被其他操作修改。');
      }
    }
  } catch {
    throw new Error(
      `已处理 ${completed} / ${uniqueIds.length} 首歌曲，其余未完成。请刷新后重试，重复追加不会产生重复标签。`
    );
  }
  return completed;
};

export const importSongs = async (
  songs: Array<{
    title: string;
    artist: string;
    language: SongLanguage;
    status: SongStatus;
    tags: string[];
    isPublic: boolean;
  }>
) => {
  const { error } = await supabaseAdmin.from('songs').insert(
    songs.map((song) => ({
      streamer_id: tenantId(true),
      title: song.title,
      artist: song.artist,
      language: song.language,
      status: song.status,
      tags: sortStrings(song.tags),
      is_public: song.isPublic
    }))
  );

  if (error) {
    throw error;
  }

  return songs.length;
};

export const collectTags = (songs: Song[]) => sortStrings(songs.flatMap((song) => song.tags));
