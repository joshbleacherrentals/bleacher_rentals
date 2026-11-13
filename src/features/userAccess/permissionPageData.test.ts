import { describe, expect, it } from "vitest";
import { canSendEmail } from "./logic/canSendEmail";
import type { WebRole } from "./logic/determineAccess";
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

    it("is only granted Work Trackers, the driver payment rows, Accounts Receivable, Quotes & Bookings, payments, the QuickBooks invoice and its alerts, the internal chat, Companies & Contacts, Blocked Emails, Edit Team Members, and Quote Types", () => {
      const granted = PERMISSIONS.filter((p) => p.roles.accountant.level !== "none").map(
        (p) => p.label,
      );
      expect(granted.sort()).toEqual([
        "Accounts Receivable",
        "Blocked Customer Emails",
        "Collections",
        "Companies & Contacts",
        "Driver Audit",
        "Driver Payments & QuickBooks Bills",
        "Driver Week Paid / Unpaid",
        "Edit Team Members",
        "Event Chat",
        "Events",
        "Payment History",
        "Pull Emails from Gmail",
        "QuickBooks Invoice (create and update)",
        "QuickBooks Invoice Alerts",
        "QuickBooks Invoice Flag",
        "Quote Files",
        "Quote Types",
        "Record a Payment",
        "Send Emails",
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

    it("has a Send To Client row: full for an admin and an account manager, none for everyone else", () => {
      const row = PERMISSIONS.find((p) => p.label === "Send To Client");
      expect(row?.category).toBe("Day to Day Operations");
      expect(Object.keys(row?.roles ?? {}).sort()).toEqual([...roles].sort());
      const levels = Object.fromEntries(
        Object.entries(row?.roles ?? {}).map(([role, access]) => [role, access.level]),
      );
      expect(levels).toEqual({
        admin: "full",
        account_manager: "full",
        accountant: "none",
        viewer: "none",
        developer: "none",
        driver: "none",
        maintainer: "none",
      });
      expect(row?.roles.admin.note).toMatch(
        /To, Cc and Bcc addresses, the subject and the attachments/i,
      );
      expect(row?.roles.account_manager.note).toMatch(/quote PDF always stays attached/i);
    });

    // The Booked button on a booked quote's Contract tab (BookedAtButton): it follows Edit and
    // Delete's rule, so an account manager changes the date only on a quote they created.
    it("has a Booked Date row: full for an admin, custom for an account manager, none for everyone else", () => {
      const row = PERMISSIONS.find((p) => p.label === "Booked Date");
      expect(row?.category).toBe("Day to Day Operations");
      expect(Object.keys(row?.roles ?? {}).sort()).toEqual([...roles].sort());
      const levels = Object.fromEntries(
        Object.entries(row?.roles ?? {}).map(([role, access]) => [role, access.level]),
      );
      expect(levels).toEqual({
        admin: "full",
        account_manager: "custom",
        accountant: "none",
        viewer: "none",
        developer: "none",
        driver: "none",
        maintainer: "none",
      });
      expect(row?.roles.account_manager.note).toMatch(/only .* they created/i);
      expect(row?.description).toMatch(/12:00/);
    });

    // docs/specs/qbo-invoice-09-banner.md §5: the red notice on a quote whose QuickBooks invoice needs
    // attention. Only an accountant sees it; an admin who is not an accountant does not.
    it("has a QuickBooks Invoice Alerts row: full for an accountant, none for everyone else", () => {
      const row = PERMISSIONS.find((p) => p.label === "QuickBooks Invoice Alerts");
      expect(row?.category).toBe("Day to Day Operations");
      expect(Object.keys(row?.roles ?? {}).sort()).toEqual([...roles].sort());
      const levels = Object.fromEntries(
        Object.entries(row?.roles ?? {}).map(([role, access]) => [role, access.level]),
      );
      expect(levels).toEqual({
        admin: "none",
        account_manager: "none",
        accountant: "full",
        viewer: "none",
        developer: "none",
        driver: "none",
        maintainer: "none",
      });
      expect(row?.description).toMatch(/no longer matches the quote/i);
      expect(row?.roles.accountant.note).toMatch(/deleted quotes excepted/i);
    });

    // docs/specs/qbo-invoice-11-counts-and-marks.md §5: the counts and marks join the notice.
    it("says the alerts are also the red counts on the sidebar's Accountant item and the Need attention tab, and the red mark on a row", () => {
      const row = PERMISSIONS.find((p) => p.label === "QuickBooks Invoice Alerts");
      expect(row?.description).toBe(
        "The red notice on a quote whose QuickBooks invoice needs attention, the red count on the Accountant entry of the sidebar and on the Need attention tab of the Accountant page, and the red mark on the quote's row in the lists. A quote needs attention when its invoice in QuickBooks no longer matches the quote.",
      );
      expect(row?.roles.accountant.level).toBe("full");
      expect(row?.roles.accountant.note).toBe(
        "Sees the notice on any quote with a QuickBooks invoice, and in the counts and marks, deleted quotes excepted.",
      );
    });

    // docs/specs/qbo-invoice-10-need-attention-tab.md §5: the Need attention tab lists the same quotes,
    // and an administrator can open it though they do not see the alerts.
    it("tells an administrator that the Need attention tab lists the quotes the alerts are about", () => {
      const row = PERMISSIONS.find((p) => p.label === "QuickBooks Invoice Alerts");
      expect(row?.roles.admin.level).toBe("none");
      expect(row?.roles.admin.note).toBe(
        "Does not see the invoice alerts on the quote or in the counts and marks. The Need attention tab on the Accountant page lists the same quotes, and they can open it.",
      );
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

      // The AR tab was taken off the page when Collections replaced it.
      it("describes the AR Deposits tab and no longer an AR tab", () => {
        expect(row?.description).toMatch(/AR Deposits tab/);
        expect(row?.description).not.toMatch(/\bAR tab/);
        expect(ROLE_DESCRIPTIONS.accountant).toMatch(/its AR Deposits tab/);
        expect(ROLE_DESCRIPTIONS.accountant).not.toMatch(/AR and AR Deposits/);
      });

      // docs/specs/qbo-invoice-10-need-attention-tab.md §5.
      it("describes the Need attention tab, which lists the quotes whose invoice no longer matches", () => {
        expect(row?.description).toContain(
          "A second tab, Need attention, lists the quotes whose QuickBooks invoice no longer matches the quote; it opens on the newest event.",
        );
      });

      it("is no longer listed under Payment History, which only covers the Billing tab", () => {
        const payments = PERMISSIONS.find((p) => p.label === "Payment History");
        expect(payments?.description).not.toMatch(/AR Deposits/);
        expect(payments?.description).not.toMatch(/Quotes & Bookings/);
      });
    });

    // docs/specs/accountant-collections-09-design.md §4: the Collections tab and the invoice page.
    describe("Collections", () => {
      const row = PERMISSIONS.find((p) => p.label === "Collections");

      it("sits in Day to Day Operations, right after Accounts Receivable", () => {
        const index = PERMISSIONS.findIndex((p) => p.label === "Collections");
        expect(PERMISSIONS[index - 1]?.label).toBe("Accounts Receivable");
        expect(row?.category).toBe("Day to Day Operations");
      });

      it("is full for an admin and an accountant, and hidden from the other five roles", () => {
        const levels = Object.fromEntries(
          Object.entries(row?.roles ?? {}).map(([role, access]) => [role, access.level]),
        );
        expect(levels).toEqual({
          admin: "full",
          accountant: "full",
          account_manager: "none",
          viewer: "none",
          developer: "none",
          driver: "none",
          maintainer: "none",
        });
      });

      it("answers for all seven roles, with a note for each", () => {
        expect(Object.keys(row?.roles ?? {}).sort()).toEqual(Object.keys(ROLE_LABELS).sort());
        for (const [role, access] of Object.entries(row?.roles ?? {})) {
          expect(access.note, role).toBeTruthy();
        }
      });

      it("describes the tab, the invoice page and the tasks", () => {
        expect(row?.description).toMatch(/Collections tab of the Accountant page/);
        expect(row?.description).toMatch(/Show Not Due Yet/);
        expect(row?.description).toMatch(/invoice page/);
        expect(row?.description).toMatch(/closes by itself when the payment arrives/);
      });

      // docs/specs/accountant-collections-23-amount-type-switch.md §3.
      it("says the list has a Collections / Deposits / All switch, Show Not Due Yet and sorting", () => {
        expect(row?.description).toContain(
          "lists the bookings with an overdue payment, one open task each, with a Collections / Deposits / All switch, Show Not Due Yet and sorting.",
        );
        expect(row?.description).not.toContain("with Show Not Due Yet and sorting");
      });

      // docs/specs/accountant-collections-12-tabs-and-messages.md §3.
      it("says the invoice page has a Messages tab with the booking's internal chat", () => {
        expect(row?.description).toContain(
          "The page has a Messages tab with the booking's internal chat, the same as on the quote.",
        );
      });

      // docs/specs/accountant-collections-13-task-history-and-files.md §3.
      it("says Information shows the task history and the files, and who can change the files", () => {
        expect(row?.description).toContain(
          "Its Information tab shows the booking's task history and its files; the accountant can attach files and delete the ones attached by hand.",
        );
      });

      // docs/specs/accountant-collections-19-task-delete.md §3.
      it("says a closed task can be deleted from the task history and the open task cannot, right after the Information sentence", () => {
        expect(row?.description).toContain(
          "Its Information tab shows the booking's task history and its files; the accountant can attach files and delete the ones attached by hand. A closed task can be deleted from the task history; the open task cannot.",
        );
      });

      // docs/specs/accountant-collections-16-customer-page-view.md §3.
      it("says the invoice page can show the page the customer sees, and what signing and paying do there", () => {
        expect(row?.description).toContain(
          "A Customer view button shows the page the customer sees (Approved Quote, Signed Contract, Pay Invoice); signing there signs for the customer and Pay opens the online payment in a new tab.",
        );
      });

      const CUSTOMER_PAGE_SENTENCE =
        "Can open the customer's page on an invoice, with Show Customer View on a quote, or by its address, sign for the customer there, and start an online payment.";

      const OPEN_AP_SENTENCE =
        "Sees the Open AR button on a quote, which opens that booking's invoice page in a new tab.";

      // The Export to CSV button in the header of the Accountant page.
      const EXPORT_SENTENCE =
        "Export to CSV in the page header downloads the list as it is on screen — the Collections / Deposits / All switch and Show Not Due Yet applied, sorted as shown.";

      it("tells the accountant what they can do there", () => {
        expect(accountant("Collections")?.note).toBe(
          `Can open Collections and every invoice page, write the next task, and record, edit and delete manual payments there. ${CUSTOMER_PAGE_SENTENCE} ${OPEN_AP_SENTENCE} ${EXPORT_SENTENCE}`,
        );
      });

      it("tells an admin the same", () => {
        expect(row?.roles.admin.note).toBe(
          `Can open Collections and every invoice page, write the next task, and record, edit and delete manual payments there. ${CUSTOMER_PAGE_SENTENCE} ${OPEN_AP_SENTENCE} ${EXPORT_SENTENCE}`,
        );
      });

      // The Open AR button in the header of a quote (getQuotesBookingsCapabilities.openAp).
      it("says a quote has an Open AR button that opens the invoice page in a new tab", () => {
        expect(row?.description).toContain(
          "On a quote's page, an Open AR button in the header opens that booking's invoice page in a new tab.",
        );
      });

      it("tells an account manager and a viewer they do not get the Open AR button", () => {
        expect(row?.roles.account_manager.note).toContain("but not the Open AR button");
        expect(row?.roles.viewer.note).toContain("but not the Open AR button");
      });

      it("does not give the other five roles the customer's page through this row", () => {
        for (const role of [
          "account_manager",
          "viewer",
          "developer",
          "driver",
          "maintainer",
        ] as const) {
          expect(row?.roles[role].note, role).not.toContain("customer's page");
        }
      });

      it("is mentioned in the role description and in Accounts Receivable", () => {
        expect(ROLE_DESCRIPTIONS.accountant).toMatch(
          /Also has the Collections tab and the invoice page behind it, where they follow up overdue payments with tasks\./,
        );
        expect(PERMISSIONS.find((p) => p.label === "Accounts Receivable")?.description).toMatch(
          /The Accountant page opens on the Collections tab\./,
        );
      });
    });

    // docs/specs/accountant-audit-01-tab.md §3 and §5 (R4, R5): the Audit tab of the Accountant page.
    describe("Driver Audit", () => {
      const row = PERMISSIONS.find((p) => p.label === "Driver Audit");

      it("sits in Day to Day Operations, right after Collections", () => {
        const index = PERMISSIONS.findIndex((p) => p.label === "Driver Audit");
        expect(PERMISSIONS[index - 1]?.label).toBe("Collections");
        expect(row?.category).toBe("Day to Day Operations");
      });

      it("is read for an admin and an accountant, and none for the other five roles", () => {
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

      it("answers for all seven roles, with a note for each", () => {
        expect(Object.keys(row?.roles ?? {}).sort()).toEqual(Object.keys(ROLE_LABELS).sort());
        for (const [role, access] of Object.entries(row?.roles ?? {})) {
          expect(access.note, role).toBeTruthy();
        }
      });

      it("describes the tab: the drivers table, the range, the trackers, the paid status, and that it is read-only", () => {
        expect(row?.description).toBe(
          "The Audit tab of the Accountant page. It lists every driver with their distance (in kilometres and miles), drive time, trips and pay (in the driver's own currency, USD or CAD) for a date range the user chooses (a preset such as This month, or any From and To dates). Any column can be sorted, and a search bar finds a driver by name. Clicking a driver opens that driver's work trackers inside the same range: status, date, bleacher, type, pickup and dropoff, drive time, distance, and whether the tracker's week has been paid. Read-only: nothing on the tab changes a work tracker or a payment.",
        );
      });

      // The Export to CSV button in the header of the Accountant page.
      const EXPORT_SENTENCE =
        "Export to CSV in the page header downloads the drivers table for the range and search chosen, or, on a driver's page, all of that driver's work trackers in the range, not just the page on screen.";

      it("tells an admin and an accountant what they can read, deactivated drivers included", () => {
        expect(row?.roles.admin.note).toBe(
          `Can open the Audit tab and read the totals and the work trackers of any driver, including drivers who are no longer active. ${EXPORT_SENTENCE}`,
        );
        expect(row?.roles.accountant.note).toBe(
          `Can open the Audit tab and read the totals and the work trackers of any driver, including drivers who are no longer active. Marking a week Paid stays on the Work Trackers pages. ${EXPORT_SENTENCE}`,
        );
      });

      it("says Export to CSV is for the same two roles, and for no one else", () => {
        for (const role of [
          "account_manager",
          "viewer",
          "developer",
          "driver",
          "maintainer",
        ] as const) {
          expect(row?.roles[role].note ?? "", role).not.toContain("Export to CSV");
        }
      });

      it("tells an account manager and a viewer where they still read work trackers", () => {
        expect(row?.roles.account_manager.note).toBe(
          "The Accountant page is for accountants and administrators. An account manager still reads their drivers' work trackers on the Work Trackers pages.",
        );
        expect(row?.roles.viewer.note).toBe(
          "The Accountant page is for accountants and administrators. A viewer still reads work trackers on the Work Trackers pages.",
        );
      });

      it("keeps the notes of the developer, driver and maintainer in the wording of the neighbouring rows", () => {
        const collections = PERMISSIONS.find((p) => p.label === "Collections");
        expect(row?.roles.developer.note).toBe(
          "Developer is only meant to work on the developer roadmap and the Dev Tools pages.",
        );
        expect(row?.roles.driver.note).toBe(collections?.roles.driver.note);
        expect(row?.roles.maintainer.note).toBe(collections?.roles.maintainer.note);
      });

      it("is named in the accountant's role description, before the line about what is hidden", () => {
        expect(ROLE_DESCRIPTIONS.accountant).toContain(
          "Also has the Audit tab of the Accountant page, where they see each driver's totals for a date range and open a driver to read that driver's work trackers with their Paid or Not paid status.",
        );
        expect(
          ROLE_DESCRIPTIONS.accountant.endsWith(
            "Everything else on the web dashboard is hidden from this role.",
          ),
        ).toBe(true);
      });

      it("leaves the administrator's description as it was: full access", () => {
        expect(ROLE_DESCRIPTIONS.admin).toBe(
          "Full access to all features, settings, and team management.",
        );
      });
    });

    it("names the Accountant page and Quotes & Bookings in the role description and in every hidden-from-you note", () => {
      expect(ROLE_DESCRIPTIONS.accountant).toMatch(/Accountant page/);
      expect(ROLE_DESCRIPTIONS.accountant).toMatch(/Quotes & Bookings/);
      // Record a Payment (spec 10), Event Chat (spec 11) and Companies & Contacts
      // (accountant-address-book) are no longer hidden-from-you notes; Dashboard Cells still is.
      expect(accountant("Dashboard Cells")?.level).toBe("none");
      expect(accountant("Dashboard Cells")?.note).toMatch(/Accountant page/);
      expect(accountant("Dashboard Cells")?.note).toMatch(/Quotes & Bookings, read-only/);
      expect(accountant("Dashboard Cells")?.note).toMatch(/Companies & Contacts/);
      // docs/specs/accountant-team.md: the Team page is no longer hidden from the accountant.
      expect(accountant("Dashboard Cells")?.note).toMatch(/Team page/);
    });

    // docs/specs/accountant-team.md §6: the accountant sees every team member and edits a driver's
    // payment info and vendor — and the vendor companies. The matrix is what the account managers
    // read when they ask what an accountant may do, so it must say what the database allows.
    describe("Edit Team Members", () => {
      const row = PERMISSIONS.find((p) => p.label === "Edit Team Members");

      it("is custom for the accountant, and nothing else about the other roles changed", () => {
        const levels = Object.fromEntries(
          Object.entries(row?.roles ?? {}).map(([role, access]) => [role, access.level]),
        );
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

      it("tells the accountant what they can change on a driver", () => {
        const note = accountant("Edit Team Members")?.note ?? "";
        expect(note).toMatch(/payment info/i);
        expect(note).toMatch(/currency, unit, tax, rates and tiers, deadhead, setup, teardown/);
        expect(note).toMatch(/vendor company/i);
        expect(note).toMatch(/driver type/i);
      });

      it("tells the accountant what they can only read, and what they cannot do", () => {
        const note = accountant("Edit Team Members")?.note ?? "";
        expect(note).toMatch(/zones, phone, home address, vehicle and documents/);
        expect(note).toMatch(/without changing them/i);
        expect(note).toMatch(/cannot change a driver's name, zones or roles/i);
        expect(note).toMatch(/cannot open anyone who is not a driver/i);
      });

      it("says the vendor companies can be created, edited and deleted, QuickBooks link included", () => {
        const note = accountant("Edit Team Members")?.note ?? "";
        expect(note).toMatch(/create, edit and delete vendor companies/i);
        expect(note).toMatch(/hidden, not removed/i);
        expect(note).toMatch(/QuickBooks connection and QuickBooks vendor/);
      });

      it("says that roles add up for someone who is also an account manager", () => {
        const note = accountant("Edit Team Members")?.note ?? "";
        expect(note).toMatch(/also an account manager/i);
        expect(note).toMatch(/own zones/);
      });

      it("is named in the role description", () => {
        expect(ROLE_DESCRIPTIONS.accountant).toMatch(/Team page/);
        expect(ROLE_DESCRIPTIONS.accountant).toMatch(/vendor/i);
      });

      it("still cannot invite or deactivate anyone, and the notes say the Team page is open", () => {
        for (const label of ["Invite Team Members", "Deactivate Team Members"]) {
          const entry = accountant(label);
          expect(entry?.level, label).toBe("none");
          expect(entry?.note, label).toMatch(/Can open the Team page but cannot/);
        }
      });
    });

    // docs/specs/accountant-address-book.md §4: an accountant creates, edits and soft-deletes
    // companies, contacts and venues, like an account manager. The matrix is what account managers
    // read when they ask what an accountant may do, so it must say what the database allows.
    describe("Companies & Contacts", () => {
      const row = PERMISSIONS.find((p) => p.label === "Companies & Contacts");

      it("is full for an admin, an account manager and an accountant; read for a viewer; none for the rest", () => {
        const levels = Object.fromEntries(
          Object.entries(row?.roles ?? {}).map(([role, access]) => [role, access.level]),
        );
        expect(levels).toEqual({
          admin: "full",
          account_manager: "full",
          accountant: "full",
          viewer: "read",
          developer: "none",
          driver: "none",
          maintainer: "none",
        });
      });

      it("tells the accountant what they can do, and where venues are added", () => {
        const note = accountant("Companies & Contacts")?.note ?? "";
        expect(note).toMatch(/create, edit and delete any company, contact or venue/i);
        expect(note).toMatch(/Quote Language/);
        expect(note).toMatch(/Default Venue/);
        expect(note).toMatch(/nothing is removed from the database/i);
      });

      it("is named in the role description", () => {
        expect(ROLE_DESCRIPTIONS.accountant).toMatch(/Companies & Contacts/);
      });
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

  // docs/specs/qbo-invoice-03a-province-tax-codes.md §4: the QuickBooks page also holds the tax
  // code of each Canadian province. Only an administrator maintains it; no role gains anything.
  describe("Quickbooks Connections (province tax codes)", () => {
    const connections = PERMISSIONS.find((p) => p.label === "Quickbooks Connections");

    // docs/specs/qbo-invoice-03e-canadian-settings-cad-only.md §3: only a CAD connection has them.
    it("tells an administrator they also set the tax code of every Canadian province, for each Canadian (CAD) connection", () => {
      expect(connections?.roles.admin.level).toBe("full");
      expect(connections?.roles.admin.note).toContain(
        "also sets, for each Canadian (CAD) connection, the QuickBooks tax code to use for every Canadian province",
      );
    });

    // docs/specs/qbo-invoice-03c-no-tax-code.md §4: and the code a Canadian invoice line carries
    // when it has no tax.
    it("tells an administrator they also set the 'no tax' code of a Canadian invoice", () => {
      expect(connections?.roles.admin.note).toContain(
        "the QuickBooks tax code that means 'no tax' on a Canadian invoice",
      );
    });

    it("still keeps the page from every other role", () => {
      for (const role of ROLE_ORDER.filter((r) => r !== "admin")) {
        expect(connections?.roles[role].level, role).toBe("none");
      }
    });
  });

  // docs/specs/qbo-invoice-12a-quote-types-page.md §4: the Quote Types page assigns each quote type
  // its QuickBooks Product/Service. An admin and an accountant open it; nobody else does.
  describe("Quote Types (spec qbo-invoice-12a)", () => {
    const row = PERMISSIONS.find((p) => p.label === "Quote Types");

    it("is a Configuration row that answers for every role, right after Work Tracker Types", () => {
      expect(row?.category).toBe("Configuration");
      expect(Object.keys(row?.roles ?? {}).sort()).toEqual([...roles].sort());
      const labels = PERMISSIONS.map((p) => p.label);
      expect(labels.indexOf("Quote Types")).toBe(labels.indexOf("Work Tracker Types") + 1);
    });

    // docs/specs/qbo-invoice-12c-manage-quote-types.md §4: an administrator also adds, renames and
    // deletes the types, so the accountant, who only assigns Products/Services, is `custom`.
    it("is full for an admin, custom for an accountant, and none for every other role", () => {
      const levels = Object.fromEntries(
        Object.entries(row?.roles ?? {}).map(([role, access]) => [role, access.level]),
      );
      expect(levels).toEqual({
        admin: "full",
        account_manager: "none",
        accountant: "custom",
        viewer: "none",
        developer: "none",
        driver: "none",
        maintainer: "none",
      });
    });

    it("describes the page: a Product/Service per quote type and QuickBooks connection, and that an administrator also adds, renames and deletes the types", () => {
      expect(row?.description).toBe(
        "This applies to the Quote Types page under Configuration, where each quote type (City, Corporate, Rural …) is assigned the QuickBooks Product/Service its invoice line is sold as, per QuickBooks connection. An administrator also adds, renames and deletes the types; a type that quotes or prices use cannot be deleted.",
      );
    });

    it("tells an admin they can manage the types and assign, and an accountant they can only assign", () => {
      expect(row?.roles.admin.note).toBe(
        "Can add, rename and delete quote types (not one that quotes or prices use), and assign, change or clear the Product/Service of any quote type, per QuickBooks connection.",
      );
      expect(row?.roles.accountant.note).toBe(
        "Can assign, change or clear the Product/Service of any quote type, per QuickBooks connection. Cannot add, rename or delete a quote type.",
      );
    });

    it("tells every other role the page is hidden, in the wording of the neighbouring rows", () => {
      const neighbour = PERMISSIONS.find((p) => p.label === "Work Tracker Types");
      for (const role of [
        "account_manager",
        "developer",
        "viewer",
        "driver",
        "maintainer",
      ] as const) {
        expect(row?.roles[role].level, role).toBe("none");
        expect(row?.roles[role].note, role).toBeTruthy();
      }
      expect(row?.roles.maintainer.note).toBe(neighbour?.roles.maintainer.note);
      expect(row?.roles.viewer.note).toBe(neighbour?.roles.viewer.note);
      expect(row?.roles.driver.note).toBe(neighbour?.roles.driver.note);
    });

    it("names the page in the accountant's role description, and in the note that says what else is hidden", () => {
      expect(ROLE_DESCRIPTIONS.accountant).toContain(
        "Also has the Quote Types page under Configuration, where they choose the QuickBooks Product/Service of each quote type.",
      );
      expect(
        ROLE_DESCRIPTIONS.accountant.endsWith(
          "Everything else on the web dashboard is hidden from this role.",
        ),
      ).toBe(true);
      const hidden = PERMISSIONS.find((p) => p.label === "Quickbooks Connections");
      expect(hidden?.roles.accountant.note).toMatch(/Quote Types page under Configuration/);
    });
  });

  // docs/specs/qbo-invoice-07-card-buttons.md §5: the Create invoice and Update invoice buttons on
  // the Billing tab are the first place a person can use the feature, so the matrix says who may.
  describe("QuickBooks Invoice (create and update) (spec qbo-invoice-07)", () => {
    const row = PERMISSIONS.find((p) => p.label === "QuickBooks Invoice (create and update)");
    const flagRow = PERMISSIONS.find((p) => p.label === "QuickBooks Invoice Flag");
    const eventsRow = PERMISSIONS.find((p) => p.label === "Events");

    it("is a Day to Day Operations row that answers for every role", () => {
      expect(row?.category).toBe("Day to Day Operations");
      expect(Object.keys(row?.roles ?? {}).sort()).toEqual([...roles].sort());
    });

    it("is full for an admin and an accountant, and none for every other role", () => {
      const levels = Object.fromEntries(
        Object.entries(row?.roles ?? {}).map(([role, access]) => [role, access.level]),
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

    it("describes the buttons, and says the invoice is never sent to the client", () => {
      expect(row?.description).toMatch(
        /^The Create invoice and Update invoice buttons on the Billing tab of a quote or booking\. Create makes the invoice in QuickBooks from the quote, for a booked quote that has none; Update replaces the invoice's content with the quote's current data\. The invoice is saved in QuickBooks for the books and is never sent to the client\./,
      );
    });

    // docs/specs/qbo-invoice-08-view-and-check.md §5: the description gains the two extra buttons and
    // the check time; the levels do not change (the test of the levels above still holds).
    it("spec 08: also describes View in QuickBooks, Check again and the check time", () => {
      expect(row?.description).toMatch(
        / A quote that has an invoice also gets View in QuickBooks, which opens the invoice, and Check again, which re-compares the QuickBooks invoice with the quote; the card also shows when the quote was last checked\./,
      );
    });

    // docs/specs/qbo-invoice-12b-use-the-mapping.md §4: where the line's Product/Service comes from.
    it("spec 12b: says the line's Product/Service is the one assigned on the Quote Types page, and that a type with none cannot be invoiced", () => {
      expect(row?.description).toMatch(
        / The line's Product\/Service is the one assigned to the quote's type on the Quote Types page; a quote whose type has none cannot be invoiced\.$/,
      );
    });

    it("tells an admin and an accountant what they can do, and that Update asks first", () => {
      expect(row?.roles.admin.note).toBe(
        "Can create the invoice of any booked quote and update any invoice.",
      );
      expect(row?.roles.accountant.note).toBe(
        "Can create the invoice of any booked quote, on a quote of any office, and update any invoice. Update always asks first.",
      );
    });

    it("tells an account manager they cannot, and that they can still tick the flag", () => {
      expect(row?.roles.account_manager.note).toBe(
        "Cannot create or update a QuickBooks invoice. They can still tick the QuickBooks Invoice Flag.",
      );
      expect(row?.roles.viewer.note).toBe("Cannot create or update a QuickBooks invoice.");
      expect(row?.roles.driver.note).toBe("Drivers only have access to the Driver Mobile App.");
    });

    it("keeps the developer note about quotes and the maintainer note of the other rows", () => {
      expect(row?.roles.developer.note).toBe(flagRow?.roles.developer.note);
      expect(row?.roles.maintainer.note).toBe(flagRow?.roles.maintainer.note);
    });

    it("no longer says the QuickBooks Invoice Flag pushes nothing to QuickBooks, and points to the new row", () => {
      expect(flagRow?.description).not.toMatch(/does not push anything to QuickBooks/);
      expect(flagRow?.description).toMatch(
        /It is also ticked automatically when an invoice is created from the quote \(see QuickBooks Invoice \(create and update\)\)\.$/,
      );
    });

    it("keeps the levels of the QuickBooks Invoice Flag row where they were", () => {
      const levels = Object.fromEntries(
        Object.entries(flagRow?.roles ?? {}).map(([role, access]) => [role, access.level]),
      );
      expect(levels).toEqual({
        admin: "full",
        account_manager: "full",
        accountant: "full",
        viewer: "read",
        developer: "none",
        driver: "none",
        maintainer: "none",
      });
    });

    it("names the invoice in the accountant's role description and in their note on Events", () => {
      expect(ROLE_DESCRIPTIONS.accountant).toMatch(
        /and create or update a quote's QuickBooks invoice/,
      );
      expect(eventsRow?.roles.accountant.note).toMatch(
        /and the QuickBooks invoice \(see those rows\)/,
      );
    });
  });
});

// The page tells people what they may do and the code decides it; this keeps the two from drifting.
describe("Send Emails", () => {
  const row = PERMISSIONS.find((p) => p.label === "Send Emails");

  it("is granted to exactly the roles canSendEmail allows: admin, account manager and accountant", () => {
    for (const role of Object.keys(ROLE_LABELS) as WebRole[]) {
      expect(row?.roles[role].level !== "none", role).toBe(canSendEmail([role]));
    }
    expect(
      (Object.keys(ROLE_LABELS) as WebRole[]).filter((role) => row?.roles[role].level === "full"),
    ).toEqual(expect.arrayContaining(["admin", "account_manager", "accountant"]));
  });

  it("tells a viewer why the buttons are dimmed", () => {
    expect(row?.roles.viewer.note).toMatch(/dimmed/i);
  });
});
