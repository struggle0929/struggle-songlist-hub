import type { Song } from '$lib/types';

export type SongTitleSortDirection = 'asc' | 'desc';
export type AdminSongSort = 'default' | 'title' | 'import';

export const sortAdminSongs = (songs: Song[], mode: AdminSongSort, direction: SongTitleSortDirection) => {
  if (mode === 'title') return sortSongsByTitle(songs, direction);
  if (mode === 'default') return direction === 'asc' ? [...songs] : [...songs].reverse();
  return [...songs].sort((a, b) => {
    const timeA = Date.parse(a.createdAt ?? '') || 0;
    const timeB = Date.parse(b.createdAt ?? '') || 0;
    const diff = timeA - timeB || a.id.localeCompare(b.id);
    return direction === 'asc' ? diff : -diff;
  });
};

const languageOrder = new Map([
  ['中文', 0],
  ['日语', 1],
  ['其他', 2],
  ['英语', 3]
]);

const titleCollator = new Intl.Collator(['zh-Hans-CN', 'en'], {
  numeric: true,
  sensitivity: 'base'
});

const getSongLanguageOrder = (song: Song) => languageOrder.get(song.language) ?? languageOrder.get('其他')!;

const getSortableTitle = (title: string) =>
  title
    .trim()
    .replace(/(?:\s*[\(（][^\)）]*[\)）]\s*)+$/u, '')
    .trim();

const getTitleLength = (title: string) => Array.from(getSortableTitle(title)).length;

/**
 * Case-insensitive fuzzy match across title, artist and tags.
 * Empty keyword always matches.
 */
export const matchesSongKeyword = (song: Song, keyword: string): boolean => {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return true;
  return [song.title, song.artist, ...song.tags].some((v) => v.toLowerCase().includes(kw));
};

export const sortSongsByTitle = (songs: Song[], direction: SongTitleSortDirection = 'asc') =>
  [...songs].sort((a, b) => {
    const languageDiff = getSongLanguageOrder(a) - getSongLanguageOrder(b);
    const lengthDiff = getTitleLength(a.title) - getTitleLength(b.title);
    const titleDiff = titleCollator.compare(getSortableTitle(a.title), getSortableTitle(b.title));
    const artistDiff = titleCollator.compare(a.artist, b.artist);
    const result = languageDiff || lengthDiff || titleDiff || artistDiff;

    return direction === 'asc' ? result : -result;
  });
