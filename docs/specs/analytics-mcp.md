# Analytics MCP — staff ask Claude questions about our data, read-only

Status: **IMPLEMENTED 2026-11-17, awaiting review**; section 11 (data dictionary) **APPROVED 2026-11-25** ("Approved"). Sections 0–10 were approved by the user's "BUILD IT NOW GO AHEAD" the
same day (taken as the "Approved" the SDD rule asks for). 0 open decisions. Not tried against real Clerk
OAuth, Claude, or the production database: the migration is applied to the local database only, and the
query layer was checked against the local Postgres as `analytics_ro` (21 attempts to write, escape or
read a credential, all refused).
Original request: "how do i give claude readonly access to my production db so I can ask analytical
questions" → "give this to a couple employees (non technical) so they can learn about our data with their
claude desktop app" → "small remote mcp" → "no separate analytics views, read only on all prod tables" →
"everyone with an account that is not deactivated should have access".

## 0. What it is, and what it is not

A **remote MCP server** inside this Next.js app, at `/api/mcp`. A staff member adds its URL once in
Claude (Settings → Connectors → Add custom connector), signs in with their normal Clerk login, and can
then ask Claude questions about our data. Claude answers by running **read-only SQL** through the server.

- **Who:** anyone with a row in `Users` whose status is not `inactive` (D2). The role (admin, account
  manager, driver, …) does not matter.
- **What they can read:** every table in `public`, except `QboConnections` (D4). There are no views to
  maintain (D1).
- **What they cannot do:** write, anywhere. See section 3 for the layers that guarantee it.
- **Not part of this spec:** a screen in the app, per-role data limits (everyone who may use it sees the
  same data), writing tools, charts, other schemas (`auth`, `storage`).

## 1. Decisions

- **D1 — no `analytics` views.** One database role, `analytics_ro`, with `SELECT` on all of `public`, and
  default privileges so tables created later are readable too. Nothing to maintain per table.
- **D2 — who may use it:** a `Users` row exists for the signed-in Clerk user, and `status_uuid` is not
  `STATUSES.inactive`. Invited, active and null-status users are allowed. A **driver-only** account is
  allowed too, although it cannot open the web dashboard. Asked 2026-11-17: "everyone with an account that
  is not deactivated". One constant, `isUserAllowed`, is the only place that rule lives.
- **D3 — sign-in:** Clerk is the OAuth provider (Clerk's "Dynamic client registration"). The server reads
  the access token with `auth({ acceptsToken: "oauth_token" })`. `@clerk/mcp-tools` is **not** used: its
  latest release needs `@clerk/nextjs` 7, this app is on 6.
- **D4 — `QboConnections` is revoked** from the role: its `encrypted_token_value` is a credential. It is the
  only credential table (checked by column name over `public` on 2026-11-17). `Users.expo_push_token` stays
  readable.
- **D5 — the log:** every call to a tool writes one row to `McpQueryLog` (who, which tool, the SQL, rows,
  time, error), and so does a refused sign-in (`tool = 'access'`). Written with the service-role client;
  the database role cannot write it, and **cannot read it either** (`REVOKE`), so a colleague's questions
  stay private from other staff using the connector.

## 2. Database

Migration `supabase/migrations/20261117120000_analytics_mcp.sql`:

```sql
-- role: no password, no login. The password is set by hand in production (section 7).
CREATE ROLE analytics_ro NOLOGIN BYPASSRLS;          -- only if it does not exist
ALTER ROLE analytics_ro SET default_transaction_read_only = on;
ALTER ROLE analytics_ro SET statement_timeout = '15s';
ALTER ROLE analytics_ro SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE analytics_ro CONNECTION LIMIT 5;
GRANT USAGE ON SCHEMA public TO analytics_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO analytics_ro;
REVOKE ALL ON "QboConnections" FROM analytics_ro;   -- D4
REVOKE ALL ON "McpQueryLog" FROM analytics_ro;      -- D5
```

The default privileges cover tables created later by the `postgres` role (every migration). A new table
that holds a credential must be revoked by hand, the way `QboConnections` is.

`BYPASSRLS` is needed because the app's RLS policies are written for the `authenticated` role; without it
the role sees empty tables.

New table, online only (it is **not** synced: no `AppSchema.ts`, no sync rule):

```sql
CREATE TABLE "McpQueryLog" (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  user_id      uuid REFERENCES "Users"(id) ON DELETE SET NULL,
  clerk_user_id text NOT NULL,
  tool         text NOT NULL,            -- 'query' | 'describe_schema' | 'access' (a refused sign-in); CHECK
  sql          text,                     -- the query text; null for describe_schema
  row_count    integer,
  truncated    boolean NOT NULL DEFAULT false,
  duration_ms  integer,
  error        text
);
ALTER TABLE "McpQueryLog" ENABLE ROW LEVEL SECURITY;  -- no policy: only the service role writes or reads
```

## 3. Why it cannot write (four layers)

1. **No privileges.** The role has `SELECT` only. It cannot `INSERT`/`UPDATE`/`DELETE`/`CREATE`/`TRUNCATE`.
2. **Read-only transaction.** Every call runs inside `BEGIN READ ONLY`. This is what stops a
   `SECURITY DEFINER` function that writes (the database has 59 in `public`, and `EXECUTE` is granted to
   everyone by default): inside a read-only transaction it errors, and a query cannot switch the mode back.
3. **One statement only.** The user's SQL is sent with node-pg `queryMode: "extended"`, which Postgres
   refuses to run with more than one statement. So `COMMIT; BEGIN READ WRITE; …` cannot be smuggled in.
4. **`DECLARE … CURSOR`.** The SQL is wrapped as `DECLARE c NO SCROLL CURSOR FOR <sql>`. Postgres only
   accepts `SELECT`/`VALUES`/`WITH … SELECT` there (not data-modifying `WITH`), and it lets us fetch
   `MAX_ROWS + 1` rows to cap the result without rewriting the query.

Plus: `SET LOCAL statement_timeout`, a 20 000-character limit on the SQL, a 200 000-character limit on
the serialized result, a pool of at most 3 connections, and a `prepareSql` check that gives a friendly
error ("Only SELECT queries are allowed") before the database is asked.

## 4. Types

```ts
// src/features/analyticsMcp/types.ts
export type PrepareSqlResult = { ok: true; sql: string } | { ok: false; error: string };

/** What the database returned, before the size cap on the serialized result. */
export type RawQueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean; // the row cap (MAX_ROWS) cut it
};

export type QueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number; // rows returned, after the caps
  truncated: boolean; // true if either cap cut the result
};

export type AccessDecision =
  | { allowed: true; userId: string }
  | { allowed: false; reason: "no-account" | "account-deactivated" };

export type McpQueryLogEntry = {
  user_id: string | null;
  clerk_user_id: string;
  tool: "query" | "describe_schema" | "access";
  sql: string | null;
  row_count: number | null;
  truncated: boolean;
  duration_ms: number | null;
  error: string | null;
};
```

Constants (`constants.ts`): `MAX_ROWS = 500`, `MAX_SQL_CHARS = 20_000`, `MAX_RESULT_CHARS = 200_000`,
`STATEMENT_TIMEOUT = "15s"`.

## 5. Tools

- **`describe_schema`** (no input). Returns every table in `public` the role can read, its columns with
  types, and the foreign keys, as compact text (`Events(id uuid, created_at timestamptz, …)` then
  `Events.owner_user_uuid -> Users.id`). Claude calls it first so it joins correctly.
- **`query`** (`{ sql: string }`). Runs one read-only statement and returns JSON text:
  `{ columns, rows, rowCount, truncated }`. On failure it returns the Postgres message with
  `isError: true` so Claude can fix its SQL and retry; it never returns a stack trace.

Both are annotated `readOnlyHint: true`. The server is **stateless** (a new MCP server and transport per
request, JSON responses), so it works on serverless without sticky sessions.

## 6. Endpoints and auth flow

| Path                                            | Public in `proxy.ts` | What it does                                              |
| ----------------------------------------------- | -------------------- | --------------------------------------------------------- |
| `/api/mcp`                                      | yes (checks itself)  | the MCP endpoint (`POST`; `GET`/`DELETE` answer 405)      |
| `/.well-known/oauth-protected-resource`         | yes                  | says "Clerk is my authorization server"                   |
| `/.well-known/oauth-protected-resource/api/mcp` | yes                  | same, for clients that look for the path-specific address |
| `/.well-known/oauth-authorization-server`       | yes                  | Clerk's own metadata, passed through                      |

`/api/mcp` is public for Clerk's middleware only because the middleware's `auth.protect()` would reject an
OAuth bearer token; the route then does its own check, in this order:

1. No token or an invalid one → **401** with `WWW-Authenticate: Bearer resource_metadata="…"`. This
   is what makes Claude start the sign-in.
2. Valid token → find `Users` by `clerk_user_id`; apply D2. Denied → **403**, and the attempt is logged.
3. Allowed → handle the MCP request; each tool call writes a `McpQueryLog` row, **even when it fails**.

The Clerk frontend API URL is decoded from `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`; nothing new to configure.

## 7. Setup after merge (by hand, not done by this change)

1. Deploy the migration (normal promote flow). It creates the role without a password.
2. In the production SQL editor: `ALTER ROLE analytics_ro LOGIN PASSWORD '<long random>';`
3. Vercel env `ANALYTICS_DATABASE_URL` = the **pooler** URL for that role
   (`postgresql://analytics_ro.<project-ref>:<password>@<pooler-host>:6543/postgres`).
   Locally: `postgresql://analytics_ro:…@127.0.0.1:54322/postgres` after the same `ALTER ROLE`.
4. Clerk Dashboard → OAuth applications → turn on **Dynamic client registration**.
5. In Claude: Settings → Connectors → Add custom connector → `https://<production host>/api/mcp`.
   On a Team plan an owner can add it once for everyone.

## 8. User scenarios (manual — Clerk and Claude cannot be driven from Playwright)

1. An active account manager adds the connector, signs in, asks "how many bookings were signed last
   month?" → Claude calls `describe_schema`, then `query`, and answers.
2. A user whose `Users.status_uuid` is inactive adds the connector → sign-in works, every call is refused
   with a clear message, and a `McpQueryLog` row records the refusal.
3. Claude is asked to "delete all quotes" → it tries `DELETE …` → refused by `prepareSql`; if it were sent
   anyway, the database refuses it (layers 1–4).
4. "Show me everything in `QboConnections`" → permission denied; Claude says so.
5. A query that returns 50 000 rows → 500 come back with `truncated: true`; Claude is told to narrow it.
6. A query that takes more than 15 s → cancelled with a timeout message.

## 9. Edge cases

- **Clerk account with no `Users` row:** 403 `no-account`.
- **Role password not set / `ANALYTICS_DATABASE_URL` missing:** `query` and `describe_schema` return
  `isError` "The analytics database is not configured"; no crash, still logged.
- **Pool exhausted / database down:** the same friendly error; the real message goes to the log only.
- **Log insert fails:** the tool result is still returned; the failure goes to `console.error`. Logging
  never blocks an answer.
- **Offline PowerSync:** not involved. This is server-side and online-only by design.
- **A column holding huge text/JSON:** caught by the 200 000-character cap; rows are dropped from the end.
- **Same SQL twice, concurrently:** independent connections; nothing is shared.

## 10. Tests

- Vitest: `prepareSql`, `capResult`, `isUserAllowed`, `runReadOnlyQuery` (the exact statement sequence,
  extended mode, truncation, rollback on error, release always), `formatSchema`, `oauthMetadata`, and the
  request handler through the real MCP transport (401, 405, 403, `tools/list`, `tools/call` for both tools,
  every error path writes the log, a failing log never blocks the answer).
- `supabase/tests/analytics_ro.test.sql` (`npm run test:db:analyticsro`, 25 assertions): the role reads,
  cannot write, cannot read `QboConnections` or `McpQueryLog`, bypasses RLS, reads a table created after
  the migration; `McpQueryLog` has RLS and no policy.
- `permissionPageData.test.ts`: the accountant's pinned list of granted rows gains "Ask Claude About Our
  Data", on purpose (D2 opens the connector to every active account).
- Checked once by hand against the local Postgres as `analytics_ro` (not committed): a second statement,
  `COMMIT; BEGIN READ WRITE; …`, a writing `SECURITY DEFINER` function, `set_config('transaction_read_only')`,
  `pg_read_file`, `lo_import`, `pg_authid`, `FOR UPDATE`, a 15 s timeout, a 500-row cap.
- Playwright: **none** — the flow needs Claude and Clerk OAuth (see section 8).

## 11. Data dictionary — what the app means by the data (v1.1, APPROVED 2026-11-25)

Status: **Approved** 2026-11-25. Request: "expose the source code so the models have more context as to
how the code is using the data and displaying it" → agreed instead: write the meaning down once, from the
code, and serve it through the existing connector.

### 11.1 Decisions

- **D6 — no source code is served.** Anyone with the connector could read the server code (auth, routes),
  and raw code is noise for a data question. The meaning is written down instead, in TypeScript.
- **D7 — the dictionary lives in TypeScript, not in `COMMENT ON`.** One file,
  `src/features/analyticsMcp/dataDictionary.ts`, typed against `database.types.ts`: a renamed or dropped
  table or column breaks `npm run tc`. No migration, nothing to deploy to the database, and it sits next to
  the code it describes (CLAUDE.md: rules live in TypeScript).
- **D8 — every table has an entry.** `DataDictionary` is a mapped type over every table in
  `database.types.ts`, so `npm run tc` fails when a table has no entry, and the next migration that adds a table also has to say what it means. Plumbing tables get a one-line
  "internal — ignore for business questions" entry. `McpQueryLog` and `QboConnections` are listed as
  not readable.
- **D9 — still one call.** `describe_schema` returns the business rules first, then the tables (each with a
  one-line purpose, and notes only on columns whose meaning is not obvious), then the foreign keys. No new
  tool: a model that skips an optional tool would miss the rules. The server `instructions` gain the five
  rules most often got wrong (money in cents, revenue incl. tax, never add CAD+USD, `deleted = false`, Toronto
  days, `pay_cents` is driver pay) so they are in context even before the call.
- **D10 — enums show their values.** `describe_schema` prints `event_status enum(draft|quoted|booked|unsigned_changes|lost)`
  instead of `USER-DEFINED`, read live from `pg_enum` so it never drifts.
- **D11 — "match the app" by default.** Where the app's own number has a quirk (scorecard revenue includes
  tax and adds CAD to USD; the leaderboard does not filter `deleted`; scorecard driver pay ignores status),
  the rules give the app's formula **and** the caveat, and tell the model to say which one it used. Each
  rule names the source file it was taken from, so it can be checked and kept in step.

### 11.2 Types

```ts
// src/features/analyticsMcp/dataDictionary.ts
import type { Database } from "../../../database.types";
type PublicTables = Database["public"]["Tables"];
export type TableName = keyof PublicTables;

export type TableDoc<T extends TableName> = {
  /** One line: what a row is, or "Internal: …" for plumbing. */
  purpose: string;
  /** Only columns whose meaning is not obvious from the name. */
  columns?: Partial<Record<keyof PublicTables[T]["Row"] & string, string>>;
};

export type DataDictionary = { [T in TableName]: TableDoc<T> }; // every table: D8

export type BusinessRule = { topic: string; rule: string; source: string /* file path(s) */ };

export const DATA_DICTIONARY: DataDictionary;
export const BUSINESS_RULES: BusinessRule[];
```

`formatSchema(columns, foreignKeys, dictionary, rules)` — `SchemaColumn` gains `enum_labels: string | null`.
Pure, unit-tested; `describeSchema` passes the real dictionary.

### 11.3 What the rules cover (taken from the code, with sources)

Money & currency (cents; `contract_revenue_cents` includes tax; currency comes from the sales office and
is copied onto `EventLineItems.currency` / `PaymentInstallments.currency` — use those, since
`QboConnections` is not readable; events with no sales office are older ones, which the app treats as USD) ·
dates & timezone (DATE columns vs timestamptz; days are `America/Toronto`) · soft deletes per table ·
event status meanings and transitions, `booked_at` / `quote_sent_at` · scorecard KPIs (quotes, sales, revenue,
gross margin, attribution by `created_by_user_uuid`) · AR total / received / amount due · driver pay
(`pay_cents`, line items, `qty_decimal`, `tax_dec`, pay ranges in dollars, weekly groups, `is_paid`) ·
trip status lifecycle and which statuses are "off" · employee vs contractor · zones (event zone derived from
address state) and that seasons / home bases / `summer_*_account_manager_uuid` are legacy · roles from
active rows, not `Users.role` · damage severity rule and "open" reports · repair status, `cost_cents`,
budgets · survey NPS · things the app does **not** have (no utilization metric, no out-of-service flag, no
budget-vs-spend page), so the model does not invent them.

### 11.4 Edge cases

- **Dictionary names a column the database no longer has** (production ahead of or behind local types):
  the note is skipped; only live columns are printed. A table in the dictionary but not live is skipped.
- **Live table with no dictionary entry** (production has a table the deployed code doesn't know): printed
  with no purpose, as today.
- **Output size:** about 48 000 characters for rules and tables plus ~15 000 for foreign keys (~16k
  tokens) — one call, well under the 200 000 cap. A test pins rules + tables under 80 000 characters so
  the dictionary cannot grow unnoticed.
- **Permissions:** no change — same connector, same people (D2). `permissionPageData.ts` unchanged.

### 11.5 Tests

- `dataDictionary.test.ts`: every entry has a non-empty purpose (completeness itself is enforced by `tsc`,
  D8); every rule has a topic, rule and source; each `source` path exists on disk.
- `formatSchema.test.ts`: enum labels printed; table purpose and column notes printed; notes for columns
  not live are skipped; rules come before tables; output for the real dictionary stays under 80 000 chars.
- `handleMcpRequest.test.ts`: `describe_schema` still returns the tables; the instructions mention cents,
  currency and `deleted`.
- Playwright: none (unchanged — section 8).

### 11.6 Keeping it up to date

Added 2026-11-25 at the user's request ("we need a trigger in the development cycle"). Three layers:

- **CLAUDE.md** — "Data dictionary" section: a change that alters what data means or how a number is
  computed updates `dataDictionary.ts` in the same commit.
- **Column snapshot** — `dataDictionary.columns.test.ts` keeps every `Table.column` from
  `database.types.ts` in `__snapshots__/dataDictionary.columns.txt`. A new or dropped column fails the
  test with a message asking for a note; accept with `-u`. (A new table already fails `tsc`, D8.)
- **`/preflight`** — step 2b re-reads every rule whose `source` file the PR changed, checks new
  migrations, and reports the rules checked or changed.

No further CI gate: whether a rule is still true needs reading, and a gate would be rubber-stamped.

## 12. Bleacher GPS locations (v1.2, 2026-11-25)

Built at the user's request ("do current and historical"); the user waived the spec-first step ("no need
for the spec either just send her"), so this section records what was built.

- **Source:** Linxup **v2** (`LINXUP_API_HOST` + `LINXUP_API_TOKEN`, already used by the bleacher location
  modal). The v3 Pull API (`api.linxup.com/pullapi`) needs a separate API key that we do not have; the v2
  token is refused there (403/401, checked 2026-11-25).
  - Current: `GET /ibis/rest/api/v2/locations` → every tracker's last report (`imei`, `latitude`,
    `longitude`, `date` epoch ms, `speed`).
  - History: `POST /ibis/rest/api/v2/stops` `{ fromDate, toDate }` (epoch ms, **at most 48 hours**) → every
    tracker's stops (`imei`, lat/lng, `beginDate`, `endDate`, street/city/state, geofence). It ignores a
    device filter and includes stops that began before `fromDate`; a stop still in progress is not listed.
- **Join:** `Bleachers.linxup_device_id` holds the IMEI; read through `analytics_ro` (non-deleted bleachers).
  A tracker on several bleachers is reported as shared, never guessed.
- **Tools** (both `readOnlyHint`, `openWorldHint`):
  - `bleacher_locations { bleacher_numbers?: number[] }` → `{ as_of, bleachers: [{ bleacher_number, tracker,
shares_tracker_with, latitude, longitude, reported_at, minutes_since_report, speed, note }] }`.
  - `bleacher_location_history { bleacher_numbers (1–20), from, to }` — ISO 8601, at most 7 days, cut into
    48-hour Linxup calls run in parallel → per bleacher, its stops overlapping the window (oldest first,
    de-duplicated) and its current position, plus a `how_to_read` note (no stops = probably parked since).
- **Log:** each call writes `McpQueryLog` with `tool` = the tool name and the arguments JSON in `sql`
  (migration `20261125200000_mcp_query_log_location_tools.sql` widens the CHECK).
- **Errors:** Linxup's own message is shown (it names no host or token); missing env → "The Linxup GPS
  connection is not configured."; each Linxup call times out after 8 s (Vercel Hobby limit is 10 s).
- **Permissions:** same people as the connector (D2). `permissionPageData.ts` now says GPS positions are
  included, drivers too.
- **Tests:** `logic/bleacherLocations.test.ts`, `server/linxup.test.ts`, handler tests for both tools.
