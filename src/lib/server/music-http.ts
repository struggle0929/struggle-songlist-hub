import { UserFacingError } from '$lib/server/errors';
import type { MusicProvider } from '$lib/music-import';

const hosts = {
  netease: new Set(['music.163.com', 'y.music.163.com', '163cn.tv']),
  kugou: new Set(['m.kugou.com', 'www.kugou.com', 'wwwapi.kugou.com', 't1.kugou.com', 't.kugou.com']),
  qqmusic: new Set(['c6.y.qq.com', 'c.y.qq.com', 'y.qq.com', 'i.y.qq.com', 'i2.y.qq.com'])
};
const maxBytes = 4 * 1024 * 1024;
export function musicUrl(value: string, provider: MusicProvider) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UserFacingError('请填写有效的音乐分享链接。');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    !hosts[provider].has(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new UserFacingError('请填写对应音乐平台的官方分享链接。');
  }
  // Some official short links still redirect to HTTP; always request the HTTPS equivalent.
  url.protocol = 'https:';
  return url;
}

export async function readMusicUrl(value: string, provider: MusicProvider, signal: AbortSignal) {
  let url = musicUrl(value, provider);
  for (let hop = 0; hop < 6; hop++) {
    const response = await fetch(url, {
      redirect: 'manual',
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: provider === 'qqmusic' ? 'https://y.qq.com/' : 'https://www.kugou.com/'
      }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw new UserFacingError('分享链接跳转无效，请重新复制链接。');
      url = musicUrl(new URL(location, url).href, provider);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new UserFacingError('平台暂时无法读取，请确认歌单公开并稍后重试。');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new UserFacingError('平台返回了空内容。');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new UserFacingError('平台返回内容过大，请拆分歌单后导入。');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return { url, text: Buffer.concat(chunks).toString('utf8') };
  }
  throw new UserFacingError('分享链接跳转次数过多，请使用完整链接。');
}
