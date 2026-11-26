import type { VendorStatus, VendorType } from "@/features/manageTeam/utils/vendorForm";

/**
 * The words a vendor is shown with, in the table, the filters and the vendor window
 * (docs/specs/vendors-page.md D1, D9, D18, D21). The database holds lowercase values; screens show
 * these.
 */

export const VENDOR_TYPE_LABELS: Record<VendorType, string> = {
  driver: "Driver",
  repairs: "Repairs",
};

/** The five statuses in the order of trust, which is the order every list of them uses. */
export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  verified: "Verified",
  caution: "Caution",
  under_review: "Under review",
  prospect: "Prospect",
  do_not_use: "Do not use",
};

/** The label of "no status" in the window's select and in the Status filter. */
export const NO_STATUS_LABEL = "No status";

/** The four yes/no services of a vendor: the `VendorRecord` key and the word on screen. */
export const VENDOR_SERVICES = [
  { key: "doesTrailerRepair", label: "Trailer repair" },
  { key: "doesAluminumWelding", label: "Aluminum welding" },
  { key: "doesMobileRepair", label: "Mobile repair" },
  { key: "isPartsSupplier", label: "Parts supplier" },
] as const;

export type VendorServiceKey = (typeof VENDOR_SERVICES)[number]["key"];
