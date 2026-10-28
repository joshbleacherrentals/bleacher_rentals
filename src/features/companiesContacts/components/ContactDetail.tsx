"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ContactActivities } from "./ContactActivities";
import { ContactOverview } from "./ContactOverview";
import { EmailView } from "./EmailView";

/**
 * The body of a contact's page: the overview and the activities side by side, or, while an email is
 * open, that email across the whole page instead. The columns stay mounted underneath (just hidden)
 * so going back finds the email list as it was left.
 */
export function ContactDetail({ contactUuid }: { contactUuid: string }) {
  // The email being read, by EmailMessages.id.
  const [openEmail, setOpenEmail] = useState<string | null>(null);

  return (
    <div>
      {openEmail && <EmailView emailMessageUuid={openEmail} onBack={() => setOpenEmail(null)} />}

      <div className={openEmail ? "hidden" : undefined}>
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Contacts
        </Link>

        {/*
          25% / 50% / 25% of the width left after the gaps; stacked on narrow screens. The columns are
          minmax(0, …) because a plain 1fr is minmax(auto, 1fr): a long address or subject inside a
          column would widen its track and push the others around.
        */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
          <ContactOverview contactUuid={contactUuid} />
          <ContactActivities contactUuid={contactUuid} onOpenEmail={setOpenEmail} />
          <div />
        </div>
      </div>
    </div>
  );
}
