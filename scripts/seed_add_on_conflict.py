#!/usr/bin/env python3
"""Make a fresh pg_dump seed safe after migrations: add ON CONFLICT DO NOTHING to every INSERT.

Usage: python3 scripts/seed_add_on_conflict.py [supabase/seed.sql]
Idempotent. A statement ends at a line ending in ");" followed by a blank line, a "--" comment or the next INSERT.
"""
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "supabase/seed.sql"
lines = open(path, encoding="utf-8").read().split("\n")
out, in_insert, changed = [], False, 0
for i, line in enumerate(lines):
    if line.startswith("INSERT INTO "):
        in_insert = True
    if in_insert and line.endswith(");"):
        nxt = lines[i + 1] if i + 1 < len(lines) else ""
        if nxt.strip() == "" or nxt.startswith("--") or nxt.startswith("INSERT INTO "):
            # skip if the statement already has ON CONFLICT (previous line)
            if not (out and out[-1].lstrip().startswith("ON CONFLICT")):
                out.append(line[:-1])
                out.append("ON CONFLICT DO NOTHING;")
                changed += 1
            else:
                out.append(line)
            in_insert = False
            continue
    if in_insert and line.startswith("ON CONFLICT"):
        in_insert = False
    out.append(line)
open(path, "w", encoding="utf-8").write("\n".join(out))
print(f"patched {changed} INSERT statements")
