---
description: Deploy a branch to production — sync rules first, then changelog, preflight and the develop → staging → main chain
argument-hint: [branch]
---

Deploy `$1` — the current branch when no argument is given — to production, end to end, so I can
say "deploy this branch to prod" and walk away. Two repos, in this order:

1. **`br_powersync`** (`../../br_powersync`, the sync rules): its feature branch → `dev` → `staging`
   → `main`. The sync rules must be live before the app that reads them.
2. **This repo**: `$1` → `develop` → `staging` → `main`.

The rules of `/promote` apply to every hop in both repos. This command adds what comes before the
hops (changelog, preflight) and the sync-rules repo. Each step is idempotent: a step that is
already done (a version already bumped, a preflight already signed, a PR already merged) is noted
and skipped, so running `/deploy` again after a stop picks up where it left off.

## 0. Before starting

Stop and say so if, in either repo:

- the working tree is dirty
- the branch has unpushed commits (push them only if I said to; otherwise stop)
- the branch has no commits its base does not have (for `br_powersync`: nothing to deploy there
  is fine, skip it and say so)

## 1. Sync rules first (`br_powersync`)

`git fetch`, then find what is not yet on `origin/main` (`git log origin/main..origin/<branch>`).
If nothing, say "br_powersync: already on main" and go to step 2.

Otherwise promote it the same way as the app: `<branch> → dev → staging → main`, one PR per hop,
every check `success` before merging. Its branches are `dev`, `staging`, `main` (not `develop`).
Read `.github/workflows/` there to know which checks to expect; if a hop has none, say so and
merge only after confirming the PR is mergeable.

Also check that every table the app's new migrations add, and every table its new hooks read, has
its sync rule on `br_powersync` `main` (`git grep <Table> origin/main -- config/sync_rules.yaml`).
A missing rule is a stop.

## 2. Changelog

If `versions/<package.json version>.md` already exists and is new in this branch against
`develop`, skip. Otherwise open (or reuse) the PR `$1 → develop` and run `/changelog <PR>`'s
steps: read the whole PR, bump `package.json`, write `versions/<version>.md`. Commit and push.

## 3. Preflight — signed by override

If `preflight/<version>.md` exists and says `Status: passed`, skip. Otherwise run `/preflight
<PR>`'s steps (permissions, data dictionary, cheap tests) and write the checklist, then **sign it
by override**: I am not testing by hand this release.

- Tick every item, and put this line under `Status:` before signing, so the history stays honest:
  `Override: signed by /deploy without hand testing, on Josh's instruction.`
- Then `npm run preflight:sign`, commit, push.

**Do not override, and stop instead, if the preflight finds something very obvious:** a migration
CI will refuse (dated before production's newest, or an edited deployed one), code and
`permissionPageData.ts` disagreeing, a write that row-level security would refuse for the role
the UI offers it to, a missing sync rule, `npm run tc` or `npx vitest run` failing, or a merge
commit that dropped something. Say what it was.

## 4. The app chain

`$1 → develop → staging → main`, by `/promote`'s rules: one PR per hop (reuse an open one), wait
for every check to register and finish, retry only `unit`/`test` once, never retry `changelog` or
`preflight`, list every check with its conclusion before merging.

**Merging.** The ruleset requires one approving review, and Josh is its bypass actor. Merge with:

```bash
gh pr merge <number> --merge --admin
```

`--admin` is Josh's bypass, and it also skips required checks, so it is allowed **only** after you
listed every check on that PR's head commit and each one is `success` — never to get past a failing
or missing check. Use `--merge`, not `--squash`: develop, staging and main share commits, and a
squash would make them drift apart.

After each merge, confirm it landed and that the branch's deploy workflow (`develop.yaml`,
`staging.yaml`, `production.yaml`) started; wait for it and stop if it fails.

## Stop conditions

Everything in `/promote`, plus: a missing sync rule, an "obvious" preflight finding, or the
`br_powersync` chain not reaching `main`. Never start the app chain while the sync rules are not
on `main`. A half-done deploy is fine and recoverable; guessing is not.

## Report

- `br_powersync`: what was promoted (PR numbers) or "already on main"
- the version, and whether the changelog and preflight were written now or already there
- each app hop with its PR number, every check's conclusion, and any retried job, named
- the deploy workflows' results
- where it stopped, if it stopped, and what to do next
