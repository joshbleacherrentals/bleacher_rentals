---
description: Promote a branch through develop, staging and main, waiting for CI at every step
argument-hint: [branch]
---

Promote `$1` — the current branch when no argument is given — up the chain:

```
<branch> → develop → staging → main
```

One hop at a time. Each hop opens its own pull request and **waits for every
check on it to finish and pass** before merging. Nothing is merged on a hunch.

## Before starting

Stop and say so, rather than working around it, if:

- the working tree is dirty — commit first, `/commit` does it
- the branch has unpushed commits — they must be on the remote for CI to see them
- the branch is already merged, or has no commits the base does not have

## Each hop

**1. Open the PR.**

```bash
gh pr create --base <base> --head <head> --title "<title>" --body "<body>"
```

Reuse an open PR for the same base and head instead of opening a second one.

**2. Wait for the checks — all of them.**

```bash
gh pr checks <number> --watch --fail-fast=false
```

Two traps here, and both have to be handled:

- **Checks that have not registered yet.** Straight after `gh pr create`, GitHub
  may report no checks at all and exit successfully. That is not a pass. Wait
  until checks appear before trusting any result, and if none appear after a
  couple of minutes, stop and say so.
- **Jobs that are skipped rather than run.** `changelog` and `preflight` only run
  for a base of develop, staging or main, which is every hop here — so they must
  actually appear. A missing gate is a failure, not a pass.

Before merging, list every check with its conclusion and confirm each one is
`success`. Neutral, skipped, cancelled and timed out are **not** success.

**3. If something failed, retry once — but only what is worth retrying.**

```bash
gh run rerun <run-id> --failed
```

Retry `unit` and `test` only. **Never retry `changelog` or `preflight`**: they are
deterministic gates, so a second run gives the same answer and only costs
minutes. If one of those failed, the release is genuinely not ready — say which,
and stop.

Say plainly which job needed a retry, every time. A test that only passes on the
second attempt is a test that cannot be trusted, and that fact disappears if it
is not reported.

If anything still fails after the retry, **stop the whole chain**. Do not
continue to the next hop, and do not leave the PR merged half-way.

**4. Merge.**

```bash
gh pr merge <number> --merge --admin
```

Use `--merge`, not `--squash`: develop, staging and main share their commits, and a
squash would make them drift apart.

The ruleset requires one approving review, and Josh is its bypass actor; `--admin`
is how his bypass is used from `gh`. Because `--admin` also skips required checks,
it is allowed **only** after you listed every check on the PR's head commit and
each one is `success`. Never use it, or `--force`, to get past a failing or missing
check. If the merge is refused for any other reason, stop and report it.

**5. Confirm the merge landed** before starting the next hop, and check that the
deploy workflow for that branch (`develop.yaml`, `staging.yaml`,
`production.yaml`) started and did not fail.

## Stop conditions

Stop immediately, at any hop, and tell me where it stopped and why:

- a check fails after its one retry
- `changelog` or `preflight` fails — these mean the release is not ready
- a merge is refused
- a deploy workflow fails after a merge
- anything at all is ambiguous

A half-promoted chain is fine and recoverable. Guessing is not.

## Report

At the end, whatever happened:

- which hops merged, and which PR numbers
- any job that needed a retry, named
- where it stopped, if it stopped, and what to do next

Never say a hop passed unless you saw every check on it report success.
