import { parseQboApiResponseText } from "../parseQboApiResponse";
import { getBaseUrl, getQboAccessTokenAndRealmId } from "../util";
import type { ClassPlacement } from "./invoiceTypes";

/**
 * Asks QuickBooks where the company wants the Class of a transaction: on each line, on the whole
 * transaction (the invoice's own Class field), or nowhere because it tracks no Classes. It is the
 * company's own Class-tracking setting, read on every call: nothing is stored and nothing is kept
 * between calls. Server-only.
 * Spec: docs/specs/qbo-invoice-03f-canadian-class-on-header.md §4
 */

const MINOR_VERSION = 40;

type RawPreferences = {
  Preferences?: {
    AccountingInfoPrefs?: {
      ClassTrackingPerTxn?: unknown;
      ClassTrackingPerTxnLine?: unknown;
    };
  };
  Fault?: { Error?: Array<{ Message?: string; Detail?: string }> };
  error?: string;
};

const failed = (reason: string | number) =>
  new Error(`QuickBooks preferences read failed: ${reason}`);

/**
 * The placement of the connection's company. A refusal, a lost token or a request that cannot be
 * made throws, and so does an answer that cannot be used: no preferences, no accounting settings, or
 * both Class settings on (QuickBooks allows only one). A setting absent from an otherwise normal
 * answer counts as off.
 */
export async function readClassPlacement(connectionId: string): Promise<ClassPlacement> {
  const { accessToken, realmId } = await getQboAccessTokenAndRealmId(connectionId);

  const response = await fetch(
    `${getBaseUrl()}/${realmId}/preferences?minorversion=${MINOR_VERSION}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  const data = parseQboApiResponseText(await response.text(), response.status) as RawPreferences;

  if (!response.ok) {
    const fault = data.Fault?.Error?.[0];
    throw failed(fault?.Detail ?? fault?.Message ?? data.error ?? response.status);
  }

  const preferences = data.Preferences;
  if (!preferences) throw failed("the answer carried no preferences.");
  const accounting = preferences.AccountingInfoPrefs;
  if (!accounting) throw failed("the answer carried no accounting settings.");

  const perTransaction = accounting.ClassTrackingPerTxn === true;
  const perLine = accounting.ClassTrackingPerTxnLine === true;
  if (perTransaction && perLine) {
    throw failed("QuickBooks reports Class tracking on both the invoice and its lines.");
  }
  if (perTransaction) return "header";
  if (perLine) return "line";
  return "none";
}
