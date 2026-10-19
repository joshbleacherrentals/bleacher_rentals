import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Dialog } from "@/components/ui/dialog";
import {
  SendQuoteReviewForm,
  SUBJECT_PLACEHOLDER,
  type SendQuoteReviewFormProps,
} from "./SendQuoteReviewForm";
import { attachmentRows } from "./sendDialogModel";
import { checkSendLimits, MAX_TOTAL_ATTACHMENT_BYTES, QUOTE_PDF_KEY } from "../../utils/sendQuote";

// Spec: docs/specs/quote-send-email-options.md §4 and §10 (component tests). The repo has no DOM
// test environment, so the form is rendered to markup; the behaviours that need events (Send,
// retry, cancel) are pinned in sendQuoteFlow.test.ts and EmailChipInput.test.ts.

const preview = [
  { key: QUOTE_PDF_KEY, name: "Quote.pdf", url: "https://x/q.pdf", sizeBytes: null },
  { key: "t1", name: "FAQ.pdf", url: "https://x/faq.pdf", sizeBytes: 1000 },
];

function render(over: Partial<SendQuoteReviewFormProps> = {}) {
  const fields = over.fields ?? { to: ["a@x.com"], cc: [], bcc: [] };
  const attachments = over.attachments ?? attachmentRows(preview, new Set(), []);
  const limits = checkSendLimits({
    ...fields,
    attachmentSizes: attachments.map((r) => r.sizeBytes),
  });
  const props: SendQuoteReviewFormProps = {
    from: "office@example.com",
    fields,
    onFieldsChange: vi.fn(),
    suggestions: [],
    subject: "",
    onSubjectChange: vi.fn(),
    attachments,
    onRemoveAttachment: vi.fn(),
    onAddFiles: vi.fn(),
    fileError: null,
    limitMessage: limits.ok ? null : limits.message,
    mobileView: false,
    onMobileViewChange: vi.fn(),
    sendable: fields.to.length > 0 && limits.ok,
    onSend: vi.fn(),
    onCancel: vi.fn(),
    ...over,
  };
  return renderToStaticMarkup(
    <Dialog open>
      <SendQuoteReviewForm {...props} />
    </Dialog>,
  );
}

// The class list contains "disabled:" variants, so look for the attribute itself.
const sendDisabled = (html: string) => /<button[^>]*\sdisabled=""[^>]*>Send<\/button>/.test(html);

describe("SendQuoteReviewForm", () => {
  it("shows To, Cc and Bcc, with To starting from the given addresses", () => {
    const html = render();
    for (const l of ["To", "Cc", "Bcc"]) expect(html).toContain(`>${l}</label>`);
    expect(html).toContain('data-testid="chip-to"');
    expect(html).not.toContain('data-testid="chip-cc"');
  });

  it("shows the placeholder when the subject is empty, and Send stays enabled", () => {
    const html = render({ subject: "" });
    expect(html).toContain(`placeholder="${SUBJECT_PLACEHOLDER.replace("'", "&#x27;")}"`);
    expect(sendDisabled(html)).toBe(false);
  });

  it("shows no remove button on the quote PDF but one on template files", () => {
    const html = render();
    expect(html).toContain("Quote.pdf");
    expect(html).not.toContain('aria-label="Remove Quote.pdf"');
    expect(html).toContain('aria-label="Remove FAQ.pdf"');
  });

  it("shows an added file as waiting, with a remove button", () => {
    const file = new File(["x"], "extra.pdf", { type: "application/pdf" });
    const html = render({
      attachments: attachmentRows(preview, new Set(), [{ id: "p1", file }]),
    });
    expect(html).toContain("extra.pdf");
    expect(html).toContain("will be uploaded on Send");
    expect(html).toContain('aria-label="Remove extra.pdf"');
  });

  it("disables Send and says which limit when attachments are too large (the PDF counts 0)", () => {
    const big = new File([""], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: MAX_TOTAL_ATTACHMENT_BYTES });
    const html = render({
      attachments: attachmentRows(preview, new Set(), [{ id: "p1", file: big }]),
    });
    expect(sendDisabled(html)).toBe(true);
    expect(html).toContain("Attachments are too large");
  });

  it("disables Send and names the recipient limit when over 50", () => {
    const many = Array.from({ length: 51 }, (_, i) => `u${i}@x.com`);
    const html = render({ fields: { to: many, cc: [], bcc: [] } });
    expect(sendDisabled(html)).toBe(true);
    expect(html).toContain("Too many recipients");
  });

  it("disables Send when To is empty", () => {
    expect(sendDisabled(render({ fields: { to: [], cc: ["c@x.com"], bcc: [] } }))).toBe(true);
  });

  it("shows a refusal message for a rejected file", () => {
    expect(render({ fileError: "x.exe: Invalid file type. Accepted: PDF." })).toContain(
      "Invalid file type",
    );
  });
});
