import { describe, expect, it } from "vitest";
import { classifyError, isErrorKind } from "./classifyError";

const named = (name: string, message = "x") => Object.assign(new Error(message), { name });

describe("classifyError", () => {
  it("maps an abort", () => {
    expect(classifyError(named("AbortError"))).toBe("aborted");
  });

  it("maps timeouts by name and by code", () => {
    expect(classifyError(named("TimeoutError"))).toBe("timeout");
    expect(classifyError(Object.assign(new Error("x"), { code: "ETIMEDOUT" }))).toBe("timeout");
  });

  it("maps a fetch failure to network", () => {
    expect(classifyError(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifyError(Object.assign(new Error("x"), { code: "ECONNRESET" }))).toBe("network");
  });

  it("maps 401 and 403 to auth", () => {
    expect(classifyError({ status: 401 })).toBe("auth");
    expect(classifyError({ status: 403 })).toBe("auth");
  });

  it("maps other 4xx and 5xx", () => {
    expect(classifyError({ status: 404 })).toBe("http_4xx");
    expect(classifyError({ status: 429 })).toBe("http_4xx");
    expect(classifyError({ status: 500 })).toBe("http_5xx");
    expect(classifyError({ status: 503 })).toBe("http_5xx");
  });

  it("maps a Postgres SQLSTATE to pg:<code>", () => {
    expect(classifyError({ code: "23505", message: "dup" })).toBe("pg:23505");
    expect(classifyError({ code: "42501", message: "rls" })).toBe("pg:42501");
    expect(classifyError({ code: "23514" })).toBe("pg:23514");
  });

  it("does not treat a PostgREST or Node code as a SQLSTATE", () => {
    expect(classifyError({ code: "PGRST301" })).toBe("unknown");
    expect(classifyError({ code: "ENOENT" })).toBe("unknown");
  });

  it("returns unknown for anything else", () => {
    expect(classifyError(new Error("boom"))).toBe("unknown");
    expect(classifyError("a string")).toBe("unknown");
    expect(classifyError(null)).toBe("unknown");
    expect(classifyError(undefined)).toBe("unknown");
    expect(classifyError(42)).toBe("unknown");
  });

  it("never returns the message, even when it holds a row", () => {
    const row = '{"email":"person@example.com","amount":1200}';
    const kinds = [
      classifyError({ code: "23505", message: row }),
      classifyError({ status: 500, message: row }),
      classifyError(new Error(row)),
      classifyError(new TypeError(row)),
    ];
    for (const kind of kinds) {
      expect(kind).not.toContain("person@example.com");
      expect(isErrorKind(kind)).toBe(true);
    }
  });
});

describe("isErrorKind", () => {
  it("accepts the closed set and pg codes", () => {
    for (const kind of [
      "timeout",
      "network",
      "auth",
      "http_4xx",
      "http_5xx",
      "aborted",
      "unknown",
      "pg:23505",
      "pg:42501",
    ]) {
      expect(isErrorKind(kind)).toBe(true);
    }
  });

  it("refuses free text and malformed codes", () => {
    expect(isErrorKind("Could not insert row")).toBe(false);
    expect(isErrorKind("pg:")).toBe(false);
    expect(isErrorKind("pg:2350")).toBe(false);
    expect(isErrorKind("pg:23505x")).toBe(false);
    expect(isErrorKind("")).toBe(false);
  });
});
