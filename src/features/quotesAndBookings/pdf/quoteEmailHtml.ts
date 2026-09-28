import { QuoteDocumentData } from "./quoteDocumentData";
import { formatMoney } from "../utils/formatMoney";

function formatDate(d: string): string {
  if (!d) return "—";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Generates the HTML email body for a quote.
 * Styled inline for email client compatibility.
 */
export function buildQuoteEmailHtml(data: QuoteDocumentData): string {
  const { currency } = data;

  const lineItemsHtml = data.lineItems
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;">
          <strong>${item.label}</strong>
          ${item.description ? `<br><span style="color:#6b7280;font-size:12px;">${item.description}</span>` : ""}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:14px;">${item.qty}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:14px;">${formatMoney(item.unitPrice, currency)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:14px;font-weight:bold;">${formatMoney(item.total, currency)}</td>
      </tr>`,
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background-color:#10365a;padding:24px 32px;">
            <h1 style="margin:0;color:#ffffff;font-size:20px;">${data.company.name}</h1>
          </td>
        </tr>

        <!-- Main content -->
        <tr>
          <td style="padding:32px;">

            <p style="font-size:16px;color:#1f2937;margin:0 0 8px;">
              You've received a quote from <strong>${data.company.name}</strong>
            </p>
            <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">
              ${data.contractSignature ? "Invoice" : "Quote"} <strong>${data.quoteNumber}</strong> &middot; ${formatDate(data.quoteDate)}
            </p>

            <!-- Summary -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:6px;padding:16px;margin-bottom:24px;">
              <tr>
                <td style="padding:8px 16px;">
                  <span style="font-size:12px;color:#6b7280;text-transform:uppercase;">Event</span><br>
                  <strong style="font-size:14px;">${data.venue.name}</strong>
                </td>
                <td style="padding:8px 16px;">
                  <span style="font-size:12px;color:#6b7280;text-transform:uppercase;">Dates</span><br>
                  <strong style="font-size:14px;">${formatDate(data.dates.eventStart)} — ${formatDate(data.dates.eventEnd)}</strong>
                </td>
                <td style="padding:8px 16px;text-align:right;">
                  <span style="font-size:12px;color:#6b7280;text-transform:uppercase;">Total</span><br>
                  <strong style="font-size:18px;color:#10365a;">${formatMoney(data.totalCents, currency)}</strong>
                </td>
              </tr>
            </table>

            <!-- Line items -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr style="background-color:#10365a;">
                <td style="padding:8px 12px;color:#fff;font-size:12px;font-weight:bold;">Item</td>
                <td style="padding:8px 12px;color:#fff;font-size:12px;font-weight:bold;text-align:center;">Qty</td>
                <td style="padding:8px 12px;color:#fff;font-size:12px;font-weight:bold;text-align:right;">Price</td>
                <td style="padding:8px 12px;color:#fff;font-size:12px;font-weight:bold;text-align:right;">Total</td>
              </tr>
              ${lineItemsHtml}
            </table>

            <!-- Totals -->
            <table width="250" cellpadding="0" cellspacing="0" align="right" style="margin-bottom:24px;">
              <tr>
                <td style="padding:4px 0;font-size:14px;">Subtotal</td>
                <td style="padding:4px 0;font-size:14px;text-align:right;font-weight:bold;">${formatMoney(data.subtotalCents, currency)}</td>
              </tr>
              ${
                data.discountsCents !== 0 &&
                `<tr>
                <td style="padding:4px 0;font-size:14px;">Discounts</td>
                <td style="padding:4px 0;font-size:14px;text-align:right;font-weight:bold;color:#dc2626;">${formatMoney(data.discountsCents, currency)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font-size:14px;">Subtotal After Discount</td>
                <td style="padding:4px 0;font-size:14px;text-align:right;font-weight:bold;">${formatMoney(data.subtotalCents + data.discountsCents, currency)}</td>
              </tr>`
              }
              ${
                data.taxAmountCents !== 0 &&
                `<tr>
                <td style="padding:4px 0;font-size:14px;">Tax${data.taxPercent ? ` (${data.taxPercent}%)` : ""}</td>
                <td style="padding:4px 0;font-size:14px;text-align:right;font-weight:bold;">${formatMoney(data.taxAmountCents, currency)}</td>
              </tr>`
              }
              <tr>
                <td colspan="2" style="border-top:2px solid #10365a;padding-top:8px;"></td>
              </tr>
              <tr>
                <td style="padding:4px 0;font-size:18px;font-weight:bold;color:#10365a;">TOTAL</td>
                <td style="padding:4px 0;font-size:18px;text-align:right;font-weight:bold;color:#10365a;">${formatMoney(data.totalCents, currency)}</td>
              </tr>
            </table>

            <div style="clear:both;"></div>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0 16px;">
              <tr>
                <td align="center">
                  <a href="${data.publicUrl}" style="display:inline-block;background-color:#10365a;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:4px;font-size:16px;font-weight:bold;">
                    View Quote
                  </a>
                </td>
              </tr>
            </table>

            <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">
              A PDF copy is also attached to this email.
            </p>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
            <p style="font-size:12px;color:#9ca3af;margin:0;text-align:center;">
              ${data.company.name} &middot; ${data.quoteNumber}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
