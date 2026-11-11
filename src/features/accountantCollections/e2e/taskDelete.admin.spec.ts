import { defineTaskDeleteTests } from "./helpers/taskDeleteTests";

// docs/specs/accountant-collections-19-task-delete.md §4, S55 to S59, as an administrator. Written,
// not run locally (project rule).
defineTaskDeleteTests("admin");
