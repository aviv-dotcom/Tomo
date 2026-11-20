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

-- Setup: A's studio, three clients, a page booking, sessions in the past and tomorrow (inserted directly, as history)
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'b', create_business('Studio', 'studio-auto', 'custom');
select setup_business((select v::uuid from ctx where k = 'b'), '{}', '{}', '[{"name":"Facial","delivery":"appointment","billing":"one_time","minutes":60,"priceAgorot":30000}]');
insert into ctx select 'o', id::text from offerings;
insert into ctx select 'noa', add_person((select v::uuid from ctx where k = 'b'), 'Noa Sagi', '0521234567')::text;
insert into ctx select 'dana', add_person((select v::uuid from ctx where k = 'b'), 'Dana Cohen', '0527654321')::text;
insert into ctx select 'old', add_person((select v::uuid from ctx where k = 'b'), 'Old Friend', '0531112222')::text;
reset role;
insert into memberships values ((select v::uuid from ctx where k = 'b'), 'cccccccc-0000-0000-0000-000000000003', 'client');
create function pg_temp.sess(p_at timestamptz) returns uuid language sql as $$
  insert into sessions (business_id, offering_id, starts_at, ends_at, capacity)
  values ((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'o'), p_at, p_at + interval '1 hour', 1) returning id $$;
-- tomorrow (24h ahead): Noa booked from the page, Dana booked by staff
insert into bookings (business_id, session_id, person_id, source) values ((select v::uuid from ctx where k = 'b'), pg_temp.sess(now() + interval '24 hours'), (select v::uuid from ctx where k = 'noa'), 'page');
insert into bookings (business_id, session_id, person_id) values ((select v::uuid from ctx where k = 'b'), pg_temp.sess(now() + interval '25 hours'), (select v::uuid from ctx where k = 'dana'));
-- yesterday Dana did not come; 40 days ago Old Friend came and has nothing booked
insert into bookings (business_id, session_id, person_id, status) values ((select v::uuid from ctx where k = 'b'), pg_temp.sess(now() - interval '1 day'), (select v::uuid from ctx where k = 'dana'), 'no_show');
insert into bookings (business_id, session_id, person_id, status) values ((select v::uuid from ctx where k = 'b'), pg_temp.sess(now() - interval '40 days'), (select v::uuid from ctx where k = 'old'), 'attended');
-- a session next week: no reminder yet
insert into bookings (business_id, session_id, person_id) values ((select v::uuid from ctx where k = 'b'), pg_temp.sess(now() + interval '7 days'), (select v::uuid from ctx where k = 'old'));
delete from bookings where person_id = (select v::uuid from ctx where k = 'old') and status = 'booked';

-- The run prepares: 1 confirmation, 2 reminders, 1 no-show follow-up, 1 missed-you
select pg_temp.check(automations_run() = 5, 'five actions prepared');
select pg_temp.check(automations_run() = 0, 'running again prepares nothing new');
select pg_temp.check((select count(*) from pending_actions where kind = 'booking_confirm') = 1, 'confirmation only for the page booking');
select pg_temp.check((select count(*) from pending_actions where kind = 'reminder_24h') = 2, 'reminders for tomorrow');
select pg_temp.check((select count(*) from pending_actions where kind = 'no_show') = 1, 'no-show follow-up');
select pg_temp.check((select person_id from pending_actions where kind = 'missed_you') = (select v::uuid from ctx where k = 'old'), 'missed-you for the client away 40 days');
select pg_temp.check((select data ->> 'offering' from pending_actions where kind = 'no_show') = 'Facial', 'action carries the facts for the message');

-- The owner sees and resolves them; the client and a stranger cannot
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check(jsonb_array_length(list_actions((select v::uuid from ctx where k = 'b'))) = 5, 'owner lists the inbox');
select pg_temp.check((list_actions((select v::uuid from ctx where k = 'b')) -> 0 -> 'person' ->> 'phone') is not null, 'inbox includes the phone to send to');
select resolve_action((select id from pending_actions where kind = 'no_show'), 'sent');
select resolve_action((select id from pending_actions where kind = 'missed_you'), 'dismissed');
select pg_temp.check(jsonb_array_length(list_actions((select v::uuid from ctx where k = 'b'))) = 3, 'resolved actions leave the inbox');
select pg_temp.expect_error(format($q$select resolve_action(%L, 'pending')$q$, (select id from pending_actions limit 1)), 'invalid_status');
select pg_temp.check((list_automations((select v::uuid from ctx where k = 'b')) ->> 'reminder_24h')::boolean, 'rules are on by default');
select set_automation((select v::uuid from ctx where k = 'b'), 'reminder_24h', false);
select pg_temp.check(jsonb_array_length(list_actions((select v::uuid from ctx where k = 'b'))) = 1, 'turning a rule off clears its pending actions');
select pg_temp.expect_error(format($q$select set_automation(%L, 'spam_everyone', true)$q$, (select v from ctx where k = 'b')), 'check');
select pg_temp.expect_error($q$update pending_actions set status = 'sent'$q$, 'permission denied');
select pg_temp.expect_error($q$select automations_run()$q$, 'permission denied');

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from pending_actions) = 0, 'client cannot read the inbox');
select pg_temp.expect_error(format($q$select list_actions(%L)$q$, (select v from ctx where k = 'b')), 'not_allowed');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.expect_error(format($q$select resolve_action(%L, 'sent')$q$, (select id from pending_actions where status = 'pending' limit 1)), 'not_allowed');
select pg_temp.expect_error(format($q$select set_automation(%L, 'no_show', false)$q$, (select v from ctx where k = 'b')), 'not_owner');

-- With the rule off, no new reminders; a past session's confirmation is dismissed
reset role;
select pg_temp.check(automations_run() = 0, 'no reminders while the rule is off');
update sessions set starts_at = now() - interval '1 hour', ends_at = now() where id = (select s.id from sessions s join bookings b on b.session_id = s.id where b.source = 'page');
select automations_run();
select pg_temp.check((select status from pending_actions where kind = 'booking_confirm') = 'dismissed', 'stale confirmation dismissed');
