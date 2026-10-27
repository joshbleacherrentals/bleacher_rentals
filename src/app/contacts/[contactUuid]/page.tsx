import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ContactOverview } from "@/features/companiesContacts/components/ContactOverview";

export default async function ContactPage({
  params,
}: {
  params: Promise<{ contactUuid: string }>;
}) {
  const { contactUuid } = await params;

  return (
    <div>
      <Link
        href="/contacts"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Contacts
      </Link>

      {/* 25% / 50% / 25% of the width left after the gaps; stacked on narrow screens. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr_1fr]">
        <ContactOverview contactUuid={contactUuid} />
        <div />
        <div />
      </div>
    </div>
  );
}
