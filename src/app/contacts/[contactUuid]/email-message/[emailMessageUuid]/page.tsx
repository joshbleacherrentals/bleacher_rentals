import { EmailView } from "@/features/companiesContacts/components/EmailView";

/**
 * One email of a contact, across the whole page beside the sidebar. Unlike the pages around it this
 * one adds no padding, so the email runs to the edges.
 */
export default async function ContactEmailPage({
  params,
}: {
  params: Promise<{ contactUuid: string; emailMessageUuid: string }>;
}) {
  const { contactUuid, emailMessageUuid } = await params;

  return <EmailView contactUuid={contactUuid} emailMessageUuid={emailMessageUuid} />;
}
