-- Vision Tuition database schema
-- Run this file in a NEW, dedicated Supabase project's SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  student_name text not null check (char_length(student_name) between 2 and 100),
  class_level smallint not null check (class_level between 9 and 12),
  parent_name text not null check (char_length(parent_name) between 2 and 100),
  phone text not null check (char_length(phone) between 7 and 15),
  email text check (email is null or char_length(email) <= 150),
  school text check (school is null or char_length(school) <= 150),
  previous_class smallint not null check (previous_class between 8 and 12),
  board text not null check (board in ('State Board','CBSE','ICSE','Other')),
  previous_exam text not null check (char_length(previous_exam) between 2 and 100),
  previous_percentage numeric(5,2) not null check (previous_percentage between 0 and 100),
  subjects text[] not null check (cardinality(subjects) between 1 and 8),
  preferred_batch text check (preferred_batch is null or preferred_batch in ('Weekday evening','Weekend morning','Weekend evening')),
  message text check (message is null or char_length(message) <= 500),
  status text not null default 'pending' check (status in ('pending','active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.performance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  subject text not null check (char_length(subject) between 2 and 80),
  test_name text not null check (char_length(test_name) between 2 and 100),
  score numeric(8,2) not null check (score >= 0),
  max_score numeric(8,2) not null check (max_score > 0 and score <= max_score),
  attendance numeric(5,2) not null check (attendance between 0 and 100),
  test_date date not null,
  created_at timestamptz not null default now()
);

-- Safe upgrade path when the table was created by an earlier version.
alter table public.students add column if not exists previous_class smallint;
alter table public.students add column if not exists board text;
alter table public.students add column if not exists previous_exam text;
alter table public.students add column if not exists previous_percentage numeric(5,2);

create index if not exists students_class_level_idx on public.students(class_level);
create index if not exists students_created_at_idx on public.students(created_at desc);
create index if not exists performance_student_id_idx on public.performance(student_id);
create index if not exists performance_test_date_idx on public.performance(test_date desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at before update on public.students
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.admin_users enable row level security;
alter table public.students enable row level security;
alter table public.performance enable row level security;

drop policy if exists "Admins can view own authorisation" on public.admin_users;
create policy "Admins can view own authorisation"
on public.admin_users for select to authenticated
using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "Public can submit pending registrations" on public.students;
create policy "Public can submit pending registrations"
on public.students for insert to anon, authenticated
with check (status = 'pending');

drop policy if exists "Admins manage students" on public.students;
create policy "Admins manage students"
on public.students for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "Admins manage performance" on public.performance;
create policy "Admins manage performance"
on public.performance for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- After creating an Auth user, authorise that email:
-- insert into public.admin_users (email) values ('admin@visiontuition.com');
