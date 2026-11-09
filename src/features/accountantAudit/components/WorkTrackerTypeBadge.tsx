import {
  WORK_TRACKER_TYPE_STYLES,
  WORK_TRACKER_TYPE_STYLE_FALLBACK,
} from "@/features/workTrackers/constants";

type Props = { code: string | null; name: string | null };

/**
 * The Type cell of the Audit table: a coloured badge with the type's icon (D10). Colour and icon
 * come from the type's stable `code`; the words come from its display name (R4).
 * docs/specs/accountant-audit-04-table.md §3
 */
export function WorkTrackerTypeBadge({ code, name }: Props) {
  if (name === null) return <span className="text-sm text-gray-400">–</span>;

  const style =
    code !== null && Object.hasOwn(WORK_TRACKER_TYPE_STYLES, code)
      ? WORK_TRACKER_TYPE_STYLES[code]
      : WORK_TRACKER_TYPE_STYLE_FALLBACK;
  const Icon = style.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[13px] font-medium ${style.bg} ${style.border} ${style.text}`}
    >
      <Icon aria-hidden="true" width={14} height={14} />
      {name}
    </span>
  );
}
