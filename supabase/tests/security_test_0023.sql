-- Run after stub_supabase.sql + all migrations. Tests 0023: a visit card shared with the client through a private link.
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
insert into ctx select 'b', create_business('Clinic', 'clinic-s', 'custom');
select setup_business((select v::uuid from ctx where k = 'b'), '{}', '{}', '[{"name":"Peel","delivery":"appointment","billing":"one_time","minutes":60,"priceAgorot":30000}]');
select set_hours((select v::uuid from ctx where k = 'b'), (select jsonb_agg(jsonb_build_object('weekday', d, 'start', 480, 'end', 1200)) from generate_series(0, 6) d));
insert into ctx select 'dana', add_person((select v::uuid from ctx where k = 'b'), 'Dana Levi', '0521000009')::text;
insert into ctx select 'bk', book_appointment((select v::uuid from ctx where k = 'b'), (select id from offerings where name = 'Peel'), (select v::uuid from ctx where k = 'dana'),
  ((current_date + 3)::timestamp + interval '11 hours') at time zone 'Asia/Jerusalem')::text;

-- A card with photos only (no text) exists; an empty card goes away
insert into ctx select 'pb', (select v from ctx where k = 'b') || '/' || (select v from ctx where k = 'dana') || '/b.jpg';
insert into ctx select 'pa', (select v from ctx where k = 'b') || '/' || (select v from ctx where k = 'dana') || '/a.jpg';
insert into storage.objects (bucket_id, name) select 'client-media', v from ctx where k in ('pb', 'pa');
insert into ctx select 'fb', add_person_photo((select v::uuid from ctx where k = 'dana'), (select v from ctx where k = 'pb'), 'before', (select v::uuid from ctx where k = 'bk'))::text;
insert into ctx select 'fa', add_person_photo((select v::uuid from ctx where k = 'dana'), (select v from ctx where k = 'pa'), 'after', (select v::uuid from ctx where k = 'bk'))::text;
select pg_temp.check((select note from visit_notes where booking_id = (select v::uuid from ctx where k = 'bk')) = '', 'a photo opens the visit card');
select set_visit_note((select v::uuid from ctx where k = 'bk'), '');
select pg_temp.check((select count(*) from visit_notes) = 1, 'a card with photos stays when the text is cleared');
select set_visit_note((select v::uuid from ctx where k = 'bk'), 'Peel 30%, calm skin');
select pg_temp.check((person_card((select v::uuid from ctx where k = 'dana')) -> 'bookings' -> 0 ->> 'shared')::boolean = false, 'not shared by default');

-- Not shared: the visitor sees nothing even with the token
insert into ctx select 'tok0', share_token::text from visit_notes;
select pg_temp.as_anon();
select pg_temp.check(public_visit((select v::uuid from ctx where k = 'tok0')) is null, 'unshared card is invisible');
select pg_temp.check(public_visit_photo((select v::uuid from ctx where k = 'tok0'), (select v::uuid from ctx where k = 'fb')) is null, 'unshared photo is invisible');
select pg_temp.expect_error(format($q$select set_visit_shared(%L, true)$q$, (select v from ctx where k = 'bk')), 'permission denied');

-- A stranger can't share someone else's visit
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.expect_error(format($q$select set_visit_shared(%L, true)$q$, (select v from ctx where k = 'bk')), 'not_allowed');

-- Shared: the client sees the text, the first name and both photos, before first
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'tok', set_visit_shared((select v::uuid from ctx where k = 'bk'), true)::text;
select pg_temp.check((select v from ctx where k = 'tok') = (select v from ctx where k = 'tok0'), 'sharing keeps the card''s token');
select pg_temp.as_anon();
select pg_temp.check(public_visit((select v::uuid from ctx where k = 'tok')) ->> 'note' = 'Peel 30%, calm skin', 'client sees the summary');
select pg_temp.check(public_visit((select v::uuid from ctx where k = 'tok')) ->> 'first_name' = 'Dana', 'only the first name');
select pg_temp.check(public_visit((select v::uuid from ctx where k = 'tok')) -> 'photos' -> 0 ->> 'kind' = 'before'
  and jsonb_array_length(public_visit((select v::uuid from ctx where k = 'tok')) -> 'photos') = 2, 'both photos, before first');
select pg_temp.check(public_visit((select v::uuid from ctx where k = 'tok'))::text not like '%0521000009%' and public_visit((select v::uuid from ctx where k = 'tok'))::text not like '%.jpg%', 'no phone and no file paths');
select pg_temp.check(public_visit_photo((select v::uuid from ctx where k = 'tok'), (select v::uuid from ctx where k = 'fa')) = (select v from ctx where k = 'pa'), 'shared photo resolves');
select pg_temp.check(public_visit_photo(gen_random_uuid(), (select v::uuid from ctx where k = 'fa')) is null, 'a guessed token gets nothing');
select pg_temp.check((select count(*) from visit_notes) = 0 and (select count(*) from person_photos) = 0, 'visitors still can''t read the tables');

-- A photo of another visit can't be pulled through this link
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'bk2', book_appointment((select v::uuid from ctx where k = 'b'), (select id from offerings where name = 'Peel'), (select v::uuid from ctx where k = 'dana'),
  ((current_date + 5)::timestamp + interval '11 hours') at time zone 'Asia/Jerusalem')::text;
insert into ctx select 'p2', (select v from ctx where k = 'b') || '/' || (select v from ctx where k = 'dana') || '/c.jpg';
reset role; insert into storage.objects (bucket_id, name) select 'client-media', v from ctx where k = 'p2';
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'f2', add_person_photo((select v::uuid from ctx where k = 'dana'), (select v from ctx where k = 'p2'), 'before', (select v::uuid from ctx where k = 'bk2'))::text;
select pg_temp.as_anon();
select pg_temp.check(public_visit_photo((select v::uuid from ctx where k = 'tok'), (select v::uuid from ctx where k = 'f2')) is null, 'another visit''s photo is not reachable');

-- Stop sharing: the old link dies, and sharing again makes a new one
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check(set_visit_shared((select v::uuid from ctx where k = 'bk'), false) is null, 'unsharing returns no link');
select pg_temp.as_anon();
select pg_temp.check(public_visit((select v::uuid from ctx where k = 'tok')) is null, 'old link stops working');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'tok2', set_visit_shared((select v::uuid from ctx where k = 'bk'), true)::text;
select pg_temp.check((select v from ctx where k = 'tok2') <> (select v from ctx where k = 'tok'), 'sharing again gives a new link');

-- Forgetting the client closes the link
select forget_person((select v::uuid from ctx where k = 'dana'));
select pg_temp.as_anon();
select pg_temp.check(public_visit((select v::uuid from ctx where k = 'tok2')) is null, 'forgotten client: link closed');
reset role;
