import { CompaniesContactsTabs } from "@/features/companiesContacts/components/CompaniesContactsTabs";
import { ContactsTab } from "@/features/companiesContacts/components/ContactsTab";

export default function ContactsPage() {
  return (
    <CompaniesContactsTabs active="contacts">
      <ContactsTab />
    </CompaniesContactsTabs>
  );
}
