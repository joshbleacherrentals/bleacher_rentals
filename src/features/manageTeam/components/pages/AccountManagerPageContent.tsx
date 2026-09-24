"use client";

import { useCurrentUserStore } from "@/features/manageTeam/state/useCurrentUserStore";
import { useUserFormPaths } from "@/features/manageTeam/hooks/useUserFormPaths";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { Checkbox } from "@/components/ui/checkbox";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { STATUSES } from "@/features/manageTeam/constants";
import { Dropdown } from "@/components/DropDown";
import { useSalesOffices } from "@/features/quotesAndBookings/hooks/useSalesOffices";
import { salesOfficeLabel } from "@/features/quotesAndBookings/utils/salesOfficeLabel";

type ZoneRow = { id: string; displayName: string | null; photoPath: string | null };
type DriverRow = { driverUuid: string; firstName: string | null; lastName: string | null };

const compiledZones = db
  .selectFrom("Zones as z")
  .select(["z.id as id", "z.display_name as displayName", "z.photo_path as photoPath"])
  .orderBy("z.display_name", "asc")
  .compile();

const compiledDrivers = db
  .selectFrom("Drivers as d")
  .innerJoin("Users as u", "u.id", "d.user_uuid")
  .where("d.is_active", "=", 1)
  .where("u.status_uuid", "!=", STATUSES.inactive)
  .select(["d.id as driverUuid", "u.first_name as firstName", "u.last_name as lastName"])
  .orderBy("u.first_name", "asc")
  .orderBy("u.last_name", "asc")
  .compile();

function ZoneDriverPicker({
  zoneId,
  disabled,
  drivers,
}: {
  zoneId: string;
  disabled: boolean;
  drivers: DriverRow[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const zoneDriverMap = useCurrentUserStore((s) => s.zoneDriverMap);
  const setField = useCurrentUserStore((s) => s.setField);

  const selected = zoneDriverMap[zoneId] ?? [];

  const toggle = (driverUuid: string) => {
    const next = selected.includes(driverUuid)
      ? selected.filter((id) => id !== driverUuid)
      : [...selected, driverUuid];
    setField("zoneDriverMap", { ...zoneDriverMap, [zoneId]: next });
  };

  const filtered = drivers.filter((d) =>
    `${d.firstName ?? ""} ${d.lastName ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className="flex items-center gap-1 text-xs text-gray-500 border rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {selected.length > 0
            ? `${selected.length} driver${selected.length !== 1 ? "s" : ""}`
            : "Drivers"}
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <input
          className="w-full mb-2 border rounded px-2 py-1 text-xs"
          placeholder="Search drivers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-gray-400 px-1">No drivers found.</p>
          ) : (
            filtered.map((d) => (
              <label
                key={d.driverUuid}
                className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer select-none text-sm"
              >
                <Checkbox
                  checked={selected.includes(d.driverUuid)}
                  onCheckedChange={() => toggle(d.driverUuid)}
                />
                {d.firstName} {d.lastName}
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AccountManagerPageContent() {
  const router = useRouter();
  const params = useParams();
  const userUuidFromUrl = params.userUuid as string | undefined;
  const { basicUserInfo } = useUserFormPaths();
  const roleTabs = useCurrentUserStore((s) => s.roleTabs);
  const existingUserUuid = useCurrentUserStore((s) => s.existingUserUuid);
  const assignedZoneEntries = useCurrentUserStore((s) => s.assignedZoneEntries);
  const defaultSalesOfficeId = useCurrentUserStore((s) => s.defaultSalesOfficeId);
  const setField = useCurrentUserStore((s) => s.setField);
  const isAdmin = usePermissionsStore((s) => s.isAdmin);
  const accountManagerZoneIds = usePermissionsStore((s) => s.accountManagerZoneIds);

  const { data: zoneRows } = useTypedQuery(compiledZones, expect<ZoneRow>());
  const { data: driverRows } = useTypedQuery(compiledDrivers, expect<DriverRow>());
  const zones = zoneRows ?? [];
  const drivers = driverRows ?? [];
  const { salesOffices, isLoading: loadingOffices } = useSalesOffices();
  const salesOfficeOptions = salesOffices.map((o) => ({ label: salesOfficeLabel(o), value: o.id }));

  const entryMap = useMemo(
    () => new Map(assignedZoneEntries.map((e) => [e.zoneUuid, e])),
    [assignedZoneEntries],
  );

  const toggleZone = (zoneId: string) => {
    if (entryMap.has(zoneId)) {
      setField(
        "assignedZoneEntries",
        assignedZoneEntries.filter((e) => e.zoneUuid !== zoneId),
      );
    } else {
      setField("assignedZoneEntries", [
        ...assignedZoneEntries,
        { zoneUuid: zoneId, isLead: false },
      ]);
    }
  };

  const toggleLead = (zoneId: string) => {
    setField(
      "assignedZoneEntries",
      assignedZoneEntries.map((e) => (e.zoneUuid === zoneId ? { ...e, isLead: !e.isLead } : e)),
    );
  };

  useEffect(() => {
    const isLoading = (userUuidFromUrl || existingUserUuid) && roleTabs.length === 0;

    if (!isLoading && !roleTabs.includes("account-manager")) {
      router.push(basicUserInfo);
    }
  }, [roleTabs, router, basicUserInfo, existingUserUuid, userUuidFromUrl]);

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      {/* Default sales office */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Default Sales Office</h3>
        <p className="text-xs text-gray-500 mb-2">
          Prefills the Sales Office field on this account manager's new quotes. Optional — only
          admins can set it.
        </p>
        <div className="max-w-xs">
          <Dropdown
            options={salesOfficeOptions}
            selected={defaultSalesOfficeId ?? undefined}
            onSelect={(val) => setField("defaultSalesOfficeId", val)}
            placeholder={loadingOffices ? "Loading..." : "No default"}
            disabled={!isAdmin || loadingOffices}
          />
        </div>
      </div>

      {/* Header + permission banner */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Zone Assignments</h3>
        {isAdmin ? (
          <p className="text-xs text-gray-500">
            Check a zone to assign this account manager to it. Mark <strong>Lead AM</strong> to
            designate them as the primary contact. Use the <strong>Drivers</strong> picker to assign
            drivers to each zone.
          </p>
        ) : (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">Limited access</p>
            <ul className="list-disc list-inside space-y-0.5 text-amber-700">
              <li>
                Zone assignments (checked) and Lead AM status are <strong>read-only</strong> — only
                admins can change them.
              </li>
              <li>
                You can manage drivers for zones <strong>you are assigned to</strong>. Zones you
                don't manage are locked.
              </li>
            </ul>
          </div>
        )}
      </div>

      {/* Column headers */}
      <div className="hidden sm:grid grid-cols-[64px_1fr_auto_auto] gap-4 px-0 pb-1 text-xs font-medium text-gray-400 border-b">
        <span>Map</span>
        <span>Zone</span>
        <span>Lead AM</span>
        <span>Drivers</span>
      </div>

      {zones.length === 0 ? (
        <p className="text-sm text-gray-400">No zones found.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {zones.map((z) => {
            const entry = entryMap.get(z.id);
            const isAssigned = !!entry;
            const isLead = entry?.isLead ?? false;
            const canEditDrivers = isAdmin || accountManagerZoneIds.includes(z.id);

            return (
              <div key={z.id} className="flex items-center gap-4 py-2">
                {/* Zone photo */}
                {z.photoPath ? (
                  <img
                    src={z.photoPath}
                    alt={`${z.displayName ?? "Zone"} map`}
                    className="w-16 h-10 object-contain rounded bg-sky-50 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-10 rounded bg-gray-100 shrink-0" />
                )}

                {/* Zone checkbox */}
                <label
                  className={`flex items-center gap-2 select-none flex-1 ${isAdmin ? "cursor-pointer" : "cursor-default opacity-60"}`}
                >
                  <Checkbox
                    checked={isAssigned}
                    onCheckedChange={isAdmin ? () => toggleZone(z.id) : undefined}
                    disabled={!isAdmin}
                  />
                  <span className="text-sm text-gray-800">{z.displayName ?? "Unnamed Zone"}</span>
                </label>

                {/* Lead checkbox — only when zone is assigned */}
                {isAssigned ? (
                  <label
                    className={`flex items-center gap-1.5 select-none text-sm text-gray-500 ${isAdmin ? "cursor-pointer" : "cursor-default opacity-60"}`}
                  >
                    <Checkbox
                      checked={isLead}
                      onCheckedChange={isAdmin ? () => toggleLead(z.id) : undefined}
                      disabled={!isAdmin}
                    />
                    Lead AM
                  </label>
                ) : (
                  <span className="text-xs text-gray-300 w-16 text-center">—</span>
                )}

                {/* Driver picker */}
                <ZoneDriverPicker zoneId={z.id} disabled={!canEditDrivers} drivers={drivers} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
