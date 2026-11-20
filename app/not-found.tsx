import Link from "next/link";
import { translator } from "@/lib/i18n";
import { IconTile } from "@/components/Icon";

const t = translator("he");

export default function NotFound() {
  return (
    <main className="page notfound">
      <IconTile n="search" size={64} tone="plain" />
      <h1 className="h1">{t("nf.title")}</h1>
      <p className="sub">{t("nf.body")}</p>
      <Link className="btn btn-secondary" href="/">{t("nf.home")}</Link>
    </main>
  );
}
