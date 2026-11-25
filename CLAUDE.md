# CLAUDE.md

Working guidelines for this project. Follow them without being reminded.

## Stack

- **Next.js 16** + **React 19** (App Router)
- **PowerSync** (local-first) + **Kysely** for type-safe access to the local DB
- **Supabase** (Postgres, migrations, type generation) as the sync backend
- **Clerk** — authentication
- **PixiJS** — virtualized grid
- **Tailwind CSS 4**, **Radix UI**, shadcn-style components
- **Zustand** — client state
- Tests: **Vitest** (unit/component), **Playwright** (e2e)

## Data Architecture — PowerSync-First (required)

All new code is written local-first with reactive hooks. Full spec:
[docs/POWERSYNC_ARCHITECTURE.md](docs/POWERSYNC_ARCHITECTURE.md).

In short:

- For app data access use `db` (the Kysely wrapper over the local PowerSync DB), **not** `supabase.from(...)` in UI hooks/components.
  - Reactive read → `useTypedQuery(compiled, expect<T>())`
  - One-time read → `typedGetAll(compiled, expect<T>())`
  - Write → `typedExecute(compiled)`
- Pattern: build SQL with Kysely → `.compile()` → pass to a typed helper with `expect<T>()`.
- `expect<T>()` is mandatory — it forces TS to break when the schema changes.
- **Booleans** in local tables are usually stored as `0/1` (read back as `number | null`). If you get a `true/false` type error in a Kysely insert/update, that's why.
- Exception: hitting Supabase directly is acceptable only when the data is too large to sync locally and online-only is acceptable.
- Adding a new table — follow the checklist in POWERSYNC_ARCHITECTURE.md (migration → `npm run gtl` → `AppSchema.ts` → registries).

## Python — pure solvers only

Python (`python_api/`, FastAPI on Vercel) exists only for libraries TypeScript does not have — today
**OR-Tools** for route planning. Everything else is TypeScript, so each rule lives once and is
reused by the modal, the check pages and the planner.

- A Python endpoint is a **pure function: JSON in, JSON out.** It never reads or writes the
  database and never calls the network (no Supabase, no Google). It gets everything it needs in the
  request.
- **No business rules in Python.** Which trips are needed, which days and drivers are allowed, road
  times, pay, line items, duplicates — all TypeScript. Python only does the maths it is given
  (e.g. `python_api/auto_work_trackers/routing.py` places trips on driver-days from matrices).
- **TypeScript prepares and writes:** read inputs (PowerSync, or a Next.js server route for secrets
  and server-only data such as the Google key and `RouteCache`), call Python, then write the result
  through PowerSync.
- **One contract per endpoint:** the Pydantic models in `schemas.py` and their TypeScript mirror
  (e.g. `src/features/autoWorkTrackers/planner/solveContract.ts`) change together.
- If you are about to add a query, a network call or a business rule to Python, stop: it belongs in
  TypeScript.

## PixiJS Grid — z-index

Any work with grid borders/overlays must follow the z-index rules:
[docs/HowToControlBorderZIndex.md](docs/HowToControlBorderZIndex.md). Do not change z-index formulas without checking this document.

---

## Permissions — update the matrix, always

Every feature answers a question that is easy to forget: **who is allowed to do
this?** Ask it while building, not after someone complains.

The answer lives in exactly one place:
[`src/features/userAccess/permissionPageData.ts`](src/features/userAccess/permissionPageData.ts)
— a typed matrix of permissions, each with a level and a note for all five roles
in `WebRole` (`admin`, `account_manager`, `developer`, `viewer`, `driver`).

That file renders `/permissions`, which **every authenticated user can read**. So
it is not developer documentation: it is the answer your account managers get
when they ask what they are allowed to do.

**Whenever a change adds or alters what a role can do, update
`permissionPageData.ts` in the same commit.** No exceptions, and never write a
separate permissions document — a second copy will drift, and users would then be
reading the wrong one.

If the intended rule is not obvious, ask rather than guessing, then write the
answer into the matrix so nobody has to ask twice.

`/preflight` checks a PR against this file and fails the CI gate on a release
that was never verified.

---

## Data dictionary — update it with the meaning

Staff ask Claude questions about our data through the analytics MCP, and Claude
answers from
[`src/features/analyticsMcp/dataDictionary.ts`](src/features/analyticsMcp/dataDictionary.ts):
what each table and non-obvious column means, plus business rules (statuses,
revenue, tax, currency, pay, which rows to exclude). If the file is wrong, staff
get confident wrong numbers.

**Whenever a change alters what data means or how the app computes or filters a
number, update `dataDictionary.ts` in the same commit.** Typical triggers: a new
status or enum value, a column that is deprecated or replaced, a new soft-delete
column, a changed formula (scorecard, AR, pay), a new place that stores money or
currency.

Three checks back this up:

- A new table without an entry breaks `npm run tc`.
- A new or dropped column fails `dataDictionary.columns.test.ts`. Add a note if its
  meaning is not obvious from its name, then accept it with
  `npx vitest run src/features/analyticsMcp/dataDictionary.columns.test.ts -u`.
- `/preflight` lists the rules whose `source` files a PR touched, to re-read.

---

## Spec-Driven Development (SDD)

Before writing any code or tests for a **large feature**:

1. **Spec:** create/update `docs/specs/[feature-name].md`. It must clearly define:
   - DB schema (Supabase migrations) + PowerSync tables (`AppSchema.ts`).
   - TypeScript types (interfaces, React 19 props).
   - User behavior scenarios (for Playwright).
   - Edge cases and error handling (including Clerk auth errors, PowerSync offline state).
2. **Approval:** show me the spec. Wait for an explicit **"Approved"**.
3. **Implementation:** write code and tests strictly following the approved `*.md`. Changing the locked types or API/schema contracts **is not allowed** without my permission — if a change is needed, update the spec first and get a new "Approved".

For small changes (bug fix, minor UI) SDD may be skipped, but the TDD cycle and the final tests are still mandatory.

## Test-Driven Development (TDD)

When feasible: write the test first (red) → minimal code (green) → refactor. At minimum, every logic change ships with a test.

---

## Definition of Done — do not finish without green tests

**Do not declare a task done until all checks below pass and are shown.** If something is red, fix it — do not hand it off.

### Required cycle

1. Write / change the code.
2. **Static analysis & typing:** `npm run tc` (this is `tsc --noEmit`, checks React 19 / Next.js).
3. **Unit & Component:** `npm run test` (Vitest; or `npx vitest run` for a single non-watch run).
4. **Lint / formatting:** `npm run lint` (Prettier `--check`; fix with `npm run format`).
5. **Client E2E:** `npm run test:e2e` (Playwright; loads `.env.local`). Run it when changes touch the UI or critical user paths.
6. If you touched the DB schema/types — `npm run gtl` (regenerate types from the local Supabase).

> Note: there is no separate ESLint in this project — `npm run lint` == a Prettier format check.

### E2E test users & roles (Playwright)

Playwright auto-starts the dev server (`npm run dev:e2e`) and authenticates via Clerk in
`src/features/manageTeam/e2e/auth.setup.ts`, saving one session per role to
`playwright/.auth/<role>.json`. Role users are seeded in `supabase/seed.sql` and their
credentials live in `.env.local` (`E2E_*`). After changing seeded users run
`npx supabase db reset`.

Access is driven by `is_admin` / `is_viewer` on `Users` and by active rows in
`AccountManagers` / `Drivers` (see `src/features/userAccess/logic/determineAccess.ts`), **not**
by the `Users.role` column.

Role is selected by the spec filename suffix — the matching project supplies the right session:

| File pattern       | Runs as                 |
| ------------------ | ----------------------- |
| `*.admin.spec.ts`  | Admin                   |
| `*.am.spec.ts`     | Account Manager         |
| `*.driver.spec.ts` | Driver                  |
| `*.viewer.spec.ts` | Viewer                  |
| `*.spec.ts`        | default user (chromium) |

Run one role: `npm run test:e2e -- --project=admin`.

### Final report (always show it, with real command output)

```
- [ ] TS Compilation (npm run tc):       PASSED / FAILED
- [ ] Vitest Suites (npm run test):      PASSED / FAILED
- [ ] Playwright E2E (npm run test:e2e): PASSED / FAILED / SKIPPED (why)
```

- Back each item with the actual tail of the command output, not just a checkmark.
- If a step is skipped (e.g. E2E not relevant) — state it explicitly and explain why. Never pass off a skipped step as passed.

## Useful scripts

```bash
npm run tc            # type-check (tsc --noEmit)
npm run test          # vitest (watch)
npm run lint          # prettier --check
npm run format        # prettier --write (auto-fix formatting)
npm run test:e2e      # playwright e2e
npm run gtl           # generate-types-local (Supabase -> database.types.ts)
npm run dev           # next dev
```
