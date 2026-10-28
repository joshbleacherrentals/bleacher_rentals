"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useContactsAll } from "../hooks/useContactsAll";
import { ContactEmailsTab } from "./ContactEmailsTab";

const TRIGGER_CLASS =
  "rounded-md text-sm px-4 py-1 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-gray-900 text-gray-500 font-medium transition-all";

/** Everything that has happened with a contact. Emails for now; calls and texts come later. */
export function ContactActivities({ contactUuid }: { contactUuid: string }) {
  const { contacts } = useContactsAll();
  const contact = contacts.find((c) => c.id === contactUuid);
  if (!contact) return null; // the overview next to it already says loading / not found

  return (
    <div className="rounded border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold text-gray-900">Activities</h2>

      <Tabs defaultValue="emails">
        <TabsList className="mb-3 inline-flex h-auto w-auto gap-0 rounded-lg bg-gray-100 p-1">
          <TabsTrigger value="emails" className={TRIGGER_CLASS}>
            Emails
          </TabsTrigger>
        </TabsList>

        <TabsContent value="emails">
          <ContactEmailsTab contactUuid={contactUuid} contactEmail={contact.email} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
