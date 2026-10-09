"use client";

import { AppSchema, PowerSyncDB } from "@/lib/powersync/AppSchema";
import { BackendConnector } from "@/lib/powersync/BackendConnector";
import { useAuth, useSession } from "@clerk/nextjs";
import { PowerSyncContext } from "@powersync/react";
import {
  PowerSyncDatabase,
  SyncStreamConnectionMethod,
  WASQLiteOpenFactory,
  WASQLiteVFS,
  createBaseLogger,
  LogLevel,
} from "@powersync/web";
import { wrapPowerSyncWithKysely } from "@powersync/kysely-driver";
import { DummyDriver, Kysely, SqliteDialect } from "kysely";
import React, { Suspense, useEffect, useMemo } from "react";
import { connectWithObserver, recordAppStart, trackSqliteOpen } from "@/lib/powersync/syncObserver";

// The SDK logs a line per sync event at DEBUG: useful while developing, noise for every real
// user. docs/specs/perf-powersync-lifecycle.md D3.
export function chooseLogLevel(nodeEnv: string | undefined) {
  return nodeEnv === "production" ? LogLevel.WARN : LogLevel.DEBUG;
}

const logger = createBaseLogger();
logger.useDefaults();
logger.setLevel(chooseLogLevel(process.env.NODE_ENV));

// One count event per page load, the denominator for every other metric.
if (typeof window !== "undefined") recordAppStart();

let _powerSyncDb: PowerSyncDatabase | undefined;
let _db: Kysely<PowerSyncDB> | undefined;
let _ssrDb: Kysely<PowerSyncDB> | undefined;

// OPFSCoopSyncVFS relies on a SharedWorker to arbitrate one exclusive
// FileSystemSyncAccessHandle per tab. In real-world multi-tab Chrome sessions
// (e.g. Windows session-restore reopening several tabs of the app at once)
// that arbitration deadlocks: a tab fails to open its access handle with
// `NoModificationAllowedError`, sqlite3_open_v2 retries 3x and then rejects,
// and the app is stuck on the loading screen forever. Incognito windows don't
// hit this because their OPFS storage is ephemeral per-session, so there's
// never a competing handle left over from another tab. See
// https://github.com/powersync-ja/powersync-js/issues/785 — the confirmed
// workaround is to skip OPFS and let multi-tab sync run over IndexedDB
// instead, which doesn't take an exclusive per-file lock.
export function chooseVfs() {
  return WASQLiteVFS.IDBBatchAtomicVFS;
}

function createPowerSyncDb() {
  const vfs = chooseVfs();

  const instance = new PowerSyncDatabase({
    schema: AppSchema,
    database: new WASQLiteOpenFactory({
      dbFilename: "bleacherrentalsVFS.db",
      vfs,
      flags: {
        enableMultiTabs: typeof SharedWorker !== "undefined",
        ssrMode: false,
      },
      // Use pre-bundled worker from public/@powersync/ (required for Turbopack)
      worker: "/@powersync/worker/WASQLiteDB.umd.js",
    }),
    flags: {
      enableMultiTabs: typeof SharedWorker !== "undefined",
      disableSSRWarning: true,
    },
    sync: {
      // Use pre-bundled sync worker from public/@powersync/ (required for Turbopack)
      worker: "/@powersync/worker/SharedSyncImplementation.umd.js",
    },
  });

  // From the construction to `waitForReady()`: the time the local database takes to open.
  void trackSqliteOpen(instance);
  return instance;
}

export function getPowerSyncDb(): PowerSyncDatabase {
  if (typeof window === "undefined") {
    throw new Error("PowerSync DB is only available in the browser");
  }

  _powerSyncDb ??= createPowerSyncDb();
  return _powerSyncDb;
}

function getSsrCompileDb(): Kysely<PowerSyncDB> {
  _ssrDb ??= new Kysely<PowerSyncDB>({
    dialect: new SqliteDialect({
      // Compile-only on the server: query building never touches the driver.
      database: () => new DummyDriver() as never,
    }),
  });
  return _ssrDb;
}

export function getDb(): Kysely<PowerSyncDB> {
  if (typeof window === "undefined") {
    return getSsrCompileDb();
  }

  _db ??= wrapPowerSyncWithKysely<PowerSyncDB>(getPowerSyncDb());
  return _db;
}

function createBoundLazyProxy<T extends object>(getInstance: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const instance = getInstance();
      const value = (instance as any)[prop as any];
      return typeof value === "function" ? value.bind(instance) : value;
    },
  });
}

// Backwards-compatible exports so existing imports keep working.
export const powerSyncDb: PowerSyncDatabase = createBoundLazyProxy(getPowerSyncDb);
export const db: Kysely<PowerSyncDB> = createBoundLazyProxy(getDb);

export const SystemProvider = ({ children }: { children: React.ReactNode }) => {
  const { isSignedIn } = useAuth();
  const { session } = useSession();

  const connector = useMemo(
    () => (session?.getToken ? new BackendConnector(session) : undefined),
    [session?.id],
  );

  const instance = useMemo(() => {
    if (!isSignedIn || !connector) return undefined;
    return getPowerSyncDb();
  }, [connector, isSignedIn]);

  useEffect(() => {
    if (!instance || !connector) return;

    // Observes the connection, then connects; the cleanup stops observing before it disconnects.
    return connectWithObserver(instance, connector, {
      params: { app: "web" },
      connectionMethod: SyncStreamConnectionMethod.WEB_SOCKET,
    });
  }, [connector, instance]);

  if (!isSignedIn || !connector || !instance) return null;

  return (
    <Suspense>
      <PowerSyncContext.Provider value={instance}>{children}</PowerSyncContext.Provider>
    </Suspense>
  );
};

export default SystemProvider;
