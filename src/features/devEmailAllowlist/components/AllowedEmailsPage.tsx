"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { PageHeaderWithBreadCrumbs } from "@/components/PageHeaderWithBreadCrumbs";
import { Button } from "@/components/ui/button";
import { mergeRoleConfigs } from "@/features/userAccess/accessConfig";
import { useUserAccess } from "@/features/userAccess/client";
import { addAllowedEmail, deleteAllowedEmail, updateAllowedEmail } from "../db";
import { useAllowedEmails, type AllowedEmailRow } from "../hooks/useAllowedEmails";
import { isDevEmailRestricted } from "../logic/allowlist";
import { developerGate } from "../logic/developerGate";
import { validateAllowedEmail } from "../logic/validateAllowedEmail";

/**
 * Allowed Emails — the addresses the development environment may email.
 *
 * In the environment behind the green "Development" banner the server sends an email only to an
 * address on this list and logs a console error for any other (see server/guardRecipients.ts).
 * Elsewhere the list is ignored. The PAGE is developer-only: RLS and the web sync rules give
 * developers this table, and the gate below turns everyone else away.
 */
export default function AllowedEmailsPage() {
  const access = useUserAccess();
  const gate = developerGate(access);
  const router = useRouter();

  const fallback = useMemo(
    () => (access.status === "active" ? mergeRoleConfigs(access.roles).defaultRedirect : "/"),
    [access],
  );

  useEffect(() => {
    if (gate === "redirect") router.replace(fallback);
  }, [gate, fallback, router]);

  if (gate !== "allowed") return null;
  return <AllowedEmailsContent />;
}

function AllowedEmailsContent() {
  const { rows, isLoading } = useAllowedEmails();
  const restricted = isDevEmailRestricted();

  return (
    <div className="mx-auto max-w-3xl p-6">
      <PageHeaderWithBreadCrumbs
        crumbs={[{ label: "Allowed Emails" }]}
        description="In the development environment, emails are only sent to the addresses on this list."
      />

      <div
        className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
          restricted
            ? "border-green-200 bg-green-50 text-green-900"
            : "border-gray-200 bg-gray-50 text-gray-600"
        }`}
      >
        {restricted
          ? "This is the development environment: any other address is skipped, and the server logs a console error naming it."
          : 'This list only applies when NEXT_PUBLIC_ENVIRONMENT is "development". In this environment emails send normally.'}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <AddEmailForm rows={rows} />

        {isLoading ? (
          <div className="p-6 text-gray-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-gray-500">
            No addresses yet. In development, no email will be sent until you add one.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((row) => (
              <EmailRow key={row.id} row={row} rows={rows} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AddEmailForm({ rows }: { rows: AllowedEmailRow[] }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const result = validateAllowedEmail(value, rows);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    try {
      await addAllowedEmail(result.email);
      setValue("");
    } catch (e) {
      console.error("Failed to add allowed email:", e);
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
          aria-label="Email address to allow"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <Button type="button" onClick={() => void submit()}>
          Add
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function EmailRow({ row, rows }: { row: AllowedEmailRow; rows: AllowedEmailRow[] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.email ?? "");
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraft(row.email ?? "");
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
      if (result.email !== row.email) await updateAllowedEmail(row.id, result.email);
      setEditing(false);
    } catch (e) {
      console.error("Failed to update allowed email:", e);
      setError("Could not save that change. Try again.");
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${row.email} from the allowed list?`)) return;
    try {
      await deleteAllowedEmail(row.id);
    } catch (e) {
      console.error("Failed to delete allowed email:", e);
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

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm text-gray-900">{row.email}</div>
        {row.created_at && (
          <div className="text-xs text-gray-400">
            Added {new Date(row.created_at).toLocaleDateString()}
          </div>
        )}
      </div>
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
          aria-label={`Remove ${row.email}`}
          onClick={() => void remove()}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}
