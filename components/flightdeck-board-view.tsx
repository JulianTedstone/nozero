"use client";

import {
  ChevronDownIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  Loader2Icon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { InlineFieldPicker } from "@/components/flightdeck-inline-field-picker";
import { FlightdeckStreamSelect } from "@/components/flightdeck-stream-select";
import { FlightdeckTaskPanel } from "@/components/flightdeck-task-panel";
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
import { DEFAULT_FLIGHTDECK_FIELD_OPTIONS } from "@/lib/flightdeck-field-options";
import {
  mergeStreamOrder,
  readFlightdeckBoardPrefs,
  writeFlightdeckBoardPrefs,
} from "@/lib/flightdeck-board-preferences";
import {
  readFlightdeckBoardMirror,
  writeFlightdeckBoardMirror,
} from "@/lib/local-mirror/db";
import { cn } from "@/lib/utils";
import type {
  FlightdeckBoardItem,
  FlightdeckBoardPayload,
  FlightdeckBoardVerb,
} from "@/types/flightdeck-board";

interface FlightdeckBoardViewProps {
  initialStream?: string | null;
  mirrorVersion?: number;
  tabBar?: ReactNode;
  userId?: string;
}

type GroupBy = "stream" | "owner" | "approver";
type SortBy = "ticket" | "next-action-desc" | "priority-asc";

const RECURRING_STATUS = "Recurring";
const SCHEDULED_STATUS = "Scheduled";
const COMPLETE_STATUS = "Complete";
const PRIORITY_ORDER = ["p0", "p1", "p2", "p3", "p4", "p5"];
const COLUMN_WIDTH_CLASS = "w-[17rem]";

type ColumnSlot =
  | { kind: "status"; status: string }
  | { kind: "recurring" };

function columnCounts(
  groupItems: FlightdeckBoardItem[],
  slots: ColumnSlot[],
): { key: string; label: string; count: number }[] {
  return slots.map((slot) => {
    if (slot.kind === "recurring") {
      return {
        key: RECURRING_STATUS,
        label: RECURRING_STATUS,
        count: groupItems.filter((item) => item.status === RECURRING_STATUS)
          .length,
      };
    }
    return {
      key: slot.status,
      label: slot.status,
      count: groupItems.filter((item) => item.status === slot.status).length,
    };
  });
}

function formatColumnTotal(label: string, count: number): string {
  return `${count} (${label.toLowerCase()})`;
}

function itemKey(item: FlightdeckBoardItem): string {
  return item.ref ?? item.id;
}

export function FlightdeckBoardView({
  initialStream = null,
  mirrorVersion = 0,
  tabBar,
  userId,
}: FlightdeckBoardViewProps) {
  const [payload, setPayload] = useState<FlightdeckBoardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamFilter, setStreamFilter] = useState<string | null>(
    initialStream
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<FlightdeckBoardItem | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskBody, setNewTaskBody] = useState("");
  const [newTaskStream, setNewTaskStream] = useState<string | undefined>(
    initialStream ?? undefined
  );
  const [newTaskOwner, setNewTaskOwner] = useState("Ted");
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>("stream");
  const [sortBy, setSortBy] = useState<SortBy>("ticket");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {}
  );
  const [pinnedStreams, setPinnedStreams] = useState<string[]>(
    () => readFlightdeckBoardPrefs().pinnedStreams,
  );
  const [streamOrder, setStreamOrder] = useState<string[]>(
    () => readFlightdeckBoardPrefs().streamOrder,
  );
  const [hiddenStreams, setHiddenStreams] = useState<Record<string, boolean>>(
    () => readFlightdeckBoardPrefs().hiddenStreams,
  );
  const [dragStream, setDragStream] = useState<string | null>(null);

  useEffect(() => {
    writeFlightdeckBoardPrefs({
      pinnedStreams,
      streamOrder,
      hiddenStreams,
    });
  }, [pinnedStreams, streamOrder, hiddenStreams]);

  const owners = useMemo(
    () => payload?.owners ?? ["Ted", "Claude", "Bertrand"],
    [payload?.owners]
  );

  const fieldOptions = useMemo(
    () => payload?.fieldOptions ?? DEFAULT_FLIGHTDECK_FIELD_OPTIONS,
    [payload?.fieldOptions]
  );

  const load = useCallback(
    async (opts?: {
      silent?: boolean;
      fetchNetwork?: boolean;
    }): Promise<FlightdeckBoardPayload | null> => {
      const silent = opts?.silent ?? false;
      const fetchNetwork = opts?.fetchNetwork !== false;

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        if (userId) {
          const cached = await readFlightdeckBoardMirror(userId);
          if (cached) {
            setPayload(cached);
            if (!silent) {
              setLoading(false);
            }
          }
        }

        if (!fetchNetwork) {
          return userId ? await readFlightdeckBoardMirror(userId) : null;
        }

        if (!navigator.onLine) {
          return userId ? await readFlightdeckBoardMirror(userId) : null;
        }

        const res = await fetch("/api/flightdeck/board");
        if (!res.ok) {
          throw new Error(`Board load failed (${res.status})`);
        }
        const data = (await res.json()) as FlightdeckBoardPayload;
        if (userId) {
          await writeFlightdeckBoardMirror(userId, data);
        }
        setPayload(data);
        if (data.error && data.items.length === 0) {
          setError(data.error);
        }
        return data;
      } catch (err) {
        const cached = userId ? await readFlightdeckBoardMirror(userId) : null;
        if (!cached) {
          setError(err instanceof Error ? err.message : "Failed to load board");
        }
        return cached;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (!userId || mirrorVersion === 0) {
      return;
    }
    load({ silent: true, fetchNetwork: false }).catch(() => undefined);
  }, [load, mirrorVersion, userId]);

  useEffect(() => {
    setStreamFilter(initialStream ?? null);
    if (initialStream) {
      setNewTaskStream(initialStream);
    }
  }, [initialStream]);

  const filteredItems = useMemo(() => {
    if (!payload) {
      return [];
    }
    const q = search.trim().toLowerCase();
    return payload.items.filter((item) => {
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
  }, [payload, search, streamFilter]);

  const sortedItems = useMemo(() => {
    const items = [...filteredItems];
    items.sort((a, b) => {
      if (sortBy === "next-action-desc") {
        const at = a.nextAction ? Date.parse(a.nextAction) : 0;
        const bt = b.nextAction ? Date.parse(b.nextAction) : 0;
        if (at !== bt) {
          return bt - at;
        }
      }
      if (sortBy === "priority-asc") {
        const ap = PRIORITY_ORDER.indexOf((a.priority ?? "").toLowerCase());
        const bp = PRIORITY_ORDER.indexOf((b.priority ?? "").toLowerCase());
        const ai = ap === -1 ? Number.POSITIVE_INFINITY : ap;
        const bi = bp === -1 ? Number.POSITIVE_INFINITY : bp;
        if (ai !== bi) {
          return ai - bi;
        }
      }
      const an =
        Number((a.ref ?? "").replace(/[^\d]/g, "")) || Number.MAX_SAFE_INTEGER;
      const bn =
        Number((b.ref ?? "").replace(/[^\d]/g, "")) || Number.MAX_SAFE_INTEGER;
      if (an !== bn) {
        return an - bn;
      }
      return (a.title ?? "").localeCompare(b.title ?? "");
    });
    return items;
  }, [filteredItems, sortBy]);

  const columns = useMemo(() => {
    if (!payload) {
      return [];
    }
    return payload.columns.filter(
      (col) =>
        col !== RECURRING_STATUS &&
        col !== SCHEDULED_STATUS &&
        col !== COMPLETE_STATUS
    );
  }, [payload]);

  const showRecurringColumn = useMemo(
    () =>
      payload?.items.some((item) => item.status === RECURRING_STATUS) ?? false,
    [payload?.items]
  );

  const columnSlots = useMemo((): ColumnSlot[] => {
    type Slot = ColumnSlot;

    const slots: Slot[] = [];
    for (const status of columns) {
      slots.push({ kind: "status", status });
      if (status === "Backlog" && showRecurringColumn) {
        slots.push({ kind: "recurring" });
      }
    }
    if (showRecurringColumn && !columns.includes("Backlog")) {
      slots.unshift({ kind: "recurring" });
    }
    return slots;
  }, [columns, showRecurringColumn]);

  const syncSelection = useCallback(
    (
      data: FlightdeckBoardPayload | null,
      previous: FlightdeckBoardItem | null
    ) => {
      if (!(data && previous)) {
        return;
      }
      const key = itemKey(previous);
      const next = data.items.find((item) => itemKey(item) === key) ?? null;
      setSelected(next);
    },
    []
  );

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
      const refreshed = await load({ silent: true });
      syncSelection(refreshed, selected);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionBusy(false);
    }
  };

  const updateFields = async (
    item: FlightdeckBoardItem,
    fields: Record<string, string>
  ) => {
    if (!payload?.actionsEnabled) {
      return;
    }
    setActionBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/flightdeck/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: item.ref ?? item.id,
          fields,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Field update failed");
      }
      const refreshed = await load({ silent: true });
      syncSelection(refreshed, item);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Field update failed"
      );
    } finally {
      setActionBusy(false);
    }
  };

  const captureTask = async () => {
    const title = newTaskTitle.trim();
    const stream = newTaskStream?.trim();
    if (!title) {
      setCaptureError("Title is required");
      return;
    }
    if (!stream) {
      setCaptureError("Stream is required");
      return;
    }

    setCaptureBusy(true);
    setCaptureError(null);
    try {
      const knownStreams = new Set(payload?.streams ?? []);
      if (!knownStreams.has(stream)) {
        const ensureRes = await fetch("/api/flightdeck/streams/ensure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: stream }),
        });
        const ensureData = (await ensureRes.json()) as { error?: string };
        if (!ensureRes.ok) {
          throw new Error(ensureData.error ?? "Could not create stream");
        }
      }

      const res = await fetch("/api/flightdeck/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body: newTaskBody.trim() || undefined,
          stream,
          owner: newTaskOwner.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; ref?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Capture failed");
      }
      setNewTaskOpen(false);
      setNewTaskTitle("");
      setNewTaskBody("");
      const refreshed = await load({ silent: true });
      if (refreshed && data.ref) {
        const created =
          refreshed.items.find((item) => item.ref === data.ref) ?? null;
        if (created) {
          setSelected(created);
        }
      }
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : "Capture failed");
    } finally {
      setCaptureBusy(false);
    }
  };

  const actionsEnabled = payload?.actionsEnabled ?? false;
  const commentsEnabled = payload?.commentsEnabled ?? false;
  const pickerDisabled = !actionsEnabled || actionBusy;

  const renderCard = (item: FlightdeckBoardItem) => (
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
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <InlineFieldPicker
            ariaLabel="Change stream"
            disabled={pickerDisabled}
            emptyLabel="Stream"
            onChange={(stream) => {
              updateFields(item, { Stream: stream }).catch(() => undefined);
            }}
            options={fieldOptions.streams}
            value={item.stream}
          />
          <InlineFieldPicker
            ariaLabel="Change owner"
            disabled={pickerDisabled}
            emptyLabel="Owner"
            onChange={(owner) => {
              updateFields(item, { Owner: owner }).catch(() => undefined);
            }}
            options={owners.length ? owners : fieldOptions.owners}
            value={item.owner}
          />
          <InlineFieldPicker
            ariaLabel="Change approver"
            disabled={pickerDisabled}
            emptyLabel="Approver"
            onChange={(approver) => {
              updateFields(item, { Approver: approver }).catch(() => undefined);
            }}
            options={fieldOptions.approvers}
            value={item.approver}
          />
        </div>
      </button>
    </li>
  );

  const renderStatusColumn = (status: string, cards: FlightdeckBoardItem[]) => (
    <div
      className={cn("flex shrink-0 flex-col", COLUMN_WIDTH_CLASS)}
      key={status}
    >
      <div className="flex items-baseline justify-between gap-2 px-0.5 pb-1.5">
        <h2 className="truncate font-medium text-[9px] text-white/35 uppercase tracking-wide">
          {status}
        </h2>
        <span className="shrink-0 text-[9px] text-white/25 tabular-nums">
          {cards.length}
        </span>
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {cards.map((item) => renderCard(item))}
      </ul>
    </div>
  );

  const groupedRows = useMemo(() => {
    const map = new Map<string, FlightdeckBoardItem[]>();
    for (const item of sortedItems) {
      const raw =
        groupBy === "stream"
          ? item.stream
          : groupBy === "owner"
            ? item.owner
            : item.approver;
      const key = raw?.trim() || "Unassigned";
      const existing = map.get(key) ?? [];
      existing.push(item);
      map.set(key, existing);
    }
    let entries = [...map.entries()];
    if (groupBy === "stream") {
      const labels = entries.map(([label]) => label);
      const order = mergeStreamOrder(streamOrder, labels);
      entries.sort(([a], [b]) => {
        const ai = order.indexOf(a);
        const bi = order.indexOf(b);
        return (
          (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) -
          (bi === -1 ? Number.MAX_SAFE_INTEGER : bi)
        );
      });
    } else {
      entries.sort(([a], [b]) => a.localeCompare(b));
    }
    return entries;
  }, [groupBy, sortedItems, streamOrder]);

  const toggleStreamVisibility = (stream: string) => {
    setHiddenStreams((prev) => ({ ...prev, [stream]: !prev[stream] }));
  };

  const showOnlyStream = (stream: string) => {
    const next: Record<string, boolean> = {};
    for (const s of payload?.streams ?? []) {
      next[s] = s !== stream;
    }
    setHiddenStreams(next);
  };

  const togglePinStream = (stream: string) => {
    setPinnedStreams((prev) => {
      if (prev.includes(stream)) {
        return prev.filter((entry) => entry !== stream);
      }
      return [...prev, stream];
    });
    setExpandedGroups((prev) => ({ ...prev, [stream]: true }));
  };

  const reorderStream = (from: string, to: string) => {
    if (from === to) {
      return;
    }
    const labels = groupedRows.map(([label]) => label);
    setStreamOrder((prev) => {
      const order = mergeStreamOrder(prev, labels);
      const fromIdx = order.indexOf(from);
      const toIdx = order.indexOf(to);
      if (fromIdx === -1 || toIdx === -1) {
        return order;
      }
      const next = [...order];
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, from);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 px-3 py-3 md:px-4">
        <div className="flex flex-wrap items-center gap-2">
          {tabBar ? (
            <div className="w-full max-w-[260px] shrink-0 md:w-[260px]">
              {tabBar}
            </div>
          ) : null}
          <Button
            className="h-8 gap-1.5 rounded-xl bg-white/95 font-medium text-[11px] text-black hover:bg-white"
            disabled={!actionsEnabled}
            onClick={() => {
              setCaptureError(null);
              setNewTaskStream(streamFilter ?? newTaskStream);
              setNewTaskOpen(true);
            }}
            size="sm"
            title={
              actionsEnabled
                ? "Capture a new task to Backlog"
                : "Set NOZERO_TOWER_API_KEY to capture tasks"
            }
          >
            <PlusIcon className="h-3.5 w-3.5" />
            New Task
          </Button>
          <div className="relative min-w-[10rem] flex-1">
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
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            value={groupBy}
          >
            <option value="stream">Group by: Stream</option>
            <option value="owner">Group by: Owner</option>
            <option value="approver">Group by: Approver</option>
          </select>
          <select
            className="h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-white/60 outline-none"
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            value={sortBy}
          >
            <option value="ticket">Sort: Ticket No</option>
            <option value="next-action-desc">Sort: Next Action (desc)</option>
            <option value="priority-asc">Sort: Priority (asc)</option>
          </select>
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
          <Button
            className="h-8 gap-1.5 border-white/[0.08] bg-white/[0.04] text-[11px] text-white/60"
            disabled={refreshing}
            onClick={() => {
              load({ silent: true }).catch(() => undefined);
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

        {error ? (
          <p className="mt-2 text-[11px] text-amber-400/80">{error}</p>
        ) : null}
        {actionsEnabled ? null : (
          <p className="mt-2 text-[10px] text-white/30">
            Board actions are read-only until NOZERO_TOWER_API_KEY is configured
            (restart the dev server after adding it to .env.local).
          </p>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        {loading && !payload ? (
          <div className="flex h-full items-center justify-center gap-2 text-white/35 text-xs">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            Loading Flightdeck…
          </div>
        ) : (
          <div className="flex h-full min-w-0 gap-2 p-4 md:p-6">
            <div className="flex min-w-0 flex-1 flex-col divide-y divide-white/[0.06] overflow-y-auto">
              {groupedRows.map(([groupLabel, groupItems]) => {
                if (groupBy === "stream" && hiddenStreams[groupLabel]) {
                  return null;
                }
                const isPinned = pinnedStreams.includes(groupLabel);
                const groupExpanded =
                  isPinned || (expandedGroups[groupLabel] ?? false);
                const counts = columnCounts(groupItems, columnSlots);
                const totalsSummary = counts
                  .filter((col) => col.count > 0)
                  .map((col) => formatColumnTotal(col.label, col.count))
                  .join(" › ");

                return (
                  <section
                    className={cn(
                      "group/section",
                      dragStream === groupLabel && "bg-sky-500/[0.04]",
                    )}
                    key={groupLabel}
                    onDragOver={(event) => {
                      if (groupBy !== "stream" || !dragStream) {
                        return;
                      }
                      event.preventDefault();
                    }}
                    onDrop={(event) => {
                      if (groupBy !== "stream" || !dragStream) {
                        return;
                      }
                      event.preventDefault();
                      reorderStream(dragStream, groupLabel);
                      setDragStream(null);
                    }}
                  >
                    <div className="flex items-stretch gap-2 py-2.5">
                      <div className="flex w-[11rem] shrink-0 items-center gap-1.5">
                        <button
                          aria-label={
                            groupExpanded ? "Collapse lane" : "Expand lane"
                          }
                          className="rounded p-0.5 text-white/35 hover:text-white/60"
                          onClick={() =>
                            setExpandedGroups((prev) => ({
                              ...prev,
                              [groupLabel]: !groupExpanded,
                            }))
                          }
                          type="button"
                        >
                          {groupExpanded ? (
                            <ChevronDownIcon className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRightIcon className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {groupBy === "stream" ? (
                          <input
                            checked={!hiddenStreams[groupLabel]}
                            className="h-3.5 w-3.5 rounded border-white/[0.2] bg-transparent"
                            onChange={() => toggleStreamVisibility(groupLabel)}
                            type="checkbox"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <p className="truncate text-[11px] text-white/60 leading-tight">
                            {groupLabel}
                          </p>
                          {totalsSummary ? (
                            <p className="mt-0.5 truncate text-[9px] text-white/28">
                              {totalsSummary}
                            </p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-[9px] text-white/28 tabular-nums">
                          {groupItems.length}
                        </span>
                      </div>

                      <div className="flex min-w-0 flex-1 gap-3 overflow-x-auto">
                        {counts.map((col) => (
                          <div
                            className={cn(
                              "shrink-0 px-1 text-center",
                              COLUMN_WIDTH_CLASS,
                            )}
                            key={`${groupLabel}-${col.key}`}
                          >
                            <p className="text-[10px] text-white/45 tabular-nums">
                              {col.count}
                            </p>
                            <p className="truncate text-[9px] text-white/25 uppercase tracking-wide">
                              {col.label}
                            </p>
                          </div>
                        ))}
                      </div>

                      {groupBy === "stream" ? (
                        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/section:opacity-100 group-focus-within/section:opacity-100">
                          <button
                            aria-label="Reorder stream"
                            className="cursor-grab rounded p-1 text-white/35 hover:bg-white/[0.06] hover:text-white/60 active:cursor-grabbing"
                            draggable
                            onDragEnd={() => setDragStream(null)}
                            onDragStart={() => setDragStream(groupLabel)}
                            type="button"
                          >
                            <GripVerticalIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            aria-label={
                              isPinned ? "Unpin stream" : "Pin stream open"
                            }
                            className="rounded p-1 text-white/35 hover:bg-white/[0.06] hover:text-white/60"
                            onClick={() => togglePinStream(groupLabel)}
                            type="button"
                          >
                            {isPinned ? (
                              <PinOffIcon className="h-3.5 w-3.5" />
                            ) : (
                              <PinIcon className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            className="rounded px-2 py-0.5 text-[10px] text-white/40 hover:bg-white/[0.05] hover:text-white/65"
                            onClick={() => showOnlyStream(groupLabel)}
                            type="button"
                          >
                            Hide Others
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {groupExpanded ? (
                      <div className="flex min-w-0 gap-3 overflow-x-auto pb-3">
                        {columnSlots.map((slot) => {
                          if (slot.kind === "recurring") {
                            const cards = groupItems.filter(
                              (item) => item.status === RECURRING_STATUS
                            );
                            if (cards.length === 0) {
                              return null;
                            }
                            return renderStatusColumn(RECURRING_STATUS, cards);
                          }
                          const cards = groupItems.filter(
                            (item) => item.status === slot.status
                          );
                          return renderStatusColumn(slot.status, cards);
                        })}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </div>
        )}

        {selected ? (
          <FlightdeckTaskPanel
            actionBusy={actionBusy}
            actionError={actionError}
            actionsEnabled={actionsEnabled}
            commentsEnabled={commentsEnabled}
            fieldOptions={fieldOptions}
            item={selected}
            onClose={() => setSelected(null)}
            onFieldsChange={updateFields}
            onRunAction={runAction}
            owners={owners}
          />
        ) : null}
      </div>

      <Dialog onOpenChange={setNewTaskOpen} open={newTaskOpen}>
        <DialogContent className="border-white/[0.08] bg-[#121214] text-white/85">
          <DialogHeader>
            <DialogTitle className="text-white/90">New task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-white/50" htmlFor="fd-task-title">
                Title
              </Label>
              <Input
                className="border-white/[0.08] bg-white/[0.03] text-white/80"
                id="fd-task-title"
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="What needs doing?"
                value={newTaskTitle}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/50">Stream</Label>
              <FlightdeckStreamSelect
                onChange={setNewTaskStream}
                streams={payload?.streams}
                value={newTaskStream}
                variant="field"
              />
              <p className="text-[10px] text-white/30">
                Pick an existing stream or type a new name — it will be created
                on capture.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/50" htmlFor="fd-task-owner">
                Owner
              </Label>
              <select
                className="flex h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-white/80 outline-none"
                id="fd-task-owner"
                onChange={(e) => setNewTaskOwner(e.target.value)}
                value={newTaskOwner}
              >
                {owners.map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/50" htmlFor="fd-task-body">
                Notes (optional)
              </Label>
              <textarea
                className="min-h-[5rem] w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white/80 outline-none placeholder:text-white/25"
                id="fd-task-body"
                onChange={(e) => setNewTaskBody(e.target.value)}
                placeholder="Context, links, acceptance criteria…"
                value={newTaskBody}
              />
            </div>
            {captureError ? (
              <p className="text-[11px] text-red-400/90">{captureError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              className="border-white/[0.08] bg-white/[0.04] text-white/70"
              onClick={() => setNewTaskOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="bg-white/95 text-black hover:bg-white"
              disabled={captureBusy}
              onClick={() => {
                captureTask().catch(() => undefined);
              }}
              type="button"
            >
              {captureBusy ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                "Capture to Backlog"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
