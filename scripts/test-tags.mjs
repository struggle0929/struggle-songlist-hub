import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const state = { rows: [], writes: 0, conflict: false, failAt: 0 };
globalThis.__tagsTest = state;
const server = await createServer({
  configFile: false,
  cacheDir: resolve('node_modules/.vite-tests/tags'),
  server: { middlewareMode: true },
  resolve: {
    alias: [
      { find: '$lib/server/supabase', replacement: '\0mock:supabase' },
      { find: '$lib', replacement: resolve('src/lib') }
    ]
  },
  plugins: [
    {
      name: 'isolated-tag-tests',
      resolveId(id) {
        if (id === '\0mock:supabase') return id;
      },
      load(id) {
        if (id !== '\0mock:supabase') return;
        return `
        const state = globalThis.__tagsTest;
        export const supabaseAdmin = { from() {
          let patch, ids, before;
          const query = {
            select() { return query; },
            update(value) { patch = value; return query; },
            in(key, value) { ids = value; return query; },
            contains(key, value) { before = value; return query; },
            containedBy() { return query; },
            then(resolve) {
              let rows = state.rows.filter(row => ids.includes(row.id));
              if (patch) {
                state.writes++;
                if (state.failAt === state.writes) return Promise.resolve({error: new Error('network')}).then(resolve);
                if (state.conflict) { rows[0].tags = ['concurrent']; state.conflict = false; }
                rows = rows.filter(row => row.tags.every(tag => before.includes(tag)) && before.every(tag => row.tags.includes(tag)));
                rows.forEach(row => { row.tags = patch.tags; });
              }
              return Promise.resolve({data: rows.map(row => ({...row})), count: rows.length, error: null}).then(resolve);
            }
          }; return query;
        }};
        export const supabasePublic = supabaseAdmin;
      `;
      }
    }
  ]
});
let passed = 0;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function test(name, run) {
  Object.assign(state, { rows: [], writes: 0, conflict: false, failAt: 0 });
  await run();
  passed++;
  console.log('PASS', name);
}
try {
  const { bulkAppendSongTags } = await server.ssrLoadModule('/src/lib/server/songs.ts');
  const { parseTags } = await server.ssrLoadModule('/src/lib/tags.ts');
  const { sortAdminSongs, sortSongsByTitle } = await server.ssrLoadModule('/src/lib/songs.ts');
  await test('admin sorting preserves default order, matches public title sorting and handles import timestamps', () => {
    const rows = [
      { id: id(1), title: '长歌曲名', artist: 'A', language: '中文', createdAt: '2026-10-01T00:00:00Z' },
      { id: id(2), title: '光', artist: 'B', language: '中文', createdAt: '2026-10-02T00:00:00Z' },
      { id: id(3), title: 'Song', artist: 'C', language: '英语', createdAt: '2026-10-02T00:00:00Z' }
    ];
    assert.deepEqual(sortAdminSongs(rows, 'default', 'asc'), rows);
    assert.deepEqual(sortAdminSongs(rows, 'default', 'desc'), [...rows].reverse());
    for (const direction of ['asc', 'desc']) {
      assert.deepEqual(sortAdminSongs(rows, 'title', direction), sortSongsByTitle(rows, direction));
    }
    assert.deepEqual(
      sortAdminSongs(rows, 'import', 'desc').map((row) => row.id),
      [id(3), id(2), id(1)]
    );
    assert.deepEqual(
      sortAdminSongs(rows, 'import', 'asc').map((row) => row.id),
      [id(1), id(2), id(3)]
    );
    assert.equal(rows[0].id, id(1));
    assert.equal(sortAdminSongs([{ id: id(4) }, ...rows], 'import', 'asc')[0].id, id(4));
  });
  const { tagsInputSchema } = await server.ssrLoadModule('/src/lib/validators.ts');
  const { bulkTagSongsFormSchema, playlistImportFormValuesSchema, playlistImportPayloadSchema } =
    await server.ssrLoadModule('/src/lib/server/form-schemas.ts');
  await test('Chinese commas, whitespace and duplicates normalize consistently', () => {
    assert.deepEqual(parseTags(' 动画，日语, 动画, '), ['动画', '日语']);
    assert.equal(tagsInputSchema.safeParse(Array(9).fill('动画').join(',')).success, true);
  });
  await test('bulk request rejects empty selections, empty tags, invalid IDs and too many tags', () => {
    const form = new FormData();
    assert.equal(bulkTagSongsFormSchema.safeParse(form).success, false);
    form.append('id', id(1));
    assert.equal(bulkTagSongsFormSchema.safeParse(form).success, false);
    form.set('tagsInput', '动画');
    form.append('id', id(1));
    assert.equal(bulkTagSongsFormSchema.parse(form).ids.length, 1);
    form.set('id', 'invalid');
    assert.equal(bulkTagSongsFormSchema.safeParse(form).success, false);
    assert.equal(tagsInputSchema.safeParse(Array.from({ length: 9 }, (_, i) => String(i)).join(',')).success, false);
  });
  await test('append preserves existing tags and only changes selected songs; retry is idempotent', async () => {
    state.rows = [
      { id: id(1), title: 'A', tags: ['旧标签'] },
      { id: id(2), title: 'B', tags: [] }
    ];
    assert.equal(await bulkAppendSongTags([id(1), id(1)], ['新标签', '旧标签']), 1);
    assert.deepEqual(new Set(state.rows[0].tags), new Set(['旧标签', '新标签']));
    assert.deepEqual(state.rows[1].tags, []);
    await bulkAppendSongTags([id(1)], ['新标签']);
    assert.equal(state.rows[0].tags.length, 2);
  });
  await test('overflow or deleted selections fail before any write', async () => {
    state.rows = [
      { id: id(1), title: 'A', tags: [] },
      { id: id(2), title: 'B', tags: Array.from({ length: 8 }, (_, i) => String(i)) }
    ];
    await assert.rejects(() => bulkAppendSongTags([id(1), id(2)], ['new']), /未修改任何歌曲/);
    assert.equal(state.writes, 0);
    await assert.rejects(() => bulkAppendSongTags([id(1), id(3)], ['new']), /删除/);
    assert.equal(state.writes, 0);
  });
  await test('large selections are chunked and partial failures report progress', async () => {
    state.rows = Array.from({ length: 201 }, (_, i) => ({ id: id(i), title: String(i), tags: [] }));
    state.failAt = 2;
    await assert.rejects(
      () =>
        bulkAppendSongTags(
          state.rows.map((row) => row.id),
          ['new']
        ),
      /100 \/ 201/
    );
    state.failAt = 0;
    assert.equal(
      await bulkAppendSongTags(
        state.rows.map((row) => row.id),
        ['new']
      ),
      201
    );
    assert.ok(state.rows.every((row) => row.tags.length === 1));
  });
  await test('concurrent tag edits are not overwritten', async () => {
    state.rows = [{ id: id(1), title: 'A', tags: [] }];
    state.conflict = true;
    await assert.rejects(() => bulkAppendSongTags([id(1)], ['new']), /0 \/ 1/);
    assert.deepEqual(state.rows[0].tags, ['concurrent']);
  });
  await test('shared import tags merge into checked rows only and survive error echo', () => {
    const form = new FormData();
    form.set('status', 'ready');
    form.set('sharedTagsInput', '动画，日语');
    form.append('selectedSong', '0');
    for (const [title, tags] of [
      ['A', '动画,旧'],
      ['B', 'ignored']
    ]) {
      form.append('songTitle', title);
      form.append('songArtist', 'Singer');
      form.append('songLanguage', '中文');
      form.append('songTagsInput', tags);
    }
    const values = playlistImportFormValuesSchema.parse(form);
    const payload = playlistImportPayloadSchema.parse(values);
    assert.equal(payload.songsToImport.length, 1);
    assert.deepEqual(new Set(payload.songsToImport[0].tags), new Set(['动画', '日语', '旧']));
    assert.equal(payload.importPreview.sharedTagsInput, '动画，日语');
    form.set('sharedTagsInput', Array.from({ length: 8 }, (_, i) => String(i)).join(','));
    assert.equal(playlistImportPayloadSchema.safeParse(playlistImportFormValuesSchema.parse(form)).success, false);
  });
  console.log(passed + ' tag tests passed. No real database used.');
} finally {
  await server.close();
  delete globalThis.__tagsTest;
}
