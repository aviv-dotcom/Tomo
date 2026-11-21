import { translator } from "@/lib/i18n";
import { LegalPage } from "@/components/LegalPage";

const t = translator("he");

export default function TermsPage() {
  return <LegalPage title="legal.terms" back={{ href: "/", label: t("app.name") }} intro="terms.intro" footer="terms.draft"
    sections={[
      { title: "terms.account.title", body: "terms.account.body" }, { title: "terms.data.title", body: "terms.data.body" },
      { title: "terms.messages.title", body: "terms.messages.body" }, { title: "terms.money.title", body: "terms.money.body" },
      { title: "terms.service.title", body: "terms.service.body" },
    ]} />;
}
