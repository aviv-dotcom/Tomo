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

-- Booking: Noa and Dana in the class, Ron waiting; Noa has an appointment on day 5
select book_class((select v::uuid from ctx where k = 'cls'), (select v::uuid from ctx where k = 'noa'));
select book_class((select v::uuid from ctx where k = 'cls'), (select v::uuid from ctx where k = 'dana'));
select book_class((select v::uuid from ctx where k = 'cls'), (select v::uuid from ctx where k = 'ron'));
insert into ctx select 'appt', book_appointment((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'facial'), (select v::uuid from ctx where k = 'noa'), cal_at((select v::uuid from ctx where k = 'b'), current_date + 5, 600))::text;

-- The business cancels the class: everyone cancelled, one message each
select pg_temp.check(cancel_session((select v::uuid from ctx where k = 'cls'), 'Teacher is sick') = 3, 'three bookings cancelled');
select pg_temp.check((select count(*) from bookings where session_id = (select v::uuid from ctx where k = 'cls') and status = 'cancelled' and cancelled_by = 'business') = 3, 'marked as cancelled by the business');
select pg_temp.check((select count(*) from pending_actions where kind = 'session_cancelled') = 3, 'a message prepared for each person');
select pg_temp.check((select data ->> 'reason' from pending_actions where kind = 'session_cancelled' limit 1) = 'Teacher is sick', 'reason included');
select pg_temp.expect_error(format($q$select cancel_session(%L)$q$, (select v from ctx where k = 'cls')), 'session_closed');
reset role;
select pg_temp.check(core_extend_recurrences() = 0, 'a cancelled class is not recreated');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');

-- Days off: conflicts are listed, the slot is blocked
insert into ctx select 'off', add_time_off((select v::uuid from ctx where k = 'b'), cal_at((select v::uuid from ctx where k = 'b'), current_date + 5, 0), cal_at((select v::uuid from ctx where k = 'b'), current_date + 6, 0), 'Vacation')::text;
select pg_temp.check(jsonb_array_length(time_off_conflicts((select v::uuid from ctx where k = 'off'))) = 1, 'the appointment inside the day off is listed');
select pg_temp.check((list_time_off((select v::uuid from ctx where k = 'b')) -> 0 ->> 'conflicts')::int = 1, 'list shows the conflict count');
select pg_temp.check((select count(*) from free_slots((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'facial'), current_date + 5)) = 0, 'no free slots on the day off');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.expect_error(format($q$select delete_time_off(%L)$q$, (select v from ctx where k = 'off')), 'not_owner');
select pg_temp.expect_error(format($q$select cancel_session(%L)$q$, (select v from ctx where k = 'cls2')), 'not_allowed');
select pg_temp.expect_error(format($q$select time_off_conflicts(%L)$q$, (select v from ctx where k = 'off')), 'not_allowed');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select delete_time_off((select v::uuid from ctx where k = 'off'));
select pg_temp.check(jsonb_array_length(list_time_off((select v::uuid from ctx where k = 'b'))) = 0, 'day off removed');
