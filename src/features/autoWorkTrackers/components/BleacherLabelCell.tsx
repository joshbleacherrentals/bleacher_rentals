import type { CSSProperties } from "react";
import { bleacherNumberColor } from "../utils/bleacherLabelStyle";
import type { GridBleacher } from "../hooks/useZoneBleachers";

/** White, or the dashboard's 10% black wash over it for a bleacher the viewer cannot access. */
export const tileBackground = (isAccessible: boolean) => (isAccessible ? "#ffffff" : "#e6e6e6");

const text = (style: CSSProperties): CSSProperties => ({
  position: "absolute",
  whiteSpace: "nowrap",
  ...style,
});

/**
 * One bleacher's label, laid out like the dashboard's left column (BleacherCell.ts): the number,
 * then rows and seats, the zone, the storage location, and a map pin when a device is assigned.
 * Positions are in pixels on a 175 x 50 cell, the same as the Pixi cell.
 */
export function BleacherLabelCell({ bleacher }: { bleacher: GridBleacher }) {
  const { isAccessible } = bleacher;
  return (
    <div
      className="relative h-[50px] border-r border-b border-black/15"
      style={{ background: tileBackground(isAccessible) }}
      data-testid="bleacher-label-cell"
    >
      <span
        style={text({
          left: 3,
          top: 2,
          fontSize: 16,
          fontWeight: 700,
          lineHeight: "18px",
          color: bleacherNumberColor(bleacher.bleacherRows, isAccessible),
        })}
      >
        {bleacher.bleacherNumber}
      </span>

      {bleacher.hasDevice && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/map-pin.png"
          alt="Tracking device assigned"
          width={12}
          height={12}
          style={{ position: "absolute", left: 29, top: 6 }}
        />
      )}

      {bleacher.storageLocationName && (
        <span
          style={text({
            left: 46,
            top: 6,
            fontSize: 10,
            lineHeight: "12px",
            color: "#9a9a9a",
          })}
        >
          {bleacher.storageLocationName.slice(0, 15)}
        </span>
      )}

      <span style={text({ left: 3, top: 18, fontSize: 11, lineHeight: "13px", color: "#6b6b6b" })}>
        {`${bleacher.bleacherRows}row`}
      </span>
      <span style={text({ left: 40, top: 18, fontSize: 11, lineHeight: "13px", color: "#6b6b6b" })}>
        {`${bleacher.bleacherSeats}seats`}
      </span>
      <span style={text({ left: 3, top: 31, fontSize: 11, lineHeight: "13px", color: "#6b6b6b" })}>
        {bleacher.zoneName ?? ""}
      </span>
    </div>
  );
}
