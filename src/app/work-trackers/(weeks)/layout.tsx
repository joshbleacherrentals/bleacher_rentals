"use client";
import { Color } from "@/types/Color";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { fetchUserByUuid } from "@/features/workTrackers/db/db";
import { DateTime } from "luxon";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";

export default function WorkTrackersLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const userUuid = params.userUuid as string | undefined;
  const startDate = params.startDate as string | undefined;
  const supabase = useClerkSupabaseClient();

  const { data: user } = useQuery({
    queryKey: ["user", userUuid],
    queryFn: async () => {
      if (userUuid === undefined) return null;
      return fetchUserByUuid(supabase, userUuid);
    },
    enabled: userUuid !== undefined,
  });
  const name = userUuid && user ? ` - ${user}` : "";
  const dateRange = startDate
    ? (() => {
        const start = DateTime.fromISO(startDate);
        if (!start.isValid) return "";

        const end = start.plus({ days: 6 });
        return ` - ${start.toFormat("MMMM d")} to ${end.toFormat("MMMM d")}`;
      })()
    : "";
  return (
    <main className="p-4">
      <div className="flex justify-between items-center mb-4">
        {/* Left Side: Title & Description */}
        <div>
          <h1 className="text-2xl text-darkBlue font-bold">
            Work Trackers{name}
            {dateRange}
          </h1>
          <p className="text-sm" style={{ color: Color.GRAY }}>
            Manage work trackers here.
          </p>
        </div>
      </div>
      {children}
    </main>
  );
}
