import { Suspense } from "react";
import { InvoicePage } from "@/features/accountantCollections/components/InvoicePage";

/**
 * /accountant/invoice?id=<event uuid>&tab=info|tasks: the invoice page of the Collections tab.
 * docs/specs/accountant-collections-09-design.md §3. Reached through the `/accountant` prefix, so
 * only the admin and the accountant can open it.
 */
export default function AccountantInvoicePage() {
  // `useSearchParams` needs a Suspense boundary above it.
  return (
    <Suspense fallback={null}>
      <InvoicePage />
    </Suspense>
  );
}
