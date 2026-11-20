# Tomo

A management layer for small service businesses: "less admin, more sales". Separate from Mekusharim: own repo, own Supabase project (`tomo`, eu-central-1), own Vercel project.

Specs: architecture doc https://claude.ai/artifact/4jqaarAza7hAy91stEyDY2 · PRD https://claude.ai/artifact/Cn8rXb8fqocEnQSXMZtH8W · screens https://claude.ai/artifact/JfZJnLwKgSh8jdmQkVRU78

## Rules
- Every table with business data has `business_id`. Reads are protected by RLS. Browsers never write tables directly: every write is a SECURITY DEFINER function that checks the caller's role.
- No code checks which template (vertical) a business uses. Behaviour comes from offering settings and enabled modules.
- Money is integer agorot (`*_agorot`). Times are `timestamptz`, shown in the business time zone. Payments, refunds and the audit log are append-only.
- Shared SQL helpers use the `core_` prefix and are defined once, in 0001. Never redefine them in a later migration.
- Every migration gets `supabase/tests/security_test_NNNN.sql`. Run `npm run test:db` (needs a local Postgres) before pushing.
- Migrations are applied by the "Migrate database" workflow, not by hand on production.
- External calls (payments, receipts, WhatsApp, calendar, AI) go through `lib/adapters` / `lib/ai` and run from background jobs, never inside a database transaction.
- AI requests never include names, phone numbers, health data, client notes or photos.
- Every user-facing string goes in `lib/i18n/messages.ts`. Hebrew and RTL first.
