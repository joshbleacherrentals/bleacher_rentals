"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchTakenBleacherNumbers, updateBleacher, useBleacherQuery } from "../../db";
import SelectRowsDropDown from "../dropdowns/selectRowsDropDown";
import SelectHomeBaseDropDown from "../dropdowns/selectHomeBaseDropDown";
import SelectLinxupDeviceDropDown from "../dropdowns/selectLinxupDeviceDropDown";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, CircleAlert, LoaderCircle, Trash2, ShieldAlert } from "lucide-react";
import { checkInsertBleacherFormRules, feetAndInchesToInches } from "../../functions";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { SelectAccountManager } from "@/features/manageTeam/components/inputs/SelectAccountManager";
import { HomeBase } from "../../hooks/useHomeBases";
import { inchesToFeetAndInches } from "../../functions";
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

// https://www.loom.com/share/377b110fd24f4eebbc6e90394ac3a407?sid=c32cff10-c666-4386-9a09-85ed203e4cb5
// Did a little explainer on how this works.
import { FileUploadInput } from "@/features/manageTeam/components/inputs/FileUploadInput";

export function SheetEditBleacher() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useClerkSupabaseClient();
  const queryClient = useQueryClient();
  const searchParamsValue = searchParams.get("edit");
  const editBleacherNumber = searchParamsValue ? Number(searchParamsValue) : null;

  const [bleacherNumber, setBleacherNumber] = useState<number | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [rows, setRows] = useState<number | null>(null);
  const [seats, setSeats] = useState<number | null>(null);
  const [selectedSummerHomeBaseUuid, setSelectedSummerHomeBaseUuid] = useState<string | null>(null);
  const [selectedWinterHomeBaseUuid, setSelectedWinterHomeBaseUuid] = useState<string | null>(null);
  const [selectedLinxupDeviceId, setSelectedLinxupDeviceId] = useState<string | null>(null);
  const [summerAccountManagerUuid, setSummerAccountManagerUuid] = useState<string | null>(null);
  const [winterAccountManagerUuid, setWinterAccountManagerUuid] = useState<string | null>(null);
  const [hitchType, setHitchType] = useState<string | null>(null);
  const [vinNumber, setVinNumber] = useState<string | null>(null);
  const [tagNumber, setTagNumber] = useState<string | null>(null);
  const [manufacturer, setManufacturer] = useState<string | null>(null);
  const [gvwr, setGvwr] = useState<number | null>(null);
  // Trailer length in feet, but we also want to store it in inches for more precise sorting and filtering
  const [trailerHeightFt, setTrailerHeightFt] = useState<number | null>(null);
  const [trailerLengthFt, setTrailerLengthFt] = useState<number | null>(null);
  const [trailerHeightIn, setTrailerHeightIn] = useState<number | null>(null);
  const [trailerLengthIn, setTrailerLengthIn] = useState<number | null>(null);

  const [openingDirection, setOpeningDirection] = useState<"driver" | "passenger" | null>(null);
  const [nvisPdfPath, setNvisPdfPath] = useState<string | null>(null);

  const [isTakenNumber, setIsTakenNumber] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);

  const {
    data: bleacher,
    isLoading: bleacherLoading,
    error: bleacherError,
  } = useBleacherQuery(editBleacherNumber);

  const { data: homeBases = [], isLoading: homeBasesLoading } = useQuery({
    queryKey: ["home-bases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("HomeBases")
        .select("id, home_base_name")
        .order("home_base_name");
      if (error) throw error;
      return data as HomeBase[];
    },
    enabled: !!supabase,
  });

  useEffect(() => {
    if (bleacher) {
      setBleacherNumber(bleacher.bleacher_number);
      setId(bleacher.id);
      setRows(bleacher.bleacher_rows);
      setSeats(bleacher.bleacher_seats);
      setIsDeleted(bleacher.deleted);
      setSelectedSummerHomeBaseUuid(bleacher.summer_home_base_uuid);
      setSelectedWinterHomeBaseUuid(bleacher.winter_home_base_uuid);
      setSelectedLinxupDeviceId(bleacher.linxup_device_id ?? null);
      setSummerAccountManagerUuid(bleacher.summer_account_manager_uuid ?? null);
      setWinterAccountManagerUuid(bleacher.winter_account_manager_uuid ?? null);
      setHitchType(bleacher.hitch_type ?? null);
      setVinNumber(bleacher.vin_number ?? null);
      setTagNumber(bleacher.tag_number ?? null);
      setManufacturer(bleacher.manufacturer ?? null);
      setGvwr(bleacher.gvwr ?? null);
      const h = inchesToFeetAndInches(bleacher.trailer_height_in ?? null);
      setTrailerHeightFt(h.feet || null);
      setTrailerHeightIn(h.inches || null);

      const l = inchesToFeetAndInches(bleacher.trailer_length_in ?? null);
      setTrailerLengthFt(l.feet || null);
      setTrailerLengthIn(l.inches || null);
      setOpeningDirection(bleacher.opening_direction ?? null);
      setNvisPdfPath(bleacher.nvis_pdf_path ?? null);
    } else if (bleacherError) {
      toast.error("Bleacher not found");
    }
  }, [bleacher, bleacherError]);

  useEffect(() => {
    if (!editBleacherNumber) {
      setBleacherNumber(null);
      setId(null);
      setRows(null);
      setSeats(null);
      setSelectedSummerHomeBaseUuid(null);
      setSelectedWinterHomeBaseUuid(null);
      setSelectedLinxupDeviceId(null);
      setSummerAccountManagerUuid(null);
      setWinterAccountManagerUuid(null);
      setHitchType(null);
      setVinNumber(null);
      setTagNumber(null);
      setManufacturer(null);
      setGvwr(null);
      setTrailerHeightFt(null);
      setTrailerHeightIn(null);
      setTrailerLengthFt(null);
      setTrailerLengthIn(null);
      setOpeningDirection(null);
      setNvisPdfPath(null);
    }
  }, [editBleacherNumber]);

  const { data: takenNumbers = [], isLoading } = useQuery({
    queryKey: ["taken-bleacher-numbers", editBleacherNumber],
    queryFn: () =>
      fetchTakenBleacherNumbers(
        supabase,
        editBleacherNumber ? Number(editBleacherNumber) : undefined,
      ),
    enabled: !!supabase && !!editBleacherNumber,
  });

  useEffect(() => {
    if (bleacherNumber) {
      setIsTakenNumber(takenNumbers.includes(bleacherNumber));
    }
  }, [bleacherNumber, takenNumbers]);

  const handleSave = async () => {
    console.log("nvisPdfPath at save time:", nvisPdfPath); // 👈 add this
    console.log("id:", id);
    if (
      !checkInsertBleacherFormRules(
        {
          bleacher_number: bleacherNumber,
          bleacher_rows: rows,
          bleacher_seats: seats,
          summer_home_base_uuid: selectedSummerHomeBaseUuid,
          winter_home_base_uuid: selectedWinterHomeBaseUuid,
        },
        takenNumbers,
      )
    ) {
      throw new Error("Event form validation failed");
    } else {
      await updateBleacher(
        {
          id: id!,
          bleacher_number: bleacherNumber!,
          bleacher_rows: rows!,
          bleacher_seats: seats!,
          summer_home_base_uuid: selectedSummerHomeBaseUuid!,
          winter_home_base_uuid: selectedWinterHomeBaseUuid!,
          linxup_device_id: selectedLinxupDeviceId,
          summer_account_manager_uuid: summerAccountManagerUuid,
          winter_account_manager_uuid: winterAccountManagerUuid,
          hitch_type: hitchType,
          vin_number: vinNumber,
          tag_number: tagNumber,
          manufacturer: manufacturer,
          gvwr: gvwr,
          trailer_height_in: feetAndInchesToInches(trailerHeightFt, trailerHeightIn),
          trailer_length_in: feetAndInchesToInches(trailerLengthFt, trailerLengthIn),
          opening_direction: openingDirection,
          nvis_pdf_path: nvisPdfPath,
        },
        supabase,
        queryClient,
      );
      router.push("/assets/bleachers");
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    const { error } = await supabase.from("Bleachers").update({ deleted: true }).eq("id", id);
    if (error) {
      toast.error("Failed to delete bleacher: " + error.message);
      return;
    }
    toast.success("Bleacher deleted");
    if (queryClient) {
      await queryClient.invalidateQueries({ queryKey: ["bleachers"] });
      await queryClient.invalidateQueries({ queryKey: ["bleachers-with-assignments"] });
      await queryClient.invalidateQueries({ queryKey: ["bleacher"] });
    }
    router.push("/assets/bleachers");
  };

  const handleRestore = async () => {
    if (!id) return;
    const { error } = await supabase.from("Bleachers").update({ deleted: false }).eq("id", id);
    if (error) {
      toast.error("Failed to restore bleacher: " + error.message);
      return;
    }
    toast.success("Bleacher restored");
    if (queryClient) {
      await queryClient.invalidateQueries({ queryKey: ["bleachers"] });
      await queryClient.invalidateQueries({ queryKey: ["bleachers-with-assignments"] });
      await queryClient.invalidateQueries({ queryKey: ["bleacher"] });
    }
    router.push("/assets/bleachers");
  };

  //   if (!bleachersLoaded) return <LoadingSpinner />;

  return (
    <>
      {editBleacherNumber && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={() => router.push("/assets/bleachers")}
          />

          {/* Sheet */}
          <div className="fixed inset-y-0 right-0 w-full sm:max-w-sm bg-white shadow-xl flex flex-col animate-in slide-in-from-right">
            {/* Header */}
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold">Update a Bleacher</h2>
              <p className="text-sm text-gray-500">
                Fill out the form and click 'Save Changes' to lock in your changes bleacher.
              </p>
            </div>

            {isDeleted && (
              <div className="mx-6 mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 font-medium">
                This bleacher has been deleted. Click &quot;Restore&quot; to recover it.
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-5 items-center gap-4">
                  <label htmlFor="name" className="text-right text-sm font-medium col-span-2">
                    Bleacher Number
                  </label>
                  <div className="col-span-2">
                    <div className="relative">
                      <input
                        id="name"
                        type="number"
                        value={bleacherNumber ?? ""}
                        onChange={(e) => setBleacherNumber(Number(e.target.value))}
                        className={`w-full px-3 py-2 border rounded-md text-sm font-medium ${
                          isTakenNumber
                            ? "border-red-700 focus:ring-red-700"
                            : "text-gray-700 focus:ring-greenAccent focus:border-0"
                        } focus:outline-none focus:ring-2`}
                      />
                      <div className="absolute -right-10 top-1/2 transform -translate-y-1/2">
                        {isTakenNumber ? (
                          <CircleAlert className="text-red-700" />
                        ) : isLoading ? (
                          <LoaderCircle className="text-blue-700 animate-spin" />
                        ) : (
                          <CheckCheck className="text-green-700" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-5 items-center gap-4">
                  <label htmlFor="name" className="text-right text-sm font-medium col-span-2">
                    Seats
                  </label>
                  <input
                    id="name"
                    type="number"
                    value={seats ?? ""}
                    onChange={(e) => setSeats(Number(e.target.value))}
                    className="col-span-3 px-3 py-2 border rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                  />
                </div>
                <div className="grid grid-cols-5 items-center gap-4">
                  <label htmlFor="name" className="text-right text-sm font-medium col-span-2">
                    Rows
                  </label>
                  <SelectRowsDropDown
                    onSelect={(e) => setRows(Number(e))}
                    value={rows ?? undefined}
                  />
                </div>
                <div className="grid grid-cols-5 items-center gap-4">
                  <label htmlFor="name" className="text-right text-sm font-medium col-span-2">
                    Home Base
                  </label>
                  <SelectHomeBaseDropDown
                    options={homeBases ?? []}
                    onSelect={(e) => setSelectedSummerHomeBaseUuid(e.id)}
                    placeholder="Select Home Base"
                    value={selectedSummerHomeBaseUuid ?? undefined}
                  />
                </div>
                <div className="grid grid-cols-5 items-center gap-4">
                  <label htmlFor="name" className="text-right text-sm font-medium col-span-2">
                    Winter Home Base
                  </label>
                  <SelectHomeBaseDropDown
                    options={homeBases ?? []}
                    onSelect={(e) => setSelectedWinterHomeBaseUuid(e.id)}
                    placeholder="Select Home Base"
                    value={selectedWinterHomeBaseUuid ?? undefined}
                  />
                </div>
                <div className="grid grid-cols-5 items-center gap-4">
                  <label htmlFor="name" className="text-right text-sm font-medium col-span-2">
                    Linxup Device
                  </label>
                  <SelectLinxupDeviceDropDown
                    onSelect={(deviceId) => setSelectedLinxupDeviceId(deviceId)}
                    placeholder="Select Device (Optional)"
                    value={selectedLinxupDeviceId ?? null}
                  />
                </div>
                <div className="grid grid-cols-5 items-center gap-4">
                  <label htmlFor="name" className="text-right text-sm font-medium col-span-2">
                    Summer Account Manager
                  </label>
                  <div className="col-span-3">
                    <SelectAccountManager
                      value={summerAccountManagerUuid}
                      onChange={(value) => setSummerAccountManagerUuid(value)}
                      placeholder="Select Account Manager..."
                    />
                  </div>
                </div>
                <div className="grid grid-cols-5 items-center gap-4">
                  <label htmlFor="name" className="text-right text-sm font-medium col-span-2">
                    Winter Account Manager
                  </label>
                  <div className="col-span-3">
                    <SelectAccountManager
                      value={winterAccountManagerUuid}
                      onChange={(value) => setWinterAccountManagerUuid(value)}
                      placeholder="Select Account Manager..."
                    />
                  </div>
                </div>
                <div className="grid grid-cols-5 items-center gap-4">
                  <label className="text-right text-sm font-medium col-span-2">Manufacturer</label>
                  <input
                    type="text"
                    value={manufacturer ?? ""}
                    onChange={(e) => setManufacturer(e.target.value || null)}
                    className="col-span-3 px-3 py-2 border rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                  />
                </div>
                <div className="grid grid-cols-5 items-center gap-4">
                  <label className="text-right text-sm font-medium col-span-2">VIN Number</label>
                  <input
                    type="text"
                    value={vinNumber ?? ""}
                    onChange={(e) => setVinNumber(e.target.value || null)}
                    className="col-span-3 px-3 py-2 border rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                  />
                </div>
                <div className="grid grid-cols-5 items-center gap-4">
                  <label className="text-right text-sm font-medium col-span-2">Tag Number</label>
                  <input
                    type="text"
                    value={tagNumber ?? ""}
                    onChange={(e) => setTagNumber(e.target.value || null)}
                    className="col-span-3 px-3 py-2 border rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                  />
                </div>
                <div className="grid grid-cols-5 items-center gap-4">
                  <label className="text-right text-sm font-medium col-span-2">Hitch Type</label>
                  <input
                    type="text"
                    value={hitchType ?? ""}
                    onChange={(e) => setHitchType(e.target.value || null)}
                    className="col-span-3 px-3 py-2 border rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                  />
                </div>
                {/* Trailer Height */}
                <div className="grid grid-cols-5 items-center gap-4">
                  <label className="text-right text-sm font-medium col-span-2">
                    Trailer Height
                  </label>
                  <div className="col-span-3 flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min={0}
                        placeholder="ft"
                        value={trailerHeightFt ?? ""}
                        onChange={(e) =>
                          setTrailerHeightFt(e.target.value ? Number(e.target.value) : null)
                        }
                        className="w-full px-3 py-2 border rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                        ft
                      </span>
                    </div>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min={0}
                        max={11}
                        placeholder="in"
                        value={trailerHeightIn ?? ""}
                        onChange={(e) =>
                          setTrailerHeightIn(e.target.value ? Number(e.target.value) : null)
                        }
                        className="w-full px-3 py-2 border rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                        in
                      </span>
                    </div>
                  </div>
                </div>

                {/* Trailer Length */}
                <div className="grid grid-cols-5 items-center gap-4">
                  <label className="text-right text-sm font-medium col-span-2">
                    Trailer Length
                  </label>
                  <div className="col-span-3 flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min={0}
                        placeholder="ft"
                        value={trailerLengthFt ?? ""}
                        onChange={(e) =>
                          setTrailerLengthFt(e.target.value ? Number(e.target.value) : null)
                        }
                        className="w-full px-3 py-2 border rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                        ft
                      </span>
                    </div>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min={0}
                        max={11}
                        placeholder="in"
                        value={trailerLengthIn ?? ""}
                        onChange={(e) =>
                          setTrailerLengthIn(e.target.value ? Number(e.target.value) : null)
                        }
                        className="w-full px-3 py-2 border rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                        in
                      </span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-5 items-center gap-4">
                  <label className="text-right text-sm font-medium col-span-2">
                    Opening Direction
                  </label>
                  <select
                    value={openingDirection ?? ""}
                    onChange={(e) =>
                      setOpeningDirection((e.target.value || null) as "driver" | "passenger" | null)
                    }
                    className="col-span-3 px-3 py-2 border rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                  >
                    <option value="">Select direction</option>
                    <option value="driver">Driver</option>
                    <option value="passenger">Passenger</option>
                  </select>
                </div>
                <div className="grid grid-cols-5 items-center gap-4">
                  <label className="text-right text-sm font-medium col-span-2">GVWR (lbs)</label>
                  <input
                    type="number"
                    value={gvwr ?? ""}
                    onChange={(e) => setGvwr(e.target.value ? Number(e.target.value) : null)}
                    className="col-span-3 px-3 py-2 border rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                  />
                </div>

                {/* NVIS PDF Upload */}
                <div className="grid grid-cols-5 items-start gap-4">
                  <label className="text-right text-sm font-medium col-span-2 pt-2">NVIS PDF</label>
                  <div className="col-span-3">
                    <FileUploadInput
                      label=""
                      bucket="bleacher-nvis"
                      storagePath={`bleacher-${bleacherNumber ?? "unknown"}/nvis-${Date.now()}`}
                      value={nvisPdfPath}
                      onChange={setNvisPdfPath}
                      acceptedTypes={["application/pdf"]}
                      maxSizeMB={10}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t flex justify-between">
              {isDeleted ? (
                <button
                  type="button"
                  onClick={handleRestore}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors cursor-pointer flex items-center gap-2"
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              )}
              <Link
                href={`/damage-reports?bleacher_uuid=${id}`}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 transition-colors cursor-pointer flex items-center gap-2 text-sm"
              >
                <ShieldAlert className="h-4 w-4" />
                Damage Reports
              </Link>
              <button
                type="submit"
                onClick={handleSave}
                className="px-4 py-2 bg-darkBlue text-white rounded-md hover:bg-lightBlue transition-colors cursor-pointer"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bleacher #{bleacherNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the bleacher from all lists and the dashboard. This action can be
              undone by a database administrator.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
