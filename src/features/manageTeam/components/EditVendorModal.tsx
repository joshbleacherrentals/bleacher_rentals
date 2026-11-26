"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { fetchQboConnections } from "@/features/quickbooks-integration/api";
import { useQuery } from "@tanstack/react-query";
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
import { setVendorActive, submitVendor } from "../db/saveVendor";
import {
  emptyVendorForm,
  vendorFormFromRecord,
  vendorWindowMode,
  type EditVendorModalProps,
  type VendorAddress,
  type VendorFormValues,
} from "../utils/vendorForm";
import { VendorFormFields, VendorWindowFooter } from "./VendorFormFields";

export type { EditVendorModalProps } from "../utils/vendorForm";

const TITLES = {
  create: "Create New Vendor",
  edit: "Edit Vendor",
  deleted: "Deleted Vendor",
  "read-only": "Vendor",
} as const;

/**
 * The vendor window, used on the driver page and on the Vendors page. It has four modes, all
 * derived from the props (docs/specs/vendors-page.md §4.1): create, edit, deleted (locked, with
 * Restore) and read-only (locked, Close only, no QuickBooks block).
 */
export function EditVendorModal({
  isOpen,
  onClose,
  onSave,
  defaultType,
  existingVendor,
  readOnly,
}: EditVendorModalProps) {
  const supabase = useClerkSupabaseClient();
  const mode = vendorWindowMode({ existingVendor, readOnly });
  const locked = mode === "read-only" || mode === "deleted";
  const showQuickBooks = mode !== "read-only";

  const [values, setValues] = useState<VendorFormValues>(() => emptyVendorForm(defaultType));
  const [addressTouched, setAddressTouched] = useState(false);
  const [addressKey, setAddressKey] = useState(0);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoInputMethod, setLogoInputMethod] = useState<"upload" | "url">("upload");
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // The viewer's window has no QuickBooks block, and a viewer may not read the connections.
  const { data: qboConnections = [] } = useQuery({
    queryKey: ["qbo-connections"],
    queryFn: fetchQboConnections,
    enabled: showQuickBooks && isOpen,
  });

  // Initialize the form with the vendor being opened, or with an empty one.
  useEffect(() => {
    if (existingVendor) {
      setValues(vendorFormFromRecord(existingVendor));
      setLogoUrl(existingVendor.logoUrl);
      setLogoPreview(existingVendor.logoUrl);
    } else {
      setValues(emptyVendorForm(defaultType));
      setLogoUrl(null);
      setLogoPreview(null);
    }
    setLogoFile(null);
    setAddressTouched(false);
    setAddressKey((k) => k + 1);
  }, [existingVendor, defaultType, isOpen]);

  const change = (patch: Partial<VendorFormValues>) => setValues((v) => ({ ...v, ...patch }));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      createErrorToast(["Invalid file type", "Please upload a JPG, PNG, or WebP image"]);
      return;
    }

    // Validate file size (5MB)
    const maxSizeMB = 5;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      createErrorToast(["File too large", `File size must be less than ${maxSizeMB}MB`]);
      return;
    }

    setLogoFile(file);
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoUrl(null);
    setLogoPreview(null);
  };

  const handleAddressSelect = (address: VendorAddress) => {
    change({ address });
    setAddressTouched(true);
  };

  const handleAddressClear = () => {
    change({ address: null });
    setAddressTouched(true);
    setAddressKey((k) => k + 1);
  };

  const uploadLogo = async (file: File): Promise<string> => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `vendor-logos/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("vendor-logos")
      .upload(filePath, file);
    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from("vendor-logos").getPublicUrl(filePath);
    return publicUrl;
  };

  const handleSave = async (assignToDriver: boolean = false) => {
    setIsSaving(true);

    try {
      const outcome = await submitVendor({
        values,
        existing: existingVendor
          ? { id: existingVendor.id, addressUuid: existingVendor.addressUuid }
          : null,
        addressTouched,
        logoUrl: logoUrl || null,
        uploadLogo: logoFile ? () => uploadLogo(logoFile) : undefined,
      });

      if (outcome.status === "invalid") {
        createErrorToast([outcome.error.title, outcome.error.message]);
        return;
      }

      createSuccessToast([
        `Vendor "${values.displayName}" ${outcome.created ? "created" : "updated"} successfully`,
      ]);

      // "Save & Assign" assigns whatever the Type is (D10).
      if (assignToDriver && onSave) {
        onSave(outcome.id);
      }

      onClose();
    } catch (error) {
      console.error("Error saving vendor:", error);
      createErrorToast(["Failed to save vendor", String(error)]);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingVendor) return;

    try {
      await setVendorActive(existingVendor.id, false);
      createSuccessToast([`Vendor "${existingVendor.displayName}" deleted`]);
      onClose();
    } catch (error) {
      console.error("Error deleting vendor:", error);
      createErrorToast(["Failed to delete vendor", String(error)]);
    }
  };

  const handleRestore = async () => {
    if (!existingVendor) return;

    setIsSaving(true);
    try {
      await setVendorActive(existingVendor.id, true);
      createSuccessToast([`Vendor "${existingVendor.displayName}" restored`]);
      onClose();
    } catch (error) {
      console.error("Error restoring vendor:", error);
      createErrorToast(["Failed to restore vendor", String(error)]);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{TITLES[mode]}</DialogTitle>
          </DialogHeader>

          <div className="py-4">
            <VendorFormFields
              values={values}
              onChange={change}
              onAddressSelect={handleAddressSelect}
              onAddressClear={handleAddressClear}
              addressKey={addressKey}
              locked={locked}
              showQuickBooks={showQuickBooks}
              qboConnections={qboConnections}
              logo={{
                preview: logoPreview,
                url: logoUrl,
                method: logoInputMethod,
                onMethodChange: setLogoInputMethod,
                onFile: handleFileChange,
                onUrl: (url) => {
                  setLogoUrl(url);
                  setLogoPreview(url);
                  setLogoFile(null);
                },
                onRemove: handleRemoveLogo,
              }}
            />
          </div>

          <VendorWindowFooter
            mode={mode}
            canAssign={!!onSave}
            isSaving={isSaving}
            onDelete={() => setShowDeleteDialog(true)}
            onCancel={onClose}
            onSave={() => handleSave(false)}
            onSaveAndAssign={() => handleSave(true)}
            onRestore={handleRestore}
            onClose={onClose}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vendor?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{existingVendor?.displayName}&quot;? This
              won&apos;t remove the vendor from QuickBooks, but will hide it from this list. Drivers
              assigned to this vendor will keep their assignment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete Vendor
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
