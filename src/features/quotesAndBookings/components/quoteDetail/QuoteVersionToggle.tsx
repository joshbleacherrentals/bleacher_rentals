"use client";

export type QuotePageVersion = 1 | 2;

const VERSIONS: QuotePageVersion[] = [1, 2];

/** Switches the quote page between the current layout (1) and the new one (2). */
export function QuoteVersionToggle({
  value,
  onChange,
}: {
  value: QuotePageVersion;
  onChange: (version: QuotePageVersion) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Page version"
      className="flex items-center rounded-md border border-white/30 p-0.5"
    >
      {VERSIONS.map((version) => (
        <button
          key={version}
          type="button"
          aria-pressed={value === version}
          onClick={() => onChange(version)}
          className={`px-3 py-1 text-sm font-medium rounded cursor-pointer transition ${
            value === version ? "bg-white text-darkBlue" : "text-white/70 hover:text-white"
          }`}
        >
          {version}
        </button>
      ))}
    </div>
  );
}
