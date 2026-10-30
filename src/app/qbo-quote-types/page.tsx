"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { fetchQboConnections, type QboConnection } from "@/features/quickbooks-integration/api";
import { SelectQboItemSimple } from "@/features/quickbooks-integration/components/SelectQboItemSimple";
import {
  createEventType,
  deleteEventType,
  eventTypeInUseMessage,
  isEventTypeInUse,
  renameEventType,
} from "@/features/quotesAndBookings/db/eventTypes";
import { useEventTypes } from "@/features/quotesAndBookings/hooks/useEventTypes";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";

type Assignment = {
  event_type_uuid: string;
  qbo_connection_uuid: string;
  qbo_service_id: string;
};

type TypeRef = { id: string; name: string };

const ASSIGNMENTS_KEY = ["event-type-qbo-services"];

const keyOf = (typeId: string, connectionId: string) => `${typeId}:${connectionId}`;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Admin and accountant page under Configuration: the QuickBooks Product/Service each quote type
 * (EventTypes row) is invoiced as, per QuickBooks connection. A change is saved at once. An admin
 * also adds, renames and deletes the types.
 * Specs: docs/specs/qbo-invoice-12a-quote-types-page.md, qbo-invoice-12c-manage-quote-types.md
 */
export default function QuoteTypesPage() {
  const supabase = useClerkSupabaseClient();
  const queryClient = useQueryClient();
  const { eventTypes, isLoading: isTypesLoading } = useEventTypes();
  const roles = usePermissionsStore((state) => state.roles);
  const userId = usePermissionsStore((state) => state.userId);
  // Only an admin may write EventTypes. A write the database refuses is dropped from PowerSync's
  // upload queue in silence, so the controls are not drawn for anyone else.
  const isAdmin = roles.includes("admin");

  const { data: connections = [] } = useQuery<QboConnection[]>({
    queryKey: ["qbo-connections"],
    queryFn: fetchQboConnections,
  });

  const { data: stored = [], error: storedError } = useQuery({
    queryKey: ASSIGNMENTS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("EventTypeQboServices")
        .select("event_type_uuid, qbo_connection_uuid, qbo_service_id");
      if (error) throw error;
      return data as Assignment[];
    },
  });

  // What was picked since the page loaded ("" is a cleared pair). It wins over the stored row, so a
  // pick shows at once and a failed save can put the old value back.
  const [chosen, setChosen] = useState<Record<string, string>>({});
  // The name typed into the Add field (null while the field is closed), the type being renamed with
  // the name typed so far, and the type waiting for the delete confirmation.
  const [addingName, setAddingName] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<TypeRef | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TypeRef | null>(null);

  const valueOf = (typeId: string, connectionId: string) =>
    chosen[keyOf(typeId, connectionId)] ??
    stored.find((row) => row.event_type_uuid === typeId && row.qbo_connection_uuid === connectionId)
      ?.qbo_service_id ??
    "";

  const handleChange = async (
    typeId: string,
    typeName: string,
    connectionId: string,
    itemId: string | null,
  ) => {
    const key = keyOf(typeId, connectionId);
    const previous = valueOf(typeId, connectionId);
    setChosen((prev) => ({ ...prev, [key]: itemId ?? "" }));
    try {
      const { error } = itemId
        ? await supabase.from("EventTypeQboServices").upsert(
            {
              event_type_uuid: typeId,
              qbo_connection_uuid: connectionId,
              qbo_service_id: itemId,
            },
            { onConflict: "event_type_uuid,qbo_connection_uuid" },
          )
        : await supabase
            .from("EventTypeQboServices")
            .delete()
            .eq("event_type_uuid", typeId)
            .eq("qbo_connection_uuid", connectionId);
      if (error) throw new Error(error.message);
    } catch (error) {
      setChosen((prev) => ({ ...prev, [key]: previous }));
      createErrorToastNoThrow([
        `Failed to save the Product/Service for ${typeName}`,
        messageOf(error),
      ]);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY });
  };

  const handleAdd = async () => {
    if (addingName === null) return;
    if (!userId) {
      createErrorToastNoThrow([
        "Failed to add the quote type",
        "Your user could not be found. Reload the page and try again.",
      ]);
      return;
    }
    try {
      await createEventType(addingName, userId);
      setAddingName(null);
    } catch (error) {
      createErrorToastNoThrow(["Failed to add the quote type", messageOf(error)]);
    }
  };

  const handleRename = async () => {
    if (!renaming) return;
    try {
      await renameEventType(renaming.id, renaming.name);
      setRenaming(null);
    } catch (error) {
      createErrorToastNoThrow(["Failed to rename the quote type", messageOf(error)]);
    }
  };

  // Delete asks whether the type is used before it asks for the confirmation.
  const handleDeleteClick = async (type: TypeRef) => {
    try {
      if (await isEventTypeInUse(type.id)) {
        createErrorToastNoThrow([
          "Failed to delete the quote type",
          eventTypeInUseMessage(type.name),
        ]);
        return;
      }
      setDeleteTarget({ id: type.id, name: type.name });
    } catch (error) {
      createErrorToastNoThrow(["Failed to delete the quote type", messageOf(error)]);
    }
  };

  const handleDeleteConfirm = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    try {
      await deleteEventType(target.id, target.name);
    } catch (error) {
      createErrorToastNoThrow(["Failed to delete the quote type", messageOf(error)]);
    }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Quote Types"
        subtitle="Choose the QuickBooks Product/Service each quote type is invoiced as, for each QuickBooks company."
        action={
          isAdmin ? (
            <Button data-testid="add-quote-type" onClick={() => setAddingName("")}>
              Add quote type
            </Button>
          ) : undefined
        }
      />

      {isAdmin && addingName !== null && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <input
            data-testid="add-quote-type-input"
            className="h-9 flex-1 rounded-md border border-gray-300 px-3 text-sm"
            placeholder="Quote type name"
            value={addingName}
            onChange={(event) => setAddingName(event.target.value)}
          />
          <Button data-testid="add-quote-type-submit" onClick={handleAdd}>
            Add
          </Button>
          <Button
            data-testid="add-quote-type-cancel"
            variant="outline"
            onClick={() => setAddingName(null)}
          >
            Cancel
          </Button>
        </div>
      )}

      {storedError ? (
        <div className="py-8 text-center text-sm text-red-600">
          Could not load the saved Products/Services. Reload the page to try again.
        </div>
      ) : isTypesLoading ? (
        <div className="py-8 text-center text-sm text-gray-500">Loading quote types...</div>
      ) : eventTypes.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-500">No quote types.</div>
      ) : (
        <div className="space-y-3">
          {eventTypes.map((type) => (
            <div
              key={type.id}
              data-testid={`quote-type-${type.id}`}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex items-center gap-2">
                {renaming?.id === type.id ? (
                  <>
                    <input
                      data-testid={`rename-quote-type-input-${type.id}`}
                      className="h-9 flex-1 rounded-md border border-gray-300 px-3 text-sm"
                      value={renaming.name}
                      onChange={(event) => setRenaming({ id: type.id, name: event.target.value })}
                    />
                    <Button
                      size="sm"
                      data-testid={`rename-quote-type-save-${type.id}`}
                      onClick={handleRename}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`rename-quote-type-cancel-${type.id}`}
                      onClick={() => setRenaming(null)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-semibold text-darkBlue">{type.name}</div>
                    {isAdmin && (
                      <div className="ml-auto flex items-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Rename ${type.name}`}
                          data-testid={`rename-quote-type-${type.id}`}
                          onClick={() => setRenaming({ id: type.id, name: type.name })}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${type.name}`}
                          data-testid={`delete-quote-type-${type.id}`}
                          onClick={() => handleDeleteClick({ id: type.id, name: type.name })}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="space-y-2">
                {connections.length > 0 ? (
                  connections.map((connection) => (
                    <div
                      key={connection.id}
                      data-testid={`quote-type-row-${type.id}-${connection.id}`}
                    >
                      <span className="text-xs text-gray-400">{connection.display_name}</span>
                      <SelectQboItemSimple
                        connectionId={connection.id}
                        value={valueOf(type.id, connection.id) || null}
                        onChange={(itemId) =>
                          handleChange(type.id, type.name, connection.id, itemId)
                        }
                      />
                    </div>
                  ))
                ) : (
                  <span className="text-xs italic text-gray-400">No QuickBooks connections</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <AlertDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete quote type?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget
                  ? `Delete quote type ${deleteTarget.name}? It disappears from the quote form and the Pricing Matrix.`
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
