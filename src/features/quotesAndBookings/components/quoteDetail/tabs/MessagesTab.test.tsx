import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The tab decides one thing: the chat, or the message that stands in for it. The chat itself
// (PowerSync, Supabase) is stubbed to a marker.
vi.mock("@/features/eventChat/components/EventInternalChat", () => ({
  EventInternalChat: ({ eventUuid }: { eventUuid: string }) => (
    <div data-testid="internal-chat">{eventUuid}</div>
  ),
}));

import { MessagesTab } from "./MessagesTab";

// docs/specs/accountant-quotes-11-accountant-internal-chat.md §4: the accountant uses the chat now, so
// the text that stands in for it names three roles.
const MESSAGE = "Internal chat is available to admins, account managers and accountants only.";
const OLD_MESSAGE = "Internal chat is available to admins and account managers only.";

const render = (useInternalChat: boolean) =>
  renderToStaticMarkup(<MessagesTab quoteId="evt-1" can={{ useInternalChat }} />);

describe("MessagesTab", () => {
  it("shows the internal chat, for this quote, when can.useInternalChat", () => {
    const html = render(true);
    expect(html).toContain('data-testid="internal-chat"');
    expect(html).toContain("evt-1");
    expect(html).not.toContain(MESSAGE);
  });

  it("S5: shows the message in place of the chat otherwise", () => {
    const html = render(false);
    expect(html).toContain(MESSAGE);
    expect(html).not.toContain('data-testid="internal-chat"');
  });

  it("no longer tells a role without the chat that it is for admins and account managers only", () => {
    expect(render(false)).not.toContain(OLD_MESSAGE);
  });

  it("keeps the Internal and External tabs either way", () => {
    for (const useInternalChat of [true, false]) {
      const html = render(useInternalChat);
      expect(html).toContain(">Internal<");
      expect(html).toContain(">External<");
    }
  });
});
