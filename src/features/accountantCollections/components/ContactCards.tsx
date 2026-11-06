import type { ContactCard } from "../utils/invoiceView";

/**
 * The Contact and Finance Contact cards, in the three layouts of Contacts.dc.html: both with
 * their company lines; no finance contact (the Contact card and a Company card beside it); and
 * contacts without company info (no company lines at all).
 * docs/specs/accountant-collections-09-design.md §3.
 */

const SECTION_TITLE = "text-xs font-bold uppercase tracking-wider text-gray-500";
const CARD = "flex flex-col gap-3 bg-white p-5";

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="[overflow-wrap:anywhere]">{value || "—"}</span>
    </div>
  );
}

function PersonRows({ card }: { card: ContactCard }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Row label="Phone number" value={card.phone} />
      <Row label="Email address" value={card.email} />
    </div>
  );
}

function CompanyRows({ company }: { company: NonNullable<ContactCard["company"]> }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Row label="Company name" value={company.name} />
      <Row label="Company number" value={company.phone} />
      <Row label="Company email" value={company.email} />
    </div>
  );
}

function PersonCard({ title, card }: { title: string; card: ContactCard }) {
  return (
    <div className={CARD}>
      <h3 className={SECTION_TITLE}>{title}</h3>
      <div className="text-base font-semibold">{card.name}</div>
      <PersonRows card={card} />
      {card.company && (
        <>
          <div className="h-px bg-gray-200" />
          <CompanyRows company={card.company} />
        </>
      )}
    </div>
  );
}

const PAIR =
  "grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-px overflow-hidden rounded-[10px] border border-gray-200 bg-gray-200";

export function ContactCards({
  contact,
  financeContact,
}: {
  contact: ContactCard | null;
  financeContact: ContactCard | null;
}) {
  if (!contact && !financeContact) return null;

  if (contact && !financeContact) {
    return (
      <section aria-label="Contact" className={PAIR}>
        <div className={CARD}>
          <h3 className={SECTION_TITLE}>Contact</h3>
          <div className="text-base font-semibold">{contact.name}</div>
          <PersonRows card={contact} />
        </div>
        {contact.company && (
          <div className={CARD}>
            <h3 className={SECTION_TITLE}>Company</h3>
            <CompanyRows company={contact.company} />
          </div>
        )}
      </section>
    );
  }

  return (
    <section aria-label="Contact and finance contact" className={PAIR}>
      {contact && <PersonCard title="Contact" card={contact} />}
      {financeContact && <PersonCard title="Finance Contact" card={financeContact} />}
    </section>
  );
}
