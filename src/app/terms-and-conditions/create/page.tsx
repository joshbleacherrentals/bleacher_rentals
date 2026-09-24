"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { RichTextEditor } from "@/app/roadmap/_lib/components/RichTextEditor";
import { createTermsAndConditions } from "@/features/termsAndConditions/db/termsAndConditionsDb";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { PrimaryButton } from "@/components/PrimaryButton";

export default function CreateTermsPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createTermsAndConditions({ name: name.trim(), htmlContent });
      createSuccessToast(["Contract template created."]);
      router.push("/terms-and-conditions");
    } catch {
      // error toast shown in db layer
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/terms-and-conditions")}
          className="text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-darkBlue">Create Contract Template</h1>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Standard Rental Agreement"
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-darkBlue"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contract Content</label>
          <RichTextEditor value={htmlContent} onChange={setHtmlContent} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={() => router.push("/terms-and-conditions")}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer"
          >
            Cancel
          </button>
          <PrimaryButton onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Creating..." : "Create"}
          </PrimaryButton>
        </div>
      </div>
    </main>
  );
}
