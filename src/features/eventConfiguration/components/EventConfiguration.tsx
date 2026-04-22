"use client";
import { useCurrentEventStore } from "../state/useCurrentEventStore";
import { EventConfigurationForm } from "./EventConfigurationForm";

type Props = {
  showSetupTeardown: boolean;
};

export const EventConfiguration = ({ showSetupTeardown }: Props) => {
  const isFormExpanded = useCurrentEventStore((s) => s.isFormExpanded);
  const isFormMinimized = useCurrentEventStore((s) => s.isFormMinimized);

  const showPanel = isFormExpanded && !isFormMinimized;

  return (
    <div
      className={`overflow-hidden transition-all duration-1000 ease-in-out mt-0 ml-2 ${
        showPanel ? "max-h-[500px]" : "-mt-2 max-h-0"
      }`}
    >
      <div className="shadow-lg border-x border-t border-gray-300 bg-white">
        <EventConfigurationForm showSetupTeardown={showSetupTeardown} />
      </div>
    </div>
  );
};
