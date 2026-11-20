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
insert into ctx select 'b', create_business('Studio', 'studio-m', 'custom');
select setup_business((select v::uuid from ctx where k = 'b'), '{}', '{}',
  '[{"name":"Facial","delivery":"appointment","billing":"one_time","minutes":60,"priceAgorot":30000},
    {"name":"Yoga","delivery":"class","billing":"subscription","minutes":60,"priceAgorot":32000}]');
insert into ctx select 'noa', add_person((select v::uuid from ctx where k = 'b'), 'Noa Sagi', '0521234567')::text;
insert into ctx select 'dana', add_person((select v::uuid from ctx where k = 'b'), 'Dana Cohen')::text;
reset role;
insert into memberships values ((select v::uuid from ctx where k = 'b'), 'cccccccc-0000-0000-0000-000000000003', 'manager');
-- a facial yesterday for Noa (history), a yoga class yesterday for Dana
insert into sessions (business_id, offering_id, starts_at, ends_at, capacity) select (select v::uuid from ctx where k = 'b'), id, now() - interval '1 day', now() - interval '23 hours', 1 from offerings where name = 'Facial';
insert into sessions (business_id, offering_id, starts_at, ends_at, capacity) select (select v::uuid from ctx where k = 'b'), id, now() - interval '1 day', now() - interval '23 hours', 10 from offerings where name = 'Yoga';
with b as (insert into bookings (business_id, session_id, person_id) select (select v::uuid from ctx where k = 'b'), s.id, (select v::uuid from ctx where k = 'noa') from sessions s join offerings o on o.id = s.offering_id where o.name = 'Facial' returning id) insert into ctx select 'bf', id::text from b;
with b as (insert into bookings (business_id, session_id, person_id) select (select v::uuid from ctx where k = 'b'), s.id, (select v::uuid from ctx where k = 'dana') from sessions s join offerings o on o.id = s.offering_id where o.name = 'Yoga' returning id) insert into ctx select 'by', id::text from b;

-- Attendance charges a pay-per-visit service only; undo voids; redo restores
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select mark_attendance((select v::uuid from ctx where k = 'bf'), 'attended');
select mark_attendance((select v::uuid from ctx where k = 'by'), 'attended');
select pg_temp.check((select count(*) from charges where not void) = 1, 'only the pay-per-visit visit is charged');
select pg_temp.check((person_money((select v::uuid from ctx where k = 'noa')) ->> 'balance')::int = 30000, 'Noa owes 300');
select mark_attendance((select v::uuid from ctx where k = 'bf'), 'no_show');
select pg_temp.check((person_money((select v::uuid from ctx where k = 'noa')) ->> 'balance')::int = 0, 'undoing attendance voids the charge');
select mark_attendance((select v::uuid from ctx where k = 'bf'), 'attended');
select pg_temp.check((select count(*) from charges) = 1 and (select not void from charges), 'marking again restores the same charge');

-- Manual charge (monthly subscription) and payments
select add_charge((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'dana'), 'Yoga, November', 32000);
select pg_temp.expect_error(format($q$select add_charge(%L, %L, 'Free money', 0)$q$, (select v from ctx where k = 'b'), (select v from ctx where k = 'dana')), 'check');
select record_payment((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'noa'), 20000, 'bit', 'part');
select pg_temp.check((person_money((select v::uuid from ctx where k = 'noa')) ->> 'balance')::int = 10000, 'partial payment leaves 100');
select pg_temp.expect_error(format($q$select record_payment(%L, %L, -500, 'cash')$q$, (select v from ctx where k = 'b'), (select v from ctx where k = 'noa')), 'check');
select pg_temp.check((money_summary((select v::uuid from ctx where k = 'b')) ->> 'collected_month')::int = 20000, 'collected this month');
select pg_temp.check(jsonb_array_length(money_summary((select v::uuid from ctx where k = 'b')) -> 'debtors') = 2, 'two people owe money');
select pg_temp.check((money_summary((select v::uuid from ctx where k = 'b')) -> 'debtors' -> 0 ->> 'name') = 'Dana Cohen', 'biggest debt first');
select pg_temp.check((business_today((select v::uuid from ctx where k = 'b')) -> 'counts' ->> 'collected_month')::int = 20000, 'Today shows money collected');
select record_payment((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'noa'), 5000, 'refund', 'goodwill');
select pg_temp.check((person_money((select v::uuid from ctx where k = 'noa')) ->> 'balance')::int = 15000, 'refund is a negative payment');
select pg_temp.check(jsonb_array_length(person_money((select v::uuid from ctx where k = 'noa')) -> 'lines') = 3, 'card shows charges and payments');
select pg_temp.expect_error($q$update payments set amount_agorot = 1$q$, 'permission denied');
select pg_temp.expect_error($q$delete from payments$q$, 'permission denied');

-- A manager records payments but cannot refund or void
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select record_payment((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'dana'), 32000, 'cash');
select pg_temp.expect_error(format($q$select record_payment(%L, %L, 100, 'refund')$q$, (select v from ctx where k = 'b'), (select v from ctx where k = 'dana')), 'not_owner');
select pg_temp.expect_error(format($q$select void_charge(%L)$q$, (select id from charges limit 1)), 'not_owner');
select pg_temp.check((select count(*) from payments) = 3, 'manager reads payments');

-- A stranger sees and does nothing
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from payments) + (select count(*) from charges) = 0, 'stranger reads no money');
select pg_temp.expect_error(format($q$select money_summary(%L)$q$, (select v from ctx where k = 'b')), 'not_allowed');
select pg_temp.expect_error(format($q$select record_payment(%L, %L, 100, 'cash')$q$, (select v from ctx where k = 'b'), (select v from ctx where k = 'noa')), 'not_allowed');
select pg_temp.expect_error(format($q$select person_money(%L)$q$, (select v from ctx where k = 'noa')), 'not_allowed');
select pg_temp.as_anon();
select pg_temp.expect_error(format($q$select money_summary(%L)$q$, (select v from ctx where k = 'b')), 'permission denied');
