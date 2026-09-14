import crypto from "crypto";
import { getQboTokens, setQboTokens } from "./db";
import OAuthClient from "intuit-oauth-ts";
import { describeQboAuthError } from "./describeQboAuthError";

const ENCRYPTION_KEY = process.env.QBO_TOKEN_ENCRYPTION_KEY!; // Generate random 32-byte key and set as env variable, e.g. in terminal run node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
const IV_LENGTH = 16; // AES block size

function encrypt(text: string): string {
  console.log("ENCRYPTION_KEY", ENCRYPTION_KEY);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY, "base64"), iv);
  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");
  return iv.toString("base64") + ":" + encrypted;
}

function decrypt(data: string): string {
  const [ivBase64, encrypted] = data.split(":");
  const iv = Buffer.from(ivBase64, "base64");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY, "base64"),
    iv,
  );
  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export async function saveTokens(connectionId: string, token: any) {
  const json = JSON.stringify(token);
  const encrypted = encrypt(json);
  await setQboTokens(connectionId, encrypted);
}

export async function loadTokens(connectionId: string) {
  const encrypted = await getQboTokens(connectionId);
  console.log("encrypted: ", encrypted);
  if (!encrypted || encrypted === "__pending__") return null;
  const json = decrypt(encrypted);
  console.log("json: ", json);
  return JSON.parse(json);
}

/**
 * Creates a fresh OAuthClient instance (not a singleton—each connection may have different tokens).
 */
export function createOAuthClient(): OAuthClient {
  return new OAuthClient({
    clientId: process.env.QBO_CLIENT_ID!,
    clientSecret: process.env.QBO_CLIENT_SECRET!,
    environment: process.env.QBO_ENVIRONMENT as "sandbox" | "production",
    redirectUri: process.env.QBO_REDIRECT_URI!,
  });
}

export async function getQboAccessTokenAndRealmId(connectionId: string): Promise<{
  accessToken: string;
  realmId: string;
}> {
  const QBO = "[QBO Auth]";
  console.log(`${QBO} getQboAccessTokenAndRealmId called for connection: ${connectionId}`);

  const client = createOAuthClient();

  const prevTokens = await loadTokens(connectionId);
  if (!prevTokens) {
    console.error(`${QBO} No tokens found for connection: ${connectionId}`);
    throw new Error("No tokens found for this QBO connection");
  }

  console.log(
    `${QBO} Loaded tokens — createdAt: ${prevTokens.createdAt ?? "MISSING"}, expires_in: ${prevTokens.expires_in}s, x_refresh_token_expires_in: ${prevTokens.x_refresh_token_expires_in}s`,
  );
  if (prevTokens.createdAt) {
    const accessExpiresAt = prevTokens.createdAt + prevTokens.expires_in * 1000;
    const refreshExpiresAt = prevTokens.createdAt + prevTokens.x_refresh_token_expires_in * 1000;
    console.log(
      `${QBO} Access token expires: ${new Date(accessExpiresAt).toISOString()} (${accessExpiresAt > Date.now() ? "valid" : "EXPIRED"})`,
    );
    console.log(
      `${QBO} Refresh token expires: ${new Date(refreshExpiresAt).toISOString()} (${refreshExpiresAt > Date.now() ? "valid" : "EXPIRED"})`,
    );
  } else {
    console.warn(
      `${QBO} createdAt is missing — library will default to Date.now(), token may appear falsely valid`,
    );
  }

  client.setToken(prevTokens);

  const accessValid = client.isAccessTokenValid();
  const refreshValid = client.getToken().isRefreshTokenValid();
  console.log(`${QBO} isAccessTokenValid: ${accessValid}, isRefreshTokenValid: ${refreshValid}`);

  // Refresh if needed
  if (!accessValid) {
    if (!refreshValid) {
      console.error(`${QBO} Refresh token expired — re-authentication required`);
      throw new Error(
        "QuickBooks refresh token has expired. Please re-authenticate the connection.",
      );
    }
    try {
      console.log(`${QBO} Access token expired — refreshing...`);
      const refreshResponse = await client.refresh();
      const refreshedJson = refreshResponse.getJson();
      console.log(
        `${QBO} Refresh successful — new expires_in: ${refreshedJson.expires_in}s, new x_refresh_token_expires_in: ${refreshedJson.x_refresh_token_expires_in}s`,
      );
      const tokens = {
        ...refreshedJson,
        realmId: prevTokens?.realmId, // preserve existing
        createdAt: Date.now(),
      };
      await saveTokens(connectionId, tokens);
      client.setToken(tokens as any);
      console.log(`${QBO} Refreshed tokens saved and set on client`);
    } catch (e: any) {
      console.error(`${QBO} Failed to refresh tokens:`, e.originalMessage || e.message);
      // e is intuit-oauth-ts's own error shape — its top-level .message is a
      // generic "Response has an Error", not useful to a user. Re-throw with
      // the real reason + what to do about it instead.
      throw new Error(describeQboAuthError(e));
    }
  } else {
    console.log(`${QBO} Access token still valid — no refresh needed`);
  }

  const token = client.getToken();
  const accessToken = token.access_token;
  const realmId = token.realmId;
  if (!accessToken || !realmId) {
    console.error(`${QBO} Missing accessToken (${!!accessToken}) or realmId (${!!realmId})`);
    throw new Error("Missing accessToken or realmId");
  }
  console.log(`${QBO} Returning valid credentials for realm: ${realmId}`);
  return { accessToken, realmId };
}

export function getBaseUrl() {
  if (process.env.QBO_ENVIRONMENT === "sandbox") {
    return "https://sandbox-quickbooks.api.intuit.com/v3/company";
  } else {
    return "https://quickbooks.api.intuit.com/v3/company";
  }
}
