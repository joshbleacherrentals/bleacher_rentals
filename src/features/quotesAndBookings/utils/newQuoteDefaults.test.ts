import { describe, it, expect } from "vitest";
import { newQuoteFieldsToPrefill } from "./newQuoteDefaults";
import { NEW_QUOTE_CLIENT_NOTES } from "./newQuoteNotes";

const emptyForm = {
  editingEventId: null,
  openedOverADraft: false,
  currentNotes: "",
  currentTermsId: null,
  defaultTermsId: "terms-1",
  currentSalesOfficeId: null,
  defaultSalesOfficeId: "office-1",
};

describe("newQuoteFieldsToPrefill", () => {
  it("fills the starter notes, default template and default sales office on an empty form", () => {
    expect(newQuoteFieldsToPrefill(emptyForm)).toEqual({
      clientFacingNotes: NEW_QUOTE_CLIENT_NOTES,
      termsDocumentId: "terms-1",
      salesOfficeId: "office-1",
    });
  });

  it("fills nothing while editing an existing quote", () => {
    expect(newQuoteFieldsToPrefill({ ...emptyForm, editingEventId: "event-1" })).toEqual({});
  });

  it("fills nothing over a draft already in progress", () => {
    expect(newQuoteFieldsToPrefill({ ...emptyForm, openedOverADraft: true })).toEqual({});
  });

  it("leaves the template out when nothing is marked default", () => {
    expect(newQuoteFieldsToPrefill({ ...emptyForm, defaultTermsId: null })).toEqual({
      clientFacingNotes: NEW_QUOTE_CLIENT_NOTES,
      salesOfficeId: "office-1",
    });
  });

  it("does not overwrite a template the user already chose", () => {
    expect(newQuoteFieldsToPrefill({ ...emptyForm, currentTermsId: "terms-9" })).toEqual({
      clientFacingNotes: NEW_QUOTE_CLIENT_NOTES,
      salesOfficeId: "office-1",
    });
  });

  it("does not overwrite notes the user already typed", () => {
    expect(newQuoteFieldsToPrefill({ ...emptyForm, currentNotes: "mine" })).toEqual({
      termsDocumentId: "terms-1",
      salesOfficeId: "office-1",
    });
  });

  it("leaves the sales office out when the account manager has no default", () => {
    expect(newQuoteFieldsToPrefill({ ...emptyForm, defaultSalesOfficeId: null })).toEqual({
      clientFacingNotes: NEW_QUOTE_CLIENT_NOTES,
      termsDocumentId: "terms-1",
    });
  });

  it("does not overwrite a sales office the user already chose", () => {
    expect(newQuoteFieldsToPrefill({ ...emptyForm, currentSalesOfficeId: "office-9" })).toEqual({
      clientFacingNotes: NEW_QUOTE_CLIENT_NOTES,
      termsDocumentId: "terms-1",
    });
  });

  it("returns nothing to do once every field is filled — safe to re-run as data arrives", () => {
    expect(
      newQuoteFieldsToPrefill({
        ...emptyForm,
        currentNotes: "mine",
        currentTermsId: "terms-1",
        currentSalesOfficeId: "office-1",
      }),
    ).toEqual({});
  });
});
