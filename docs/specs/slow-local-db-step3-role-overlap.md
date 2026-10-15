# Slow local database, step 3: one bucket per table across roles

Status: **STOPPED 2026-10-14 at the verification of section 6, awaiting the user's decision.**
Approved the same day; the check of section 6 was run first and the mechanism of section 3
**does not do what this spec expects** (section 15). Nothing was written to
`../br_powersync`. Step 3 of [slow-local-db-plan.md](slow-local-db-plan.md). The file it would
change is `../br_powersync/config/sync_rules.yaml`, in another repository. Request (user,
2026-10-14): shrink what a role change makes the client apply; only the overlap between roles.

## 0. The request, and what it is not

**In scope:** the web stream's role queries that are the same whole-table query for several
roles become one query per table.

**Not in scope (D1):** cutting `Alerts` or `UserAlerts` to the user's own rows (the alerts
engine and the dashboard badges read other users' rows), row-level filters, the mobile
stream, the client code, `AppSchema.ts`, migrations.

## 1. Decisions taken

**D1 — what step 3 does.** Options: role overlap only; only the user's own `UserAlerts`;
both.
User's answer: **role overlap only.**

**D2 — which roles and tables.** Options: all roles, all tables; admin, account manager and
viewer; admin and account manager.
User's answer: **all roles, all tables.** Consequence: 70 tables become one query each, the
file shrinks from 271 role queries to about 83 table queries, and the whole web stream is
redefined (section 7).

## 2. What is known (checked 2026-10-14 with the service's own library)

- The `web` stream has 286 queries. They compile into buckets that follow the role join:
  `web|8` viewer, `web|67` accountant, `web|75` maintainer, `web|120` developer, `web|138`
  account manager, `web|204` admin, and four small ones (`web|0`, `1`, `5`, `7`: the user's
  own row, identity tables, reference data, filter settings). The compiler reports 0 errors
  and 2 parameterised web buckets, the baseline of 2026-10-02.
- 271 of the 286 queries have one form: `SELECT "T".* FROM "T"`, a role join, and the check
  that the user is active. The other 15 (identity, reference data, `Users` variants,
  `DriverSyncHealth`) have their own shape and are left alone.
- Those 271 queries cover 83 tables. 70 tables are in two or more roles (roles per table:
  one role 13, two 8, three 15, four 39, five 7, six 1). `Events`, for example, has five
  separate queries (viewer, maintainer, accountant, account manager, admin), none with a
  row filter.
- A user with several roles holds one bucket per role, so a shared table arrives once per
  role. Local rows that a user with two roles receives twice: admin with account manager
  29,638 (65 tables); admin with viewer 29,407 (61); admin with accountant 17,281 (28);
  admin with maintainer 15,635 (19); admin with developer 3,320 (15).
- The compiler accepts a query with two role flags in one condition, and one that adds a role
  table through `IN (subquery)`; both give one data source and no parameters. It rejects
  `LEFT JOIN`. The two accepted forms, as they appear in the probe:

```sql
JOIN "Users" ON ("Users"."is_admin" = true OR "Users"."is_viewer" = true)

WHERE ... AND ("Users"."is_admin" = true
  OR "Users"."id" IN (select "user_uuid" from "AccountManagers" where "is_active" = true))
```

## 3. The change

For each of the 70 tables, the per-role queries are replaced by one:

```sql
SELECT "T".* FROM "T"
JOIN "Users" ON "Users"."clerk_user_id" = auth.user_id()
WHERE connection.parameter('app') = 'web'
  AND "Users"."status_uuid" != '<the inactive status id>'
  AND ( "Users"."is_admin" = true
     OR "Users"."is_viewer" = true
     OR "Users"."id" IN (select "user_uuid" from "AccountManagers" where "is_active" = true)
     -- one OR term for each role that has a query for T today
     )
```

The terms are the roles' own conditions as they are today: admin `is_admin`, viewer
`is_viewer`, and for account manager, maintainer, accountant and developer the user's row in
that role's table with `is_active = true`. A table that is in only one role keeps its query.
The 15 other queries are copied unchanged. A user receives, for every table, exactly the
rows that any of their roles gave them before.

## 4. Locked contracts

The client-visible contract does not change: the same tables, the same rows, the same `*`
columns for every user. The `web` stream keeps its name and the `auto_subscribe` and
`accept_potentially_dangerous_queries` settings. Changing which role may read which table
needs a new "Approved" and an update of `permissionPageData.ts`.

## 5. Behaviour that must not change

- **Equal row sets.** For every role combination, the (table, row id) pairs a user receives
  are identical before and after.
- **Inactive users** still receive only their own `Users` row and `UserStatuses`.
- **`*` columns.** No query lists columns where another bucket also syncs the same table with
  `*` (two column sets for one table overwrite each other).
- **Bucket count.** No web bucket becomes parameterised by a returned row (a JOIN to the
  returned row makes one bucket per row); the compiler must still report 2.

## 6. Verification (before anything is deployed)

The runtime evaluation of the combined condition, above all `OR … IN (subquery)`, is
**not yet verified**: the compiler accepts it, which proves nothing about the rows it
selects. On the local PowerSync stack, with test users of these role sets: admin alone,
account manager alone, viewer alone, accountant alone, maintainer alone, developer alone,
admin with account manager, and an inactive user:

1. **Compile:** 0 errors; 2 parameterised web buckets.
2. **Equivalence:** for each test user the (table, row id) pairs received under the old and
   the new file are equal. The method (a script on the service's library, or a real client
   per user) is chosen in the implementation and shown in the report.
3. **Size:** the operations received by an admin with account manager, before and after, and
   the time of the apply, from the same measurements as before.

If the combined form does not select the right rows at runtime, the step stops there and the
spec is amended with the user.

## 7. Consequences of deploying (the user decides when)

- The service reads the file at start, so it has to be restarted.
- Because the bucket definitions change, **every web client downloads and applies its whole
  data set again, once**: about 48k to 65k operations for an admin, which blocked the
  database worker for about 24 s on a Mac. It is best done outside working hours.
- Rolling back is deploying the previous file, and that is another full download for every
  client.
- Until the file is deployed, this step changes nothing for any user.

## 8. Tests

TDD does not fit a YAML file as it fits code, so the tests are the checks of section 6, written
as scripts first and shown failing against a deliberately wrong file (for example a role term
dropped), then passing against the real one. Where the scripts live (a folder in
`../br_powersync`, or the session only) is to confirm at review.

## 9. Measurement

Plan section 3: M4 (the role appears) and the operation count, on local dev, with the user
who has two roles. Expected, as a hypothesis: the operations a role add downloads fall by the
overlap of the two roles (up to the 29.6k local rows of admin with account manager) and the
apply is shorter in proportion; not measured yet.

## 10. Rollback and commits

One commit in `../br_powersync` (`perf(sync-rules): one query per table across roles`) and
none in this repository. Rolling back is `git revert` of that commit and a deploy (section
7).

## 11. Permissions

No role gains or loses a row (section 5), so `permissionPageData.ts` is not touched. The
equivalence check of section 6 is what shows it.

## 12. Files

One counted file: `sync_rules.yaml` (spec and verification scripts do not count). A one-off
generator may write the new queries from the old ones; it is not committed.

## 13. Definition of done

The checks of section 6 with their real output; the file committed in `../br_powersync`; the
deploy and its timing left to the user. This repository's `tc`, tests and E2E are not
involved.

## 14. To confirm at review

- That a one-time full download for every web client at deploy is acceptable (section 7).
- That the test users of section 6 cover the roles the user cares about, and which test
  user the measurement of section 9 uses.

## 15. Verification result (2026-10-14)

The check of section 6 was run offline with the service's own sync-rules library, which
works out for every user which buckets the user is given and in how many of them each
table's rows arrive. The lookup index the service keeps in storage was rebuilt in memory from
the local database. 119 users were evaluated: the 102 real rows of the local `Users` table
and 17 synthetic users covering every role combination, including inactive ones. The scripts
are in the session scratchpad (a generator of the merged file, the evaluation harness that
runs in the PowerSync container, and a comparison); where they should live is for the user to
decide.

**Result 1: the OR merge of section 3 gives no saving.** The compiler accepts the file (0
errors, 2 parameterised web buckets) and every user receives exactly the same tables as
before, but **every term of an `OR` becomes its own bucket**: an admin who is also an account
manager still gets `Events` in two buckets (one per matching term), with the same number of
buckets and copies as with the old file. It makes no difference whether the terms are role
tables (`IN (subquery)`) or two flags of the `Users` row in one `JOIN ... ON`. In this version
of the service an `OR` means "the union of buckets", not "one bucket for several roles".

**Result 2: excluding instead of merging does remove the duplicates, but not for the case
that was measured.** A variant in which a role's whole-table query leaves out the users who
already get the table through a higher role that is a flag on `Users` (admin, then viewer; the
flags are `not null default false`) gives every user the same tables, and cuts the copies for
a user with two roles: admin with account manager 157 to 93 table copies, admin with viewer
154 to 93, admin with accountant 122 to 94, and for a user with every role 294 to 102. Seven of
the 102 local users receive fewer copies. But a role **change** is not cheaper. Local rows the
client downloads for the buckets it did not hold before:

- account manager to account manager and admin: 48,897 under the current file, 48,897 with the
  OR merge, 48,897 with the exclusion; the exclusion also removes 4 buckets (29,638 rows);
- viewer to viewer and admin: 48,897, 48,897, 48,897, and 3 buckets (29,407 rows) removed;
- no role to admin: 48,897 in all three;
- admin to admin and account manager: 29,740 under the current file and 102 with the
  exclusion (the only change that gets cheaper).

The admin set arrives in full whichever way the overlap is written, because it is a new bucket,
and in the exclusion variant the bucket the user already held is dropped on top.

**Side effects of the exclusion variant:** a user with a single role holds 1 to 2 more buckets
(account manager 5 to 7, viewer 5 to 6); users with two table-based roles (account manager
with accountant) get no saving and more buckets (6 to 10); and, as in section 7, deploying it
means a full download for every web client.

**What it means for the step.** No change of this file alone can make the role-add apply
smaller; the idea would need one bucket that both roles share, which needs a condition that is
one lookup for any of the roles, and the roles live in different tables. That is a database
change, outside this spec. The options are put to the user in the report of this step; none is
chosen here.
