// Builds a realistic demo business through the app's own functions and screenshots every screen,
// on a phone and on a desktop. Used for design review. Prints the ids to delete afterwards.
// Usage: node e2e/tour.mjs <env file> <screenshot dir>
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { createServerClient } = require("@supabase/ssr");
const { chromium } = require("playwright");
const env = Object.fromEntries(fs.readFileSync(process.argv[2], "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SR = env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = process.env.SITE ?? "https://tomo-iota.vercel.app", OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });
const email = `e2e-tour-${Date.now()}@example.com`;
const admin = (p, body) => fetch(`${URL_}/auth/v1/admin/${p}`, { method: "POST", headers: { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const user = await admin("users", { email, email_confirm: true });
const link = await admin("generate_link", { type: "magiclink", email });
let jar = [];
const sb = createServerClient(URL_, ANON, { cookies: { getAll: () => jar, setAll: (list) => { for (const c of list) { jar = jar.filter((x) => x.name !== c.name); if (c.value) jar.push({ name: c.name, value: c.value }); } } } });
await sb.auth.verifyOtp({ email, token: link.email_otp ?? link.properties?.email_otp, type: "email" });
const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw new Error(`${fn}: ${error.message}`); return data; };
const slug = `tour-${Date.now() % 100000}`;
fs.writeFileSync(`${OUT}/ids.json`, JSON.stringify({ user: user.id, slug }));

// A Pilates studio: appointments, classes, page, hours, form, people, bookings, money
const b = await rpc("create_business", { p_name: "סטודיו מאיה פילאטיס", p_slug: slug, p_template: "fitness" });
await rpc("setup_business", { p_business: b, p_vocabulary: { client: "מתאמנת", clients: "מתאמנות", session: "אימון" }, p_modules: [], p_offerings: [
  { name: "פילאטיס מכשירים", delivery: "class", billing: "subscription", minutes: 55, priceAgorot: 42000 },
  { name: "פילאטיס מזרן", delivery: "class", billing: "pack", minutes: 50, priceAgorot: 60000 },
  { name: "אימון אישי", delivery: "appointment", billing: "one_time", minutes: 60, priceAgorot: 25000, depositAgorot: 5000 },
] });
await rpc("set_hours", { p_business: b, p_hours: [0, 1, 2, 3, 4].map((d) => ({ weekday: d, start: 420, end: 1260 })).concat([{ weekday: 5, start: 420, end: 780 }]) });
await rpc("save_page", { p_business: b, p_published: true, p_tagline: "קבוצות קטנות של עד 6, יחס אישי, תוצאות אמיתיות", p_about: "סטודיו בוטיק ברמת גן.\nמכשירי רפורמר חדשים, מדריכות מוסמכות.", p_whatsapp: "052-999-8888", p_address: "ביאליק 12, רמת גן" });
await rpc("save_form", { p_business: b, p_enabled: true, p_questions: ["יש לך כאבי גב או פציעה?", "בהיריון?", "ניתוח בשנה האחרונה?"] });
const offs = Object.fromEntries((await sb.from("offerings").select("id, name").eq("business_id", b)).data.map((o) => [o.name, o.id]));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
for (const [w, m, cap] of [[(dow + 1) % 7, 1140, 6], [(dow + 2) % 7, 480, 6], [(dow + 3) % 7, 1140, 8]]) await rpc("create_class_series", { p_business: b, p_offering: offs["פילאטיס מכשירים"], p_weekday: w, p_start_min: m, p_capacity: cap, p_location: "חדר הרפורמרים" });
const names = [["נועה שגיא", "052-1234567"], ["דנה כהן", "054-2223344"], ["רונית לוי", "050-5556677"], ["מיכל ברק", "053-8889900"], ["יעל אברהם", "052-1112233"], ["שירה גולן", "054-9998877"], ["תמר פרץ", "050-1231234"], ["הילה דוד", "052-7778899"]];
const ppl = [];
for (const [n, p] of names) ppl.push(await rpc("add_person", { p_business: b, p_name: n, p_phone: p }));
await rpc("add_person", { p_business: b, p_name: "אורית שמש", p_phone: "054-3332211", p_status: "lead", p_source: "instagram" });
const { data: sess } = await sb.from("sessions").select("id, starts_at").eq("business_id", b).order("starts_at").limit(3);
for (let i = 0; i < 7; i++) await rpc("book_class", { p_session: sess[0].id, p_person: ppl[i] });
for (let i = 3; i < 8; i++) await rpc("book_class", { p_session: sess[1].id, p_person: ppl[i] });
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(Date.now() + 864e5));
const at = await rpc("cal_at", { p_business: b, p_date: tomorrow, p_min: 600 });
const appt = await rpc("book_appointment", { p_business: b, p_offering: offs["אימון אישי"], p_person: ppl[0], p_starts_at: at, p_force: true });
await rpc("mark_attendance", { p_booking: appt, p_status: "attended" });
await rpc("record_payment", { p_business: b, p_person: ppl[0], p_amount_agorot: 15000, p_method: "bit", p_note: null });
await rpc("add_charge", { p_business: b, p_person: ppl[1], p_description: "מנוי נובמבר", p_amount_agorot: 42000 });
await rpc("add_charge", { p_business: b, p_person: ppl[2], p_description: "כרטיסייה 10", p_amount_agorot: 60000 });
await rpc("record_payment", { p_business: b, p_person: ppl[2], p_amount_agorot: 60000, p_method: "transfer", p_note: null });
await rpc("cancel_session", { p_session: sess[2].id, p_reason: "חג" }).catch(() => {});
const { data: bk } = await sb.from("bookings").select("manage_token").eq("session_id", sess[1].id).limit(1);
const token = bk[0].manage_token;
const slug2 = slug + "-new";
await rpc("create_business", { p_name: "עסק חדש לגמרי", p_slug: slug2, p_template: "custom" });
console.log("seeded", slug);

const shots = [
  ["01-today", `/b/${slug}`], ["02-people", `/b/${slug}/people`], ["03-person", `/b/${slug}/people/${ppl[0]}`], ["04-calendar", `/b/${slug}/calendar?d=${tomorrow}`],
  ["05-session", `/b/${slug}/calendar/s/${sess[0].id}`], ["06-new-appt", `/b/${slug}/calendar/new?d=${tomorrow}`], ["07-class", `/b/${slug}/calendar/class`],
  ["08-hours", `/b/${slug}/calendar/hours`], ["09-off", `/b/${slug}/calendar/off`], ["10-money", `/b/${slug}/money`], ["11-services", `/b/${slug}/services`],
  ["12-site", `/b/${slug}/site`], ["13-inbox", `/b/${slug}/inbox`], ["14-automations", `/b/${slug}/automations`], ["15-forms", `/b/${slug}/forms`],
  ["16-public", `/p/${slug}`], ["17-public-book", `/p/${slug}/book?o=${offs["אימון אישי"]}`], ["21-settings", `/b/${slug}/settings`], ["22-client-link", `/m/${token}`], ["23-client-move", `/m/${token}/move`], ["24-client-form", `/m/${token}/form`], ["25-404", `/b/no-such-place`], ["26-today-empty", `/b/${slug2}`], ["27-people-add", `/b/${slug}/people?add=1`], ["18-start", `/start`], ["19-home-anon", `/`], ["20-login", `/login`],
];
const browser = await chromium.launch();
for (const [w, h, tag] of [[360, 780, "m"], [1280, 800, "d"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "he-IL", timezoneId: "Asia/Jerusalem" });
  await ctx.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: new URL(SITE).hostname, path: "/", secure: SITE.startsWith("https"), sameSite: "Lax" })));
  const page = await ctx.newPage();
  for (const [name, path] of shots) {
    if (tag === "d" && !["01-today", "04-calendar", "03-person", "16-public", "21-settings"].includes(name)) continue;
    if (name === "19-home-anon" || name === "20-login") { const anon = await browser.newContext({ viewport: { width: w, height: h }, locale: "he-IL" }); const p2 = await anon.newPage(); await p2.goto(SITE + path); await p2.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: true }); await anon.close(); continue; }
    await page.goto(SITE + path); await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
console.log("done");
