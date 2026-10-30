import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const request = vi.fn();
const adcRequested = vi.fn();
const fromJSON = vi.fn();
const getVercelOidcToken = vi.fn();
vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    getClient = async () => {
      adcRequested();
      return { request };
    };
  },
  ExternalAccountClient: { fromJSON: (options: unknown) => fromJSON(options) },
}));
vi.mock("@vercel/oidc", () => ({
  getVercelOidcToken: (...args: unknown[]) => getVercelOidcToken(...args),
}));

import {
  buildDelegationClaims,
  federationClientOptions,
  federationConfigFromEnv,
  getDelegatedAccessToken,
  GMAIL_READONLY_SCOPE,
} from "./delegatedAuth";

const SERVICE_ACCOUNT = "sync@project.iam.gserviceaccount.com";

beforeEach(() => {
  vi.stubEnv("GMAIL_DWD_SERVICE_ACCOUNT_EMAIL", SERVICE_ACCOUNT);
  // The default is local development: no federation settings, so the local credentials are used.
  for (const name of [
    "GCP_PROJECT_NUMBER",
    "GCP_WORKLOAD_IDENTITY_POOL_ID",
    "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID",
    "GCP_SERVICE_ACCOUNT_EMAIL",
  ]) {
    vi.stubEnv(name, "");
  }
  request.mockReset().mockResolvedValue({ data: { signedJwt: "signed.jwt.value" } });
  adcRequested.mockReset();
  fromJSON.mockReset();
  getVercelOidcToken.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubTokenEndpoint(status: number, body: object) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("buildDelegationClaims", () => {
  it("impersonates the subject, joins scopes with spaces, and expires within the hour", () => {
    const claims = buildDelegationClaims({
      serviceAccountEmail: SERVICE_ACCOUNT,
      subject: "josh@tpi-3.ca",
      scopes: [GMAIL_READONLY_SCOPE, "https://www.googleapis.com/auth/gmail.send"],
      nowSeconds: 1000,
    });

    expect(claims).toMatchObject({
      iss: SERVICE_ACCOUNT,
      sub: "josh@tpi-3.ca",
      scope: `${GMAIL_READONLY_SCOPE} https://www.googleapis.com/auth/gmail.send`,
      aud: "https://oauth2.googleapis.com/token",
      iat: 1000,
    });
    expect(claims.exp - claims.iat).toBeLessThan(3600);
  });
});

describe("getDelegatedAccessToken", () => {
  it("has IAM sign the claims, then trades the signed JWT for an access token", async () => {
    const fetchMock = stubTokenEndpoint(200, { access_token: "ya29.token" });

    const token = await getDelegatedAccessToken({
      subject: "josh@tpi-3.ca",
      scopes: [GMAIL_READONLY_SCOPE],
    });

    expect(token).toBe("ya29.token");

    const signRequest = request.mock.calls[0][0];
    expect(signRequest.url).toBe(
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(
        SERVICE_ACCOUNT,
      )}:signJwt`,
    );
    expect(JSON.parse(signRequest.data.payload)).toMatchObject({
      iss: SERVICE_ACCOUNT,
      sub: "josh@tpi-3.ca",
      scope: GMAIL_READONLY_SCOPE,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init.body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(init.body.get("assertion")).toBe("signed.jwt.value");
  });

  it("explains an unauthorized_client refusal as a missing domain-wide delegation grant", async () => {
    stubTokenEndpoint(401, {
      error: "unauthorized_client",
      error_description: "Client is unauthorized to retrieve access tokens using this method",
    });

    await expect(
      getDelegatedAccessToken({ subject: "josh@tpi-3.ca", scopes: [GMAIL_READONLY_SCOPE] }),
    ).rejects.toThrow(/unauthorized_client[\s\S]*Admin console/);
  });

  it("says what to grant when IAM refuses to sign", async () => {
    request.mockRejectedValue({
      response: { data: { error: { message: "Permission 'iam.serviceAccounts.signJwt' denied" } } },
    });

    await expect(
      getDelegatedAccessToken({ subject: "josh@tpi-3.ca", scopes: [GMAIL_READONLY_SCOPE] }),
    ).rejects.toThrow(/signJwt' denied[\s\S]*Service Account Token Creator/);
  });

  it("throws when the service account email is not configured", async () => {
    vi.stubEnv("GMAIL_DWD_SERVICE_ACCOUNT_EMAIL", "");

    await expect(
      getDelegatedAccessToken({ subject: "josh@tpi-3.ca", scopes: [GMAIL_READONLY_SCOPE] }),
    ).rejects.toThrow("GMAIL_DWD_SERVICE_ACCOUNT_EMAIL is not set");
    expect(request).not.toHaveBeenCalled();
  });
});

const FEDERATION_ENV = {
  GCP_PROJECT_NUMBER: "123456789012",
  GCP_WORKLOAD_IDENTITY_POOL_ID: "vercel",
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: "vercel-provider",
  GCP_SERVICE_ACCOUNT_EMAIL: "caller@project.iam.gserviceaccount.com",
};

describe("federationConfigFromEnv", () => {
  it("is null when none of the settings exist, so local development uses its own credentials", () => {
    expect(federationConfigFromEnv({})).toBeNull();
    expect(
      federationConfigFromEnv({ GCP_PROJECT_NUMBER: "", GCP_SERVICE_ACCOUNT_EMAIL: "  " }),
    ).toBeNull();
  });

  it("reads all four settings, trimmed", () => {
    expect(
      federationConfigFromEnv({ ...FEDERATION_ENV, GCP_WORKLOAD_IDENTITY_POOL_ID: " vercel " }),
    ).toEqual({
      projectNumber: "123456789012",
      poolId: "vercel",
      providerId: "vercel-provider",
      callerServiceAccountEmail: "caller@project.iam.gserviceaccount.com",
    });
  });

  it("names what is missing when only some are set, instead of falling back to local credentials", () => {
    expect(() =>
      federationConfigFromEnv({ ...FEDERATION_ENV, GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: "" }),
    ).toThrow(/GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID must be set too/);
  });
});

describe("federationClientOptions", () => {
  const config = federationConfigFromEnv(FEDERATION_ENV)!;

  it("trades Vercel's token at the pool's provider, acting as the caller service account", () => {
    const options = federationClientOptions(config) as unknown as Record<string, unknown>;

    expect(options).toMatchObject({
      type: "external_account",
      audience:
        "//iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/vercel/providers/vercel-provider",
      token_url: "https://sts.googleapis.com/v1/token",
      service_account_impersonation_url:
        "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/caller%40project.iam.gserviceaccount.com:generateAccessToken",
    });
  });

  it("asks Vercel for its default token, not one for Google's audience", async () => {
    getVercelOidcToken.mockResolvedValue("vercel.oidc.token");
    const supplier = (
      federationClientOptions(config) as unknown as {
        subject_token_supplier: {
          getSubjectToken: (context: { audience: string }) => Promise<string>;
        };
      }
    ).subject_token_supplier;

    await expect(supplier.getSubjectToken({ audience: "//iam.googleapis.com/x" })).resolves.toBe(
      "vercel.oidc.token",
    );
    expect(getVercelOidcToken).toHaveBeenCalledWith();
  });
});

describe("getDelegatedAccessToken on Vercel", () => {
  // The client is kept between calls in the module, so each test starts from a fresh one.
  async function freshModule() {
    vi.resetModules();
    return import("./delegatedAuth");
  }

  beforeEach(() => {
    for (const [name, value] of Object.entries(FEDERATION_ENV)) vi.stubEnv(name, value);
    fromJSON.mockReturnValue({ request });
  });

  it("signs through the federated client, not the local credentials, and keeps the client", async () => {
    stubTokenEndpoint(200, { access_token: "ya29.token" });
    const { getDelegatedAccessToken: run } = await freshModule();
    const input = { subject: "josh@tpi-3.ca", scopes: [GMAIL_READONLY_SCOPE] };

    await expect(run(input)).resolves.toBe("ya29.token");
    await expect(run(input)).resolves.toBe("ya29.token");

    expect(fromJSON).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(adcRequested).not.toHaveBeenCalled();
  });

  it("says so when Google cannot use the settings", async () => {
    fromJSON.mockReturnValue(null);
    const { getDelegatedAccessToken: run } = await freshModule();

    await expect(run({ subject: "josh@tpi-3.ca", scopes: [GMAIL_READONLY_SCOPE] })).rejects.toThrow(
      "Google could not use the workload identity federation settings.",
    );
  });

  it("fails clearly, rather than trying local credentials, when the settings are half there", async () => {
    vi.stubEnv("GCP_PROJECT_NUMBER", "");
    const { getDelegatedAccessToken: run } = await freshModule();

    await expect(run({ subject: "josh@tpi-3.ca", scopes: [GMAIL_READONLY_SCOPE] })).rejects.toThrow(
      /GCP_PROJECT_NUMBER must be set too/,
    );
    expect(adcRequested).not.toHaveBeenCalled();
  });
});
