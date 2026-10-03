import { describe, it, expect } from "vitest";
import type { WebRole } from "./determineAccess";
import {
  getQuotesBookingsCapabilities,
  type QuotesBookingsCapabilities,
} from "./getQuotesBookingsCapabilities";

const ME = "user-me";
const SOMEONE_ELSE = "user-other";

type Input = Parameters<typeof getQuotesBookingsCapabilities>[0];

const capsFor = (roles: WebRole[], over: Partial<Input> = {}) =>
  getQuotesBookingsCapabilities({
    roles,
    userId: ME,
    leadZoneIds: [],
    accountManagerZoneIds: [],
    quote: { createdByUserId: SOMEONE_ELSE },
    ...over,
  });

const NOTHING: QuotesBookingsCapabilities = {
  createQuote: false,
  manageQuote: false,
  sendToClient: false,
  showRecordPayment: false,
  recordPayment: false,
  setQuickBooksFlag: false,
  useInternalChat: false,
  openInDashboard: false,
};

describe("admin", () => {
  it("can do everything, on any quote", () => {
    expect(capsFor(["admin"])).toEqual({
      createQuote: true,
      manageQuote: true,
      sendToClient: true,
      showRecordPayment: true,
      recordPayment: true,
      setQuickBooksFlag: true,
      useInternalChat: true,
      openInDashboard: true,
    });
  });

  it("needs no zones and no ownership", () => {
    const caps = capsFor(["admin"], { userId: null, quote: { createdByUserId: null } });
    expect(caps.manageQuote).toBe(true);
    expect(caps.recordPayment).toBe(true);
  });
});

describe("lead account manager", () => {
  const lead = { leadZoneIds: ["zone-a"], accountManagerZoneIds: ["zone-a", "zone-b"] };

  it("can do everything on a quote they did not create (S2)", () => {
    expect(capsFor(["account_manager"], lead)).toEqual({
      createQuote: true,
      manageQuote: true,
      sendToClient: true,
      showRecordPayment: true,
      recordPayment: true,
      setQuickBooksFlag: true,
      useInternalChat: true,
      openInDashboard: true,
    });
  });

  it("can do the same on their own quote", () => {
    const caps = capsFor(["account_manager"], { ...lead, quote: { createdByUserId: ME } });
    expect(caps.manageQuote).toBe(true);
    expect(caps.recordPayment).toBe(true);
  });
});

describe("junior account manager", () => {
  const junior = { leadZoneIds: [], accountManagerZoneIds: ["zone-b"] };

  it("S3: on someone else's quote cannot manage it or press Record Payment, but still sees the button", () => {
    const caps = capsFor(["account_manager"], junior);
    expect(caps.manageQuote).toBe(false);
    expect(caps.showRecordPayment).toBe(true);
    expect(caps.recordPayment).toBe(false);
  });

  it("S3: on someone else's quote can still send it, set the QuickBooks flag and use the chat", () => {
    const caps = capsFor(["account_manager"], junior);
    expect(caps.sendToClient).toBe(true);
    expect(caps.setQuickBooksFlag).toBe(true);
    expect(caps.useInternalChat).toBe(true);
    expect(caps.openInDashboard).toBe(true);
  });

  it("S4: on their own quote can manage it and press Record Payment", () => {
    const caps = capsFor(["account_manager"], { ...junior, quote: { createdByUserId: ME } });
    expect(caps.manageQuote).toBe(true);
    expect(caps.recordPayment).toBe(true);
  });

  it("can create a quote", () => {
    expect(capsFor(["account_manager"], junior).createQuote).toBe(true);
  });

  it("with a bleacher in a zone they cannot access, only the creator may manage the quote", () => {
    const bleacherElsewhere = { eventBleacherZoneIds: ["zone-not-mine"] };
    expect(
      capsFor(["account_manager"], {
        ...junior,
        quote: { createdByUserId: SOMEONE_ELSE, ...bleacherElsewhere },
      }).manageQuote,
    ).toBe(false);
    expect(
      capsFor(["account_manager"], {
        ...junior,
        quote: { createdByUserId: ME, ...bleacherElsewhere },
      }).manageQuote,
    ).toBe(true);
  });

  it("even a lead cannot manage a quote that has a bleacher in a zone they cannot access", () => {
    expect(
      capsFor(["account_manager"], {
        leadZoneIds: ["zone-a"],
        accountManagerZoneIds: ["zone-a"],
        quote: { createdByUserId: SOMEONE_ELSE, eventBleacherZoneIds: ["zone-not-mine"] },
      }).manageQuote,
    ).toBe(false);
  });
});

describe("account manager with no zones", () => {
  it("is treated as a junior: own quotes only", () => {
    expect(capsFor(["account_manager"]).manageQuote).toBe(false);
    expect(capsFor(["account_manager"], { quote: { createdByUserId: ME } }).manageQuote).toBe(true);
  });

  it("cannot manage anything without knowing who they are", () => {
    expect(capsFor(["account_manager"], { userId: null }).manageQuote).toBe(false);
  });
});

describe("viewer (the D1 case)", () => {
  it("S5/S6: cannot create, manage, send, or record a payment — and does not see the button", () => {
    const caps = capsFor(["viewer"]);
    expect(caps.createQuote).toBe(false);
    expect(caps.manageQuote).toBe(false);
    expect(caps.sendToClient).toBe(false);
    expect(caps.showRecordPayment).toBe(false);
    expect(caps.recordPayment).toBe(false);
  });

  it("cannot manage even a quote they created, nor with zones that would make an account manager a lead", () => {
    const caps = capsFor(["viewer"], {
      leadZoneIds: ["zone-a"],
      accountManagerZoneIds: ["zone-a"],
      quote: { createdByUserId: ME },
    });
    expect(caps.manageQuote).toBe(false);
    expect(caps.recordPayment).toBe(false);
  });

  it("S5: cannot change the QuickBooks flag and has no internal chat, but can open the dashboard", () => {
    const caps = capsFor(["viewer"]);
    expect(caps.setQuickBooksFlag).toBe(false);
    expect(caps.useInternalChat).toBe(false);
    expect(caps.openInDashboard).toBe(true);
  });

  it("is all 'no' except Open in Dashboard", () => {
    expect(capsFor(["viewer"])).toEqual({ ...NOTHING, openInDashboard: true });
  });
});

describe("the other roles", () => {
  it("maintainer: nothing on the quote, but the dashboard is theirs", () => {
    expect(capsFor(["maintainer"])).toEqual({ ...NOTHING, openInDashboard: true });
  });

  it.each(["developer", "driver", "accountant"] as const)(
    "%s: every capability is 'no'",
    (role) => {
      expect(capsFor([role])).toEqual(NOTHING);
    },
  );

  it("accountant: stays all 'no' even with the zones and the ownership that would help a manager", () => {
    expect(
      capsFor(["accountant"], {
        leadZoneIds: ["zone-a"],
        accountManagerZoneIds: ["zone-a"],
        quote: { createdByUserId: ME },
      }),
    ).toEqual(NOTHING);
  });

  it("no roles at all (the store before sign-in completes): every capability is 'no'", () => {
    expect(capsFor([])).toEqual(NOTHING);
  });

  it("a role the function does not know is 'no' for everything", () => {
    expect(capsFor(["superuser" as WebRole])).toEqual(NOTHING);
  });
});

describe("roles are additive", () => {
  it("admin + viewer: admin's rights", () => {
    expect(capsFor(["admin", "viewer"])).toEqual(capsFor(["admin"]));
  });

  it("account manager + viewer: the account manager's rules, owner rule included", () => {
    expect(capsFor(["account_manager", "viewer"])).toEqual(capsFor(["account_manager"]));
    expect(capsFor(["account_manager", "viewer"]).manageQuote).toBe(false);
    expect(
      capsFor(["account_manager", "viewer"], { quote: { createdByUserId: ME } }).manageQuote,
    ).toBe(true);
  });

  it("account manager + accountant: what the account manager has, and the dashboard", () => {
    expect(capsFor(["account_manager", "accountant"])).toEqual(capsFor(["account_manager"]));
  });

  it("viewer + accountant: still no create, manage, send or payment", () => {
    expect(capsFor(["viewer", "accountant"])).toEqual({ ...NOTHING, openInDashboard: true });
  });
});

describe("no quote (the list)", () => {
  it("createQuote does not depend on a quote", () => {
    expect(
      getQuotesBookingsCapabilities({
        roles: ["account_manager"],
        userId: ME,
        leadZoneIds: [],
        accountManagerZoneIds: [],
      }).createQuote,
    ).toBe(true);
    expect(
      getQuotesBookingsCapabilities({
        roles: ["viewer"],
        userId: ME,
        leadZoneIds: [],
        accountManagerZoneIds: [],
      }).createQuote,
    ).toBe(false);
  });
});
