import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptToken, encryptToken } from "./tokenCrypto";

beforeEach(() => {
  vi.stubEnv("GMAIL_TOKEN_ENCRYPTION_KEY", crypto.randomBytes(32).toString("base64"));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("tokenCrypto", () => {
  it("round-trips a token", () => {
    expect(decryptToken(encryptToken("1//refresh-token"))).toBe("1//refresh-token");
  });

  it("never stores the plain token and uses a fresh IV each time", () => {
    const a = encryptToken("1//refresh-token");
    const b = encryptToken("1//refresh-token");

    expect(a).not.toContain("1//refresh-token");
    expect(a).not.toBe(b);
  });

  it("refuses a tampered value", () => {
    const [iv, tag, data] = encryptToken("1//refresh-token").split(":");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;

    expect(() => decryptToken([iv, tag, flipped.toString("base64")].join(":"))).toThrow();
  });

  it("refuses a value that was encrypted under another key", () => {
    const encrypted = encryptToken("1//refresh-token");
    vi.stubEnv("GMAIL_TOKEN_ENCRYPTION_KEY", crypto.randomBytes(32).toString("base64"));

    expect(() => decryptToken(encrypted)).toThrow();
  });

  it("rejects a malformed stored value", () => {
    expect(() => decryptToken("not-encrypted")).toThrow("Malformed encrypted token");
  });

  it("throws when the key is missing or the wrong size", () => {
    vi.stubEnv("GMAIL_TOKEN_ENCRYPTION_KEY", "");
    expect(() => encryptToken("x")).toThrow("GMAIL_TOKEN_ENCRYPTION_KEY is not set");

    vi.stubEnv("GMAIL_TOKEN_ENCRYPTION_KEY", Buffer.from("too short").toString("base64"));
    expect(() => encryptToken("x")).toThrow("must be 32 bytes");
  });
});
