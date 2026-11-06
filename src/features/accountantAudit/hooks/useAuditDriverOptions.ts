"use client";

import { useMemo } from "react";
import { useDrivers } from "@/features/workTrackers/hooks/useDrivers.db";
import { toAuditDriverOptions, type AuditDriverOption } from "../utils/auditDrivers";

/** Every driver (deactivated ones too, all zones), alphabetical. Called once, by AuditTab. */
export function useAuditDriverOptions(): { options: AuditDriverOption[]; isLoading: boolean } {
  const { data, isLoading } = useDrivers({ showAll: true, includeInactive: true });
  const options = useMemo(() => toAuditDriverOptions(data ?? []), [data]);
  return { options, isLoading };
}
