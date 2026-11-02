import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Spec: docs/specs/accountant-collections-15-open-pdf.md §1, §3, §5 and §7. Static markup for what
// the button looks like in each state; the click itself is `openSignedPdf`, run here with the tab,
// the storage call and the toast replaced by stand-ins.

const mocks = vi.hoisted(() => ({
  signed: { signedPdfPath: null, isLoading: false } as {
    signedPdfPath: string | null;
    isLoading: boolean;
  },
  asked: [] as string[],
}));

vi.mock("../hooks/useSignedPdf", () => ({
  useSignedPdf: (eventId: string) => {
    mocks.asked.push(eventId);
    return mocks.signed;
  },
}));
vi.mock("@/utils/supabase/useClerkSupabaseClient", () => ({
  useClerkSupabaseClient: () => ({}),
}));
vi.mock("@/components/toasts/ErrorToast", () => ({ createErrorToastNoThrow: vi.fn() }));

import { OpenPdfButton, openSignedPdf } from "./OpenPdfButton";

const TOOLTIP = "Opens the signed invoice PDF, or the quote PDF if there is no signed invoice";

const render = (eventId = "evt-1") => renderToStaticMarkup(<OpenPdfButton eventId={eventId} />);

beforeEach(() => {
  mocks.signed = { signedPdfPath: null, isLoading: false };
  mocks.asked = [];
});

describe("OpenPdfButton: the quote PDF", () => {
  it("is a link that opens the live quote PDF of the event in a new tab", () => {
    const html = render("evt-9");
    expect(html).toMatch(/^<a\s/);
    expect(html).toContain('href="/api/quotes/evt-9/pdf"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Open PDF");
  });

  it("is the quote PDF for a signature that never stored its PDF", () => {
    mocks.signed = { signedPdfPath: "", isLoading: false };
    expect(render("evt-9")).toContain('href="/api/quotes/evt-9/pdf"');
  });

  it("asks for the signature of the event it is on", () => {
    render("evt-9");
    expect(mocks.asked).toEqual(["evt-9"]);
  });
});

describe("OpenPdfButton: the signed PDF", () => {
  beforeEach(() => {
    mocks.signed = { signedPdfPath: "evt-1/sig-1.pdf", isLoading: false };
  });

  it("is a button, not a link: the address is asked for at the click", () => {
    const html = render();
    expect(html).toMatch(/^<button[^>]*type="button"/);
    expect(html).not.toContain("<a");
    expect(html).not.toContain("href=");
    expect(html).not.toMatch(/\sdisabled=""/);
    expect(html).toContain("Open PDF");
  });

  it("does not put the signed path on the page", () => {
    expect(render()).not.toContain("sig-1");
  });
});

describe("OpenPdfButton: while the signature is being read", () => {
  it("is a disabled button, so nothing opens before it is known which PDF", () => {
    mocks.signed = { signedPdfPath: null, isLoading: true };
    const html = render();
    expect(html).toMatch(/^<button[^>]*type="button"/);
    expect(html).toMatch(/\sdisabled=""/);
    expect(html).not.toContain("<a");
    expect(html).not.toContain("/api/quotes/");
  });
});

describe("OpenPdfButton: the design", () => {
  it.each([
    ["the quote PDF", { signedPdfPath: null, isLoading: false }],
    ["the signed PDF", { signedPdfPath: "evt-1/sig-1.pdf", isLoading: false }],
    ["loading", { signedPdfPath: null, isLoading: true }],
  ])("has the tooltip, a document icon and a white outline on the dark header: %s", (_, state) => {
    mocks.signed = state;
    const html = render();
    expect(html).toContain(`title="${TOOLTIP}"`);
    expect(html).toContain("<svg");
    expect(html).toContain("border-white/55");
    expect(html).toContain("text-white");
    expect(html).toContain("h-9");
  });
});

function fakeTab() {
  return {
    opener: "the page" as unknown,
    location: { href: "about:blank" },
    close: vi.fn(),
  };
}

const SIGNED = { kind: "signed", bucket: "contracts", path: "evt-1/sig-1.pdf" } as const;

describe("openSignedPdf", () => {
  it("opens the tab before it waits for anything, then points it at the signed URL", async () => {
    const order: string[] = [];
    const tab = fakeTab();
    const createSignedUrl = vi.fn(async () => {
      order.push("signed url asked");
      return "https://storage.example/signed?token=abc";
    });
    const pending = openSignedPdf({
      target: SIGNED,
      openTab: () => {
        order.push("tab opened");
        return tab;
      },
      createSignedUrl,
      showError: vi.fn(),
    });
    // Synchronously, as in the click: the browser blocks a tab opened after an await.
    expect(order).toEqual(["tab opened", "signed url asked"]);
    await pending;

    expect(createSignedUrl).toHaveBeenCalledWith("contracts", "evt-1/sig-1.pdf");
    expect(tab.location.href).toBe("https://storage.example/signed?token=abc");
  });

  it("cuts the new tab off from the page that opened it", async () => {
    const tab = fakeTab();
    await openSignedPdf({
      target: SIGNED,
      openTab: () => tab,
      createSignedUrl: async () => "https://storage.example/signed",
      showError: vi.fn(),
    });
    expect(tab.opener).toBeNull();
  });

  it("shows the error, closes the blank tab and opens nothing else when the PDF cannot be signed", async () => {
    const tab = fakeTab();
    const showError = vi.fn();
    await openSignedPdf({
      target: SIGNED,
      openTab: () => tab,
      createSignedUrl: async () => {
        throw { message: "Object not found" };
      },
      showError,
    });

    expect(tab.close).toHaveBeenCalledTimes(1);
    // Never the quote PDF instead: the accountant must not read a different document by mistake.
    expect(tab.location.href).toBe("about:blank");
    expect(showError).toHaveBeenCalledTimes(1);
    expect(showError.mock.calls[0][0].join(" ")).toContain("Object not found");
  });

  it("shows the error and closes the tab when there is no connection", async () => {
    const tab = fakeTab();
    const showError = vi.fn();
    await openSignedPdf({
      target: SIGNED,
      openTab: () => tab,
      createSignedUrl: async () => {
        throw new TypeError("Failed to fetch");
      },
      showError,
    });
    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(showError.mock.calls[0][0].join(" ")).toContain("Failed to fetch");
  });

  it("says so when the browser blocked the new tab, and asks for nothing", async () => {
    const createSignedUrl = vi.fn(async () => "https://storage.example/signed");
    const showError = vi.fn();
    await openSignedPdf({ target: SIGNED, openTab: () => null, createSignedUrl, showError });

    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledTimes(1);
    expect(showError.mock.calls[0][0].join(" ")).toMatch(/pop-?up|blocked/i);
  });

  it("does not show an error when it worked", async () => {
    const showError = vi.fn();
    await openSignedPdf({
      target: SIGNED,
      openTab: () => fakeTab(),
      createSignedUrl: async () => "https://storage.example/signed",
      showError,
    });
    expect(showError).not.toHaveBeenCalled();
  });
});
