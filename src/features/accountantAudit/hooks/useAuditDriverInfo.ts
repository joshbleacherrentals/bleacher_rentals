"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import {
  buildAuditDriverInfoQuery,
  toAuditDriverInfo,
  type AuditDriverInfo,
  type AuditDriverInfoRow,
} from "../db/auditDriverInfo";

export function useAuditDriverInfo(driverUuid: string | null): {
  info: AuditDriverInfo | null;
  isLoading: boolean;
} {
  const compiled = useMemo(() => buildAuditDriverInfoQuery(driverUuid).compile(), [driverUuid]);
  const { data, isLoading } = useTypedQuery(compiled, expect<AuditDriverInfoRow>());
  const info = useMemo(
    () => (driverUuid && data?.[0] ? toAuditDriverInfo(data[0]) : null),
    [driverUuid, data],
  );
  return { info, isLoading };
}
