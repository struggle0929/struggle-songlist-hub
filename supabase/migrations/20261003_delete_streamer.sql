begin;
-- Platform-only server RPC. Accounts remain available for other songlists.
create or replace function public.delete_streamer(p_streamer_id uuid) returns jsonb
language plpgsql set search_path=public as $$
declare old_settings jsonb;
begin
  perform 1 from public.streamers where id=p_streamer_id for update;
  if not found then raise exception '歌单不存在或已删除。'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_streamer_id::text,0));
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into old_settings
    from public.settings where streamer_id=p_streamer_id;
  delete from public.requests where streamer_id=p_streamer_id;
  delete from public.songs where streamer_id=p_streamer_id;
  delete from public.settings where streamer_id=p_streamer_id;
  delete from public.streamers where id=p_streamer_id;
  return old_settings;
end; $$;
revoke all on function public.delete_streamer(uuid) from public,anon,authenticated;
grant execute on function public.delete_streamer(uuid) to service_role;
commit;
