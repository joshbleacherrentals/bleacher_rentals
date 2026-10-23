/**
 * The address of an invoice's page in the QuickBooks web app. The server builds it because only the
 * server knows `QBO_ENVIRONMENT`; the browser is redirected to it by the view route.
 * Spec: docs/specs/qbo-invoice-08-view-and-check.md §2 and §3
 */

const HOSTS = {
  production: "app.qbo.intuit.com",
  sandbox: "app.sandbox.qbo.intuit.com",
} as const;

/** Only the two known environments are accepted; any other value throws. */
export function qboInvoiceUrl(environment: string | undefined, qboInvoiceId: string): string {
  if (environment !== "production" && environment !== "sandbox") {
    throw new Error(`Unknown QuickBooks environment: ${JSON.stringify(environment)}`);
  }
  return `https://${HOSTS[environment]}/app/invoice?txnId=${encodeURIComponent(qboInvoiceId)}`;
}
