"use client";

import { use, useState, useEffect, useCallback } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { RichTextEditor } from "@/app/roadmap/_lib/components/RichTextEditor";
import {
  fetchTermsAndConditionsById,
  updateTermsAndConditions,
  TermsAndConditionsRow,
} from "@/features/termsAndConditions/db/termsAndConditionsDb";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { PrimaryButton } from "@/components/PrimaryButton";

export default function TermsAndConditionsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [data, setData] = useState<TermsAndConditionsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const row = await fetchTermsAndConditionsById(id);
    setData(row);
    if (row) {
      setName(row.name);
      setHtmlContent(row.html_content);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTermsAndConditions(id, { name: name.trim(), htmlContent });
      createSuccessToast(["Contract template updated."]);
      setEditing(false);
      load();
    } catch {
      // error toast shown in db layer
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-400">Contract template not found</p>
      </div>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/terms-and-conditions")}
          className="text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-darkBlue flex-1">
          {editing ? "Edit Contract Template" : data.name}
        </h1>
        {!editing && (
          <PrimaryButton onClick={() => setEditing(true)}>
            <Pencil className="w-4 h-4 mr-1" />
            Edit
          </PrimaryButton>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-darkBlue"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contract Content</label>
            <RichTextEditor value={htmlContent} onChange={setHtmlContent} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => {
                setEditing(false);
                setName(data.name);
                setHtmlContent(data.html_content);
              }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer"
            >
              Cancel
            </button>
            <PrimaryButton onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? "Saving..." : "Save"}
            </PrimaryButton>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: data.html_content }}
          />
        </div>
      )}
    </main>
  );
}
