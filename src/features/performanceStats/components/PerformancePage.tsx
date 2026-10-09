"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { PageHeaderWithBreadCrumbs } from "@/components/PageHeaderWithBreadCrumbs";
import { Button } from "@/components/ui/button";
import { developerGate } from "@/features/devEmailAllowlist/logic/developerGate";
import { mergeRoleConfigs } from "@/features/userAccess/accessConfig";
import { useUserAccess } from "@/features/userAccess/client";
import { usePerformanceStats } from "../hooks/usePerformanceStats";
import {
  ENVIRONMENTS,
  PERIODS,
  PERIOD_LABELS,
  buildSearch,
  parseView,
  resolveVersion,
  type PerformanceView,
} from "../logic/stats";
import { Breakdowns } from "./Breakdowns";
import { Block, ErrorsTable, HealthPanel, MetricsTable, SqliteTable } from "./StatTables";

/**
 * Performance — what the telemetry collected, for developers only.
 *
 * The PAGE is developer-only by the gate below, which only keeps everyone else from seeing an
 * empty page. The real fence is in the database: row-level security on `PerfEvents` and the
 * functions that read it give a non-developer nothing. The data is read straight from Supabase,
 * not through PowerSync. The whole view (period, environment, version, metric) is in the address.
 * Spec: docs/specs/performance-dashboard.md.
 */
export default function PerformancePage() {
  const access = useUserAccess();
  const gate = developerGate(access);
  const router = useRouter();

  const fallback = useMemo(
    () => (access.status === "active" ? mergeRoleConfigs(access.roles).defaultRedirect : "/"),
    [access],
  );

  useEffect(() => {
    if (gate === "redirect") router.replace(fallback);
  }, [gate, fallback, router]);

  // Nothing below runs for anyone else, so no request is made on their behalf.
  if (gate !== "allowed") return null;
  return <PerformanceContent />;
}

const pill = (active: boolean) =>
  `px-3 py-1.5 text-sm border first:rounded-l-lg last:rounded-r-lg -ml-px first:ml-0 ${
    active
      ? "bg-darkBlue text-white border-darkBlue"
      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
  }`;

function PerformanceContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const view = useMemo(() => parseView(searchParams.toString()), [searchParams]);
  const { filters, metric } = view;

  // The period is counted back from this moment; Refresh moves it.
  const [anchor, setAnchor] = useState(() => new Date());
  const stats = usePerformanceStats(filters, metric, anchor);

  const go = (next: PerformanceView) =>
    router.replace(`${pathname}${buildSearch(next)}`, { scroll: false });

  const versions = stats.versions.data?.map((row) => row.version) ?? [];

  // A version the period no longer has falls back to all versions.
  useEffect(() => {
    if (stats.versions.data && resolveVersion(filters.version, versions) !== filters.version) {
      go({ filters: { ...filters, version: null }, metric });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.versions.data, filters.version]);

  const metricsRows = stats.metrics.data ?? [];
  const sqliteRows = stats.sqlite.data ?? [];
  const errorRows = stats.errors.data ?? [];
  const health = stats.health.data?.[0] ?? null;

  const select = (name: string) => go({ filters, metric: name });
  const updated =
    stats.updatedAt > 0 ? new Date(stats.updatedAt).toISOString().slice(11, 19) : null;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeaderWithBreadCrumbs
        crumbs={[{ label: "Performance" }]}
        description="How long the app takes, from real sessions: startup, the PowerSync connection, sync and local database calls."
      />

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex" role="group" aria-label="Period">
          {PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              aria-pressed={filters.period === period}
              className={pill(filters.period === period)}
              onClick={() => go({ filters: { ...filters, period }, metric })}
            >
              {PERIOD_LABELS[period]}
            </button>
          ))}
        </div>

        <div className="flex" role="group" aria-label="Environment">
          {ENVIRONMENTS.map((env) => (
            <button
              key={env}
              type="button"
              aria-pressed={filters.env === env}
              className={pill(filters.env === env)}
              onClick={() => go({ filters: { ...filters, env }, metric })}
            >
              {env}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600">
          Version
          <select
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
            value={filters.version ?? ""}
            onChange={(event) =>
              go({ filters: { ...filters, version: event.target.value || null }, metric })
            }
          >
            <option value="">All versions</option>
            {versions.map((version) => (
              <option key={version} value={version}>
                {version}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-3 ml-auto text-xs text-gray-500">
          {updated && <span>Updated {updated} UTC</span>}
          <Button type="button" variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
            <RefreshCw className="size-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      <Block
        title="Metrics"
        note="Click a metric for its breakdown. Muted figures rest on few events."
        state={{
          isLoading: stats.metrics.isLoading,
          error: stats.metrics.error,
          isEmpty: metricsRows.length === 0,
        }}
      >
        <MetricsTable rows={metricsRows} selected={metric} onSelect={select} />
      </Block>

      <Block
        title="SQLite calls"
        note="What the caller waited, not the engine's own time."
        state={{
          isLoading: stats.sqlite.isLoading,
          error: stats.sqlite.error,
          isEmpty: sqliteRows.length === 0,
        }}
      >
        <SqliteTable rows={sqliteRows} selected={metric} onSelect={select} />
      </Block>

      <Block
        title="Errors"
        state={{
          isLoading: stats.errors.isLoading,
          error: stats.errors.error,
          isEmpty: errorRows.length === 0,
        }}
      >
        <ErrorsTable rows={errorRows} />
      </Block>

      <Block
        title="Telemetry health"
        state={{ isLoading: stats.health.isLoading, error: stats.health.error, isEmpty: false }}
      >
        <HealthPanel health={health} />
      </Block>

      <Breakdowns
        metric={metric}
        rows={stats.breakdown.data}
        isLoading={stats.breakdown.isLoading && metric !== null}
        error={stats.breakdown.error}
        onClear={() => go({ filters, metric: null })}
      />
    </div>
  );
}
