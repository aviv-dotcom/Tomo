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
create or replace function pg_temp.at(days int, mins int) returns timestamptz language sql as $$
  select ((current_date + days)::timestamp + make_interval(mins => mins)) at time zone 'Asia/Jerusalem' $$;

-- Setup: appointment 60 min, an add-on of 15 min, a product, a class, open 08:00-20:00 every day
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'b', create_business('Studio', 'studio-a', 'custom');
insert into ctx select 'b2', create_business('Other', 'other-a', 'custom');
select setup_business((select v::uuid from ctx where k = 'b'), '{}', '{}',
  '[{"name":"Facial","delivery":"appointment","billing":"one_time","minutes":60,"priceAgorot":30000},
    {"name":"Mask","delivery":"addon","billing":"one_time","minutes":15,"priceAgorot":5000},
    {"name":"Cream","delivery":"product","billing":"one_time","priceAgorot":8000},
    {"name":"Yoga","delivery":"class","billing":"subscription","minutes":60,"priceAgorot":32000}]');
select setup_business((select v::uuid from ctx where k = 'b2'), '{}', '{}', '[{"name":"Foreign","delivery":"addon","billing":"one_time","minutes":5,"priceAgorot":100}]');
insert into ctx select 'facial', id::text from offerings where name = 'Facial';
insert into ctx select 'mask', id::text from offerings where name = 'Mask';
insert into ctx select 'cream', id::text from offerings where name = 'Cream';
insert into ctx select 'foreign', id::text from offerings where name = 'Foreign';
select set_hours((select v::uuid from ctx where k = 'b'), (select jsonb_agg(jsonb_build_object('weekday', d, 'start', 480, 'end', 1200)) from generate_series(0, 6) d));
select create_class_series((select v::uuid from ctx where k = 'b'), (select id from offerings where name = 'Yoga'), extract(dow from current_date + 3)::int, 1140, 5);
insert into ctx select 'cls', id::text from sessions order by starts_at limit 1;
insert into ctx select 'existing', add_person((select v::uuid from ctx where k = 'b'), 'Existing Client', '052-111-2222')::text;
select save_page((select v::uuid from ctx where k = 'b'), true, 'T', null, null, null);

-- The page lists add-ons and products for booking
select pg_temp.as_anon();
select pg_temp.check(jsonb_array_length(public_page('studio-a') -> 'addons') = 2, 'page lists the add-on and the product');

-- Free times allow for add-on minutes: 08:00-20:00, 60 min = 45 starts; 75 min = 44
select pg_temp.check((select count(*) from public_slots('studio-a', (select v::uuid from ctx where k = 'facial'), current_date + 7)) = 45, '60 minutes: 45 start times');
select pg_temp.check((select count(*) from public_slots('studio-a', (select v::uuid from ctx where k = 'facial'), current_date + 7,
  array[(select v::uuid from ctx where k = 'mask'), (select v::uuid from ctx where k = 'cream')])) = 44, 'with a 15 minute add-on: 44 (a product adds no time)');

-- Wrong add-ons are refused
select pg_temp.expect_error(format($q$select public_slots('studio-a', %L, current_date + 7, array[%L]::uuid[])$q$, (select v from ctx where k = 'facial'), (select v from ctx where k = 'facial')), 'invalid_addons');
select pg_temp.expect_error(format($q$select public_slots('studio-a', %L, current_date + 7, array[%L]::uuid[])$q$, (select v from ctx where k = 'facial'), (select v from ctx where k = 'foreign')), 'invalid_addons');
select pg_temp.expect_error(format($q$select public_book('studio-a', 'Visitor', '0521234567', null, false, %L, pg_temp.at(7, 600), null, array[%L, %L]::uuid[])$q$,
  (select v from ctx where k = 'facial'), (select v from ctx where k = 'mask'), (select v from ctx where k = 'mask')), 'invalid_addons');
select pg_temp.expect_error(format($q$select public_book('studio-a', 'Visitor', '0521234567', null, false, null, null, %L, array[%L]::uuid[])$q$,
  (select v from ctx where k = 'cls'), (select v from ctx where k = 'mask')), 'invalid_addons');

-- A booking from the page with add-ons: longer session, add-ons saved, the owner sees it at once
select public_book('studio-a', 'Visitor Two', '0527777777', null, false, (select v::uuid from ctx where k = 'facial'), pg_temp.at(7, 600), null,
  array[(select v::uuid from ctx where k = 'mask'), (select v::uuid from ctx where k = 'cream')]);
reset role;
insert into ctx select 'bk', b.id::text from bookings b join people p on p.id = b.person_id where p.phone = '0527777777';
select pg_temp.check((select ends_at - starts_at from sessions s join bookings b on b.session_id = s.id where b.id = (select v::uuid from ctx where k = 'bk')) = interval '75 minutes', 'the appointment is 75 minutes long');
select pg_temp.check((select count(*) from booking_addons where booking_id = (select v::uuid from ctx where k = 'bk')) = 2, 'both add-ons saved with the booking');
select pg_temp.check((select count(*) from pending_actions where booking_id = (select v::uuid from ctx where k = 'bk') and kind = 'booking_confirm' and jsonb_array_length(data -> 'addons') = 2) = 1, 'a confirmation with the add-ons is waiting for the owner at once');
select pg_temp.check(automations_run() >= 0 and (select count(*) from pending_actions where booking_id = (select v::uuid from ctx where k = 'bk')) = 1, 'the scheduled run does not add a second one');

-- Same phone, another name: joins the existing client and says so
select pg_temp.as_anon();
select public_book('studio-a', 'Somebody Else', '052-111-2222', null, false, (select v::uuid from ctx where k = 'facial'), pg_temp.at(8, 600));
reset role;
select pg_temp.check((select count(*) from people where business_id = (select v::uuid from ctx where k = 'b') and phone_digits = '0521112222') = 1, 'no duplicate client');
select pg_temp.check((select data ->> 'typed_name' from pending_actions a join bookings b on b.id = a.booking_id where b.person_id = (select v::uuid from ctx where k = 'existing')) = 'Somebody Else', 'the owner sees the name that was typed');

-- Attended: one charge for the service and its add-ons; undo voids it
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select mark_attendance((select v::uuid from ctx where k = 'bk'), 'attended');
select pg_temp.check((select amount_agorot from charges where booking_id = (select v::uuid from ctx where k = 'bk')) = 43000, 'charge = service 300 + mask 50 + cream 80');
select pg_temp.check((select description from charges where booking_id = (select v::uuid from ctx where k = 'bk')) = 'Facial + Cream + Mask', 'charge says what it is for');
select mark_attendance((select v::uuid from ctx where k = 'bk'), 'booked');
select pg_temp.check((select void from charges where booking_id = (select v::uuid from ctx where k = 'bk')), 'undo voids the charge');

-- The owner books with an add-on
insert into ctx select 'own', book_appointment((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'facial'), (select v::uuid from ctx where k = 'existing'),
  pg_temp.at(9, 720), false, array[(select v::uuid from ctx where k = 'mask')])::text;
select pg_temp.check((select count(*) from booking_addons where booking_id = (select v::uuid from ctx where k = 'own')) = 1, 'owner booking keeps its add-on');

-- Moving from the client's link keeps the add-ons and the longer length
select pg_temp.as_anon();
reset role; insert into ctx select 'tok', manage_token::text from bookings where id = (select v::uuid from ctx where k = 'bk'); select pg_temp.as_anon();
insert into ctx select 'tok2', public_move((select v::uuid from ctx where k = 'tok'), pg_temp.at(10, 540))::text;
reset role;
select pg_temp.check((select count(*) from booking_addons a join bookings b on b.id = a.booking_id where b.manage_token = (select v::uuid from ctx where k = 'tok2')) = 2, 'moved booking keeps both add-ons');
select pg_temp.check((select ends_at - starts_at from sessions s join bookings b on b.session_id = s.id where b.manage_token = (select v::uuid from ctx where k = 'tok2')) = interval '75 minutes', 'moved booking keeps its length');

-- Nobody else reads add-ons; internals stay closed
select pg_temp.as_anon();
select pg_temp.check((select count(*) from booking_addons) = 0, 'anonymous visitors see no add-ons');
select pg_temp.expect_error(format($q$select book_appointment(%L, %L, %L, now() + interval '3 days')$q$, (select v from ctx where k = 'b'), (select v from ctx where k = 'facial'), (select v from ctx where k = 'existing')), 'permission denied');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from booking_addons) = 0, 'a stranger sees no add-ons');
select pg_temp.expect_error($q$select cal_addon_minutes(gen_random_uuid(), null)$q$, 'permission denied');

-- Every function a visitor can call is meant for visitors
reset role;
select pg_temp.check((select coalesce(string_agg(p.proname, ', '), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
    and p.proname not in ('public_page', 'public_slots', 'public_book', 'public_waitlist', 'public_booking', 'public_cancel', 'public_alternatives', 'public_move',
                          'public_form', 'public_submit_form', 'public_export', 'public_request_deletion', 'core_health', 'phone_digits_of')) = '',
  'visitors can call only the public functions');
