"use client";

import { FileText } from "lucide-react";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { errorMessage } from "@/features/quotesAndBookings/utils/eventFileUpload";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useSignedPdf } from "../hooks/useSignedPdf";
import { pdfTarget } from "../utils/pdfTarget";

/**
 * Open PDF in the header of the invoice page: the signed invoice PDF, or the live quote PDF when
 * there is no signed one, in a new tab so the invoice page keeps its state. The quote PDF is a
 * plain link; the signed one lives in a private bucket, so its address is asked for at the click.
 * A signed PDF that cannot be opened shows a toast and does not fall back to the quote PDF.
 * docs/specs/accountant-collections-15-open-pdf.md §1 and §3.
 */

const TOOLTIP = "Opens the signed invoice PDF, or the quote PDF if there is no signed invoice";
const SIGNED_URL_SECONDS = 3600;

/** The look of a button on the dark header; Open PDF and the Open Q/I link share it. */
export const HEADER_BUTTON =
  "inline-flex h-9 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border border-white/55 bg-transparent px-3.5 text-sm font-medium text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60";

type TabHandle = { opener: unknown; location: { href: string }; close: () => void };

/**
 * The click on a signed target. The blank tab is opened first, in the click itself: a tab opened
 * after an `await` can be blocked by the browser. It is cut off from this page, then pointed at
 * the signed address. On an error the blank tab is closed and nothing else is opened.
 */
export async function openSignedPdf({
  target,
  openTab,
  createSignedUrl,
  showError,
}: {
  target: { bucket: string; path: string };
  openTab: () => TabHandle | null;
  createSignedUrl: (bucket: string, path: string) => Promise<string>;
  showError: (lines: string[]) => void;
}): Promise<void> {
  const tab = openTab();
  if (!tab) {
    showError([
      "Could not open the PDF",
      "The browser blocked the new tab. Allow pop-ups for this site and try again.",
    ]);
    return;
  }
  tab.opener = null;
  try {
    tab.location.href = await createSignedUrl(target.bucket, target.path);
  } catch (err) {
    tab.close();
    showError(["Could not open the signed PDF", errorMessage(err)]);
  }
}

export function OpenPdfButton({ eventId }: { eventId: string }) {
  const supabase = useClerkSupabaseClient();
  const { signedPdfPath, isLoading } = useSignedPdf(eventId);
  const target = pdfTarget({ eventId, signedPdfPath });

  const content = (
    <>
      <FileText className="size-4" aria-hidden />
      Open PDF
    </>
  );

  // Until the signature is read it is not known which PDF to open.
  if (isLoading) {
    return (
      <button type="button" disabled title={TOOLTIP} className={HEADER_BUTTON}>
        {content}
      </button>
    );
  }

  if (target.kind === "quote") {
    return (
      <a
        href={target.href}
        target="_blank"
        rel="noopener noreferrer"
        title={TOOLTIP}
        className={HEADER_BUTTON}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      title={TOOLTIP}
      className={HEADER_BUTTON}
      onClick={() =>
        void openSignedPdf({
          target,
          openTab: () => window.open("", "_blank"),
          createSignedUrl: async (bucket, path) => {
            const { data, error } = await supabase.storage
              .from(bucket)
              .createSignedUrl(path, SIGNED_URL_SECONDS);
            if (error) throw error;
            return data.signedUrl;
          },
          showError: createErrorToastNoThrow,
        })
      }
    >
      {content}
    </button>
  );
}
