"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { RotateCcw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { expect, typedExecute, useTypedQuery } from "@/lib/powersync/typedQuery";
import { db } from "@/components/providers/SystemProvider";
import { useUserAccess } from "@/features/userAccess/hooks/useUserAccess";
import { useCurrentUser } from "@/hooks/db/useCurrentUser";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { useAutoWorkTrackerSettings } from "../hooks/useAutoWorkTrackerSettings";
import { saveSettingStatement } from "../db/settings";
import {
  DEFAULT_SETTINGS,
  SETTING_FIELDS,
  isValidNumber,
  storedValue,
  type NumberField,
  type SettingField,
} from "../planner/settings";

const optionLabel = (field: SettingField, value: string | number) =>
  field.type === "choice"
    ? (field.options.find((o) => o.value === value)?.label ?? String(value))
    : `${value} ${field.unit}`;

/** A number setting's box: saved when it loses focus or on Enter, if the number is allowed. */
function NumberInput({
  field,
  value,
  disabled,
  onSave,
}: {
  field: NumberField;
  value: number;
  disabled: boolean;
  onSave: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const n = Number(draft);
  const valid = draft.trim() !== "" && isValidNumber(field, n);
  const commit = () => {
    if (!valid) return;
    if (n !== value) onSave(n);
  };
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={field.min}
          max={field.max}
          step={1}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className={`w-24 rounded-md border px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-500 ${
            valid ? "border-gray-300" : "border-red-500"
          }`}
          aria-label={field.label}
          data-testid={`setting-${field.key}`}
        />
        <span className="text-sm text-gray-600">{field.unit}</span>
      </div>
      {!valid && (
        <span className="text-xs text-red-600">
          A whole number from {field.min} to {field.max}.
        </span>
      )}
    </div>
  );
}

/**
 * The Advanced settings window of Auto Work Trackers: the model's settings, each with its help, its
 * value, and whether it is the default. Admins change them (each saved as soon as it is changed, for
 * every zone, used by the next Create); everyone else reads them. "Reset to default" stores nothing,
 * so the app's default applies (settings.ts).
 */
export function AdvancedSettingsButton() {
  const access = useUserAccess();
  const isAdmin = access.status === "active" && access.roles.includes("admin");
  const { data: me } = useCurrentUser();
  const myUuid = me?.[0]?.id ?? null;
  const { row, settings } = useAutoWorkTrackerSettings();

  const byCompiled = useMemo(
    () =>
      db
        .selectFrom("Users")
        .select(["first_name", "last_name"])
        .where("id", "=", row?.updated_by_user_uuid ?? "__none__")
        .compile(),
    [row?.updated_by_user_uuid],
  );
  const { data: by } = useTypedQuery(
    byCompiled,
    expect<{ first_name: string | null; last_name: string | null }>(),
  );
  const byName = by?.[0] ? [by[0].first_name, by[0].last_name].filter(Boolean).join(" ") : null;

  const save = async (field: SettingField, value: string | number | null) => {
    // Choosing the default value stores null, so it stays "default" if the default changes later.
    const stored = value === DEFAULT_SETTINGS[field.key] ? null : value;
    try {
      await typedExecute(saveSettingStatement(field.column, stored, myUuid));
    } catch (e) {
      createErrorToastNoThrow([
        `Could not save ${field.label}`,
        e instanceof Error ? e.message : String(e),
      ]);
    }
  };

  const editable = isAdmin && !!row;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          data-testid="advanced-settings-button"
        >
          <Settings2 className="mr-2 h-4 w-4" />
          Advanced settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Advanced settings</DialogTitle>
          <DialogDescription>
            How Create work trackers plans, for every zone. Changes apply to the next run.
            {!isAdmin && " Only admins can change them."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col divide-y" data-testid="advanced-settings">
          {SETTING_FIELDS.map((field) => {
            const stored = storedValue(field, row);
            const value = settings[field.key];
            const isDefault = stored == null;
            const dimmed =
              field.key === "employeePriorityMinutes" && settings.employeePriority !== "prefer";
            return (
              <div
                key={field.key}
                className={`flex flex-col gap-1.5 py-3 ${dimmed ? "opacity-50" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{field.label}</span>
                  {isDefault ? (
                    <span className="text-xs text-gray-500">Default</span>
                  ) : (
                    <span className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-amber-700">
                        Changed (default: {optionLabel(field, DEFAULT_SETTINGS[field.key])})
                      </span>
                      {editable && (
                        <button
                          type="button"
                          onClick={() => save(field, null)}
                          className="inline-flex cursor-pointer items-center gap-1 text-blue-700 hover:underline"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Reset to default
                        </button>
                      )}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600">{field.help}</p>
                {field.type === "choice" ? (
                  <select
                    value={String(value)}
                    disabled={!editable}
                    onChange={(e) => save(field, e.target.value)}
                    className="w-56 rounded-md border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                    aria-label={field.label}
                    data-testid={`setting-${field.key}`}
                  >
                    {field.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <NumberInput
                    field={field}
                    value={value as number}
                    disabled={!editable}
                    onSave={(v) => save(field, v)}
                  />
                )}
              </div>
            );
          })}
        </div>

        {row?.updated_at && (
          <p className="text-xs text-gray-500">
            Last changed {DateTime.fromISO(row.updated_at).toFormat("MMM d, yyyy 'at' h:mm a")}
            {byName ? ` by ${byName}` : ""}.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
