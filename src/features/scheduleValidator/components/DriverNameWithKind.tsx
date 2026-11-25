"use client";

import type { ReactNode } from "react";
import type { DriverKind } from "../utils/driverKind";

/**
 * A driver's name with "(employee)" or "(contractor)" in small grey text right under it. A
 * contractor is paid through a vendor, named in the hover title.
 */
export function DriverNameWithKind({
  name,
  kind,
}: {
  name: ReactNode;
  kind: DriverKind | undefined;
}) {
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span>{name}</span>
      {kind && (
        <span
          className="text-[11px] font-normal text-gray-500"
          title={
            kind.kind === "contractor" && kind.vendorName ? `Vendor: ${kind.vendorName}` : undefined
          }
          data-testid="driver-kind"
          data-kind={kind.kind}
        >
          ({kind.kind})
        </span>
      )}
    </span>
  );
}
