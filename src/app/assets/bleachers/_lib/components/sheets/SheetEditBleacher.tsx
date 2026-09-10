"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Trash2, ShieldAlert, X } from "lucide-react";
import { useBleacherTypesActive } from "@/features/pricingMatrix/hooks/useBleacherTypesActive";
import { usePsZones } from "@/features/dashboard/db/hooks/powersync/usePsZones";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
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
import { setBleacherDeleted, useBleacherByNumber, useBleacherTotalDistance } from "../../db";
import { useBleacherForm, useStorageLocationOptions } from "../../hooks/useBleacherForm";
import { BleacherFormFields } from "../BleacherFormFields";
import { BleacherInspectionSummary } from "@/features/annualInspections/components/BleacherInspectionSummary";

export function SheetEditBleacher() {
  const router = useRouter();
  const { isAdmin } = useTeamPermissions();
  const searchParams = useSearchParams();

  const editBleacherNumber = searchParams.get("edit") ? Number(searchParams.get("edit")) : null;

  const { bleacherTypes } = useBleacherTypesActive();
  const zones = usePsZones();
  const storageLocations = useStorageLocationOptions();

  const existing = useBleacherByNumber(editBleacherNumber);
  const { state, setField, isTakenNumber, isLoading, save } = useBleacherForm({ existing });
  const totalDistanceMeters = useBleacherTotalDistance(existing?.id ?? null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isDeleted = Boolean(existing?.deleted);

  const closeToList = () => router.push("/assets/bleachers");

  const handleSave = async () => {
    const ok = await save();
    if (ok) closeToList();
  };

  const handleSetDeleted = async (deleted: boolean) => {
    if (!existing?.id) return;
    try {
      await setBleacherDeleted(existing.id, deleted);
      toast.success(deleted ? "Bleacher deleted" : "Bleacher restored");
      closeToList();
    } catch (e) {
      toast.error(`Failed to ${deleted ? "delete" : "restore"} bleacher: ${String(e)}`);
    }
  };

  if (!editBleacherNumber) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex justify-end">
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity"
          onClick={closeToList}
        />

        <div className="fixed inset-y-0 right-0 flex w-full flex-col rounded-l-2xl bg-white shadow-2xl ring-1 ring-black/10 animate-in slide-in-from-right sm:max-w-md">
          <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
            <div>
              <h2 className="text-base font-semibold text-darkBlue">
                Bleacher #{state.bleacherNumber ?? ""}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">Edit details, then save your changes.</p>
            </div>
            <button
              onClick={closeToList}
              className="-mr-1 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {isDeleted && (
            <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              This bleacher has been deleted. Click &quot;Restore&quot; to recover it.
            </div>
          )}

          {!isAdmin && (
            <div className="mx-6 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              You have read-only access to assets.
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <fieldset disabled={!isAdmin} className="space-y-3.5 disabled:opacity-70">
              <BleacherFormFields
                state={state}
                setField={setField}
                bleacherTypes={bleacherTypes}
                zones={zones}
                storageLocations={storageLocations}
                isTakenNumber={isTakenNumber}
                numberLoading={isLoading}
                totalDistanceMeters={totalDistanceMeters}
              />
            </fieldset>

            {existing?.id && (
              <BleacherInspectionSummary
                bleacherUuid={existing.id}
                bleacherNumber={existing.bleacher_number}
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/60 px-6 py-4">
            {isAdmin &&
              (isDeleted ? (
                <button
                  type="button"
                  onClick={() => handleSetDeleted(false)}
                  className="flex items-center gap-2 rounded-lg bg-greenAccent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:brightness-110 cursor-pointer"
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              ))}
            <Link
              href={`/damage-reports?bleacher_uuid=${existing?.id ?? ""}`}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 cursor-pointer"
            >
              <ShieldAlert className="h-4 w-4" />
              Damage Reports
            </Link>
            {isAdmin && (
              <button
                type="submit"
                onClick={handleSave}
                className="rounded-lg bg-darkBlue px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-lightBlue cursor-pointer"
              >
                Save changes
              </button>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bleacher #{state.bleacherNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the bleacher from all lists and the dashboard. This action can be
              undone by a database administrator.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleSetDeleted(true)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
