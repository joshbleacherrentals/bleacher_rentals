import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// util.ts decrypts and re-encrypts the QuickBooks OAuth tokens on every QuickBooks call. Whatever it
// prints ends up in the server logs, so none of the secrets may ever be printed: not the encryption
// key, not the tokens, not the ciphertext that holds them.

const { SECRETS, store } = vi.hoisted(() => {
  const SECRETS = {
    key: Buffer.alloc(32, 7).toString("base64"),
    accessToken: "access-token-SECRET-aaa111",
    refreshToken: "refresh-token-SECRET-bbb222",
  };
  process.env.QBO_TOKEN_ENCRYPTION_KEY = SECRETS.key;
  process.env.QBO_CLIENT_ID = "client-id-test";
  process.env.QBO_CLIENT_SECRET = "client-secret-SECRET-ccc333";
  process.env.QBO_ENVIRONMENT = "sandbox";
  process.env.QBO_REDIRECT_URI = "http://localhost:3000/api/quickbooks/callback";
  return { SECRETS, store: { encrypted: null as string | null } };
});

vi.mock("./db", () => ({
  getQboTokens: vi.fn(async () => store.encrypted),
  setQboTokens: vi.fn(async (_connectionId: string, encrypted: string) => {
    store.encrypted = encrypted;
  }),
}));

import { getQboAccessTokenAndRealmId, loadTokens, saveTokens } from "./util";

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;

let printed: string[];

function everythingPrinted(): string {
  return printed.join("\n");
}

function freshTokens() {
  return {
    access_token: SECRETS.accessToken,
    refresh_token: SECRETS.refreshToken,
    token_type: "bearer",
    expires_in: 3600,
    x_refresh_token_expires_in: 8640000,
    realmId: "realm-123",
    createdAt: Date.now(),
  };
}

function expectNothingSecretPrinted() {
  const output = everythingPrinted();
  expect(output).not.toContain(SECRETS.key);
  expect(output).not.toContain(SECRETS.accessToken);
  expect(output).not.toContain(SECRETS.refreshToken);
  expect(output).not.toContain("client-secret-SECRET-ccc333");
  // The ciphertext holds the tokens, so it is as sensitive as the tokens. "__pending__" is the
  // placeholder of a connection that is not authorised yet, not a ciphertext.
  if (store.encrypted && store.encrypted !== "__pending__") {
    expect(output).not.toContain(store.encrypted);
  }
}

beforeEach(() => {
  store.encrypted = null;
  printed = [];
  for (const method of CONSOLE_METHODS) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      printed.push(
        args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "),
      );
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("QuickBooks token storage logs no secrets", () => {
  it("saveTokens encrypts without printing the key, the tokens or the ciphertext", async () => {
    await saveTokens("conn-1", freshTokens());

    expect(store.encrypted).toBeTruthy();
    expect(store.encrypted).not.toContain(SECRETS.accessToken);
    expectNothingSecretPrinted();
  });

  it("loadTokens decrypts without printing the key, the tokens or the ciphertext", async () => {
    await saveTokens("conn-1", freshTokens());
    printed = [];

    const loaded = await loadTokens("conn-1");

    expect(loaded.access_token).toBe(SECRETS.accessToken);
    expect(loaded.refresh_token).toBe(SECRETS.refreshToken);
    expectNothingSecretPrinted();
  });

  it("loadTokens prints nothing secret for a connection that has no tokens yet", async () => {
    store.encrypted = "__pending__";

    expect(await loadTokens("conn-1")).toBeNull();
    expectNothingSecretPrinted();
  });

  it("getQboAccessTokenAndRealmId returns the credentials without printing them", async () => {
    await saveTokens("conn-1", freshTokens());
    printed = [];

    const credentials = await getQboAccessTokenAndRealmId("conn-1");

    expect(credentials).toEqual({ accessToken: SECRETS.accessToken, realmId: "realm-123" });
    expect(printed.length).toBeGreaterThan(0);
    expectNothingSecretPrinted();
  });
});
