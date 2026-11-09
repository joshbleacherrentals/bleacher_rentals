import { driverInitials } from "../utils/auditFormat";

type Props = {
  name: string;
  /** `md` sits in a table row, `lg` beside the driver's name on the driver page. */
  size?: "md" | "lg";
};

const SIZES = {
  md: "size-8 text-xs",
  lg: "size-11 text-sm",
} as const;

/**
 * A round badge with the driver's initials. Decoration only: the name is always printed beside it,
 * so it is hidden from screen readers. The letters are drawn by CSS (`::before` from
 * `data-initials`), not written into the page, so they are not part of the text of the table cell
 * the badge sits in: a test or a copy of that cell still reads just the name.
 */
export function AuditAvatar({ name, size = "md" }: Props) {
  return (
    <span
      aria-hidden="true"
      data-testid="audit-avatar"
      data-initials={driverInitials(name)}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full bg-darkBlue/10 font-semibold text-darkBlue before:content-[attr(data-initials)] ${SIZES[size]}`}
    />
  );
}
