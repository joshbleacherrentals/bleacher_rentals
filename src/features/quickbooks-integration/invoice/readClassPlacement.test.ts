import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/specs/qbo-invoice-03f-canadian-class-on-header.md §4 and §7: readClassPlacement asks
// QuickBooks where the company wants the Class and keeps nothing. QuickBooks is a fake fetch.

vi.mock("../util", () => ({
  getBaseUrl: () => "https://qbo.example.com/v3/company",
  getQboAccessTokenAndRealmId: vi.fn(async () => ({ accessToken: "tok", realmId: "123" })),
}));

import { getQboAccessTokenAndRealmId } from "../util";
import { readClassPlacement } from "./readClassPlacement";

let reply: { status: number; body: unknown };

beforeEach(() => {
  reply = { status: 200, body: {} };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(reply.body), { status: reply.status })),
  );
});
afterEach(() => vi.unstubAllGlobals());

const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;

/** What QuickBooks sends for the company's preferences. */
const preferences = (accountingInfoPrefs: Record<string, unknown> | undefined) => ({
  Preferences: {
    Id: "1",
    SyncToken: "4",
    ...(accountingInfoPrefs === undefined ? {} : { AccountingInfoPrefs: accountingInfoPrefs }),
  },
});

const readWith = (accountingInfoPrefs: Record<string, unknown> | undefined) => {
  reply = { status: 200, body: preferences(accountingInfoPrefs) };
  return readClassPlacement("conn-1");
};

describe("readClassPlacement — the request", () => {
  it("asks for the preferences of the connection's company, with its token", async () => {
    await readWith({ ClassTrackingPerTxn: true, ClassTrackingPerTxnLine: false });

    expect(getQboAccessTokenAndRealmId).toHaveBeenCalledWith("conn-1");
    const [url, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://qbo.example.com/v3/company/123/preferences");
    expect(url).toContain("minorversion=40");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("makes one request per call and keeps nothing: two calls are two requests", async () => {
    await readWith({ ClassTrackingPerTxn: true });
    await readWith({ ClassTrackingPerTxn: true });

    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });
});

describe("readClassPlacement — the answer", () => {
  it("ClassTrackingPerTxn on is the header", async () => {
    expect(await readWith({ ClassTrackingPerTxn: true, ClassTrackingPerTxnLine: false })).toBe(
      "header",
    );
  });

  it("ClassTrackingPerTxnLine on is the line", async () => {
    expect(await readWith({ ClassTrackingPerTxn: false, ClassTrackingPerTxnLine: true })).toBe(
      "line",
    );
  });

  it("both off is none", async () => {
    expect(await readWith({ ClassTrackingPerTxn: false, ClassTrackingPerTxnLine: false })).toBe(
      "none",
    );
  });

  it("a setting that is absent in an otherwise normal answer counts as off", async () => {
    expect(await readWith({ TrackDepartments: true })).toBe("none");
    expect(await readWith({ ClassTrackingPerTxnLine: true })).toBe("line");
    expect(await readWith({ ClassTrackingPerTxn: true })).toBe("header");
  });
});

describe("readClassPlacement — an answer that cannot be used, and failures", () => {
  it("both settings on throws", async () => {
    await expect(
      readWith({ ClassTrackingPerTxn: true, ClassTrackingPerTxnLine: true }),
    ).rejects.toThrow(/QuickBooks preferences read failed/);
  });

  it("an answer with no AccountingInfoPrefs throws", async () => {
    await expect(readWith(undefined)).rejects.toThrow(/QuickBooks preferences read failed/);
  });

  it("an answer with no Preferences at all throws", async () => {
    reply = { status: 200, body: {} };

    await expect(readClassPlacement("conn-1")).rejects.toThrow(
      /QuickBooks preferences read failed/,
    );
  });

  it("a refusal passes QuickBooks' detail on", async () => {
    reply = {
      status: 403,
      body: { Fault: { Error: [{ Message: "Forbidden", Detail: "no scope" }] } },
    };

    await expect(readClassPlacement("conn-1")).rejects.toThrow(
      /QuickBooks preferences read failed: no scope/,
    );
  });

  it("a refusal with only a message passes the message on", async () => {
    reply = { status: 500, body: { Fault: { Error: [{ Message: "Bad things" }] } } };

    await expect(readClassPlacement("conn-1")).rejects.toThrow(/Bad things/);
  });

  it("a platform error page (no JSON) names the status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("An error occurred", { status: 504 })),
    );

    await expect(readClassPlacement("conn-1")).rejects.toThrow(
      /QuickBooks preferences read failed: .*504/,
    );
  });

  it("a lost token passes its own error on", async () => {
    vi.mocked(getQboAccessTokenAndRealmId).mockRejectedValueOnce(
      new Error("Please re-authenticate QuickBooks"),
    );

    await expect(readClassPlacement("conn-1")).rejects.toThrow(/re-authenticate/);
  });

  it("a request that cannot be made throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    await expect(readClassPlacement("conn-1")).rejects.toThrow(/network down/);
  });
});
