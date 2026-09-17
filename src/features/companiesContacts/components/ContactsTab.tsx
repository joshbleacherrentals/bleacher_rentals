"use client";

import { useState, useMemo } from "react";
import { Search, Plus } from "lucide-react";
import { useContactsAll } from "../hooks/useContactsAll";
import { filterContacts } from "../utils/searchFilter";
import { CreateContactModal } from "./CreateContactModal";
import { ContactDetailModal } from "./ContactDetailModal";
import type { ContactFull } from "../hooks/useContactsAll";

export function ContactsTab() {
  const { contacts, isLoading } = useContactsAll();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<ContactFull | null>(null);

  const filtered = useMemo(() => filterContacts(contacts, query), [contacts, query]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts..."
            className="bg-gray-100 rounded-full h-8 pl-8 pr-4 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-400/30 placeholder:text-gray-400 w-56 transition-all"
          />
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 h-8 px-3.5 text-sm font-medium text-white bg-darkBlue rounded-md hover:bg-lightBlue transition cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          New Contact
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400 py-12 text-center">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-12 text-center">
          {query ? "No contacts match your search." : "No contacts yet."}
        </p>
      ) : (
        <div className="rounded-xl border border-gray-100 shadow-sm overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Phone
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Company
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((contact) => (
                <tr
                  key={contact.id}
                  onClick={() => setSelected(contact)}
                  className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {contact.firstName} {contact.lastName ?? ""}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{contact.email ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{contact.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{contact.company?.companyName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateContactModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
      <ContactDetailModal contact={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
