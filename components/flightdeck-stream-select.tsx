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

const NONE_VALUE = "__none__";
const CREATE_VALUE = "__create__";

interface FlightdeckStreamSelectProps {
  disabled?: boolean;
  value?: string;
  onChange: (stream: string | undefined) => void;
  /** Preloaded stream names (skips board fetch when provided). */
  streams?: string[];
  /** `toolbar` = compact select in calendar chrome; `field` = upsert input in forms. */
  variant?: "toolbar" | "field";
}

export function FlightdeckStreamSelect({
  disabled,
  value,
  onChange,
  streams: streamsProp,
  variant = "toolbar",
}: FlightdeckStreamSelectProps) {
  const { toast } = useToast();
  const [streams, setStreams] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newStreamName, setNewStreamName] = useState("");
  const [saving, setSaving] = useState(false);

  const loadStreams = useCallback(async () => {
    if (streamsProp) {
      setStreams(streamsProp);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/flightdeck/board");
      if (!res.ok) throw new Error("Failed to load streams");
      const data = (await res.json()) as { streams?: string[] };
      setStreams(data.streams ?? []);
    } catch {
      toast({
        title: "Could not load Flightdeck streams",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [streamsProp, toast]);

  useEffect(() => {
    void loadStreams();
  }, [loadStreams]);

  useEffect(() => {
    if (streamsProp) {
      setStreams(streamsProp);
    }
  }, [streamsProp]);

  const streamOptions = [
    ...new Set([
      ...streams,
      ...(value && !streams.includes(value) ? [value] : []),
    ]),
  ].sort();

  async function handleCreate() {
    const name = newStreamName.trim();
    if (!name) {
      toast({
        title: "Stream name is required",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/flightdeck/streams/ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "Failed to create stream",
        );
      }
      const data = (await res.json()) as { stream?: string };
      const resolved = data.stream ?? name;
      setStreams((prev) =>
        [...new Set([...prev, resolved])].sort(),
      );
      onChange(resolved);
      setCreateOpen(false);
      setNewStreamName("");
      toast({ title: "Stream saved" });
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

  const selectValue = value ?? NONE_VALUE;

  const listId = "flightdeck-stream-list";

  if (variant === "field") {
    return (
      <>
        <Input
          className="border-line bg-surface-sunk text-ink"
          disabled={disabled || loading}
          list={listId}
          onChange={(event) => {
            const next = event.target.value;
            onChange(next.trim() ? next : undefined);
          }}
          placeholder="Select or type stream…"
          value={value ?? ""}
        />
        <datalist id={listId}>
          {streamOptions.map((stream) => (
            <option key={stream} value={stream} />
          ))}
        </datalist>
      </>
    );
  }

  return (
    <>
      <Select
        disabled={disabled || loading}
        onValueChange={handleSelectChange}
        value={selectValue}
      >
        <SelectTrigger className="!h-full min-h-0 min-w-0 flex-1 justify-between gap-2 rounded-none border-0 bg-transparent px-0 py-0 text-ink text-xs shadow-none focus:ring-0 [&_svg]:size-3.5 [&_svg]:text-ink-subtle">
          <SelectValue placeholder="Stream">
            {value ?? "Stream"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-line shadow-2xl">
          <SelectItem value={NONE_VALUE}>Stream</SelectItem>
          {streamOptions.map((stream) => (
            <SelectItem key={stream} value={stream}>
              {stream}
            </SelectItem>
          ))}
          <SelectItem value={CREATE_VALUE}>
            <span className="inline-flex items-center gap-1.5">
              <PlusIcon className="size-3.5" />
              Add new stream…
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <DialogContent className="rounded-2xl border border-line bg-background/95 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Flightdeck stream</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Creates the stream on Flightdeck if it does not exist yet, then links
            this meeting to it.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="flightdeck-stream-name">Stream name</Label>
            <Input
              id="flightdeck-stream-name"
              onChange={(e) => setNewStreamName(e.target.value)}
              placeholder="npt-nozero"
              value={newStreamName}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => setCreateOpen(false)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              disabled={saving}
              onClick={() => void handleCreate()}
              type="button"
            >
              {saving ? "Saving…" : "Save stream"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
