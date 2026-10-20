import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: "u" }) }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://s/${path}` } }),
      }),
    },
  }),
}));
vi.mock("@/features/automaticEmails/server/sendTriggerEmail", () => ({
  resolveTriggerEmail: async () => ({
    ok: true,
    email: {
      from: "f",
      to: "a@x.com",
      subject: "S",
      htmlBody: "<p/>",
      docData: { quoteNumber: "Q-1" },
      storedAttachmentRows: [
        { id: "row-1", file_name: "faq.pdf", storage_path: "t/faq.pdf", file_size_bytes: 500 },
        { id: "row-2", file_name: "coi.pdf", storage_path: "t/coi.pdf" },
      ],
    },
  }),
}));

import { GET } from "./route";

describe("GET /api/quotes/[id]/send-preview", () => {
  it("gives every attachment a stable key: quote_pdf, then the template row ids", async () => {
    const res = await GET(
      new NextRequest("http://localhost:3000/api/quotes/evt-1/send-preview?recipients=a@x.com"),
      { params: Promise.resolve({ id: "evt-1" }) },
    );
    const body = await res.json();
    expect(body.attachments.map((a: any) => a.key)).toEqual(["quote_pdf", "row-1", "row-2"]);
    expect(body.attachments[0]).toMatchObject({ name: "Q-1.pdf", url: "/api/quotes/evt-1/pdf" });
    expect(body.attachments[1]).toMatchObject({ name: "faq.pdf", sizeBytes: 500 });
  });
});
