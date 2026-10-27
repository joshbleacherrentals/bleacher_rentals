import "server-only";

import { GoogleAuth } from "google-auth-library";

// Keyless domain-wide delegation: our own identity (Application Default Credentials locally,
// workload identity federation in production) asks IAM Credentials to sign a JWT AS the
// delegated service account, and Google trades that JWT for a token that acts as one user.
// No service account private key ever exists.

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const IAM_CREDENTIALS_URL = "https://iamcredentials.googleapis.com/v1";
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

// Google caps a JWT assertion at one hour; stop short of it to leave room for clock skew.
const JWT_LIFETIME_SECONDS = 55 * 60;

export type DelegationClaims = {
  iss: string;
  sub: string;
  scope: string;
  aud: string;
  iat: number;
  exp: number;
};

export function buildDelegationClaims(params: {
  serviceAccountEmail: string;
  subject: string;
  scopes: string[];
  nowSeconds: number;
}): DelegationClaims {
  return {
    iss: params.serviceAccountEmail,
    sub: params.subject,
    scope: params.scopes.join(" "),
    aud: TOKEN_URL,
    iat: params.nowSeconds,
    exp: params.nowSeconds + JWT_LIFETIME_SECONDS,
  };
}

export function getDelegatedServiceAccountEmail(): string {
  const value = process.env.GMAIL_DWD_SERVICE_ACCOUNT_EMAIL;
  if (!value) throw new Error("GMAIL_DWD_SERVICE_ACCOUNT_EMAIL is not set");
  return value;
}

async function signJwt(serviceAccountEmail: string, claims: DelegationClaims): Promise<string> {
  const auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });
  const client = await auth.getClient();

  try {
    const res = await client.request<{ signedJwt: string }>({
      url: `${IAM_CREDENTIALS_URL}/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:signJwt`,
      method: "POST",
      data: { payload: JSON.stringify(claims) },
    });
    return res.data.signedJwt;
  } catch (error: any) {
    const detail = error?.response?.data?.error?.message ?? error?.message ?? "unknown error";
    throw new Error(
      `IAM Credentials could not sign the JWT for ${serviceAccountEmail}: ${detail}. ` +
        "The caller needs the Service Account Token Creator role on that service account.",
    );
  }
}

async function exchangeJwtForAccessToken(signedJwt: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const hint =
      body.error === "unauthorized_client"
        ? " Domain-wide delegation is not authorized for this service account's client ID and scope in the Workspace Admin console."
        : "";
    throw new Error(
      `Google refused the delegated token request: ${body.error ?? res.status}${
        body.error_description ? ` (${body.error_description})` : ""
      }.${hint}`,
    );
  }
  return body.access_token;
}

/**
 * An access token that acts as `subject` (a user on the delegating Workspace domain), limited
 * to `scopes`. The scopes must also be authorized for the service account in that domain's
 * Admin console.
 */
export async function getDelegatedAccessToken(params: {
  subject: string;
  scopes: string[];
}): Promise<string> {
  const serviceAccountEmail = getDelegatedServiceAccountEmail();
  const claims = buildDelegationClaims({
    serviceAccountEmail,
    subject: params.subject,
    scopes: params.scopes,
    nowSeconds: Math.floor(Date.now() / 1000),
  });

  const signedJwt = await signJwt(serviceAccountEmail, claims);
  return exchangeJwtForAccessToken(signedJwt);
}
