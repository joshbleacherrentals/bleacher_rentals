import { describe, it, expect } from "vitest";
import { newQuoteFieldsToPrefill } from "./newQuoteDefaults";
import { NEW_QUOTE_CLIENT_NOTES } from "./newQuoteNotes";

const emptyForm = {
  editingEventId: null,
  openedOverADraft: false,
  currentNotes: "",
  currentTermsId: null,
  defaultTermsId: "terms-1",
};

describe("newQuoteFieldsToPrefill", () => {
  it("fills the starter notes and the default template on an empty form", () => {
    expect(newQuoteFieldsToPrefill(emptyForm)).toEqual({
      clientFacingNotes: NEW_QUOTE_CLIENT_NOTES,
      termsDocumentId: "terms-1",
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
    });
  });

  it("does not overwrite a template the user already chose", () => {
    expect(newQuoteFieldsToPrefill({ ...emptyForm, currentTermsId: "terms-9" })).toEqual({
      clientFacingNotes: NEW_QUOTE_CLIENT_NOTES,
    });
  });

  it("does not overwrite notes the user already typed", () => {
    expect(newQuoteFieldsToPrefill({ ...emptyForm, currentNotes: "mine" })).toEqual({
      termsDocumentId: "terms-1",
    });
  });

  it("returns nothing to do once both fields are filled — safe to re-run as data arrives", () => {
    expect(
      newQuoteFieldsToPrefill({ ...emptyForm, currentNotes: "mine", currentTermsId: "terms-1" }),
    ).toEqual({});
  });
});
