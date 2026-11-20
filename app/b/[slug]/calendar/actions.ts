"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { errorKey } from "@/lib/errors";
import { timeToMin } from "@/lib/time";
import type { MessageKey } from "@/lib/i18n/messages";

export type FormState = { error?: MessageKey; ok?: number } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function getSlots(business: string, offering: string, date: string): Promise<string[]> {
  const sb = await serverSupabase();
  const { data } = await sb.rpc("free_slots", { p_business: business, p_offering: offering, p_date: date });
  return (data ?? []) as string[];
}

export async function bookAppointment(_p: FormState, f: FormData): Promise<FormState> {
  const sb = await serverSupabase();
  const business = str(f, "business"), slug = str(f, "slug"), date = str(f, "date");
  const force = f.get("other") === "on";
  let startsAt = str(f, "slot");
  if (force) {
    const { data, error } = await sb.rpc("cal_at", { p_business: business, p_date: date, p_min: timeToMin(str(f, "time") || "00:00") });
    if (error) return { error: errorKey(error.message) };
    startsAt = data as string;
  }
  if (!startsAt) return { error: "appt.slots" as MessageKey };
  const { error } = await sb.rpc("book_appointment", { p_business: business, p_offering: str(f, "offering"), p_person: str(f, "person"), p_starts_at: startsAt, p_force: force });
  if (error) return { error: errorKey(error.message) };
  redirect(`/b/${slug}/calendar?d=${date}`);
}

export async function createClassSeries(_p: FormState, f: FormData): Promise<FormState> {
  const sb = await serverSupabase();
  const slug = str(f, "slug");
  const { error } = await sb.rpc("create_class_series", {
    p_business: str(f, "business"), p_offering: str(f, "offering"), p_weekday: Number(str(f, "weekday")),
    p_start_min: timeToMin(str(f, "time")), p_capacity: Number(str(f, "capacity")), p_location: str(f, "location") || null,
  });
  if (error) return { error: errorKey(error.message) };
  redirect(`/b/${slug}/calendar`);
}

export async function saveHours(_p: FormState, f: FormData): Promise<FormState> {
  const sb = await serverSupabase();
  const hours = [0, 1, 2, 3, 4, 5, 6].filter((d) => f.get(`open-${d}`) === "on")
    .map((d) => ({ weekday: d, start: timeToMin(str(f, `start-${d}`)), end: timeToMin(str(f, `end-${d}`)) }));
  const { error } = await sb.rpc("set_hours", { p_business: str(f, "business"), p_hours: hours });
  if (error) return { error: errorKey(error.message) };
  revalidatePath(`/b/${str(f, "slug")}/calendar/hours`);
  return { ok: Date.now() };
}

export async function addToSession(_p: FormState, f: FormData): Promise<FormState> {
  const sb = await serverSupabase();
  const { error } = await sb.rpc("book_class", { p_session: str(f, "session"), p_person: str(f, "person") });
  if (error) return { error: errorKey(error.message) };
  revalidatePath(`/b/${str(f, "slug")}/calendar/s/${str(f, "session")}`);
  return { ok: Date.now() };
}

export async function bookingAction(f: FormData): Promise<void> {
  const sb = await serverSupabase();
  const id = str(f, "booking"), op = str(f, "op");
  if (op === "cancel") await sb.rpc("cancel_booking", { p_booking: id });
  else await sb.rpc("mark_attendance", { p_booking: id, p_status: op });
  revalidatePath(`/b/${str(f, "slug")}/calendar/s/${str(f, "session")}`);
}

export async function cancelSession(_p: FormState, f: FormData): Promise<FormState> {
  const sb = await serverSupabase();
  const { error } = await sb.rpc("cancel_session", { p_session: str(f, "session"), p_reason: str(f, "reason") || null });
  if (error) return { error: errorKey(error.message) };
  redirect(`/b/${str(f, "slug")}/calendar?d=${str(f, "date")}`);
}

export async function addTimeOff(_p: FormState, f: FormData): Promise<FormState> {
  const sb = await serverSupabase();
  const business = str(f, "business"), from = str(f, "from"), to = str(f, "to");
  if (!from || !to || to < from) return { error: "err.invalid_range" };
  const next = new Date(`${to}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  const [{ data: start }, { data: end }] = await Promise.all([
    sb.rpc("cal_at", { p_business: business, p_date: from, p_min: 0 }),
    sb.rpc("cal_at", { p_business: business, p_date: next.toISOString().slice(0, 10), p_min: 0 }),
  ]);
  const { error } = await sb.rpc("add_time_off", { p_business: business, p_from: start, p_to: end, p_note: str(f, "note") || null });
  if (error) return { error: errorKey(error.message) };
  revalidatePath(`/b/${str(f, "slug")}/calendar/off`);
  return { ok: Date.now() };
}

export async function removeTimeOff(f: FormData): Promise<void> {
  const sb = await serverSupabase();
  await sb.rpc("delete_time_off", { p_time_off: str(f, "id") });
  revalidatePath(`/b/${str(f, "slug")}/calendar/off`);
}

export async function saveCancelHours(_p: FormState, f: FormData): Promise<FormState> {
  const sb = await serverSupabase();
  const { error } = await sb.rpc("set_cancel_hours", { p_business: str(f, "business"), p_hours: Number(str(f, "hours")) });
  if (error) return { error: errorKey(error.message) };
  revalidatePath(`/b/${str(f, "slug")}/calendar/hours`);
  return { ok: Date.now() };
}
