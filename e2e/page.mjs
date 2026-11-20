// Smoke test of stages 3 and 4 on a live site: publish the business page, a visitor books from it as a lead,
// and the owner gets a confirmation message ready to send.
// Usage: node e2e/page.mjs <env file with Supabase URL, anon and service role keys> [screenshot dir]
// The automations run every 15 minutes; set RUN_AUTOMATIONS_CMD to a command that runs them now, or wait.
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
const email = `e2e-page-${Date.now()}@example.com`;
const admin = (p, body) => fetch(`${URL_}/auth/v1/admin/${p}`, { method: "POST", headers: { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const user = await admin("users", { email, email_confirm: true });
const link = await admin("generate_link", { type: "magiclink", email });
let jar = [];
const sb = createServerClient(URL_, ANON, { cookies: { getAll: () => jar, setAll: (list) => { for (const c of list) { jar = jar.filter((x) => x.name !== c.name); if (c.value) jar.push({ name: c.name, value: c.value }); } } } });
const { error } = await sb.auth.verifyOtp({ email, token: link.email_otp ?? link.properties?.email_otp, type: "email" });
if (error) throw new Error("verifyOtp: " + error.message);
fs.writeFileSync(`${OUT}/e2e-page-ids.json`, JSON.stringify({ user: user.id, email }));
const step = (n, msg) => console.log(`${n} ${msg}`);

const browser = await chromium.launch();
const owner = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "he-IL", timezoneId: "Asia/Jerusalem" });
await owner.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: new URL(SITE).hostname, path: "/", secure: true, sameSite: "Lax" })));
const page = await owner.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.goto(SITE + "/"); await page.waitForURL("**/start");
await page.fill('input[name="name"]', `Liron Studio ${Date.now() % 100000}`);
await page.click('label.tile:has-text("יופי וטיפוח")');
const slug = await page.inputValue('input[name="slug"]');
await page.click('button:has-text("להקים את העסק")'); await page.waitForURL(`**/b/${slug}`);
fs.writeFileSync(`${OUT}/e2e-page-ids.json`, JSON.stringify({ user: user.id, email, slug }));
await page.goto(`${SITE}/b/${slug}/calendar/hours`);
for (let d = 0; d < 7; d++) { await page.check(`input[name="open-${d}"]`); await page.fill(`input[name="start-${d}"]`, "09:00"); await page.fill(`input[name="end-${d}"]`, "20:00"); }
await page.click('button:has-text("לשמור שעות")'); await page.waitForSelector("text=השעות נשמרו");
step(1, `business ${slug} with hours`);

const anon = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "he-IL", timezoneId: "Asia/Jerusalem" });
const visitor = await anon.newPage(); visitor.on("pageerror", (e) => errors.push(e.message));
const r404 = await visitor.goto(`${SITE}/p/${slug}`);
step(2, `before publishing the page answers ${r404.status()}`);

await page.goto(`${SITE}/b/${slug}/site`);
await page.check('input[name="published"]');
await page.fill('input[name="tagline"]', "קבוצות קטנות ויחס אישי");
await page.fill('textarea[name="about"]', "סטודיו לטיפוח עור ברמת גן.");
await page.fill('input[name="whatsapp"]', "052-999-8888");
await page.fill('input[name="address"]', "רמת גן");
await page.click('button:has-text("לשמור")'); await page.waitForSelector("text=נשמר");
step(3, "page published");

await visitor.goto(`${SITE}/p/${slug}`);
const services = await visitor.$$eval(".list-row .grow > span:first-child", (e) => e.map((x) => x.textContent));
step(4, `visitor sees: ${services.join(", ")}`);
await visitor.screenshot({ path: `${OUT}/e2e-page-1-public.png`, fullPage: true });
await visitor.click('a:has-text("לקבוע תור") >> nth=0'); await visitor.waitForURL("**/book?o=**");
await visitor.click(".days-scroll .day:nth-child(2)");
await visitor.waitForSelector(".slot", { timeout: 20000 });
await visitor.click(".slot:nth-child(3)");
await visitor.fill('input[name="name"]', "שירה אביב");
await visitor.fill('input[name="phone"]', "+972 54 123 4567");
await visitor.check('input[name="marketing"]');
await visitor.click('button:has-text("לקבוע")');
await visitor.waitForSelector("text=נקבע!", { timeout: 20000 });
step(5, "visitor booked: " + (await visitor.textContent(".card")).replace(/\s+/g, " "));
await visitor.screenshot({ path: `${OUT}/e2e-page-2-done.png`, fullPage: true });

if (process.env.RUN_AUTOMATIONS_CMD) execSync(process.env.RUN_AUTOMATIONS_CMD, { stdio: "ignore" });
await page.goto(`${SITE}/b/${slug}`);
const recent = await page.$$eval(".card:has(h2:has-text('אחרונים שנוספו')) .list-row", (e) => e.map((x) => x.innerText.replace(/\s+/g, " ")));
step(6, `owner sees the lead: ${recent.join(" | ")}`);
const msg = await page.$eval(".action textarea", (e) => e.value).catch(() => "(no message yet)");
step(7, `message ready: ${msg}`);
await page.screenshot({ path: `${OUT}/e2e-page-3-owner.png`, fullPage: true });
console.log("page errors:", errors.length ? errors : "none");
await browser.close();
