"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { parseQboApiResponse } from "@/features/quickbooks-integration/parseQboApiResponse";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { DateTime } from "luxon";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useQueryClient } from "@tanstack/react-query";

type CreateBillModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (billId: string) => void;
  driverUuid: string;
  driverName: string;
  startDate: string;
};

type WorkTrackerData = {
  id: string;
  pay_cents: number | null;
  date: string | null;
};

export function CreateBillModal({
  isOpen,
  onClose,
  onSuccess,
  driverUuid,
  driverName,
  startDate,
}: CreateBillModalProps) {
  const supabase = useClerkSupabaseClient();
  const queryClient = useQueryClient();
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isCreatingBill, setIsCreatingBill] = useState(false);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [tripCount, setTripCount] = useState<number>(0);
  const [vendorName, setVendorName] = useState<string>("");
  const [hasVendor, setHasVendor] = useState<boolean>(true);
  const [vendorLinkedToQbo, setVendorLinkedToQbo] = useState<boolean>(true);
  const [workTrackerGroupId, setWorkTrackerGroupId] = useState<string | null>(null);

  // Format the date range for display
  const startDateObj = DateTime.fromISO(startDate);
  const endDateObj = startDateObj.plus({ days: 6 });
  const dateRange = `${startDateObj.toFormat("MMM dd")} - ${endDateObj.toFormat("MMM dd, yyyy")}`;
  const billNumber = `${startDateObj.toFormat("MM/dd")}-${endDateObj.toFormat("MM/dd")}`;

  // Fetch work trackers and calculate total when modal opens
  useEffect(() => {
    if (!isOpen) return;

    async function fetchData() {
      setIsLoadingData(true);
      try {
        const endDate = DateTime.fromISO(startDate).plus({ days: 7 }).toISODate();

        // Fetch driver with vendor info
        const { data: driver, error: driverError } = await supabase
          .from("Drivers")
          .select(
            `
            id,
            vendor_uuid,
            vendor:Vendors(display_name, qbo_vendor_id)
          `,
          )
          .eq("id", driverUuid)
          .single();

        if (driverError) {
          throw new Error(`Failed to fetch driver: ${driverError.message}`);
        }

        // Check vendor status
        if (!driver.vendor_uuid || !driver.vendor) {
          setHasVendor(false);
        } else {
          const vendor = Array.isArray(driver.vendor) ? driver.vendor[0] : driver.vendor;
          setVendorName(vendor.display_name || "Unknown Vendor");

          if (!vendor.qbo_vendor_id) {
            setVendorLinkedToQbo(false);
          }
        }

        // Always fetch work trackers regardless of vendor status
        const { data: workTrackers, error: wtError } = await supabase
          .from("WorkTrackers")
          .select("id, pay_cents, date")
          .eq("driver_uuid", driverUuid)
          .gte("date", startDate)
          .lt("date", endDate);

        if (wtError) {
          throw new Error(`Failed to fetch work trackers: ${wtError.message}`);
        }

        const trackers = (workTrackers as WorkTrackerData[]) || [];
        const totalCents = trackers.reduce((sum, wt) => sum + (wt.pay_cents || 0), 0);

        setTotalAmount(totalCents / 100);
        setTripCount(trackers.length);

        // Find or create WorkTrackerGroup
        const weekStart = startDate;
        const weekEnd = DateTime.fromISO(startDate).plus({ days: 6 }).toISODate();

        const { data: existingGroup, error: groupFetchError } = await supabase
          .from("WorkTrackerGroups")
          .select("id, status")
          .eq("driver_uuid", driverUuid)
          .eq("week_start", weekStart)
          .eq("week_end", weekEnd!)
          .single();

        if (groupFetchError && groupFetchError.code !== "PGRST116") {
          // PGRST116 = no rows returned, which is fine
          throw new Error(`Failed to fetch work tracker group: ${groupFetchError.message}`);
        }

        if (existingGroup) {
          setWorkTrackerGroupId(existingGroup.id);
        } else {
          // Create new group
          const { data: newGroup, error: groupCreateError } = await supabase
            .from("WorkTrackerGroups")
            .insert({
              driver_uuid: driverUuid,
              week_start: weekStart,
              week_end: weekEnd!,
              status: "draft",
            })
            .select("id")
            .single();

          if (groupCreateError) {
            throw new Error(`Failed to create work tracker group: ${groupCreateError.message}`);
          }

          setWorkTrackerGroupId(newGroup.id);
        }
      } catch (error: any) {
        console.error("Error fetching data:", error);
        createErrorToastNoThrow(["Failed to load payment data", error.message]);
        onClose();
      } finally {
        setIsLoadingData(false);
      }
    }

    fetchData();
  }, [isOpen, driverUuid, startDate, supabase, onClose]);

  const handleConfirm = async () => {
    setIsCreatingBill(true);

    try {
      // Update WorkTrackerGroup status to qbo_bill_creating
      if (workTrackerGroupId) {
        const { error: updateError } = await supabase
          .from("WorkTrackerGroups")
          .update({ status: "qbo_bill_creating" })
          .eq("id", workTrackerGroupId);

        if (updateError) {
          console.error("Failed to update group status:", updateError);
        }
      }

      const response = await fetch("/api/quickbooks/create-bill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          driverUuid,
          startDate,
          workTrackerGroupId, // Pass the group ID to the API
        }),
      });

      const data = await parseQboApiResponse(response);

      if (!response.ok) {
        throw new Error((data.error as string) || "Failed to create bill");
      }

      // Invalidate the drivers query to refresh the list
      await queryClient.invalidateQueries({
        queryKey: ["drivers-for-week"],
        refetchType: "active",
      });

      // Show success toast
      createSuccessToast([
        `Bill created successfully!`,
        `${driverName} - $${totalAmount.toFixed(2)}`,
        `Bill #${billNumber}`,
      ]);

      // Call onSuccess with the bill ID and close
      onSuccess(data.billId as string);
      onClose();
    } catch (error: any) {
      console.error("Error creating bill:", error);
      createErrorToastNoThrow(["Failed to create bill in QuickBooks", error.message]);

      // Update status to error if we have a group ID
      if (workTrackerGroupId) {
        await supabase
          .from("WorkTrackerGroups")
          .update({ status: "qbo_bill_error" })
          .eq("id", workTrackerGroupId);
      }

      // Don't close modal on error - let user try again or close manually
    } finally {
      setIsCreatingBill(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ready For Payment?</DialogTitle>
        </DialogHeader>

        {isLoadingData ? (
          <div className="py-8 flex flex-col items-center gap-4">
            <LoadingSpinner />
            <p className="text-sm text-gray-500">Loading payment details...</p>
          </div>
        ) : !hasVendor ? (
          <div className="py-4">
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg mb-6">
              <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-900 mb-1">
                  Cannot Create Bill for Internal Drivers
                </h3>
                <p className="text-sm text-blue-800">
                  {driverName} is an internal driver without a vendor assignment. No QuickBooks bill
                  will be created, but you can still mark this week as ready for payment.
                </p>
              </div>
            </div>

            {/* Payment Summary for Internal Driver */}
            <div className="space-y-4 mb-6">
              <div className="flex justify-between items-center pb-3 border-b">
                <span className="text-sm text-gray-600">Driver</span>
                <span className="font-semibold">{driverName}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b">
                <span className="text-sm text-gray-600">Week</span>
                <span className="font-semibold">{dateRange}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b">
                <span className="text-sm text-gray-600">Trips</span>
                <span className="font-semibold">{tripCount}</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-base font-semibold text-gray-900">Total Amount</span>
                <span className="text-2xl font-bold text-greenAccent">
                  ${totalAmount.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={isCreatingBill}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  setIsCreatingBill(true);
                  try {
                    if (workTrackerGroupId) {
                      const { error: updateError } = await supabase
                        .from("WorkTrackerGroups")
                        .update({ status: "no_bill_ready_for_payment" })
                        .eq("id", workTrackerGroupId);

                      if (updateError) throw new Error(updateError.message);

                      await queryClient.invalidateQueries({
                        queryKey: ["drivers-for-week"],
                        refetchType: "active",
                      });

                      createSuccessToast([
                        `Marked as Ready for Payment!`,
                        `${driverName} - $${totalAmount.toFixed(2)}`,
                        `No QuickBooks bill created`,
                      ]);
                      onClose();
                    }
                  } catch (error: any) {
                    createErrorToastNoThrow(["Failed to update status", error.message]);
                  } finally {
                    setIsCreatingBill(false);
                  }
                }}
                disabled={isCreatingBill}
                className="bg-greenAccent hover:bg-greenAccent/90"
              >
                {isCreatingBill ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Mark as Ready for Payment"
                )}
              </Button>
            </div>
          </div>
        ) : !vendorLinkedToQbo ? (
          <div className="py-4">
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg mb-6">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-900 mb-1">
                  Vendor Not Linked to QuickBooks
                </h3>
                <p className="text-sm text-amber-700">
                  The vendor "{vendorName}" is not linked to a QuickBooks vendor. No QuickBooks bill
                  will be created, but you can still mark this week as ready for payment.
                </p>
              </div>
            </div>

            {/* Payment Summary for Unlinked Vendor */}
            <div className="space-y-4 mb-6">
              <div className="flex justify-between items-center pb-3 border-b">
                <span className="text-sm text-gray-600">Driver</span>
                <span className="font-semibold">{driverName}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b">
                <span className="text-sm text-gray-600">Vendor</span>
                <span className="font-semibold">{vendorName}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b">
                <span className="text-sm text-gray-600">Week</span>
                <span className="font-semibold">{dateRange}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b">
                <span className="text-sm text-gray-600">Trips</span>
                <span className="font-semibold">{tripCount}</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-base font-semibold text-gray-900">Total Amount</span>
                <span className="text-2xl font-bold text-greenAccent">
                  ${totalAmount.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={isCreatingBill}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  setIsCreatingBill(true);
                  try {
                    if (workTrackerGroupId) {
                      const { error: updateError } = await supabase
                        .from("WorkTrackerGroups")
                        .update({ status: "no_bill_ready_for_payment" })
                        .eq("id", workTrackerGroupId);

                      if (updateError) throw new Error(updateError.message);

                      await queryClient.invalidateQueries({
                        queryKey: ["drivers-for-week"],
                        refetchType: "active",
                      });

                      createSuccessToast([
                        `Marked as Ready for Payment!`,
                        `${driverName} - $${totalAmount.toFixed(2)}`,
                        `No QuickBooks bill created`,
                      ]);
                      onClose();
                    }
                  } catch (error: any) {
                    createErrorToastNoThrow(["Failed to update status", error.message]);
                  } finally {
                    setIsCreatingBill(false);
                  }
                }}
                disabled={isCreatingBill}
                className="bg-greenAccent hover:bg-greenAccent/90"
              >
                {isCreatingBill ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Mark as Ready for Payment"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="py-4">
            <div className="space-y-4 mb-6">
              {/* Driver Info */}
              <div className="flex justify-between items-center pb-3 border-b">
                <span className="text-sm text-gray-600">Driver</span>
                <span className="font-semibold">{driverName}</span>
              </div>

              {/* Vendor Info */}
              <div className="flex justify-between items-center pb-3 border-b">
                <span className="text-sm text-gray-600">Vendor</span>
                <span className="font-semibold">{vendorName}</span>
              </div>

              {/* Date Range */}
              <div className="flex justify-between items-center pb-3 border-b">
                <span className="text-sm text-gray-600">Week</span>
                <span className="font-semibold">{dateRange}</span>
              </div>

              {/* Bill Number */}
              <div className="flex justify-between items-center pb-3 border-b">
                <span className="text-sm text-gray-600">Bill Number</span>
                <span className="font-semibold">#{billNumber}</span>
              </div>

              {/* Trip Count */}
              <div className="flex justify-between items-center pb-3 border-b">
                <span className="text-sm text-gray-600">Trips</span>
                <span className="font-semibold">{tripCount}</span>
              </div>

              {/* Total Amount */}
              <div className="flex justify-between items-center pt-2">
                <span className="text-base font-semibold text-gray-900">Total Amount</span>
                <span className="text-2xl font-bold text-greenAccent">
                  ${totalAmount.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Warning Message */}
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg mb-6">
              <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-blue-900">
                  This will create a bill for <strong>${totalAmount.toFixed(2)}</strong> in
                  QuickBooks for Accounts Payable to fulfill. Please make sure the amount is
                  correct.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={isCreatingBill}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isCreatingBill}
                className="bg-greenAccent hover:bg-greenAccent/90"
              >
                {isCreatingBill ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating Bill...
                  </>
                ) : (
                  "Confirm & Create Bill"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
