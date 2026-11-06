"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Check } from "lucide-react";
import { QuoteDocumentData } from "./quoteDocumentData";
import { QuotePublicView } from "./QuotePublicView";
import { SignContractTab } from "./SignContractTab";
import { PayInvoiceTab } from "./PayInvoiceTab";
import { useQuoteActivityTracker } from "./useQuoteActivityTracker";
import { useQuoteFreshness } from "./useQuoteFreshness";
import { usePresenceCheck } from "./usePresenceCheck";
import { QuoteUpdatedModal } from "./QuoteUpdatedModal";
import { StillHereModal } from "./StillHereModal";
import { quoteText } from "./quoteStrings";
import type { QuoteLanguage } from "./quoteLanguage";
import { QuoteLanguageToggle } from "./QuoteLanguageToggle";
import { readStoredQuoteLanguage, writeStoredQuoteLanguage } from "./quoteLanguageStorage";
import {
  isSameOriginFrom,
  parseToChild,
  trackUnlessEmbedded,
  type EmbedTab,
  type ToParentMessage,
} from "./quoteEmbed";

type Tab = EmbedTab;

const TAB_ORDER: Tab[] = ["quote", "contract", "pay"];

// The activity trail is read by staff, so it always records English labels
// regardless of what the client is looking at.
const TRAIL_LANGUAGE_NAMES: Record<QuoteLanguage, string> = {
  en: "English",
  fr: "French",
};

/**
 * `embedded` is the invoice page's frame asking for the page without its own chrome
 * (`?embed=1`): it also records nothing in the activity log. It only takes effect as a frame
 * (`embeddedAndFramed`) once mounted shows there is a parent window; a visitor who opened the
 * address directly keeps the tab bar. docs/specs/accountant-collections-16-customer-page-view.md §3.
 */
export function QuotePublicTabs({
  data,
  embedded = false,
  initialTab,
}: {
  data: QuoteDocumentData;
  embedded?: boolean;
  initialTab?: Tab;
}) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? "quote");

  // The server draws the page from the address alone, so until mount it assumes a frame; after
  // mount, no parent window means someone opened the address directly.
  const [hasParent, setHasParent] = useState(true);
  useEffect(() => setHasParent(window.parent !== window), []);
  const embeddedAndFramed = embedded && hasParent;

  // Starts from the contact's preferred_language (server-rendered), then falls
  // back to this browser's saved correction. Read after mount, never during
  // render, so the server and first client render agree.
  const [language, setLanguage] = useState<QuoteLanguage>(data.language);
  useEffect(() => {
    const stored = readStoredQuoteLanguage(data.eventId);
    if (stored) setLanguage(stored);
  }, [data.eventId]);

  // In the invoice page's frame the accountant reads English whatever the contact's language;
  // `language` itself is untouched, so a direct visit keeps its own.
  const shownLanguage = embeddedAndFramed ? "en" : language;

  // One localized copy feeds every tab, the PDF link and the modals, so a
  // switch can never leave half the page in the other language.
  const localized = useMemo(() => ({ ...data, language: shownLanguage }), [data, shownLanguage]);
  const s = quoteText(shownLanguage);
  // Activity tracking always logs the ENGLISH label so staff reading the audit
  // trail see one consistent vocabulary regardless of the client's language.
  const tabLabels: Record<Tab, string> = {
    quote: s.tabApprovedQuote,
    contract: s.tabSignedContract,
    pay: s.tabPayInvoice,
  };
  const trackedTabLabels: Record<Tab, string> = {
    quote: quoteText("en").tabApprovedQuote,
    contract: quoteText("en").tabSignedContract,
    pay: quoteText("en").tabPayInvoice,
  };
  const liveTrack = useQuoteActivityTracker(data.eventId);
  // An embedded page (the accountant's view of it) records nothing, not even the first page view.
  const track = useMemo(() => trackUnlessEmbedded(embedded, liveTrack), [embedded, liveTrack]);
  // The freshness baseline moves when the client changes the page themselves —
  // signing is such a change. Anything else that differs is someone else's edit
  // and still raises the modal. See
  // docs/specs/payment-does-not-invalidate-signature.md §8.
  const [contentBaseline, setContentBaseline] = useState(data.contentHash);
  useEffect(() => setContentBaseline(data.contentHash), [data.contentHash]);
  const { isStale, refresh } = useQuoteFreshness(data.eventId, contentBaseline);
  const { promptPresence, confirmPresent } = usePresenceCheck();
  // Set when the sign endpoint rejects with 409 (quote changed at sign time).
  const [signConflict, setSignConflict] = useState(false);
  const quoteChanged = isStale || signConflict;

  useEffect(() => {
    track({ action_type: "client_page_view", next_value: data.quoteNumber });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The frame's side of the talk with the invoice page: it says it is ready and how tall the page
  // is (so only the invoice page scrolls), and shows the tab the invoice page's tabs ask for.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!embeddedAndFramed) return;
    const parent = window.parent;
    const tell = (message: ToParentMessage) => parent.postMessage(message, window.location.origin);

    function onMessage(event: MessageEvent) {
      if (!isSameOriginFrom(event, parent)) return;
      const message = parseToChild(event.data);
      if (message) setActiveTab(message.tab);
    }
    window.addEventListener("message", onMessage);
    tell({ type: "quote-embed:ready" });

    const root = rootRef.current;
    let observer: ResizeObserver | undefined;
    if (root && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() =>
        tell({
          type: "quote-embed:height",
          height: Math.ceil(root.getBoundingClientRect().height),
        }),
      );
      observer.observe(root);
    }
    return () => {
      window.removeEventListener("message", onMessage);
      observer?.disconnect();
    };
  }, [embeddedAndFramed]);

  function handleLanguageChange(next: QuoteLanguage) {
    if (next === language) return;
    writeStoredQuoteLanguage(data.eventId, next);
    setLanguage(next);
    // Tells the account manager the contact record has the wrong language.
    track({
      action_type: "client_language_change",
      field_name: "language",
      prev_value: TRAIL_LANGUAGE_NAMES[language],
      next_value: TRAIL_LANGUAGE_NAMES[next],
    });
  }

  function handleTabChange(tab: Tab) {
    if (tab === activeTab) return;
    track({
      action_type: "client_tab_change",
      field_name: "tab",
      prev_value: trackedTabLabels[activeTab],
      next_value: trackedTabLabels[tab],
    });
    setActiveTab(tab);
  }

  return (
    <div ref={rootRef}>
      {/* Staleness wins over presence: refreshing also proves the client is here. */}
      <QuoteUpdatedModal open={quoteChanged} onRefresh={refresh} language={shownLanguage} />
      <StillHereModal
        open={promptPresence && !quoteChanged}
        onConfirm={confirmPresent}
        language={shownLanguage}
      />

      {/* Tab bar — sticky on all sizes so the 3 steps stay reachable on mobile. Framed by the
          invoice page, its own tabs replace this bar. */}
      {!embeddedAndFramed && (
        <div className="sticky top-0 z-40 bg-white border-b shadow-sm sm:shadow-none pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-0">
          <div className="max-w-4xl mx-auto px-2 sm:px-4 sm:pt-6">
            <div className="flex items-center gap-2 sm:border-b">
              <div className="flex flex-1 sm:flex-none">
                {TAB_ORDER.map((tabKey, i) => {
                  const isActive = activeTab === tabKey;
                  const isPast =
                    (tabKey === "quote" && (activeTab === "contract" || activeTab === "pay")) ||
                    (tabKey === "contract" && activeTab === "pay");

                  return (
                    <button
                      key={tabKey}
                      onClick={() => handleTabChange(tabKey)}
                      className={`flex flex-1 sm:flex-none flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-6 py-2.5 sm:py-3 text-[13px] sm:text-sm font-semibold sm:font-medium border-b-2 transition-colors cursor-pointer ${
                        isActive
                          ? "border-[#405daa] text-[#405daa]"
                          : "border-transparent text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      <span
                        className={`w-6 h-6 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-xs shrink-0 ${
                          isActive || isPast
                            ? "bg-[#405daa] text-white"
                            : "bg-gray-200 text-gray-500"
                        }`}
                      >
                        {isPast ? <Check className="w-3 h-3" /> : i + 1}
                      </span>
                      <span className="text-center leading-tight">{tabLabels[tabKey]}</span>
                    </button>
                  );
                })}
              </div>

              {/* Client-side correction when the contact record has the wrong
                language. Never written back to the contact — see
                quoteLanguageStorage.ts. */}
              <div className="ml-auto pr-1 sm:pr-0 sm:pb-2">
                <QuoteLanguageToggle language={language} onChange={handleLanguageChange} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab content — all tabs stay mounted to preserve state */}
      <div className={activeTab === "quote" ? undefined : "hidden"}>
        <QuotePublicView data={localized} track={track} />
      </div>
      <div className={activeTab === "contract" ? undefined : "hidden"}>
        <SignContractTab
          data={localized}
          track={track}
          onQuoteChanged={() => setSignConflict(true)}
          onSigned={setContentBaseline}
        />
      </div>
      <div className={activeTab === "pay" ? undefined : "hidden"}>
        <PayInvoiceTab data={localized} track={track} embedded={embeddedAndFramed} />
      </div>
    </div>
  );
}
