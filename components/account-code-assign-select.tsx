"use client";

import { PlusIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { AccountCode } from "@/types/account-codes";

const NONE_VALUE = "__none__";
const CREATE_VALUE = "__create__";

interface AccountCodeAssignSelectProps {
  accountEmail: string;
  disabled?: boolean;
  userId: string;
  value?: string;
  onChange: (accountCodeId: string | undefined) => void;
}

export function AccountCodeAssignSelect({
  accountEmail,
  disabled,
  userId,
  value,
  onChange,
}: AccountCodeAssignSelectProps) {
  const { toast } = useToast();
  const [codes, setCodes] = useState<AccountCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const loadCodes = useCallback(async () => {
    if (!accountEmail) {
      setCodes([]);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        accountEmail,
        includeArchived: "false",
      });
      const res = await fetch(`/api/account-codes?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load account codes");
      const data = await res.json();
      setCodes(data.accountCodes ?? []);
    } catch {
      toast({
        title: "Could not load account codes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [accountEmail, toast]);

  useEffect(() => {
    void loadCodes();
  }, [loadCodes]);

  const selected = codes.find((c) => c.id === value);

  async function handleCreate() {
    const code = newCode.trim();
    const label = newLabel.trim();
    if (!code || !label) {
      toast({
        title: "Code and label are required",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/account-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          accountEmail,
          code,
          label,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save account code");
      }
      const { accountCode } = await res.json();
      setCodes((prev) => {
        const without = prev.filter((c) => c.id !== accountCode.id);
        return [...without, accountCode].sort((a, b) =>
          a.code.localeCompare(b.code),
        );
      });
      onChange(accountCode.id);
      setCreateOpen(false);
      setNewCode("");
      setNewLabel("");
      toast({ title: "Account code saved" });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Save failed",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleSelectChange(next: string) {
    if (next === NONE_VALUE) {
      onChange(undefined);
      return;
    }
    if (next === CREATE_VALUE) {
      setCreateOpen(true);
      return;
    }
    onChange(next);
  }

  if (!accountEmail) {
    return (
      <span className="text-white/40 text-xs">
        Connect a calendar account to assign codes
      </span>
    );
  }

  const selectValue = value ?? NONE_VALUE;

  return (
    <>
      <Select
        disabled={disabled || loading}
        onValueChange={handleSelectChange}
        value={selectValue}
      >
        <SelectTrigger className="!h-full min-h-0 min-w-0 flex-1 justify-between gap-2 rounded-none border-0 bg-transparent px-0 py-0 text-white/80 text-xs shadow-none focus:ring-0 [&_svg]:size-3.5 [&_svg]:text-white/40">
          <SelectValue placeholder="None">
            {selected
              ? `${selected.code} — ${selected.label}`
              : value
                ? "Assigned code unavailable"
                : "None"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-white/[0.12] shadow-2xl">
          <SelectItem value={NONE_VALUE}>None</SelectItem>
          {codes.map((code) => (
            <SelectItem key={code.id} value={code.id}>
              <span className="font-mono text-xs">{code.code}</span>
              <span className="ml-2 text-muted-foreground">{code.label}</span>
            </SelectItem>
          ))}
          <SelectItem value={CREATE_VALUE}>
            <span className="inline-flex items-center gap-1.5">
              <PlusIcon className="size-3.5" />
              Add new code…
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <DialogContent className="rounded-2xl border border-white/[0.12] bg-background/95 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New account code</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            For {accountEmail}. This code will be available on future meetings
            for this account.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="account-code">Code</Label>
              <Input
                id="account-code"
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="coh_bbb_vtl-99"
                value={newCode}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-code-label">Label</Label>
              <Input
                id="account-code-label"
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Coherence, BBB client, VentureLink ticket 99"
                value={newLabel}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setCreateOpen(false)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void handleCreate()} type="button">
              {saving ? "Saving…" : "Save code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
