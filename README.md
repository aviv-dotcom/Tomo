# Tomo

מערכת לעסקים קטנים: פחות ניהול, יותר מכירות.

## הרצה מקומית

```bash
cp .env.example .env.local   # למלא את המפתחות מ-Supabase
npm install
npm run dev
```

## בדיקות

- `npm run typecheck`, `npm run build`
- `npm run test:db`: מריץ את כל המיגרציות על Postgres מקומי ואת בדיקות האבטחה. ב-CI זה רץ אוטומטית.

## מבנה

- `app/`: האפליקציה (Next.js). `api/health` לבדיקת חיים, `api/worker` לעובד הרקע.
- `lib/`: חיבור ל-Supabase, תרגומים, תבניות תחום, עבודות רקע.
- `supabase/migrations/`: מבנה מסד הנתונים. `supabase/tests/`: בדיקות אבטחה לכל מיגרציה.

פרטים מלאים במסמך הארכיטקטורה (קישור ב-`CLAUDE.md`).
