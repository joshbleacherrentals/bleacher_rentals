import { CompaniesContactsTabs } from "@/features/companiesContacts/components/CompaniesContactsTabs";
import { CompaniesTab } from "@/features/companiesContacts/components/CompaniesTab";

export default function CompaniesPage() {
  return (
    <CompaniesContactsTabs active="companies">
      <CompaniesTab />
    </CompaniesContactsTabs>
  );
}
