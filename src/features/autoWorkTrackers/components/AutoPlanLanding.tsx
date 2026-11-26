"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useCurrentUser } from "@/hooks/db/useCurrentUser";
import { useZoneWeekParams } from "../hooks/useZoneWeekParams";
import { PLAN_STEPS, planWeek, type PlanStep, type PlanWeekResult } from "../planner/planWeek";
import { describeSettings } from "../planner/settings";
import { summarizeUnassigned } from "../utils/unassignedSummary";
import { AREAS, areaOfSlug, areaPages, pageHref } from "../utils/pages";
import { ZoneWeekPicker } from "./ZoneWeekPicker";

const STEP_LABEL: Record<PlanStep, string> = {
  reading: "Reading every event and bleacher move",
  roads: "Getting real road times",
  solving: "Optimizing routes across your drivers",
  writing: "Writing the work trackers and pay",
};

type Phase =
  | { kind: "idle" }
  | { kind: "running"; step: PlanStep }
  | { kind: "done"; result: PlanWeekResult }
  | { kind: "error"; message: string };

/** The glowing, spinning ring shown while the planner works. */
function Thinking() {
  return (
    <div className="relative h-28 w-28" aria-hidden>
      <div className="absolute inset-0 animate-spin rounded-full bg-[conic-gradient(from_0deg,#8b5cf6,#3b82f6,#06b6d4,#8b5cf6)] [animation-duration:1.6s]" />
      <div className="absolute inset-[6px] rounded-full bg-white" />
      <div className="absolute inset-0 animate-ping rounded-full bg-violet-400/20 [animation-duration:2s]" />
      <Sparkles className="absolute inset-0 m-auto h-10 w-10 animate-pulse text-violet-600" />
    </div>
  );
}

function Steps({ current }: { current: PlanStep }) {
  const at = PLAN_STEPS.indexOf(current);
  return (
    <ol className="flex flex-col gap-2 text-sm" data-testid="auto-plan-steps">
      {PLAN_STEPS.map((s, i) => (
        <li
          key={s}
          className={cn(
            "flex items-center gap-2 transition-opacity",
            i > at && "opacity-40",
            i === at && "font-medium text-violet-700",
          )}
        >
          {i < at ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : i === at ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <span className="h-4 w-4 rounded-full border border-gray-300" />
          )}
          {STEP_LABEL[s]}
          {i === at && "…"}
        </li>
      ))}
    </ol>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-white/70 p-4 text-center shadow-sm ring-1 ring-black/5">
      <div className="text-3xl font-bold text-gray-900 tabular-nums">{value}</div>
      <div className="mt-1 text-xs tracking-wide text-gray-500 uppercase">{label}</div>
    </div>
  );
}

/**
 * Auto Generate's landing page: the AI planner, front and centre. Pick a zone and week, press Generate,
 * and planWeek reads the events, finds every trip, gets road times, has the solver place the trips
 * on drivers' days and writes the draft work trackers with their line items. The steps show as they
 * run; the result links to the checks and the run.
 */
export function AutoPlanLanding() {
  const { zoneId, weekStart, setZoneId, setWeekStart } = useZoneWeekParams();
  const supabase = useClerkSupabaseClient();
  const { data: me } = useCurrentUser();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const running = phase.kind === "running";

  const generate = async () => {
    if (!supabase || !zoneId) return;
    setPhase({ kind: "running", step: "reading" });
    try {
      const result = await planWeek({
        zoneId,
        weekStart,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        supabase,
        userUuid: me?.[0]?.id ?? null,
        onStep: (step) => setPhase({ kind: "running", step }),
      });
      setPhase({ kind: "done", result });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : "Request failed." });
    }
  };

  // The checks live in Verify, the runs here in Auto Generate.
  const href = (slug: string) => {
    const area = areaOfSlug(slug) ?? AREAS.auto;
    const page = areaPages(area).find((p) => p.slug === slug) ?? area.home;
    return pageHref(area, page, zoneId, weekStart);
  };

  return (
    <div
      className="relative flex min-h-full justify-center overflow-hidden bg-gradient-to-br from-violet-50 via-white to-cyan-50"
      data-testid="auto-plan"
    >
      <div className="w-full max-w-3xl px-8 py-16 sm:px-14">
        {/* Soft glows in the page's corners, behind the content. */}
        <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-violet-300/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-cyan-300/30 blur-3xl" />

        <div className="relative flex flex-col items-center gap-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold tracking-wide text-violet-700 uppercase">
              <Sparkles className="h-3.5 w-3.5" />
              AI planner
            </span>
            <h1 className="max-w-xl bg-gradient-to-r from-violet-700 via-blue-600 to-cyan-600 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">
              Plan the whole week in one click
            </h1>
            <p className="max-w-lg text-base text-gray-600">
              It reads every event, finds every trip, and gives each one a driver, a day and a
              route, with setups, teardowns and pay. Work that takes hours by hand, done in seconds.
              Everything it makes is a draft you can review and change.
            </p>
          </div>

          <div className="w-full max-w-md rounded-2xl bg-white/80 p-4 text-left shadow-sm ring-1 ring-black/5">
            <ZoneWeekPicker
              idPrefix="auto-plan"
              zoneId={zoneId}
              weekStart={weekStart}
              onZoneChange={setZoneId}
              onWeekChange={setWeekStart}
            />
          </div>

          {phase.kind === "running" ? (
            <div className="flex flex-col items-center gap-6" role="status" aria-live="polite">
              <Thinking />
              <Steps current={phase.step} />
            </div>
          ) : (
            <button
              type="button"
              onClick={generate}
              disabled={!zoneId || !supabase || running}
              className="group relative inline-flex cursor-pointer items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-600 via-blue-600 to-cyan-500 px-10 py-5 text-lg font-semibold text-white shadow-[0_10px_40px_-10px_rgba(124,58,237,0.7)] transition-all hover:scale-[1.03] hover:shadow-[0_14px_50px_-10px_rgba(124,58,237,0.9)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
              data-testid="auto-plan-generate"
            >
              <Sparkles className="h-6 w-6 transition-transform group-hover:rotate-12" />
              {phase.kind === "done" ? "Generate again" : "Generate work trackers"}
            </button>
          )}
          {!zoneId && phase.kind === "idle" && (
            <p className="-mt-4 text-sm text-gray-500">Pick a zone to start.</p>
          )}

          {phase.kind === "error" && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {phase.message}
            </div>
          )}

          {phase.kind === "done" && (
            <div className="flex w-full flex-col gap-5" data-testid="auto-plan-result">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat value={phase.result.created} label="Work trackers" />
                <Stat value={phase.result.bleachers} label="Bleachers" />
                <Stat value={phase.result.driverDays} label="Driver-days" />
                <Stat
                  value={phase.result.setups + phase.result.teardowns}
                  label="Setups & teardowns"
                />
              </div>
              {phase.result.alreadyPlanned > 0 && (
                <p className="text-sm text-gray-500">
                  {phase.result.alreadyPlanned} trip
                  {phase.result.alreadyPlanned === 1 ? " was" : "s were"} already planned, so it
                  left {phase.result.alreadyPlanned === 1 ? "it" : "them"} alone.
                </p>
              )}
              {phase.result.unplaced.length > 0 && (
                <p className="text-sm text-amber-700">
                  {summarizeUnassigned(phase.result.unplaced)}
                </p>
              )}
              <p className="text-xs text-gray-400">
                Settings: {describeSettings(phase.result.settings)}.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  href={href("dashboard")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
                >
                  Review the checks
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href={href("model-runs")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 ring-1 ring-black/10 hover:bg-gray-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  See this run
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
