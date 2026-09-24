import type { QuoteLanguage } from "./quoteLanguage";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  EVERY WORD THE CUSTOMER SEES ON A QUOTE LIVES IN THIS FILE.
 * ══════════════════════════════════════════════════════════════════════
 *
 * To change a phrase: search for the English text below and edit it (or its
 * French twin on the same line). Nothing else needs to change — no component
 * edits, no key renames.
 *
 * To add a new phrase: add an entry with BOTH `en` and `fr`. TypeScript will
 * not compile an entry that is missing a language, so a French quote can never
 * silently fall back to English.
 *
 * Covers: the public /quote/[id] page (Quote, Sign Contract and Pay Invoice
 * tabs), the payment-success page, and the quote PDF.
 *
 * NOT covered — these are authored by staff in the app, not in code:
 *   • Terms & Conditions text  → author a French T&C row and select it on the quote
 *   • Quote emails             → per-office templates in Email Automation
 *
 * French is Canadian French (fr-CA). Quebec typography puts a space before %
 * and before a colon ("Taxes (5 %)", "Date : ...").
 *
 * See docs/specs/quote-preferred-language.md.
 */

// A phrase is either fixed text or a function when it interpolates a value.
type Bilingual<T> = { en: T; fr: T };
type QuoteStringDict = Record<string, Bilingual<string> | Bilingual<(...args: never[]) => string>>;

export const quoteStrings = {
  // ── Tab bar (public page) ────────────────────────────────────────────
  tabApprovedQuote: { en: "Approved Quote", fr: "Devis approuvé" },
  tabSignedContract: { en: "Signed Contract", fr: "Contrat signé" },
  tabPayInvoice: { en: "Pay Invoice", fr: "Payer la facture" },

  // ── Quote tab: header ────────────────────────────────────────────────
  eventInformation: { en: "Event Information", fr: "Renseignements sur l'événement" },
  locationVenue: { en: "Location / Venue", fr: "Lieu de l'événement" },
  invoiceBadge: { en: "INVOICE", fr: "FACTURE" },
  invoiceNumber: {
    en: (n: string) => `Invoice #${n}`,
    fr: (n: string) => `Facture nº ${n}`,
  },
  poNumberShort: {
    en: (n: string) => `PO #${n}`,
    fr: (n: string) => `Bon de commande nº ${n}`,
  },
  phonePrefix: { en: "P:", fr: "T :" },
  contact: { en: "Contact", fr: "Personne-ressource" },
  customerCompany: { en: "Company", fr: "Entreprise" },

  // ── Quote tab: line items table ──────────────────────────────────────
  rentalItems: { en: "Rental Items", fr: "Articles en location" },
  colDescription: { en: "Description", fr: "Description" },
  colQty: { en: "Qty", fr: "Qté" },
  colUnit: { en: "Unit", fr: "Unitaire" },
  colTotal: { en: "Total", fr: "Total" },
  noItems: { en: "No items", fr: "Aucun article" },

  // ── Quote tab: payment-by-cheque box ─────────────────────────────────
  makeChecksPayableTo: { en: "Make checks payable to:", fr: "Libeller les chèques à :" },
  memoInvoice: {
    en: (n: string) => `Memo: Invoice #${n}`,
    fr: (n: string) => `Mention : facture nº ${n}`,
  },

  // ── Totals ───────────────────────────────────────────────────────────
  totalsHeading: { en: "Totals", fr: "Totaux" },
  subtotal: { en: "Subtotal", fr: "Sous-total" },
  discounts: { en: "Discounts", fr: "Rabais" },
  subtotalAfterDiscount: { en: "Subtotal After Discount", fr: "Sous-total après rabais" },
  tax: { en: "Tax", fr: "Taxes" },
  taxWithPercent: {
    en: (percent: number) => `Tax (${percent}%)`,
    fr: (percent: number) => `Taxes (${percent} %)`,
  },
  // The asterisk points at the convenience-fee note below the totals box.
  totalWithAsterisk: { en: "Total*", fr: "Total*" },
  grandTotal: { en: "TOTAL", fr: "TOTAL" },
  remainingBalance: { en: "Remaining Balance", fr: "Solde restant" },
  convenienceFeesNote: {
    en: "Additional convenience fees may apply",
    fr: "Des frais de service supplémentaires peuvent s'appliquer",
  },

  // ── Payment schedule labels (shared by quote tab, pay tab and PDF) ───
  dueNow: { en: "Due Now", fr: "À payer maintenant" },
  dueOn: {
    en: (date: string) => `Due on ${date}`,
    fr: (date: string) => `Échéance le ${date}`,
  },
  finalDueOn: {
    en: (date: string) => `Final Due on ${date}`,
    fr: (date: string) => `Dernier versement le ${date}`,
  },

  // ── Language toggle (EN | FR in the header) ──────────────────────────
  // The visible labels are ISO codes ("EN"/"FR") and live in the component —
  // they are identifiers, not copy. These accessible names are copy.
  languageGroupLabel: { en: "Quote language", fr: "Langue du devis" },
  switchToEnglish: { en: "View this quote in English", fr: "Voir ce devis en anglais" },
  switchToFrench: { en: "View this quote in French", fr: "Voir ce devis en français" },

  // ── Quote tab: notes + footer ────────────────────────────────────────
  notes: { en: "Notes", fr: "Notes" },
  downloadPdf: { en: "Download PDF", fr: "Télécharger le PDF" },

  // ── Sign Contract tab ────────────────────────────────────────────────
  loadingContract: { en: "Loading contract...", fr: "Chargement du contrat..." },
  noContractTemplate: {
    en: "No contract template has been assigned to this quote.",
    fr: "Aucun modèle de contrat n'a été assigné à ce devis.",
  },
  signPrompt: {
    en: "Enter your full name to sign this contract",
    fr: "Inscrivez votre nom complet pour signer ce contrat",
  },
  fullNamePlaceholder: { en: "Full name", fr: "Nom complet" },
  signature: { en: "Signature", fr: "Signature" },
  printedName: { en: "Printed Name", fr: "Nom en lettres moulées" },
  timestamp: { en: "Timestamp", fr: "Horodatage" },
  recordedOnSign: { en: "Will be recorded on sign", fr: "Sera enregistré à la signature" },
  signContract: { en: "Sign Contract", fr: "Signer le contrat" },
  signing: { en: "Signing...", fr: "Signature en cours..." },
  signatureDate: { en: "Date", fr: "Date" },

  // ── Pay Invoice tab: pay card ────────────────────────────────────────
  paymentCancelled: {
    en: "Payment was cancelled. You can try again when ready.",
    fr: "Le paiement a été annulé. Vous pouvez réessayer quand vous serez prêt.",
  },
  amountDue: { en: "Amount Due", fr: "Montant dû" },
  paidInFull: { en: "Paid in Full", fr: "Payé en totalité" },
  // Rendered after the due amount, which is bolded on its own:
  //   "<b>$500.00</b> is due based on your payment schedule."
  dueNoticeSuffix: {
    en: "is due based on your payment schedule.",
    fr: "est à payer selon votre calendrier de paiement.",
  },
  yourNameRequired: { en: "Your Name *", fr: "Votre nom *" },
  email: { en: "Email", fr: "Courriel" },
  emailPlaceholder: { en: "email@example.com", fr: "courriel@exemple.com" },
  payDueBalance: {
    en: (amount: string) => `Pay due balance (${amount})`,
    fr: (amount: string) => `Payer le solde exigible (${amount})`,
  },
  payAmount: {
    en: (amount: string) => `Pay ${amount}`,
    fr: (amount: string) => `Payer ${amount}`,
  },
  customAmount: { en: "Custom amount", fr: "Montant personnalisé" },
  minimumAmount: {
    en: (amount: string) => `Minimum ${amount}`,
    fr: (amount: string) => `Minimum de ${amount}`,
  },
  exceedsBalance: { en: "Exceeds balance", fr: "Dépasse le solde" },
  redirectingToStripe: { en: "Redirecting to Stripe...", fr: "Redirection vers Stripe..." },
  payOnline: {
    en: (amount: string) => `Pay ${amount} Online`,
    fr: (amount: string) => `Payer ${amount} en ligne`,
  },
  payError: {
    en: "Unable to start payment. Please try again.",
    fr: "Impossible de démarrer le paiement. Veuillez réessayer.",
  },
  alternativePayment: {
    en: "Alternatively you can pay by ACH or Check. View the confirmation email for details.",
    fr: "Vous pouvez aussi payer par virement bancaire ou par chèque. Consultez le courriel de confirmation pour les détails.",
  },

  // ── Pay Invoice tab: schedule + history ──────────────────────────────
  paymentSchedule: { en: "Payment Schedule", fr: "Calendrier de paiement" },
  paid: { en: "Paid", fr: "Payé" },
  due: { en: "Due", fr: "À payer" },
  totalScheduled: { en: "Total Scheduled", fr: "Total prévu" },
  paymentHistory: { en: "Payment History", fr: "Historique des paiements" },
  loading: { en: "Loading...", fr: "Chargement..." },
  noPaymentsYet: { en: "No payments recorded yet.", fr: "Aucun paiement enregistré." },
  colDate: { en: "Date", fr: "Date" },
  colAmount: { en: "Amount", fr: "Montant" },
  colMethod: { en: "Method", fr: "Mode" },
  colStatus: { en: "Status", fr: "Statut" },
  colReceipt: { en: "Receipt", fr: "Reçu" },
  viewReceipt: { en: "View", fr: "Voir" },

  // Payment / installment status values as they arrive from Stripe and the DB.
  // Anything not listed here falls through to the raw value — see statusLabel().
  statusSucceeded: { en: "succeeded", fr: "réussi" },
  statusPending: { en: "pending", fr: "en attente" },
  statusFailed: { en: "failed", fr: "échoué" },
  statusPaid: { en: "paid", fr: "payé" },
  statusUnpaid: { en: "unpaid", fr: "impayé" },
  // An installment that has received some money but is not covered yet.
  statusPartial: { en: "partial", fr: "partiel" },

  // Payment method types from Stripe.
  methodCard: { en: "card", fr: "carte" },

  // ── Pay Invoice tab: right column ────────────────────────────────────
  invoiceSummary: { en: "Invoice Summary", fr: "Sommaire de la facture" },
  invoiceNumberLabel: { en: "Invoice #", fr: "Facture nº" },
  event: { en: "Event", fr: "Événement" },
  total: { en: "Total", fr: "Total" },
  paidLabel: { en: "Paid", fr: "Payé" },
  remaining: { en: "Remaining", fr: "Solde" },
  purchaseOrderNumber: { en: "Purchase Order #", fr: "Bon de commande nº" },
  enterPoNumber: { en: "Enter PO number", fr: "Saisir le numéro de bon de commande" },
  notSet: { en: "Not set", fr: "Non défini" },
  makeChecksPayableToHeading: {
    en: "Make Checks Payable To",
    fr: "Libeller les chèques à l'ordre de",
  },
  questions: { en: "Questions?", fr: "Des questions ?" },

  // ── Payment success page ─────────────────────────────────────────────
  paymentSuccessful: { en: "Payment Successful!", fr: "Paiement réussi !" },
  paymentSuccessDetail: {
    en: "Thank you for your payment. You will receive a receipt in your email shortly.",
    fr: "Merci pour votre paiement. Vous recevrez un reçu par courriel sous peu.",
  },
  backToQuote: { en: "Back to Quote", fr: "Retour au devis" },

  // ── Blocking modals on the public page ───────────────────────────────
  quoteUpdatedTitle: {
    en: "This quote has been updated",
    fr: "Ce devis a été mis à jour",
  },
  quoteUpdatedBody: {
    en: "The details of this quote have changed since you opened this page. Please refresh to see the latest version.",
    fr: "Les détails de ce devis ont changé depuis l'ouverture de cette page. Veuillez actualiser pour voir la version la plus récente.",
  },
  refresh: { en: "Refresh", fr: "Actualiser" },
  stillHereTitle: { en: "Are you still here?", fr: "Êtes-vous toujours là ?" },
  stillHereBody: {
    en: "We paused checking for updates while you were away. Tap Yes to keep this quote up to date.",
    fr: "Nous avons suspendu la vérification des mises à jour pendant votre absence. Touchez Oui pour garder ce devis à jour.",
  },
  yes: { en: "Yes", fr: "Oui" },

  // ── PDF ──────────────────────────────────────────────────────────────
  pdfQuoteTitle: { en: "QUOTE", fr: "DEVIS" },
  pdfDate: {
    en: (date: string) => `Date: ${date}`,
    fr: (date: string) => `Date : ${date}`,
  },
  pdfValidUntil: {
    en: (date: string) => `Valid until: ${date}`,
    fr: (date: string) => `Valide jusqu'au ${date}`,
  },
  pdfBillTo: { en: "Bill To", fr: "Facturer à" },
  pdfEventVenue: { en: "Event Venue", fr: "Lieu de l'événement" },
  pdfAccountManager: { en: "Account Manager", fr: "Gestionnaire de compte" },
  pdfEventStart: { en: "Event Start", fr: "Début de l'événement" },
  pdfEventEnd: { en: "Event End", fr: "Fin de l'événement" },
  pdfColItem: { en: "Item", fr: "Article" },
  pdfColUnitPrice: { en: "Unit Price", fr: "Prix unitaire" },
} as const satisfies QuoteStringDict;

export type QuoteStringKey = keyof typeof quoteStrings;

/**
 * The dictionary resolved to one language: `s.subtotal` is a string,
 * `s.taxWithPercent(5)` is a function — both correctly typed.
 */
export type QuoteText<L extends QuoteLanguage = QuoteLanguage> = {
  [K in QuoteStringKey]: (typeof quoteStrings)[K][L];
};

const cache = new Map<QuoteLanguage, QuoteText>();

/**
 * Bind the dictionary to a language. Call once per component:
 *
 *   const s = quoteText(data.language);
 *   <span>{s.subtotal}</span>
 *   <span>{s.taxWithPercent(data.taxPercent)}</span>
 */
export function quoteText<L extends QuoteLanguage>(lang: L): QuoteText<L> {
  const hit = cache.get(lang);
  if (hit) return hit as QuoteText<L>;

  const resolved = Object.fromEntries(
    Object.entries(quoteStrings).map(([key, entry]) => [key, entry[lang]]),
  ) as QuoteText<L>;

  cache.set(lang, resolved as QuoteText);
  return resolved;
}

/**
 * Raw status values as they arrive from Stripe and the DB, mapped to dictionary
 * entries. Anything not listed falls through to the raw value rather than
 * rendering blank.
 */
const STATUS_KEYS = {
  succeeded: "statusSucceeded",
  pending: "statusPending",
  failed: "statusFailed",
  paid: "statusPaid",
  unpaid: "statusUnpaid",
  partial: "statusPartial",
} as const satisfies Record<string, QuoteStringKey>;

const METHOD_KEYS = {
  card: "methodCard",
} as const satisfies Record<string, QuoteStringKey>;

/** Translate a payment / installment status ("succeeded", "paid", ...). */
export function statusLabel(lang: QuoteLanguage, status: string): string {
  const key = STATUS_KEYS[status as keyof typeof STATUS_KEYS];
  return key ? quoteStrings[key][lang] : status;
}

/** Translate a Stripe payment-method type ("card", ...). */
export function paymentMethodLabel(lang: QuoteLanguage, method: string): string {
  const key = METHOD_KEYS[method as keyof typeof METHOD_KEYS];
  return key ? quoteStrings[key][lang] : method;
}
