import type { VenueAddressFields } from "@/features/venues/types";

/**
 * An address as one line, the way it is pasted into a map search or an email:
 * "195226 Allen Street, Springfield, IL 62701". Missing parts are left out rather than
 * leaving stray commas.
 */
export function formatAddressForCopy(
  address: Pick<VenueAddressFields, "street" | "city" | "stateProvince" | "zipPostal">,
): string {
  const stateAndZip = [address.stateProvince, address.zipPostal]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");

  return [address.street, address.city, stateAndZip]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}
