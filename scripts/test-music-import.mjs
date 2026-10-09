import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  cacheDir: resolve('node_modules/.vite-tests/music-import'),
  server: { middlewareMode: true },
  resolve: { alias: { $lib: resolve('src/lib') } }
});
const originalFetch = globalThis.fetch;
let passed = 0;
let calls = [];
let responses = [];
const reply = (body, status = 200, headers = {}) => new Response(body, { status, headers });
const mock = (...items) => {
  calls = [];
  responses = items;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const response = responses.shift();
    if (!response) throw new Error('unexpected request');
    return response;
  };
};
const track = (title) => ({ songname: title, singer: [{ name: 'A' }, { name: 'B' }] });
async function test(name, run) {
  await run();
  passed++;
  console.log('PASS', name);
}
try {
  const { fetchMusicTracks, parseKugouTracks, detectMusicLink, extractMusicLink, fetchSharedMusic } =
    await server.ssrLoadModule('/src/lib/server/music-import.ts');
  const { musicUrl, readMusicUrl } = await server.ssrLoadModule('/src/lib/server/music-http.ts');
  const { playlistImportFormValuesSchema, playlistImportPayloadSchema } = await server.ssrLoadModule(
    '/src/lib/server/form-schemas.ts'
  );
  await test('unified links identify all platforms and song/playlist types, including NetEase hash routes', async () => {
    for (const [link, provider, kind] of [
      ['https://music.163.com/#/song?id=186016', 'netease', 'song'],
      ['https://music.163.com/#/playlist?id=123', 'netease', 'playlist'],
      ['https://y.music.163.com/m/song?id=186016', 'netease', 'song'],
      ['https://m.kugou.com/share/song.html?chain=x', 'kugou', 'song'],
      ['https://wwwapi.kugou.com/share/zlist.html?listid=2', 'kugou', 'playlist'],
      ['https://y.qq.com/n/ryqq_v2/songDetail/242254267', 'qqmusic', 'song'],
      ['https://y.qq.com/n/ryqq_v2/playlist/9787366199', 'qqmusic', 'playlist']
    ])
      assert.deepEqual(detectMusicLink(link), { provider, kind });
    assert.equal(
      extractMusicLink('分享歌曲：https://music.163.com/#/song?id=186016 （来自网易云）'),
      'https://music.163.com/#/song?id=186016'
    );
    assert.throws(() => detectMusicLink('https://evil.qq.com/song/123'), /官方分享/);
    assert.throws(() => extractMusicLink('186016'), /分享链接/);
    mock(
      reply('', 302, { location: 'https://y.qq.com/n/ryqq_v2/songDetail/242254267' }),
      reply('html'),
      reply('html'),
      reply(JSON.stringify({ code: 0, data: [track('悬溺')] }))
    );
    const result = await fetchSharedMusic('https://c6.y.qq.com/base/fcgi-bin/u?__=x');
    assert.equal(result.provider, 'qqmusic');
    assert.equal(result.kind, 'song');
    assert.equal(result.songs[0].title, '悬溺');
  });
  await test('preview echo never copies a song link into a playlist field', async () => {
    const { getSongInputEcho, getPlaylistInputEcho } = await server.ssrLoadModule('/src/lib/admin/result.ts');
    for (const provider of ['netease', 'kugou', 'qqmusic']) {
      const form = { kind: 'preview-ready', importPreview: { provider, sourceKind: 'song', sourceInput: 'song-link' } };
      assert.equal(getPlaylistInputEcho(form), '');
      assert.equal(getSongInputEcho(form), 'song-link');
      form.importPreview.sourceKind = 'playlist';
      assert.equal(getSongInputEcho(form), '');
      assert.equal(getPlaylistInputEcho(form), 'song-link');
    }
  });
  await test('Kugou JSON extraction handles Unicode, brackets and escaped quotes without executing scripts', () => {
    const rows = [{ song_name: '歌],名"', author_name: '甲、乙' }];
    assert.deepEqual(parseKugouTracks('var dataFromSmarty=' + JSON.stringify(rows) + ', playType="list";'), [
      { title: '歌],名"', artist: '甲 / 乙' }
    ]);
    assert.throws(() => parseKugouTracks('var dataFromSmarty=evil();'));
    assert.throws(() => parseKugouTracks('var dataFromSmarty=[{"song_name":"x"}]'));
  });
  await test('official links only; credentials, ports and cross-platform hosts rejected', () => {
    for (const input of [
      'https://localhost/a',
      'https://kugou.com.evil.test/a',
      'file:///a',
      'https://user:pw@www.kugou.com/a',
      'https://www.kugou.com:8080/a'
    ]) {
      assert.throws(() => musicUrl(input, 'kugou'));
    }
    assert.throws(() => musicUrl('https://www.kugou.com/a', 'qqmusic'));
    assert.equal(musicUrl('http://wwwapi.kugou.com/share/zlist.html', 'kugou').protocol, 'https:');
  });
  await test('redirect target checked before fetching; response sizes and redirect loops bounded', async () => {
    mock(reply('', 302, { location: 'http://127.0.0.1/secret' }));
    await assert.rejects(() => readMusicUrl('https://t1.kugou.com/test', 'kugou', AbortSignal.timeout(1000)));
    assert.equal(calls.length, 1);
    mock(reply('x'.repeat(4 * 1024 * 1024 + 1)));
    await assert.rejects(() => readMusicUrl('https://www.kugou.com/test', 'kugou', AbortSignal.timeout(1000)), /过大/);
    mock(...Array.from({ length: 6 }, () => reply('', 302, { location: '/loop' })));
    await assert.rejects(
      () => readMusicUrl('https://www.kugou.com/test', 'kugou', AbortSignal.timeout(1000)),
      /跳转次数/
    );
  });
  await test('Kugou song and playlist share redirects normalize to the same import format', async () => {
    const html = 'var dataFromSmarty=' + JSON.stringify([{ song_name: '月光河畔', author_name: '黄霄雲' }]) + ';';
    mock(reply('', 302, { location: 'https://www.kugou.com/share/token.html' }), reply(html));
    assert.deepEqual(await fetchMusicTracks('kugou', 'https://m.kugou.com/share/song.html?chain=x', 'song'), [
      { title: '月光河畔', artist: '黄霄雲' }
    ]);
    mock(reply('', 302, { location: 'http://wwwapi.kugou.com/share/zlist.html?chain=x' }), reply(html));
    assert.equal((await fetchMusicTracks('kugou', 'https://t1.kugou.com/token', 'playlist')).length, 1);
    assert.ok(calls[1].startsWith('https:'));
    mock(reply(html));
    await assert.rejects(
      () => fetchMusicTracks('kugou', 'https://wwwapi.kugou.com/share/zlist.html', 'song'),
      /歌单导入栏/
    );
    mock(reply('var dataFromSmarty=[];'));
    await assert.rejects(
      () => fetchMusicTracks('kugou', 'https://wwwapi.kugou.com/share/zlist.html', 'playlist'),
      /没有可导入/
    );
  });
  await test('QQ song resolves numeric ID and combines multiple artists', async () => {
    mock(
      reply('', 302, { location: 'https://y.qq.com/n/ryqq_v2/songDetail/242254267' }),
      reply('html'),
      reply(JSON.stringify({ code: 0, data: [track('悬溺')] }))
    );
    assert.deepEqual(await fetchMusicTracks('qqmusic', 'https://c6.y.qq.com/base/fcgi-bin/u?__=x', 'song'), [
      { title: '悬溺', artist: 'A / B' }
    ]);
    assert.equal(new URL(calls[2]).searchParams.get('songid'), '242254267');
  });
  await test('QQ playlists paginate, enforce limits and reject missing/repeated pages', async () => {
    const page = (songs, total = 2) =>
      reply(JSON.stringify({ code: 0, cdlist: [{ songnum: total, songlist: songs }] }));
    mock(page([track('First')]), page([track('Second')]));
    assert.deepEqual(
      (await fetchMusicTracks('qqmusic', '123', 'playlist')).map((song) => song.title),
      ['First', 'Second']
    );
    assert.equal(new URL(calls[1]).searchParams.get('song_begin'), '1');
    mock(page([track('First')]), page([track('First')]));
    await assert.rejects(() => fetchMusicTracks('qqmusic', '123', 'playlist'), /完整歌单/);
    mock(page([], 5001));
    await assert.rejects(() => fetchMusicTracks('qqmusic', '123', 'playlist'), /最多导入/);
    mock(reply('{"code":100}'));
    await assert.rejects(() => fetchMusicTracks('qqmusic', '123', 'playlist'), /解析失败/);
  });
  await test('provider survives preview errors and import tags/schema; old NetEase forms still work', () => {
    for (const provider of ['netease', 'kugou', 'qqmusic']) {
      const form = new FormData();
      form.set('provider', provider);
      form.set('status', 'ready');
      form.set('sharedTagsInput', '旧,统一');
      form.append('selectedSong', '0');
      form.append('songTitle', 'Title');
      form.append('songArtist', 'Artist');
      form.append('songLanguage', '中文');
      form.append('songTagsInput', '旧');
      const values = playlistImportFormValuesSchema.parse(form);
      const payload = playlistImportPayloadSchema.parse(values);
      assert.equal(payload.importPreview.provider, provider);
      assert.deepEqual(new Set(payload.songsToImport[0].tags), new Set(['旧', '统一']));
      form.delete('provider');
      assert.equal(playlistImportFormValuesSchema.parse(form).importPreview.provider, 'netease');
    }
  });
  await test('updated NetEase API preserves single-song and playlist imports with bounded network timeout', async () => {
    const api = (await import('@neteasecloudmusicapienhanced/api')).default;
    const originalSong = api.song_detail;
    const originalPlaylist = api.playlist_detail;
    try {
      api.song_detail = async (params) => {
        assert.equal(params.timeout, 30_000);
        return { body: { code: 200, songs: [{ name: '测试歌曲', ar: [{ name: '测试原唱' }] }] } };
      };
      api.playlist_detail = async (params) => {
        assert.equal(params.timeout, 30_000);
        return { body: { code: 200, playlist: { trackIds: [{ id: 123 }] } } };
      };
      assert.deepEqual(await fetchMusicTracks('netease', '123', 'song'), [{ title: '测试歌曲', artist: '测试原唱' }]);
      assert.deepEqual(await fetchMusicTracks('netease', '123', 'playlist'), [
        { title: '测试歌曲', artist: '测试原唱' }
      ]);
    } finally {
      api.song_detail = originalSong;
      api.playlist_detail = originalPlaylist;
    }
  });
  console.log(passed + ' music import tests passed. No real database used.');
  if (process.argv.includes('--live')) {
    globalThis.fetch = originalFetch;
    for (const [provider, kind, url] of [
      ['kugou', 'song', 'https://m.kugou.com/share/song.html?chain=AajH2eG6V2'],
      ['kugou', 'playlist', 'https://t1.kugou.com/AaU175G6V2'],
      ['qqmusic', 'song', 'https://c6.y.qq.com/base/fcgi-bin/u?__=f46TFfM'],
      ['qqmusic', 'playlist', 'https://c6.y.qq.com/base/fcgi-bin/u?__=Uax9covl9eq7']
    ]) {
      const songs = await fetchMusicTracks(provider, url, kind);
      console.log('LIVE', provider, kind, songs.length, songs[0]);
    }
  }
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
