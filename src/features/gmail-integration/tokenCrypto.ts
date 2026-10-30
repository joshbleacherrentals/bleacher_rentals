import crypto from "crypto";

// AES-256-GCM: the auth tag makes a tampered or truncated value fail to decrypt.
// Generate a key with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const raw = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY is not set");

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  }
  return key;
}

/** Returns `iv:tag:ciphertext`, each part base64. */
export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64")).join(":");
}

export function decryptToken(data: string): string {
  const parts = data.split(":");
  if (parts.length !== 3) throw new Error("Malformed encrypted token");

  const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, "base64"));
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
