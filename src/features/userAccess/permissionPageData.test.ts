import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_ORDER } from "./permissionPageData";

describe("permission matrix", () => {
  const roles = Object.keys(ROLE_LABELS);

  // ROLE_ORDER is a plain WebRole[], so the compiler does not notice a role
  // missing from it — the role would exist but have no column on /permissions.
  it("lists every role on the page, exactly once", () => {
    expect([...ROLE_ORDER].sort()).toEqual([...roles].sort());
  });

  it("describes every role", () => {
    expect(Object.keys(ROLE_DESCRIPTIONS).sort()).toEqual([...roles].sort());
  });

  it("answers for every role in every permission", () => {
    for (const entry of PERMISSIONS) {
      expect(Object.keys(entry.roles).sort(), entry.label).toEqual([...roles].sort());
    }
  });

  // docs/specs/accountant-work-trackers.md: the accountant has the Work Trackers pages and the
  // payment modal, and nothing else. Widening that is a separate, approved change — and it
  // should have to edit this test on purpose.
  describe("accountant (Stage 2: Work Trackers)", () => {
    const accountant = (label: string) =>
      PERMISSIONS.find((p) => p.label === label)?.roles.accountant;

    it("is only granted Work Trackers, the driver payment rows, Accounts Receivable, Quotes & Bookings, payments, and the internal chat", () => {
      const granted = PERMISSIONS.filter((p) => p.roles.accountant.level !== "none").map(
        (p) => p.label,
      );
      expect(granted.sort()).toEqual([
        "Accounts Receivable",
        "Driver Payments & QuickBooks Bills",
        "Driver Week Paid / Unpaid",
        "Event Chat",
        "Events",
        "Payment History",
        "QuickBooks Invoice Flag",
        "Quote Files",
        "Record a Payment",
        "Work Trackers",
      ]);
    });

    // docs/specs/accountant-quotes-04-accountant-quote-access.md: the accountant opens the list and
    // any quote, read-only, plus the Files tab. The QuickBooks flag (05), the payments (10) and the
    // internal chat (11) came with later specs, each of which edited this test on purpose.
    describe("Quotes & Bookings, read-only", () => {
      it("reads events and payments, and changes neither", () => {
        for (const label of ["Events", "Payment History"]) {
          expect(accountant(label)?.level, label).toBe("read");
        }
        expect(accountant("Events")?.note).toMatch(/cannot create, edit, delete or send/i);
      });

      // docs/specs/accountant-quotes-05-is-qbo-column.md: the QuickBooks flag is what an accountant
      // changes on a quote or booking itself, and the database refuses every other change; since
      // docs/specs/accountant-quotes-10-accountant-writes-payments.md the payments are the other thing.
      it("ticks the QuickBooks Invoice Flag — apart from payments, the only thing it can change on a quote", () => {
        const flag = accountant("QuickBooks Invoice Flag");
        expect(flag?.level).toBe("full");
        expect(flag?.note).toMatch(/any quote or booking, deleted ones included/i);
        expect(flag?.note).toMatch(/apart from payments \(see Record a Payment\)/i);
        expect(flag?.note).toMatch(/only thing an accountant can change/i);
        expect(flag?.note).toMatch(/database refuses every other change/i);
      });

      it("says so in the Events row and in the role description", () => {
        expect(accountant("Events")?.note).toMatch(/QuickBooks Invoice Flag/);
        expect(ROLE_DESCRIPTIONS.accountant).toMatch(/QuickBooks Invoice Flag/);
      });

      it("records payments (spec 10) and uses the internal chat (spec 11)", () => {
        expect(accountant("Record a Payment")?.level).toBe("full");
        expect(accountant("Event Chat")?.level).toBe("custom");
      });

      it("has a Quote Files row: full for an admin, an account manager and an accountant; custom for a viewer", () => {
        const files = PERMISSIONS.find((p) => p.label === "Quote Files");
        expect(files?.category).toBe("Day to Day Operations");
        expect(Object.keys(files?.roles ?? {}).sort()).toEqual([...roles].sort());
        const levels = Object.fromEntries(
          Object.entries(files?.roles ?? {}).map(([role, access]) => [role, access.level]),
        );
        expect(levels).toEqual({
          admin: "full",
          account_manager: "full",
          accountant: "full",
          viewer: "custom",
          developer: "none",
          driver: "none",
          maintainer: "none",
        });
        // The matrix describes what is: a viewer's rights on this tab are wider than on the quote.
        expect(files?.roles.viewer.note).toMatch(/does not check the role/i);
      });
    });

    it("can neither create, edit, delete nor release a work tracker — and the matrix says so", () => {
      const note = accountant("Work Trackers")?.note ?? "";
      expect(accountant("Work Trackers")?.level).toBe("custom");
      expect(note).toMatch(/cannot create, edit, delete or release/i);
      expect(note).toMatch(/Release All/);
    });

    it("can mark a week ready for payment and create the QuickBooks bill", () => {
      const row = accountant("Driver Payments & QuickBooks Bills");
      expect(row?.level).toBe("custom");
      expect(row?.note).toMatch(/Ready for Payment/);
      expect(row?.note).toMatch(/QuickBooks bill/);
    });

    it("answers for every role on the new payments row", () => {
      const entry = PERMISSIONS.find((p) => p.label === "Driver Payments & QuickBooks Bills");
      expect(Object.keys(entry?.roles ?? {}).sort()).toEqual([...roles].sort());
    });

    // docs/specs/accountant-quotes-02-accountant-page.md: AR and AR Deposits moved to /accountant.
    describe("Accounts Receivable (the Accountant page)", () => {
      const row = PERMISSIONS.find((p) => p.label === "Accounts Receivable");

      it("sits in Day to Day Operations, right after Payment History", () => {
        const index = PERMISSIONS.findIndex((p) => p.label === "Accounts Receivable");
        expect(PERMISSIONS[index - 1]?.label).toBe("Payment History");
        expect(row?.category).toBe("Day to Day Operations");
      });

      it("is read-only for an admin and an accountant, and hidden from everyone else", () => {
        const levels = Object.fromEntries(
          Object.entries(row?.roles ?? {}).map(([role, access]) => [role, access.level]),
        );
        expect(levels).toEqual({
          admin: "read",
          accountant: "read",
          account_manager: "none",
          viewer: "none",
          developer: "none",
          driver: "none",
          maintainer: "none",
        });
      });

      it("tells an account manager and a viewer where they still see a balance", () => {
        expect(row?.roles.account_manager.note).toMatch(/Billing tab/);
        expect(row?.roles.viewer.note).toMatch(/Billing tab/);
      });

      it("describes both tabs", () => {
        expect(row?.description).toMatch(/AR tab/);
        expect(row?.description).toMatch(/AR Deposits tab/);
      });

      it("is no longer listed under Payment History, which only covers the Billing tab", () => {
        const payments = PERMISSIONS.find((p) => p.label === "Payment History");
        expect(payments?.description).not.toMatch(/AR Deposits/);
        expect(payments?.description).not.toMatch(/Quotes & Bookings/);
      });
    });

    it("names the Accountant page and Quotes & Bookings in the role description and in every hidden-from-you note", () => {
      expect(ROLE_DESCRIPTIONS.accountant).toMatch(/Accountant page/);
      expect(ROLE_DESCRIPTIONS.accountant).toMatch(/Quotes & Bookings/);
      // Record a Payment (spec 10) and Event Chat (spec 11) are no longer hidden-from-you notes;
      // Companies & Contacts still is.
      expect(accountant("Companies & Contacts")?.level).toBe("none");
      expect(accountant("Companies & Contacts")?.note).toMatch(/Accountant page/);
      expect(accountant("Companies & Contacts")?.note).toMatch(/Quotes & Bookings, read-only/);
    });

    it("no longer describes itself as having no permissions", () => {
      expect(ROLE_DESCRIPTIONS.accountant).not.toMatch(/no permissions yet/i);
    });

    it("sits right after the account manager column", () => {
      expect(ROLE_ORDER.indexOf("accountant")).toBe(ROLE_ORDER.indexOf("account_manager") + 1);
    });

    it("tells account managers they cannot grant the role", () => {
      const invite = PERMISSIONS.find((p) => p.label === "Invite Team Members");
      expect(invite?.roles.account_manager.note).toMatch(/Accountant/);
    });
  });

  // Mark Paid / Mark Unpaid on a driver's week: an admin and an accountant record it, nobody else
  // does. The database refuses the change from anyone else, and this row is what tells them so.
  describe("Driver Week Paid / Unpaid", () => {
    const entry = PERMISSIONS.find((p) => p.label === "Driver Week Paid / Unpaid");

    it("answers for every role", () => {
      expect(Object.keys(entry?.roles ?? {}).sort()).toEqual([...roles].sort());
    });

    it("is full for an admin and an accountant, and nobody else", () => {
      const full = Object.entries(entry?.roles ?? {})
        .filter(([, access]) => access.level !== "none")
        .map(([role, access]) => [role, access.level]);
      expect(full.sort()).toEqual([
        ["accountant", "full"],
        ["admin", "full"],
      ]);
    });

    it("tells an account manager they cannot, even though they run the rest of the payment", () => {
      const note = entry?.roles.account_manager.note ?? "";
      expect(note).toMatch(/cannot mark a week Paid or Unpaid/i);
      expect(note).toMatch(/database refuses/i);
    });
  });

  // docs/specs/accountant-quotes-06-am-read-only-payments.md: an account manager (lead and junior
  // alike) no longer records a payment. Spec 06 left an admin only; docs/specs/accountant-quotes-10
  // gave the accountant the right, so this block was edited on purpose.
  describe("Record a Payment (spec 06, widened by spec 10)", () => {
    const row = PERMISSIONS.find((p) => p.label === "Record a Payment");
    const levels = Object.fromEntries(
      Object.entries(row?.roles ?? {}).map(([role, access]) => [role, access.level]),
    );

    it("is full for an admin and an accountant, and none for every other role", () => {
      expect(levels).toEqual({
        admin: "full",
        account_manager: "none",
        accountant: "full",
        viewer: "none",
        developer: "none",
        driver: "none",
        maintainer: "none",
      });
    });

    it("tells an account manager that reading the history is a separate thing they can still do", () => {
      const note = row?.roles.account_manager.note ?? "";
      expect(note).toMatch(/reading the payment history is a separate thing/i);
      expect(note).toMatch(/still do that/i);
    });

    it("no longer describes the lead / own-quotes rule or a disabled button", () => {
      const note = row?.roles.account_manager.note ?? "";
      expect(note).not.toMatch(/lead account manager/i);
      expect(note).not.toMatch(/disabled/i);
    });

    it("leaves the Payment History row readable for an account manager", () => {
      const history = PERMISSIONS.find((p) => p.label === "Payment History");
      expect(history?.roles.account_manager.level).toBe("read");
    });
  });

  // docs/specs/accountant-quotes-09-payments-edit-delete-ui.md §3: a manual payment can be edited and
  // deleted now. The matrix has to say so — it is the answer people get when they ask what they may do.
  describe("Record a Payment and Payment History (spec 09)", () => {
    const recordRow = PERMISSIONS.find((p) => p.label === "Record a Payment");
    const historyRow = PERMISSIONS.find((p) => p.label === "Payment History");

    it("no longer says a recorded payment can never be edited or deleted", () => {
      expect(recordRow?.description).not.toMatch(/can never be edited or deleted/i);
      expect(recordRow?.description).not.toMatch(/recording the same amount as a negative/i);
    });

    it("says a manual payment can be edited or deleted with a reason, and what that leaves behind", () => {
      const text = recordRow?.description ?? "";
      expect(text).toMatch(/can be edited/i);
      expect(text).toMatch(/amount, date, method, payer, reference, notes, installment/i);
      expect(text).toMatch(/deleted with a reason/i);
      expect(text).toMatch(/stays on the record/i);
      expect(text).toMatch(/no longer counts/i);
      expect(text).toMatch(/cannot be restored/i);
    });

    it("says Stripe payments cannot be edited or deleted, and that a negative amount is still the refund", () => {
      const text = recordRow?.description ?? "";
      expect(text).toMatch(/Stripe payments cannot be edited or deleted/i);
      expect(text).toMatch(/negative amount is still how a refund or a bounced check is recorded/i);
    });

    it("tells an admin they can edit and delete any manual payment on any quote or booking", () => {
      expect(recordRow?.roles.admin.note).toMatch(
        /edit and delete any manual payment on any quote or booking/i,
      );
    });

    it("leaves the levels of Record a Payment as spec 06 and 10 set them: admin and accountant full, everyone else none", () => {
      const levels = Object.fromEntries(
        Object.entries(recordRow?.roles ?? {}).map(([role, access]) => [role, access.level]),
      );
      expect(levels).toEqual({
        admin: "full",
        account_manager: "none",
        accountant: "full",
        viewer: "none",
        developer: "none",
        driver: "none",
        maintainer: "none",
      });
    });

    it("says on Payment History that a deleted payment is hidden unless Show deleted is on, and who sees the reason", () => {
      const text = historyRow?.description ?? "";
      expect(text).toMatch(/hidden unless Show deleted is on/i);
      expect(text).toMatch(/reason it was deleted is shown only to those who can record payments/i);
    });

    it("does not change who reads Payment History", () => {
      const levels = Object.fromEntries(
        Object.entries(historyRow?.roles ?? {}).map(([role, access]) => [role, access.level]),
      );
      expect(levels).toEqual({
        admin: "read",
        account_manager: "read",
        accountant: "read",
        viewer: "read",
        developer: "none",
        driver: "none",
        maintainer: "none",
      });
    });
  });

  // docs/specs/accountant-quotes-10-accountant-writes-payments.md §4: only an admin and an accountant
  // create, edit and delete payments, and the matrix is where people read it.
  describe("Record a Payment and Payment History (spec 10)", () => {
    const recordRow = PERMISSIONS.find((p) => p.label === "Record a Payment");
    const historyRow = PERMISSIONS.find((p) => p.label === "Payment History");
    const eventsRow = PERMISSIONS.find((p) => p.label === "Events");

    it("tells an accountant they can record, edit and delete any manual payment, like an administrator", () => {
      const row = recordRow?.roles.accountant;
      expect(row?.level).toBe("full");
      expect(row?.note).toMatch(
        /record, edit and delete any manual payment on any quote or booking/i,
      );
      expect(row?.note).toMatch(/same as an administrator/i);
    });

    it("says in the description that only an administrator or an accountant can do it", () => {
      expect(recordRow?.description).toMatch(
        /Only an administrator or an accountant can do this\./,
      );
    });

    it("keeps the accountant at read on Payment History, and points to Record a Payment for changing", () => {
      const row = historyRow?.roles.accountant;
      expect(row?.level).toBe("read");
      expect(row?.note).toMatch(/deleted payments and the reason they were deleted included/i);
      expect(row?.note).toMatch(/Changing payments is a separate thing — see Record a Payment/);
    });

    it("no longer says the QuickBooks flag is the one thing an accountant changes on a quote", () => {
      expect(ROLE_DESCRIPTIONS.accountant).not.toMatch(/the one thing they can change/i);
      expect(eventsRow?.roles.accountant.note).not.toMatch(/the one thing they can change/i);
      expect(ROLE_DESCRIPTIONS.accountant).toMatch(/QuickBooks Invoice Flag/);
      expect(ROLE_DESCRIPTIONS.accountant).toMatch(/can record, edit and delete manual payments/i);
      expect(eventsRow?.roles.accountant.note).toMatch(
        /What they can change is the QuickBooks Invoice Flag and the payments/,
      );
    });

    it("leaves every other role's Record a Payment answer where it was", () => {
      expect(recordRow?.roles.admin.level).toBe("full");
      for (const role of [
        "account_manager",
        "viewer",
        "developer",
        "driver",
        "maintainer",
      ] as const) {
        expect(recordRow?.roles[role].level, role).toBe("none");
      }
    });
  });

  // docs/specs/accountant-quotes-11-accountant-internal-chat.md §4: an accountant uses the internal
  // chat — joins, reads, posts where they joined, edits their own messages, mentions and is mentioned,
  // leaves — and adds and removes no one. The matrix is where people read it.
  describe("Event Chat (spec 11)", () => {
    const row = PERMISSIONS.find((p) => p.label === "Event Chat");
    const levels = Object.fromEntries(
      Object.entries(row?.roles ?? {}).map(([role, access]) => [role, access.level]),
    );

    it("is custom for an accountant, and leaves every other role's answer where it was", () => {
      expect(levels).toEqual({
        admin: "full",
        account_manager: "custom",
        accountant: "custom",
        viewer: "read",
        developer: "none",
        driver: "none",
        maintainer: "none",
      });
    });

    it("tells an accountant what they can do in a chat", () => {
      const note = row?.roles.accountant.note ?? "";
      expect(note).toMatch(/read every event chat/i);
      expect(note).toMatch(/join any of them and leave/i);
      expect(note).toMatch(/post in the ones they have joined/i);
      expect(note).toMatch(/edit only their own messages/i);
      expect(note).toMatch(/mention other members and be mentioned/i);
    });

    it("tells an accountant what they cannot: add anyone else to a chat or remove anyone from one (D1)", () => {
      const note = row?.roles.accountant.note ?? "";
      expect(note).toMatch(/cannot add anyone else to a chat or remove anyone from one/i);
    });

    it("is no longer the 'hidden from you' note", () => {
      expect(row?.roles.accountant.note).not.toMatch(
        /Everything else on the web dashboard is hidden/i,
      );
    });

    it("names the internal chat in the accountant's role description", () => {
      expect(ROLE_DESCRIPTIONS.accountant).toMatch(/internal chat/i);
    });
  });

  // docs/specs/maintainer-dashboard-cells.md: a maintainer writes notes in dashboard cells,
  // and only edits the ones they wrote.
  describe("maintainer on the dashboard", () => {
    const row = (label: string) => PERMISSIONS.find((p) => p.label === label)?.roles.maintainer;

    it("has a custom Dashboard Cells answer that names the own-notes-only rule", () => {
      const cells = row("Dashboard Cells");
      expect(cells?.level).toBe("custom");
      expect(cells?.note).toMatch(/wrote themselves/i);
    });

    it("no longer says the dashboard is hidden from them", () => {
      expect(ROLE_DESCRIPTIONS.maintainer).not.toMatch(/nothing else on the dashboard/i);
      expect(row("Dashboard Cells")?.note).not.toMatch(/hidden/i);
    });

    it("only reads Events and Work Trackers — the dashboard shows them, nothing more", () => {
      expect(row("Events")?.level).toBe("read");
      expect(row("Work Trackers")?.level).toBe("read");
    });
  });
});
