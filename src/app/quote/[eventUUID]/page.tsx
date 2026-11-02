import { buildQuoteDocumentData } from "@/features/quotesAndBookings/pdf/quoteDocumentData";
import { EMBED_PARAM, TAB_PARAM, parseEmbedTab } from "@/features/quotesAndBookings/pdf/quoteEmbed";
import { QuotePublicTabs } from "@/features/quotesAndBookings/pdf/QuotePublicTabs";
import { notFound } from "next/navigation";

export default async function PublicQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ eventUUID: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { eventUUID } = await params;
  const query = await searchParams;

  // Public quotes are addressed by event UUID only (non-enumerable). Invoice numbers
  // are a display label, never a route slug. See docs/specs/payment-history-security.md.
  const data = await buildQuoteDocumentData(eventUUID);
  if (!data) {
    notFound();
  }

  // The invoice page frames this page with ?embed=1&tab=…; read here so the first paint already
  // has no tab bar and shows the right tab. docs/specs/accountant-collections-16-customer-page-view.md.
  const embedded = query[EMBED_PARAM] === "1";
  const initialTab = embedded ? (parseEmbedTab(query[TAB_PARAM]) ?? undefined) : undefined;

  return <QuotePublicTabs data={data} embedded={embedded} initialTab={initialTab} />;
}
