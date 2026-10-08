/**
 * The only thing about an error that telemetry may carry.
 *
 * `error.message` is never returned: `BackendConnector.uploadData` builds its message with
 * `JSON.stringify(result)`, which can contain a row. The kind is a closed set, so a field
 * holding it cannot hold anything else.
 */
export type ErrorKind =
  | "timeout"
  | "network"
  | "auth"
  | "http_4xx"
  | "http_5xx"
  | "aborted"
  | "unknown"
  | `pg:${string}`;

const FIXED_KINDS = new Set([
  "timeout",
  "network",
  "auth",
  "http_4xx",
  "http_5xx",
  "aborted",
  "unknown",
]);
const PG_KIND = /^pg:[0-9A-Z]{5}$/;
const SQLSTATE = /^[0-9A-Z]{5}$/;
const TIMEOUT_CODES = new Set(["ETIMEDOUT", "ESOCKETTIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"]);
const NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_SOCKET",
]);

export function isErrorKind(value: string): value is ErrorKind {
  return FIXED_KINDS.has(value) || PG_KIND.test(value);
}

function field(error: unknown, key: string): unknown {
  return typeof error === "object" && error !== null
    ? (error as Record<string, unknown>)[key]
    : undefined;
}

export function classifyError(error: unknown): ErrorKind {
  const name = field(error, "name");
  const code = field(error, "code");
  const status = field(error, "status");

  if (name === "AbortError") return "aborted";
  if (name === "TimeoutError" || (typeof code === "string" && TIMEOUT_CODES.has(code))) {
    return "timeout";
  }

  // A SQLSTATE is five characters. PostgREST codes (PGRST301) and Node codes (ENOENT) are
  // not, so they fall through to unknown instead of being passed off as database errors.
  if (typeof code === "string" && SQLSTATE.test(code)) return `pg:${code}`;

  if (typeof status === "number") {
    if (status === 401 || status === 403) return "auth";
    if (status >= 500 && status <= 599) return "http_5xx";
    if (status >= 400 && status <= 499) return "http_4xx";
  }

  // `fetch` rejects with a TypeError when it cannot reach the server at all.
  if (error instanceof TypeError || (typeof code === "string" && NETWORK_CODES.has(code))) {
    return "network";
  }

  return "unknown";
}
