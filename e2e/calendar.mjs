// Smoke test of stage 2 on a live site: hours, an appointment from free slots, a weekly class with a waitlist,
// attendance, cancellation with waitlist promotion, and the client card.
// Usage: node e2e/calendar.mjs <env file with Supabase URL, anon and service role keys> [screenshot dir]
// Creates a test user and business; delete them afterwards (see the ids file it writes).
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { createServerClient } = require("@supabase/ssr");
const { chromium } = require("playwright");
const env = Object.fromEntries(fs.readFileSync(process.argv[2], "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SR = env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = process.env.SITE ?? "https://tomo-iota.vercel.app", OUT = process.argv[3] ?? ".";
const email = `e2e-cal-${Date.now()}@example.com`;
const admin = (p, body) => fetch(`${URL_}/auth/v1/admin/${p}`, { method: "POST", headers: { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const user = await admin("users", { email, email_confirm: true });
const link = await admin("generate_link", { type: "magiclink", email });
let jar = [];
const sb = createServerClient(URL_, ANON, { cookies: { getAll: () => jar, setAll: (list) => { for (const c of list) { jar = jar.filter((x) => x.name !== c.name); if (c.value) jar.push({ name: c.name, value: c.value }); } } } });
const { error } = await sb.auth.verifyOtp({ email, token: link.email_otp ?? link.properties?.email_otp, type: "email" });
if (error) throw new Error("verifyOtp: " + error.message);
fs.writeFileSync(`${OUT}/e2e-cal-ids.json`, JSON.stringify({ user: user.id, email }));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "he-IL", timezoneId: "Asia/Jerusalem" });
await ctx.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: new URL(SITE).hostname, path: "/", secure: true, sameSite: "Lax" })));
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const step = (n, msg) => console.log(`${n} ${msg}`);

await page.goto(SITE + "/"); await page.waitForURL("**/start");
await page.fill('input[name="name"]', `Maya Fitness ${Date.now() % 100000}`);
await page.click('label.tile:has-text("אימון וכושר")');
const slug = await page.inputValue('input[name="slug"]');
await page.click('button:has-text("להקים את העסק")'); await page.waitForURL(`**/b/${slug}`);
fs.writeFileSync(`${OUT}/e2e-cal-ids.json`, JSON.stringify({ user: user.id, email, slug }));
step(1, `business ${slug}`);

for (const name of ["נועה שגיא", "דנה כהן", "רון לוי"]) {
  await page.goto(`${SITE}/b/${slug}/people`);
  await page.fill('form:has(input[name="business"]) input[name="name"]', name);
  await page.click('button:has-text("להוסיף")');
  await page.waitForSelector(`.list-row:has-text("${name}")`, { timeout: 20000 });
}
step(2, "3 people added: " + (await page.$$eval(".list-row .grow > span:first-child", (e) => e.map((x) => x.textContent))).join(", "));

await page.goto(`${SITE}/b/${slug}/calendar/hours`);
for (let d = 0; d < 7; d++) { await page.check(`input[name="open-${d}"]`); await page.fill(`input[name="start-${d}"]`, "07:00"); await page.fill(`input[name="end-${d}"]`, "21:00"); }
await page.click('button:has-text("לשמור שעות")'); await page.waitForSelector('text=השעות נשמרו');
step(3, "hours saved 07:00-21:00 every day");

const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(Date.now() + 864e5));
await page.goto(`${SITE}/b/${slug}/calendar/new?d=${tomorrow}`);
await page.selectOption('select[name="person"]', { label: "נועה שגיא" });
await page.waitForSelector(".slot", { timeout: 20000 });
const slots = await page.$$eval(".slot", (e) => e.map((x) => x.textContent));
await page.click(".slot:nth-child(5)");
const chosen = await page.textContent(".slot-on");
await page.click('button:has-text("לקבוע")'); await page.waitForURL(`**/calendar?d=${tomorrow}`);
step(4, `appointment booked at ${chosen} (${slots.length} free slots, first ${slots[0]})`);

const wd = new Date(`${tomorrow}T12:00:00Z`).getUTCDay();
await page.goto(`${SITE}/b/${slug}/calendar/class`);
await page.selectOption('select[name="weekday"]', String(wd));
await page.fill('input[name="time"]', "19:00");
await page.fill('input[name="capacity"]', "2");
await page.fill('input[name="location"]', "הפארק");
await page.click('button:has-text("ליצור ולפתוח")'); await page.waitForURL(`**/b/${slug}/calendar`);
await page.goto(`${SITE}/b/${slug}/calendar?d=${tomorrow}`);
const agenda = await page.$$eval(".session", (e) => e.map((x) => x.innerText.replace(/\s+/g, " ")));
step(5, "tomorrow: " + agenda.join(" | "));
await page.screenshot({ path: `${OUT}/e2e-cal-1-day.png`, fullPage: true });

await page.click('.session:has-text("19:00")'); await page.waitForURL("**/calendar/s/**");
for (const name of ["נועה שגיא", "דנה כהן", "רון לוי"]) {
  await page.selectOption('select[name="person"]', { label: name });
  await page.click('form:has(select[name="person"]) button');
  await page.waitForSelector(`.list-row:has-text("${name}")`, { timeout: 20000 });
}
const rowStatus = async (name) => (await page.textContent(`.list-row:has-text("${name}") .tag`)).trim();
step(6, `class: נועה=${await rowStatus("נועה שגיא")}, דנה=${await rowStatus("דנה כהן")}, רון=${await rowStatus("רון לוי")}`);
await page.click('.list-row:has-text("דנה כהן") button:has-text("ביטול")');
await page.waitForFunction(() => ![...document.querySelectorAll(".list-row")].some((r) => r.innerText.includes("דנה כהן")));
step(7, `after דנה cancels: רון=${await rowStatus("רון לוי")}`);
await page.click('.list-row:has-text("נועה שגיא") button:has-text("הגיע")');
await page.waitForSelector('.list-row:has-text("נועה שגיא"):has-text("לבטל סימון")', { timeout: 20000 });
step(8, `attendance: נועה=${await rowStatus("נועה שגיא")}`);
await page.screenshot({ path: `${OUT}/e2e-cal-2-session.png`, fullPage: true });

await page.click('a:has-text("נועה שגיא")'); await page.waitForURL("**/people/**");
const visits = await page.textContent(".kpi:first-child b");
const history = await page.$$eval(".link-row", (e) => e.map((x) => x.innerText.replace(/\s+/g, " ")));
step(9, `card: visits=${visits}, history=${history.join(" | ")}`);
await page.screenshot({ path: `${OUT}/e2e-cal-3-card.png`, fullPage: true });
await page.goto(`${SITE}/b/${slug}`);
step(10, "today agenda: " + ((await page.$$eval(".card:has(h2:has-text('היום בלוח')) .link-row", (e) => e.map((x) => x.innerText.replace(/\s+/g, " ")))).join(" | ") || "(none today)"));
console.log("page errors:", errors.length ? errors : "none");
await browser.close();
