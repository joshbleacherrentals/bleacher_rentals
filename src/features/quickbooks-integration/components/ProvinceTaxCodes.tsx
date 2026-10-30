"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { CANADIAN_PROVINCES } from "@/features/quotesAndBookings/utils/canadianTaxRates";
import { fetchProvinceTaxCodes, setProvinceTaxCodeApi, type QboTaxCode } from "../api";

const NONE_LABEL = "— none —";

type ProvinceTaxCodesProps = {
  connectionId: string;
  /** The connection's QuickBooks tax codes; undefined until the page has loaded them. */
  taxCodes: QboTaxCode[] | undefined;
};

/**
 * The QuickBooks tax code of each Canadian province, for one connection: the Canadian file applies
 * whichever code the invoice carries, so each province needs its own
 * (docs/specs/qbo-invoice-03a-province-tax-codes.md). A change is saved at once.
 */
export function ProvinceTaxCodes({ connectionId, taxCodes }: ProvinceTaxCodesProps) {
  const queryClient = useQueryClient();
  const queryKey = ["province-tax-codes", connectionId];
  const { data: stored = [] } = useQuery({
    queryKey,
    queryFn: () => fetchProvinceTaxCodes(connectionId),
  });
  // What was picked since the page loaded. It wins over the stored row, so a pick shows at once and
  // a failed save can put the old value back.
  const [chosen, setChosen] = useState<Record<string, string>>({});

  const valueOf = (code: string) =>
    chosen[code] ?? stored.find((row) => row.province === code)?.qbo_tax_code_id ?? "";

  const handleChange = async (code: string, name: string, taxCodeId: string) => {
    const previous = valueOf(code);
    setChosen((prev) => ({ ...prev, [code]: taxCodeId }));
    try {
      await setProvinceTaxCodeApi(connectionId, code, taxCodeId || null);
    } catch (error) {
      setChosen((prev) => ({ ...prev, [code]: previous }));
      createErrorToastNoThrow([`Failed to update the tax code for ${name}`, String(error)]);
      return;
    }
    await queryClient.invalidateQueries({ queryKey });
  };

  return (
    <details className="mt-2">
      <summary className="cursor-pointer select-none text-xs text-gray-400">
        Tax code per Canadian province
      </summary>
      <div className="mt-2 space-y-1">
        {Object.entries(CANADIAN_PROVINCES).map(([code, info]) => {
          const value = valueOf(code);
          return (
            <div
              key={code}
              data-testid={`province-row-${code}`}
              className="flex items-center gap-2"
            >
              <span className="w-44 shrink-0 text-xs text-gray-700">{info.name}</span>
              <span className="w-56 shrink-0 text-xs text-gray-400">
                {info.taxPercent}% ({info.label})
              </span>
              {taxCodes ? (
                <select
                  value={value}
                  onChange={(e) => handleChange(code, info.name, e.target.value)}
                  className="rounded border border-gray-300 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-greenAccent"
                >
                  <option value="">{NONE_LABEL}</option>
                  {taxCodes.map((tc) => (
                    <option key={tc.id} value={tc.id}>
                      {tc.name}
                    </option>
                  ))}
                  {/* A code deleted in QuickBooks later: the stored id stays visible. */}
                  {value && !taxCodes.some((tc) => tc.id === value) && (
                    <option value={value}>{value}</option>
                  )}
                </select>
              ) : (
                <span className="text-xs italic text-gray-400">{value || NONE_LABEL}</span>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}
