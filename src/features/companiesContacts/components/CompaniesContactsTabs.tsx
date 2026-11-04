"use client";

import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/** Each tab is its own page, so the URL says which one you are on and back/forward work. */
export const COMPANIES_CONTACTS_PATHS = {
  companies: "/companies",
  contacts: "/contacts",
} as const;

export type CompaniesContactsTab = keyof typeof COMPANIES_CONTACTS_PATHS;

const TRIGGER_CLASS =
  "rounded-md text-sm px-5 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-gray-900 text-gray-500 font-medium transition-all";

export function CompaniesContactsTabs({
  active,
  children,
}: {
  active: CompaniesContactsTab;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-5">Companies & Contacts</h1>

      <Tabs
        value={active}
        onValueChange={(tab) => router.push(COMPANIES_CONTACTS_PATHS[tab as CompaniesContactsTab])}
      >
        <TabsList className="bg-gray-100 p-1 rounded-lg h-auto gap-0 w-auto inline-flex mb-5">
          <TabsTrigger value="companies" className={TRIGGER_CLASS}>
            Companies
          </TabsTrigger>
          <TabsTrigger value="contacts" className={TRIGGER_CLASS}>
            Contacts
          </TabsTrigger>
        </TabsList>

        <TabsContent value={active}>{children}</TabsContent>
      </Tabs>
    </div>
  );
}
