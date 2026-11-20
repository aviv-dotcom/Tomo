"use client";
import { useState } from "react";
import { translator } from "@/lib/i18n";
import { Icon } from "@/components/Icon";

const t = translator("he");

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="btn btn-secondary btn-small" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>
      <Icon n={copied ? "check" : "copy"} />{copied ? t("site.copied") : t("sync.copy")}
    </button>
  );
}
