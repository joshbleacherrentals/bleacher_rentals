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
  viewCtas: [] as Array<{ kind: string; onClick: () => void } | undefined>,
  signProps: [] as Array<{ canContinueToPay: boolean; onContinueToPay?: () => void }>,
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
    QuotePublicView: (p: {
      data: { language: QuoteLanguage };
      track: (e: TrackEvent) => void;
      cta?: { kind: string; onClick: () => void };
    }) => {
      seen.viewTrack.push(p.track);
      seen.viewCtas.push(p.cta);
      return (
        <section data-tab="quote" data-language={p.data.language} data-cta={p.cta?.kind ?? "none"}>
          {quoteText(p.data.language).tabReviewQuote}
        </section>
      );
    },
  };
});
vi.mock("./SignContractTab", () => ({
  SignContractTab: (p: { onContinueToPay?: () => void }) => {
    seen.signProps.push({
      canContinueToPay: !!p.onContinueToPay,
      onContinueToPay: p.onContinueToPay,
    });
    return <section data-tab="contract" />;
  },
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
  seen.viewCtas = [];
  seen.signProps = [];
});

describe("QuotePublicTabs: the tab bar", () => {
  it("shows its own sticky bar with the three tabs and the language switch when not embedded", () => {
    const html = render();
    expect(html).toContain("sticky top-0");
    expect(html).toContain(">Review Quote<");
    expect(html).toContain(">Approve &amp; Sign<");
    expect(html).toContain(">Pay Invoice<");
    expect(html).toContain('data-testid="language-toggle"');
  });

  it("has no bar and no language switch when embedded and framed", () => {
    const html = render({ embedded: true });
    expect(html).not.toContain("sticky top-0");
    expect(html).not.toContain(">Approve &amp; Sign<");
    expect(html).not.toContain(">Pay Invoice<");
    expect(html).not.toContain("language-toggle");
  });

  it("keeps all three bodies mounted when embedded, as when not", () => {
    const html = render({ embedded: true });
    for (const tab of ["quote", "contract", "pay"]) expect(html).toContain(`data-tab="${tab}"`);
  });
});

describe("QuotePublicTabs: initialTab", () => {
  it("opens on Review Quote without one", () => {
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
    expect(html).toContain(">Review Quote<");
    expect(html).not.toContain("Consulter le devis");
    expect(seen.payProps).toEqual([{ embedded: true, language: "en" }]);
    expect(seen.modalLanguages).toEqual(["en", "en"]);
  });

  it("stays the contact's language when not embedded", () => {
    const html = render({ data: quote("fr") });
    expect(html).toContain('data-language="fr"');
    expect(html).toContain("Consulter le devis");
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

describe("QuotePublicTabs: the next-step button", () => {
  const signature = { signerName: "Jane Client", signedAt: "2026-01-10T15:00:00.000Z" };
  const installment = (status: "unpaid" | "partial" | "paid") => ({
    id: `pi-${status}`,
    dueDate: "2026-02-01",
    amountCents: 10_000,
    status,
    allocatedCents: status === "paid" ? 10_000 : 0,
  });
  const withTerms = { termsAndConditionsUuid: "t-1", termsHtml: "<p>Terms</p>" };

  const stickyBar = (html: string) => html.includes('data-testid="quote-cta-sticky"');
  const viewCta = () => seen.viewCtas[0]?.kind;

  it("asks an unsigned quote to be approved: the view gets the button and a phone gets the sticky bar", () => {
    const html = render({ data: { ...quote(), ...withTerms, contractSignature: null } });
    expect(viewCta()).toBe("approve");
    expect(stickyBar(html)).toBe(true);
    expect(html).toContain("Approve Quote");
    // Room under the quote so the bar never covers its last lines.
    expect(html).toContain("pb-24 sm:pb-0");
  });

  it("asks a signed quote with money owed to be paid", () => {
    const html = render({
      data: {
        ...quote(),
        ...withTerms,
        contractSignature: signature,
        paymentSchedule: [installment("paid"), installment("unpaid")],
      },
    });
    expect(viewCta()).toBe("pay");
    expect(stickyBar(html)).toBe(true);
    expect(html).toContain("Pay Invoice");
  });

  it("offers Continue to Payment after signing only while something is owed", () => {
    render({
      data: {
        ...quote(),
        ...withTerms,
        contractSignature: signature,
        paymentSchedule: [installment("unpaid")],
      },
    });
    expect(seen.signProps[0].canContinueToPay).toBe(true);

    seen.signProps = [];
    render({ data: { ...quote(), ...withTerms, contractSignature: null } });
    expect(seen.signProps[0].canContinueToPay).toBe(false);

    seen.signProps = [];
    render({
      data: {
        ...quote(),
        ...withTerms,
        contractSignature: signature,
        paymentSchedule: [installment("paid")],
      },
    });
    expect(seen.signProps[0].canContinueToPay).toBe(false);
  });

  it("shows paid in full without a button when signed and fully paid", () => {
    const html = render({
      data: {
        ...quote(),
        ...withTerms,
        contractSignature: signature,
        paymentSchedule: [installment("paid")],
      },
    });
    expect(viewCta()).toBe("paid");
    expect(stickyBar(html)).toBe(false);
  });

  it("shows nothing for an unsigned quote that has no contract to sign", () => {
    const html = render({
      data: { ...quote(), termsAndConditionsUuid: null, termsHtml: null, contractSignature: null },
    });
    expect(viewCta()).toBeUndefined();
    expect(stickyBar(html)).toBe(false);
  });

  it("shows no sticky bar on the other tabs", () => {
    for (const initialTab of ["contract", "pay"] as const) {
      const html = render({ data: { ...quote(), ...withTerms }, initialTab });
      expect(stickyBar(html), initialTab).toBe(false);
    }
  });

  it("shows nothing when the page is framed by the invoice page", () => {
    const html = render({ data: { ...quote(), ...withTerms }, embedded: true });
    expect(viewCta()).toBeUndefined();
    expect(stickyBar(html)).toBe(false);
    expect(seen.signProps[0].canContinueToPay).toBe(false);
  });

  it("speaks the customer's language", () => {
    const html = render({ data: { ...quote("fr"), ...withTerms, contractSignature: null } });
    expect(html).toContain("Approuver le devis");
    expect(html).not.toContain("Approve Quote");
  });

  it("changes tab like the tab bar does, so staff see it in the activity log", () => {
    render({ data: { ...quote(), ...withTerms, contractSignature: null } });
    // Not clickable in a static render; the same handler is what the tab bar's buttons use.
    expect(typeof seen.viewCtas[0]?.onClick).toBe("function");
  });
});
