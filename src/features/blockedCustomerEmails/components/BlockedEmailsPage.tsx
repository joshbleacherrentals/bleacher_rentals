"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { PageHeaderWithBreadCrumbs } from "@/components/PageHeaderWithBreadCrumbs";
import { Button } from "@/components/ui/button";
import { validateAllowedEmail } from "@/features/devEmailAllowlist/logic/validateAllowedEmail";
import { useUserAccess } from "@/features/userAccess/client";
import { addBlockedEmail, deleteBlockedEmail, updateBlockedEmail } from "../db";
import { useBlockedCustomerEmails, type BlockedEmailRow } from "../hooks/useBlockedCustomerEmails";

/**
 * Blocked Emails — customer addresses whose mail must never be pulled from Gmail.
 *
 * Anyone can add an address, and everyone sees the whole list, but a row can only be edited or
 * removed by the person who added it (enforced by row-level security; the buttons below just hide
 * what would be refused). The check itself runs on the server, in /api/dev/gmail-contact-emails.
 */
export default function BlockedEmailsPage() {
  const access = useUserAccess();
  const userId = access.status === "active" ? access.userId : null;
  const { rows, isLoading } = useBlockedCustomerEmails();

  return (
    <div className="mx-auto max-w-3xl p-6">
      <PageHeaderWithBreadCrumbs
        crumbs={[{ label: "Blocked Emails" }]}
        description="Emails to and from these addresses cannot be pulled from Gmail onto a contact. Add the address of anyone whose mail should stay private, like the owner's. A customer who writes to them can still be searched. You can only edit or remove the addresses you added."
      />

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <AddEmailForm rows={rows} userId={userId} />

        {isLoading ? (
          <div className="p-6 text-gray-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-gray-500">No addresses are blocked yet.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((row) => (
              <EmailRow
                key={row.id}
                row={row}
                rows={rows}
                canChange={row.createdByUserUuid === userId}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AddEmailForm({ rows, userId }: { rows: BlockedEmailRow[]; userId: string | null }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!userId) return;
    const result = validateAllowedEmail(value, rows);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    try {
      await addBlockedEmail(result.email, userId);
      setValue("");
    } catch (e) {
      console.error("Failed to block email:", e);
      setError("Could not save that address. Try again.");
    }
  }

  return (
    <div className="px-4 py-3 border-b border-gray-100">
      <div className="flex gap-2">
        <input
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="name@example.com"
          aria-label="Email address to block"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <Button type="button" disabled={!userId} onClick={() => void submit()}>
          Block
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function EmailRow({
  row,
  rows,
  canChange,
}: {
  row: BlockedEmailRow;
  rows: BlockedEmailRow[];
  canChange: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.email);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraft(row.email);
    setError(null);
    setEditing(true);
  }

  async function save() {
    const result = validateAllowedEmail(draft, rows, row.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    try {
      if (result.email !== row.email) await updateBlockedEmail(row.id, result.email);
      setEditing(false);
    } catch (e) {
      console.error("Failed to update blocked email:", e);
      setError("Could not save that change. Try again.");
    }
  }

  async function remove() {
    if (!window.confirm(`Unblock ${row.email}? Its emails can be pulled from Gmail again.`)) return;
    try {
      await deleteBlockedEmail(row.id);
    } catch (e) {
      console.error("Failed to unblock email:", e);
    }
  }

  if (editing) {
    return (
      <li className="px-4 py-3">
        <div className="flex gap-2">
          <input
            type="email"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") setEditing(false);
            }}
            aria-label="Edit email address"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <Button type="button" size="icon" aria-label="Save" onClick={() => void save()}>
            <Check />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Cancel"
            onClick={() => setEditing(false)}
          >
            <X />
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </li>
    );
  }

  const added = [
    row.createdByName && `Added by ${row.createdByName}`,
    row.createdAt &&
      `${row.createdByName ? "on" : "Added"} ${new Date(row.createdAt).toLocaleDateString()}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm text-gray-900">{row.email}</div>
        {added && <div className="text-xs text-gray-400">{added}</div>}
      </div>
      {canChange && (
        <div className="flex gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Edit ${row.email}`}
            onClick={startEditing}
          >
            <Pencil />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Unblock ${row.email}`}
            onClick={() => void remove()}
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </li>
  );
}
