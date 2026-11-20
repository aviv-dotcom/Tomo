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

-- Setup: A's studio with an appointment and a class, open hours every day, one class session with 2 places
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'b', create_business('Studio', 'studio-p', 'custom');
select setup_business((select v::uuid from ctx where k = 'b'), '{}', '{}',
  '[{"name":"Facial","delivery":"appointment","billing":"one_time","minutes":60,"priceAgorot":30000},
    {"name":"Yoga","delivery":"class","billing":"subscription","minutes":60,"priceAgorot":32000},
    {"name":"Mask","delivery":"addon","billing":"one_time","minutes":15,"priceAgorot":5000}]');
insert into ctx select 'facial', id::text from offerings where name = 'Facial';
insert into ctx select 'yoga', id::text from offerings where name = 'Yoga';
select set_hours((select v::uuid from ctx where k = 'b'), (select jsonb_agg(jsonb_build_object('weekday', d, 'start', 480, 'end', 1200)) from generate_series(0, 6) d));
insert into ctx select 'day', (current_date + 7)::text;
select create_class_series((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'yoga'), extract(dow from current_date + 3)::int, 1140, 2);
insert into ctx select 'cls', id::text from sessions order by starts_at limit 1;
insert into ctx select 'existing', add_person((select v::uuid from ctx where k = 'b'), 'Existing Client', '052-111-2222')::text;

-- Unpublished: nothing is public
select pg_temp.as_anon();
select pg_temp.check(public_page('studio-p') is null, 'unpublished page is not public');
select pg_temp.expect_error($q$select public_book('studio-p', 'Visitor', '0521234567')$q$, 'not_found');

-- Only the owner publishes
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.expect_error(format($q$select save_page(%L, true, 'x', null, null, null)$q$, (select v from ctx where k = 'b')), 'not_owner');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_error(format($q$select save_page(%L, true, 'x', null, 'not a phone', null)$q$, (select v from ctx where k = 'b')), 'whatsapp_check');
select save_page((select v::uuid from ctx where k = 'b'), true, 'Small groups, personal attention', 'About us', '052-999-8888', 'Tel Aviv');

-- Published page: offerings (no add-ons), classes with places left, and no names
select pg_temp.as_anon();
select pg_temp.check(public_page('Studio-P') ->> 'tagline' = 'Small groups, personal attention', 'published page is public (address is case insensitive)');
select pg_temp.check(jsonb_array_length(public_page('studio-p') -> 'offerings') = 2, 'add-ons are not listed on the page');
select pg_temp.check((public_page('studio-p') -> 'classes' -> 0 ->> 'left')::int = 2, 'class shows places left');
select pg_temp.check(position('Existing Client' in public_page('studio-p')::text) = 0, 'no client names on the page');
select pg_temp.check((select count(*) from public_slots('studio-p', (select v::uuid from ctx where k = 'facial'), (select v::date from ctx where k = 'day'))) = 45, '45 public slots between 8:00 and 20:00');
select pg_temp.expect_error(format($q$select * from public_slots('studio-p', %L, current_date + 90)$q$, (select v from ctx where k = 'facial')), 'invalid_date');
select pg_temp.check((select count(*) from people) = 0, 'anon reads no people rows');
select pg_temp.check((select count(*) from business_pages) = 0, 'anon reads no page rows');
select pg_temp.check((select count(*) from bookings) = 0, 'anon reads no bookings');
select pg_temp.expect_error(format($q$select * from free_slots(%L, %L, current_date + 7)$q$, (select v from ctx where k = 'b'), (select v from ctx where k = 'facial')), 'permission denied');

-- Booking an appointment as a visitor
select pg_temp.expect_error($q$select public_book('studio-p', 'Visitor', '12')$q$, 'invalid_phone');
select pg_temp.expect_error($q$select public_book('studio-p', 'V', '0521234567')$q$, 'invalid_name');
reset role;
create function pg_temp.at(m int) returns timestamptz language sql as $$ select ((current_date + 7) + make_interval(mins => m)) at time zone 'Asia/Jerusalem' $$;
grant execute on function pg_temp.at(int) to anon;
select pg_temp.as_anon();
select pg_temp.expect_error(format($q$select public_book('studio-p', 'Visitor', '0521234567', null, false, %L, pg_temp.at(1300))$q$, (select v from ctx where k = 'facial')), 'outside_hours');
select pg_temp.expect_error(format($q$select public_book('studio-p', 'Visitor', '0521234567', null, false, %L, pg_temp.at(607))$q$, (select v from ctx where k = 'facial')), 'outside_hours');
select pg_temp.check((public_book('studio-p', 'New Visitor', '+972-52-123-4567', 'V@X.com', true, (select v::uuid from ctx where k = 'facial'), pg_temp.at(600)) ->> 'offering') = 'Facial', 'visitor books an appointment');
select pg_temp.expect_error(format($q$select public_book('studio-p', 'Other Visitor', '0531112222', null, false, %L, pg_temp.at(630))$q$, (select v from ctx where k = 'facial')), 'slot_taken');
select pg_temp.expect_error(format($q$select public_book('studio-p', 'Other Visitor', '0531112222', null, false, %L, pg_temp.at(600))$q$, (select v from ctx where k = 'yoga')), 'not_appointment');

-- Booking a class: the existing client is matched by phone, the class fills up
select pg_temp.check(public_book('studio-p', 'Someone Else', '0521112222', null, false, null, null, (select v::uuid from ctx where k = 'cls')) is not null, 'existing client books a class');
select pg_temp.expect_error(format($q$select public_book('studio-p', 'Existing Client', '052-111-2222', null, false, null, null, %L)$q$, (select v from ctx where k = 'cls')), 'already_booked');
select public_book('studio-p', 'Third Visitor', '0549998877', null, false, null, null, (select v::uuid from ctx where k = 'cls'));
select pg_temp.expect_error(format($q$select public_book('studio-p', 'Fourth Visitor', '0549998866', null, false, null, null, %L)$q$, (select v from ctx where k = 'cls')), 'full');

-- What the owner sees afterwards
reset role;
select pg_temp.check((select count(*) from people where source = 'page' and status = 'lead') = 2, 'new visitors became leads (one per phone)');
select pg_temp.check((select full_name from people where phone_digits = '0521112222') = 'Existing Client', 'existing client name kept');
select pg_temp.check((select marketing_consent and email = 'v@x.com' from people where phone_digits = '0521234567'), 'consent and email saved, +972 number normalised');
select pg_temp.check((select count(*) from jobs where kind = 'notify.new_booking') = 3, 'a notification job per booking');

-- Per-phone limit: 3 upcoming bookings
select pg_temp.as_anon();
select public_book('studio-p', 'New Visitor', '0521234567', null, false, (select v::uuid from ctx where k = 'facial'), pg_temp.at(720));
select public_book('studio-p', 'New Visitor', '0521234567', null, false, (select v::uuid from ctx where k = 'facial'), pg_temp.at(840));
select pg_temp.expect_error(format($q$select public_book('studio-p', 'New Visitor', '0521234567', null, false, %L, pg_temp.at(960))$q$, (select v from ctx where k = 'facial')), 'too_many_bookings');

-- Unpublishing closes it again
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select save_page((select v::uuid from ctx where k = 'b'), false, null, null, null, null);
select pg_temp.as_anon();
select pg_temp.check(public_page('studio-p') is null, 'unpublished again');
