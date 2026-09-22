"use client";

import { useState } from "react";
import { RichTextEditor } from "@/app/roadmap/_lib/components/RichTextEditor";
import { createTermsAndConditions } from "../db/termsAndConditionsDb";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton } from "@/components/PrimaryButton";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export function CreateTermsModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createTermsAndConditions({ name: name.trim(), htmlContent });
      createSuccessToast(["Contract template created."]);
      setName("");
      setHtmlContent("");
      onCreated();
      onClose();
    } catch {
      // error toast shown in db layer
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Contract Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
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
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer"
            >
              Cancel
            </button>
            <PrimaryButton onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? "Creating..." : "Create"}
            </PrimaryButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
