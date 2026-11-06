"use client";

import { SelectUserDropDown } from "@/components/SelectUserDropDown";
import type { AuditDriverOption } from "../utils/auditDrivers";

type Props = {
  options: AuditDriverOption[];
  isLoading: boolean;
  value: string | null;
  onChange: (id: string | null) => void;
};

/** The driver select of the Audit tab. docs/specs/accountant-audit-02-driver-select.md §3 (R1, R2, R4, D12) */
export function AuditDriverSelect({ options, isLoading, value, onChange }: Props) {
  return (
    <div className="w-[360px] max-w-full">
      <SelectUserDropDown<AuditDriverOption>
        options={options}
        value={value}
        onChange={onChange}
        placeholder="Choose driver"
        searchPlaceholder="Search drivers..."
        emptyMessage="No driver found."
        isLoading={isLoading}
        getOptionId={(d) => d.id}
        getSearchValue={(d) => `${d.firstName} ${d.lastName} ${d.email}`}
        renderOptionExtra={(d) =>
          d.isInactive ? (
            <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
              Inactive
            </span>
          ) : null
        }
      />
    </div>
  );
}
