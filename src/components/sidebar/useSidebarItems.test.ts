import { describe, it, expect } from "vitest";
import { useSidebarItems } from "./useSidebarItems";

describe("useSidebarItems", () => {
  // ═══ Admin ═══

  it("admin sees all sidebar items including configuration", () => {
    const items = useSidebarItems(["admin"]);
    const keys = items.map((i) => i.key);
    expect(keys).toContain("dashboard");
    expect(keys).toContain("quotes-bookings");
    expect(keys).toContain("team");
    expect(keys).toContain("assets");
    expect(keys).toContain("quality-assurance");
    expect(keys).toContain("accountant");
    expect(keys).toContain("work-trackers");
    expect(keys).toContain("scorecard");
    expect(keys).toContain("leaderboard");
    expect(keys).toContain("driver-calendar");
    expect(keys).toContain("configuration");
  });

  it("admin lists Accountant immediately before Work Trackers", () => {
    const keys = useSidebarItems(["admin"]).map((i) => i.key);
    expect(keys.indexOf("accountant")).toBe(keys.indexOf("work-trackers") - 1);
  });

  // ═══ Viewer ═══

  it("viewer sees team page", () => {
    const items = useSidebarItems(["viewer"]);
    const keys = items.map((i) => i.key);
    expect(keys).toContain("team");
  });

  it("viewer sees dashboard, quotes, assets, work-trackers", () => {
    const items = useSidebarItems(["viewer"]);
    const keys = items.map((i) => i.key);
    expect(keys).toContain("dashboard");
    expect(keys).toContain("quotes-bookings");
    expect(keys).toContain("assets");
    expect(keys).toContain("work-trackers");
  });

  it("viewer does NOT see configuration", () => {
    const items = useSidebarItems(["viewer"]);
    const keys = items.map((i) => i.key);
    expect(keys).not.toContain("configuration");
  });

  it("viewer sees scorecard and leaderboard", () => {
    const items = useSidebarItems(["viewer"]);
    const keys = items.map((i) => i.key);
    expect(keys).toContain("scorecard");
    expect(keys).toContain("leaderboard");
  });

  // ═══ Account Manager ═══

  it("account_manager sees admin items minus configuration and the Accountant page", () => {
    const adminItems = useSidebarItems(["admin"]);
    const amItems = useSidebarItems(["account_manager"]);
    const adminOnly = ["configuration", "accountant"];
    expect(amItems.map((i) => i.key)).toEqual(
      adminItems.filter((i) => !adminOnly.includes(i.key)).map((i) => i.key),
    );
  });

  // ═══ Driver ═══

  it("driver sees no sidebar items", () => {
    const items = useSidebarItems(["driver"]);
    expect(items).toEqual([]);
  });

  // ═══ Multiple roles ═══

  it("viewer + admin merges to show everything (union)", () => {
    const items = useSidebarItems(["viewer", "admin"]);
    const keys = items.map((i) => i.key);
    expect(keys).toContain("configuration");
    expect(keys).toContain("team");
  });

  // ═══ Empty roles ═══

  it("empty roles array returns no items", () => {
    const items = useSidebarItems([]);
    expect(items).toEqual([]);
  });

  // ═══ Maintainer ═══

  it("maintainer sees Annual Inspections, Damage Reports and Repairs under Quality Assurance — not the inspections list", () => {
    const items = useSidebarItems(["maintainer"]);
    const qa = items.find((i) => i.key === "quality-assurance");
    expect(qa).toBeDefined();
    expect(qa!.type).toBe("dropdown");
    const children = (qa as Extract<typeof qa, { type: "dropdown" }>).children;
    expect(children.map((c) => c.href)).toEqual([
      "/damage-reports",
      "/annual-inspections",
      "/repairs",
    ]);
  });

  it("maintainer sees the dashboard and assets — but no work trackers or quotes", () => {
    const keys = useSidebarItems(["maintainer"]).map((i) => i.key);
    expect(keys).toContain("dashboard");
    expect(keys).not.toContain("work-trackers");
    expect(keys).not.toContain("quotes-bookings");
    // Assets stays: a maintainer opens a bleacher to reach its inspection history.
    expect(keys).toContain("assets");
  });

  it("account_manager no longer sees Annual Inspections, but keeps the rest of Quality Assurance", () => {
    const items = useSidebarItems(["account_manager"]);
    const qa = items.find((i) => i.key === "quality-assurance");
    const children = (qa as Extract<typeof qa, { type: "dropdown" }>).children;
    expect(children.map((c) => c.href)).toEqual(["/damage-reports", "/inspections", "/repairs"]);
  });

  it("admin and viewer still see every Quality Assurance child", () => {
    for (const role of ["admin", "viewer"] as const) {
      const qa = useSidebarItems([role]).find((i) => i.key === "quality-assurance");
      const children = (qa as Extract<typeof qa, { type: "dropdown" }>).children;
      expect(children.map((c) => c.href)).toEqual([
        "/damage-reports",
        "/inspections",
        "/annual-inspections",
        "/repairs",
      ]);
    }
  });

  it("an account manager who is also a maintainer gets the union of the children", () => {
    const qa = useSidebarItems(["account_manager", "maintainer"]).find(
      (i) => i.key === "quality-assurance",
    );
    const children = (qa as Extract<typeof qa, { type: "dropdown" }>).children;
    expect(children.map((c) => c.href)).toEqual([
      "/damage-reports",
      "/inspections",
      "/annual-inspections",
      "/repairs",
    ]);
  });

  // ═══ Accountant (Stage 2: Work Trackers) ═══

  it("accountant sees Quotes & Bookings, Team, Accountant, Work Trackers, Messages, Companies & Contacts and the Documentation section, nothing else", () => {
    const items = useSidebarItems(["accountant"]);
    expect(items.map((i) => i.key)).toEqual([
      "quotes-bookings",
      "team",
      "accountant",
      "work-trackers",
      "messages",
      "companies-contacts",
      "documentation",
    ]);

    const quotes = items[0];
    expect(quotes.type).toBe("button");
    expect("label" in quotes && quotes.label).toBe("Quotes & Bookings");
    expect("href" in quotes && quotes.href).toBe("/quotes-bookings");

    // docs/specs/accountant-team.md §6: Team, where ALL_ITEMS puts it — after Quotes & Bookings.
    const team = items[1];
    expect(team.type).toBe("button");
    expect("label" in team && team.label).toBe("Team");
    expect("href" in team && team.href).toBe("/team");

    const accountantPage = items[2];
    expect(accountantPage.type).toBe("button");
    expect("label" in accountantPage && accountantPage.label).toBe("Accountant");
    expect("href" in accountantPage && accountantPage.href).toBe("/accountant");

    const workTrackers = items[3];
    expect(workTrackers.type).toBe("button");
    expect("href" in workTrackers && workTrackers.href).toBe("/work-trackers");

    // docs/specs/accountant-quotes-11-accountant-internal-chat.md §4: Messages, with Internal only.
    const messages = items[4];
    expect(messages.type).toBe("dropdown");
    expect("label" in messages && messages.label).toBe("Messages");

    // docs/specs/accountant-address-book.md §4: Companies & Contacts, after Messages.
    const companiesContacts = items[5];
    expect(companiesContacts.type).toBe("button");
    expect("label" in companiesContacts && companiesContacts.label).toBe("Companies & Contacts");
    expect("href" in companiesContacts && companiesContacts.href).toBe("/companies-contacts");

    const docs = items[6];
    expect(docs.type).toBe("section");
    const hrefs = (docs as Extract<typeof docs, { type: "section" }>).children.map((c) =>
      "href" in c ? c.href : "",
    );
    expect(hrefs).toEqual(["/permissions", "/changelog"]);
  });

  // docs/specs/accountant-quotes-11-accountant-internal-chat.md §4 and D4: the accountant gets the
  // Internal conversations only; /messages/external stays reachable by URL (a placeholder) but the
  // sidebar does not offer it to them.
  const messagesChildren = (roles: Parameters<typeof useSidebarItems>[0]) => {
    const item = useSidebarItems(roles).find((i) => i.key === "messages");
    if (!item || item.type !== "dropdown") return undefined;
    return item.children.map((c) => c.label);
  };

  it("accountant's Messages offers Internal and not External", () => {
    expect(messagesChildren(["accountant"])).toEqual(["Internal"]);
  });

  it("admin and account manager still see both Internal and External", () => {
    expect(messagesChildren(["admin"])).toEqual(["Internal", "External"]);
    expect(messagesChildren(["account_manager"])).toEqual(["Internal", "External"]);
  });

  it("an account manager who is also an accountant still sees both", () => {
    expect(messagesChildren(["account_manager", "accountant"])).toEqual(["Internal", "External"]);
  });

  it("viewer, maintainer, developer and driver have no Messages", () => {
    for (const role of ["viewer", "maintainer", "developer", "driver"] as const) {
      expect(messagesChildren([role]), role).toBeUndefined();
    }
  });

  it("accountant sees no Quality Assurance dropdown — it would open onto nothing", () => {
    const keys = useSidebarItems(["accountant"]).map((i) => i.key);
    expect(keys).not.toContain("quality-assurance");
  });

  it("an account manager who is also an accountant sees what an account manager sees, plus Accountant", () => {
    const keys = useSidebarItems(["account_manager", "accountant"]).map((i) => i.key);
    const amKeys = useSidebarItems(["account_manager"]).map((i) => i.key);
    expect(keys).toEqual(
      amKeys.flatMap((key) => (key === "work-trackers" ? ["accountant", key] : [key])),
    );
  });

  it("account manager and viewer do not see Accountant", () => {
    for (const role of [
      "account_manager",
      "viewer",
      "maintainer",
      "developer",
      "driver",
    ] as const) {
      expect(
        useSidebarItems([role]).map((i) => i.key),
        role,
      ).not.toContain("accountant");
    }
  });

  // ═══ Dev Tools ═══

  const devToolsHrefs = (roles: Parameters<typeof useSidebarItems>[0]) => {
    const section = useSidebarItems(roles).find((i) => i.key === "dev-tools");
    if (!section || section.type !== "section") return undefined;
    return section.children.map((c) => ("href" in c ? c.href : ""));
  };

  it("developer sees a Dev Tools section with every /dev-tools page", () => {
    expect(devToolsHrefs(["developer"])).toEqual([
      "/dev-tools/sync-health",
      "/dev-tools/performance",
      "/dev-tools/stripe-checkout",
      "/dev-tools/damage-photos",
      "/dev-tools/qbo-get-sales-tax",
      "/dev-tools/allowed-emails",
    ]);
  });

  it("Sync Health is no longer a standalone sidebar item", () => {
    const keys = useSidebarItems(["developer"]).map((i) => i.key);
    expect(keys).not.toContain("sync-health");
  });

  it.each(["admin", "account_manager", "viewer", "maintainer", "accountant", "driver"] as const)(
    "%s without the developer role does not see Dev Tools",
    (role) => {
      expect(devToolsHrefs([role])).toBeUndefined();
    },
  );
});
