import { EmailView } from "@/features/companiesContacts/components/EmailView";

/**
 * One email of a contact and the rest of its thread, across the whole page beside the sidebar.
 * Unlike the pages around it this one adds no padding, so the emails run to the edges.
 */
export default async function ContactEmailPage({
  params,
}: {
  params: Promise<{ contactUuid: string; emailMessageUuid: string }>;
}) {
  const { contactUuid, emailMessageUuid } = await params;

  return (
    <EmailView
      key={emailMessageUuid}
      contactUuid={contactUuid}
      emailMessageUuid={emailMessageUuid}
    />
  );
}
