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

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'b', create_business('Studio', 'studio-x', 'custom');
select setup_business((select v::uuid from ctx where k = 'b'), '{}', '{}',
  '[{"name":"Yoga","delivery":"class","billing":"subscription","minutes":60,"priceAgorot":32000},
    {"name":"Card 3","delivery":"class","billing":"pack","priceAgorot":30000,"minutes":60},
    {"name":"Monthly","delivery":"class","billing":"subscription","priceAgorot":40000,"minutes":60},
    {"name":"Facial","delivery":"appointment","billing":"one_time","minutes":60,"priceAgorot":25000},
    {"name":"Cream","delivery":"product","billing":"one_time","priceAgorot":8000}]');
insert into ctx select 'yoga', id::text from offerings where name = 'Yoga';
insert into ctx select 'card', id::text from offerings where name = 'Card 3';
insert into ctx select 'monthly', id::text from offerings where name = 'Monthly';
insert into ctx select 'facial', id::text from offerings where name = 'Facial';
insert into ctx select 'cream', id::text from offerings where name = 'Cream';
select set_hours((select v::uuid from ctx where k = 'b'), (select jsonb_agg(jsonb_build_object('weekday', d, 'start', 480, 'end', 1200)) from generate_series(0, 6) d));
select save_page((select v::uuid from ctx where k = 'b'), true, 'T', null, null, null);
insert into ctx select 'noa', add_person((select v::uuid from ctx where k = 'b'), 'Noa Sagi', '0521000001')::text;

-- ── Punch card: 3 entries; each attended class uses one; undo gives it back; a message when 1 is left ──
select pg_temp.expect_error(format($q$select sell_pass(%L, %L)$q$, (select v from ctx where k = 'noa'), (select v from ctx where k = 'card')), 'entries_required');
select set_offering_pass((select v::uuid from ctx where k = 'card'), 3, 90);
insert into ctx select 'pass', sell_pass((select v::uuid from ctx where k = 'noa'), (select v::uuid from ctx where k = 'card'))::text;
select pg_temp.check((select amount_agorot from charges where id = (select charge_id from passes where id = (select v::uuid from ctx where k = 'pass'))) = 30000, 'selling the card charges its price');
select pg_temp.check((select expires_on - starts_on from passes where id = (select v::uuid from ctx where k = 'pass')) = 90, 'valid for 90 days');
reset role;
-- three class sessions (a card counts from the day it is sold)
insert into sessions (business_id, offering_id, starts_at, ends_at, capacity)
select (select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'yoga'), now() + make_interval(hours => h), now() + make_interval(hours => h) + interval '1 hour', 10
from unnest(array[50, 30, 10]) h;
insert into bookings (business_id, session_id, person_id)
select (select v::uuid from ctx where k = 'b'), id, (select v::uuid from ctx where k = 'noa') from sessions where offering_id = (select v::uuid from ctx where k = 'yoga');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select mark_attendance(id, 'attended') from bookings where person_id = (select v::uuid from ctx where k = 'noa') order by created_at limit 2;
select pg_temp.check((person_passes((select v::uuid from ctx where k = 'noa')) -> 0 ->> 'left')::int = 1, 'two visits used two entries');
select pg_temp.check((select count(*) from pending_actions where kind = 'pass_ending') = 1, 'one left: a renewal message is ready');
select mark_attendance((select id from bookings b where person_id = (select v::uuid from ctx where k = 'noa') order by created_at limit 1), 'booked');
select pg_temp.check((person_passes((select v::uuid from ctx where k = 'noa')) -> 0 ->> 'left')::int = 2, 'undo gives the entry back');
select pg_temp.check((select count(*) from charges where booking_id is not null and not void) = 0, 'a class on a card is not charged again');
select pg_temp.check((select jsonb_array_length(person_passes((select v::uuid from ctx where k = 'noa')))) = 1, 'the card shows on the client');

-- ── Weekly appointment: 4 weeks, one week taken is skipped; ending it cancels the future ones ──
insert into ctx select 'dana', add_person((select v::uuid from ctx where k = 'b'), 'Dana', '0521000002')::text;
select book_appointment((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'facial'), (select v::uuid from ctx where k = 'dana'), pg_temp.at(16, 600));
insert into ctx select 'series', (book_appointment_series((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'facial'),
  (select v::uuid from ctx where k = 'noa'), pg_temp.at(2, 600), 4)) ->> 'series';
select pg_temp.check((select count(*) from bookings where series_id::text = (select v from ctx where k = 'series')) = 3, 'three weeks booked, the taken one skipped');
select pg_temp.expect_error(format($q$select book_appointment_series(%L, %L, %L, pg_temp.at(2, 600), 40)$q$, (select v from ctx where k = 'b'), (select v from ctx where k = 'facial'), (select v from ctx where k = 'noa')), 'invalid_weeks');
select pg_temp.check(cancel_appointment_series((select v::uuid from ctx where k = 'series')) = 3, 'ending the weekly appointment cancels all three');

-- ── Notes: owner writes; visible on the card; erased on forget ──
select set_person_notes((select v::uuid from ctx where k = 'dana'), 'Prefers mornings');
select pg_temp.check(person_card((select v::uuid from ctx where k = 'dana')) ->> 'notes' = 'Prefers mornings', 'note on the card');

-- ── Team: invite, accept with the right email only, list, remove ──
insert into ctx select 'inv', invite_member((select v::uuid from ctx where k = 'b'), 'Parent@Example.com')::text;
select pg_temp.as_anon();
select pg_temp.check(invite_info((select v::uuid from ctx where k = 'inv')) ->> 'business' = 'Studio', 'the join page shows the business name');
select pg_temp.expect_error(format($q$select accept_invite(%L)$q$, (select v from ctx where k = 'inv')), 'permission denied');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.expect_error(format($q$select accept_invite(%L)$q$, (select v from ctx where k = 'inv')), 'invite_other_email');
select pg_temp.expect_error(format($q$select list_team(%L)$q$, (select v from ctx where k = 'b')), 'not_allowed');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check(accept_invite((select v::uuid from ctx where k = 'inv')) = 'studio-x', 'the invited person joins');
select pg_temp.check(core_role((select v::uuid from ctx where k = 'b')) = 'manager', 'as a manager');
select pg_temp.expect_error(format($q$select accept_invite(%L)$q$, (select v from ctx where k = 'inv')), 'invite_invalid');
select pg_temp.check(jsonb_array_length(list_team((select v::uuid from ctx where k = 'b')) -> 'members') = 2, 'a manager sees the team');
select pg_temp.check(jsonb_array_length(list_team((select v::uuid from ctx where k = 'b')) -> 'invites') = 0, 'but not the invite links');
select pg_temp.expect_error(format($q$select invite_member(%L, 'x@example.com')$q$, (select v from ctx where k = 'b')), 'not_owner');
select pg_temp.expect_error(format($q$select remove_member(%L, %L)$q$, (select v from ctx where k = 'b'), 'aaaaaaaa-0000-0000-0000-000000000001'), 'not_owner');
select pg_temp.check(sell_pass((select v::uuid from ctx where k = 'noa'), (select v::uuid from ctx where k = 'card')) is not null, 'a manager can sell a card');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_error(format($q$select remove_member(%L, %L)$q$, (select v from ctx where k = 'b'), 'aaaaaaaa-0000-0000-0000-000000000001'), 'cannot_remove_owner');
select remove_member((select v::uuid from ctx where k = 'b'), 'bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check(jsonb_array_length(list_team((select v::uuid from ctx where k = 'b')) -> 'members') = 1, 'removed from the team');

-- ── Reports ──
select record_payment((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'noa'), 30000, 'bit', null);
select pg_temp.check((business_report((select v::uuid from ctx where k = 'b'), current_date - 30, current_date) ->> 'collected')::int = 30000, 'report: collected');
select pg_temp.check((business_report((select v::uuid from ctx where k = 'b'), current_date - 30, current_date + 5) -> 'visits' ->> 'attended')::int = 1, 'report: visits');
select pg_temp.expect_error(format($q$select business_report(%L, current_date, current_date - 1)$q$, (select v from ctx where k = 'b')), 'invalid_range');

-- ── Leaving a waitlist from the link ──
select pg_temp.as_anon();
insert into ctx select 'wtok', public_waitlist('studio-x', 'Waiting Wendy', '0547000001', null, false, (select v::uuid from ctx where k = 'facial'), current_date + 5, 'any') ->> 'token';
select pg_temp.check(public_waitlist_info((select v::uuid from ctx where k = 'wtok')) ->> 'status' = 'waiting', 'the link shows the wait');
select public_leave_waitlist((select v::uuid from ctx where k = 'wtok'));
select pg_temp.check(public_waitlist_info((select v::uuid from ctx where k = 'wtok')) ->> 'status' = 'removed', 'left the waitlist');
select pg_temp.expect_error($q$select public_leave_waitlist(gen_random_uuid())$q$, 'not_found');

-- ── Orders: products only; owner sees it at once; handed over = charged; cancelled = voided ──
select pg_temp.expect_error(format($q$select public_order('studio-x', 'Buyer', '0547000005', null, false, %L::jsonb)$q$,
  jsonb_build_array(jsonb_build_object('id', (select v from ctx where k = 'facial'), 'qty', 1))), 'invalid_items');
select pg_temp.expect_error(format($q$select public_order('studio-x', 'Buyer', '0547000005', null, false, %L::jsonb)$q$,
  jsonb_build_array(jsonb_build_object('id', (select v from ctx where k = 'cream'), 'qty', 50))), 'invalid_items');
select pg_temp.check((public_order('studio-x', 'Buyer', '0547000005', null, false,
  jsonb_build_array(jsonb_build_object('id', (select v from ctx where k = 'cream'), 'qty', 2)), 'Pick up Sunday') ->> 'total')::int = 16000, 'order total 2 x 80');
select pg_temp.check((select count(*) from orders) = 0, 'visitors cannot read orders');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from pending_actions where kind = 'new_order') = 1, 'the owner sees the order at once');
insert into ctx select 'order', id::text from orders;
select set_order_status((select v::uuid from ctx where k = 'order'), 'done');
select pg_temp.check((select c.amount_agorot from charges c join orders o on o.charge_id = c.id) = 16000 and (select count(*) from pending_actions where kind = 'new_order' and status = 'pending') = 0, 'handed over: charged, message cleared');
select set_order_status((select v::uuid from ctx where k = 'order'), 'cancelled');
select pg_temp.check((select c.void from charges c join orders o on o.charge_id = c.id), 'cancelled after: the charge is voided');

-- ── Forget erases notes ──
select forget_person((select v::uuid from ctx where k = 'dana'));
reset role;
select pg_temp.check((select notes from people where id = (select v::uuid from ctx where k = 'dana')) is null, 'forgetting erases the notes');
