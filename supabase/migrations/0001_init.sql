-- TomCredora: initial schema.
-- Security model: every table has RLS on; users can only touch their own rows.
-- The API also checks ownership in code (defence in depth); RLS is the backstop.

create extension if not exists "pgcrypto";

create table public.resumes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  jd_hash     text check (jd_hash is null or char_length(jd_hash) = 64),
  data        jsonb not null check (pg_column_size(data) < 200000),
  template    jsonb not null check (pg_column_size(template) < 5000),
  version     integer not null default 1,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index resumes_user_updated_idx on public.resumes (user_id, updated_at desc) where deleted_at is null;
create index resumes_user_jd_idx on public.resumes (user_id, jd_hash) where deleted_at is null;

-- Optimistic concurrency: version increments on every update; updated_at is server-controlled.
create or replace function public.bump_resume_version() returns trigger
language plpgsql as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  new.user_id := old.user_id;      -- ownership can never be reassigned
  new.created_at := old.created_at;
  return new;
end $$;

create trigger resumes_bump before update on public.resumes
for each row execute function public.bump_resume_version();

alter table public.resumes enable row level security;

create policy "own resumes: read"   on public.resumes for select using (auth.uid() = user_id and deleted_at is null);
create policy "own resumes: insert" on public.resumes for insert with check (auth.uid() = user_id);
create policy "own resumes: update" on public.resumes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- No delete policy: deletion is a soft delete (update deleted_at) so it can be restored within retention.

-- Per-user AI usage metering (written only by the server with the service role; users may read their own).
create table public.ai_usage (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  prompt_id      text not null,
  prompt_version text not null,
  model          text not null,
  input_tokens   integer not null check (input_tokens >= 0),
  output_tokens  integer not null check (output_tokens >= 0),
  created_at     timestamptz not null default now()
);
create index ai_usage_user_day_idx on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;
create policy "own usage: read" on public.ai_usage for select using (auth.uid() = user_id);
-- no insert/update/delete policies: only the service role (which bypasses RLS) can write.

-- Hard-delete soft-deleted rows after 30 days (run via pg_cron or a scheduled function).
create or replace function public.purge_deleted_resumes() returns void
language sql security definer set search_path = public as $$
  delete from public.resumes where deleted_at < now() - interval '30 days';
$$;
revoke all on function public.purge_deleted_resumes() from public, anon, authenticated;
