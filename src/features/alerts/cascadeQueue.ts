"use client";

/**
 * Collapses overlapping alert cascades for the same entity.
 *
 * Dragging one work tracker eight times in five seconds used to start eight
 * cascades that neither queued nor cancelled: six ran concurrently against the
 * single wa-sqlite worker, and the contention alone made identical work up to
 * 90× slower. They also duplicated each other — three parallel cascades were
 * observed evaluating the same entities within 8ms.
 *
 * The collapse is latest-wins rather than cancel-in-flight: a cascade is a chain
 * of awaited writes with no cancellation token, so aborting one mid-run could
 * leave one BleacherEvent's alerts updated and the next one's not. Instead the
 * run in flight is allowed to finish, and a single trailing run re-reads the
 * data — which by then reflects where the tracker actually ended up.
 *
 * In-memory only. This is request collapsing, not durable state: a reload
 * legitimately starts from an empty map, and the nightly alert cron re-derives
 * every alert from scratch anyway.
 */

import { countCascadeRequest, countCascadeRun } from "@/lib/perf/perfTrace";

type CascadeEntry = {
  /** Settles when this key has no further work — the trailing run included. */
  chain: Promise<void>;
  /** A request arrived while a run was in flight; run once more afterwards. */
  pending: boolean;
};

const inFlight = new Map<string, CascadeEntry>();

export function runCascade(key: string, run: () => Promise<void>): Promise<void> {
  // Requests and runs are counted separately: the gap between them is exactly
  // what this collapsing buys, and `perfLog.report()` reports it.
  countCascadeRequest();

  const existing = inFlight.get(key);
  if (existing) {
    existing.pending = true;
    return existing.chain;
  }

  const entry: CascadeEntry = { chain: Promise.resolve(), pending: false };
  inFlight.set(key, entry);

  entry.chain = (async () => {
    try {
      countCascadeRun();
      await run();
      // A burst that lands entirely during the first run costs exactly one
      // trailing run, however long the burst was. Requests arriving during the
      // trailing run earn another one — their data is genuinely not reflected yet.
      while (entry.pending) {
        entry.pending = false;
        countCascadeRun();
        await run();
      }
    } finally {
      // Cleared on failure too, so one blown-up cascade cannot wedge the key and
      // silence every later save for that tracker.
      inFlight.delete(key);
    }
  })();

  return entry.chain;
}

/** Test seam: forget every in-flight key. Not used by application code. */
export function resetCascadeQueue(): void {
  inFlight.clear();
}
