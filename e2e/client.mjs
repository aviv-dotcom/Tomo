// Smoke test of cancellations, client links, the health form and privacy on a live site.
// A visitor books from the page; the confirmation carries a private link; the client signs the health form, moves
// the booking and cancels; the owner cancels a class; the client asks to be forgotten and the owner confirms.
// Usage: RUN_AUTOMATIONS_CMD="<command that runs automations_run()>" node e2e/client.mjs <env file> [screenshot dir]
// Creates a test user and business; delete them afterwards (see the ids file it writes).
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { createServerClient } = require("@supabase/ssr");
const { chromium } = require("playwright");
const env = Object.fromEntries(fs.readFileSync(process.argv[2], "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SR = env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = process.env.SITE ?? "https://tomo-iota.vercel.app", OUT = process.argv[3] ?? ".";
const runAutomations = () => process.env.RUN_AUTOMATIONS_CMD && execSync(process.env.RUN_AUTOMATIONS_CMD, { stdio: "ignore" });
const email = `e2e-client-${Date.now()}@example.com`;
const admin = (p, body) => fetch(`${URL_}/auth/v1/admin/${p}`, { method: "POST", headers: { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const user = await admin("users", { email, email_confirm: true });
const link = await admin("generate_link", { type: "magiclink", email });
let jar = [];
const sb = createServerClient(URL_, ANON, { cookies: { getAll: () => jar, setAll: (list) => { for (const c of list) { jar = jar.filter((x) => x.name !== c.name); if (c.value) jar.push({ name: c.name, value: c.value }); } } } });
const { error } = await sb.auth.verifyOtp({ email, token: link.email_otp ?? link.properties?.email_otp, type: "email" });
if (error) throw new Error("verifyOtp: " + error.message);
fs.writeFileSync(`${OUT}/e2e-client-ids.json`, JSON.stringify({ user: user.id, email }));
const step = (n, msg) => console.log(`${n} ${msg}`);
const browser = await chromium.launch();
const mk = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "he-IL", timezoneId: "Asia/Jerusalem" }); return c; };
const ownerCtx = await mk();
await ownerCtx.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: new URL(SITE).hostname, path: "/", secure: true, sameSite: "Lax" })));
const owner = await ownerCtx.newPage();
const visitor = await (await mk()).newPage();
const errors = []; for (const p of [owner, visitor]) p.on("pageerror", (e) => errors.push(e.message));
owner.on("dialog", (d) => d.accept()); visitor.on("dialog", (d) => d.accept());

// Owner: a fitness business (appointments and classes), hours, a published page, the health form on
await owner.goto(SITE + "/"); await owner.waitForURL("**/start");
await owner.fill('input[name="name"]', `Client Test ${Date.now() % 100000}`);
await owner.click('label.tile:has-text("אימון וכושר")');
const slug = await owner.inputValue('input[name="slug"]');
await owner.click('button:has-text("להקים את העסק")'); await owner.waitForURL(`**/b/${slug}`);
fs.writeFileSync(`${OUT}/e2e-client-ids.json`, JSON.stringify({ user: user.id, email, slug }));
await owner.goto(`${SITE}/b/${slug}/calendar/hours`);
for (let d = 0; d < 7; d++) { await owner.check(`input[name="open-${d}"]`); await owner.fill(`input[name="start-${d}"]`, "07:00"); await owner.fill(`input[name="end-${d}"]`, "21:00"); }
await owner.click('button:has-text("לשמור שעות")'); await owner.waitForSelector("text=השעות נשמרו");
await owner.goto(`${SITE}/b/${slug}/site`); await owner.check('input[name="published"]'); await owner.click('button:has-text("לשמור")'); await owner.waitForSelector("text=נשמר");
await owner.goto(`${SITE}/b/${slug}/forms`); await owner.check('input[name="enabled"]'); await owner.click('button:has-text("לשמור")'); await owner.waitForSelector("text=נשמר");
const inThree = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(Date.now() + 3 * 864e5));
await owner.goto(`${SITE}/b/${slug}/calendar/class`);
await owner.selectOption('select[name="weekday"]', String(new Date(`${inThree}T12:00:00Z`).getUTCDay()));
await owner.fill('input[name="time"]', "19:00"); await owner.fill('input[name="capacity"]', "5");
await owner.click('button:has-text("ליצור ולפתוח")'); await owner.waitForURL(`**/b/${slug}/calendar`);
step(1, `business ${slug}: hours, page, health form, weekly class`);

// Visitor books a personal session in 3 days and joins the class
await visitor.goto(`${SITE}/p/${slug}`);
await visitor.click('a:has-text("לקבוע תור")'); await visitor.waitForURL("**/book?o=**");
await visitor.click(".days-scroll .day:nth-child(4)"); await visitor.waitForSelector(".slot");
await visitor.click(".slot:nth-child(9)");
await visitor.fill('input[name="name"]', "יעל ברק"); await visitor.fill('input[name="phone"]', "054-7778899");
await visitor.click('button:has-text("לקבוע")'); await visitor.waitForSelector("text=נקבע!");
await visitor.goto(`${SITE}/p/${slug}`);
await visitor.click('#classes a:has-text("להירשם")'); await visitor.waitForURL("**/book?s=**");
await visitor.fill('input[name="name"]', "יעל ברק"); await visitor.fill('input[name="phone"]', "054-7778899");
await visitor.click('button:has-text("להירשם")'); await visitor.waitForSelector("text=נקבע!");
step(2, "visitor booked a personal session and a class");

// The confirmation message carries the private link
runAutomations();
await owner.goto(`${SITE}/b/${slug}/inbox`);
const messages = await owner.$$eval(".action textarea", (e) => e.map((x) => x.value));
const appt = messages.find((m) => m.includes("אימון אישי")) ?? "";
const manageUrl = appt.match(/https?:\/\/\S+\/m\/[0-9a-f-]{36}/)?.[0];
step(3, `confirmation with link: ${appt}`);
if (!manageUrl) throw new Error("no private link in the message");

// Client: open the link, sign the health form, move the session, see the update
await visitor.goto(manageUrl);
step(4, "client page: " + (await visitor.textContent(".card")).replace(/\s+/g, " "));
await visitor.click('a:has-text("למלא הצהרת בריאות")'); await visitor.waitForURL("**/form");
const qs = await visitor.$$("fieldset");
for (let i = 0; i < qs.length; i++) await visitor.check(`input[name="q${i}"][value="${i === 0 ? "yes" : "no"}"]`);
await visitor.fill('textarea[name="details"]', "רגישות לאגוזים");
await visitor.fill('input[name="signed_name"]', "יעל ברק"); await visitor.check('input[name="confirm"]');
await visitor.click('button:has-text("לחתום ולשלוח")'); await visitor.waitForSelector("text=הצהרת הבריאות נחתמה");
step(5, `health form signed (${qs.length} questions)`);
await visitor.screenshot({ path: `${OUT}/e2e-client-1-link.png`, fullPage: true });
await visitor.click('a:has-text("לשנות מועד")'); await visitor.waitForURL("**/move");
await visitor.click(".days-scroll .day:nth-child(5)");
await visitor.waitForSelector(".slot"); await visitor.click(".slot:nth-child(12)");
const newTime = await visitor.textContent(".slot-on");
await visitor.click('button:has-text("לעבור למועד הזה")'); await visitor.waitForURL("**?moved=1");
step(6, `moved to ${newTime}: ` + (await visitor.textContent(".card")).replace(/\s+/g, " "));
const movedUrl = visitor.url().split("?")[0];
await visitor.goto(manageUrl);
step(7, "old link now says: " + (await visitor.textContent(".card .tag")));

// Owner sees the form on the card, then cancels the class
await owner.goto(`${SITE}/b/${slug}/people`); await owner.click('a:has-text("יעל ברק")'); await owner.waitForURL("**/people/**");
step(8, "card health form: " + (await owner.textContent('.card:has(h2:has-text("הצהרת בריאות")) .tag')));
await owner.goto(`${SITE}/b/${slug}/calendar?d=${inThree}`);
await owner.click('.session:has-text("19:00")'); await owner.waitForURL("**/calendar/s/**");
await owner.click('button:has-text("לבטל את המפגש")');
await owner.fill('input[name="reason"]', "המאמן חולה");
await owner.click('button:has-text("לבטל ולהכין הודעות")'); await owner.waitForURL(`**/calendar?d=${inThree}`);
await owner.goto(`${SITE}/b/${slug}/inbox`);
const cancelMsg = (await owner.$$eval(".action textarea", (e) => e.map((x) => x.value))).find((m) => m.includes("מבוטל"));
step(9, `class cancelled, message: ${cancelMsg}`);

// Client cancels the personal session, then asks to be forgotten; owner confirms
await visitor.goto(movedUrl);
await visitor.click('button:has-text("לבטל את התור")'); await visitor.waitForSelector("text=התור בוטל");
step(10, "client cancelled from the link");
await visitor.click("summary"); await visitor.click('button:has-text("לבקש למחוק את המידע שלי")');
await visitor.waitForSelector("text=הבקשה נשלחה לעסק");
await owner.goto(`${SITE}/b/${slug}/inbox`);
await owner.click('.action:has-text("בקשה למחיקת מידע") button:has-text("למחוק עכשיו")');
await owner.waitForFunction(() => !document.body.innerText.includes("בקשה למחיקת מידע"));
await owner.goto(`${SITE}/b/${slug}/people`);
const people = await owner.$$eval(".list-row .grow > span:first-child", (e) => e.map((x) => x.textContent));
step(11, `after deletion, clients: ${people.join(", ")}`);
console.log("page errors:", errors.length ? errors : "none");
await browser.close();
