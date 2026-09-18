-- Infinite Tutorial: secure student management and scorecard schema
-- Designed for Supabase Postgres with RLS enabled on every exposed table.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

do $$ begin
  create type public.app_role as enum ('student','parent','teacher','admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.student_class as enum ('9th A','9th B','10th A','10th B');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.board_type as enum ('State Board','CBSE');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.session_type as enum ('Morning','Evening');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.attendance_status as enum ('Present','Absent');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.leave_status as enum ('Pending','Approved','Rejected');
exception when duplicate_object then null; end $$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role public.app_role not null,
  display_name text not null check (char_length(trim(display_name)) between 2 and 120),
  mobile text check (mobile is null or mobile ~ '^[0-9]{10,15}$'),
  active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 2 and 80),
  class_code public.student_class not null,
  default_session public.session_type not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(user_id) on delete restrict,
  student_code text not null unique default ('IT-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  photo_path text,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  school_name text check (school_name is null or char_length(trim(school_name)) between 2 and 160),
  parent_name text check (parent_name is null or char_length(trim(parent_name)) between 2 and 120),
  parent_mobile text not null unique check (parent_mobile ~ '^[0-9]{10,15}$'),
  date_of_birth date not null check (date_of_birth < current_date),
  class_code public.student_class,
  board public.board_type,
  batch_id uuid references public.batches(id) on delete restrict,
  profile_locked boolean not null default false,
  profile_completed_at timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint completed_profile_fields check (
    not profile_locked or
    (photo_path is not null and school_name is not null and parent_name is not null and class_code is not null and board is not null and batch_id is not null and profile_completed_at is not null)
  )
);

create table public.parent_profiles (
  user_id uuid primary key references public.profiles(user_id) on delete restrict,
  parent_name text not null,
  mobile text not null check (mobile ~ '^[0-9]{10,15}$'),
  created_at timestamptz not null default now()
);

create table public.parent_student_links (
  parent_user_id uuid not null references public.parent_profiles(user_id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  relationship text not null default 'Parent/Guardian',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (parent_user_id, student_id)
);

create table public.teacher_batch_assignments (
  teacher_user_id uuid not null references public.profiles(user_id) on delete restrict,
  batch_id uuid not null references public.batches(id) on delete restrict,
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  primary key (teacher_user_id, batch_id)
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  batch_id uuid not null references public.batches(id) on delete restrict,
  attendance_date date not null,
  session public.session_type not null,
  status public.attendance_status not null,
  marked_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id, attendance_date, session),
  constraint attendance_mon_sat check (extract(isodow from attendance_date) between 1 and 6)
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  leave_date date not null,
  session text not null check (session in ('Morning','Evening','Full Day')),
  reason text not null check (char_length(trim(reason)) between 3 and 300),
  message text check (message is null or char_length(message) <= 800),
  status public.leave_status not null default 'Pending',
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  board public.board_type not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(name, board)
);

create table public.tests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  subject_id uuid not null references public.subjects(id) on delete restrict,
  batch_id uuid references public.batches(id) on delete restrict,
  test_date date not null,
  maximum_marks numeric(8,2) not null check (maximum_marks > 0),
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.marks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  test_id uuid not null references public.tests(id) on delete restrict,
  obtained_marks numeric(8,2) not null check (obtained_marks >= 0),
  maximum_marks numeric(8,2) not null check (maximum_marks > 0 and obtained_marks <= maximum_marks),
  percentage numeric(6,2) generated always as (round((obtained_marks / maximum_marks) * 100, 2)) stored,
  teacher_remarks text check (teacher_remarks is null or char_length(teacher_remarks) <= 1000),
  paper_visible boolean not null default false,
  entered_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id, test_id)
);

create table public.test_papers (
  id uuid primary key default gen_random_uuid(),
  mark_id uuid not null references public.marks(id) on delete restrict,
  paper_type text not null check (paper_type in ('Question Paper','Answer Paper','Other')),
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 160),
  body text not null check (char_length(trim(body)) between 2 and 2000),
  batch_id uuid references public.batches(id) on delete restrict,
  published boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.profile_history (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.students(id) on delete restrict,
  previous_data jsonb not null,
  new_data jsonb not null,
  changed_by uuid references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create table public.password_reset_history (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.students(id) on delete restrict,
  reset_by uuid not null references auth.users(id) on delete restrict,
  reset_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('INSERT','UPDATE')),
  old_data jsonb,
  new_data jsonb,
  actor_user_id uuid,
  created_at timestamptz not null default now()
);

create table private.bootstrap_config (
  id boolean primary key default true check (id),
  token_hash text not null,
  claimed_at timestamptz
);

insert into private.bootstrap_config(id, token_hash)
values (true, encode(extensions.digest('REPLACE_WITH_A_PRIVATE_SETUP_TOKEN','sha256'),'hex'))
on conflict (id) do nothing;

create or replace function private.current_role()
returns public.app_role language sql stable security definer set search_path = ''
as $$ select role from public.profiles where user_id = (select auth.uid()) and active $$;
revoke all on function private.current_role() from public;
grant execute on function private.current_role() to authenticated;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.current_role() = 'admin', false) $$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.current_role() in ('teacher','admin'), false) $$;
revoke all on function private.is_staff() from public;
grant execute on function private.is_staff() to authenticated;

create or replace function private.can_access_student(target_student uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.students s where s.id=target_student and s.user_id=(select auth.uid()))
  or exists(select 1 from public.parent_student_links l where l.student_id=target_student and l.parent_user_id=(select auth.uid()) and l.active)
  or private.is_admin()
  or exists(
    select 1 from public.students s
    join public.teacher_batch_assignments a on a.batch_id=s.batch_id and a.active
    where s.id=target_student and a.teacher_user_id=(select auth.uid())
  )
$$;
revoke all on function private.can_access_student(uuid) from public;
grant execute on function private.can_access_student(uuid) to authenticated;

create or replace function private.can_manage_student(target_student uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.is_admin() or exists(
    select 1 from public.students s
    join public.teacher_batch_assignments a on a.batch_id=s.batch_id and a.active
    where s.id=target_student and a.teacher_user_id=(select auth.uid())
  )
$$;
revoke all on function private.can_manage_student(uuid) from public;
grant execute on function private.can_manage_student(uuid) to authenticated;

create or replace function public.claim_first_admin(setup_token text, admin_name text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare cfg private.bootstrap_config;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into cfg from private.bootstrap_config where id=true for update;
  if cfg.claimed_at is not null or exists(select 1 from public.profiles where role='admin') then
    raise exception 'Initial admin already configured';
  end if;
  if encode(extensions.digest(setup_token,'sha256'),'hex') <> cfg.token_hash then
    raise exception 'Invalid setup token';
  end if;
  insert into public.profiles(user_id, role, display_name, active, must_change_password)
  values (auth.uid(), 'admin', trim(admin_name), true, false);
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) || '{"role":"admin"}'::jsonb where id=auth.uid();
  update private.bootstrap_config set claimed_at=now() where id=true;
  return true;
end $$;
revoke all on function public.claim_first_admin(text,text) from public, anon;
grant execute on function public.claim_first_admin(text,text) to authenticated;

create or replace function public.complete_student_profile(
  p_photo_path text, p_school_name text, p_parent_name text,
  p_class_code public.student_class, p_board public.board_type, p_batch_id uuid
) returns public.students language plpgsql security definer set search_path = ''
as $$
declare result public.students;
begin
  update public.students set
    photo_path=trim(p_photo_path), school_name=trim(p_school_name), parent_name=trim(p_parent_name),
    class_code=p_class_code, board=p_board, batch_id=p_batch_id,
    profile_locked=true, profile_completed_at=now(), updated_at=now()
  where user_id=auth.uid() and profile_locked=false
  returning * into result;
  if result.id is null then raise exception 'Profile is already locked or unavailable'; end if;
  return result;
end $$;
revoke all on function public.complete_student_profile(text,text,text,public.student_class,public.board_type,uuid) from public, anon;
grant execute on function public.complete_student_profile(text,text,text,public.student_class,public.board_type,uuid) to authenticated;

create or replace function public.mark_password_changed()
returns void language plpgsql security definer set search_path = ''
as $$ begin
  update public.profiles set must_change_password=false, updated_at=now() where user_id=auth.uid();
end $$;
revoke all on function public.mark_password_changed() from public, anon;
grant execute on function public.mark_password_changed() to authenticated;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at=now(); return new; end $$;

create or replace function private.audit_change()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  insert into public.audit_logs(table_name,record_id,action,old_data,new_data,actor_user_id)
  values (tg_table_name, coalesce(new.id,old.id)::text, tg_op, case when tg_op='UPDATE' then to_jsonb(old) end, to_jsonb(new), auth.uid());
  if tg_table_name='students' and tg_op='UPDATE' then
    insert into public.profile_history(student_id,previous_data,new_data,changed_by)
    values(new.id,to_jsonb(old),to_jsonb(new),auth.uid());
  end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['profiles','batches','students','attendance','leave_requests','tests','marks'] loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I',t,t);
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t,t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['students','attendance','leave_requests','tests','marks','batches'] loop
    execute format('drop trigger if exists %I_audit on public.%I',t,t);
    execute format('create trigger %I_audit after insert or update on public.%I for each row execute function private.audit_change()',t,t);
  end loop;
end $$;

insert into public.batches(name,class_code,default_session) values
('9th A Morning','9th A','Morning'),('9th A Evening','9th A','Evening'),
('9th B Morning','9th B','Morning'),('9th B Evening','9th B','Evening'),
('10th A Morning','10th A','Morning'),('10th A Evening','10th A','Evening'),
('10th B Morning','10th B','Morning'),('10th B Evening','10th B','Evening')
on conflict (name) do nothing;

insert into public.subjects(name,board) values
('Physics','CBSE'),('Chemistry','CBSE'),('Mathematics','CBSE'),('Biology','CBSE'),
('Hindi','CBSE'),('Kannada','CBSE'),('English','CBSE'),('Social Science','CBSE'),
('Physics','State Board'),('Chemistry','State Board'),('Mathematics','State Board'),('Biology','State Board'),
('Hindi','State Board'),('Kannada','State Board'),('English','State Board'),('Social Science','State Board')
on conflict (name,board) do nothing;

create index students_batch_idx on public.students(batch_id) where active;
create index students_search_idx on public.students using gin (to_tsvector('simple', coalesce(full_name,'') || ' ' || coalesce(school_name,'') || ' ' || parent_mobile));
create index attendance_student_date_idx on public.attendance(student_id,attendance_date desc);
create index attendance_batch_date_idx on public.attendance(batch_id,attendance_date desc,session);
create index leave_student_date_idx on public.leave_requests(student_id,leave_date desc);
create index marks_student_idx on public.marks(student_id,created_at desc);
create index tests_subject_date_idx on public.tests(subject_id,test_date desc);
create index audit_created_idx on public.audit_logs(created_at desc);

do $$ declare t text; begin
  foreach t in array array['profiles','batches','students','parent_profiles','parent_student_links','teacher_batch_assignments','attendance','leave_requests','subjects','tests','marks','test_papers','announcements','profile_history','password_reset_history','audit_logs'] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;

create policy profiles_read_self_staff on public.profiles for select to authenticated
using (user_id=(select auth.uid()) or private.is_staff());
create policy profiles_admin_update on public.profiles for update to authenticated
using (private.is_admin()) with check (private.is_admin());

create policy batches_read on public.batches for select to authenticated using (true);
create policy batches_admin_insert on public.batches for insert to authenticated with check (private.is_admin());
create policy batches_admin_update on public.batches for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy students_read_allowed on public.students for select to authenticated using (private.can_access_student(id));
create policy students_staff_insert on public.students for insert to authenticated with check (private.is_admin());
create policy students_staff_update on public.students for update to authenticated using (private.can_manage_student(id)) with check (private.can_manage_student(id));

create policy parents_self_staff on public.parent_profiles for select to authenticated using (user_id=(select auth.uid()) or private.is_staff());
create policy parents_admin_insert on public.parent_profiles for insert to authenticated with check (private.is_admin());
create policy parents_admin_update on public.parent_profiles for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy parent_links_read on public.parent_student_links for select to authenticated using (parent_user_id=(select auth.uid()) or private.is_staff());
create policy parent_links_admin_insert on public.parent_student_links for insert to authenticated with check (private.is_admin());
create policy parent_links_admin_update on public.parent_student_links for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy assignments_read on public.teacher_batch_assignments for select to authenticated using (teacher_user_id=(select auth.uid()) or private.is_admin());
create policy assignments_admin_insert on public.teacher_batch_assignments for insert to authenticated with check (private.is_admin());
create policy assignments_admin_update on public.teacher_batch_assignments for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy attendance_read on public.attendance for select to authenticated using (private.can_access_student(student_id));
create policy attendance_staff_insert on public.attendance for insert to authenticated with check (private.can_manage_student(student_id));
create policy attendance_staff_update on public.attendance for update to authenticated using (private.can_manage_student(student_id)) with check (private.can_manage_student(student_id));

create policy leave_read on public.leave_requests for select to authenticated using (private.can_access_student(student_id));
create policy leave_student_insert on public.leave_requests for insert to authenticated with check (
  exists(select 1 from public.students s where s.id=student_id and s.user_id=(select auth.uid())) and status='Pending'
);
create policy leave_staff_update on public.leave_requests for update to authenticated using (private.can_manage_student(student_id)) with check (private.can_manage_student(student_id));

create policy subjects_read on public.subjects for select to authenticated using (true);
create policy subjects_admin_insert on public.subjects for insert to authenticated with check (private.is_admin());
create policy subjects_admin_update on public.subjects for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy tests_read on public.tests for select to authenticated using (true);
create policy tests_staff_insert on public.tests for insert to authenticated with check (private.is_staff());
create policy tests_staff_update on public.tests for update to authenticated using (private.is_staff()) with check (private.is_staff());

create policy marks_read on public.marks for select to authenticated using (private.can_access_student(student_id));
create policy marks_staff_insert on public.marks for insert to authenticated with check (private.can_manage_student(student_id));
create policy marks_staff_update on public.marks for update to authenticated using (private.can_manage_student(student_id)) with check (private.can_manage_student(student_id));

create policy papers_read on public.test_papers for select to authenticated using (
  exists(select 1 from public.marks m where m.id=mark_id and private.can_access_student(m.student_id) and (m.paper_visible or private.is_staff()))
);
create policy papers_staff_insert on public.test_papers for insert to authenticated with check (
  exists(select 1 from public.marks m where m.id=mark_id and private.can_manage_student(m.student_id))
);

create policy announcements_read on public.announcements for select to authenticated using (
  published and (batch_id is null or private.is_staff() or exists(select 1 from public.students s where s.batch_id=announcements.batch_id and s.user_id=(select auth.uid())) or exists(select 1 from public.parent_student_links l join public.students s on s.id=l.student_id where l.parent_user_id=(select auth.uid()) and l.active and s.batch_id=announcements.batch_id))
);
create policy announcements_staff_insert on public.announcements for insert to authenticated with check (private.is_staff());
create policy announcements_staff_update on public.announcements for update to authenticated using (private.is_staff()) with check (private.is_staff());

create policy profile_history_read on public.profile_history for select to authenticated using (private.can_access_student(student_id));
create policy reset_history_staff_read on public.password_reset_history for select to authenticated using (private.is_staff());
create policy audit_admin_read on public.audit_logs for select to authenticated using (private.is_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('student-photos','student-photos',false,5242880,array['image/jpeg','image/png']),
('test-papers','test-papers',false,15728640,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false;

create policy student_photos_read on storage.objects for select to authenticated using (
  bucket_id='student-photos' and (
    private.is_staff() or (storage.foldername(name))[1]=auth.uid()::text or
    exists(select 1 from public.parent_student_links l join public.students s on s.id=l.student_id where l.parent_user_id=auth.uid() and l.active and s.user_id::text=(storage.foldername(name))[1])
  )
);
create policy student_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id='student-photos' and (
    (storage.foldername(name))[1]=auth.uid()::text or private.is_staff()
  )
);
create policy test_papers_staff_insert on storage.objects for insert to authenticated with check (
  bucket_id='test-papers' and private.is_staff()
);
create policy test_papers_read on storage.objects for select to authenticated using (
  bucket_id='test-papers' and private.can_access_student(((storage.foldername(name))[1])::uuid)
);

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert,update on public.batches,public.students,public.parent_profiles,public.parent_student_links,public.teacher_batch_assignments,public.attendance,public.leave_requests,public.subjects,public.tests,public.marks,public.test_papers,public.announcements to authenticated;
grant usage,select on all sequences in schema public to authenticated;

-- Explicitly remove hard-delete privileges even when platform defaults grant them.
revoke delete on all tables in schema public from authenticated, anon;

-- Cover foreign keys used by history, staff filtering and uploaded-paper joins.
create index if not exists announcements_batch_idx on public.announcements(batch_id);
create index if not exists announcements_created_by_idx on public.announcements(created_by);
create index if not exists attendance_marked_by_idx on public.attendance(marked_by);
create index if not exists batches_created_by_idx on public.batches(created_by);
create index if not exists leave_reviewed_by_idx on public.leave_requests(reviewed_by);
create index if not exists marks_entered_by_idx on public.marks(entered_by);
create index if not exists marks_test_idx on public.marks(test_id);
create index if not exists parent_links_student_idx on public.parent_student_links(student_id);
create index if not exists reset_history_reset_by_idx on public.password_reset_history(reset_by);
create index if not exists reset_history_student_idx on public.password_reset_history(student_id);
create index if not exists profile_history_changed_by_idx on public.profile_history(changed_by);
create index if not exists profile_history_student_idx on public.profile_history(student_id);
create index if not exists students_created_by_idx on public.students(created_by);
create index if not exists teacher_assignment_batch_idx on public.teacher_batch_assignments(batch_id);
create index if not exists test_papers_mark_idx on public.test_papers(mark_id);
create index if not exists test_papers_uploaded_by_idx on public.test_papers(uploaded_by);
create index if not exists tests_batch_idx on public.tests(batch_id);
create index if not exists tests_created_by_idx on public.tests(created_by);
