"use client";

type DateRangeInputProps = {
  label: string;
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
};

const INPUT_CLASS =
  "w-full min-w-0 px-2 py-1 border rounded text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-darkBlue focus:border-0";

export function DateRangeInput({ label, from, to, onChange }: DateRangeInputProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <input
        type="date"
        aria-label={`${label} From`}
        title={`${label} from`}
        value={from ?? ""}
        onChange={(e) => onChange(e.target.value || null, to)}
        className={INPUT_CLASS}
      />
      <input
        type="date"
        aria-label={`${label} To`}
        title={`${label} to`}
        value={to ?? ""}
        onChange={(e) => onChange(from, e.target.value || null)}
        className={INPUT_CLASS}
      />
    </div>
  );
}
