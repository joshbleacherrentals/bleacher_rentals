"use client";

import type { SubmissionRow, SubmissionSection } from "../../../utils/leadSubmissionView";

function Value({ row }: { row: SubmissionRow }) {
  if (row.value === null) return <span className="text-gray-400">(empty)</span>;
  if (row.href) {
    return (
      <a href={row.href} className="text-[#1f6fb2] hover:underline">
        {row.value}
      </a>
    );
  }
  return <span className="whitespace-pre-wrap break-words">{row.value}</span>;
}

/**
 * What the person typed into the website form this quote was created from, as it was received.
 * The quote's own fields were filled from it, but most of the form is free text, so this is the
 * place to read what was actually written.
 */
export function SubmissionTab({ sections }: { sections: SubmissionSection[] | null }) {
  if (!sections) {
    return (
      <p className="text-sm text-gray-500">This quote was not created from the website form.</p>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-lg font-bold text-gray-900 text-center">Website form submission</h2>
      <p className="text-sm text-gray-500 mb-4 text-center">
        Exactly what was entered on the website form. It is a record and cannot be edited.
      </p>

      {sections.map((section) => (
        <section key={section.title} className="mb-5" aria-label={section.title}>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
            {section.title}
          </h3>
          <dl>
            {section.rows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[11rem_1fr] gap-4 py-2.5 border-b border-gray-200 last:border-b-0"
              >
                <dt className="text-xs font-bold uppercase tracking-wide text-gray-600 pt-0.5">
                  {row.label}
                </dt>
                <dd className="text-[15px] text-gray-900">
                  <Value row={row} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
