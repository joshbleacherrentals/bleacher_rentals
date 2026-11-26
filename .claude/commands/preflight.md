---
description: Build the manual test checklist for a release, before it goes to production
argument-hint: <PR number>
---

Write the checklist I will work through by hand before putting PR
https://github.com/joshbleacherrentals/bleacher_rentals/pull/$1 into production.

The output is **a list of things for me to click**, in `preflight/<version>.md`.
Nothing runs. Nothing is recorded. I do the testing.

## 1. Read the change

Read every commit and every changed file — not the description. Look hard at
merge commits: a merge can silently drop a field from a form while leaving the
database layer intact, which has happened twice in this repo.

## 2. Permissions

For every behaviour the PR adds or changes, answer: **who is allowed to do
this?** Go role by role — `admin`, `account_manager`, `developer`, `viewer`,
`driver` (`WebRole` in `src/features/userAccess/logic/determineAccess.ts`).

Check each answer against
[`permissionPageData.ts`](src/features/userAccess/permissionPageData.ts), the
matrix that renders `/permissions` for every authenticated user.

- Behaviour the matrix does not cover → ask me, then add the entry.
- The PR changes who can do something already listed → update the entry.
- Code and matrix disagree → say so plainly before this ships.

Never write a separate permissions document. Users and this command read the
same file.

Do not take the client-side code as the answer. Write helpers here run against
the local PowerSync database; row-level security in Postgres is what actually
decides. Check `pg_policies` before concluding anything about who can write.

## 2b. Data dictionary

Staff ask Claude about our data through the analytics MCP, which answers from
[`dataDictionary.ts`](src/features/analyticsMcp/dataDictionary.ts). A stale rule
there gives them confident wrong numbers, and no test can tell that a formula
changed.

1. List the changed files (`gh pr diff $1 --name-only`).
2. For every entry in `BUSINESS_RULES` whose `source` names one of those files,
   re-read the rule against the new code. Still true → nothing. Not true → fix the
   rule in this PR.
3. For every new migration, check that a new status, enum value, money or
   currency column, soft-delete column, or a column that replaces an old one is
   described in `DATA_DICTIONARY`.
4. Read the whole diff once more for a changed meaning that no `source` points at
   (a new filter on a KPI, a new place revenue or pay is computed), and add or fix
   the rule, with that file as its `source`.

Report the rules you checked and any you changed, next to the permissions changes.

## 3. Ask, then write the answers down

Where the intended behaviour is not obvious, **ask me** — grouped, not
drip-fed. Then record the answers so nobody asks twice: a permission rule goes
in `permissionPageData.ts`, how a feature is meant to work goes in the relevant
`docs/specs/*.md`. Answers that live only in the chat are lost.

## 4. Automate the cheap ones first

Before writing a manual item, ask whether a test would be quicker to write than
to perform by hand every release. If it is, **write the test** and leave it off
my list.

Worth automating: a value that must land in Postgres, a role that must be
refused, a string that must appear in a PDF, a request that must carry a
parameter. Public pages are cheapest of all — no login.

Not worth automating: anything on the PixiJS dashboard grid, where cells are
drawn rather than being DOM elements; anything in the driver mobile app, which
is a separate codebase; and anything whose value is visual judgement.

Say which tests you added and what they now cover, so I can see why they are not
on my list.

## 5. Write the checklist

`preflight/<version>.md`, in two groups:

```markdown
# Preflight — <version>

PR: #<number>
Status: planned

## New in this release

- [ ] ...

## Could have broken

- [ ] ...

## Not testing

- ... — because ...
```

**New in this release** — one item per feature a customer would notice. The path
they actually take, not every branch of it.

**Could have broken** — only what this diff plausibly disturbed: shared
components, files a merge rewrote, data written by one screen and read by
another. Not a tour of the application.

Write each item as an instruction with an expected result, so I never have to
guess what "pass" means:

> - [ ] Set a contact to French, send the quote, open the link — the page, the
>       contract tab and the PDF are all French.

**Keep the whole list to about a dozen items.** A list I will not finish is
worse than a short one I will. If more than a dozen look necessary, the release
is too big to verify by hand, and you should say so rather than padding the
list.

**Not testing** is not optional. List what you considered and dropped, with the
reason — already covered by a unit test, unreachable from the web app, cosmetic.
That is how I judge whether your confidence is well placed, instead of trusting
it blindly.

## 6. Stop

Show me both groups, the "not testing" list, any tests you wrote, every
permissions change, and the data dictionary rules you checked or changed. Ask whether it is right. **Run nothing.**

When I have finished the testing myself, I sign it off with:

```bash
npm run preflight:sign
```
