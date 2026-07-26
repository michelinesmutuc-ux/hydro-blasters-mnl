-- Safe, session-scoped diagnostic for the temporary Admin connection panel.
-- It reads only the caller's JWT claims and exposes no token or secret.
create or replace function public.admin_authorization_diagnostics()
returns table (
  user_id uuid,
  app_metadata_role text,
  is_admin boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    auth.uid(),
    auth.jwt() -> 'app_metadata' ->> 'role',
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

revoke all on function public.admin_authorization_diagnostics() from public;
grant execute on function public.admin_authorization_diagnostics() to authenticated;
