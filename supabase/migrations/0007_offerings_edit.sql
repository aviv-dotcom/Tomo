-- Tomo 0007: the owner manages services and prices after setup.
-- Services are never deleted (bookings point at them); they are hidden with active = false.

create function save_offering(p_business uuid, p_id uuid, p_name text, p_delivery offering_delivery, p_billing offering_billing,
                              p_minutes int, p_price_agorot int, p_deposit_agorot int, p_buffer_minutes int, p_active boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id;
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  if p_delivery in ('appointment', 'class', 'addon') and p_minutes is null then raise exception 'minutes_required'; end if;
  if v_id is null then
    if (select count(*) from offerings where business_id = p_business) >= 100 then raise exception 'too_many_offerings'; end if;
    insert into offerings (business_id, name, delivery, billing, minutes, price_agorot, deposit_agorot, buffer_minutes, active, position)
    values (p_business, trim(p_name), p_delivery, p_billing, p_minutes, p_price_agorot, nullif(p_deposit_agorot, 0), coalesce(p_buffer_minutes, 0),
            coalesce(p_active, true), coalesce((select max(position) + 1 from offerings where business_id = p_business), 0))
    returning id into v_id;
  else
    if not exists (select 1 from offerings where id = v_id and business_id = p_business) then raise exception 'unknown_offering'; end if;
    -- The kind of service can't change once something was booked on it.
    if exists (select 1 from offerings where id = v_id and delivery <> p_delivery)
       and exists (select 1 from sessions where offering_id = v_id) then raise exception 'delivery_locked'; end if;
    update offerings set name = trim(p_name), delivery = p_delivery, billing = p_billing, minutes = p_minutes, price_agorot = p_price_agorot,
      deposit_agorot = nullif(p_deposit_agorot, 0), buffer_minutes = coalesce(p_buffer_minutes, 0), active = coalesce(p_active, true)
    where id = v_id;
    if not coalesce(p_active, true) then update recurrences set active = false where offering_id = v_id; end if;
  end if;
  perform core_audit(p_business, 'offering.save', v_id::text, jsonb_build_object('price', p_price_agorot, 'active', p_active));
  return v_id;
end $$;

revoke execute on function save_offering(uuid, uuid, text, offering_delivery, offering_billing, int, int, int, int, boolean) from public, anon;
grant execute on function save_offering(uuid, uuid, text, offering_delivery, offering_billing, int, int, int, int, boolean) to authenticated;
