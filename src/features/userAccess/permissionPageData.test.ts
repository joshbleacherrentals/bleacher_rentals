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

    it("is only granted Work Trackers, the driver payment rows, Accounts Receivable, and read access to Quotes & Bookings", () => {
      const granted = PERMISSIONS.filter((p) => p.roles.accountant.level !== "none").map(
        (p) => p.label,
      );
      expect(granted.sort()).toEqual([
        "Accounts Receivable",
        "Driver Payments & QuickBooks Bills",
        "Driver Week Paid / Unpaid",
        "Events",
        "Payment History",
        "QuickBooks Invoice Flag",
        "Quote Files",
        "Work Trackers",
      ]);
    });

    // docs/specs/accountant-quotes-04-accountant-quote-access.md: the accountant opens the list and
    // any quote, read-only, plus the Files tab. Writing a payment, the QuickBooks flag and the
    // internal chat come with later specs and have to edit this test on purpose.
    describe("Quotes & Bookings, read-only", () => {
      it("reads events and payments, and changes neither", () => {
        for (const label of ["Events", "Payment History"]) {
          expect(accountant(label)?.level, label).toBe("read");
        }
        expect(accountant("Events")?.note).toMatch(/cannot create, edit, delete or send/i);
      });

      // docs/specs/accountant-quotes-05-is-qbo-column.md: the one thing an accountant changes on a
      // quote or booking, and the database refuses every other change.
      it("ticks the QuickBooks Invoice Flag — the only thing it can change on a quote", () => {
        const flag = accountant("QuickBooks Invoice Flag");
        expect(flag?.level).toBe("full");
        expect(flag?.note).toMatch(/any quote or booking, deleted ones included/i);
        expect(flag?.note).toMatch(/only thing an accountant can change/i);
        expect(flag?.note).toMatch(/database refuses every other change/i);
      });

      it("says so in the Events row and in the role description", () => {
        expect(accountant("Events")?.note).toMatch(/QuickBooks Invoice Flag/);
        expect(ROLE_DESCRIPTIONS.accountant).toMatch(/QuickBooks Invoice Flag/);
      });

      it("still cannot record a payment or use the internal chat", () => {
        expect(accountant("Record a Payment")?.level).toBe("none");
        expect(accountant("Event Chat")?.level).toBe("none");
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
      expect(accountant("Record a Payment")?.note).toMatch(/Accountant page/);
      expect(accountant("Record a Payment")?.note).toMatch(/Quotes & Bookings, read-only/);
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
