"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ClientNote } from "../../../utils/clientNotes";

type NoteTextProps = {
  text: string;
  expanded: boolean;
  /** Whether the text is long enough to need the Show more / Show less toggle. */
  canExpand: boolean;
  onToggle: () => void;
  textRef?: React.Ref<HTMLParagraphElement>;
};

export function NoteText({ text, expanded, canExpand, onToggle, textRef }: NoteTextProps) {
  return (
    <>
      <p
        ref={textRef}
        className={cn(
          "text-sm text-amber-950 whitespace-pre-wrap break-words",
          !expanded && "line-clamp-3",
        )}
      >
        {text}
      </p>
      {canExpand && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="mt-0.5 text-xs font-medium text-amber-800 underline hover:text-amber-950"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </>
  );
}

function ClampedNoteText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  // Only a clamped paragraph can tell whether it is cut off, so measure while collapsed —
  // and again whenever its width changes, since that changes where it wraps.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <NoteText
      text={text}
      expanded={expanded}
      canExpand={overflowing || expanded}
      onToggle={() => setExpanded((v) => !v)}
      textRef={ref}
    />
  );
}

/**
 * Notes saved on the picked contact and its company, shown under the contact so whoever is
 * writing the quote sees them. Read-only and internal — never copied onto the quote.
 */
export function ClientNotes({ notes }: { notes: ClientNote[] }) {
  if (notes.length === 0) return null;

  return (
    <div className="mt-2 space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
      {notes.map((note) => (
        // Keyed by content: a note edited elsewhere remounts, so it starts collapsed again.
        <div key={`${note.label}\n${note.text}`}>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            {note.label}
          </div>
          <ClampedNoteText text={note.text} />
        </div>
      ))}
    </div>
  );
}
