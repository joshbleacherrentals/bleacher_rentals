"use client";
import { useState } from "react";

export type TeamTab = "admins" | "account-managers" | "drivers" | "developers" | "all";

const tabs = [
  { id: "admins" as const, label: "Admins" },
  { id: "account-managers" as const, label: "Account Managers" },
  { id: "drivers" as const, label: "Drivers" },
  { id: "developers" as const, label: "Developers" },
  { id: "all" as const, label: "All" },
];

type TabNavigationProps = {
  activeTab: TeamTab;
  onTabChange: (tab: TeamTab) => void;
};

export default function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <div className="flex justify-start">
      <div className="flex border border-gray-300 bg-gray-100 rounded-lg overflow-hidden">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-4 py-2 text-sm font-semibold transition ${
              activeTab === tab.id
                ? "bg-darkBlue text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
