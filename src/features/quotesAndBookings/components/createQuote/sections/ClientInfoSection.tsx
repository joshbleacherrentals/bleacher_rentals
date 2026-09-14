"use client";

import { useCreateQuoteStore } from "../../../state/useCreateQuoteStore";
import { ContactPicker } from "@/components/ContactPicker";
import { useContacts } from "../../../hooks/useContacts";
import { useVenuesAll } from "@/features/venues/hooks/useVenuesAll";
import { resolveVenueOnContactSelect } from "../../../utils/resolveVenueOnContactSelect";
import type { ContactOption } from "../../../hooks/useContacts";

export function ClientInfoSection() {
  const contactId = useCreateQuoteStore((s) => s.contactId);
  const useFinanceContact = useCreateQuoteStore((s) => s.useFinanceContact);
  const financeContactId = useCreateQuoteStore((s) => s.financeContactId);
  const setField = useCreateQuoteStore((s) => s.setField);
  const { contacts } = useContacts();
  const { venues } = useVenuesAll();

  const handleContactSelect = (contact: ContactOption) => {
    setField("contactId", contact.id);
    setField("contactName", `${contact.firstName} ${contact.lastName ?? ""}`.trim());
    if (contact.email) setField("companyEmail", contact.email);
    if (contact.phone) setField("phone", contact.phone);

    // Auto-fill the venue from the contact's default, but only if no venue
    // is picked yet — never overwrite one already chosen for this event.
    const venue = resolveVenueOnContactSelect(
      useCreateQuoteStore.getState().venueId,
      contact.defaultVenueId,
      venues,
    );
    if (venue) {
      setField("venueId", venue.id);
      setField("venueName", venue.name);
      setField("eventAddress", venue.address.street);
      setField("eventAddressData", venue.address);
    }
  };

  const handleContactClear = () => {
    setField("contactId", null);
    setField("contactName", "");
  };

  return (
    <section>
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
        Client Information
      </h2>

      <ContactPicker
        label="Contact"
        required
        contactId={contactId}
        contacts={contacts}
        onSelect={handleContactSelect}
        onClear={handleContactClear}
      />

      <div className="mt-3">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={useFinanceContact}
            onChange={(e) => {
              setField("useFinanceContact", e.target.checked);
              if (!e.target.checked) {
                setField("financeContactId", null);
                setField("financeContactEmail", "");
              }
            }}
            className="rounded border-gray-300 text-darkBlue focus:ring-darkBlue"
          />
          <span className="text-sm text-gray-700">Different finance contact</span>
        </label>
      </div>

      {useFinanceContact && (
        <div className="mt-2">
          <ContactPicker
            label="Finance Contact"
            contactId={financeContactId}
            contacts={contacts}
            onSelect={(contact) => {
              setField("financeContactId", contact.id);
              setField("financeContactEmail", contact.email ?? "");
            }}
            onClear={() => {
              setField("financeContactId", null);
              setField("financeContactEmail", "");
            }}
          />
        </div>
      )}
    </section>
  );
}
