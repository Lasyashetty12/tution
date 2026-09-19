-- Applied to the Infinite Tutorial Supabase project.
-- Link website administrators to immutable Auth user IDs instead of JWT email text.

alter table public.website_admin_users
  add column if not exists user_id uuid;

update public.website_admin_users a
set user_id = u.id
from auth.users u
where a.user_id is null
  and lower(a.email) = lower(u.email);

alter table public.website_admin_users
  alter column user_id set not null;

create unique index if not exists website_admin_users_user_id_idx
  on public.website_admin_users(user_id);

drop policy if exists "Website admins can view own authorisation" on public.website_admin_users;
create policy "Website admins can view own authorisation"
on public.website_admin_users for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Website admins can view students" on public.website_students;
create policy "Website admins can view students"
on public.website_students for select to authenticated
using (exists (
  select 1 from public.website_admin_users a
  where a.user_id = (select auth.uid())
));

drop policy if exists "Website admins can update students" on public.website_students;
create policy "Website admins can update students"
on public.website_students for update to authenticated
using (exists (
  select 1 from public.website_admin_users a
  where a.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.website_admin_users a
  where a.user_id = (select auth.uid())
));

drop policy if exists "Website admins can delete students" on public.website_students;
create policy "Website admins can delete students"
on public.website_students for delete to authenticated
using (exists (
  select 1 from public.website_admin_users a
  where a.user_id = (select auth.uid())
));

drop policy if exists "Website admins manage performance" on public.website_performance;
create policy "Website admins manage performance"
on public.website_performance for all to authenticated
using (exists (
  select 1 from public.website_admin_users a
  where a.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.website_admin_users a
  where a.user_id = (select auth.uid())
));
