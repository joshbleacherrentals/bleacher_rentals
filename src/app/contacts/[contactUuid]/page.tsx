import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ContactActivities } from "@/features/companiesContacts/components/ContactActivities";
import { ContactOverview } from "@/features/companiesContacts/components/ContactOverview";

export default async function ContactPage({
  params,
}: {
  params: Promise<{ contactUuid: string }>;
}) {
  const { contactUuid } = await params;

  return (
    <div className="p-4">
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
        <ContactActivities contactUuid={contactUuid} />
        <div />
      </div>
    </div>
  );
}
