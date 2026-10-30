import { OAuth2Client } from "google-auth-library";

/** Cookie holding the CSRF `state` between /connect and /callback. */
export const GOOGLE_STATE_COOKIE = "google_oauth_state";

// `openid email` lets the callback learn which mailbox was connected.
export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.send"];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function getAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

/**
 * Absolute redirect URI. `GOOGLE_REDIRECT_URI` is a path (e.g. `/api/google/callback`),
 * resolved against the app URL so the same value works in every environment.
 * Google requires it to exactly match one registered on the OAuth client.
 */
export function getGoogleRedirectUri(): string {
  return `${getAppBaseUrl()}${requireEnv("GOOGLE_REDIRECT_URI")}`;
}

/** Fresh client per request: each carries its own credentials once tokens are set. */
export function createGoogleOAuthClient(): OAuth2Client {
  return new OAuth2Client({
    clientId: requireEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: getGoogleRedirectUri(),
  });
}

/** Email addresses are compared ignoring case and surrounding whitespace. */
export function isSameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function buildGoogleAuthUrl(client: OAuth2Client, state: string): string {
  return client.generateAuthUrl({
    scope: GOOGLE_SCOPES,
    state,
    // offline + consent so Google returns a refresh token every time, not just the first.
    access_type: "offline",
    prompt: "consent",
  });
}
