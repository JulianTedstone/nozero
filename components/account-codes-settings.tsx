"use client";

import { ArchiveIcon, PlusIcon, RotateCcwIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { AccountCode } from "@/types/account-codes";

type ConnectedAccount = {
  email: string;
  label: string;
};

interface AccountCodesSettingsProps {
  connectedAccounts: ConnectedAccount[];
  userEmail: string;
  userId: string;
}

export function AccountCodesSettings({
  connectedAccounts,
  userEmail,
  userId,
}: AccountCodesSettingsProps) {
  const { toast } = useToast();
  const accountOptions = useMemo(() => {
    const emails = new Map<string, string>();
    if (userEmail) {
      emails.set(userEmail.toLowerCase(), userEmail);
    }
    for (const account of connectedAccounts) {
      emails.set(account.email.toLowerCase(), account.email);
    }
    return [...emails.values()].sort((a, b) => a.localeCompare(b));
  }, [connectedAccounts, userEmail]);

  const [selectedAccount, setSelectedAccount] = useState(
    accountOptions[0] ?? userEmail,
  );
  const [codes, setCodes] = useState<AccountCode[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const loadCodes = useCallback(async () => {
    if (!selectedAccount) {
      setCodes([]);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        accountEmail: selectedAccount,
        includeArchived: "true",
      });
      const res = await fetch(`/api/account-codes?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setCodes(data.accountCodes ?? []);
    } catch {
      toast({ title: "Could not load account codes", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, toast]);

  useEffect(() => {
    void loadCodes();
  }, [loadCodes]);

  const visibleCodes = showArchived
    ? codes
    : codes.filter((c) => !c.archivedAt);

  async function handleCreate() {
    const code = newCode.trim();
    const label = newLabel.trim();
    if (!code || !label || !selectedAccount) return;

    try {
      const res = await fetch("/api/account-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          accountEmail: selectedAccount,
          code,
          label,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Save failed");
      }
      setNewCode("");
      setNewLabel("");
      await loadCodes();
      toast({ title: "Account code saved" });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Save failed",
        variant: "destructive",
      });
    }
  }

  async function patchCode(
    id: string,
    patch: { label?: string; archived?: boolean },
  ) {
    try {
      const res = await fetch(`/api/account-codes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...patch }),
      });
      if (!res.ok) throw new Error("Update failed");
      await loadCodes();
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-lg">Account codes</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Define codes and labels for time-sheeting. Codes are scoped to each
          connected email account, can be assigned to meetings, and are archived
          instead of deleted.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Email account</Label>
        <Select
          onValueChange={setSelectedAccount}
          value={selectedAccount ?? undefined}
        >
          <SelectTrigger className="max-w-md">
            <SelectValue placeholder="Select account" />
          </SelectTrigger>
          <SelectContent>
            {accountOptions.map((email) => (
              <SelectItem key={email} value={email}>
                {email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/40 p-4">
        <h3 className="mb-3 font-medium text-sm">Add code</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="settings-code">Code</Label>
            <Input
              id="settings-code"
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="coh_bbb_vtl-99"
              value={newCode}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-label">Label</Label>
            <Input
              id="settings-label"
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Coherence, BBB client, VentureLink ticket 99"
              value={newLabel}
            />
          </div>
        </div>
        <Button
          className="mt-3"
          disabled={!newCode.trim() || !newLabel.trim()}
          onClick={() => void handleCreate()}
          size="sm"
          type="button"
        >
          <PlusIcon className="mr-1.5 size-4" />
          Add code
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium text-sm">
          Codes for {selectedAccount || "—"}
        </h3>
        <Button
          onClick={() => setShowArchived((v) => !v)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : visibleCodes.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No account codes yet for this email account.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground text-xs">
              <tr>
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Label</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleCodes.map((row) => (
                <tr
                  className={cn(
                    "border-border/40 border-t",
                    row.archivedAt && "opacity-60",
                  )}
                  key={row.id}
                >
                  <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                  <td className="px-3 py-2">
                    {editingId === row.id ? (
                      <Input
                        className="h-8"
                        onChange={(e) => setEditLabel(e.target.value)}
                        value={editLabel}
                      />
                    ) : (
                      row.label
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.archivedAt ? "Archived" : "Active"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {editingId === row.id ? (
                        <>
                          <Button
                            disabled={!editLabel.trim()}
                            onClick={() => {
                              void patchCode(row.id, { label: editLabel }).then(
                                () => setEditingId(null),
                              );
                            }}
                            size="sm"
                            type="button"
                            variant="secondary"
                          >
                            Save
                          </Button>
                          <Button
                            onClick={() => setEditingId(null)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          disabled={Boolean(row.archivedAt)}
                          onClick={() => {
                            setEditingId(row.id);
                            setEditLabel(row.label);
                          }}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Edit label
                        </Button>
                      )}
                      {row.archivedAt ? (
                        <Button
                          onClick={() =>
                            void patchCode(row.id, { archived: false })
                          }
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <RotateCcwIcon className="mr-1 size-3.5" />
                          Restore
                        </Button>
                      ) : (
                        <Button
                          onClick={() =>
                            void patchCode(row.id, { archived: true })
                          }
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <ArchiveIcon className="mr-1 size-3.5" />
                          Archive
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
