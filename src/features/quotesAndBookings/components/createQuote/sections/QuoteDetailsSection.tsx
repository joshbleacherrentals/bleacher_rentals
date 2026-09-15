"use client";

import { useEffect, useCallback, useMemo } from "react";
import { useCreateQuoteStore } from "../../../state/useCreateQuoteStore";
import { Dropdown } from "@/components/DropDown";
import { SelectAccountManager } from "@/features/manageTeam/components/inputs/SelectAccountManager";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import { useAccountManagers } from "@/features/manageTeam/hooks/useAccountManagers";
import { useSalesOffices } from "../../../hooks/useSalesOffices";
import { salesOfficeLabel } from "../../../utils/salesOfficeLabel";
import { isCompanyEmail, COMPANY_EMAIL_DOMAIN } from "../../../utils/companyEmail";
import { LostReasonFields } from "../../lostReason/LostReasonFields";

export function QuoteDetailsSection() {
  const quoteNumber = useCreateQuoteStore((s) => s.quoteNumber);
  const quoteValidTill = useCreateQuoteStore((s) => s.quoteValidTill);
  const status = useCreateQuoteStore((s) => s.status);
  const lostReason = useCreateQuoteStore((s) => s.lostReason);
  const lostReasonNote = useCreateQuoteStore((s) => s.lostReasonNote);
  const salesOfficeId = useCreateQuoteStore((s) => s.salesOfficeId);
  const accountManagerId = useCreateQuoteStore((s) => s.accountManagerId);
  const currency = useCreateQuoteStore((s) => s.currency);
  const setField = useCreateQuoteStore((s) => s.setField);

  const permissions = useTeamPermissions();
  const accountManagers = useAccountManagers(false);
  const { salesOffices, isLoading: loadingOffices } = useSalesOffices();

  const eventStart = useCreateQuoteStore((s) => s.eventStart);
  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  useEffect(() => {
    if (!permissions.accountManagerId || accountManagerId) return;
    if (!permissions.isAdmin) {
      setField("accountManagerId", permissions.accountManagerId);
      const am = accountManagers.find((a) => a.accountManagerUuid === permissions.accountManagerId);
      if (am) setField("ownerUserUuid", am.userUuid);
    }
  }, [permissions.accountManagerId, permissions.isAdmin, accountManagers]);

  const handleAccountManagerChange = useCallback(
    (amId: string | null) => {
      setField("accountManagerId", amId);
      if (!amId) {
        setField("ownerUserUuid", null);
        return;
      }
      const am = accountManagers.find((a) => a.accountManagerUuid === amId);
      setField("ownerUserUuid", am?.userUuid ?? null);
    },
    [accountManagers, setField],
  );

  // Quotes are sent from the account manager's own address, so one outside the
  // company domain blocks sending. Warn at selection time rather than letting
  // the user find out when they try to send.
  const selectedAccountManager = accountManagers.find(
    (a) => a.accountManagerUuid === accountManagerId,
  );
  const accountManagerEmailInvalid =
    !!accountManagerId && !!selectedAccountManager && !isCompanyEmail(selectedAccountManager.email);

  const salesOfficeOptions = salesOffices.map((o) => ({
    label: salesOfficeLabel(o),
    value: o.id,
  }));

  const statusOptions = [
    { label: "Draft", value: "draft" as const },
    { label: "Quoted", value: "quoted" as const },
    { label: "Booked", value: "booked" as const },
    { label: "Lost", value: "lost" as const },
  ];

  useEffect(() => {
    if (!salesOfficeId) return;
    const office = salesOffices.find((o) => o.id === salesOfficeId);
    if (!office) return;
    if (currency !== office.currency) {
      setField("currency", office.currency);
    }
  }, [salesOfficeId, salesOffices]);

  return (
    <section>
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
        Quote Details
      </h2>
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Invoice # (Auto-generated)
          </label>
          <input
            type="text"
            value={quoteNumber || "Auto-generated on save"}
            disabled
            className="w-full h-[40px] px-3 border rounded text-sm bg-gray-50 text-gray-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Quote Valid Till</label>
          <input
            type="date"
            value={quoteValidTill}
            min={today}
            max={eventStart || undefined}
            onChange={(e) => setField("quoteValidTill", e.target.value)}
            className="w-full h-[40px] px-3 border rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <Dropdown
            options={statusOptions}
            selected={status}
            onSelect={(val) => setField("status", val)}
          />
        </div>
        {status === "lost" && (
          <LostReasonFields
            reason={lostReason}
            note={lostReasonNote}
            onReasonChange={(val) => setField("lostReason", val)}
            onNoteChange={(val) => setField("lostReasonNote", val)}
          />
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sales Office <span className="text-red-500">*</span>
          </label>
          <Dropdown
            options={salesOfficeOptions}
            selected={salesOfficeId}
            onSelect={(val) => setField("salesOfficeId", val)}
            placeholder={loadingOffices ? "Loading..." : "Select office..."}
            disabled={loadingOffices}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Account Manager</label>
          <SelectAccountManager value={accountManagerId} onChange={handleAccountManagerChange} />
          {accountManagerEmailInvalid && (
            <p className="mt-1 text-sm text-red-600">
              {selectedAccountManager?.email ? (
                <>
                  <span className="font-semibold">{selectedAccountManager.email}</span> is not a{" "}
                  {COMPANY_EMAIL_DOMAIN} address.
                </>
              ) : (
                "This Account Manager has no email address."
              )}{" "}
              This quote will not be able to be sent to the client until an Account Manager with a
              company email is selected.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
