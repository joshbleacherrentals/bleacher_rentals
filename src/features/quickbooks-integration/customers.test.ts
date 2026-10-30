import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Fake QuickBooks (global fetch) ──────────────────────────────────────────

type FakeQboCustomer = {
  Id: string;
  DisplayName: string;
  GivenName?: string;
  FamilyName?: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  Active: boolean;
};

let qboCustomers: FakeQboCustomer[] = [];
let qboCalls: Array<{ method: string; url: string; body?: any }> = [];
let nextCustomerId = 900;
// Names already taken by a vendor/employee: creating a customer with one fails (QBO code 6240).
let takenDisplayNames: string[] = [];

function unescapeQboValue(v: string) {
  return v.replace(/\\(.)/g, "$1");
}

function runCustomerQuery(query: string): FakeQboCustomer[] {
  const conditions = [...query.matchAll(/(\w+) = '((?:[^'\\]|\\.)*)'/g)].map(
    (m) => [m[1], unescapeQboValue(m[2])] as const,
  );
  return qboCustomers.filter((c) => {
    if (!c.Active && /Active = true/.test(query)) return false;
    return conditions.every(([field, value]) => {
      const actual = field === "PrimaryEmailAddr" ? c.PrimaryEmailAddr?.Address : (c as any)[field];
      return (actual ?? "").toLowerCase() === value.toLowerCase();
    });
  });
}

function fault(code: string, message: string, detail: string, status = 400) {
  return new Response(
    JSON.stringify({ Fault: { Error: [{ Message: message, Detail: detail, code }] } }),
    {
      status,
    },
  );
}

const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(init.body as string) : undefined;
  qboCalls.push({ method, url, body });

  const u = new URL(url);
  if (u.pathname.endsWith("/query")) {
    const found = runCustomerQuery(u.searchParams.get("query")!);
    return new Response(JSON.stringify({ QueryResponse: { Customer: found } }));
  }
  const byId = u.pathname.match(/\/customer\/([^/]+)$/);
  if (method === "GET" && byId) {
    const c = qboCustomers.find((x) => x.Id === byId[1]);
    return c
      ? new Response(JSON.stringify({ Customer: c }))
      : fault(
          "610",
          "Object Not Found",
          `Object Not Found : Something you're trying to use has been made inactive.`,
        );
  }
  if (method === "POST" && u.pathname.endsWith("/customer")) {
    if (takenDisplayNames.includes(body.DisplayName)) {
      return fault(
        "6240",
        "Duplicate Name Exists Error",
        `The name supplied already exists. : Another customer, vendor or employee is already using this name.`,
      );
    }
    const created: FakeQboCustomer = {
      Id: String(nextCustomerId++),
      DisplayName: body.DisplayName,
      GivenName: body.GivenName,
      FamilyName: body.FamilyName,
      CompanyName: body.CompanyName,
      PrimaryEmailAddr: body.PrimaryEmailAddr,
      Active: true,
    };
    qboCustomers.push(created);
    return new Response(JSON.stringify({ Customer: created }));
  }
  throw new Error(`unexpected QuickBooks call ${method} ${url}`);
});

// ── Fake Supabase (service role) ────────────────────────────────────────────

type LinkRow = { contact_uuid: string; qbo_connection_uuid: string; qbo_customer_id: string };
let linkRows: LinkRow[] = [];
let tablesTouched: string[] = [];
let insertedLinks: LinkRow[] = [];
let deletedLinks: Array<{ contact_uuid: string; qbo_connection_uuid: string }> = [];
// Simulates the other attempt winning the race: the row appears just before our insert.
let raceWinner: LinkRow | null = null;

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      tablesTouched.push(table);
      const filters: Record<string, string> = {};
      const matching = () =>
        linkRows.filter((r) =>
          Object.entries(filters).every(([k, v]) => (r as Record<string, string>)[k] === v),
        );
      const b: any = {
        select: () => b,
        eq: (k: string, v: string) => ((filters[k] = v), b),
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        delete: () => {
          const del: any = {
            eq: (k: string, v: string) => {
              filters[k] = v;
              return filters.contact_uuid && filters.qbo_connection_uuid
                ? (async () => {
                    deletedLinks.push({
                      contact_uuid: filters.contact_uuid,
                      qbo_connection_uuid: filters.qbo_connection_uuid,
                    });
                    linkRows = linkRows.filter((r) => !matching().includes(r));
                    return { error: null };
                  })()
                : del;
            },
          };
          return del;
        },
        insert: async (row: LinkRow) => {
          if (raceWinner) {
            linkRows.push(raceWinner);
            raceWinner = null;
          }
          if (
            linkRows.some(
              (r) =>
                r.contact_uuid === row.contact_uuid &&
                r.qbo_connection_uuid === row.qbo_connection_uuid,
            )
          ) {
            return { error: { code: "23505", message: "duplicate key" } };
          }
          linkRows.push(row);
          insertedLinks.push(row);
          return { error: null };
        },
      };
      return b;
    },
  }),
}));

vi.mock("./util", () => ({
  getQboAccessTokenAndRealmId: async () => ({ accessToken: "tok", realmId: "realm-1" }),
  getBaseUrl: () => "https://qbo.test/v3/company",
}));

import {
  escapeQboQueryValue,
  findCustomerCandidates,
  createCustomer,
  readLinkedCustomerId,
  resolveInvoiceCustomer,
  type BilledContact,
} from "./customers";

const CONN = "conn-1";

function contact(over: Partial<BilledContact> = {}): BilledContact {
  return {
    id: "contact-1",
    firstName: "Ann",
    lastName: "Lee",
    email: "ann@acme.com",
    companyName: "Acme Inc",
    ...over,
  };
}

function qboCustomer(over: Partial<FakeQboCustomer> = {}): FakeQboCustomer {
  return {
    Id: "10",
    DisplayName: "Ann Lee",
    GivenName: "Ann",
    FamilyName: "Lee",
    CompanyName: "Acme Inc",
    PrimaryEmailAddr: { Address: "ann@acme.com" },
    Active: true,
    ...over,
  };
}

const posts = () => qboCalls.filter((c) => c.method === "POST");
const queries = () =>
  qboCalls
    .filter((c) => c.url.includes("/query"))
    .map((c) => new URL(c.url).searchParams.get("query")!);

beforeEach(() => {
  vi.stubGlobal("fetch", fakeFetch);
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  qboCustomers = [];
  qboCalls = [];
  nextCustomerId = 900;
  takenDisplayNames = [];
  linkRows = [];
  tablesTouched = [];
  insertedLinks = [];
  deletedLinks = [];
  raceWinner = null;
  fakeFetch.mockClear();
});

afterEach(() => {
  // The module writes the link row; it never writes Events (spec §4).
  expect(tablesTouched.every((t) => t === "ContactQboCustomers")).toBe(true);
});

describe("escapeQboQueryValue", () => {
  it("escapes a single quote and a backslash", () => {
    expect(escapeQboQueryValue("O'Brien")).toBe("O\\'Brien");
    expect(escapeQboQueryValue("a\\b")).toBe("a\\\\b");
  });

  it("leaves a plain name unchanged", () => {
    expect(escapeQboQueryValue("Ann Lee")).toBe("Ann Lee");
  });
});

describe("resolveInvoiceCustomer", () => {
  it("uses the one customer whose email matches, links it, creates nothing", async () => {
    qboCustomers = [qboCustomer({ Id: "10", GivenName: "Someone", FamilyName: "Else" })];

    const r = await resolveInvoiceCustomer(CONN, contact());

    expect(r).toEqual({ kind: "customer", customerId: "10", how: "found" });
    expect(insertedLinks).toEqual([
      { contact_uuid: "contact-1", qbo_connection_uuid: CONN, qbo_customer_id: "10" },
    ]);
    expect(posts()).toHaveLength(0);
  });

  it("returns every name match for a choice, with names, companies and emails, writing nothing", async () => {
    qboCustomers = [
      qboCustomer({
        Id: "10",
        DisplayName: "Ann Lee",
        CompanyName: "Acme Inc",
        PrimaryEmailAddr: { Address: "a1@x.com" },
      }),
      qboCustomer({
        Id: "11",
        DisplayName: "Ann Lee (Beta)",
        CompanyName: "Beta LLC",
        PrimaryEmailAddr: undefined,
      }),
    ];

    const r = await resolveInvoiceCustomer(CONN, contact({ email: "nobody@x.com" }));

    expect(r).toEqual({
      kind: "choose",
      candidates: [
        { id: "10", displayName: "Ann Lee", companyName: "Acme Inc", email: "a1@x.com" },
        { id: "11", displayName: "Ann Lee (Beta)", companyName: "Beta LLC", email: null },
      ],
    });
    expect(insertedLinks).toHaveLength(0);
    expect(posts()).toHaveLength(0);
  });

  it("creates one customer with the right fields and links it when nothing matches", async () => {
    const r = await resolveInvoiceCustomer(CONN, contact());

    expect(r).toEqual({ kind: "customer", customerId: "900", how: "created" });
    expect(posts()).toHaveLength(1);
    expect(posts()[0].body).toEqual({
      GivenName: "Ann",
      FamilyName: "Lee",
      DisplayName: "Ann Lee",
      CompanyName: "Acme Inc",
      PrimaryEmailAddr: { Address: "ann@acme.com" },
    });
    expect(insertedLinks).toEqual([
      { contact_uuid: "contact-1", qbo_connection_uuid: CONN, qbo_customer_id: "900" },
    ]);
  });

  it("still creates the person when only their company exists (the company never matches alone)", async () => {
    qboCustomers = [
      qboCustomer({
        Id: "20",
        DisplayName: "Acme Inc",
        GivenName: undefined,
        FamilyName: undefined,
        PrimaryEmailAddr: undefined,
      }),
      qboCustomer({
        Id: "21",
        DisplayName: "Bob Ray",
        GivenName: "Bob",
        FamilyName: "Ray",
        PrimaryEmailAddr: { Address: "bob@acme.com" },
      }),
    ];

    const r = await resolveInvoiceCustomer(CONN, contact());

    expect(r).toEqual({ kind: "customer", customerId: "900", how: "created" });
    expect(posts()).toHaveLength(1);
    expect(posts()[0].body.CompanyName).toBe("Acme Inc");
  });

  it("returns a linked customer that still exists without searching", async () => {
    qboCustomers = [qboCustomer({ Id: "10" })];
    linkRows = [{ contact_uuid: "contact-1", qbo_connection_uuid: CONN, qbo_customer_id: "10" }];

    const r = await resolveInvoiceCustomer(CONN, contact());

    expect(r).toEqual({ kind: "customer", customerId: "10", how: "linked" });
    expect(queries()).toHaveLength(0);
    expect(posts()).toHaveLength(0);
    expect(insertedLinks).toHaveLength(0);
  });

  it.each([
    ["deleted", [] as FakeQboCustomer[]],
    ["inactive", [qboCustomer({ Id: "10", Active: false })]],
  ])("deletes a link to a %s customer, then searches", async (_label, customers) => {
    qboCustomers = customers;
    linkRows = [{ contact_uuid: "contact-1", qbo_connection_uuid: CONN, qbo_customer_id: "10" }];

    const r = await resolveInvoiceCustomer(CONN, contact());

    expect(deletedLinks).toEqual([{ contact_uuid: "contact-1", qbo_connection_uuid: CONN }]);
    expect(queries().length).toBeGreaterThan(0);
    expect(r).toEqual({ kind: "customer", customerId: "900", how: "created" });
    expect(linkRows).toEqual([
      { contact_uuid: "contact-1", qbo_connection_uuid: CONN, qbo_customer_id: "900" },
    ]);
  });

  it("links the customer picked with choice existing", async () => {
    qboCustomers = [qboCustomer({ Id: "10" }), qboCustomer({ Id: "11", DisplayName: "Ann Lee 2" })];

    const r = await resolveInvoiceCustomer(CONN, contact(), { kind: "existing", customerId: "11" });

    expect(r).toEqual({ kind: "customer", customerId: "11", how: "chosen" });
    expect(insertedLinks).toEqual([
      { contact_uuid: "contact-1", qbo_connection_uuid: CONN, qbo_customer_id: "11" },
    ]);
    expect(posts()).toHaveLength(0);
  });

  it("throws and links nothing when choice existing names an id QuickBooks does not know", async () => {
    await expect(
      resolveInvoiceCustomer(CONN, contact(), { kind: "existing", customerId: "404" }),
    ).rejects.toThrow(/404/);
    expect(insertedLinks).toHaveLength(0);
    expect(linkRows).toHaveLength(0);
  });

  it("creates with choice new even when candidates exist", async () => {
    qboCustomers = [qboCustomer({ Id: "10" })];

    const r = await resolveInvoiceCustomer(CONN, contact(), { kind: "new" });

    expect(r).toEqual({ kind: "customer", customerId: "900", how: "created" });
    expect(posts()).toHaveLength(1);
    expect(insertedLinks).toHaveLength(1);
  });

  it("searches only by the name when the contact has no email", async () => {
    qboCustomers = [qboCustomer({ Id: "10", PrimaryEmailAddr: undefined })];

    const r = await resolveInvoiceCustomer(CONN, contact({ email: null }));

    expect(r).toEqual({ kind: "customer", customerId: "10", how: "found" });
    expect(queries().every((q) => !q.includes("PrimaryEmailAddr"))).toBe(true);
  });

  it("searches by the given name alone, and creates without FamilyName, when there is no last name", async () => {
    qboCustomers = [qboCustomer({ Id: "10", GivenName: "Ann", FamilyName: "Lee" })];

    const r = await resolveInvoiceCustomer(CONN, contact({ lastName: null, email: null }));

    expect(queries().every((q) => !q.includes("FamilyName"))).toBe(true);
    // Ann Lee has a family name, so she is not the contact "Ann" with none.
    expect(r).toEqual({ kind: "customer", customerId: "900", how: "created" });
    expect(posts()[0].body).toEqual({
      GivenName: "Ann",
      DisplayName: "Ann",
      CompanyName: "Acme Inc",
    });
  });

  it("matches the email and the names without regard to case", async () => {
    qboCustomers = [qboCustomer({ Id: "10", PrimaryEmailAddr: { Address: "ANN@ACME.COM" } })];

    const r = await resolveInvoiceCustomer(CONN, contact({ email: "Ann@Acme.com" }));

    expect(r).toEqual({ kind: "customer", customerId: "10", how: "found" });
  });

  it("sends a name with an apostrophe to QuickBooks escaped", async () => {
    qboCustomers = [
      qboCustomer({
        Id: "10",
        GivenName: "Pat",
        FamilyName: "O'Brien",
        DisplayName: "Pat O'Brien",
        PrimaryEmailAddr: undefined,
      }),
    ];

    const r = await resolveInvoiceCustomer(
      CONN,
      contact({ firstName: "Pat", lastName: "O'Brien", email: null }),
    );

    expect(queries().some((q) => q.includes("FamilyName = 'O\\'Brien'"))).toBe(true);
    expect(r).toEqual({ kind: "customer", customerId: "10", how: "found" });
  });

  it("turns QuickBooks' duplicate-name error into a readable message and links nothing", async () => {
    takenDisplayNames = ["Ann Lee"];

    await expect(resolveInvoiceCustomer(CONN, contact())).rejects.toThrow(
      "QuickBooks already has a customer, vendor or employee named Ann Lee; create the customer by hand and try again",
    );
    expect(insertedLinks).toHaveLength(0);
  });

  it("reads the winner's row when another attempt linked the contact first", async () => {
    raceWinner = { contact_uuid: "contact-1", qbo_connection_uuid: CONN, qbo_customer_id: "777" };

    const r = await resolveInvoiceCustomer(CONN, contact());

    expect(r).toEqual({ kind: "customer", customerId: "777", how: "created" });
  });

  it("never touches the Events table", async () => {
    await resolveInvoiceCustomer(CONN, contact());
    expect(tablesTouched).not.toContain("Events");
  });
});

describe("findCustomerCandidates / createCustomer", () => {
  it("merges the email and name matches by id", async () => {
    qboCustomers = [
      qboCustomer({ Id: "10" }),
      qboCustomer({ Id: "11", PrimaryEmailAddr: undefined }),
    ];

    const found = await findCustomerCandidates(CONN, contact());

    expect(found.map((c) => c.id).sort()).toEqual(["10", "11"]);
  });

  it("creates a flat customer and copies nothing but name, company and email", async () => {
    const created = await createCustomer(CONN, contact({ companyName: null, email: null }));

    expect(posts()[0].body).toEqual({
      GivenName: "Ann",
      FamilyName: "Lee",
      DisplayName: "Ann Lee",
    });
    expect(created.id).toBe("900");
  });
});

// docs/specs/qbo-invoice-06-totals-check.md §3: the invoice check reads the contact's stored link
// and nothing else — it looks nothing up in QuickBooks, creates nothing and drops no stale link.
describe("readLinkedCustomerId", () => {
  it("returns the QuickBooks customer the contact is linked to in that connection", async () => {
    linkRows = [
      { contact_uuid: "contact-1", qbo_connection_uuid: CONN, qbo_customer_id: "77" },
      { contact_uuid: "contact-1", qbo_connection_uuid: "conn-2", qbo_customer_id: "88" },
      { contact_uuid: "contact-2", qbo_connection_uuid: CONN, qbo_customer_id: "99" },
    ];

    expect(await readLinkedCustomerId(CONN, "contact-1")).toBe("77");
  });

  it("returns null when the contact has no link in that connection", async () => {
    linkRows = [
      { contact_uuid: "contact-1", qbo_connection_uuid: "conn-2", qbo_customer_id: "88" },
    ];

    expect(await readLinkedCustomerId(CONN, "contact-1")).toBeNull();
  });

  it("calls QuickBooks never, writes nothing and drops no link, even a stale one", async () => {
    linkRows = [{ contact_uuid: "contact-1", qbo_connection_uuid: CONN, qbo_customer_id: "gone" }];

    await readLinkedCustomerId(CONN, "contact-1");

    expect(qboCalls).toHaveLength(0);
    expect(insertedLinks).toHaveLength(0);
    expect(deletedLinks).toHaveLength(0);
    expect(linkRows).toHaveLength(1);
  });
});
