-- Tomo 0016: Supabase grants every new function to visitors (anon) by default, and earlier migrations revoked only
-- from PUBLIC. Each of these already refused visitors inside (they check the signed-in role), but visitors should not
-- be able to call them at all. The tests now mimic Supabase's default so this is caught for every new function.
revoke execute on function
  core_slug_ok(text),
  save_page(uuid, boolean, text, text, text, text),
  set_cancel_hours(uuid, int),
  save_form(uuid, boolean, jsonb),
  person_form(uuid),
  person_export(uuid),
  forget_person(uuid),
  free_slots(uuid, uuid, date, uuid[]),
  book_appointment(uuid, uuid, uuid, timestamptz, boolean, uuid[])
from anon;
