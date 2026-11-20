/**
 * A template is configuration, not code. Creating a business copies it into data, and the owner can change anything.
 * Rule: no code anywhere checks which template a business uses. Behaviour comes from offerings and enabled modules.
 */
export type Delivery = "appointment" | "class" | "project" | "membership" | "product" | "addon";
export type Billing = "one_time" | "pack" | "subscription" | "dues";
export type ModuleKey = "formula" | "before_after" | "workout_plans" | "habits" | "lesson_notes" | "family";

export type Template = {
  key: string;
  vocabulary: { client: string; clients: string; session: string };
  modules: ModuleKey[];
  sampleOfferings: { name: string; delivery: Delivery; billing: Billing; minutes?: number; priceAgorot: number; depositAgorot?: number }[];
  automations: string[];
};

export const templates: Template[] = [
  {
    key: "fitness",
    vocabulary: { client: "מתאמן", clients: "מתאמנים", session: "אימון" },
    modules: ["workout_plans", "habits"],
    sampleOfferings: [
      { name: "קבוצת כוח", delivery: "class", billing: "subscription", minutes: 60, priceAgorot: 32000 },
      { name: "כרטיסייה 10 אימונים", delivery: "class", billing: "pack", priceAgorot: 60000 },
      { name: "אימון אישי", delivery: "appointment", billing: "one_time", minutes: 60, priceAgorot: 25000 },
    ],
    automations: ["session_reminder", "missed_you", "pack_renewal", "payment_reminder"],
  },
  {
    key: "beauty",
    vocabulary: { client: "לקוחה", clients: "לקוחות", session: "טיפול" },
    modules: ["formula", "before_after"],
    sampleOfferings: [
      { name: "טיפול פנים", delivery: "appointment", billing: "one_time", minutes: 60, priceAgorot: 38000, depositAgorot: 8000 },
      { name: "מילוי ג׳ל", delivery: "appointment", billing: "one_time", minutes: 75, priceAgorot: 22000 },
      { name: "מסכת קולגן", delivery: "addon", billing: "one_time", minutes: 15, priceAgorot: 6000 },
    ],
    automations: ["booking_reminder", "time_to_return", "no_show_followup"],
  },
];
