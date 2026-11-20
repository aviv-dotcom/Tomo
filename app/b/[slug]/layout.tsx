import { Suspense } from "react";
import { SavedToast } from "@/components/SavedToast";

export default async function BusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <>{children}<Suspense fallback={null}><SavedToast slug={slug} /></Suspense></>;
}
