-- Tomo 0008: money without a payment provider. Charges (what a client owes) and payments (what they paid), recorded by hand.
-- Payments are append-only; a refund is a new negative payment. A client's balance = charges - payments.
-- A visit to a pay-per-visit service creates its charge when attendance is marked.

create type payment_method as enum ('cash', 'bit', 'transfer', 'card', 'other', 'refund');

create table charges (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses (id) on delete cascade,
  person_id    uuid not null references people (id) on delete cascade,
  booking_id   uuid references bookings (id) on delete set null,
  description  text not null check (char_length(description) between 2 and 120),
  amount_agorot int not null check (amount_agorot between 1 and 10000000),
  void         boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (booking_id)
);
create index charges_person on charges (person_id, created_at);
create index charges_business on charges (business_id, created_at);

create table payments (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses (id) on delete cascade,
  person_id     uuid not null references people (id) on delete cascade,
  amount_agorot int not null check (amount_agorot <> 0 and abs(amount_agorot) <= 10000000),
  method        payment_method not null,
  note          text check (char_length(note) <= 120),
  paid_at       timestamptz not null default now(),
  created_by    uuid,
  created_at    timestamptz not null default now(),
  check ((method = 'refund') = (amount_agorot < 0))
);
create index payments_business on payments (business_id, paid_at);
create index payments_person on payments (person_id, paid_at);

alter table charges  enable row level security;
alter table payments enable row level security;
revoke insert, update, delete, truncate on charges, payments from anon, authenticated;
create policy charges_read on charges for select to authenticated using (
  core_has_role(business_id, array['owner', 'manager']::member_role[]) or exists (select 1 from people p where p.id = person_id and p.user_id = auth.uid()));
create policy payments_read on payments for select to authenticated using (
  core_has_role(business_id, array['owner', 'manager']::member_role[]) or exists (select 1 from people p where p.id = person_id and p.user_id = auth.uid()));

create function money_balance(p_person uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(amount_agorot) from charges where person_id = p_person and not void), 0)::int
       - coalesce((select sum(amount_agorot) from payments where person_id = p_person), 0)::int
$$;

-- ── Writes ─────────────────────────────────────────────────────────────────
create function add_charge(p_business uuid, p_person uuid, p_description text, p_amount_agorot int) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not core_has_role(p_business, array['owner', 'manager']::member_role[]) then raise exception 'not_allowed'; end if;
  if not exists (select 1 from people where id = p_person and business_id = p_business) then raise exception 'unknown_person'; end if;
  insert into charges (business_id, person_id, description, amount_agorot) values (p_business, p_person, trim(p_description), p_amount_agorot) returning id into v_id;
  perform core_audit(p_business, 'charge.add', v_id::text, jsonb_build_object('amount', p_amount_agorot));
  return v_id;
end $$;

create function void_charge(p_charge uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c charges;
begin
  select * into c from charges where id = p_charge;
  if c.id is null or not core_has_role(c.business_id, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  update charges set void = true where id = p_charge;
  perform core_audit(c.business_id, 'charge.void', p_charge::text, jsonb_build_object('amount', c.amount_agorot));
end $$;

create function record_payment(p_business uuid, p_person uuid, p_amount_agorot int, p_method payment_method, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_method = 'refund' then
    if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  elsif not core_has_role(p_business, array['owner', 'manager']::member_role[]) then raise exception 'not_allowed'; end if;
  if not exists (select 1 from people where id = p_person and business_id = p_business) then raise exception 'unknown_person'; end if;
  insert into payments (business_id, person_id, amount_agorot, method, note, created_by)
  values (p_business, p_person, case when p_method = 'refund' then -abs(p_amount_agorot) else p_amount_agorot end, p_method, nullif(trim(p_note), ''), auth.uid())
  returning id into v_id;
  perform core_audit(p_business, 'payment.' || p_method, v_id::text, jsonb_build_object('amount', p_amount_agorot, 'person', p_person));
  return v_id;
end $$;

-- Attendance now also charges a pay-per-visit service, and undoing it voids that charge.
create or replace function mark_attendance(p_booking uuid, p_status booking_status) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; o offerings;
begin
  if p_status not in ('attended', 'no_show', 'booked') then raise exception 'invalid_status'; end if;
  select * into b from bookings where id = p_booking;
  if b.id is null then raise exception 'unknown_booking'; end if;
  perform cal_require_staff(b.business_id);
  if b.status not in ('booked', 'attended', 'no_show') then raise exception 'not_active'; end if;
  update bookings set status = p_status where id = p_booking;
  select o2.* into o from sessions s join offerings o2 on o2.id = s.offering_id where s.id = b.session_id;
  if p_status = 'attended' and o.billing = 'one_time' and o.price_agorot > 0 then
    insert into charges (business_id, person_id, booking_id, description, amount_agorot)
    values (b.business_id, b.person_id, b.id, o.name, o.price_agorot)
    on conflict (booking_id) do update set void = false;
  elsif p_status <> 'attended' then
    update charges set void = true where booking_id = p_booking;
  end if;
end $$;

-- ── Reads ──────────────────────────────────────────────────────────────────
create function money_summary(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_month timestamptz;
begin
  if not core_has_role(p_business, array['owner', 'manager']::member_role[]) then raise exception 'not_allowed'; end if;
  v_month := date_trunc('month', now() at time zone cal_tz(p_business)) at time zone cal_tz(p_business);
  return jsonb_build_object(
    'collected_month', coalesce((select sum(amount_agorot) from payments where business_id = p_business and paid_at >= v_month), 0),
    'charged_month', coalesce((select sum(amount_agorot) from charges where business_id = p_business and not void and created_at >= v_month), 0),
    'debtors', coalesce((select jsonb_agg(x order by (x ->> 'balance')::int desc) from (
        select jsonb_build_object('id', p.id, 'name', p.full_name, 'phone', p.phone, 'balance', money_balance(p.id)) x
        from people p where p.business_id = p_business and money_balance(p.id) > 0) d), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('id', pa.id, 'name', p.full_name, 'person_id', p.id, 'amount', pa.amount_agorot, 'method', pa.method, 'paid_at', pa.paid_at) x
        from payments pa join people p on p.id = pa.person_id where pa.business_id = p_business order by pa.paid_at desc limit 20) r), '[]'::jsonb));
end $$;

create function person_money(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p people;
begin
  select * into p from people where id = p_person;
  if p.id is null or not core_has_role(p.business_id, array['owner', 'manager']::member_role[]) then raise exception 'not_allowed'; end if;
  return jsonb_build_object('balance', money_balance(p_person),
    'lines', coalesce((select jsonb_agg(x order by (x ->> 'at') desc) from (
        select jsonb_build_object('type', 'charge', 'id', id, 'text', description, 'amount', amount_agorot, 'void', void, 'at', created_at) x
        from charges where person_id = p_person
        union all
        select jsonb_build_object('type', 'payment', 'id', id, 'text', coalesce(note, method::text), 'method', method, 'amount', amount_agorot, 'void', false, 'at', paid_at)
        from payments where person_id = p_person
        order by 1 limit 60) l), '[]'::jsonb));
end $$;

-- Today shows the money collected this month.
create or replace function business_today(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b businesses; v_month timestamptz;
begin
  if not core_has_role(p_business, array['owner', 'manager']::member_role[]) then raise exception 'not_allowed'; end if;
  select * into b from businesses where id = p_business;
  v_month := date_trunc('month', now() at time zone b.timezone) at time zone b.timezone;
  return jsonb_build_object(
    'business', jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug, 'template', b.template, 'vocabulary', b.vocabulary, 'modules', b.modules, 'timezone', b.timezone),
    'today', core_today(p_business),
    'counts', jsonb_build_object(
      'active', (select count(*) from people where business_id = p_business and status = 'active'),
      'leads',  (select count(*) from people where business_id = p_business and status = 'lead'),
      'leads_week', (select count(*) from people where business_id = p_business and status = 'lead' and created_at > now() - interval '7 days'),
      'offerings', (select count(*) from offerings where business_id = p_business and active),
      'collected_month', coalesce((select sum(amount_agorot) from payments where business_id = p_business and paid_at >= v_month), 0)),
    'offerings', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'delivery', delivery, 'billing', billing,
                    'minutes', minutes, 'priceAgorot', price_agorot, 'depositAgorot', deposit_agorot) order by position)
                  from offerings where business_id = p_business and active), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(x) from (select jsonb_build_object('id', id, 'name', full_name, 'status', status, 'created_at', created_at) x
                  from people where business_id = p_business order by created_at desc limit 5) r), '[]'::jsonb));
end $$;

revoke execute on function money_balance(uuid) from public, anon, authenticated;
revoke execute on function add_charge(uuid, uuid, text, int), void_charge(uuid), record_payment(uuid, uuid, int, payment_method, text),
  money_summary(uuid), person_money(uuid) from public, anon;
grant execute on function add_charge(uuid, uuid, text, int), void_charge(uuid), record_payment(uuid, uuid, int, payment_method, text),
  money_summary(uuid), person_money(uuid) to authenticated;
