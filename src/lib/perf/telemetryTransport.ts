import { MAX_BATCH_BYTES, MAX_BATCH_EVENTS, type PerfEvent } from "./telemetryEvent";

/**
 * Buffer, batch and send. Spec: docs/specs/perf-telemetry-pipeline.md §4.
 *
 * Telemetry deliberately does not travel through PowerSync: the sync being measured must
 * not be the thing that carries its own measurements.
 */

/**
 * `ok`: stored. `retry`: keep the events, try again at the next flush. `reject`: the server
 * refused the batch for good (400, 413) — retrying could never succeed and would block every
 * event behind it, so the batch is dropped and counted.
 */
export type SendResult = "ok" | "retry" | "reject";

export type TransportOptions = {
  send: (events: PerfEvent[]) => Promise<SendResult> | SendResult;
  /** Page is going away: fire and forget. Returns whether the browser queued it. */
  sendFinal: (events: PerfEvent[]) => boolean;
  /** Told how many events were dropped (overflow or a rejected batch). */
  onDrop?: (count: number) => void;
  flushIntervalMs?: number;
  flushAtCount?: number;
  maxBuffer?: number;
  maxBatch?: number;
  /** Stays under the route's 64 KB cap with room to spare. */
  maxBatchBytes?: number;
  maxFinalChunks?: number;
};

export type Transport = {
  enqueue: (event: PerfEvent) => void;
  flush: () => Promise<void>;
  flushFinal: () => void;
  size: () => number;
  stop: () => void;
};

export function createTransport(options: TransportOptions): Transport {
  const flushIntervalMs = options.flushIntervalMs ?? 10_000;
  const flushAtCount = options.flushAtCount ?? 50;
  const maxBuffer = options.maxBuffer ?? 500;
  const maxBatch = options.maxBatch ?? MAX_BATCH_EVENTS;
  const maxBatchBytes = options.maxBatchBytes ?? Math.floor(MAX_BATCH_BYTES * 0.75);
  const maxFinalChunks = options.maxFinalChunks ?? 5;

  let buffer: PerfEvent[] = [];
  let pendingDropped = 0;
  let inFlight = false;
  let lastFailed = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  function push(event: PerfEvent): void {
    buffer.push(event);
    if (buffer.length > maxBuffer) {
      buffer.shift();
      pendingDropped++;
    }
  }

  /** The head of the buffer, bounded by event count and by serialised size. */
  function takeBatch(): PerfEvent[] {
    const batch: PerfEvent[] = [];
    let bytes = 0;

    for (const event of buffer) {
      if (batch.length >= maxBatch) break;
      const size = JSON.stringify(event).length + 1;
      if (batch.length > 0 && bytes + size > maxBatchBytes) break;
      batch.push(event);
      bytes += size;
    }
    return batch;
  }

  function remove(batch: PerfEvent[]): void {
    const sent = new Set(batch);
    buffer = buffer.filter((event) => !sent.has(event));
  }

  function reportDrops(): void {
    if (pendingDropped === 0) return;
    const count = pendingDropped;
    pendingDropped = 0;
    options.onDrop?.(count);
  }

  async function flush(): Promise<void> {
    if (inFlight) return;
    // Set first: reporting a drop records an event, which must not start a nested flush.
    inFlight = true;

    try {
      reportDrops();
      if (buffer.length === 0) return;

      const batch = takeBatch();
      let result: SendResult;
      try {
        result = await options.send(batch);
      } catch {
        result = "retry";
      }

      if (result === "retry") {
        lastFailed = true;
        return;
      }

      lastFailed = false;
      remove(batch);
      if (result === "reject") options.onDrop?.(batch.length);
    } finally {
      inFlight = false;
    }

    // A buffer that outgrew one batch drains over successive flushes.
    if (!lastFailed && buffer.length >= flushAtCount) void flush();
  }

  function startTimer(): void {
    if (timer !== null) return;
    timer = setInterval(() => {
      if (buffer.length > 0 || pendingDropped > 0) void flush();
    }, flushIntervalMs);
  }

  return {
    enqueue(event) {
      push(event);
      startTimer();
      // After a failure the next flush is the timer's: a down server is not hit per event.
      if (buffer.length >= flushAtCount && !inFlight && !lastFailed) void flush();
    },

    flush,

    flushFinal() {
      for (let chunk = 0; chunk < maxFinalChunks && buffer.length > 0; chunk++) {
        const batch = takeBatch();
        let queued = false;
        try {
          queued = options.sendFinal(batch);
        } catch {
          queued = false;
        }
        if (!queued) return;
        remove(batch);
      }
    },

    size: () => buffer.length,

    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
  };
}

type Listenable = { addEventListener: (type: string, handler: () => void) => void };

/** Flush when the page is hidden or going away; `visibilitychange` is the reliable one on mobile. */
export function installPageLifecycle(
  flushFinal: () => void,
  doc: Listenable & { visibilityState: string },
  win: Listenable,
): void {
  doc.addEventListener("visibilitychange", () => {
    if (doc.visibilityState === "hidden") flushFinal();
  });
  win.addEventListener("pagehide", () => flushFinal());
}

const ENDPOINT = "/api/telemetry";

async function sendWithFetch(events: PerfEvent[]): Promise<SendResult> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
    credentials: "same-origin",
    cache: "no-store",
  });

  if (response.ok) return "ok";
  if (response.status === 400 || response.status === 413) return "reject";
  return "retry";
}

function sendWithBeacon(events: PerfEvent[]): boolean {
  const body = JSON.stringify({ events });

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    return navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
  }

  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** The real transport for the browser. The caller owns the single instance. */
export function createBrowserTransport(options: { onDrop: (count: number) => void }): Transport {
  const transport = createTransport({
    send: sendWithFetch,
    sendFinal: sendWithBeacon,
    onDrop: options.onDrop,
  });
  installPageLifecycle(transport.flushFinal, document, window);
  return transport;
}
