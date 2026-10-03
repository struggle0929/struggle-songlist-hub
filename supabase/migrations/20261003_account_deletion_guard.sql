begin;
-- Locking the Auth row during deletion also serializes concurrent FK-based grants.
create or replace function public.protect_authorized_account() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.platform_admins where user_id=old.id) then
    raise exception '平台管理员账号不能删除。';
  end if;
  if exists(select 1 from public.streamer_members where user_id=old.id) then
    raise exception '账号仍有歌单授权，请先撤销全部授权。';
  end if;
  return old;
end; $$;
revoke all on function public.protect_authorized_account() from public,anon,authenticated;
drop trigger if exists protect_authorized_account on auth.users;
create trigger protect_authorized_account before delete on auth.users
for each row execute function public.protect_authorized_account();
commit;
