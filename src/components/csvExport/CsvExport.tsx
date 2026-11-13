"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { PrimaryButton } from "@/components/PrimaryButton";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { csvFilename, downloadCsv } from "@/lib/csv";

/**
 * One Export to CSV button for a page whose tabs each show a different table.
 *
 * The rows a table shows (searched, sorted, filtered) live inside that table's own component, so the
 * page cannot build the file itself. Instead the table that is on screen registers what its file
 * would be (`useRegisterCsvExport`), and the page's button (`ExportCsvButton`) downloads it. Only
 * the open tab is mounted, so whatever is registered is always the table the person is looking at;
 * a tab that closes takes its registration with it.
 */

export type CsvExportSpec = {
  /** The start of the file name; the day is added when the file is made (`csvFilename`). */
  filenamePrefix: string;
  /** True while the table loads or has no rows, when there is nothing to export. */
  disabled: boolean;
  /** The file's text. Async for a table that has to read its rows first. */
  getCsv: () => string | Promise<string>;
};

/** What the button does when clicked. Throws when the rows cannot be read; nothing is downloaded. */
export async function runCsvExport(
  spec: CsvExportSpec,
  { download = downloadCsv, now = new Date() }: { download?: typeof downloadCsv; now?: Date } = {},
): Promise<void> {
  if (spec.disabled) return;
  const csv = await spec.getCsv();
  download(csvFilename(spec.filenamePrefix, now), csv);
}

// Two contexts, so a table that only registers does not draw again each time the registration
// changes: the setter never changes, the registered spec does.
const RegisterContext = createContext<((spec: CsvExportSpec | null) => void) | null>(null);
const SpecContext = createContext<CsvExportSpec | null>(null);

export function CsvExportProvider({ children }: { children: ReactNode }) {
  const [spec, setSpec] = useState<CsvExportSpec | null>(null);
  return (
    <RegisterContext.Provider value={setSpec}>
      <SpecContext.Provider value={spec}>{children}</SpecContext.Provider>
    </RegisterContext.Provider>
  );
}

/**
 * Called by the table on screen. `getCsv` must be stable (a `useCallback` on the rows it builds
 * from), or the table registers again on every render. Does nothing outside a `CsvExportProvider`,
 * so a table can be drawn on its own.
 */
export function useRegisterCsvExport(
  filenamePrefix: string,
  getCsv: CsvExportSpec["getCsv"],
  disabled: boolean,
): void {
  const register = useContext(RegisterContext);
  useEffect(() => {
    if (!register) return;
    register({ filenamePrefix, getCsv, disabled });
    return () => register(null);
  }, [register, filenamePrefix, getCsv, disabled]);
}

export function ExportCsvButton() {
  const spec = useContext(SpecContext);
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (!spec || busy) return;
    setBusy(true);
    try {
      await runCsvExport(spec);
    } catch (error) {
      createErrorToastNoThrow([(error as Error).message || "Could not export the list."]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PrimaryButton
      type="button"
      onClick={handleClick}
      disabled={!spec || spec.disabled}
      loading={busy}
      loadingText="Exporting..."
    >
      <Download className="size-4" />
      Export to CSV
    </PrimaryButton>
  );
}
