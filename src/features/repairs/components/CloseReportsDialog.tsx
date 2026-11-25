"use client";

import { useState, type ElementType } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  choiceFromSwitches,
  closeSections,
  initialSwitches,
  type CloseCandidate,
  type CloseChoice,
} from "../utils/closeReports";
import type { DamageLevel } from "../utils/repairDetails";
import { REPAIR_LAYER_CLASS } from "../utils/repairLayer";
import { BleacherChip } from "./RepairChips";

/**
 * The dialog that asks which open damage reports to close when a repair is Completed: one row per
 * report with a switch (on = close), a section for the reports linked to the repair and one for the
 * free reports of the added bleachers, Cancel and Confirm. Cancel, Esc and a click outside are Cancel.
 * docs/specs/repairs-08a-choose-reports-to-close.md §2.2 and §3 (D241 to D243, D248, D250). The reports
 * are the ones `readCloseCandidates` found; the choice is `choiceFromSwitches`.
 */

const LEVEL_CLASS: Record<DamageLevel, string> = {
  none: "text-green-700",
  minor: "text-yellow-700",
  major: "text-red-700",
};

function CloseSwitch({
  on,
  label,
  onToggle,
}: {
  on: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      data-testid="close-report-switch"
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[#1d62a3] focus-visible:ring-offset-2 focus-visible:outline-none ${
        on ? "bg-[#1d62a3]" : "bg-gray-300"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function ReportRow({
  candidate,
  on,
  onToggle,
}: {
  candidate: CloseCandidate;
  on: boolean;
  onToggle: () => void;
}) {
  const number = candidate.bleacherNumber === null ? "?" : String(candidate.bleacherNumber);
  const reported = `Reported ${candidate.day}${candidate.createdBy ? ` by ${candidate.createdBy}` : ""}`;
  const levels = `Seat: ${candidate.seat}, Haul: ${candidate.haul}`;
  return (
    <div
      data-testid="close-report-row"
      data-report-id={candidate.id}
      data-group={candidate.group}
      className="flex items-start gap-3 rounded-lg border border-[#e5e7eb] bg-white p-3"
    >
      <div className="flex w-24 shrink-0 flex-col items-start gap-1 pt-0.5">
        <CloseSwitch
          on={on}
          label={`Close report of bleacher #${number} reported ${candidate.day}`}
          onToggle={onToggle}
        />
        <span className="text-xs font-medium text-gray-600">{on ? "Close" : "Keep open"}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <BleacherChip number={candidate.bleacherNumber} />
          <span className="text-sm text-gray-700">{reported}</span>
        </div>
        <div className="mt-1 flex gap-3 text-xs">
          <span className={`font-medium ${LEVEL_CLASS[candidate.seat]}`}>{levels}</span>
        </div>
        {candidate.note && (
          <p className="mt-1 line-clamp-3 text-sm whitespace-pre-wrap text-gray-700">
            {candidate.note}
          </p>
        )}
      </div>
    </div>
  );
}

export type CloseReportsDialogContentProps = {
  candidates: readonly CloseCandidate[];
  switches: Readonly<Record<string, boolean>>;
  onToggle: (id: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  /** The dialog gives its own title and description (Radix needs them inside its context). */
  Title?: ElementType;
  Description?: ElementType;
};

/** The inside of the dialog, exported so that it is tested without a portal. */
export function CloseReportsDialogContent({
  candidates,
  switches,
  onToggle,
  onCancel,
  onConfirm,
  Title = "h2",
  Description = "p",
}: CloseReportsDialogContentProps) {
  const sections = closeSections(candidates);
  const both = sections.linked.length > 0 && sections.free.length > 0;

  const section = (group: "linked" | "free", heading: string, rows: CloseCandidate[]) =>
    rows.length === 0 ? null : (
      <section data-testid="close-section" data-group={group} className="flex flex-col gap-2">
        {both && <h3 className="text-sm font-semibold text-[#10365a]">{heading}</h3>}
        {rows.map((candidate) => (
          <ReportRow
            key={candidate.id}
            candidate={candidate}
            on={switches[candidate.id] === true}
            onToggle={() => onToggle(candidate.id)}
          />
        ))}
      </section>
    );

  return (
    <div data-testid="close-reports-dialog" className="flex max-h-[85vh] flex-col">
      <div className="flex flex-col gap-1 px-6 pt-6 pb-3">
        <Title className="text-lg leading-none font-semibold text-[#10365a]">
          Close damage reports?
        </Title>
        <Description className="text-sm text-gray-600">
          Choose which of the open damage reports to close.
        </Description>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-2">
        {section("linked", "Linked to this repair", sections.linked)}
        {section("free", "Open reports of the added bleachers", sections.free)}
      </div>
      <div className="flex justify-end gap-2 border-t border-[#e5e7eb] px-6 py-4">
        <Button
          type="button"
          variant="outline"
          data-testid="close-reports-cancel"
          className="cursor-pointer rounded-sm"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          data-testid="close-reports-confirm"
          className="cursor-pointer rounded-sm"
          onClick={onConfirm}
        >
          Confirm
        </Button>
      </div>
    </div>
  );
}

/**
 * Always open: the hook mounts it only while it asks. Confirm resolves the choice together with the
 * moment of the click (D239); Cancel, Esc and a click outside call `onCancel`.
 */
export function CloseReportsDialog({
  candidates,
  onCancel,
  onConfirm,
}: {
  candidates: readonly CloseCandidate[];
  onCancel: () => void;
  onConfirm: (choice: CloseChoice) => void;
}) {
  const [switches, setSwitches] = useState(() => initialSwitches(candidates));

  return (
    <Dialog open onOpenChange={(next) => !next && onCancel()}>
      <DialogContent
        className={`${REPAIR_LAYER_CLASS} gap-0 overflow-hidden p-0 sm:max-w-xl`}
        overlayClassName={REPAIR_LAYER_CLASS}
      >
        <CloseReportsDialogContent
          candidates={candidates}
          switches={switches}
          onToggle={(id) => setSwitches((current) => ({ ...current, [id]: !current[id] }))}
          onCancel={onCancel}
          onConfirm={() =>
            onConfirm({
              ...choiceFromSwitches(candidates, switches),
              confirmedAt: new Date().toISOString(),
            })
          }
          Title={DialogTitle}
          Description={DialogDescription}
        />
      </DialogContent>
    </Dialog>
  );
}
