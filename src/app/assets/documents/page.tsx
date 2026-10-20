"use client";

import { FileUploadInput } from "@/features/manageTeam/components/inputs/FileUploadInput";
import { useBlueBook, BlueBookData } from "./_lib/hooks/useBlueBook";
import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";
import { Color } from "@/types/Color";
import { useState } from "react";
import { FileText } from "lucide-react";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";

// ─── Region badge ─────────────────────────────────────────────────────────────

const REGION_STYLES: Record<string, { label: string; className: string }> = {
  CAN: { label: "CAN", className: "bg-red-100 text-red-700 border border-red-200" },
  US: { label: "US", className: "bg-blue-100 text-blue-700 border border-blue-200" },
  Both: { label: "CAN & US", className: "bg-green-100 text-green-700 border border-green-200" },
};

function RegionBadge({ region }: { region: string | null }) {
  const cfg = REGION_STYLES[region ?? "Both"] ?? REGION_STYLES["Both"];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

// ─── Edit Sheet ───────────────────────────────────────────────────────────────

type FormState = {
  name: string;
  link: string;
  document_path: string | null;
  description: string;
  region: "CAN" | "US" | "Both";
  sort_order: number;
  is_active: boolean;
};

function EditSheet({ initial, onClose }: { initial: BlueBookData; onClose: () => void }) {
  const [form, setForm] = useState<FormState>({
    name: initial.name ?? "",
    link: initial.link ?? "",
    document_path: initial.document_path ?? null,
    description: initial.description ?? "",
    region: (initial.region as any) ?? "Both",
    sort_order: initial.sort_order ?? 0,
    is_active: initial.is_active !== 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof FormState, value: any) => setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const q = db
        .updateTable("BlueBook")
        .set({
          name: form.name.trim(),
          link: form.link.trim() || null,
          document_path: form.document_path,
          description: form.description.trim() || null,
          region: form.region,
          sort_order: Number(form.sort_order),
          is_active: form.is_active ? 1 : 0,
          updated_at: new Date().toISOString(),
        })
        .where("id", "=", initial.id)
        .compile();
      await typedExecute(q);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 transition-opacity" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full sm:max-w-sm bg-white shadow-xl z-50 flex flex-col animate-in slide-in-from-right">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Edit Entry</h2>
          <p className="text-sm text-gray-500">Update the fields and click 'Save Changes'.</p>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-5 items-center gap-4">
              <label className="text-right text-sm font-medium col-span-2">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Driver Checklist"
                className="col-span-3 px-3 py-2 border rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
              />
            </div>

            {/* Document PDF Upload */}
            <div className="grid grid-cols-5 items-start gap-4">
              <label className="text-right text-sm font-medium col-span-2 pt-2">Attachment</label>
              <div className="col-span-3 min-w-0">
                <FileUploadInput
                  label=""
                  bucket="documents"
                  storagePath={`${form.name ?? "unknown"}/documents-${Date.now()}`}
                  value={form.document_path}
                  onChange={(value) => set("document_path", value)}
                  acceptedTypes={["application/pdf"]}
                  maxSizeMB={10}
                />
              </div>
            </div>

            <div className="grid grid-cols-5 items-start gap-4">
              <label className="text-right text-sm font-medium col-span-2 pt-2">Link</label>

              <div className="col-span-3 min-w-0 space-y-2">
                {/* Deprecation warning */}
                <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md px-3 py-2 text-xs">
                  <span className="font-bold">⚠️</span>
                  <span>This feature is deprecated and will be removed in a future release.</span>
                </div>

                <input
                  type="text"
                  value={form.link}
                  onChange={(e) => set("link", e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full px-3 py-2 border rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                />
              </div>
            </div>

            <div className="grid grid-cols-5 items-start gap-4">
              <label className="text-right text-sm font-medium col-span-2 pt-2">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Brief description..."
                rows={3}
                className="col-span-3 px-3 py-2 border rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0 resize-none"
              />
            </div>

            <div className="grid grid-cols-5 items-center gap-4">
              <label className="text-right text-sm font-medium col-span-2">Region</label>
              <div className="col-span-3 flex gap-1">
                {(["Both", "CAN", "US"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => set("region", r)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-semibold border transition-all ${
                      form.region === r
                        ? "bg-darkBlue text-white border-darkBlue"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-5 items-center gap-4">
              <label className="text-right text-sm font-medium col-span-2">Sort Order</label>
              <div className="col-span-3">
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => set("sort_order", parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Lower = appears first. Use multiples of 10.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-5 items-center gap-4">
              <label className="text-right text-sm font-medium col-span-2">Active</label>
              <div className="col-span-3 flex items-center gap-3">
                <button
                  onClick={() => set("is_active", !form.is_active)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active ? "bg-green-500" : "bg-gray-300"}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_active ? "translate-x-6" : "translate-x-1"}`}
                  />
                </button>
                <span className="text-sm text-gray-500">
                  {form.is_active ? "Visible to drivers" : "Hidden from drivers"}
                </span>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="p-6 border-t flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-darkBlue text-white rounded-md hover:bg-lightBlue transition-colors cursor-pointer disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Delete confirm dialog ────────────────────────────────────────────────────

function DeleteDialog({ entry, onClose }: { entry: BlueBookData; onClose: () => void }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const q = db.deleteFrom("BlueBook").where("id", "=", entry.id).compile();
      await typedExecute(q);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Entry</h3>
          <p className="text-sm text-gray-500 mb-6">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-gray-800">"{entry.name}"</span>? This cannot be
            undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BlueBookPage() {
  const { blueBookEntries } = useBlueBook();
  const [editTarget, setEditTarget] = useState<BlueBookData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BlueBookData | null>(null);
  const supabase = useClerkSupabaseClient();

  return (
    <div>
      <p className="text-sm mb-4" style={{ color: Color.GRAY }}>
        Manage documents and resources visible to drivers in the app.
      </p>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {blueBookEntries === null ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
        ) : blueBookEntries.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            No entries yet. Add one to get started.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide w-8">
                  #
                </th>
                <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                  Name
                </th>
                <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                  Attachment
                </th>
                <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                  Link
                </th>
                <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                  Region
                </th>
                <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                  Status
                </th>
                <th className="px-5 py-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {blueBookEntries.map((entry) => {
                const handlePdfClick = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  if (!entry.document_path) return;
                  const { data } = supabase.storage
                    .from("documents")
                    .getPublicUrl(entry.document_path);
                  window.open(data.publicUrl, "_blank");
                };

                return (
                  <tr
                    key={entry.id}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors"
                  >
                    <td className="px-5 py-3.5 text-gray-300 font-mono text-xs">
                      {entry.sort_order}
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-gray-900">{entry.name}</p>
                      {entry.description && (
                        <p className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">
                          {entry.description}
                        </p>
                      )}
                    </td>
                    <td className="p-3 text-left">
                      {entry.document_path ? (
                        <button
                          onClick={handlePdfClick}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                          title="View Attachment"
                        >
                          <FileText className="h-4 w-4" />
                          View
                        </button>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {entry.link ? (
                        <a
                          href={entry.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-xs font-medium"
                        >
                          Open ↗
                        </a>
                      ) : (
                        <span className="text-xs text-gray-300 italic">No link</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <RegionBadge region={entry.region} />
                    </td>
                    <td className="px-5 py-3.5">
                      {entry.is_active !== 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />{" "}
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />{" "}
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setEditTarget(entry)}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors px-2 py-1 rounded hover:bg-blue-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteTarget(entry)}
                          className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors px-2 py-1 rounded hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {blueBookEntries && blueBookEntries.length > 0 && (
        <p className="text-xs text-gray-400 mt-3 px-1">
          {blueBookEntries.length} {blueBookEntries.length === 1 ? "entry" : "entries"}
          {" · "}
          {blueBookEntries.filter((e) => e.is_active !== 0).length} active
        </p>
      )}

      {editTarget && <EditSheet initial={editTarget} onClose={() => setEditTarget(null)} />}
      {deleteTarget && <DeleteDialog entry={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </div>
  );
}
