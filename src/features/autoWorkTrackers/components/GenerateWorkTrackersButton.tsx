"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateWorkTrackers, type GenerateWorkTrackersResult } from "../api/generateWorkTrackers";

/** Creates a draft work tracker for every trip the chosen zone needs in the chosen week. */
export function GenerateWorkTrackersButton({
  zoneId,
  weekStart,
}: {
  zoneId: string;
  weekStart: string;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateWorkTrackersResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      setResult(await generateWorkTrackers({ zoneId, weekStart }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Button onClick={handleClick} disabled={!zoneId || loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Create work trackers
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <p className="text-sm text-gray-600" data-testid="generate-work-trackers-result">
          Created {result.created.length} draft work tracker
          {result.created.length === 1 ? "" : "s"} for {result.bleachers_needing_trips} of{" "}
          {result.bleachers_in_zone} bleachers.
        </p>
      )}
    </div>
  );
}
