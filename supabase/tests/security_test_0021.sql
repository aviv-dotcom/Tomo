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

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'b', create_business('Studio', 'studio-f', 'custom');
select save_page((select v::uuid from ctx where k = 'b'), true, 'T', null, null, null);

select pg_temp.as_anon();
select pg_temp.check(public_page('studio-f') ->> 'font_heading' = 'rubik' and public_page('studio-f') ->> 'text_size' = 'm', 'defaults: Rubik, regular size');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select set_page_fonts((select v::uuid from ctx where k = 'b'), 'amatic', 'frank', 'l');
select pg_temp.as_anon();
select pg_temp.check(public_page('studio-f') ->> 'font_heading' = 'amatic' and public_page('studio-f') ->> 'font_body' = 'frank' and public_page('studio-f') ->> 'text_size' = 'l', 'saved and shown on the page');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_error(format($q$select set_page_fonts(%L, 'comic', 'rubik', 'm')$q$, (select v from ctx where k = 'b')), 'font_heading_check');
select pg_temp.expect_error(format($q$select set_page_fonts(%L, 'rubik', 'amatic', 'm')$q$, (select v from ctx where k = 'b')), 'font_body_check');
select pg_temp.expect_error(format($q$select set_page_fonts(%L, 'rubik', 'rubik', 'xl')$q$, (select v from ctx where k = 'b')), 'text_size_check');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.expect_error(format($q$select set_page_fonts(%L, 'rubik', 'rubik', 'm')$q$, (select v from ctx where k = 'b')), 'not_owner');
select pg_temp.as_anon();
select pg_temp.expect_error(format($q$select set_page_fonts(%L, 'rubik', 'rubik', 'm')$q$, (select v from ctx where k = 'b')), 'permission denied');
