"use client";

import { Check, Pencil, X } from "lucide-react";
import type { RequirementResult } from "../utils/addressCheck";
import { GRID_LINES as LINES } from "./DriverWeekGrid";

/** A check or a red X, the mark every data check uses. */
export function Mark({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <Check className="h-4 w-4 shrink-0 text-green-600" aria-label={label} />
  ) : (
    <X className="h-4 w-4 shrink-0 text-red-600" aria-label={label} />
  );
}

/** One requirement for one row: the mark and what is missing; a button when it can be fixed. */
export function RequirementCell({
  result,
  onFix,
  testId,
  label,
}: {
  result: RequirementResult;
  testId?: string;
  /** What is being checked, e.g. the address line; shown above what is missing. */
  label?: string;
  /** Opens the fix for this requirement; absent when it has none or the user may not fix it. */
  onFix?: () => void;
}) {
  const className = `flex min-h-12 w-full items-center gap-2 px-2 text-left text-sm ${LINES} ${
    result.ok ? "" : "bg-red-50 text-red-700"
  }`;
  const content = (
    <>
      <Mark ok={result.ok} label={result.ok ? "Complete" : "Incomplete"} />
      {label ? (
        <span className="min-w-0">
          <span className={`block truncate ${result.ok ? "" : "text-gray-800"}`}>{label}</span>
          {result.problem && <span className="block text-xs">{result.problem}</span>}
        </span>
      ) : (
        result.problem && <span>{result.problem}</span>
      )}
      {onFix && <Pencil className="ml-auto h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />}
    </>
  );
  return onFix ? (
    <button
      type="button"
      className={`${className} cursor-pointer ${result.ok ? "hover:bg-gray-50" : "hover:bg-red-100"}`}
      onClick={onFix}
      data-testid={testId}
      data-ok={result.ok}
    >
      {content}
    </button>
  ) : (
    <div className={className} data-testid={testId} data-ok={result.ok}>
      {content}
    </div>
  );
}
