"use client";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "contract", label: "Contract" },
  { value: "billing", label: "Billing" },
  { value: "files", label: "Files" },
  { value: "log", label: "Log" },
  { value: "messages", label: "Messages" },
] as const;

const SUBMISSION_TAB = { value: "submission", label: "Submission" } as const;

/**
 * The tab list of the quote page: the tabs centered on a strip in the header colour. Must be
 * rendered inside the page's `Tabs`. The Submission tab is only for quotes made from the website form.
 */
export function QuoteTabBar({ showSubmission = false }: { showSubmission?: boolean }) {
  const tabs = showSubmission ? [...TABS, SUBMISSION_TAB] : TABS;
  return (
    <div className="bg-linear-to-r from-gray-800 to-gray-600 px-6 flex justify-center">
      <TabsList className="bg-transparent h-auto p-0 gap-1 rounded-none">
        {tabs.map(({ value, label }) => (
          <TabsTrigger
            key={value}
            value={value}
            className="h-full text-base rounded-none rounded-t-xs cursor-pointer transition-colors duration-200 bg-black/20 text-white not-data-[state=active]:hover:bg-black/35 data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-none px-12 py-4"
          >
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}
