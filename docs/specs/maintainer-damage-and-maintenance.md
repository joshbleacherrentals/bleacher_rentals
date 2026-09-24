# Maintainer: damage reports and maintenance events

Status: **awaiting approval** — 2026-09-23.

The maintainer role gets full create / read / edit / delete on **Damage Reports** and **Maintenance Events** (the Repairs page), and nothing else new. Today it has none of it: RLS, sync and the UI all refuse it.

## Changes

1. **Migration (RLS).** Add `maintainer` to the role arrays on `DamageReports`, `DamageReportPhotos`, `MaintenanceEvents`, `BleacherMaintEvents` and `MaintenancePhotos` (all four operations). Also the reads these pages depend on: `Bleachers`, `Addresses` (read, and write for a repair's address), `DamageReportAcknowledgements` (read), and `Users` names if the pages show them. Add `maintainer` to the driver-update fence trigger's bypass list so someone who is both maintainer and driver is not restricted.
2. **Sync rules** (`br_powersync/config/sync_rules.yaml`, web stream). New maintainer queries, copied from the admin/AM ones with the `Maintainers` join: `DamageReports`, `DamageReportPhotos`, `DamageReportAcknowledgements`, `MaintenanceEvents`, `BleacherMaintEvents`, `Addresses`. `Bleachers` is already synced.
3. **App.** Let `/damage-reports` and `/repairs` through for the maintainer (`accessConfig.ts`), show both under Quality Assurance in the sidebar, and widen the admin-only buttons on those pages (edit, delete, restore, show deleted) and the maintenance form's `canEdit` to include the maintainer. `canCreateUser` is left alone so team-invite rules don't change.
4. **Permissions page.** "Repairs & Maintenance" and "Damage Reports" become `full` for the maintainer, and the maintainer role description is updated to match.
5. **Tests.** SQL: a maintainer can do all four operations on the two areas, and still cannot touch anything else (Events, quotes, payments). Vitest for the role gates. A Playwright maintainer spec is written but not run without your OK.

## Decisions I made (tell me if any are wrong)

- **"Delete" is soft delete**, exactly as the app does it for everyone today (a `deleted` flag). Photo rows can be removed. Stored photo files can't be deleted by anyone; that is unchanged.
- **Maintainers do not get the Dashboard**, only the two pages above.
- **Acknowledgements are read-only** for maintainers; they stay a driver/admin action.
- Damage reports a maintainer creates are stamped with their own user, as for everyone.

## Deploy order

The sync rules and the migration go out together, before the app change, or a maintainer could be shown buttons that the database refuses (those writes are dropped and toast an error).

## Found on the way (not part of this change)

- The AM notes on the permissions page say AMs "can only edit ones they created"; RLS no longer enforces that.
- `maintainer_role.test.sql` names a migration file that doesn't exist, and `damage_report_photos_report_resolved_at.sql` (referenced by the mobile sync rules) is missing from this repo.
