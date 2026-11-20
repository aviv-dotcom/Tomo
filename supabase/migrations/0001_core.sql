-- Tomo 0001: the core every business shares.
-- Businesses and who belongs to them, the audit log, and the background job queue.
-- Rules: reads are protected by RLS; every write goes through a SECURITY DEFINER function.
-- Shared helpers use the core_ prefix and are defined only here, never redefined later.

-- ── Types ──────────────────────────────────────────────────────────────────
create type member_role as enum ('owner', 'manager', 'staff', 'client', 'guardian');
create type job_status as enum ('queued', 'running', 'done', 'failed');

-- ── Tables ─────────────────────────────────────────────────────────────────
create table businesses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 80),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  template    text not null default 'custom' check (template ~ '^[a-z_]{2,20}$'),
  vocabulary  jsonb not null default '{}'::jsonb,
  modules     text[] not null default '{}',
  timezone    text not null default 'Asia/Jerusalem',
  currency    text not null default 'ILS' check (currency ~ '^[A-Z]{3}$'),
  locale      text not null default 'he' check (locale in ('he', 'en')),
  plan        text not null default 'free',
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now()
);

create table memberships (
  business_id uuid not null references businesses (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        member_role not null,
  created_at  timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index memberships_user on memberships (user_id);

-- Append only: no one can update or delete rows, not even the owner.
create table audit_log (
  id          bigint generated always as identity primary key,
  business_id uuid references businesses (id) on delete cascade,
  actor       uuid,
  action      text not null,
  target      text,
  data        jsonb not null default '{}'::jsonb,
  at          timestamptz not null default now()
);
create index audit_log_business on audit_log (business_id, at desc);

-- The background queue. Only the server (service role) touches it.
create table jobs (
  id          bigint generated always as identity primary key,
  business_id uuid references businesses (id) on delete cascade,
  kind        text not null check (kind ~ '^[a-z_]+\.[a-z_]+$'),
  payload     jsonb not null default '{}'::jsonb,
  run_at      timestamptz not null default now(),
  status      job_status not null default 'queued',
  attempts    int not null default 0,
  dedupe_key  text unique,
  last_error  text,
  locked_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index jobs_due on jobs (run_at) where status = 'queued';

-- ── Row Level Security ─────────────────────────────────────────────────────
alter table businesses  enable row level security;
alter table memberships enable row level security;
alter table audit_log   enable row level security;
alter table jobs        enable row level security;

-- No direct writes from the API roles. Writes happen only inside the functions below.
revoke insert, update, delete, truncate on businesses, memberships, audit_log, jobs from anon, authenticated;
revoke all on jobs from anon, authenticated;

-- ── Helpers ────────────────────────────────────────────────────────────────
-- The signed-in user's role in a business, or null.
create function core_role(p_business uuid) returns member_role
language sql stable security definer set search_path = public as $$
  select role from memberships where business_id = p_business and user_id = auth.uid()
$$;

create function core_has_role(p_business uuid, p_roles member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(core_role(p_business) = any (p_roles), false)
$$;

-- Today in the business's own time zone.
create function core_today(p_business uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from businesses where id = p_business), 'Asia/Jerusalem'))::date
$$;

create function core_audit(p_business uuid, p_action text, p_target text, p_data jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public as $$
  insert into audit_log (business_id, actor, action, target, data) values (p_business, auth.uid(), p_action, p_target, coalesce(p_data, '{}'::jsonb))
$$;

-- Queues a job. A dedupe key that already exists is ignored, so the same reminder is never queued twice.
create function core_enqueue(p_kind text, p_payload jsonb, p_run_at timestamptz default now(), p_dedupe text default null, p_business uuid default null) returns void
language sql security definer set search_path = public as $$
  insert into jobs (kind, payload, run_at, dedupe_key, business_id)
  values (p_kind, coalesce(p_payload, '{}'::jsonb), coalesce(p_run_at, now()), p_dedupe, p_business)
  on conflict (dedupe_key) do nothing
$$;

create function core_health() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('db', 'ok', 'at', now())
$$;

-- ── Policies ───────────────────────────────────────────────────────────────
create policy businesses_members_read on businesses for select to authenticated
  using (core_role(id) is not null);

create policy memberships_read on memberships for select to authenticated
  using (user_id = auth.uid() or core_has_role(business_id, array['owner', 'manager']::member_role[]));

create policy audit_owner_read on audit_log for select to authenticated
  using (business_id is not null and core_has_role(business_id, array['owner']::member_role[]));

-- ── Functions people call ──────────────────────────────────────────────────
create function core_slug_ok(p_slug text) returns boolean
language sql immutable as $$
  select p_slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'
     and p_slug not in ('admin', 'api', 'app', 'login', 'signup', 'settings', 'help', 'support', 'tomo', 'www', 'p', 'pay', 'book')
$$;

create function create_business(p_name text, p_slug text, p_template text default 'custom') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_slug text := lower(trim(p_slug));
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 80 then raise exception 'invalid_name'; end if;
  if not core_slug_ok(v_slug) then raise exception 'invalid_slug'; end if;
  if exists (select 1 from businesses where slug = v_slug) then raise exception 'slug_taken'; end if;
  if (select count(*) from memberships where user_id = auth.uid() and role = 'owner') >= 5 then raise exception 'too_many_businesses'; end if;
  insert into businesses (name, slug, template, created_by) values (trim(p_name), v_slug, coalesce(p_template, 'custom'), auth.uid()) returning id into v_id;
  insert into memberships (business_id, user_id, role) values (v_id, auth.uid(), 'owner');
  perform core_audit(v_id, 'business.create', v_id::text, jsonb_build_object('slug', v_slug, 'template', p_template));
  return v_id;
end $$;

create function my_businesses() returns table (id uuid, name text, slug text, role member_role)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, b.slug, m.role from businesses b join memberships m on m.business_id = b.id
  where m.user_id = auth.uid() order by b.created_at
$$;

-- ── Worker functions (service role only) ───────────────────────────────────
-- Claims due jobs. SKIP LOCKED means two workers never take the same job.
create function claim_jobs(p_limit int default 20) returns setof jobs
language sql security definer set search_path = public as $$
  update jobs set status = 'running', attempts = attempts + 1, locked_at = now()
  where id in (
    select id from jobs where status = 'queued' and run_at <= now()
    order by run_at limit greatest(1, least(p_limit, 100)) for update skip locked)
  returning *
$$;

-- Marks a job done, or schedules a retry (1 min, 5 min, 1 hour, then 6 hours). After 5 attempts it stays failed.
create function finish_job(p_id bigint, p_error text) returns void
language sql security definer set search_path = public as $$
  update jobs set
    status     = case when p_error is null then 'done'::job_status when attempts >= 5 then 'failed'::job_status else 'queued'::job_status end,
    last_error = p_error,
    locked_at  = null,
    run_at     = case when p_error is null or attempts >= 5 then run_at
                      else now() + (array[interval '1 minute', interval '5 minutes', interval '1 hour', interval '6 hours'])[least(attempts, 4)] end
  where id = p_id
$$;

-- Jobs stuck in "running" for 10 minutes (a worker died) go back to the queue.
create function release_stuck_jobs() returns int
language sql security definer set search_path = public as $$
  with r as (update jobs set status = 'queued', locked_at = null where status = 'running' and locked_at < now() - interval '10 minutes' returning 1)
  select count(*)::int from r
$$;

-- ── Grants ─────────────────────────────────────────────────────────────────
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function core_health() to anon, authenticated;
grant execute on function core_slug_ok(text) to anon, authenticated;
grant execute on function core_role(uuid), core_has_role(uuid, member_role[]), core_today(uuid) to authenticated;
grant execute on function create_business(text, text, text), my_businesses() to authenticated;
-- core_audit, core_enqueue, claim_jobs, finish_job, release_stuck_jobs: server only (service role bypasses these grants).
