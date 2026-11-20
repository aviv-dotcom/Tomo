-- Run after stub_supabase.sql + all migrations. Tests 0001: businesses, memberships, audit log, jobs.
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', false); execute 'set role anon'; end $$;
create temp table ctx (k text primary key, v text); grant all on ctx to authenticated, anon;
create or replace function pg_temp.expect_error(sql text, expected text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'EXPECTED FAILURE (%) but succeeded: %', expected, sql;
exception when others then
  if sqlerrm like 'EXPECTED FAILURE%' then raise; end if;
  if expected <> '' and position(expected in sqlerrm) = 0 then raise exception 'wrong error for %: % (wanted %)', sql, sqlerrm, expected; end if;
  raise notice 'ok, refused: % -> %', left(sql, 70), sqlerrm;
end $$;
create or replace function pg_temp.check(cond boolean, what text) returns void language plpgsql as $$
begin if not cond then raise exception 'CHECK FAILED: %', what; end if; raise notice 'ok: %', what; end $$;

-- Anonymous visitors: health only
select pg_temp.as_anon();
select pg_temp.check((core_health() ->> 'db') = 'ok', 'anyone can call core_health');
select pg_temp.expect_error($q$select create_business('Liron Beauty', 'liron-beauty', 'beauty')$q$, 'permission denied');
select pg_temp.check((select count(*) from businesses) = 0, 'anon sees no businesses');

-- A creates a business and becomes its owner
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_error($q$select create_business('Liron', 'ab', 'beauty')$q$, 'invalid_slug');
select pg_temp.expect_error($q$select create_business('Liron', 'Bad Slug!', 'beauty')$q$, 'invalid_slug');
select pg_temp.expect_error($q$select create_business('Liron', 'admin', 'beauty')$q$, 'invalid_slug');
select pg_temp.expect_error($q$select create_business('L', 'liron-beauty', 'beauty')$q$, 'invalid_name');
insert into ctx select 'b1', create_business('Liron Beauty', 'Liron-Beauty', 'beauty');
select pg_temp.check((select slug from businesses) = 'liron-beauty', 'slug stored in lower case');
select pg_temp.check(core_role((select v::uuid from ctx where k = 'b1')) = 'owner', 'creator is owner');
select pg_temp.check((select count(*) from my_businesses()) = 1, 'owner lists the business');
select pg_temp.check((select count(*) from audit_log where action = 'business.create') = 1, 'owner sees the creation in the audit log');
select pg_temp.check(core_today((select v::uuid from ctx where k = 'b1')) is not null, 'core_today works');

-- No direct writes, even for the owner
select pg_temp.expect_error($q$insert into businesses (name, slug, created_by) values ('X', 'xxx', 'aaaaaaaa-0000-0000-0000-000000000001')$q$, 'permission denied');
select pg_temp.expect_error(format($q$update businesses set plan = 'pro' where id = %L$q$, (select v from ctx where k = 'b1')), 'permission denied');
select pg_temp.expect_error(format($q$insert into memberships values (%L, 'cccccccc-0000-0000-0000-000000000003', 'manager')$q$, (select v from ctx where k = 'b1')), 'permission denied');
select pg_temp.expect_error($q$delete from audit_log$q$, 'permission denied');
select pg_temp.expect_error($q$update audit_log set action = 'x'$q$, 'permission denied');

-- Internal and worker functions are closed to users
select pg_temp.expect_error($q$select core_enqueue('system.ping', '{}')$q$, 'permission denied');
select pg_temp.expect_error(format($q$select core_audit(%L, 'fake', null)$q$, (select v from ctx where k = 'b1')), 'permission denied');
select pg_temp.expect_error($q$select * from claim_jobs(5)$q$, 'permission denied');
select pg_temp.expect_error($q$select finish_job(1, null)$q$, 'permission denied');
select pg_temp.expect_error($q$select count(*) from jobs$q$, 'permission denied');

-- B is a stranger: sees nothing, cannot take the slug
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from businesses) = 0, 'stranger cannot read the business');
select pg_temp.check((select count(*) from memberships) = 0, 'stranger cannot read memberships');
select pg_temp.check((select count(*) from audit_log) = 0, 'stranger cannot read the audit log');
select pg_temp.check(core_role((select v::uuid from ctx where k = 'b1')) is null, 'stranger has no role');
select pg_temp.expect_error($q$select create_business('Copy', 'liron-beauty', 'beauty')$q$, 'slug_taken');

-- B as a client of A's business (added by the server) sees the business but not other members or the audit log
reset role;
insert into memberships values ((select v::uuid from ctx where k = 'b1'), 'bbbbbbbb-0000-0000-0000-000000000002', 'client');
insert into memberships values ((select v::uuid from ctx where k = 'b1'), 'cccccccc-0000-0000-0000-000000000003', 'client');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from businesses) = 1, 'client sees the business');
select pg_temp.check((select count(*) from memberships) = 1, 'client sees only their own membership');
select pg_temp.check((select count(*) from audit_log) = 0, 'client cannot read the audit log');

-- Owner limit
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select create_business('Biz ' || i, 'biz-' || i, 'custom') from generate_series(1, 5) i;
select pg_temp.expect_error($q$select create_business('Biz 6', 'biz-6', 'custom')$q$, 'too_many_businesses');

-- Jobs (as the server): dedupe, claim, retry with backoff, give up after 5
reset role;
select core_enqueue('system.ping', '{"n":1}', now(), 'ping:1');
select core_enqueue('system.ping', '{"n":2}', now(), 'ping:1');
select pg_temp.check((select count(*) from jobs) = 1, 'same dedupe key queues once');
select core_enqueue('system.ping', '{}', now() + interval '1 hour', 'ping:later');
insert into ctx select 'j', id::text from claim_jobs(10);
select pg_temp.check((select count(*) from ctx where k = 'j') = 1, 'only due jobs are claimed');
select pg_temp.check((select count(*) from claim_jobs(10)) = 0, 'a claimed job is not claimed again');
select finish_job((select v::bigint from ctx where k = 'j'), 'boom');
select pg_temp.check((select status = 'queued' and run_at > now() and last_error = 'boom' from jobs where dedupe_key = 'ping:1'), 'failed job is retried later');
update jobs set attempts = 5, status = 'running' where dedupe_key = 'ping:1';
select finish_job((select v::bigint from ctx where k = 'j'), 'boom again');
select pg_temp.check((select status = 'failed' from jobs where dedupe_key = 'ping:1'), 'job fails for good after 5 attempts');
update jobs set status = 'running', locked_at = now() - interval '20 minutes' where dedupe_key = 'ping:later';
select pg_temp.check(release_stuck_jobs() = 1, 'stuck jobs are released');
