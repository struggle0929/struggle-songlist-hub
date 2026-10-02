-- Multi-streamer upgrade: apply once to an existing single-streamer schema.
-- Existing data belongs to siro0. Back up before applying to a real project.
begin;
create table public.streamers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$'
    and slug not in ('www','admin','api','auth','assets','s','localhost','mail')),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.platform_admins (user_id uuid primary key references auth.users(id) on delete cascade);
create table public.streamer_members (
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (streamer_id, user_id)
);
create index streamer_members_user_idx on public.streamer_members(user_id);
insert into public.streamers (id,slug,name) values ('00000000-0000-4000-8000-000000000001','siro0','Siro0');
alter table public.songs add column streamer_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.streamers(id);
alter table public.requests add column streamer_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.streamers(id);
alter table public.settings add column streamer_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.streamers(id);
alter table public.songs alter column streamer_id drop default;
alter table public.requests alter column streamer_id drop default;
alter table public.settings alter column streamer_id drop default;
alter table public.requests drop constraint requests_matched_song_id_fkey;
alter table public.songs drop constraint songs_pkey;
alter table public.songs add primary key(streamer_id,id);
alter table public.requests drop constraint requests_pkey;
alter table public.requests add primary key(streamer_id,id);
alter table public.requests add constraint requests_song_scope_fkey foreign key(streamer_id,matched_song_id)
  references public.songs(streamer_id,id) on delete set null (matched_song_id);
alter table public.settings drop constraint settings_pkey;
alter table public.settings add primary key(streamer_id,key);
create index songs_streamer_order_idx on public.songs(streamer_id,created_at,id);
create index requests_streamer_order_idx on public.requests(streamer_id,created_at,id);

-- Legacy assets retain their existing Storage keys for siro0 only.
-- New uploads always use <streamer UUID>/...; never rename storage.objects directly.

alter table public.streamers enable row level security;
alter table public.platform_admins enable row level security;
alter table public.streamer_members enable row level security;
create policy "enabled streamers are readable" on public.streamers for select to anon,authenticated using(enabled);
drop policy "public songs are readable" on public.songs;
create policy "public songs are readable" on public.songs for select to anon,authenticated
  using(is_public and exists(select 1 from public.streamers where id=streamer_id and enabled));
drop policy "public settings are readable" on public.settings;
create policy "public settings are readable" on public.settings for select to anon,authenticated
  using(exists(select 1 from public.streamers where id=streamer_id and enabled));
-- Restrictive Storage write rules override any permissive legacy policies on this bucket.
create policy "site assets server insert only" on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id <> 'site-assets');
create policy "site assets server update only" on storage.objects as restrictive for update to anon,authenticated using(bucket_id <> 'site-assets') with check(bucket_id <> 'site-assets');
create policy "site assets server delete only" on storage.objects as restrictive for delete to anon,authenticated using(bucket_id <> 'site-assets');
-- All writes and private reads use server-only service_role after live authorization checks.
grant select on public.streamers,public.songs,public.settings to anon,authenticated;
revoke all on public.streamer_members,public.platform_admins,public.requests,public.request_rate_limits from anon,authenticated;
grant all on all tables in schema public to service_role;

-- Remove every unsafe old overload, so old deployments cannot reset the shared database.
drop function public.accept_song_request(uuid);
drop function public.create_song_request(text,text,public.song_language,text,text);
drop function public.reset_admin_data(jsonb);
drop function public.restore_admin_data(jsonb,jsonb,jsonb);
create function public.assert_active_streamer(p_streamer_id uuid) returns void language plpgsql set search_path=public as $$
begin
  perform 1 from public.streamers where id=p_streamer_id and enabled for share;
  if not found then raise exception '主播不存在或已停用。'; end if;
end; $$;
create function public.create_streamer(p_id uuid,p_slug text,p_name text) returns void language plpgsql set search_path=public as $$
begin
  insert into public.streamers(id,slug,name) values(p_id,p_slug,p_name);
  insert into public.settings(streamer_id,key,value) values
    (p_id,'avatar_path',''),(p_id,'background_path',''),(p_id,'hero_title',p_name),
    (p_id,'bilibili_url','https://www.bilibili.com/'),(p_id,'appearance','');
end; $$;
create function public.create_song_request(p_streamer_id uuid,p_song_title text,p_artist text,p_language public.song_language,p_message text,p_requester_name text)
returns void language plpgsql set search_path=public as $$
begin
  perform public.assert_active_streamer(p_streamer_id);
  insert into public.requests(streamer_id,song_title,artist,language,message,requester_name)
    values(p_streamer_id,p_song_title,p_artist,p_language,p_message,nullif(p_requester_name,''));
end; $$;
create function public.accept_song_request(p_streamer_id uuid,request_id uuid) returns uuid language plpgsql set search_path=public as $$
declare r public.requests%rowtype; new_id uuid;
begin
  perform public.assert_active_streamer(p_streamer_id);
  select * into r from public.requests where streamer_id=p_streamer_id and id=request_id for update;
  if not found then raise exception '愿望不存在。'; end if;
  if r.status<>'pending' then raise exception '这个愿望已经处理过。'; end if;
  insert into public.songs(streamer_id,title,artist,language,status,tags,is_public)
    values(p_streamer_id,r.song_title,r.artist,r.language,'learning','{}',true) returning id into new_id;
  update public.requests set status='accepted',matched_song_id=new_id where streamer_id=p_streamer_id and id=request_id;
  return new_id;
end; $$;
create function public.reset_admin_data(p_streamer_id uuid,p_settings jsonb) returns void language plpgsql set search_path=public as $$
begin
  perform public.assert_active_streamer(p_streamer_id);
  -- Serialize reset/restore within one streamer; unrelated streamers remain available.
  perform pg_advisory_xact_lock(hashtextextended(p_streamer_id::text,0));
  delete from public.requests where streamer_id=p_streamer_id;
  delete from public.songs where streamer_id=p_streamer_id;
  delete from public.settings where streamer_id=p_streamer_id;
  insert into public.settings(streamer_id,key,value) select p_streamer_id,key,value from jsonb_each_text(p_settings);
end; $$;
create function public.restore_admin_data(p_streamer_id uuid,p_songs jsonb,p_requests jsonb,p_settings jsonb)
returns void language plpgsql set search_path=public as $$
begin
  perform public.reset_admin_data(p_streamer_id,p_settings);
  insert into public.songs(streamer_id,id,title,artist,language,status,tags,is_public,created_at)
    select p_streamer_id,id,title,artist,language,status,tags,is_public,created_at from jsonb_populate_recordset(null::public.songs,p_songs);
  insert into public.requests(streamer_id,id,song_title,artist,language,message,requester_name,status,matched_song_id,created_at)
    select p_streamer_id,id,song_title,artist,language,message,requester_name,status,matched_song_id,created_at from jsonb_populate_recordset(null::public.requests,p_requests);
end; $$;
revoke all on function public.assert_active_streamer(uuid), public.create_streamer(uuid,text,text),
  public.create_song_request(uuid,text,text,public.song_language,text,text),public.accept_song_request(uuid,uuid),
  public.reset_admin_data(uuid,jsonb),public.restore_admin_data(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.assert_active_streamer(uuid), public.create_streamer(uuid,text,text),
  public.create_song_request(uuid,text,text,public.song_language,text,text),public.accept_song_request(uuid,uuid),
  public.reset_admin_data(uuid,jsonb),public.restore_admin_data(uuid,jsonb,jsonb,jsonb) to service_role;
commit;
