import { describe, it, expect } from "vitest";
import type { WebRole } from "@/features/userAccess/logic/determineAccess";
import { getQuotesBookingsCapabilities } from "@/features/userAccess/logic/getQuotesBookingsCapabilities";
import { editQuotePageDecision, newQuotePageDecision } from "./quotePageGuard";

// docs/specs/accountant-quotes-04-accountant-quote-access.md, D2, D8, D11.
// The decisions of /quotes-bookings/new and /quotes-bookings/{id}/edit, as the capabilities of
// spec 03 answer them for a real user.

const ME = "user-me";
const SOMEONE_ELSE = "user-other";

const capsFor = (
  roles: WebRole[],
  over: { leadZoneIds?: string[]; accountManagerZoneIds?: string[]; createdByUserId?: string } = {},
) =>
  getQuotesBookingsCapabilities({
    roles,
    userId: ME,
    leadZoneIds: over.leadZoneIds ?? [],
    accountManagerZoneIds: over.accountManagerZoneIds ?? [],
    quote: { createdByUserId: over.createdByUserId ?? SOMEONE_ELSE },
  });

describe("newQuotePageDecision (/quotes-bookings/new)", () => {
  it("shows the form to a role that can create a quote", () => {
    for (const roles of [["admin"], ["account_manager"], ["admin", "viewer"]] as const) {
      expect(
        newQuotePageDecision({ rolesKnown: true, can: capsFor([...roles]) }),
        roles.join(),
      ).toBe("form");
    }
  });

  it("S5: redirects a role that cannot — the accountant and the viewer", () => {
    for (const roles of [["accountant"], ["viewer"], ["viewer", "accountant"]] as const) {
      expect(
        newQuotePageDecision({ rolesKnown: true, can: capsFor([...roles]) }),
        roles.join(),
      ).toBe("redirect");
    }
  });

  it("waits while the roles are not known yet — never a redirect, even though every capability is 'no'", () => {
    // The store's roles are empty until sign-in fills them, and a page's effect runs before the
    // effect that fills them: an admin who reloads /new must not be sent away.
    expect(newQuotePageDecision({ rolesKnown: false, can: capsFor([]) })).toBe("loading");
    expect(newQuotePageDecision({ rolesKnown: false, can: capsFor(["admin"]) })).toBe("loading");
  });
});

describe("editQuotePageDecision (/quotes-bookings/{id}/edit)", () => {
  const decide = (
    can: ReturnType<typeof capsFor>,
    over: { rolesKnown?: boolean; quoteLoaded?: boolean } = {},
  ) =>
    editQuotePageDecision({
      rolesKnown: over.rolesKnown ?? true,
      quoteLoaded: over.quoteLoaded ?? true,
      can,
    });

  it("S6: shows the form to an admin and to a lead account manager on any quote", () => {
    expect(decide(capsFor(["admin"]))).toBe("form");
    expect(
      decide(capsFor(["account_manager"], { leadZoneIds: ["z1"], accountManagerZoneIds: ["z1"] })),
    ).toBe("form");
  });

  it("S6: shows the form to a junior account manager on their own quote", () => {
    expect(
      decide(capsFor(["account_manager"], { accountManagerZoneIds: ["z1"], createdByUserId: ME })),
    ).toBe("form");
  });

  it("S6/R1: redirects a junior account manager on someone else's quote — today that form opens", () => {
    expect(decide(capsFor(["account_manager"], { accountManagerZoneIds: ["z1"] }))).toBe(
      "redirect",
    );
    expect(decide(capsFor(["account_manager"]))).toBe("redirect");
  });

  it("S6: redirects the accountant and the viewer, even on a quote they created", () => {
    expect(decide(capsFor(["accountant"]))).toBe("redirect");
    expect(decide(capsFor(["viewer"]))).toBe("redirect");
    expect(decide(capsFor(["viewer"], { createdByUserId: ME }))).toBe("redirect");
  });

  it("keeps the loading state until the quote has loaded — the creator is not known before", () => {
    expect(decide(capsFor(["account_manager"]), { quoteLoaded: false })).toBe("loading");
    expect(decide(capsFor(["admin"]), { quoteLoaded: false })).toBe("loading");
  });

  it("waits while the roles are not known yet, and never redirects on that", () => {
    expect(decide(capsFor([]), { rolesKnown: false })).toBe("loading");
    expect(decide(capsFor([]), { rolesKnown: false, quoteLoaded: false })).toBe("loading");
  });
});
