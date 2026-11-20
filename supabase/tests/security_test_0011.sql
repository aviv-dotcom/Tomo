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
reset role;
insert into ctx select 'tok', manage_token::text from bookings where id = (select v::uuid from ctx where k = 'appt');
insert into memberships values ((select v::uuid from ctx where k = 'b'), 'cccccccc-0000-0000-0000-000000000003', 'staff');

select pg_temp.as_anon();
select pg_temp.check((public_form((select v::uuid from ctx where k = 'tok')) ->> 'enabled')::boolean = false, 'no form until the owner turns it on');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_error(format($q$select save_form(%L, true, '[]')$q$, (select v from ctx where k = 'b')), 'invalid_questions');
select pg_temp.expect_error(format($q$select save_form(%L, true, '[1, 2]')$q$, (select v from ctx where k = 'b')), 'invalid_questions');
select save_form((select v::uuid from ctx where k = 'b'), true, '["Allergies or sensitivities?", "Pregnant or nursing?", "Taking skin medication?"]');

select pg_temp.as_anon();
select pg_temp.check(jsonb_array_length(public_form((select v::uuid from ctx where k = 'tok')) -> 'questions') = 3, 'client sees the questions');
select pg_temp.expect_error(format($q$select public_submit_form(%L, '[true, false, false]', null, 'Noa Sagi', false)$q$, (select v from ctx where k = 'tok')), 'confirm_required');
select pg_temp.expect_error(format($q$select public_submit_form(%L, '[true, false]', null, 'Noa Sagi', true)$q$, (select v from ctx where k = 'tok')), 'invalid_answers');
select pg_temp.expect_error(format($q$select public_submit_form(%L, '["yes", false, false]', null, 'Noa Sagi', true)$q$, (select v from ctx where k = 'tok')), 'invalid_answers');
select public_submit_form((select v::uuid from ctx where k = 'tok'), '[true, false, false]', 'Glycolic acid', 'Noa Sagi', true);
select pg_temp.check((public_form((select v::uuid from ctx where k = 'tok')) ->> 'signed')::boolean, 'marked as signed');
select pg_temp.check((select count(*) from form_responses) = 0, 'anon cannot read answers');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check(person_form((select v::uuid from ctx where k = 'noa')) ->> 'details' = 'Glycolic acid', 'owner reads the latest form');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from form_responses) = 0, 'staff (instructor) cannot read health answers');
select pg_temp.expect_error(format($q$select person_form(%L)$q$, (select v from ctx where k = 'noa')), 'not_allowed');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.expect_error(format($q$select save_form(%L, false, '[]')$q$, (select v from ctx where k = 'b')), 'not_owner');
