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

-- Setup: A's studio with an appointment and a class, hours every day, clients
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'b', create_business('Studio', 'studio-x', 'custom');
select setup_business((select v::uuid from ctx where k = 'b'), '{}', '{}',
  '[{"name":"Facial","delivery":"appointment","billing":"one_time","minutes":60,"priceAgorot":30000},
    {"name":"Yoga","delivery":"class","billing":"subscription","minutes":60,"priceAgorot":32000}]');
insert into ctx select 'facial', id::text from offerings where name = 'Facial';
insert into ctx select 'yoga', id::text from offerings where name = 'Yoga';
select set_hours((select v::uuid from ctx where k = 'b'), (select jsonb_agg(jsonb_build_object('weekday', d, 'start', 480, 'end', 1200)) from generate_series(0, 6) d));
insert into ctx select 'noa', add_person((select v::uuid from ctx where k = 'b'), 'Noa Sagi', '0521234567')::text;
insert into ctx select 'dana', add_person((select v::uuid from ctx where k = 'b'), 'Dana Cohen', '0527654321')::text;
insert into ctx select 'ron', add_person((select v::uuid from ctx where k = 'b'), 'Ron Levi', '0531112222')::text;
select create_class_series((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'yoga'), extract(dow from current_date + 3)::int, 1140, 2);
insert into ctx select 'cls', id::text from sessions order by starts_at limit 1;
insert into ctx select 'cls2', id::text from sessions order by starts_at offset 1 limit 1;

insert into ctx select 'appt', book_appointment((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'facial'), (select v::uuid from ctx where k = 'noa'), cal_at((select v::uuid from ctx where k = 'b'), current_date + 5, 600))::text;
select record_payment((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'noa'), 10000, 'cash');
select save_form((select v::uuid from ctx where k = 'b'), true, '["Allergies?"]');
reset role;
insert into ctx select 'tok', manage_token::text from bookings where id = (select v::uuid from ctx where k = 'appt');
select pg_temp.as_anon();
select public_submit_form((select v::uuid from ctx where k = 'tok'), '[true]', 'Nuts', 'Noa Sagi', true);

-- A copy of the data, for the client (by link) and for the owner
select pg_temp.check(public_export((select v::uuid from ctx where k = 'tok')) -> 'person' ->> 'phone' = '0521234567', 'client downloads their data');
select pg_temp.check(jsonb_array_length(public_export((select v::uuid from ctx where k = 'tok')) -> 'health_forms') = 1, 'copy includes the health form');
select pg_temp.check(position('Dana' in public_export((select v::uuid from ctx where k = 'tok'))::text) = 0, 'copy has only their data');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check(person_export((select v::uuid from ctx where k = 'noa')) -> 'person' ->> 'name' = 'Noa Sagi', 'owner exports a client');

-- The client asks to be forgotten; the owner confirms
select pg_temp.as_anon();
select public_request_deletion((select v::uuid from ctx where k = 'tok'));
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check(exists (select 1 from jsonb_array_elements(list_actions((select v::uuid from ctx where k = 'b'))) a where a ->> 'kind' = 'deletion_request'), 'request waits in the inbox');
reset role;
insert into memberships values ((select v::uuid from ctx where k = 'b'), 'cccccccc-0000-0000-0000-000000000003', 'manager');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.expect_error(format($q$select forget_person(%L)$q$, (select v from ctx where k = 'noa')), 'not_owner');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select forget_person((select v::uuid from ctx where k = 'noa'));
reset role;
select pg_temp.check((select phone is null and email is null and forgotten_at is not null and full_name <> 'Noa Sagi' from people where id = (select v::uuid from ctx where k = 'noa')), 'personal details removed');
select pg_temp.check((select count(*) from form_responses) = 0, 'health form deleted');
select pg_temp.check((select count(*) from pending_actions where person_id = (select v::uuid from ctx where k = 'noa')) = 0, 'messages deleted');
select pg_temp.check((select count(*) from payments) = 1, 'payment kept as an anonymous record');
select pg_temp.check((select status from bookings where id = (select v::uuid from ctx where k = 'appt')) = 'cancelled', 'future booking cancelled');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.expect_error(format($q$select person_export(%L)$q$, (select v from ctx where k = 'dana')), 'not_allowed');
select pg_temp.as_anon();
select pg_temp.expect_error($q$select public_export(gen_random_uuid())$q$, 'not_found');
