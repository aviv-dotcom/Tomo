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
insert into ctx select 'b', create_business('Clinic', 'clinic-v', 'custom');
insert into ctx select 'b2', create_business('Other', 'other-v', 'custom');
select setup_business((select v::uuid from ctx where k = 'b'), '{}', '{}', '[{"name":"Facial","delivery":"appointment","billing":"one_time","minutes":60,"priceAgorot":30000}]');
select set_hours((select v::uuid from ctx where k = 'b'), (select jsonb_agg(jsonb_build_object('weekday', d, 'start', 480, 'end', 1200)) from generate_series(0, 6) d));
insert into ctx select 'noa', add_person((select v::uuid from ctx where k = 'b'), 'Noa Sagi', '0521000001')::text;
insert into ctx select 'bk', book_appointment((select v::uuid from ctx where k = 'b'), (select id from offerings where name = 'Facial'), (select v::uuid from ctx where k = 'noa'),
  ((current_date + 2)::timestamp + interval '10 hours') at time zone 'Asia/Jerusalem')::text;

-- Alert and visit summary
select set_person_alert((select v::uuid from ctx where k = 'noa'), 'Sensitive to glycolic acid');
select set_visit_note((select v::uuid from ctx where k = 'bk'), 'Glycolic 20%, 8 min, slight redness');
select pg_temp.check(person_card((select v::uuid from ctx where k = 'noa')) ->> 'alert' = 'Sensitive to glycolic acid', 'alert on the card');
select pg_temp.check(person_card((select v::uuid from ctx where k = 'noa')) -> 'bookings' -> 0 ->> 'summary' like 'Glycolic%', 'summary under the treatment');
select pg_temp.check(session_detail((select session_id from bookings where id = (select v::uuid from ctx where k = 'bk'))) -> 'bookings' -> 0 ->> 'alert' is not null, 'alert in the session');
select set_visit_note((select v::uuid from ctx where k = 'bk'), 'Updated');
select pg_temp.check((select count(*) from visit_notes) = 1 and (select note from visit_notes) = 'Updated', 'one summary per visit, updated in place');

-- Photos: only into the client's own folder in the private bucket
insert into ctx select 'path', (select v from ctx where k = 'b') || '/' || (select v from ctx where k = 'noa') || '/before-1.jpg';
insert into storage.objects (bucket_id, name) values ('client-media', (select v from ctx where k = 'path'));
insert into ctx select 'photo', add_person_photo((select v::uuid from ctx where k = 'noa'), (select v from ctx where k = 'path'), 'before', (select v::uuid from ctx where k = 'bk'))::text;
select pg_temp.check((select kind from person_photos) = 'before', 'before photo recorded with its visit');
select pg_temp.expect_error(format($q$select add_person_photo(%L, %L, 'after')$q$, (select v from ctx where k = 'noa'), (select v from ctx where k = 'b') || '/' || (select v from ctx where k = 'noa') || '/never.jpg'), 'invalid_media');
select pg_temp.expect_error(format($q$select add_person_photo(%L, %L, 'weird')$q$, (select v from ctx where k = 'noa'), (select v from ctx where k = 'path')), '');

-- Others: a manager of A may; a stranger and a visitor may not, and see nothing
reset role;
insert into memberships values ((select v::uuid from ctx where k = 'b'), 'cccccccc-0000-0000-0000-000000000003', 'manager');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from person_photos) = 1 and (select count(*) from storage.objects where bucket_id = 'client-media') = 1, 'a manager sees the photos');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from person_photos) = 0 and (select count(*) from visit_notes) = 0, 'a stranger sees no photos or summaries');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'client-media') = 0, 'a stranger cannot list the files');
select pg_temp.expect_error(format($q$insert into storage.objects (bucket_id, name) values ('client-media', %L)$q$, (select v from ctx where k = 'b') || '/x/sneaky.jpg'), 'row-level security');
select pg_temp.expect_error(format($q$select set_visit_note(%L, 'hack')$q$, (select v from ctx where k = 'bk')), 'not_allowed');
select pg_temp.expect_error(format($q$select remove_person_photo(%L)$q$, (select v from ctx where k = 'photo')), 'not_allowed');
select pg_temp.as_anon();
select pg_temp.check((select count(*) from person_photos) = 0, 'visitors see nothing');

-- Export includes them; forgetting erases them
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check(jsonb_array_length(person_export((select v::uuid from ctx where k = 'noa')) -> 'visit_summaries') = 1, 'the client''s copy includes summaries');
select pg_temp.check(remove_person_photo((select v::uuid from ctx where k = 'photo')) = (select v from ctx where k = 'path'), 'removing returns the file to delete');
select forget_person((select v::uuid from ctx where k = 'noa'));
reset role;
select pg_temp.check((select count(*) from visit_notes) = 0 and (select alert from people where id = (select v::uuid from ctx where k = 'noa')) is null, 'forgetting erases summaries and the alert');
