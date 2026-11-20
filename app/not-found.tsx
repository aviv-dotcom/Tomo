import Link from "next/link";
import { translator } from "@/lib/i18n";

const t = translator("he");

export default function NotFound() {
  return (
    <main className="page notfound">
      <div className="hero-mark">?</div>
      <h1 className="h1">{t("nf.title")}</h1>
      <p className="sub">{t("nf.body")}</p>
      <Link className="btn btn-secondary" href="/">{t("nf.home")}</Link>
    </main>
  );
}
