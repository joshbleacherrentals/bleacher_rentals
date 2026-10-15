import { describe, it, expect } from "vitest";
import { LogLevel, WASQLiteVFS } from "@powersync/web";
import { PAGE_CACHE_SIZE_KB, chooseLogLevel, chooseVfs } from "./SystemProvider";

describe("PAGE_CACHE_SIZE_KB", () => {
  // The SQLite page cache of the one database connection, in KB. PowerSync's own value is 50 MB;
  // the local database is 183-242 MB, so most pages were read back from IndexedDB.
  // docs/specs/slow-local-db-plan.md, step 4.
  it("is 300 MB", () => {
    expect(PAGE_CACHE_SIZE_KB).toBe(300 * 1024);
  });
});

describe("chooseVfs", () => {
  // OPFSCoopSyncVFS is disabled in favor of IDBBatchAtomicVFS: its
  // SharedWorker-based access-handle arbitration deadlocks in real-world
  // multi-tab Chrome sessions (NoModificationAllowedError -> sqlite3_open_v2
  // failing forever), which is what stranded a user on the loading screen.
  // See https://github.com/powersync-ja/powersync-js/issues/785
  it("always selects IDBBatchAtomicVFS, never OPFSCoopSyncVFS", () => {
    expect(chooseVfs()).toBe(WASQLiteVFS.IDBBatchAtomicVFS);
  });
});

describe("chooseLogLevel", () => {
  // The SDK's DEBUG output is a line per sync event: fine while developing, noise and cost for
  // every real user. docs/specs/perf-powersync-lifecycle.md D3.
  it("is DEBUG in development", () => {
    expect(chooseLogLevel("development")).toBe(LogLevel.DEBUG);
  });

  it("is DEBUG under test, so a local run keeps its detail", () => {
    expect(chooseLogLevel("test")).toBe(LogLevel.DEBUG);
  });

  it("is WARN, never DEBUG, in production", () => {
    expect(chooseLogLevel("production")).toBe(LogLevel.WARN);
    expect(chooseLogLevel("production")).not.toBe(LogLevel.DEBUG);
  });
});
