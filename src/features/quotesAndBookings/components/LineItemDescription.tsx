type LineItemDescriptionProps = {
  description: string | null | undefined;
  className?: string;
};

/**
 * A line item's description as plain text. `whitespace-pre-line` keeps the
 * paragraphs and "- bullet" lines it was written with; nothing is parsed.
 */
export function LineItemDescription({ description, className }: LineItemDescriptionProps) {
  if (!description?.trim()) return null;
  return (
    <span className={`block whitespace-pre-line text-xs text-gray-500 ${className ?? ""}`.trim()}>
      {description}
    </span>
  );
}
