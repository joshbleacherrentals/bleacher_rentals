import { ContactDetail } from "@/features/companiesContacts/components/ContactDetail";

export default async function ContactPage({
  params,
}: {
  params: Promise<{ contactUuid: string }>;
}) {
  const { contactUuid } = await params;

  return <ContactDetail key={contactUuid} contactUuid={contactUuid} />;
}
