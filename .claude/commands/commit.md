---
description: Review every local change, write the message, and commit — never push
argument-hint: [quick]
---

Commit whatever is currently uncommitted. I should be able to type `/commit` and
walk away.

**Mode:** `$1`. If that is `quick`, follow "Quick mode" below instead of sections
1–4. Anything else, or nothing, is the normal full process.

## Quick mode

For when I just want it recorded, fast. Do only this:

1. `git status --short` and `git diff --stat`, then skim the diff for secrets,
   `.env` values and debug logging. Leave out anything that should not be
   committed and say so.
2. **Skip `npm run tc` and `npx vitest run`.** Do not run them.
3. `npx prettier --write` on the files being committed, and only those.
4. **One commit**, whatever is in it, with a one-line `type(scope): subject`
   message and no body.
5. Then section 5 as usual: never push, not on `main`, show the summary line, the
   unpushed count and the push command.

End with one plain sentence saying the type-check and tests were not run, so a
quick commit is never mistaken for a checked one.

## 1. Look at everything first

Read the actual diff, not just the file names — staged, unstaged and untracked.
You cannot describe a change you have not read.

Watch for things that should not be committed: secrets, `.env` values, debug
logging, a temporary config, a scratch file. `test-results/`,
`playwright-report/` and `.env*` are already gitignored; if something like that
turns up untracked anyway, leave it out and say so.

## 2. Check it builds before recording it

```bash
npm run tc && npx vitest run
```

If either fails, **stop and tell me** rather than committing. A broken commit is
worse than an uncommitted change — except when the failure is pre-existing and
unrelated to what changed, in which case say so plainly and carry on.

Run `npx prettier --write` over the files you are committing. The repo has many
pre-existing formatting violations; do not touch files outside this change.

## 3. One commit, or several

Default to **one**. Split only when the changes are genuinely unrelated — a
bugfix and an unconnected refactor, or code plus a change to what users read on
a page. Someone reviewing should be able to take one and leave the other.

Never split just to make the history look tidy.

## 4. Write the message

Follow the repo's convention: `type(scope): subject`, with type one of `feat`,
`fix`, `test`, `chore`, `docs`, `refactor`.

- **Subject** — under ~70 characters, imperative, says what changed and where.
  Not "update files". Not "various fixes".
- **Body** — short. Two or three sentences at most, and only when the subject
  cannot carry it alone. Say **why**, or what is non-obvious. Skip the body
  entirely for a change that explains itself.

Do not restate the diff in prose. If the reader can see it in the code, leave it
out.

Do not add a `Co-Authored-By` line, a "Generated with Claude" line, or any other
attribution to the message. It is just my commit.

## 5. Commit, and stop there

**Never push.** Not even when the branch is behind, not even when it looks
finished. Josh pushes after reading the commit.

If the current branch is `main`, do not commit onto it — say so and offer to
branch first.

Afterwards, show the one-line summary and the count of unpushed commits, and
give me the push command without running it:

```bash
git push origin <branch>
```
