"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { updateBleacherType, softDeleteBleacherType } from "../db/bleacherTypeCrud";
import { PricingGrid } from "./PricingGrid";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { normalizeDescription } from "../utils/normalizeDescription";
import { BleacherTypeDescriptionField } from "./BleacherTypeDescriptionField";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type BtRow = {
  id: string;
  name: string | null;
  row_count: number | null;
  roof_type: string | null;
  description: string | null;
};

export function BleacherTypeDetail({ bleacherTypeId }: { bleacherTypeId: string }) {
  const router = useRouter();
  const supabase = useClerkSupabaseClient();
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const compiled = useMemo(
    () =>
      db
        .selectFrom("BleacherTypes")
        .select(["id", "name", "row_count", "roof_type", "description"])
        .where("id", "=", bleacherTypeId)
        .compile(),
    [bleacherTypeId],
  );

  const { data, isLoading } = useTypedQuery(compiled, expect<BtRow>());
  const bt = data?.[0] ?? null;

  const [name, setName] = useState("");
  const [rowCount, setRowCount] = useState("");
  const [roofType, setRoofType] = useState<"canopy" | "none">("none");
  const [description, setDescription] = useState("");
  const [formLoaded, setFormLoaded] = useState(false);

  useEffect(() => {
    if (bt && !formLoaded) {
      setName(bt.name ?? "");
      setRowCount(String(bt.row_count ?? ""));
      setRoofType((bt.roof_type as "canopy" | "none") ?? "none");
      setDescription(bt.description ?? "");
      setFormLoaded(true);
    }
  }, [bt, formLoaded]);

  const handleSave = async () => {
    if (!name.trim()) {
      createErrorToast(["Name is required"]);
      return;
    }
    setSaving(true);
    try {
      await updateBleacherType(
        bleacherTypeId,
        {
          name: name.trim(),
          row_count: parseInt(rowCount) || 0,
          roof_type: roofType,
          description: normalizeDescription(description),
        },
        supabase,
      );
      createSuccessToast(["Bleacher type updated."]);
    } catch (err: any) {
      createErrorToast(["Update failed", err?.message ?? ""]);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await softDeleteBleacherType(bleacherTypeId, supabase);
      createSuccessToast(["Bleacher type deleted."]);
      router.push("/pricing-matrix");
    } catch (err: any) {
      createErrorToast(["Delete failed", err?.message ?? ""]);
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!bt) {
    return (
      <main className="max-w-5xl mx-auto px-6 py-6">
        <p className="text-gray-500">Bleacher type not found.</p>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-6 space-y-8">
      {/* Back link */}
      <button
        onClick={() => router.push("/pricing-matrix")}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-darkBlue transition cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Pricing Matrix
      </button>

      {/* Bleacher Type Info */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Bleacher Type</h2>
          <button
            onClick={() => setShowDelete(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 border border-red-300 rounded px-2 py-1 hover:bg-red-50 transition cursor-pointer"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-darkBlue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Row Count</label>
            <input
              type="number"
              value={rowCount}
              onChange={(e) => setRowCount(e.target.value)}
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

        <div className="mt-4">
          <BleacherTypeDescriptionField value={description} onChange={setDescription} />
        </div>

        <div className="mt-3 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs font-semibold text-white bg-darkBlue rounded px-4 py-1.5 hover:bg-lightBlue transition cursor-pointer disabled:opacity-50 flex items-center gap-1"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {saving ? "Saving..." : "Save Type"}
          </button>
        </div>
      </section>

      {/* Pricing Grid */}
      <PricingGrid bleacherTypeId={bleacherTypeId} />

      {/* Delete confirm */}
      <AlertDialog
        open={showDelete}
        onOpenChange={(open) => {
          if (!open) setShowDelete(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bleacher type?</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete &quot;{bt.name}&quot; and hide it from lists. Existing bleachers
              using this type won&apos;t be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer rounded-sm" disabled={deleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="cursor-pointer rounded-sm bg-red-800 text-white hover:bg-red-900"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
