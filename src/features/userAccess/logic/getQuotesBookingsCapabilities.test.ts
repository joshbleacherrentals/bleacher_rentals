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

  it("can do everything but record a payment, on a quote they did not create (S2)", () => {
    expect(capsFor(["account_manager"], lead)).toEqual({
      createQuote: true,
      manageQuote: true,
      sendToClient: true,
      recordPayment: false,
      setQuickBooksFlag: true,
      useInternalChat: true,
      openInDashboard: true,
    });
  });

  it("can manage their own quote, and still cannot record a payment on it", () => {
    const caps = capsFor(["account_manager"], { ...lead, quote: { createdByUserId: ME } });
    expect(caps.manageQuote).toBe(true);
    expect(caps.recordPayment).toBe(false);
  });
});

describe("junior account manager", () => {
  const junior = { leadZoneIds: [], accountManagerZoneIds: ["zone-b"] };

  it("S3: on someone else's quote cannot manage it or record a payment", () => {
    const caps = capsFor(["account_manager"], junior);
    expect(caps.manageQuote).toBe(false);
    expect(caps.recordPayment).toBe(false);
  });

  it("S3: on someone else's quote can still send it, set the QuickBooks flag and use the chat", () => {
    const caps = capsFor(["account_manager"], junior);
    expect(caps.sendToClient).toBe(true);
    expect(caps.setQuickBooksFlag).toBe(true);
    expect(caps.useInternalChat).toBe(true);
    expect(caps.openInDashboard).toBe(true);
  });

  it("S4: on their own quote can manage it, but still cannot record a payment", () => {
    const caps = capsFor(["account_manager"], { ...junior, quote: { createdByUserId: ME } });
    expect(caps.manageQuote).toBe(true);
    expect(caps.recordPayment).toBe(false);
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

  it.each(["developer", "driver"] as const)("%s: every capability is 'no'", (role) => {
    expect(capsFor([role])).toEqual(NOTHING);
  });

  it("no roles at all (the store before sign-in completes): every capability is 'no'", () => {
    expect(capsFor([])).toEqual(NOTHING);
  });

  it("a role the function does not know is 'no' for everything", () => {
    expect(capsFor(["superuser" as WebRole])).toEqual(NOTHING);
  });
});

// docs/specs/accountant-quotes-05-is-qbo-column.md: the accountant changes the QuickBooks Invoice
// flag. docs/specs/accountant-quotes-10-accountant-writes-payments.md adds the payments: they record,
// edit and delete them. Spec 11 (chat) will add a cell; it has to edit this block on purpose.
describe("accountant", () => {
  it("can set the QuickBooks flag, on a quote they did not create", () => {
    expect(capsFor(["accountant"]).setQuickBooksFlag).toBe(true);
  });

  it("can set it on their own quote too, and with no quote at all", () => {
    expect(capsFor(["accountant"], { quote: { createdByUserId: ME } }).setQuickBooksFlag).toBe(
      true,
    );
    expect(capsFor(["accountant"], { quote: undefined }).setQuickBooksFlag).toBe(true);
  });

  it("can record, edit and delete payments, on a quote they did not create", () => {
    expect(capsFor(["accountant"]).recordPayment).toBe(true);
  });

  it("can do nothing else: the flag and the payments are the only 'yes' in their column", () => {
    expect(capsFor(["accountant"])).toEqual({
      ...NOTHING,
      setQuickBooksFlag: true,
      recordPayment: true,
    });
  });

  it("stays at the flag and the payments even with the zones and the ownership that would help a manager", () => {
    expect(
      capsFor(["accountant"], {
        leadZoneIds: ["zone-a"],
        accountManagerZoneIds: ["zone-a"],
        quote: { createdByUserId: ME },
      }),
    ).toEqual({ ...NOTHING, setQuickBooksFlag: true, recordPayment: true });
  });

  it("cannot edit, delete or send a quote — the database refuses any other column too", () => {
    const caps = capsFor(["accountant"]);
    expect(caps.manageQuote).toBe(false);
    expect(caps.sendToClient).toBe(false);
    expect(caps.createQuote).toBe(false);
    expect(caps.useInternalChat).toBe(false);
    expect(caps.openInDashboard).toBe(false);
  });

  it("is the only role that gains the flag: a viewer, maintainer, developer and driver do not", () => {
    for (const role of ["viewer", "maintainer", "developer", "driver"] as const) {
      expect(capsFor([role]).setQuickBooksFlag, role).toBe(false);
    }
  });
});

// docs/specs/accountant-quotes-06-am-read-only-payments.md: only the roles the database lets write
// payments are shown the button — no other role is. Spec 06 left an admin; after
// docs/specs/accountant-quotes-10-accountant-writes-payments.md an accountant joins, on any quote
// (D1). There is one answer (no "drawn but disabled" state), and it does not depend on the quote.
describe("recordPayment: admin and accountant only", () => {
  const lead = { leadZoneIds: ["zone-a"], accountManagerZoneIds: ["zone-a"] };
  const junior = { leadZoneIds: [], accountManagerZoneIds: ["zone-b"] };
  const own = { quote: { createdByUserId: ME } };
  const others = { quote: { createdByUserId: SOMEONE_ELSE } };

  it("is true for an admin, on any quote", () => {
    expect(capsFor(["admin"], own).recordPayment).toBe(true);
    expect(capsFor(["admin"], others).recordPayment).toBe(true);
  });

  it("is true for an accountant, on any quote: their own, someone else's, and none at all (D1)", () => {
    expect(capsFor(["accountant"], own).recordPayment).toBe(true);
    expect(capsFor(["accountant"], others).recordPayment).toBe(true);
    expect(capsFor(["accountant"], { quote: undefined }).recordPayment).toBe(true);
  });

  it("is false for a lead account manager, on their own quote and on someone else's", () => {
    expect(capsFor(["account_manager"], { ...lead, ...own }).recordPayment).toBe(false);
    expect(capsFor(["account_manager"], { ...lead, ...others }).recordPayment).toBe(false);
  });

  it("is false for a junior account manager, on their own quote and on someone else's", () => {
    expect(capsFor(["account_manager"], { ...junior, ...own }).recordPayment).toBe(false);
    expect(capsFor(["account_manager"], { ...junior, ...others }).recordPayment).toBe(false);
  });

  it("is false for an account manager with no zones, and with no quote at all", () => {
    expect(capsFor(["account_manager"], own).recordPayment).toBe(false);
    expect(capsFor(["account_manager"], { quote: undefined }).recordPayment).toBe(false);
  });

  it.each(["viewer", "maintainer", "developer", "driver"] as const)(
    "is false for a %s, even on a quote they created",
    (role) => {
      expect(capsFor([role], own).recordPayment).toBe(false);
      expect(capsFor([role], others).recordPayment).toBe(false);
    },
  );

  it("follows the admin right when a user holds several roles", () => {
    expect(capsFor(["admin", "account_manager"], others).recordPayment).toBe(true);
    expect(capsFor(["admin", "viewer"], others).recordPayment).toBe(true);
    expect(capsFor(["account_manager", "viewer"], own).recordPayment).toBe(false);
  });

  it("follows the accountant right when a user holds several roles", () => {
    expect(capsFor(["account_manager", "accountant"], own).recordPayment).toBe(true);
    expect(capsFor(["account_manager", "accountant"], others).recordPayment).toBe(true);
    expect(capsFor(["viewer", "accountant"], others).recordPayment).toBe(true);
    expect(capsFor(["admin", "accountant"], others).recordPayment).toBe(true);
  });

  it("is not tied to manageQuote: an account manager manages their own quote and still cannot record", () => {
    const caps = capsFor(["account_manager"], { ...junior, ...own });
    expect(caps.manageQuote).toBe(true);
    expect(caps.recordPayment).toBe(false);
  });

  it("is not tied to manageQuote the other way either: an accountant records and cannot manage the quote", () => {
    const caps = capsFor(["accountant"], others);
    expect(caps.manageQuote).toBe(false);
    expect(caps.recordPayment).toBe(true);
  });

  it("is gone as a separate 'drawn' answer: showRecordPayment no longer exists", () => {
    expect(Object.keys(capsFor(["admin"]))).not.toContain("showRecordPayment");
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

  it("account manager + accountant: what the account manager has, and the payments", () => {
    expect(capsFor(["account_manager", "accountant"])).toEqual({
      ...capsFor(["account_manager"]),
      recordPayment: true,
    });
  });

  it("viewer + accountant: the flag, the payments and the dashboard, still no create, manage or send", () => {
    expect(capsFor(["viewer", "accountant"])).toEqual({
      ...NOTHING,
      openInDashboard: true,
      setQuickBooksFlag: true,
      recordPayment: true,
    });
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
