-- Attacks the security rules as different people. Any FAIL stops the run with an error.
create schema t;
grant usage on schema t to anon, authenticated;
create function t.ok(c boolean, msg text) returns void language plpgsql as $$
begin
  if c is not true then raise exception 'FAIL: %', msg; end if;
  raise notice 'PASS: %', msg;
end $$;
grant execute on function t.ok(boolean, text) to anon, authenticated;

-- as the admin: two users, and B already has data
insert into auth.users(id, email) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.com'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@example.com');
insert into public.user_data(user_id, data) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '{"owner":"B"}');
insert into public.resumes(user_id, title, data, template) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B resume', '{}', '{}');
insert into public.ai_usage(user_id, prompt_id, prompt_version, model, input_tokens, output_tokens) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'p', 'v2', 'm', 1, 1);

select t.ok((select relrowsecurity from pg_class where oid = 'public.user_data'::regclass), 'RLS is switched on for user_data');
select t.ok((select relrowsecurity from pg_class where oid = 'public.resumes'::regclass), 'RLS is switched on for resumes');
select t.ok((select relrowsecurity from pg_class where oid = 'public.ai_usage'::regclass), 'RLS is switched on for ai_usage');

-- ============ someone not signed in (the anon key alone) ============
set role anon;
select set_config('request.jwt.claims', '', false);
select t.ok((select count(*) from public.user_data) = 0, 'ANON: reads no user_data');
select t.ok((select count(*) from public.resumes) = 0, 'ANON: reads no resumes');
select t.ok((select count(*) from public.ai_usage) = 0, 'ANON: reads no usage rows');
do $$ declare n int; begin
  begin
    insert into public.user_data(user_id, data) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{}');
    perform t.ok(false, 'ANON: insert into user_data must be refused');
  exception when sqlstate '42501' then perform t.ok(true, 'ANON: cannot insert user_data'); end;
  begin
    insert into public.resumes(user_id, title, data, template) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'x', '{}', '{}');
    perform t.ok(false, 'ANON: insert into resumes must be refused');
  exception when sqlstate '42501' then perform t.ok(true, 'ANON: cannot insert resumes'); end;
  update public.user_data set data = '{"hacked":1}'; get diagnostics n = row_count;
  perform t.ok(n = 0, 'ANON: cannot update any user_data');
  delete from public.user_data; get diagnostics n = row_count;
  perform t.ok(n = 0, 'ANON: cannot delete any user_data');
end $$;
reset role;

-- ============ user A ============
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}', false);
select t.ok((select count(*) from public.user_data) = 0, 'A: cannot see Bs user_data');
select t.ok((select count(*) from public.resumes) = 0, 'A: cannot see Bs resumes');
select t.ok((select count(*) from public.ai_usage) = 0, 'A: cannot see Bs usage');

do $$ declare n int; v int; owner uuid; begin
  insert into public.user_data(user_id, data) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"owner":"A"}');
  perform t.ok((select count(*) from public.user_data) = 1, 'A: can create and read own user_data');
  begin
    insert into public.user_data(user_id, data) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '{}');
    perform t.ok(false, 'A: insert for B must be refused');
  exception when sqlstate '42501' then perform t.ok(true, 'A: cannot create data for B'); end;
  update public.user_data set data = '{"hacked":1}' where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; get diagnostics n = row_count;
  perform t.ok(n = 0, 'A: cannot update Bs user_data');
  delete from public.user_data where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; get diagnostics n = row_count;
  perform t.ok(n = 0, 'A: cannot delete Bs user_data');
  -- trying to take over: reassign the owner and force the version while updating A's own row
  update public.user_data set data = '{"v":2}', user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', version = 99;
  select version, user_id into v, owner from public.user_data;
  perform t.ok(owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A: ownership cannot be reassigned (the trigger puts it back)');
  perform t.ok(v = 2, 'A: the version is controlled by the server, not the client (99 became 2)');
  -- compare-and-swap, the basis of our conflict detection: a stale version updates nothing
  update public.user_data set data = '{"stale":1}' where version = 1; get diagnostics n = row_count;
  perform t.ok(n = 0, 'A: an update from a stale version changes nothing (conflict detected)');
  update public.user_data set data = '{"fresh":1}' where version = 2; get diagnostics n = row_count;
  perform t.ok(n = 1, 'A: an update from the current version succeeds');
  -- size limits
  begin
    insert into public.resumes(user_id, title, data, template) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'big', jsonb_build_object('x', repeat('x', 250000)), '{}');
    perform t.ok(false, 'A: an oversized resume must be refused');
  exception when sqlstate '23514' then perform t.ok(true, 'A: oversized resume data is refused by the database'); end;
  begin
    update public.user_data set data = jsonb_build_object('x', repeat('x', 1600000));
    perform t.ok(false, 'A: oversized sync data must be refused');
  exception when sqlstate '23514' then perform t.ok(true, 'A: oversized sync data is refused by the database'); end;
  -- resumes: own rows only, soft delete only, no hard delete
  insert into public.resumes(user_id, title, data, template) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A resume', '{}', '{}');
  perform t.ok((select count(*) from public.resumes) = 1, 'A: sees only own resumes');
  delete from public.resumes; get diagnostics n = row_count;
  perform t.ok(n = 0, 'A: cannot hard-delete resumes (soft delete only)');
  update public.resumes set deleted_at = now(); get diagnostics n = row_count;
  perform t.ok(n = 1 and (select count(*) from public.resumes) = 0, 'A: soft-deleted resumes disappear from reads');
  -- usage metering is server-only
  begin
    insert into public.ai_usage(user_id, prompt_id, prompt_version, model, input_tokens, output_tokens) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'p', 'v', 'm', 1, 1);
    perform t.ok(false, 'A: a usage insert must be refused');
  exception when sqlstate '42501' then perform t.ok(true, 'A: users cannot write usage rows (server only)'); end;
  -- the purge job is not callable by users
  begin
    perform public.purge_deleted_resumes();
    perform t.ok(false, 'A: the purge function must be refused');
  exception when sqlstate '42501' then perform t.ok(true, 'A: users cannot run the purge function'); end;
end $$;
reset role;

-- ============ user B ============
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', false);
select t.ok((select count(*) from public.user_data) = 1 and (select data ->> 'owner' from public.user_data) = 'B', 'B: sees only own user_data, untouched by A');
select t.ok((select count(*) from public.resumes where title = 'A resume') = 0, 'B: cannot see As resumes');
select t.ok((select count(*) from public.ai_usage) = 1, 'B: can read own usage rows');
do $$ declare n int; begin
  delete from public.user_data; get diagnostics n = row_count;
  perform t.ok(n = 1, 'B: can delete own saved data (right to erasure)');
end $$;
reset role;

-- ============ the admin checks the end state ============
select t.ok((select count(*) from public.user_data) = 1, 'END: As row survives Bs delete');
select t.ok((select data ->> 'fresh' from public.user_data where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = '1', 'END: As data is exactly what A last wrote (nothing B or an attacker did changed it)');
