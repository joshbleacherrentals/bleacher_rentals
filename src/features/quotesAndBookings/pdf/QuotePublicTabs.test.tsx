import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { TrackEvent } from "./useQuoteActivityTracker";
import { buildSampleQuoteData } from "./sampleQuoteData";
import type { QuoteLanguage } from "./quoteLanguage";

// Spec: docs/specs/accountant-collections-16-customer-page-view.md §3 and §5. The page as the
// invoice page frames it (embedded), and as a customer opens it (not embedded). The tabs, the
// hooks and the modals have tests of their own; here they are stand-ins that show what they were
// given.

const seen = vi.hoisted(() => ({
  liveTrack: vi.fn(),
  viewTrack: [] as Array<(e: TrackEvent) => void>,
  payProps: [] as Array<{ embedded?: boolean; language: string }>,
  modalLanguages: [] as string[],
}));

vi.mock("./useQuoteActivityTracker", () => ({ useQuoteActivityTracker: () => seen.liveTrack }));
vi.mock("./useQuoteFreshness", () => ({
  useQuoteFreshness: () => ({ isStale: false, refresh: () => {} }),
}));
vi.mock("./usePresenceCheck", () => ({
  usePresenceCheck: () => ({ promptPresence: false, confirmPresent: () => {} }),
}));
vi.mock("./QuoteUpdatedModal", () => ({
  QuoteUpdatedModal: (p: { language: string }) => {
    seen.modalLanguages.push(p.language);
    return null;
  },
}));
vi.mock("./StillHereModal", () => ({
  StillHereModal: (p: { language: string }) => {
    seen.modalLanguages.push(p.language);
    return null;
  },
}));
vi.mock("./QuoteLanguageToggle", () => ({
  QuoteLanguageToggle: () => <button type="button" data-testid="language-toggle" />,
}));
vi.mock("./QuotePublicView", async () => {
  const { quoteText } = await import("./quoteStrings");
  return {
    QuotePublicView: (p: { data: { language: QuoteLanguage }; track: (e: TrackEvent) => void }) => {
      seen.viewTrack.push(p.track);
      return (
        <section data-tab="quote" data-language={p.data.language}>
          {quoteText(p.data.language).tabApprovedQuote}
        </section>
      );
    },
  };
});
vi.mock("./SignContractTab", () => ({
  SignContractTab: () => <section data-tab="contract" />,
}));
vi.mock("./PayInvoiceTab", () => ({
  PayInvoiceTab: (p: { embedded?: boolean; data: { language: string } }) => {
    seen.payProps.push({ embedded: p.embedded, language: p.data.language });
    return <section data-tab="pay" />;
  },
}));

import { QuotePublicTabs } from "./QuotePublicTabs";

function quote(language: QuoteLanguage = "en") {
  return {
    ...buildSampleQuoteData({ name: "Office", street: "1 Main", zip: "10001", paymentInfo: "" }),
    language,
  };
}

function render(props: Partial<Parameters<typeof QuotePublicTabs>[0]> = {}) {
  return renderToStaticMarkup(<QuotePublicTabs data={quote()} {...props} />);
}

const hiddenWrapper = (html: string, tab: string) =>
  new RegExp(`<div class="hidden"><section data-tab="${tab}"`).test(html);
const shownWrapper = (html: string, tab: string) =>
  new RegExp(`<div><section data-tab="${tab}"`).test(html);

beforeEach(() => {
  seen.liveTrack.mockReset();
  seen.viewTrack = [];
  seen.payProps = [];
  seen.modalLanguages = [];
});

describe("QuotePublicTabs: the tab bar", () => {
  it("shows its own sticky bar with the three tabs and the language switch when not embedded", () => {
    const html = render();
    expect(html).toContain("sticky top-0");
    expect(html).toContain(">Approved Quote<");
    expect(html).toContain(">Signed Contract<");
    expect(html).toContain(">Pay Invoice<");
    expect(html).toContain('data-testid="language-toggle"');
  });

  it("has no bar and no language switch when embedded and framed", () => {
    const html = render({ embedded: true });
    expect(html).not.toContain("sticky top-0");
    expect(html).not.toContain(">Signed Contract<");
    expect(html).not.toContain(">Pay Invoice<");
    expect(html).not.toContain("language-toggle");
  });

  it("keeps all three bodies mounted when embedded, as when not", () => {
    const html = render({ embedded: true });
    for (const tab of ["quote", "contract", "pay"]) expect(html).toContain(`data-tab="${tab}"`);
  });
});

describe("QuotePublicTabs: initialTab", () => {
  it("opens on Approved Quote without one", () => {
    const html = render({ embedded: true });
    expect(shownWrapper(html, "quote")).toBe(true);
    expect(hiddenWrapper(html, "contract")).toBe(true);
    expect(hiddenWrapper(html, "pay")).toBe(true);
  });

  it.each(["quote", "contract", "pay"] as const)("shows only the %s body", (initialTab) => {
    const html = render({ embedded: true, initialTab });
    for (const tab of ["quote", "contract", "pay"]) {
      expect(shownWrapper(html, tab), tab).toBe(tab === initialTab);
      expect(hiddenWrapper(html, tab), tab).toBe(tab !== initialTab);
    }
  });
});

describe("QuotePublicTabs: the language", () => {
  it("is English everywhere when embedded and framed, for a French contact", () => {
    const html = render({ data: quote("fr"), embedded: true });
    expect(html).toContain('data-language="en"');
    expect(html).toContain(">Approved Quote<");
    expect(html).not.toContain("Devis approuvé");
    expect(seen.payProps).toEqual([{ embedded: true, language: "en" }]);
    expect(seen.modalLanguages).toEqual(["en", "en"]);
  });

  it("stays the contact's language when not embedded", () => {
    const html = render({ data: quote("fr") });
    expect(html).toContain('data-language="fr"');
    expect(html).toContain("Devis approuvé");
    expect(seen.payProps).toEqual([{ embedded: false, language: "fr" }]);
    expect(seen.modalLanguages).toEqual(["fr", "fr"]);
  });
});

describe("QuotePublicTabs: the activity log", () => {
  const event: TrackEvent = { action_type: "client_tab_change", field_name: "tab" };

  it("records nothing when embedded", () => {
    render({ embedded: true });
    for (const track of seen.viewTrack) track(event);
    expect(seen.liveTrack).not.toHaveBeenCalled();
  });

  it("records as before when not embedded", () => {
    render();
    for (const track of seen.viewTrack) track(event);
    expect(seen.liveTrack).toHaveBeenCalledExactlyOnceWith(event);
  });
});
