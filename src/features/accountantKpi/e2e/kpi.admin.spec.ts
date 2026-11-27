import { defineKpiTests } from "./helpers/kpiTests";

// docs/specs/accountant-kpi.md §3, S1 to S11, as an administrator. The seeded E2E admin user has
// no `Users` row in the local database, so this spec cannot run there (see CLAUDE.md, E2E test
// users & roles). Written, not run locally (project rule).
defineKpiTests("admin");
