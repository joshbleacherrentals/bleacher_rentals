"use client";

import { Info } from "lucide-react";
import { AppTooltip } from "@/components/AppTooltip";

type InfoTooltipProps = {
  /** What the tooltip says on hover. */
  content: string;
  /** Names the icon for screen readers, e.g. "About Amount Due". */
  label: string;
  /**
   * Whether keyboard focus can land on the icon. Turn it off inside a button
   * (a tab, say): a button within a button is not valid HTML, and the outer
   * control is already the focus stop.
   */
  focusable?: boolean;
};

const TRIGGER_CLASS = "inline-flex shrink-0 items-center text-gray-500 hover:text-gray-700";

/** A small (i) that explains its neighbour when hovered. */
export function InfoTooltip({ content, label, focusable = true }: InfoTooltipProps) {
  const icon = <Info className="size-3.5" aria-hidden />;
  return (
    <AppTooltip content={content} className="max-w-xs text-left">
      {focusable ? (
        <button type="button" aria-label={label} className={`${TRIGGER_CLASS} cursor-help`}>
          {icon}
        </button>
      ) : (
        <span role="img" aria-label={label} className={TRIGGER_CLASS}>
          {icon}
        </span>
      )}
    </AppTooltip>
  );
}
