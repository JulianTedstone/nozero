"use client";

import { CheckIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { useState } from "react";
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
import { cn } from "@/lib/utils";
import type { StreamBinding } from "@/types/streams";

const CREATE_VALUE = "__create__";

/**
 * Stream selector for the Ingest gate. A stream binds a Flightdeck lane to a
 * context repo + subfolder; selecting one sets where the conversation is filed
 * AND the lane its tasks go to. "Add new stream" creates the binding inline.
 */
export function StreamRouter({
  streams,
  repos,
  value,
  onChange,
  onCreate,
  onRoute,
  routeBusy,
}: {
  streams: StreamBinding[];
  repos: string[];
  value: string | null;
  onChange: (name: string | null) => void;
  onCreate: (binding: StreamBinding) => Promise<boolean>;
  onRoute: () => Promise<boolean>;
  routeBusy: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [repo, setRepo] = useState(repos[0] ?? "");
  const [path, setPath] = useState("conversations");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = streams.find((s) => s.name === value) ?? null;

  function handleSelect(next: string | null) {
    if (!next) {
      onChange(null);
      return;
    }
    if (next === CREATE_VALUE) {
      setCreateOpen(true);
      return;
    }
    onChange(next);
  }

  async function handleCreate() {
    setError(null);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name.trim())) {
      setError("Name must be kebab-case, e.g. npt-new-project");
      return;
    }
    if (!repo || !path.trim()) {
      setError("Repo and subfolder are required");
      return;
    }
    setSaving(true);
    const ok = await onCreate({ name: name.trim(), repo, path: path.trim() });
    setSaving(false);
    if (ok) {
      setCreateOpen(false);
      setName("");
      setPath("conversations");
    } else {
      setError("Could not create the stream");
    }
  }

  return (
    <div className="shrink-0 border-line border-b bg-surface-sunk/40 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-semibold text-[9px] text-ink-subtle uppercase tracking-wider">
          Stream
        </span>
        <Select onValueChange={handleSelect} value={value ?? ""}>
          <SelectTrigger className="h-7 min-w-0 flex-1 border-line bg-surface-sunk text-[11px] text-ink">
            <SelectValue placeholder="Select a stream to file + enable tasks…">
              {value ?? "Select a stream…"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="rounded-xl border border-line">
            {streams.map((s) => (
              <SelectItem key={s.name} value={s.name}>
                <span className="flex flex-col">
                  <span className="text-[11px] text-ink">{s.name}</span>
                  <span className="text-[9px] text-ink-subtle">
                    {s.repo}/{s.path}
                  </span>
                </span>
              </SelectItem>
            ))}
            <SelectItem value={CREATE_VALUE}>
              <span className="inline-flex items-center gap-1.5 text-[11px]">
                <PlusIcon className="h-3.5 w-3.5" />
                Add new stream…
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        <button
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[10px]",
            value
              ? "bg-primary/10 text-primary hover:bg-primary/15"
              : "cursor-not-allowed bg-accent text-ink-subtle",
          )}
          disabled={!value || routeBusy}
          onClick={() => void onRoute()}
          type="button"
        >
          {routeBusy ? (
            <Loader2Icon className="h-3 w-3 animate-spin" />
          ) : (
            <CheckIcon className="h-3 w-3" />
          )}
          File here
        </button>
      </div>
      <p className="mt-1.5 text-[9px] text-ink-subtle">
        {selected
          ? `Files to ${selected.repo}/${selected.path} · tasks → ${selected.name}`
          : "Pick a stream to file this conversation and enable task assignment."}
      </p>

      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <DialogContent className="rounded-2xl border border-line bg-background/95 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="title-serif text-base">New stream</DialogTitle>
          </DialogHeader>
          <p className="text-[12px] text-muted-foreground">
            A stream binds a Flightdeck lane to a context repo + subfolder.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="stream-name">Name</Label>
              <Input
                id="stream-name"
                onChange={(e) => setName(e.target.value)}
                placeholder="npt-new-project"
                value={name}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stream-repo">Repo</Label>
              <Select onValueChange={(v) => setRepo(v ?? "")} value={repo}>
                <SelectTrigger className="border-line bg-surface-sunk" id="stream-repo">
                  <SelectValue placeholder="Choose a repo" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-line">
                  {repos.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stream-path">Subfolder</Label>
              <Input
                id="stream-path"
                onChange={(e) => setPath(e.target.value)}
                placeholder="new-project-location"
                value={path}
              />
            </div>
            <p className="rounded-lg border border-line bg-surface-sunk px-2.5 py-1.5 font-mono text-[10px] text-ink-muted">
              {repo}/{path || "…"}
            </p>
            {error ? (
              <p className="text-[11px] text-destructive">{error}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={() => setCreateOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void handleCreate()} type="button">
              {saving ? "Saving…" : "Create stream"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
