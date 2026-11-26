import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  SETTING_FIELDS,
  describeSettings,
  isValidNumber,
  resolveSettings,
  storedValue,
  type NumberField,
  type SettingsRow,
} from "./settings";

const empty: SettingsRow = {
  objective: null,
  employee_priority: null,
  employee_priority_minutes: null,
  max_day_minutes: null,
  setup_minutes: null,
  teardown_minutes: null,
  day_start_hour: null,
  search_seconds: null,
  updated_at: null,
  updated_by_user_uuid: null,
};

const field = (key: string) => SETTING_FIELDS.find((f) => f.key === key)!;

describe("resolveSettings", () => {
  it("uses every default when nothing is set, or the row is not synced", () => {
    expect(resolveSettings(empty)).toEqual(DEFAULT_SETTINGS);
    expect(resolveSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("uses the values an admin set", () => {
    expect(
      resolveSettings({
        ...empty,
        objective: "time",
        employee_priority: "first",
        max_day_minutes: 600,
        setup_minutes: 90,
      }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      objective: "time",
      employeePriority: "first",
      maxDayMinutes: 600,
      setupMinutes: 90,
    });
  });

  it("falls back to the default for a value it does not know or out of range", () => {
    const s = resolveSettings({ ...empty, objective: "speed", search_seconds: 60 });
    expect(s.objective).toBe(DEFAULT_SETTINGS.objective);
    expect(s.searchSeconds).toBe(DEFAULT_SETTINGS.searchSeconds);
  });
});

describe("storedValue", () => {
  it("is null for a default, so the window can show it as one", () => {
    expect(storedValue(field("setupMinutes"), empty)).toBeNull();
    expect(storedValue(field("setupMinutes"), { ...empty, setup_minutes: 0 })).toBe(0);
  });
});

describe("SETTING_FIELDS", () => {
  it("has a field, a label and help for every setting, each default inside its range", () => {
    expect(SETTING_FIELDS.map((f) => f.key).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
    for (const f of SETTING_FIELDS) {
      expect(f.label && f.help).toBeTruthy();
      const d = DEFAULT_SETTINGS[f.key];
      if (f.type === "number") expect(isValidNumber(f, d as number)).toBe(true);
      else expect(f.options.map((o) => o.value)).toContain(d);
    }
  });

  it("refuses whole numbers outside the range and fractions", () => {
    const day = field("maxDayMinutes") as NumberField;
    expect([59, 60, 1440, 1441, 90.5].map((v) => isValidNumber(day, v))).toEqual([
      false,
      true,
      true,
      false,
      false,
    ]);
  });
});

describe("describeSettings", () => {
  it("names the settings a run used in one line", () => {
    expect(describeSettings(DEFAULT_SETTINGS)).toBe(
      "prefer employees (up to 2 h extra driving) · least distance · 12 h day from 7:00 · setup 60 min · teardown 60 min · 3 s search",
    );
  });
});
