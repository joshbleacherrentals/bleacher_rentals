import { CompaniesContactsTabs } from "@/features/companiesContacts/components/CompaniesContactsTabs";
import { ContactsTab } from "@/features/companiesContacts/components/ContactsTab";

export default function ContactsPage() {
  return (
    <div className="p-4">
      <CompaniesContactsTabs active="contacts">
        <ContactsTab />
      </CompaniesContactsTabs>
    </div>
  );
}
