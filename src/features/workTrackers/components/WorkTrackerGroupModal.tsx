"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, FileText, CheckCircle, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { parseQboApiResponse } from "@/features/quickbooks-integration/parseQboApiResponse";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { DateTime } from "luxon";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useQueryClient } from "@tanstack/react-query";
import { QboBillPreview } from "./QboBillPreview";
import { Database } from "../../../../database.types";

type WorkTrackerGroupModalProps = {
  isOpen: boolean;
  onClose: () => void;
  driverUuid: string;
  driverName: string;
  startDate: string;
  connectionId?: string;
  groupData?: {
    id: string;
    status: Database["public"]["Enums"]["worktracker_group_status"];
    qbo_bill_id: string | null;
  } | null;
};

type WorkTrackerData = {
  id: string;
  pay_cents: number | null;
  date: string | null;
};

export function WorkTrackerGroupModal({
  isOpen,
  onClose,
  driverUuid,
  driverName,
  startDate,
  connectionId,
  groupData,
}: WorkTrackerGroupModalProps) {
  const supabase = useClerkSupabaseClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [tripCount, setTripCount] = useState<number>(0);
  const [vendorName, setVendorName] = useState<string>("");
  const [hasVendor, setHasVendor] = useState<boolean>(true);
  const [vendorLinkedToQbo, setVendorLinkedToQbo] = useState<boolean>(true);
  const [driverTaxRate, setDriverTaxRate] = useState<number>(0);
  const [syncToken, setSyncToken] = useState<string | null>(null);
  const [userUuid, setUserUuid] = useState<string | null>(null);
  const [workTrackerGroupId, setWorkTrackerGroupId] = useState<string | null>(
    groupData?.id || null,
  );
  const [currentStatus, setCurrentStatus] = useState<
    Database["public"]["Enums"]["worktracker_group_status"]
  >(groupData?.status || "draft");

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
            user_uuid,
            vendor_uuid,
            tax_dec,
            vendor:Vendors(display_name, qbo_vendor_id)
          `,
          )
          .eq("id", driverUuid)
          .single();

        if (driverError) {
          throw new Error(`Failed to fetch driver: ${driverError.message}`);
        }

        // Store user_uuid for navigation
        setUserUuid(driver.user_uuid);
        setDriverTaxRate(driver.tax_dec ?? 0);

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

        // Find or create WorkTrackerGroup if not provided
        if (!workTrackerGroupId) {
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
            throw new Error(`Failed to fetch work tracker group: ${groupFetchError.message}`);
          }

          if (existingGroup) {
            setWorkTrackerGroupId(existingGroup.id);
            setCurrentStatus(existingGroup.status);
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
              .select("id, status")
              .single();

            if (groupCreateError) {
              throw new Error(`Failed to create work tracker group: ${groupCreateError.message}`);
            }

            setWorkTrackerGroupId(newGroup.id);
            setCurrentStatus(newGroup.status);
          }
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
  }, [isOpen, driverUuid, startDate, supabase, onClose, workTrackerGroupId]);

  const handleMarkAsReadyForPayment = async () => {
    setIsProcessing(true);
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

        setCurrentStatus("no_bill_ready_for_payment");
        createSuccessToast([
          `Marked as Ready for Payment!`,
          `${driverName} - $${totalAmount.toFixed(2)}`,
        ]);
      }
    } catch (error: any) {
      createErrorToastNoThrow(["Failed to update status", error.message]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkAsDraft = async () => {
    setIsProcessing(true);
    try {
      if (workTrackerGroupId) {
        const { error: updateError } = await supabase
          .from("WorkTrackerGroups")
          .update({ status: "draft" })
          .eq("id", workTrackerGroupId);

        if (updateError) throw new Error(updateError.message);

        await queryClient.invalidateQueries({
          queryKey: ["drivers-for-week"],
          refetchType: "active",
        });

        setCurrentStatus("draft");
        createSuccessToast(["Marked as Draft"]);
      }
    } catch (error: any) {
      createErrorToastNoThrow(["Failed to update status", error.message]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateBill = async () => {
    setIsProcessing(true);

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
        setCurrentStatus("qbo_bill_creating");
      }

      const response = await fetch("/api/quickbooks/create-bill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          driverUuid,
          startDate,
          workTrackerGroupId,
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
      await queryClient.invalidateQueries({
        queryKey: ["driver-with-meta"],
        refetchType: "active",
      });

      setCurrentStatus("qbo_bill_created");
      createSuccessToast([
        `Bill created successfully!`,
        `${driverName} - $${totalAmount.toFixed(2)}`,
        `Bill #${billNumber}`,
      ]);
    } catch (error: any) {
      console.error("Error creating bill:", error);
      createErrorToastNoThrow(["Failed to create bill in QuickBooks", error.message]);

      // Update status to error if we have a group ID
      if (workTrackerGroupId) {
        await supabase
          .from("WorkTrackerGroups")
          .update({ status: "qbo_bill_error" })
          .eq("id", workTrackerGroupId);
        setCurrentStatus("qbo_bill_error");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateBill = async () => {
    if (!groupData?.qbo_bill_id || !syncToken) return;
    setIsProcessing(true);
    try {
      const response = await fetch("/api/quickbooks/create-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverUuid,
          startDate,
          workTrackerGroupId,
          billId: groupData.qbo_bill_id,
          syncToken,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update bill");

      setSyncToken(null); // will be refreshed when QboBillPreview reloads
      await queryClient.invalidateQueries({
        queryKey: ["drivers-for-week"],
        refetchType: "active",
      });
      await queryClient.invalidateQueries({
        queryKey: ["driver-with-meta"],
        refetchType: "active",
      });
      createSuccessToast([
        `Bill updated successfully!`,
        `${driverName} - $${totalAmount.toFixed(2)}`,
      ]);
    } catch (error: any) {
      createErrorToastNoThrow(["Failed to update bill in QuickBooks", error.message]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Work Tracker Group - {driverName}</DialogTitle>
        </DialogHeader>

        {isLoadingData ? (
          <div className="py-8 flex flex-col items-center gap-4">
            <LoadingSpinner />
            <p className="text-sm text-gray-500">Loading details...</p>
          </div>
        ) : (
          <div className="py-4 space-y-6">
            {/* Show Bill Preview if bill created */}
            {currentStatus === "qbo_bill_created" && groupData?.qbo_bill_id && (
              <QboBillPreview
                billId={groupData.qbo_bill_id}
                connectionId={connectionId}
                taxRate={driverTaxRate}
                subtotal={totalAmount}
                onSyncToken={setSyncToken}
              />
            )}

            {/* Show Error Message if error */}
            {currentStatus === "qbo_bill_error" && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-red-900 mb-1">Bill Creation Failed</h3>
                  <p className="text-sm text-red-700 mb-3">
                    There was an error creating the QuickBooks bill. Please try again.
                  </p>
                  <Button
                    onClick={handleCreateBill}
                    disabled={isProcessing || !hasVendor || !vendorLinkedToQbo}
                    className="bg-red-600 hover:bg-red-700"
                    size="sm"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Retrying...
                      </>
                    ) : (
                      "Try Again"
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Payment Summary */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">Payment Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-gray-600">Driver</span>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{driverName}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700"
                      onClick={() => userUuid && router.push(`/team/${userUuid}/edit/driver`)}
                      disabled={!userUuid}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Edit Profile
                    </Button>
                  </div>
                </div>
                {hasVendor && (
                  <div>
                    <span className="text-sm text-gray-600">Vendor</span>
                    <p className="font-semibold">{vendorName}</p>
                  </div>
                )}
                <div>
                  <span className="text-sm text-gray-600">Week</span>
                  <p className="font-semibold">{dateRange}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Status</span>
                  <p className="font-semibold capitalize">{currentStatus.replace(/_/g, " ")}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Trips</span>
                  <p className="font-semibold">{tripCount}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Total Amount</span>
                  <p className="font-semibold text-greenAccent text-xl">
                    ${totalAmount.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Vendor Warnings */}
            {!hasVendor && (
              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900 mb-1">Internal Driver</h3>
                  <p className="text-sm text-blue-800">
                    No vendor assigned. QuickBooks bill cannot be created.
                  </p>
                </div>
              </div>
            )}

            {hasVendor && !vendorLinkedToQbo && (
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-amber-900 mb-1">Vendor Not Linked</h3>
                  <p className="text-sm text-amber-700">
                    "{vendorName}" is not linked to QuickBooks.
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between items-center pt-4 border-t gap-2">
              <div className="flex gap-2">
                {currentStatus !== "draft" && (
                  <Button
                    variant="outline"
                    onClick={handleMarkAsDraft}
                    disabled={isProcessing || currentStatus === "qbo_bill_creating"}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Mark as Draft
                  </Button>
                )}
                {currentStatus === "draft" && (
                  <Button
                    onClick={handleMarkAsReadyForPayment}
                    disabled={isProcessing}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Mark as Ready for Payment
                  </Button>
                )}
              </div>

              <div className="flex gap-2">
                {hasVendor && vendorLinkedToQbo && currentStatus !== "qbo_bill_created" && (
                  <Button
                    onClick={handleCreateBill}
                    disabled={isProcessing || currentStatus === "qbo_bill_creating"}
                    className="bg-greenAccent hover:bg-greenAccent/90"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating Bill...
                      </>
                    ) : (
                      "Create QuickBooks Bill"
                    )}
                  </Button>
                )}
                {hasVendor &&
                  vendorLinkedToQbo &&
                  currentStatus === "qbo_bill_created" &&
                  groupData?.qbo_bill_id && (
                    <Button
                      onClick={handleUpdateBill}
                      disabled={isProcessing || !syncToken}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Updating Bill...
                        </>
                      ) : (
                        "Update Bill"
                      )}
                    </Button>
                  )}
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
