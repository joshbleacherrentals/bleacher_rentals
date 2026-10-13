/**
 * What each metric means, for the info icon beside its name on the dashboard.
 *
 * One sentence on what is timed and where it starts and stops, then what to read into it. Plain
 * words for a developer opening the page cold. A metric added to the registry in
 * `telemetryEvent.ts` fails the test until it has a line here.
 *
 * No apostrophes, quotes or ampersands: the text also becomes an `aria-label`.
 */
const INFO: Record<string, string> = {
  "app.start":
    "One event for every page load of a signed-in user. It has no duration: its count is the number of page loads, the denominator for every other figure.",
  "app.telemetry_dropped":
    "A browser threw away telemetry it could not send (it keeps at most 500 events) or the server refused a batch. Count only; a high number means figures are missing.",
  "sqlite.open":
    "How long the local database (SQLite) took to open, from creating it until it was ready. Includes starting the database worker and opening IndexedDB.",
  "powersync.credentials":
    "How long getting the PowerSync token took: sign-in provider plus the credentials route of this app. A cached token takes almost no time. It tells a slow sign-in service apart from a slow connection.",
  "powersync.connect":
    "How long opening the sync connection took, from the database being ready (or the connect call, if later) until the connection was up. Includes fetching the token. It is not network latency and not the time to download data.",
  "powersync.disconnect":
    "The sync connection was lost. Count only; the attribute n is the running number of losses in that page load.",
  "powersync.reconnect":
    "How long the sync connection stayed down, from losing it until having it again. A tag shows when another tab opening caused it, or a planned token refresh.",
  "sync.initial":
    "How long the first ever download of this device took, from connecting until the first full sync finished. Happens once per browser profile; the ops attribute is the size of the download.",
  "sync.catchup":
    "For a device that has synced before: how long after connecting until its local data was brought up to date, the first complete sync of the page load. With nothing new it is about as long as connecting.",
  "sync.upload":
    "One attempt to send local changes to the server, from taking the queued transaction until the server accepted it or it failed. Every retry is an event of its own.",
  "sqlite.query":
    "How long the app waited for a read of the local database. It includes queueing for the database worker, not only the query itself, and it leaves out the queries that live views re-run on their own.",
  "sqlite.write":
    "How long the app waited for one write (insert, update or delete) on the local database, including queueing for the database worker.",
  "sqlite.batch":
    "How long the app waited for a group of writes done together as one transaction, including queueing for the database worker.",
  "ui.first_data":
    "How long a user waited, from the start of the page until the app knew who they are and what they may see (the spinner). Includes loading the page, sign-in and the local database. Tagged local or fallback, and cold or warm start.",
};

export const UNKNOWN_METRIC_INFO = "No description for this metric yet.";

export function metricInfo(name: string): string {
  return INFO[name] ?? UNKNOWN_METRIC_INFO;
}
