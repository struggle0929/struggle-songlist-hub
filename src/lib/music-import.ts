export const musicProviderIds = ['netease', 'kugou', 'qqmusic'] as const;
export type MusicProvider = (typeof musicProviderIds)[number];
export const musicProviders = [
  {
    value: 'netease',
    label: '网易云',
    songExample: 'https://music.163.com/#/song?id=...',
    playlistExample: 'https://music.163.com/#/playlist?id=...'
  },
  {
    value: 'kugou',
    label: '酷狗',
    songExample: 'https://m.kugou.com/share/song.html?chain=...',
    playlistExample: 'https://t1.kugou.com/...'
  },
  {
    value: 'qqmusic',
    label: 'QQ音乐',
    songExample: 'https://c6.y.qq.com/base/fcgi-bin/u?__=...',
    playlistExample: 'https://c6.y.qq.com/base/fcgi-bin/u?__=...'
  }
] satisfies { value: MusicProvider; label: string; songExample: string; playlistExample: string }[];
export const musicProviderLabel = (provider: MusicProvider = 'netease') =>
  musicProviders.find((item) => item.value === provider)!.label;
