"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchQboConnections,
  createQboConnectionApi,
  deleteQboConnectionApi,
  checkQboConnectionHealth,
  renameQboConnectionApi,
  fetchQboTaxCodes,
  setQboConnectionTaxCodeApi,
  setQboConnectionNoTaxCodeApi,
  type QboTaxCode,
} from "@/features/quickbooks-integration/api";
import { ProvinceTaxCodes } from "@/features/quickbooks-integration/components/ProvinceTaxCodes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import {
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Trash2,
  LogIn,
  AlertTriangle,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

type ConnectionHealth = {
  status: "idle" | "loading" | "healthy" | "error";
  error?: string;
};

export default function QuickBooksPage() {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [healthMap, setHealthMap] = useState<Record<string, ConnectionHealth>>({});
  const [taxCodesMap, setTaxCodesMap] = useState<Record<string, QboTaxCode[]>>({});
  const [deleteConnectionId, setDeleteConnectionId] = useState<string | null>(null);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // Show error from callback redirect (e.g. duplicate company)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error) {
      setCallbackError(error);
      window.history.replaceState({}, "", "/quickbooks");
    }
  }, []);

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["qbo-connections"],
    queryFn: fetchQboConnections,
  });

  // Check health of all connections on load
  useEffect(() => {
    if (connections.length > 0) {
      connections.forEach((conn) => handleCheckHealth(conn.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections.length]);

  const handleCheckHealth = async (connectionId: string) => {
    setHealthMap((prev) => ({ ...prev, [connectionId]: { status: "loading" } }));
    try {
      const result = await checkQboConnectionHealth(connectionId);
      setHealthMap((prev) => ({
        ...prev,
        [connectionId]: result.healthy
          ? { status: "healthy" }
          : { status: "error", error: result.error },
      }));
      // Load tax codes once we confirm the connection is healthy
      if (result.healthy && !taxCodesMap[connectionId]) {
        fetchQboTaxCodes(connectionId)
          .then((codes) => setTaxCodesMap((prev) => ({ ...prev, [connectionId]: codes })))
          .catch(() => {});
      }
    } catch {
      setHealthMap((prev) => ({
        ...prev,
        [connectionId]: { status: "error", error: "Failed to check" },
      }));
    }
  };

  const handleCreate = async () => {
    if (!newDisplayName.trim()) return;
    setIsCreating(true);
    try {
      const connectionId = await createQboConnectionApi(newDisplayName.trim());
      setShowCreateDialog(false);
      setNewDisplayName("");
      // Redirect to OAuth flow for this new connection
      window.location.href = `/api/quickbooks/auth?connectionId=${encodeURIComponent(connectionId)}`;
    } catch (error) {
      createErrorToast(["Failed to create connection", String(error)]);
      setIsCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConnectionId) return;
    try {
      await deleteQboConnectionApi(deleteConnectionId);
      await queryClient.invalidateQueries({ queryKey: ["qbo-connections"] });
      createSuccessToast(["Connection deleted"]);
    } catch (error) {
      createErrorToast(["Failed to delete connection", String(error)]);
    }
    setDeleteConnectionId(null);
  };

  const handleReauthenticate = (connectionId: string) => {
    window.location.href = `/api/quickbooks/auth?connectionId=${encodeURIComponent(connectionId)}`;
  };

  const handleStartEdit = (conn: { id: string; display_name: string }) => {
    setEditingId(conn.id);
    setEditingName(conn.display_name);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editingName.trim()) return;
    try {
      await renameQboConnectionApi(editingId, editingName.trim());
      await queryClient.invalidateQueries({ queryKey: ["qbo-connections"] });
      setEditingId(null);
    } catch (error) {
      createErrorToast(["Failed to rename connection", String(error)]);
    }
  };

  const handleTaxCodeChange = async (connectionId: string, taxCodeId: string) => {
    try {
      await setQboConnectionTaxCodeApi(connectionId, taxCodeId || null);
      await queryClient.invalidateQueries({ queryKey: ["qbo-connections"] });
    } catch (error) {
      createErrorToast(["Failed to update tax code", String(error)]);
    }
  };

  const handleNoTaxCodeChange = async (connectionId: string, taxCodeId: string) => {
    try {
      await setQboConnectionNoTaxCodeApi(connectionId, taxCodeId || null);
      await queryClient.invalidateQueries({ queryKey: ["qbo-connections"] });
    } catch (error) {
      createErrorToast(["Failed to update no-tax code", String(error)]);
    }
  };

  const getHealthIndicator = (connectionId: string) => {
    const health = healthMap[connectionId];
    if (!health || health.status === "idle") return null;

    if (health.status === "loading") {
      return <Loader2 className="h-4 w-4 animate-spin text-gray-400" />;
    }
    if (health.status === "healthy") {
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    }
    return (
      <span className="flex items-center gap-1">
        <XCircle className="h-4 w-4 text-red-500" />
        <span className="text-xs text-red-500">{health.error}</span>
      </span>
    );
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="QuickBooks Connections" />
      <p className="text-sm text-gray-500 mb-6">
        Manage your QuickBooks Online connections. Each connection can be linked to vendors, zones,
        and work tracker types for bill creation.
      </p>

      {callbackError && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 mb-6">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">Connection Failed</p>
            <p className="text-sm text-amber-700 mt-1">{callbackError}</p>
          </div>
          <button
            onClick={() => setCallbackError(null)}
            className="text-amber-400 hover:text-amber-600 text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="py-8 text-center text-sm text-gray-500">Loading connections...</div>
      ) : connections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-500 mb-4">
            No QuickBooks connections yet. Create one to get started.
          </p>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Connection
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {editingId === conn.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-greenAccent"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveEdit}
                        disabled={!editingName.trim()}
                        className="p-1 rounded hover:bg-green-50 text-green-600 disabled:opacity-30"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span
                      className="font-medium text-sm cursor-pointer hover:underline inline-flex items-center gap-1.5 group"
                      onClick={() => handleStartEdit(conn)}
                    >
                      {conn.display_name}
                      <Pencil className="h-3 w-3 text-gray-300 group-hover:text-gray-500" />
                    </span>
                  )}
                  {conn.realm_id && (
                    <span className="text-xs text-gray-400">Company ID: {conn.realm_id}</span>
                  )}
                  {getHealthIndicator(conn.id)}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCheckHealth(conn.id)}
                    disabled={healthMap[conn.id]?.status === "loading"}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    Check
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleReauthenticate(conn.id)}>
                    <LogIn className="h-3.5 w-3.5 mr-1" />
                    Re-authenticate
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setDeleteConnectionId(conn.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {/* Tax Code Row */}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-400 w-28 shrink-0">Default Tax Code</span>
                {taxCodesMap[conn.id] ? (
                  <select
                    value={conn.qbo_tax_code_id ?? ""}
                    onChange={(e) => handleTaxCodeChange(conn.id, e.target.value)}
                    className="rounded border border-gray-300 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-greenAccent"
                  >
                    <option value="">— none —</option>
                    {taxCodesMap[conn.id].map((tc) => (
                      <option key={tc.id} value={tc.id}>
                        {tc.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-gray-400 italic">
                    {conn.qbo_tax_code_id
                      ? conn.qbo_tax_code_id
                      : healthMap[conn.id]?.status === "healthy"
                        ? "Loading…"
                        : "Check connection to load tax codes"}
                  </span>
                )}
              </div>
              {/* No-tax code Row: the code a Canadian invoice line carries when it has no tax */}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-400 w-28 shrink-0">No-tax code (Canada)</span>
                {taxCodesMap[conn.id] ? (
                  <select
                    value={conn.qbo_no_tax_code_id ?? ""}
                    onChange={(e) => handleNoTaxCodeChange(conn.id, e.target.value)}
                    data-testid={`no-tax-code-${conn.id}`}
                    className="rounded border border-gray-300 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-greenAccent"
                  >
                    <option value="">— none —</option>
                    {taxCodesMap[conn.id].map((tc) => (
                      <option key={tc.id} value={tc.id}>
                        {tc.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-gray-400 italic">
                    {conn.qbo_no_tax_code_id
                      ? conn.qbo_no_tax_code_id
                      : healthMap[conn.id]?.status === "healthy"
                        ? "Loading…"
                        : "Check connection to load tax codes"}
                  </span>
                )}
              </div>
              <ProvinceTaxCodes connectionId={conn.id} taxCodes={taxCodesMap[conn.id]} />
            </div>
          ))}

          <Button variant="outline" className="mt-2" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Connection
          </Button>
        </div>
      )}

      {/* Create Connection Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New QuickBooks Connection</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium text-gray-700">Display Name</label>
            <input
              type="text"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="e.g. US Company, Canada Division"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-greenAccent"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newDisplayName.trim()) handleCreate();
              }}
              autoFocus
            />
            <p className="text-xs text-gray-500">
              A friendly name to identify this QuickBooks company.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isCreating || !newDisplayName.trim()}>
              {isCreating ? "Creating..." : "Create & Authenticate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConnectionId} onOpenChange={() => setDeleteConnectionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Connection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the QuickBooks connection and unlink it from any vendors, zones, or
              work tracker types that reference it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
