import "server-only";

import { getVercelOidcToken } from "@vercel/oidc";
import {
  ExternalAccountClient,
  GoogleAuth,
  type AuthClient,
  type ExternalAccountClientOptions,
} from "google-auth-library";

// Keyless domain-wide delegation: our own identity (Application Default Credentials locally,
// workload identity federation in production) asks IAM Credentials to sign a JWT AS the
// delegated service account, and Google trades that JWT for a token that acts as one user.
// No service account private key ever exists.
//
// On Vercel there are no Application Default Credentials, so our identity is Vercel's own OIDC
// token: Google is set up to trust it (a workload identity pool) and to let it act as a caller
// service account, which holds Token Creator on the delegated one. See federationConfigFromEnv.

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

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

export type FederationConfig = {
  projectNumber: string;
  poolId: string;
  providerId: string;
  /** The service account Vercel's identity acts as: not the delegated one, only allowed to sign for it. */
  callerServiceAccountEmail: string;
};

const FEDERATION_ENV = {
  projectNumber: "GCP_PROJECT_NUMBER",
  poolId: "GCP_WORKLOAD_IDENTITY_POOL_ID",
  providerId: "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID",
  callerServiceAccountEmail: "GCP_SERVICE_ACCOUNT_EMAIL",
} as const;

/**
 * The workload identity federation settings, or null when none are set (local development, which
 * signs in with Application Default Credentials instead). Setting only some of them is a mistake
 * that would otherwise surface as a baffling "could not load the default credentials".
 */
export function federationConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): FederationConfig | null {
  const entries = Object.entries(FEDERATION_ENV).map(
    ([key, name]) => [key, name, env[name]?.trim()] as const,
  );
  const missing = entries.filter(([, , value]) => !value).map(([, name]) => name);

  if (missing.length === entries.length) return null;
  if (missing.length > 0) {
    throw new Error(
      `Workload identity federation is only partly set up: ${missing.join(", ")} must be set too.`,
    );
  }
  return Object.fromEntries(entries.map(([key, , value]) => [key, value])) as FederationConfig;
}

export function federationClientOptions(config: FederationConfig): ExternalAccountClientOptions {
  return {
    type: "external_account",
    audience: `//iam.googleapis.com/projects/${config.projectNumber}/locations/global/workloadIdentityPools/${config.poolId}/providers/${config.providerId}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `${IAM_CREDENTIALS_URL}/projects/-/serviceAccounts/${encodeURIComponent(
      config.callerServiceAccountEmail,
    )}:generateAccessToken`,
    // Called with no argument on purpose: Google hands over its own audience, and passing that on
    // would ask Vercel for a token for it instead of the default one the provider accepts.
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
  };
}

// Kept between calls: the client holds the access token it traded for until it is close to expiring,
// so a run over many mailboxes trades once instead of once per mailbox.
let federatedClient: { key: string; client: AuthClient } | undefined;

async function getSigningClient(): Promise<AuthClient> {
  const federation = federationConfigFromEnv();
  if (!federation) {
    return new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] }).getClient();
  }

  const options = federationClientOptions(federation);
  const key = JSON.stringify([options.audience, options.service_account_impersonation_url]);
  if (federatedClient?.key !== key) {
    const client = ExternalAccountClient.fromJSON(options);
    if (!client) {
      throw new Error("Google could not use the workload identity federation settings.");
    }
    federatedClient = { key, client };
  }
  return federatedClient.client;
}

async function signJwt(serviceAccountEmail: string, claims: DelegationClaims): Promise<string> {
  const client = await getSigningClient();

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
