"use client";

import { PageHeader } from "@/components/PageHeader";

/**
 * The Dashboard & Analytics page. Until the page spec of the series fills it, it shows its title
 * and nothing else: no subtitle, no period dropdown, no query of the local database and no rate
 * request (docs/specs/dashboard-analytics-02-access-shell.md §2.4, D30). Who may open it is decided
 * in `accessConfig.ts`; the page does not read the role itself.
 */
export default function DashboardAnalyticsPage() {
  return <PageHeader title="Dashboard & Analytics" />;
}
