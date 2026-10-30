import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const request = vi.fn();
vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    getClient = async () => ({ request });
  },
}));

import {
  buildDelegationClaims,
  getDelegatedAccessToken,
  GMAIL_READONLY_SCOPE,
} from "./delegatedAuth";

const SERVICE_ACCOUNT = "sync@project.iam.gserviceaccount.com";

beforeEach(() => {
  vi.stubEnv("GMAIL_DWD_SERVICE_ACCOUNT_EMAIL", SERVICE_ACCOUNT);
  request.mockReset().mockResolvedValue({ data: { signedJwt: "signed.jwt.value" } });
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
