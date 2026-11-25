import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { BUSINESS_RULES, DATA_DICTIONARY } from "./dataDictionary";

// docs/specs/analytics-mcp.md §11.5. That every table has an entry is checked by tsc (D8).
describe("DATA_DICTIONARY", () => {
  it("gives every table a purpose", () => {
    for (const [table, doc] of Object.entries(DATA_DICTIONARY)) {
      expect(doc.purpose.trim(), table).not.toBe("");
    }
  });

  it("has no empty column note", () => {
    for (const [table, doc] of Object.entries(DATA_DICTIONARY)) {
      for (const [column, note] of Object.entries(doc.columns ?? {})) {
        expect((note as string).trim(), `${table}.${column}`).not.toBe("");
      }
    }
  });
});

describe("BUSINESS_RULES", () => {
  it("each rule has a topic, a rule and a source", () => {
    for (const r of BUSINESS_RULES) {
      expect(r.topic.trim()).not.toBe("");
      expect(r.rule.trim(), r.topic).not.toBe("");
      expect(r.source.trim(), r.topic).not.toBe("");
    }
  });

  it("names source files that exist, so a rule can be checked against its code", () => {
    const root = resolve(__dirname, "../../..");
    for (const r of BUSINESS_RULES) {
      for (const path of r.source.split(",").map((s) => s.trim())) {
        expect(existsSync(resolve(root, path)), `${r.topic}: ${path}`).toBe(true);
      }
    }
  });

  it("has unique topics", () => {
    const topics = BUSINESS_RULES.map((r) => r.topic);
    expect(new Set(topics).size).toBe(topics.length);
  });
});
