import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL in memory. Only Supabase-managed auth/storage schemas are fixtures.
export async function testDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    grant usage on schema public to anon,authenticated,service_role;
  `);
  const baseline = (await readFile('supabase/single-streamer-baseline.sql', 'utf8')).replace(
    'create extension if not exists pgcrypto;',
    ''
  );
  await db.exec(baseline);
  return db;
}

const A = '00000000-0000-4000-8000-000000000001';
const B = '22222222-2222-4222-8222-222222222222';
const songId = '33333333-3333-4333-8333-333333333333';
const requestId = '44444444-4444-4444-8444-444444444444';
let passed = 0;
const db = await testDatabase();
async function test(name, run) {
  await run();
  console.log('PASS', name);
  passed++;
}
try {
  await db.exec(`insert into public.songs(id,title,artist,language,status) values('${songId}','旧歌曲','原唱','中文','ready');
    insert into public.requests(id,song_title,language,message,status,matched_song_id) values('${requestId}','旧愿望','中文','','accepted','${songId}');
    update public.settings set value='profile/old.jpg' where key='avatar_path';
    insert into storage.objects(bucket_id,name) values('site-assets','profile/old.jpg');`);
  await db.exec(
    'alter table storage.objects enable row level security;grant all on storage.objects to anon,authenticated;grant usage on schema storage to anon,authenticated;create policy legacy_permissive on storage.objects for all to anon,authenticated using(true) with check(true);'
  );
  await db.exec(await readFile('supabase/migrations/20261003_multi_streamer.sql', 'utf8'));
  await test('legacy upgrade preserves songs, request links and existing Storage keys', async () => {
    assert.equal((await db.query('select streamer_id from songs')).rows[0].streamer_id, A);
    assert.equal((await db.query('select matched_song_id from requests')).rows[0].matched_song_id, songId);
    assert.equal((await db.query('select name from storage.objects')).rows[0].name, 'profile/old.jpg');
  });
  await test('streamer creation initializes all five settings atomically', async () => {
    await db.query('select create_streamer($1,$2,$3)', [B, 'xunxuntu', '薰薰兔']);
    assert.equal((await db.query('select count(*)::int n from settings where streamer_id=$1', [B])).rows[0].n, 5);
    await assert.rejects(db.query('select create_streamer(gen_random_uuid(),$1,$2)', ['xunxuntu', 'duplicate']));
    await assert.rejects(db.query('select create_streamer(gen_random_uuid(),$1,$2)', ['admin', 'reserved']));
    await assert.rejects(db.query('select create_streamer(gen_random_uuid(),$1,$2)', ['valid', '  ']));
  });
  await test('identical legacy song IDs can coexist without crossing streamers', async () => {
    await db.query('insert into songs(streamer_id,id,title,artist,language,status) values($1,$2,$3,$4,$5,$6)', [
      B,
      songId,
      'B歌曲',
      'B原唱',
      '中文',
      'ready'
    ]);
    assert.equal((await db.query('select count(*)::int n from songs where id=$1', [songId])).rows[0].n, 2);
  });
  await test('request foreign key rejects a song owned only by another streamer', async () => {
    const other = '55555555-5555-4555-8555-555555555555';
    await db.query('insert into songs(streamer_id,id,title,artist,language,status) values($1,$2,$3,$4,$5,$6)', [
      B,
      other,
      'B only',
      '',
      '中文',
      'ready'
    ]);
    await assert.rejects(db.query('update requests set matched_song_id=$1 where streamer_id=$2', [other, A]));
  });
  await test('accept RPC cannot process another streamer request', async () => {
    await db.query('select create_song_request($1,$2,$3,$4,$5,$6)', [B, 'B愿望', '', '中文', '', '']);
    const id = (await db.query('select id from requests where streamer_id=$1', [B])).rows[0].id;
    await assert.rejects(db.query('select accept_song_request($1,$2)', [A, id]));
    await db.query('select accept_song_request($1,$2)', [B, id]);
    await assert.rejects(db.query('select accept_song_request($1,$2)', [B, id]));
    assert.equal((await db.query('select count(*)::int n from songs where streamer_id=$1', [A])).rows[0].n, 1);
  });
  const settings = {
    avatar_path: '',
    background_path: '',
    hero_title: 'A restored',
    bilibili_url: 'https://bilibili.com/',
    appearance: ''
  };
  await test('failed restore rolls back deletes and settings as one PostgreSQL transaction', async () => {
    const before = (await db.query('select * from songs where streamer_id=$1', [A])).rows;
    await assert.rejects(
      db.query('select restore_admin_data($1,$2,$3,$4)', [
        A,
        JSON.stringify([{ id: songId, language: 'INVALID' }]),
        '[]',
        JSON.stringify(settings)
      ])
    );
    assert.deepEqual((await db.query('select * from songs where streamer_id=$1', [A])).rows, before);
    assert.equal(
      (await db.query("select value from settings where streamer_id=$1 and key='avatar_path'", [A])).rows[0].value,
      'profile/old.jpg'
    );
  });
  await test('restore ignores forged streamer_id fields and changes only the target', async () => {
    const b = (await db.query('select * from songs where streamer_id=$1 order by id', [B])).rows;
    const records = [
      {
        streamer_id: B,
        id: songId,
        title: 'A restored',
        artist: '',
        language: '中文',
        status: 'ready',
        tags: [],
        is_public: true,
        created_at: '2026-10-03T00:00:00Z'
      }
    ];
    await db.query('select restore_admin_data($1,$2,$3,$4)', [
      A,
      JSON.stringify(records),
      '[]',
      JSON.stringify(settings)
    ]);
    assert.equal((await db.query('select title from songs where streamer_id=$1', [A])).rows[0].title, 'A restored');
    assert.deepEqual((await db.query('select * from songs where streamer_id=$1 order by id', [B])).rows, b);
  });
  await test('reset removes only one streamer and preserves other requests and settings', async () => {
    const before = (await db.query('select * from requests where streamer_id=$1', [B])).rows;
    await db.query('select reset_admin_data($1,$2)', [A, JSON.stringify(settings)]);
    assert.equal((await db.query('select count(*)::int n from songs where streamer_id=$1', [A])).rows[0].n, 0);
    assert.deepEqual((await db.query('select * from requests where streamer_id=$1', [B])).rows, before);
    assert.equal((await db.query('select count(*)::int n from settings where streamer_id=$1', [B])).rows[0].n, 5);
  });
  await test('anonymous RLS hides private songs and disabled streamers', async () => {
    await db.query('update songs set is_public=false where streamer_id=$1 and id=$2', [B, songId]);
    await db.exec('set role anon;');
    assert.ok((await db.query('select * from songs')).rows.every((s) => s.is_public));
    await db.exec('reset role;');
    await db.query('update streamers set enabled=false where id=$1', [B]);
    await db.exec('set role anon;');
    assert.equal((await db.query('select * from songs')).rows.length, 0);
    assert.equal((await db.query('select * from settings where streamer_id=$1', [B])).rows.length, 0);
    await db.exec('reset role;');
  });
  await test('anonymous and authenticated clients cannot call mutation RPCs or read permissions', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role};`);
      await assert.rejects(db.query('select reset_admin_data($1,$2)', [A, '{}']));
      await assert.rejects(db.query('select * from platform_admins'));
      await assert.rejects(db.query('select * from streamer_members'));
      await assert.rejects(db.query('select * from requests'));
      await db.exec('reset role;');
    }
  });
  await test('restrictive Storage policies block legacy anonymous upload and deletion', async () => {
    await db.exec('set role authenticated;');
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('site-assets','forged.png')"));
    await db.query("delete from storage.objects where bucket_id='site-assets'");
    await db.exec('reset role;');
    assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n, 1);
  });
  await test('disabled streamer rejects public writes and unsafe old RPC overloads are gone', async () => {
    await assert.rejects(db.query('select create_song_request($1,$2,$3,$4,$5,$6)', [B, 'blocked', '', '中文', '', '']));
    assert.equal((await db.query("select to_regprocedure('public.reset_admin_data(jsonb)') f")).rows[0].f, null);
    assert.equal(
      (await db.query("select to_regprocedure('public.restore_admin_data(jsonb,jsonb,jsonb)') f")).rows[0].f,
      null
    );
  });
  await test('full empty-database schema initializes the same tenant structure', async () => {
    const fresh = new PGlite();
    try {
      await fresh.exec(
        `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);`
      );
      await fresh.exec(
        (await readFile('supabase/schema.sql', 'utf8')).replace('create extension if not exists pgcrypto;', '')
      );
      assert.equal((await fresh.query('select slug from streamers')).rows[0].slug, 'siro0');
    } finally {
      await fresh.close();
    }
  });
  console.log(`${passed} PostgreSQL isolation tests passed. No remote database used.`);
} finally {
  await db.close();
}
