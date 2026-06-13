"use client";

import {
  ExternalLinkIcon,
  LayoutDashboardIcon,
  Loader2Icon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  FlightdeckBoardItem,
  FlightdeckBoardPayload,
  FlightdeckBoardVerb,
} from "@/types/flightdeck-board";

interface FlightdeckBoardViewProps {
  initialStream?: string | null;
}

function itemKey(item: FlightdeckBoardItem): string {
  return item.ref ?? item.id;
}

function actionsForStatus(status: string): FlightdeckBoardVerb[] {
  switch (status) {
    case "Backlog":
      return ["claim"];
    case "To Do":
      return ["start", "block"];
    case "In Progress":
      return ["submit_for_review", "block"];
    case "Review":
      return ["approve", "request_changes"];
    case "Blocked":
      return ["unblock"];
    default:
      return [];
  }
}

export function FlightdeckBoardView({
  initialStream = null,
}: FlightdeckBoardViewProps) {
  const [payload, setPayload] = useState<FlightdeckBoardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamFilter, setStreamFilter] = useState<string | null>(
    initialStream
  );
  const [search, setSearch] = useState("");
  const [hideComplete, setHideComplete] = useState(true);
  const [selected, setSelected] = useState<FlightdeckBoardItem | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch("/api/flightdeck/board");
      if (!res.ok) {
        throw new Error(`Board load failed (${res.status})`);
      }
      const data = (await res.json()) as FlightdeckBoardPayload;
      setPayload(data);
      if (data.error && data.items.length === 0) {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load board");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setStreamFilter(initialStream ?? null);
  }, [initialStream]);

  const filteredItems = useMemo(() => {
    if (!payload) {
      return [];
    }
    const q = search.trim().toLowerCase();
    return payload.items.filter((item) => {
      if (hideComplete && item.status === "Complete") {
        return false;
      }
      if (streamFilter && item.stream !== streamFilter) {
        return false;
      }
      if (!q) {
        return true;
      }
      const hay = [item.title, item.stream, item.owner, item.status, item.ref]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [payload, search, streamFilter, hideComplete]);

  const columns = useMemo(() => {
    if (!payload) {
      return [];
    }
    return payload.columns.filter((col) => !hideComplete || col !== "Complete");
  }, [payload, hideComplete]);

  const runAction = async (verb: FlightdeckBoardVerb) => {
    if (!selected) {
      return;
    }
    setActionBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/flightdeck/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verb,
          item: selected.ref ?? selected.id,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Action failed");
      }
      await load(true);
      setSelected(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-white/[0.06] border-b px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <LayoutDashboardIcon className="h-4 w-4 shrink-0 text-white/45" />
            <div className="min-w-0">
              <h1 className="font-semibold text-sm text-white/85">
                Flightdeck
              </h1>
              <p className="text-[10px] text-white/35">
                Project #{payload?.projectNumber ?? 17}
                {payload?.source ? ` · ${payload.source}` : ""}
                {payload?.source === "github" ? " · read-only" : ""}
              </p>
            </div>
          </div>
          <Button
            className="h-8 gap-1.5 border-white/[0.08] bg-white/[0.04] text-[11px] text-white/60"
            disabled={refreshing}
            onClick={() => {
              load(true);
            }}
            size="sm"
            variant="outline"
          >
            <RefreshCwIcon
              className={cn("h-3 w-3", refreshing && "animate-spin")}
            />
            Refresh
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 h-3 w-3 -translate-y-1/2 text-white/25" />
            <input
              className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] pr-3 pl-8 text-[11px] text-white/70 outline-none placeholder:text-white/25 focus:border-white/[0.14]"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search board…"
              value={search}
            />
          </div>
          <select
            className="h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-white/60 outline-none"
            onChange={(e) => setStreamFilter(e.target.value || null)}
            value={streamFilter ?? ""}
          >
            <option value="">All streams</option>
            {(payload?.streams ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[10px] text-white/40">
            <input
              checked={hideComplete}
              className="rounded border-white/20"
              onChange={(e) => setHideComplete(e.target.checked)}
              type="checkbox"
            />
            Hide complete
          </label>
        </div>

        {error ? (
          <p className="mt-2 text-[11px] text-amber-400/80">{error}</p>
        ) : null}
      </header>

      <div className="relative min-h-0 flex-1">
        {loading && !payload ? (
          <div className="flex h-full items-center justify-center gap-2 text-white/35 text-xs">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            Loading Flightdeck…
          </div>
        ) : (
          <div className="flex h-full gap-3 overflow-x-auto p-4 md:p-6">
            {columns.map((status) => {
              const cards = filteredItems.filter((i) => i.status === status);
              return (
                <section
                  className="flex w-[17rem] shrink-0 flex-col rounded-xl border border-white/[0.06] bg-white/[0.02]"
                  key={status}
                >
                  <div className="flex items-center justify-between border-white/[0.06] border-b px-3 py-2">
                    <h2 className="font-semibold text-[10px] text-white/40 uppercase tracking-wider">
                      {status}
                    </h2>
                    <span className="text-[10px] text-white/25">
                      {cards.length}
                    </span>
                  </div>
                  <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                    {cards.map((item) => (
                      <li key={itemKey(item)}>
                        <button
                          className={cn(
                            "w-full rounded-lg border px-2.5 py-2 text-left transition-colors",
                            selected?.id === item.id
                              ? "border-white/[0.14] bg-white/[0.08]"
                              : "border-white/[0.04] bg-white/[0.03] hover:border-white/[0.1] hover:bg-white/[0.05]"
                          )}
                          onClick={() => {
                            setSelected(item);
                            setActionError(null);
                          }}
                          type="button"
                        >
                          <p className="line-clamp-3 text-[11px] text-white/75 leading-snug">
                            {item.title}
                          </p>
                          {item.stream ? (
                            <p className="mt-1 truncate text-[10px] text-white/30">
                              {item.stream}
                            </p>
                          ) : null}
                          {item.owner ? (
                            <p className="mt-0.5 text-[10px] text-white/25">
                              {item.owner}
                            </p>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        {selected ? (
          <aside className="absolute top-0 right-0 flex h-full w-full max-w-md flex-col border-white/[0.08] border-l bg-[#0d0d0f]/95 backdrop-blur-md md:w-[22rem]">
            <div className="flex items-start justify-between gap-2 border-white/[0.06] border-b px-4 py-3">
              <div className="min-w-0">
                <p className="text-[10px] text-white/30">
                  #{selected.ref ?? "draft"} · {selected.status}
                </p>
                <h3 className="mt-1 text-sm text-white/85 leading-snug">
                  {selected.title}
                </h3>
              </div>
              <button
                className="rounded-lg p-1 text-white/35 hover:bg-white/[0.06] hover:text-white/60"
                onClick={() => setSelected(null)}
                type="button"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-[11px] text-white/55">
              {selected.stream ? (
                <p>
                  <span className="text-white/30">Stream · </span>
                  {selected.stream}
                </p>
              ) : null}
              {selected.owner ? (
                <p>
                  <span className="text-white/30">Owner · </span>
                  {selected.owner}
                </p>
              ) : null}
              {selected.approval ? (
                <p>
                  <span className="text-white/30">Approval · </span>
                  {selected.approval}
                  {selected.approver ? ` (${selected.approver})` : ""}
                </p>
              ) : null}
              {selected.body ? (
                <p className="line-clamp-[12] whitespace-pre-wrap text-white/45 leading-relaxed">
                  {selected.body}
                </p>
              ) : null}
            </div>

            <div className="shrink-0 space-y-2 border-white/[0.06] border-t px-4 py-3">
              {payload?.source === "github" ? (
                <p className="text-[10px] text-white/30">
                  Read-only view via GitHub. Set NOZERO_TOWER_API_KEY to run
                  board actions here.
                </p>
              ) : null}
              {actionError ? (
                <p className="text-[10px] text-red-400/90">{actionError}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {actionsForStatus(selected.status).map((verb) => (
                  <Button
                    className="h-7 border-white/[0.08] bg-white/[0.04] text-[10px] text-white/65 capitalize"
                    disabled={actionBusy || payload?.source === "github"}
                    key={verb}
                    onClick={() => {
                      runAction(verb);
                    }}
                    size="sm"
                    variant="outline"
                  >
                    {verb.replaceAll("_", " ")}
                  </Button>
                ))}
              </div>
              {selected.url ? (
                <a
                  className="inline-flex items-center gap-1 text-[10px] text-white/45 hover:text-white/70"
                  href={selected.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Open on GitHub
                  <ExternalLinkIcon className="h-3 w-3" />
                </a>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
