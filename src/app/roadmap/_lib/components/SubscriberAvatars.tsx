"use client";

import { displayName, initials } from "../hooks/useRoadmapUsers";
import type { SimpleUser } from "../types";

// Consistent color per uuid (cycles through 8 muted colors)
const AVATAR_COLORS = [
  "bg-blue-200 text-blue-800",
  "bg-purple-200 text-purple-800",
  "bg-green-200 text-green-800",
  "bg-amber-200 text-amber-800",
  "bg-rose-200 text-rose-800",
  "bg-teal-200 text-teal-800",
  "bg-indigo-200 text-indigo-800",
  "bg-orange-200 text-orange-800",
];

function colorFor(uuid: string): string {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) hash = (hash * 31 + uuid.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

type Props = {
  userUuids: string[];
  userMap: Map<string, SimpleUser>;
  max?: number;
};

export function SubscriberAvatars({ userUuids, userMap, max = 3 }: Props) {
  if (userUuids.length === 0) return null;

  const visible = userUuids.slice(0, max);
  const overflow = userUuids.length - max;

  const allNames = userUuids.map((uuid) => displayName(userMap.get(uuid))).join("\n");

  return (
    <div className="relative flex items-center group" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center">
        {visible.map((uuid, i) => {
          const user = userMap.get(uuid);
          return (
            <span
              key={uuid}
              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold border-2 border-white select-none ${colorFor(uuid)}`}
              style={{ marginLeft: i === 0 ? 0 : "-6px", zIndex: visible.length - i }}
            >
              {initials(user)}
            </span>
          );
        })}
        {overflow > 0 && (
          <span
            className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold border-2 border-white bg-gray-200 text-gray-600 select-none"
            style={{ marginLeft: "-6px", zIndex: 0 }}
          >
            +{overflow}
          </span>
        )}
      </div>

      {/* Tooltip */}
      <div className="pointer-events-none absolute bottom-full left-0 mb-1.5 hidden group-hover:block z-50">
        <div className="bg-gray-900 text-white text-xs rounded px-2 py-1.5 whitespace-pre shadow-lg leading-5">
          {allNames}
        </div>
      </div>
    </div>
  );
}
