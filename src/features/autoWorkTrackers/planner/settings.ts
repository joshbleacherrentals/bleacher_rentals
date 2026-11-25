/**
 * The Auto Work Trackers model's tunable settings: their defaults, labels, help text and ranges.
 * The values an admin has changed live in the AutoWorkTrackerSettings row (one row; null = the
 * default here), so a default is written only in this file and "Reset to default" sets the column
 * back to null. The database checks the same ranges. Pure.
 */

export type Objective = "distance" | "time";
export type EmployeePriority = "off" | "prefer" | "first";

export type PlannerSettings = {
  objective: Objective;
  employeePriority: EmployeePriority;
  employeePriorityMinutes: number;
  maxDayMinutes: number;
  setupMinutes: number;
  teardownMinutes: number;
  dayStartHour: number;
  searchSeconds: number;
};

/** The AutoWorkTrackerSettings row as read from the local database. */
export type SettingsRow = {
  objective: string | null;
  employee_priority: string | null;
  employee_priority_minutes: number | null;
  max_day_minutes: number | null;
  setup_minutes: number | null;
  teardown_minutes: number | null;
  day_start_hour: number | null;
  search_seconds: number | null;
  updated_at: string | null;
  updated_by_user_uuid: string | null;
};

export type SettingColumn = Exclude<keyof SettingsRow, "updated_at" | "updated_by_user_uuid">;

type Common<K extends keyof PlannerSettings> = {
  key: K;
  column: SettingColumn;
  label: string;
  help: string;
};
export type ChoiceField<K extends keyof PlannerSettings = keyof PlannerSettings> = Common<K> & {
  type: "choice";
  options: { value: string; label: string }[];
};
export type NumberField<K extends keyof PlannerSettings = keyof PlannerSettings> = Common<K> & {
  type: "number";
  unit: string;
  min: number;
  max: number;
};
export type SettingField = ChoiceField | NumberField;

export const DEFAULT_SETTINGS: PlannerSettings = {
  objective: "distance",
  employeePriority: "prefer",
  employeePriorityMinutes: 120,
  maxDayMinutes: 12 * 60,
  setupMinutes: 60,
  teardownMinutes: 60,
  dayStartHour: 7,
  searchSeconds: 3,
};

/** The settings in the order the Advanced settings window shows them. */
export const SETTING_FIELDS: SettingField[] = [
  {
    key: "employeePriority",
    column: "employee_priority",
    type: "choice",
    label: "Employees before contractors",
    help: "Off: employees and contractors are treated the same. Prefer: a contractor takes a trip only when that saves more driving than the number below. Employees first: a contractor only takes a trip no employee can fit in their day.",
    options: [
      { value: "off", label: "Off" },
      { value: "prefer", label: "Prefer employees" },
      { value: "first", label: "Employees first" },
    ],
  },
  {
    key: "employeePriorityMinutes",
    column: "employee_priority_minutes",
    type: "number",
    label: "How much to prefer employees",
    help: "With Prefer employees: how much extra driving an employee may do to take a trip before it goes to a contractor instead.",
    unit: "minutes",
    min: 0,
    max: 720,
  },
  {
    key: "objective",
    column: "objective",
    type: "choice",
    label: "Plan for the least",
    help: "What the model keeps as small as it can once every trip it can place is placed: kilometres driven, or hours driven (prefers faster roads such as highways).",
    options: [
      { value: "distance", label: "Distance" },
      { value: "time", label: "Drive time" },
    ],
  },
  {
    key: "maxDayMinutes",
    column: "max_day_minutes",
    type: "number",
    label: "Longest day",
    help: "A driver's day from leaving home to getting back, counting driving, setups and teardowns.",
    unit: "minutes",
    min: 60,
    max: 1440,
  },
  {
    key: "setupMinutes",
    column: "setup_minutes",
    type: "number",
    label: "Setup time",
    help: "Time on site to set a bleacher up at the event it is dropped at.",
    unit: "minutes",
    min: 0,
    max: 480,
  },
  {
    key: "teardownMinutes",
    column: "teardown_minutes",
    type: "number",
    label: "Teardown time",
    help: "Time on site to tear a bleacher down at the event it is picked up from.",
    unit: "minutes",
    min: 0,
    max: 480,
  },
  {
    key: "dayStartHour",
    column: "day_start_hour",
    type: "number",
    label: "Day starts at",
    help: "The hour drivers leave home; the suggested pickup and drop-off times count from it (0 is midnight, 13 is 1 pm).",
    unit: "o'clock",
    min: 0,
    max: 23,
  },
  {
    key: "searchSeconds",
    column: "search_seconds",
    type: "number",
    label: "Search time",
    help: "How long the model looks for a better plan. Longer can find a better plan, but the run waits for it.",
    unit: "seconds",
    min: 1,
    max: 6,
  },
];

const inRange = (f: NumberField, v: number | null): v is number =>
  v != null && Number.isInteger(v) && v >= f.min && v <= f.max;

/** The value an admin set for a field, or null when it is the default (or not valid). */
export function storedValue(field: SettingField, row: SettingsRow | null): string | number | null {
  const v = row?.[field.column] ?? null;
  if (v == null) return null;
  if (field.type === "choice") return field.options.some((o) => o.value === v) ? v : null;
  return inRange(field, typeof v === "number" ? v : null) ? (v as number) : null;
}

/** The settings to plan with: each value from the row when set and valid, else its default. */
export function resolveSettings(row: SettingsRow | null): PlannerSettings {
  const settings: Record<string, string | number> = { ...DEFAULT_SETTINGS };
  for (const field of SETTING_FIELDS) {
    const v = storedValue(field, row);
    if (v != null) settings[field.key] = v;
  }
  return settings as PlannerSettings;
}

/** Whether a number is allowed for a field (the Advanced settings window checks before saving). */
export function isValidNumber(field: NumberField, v: number): boolean {
  return inRange(field, v);
}

const hours = (minutes: number) =>
  minutes % 60 === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;

/** One line naming the settings a run used, for the Create result. */
export function describeSettings(s: PlannerSettings): string {
  const priority =
    s.employeePriority === "off"
      ? "employees and contractors alike"
      : s.employeePriority === "first"
        ? "employees first"
        : `prefer employees (up to ${hours(s.employeePriorityMinutes)} extra driving)`;
  return [
    priority,
    `least ${s.objective === "time" ? "drive time" : "distance"}`,
    `${hours(s.maxDayMinutes)} day from ${s.dayStartHour}:00`,
    `setup ${s.setupMinutes} min`,
    `teardown ${s.teardownMinutes} min`,
    `${s.searchSeconds} s search`,
  ].join(" · ");
}
