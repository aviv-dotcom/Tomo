import { notFound } from "next/navigation";
import { getPublicPage } from "@/lib/public";
import { OrderFlow } from "./OrderFlow";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ o?: string }> }) {
  const { slug } = await params;
  const { o } = await searchParams;
  const p = await getPublicPage(slug);
  if (!p) notFound();
  const products = p.offerings.filter((x) => x.delivery === "product").map((x) => ({ id: x.id, name: x.name, priceAgorot: x.priceAgorot }));
  if (products.length === 0) notFound();
  return <OrderFlow slug={slug} name={p.name} accent={p.accent ?? null} look={{ accent: p.accent, font_heading: p.font_heading, font_body: p.font_body, text_size: p.text_size }} products={products} start={products.some((x) => x.id === o) ? o! : null} />;
}
