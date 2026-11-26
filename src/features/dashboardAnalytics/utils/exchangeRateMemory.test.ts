import { describe, expect, it, vi } from "vitest";
import { RATE_MEMORY_KEY, readRateMemory, writeRateMemory } from "./exchangeRateMemory";

// docs/specs/dashboard-analytics-03-converter.md §2.5 and §5. The storage is a stand-in kept in
// memory: no test touches a real localStorage.

function memoryStorage(initial?: string) {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set(RATE_MEMORY_KEY, initial);
  return {
    getItem: vi.fn((key: string) => map.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      map.set(key, value);
    }),
  };
}

const goodMemory = {
  askedFrom: "2026-11-01",
  rates: { "2026-11-20": 0.69898, "2026-11-23": 0.69626 },
};

const stored = (value: unknown) => JSON.stringify(value);

describe("RATE_MEMORY_KEY", () => {
  it("is the key of the spec", () => {
    expect(RATE_MEMORY_KEY).toBe("dashboard-analytics:cad-usd-rates:v1");
  });
});

describe("writeRateMemory and readRateMemory", () => {
  it("round-trips a memory", () => {
    const storage = memoryStorage();
    writeRateMemory(storage, goodMemory);
    expect(readRateMemory(storage)).toEqual(goodMemory);
  });

  it("stores one JSON object under the key, with the version, askedFrom and the days", () => {
    const storage = memoryStorage();
    writeRateMemory(storage, goodMemory);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    const [key, value] = storage.setItem.mock.calls[0];
    expect(key).toBe(RATE_MEMORY_KEY);
    expect(JSON.parse(value)).toEqual({
      version: 1,
      askedFrom: "2026-11-01",
      rates: goodMemory.rates,
    });
  });

  it("round-trips a memory with no days", () => {
    const storage = memoryStorage();
    writeRateMemory(storage, { askedFrom: "2026-11-01", rates: {} });
    expect(readRateMemory(storage)).toEqual({ askedFrom: "2026-11-01", rates: {} });
  });

  it("replaces a damaged memory on the next write", () => {
    const storage = memoryStorage("not json");
    expect(readRateMemory(storage)).toBeNull();
    writeRateMemory(storage, goodMemory);
    expect(readRateMemory(storage)).toEqual(goodMemory);
  });
});

describe("readRateMemory gives null for", () => {
  const cases: [string, string | undefined][] = [
    ["a missing key", undefined],
    ["an empty text", ""],
    ["text that is not JSON", "{oops"],
    ["JSON null", "null"],
    ["a JSON number", "5"],
    ["a JSON array", "[]"],
    ["a wrong version", stored({ version: 2, askedFrom: "2026-11-01", rates: {} })],
    ["a missing version", stored({ askedFrom: "2026-11-01", rates: {} })],
    ["a missing askedFrom", stored({ version: 1, rates: {} })],
    ["an askedFrom that is not a day", stored({ version: 1, askedFrom: "yesterday", rates: {} })],
    [
      "an askedFrom that is not a real day",
      stored({ version: 1, askedFrom: "2026-02-30", rates: {} }),
    ],
    ["missing rates", stored({ version: 1, askedFrom: "2026-11-01" })],
    ["rates that are null", stored({ version: 1, askedFrom: "2026-11-01", rates: null })],
    ["rates that are an array", stored({ version: 1, askedFrom: "2026-11-01", rates: [0.7] })],
    [
      "a key that is not a day",
      stored({ version: 1, askedFrom: "2026-11-01", rates: { monday: 0.7 } }),
    ],
    [
      "a rate that is a string",
      stored({ version: 1, askedFrom: "2026-11-01", rates: { "2026-11-20": "0.7" } }),
    ],
    ["a rate of zero", stored({ version: 1, askedFrom: "2026-11-01", rates: { "2026-11-20": 0 } })],
    [
      "a negative rate",
      stored({ version: 1, askedFrom: "2026-11-01", rates: { "2026-11-20": -0.7 } }),
    ],
    [
      "a rate that is null",
      stored({ version: 1, askedFrom: "2026-11-01", rates: { "2026-11-20": null } }),
    ],
    [
      "one bad entry among good ones",
      stored({
        version: 1,
        askedFrom: "2026-11-01",
        rates: { "2026-11-20": 0.7, "2026-11-23": "bad" },
      }),
    ],
  ];

  it.each(cases)("%s", (_name, text) => {
    expect(readRateMemory(memoryStorage(text))).toBeNull();
  });

  it("a storage whose getItem throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readRateMemory(storage)).toBeNull();
  });

  it("does not delete a memory that fails (it is only ignored)", () => {
    const storage = { ...memoryStorage("not json"), removeItem: vi.fn() };
    readRateMemory(storage);
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe("writeRateMemory", () => {
  it("swallows a storage that throws (full or blocked)", () => {
    const storage = {
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() => writeRateMemory(storage, goodMemory)).not.toThrow();
  });
});
