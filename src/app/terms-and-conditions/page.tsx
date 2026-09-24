"use client";

import { DateTime } from "luxon";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useTermsAndConditions } from "@/features/termsAndConditions/hooks/useTermsAndConditions";
import {
  setDefaultTermsAndConditions,
  softDeleteTermsAndConditions,
} from "@/features/termsAndConditions/db/termsAndConditionsDb";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function formatDate(dateString: string): string {
  const date = DateTime.fromISO(dateString);
  if (!date.isValid) return "—";
  return date.toFormat("MMM d, yyyy");
}

export default function TermsAndConditionsPage() {
  const router = useRouter();
  const { items, isLoading } = useTermsAndConditions();

  // Clicking the selected template's radio again clears the default, leaving none.
  const handleSetDefault = async (id: string, name: string, isDefault: boolean) => {
    try {
      await setDefaultTermsAndConditions(isDefault ? null : id);
      createSuccessToast([
        isDefault ? `"${name}" is no longer the default.` : `"${name}" is now the default.`,
      ]);
    } catch {
      // error toast shown in db layer
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await softDeleteTermsAndConditions(id);
      createSuccessToast([`"${name}" deleted.`]);
    } catch {
      // error toast shown in db layer
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-6 py-6">
      <PageHeader
        title="Terms & Conditions"
        subtitle="Manage contract templates for quotes"
        action={
          <PrimaryButton onClick={() => router.push("/terms-and-conditions/create")}>
            + Create Template
          </PrimaryButton>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-500">Loading templates...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-400">No contract templates yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mt-4">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">
                  Default
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Created
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-20">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/terms-and-conditions/${item.id}`)}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="radio"
                      name="default-terms"
                      className="h-4 w-4 cursor-pointer accent-darkBlue"
                      checked={item.isDefault}
                      onChange={() => handleSetDefault(item.id, item.name, item.isDefault)}
                      // A radio cannot be unchecked by keyboard; the click handler makes the
                      // selected one clear the default so "no default" stays reachable.
                      onClick={() => {
                        if (item.isDefault) void handleSetDefault(item.id, item.name, true);
                      }}
                      aria-label={`Make "${item.name}" the default contract template`}
                    />
                  </td>
                  <td className="px-4 py-3 text-sm font-medium">
                    {item.name}
                    {item.isDefault && (
                      <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        Default
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatDate(item.createdAt)}</td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="text-gray-400 hover:text-red-600 transition cursor-pointer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete &quot;{item.name}&quot;?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will soft-delete the contract template. It can be restored later.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="cursor-pointer rounded-sm">
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            className="cursor-pointer rounded-sm bg-red-800 text-white hover:bg-red-900"
                            onClick={() => handleDelete(item.id, item.name)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
