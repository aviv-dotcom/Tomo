/** Every user-facing string lives here. Hebrew first; other languages follow the same keys. */
export const he = {
  "app.name": "Tomo",
  "home.title": "פחות ניהול, יותר מכירות",
  "home.subtitle": "מערכת לעסקים קטנים שעושה את רוב העבודה לבד, ואתם רק מאשרים.",
  "home.status": "שלד המערכת פעיל",
  "home.db.ok": "מסד הנתונים מחובר",
  "home.db.missing": "מסד הנתונים עוד לא מוגדר",
} as const;

export type MessageKey = keyof typeof he;

export const en: Record<MessageKey, string> = {
  "app.name": "Tomo",
  "home.title": "Less admin, more sales",
  "home.subtitle": "A system for small businesses that does most of the work for you. You just approve.",
  "home.status": "The skeleton is running",
  "home.db.ok": "Database connected",
  "home.db.missing": "Database not configured yet",
};
