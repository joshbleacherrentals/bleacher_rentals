export type PaymentMethod = "credit_card" | "physical_check" | "wire_ach" | "cash" | null;

export type QuoteStatus = "draft" | "quoted" | "booked" | "lost";

export type LineItemCategory = "bleachers" | "discounts" | "logistics" | "custom_service";

export type DiscountType = "percentage" | "fixed";

export type Currency = "USD" | "CAD";

export type LineItem = {
  id: string;
  category: LineItemCategory;
  label: string;
  bleacherTypeUuid: string | null;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
  overridePrice: boolean;
  discountType: DiscountType;
  discountValue: number;
  /** Copied from the bleacher type when the item is added; read-only on the quote. */
  description: string | null;
};

// Matches public."Addresses" table
export type AddressFields = {
  street: string;
  city: string;
  stateProvince: string;
  zipPostal: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  country?: string;
};

// Matches public."Companies" table
export type QuoteCompany = {
  id: string | null;
  companyName: string;
  phone: string;
  email: string;
  notes: string;
  billingAddress: AddressFields;
  shippingAddress: AddressFields;
  shippingSameAsBilling: boolean;
};

// Matches public."Contacts" table
export type QuoteContact = {
  id: string | null;
  companyUuid: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes: string;
};

/**
 * A term of the quote: how much is due, and when. Whether it has been paid is
 * not stored here — `allocatePayments` derives that from PaymentHistory at read
 * time. See docs/specs/payment-accounting-truth.md §3.7.
 */
export type PaymentInstallment = {
  id: string;
  dueDate: string; // YYYY-MM-DD
  amountCents: number;
};

export type DiscountTemplate = {
  id: string;
  label: string;
  defaultType: DiscountType;
  defaultValue: number;
};

export type ServiceTemplate = {
  id: string;
  label: string;
  defaultPriceCents: number;
};
