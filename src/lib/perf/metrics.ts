import { classifyError, isErrorKind } from "./classifyError";
import { getEventContext } from "./eventContext";
import type { Attrs, MetricName, Outcome, PerfEvent } from "./telemetryEvent";
import { createBrowserTransport, type Transport } from "./telemetryTransport";

/**
 * The only place that turns a measured span into a telemetry event. Call sites never touch
 * `performance.now()` or build the shared context. Spec: docs/specs/perf-telemetry-pipeline.md §3.
 *
 * Every function here swallows its own failures: a telemetry fault is never shown to the
 * user and never changes what the app does.
 */

export type MetricHandle = {
  end: (extra?: Attrs) => void;
  /** An error, or an already-classified kind. Free text never becomes the kind. */
  fail: (errorOrKind: unknown, extra?: Attrs) => void;
};

type Sink = (event: PerfEvent) => void;

let overrideSink: Sink | null = null;
let transport: Transport | null = null;

/** Test seam: where recorded events go instead of the browser transport. */
export function setMetricsSink(sink: Sink | null): void {
  overrideSink = sink;
}

function browserSink(event: PerfEvent): void {
  if (typeof window === "undefined") return;

  transport ??= createBrowserTransport({
    onDrop: (dropped) => metrics.count("app.telemetry_dropped", { dropped }),
  });
  transport.enqueue(event);
}

/**
 * Sends what the transport holds, now, by the beacon path. For a module that holds events of
 * its own until the page goes away (the SQLite aggregate): it records them, then calls this, so
 * the order in which page listeners were added does not decide whether they get out.
 */
export function flushTelemetryNow(): void {
  try {
    transport?.flushFinal();
  } catch {
    // Nothing to do: the events stay buffered.
  }
}

const BADGE_STYLE =
  "background:#7c3aed;color:#fff;font-weight:700;padding:2px 6px;border-radius:3px";
const HEADLINE_STYLE = "color:#7c3aed;font-weight:700";

type Recorded = {
  name: MetricName;
  durationMs: number | null;
  outcome?: Outcome;
  errorKind?: string | null;
  attrs?: Attrs | null;
};

function emit(recorded: Recorded): void {
  try {
    const context = getEventContext();
    const attrs = recorded.attrs && Object.keys(recorded.attrs).length > 0 ? recorded.attrs : null;

    const event: PerfEvent = {
      name: recorded.name,
      durationMs: recorded.durationMs,
      outcome: recorded.outcome ?? "ok",
      errorKind: recorded.errorKind ?? null,
      at: Date.now(),
      ...context,
      attrs,
    };

    if (context.env === "development") {
      const took = event.durationMs === null ? "" : ` ${Math.round(event.durationMs)}ms`;
      console.debug(`%cPERF%c ${event.name}${took}`, BADGE_STYLE, HEADLINE_STYLE, event);
    }

    (overrideSink ?? browserSink)(event);
  } catch {
    // Telemetry must never break the app.
  }
}

function merge(a?: Attrs | null, b?: Attrs | null): Attrs | null {
  if (!a && !b) return null;
  return { ...a, ...b };
}

const NOOP_HANDLE: MetricHandle = { end: () => {}, fail: () => {} };

export const metrics = {
  start(name: MetricName, attrs?: Attrs): MetricHandle {
    try {
      const startedAt = performance.now();
      let done = false;

      const finish = (outcome: Outcome, errorKind: string | null, extra?: Attrs) => {
        if (done) return;
        done = true;
        try {
          emit({
            name,
            durationMs: performance.now() - startedAt,
            outcome,
            errorKind,
            attrs: merge(attrs, extra),
          });
        } catch {
          // See above.
        }
      };

      return {
        end: (extra) => finish("ok", null, extra),
        fail: (errorOrKind, extra) => {
          const kind =
            typeof errorOrKind === "string" && isErrorKind(errorOrKind)
              ? errorOrKind
              : classifyError(errorOrKind);
          finish("error", kind, extra);
        },
      };
    } catch {
      return NOOP_HANDLE;
    }
  },

  /** For a span measured elsewhere (e.g. from `performance.timeOrigin`). */
  record(input: Recorded): void {
    emit(input);
  },

  /** An event with no duration — a counter tick. */
  count(name: MetricName, attrs?: Attrs): void {
    emit({ name, durationMs: null, attrs });
  },
};
