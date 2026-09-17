"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { createBleacherType } from "../db/bleacherTypeCrud";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { normalizeDescription } from "../utils/normalizeDescription";
import { BleacherTypeDescriptionField } from "./BleacherTypeDescriptionField";

export function CreateBleacherTypeForm() {
  const router = useRouter();
  const supabase = useClerkSupabaseClient();
  const [name, setName] = useState("");
  const [rowCount, setRowCount] = useState("");
  const [roofType, setRoofType] = useState<"canopy" | "none">("none");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      createErrorToast(["Name is required"]);
      return;
    }
    if (!rowCount || parseInt(rowCount) <= 0) {
      createErrorToast(["Row count must be > 0"]);
      return;
    }
    setSaving(true);
    try {
      const id = await createBleacherType(
        {
          name: name.trim(),
          row_count: parseInt(rowCount),
          roof_type: roofType,
          description: normalizeDescription(description),
        },
        supabase,
      );
      router.push(`/pricing-matrix/${id}`);
    } catch (err: any) {
      createErrorToast(["Failed to create bleacher type", err?.message ?? ""]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      <button
        onClick={() => router.push("/pricing-matrix")}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-darkBlue transition cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Pricing Matrix
      </button>

      <h1 className="text-lg font-semibold">New Bleacher Type</h1>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 15-Row, 450 Seat"
            className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-darkBlue"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Row Count</label>
          <input
            type="number"
            value={rowCount}
            onChange={(e) => setRowCount(e.target.value)}
            placeholder="15"
            className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-darkBlue"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Roof Type</label>
          <select
            value={roofType}
            onChange={(e) => setRoofType(e.target.value as "canopy" | "none")}
            className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-darkBlue"
          >
            <option value="none">None</option>
            <option value="canopy">Canopy</option>
          </select>
        </div>
      </div>

      <BleacherTypeDescriptionField value={description} onChange={setDescription} />

      <div className="flex justify-end">
        <button
          onClick={handleCreate}
          disabled={saving}
          className="text-sm font-semibold text-white bg-darkBlue rounded px-4 py-2 hover:bg-lightBlue transition cursor-pointer disabled:opacity-50 flex items-center gap-1"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? "Creating..." : "Create & Set Prices"}
        </button>
      </div>
    </main>
  );
}
