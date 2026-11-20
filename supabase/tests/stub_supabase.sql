-- Minimal stand-in for the parts of Supabase the migration relies on (local testing only).
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth; create schema storage;
-- Supabase installs pgcrypto in the "extensions" schema, not public
create schema extensions; create extension pgcrypto schema extensions;
grant usage on schema extensions to anon, authenticated;
grant usage on schema auth, storage, public to anon, authenticated;
create table auth.users (id uuid primary key, email text, phone text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now(), last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant execute on function storage.foldername(text) to authenticated;
-- Supabase grants table privileges on public to API roles by default; RLS is what protects data.
alter default privileges in schema public grant all on tables to anon, authenticated;
-- ...and execute on every new function to the API roles, so each migration must revoke what visitors may not call.
alter default privileges in schema public grant execute on functions to anon, authenticated;
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@example.com',  '{"full_name":"Gili Admin"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'parent@example.com', '{"full_name":"Dana Parent"}'),
  ('cccccccc-0000-0000-0000-000000000003', 'stranger@example.com','{"full_name":"Outsider"}');
