-- Tomo 0011: a health declaration the client signs before the first visit.
-- Answers are sensitive: owners and managers only, never sent to AI, deleted when the client asks to be forgotten.

create table business_forms (
  business_id uuid primary key references businesses (id) on delete cascade,
  enabled     boolean not null default false,
  questions   jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 12),
  updated_at  timestamptz not null default now()
);

create table form_responses (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  person_id   uuid not null references people (id) on delete cascade,
  questions   jsonb not null,
  answers     jsonb not null,
  details     text check (char_length(details) <= 1000),
  signed_name text not null check (char_length(signed_name) between 2 and 80),
  signed_at   timestamptz not null default now()
);
create index form_responses_person on form_responses (person_id, signed_at desc);

alter table business_forms enable row level security;
alter table form_responses enable row level security;
revoke insert, update, delete, truncate on business_forms, form_responses from anon, authenticated;
create policy forms_staff_read on business_forms for select to authenticated using (core_has_role(business_id, array['owner', 'manager']::member_role[]));
create policy responses_staff_read on form_responses for select to authenticated using (core_has_role(business_id, array['owner', 'manager']::member_role[]));

create function save_form(p_business uuid, p_enabled boolean, p_questions jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) > 12
     or exists (select 1 from jsonb_array_elements(p_questions) q where jsonb_typeof(q) <> 'string' or char_length(q #>> '{}') not between 3 and 140) then
    raise exception 'invalid_questions';
  end if;
  if p_enabled and jsonb_array_length(p_questions) = 0 then raise exception 'invalid_questions'; end if;
  insert into business_forms (business_id, enabled, questions, updated_at) values (p_business, p_enabled, p_questions, now())
  on conflict (business_id) do update set enabled = excluded.enabled, questions = excluded.questions, updated_at = now();
end $$;

-- The form behind a booking link, and whether this person already signed.
create function public_form(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b bookings; f business_forms;
begin
  b := link_booking(p_token);
  if b.id is null then return null; end if;
  select * into f from business_forms where business_id = b.business_id and enabled;
  if f.business_id is null then return jsonb_build_object('enabled', false); end if;
  return jsonb_build_object('enabled', true, 'questions', f.questions,
    'signed', exists (select 1 from form_responses where person_id = b.person_id),
    'business', (select name from businesses where id = b.business_id));
end $$;

-- p_answers: one boolean per question, in order.
create function public_submit_form(p_token uuid, p_answers jsonb, p_details text, p_signed_name text, p_confirm boolean) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; f business_forms;
begin
  b := link_booking(p_token);
  if b.id is null then raise exception 'not_found'; end if;
  select * into f from business_forms where business_id = b.business_id and enabled;
  if f.business_id is null then raise exception 'not_found'; end if;
  if not coalesce(p_confirm, false) then raise exception 'confirm_required'; end if;
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> jsonb_array_length(f.questions)
     or exists (select 1 from jsonb_array_elements(p_answers) a where jsonb_typeof(a) <> 'boolean') then raise exception 'invalid_answers'; end if;
  if (select count(*) from form_responses where person_id = b.person_id and signed_at > now() - interval '1 day') >= 3 then raise exception 'busy_try_later'; end if;
  insert into form_responses (business_id, person_id, questions, answers, details, signed_name)
  values (b.business_id, b.person_id, f.questions, p_answers, nullif(trim(p_details), ''), trim(p_signed_name));
  insert into audit_log (business_id, actor, action, target, data) values (b.business_id, null, 'form.signed', b.person_id::text, '{}'::jsonb);
end $$;

-- The latest signed form for the client card.
create function person_form(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p people;
begin
  select * into p from people where id = p_person;
  if p.id is null or not core_has_role(p.business_id, array['owner', 'manager']::member_role[]) then raise exception 'not_allowed'; end if;
  return (select jsonb_build_object('questions', questions, 'answers', answers, 'details', details, 'signed_name', signed_name, 'signed_at', signed_at)
          from form_responses where person_id = p_person order by signed_at desc limit 1);
end $$;

revoke execute on function save_form(uuid, boolean, jsonb), person_form(uuid), public_form(uuid), public_submit_form(uuid, jsonb, text, text, boolean) from public;
grant execute on function save_form(uuid, boolean, jsonb), person_form(uuid) to authenticated;
grant execute on function public_form(uuid), public_submit_form(uuid, jsonb, text, text, boolean) to anon, authenticated;
