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
import { buildDefaultPaymentSchedule } from "../utils/buildDefaultPaymentSchedule";
import { convertLegacySchedule } from "../utils/resolvePaymentSchedule";
import { calculateTotals } from "../utils/calculateTotals";
import type { LostReason } from "../utils/lostReason";

export type CreateQuoteState = {
  // Edit mode
  editingEventId: string | null;

  // Quote Details
  quoteNumber: string;
  quoteValidTill: string;
  status: QuoteStatus;
  // Why the quote was lost. Only meaningful while status is "lost" — every save
  // normalizes it away otherwise (see utils/lostReason).
  lostReason: LostReason | null;
  lostReasonNote: string;
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
  // Notes for the driver about this venue at two different moments — NOT the
  // two ends of one truck trip like the identically-named WorkTrackers
  // columns. See docs/specs/event-pickup-dropoff-instructions.md D1.
  pickupInstructions: string;
  dropoffInstructions: string;

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
  // Fresh quotes follow the event date until their schedule is explicitly edited.
  scheduleDatesAutomatic: boolean;
  scheduleError: string | null;
  paymentInstallments: PaymentInstallment[];

  // Notes
  clientFacingNotes: string;
  internalNotes: string;

  // Terms & Send
  termsDocumentId: string | null;
  attachPdfViaEmail: boolean;

  // Modals
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
  lostReason: null,
  lostReasonNote: "",
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
  pickupInstructions: "",
  dropoffInstructions: "",

  currency: "USD",

  taxPercent: null,
  taxLoading: false,
  taxOverrideCents: null,

  lineItems: [],

  paymentMethod: null,
  paymentInstallments: buildDefaultPaymentSchedule(null),
  scheduleDatesAutomatic: true,
  scheduleError: null,

  clientFacingNotes: "",
  internalNotes: "",

  termsDocumentId: null,
  attachPdfViaEmail: false,

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

      setField: (key, value) =>
        set((state) => {
          const next = { ...state, [key]: value };
          if (key === "paymentInstallments" || key === "editingEventId")
            next.scheduleDatesAutomatic = false;
          if (
            key === "eventStart" &&
            state.scheduleDatesAutomatic &&
            !state.editingEventId &&
            state.paymentInstallments.length === 2
          ) {
            const dates = buildDefaultPaymentSchedule(value as string);
            next.paymentInstallments = state.paymentInstallments.map((i, index) => ({
              ...i,
              dueDate: dates[index].dueDate,
            }));
          }
          return next;
        }),

      addLineItem: (item) => set((state) => ({ lineItems: [...state.lineItems, item] })),

      updateLineItem: (id, updates) =>
        set((state) => ({
          lineItems: state.lineItems.map((i) => (i.id === id ? { ...i, ...updates } : i)),
        })),

      removeLineItem: (id) =>
        set((state) => ({ lineItems: state.lineItems.filter((i) => i.id !== id) })),

      setPaymentInstallments: (installments) =>
        set({
          paymentInstallments: installments,
          scheduleDatesAutomatic: false,
          scheduleError: null,
        }),

      resetForm: () =>
        set({ ...initialState, paymentInstallments: buildDefaultPaymentSchedule(null) }),
    }),
    {
      name: "create-quote-draft",
      storage: throttledStorage(1000),
      version: 1,
      migrate: (persisted) => {
        const old = persisted as CreateQuoteState & {
          paymentInstallments: { id: string; dueDate: string; amountCents: number }[];
        };
        // Keep an exact recovery copy before upgrading legacy drafts, including failures.
        if (typeof localStorage !== "undefined")
          localStorage.setItem("create-quote-draft-before-percentages", JSON.stringify(persisted));
        try {
          const { subtotal, discountTotal, taxAmount } = calculateTotals(
            old.lineItems ?? [],
            old.taxPercent,
          );
          return {
            ...old,
            scheduleDatesAutomatic: false,
            scheduleError: null,
            paymentInstallments: convertLegacySchedule(
              old.paymentInstallments ?? [],
              subtotal + discountTotal + (old.taxOverrideCents ?? Math.round(taxAmount)),
            ),
          };
        } catch (error) {
          return {
            ...old,
            scheduleDatesAutomatic: false,
            paymentInstallments: [],
            scheduleError: `${(error as Error).message} The original draft is retained in browser storage (create-quote-draft-before-percentages). Rebuild the schedule to continue.`,
          };
        }
      },
    },
  ),
);

const TRACKED_KEYS: (keyof CreateQuoteState)[] = [
  "eventName",
  "status",
  "lostReason",
  "lostReasonNote",
  "eventStart",
  "eventEnd",
  "pickupInstructions",
  "dropoffInstructions",
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
