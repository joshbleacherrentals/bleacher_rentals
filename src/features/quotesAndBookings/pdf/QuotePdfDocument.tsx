import { Page, Text, View, Document, StyleSheet } from "@react-pdf/renderer";
import { QuoteDocumentData } from "./quoteDocumentData";
import { ContractPdfPages } from "./ContractPdfPages";
import { formatQuoteDate, formatQuoteMoney } from "./quoteFormat";
import { quoteText, statusLabel } from "./quoteStrings";

const DARK_BLUE = "#10365a";
const LIGHT_GRAY = "#f3f4f6";
const BORDER_COLOR = "#e5e7eb";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 9,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
    color: "#1f2937",
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
    borderBottomWidth: 2,
    borderBottomColor: DARK_BLUE,
    paddingBottom: 12,
  },
  companyName: {
    fontSize: 18,
    fontWeight: "bold",
    color: DARK_BLUE,
  },
  quoteTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: DARK_BLUE,
    textAlign: "right",
  },
  quoteNumber: {
    fontSize: 9,
    color: "#6b7280",
    textAlign: "right",
    marginTop: 2,
  },

  // Info blocks
  infoRow: {
    flexDirection: "row",
    gap: 20,
    marginBottom: 16,
  },
  infoBlock: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 7,
    fontWeight: "bold",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 9,
    lineHeight: 1.4,
  },
  infoBold: {
    fontSize: 9,
    fontWeight: "bold",
  },

  // Dates
  datesRow: {
    flexDirection: "row",
    backgroundColor: LIGHT_GRAY,
    padding: 8,
    borderRadius: 4,
    marginBottom: 16,
    gap: 16,
  },
  dateItem: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 7,
    color: "#6b7280",
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  dateValue: {
    fontSize: 9,
    fontWeight: "bold",
    marginTop: 2,
  },

  // Table
  table: {
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: DARK_BLUE,
    borderRadius: 2,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableHeaderText: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "bold",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableRowAlt: {
    backgroundColor: "#fafafa",
  },
  cellItem: { flex: 3 },
  cellQty: { width: 40, textAlign: "center" },
  cellPrice: { width: 70, textAlign: "right" },
  cellTotal: { width: 70, textAlign: "right", fontWeight: "bold" },

  // Totals
  totalsBlock: {
    alignItems: "flex-end",
    marginBottom: 20,
  },
  totalsRow: {
    flexDirection: "row",
    width: 200,
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalsDivider: {
    borderTopWidth: 1,
    borderTopColor: DARK_BLUE,
    marginVertical: 4,
    width: 200,
  },
  totalsLabel: {
    fontSize: 9,
  },
  totalsValue: {
    fontSize: 9,
    fontWeight: "bold",
  },
  grandTotalLabel: {
    fontSize: 12,
    fontWeight: "bold",
    color: DARK_BLUE,
  },
  grandTotalValue: {
    fontSize: 12,
    fontWeight: "bold",
    color: DARK_BLUE,
  },

  // Payment schedule
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: DARK_BLUE,
    marginBottom: 8,
    marginTop: 12,
  },

  // Notes
  notesText: {
    fontSize: 8,
    color: "#6b7280",
    lineHeight: 1.5,
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 7,
    color: "#9ca3af",
  },
});

export function QuotePdfDocument({ data }: { data: QuoteDocumentData }) {
  const { currency, language } = data;
  const s = quoteText(language);
  const formatMoney = (cents: number) => formatQuoteMoney(cents, currency, language);
  const formatDate = (d: string) => formatQuoteDate(d, language);

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{data.company.name}</Text>
            {data.company.street ? (
              <Text style={styles.infoText}>
                {data.company.street}
                {"\n"}
                {data.company.city}, {data.company.state} {data.company.zip}
              </Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.quoteTitle}>{s.pdfQuoteTitle}</Text>
            <Text style={styles.quoteNumber}>{data.quoteNumber}</Text>
            <Text style={styles.quoteNumber}>{s.pdfDate(formatDate(data.quoteDate))}</Text>
            {data.validUntil ? (
              <Text style={styles.quoteNumber}>{s.pdfValidUntil(formatDate(data.validUntil))}</Text>
            ) : null}
          </View>
        </View>

        {/* Contact + Venue */}
        <View style={styles.infoRow}>
          {data.contact && (
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>{s.pdfBillTo}</Text>
              <Text style={styles.infoBold}>{data.contact.name}</Text>
              {data.contact.email ? (
                <Text style={styles.infoText}>{data.contact.email}</Text>
              ) : null}
              {data.contact.phone ? (
                <Text style={styles.infoText}>{data.contact.phone}</Text>
              ) : null}
              {data.customerCompany ? (
                <View style={{ marginTop: 4 }}>
                  <Text style={styles.infoBold}>{data.customerCompany.name}</Text>
                  {data.customerCompany.address ? (
                    <Text style={styles.infoText}>{data.customerCompany.address}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          )}
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>{s.pdfEventVenue}</Text>
            <Text style={styles.infoBold}>{data.venue.name}</Text>
            {data.venue.street ? (
              <Text style={styles.infoText}>
                {data.venue.street} {data.venue.zip}
              </Text>
            ) : null}
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>{s.pdfAccountManager}</Text>
            <Text style={styles.infoBold}>{data.accountManager || "—"}</Text>
          </View>
        </View>

        {/* Dates */}
        <View style={styles.datesRow}>
          <View style={styles.dateItem}>
            <Text style={styles.dateLabel}>{s.pdfEventStart}</Text>
            <Text style={styles.dateValue}>{formatDate(data.dates.eventStart)}</Text>
          </View>
          <View style={styles.dateItem}>
            <Text style={styles.dateLabel}>{s.pdfEventEnd}</Text>
            <Text style={styles.dateValue}>{formatDate(data.dates.eventEnd)}</Text>
          </View>
        </View>

        {/* Line Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.cellItem]}>{s.pdfColItem}</Text>
            <Text style={[styles.tableHeaderText, styles.cellQty]}>{s.colQty}</Text>
            <Text style={[styles.tableHeaderText, styles.cellPrice]}>{s.pdfColUnitPrice}</Text>
            <Text style={[styles.tableHeaderText, styles.cellTotal]}>{s.colTotal}</Text>
          </View>
          {data.lineItems.map((item, i) => (
            <View key={i} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <View style={styles.cellItem}>
                <Text style={{ fontWeight: "bold" }}>{item.label}</Text>
                {item.description ? (
                  <Text style={{ color: "#6b7280", fontSize: 8, marginTop: 1 }}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.cellQty}>{item.qty}</Text>
              <Text style={styles.cellPrice}>{formatMoney(item.unitPrice)}</Text>
              <Text style={styles.cellTotal}>{formatMoney(item.total)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{s.subtotal}</Text>
            <Text style={styles.totalsValue}>{formatMoney(data.subtotalCents)}</Text>
          </View>
          {data.discountsCents !== 0 && (
            <>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>{s.discounts}</Text>
                <Text style={[styles.totalsValue, { color: "#dc2626" }]}>
                  {formatMoney(data.discountsCents)}
                </Text>
              </View>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>{s.subtotalAfterDiscount}</Text>
                <Text style={styles.totalsValue}>
                  {formatMoney(data.subtotalCents + data.discountsCents)}
                </Text>
              </View>
            </>
          )}
          {data.taxAmountCents !== 0 && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>
                {data.taxPercent ? s.taxWithPercent(data.taxPercent) : s.tax}
              </Text>
              <Text style={styles.totalsValue}>{formatMoney(data.taxAmountCents)}</Text>
            </View>
          )}
          <View style={styles.totalsDivider} />
          <View style={styles.totalsRow}>
            <Text style={styles.grandTotalLabel}>{s.grandTotal}</Text>
            <Text style={styles.grandTotalValue}>{formatMoney(data.totalCents)}</Text>
          </View>
        </View>

        {/* Payment Schedule */}
        {data.paymentSchedule.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{s.paymentSchedule}</Text>
            {data.paymentSchedule.map((p, i) => (
              <View key={i} style={[styles.tableRow, { paddingHorizontal: 0 }]}>
                <Text style={{ flex: 1 }}>{formatDate(p.dueDate)}</Text>
                <Text style={{ width: 80, textAlign: "right" }}>{formatMoney(p.amountCents)}</Text>
                <Text
                  style={{
                    width: 90,
                    textAlign: "right",
                    color:
                      p.status === "paid"
                        ? "#16a34a"
                        : p.status === "partial"
                          ? "#b45309"
                          : "#6b7280",
                  }}
                >
                  {statusLabel(language, p.status)}
                  {/* A part-paid row must say how far it got — "paid" on a
                      $3,600 installment covered by $1 is a false statement in a
                      document the client keeps. */}
                  {p.status === "partial" && ` (${formatMoney(p.allocatedCents)})`}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Notes */}
        {data.clientNotes ? (
          <>
            <Text style={styles.sectionTitle}>{s.notes}</Text>
            <Text style={styles.notesText}>{data.clientNotes}</Text>
          </>
        ) : null}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{data.company.name}</Text>
          <Text style={styles.footerText}>{data.quoteNumber}</Text>
        </View>
      </Page>

      {/* Contract pages (T&C + signature) */}
      <ContractPdfPages data={data} />
    </Document>
  );
}
