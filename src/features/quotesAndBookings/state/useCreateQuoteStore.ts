"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  AddressFields,
  Currency,
  LineItem,
  PaymentInstallment,
  PaymentMethod,
  QuoteStatus,
} from "../types/quoteTypes";

export type CreateQuoteState = {
  // Edit mode
  editingEventId: string | null;

  // Quote Details
  quoteNumber: string;
  quoteValidTill: string;
  status: QuoteStatus;
  salesOfficeId: string | null;
  accountManagerId: string | null;
  ownerUserUuid: string | null;

  // Client Information
  contactId: string | null;
  contactName: string;
  companyName: string;
  companyEmail: string;
  phone: string;
  useFinanceContact: boolean;
  financeContactId: string | null;
  financeContactEmail: string;

  // Event Details
  eventName: string;
  eventAddress: string;
  eventAddressData: AddressFields | null;
  // Set when eventAddress/eventAddressData came from picking a Venue; null
  // when the address was typed/edited directly ("manual" — see
  // docs/specs/venue-history.md §2.3). Independent of eventAddressData, which
  // always holds the resolved address either way.
  venueId: string | null;
  venueName: string;
  eventStart: string;
  eventEnd: string;
  eventTypeId: string | null;

  // Currency
  currency: Currency;

  // Tax (auto-calculated from QBO, or manually overridden)
  taxPercent: number | null;
  taxLoading: boolean;
  taxOverrideCents: number | null;

  // Line Items (bleachers, discounts, logistics, custom services — all in one list)
  lineItems: LineItem[];

  // Payment
  paymentMethod: PaymentMethod;
  // Empty until the manager explicitly saves a schedule in the Edit Payment
  // Schedule modal — the schedule is optional. Non-empty = a committed schedule.
  paymentInstallments: PaymentInstallment[];

  // Notes
  clientFacingNotes: string;
  internalNotes: string;

  // Terms & Send
  termsDocumentId: string | null;
  attachPdfViaEmail: boolean;

  // Modals
  isNewContactModalOpen: boolean;
  isAddLineItemModalOpen: boolean;
  isEditPaymentScheduleModalOpen: boolean;
};

export type CreateQuoteActions = {
  setField: <K extends keyof CreateQuoteState>(key: K, value: CreateQuoteState[K]) => void;
  addLineItem: (item: LineItem) => void;
  updateLineItem: (id: string, updates: Partial<LineItem>) => void;
  removeLineItem: (id: string) => void;
  setPaymentInstallments: (installments: PaymentInstallment[]) => void;
  resetForm: () => void;
};

const initialState: CreateQuoteState = {
  editingEventId: null,

  quoteNumber: "",
  quoteValidTill: "",
  status: "draft",
  salesOfficeId: null,
  accountManagerId: null,
  ownerUserUuid: null,

  contactId: null,
  contactName: "",
  companyName: "",
  companyEmail: "",
  phone: "",
  useFinanceContact: false,
  financeContactId: null,
  financeContactEmail: "",

  eventName: "",
  eventAddress: "",
  eventAddressData: null,
  venueId: null,
  venueName: "",
  eventStart: "",
  eventEnd: "",
  eventTypeId: null,

  currency: "USD",

  taxPercent: null,
  taxLoading: false,
  taxOverrideCents: null,

  lineItems: [],

  paymentMethod: null,
  paymentInstallments: [],

  clientFacingNotes: "",
  internalNotes: "",

  termsDocumentId: null,
  attachPdfViaEmail: false,

  isNewContactModalOpen: false,
  isAddLineItemModalOpen: false,
  isEditPaymentScheduleModalOpen: false,
};

function throttledStorage(delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: string | null = null;
  const KEY = "create-quote-draft";

  return {
    getItem: (name: string) => {
      const raw = localStorage.getItem(name);
      return raw ? JSON.parse(raw) : null;
    },
    setItem: (name: string, value: unknown) => {
      pending = JSON.stringify(value);
      if (!timer) {
        timer = setTimeout(() => {
          if (pending !== null) localStorage.setItem(name, pending);
          pending = null;
          timer = null;
        }, delay);
      }
    },
    removeItem: (name: string) => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      localStorage.removeItem(name);
    },
  };
}

export const useCreateQuoteStore = create<CreateQuoteState & CreateQuoteActions>()(
  persist(
    (set) => ({
      ...initialState,

      setField: (key, value) => set((state) => ({ ...state, [key]: value })),

      addLineItem: (item) => set((state) => ({ lineItems: [...state.lineItems, item] })),

      updateLineItem: (id, updates) =>
        set((state) => ({
          lineItems: state.lineItems.map((i) => (i.id === id ? { ...i, ...updates } : i)),
        })),

      removeLineItem: (id) =>
        set((state) => ({ lineItems: state.lineItems.filter((i) => i.id !== id) })),

      setPaymentInstallments: (installments) => set({ paymentInstallments: installments }),

      resetForm: () => set(initialState),
    }),
    { name: "create-quote-draft", storage: throttledStorage(1000) },
  ),
);

const TRACKED_KEYS: (keyof CreateQuoteState)[] = [
  "eventName",
  "eventStart",
  "eventEnd",
  "contactId",
  "venueId",
  "salesOfficeId",
  "lineItems",
  "paymentInstallments",
  "clientFacingNotes",
  "internalNotes",
  "termsDocumentId",
];

/** Deep-ish snapshot of just the tracked fields, used for dirty comparison. */
function trackedSnapshot(state: CreateQuoteState): string {
  const subset: Record<string, unknown> = {};
  for (const key of TRACKED_KEYS) subset[key] = state[key];
  return JSON.stringify(subset);
}

// Baseline the form is compared against to detect unsaved changes. Captured when
// a page finishes initializing (new = fresh/restored draft, edit = loaded quote)
// so an untouched edit page is not reported as dirty. Falls back to initialState.
let savedBaseline: string | null = null;

/** Record the current form state as the clean baseline. */
export function captureQuoteBaseline(): void {
  savedBaseline = trackedSnapshot(useCreateQuoteStore.getState());
}

export function hasUnsavedChanges(): boolean {
  const current = trackedSnapshot(useCreateQuoteStore.getState());
  const baseline = savedBaseline ?? trackedSnapshot(initialState);
  return current !== baseline;
}
