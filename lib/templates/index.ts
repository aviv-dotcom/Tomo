import type { IconName } from "@/components/Icon";
/**
 * A template is configuration, not code. Its Hebrew names and sample offerings are starting data copied into the
 * business on setup (the owner edits them later), so they live here rather than in the message file.
 * Creating a business copies it into data, and the owner can change anything.
 * Rule: no code anywhere checks which template a business uses. Behaviour comes from offerings and enabled modules.
 */
export type Delivery = "appointment" | "class" | "project" | "membership" | "product" | "addon";
export type Billing = "one_time" | "pack" | "subscription" | "dues";
export type ModuleKey = "formula" | "before_after" | "workout_plans" | "habits" | "lesson_notes" | "family" | "visit_summary" | "recommendations";

export type TemplateKey = "fitness" | "beauty" | "tutor" | "custom";

export type Template = {
  key: TemplateKey;
  icon: IconName;
  vocabulary: { client: string; clients: string; session: string };
  modules: ModuleKey[];
  sampleOfferings: { name: string; delivery: Delivery; billing: Billing; minutes?: number; priceAgorot: number; depositAgorot?: number }[];
  automations: string[];
};

export const templates: Template[] = [
  {
    key: "fitness",
    icon: "zap",
    vocabulary: { client: "מתאמן", clients: "מתאמנים", session: "אימון" },
    modules: ["workout_plans", "habits", "visit_summary", "recommendations"],
    sampleOfferings: [
      { name: "קבוצת כוח", delivery: "class", billing: "subscription", minutes: 60, priceAgorot: 32000 },
      { name: "כרטיסייה 10 אימונים", delivery: "class", billing: "pack", priceAgorot: 60000 },
      { name: "אימון אישי", delivery: "appointment", billing: "one_time", minutes: 60, priceAgorot: 25000 },
    ],
    automations: ["session_reminder", "missed_you", "pack_renewal", "payment_reminder"],
  },
  {
    key: "beauty",
    icon: "sparkles",
    vocabulary: { client: "לקוחה", clients: "לקוחות", session: "טיפול" },
    modules: ["formula", "before_after", "visit_summary", "recommendations"],
    sampleOfferings: [
      { name: "טיפול פנים", delivery: "appointment", billing: "one_time", minutes: 60, priceAgorot: 38000, depositAgorot: 8000 },
      { name: "מילוי ג׳ל", delivery: "appointment", billing: "one_time", minutes: 75, priceAgorot: 22000 },
      { name: "מסכת קולגן", delivery: "addon", billing: "one_time", minutes: 15, priceAgorot: 6000 },
    ],
    automations: ["booking_reminder", "time_to_return", "no_show_followup"],
  },
  {
    key: "tutor",
    icon: "list",
    vocabulary: { client: "תלמיד", clients: "תלמידים", session: "שיעור" },
    modules: ["lesson_notes", "family", "visit_summary", "recommendations"],
    sampleOfferings: [
      { name: "שיעור פרטי", delivery: "appointment", billing: "one_time", minutes: 60, priceAgorot: 18000 },
      { name: "כרטיסייה 10 שיעורים", delivery: "appointment", billing: "pack", priceAgorot: 160000 },
    ],
    automations: ["booking_reminder", "pack_renewal"],
  },
  {
    key: "custom",
    icon: "store",
    vocabulary: { client: "לקוח", clients: "לקוחות", session: "פגישה" },
    modules: ["visit_summary"],
    sampleOfferings: [],
    automations: ["booking_reminder"],
  },
];

export const templateByKey = (key: string) => templates.find((t) => t.key === key);
