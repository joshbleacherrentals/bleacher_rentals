"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Toaster } from "sonner";
import { TanstackProvider } from "@/components/providers/TanstackProvider";
import { DynamicSystemProvider } from "@/components/providers/DynamicSystemProvider";
import { isEmbeddedQuotePage } from "@/features/quotesAndBookings/pdf/quoteEmbed";
import { SignedInComponents } from "./SignedInComponents";

/**
 * What the root layout renders around a page for a signed-in user: the Google Maps script, the
 * toaster, the providers (PowerSync among them) and the app's own frame (Header, Sidebar). The one
 * exception is the customer's page inside the invoice page's frame (`/quote/<id>?embed=1`): it
 * gets the bare page a customer gets (in a box that lets the scroll through), with no app frame, no
 * PowerSync and no redirect. A layout
 * cannot read the address' query, which is why this is a client component.
 * docs/specs/accountant-collections-16-customer-page-view.md §3.
 */
export function SignedInShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (isEmbeddedQuotePage(pathname, searchParams)) {
    // Not `AuthFallback`: its box holds the scroll (`overscroll-contain`), so a wheel turned over
    // the frame would stop at its edge instead of scrolling the invoice page.
    return <div className="h-dvh overflow-y-auto">{children}</div>;
  }

  return (
    <>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&loading=async`}
        strategy="afterInteractive"
      />
      <Toaster />
      <TanstackProvider>
        <DynamicSystemProvider>
          <SignedInComponents>{children}</SignedInComponents>
        </DynamicSystemProvider>
      </TanstackProvider>
    </>
  );
}
