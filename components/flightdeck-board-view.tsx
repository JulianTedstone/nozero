"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  RepeatIcon,
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
import { cn } from "@/lib/utils";
import type {
  FlightdeckBoardItem,
  FlightdeckBoardPayload,
  FlightdeckBoardVerb,
} from "@/types/flightdeck-board";

interface FlightdeckBoardViewProps {
  initialStream?: string | null;
  tabBar?: ReactNode;
}

const RECURRING_STATUS = "Recurring";
const SCHEDULED_STATUS = "Scheduled";
const COMPLETE_STATUS = "Complete";
const EDGE_COLLAPSED_CLASS = "w-2.5 shrink-0";

function itemKey(item: FlightdeckBoardItem): string {
  return item.ref ?? item.id;
}

export function FlightdeckBoardView({
  initialStream = null,
  tabBar,
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
  const [recurringExpanded, setRecurringExpanded] = useState(false);
  const [scheduledExpanded, setScheduledExpanded] = useState(false);
  const [completeExpanded, setCompleteExpanded] = useState(false);

  const owners = useMemo(
    () => payload?.owners ?? ["Ted", "Claude", "Bertrand"],
    [payload?.owners]
  );

  const fieldOptions = useMemo(
    () => payload?.fieldOptions ?? DEFAULT_FLIGHTDECK_FIELD_OPTIONS,
    [payload?.fieldOptions]
  );

  const load = useCallback(
    async (silent = false): Promise<FlightdeckBoardPayload | null> => {
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
        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load board");
        return null;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

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

  const scheduledCards = useMemo(
    () => filteredItems.filter((item) => item.status === SCHEDULED_STATUS),
    [filteredItems]
  );

  const completeCards = useMemo(
    () => filteredItems.filter((item) => item.status === COMPLETE_STATUS),
    [filteredItems]
  );

  const showScheduledColumn = useMemo(() => Boolean(payload), [payload]);

  const showCompleteColumn = useMemo(() => Boolean(payload), [payload]);

  const recurringCards = useMemo(
    () => filteredItems.filter((item) => item.status === RECURRING_STATUS),
    [filteredItems]
  );

  const showRecurringColumn = useMemo(
    () =>
      payload?.items.some((item) => item.status === RECURRING_STATUS) ?? false,
    [payload?.items]
  );

  const columnSlots = useMemo(() => {
    type Slot = { kind: "status"; status: string } | { kind: "recurring" };

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

  useEffect(() => {
    if (
      selected?.status === RECURRING_STATUS &&
      showRecurringColumn &&
      !recurringExpanded
    ) {
      setRecurringExpanded(true);
    }
    if (
      selected?.status === SCHEDULED_STATUS &&
      showScheduledColumn &&
      !scheduledExpanded
    ) {
      setScheduledExpanded(true);
    }
    if (
      selected?.status === COMPLETE_STATUS &&
      showCompleteColumn &&
      !completeExpanded
    ) {
      setCompleteExpanded(true);
    }
  }, [
    selected,
    showRecurringColumn,
    recurringExpanded,
    showScheduledColumn,
    scheduledExpanded,
    showCompleteColumn,
    completeExpanded,
  ]);

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
      const refreshed = await load(true);
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
      const refreshed = await load(true);
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
      const refreshed = await load(true);
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
        {item.body ? (
          <p className="mt-1 line-clamp-2 text-[10px] text-white/35 leading-snug">
            {item.body}
          </p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <InlineFieldPicker
            ariaLabel="Change stream"
            disabled={pickerDisabled}
            emptyLabel="Stream"
            onChange={(stream) => {
              void updateFields(item, { Stream: stream });
            }}
            options={fieldOptions.streams}
            value={item.stream}
          />
          <InlineFieldPicker
            ariaLabel="Change owner"
            disabled={pickerDisabled}
            emptyLabel="Owner"
            onChange={(owner) => {
              void updateFields(item, { Owner: owner });
            }}
            options={owners.length ? owners : fieldOptions.owners}
            value={item.owner}
          />
          <InlineFieldPicker
            ariaLabel="Change approver"
            disabled={pickerDisabled}
            emptyLabel="Approver"
            onChange={(approver) => {
              void updateFields(item, { Approver: approver });
            }}
            options={fieldOptions.approvers}
            value={item.approver}
          />
        </div>
      </button>
    </li>
  );

  const renderStatusColumn = (status: string, cards: FlightdeckBoardItem[]) => (
    <section
      className="flex w-[17rem] shrink-0 flex-col rounded-xl border border-white/[0.06] bg-white/[0.02]"
      key={status}
    >
      <div className="flex items-center justify-between border-white/[0.06] border-b px-3 py-2">
        <h2 className="font-semibold text-[10px] text-white/40 uppercase tracking-wider">
          {status}
        </h2>
        <span className="text-[10px] text-white/25">{cards.length}</span>
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {cards.map((item) => renderCard(item))}
      </ul>
    </section>
  );

  const renderEdgeColumn = (
    status: string,
    cards: FlightdeckBoardItem[],
    expanded: boolean,
    onExpandedChange: (next: boolean) => void,
    edge: "left" | "right",
    accentClass: string
  ) => {
    const collapseIcon =
      edge === "left" ? (
        <ChevronLeftIcon className="h-3.5 w-3.5" />
      ) : (
        <ChevronRightIcon className="h-3.5 w-3.5" />
      );
    const expandIcon =
      edge === "left" ? (
        <ChevronRightIcon className="h-3.5 w-3.5" />
      ) : (
        <ChevronLeftIcon className="h-3.5 w-3.5" />
      );

    if (expanded) {
      return (
        <section
          className={cn(
            "flex w-[17rem] shrink-0 flex-col rounded-xl border bg-white/[0.02]",
            accentClass
          )}
          key={status}
        >
          <div className="flex items-center justify-between gap-1 border-white/[0.06] border-b px-3 py-2">
            <h2 className="truncate font-semibold text-[10px] text-white/40 uppercase tracking-wider">
              {status}
            </h2>
            <div className="flex shrink-0 items-center gap-1">
              <span className="text-[10px] text-white/25">{cards.length}</span>
              <button
                aria-label={`Collapse ${status} column`}
                className="rounded p-0.5 text-white/35 hover:bg-white/[0.06] hover:text-white/60"
                onClick={() => onExpandedChange(false)}
                type="button"
              >
                {collapseIcon}
              </button>
            </div>
          </div>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {cards.map((item) => renderCard(item))}
          </ul>
        </section>
      );
    }

    return (
      <button
        aria-expanded={false}
        aria-label={`Expand ${status} column (${cards.length} items)`}
        className={cn(
          "group relative flex self-stretch rounded-xl border transition-colors hover:bg-white/[0.04]",
          EDGE_COLLAPSED_CLASS,
          accentClass
        )}
        key={`${status}-collapsed`}
        onClick={() => onExpandedChange(true)}
        type="button"
      >
        <span
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 rounded p-0.5 text-white/40 group-hover:text-white/65",
            edge === "left" ? "left-0" : "right-0"
          )}
        >
          {expandIcon}
        </span>
        <span className="sr-only">
          {status} ({cards.length})
        </span>
      </button>
    );
  };

  const renderRecurringColumn = () => {
    if (recurringExpanded) {
      return (
        <section
          className="flex w-[17rem] shrink-0 flex-col rounded-xl border border-violet-500/15 bg-violet-500/[0.03]"
          key={RECURRING_STATUS}
        >
          <div className="flex items-center justify-between gap-1 border-white/[0.06] border-b px-3 py-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <RepeatIcon className="h-3 w-3 shrink-0 text-violet-400/70" />
              <h2 className="truncate font-semibold text-[10px] text-violet-300/70 uppercase tracking-wider">
                {RECURRING_STATUS}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className="text-[10px] text-white/25">
                {recurringCards.length}
              </span>
              <button
                aria-label="Collapse recurring column"
                className="rounded p-0.5 text-white/35 hover:bg-white/[0.06] hover:text-white/60"
                onClick={() => setRecurringExpanded(false)}
                type="button"
              >
                <ChevronLeftIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {recurringCards.map((item) => renderCard(item))}
          </ul>
        </section>
      );
    }

    return (
      <button
        aria-expanded={false}
        aria-label={`Expand ${RECURRING_STATUS} column (${recurringCards.length} items)`}
        className="flex w-11 shrink-0 flex-col items-center gap-2 self-stretch rounded-xl border border-violet-500/15 bg-violet-500/[0.04] px-1 py-3 text-violet-300/60 transition-colors hover:border-violet-500/25 hover:bg-violet-500/[0.07]"
        key={`${RECURRING_STATUS}-collapsed`}
        onClick={() => setRecurringExpanded(true)}
        type="button"
      >
        <RepeatIcon className="h-3.5 w-3.5 shrink-0" />
        <span
          className="font-semibold text-[9px] uppercase tracking-wider [writing-mode:vertical-rl]"
          style={{ textOrientation: "mixed" }}
        >
          {RECURRING_STATUS}
        </span>
        <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[9px] text-violet-200/80 tabular-nums">
          {recurringCards.length}
        </span>
        <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-white/[0.06] border-b px-3 py-3 md:px-4">
        <div className="flex flex-wrap items-center gap-2">
          {tabBar ? (
            <div className="w-full max-w-[260px] shrink-0 md:w-[260px]">
              {tabBar}
            </div>
          ) : null}
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
          <Button
            className="h-8 gap-1.5 border-white/[0.08] bg-white/[0.04] text-[11px] text-white/60"
            disabled={refreshing}
            onClick={() => {
              void load(true);
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
            {showScheduledColumn
              ? renderEdgeColumn(
                  SCHEDULED_STATUS,
                  scheduledCards,
                  scheduledExpanded,
                  setScheduledExpanded,
                  "left",
                  "border-sky-500/15 bg-sky-500/[0.03]"
                )
              : null}
            <div className="flex min-w-0 flex-1 gap-3 overflow-x-auto">
              {columnSlots.map((slot) => {
                if (slot.kind === "recurring") {
                  return renderRecurringColumn();
                }
                const cards = filteredItems.filter(
                  (item) => item.status === slot.status
                );
                return renderStatusColumn(slot.status, cards);
              })}
            </div>
            {showCompleteColumn
              ? renderEdgeColumn(
                  COMPLETE_STATUS,
                  completeCards,
                  completeExpanded,
                  setCompleteExpanded,
                  "right",
                  "border-emerald-500/15 bg-emerald-500/[0.03]"
                )
              : null}
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
                void captureTask();
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
