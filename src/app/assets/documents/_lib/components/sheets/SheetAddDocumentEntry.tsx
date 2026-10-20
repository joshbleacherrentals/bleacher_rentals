"use client";

import { db } from "@/components/providers/SystemProvider";
import { FileUploadInput } from "@/features/manageTeam/components/inputs/FileUploadInput";
import { typedExecute } from "@/lib/powersync/typedQuery";
import { useEffect, useState } from "react";

function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function SheetAddDocumentEntry() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [documentPdfPath, setDocumentPdfPath] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [region, setRegion] = useState<"Both" | "CAN" | "US">("Both");
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when closed
  useEffect(() => {
    if (!isOpen) {
      setName("");
      setLink("");
      setDocumentPdfPath(null);
      setDescription("");
      setRegion("Both");
      setSortOrder(0);
      setIsActive(true);
      setSaving(false);
      setError(null);
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const q = db
        .insertInto("BlueBook")
        .values({
          id: generateId(),
          name: name.trim(),
          document_path: documentPdfPath,
          link: link.trim() || null,
          description: description.trim() || null,
          region,
          sort_order: sortOrder,
          is_active: isActive ? 1 : 0,
          created_at: now,
          updated_at: now,
        })
        .compile();
      await typedExecute(q);
      setIsOpen(false);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-darkBlue text-white text-sm font-semibold rounded-lg shadow-md hover:bg-lightBlue transition cursor-pointer"
      >
        + Add Document
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          {/* Sheet */}
          <div className="fixed inset-y-0 right-0 w-full sm:max-w-sm bg-white shadow-xl flex flex-col animate-in slide-in-from-right">
            {/* Header */}
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold">Add Document</h2>
              <p className="text-sm text-gray-500">
                Fill out the form and click 'Save' to create a new entry.
              </p>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
              <div className="space-y-4">
                {/* Name */}
                <div className="grid grid-cols-5 items-center gap-4">
                  <label className="text-right text-sm font-medium col-span-2">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Driver Checklist"
                    className="col-span-3 px-3 py-2 border rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                  />
                </div>

                {/* Document PDF Upload */}
                <div className="grid grid-cols-5 items-start gap-4">
                  <label className="text-right text-sm font-medium col-span-2 pt-2">
                    Attachment
                  </label>
                  <div className="col-span-3 min-w-0">
                    <FileUploadInput
                      label=""
                      bucket="documents"
                      storagePath={`${name ?? "unknown"}/documents`}
                      value={documentPdfPath}
                      onChange={setDocumentPdfPath}
                      acceptedTypes={["application/pdf"]}
                      maxSizeMB={10}
                    />
                  </div>
                </div>

                {/* Link */}
                <div className="grid grid-cols-5 items-start gap-4">
                  <label className="text-right text-sm font-medium col-span-2 pt-2">Link</label>

                  <div className="col-span-3 min-w-0 space-y-2">
                    {/* Deprecation warning */}
                    <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md px-3 py-2 text-xs">
                      <span className="font-bold">⚠️</span>
                      <span>
                        This feature is deprecated and will be removed in a future release.
                      </span>
                    </div>

                    <input
                      type="text"
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                      placeholder="https://drive.google.com/..."
                      className="w-full px-3 py-2 border rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="grid grid-cols-5 items-start gap-4">
                  <label className="text-right text-sm font-medium col-span-2 pt-2">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description..."
                    rows={3}
                    className="col-span-3 px-3 py-2 border rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0 resize-none"
                  />
                </div>

                {/* Region */}
                <div className="grid grid-cols-5 items-center gap-4">
                  <label className="text-right text-sm font-medium col-span-2">Region</label>
                  <div className="col-span-3 flex gap-1">
                    {(["Both", "CAN", "US"] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => setRegion(r)}
                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold border transition-all ${
                          region === r
                            ? "bg-darkBlue text-white border-darkBlue"
                            : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                        }`}
                      >
                        {r === "Both" ? "Both" : r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sort Order */}
                <div className="grid grid-cols-5 items-center gap-4">
                  <label className="text-right text-sm font-medium col-span-2">Sort Order</label>
                  <div className="col-span-3">
                    <input
                      type="number"
                      value={sortOrder}
                      onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Lower = appears first. Use multiples of 10.
                    </p>
                  </div>
                </div>

                {/* Active */}
                <div className="grid grid-cols-5 items-center gap-4">
                  <label className="text-right text-sm font-medium col-span-2">Active</label>
                  <div className="col-span-3 flex items-center gap-3">
                    <button
                      onClick={() => setIsActive((v) => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        isActive ? "bg-green-500" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          isActive ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                    <span className="text-sm text-gray-500">
                      {isActive ? "Visible to drivers" : "Hidden from drivers"}
                    </span>
                  </div>
                </div>

                {error && (
                  <div className="col-span-5">
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-darkBlue text-white rounded-md hover:bg-lightBlue transition-colors cursor-pointer disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Entry"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
