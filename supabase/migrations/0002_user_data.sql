-- TomCredora: one synced document per user (profile + every resume + a record of deleted resumes).
-- Same security model as 0001: RLS on, a user can only touch their own row; the API checks ownership too.

create table public.user_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null check (pg_column_size(data) < 1500000),
  version    integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Optimistic concurrency: the version goes up on every update; timestamps and ownership are server-controlled.
create or replace function public.bump_user_data_version() returns trigger
language plpgsql as $$
begin
  new.version    := old.version + 1;
  new.updated_at := now();
  new.user_id    := old.user_id;
  new.created_at := old.created_at;
  return new;
end $$;

create trigger user_data_bump before update on public.user_data
for each row execute function public.bump_user_data_version();

alter table public.user_data enable row level security;

create policy "own data: read"   on public.user_data for select using (auth.uid() = user_id);
create policy "own data: insert" on public.user_data for insert with check (auth.uid() = user_id);
create policy "own data: update" on public.user_data for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Unlike resumes, the user can delete their own row for real: this is the "delete my cloud data" button (privacy).
create policy "own data: delete" on public.user_data for delete using (auth.uid() = user_id);
