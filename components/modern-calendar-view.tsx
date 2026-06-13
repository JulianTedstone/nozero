"use client";

import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircleIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LayoutDashboardIcon,
  Loader2Icon,
  LogOutIcon,
  MailIcon,
  MenuIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useBackgroundSync } from "@/hooks/use-background-sync";
import { useToast } from "@/hooks/use-toast";
import { authClient } from "@/lib/auth-client";
import { formatSyncAge } from "@/lib/format-sync-age";
import { hydrateCalendarMirrorFromServer } from "@/lib/local-mirror/calendar-hydrate";
import {
  readCalendarEventsInRange,
  readMirrorMeta,
  upsertCalendarEvents,
  writeMirrorMeta,
} from "@/lib/local-mirror/db";
import { cn, friendlyAccountName, hexToRgba } from "@/lib/utils";
import { eventMatchesVisibleSubscriptions } from "@/lib/calendar-subscription-utils";
import type { SubscriptionCalendarView } from "@/lib/calendar-subscription-utils";
import type { CalendarEvent } from "@/types/calendar";
import { AiPanel } from "./ai-panel";
import type { EventDetailSectionId } from "@/lib/event-detail-layout";
import { ContextView } from "./context-view";
import { ContextIcon } from "./context-icon";
import { FlightdeckBoardView } from "./flightdeck-board-view";
import { EmailView } from "./email-view";
import {
  EventContextPanel,
  type EventContextNavigation,
} from "./event-context-panel";
import { EventDetailPanel } from "./event-detail-panel";
import type { ContextFocus } from "@/types/context-focus";

type SyncStatus = "idle" | "syncing" | "success" | "error";

type CalendarSyncResponse = {
  message?: string;
  status?: string;
  pulled?: number;
  deleted?: number;
  accounts?: number;
  errors?: string[];
};

type ViewMode = "day" | "week" | "month" | "year";

type RightPanel = "none" | "event" | "ai";

interface GoogleCalendar {
  accountEmail?: string;
  backgroundColor: string;
  id: string;
  primary: boolean;
  summary: string;
  visible: boolean;
}

interface ModernCalendarViewProps {
  initialEvents: CalendarEvent[];
  eventSectionOrder?: EventDetailSectionId[];
  persona?: "Bertrand" | "Pierre";
  userEmail?: string;
  userId?: string;
  userImage?: string;
  userName?: string;
  userProvider?: string;
}

const HOUR_HEIGHT_PX = 48;
const DAY_GRID_HEIGHT = 24 * HOUR_HEIGHT_PX;

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function resolveEventCalendarColor(
  event: CalendarEvent,
  subscriptions: SubscriptionCalendarView[],
): string {
  if (!event.source || event.source === "local") {
    return event.color ?? "#3b82f6";
  }

  const calendarId = event.calendarId ?? "primary";
  const accountEmail = event.accountEmail?.toLowerCase();
  const match = subscriptions.find(
    (s) =>
      s.calendarId === calendarId &&
      s.sourceType === event.source &&
      (!accountEmail || s.accountEmail.toLowerCase() === accountEmail),
  );

  return match?.color ?? event.color ?? "#3b82f6";
}

function eventPillStyle(
  event: CalendarEvent,
  subscriptions: SubscriptionCalendarView[],
): CSSProperties {
  const color = resolveEventCalendarColor(event, subscriptions);
  return {
    backgroundColor: hexToRgba(color, 0.28),
    color: "rgba(255, 255, 255, 0.9)",
    border: "none",
    boxShadow: "none",
  };
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

export function ModernCalendarView({
  initialEvents,
  eventSectionOrder,
  persona = "Bertrand",
  userId,
  userEmail,
  userName,
  userImage,
  userProvider,
}: ModernCalendarViewProps) {
  const router = useRouter();
  const { dismiss, toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [miniCalendarDate, setMiniCalendarDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null
  );
  const [rightPanel, setRightPanel] = useState<RightPanel>("none");
  const [eventPanelMode, setEventPanelMode] = useState<
    "create" | "edit" | "view"
  >("create");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [subscribedCalendars, setSubscribedCalendars] = useState<
    SubscriptionCalendarView[]
  >([]);
  const [calendarsExpanded, setCalendarsExpanded] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncSummary, setSyncSummary] = useState<string | null>(null);
  const [backgroundExtending, setBackgroundExtending] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "email" | "calendar" | "board" | "context"
  >("calendar");
  const [contextFocus, setContextFocus] = useState<ContextFocus>({
    type: "none",
  });
  const [centerView, setCenterView] = useState<"calendar" | "context">(
    "calendar",
  );
  const [contextEvent, setContextEvent] = useState<CalendarEvent | null>(null);
  const [boardStreamFilter, setBoardStreamFilter] = useState<string | null>(
    null,
  );
  const searchParams = useSearchParams();
  const [emailThreadId, setEmailThreadId] = useState<string | null>(null);
  const [emailMirrorVersion, setEmailMirrorVersion] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const mirrorSeededRef = useRef(false);

  const isMobile = useIsMobile();
  const isLoggedIn = !!userId;

  const displayEvents = useMemo(() => {
    let filtered = events.filter((event) =>
      eventMatchesVisibleSubscriptions(event, subscribedCalendars),
    );
    if (!filterQuery.trim()) return filtered;
    const q = filterQuery.toLowerCase();
    return filtered.filter(
      (e) =>
        e.title?.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q) ||
        e.location?.toLowerCase().includes(q),
    );
  }, [events, filterQuery, subscribedCalendars]);

  const refreshEvents = useCallback(
    async (opts?: { fetchNetwork?: boolean }) => {
      if (!userId) {
        return;
      }

      let start: Date;
      let end: Date;

      switch (viewMode) {
        case "day":
          start = new Date(currentDate);
          start.setHours(0, 0, 0, 0);
          end = new Date(currentDate);
          end.setHours(23, 59, 59, 999);
          break;
        case "week":
          start = startOfWeek(currentDate);
          end = endOfWeek(currentDate);
          break;
        case "month":
          start = startOfMonth(currentDate);
          end = endOfMonth(currentDate);
          break;
        case "year":
          start = startOfYear(currentDate);
          end = endOfYear(currentDate);
          break;
      }

      const localEvents = await readCalendarEventsInRange(userId, start, end);
      setEvents(localEvents);

      const shouldFetch =
        opts?.fetchNetwork !== false && typeof navigator !== "undefined" && navigator.onLine;
      if (!shouldFetch) {
        return;
      }

      try {
        const response = await fetch(
          `/api/calendar/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`,
        );
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { events?: CalendarEvent[] };
        if (data.events?.length) {
          await upsertCalendarEvents(userId, data.events);
        }
        const merged = await readCalendarEventsInRange(userId, start, end);
        setEvents(merged);
      } catch {
        // Keep the local mirror visible when offline or the API is unreachable.
      }
    },
    [currentDate, userId, viewMode],
  );

  const runBackgroundExtend = useCallback(async () => {
    if (!userId) return;

    setBackgroundExtending(true);
    try {
      let fullyExtended = false;
      let iterations = 0;
      const maxIterations = 24;

      while (!fullyExtended && iterations < maxIterations) {
        iterations += 1;
        const res = await fetch("/api/calendar/sync/extend", {
          method: "POST",
        });
        if (!res.ok) break;

        const data = (await res.json()) as {
          extended?: boolean;
          pastComplete?: boolean;
          futureComplete?: boolean;
        };

        if (!data.extended) {
          fullyExtended = true;
          break;
        }

        await refreshEvents();

        if (data.pastComplete && data.futureComplete) {
          fullyExtended = true;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 400));
      }
    } catch {
      // Background extension is best-effort.
    } finally {
      setBackgroundExtending(false);
    }
  }, [refreshEvents, userId]);

  const runCalendarSync = useCallback(async () => {
      if (!userId) return;

      setSyncStatus("syncing");
      setSyncSummary(null);

      try {
        const res = await fetch("/api/calendar/sync", { method: "POST" });
        const data = (await res.json()) as CalendarSyncResponse;
        const errors = data.errors ?? [];
        const pulled = data.pulled ?? 0;
        const accounts = data.accounts ?? 0;

        if (!res.ok || data.status === "error") {
          const detail =
            errors.length > 0
              ? errors.join("; ")
              : data.message ?? `Sync failed (${res.status})`;
          setSyncStatus("error");
          setSyncSummary(detail);
          toast({
            title: "Calendar sync failed",
            description: detail,
            variant: "destructive",
          });
          return;
        }

        await hydrateCalendarMirrorFromServer(userId);
        const syncedAt = new Date();
        setLastSyncedAt(syncedAt);
        await refreshEvents({ fetchNetwork: true });

        if (errors.length > 0) {
          setSyncStatus("error");
          setSyncSummary(errors.join("; "));
          toast({
            title: "Sync completed with warnings",
            description: errors.join("; "),
          });
          void runBackgroundExtend();
          return;
        }

        setSyncStatus("success");
        setSyncSummary(
          accounts > 0
            ? `${pulled} event${pulled === 1 ? "" : "s"} from ${accounts} account${accounts === 1 ? "" : "s"}`
            : (data.message ?? "Synced"),
        );

        void runBackgroundExtend();
      } catch {
        const detail = "Could not reach the sync server";
        setSyncStatus("error");
        setSyncSummary(detail);
        toast({
          title: "Calendar sync failed",
          description: detail,
          variant: "destructive",
        });
      }
    },
    [refreshEvents, runBackgroundExtend, toast, userId],
  );

  useBackgroundSync({
    userId,
    enabled: isLoggedIn,
    onCalendarSynced: () => refreshEvents({ fetchNetwork: true }),
    onEmailSynced: () => setEmailMirrorVersion((v) => v + 1),
  });

  useEffect(() => {
    router.prefetch("/settings");
  }, [router]);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetch("/api/calendar/subscriptions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.calendars) return;
        setSubscribedCalendars(data.calendars as SubscriptionCalendarView[]);
        if (typeof data.sidebarExpanded === "boolean") {
          setCalendarsExpanded(data.sidebarExpanded);
        }
      })
      .catch(() => {});
  }, [isLoggedIn]);

  useEffect(() => {
    if (!userId || mirrorSeededRef.current) return;
    mirrorSeededRef.current = true;

    void (async () => {
      if (initialEvents.length > 0) {
        await upsertCalendarEvents(userId, initialEvents);
      }
      const meta = await readMirrorMeta(userId, "calendar");
      if (meta?.lastSyncAt) {
        setLastSyncedAt(new Date(meta.lastSyncAt));
      }
      await refreshEvents({ fetchNetwork: false });
      if (navigator.onLine) {
        await hydrateCalendarMirrorFromServer(userId);
        const hydratedMeta = await readMirrorMeta(userId, "calendar");
        if (hydratedMeta?.lastSyncAt) {
          setLastSyncedAt(new Date(hydratedMeta.lastSyncAt));
        }
        await refreshEvents({ fetchNetwork: false });
      }
    })();
  }, [initialEvents, refreshEvents, userId]);

  useEffect(() => {
    if (!userId) return;
    void refreshEvents({ fetchNetwork: navigator.onLine });
  }, [currentDate, refreshEvents, userId, viewMode]);

  useEffect(() => {
    if (!isMobile || rightPanel === "none") {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobile, rightPanel]);

  const openCreatePanel = useCallback((date: Date) => {
    setSelectedDate(date);
    setSelectedEvent(null);
    setEventPanelMode("create");
    setRightPanel("event");
    setSidebarOpen(false);
  }, []);

  const openEditPanel = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
    setSelectedDate(event.start ? new Date(event.start) : null);
    setEventPanelMode("edit");
    setRightPanel("event");
    setSidebarOpen(false);
  }, []);

  const openAiPanel = useCallback(() => {
    setRightPanel("ai");
    setSidebarOpen(false);
  }, []);

  const closePanel = useCallback(() => {
    setRightPanel("none");
    setSelectedEvent(null);
    setSelectedDate(null);
  }, []);

  const closeContextPanel = useCallback(() => {
    setCenterView("calendar");
    setContextEvent(null);
  }, []);

  const openContextPanel = useCallback((event: CalendarEvent) => {
    setCenterView("context");
    setContextEvent(event);
    setRightPanel("none");
    setSelectedEvent(null);
    setSidebarOpen(false);
  }, []);

  const openMeetingContext = useCallback(
    (event: CalendarEvent) => {
      openContextPanel(event);
    },
    [openContextPanel],
  );

  const contextNavigation = useMemo<EventContextNavigation>(
    () => ({
      onOpenCalendarEvent: (ev: CalendarEvent) => {
        closeContextPanel();
        setActiveTab("calendar");
        setContextFocus({ type: "none" });
        openEditPanel(ev);
      },
      onOpenEmail: (params?: { threadId?: string }) => {
        closeContextPanel();
        if (params?.threadId) {
          setEmailThreadId(params.threadId);
        }
        setActiveTab("email");
      },
      onOpenBoard: (params?: { stream?: string }) => {
        closeContextPanel();
        setBoardStreamFilter(params?.stream?.trim() || null);
        setActiveTab("board");
      },
    }),
    [closeContextPanel, openEditPanel],
  );

  useEffect(() => {
    const fromUrl = searchParams.get("threadId");
    if (fromUrl) {
      setEmailThreadId(fromUrl);
      setActiveTab("email");
    }
  }, [searchParams]);

  const recentContextMeetings = useMemo(() => {
    const now = Date.now();
    return [...events]
      .filter((ev) => (ev.attendees?.length ?? 0) > 0)
      .sort((a, b) => {
        const at = a.start ? new Date(a.start).getTime() : 0;
        const bt = b.start ? new Date(b.start).getTime() : 0;
        const aUp = at >= now;
        const bUp = bt >= now;
        if (aUp !== bUp) return aUp ? -1 : 1;
        return aUp ? at - bt : bt - at;
      });
  }, [events]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement);

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isTypingTarget = isEditableTarget(event.target);

      if (key === "escape") {
        if (isTypingTarget) {
          return;
        }

        if (centerView === "context") {
          event.preventDefault();
          closeContextPanel();
          return;
        }

        if (rightPanel !== "none") {
          event.preventDefault();
          closePanel();
          return;
        }

        if (sidebarOpen) {
          event.preventDefault();
          setSidebarOpen(false);
          return;
        }

        dismiss();
        return;
      }

      if (isTypingTarget) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (key === "n") {
        event.preventDefault();
        openCreatePanel(new Date());
        return;
      }

      if (key === "g") {
        event.preventDefault();
        openAiPanel();
        return;
      }

      if (key === "t") {
        event.preventDefault();
        setCurrentDate(new Date());
        return;
      }

      if (key === "d") {
        event.preventDefault();
        setViewMode("day");
        return;
      }

      if (key === "w") {
        event.preventDefault();
        setViewMode("week");
        return;
      }

      if (key === "m") {
        event.preventDefault();
        setViewMode("month");
        return;
      }

      if (key === "y") {
        event.preventDefault();
        setViewMode("year");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    centerView,
    closeContextPanel,
    closePanel,
    dismiss,
    openAiPanel,
    openCreatePanel,
    rightPanel,
    sidebarOpen,
  ]);

  const handlePrevious = () => {
    const fns: Record<ViewMode, (d: Date) => Date> = {
      day: (d) => subDays(d, 1),
      week: (d) => subWeeks(d, 1),
      month: (d) => subMonths(d, 1),
      year: (d) => subYears(d, 1),
    };
    setCurrentDate((prev) => fns[viewMode](prev));
  };

  const handleNext = () => {
    const fns: Record<ViewMode, (d: Date) => Date> = {
      day: (d) => addDays(d, 1),
      week: (d) => addWeeks(d, 1),
      month: (d) => addMonths(d, 1),
      year: (d) => addYears(d, 1),
    };
    setCurrentDate((prev) => fns[viewMode](prev));
  };

  const eventOccursOnDate = useCallback((event: CalendarEvent, date: Date) => {
    const eventStart = new Date(event.start);
    const eventEnd = new Date(event.end);
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    return eventStart <= dayEnd && eventEnd >= dayStart;
  }, []);

  const getVisibleEventStart = useCallback(
    (event: CalendarEvent, date: Date) => {
      const eventStart = new Date(event.start);
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      return eventStart > dayStart ? eventStart : dayStart;
    },
    [],
  );

  const getEventLayoutForDay = useCallback(
    (event: CalendarEvent, date: Date) => {
      const visibleStart = getVisibleEventStart(event, date);
      const eventEnd = new Date(event.end);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      const visibleEnd = eventEnd < dayEnd ? eventEnd : dayEnd;

      const startMin = minutesSinceMidnight(visibleStart);
      const endMin = Math.max(
        minutesSinceMidnight(visibleEnd),
        startMin + 5,
      );
      const durationMin = endMin - startMin;

      return {
        top: (startMin / 60) * HOUR_HEIGHT_PX,
        height: Math.max((durationMin / 60) * HOUR_HEIGHT_PX, 18),
      };
    },
    [getVisibleEventStart],
  );

  const miniCalendarDays = useMemo(() => {
    const firstDay = new Date(
      miniCalendarDate.getFullYear(),
      miniCalendarDate.getMonth(),
      1
    );
    const calendarStart = subDays(firstDay, firstDay.getDay());
    return eachDayOfInterval({
      start: calendarStart,
      end: addDays(calendarStart, 41),
    });
  }, [miniCalendarDate]);

  const toggleCalendarVisibility = (key: string) => {
    setSubscribedCalendars((prev) => {
      const next = prev.map((cal) =>
        cal.key === key ? { ...cal, visible: !cal.visible } : cal,
      );
      const target = next.find((c) => c.key === key);
      if (target) {
        void fetch("/api/calendar/visibility", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, visible: target.visible }),
        });
      }
      return next;
    });
  };

  const toggleCalendarsExpanded = () => {
    const next = !calendarsExpanded;
    setCalendarsExpanded(next);
    void fetch("/api/calendar/visibility", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sidebarExpanded: next }),
    });
  };

  const googleCalendarsForPanel: GoogleCalendar[] = useMemo(
    () =>
      subscribedCalendars
        .filter((c) => c.visible)
        .map((c) => ({
          id: c.calendarId,
          summary: c.name,
          primary: c.primary ?? false,
          backgroundColor: c.color,
          visible: c.visible,
          accountEmail: c.accountEmail,
        })),
    [subscribedCalendars],
  );

  const navigateMiniDay = (day: Date) => {
    setCurrentDate(day);
    setViewMode("day");
    setSidebarOpen(false);
  };

  /* ─── View Renderers ────────────────────────── */

  const renderDayView = () => {
    const dayEvents = displayEvents.filter(
      (event) => eventOccursOnDate(event, currentDate) && !event.allDay,
    );
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const halfHourLines = Array.from({ length: 48 }, (_, i) => i);

    return (
      <div className="liquid-glass-subtle h-full overflow-hidden rounded-2xl">
        <div className="h-full overflow-auto">
          <div className="relative flex" style={{ minHeight: DAY_GRID_HEIGHT }}>
            <div className="w-12 flex-shrink-0 md:w-16">
              {hours.map((hour) => (
                <div
                  className="py-1 pr-2 text-right text-[11px] text-white/30 md:pr-3"
                  key={hour}
                  style={{ height: HOUR_HEIGHT_PX }}
                >
                  {format(new Date().setHours(hour, 0), "h a")}
                </div>
              ))}
            </div>
            <div
              className="relative flex-1 border-l border-white/[0.04]"
              onClick={() => openCreatePanel(currentDate)}
            >
              {halfHourLines.map((slot) => (
                <div
                  className={cn(
                    "pointer-events-none absolute inset-x-0 border-b border-white/[0.04]",
                    slot % 2 === 1 && "border-dashed border-white/[0.03]",
                  )}
                  key={slot}
                  style={{ top: (slot / 2) * HOUR_HEIGHT_PX }}
                />
              ))}
              {dayEvents.map((event) => {
                const layout = getEventLayoutForDay(event, currentDate);
                return (
                  <button
                    className="event-item absolute right-1 left-1 z-[1] truncate text-left text-[10px] md:text-[11px]"
                    key={event.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditPanel(event);
                    }}
                    style={{
                      ...eventPillStyle(event, subscribedCalendars),
                      ...layout,
                    }}
                    type="button"
                  >
                    <span className="font-medium">{event.title}</span>
                    <span className="ml-1.5 opacity-70">
                      {format(
                        getVisibleEventStart(event, currentDate),
                        "h:mm a",
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate);
    const weekDays = eachDayOfInterval({
      start: weekStart,
      end: addDays(weekStart, 6),
    });
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const halfHourLines = Array.from({ length: 48 }, (_, i) => i);

    return (
      <div className="liquid-glass-subtle flex h-full flex-col overflow-hidden rounded-2xl">
        <div className="sticky top-0 z-10 grid grid-cols-8 bg-white/[0.02]">
          <div className="w-12 p-2 md:w-16" />
          {weekDays.map((day) => (
            <div
              className="px-0.5 py-2 text-center md:px-1 md:py-2.5"
              key={day.toISOString()}
            >
              <div className="text-[9px] text-white/30 md:text-[10px]">
                {format(day, isMobile ? "EEEEE" : "EEE")}
              </div>
              <div
                className={cn(
                  "mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-lg font-medium text-[10px] md:h-7 md:w-7 md:text-xs",
                  isSameDay(day, new Date()) &&
                    "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30",
                )}
              >
                {format(day, "d")}
              </div>
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-8" style={{ minHeight: DAY_GRID_HEIGHT }}>
            <div>
              {hours.map((hour) => (
                <div
                  className="py-1 pr-1 text-right text-[9px] text-white/25 md:pr-2 md:text-[10px]"
                  key={hour}
                  style={{ height: HOUR_HEIGHT_PX }}
                >
                  {format(new Date().setHours(hour, 0), "h a")}
                </div>
              ))}
            </div>
            {weekDays.map((day) => {
              const dayEvents = displayEvents.filter(
                (event) =>
                  eventOccursOnDate(event, day) && !event.allDay,
              );

              return (
                <div
                  className="relative border-r border-white/[0.04]"
                  key={day.toISOString()}
                  onClick={() => openCreatePanel(day)}
                  style={{ height: DAY_GRID_HEIGHT }}
                >
                  {halfHourLines.map((slot) => (
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-x-0 border-b border-white/[0.04]",
                        slot % 2 === 1 &&
                          "border-dashed border-white/[0.03]",
                      )}
                      key={slot}
                      style={{ top: (slot / 2) * HOUR_HEIGHT_PX }}
                    />
                  ))}
                  {dayEvents.map((event) => {
                    const layout = getEventLayoutForDay(event, day);
                    return (
                      <button
                        className="event-item absolute right-0.5 left-0.5 z-[1] truncate px-1 text-left text-[9px] md:text-[10px]"
                        key={event.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditPanel(event);
                        }}
                        style={{
                          ...eventPillStyle(event, subscribedCalendars),
                          ...layout,
                        }}
                        type="button"
                      >
                        {event.title}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderMonthView = () => {
    const firstDay = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );
    const calendarStart = subDays(firstDay, firstDay.getDay());
    const calendarEnd = addDays(calendarStart, 41);
    const allDays = eachDayOfInterval({
      start: calendarStart,
      end: calendarEnd,
    });

    const weeks: Date[][] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      weeks.push(allDays.slice(i, i + 7));
    }

    const isMultiDay = (e: CalendarEvent) => {
      const s = new Date(e.start);
      const d = new Date(e.end);
      return (
        new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime() !==
        new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
      );
    };

    const multiDayEvents = displayEvents.filter(isMultiDay);
    const MAX_LANES = 3;
    const LANE_H = 22;

    return (
      <div className="liquid-glass-subtle flex h-full flex-col overflow-hidden rounded-2xl">
        <div className="grid grid-cols-7">
          {(isMobile
            ? ["S", "M", "T", "W", "T", "F", "S"]
            : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
          ).map((day, i) => (
            <div
              className="py-2 text-center font-medium text-[10px] text-white/30 md:py-2.5 md:text-[11px]"
              key={i}
            >
              {day}
            </div>
          ))}
        </div>

        <div className="flex flex-1 flex-col overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              animate={{ opacity: 1 }}
              className="flex flex-1 flex-col"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key={format(currentDate, "yyyy-MM")}
              transition={{ duration: 0.15 }}
            >
              {weeks.map((weekDays, weekIdx) => {
                const wkStart = new Date(weekDays[0]);
                wkStart.setHours(0, 0, 0, 0);
                const wkEnd = new Date(weekDays[6]);
                wkEnd.setHours(23, 59, 59, 999);

                const touching = multiDayEvents
                  .filter((e) => {
                    const s = new Date(e.start);
                    const d = new Date(e.end);
                    return s <= wkEnd && d >= wkStart;
                  })
                  .sort((a, b) => {
                    const diff =
                      new Date(a.start).getTime() - new Date(b.start).getTime();
                    if (diff !== 0) {
                      return diff;
                    }
                    return (
                      new Date(b.end).getTime() -
                      new Date(b.start).getTime() -
                      (new Date(a.end).getTime() - new Date(a.start).getTime())
                    );
                  });

                const spans: Array<{
                  event: CalendarEvent;
                  startCol: number;
                  span: number;
                  lane: number;
                  isStart: boolean;
                  isEnd: boolean;
                }> = [];
                const laneEnds: number[] = [];

                for (const ev of touching) {
                  let startCol = -1;
                  let endCol = -1;
                  for (let i = 0; i < 7; i++) {
                    if (eventOccursOnDate(ev, weekDays[i])) {
                      if (startCol === -1) {
                        startCol = i;
                      }
                      endCol = i;
                    }
                  }
                  if (startCol === -1) {
                    continue;
                  }

                  const spanWidth = endCol - startCol + 1;

                  let lane = 0;
                  while (lane < laneEnds.length && laneEnds[lane] > startCol) {
                    lane++;
                  }
                  if (lane >= laneEnds.length) {
                    laneEnds.push(0);
                  }
                  laneEnds[lane] = startCol + spanWidth;

                  const evStartDay = new Date(ev.start);
                  evStartDay.setHours(0, 0, 0, 0);
                  const evEndDay = new Date(ev.end);
                  evEndDay.setHours(0, 0, 0, 0);

                  spans.push({
                    event: ev,
                    startCol,
                    span: spanWidth,
                    lane,
                    isStart: evStartDay >= wkStart,
                    isEnd: evEndDay <= wkEnd,
                  });
                }

                const visibleLanes = Math.min(laneEnds.length, MAX_LANES);

                return (
                  <div
                    className="relative grid flex-1 grid-cols-7"
                    key={weekIdx}
                  >
                    {weekDays.map((day) => {
                      const isCurrentMonth = isSameMonth(day, currentDate);
                      const allDayEvents = displayEvents.filter((e) =>
                        eventOccursOnDate(e, day)
                      );
                      const singleDayEvents = allDayEvents.filter(
                        (e) => !isMultiDay(e)
                      );
                      const singleLimit = Math.max(0, 3 - visibleLanes);

                      return (
                        <div
                          className={cn(
                            "min-h-[48px] cursor-pointer border-r border-b border-white/[0.04] p-1 transition-colors hover:bg-white/[0.02] md:min-h-[90px] md:p-2",
                            !isCurrentMonth && "opacity-30",
                            isSameDay(day, new Date()) && "bg-blue-500/[0.04]"
                          )}
                          key={day.toISOString()}
                          onClick={() =>
                            isMobile
                              ? navigateMiniDay(day)
                              : openCreatePanel(day)
                          }
                        >
                          <div className="mb-0.5 md:mb-1.5">
                            <span
                              className={cn(
                                "flex h-6 w-6 items-center justify-center rounded-lg font-medium text-[11px] transition-colors hover:bg-white/[0.06]",
                                isSameDay(day, new Date())
                                  ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30"
                                  : "text-white/60"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                setCurrentDate(day);
                                setViewMode("day");
                              }}
                            >
                              {format(day, "d")}
                            </span>
                          </div>

                          {visibleLanes > 0 && (
                            <div
                              className="hidden md:block"
                              style={{
                                height: visibleLanes * LANE_H,
                              }}
                            />
                          )}

                          <div className="hidden space-y-0.5 md:block">
                            {singleDayEvents
                              .slice(0, singleLimit)
                              .map((event) => (
                                <button
                                  className="event-item w-full truncate text-left"
                                  key={event.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditPanel(event);
                                  }}
                                  style={eventPillStyle(
                                    event,
                                    subscribedCalendars,
                                  )}
                                  type="button"
                                >
                                  {event.title}
                                </button>
                              ))}
                            {singleDayEvents.length > singleLimit &&
                              singleLimit > 0 && (
                                <div className="pl-2 text-[10px] text-white/30">
                                  +{singleDayEvents.length - singleLimit} more
                                </div>
                              )}
                          </div>

                          {allDayEvents.length > 0 && (
                            <div className="mt-0.5 flex justify-center gap-[3px] md:hidden">
                              {allDayEvents.slice(0, 3).map((event) => (
                                <div
                                  className="h-[5px] w-[5px] rounded-full"
                                  key={event.id}
                                  style={{
                                    backgroundColor: resolveEventCalendarColor(
                                      event,
                                      subscribedCalendars,
                                    ),
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {spans.length > 0 && (
                      <div
                        className="pointer-events-none absolute inset-x-0 hidden grid-cols-7 md:grid"
                        style={{
                          top: 38,
                          gridAutoRows: `${LANE_H}px`,
                        }}
                      >
                        {spans
                          .filter((s) => s.lane < MAX_LANES)
                          .map((span) => (
                            <button
                              className={cn(
                                "pointer-events-auto mx-[3px] flex h-[18px] items-center truncate font-medium text-[10px] transition-opacity hover:opacity-90",
                                span.isStart
                                  ? "rounded-l-[5px] pl-2"
                                  : "pl-1.5",
                                span.isEnd ? "rounded-r-[5px]" : "",
                              )}
                              key={`${span.event.id}-w${weekIdx}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditPanel(span.event);
                              }}
                              style={{
                                ...eventPillStyle(
                                  span.event,
                                  subscribedCalendars,
                                ),
                                gridColumn: `${span.startCol + 1} / span ${span.span}`,
                                gridRow: span.lane + 1,
                              }}
                              type="button"
                            >
                              {span.event.title}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    );
  };

  const renderYearView = () => {
    const months = eachMonthOfInterval({
      start: startOfYear(currentDate),
      end: endOfYear(currentDate),
    });

    return (
      <div className="grid h-full min-h-0 auto-rows-[minmax(0,1fr)] grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
        {months.map((monthDate) => {
          const firstDay = startOfMonth(monthDate);
          const calendarStart = subDays(firstDay, firstDay.getDay());
          const days = eachDayOfInterval({
            start: calendarStart,
            end: addDays(calendarStart, 34),
          });
          const monthEnd = endOfMonth(monthDate);
          const monthEvents = displayEvents.filter((event) => {
            const eventStart = new Date(event.start);
            const eventEnd = new Date(event.end);
            return eventStart <= monthEnd && eventEnd >= firstDay;
          });

          return (
            <div
              className="liquid-glass-subtle flex h-full min-h-0 flex-col overflow-hidden rounded-xl"
              key={monthDate.toISOString()}
            >
              <div className="shrink-0 border-white/[0.06] border-b px-2.5 py-1.5 md:px-3 md:py-2">
                <div className="font-semibold text-[11px] md:text-xs">
                  {format(monthDate, "MMMM")}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pt-1 pb-1.5 md:px-2 md:pt-1.5 md:pb-2">
                <div className="sticky top-0 z-[1] -mx-0.5 mb-1 bg-background/92 px-0.5 pt-0.5 pb-1 shadow-[0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-md">
                  <div className="grid grid-cols-7 gap-0.5">
                    {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                      <div
                        className="text-center font-medium text-[8px] text-white/25 md:text-[9px]"
                        key={i}
                      >
                        {d}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {days.map((day) => {
                    const hasEvents = monthEvents.some((event) =>
                      eventOccursOnDate(event, day)
                    );
                    return (
                      <button
                        className={cn(
                          "flex aspect-square items-center justify-center rounded-md text-[8px] transition-colors hover:bg-white/[0.06] md:text-[9px]",
                          !isSameMonth(day, monthDate) && "opacity-20",
                          isSameDay(day, new Date()) &&
                            "bg-blue-500/20 font-semibold text-blue-400 ring-1 ring-blue-500/30",
                          hasEvents &&
                            !isSameDay(day, new Date()) &&
                            "bg-white/[0.04] font-medium"
                        )}
                        key={day.toISOString()}
                        onClick={() => {
                          setCurrentDate(day);
                          setViewMode("day");
                        }}
                        type="button"
                      >
                        {format(day, "d")}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCalendarView = () => {
    switch (viewMode) {
      case "day":
        return renderDayView();
      case "week":
        return renderWeekView();
      case "month":
        return renderMonthView();
      case "year":
        return renderYearView();
    }
  };

  /* ─── Title ─────────────────────────────────── */

  const headerTitle = (() => {
    switch (viewMode) {
      case "day":
        return format(currentDate, isMobile ? "MMM d" : "MMMM d, yyyy");
      case "week":
        return `${format(startOfWeek(currentDate), "MMM d")}`;
      case "month":
        return format(currentDate, isMobile ? "MMM yyyy" : "MMMM yyyy");
      case "year":
        return format(currentDate, "yyyy");
    }
  })();

  /* ─── Sidebar Content (shared between mobile drawer & desktop) ── */

  const appTabBar = (
    <div className="liquid-glass-subtle flex flex-row items-center gap-0.5 rounded-xl p-1">
      {([
        { id: "email", icon: MailIcon },
        { id: "calendar", icon: CalendarIcon },
        { id: "board", icon: LayoutDashboardIcon },
        { id: "context", icon: ContextIcon },
      ] as const).map(({ id, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => {
            setActiveTab(id);
            if (id === "context" && contextFocus.type === "none") {
              setContextFocus({ type: "none" });
            }
          }}
          className={cn(
            "flex flex-1 flex-col items-center gap-1 rounded-lg py-2 transition-colors",
            activeTab === id
              ? "bg-white/[0.08] text-white/80"
              : "text-white/25 hover:text-white/40",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );

  const sidebarInner = (
    <>
      {appTabBar}

      {activeTab === "calendar" && (
        <>
      {/* Mini Calendar */}
      <div className="liquid-glass-subtle rounded-xl p-3">
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="font-semibold text-[11px] text-white/70">
            {format(miniCalendarDate, "MMMM yyyy")}
          </h3>
          <div className="flex gap-0.5">
            <Button
              className="h-5 w-5 rounded-md text-white/30 hover:bg-white/[0.06] hover:text-white/60"
              onClick={() =>
                setMiniCalendarDate(subMonths(miniCalendarDate, 1))
              }
              size="icon"
              variant="ghost"
            >
              <ChevronLeftIcon className="h-3 w-3" />
            </Button>
            <Button
              className="h-5 w-5 rounded-md text-white/30 hover:bg-white/[0.06] hover:text-white/60"
              onClick={() =>
                setMiniCalendarDate(addMonths(miniCalendarDate, 1))
              }
              size="icon"
              variant="ghost"
            >
              <ChevronRightIcon className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="mb-1 grid grid-cols-7 gap-0.5">
          {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
            <div
              className="text-center font-medium text-[9px] text-white/25"
              key={i}
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {miniCalendarDays.map((day) => {
            const hasEvents = events.some((event) =>
              eventOccursOnDate(event, day)
            );
            return (
              <button
                className={cn(
                  "flex aspect-square items-center justify-center rounded-md text-[10px] transition-all hover:bg-white/[0.06]",
                  !isSameMonth(day, miniCalendarDate) && "opacity-20",
                  isSameDay(day, new Date()) &&
                    "bg-blue-500/20 font-semibold text-blue-400 ring-1 ring-blue-500/30",
                  hasEvents &&
                    !isSameDay(day, new Date()) &&
                    "bg-white/[0.03] font-medium",
                  isSameDay(day, currentDate) &&
                    !isSameDay(day, new Date()) &&
                    "ring-1 ring-white/20"
                )}
                key={day.toISOString()}
                onClick={() => navigateMiniDay(day)}
                type="button"
              >
                {format(day, "d")}
              </button>
            );
          })}
        </div>
      </div>

      {/* Create Event */}
      <Button
        className="h-9 w-full rounded-xl bg-white/95 font-medium text-black text-xs hover:bg-white"
        onClick={() => openCreatePanel(new Date())}
      >
        <PlusIcon className="mr-1.5 h-3.5 w-3.5" />
        New Event
      </Button>

      {/* Subscribed calendars */}
      {subscribedCalendars.length > 0 && (
        <div className="liquid-glass-subtle rounded-xl p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={toggleCalendarsExpanded}
              className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
            >
              <span className="section-label">My Calendars</span>
              {calendarsExpanded ? (
                <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-white/30" />
              ) : (
                <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-white/30" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void runCalendarSync()}
              disabled={syncStatus === "syncing"}
              className="flex h-6 shrink-0 items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 text-[9px] text-white/45 hover:bg-white/[0.06] disabled:opacity-50"
              title="Sync calendars now"
            >
              {syncStatus === "syncing" ? (
                <Loader2Icon className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCwIcon className="h-3 w-3" />
              )}
              Sync
            </button>
          </div>
          <p
            className={cn(
              "mb-2 truncate text-[9px]",
              syncStatus === "error" ? "text-amber-400/80" : "text-white/30",
            )}
          >
            {syncStatus === "syncing" && "Syncing calendars…"}
            {syncStatus === "error" && (syncSummary ?? "Sync failed")}
            {syncStatus === "success" &&
              (syncSummary ??
                (lastSyncedAt
                  ? `Updated ${formatSyncAge(lastSyncedAt)}`
                  : "Synced"))}
            {syncStatus === "idle" &&
              (lastSyncedAt
                ? `Last sync ${formatSyncAge(lastSyncedAt)}`
                : "Waiting for first sync…")}
            {backgroundExtending && syncStatus !== "syncing" && (
              <span className="text-white/25"> · loading more history…</span>
            )}
          </p>
          {calendarsExpanded && (
            <div className="max-h-48 space-y-1.5 overflow-y-auto">
              {subscribedCalendars.map((calendar) => (
                <div
                  className="flex items-center justify-between gap-2 py-0.5"
                  key={calendar.key}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCalendarVisibility(calendar.key)}
                      className="h-3.5 w-3.5 flex-shrink-0 rounded transition-opacity"
                      style={{
                        backgroundColor: calendar.color,
                        opacity: calendar.visible ? 1 : 0.25,
                      }}
                      aria-label={
                        calendar.visible ? "Hide calendar" : "Show calendar"
                      }
                    />
                    <span className="truncate text-[11px] text-white/50">
                      {calendar.name}
                      <span className="ml-1 text-white/25">
                        ({friendlyAccountName(calendar.accountEmail)})
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
        </>
      )}

      {activeTab === "context" && (
        <div className="space-y-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-white/30">
            Context
          </p>
          {contextFocus.type === "meeting" ? (
            <button
              className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-left text-[11px] text-white/55 hover:bg-white/[0.06]"
              onClick={() => setContextFocus({ type: "none" })}
              type="button"
            >
              <span className="block truncate font-medium text-white/70">
                {contextFocus.event.title || "Meeting"}
              </span>
              <span className="text-white/30">Zoomed in — tap to overview</span>
            </button>
          ) : (
            <p className="text-[11px] leading-relaxed text-white/25">
              Open a meeting from Calendar or pick one in the main panel.
            </p>
          )}
        </div>
      )}

    </>
  );

  /* ─── Panel Content (shared between mobile sheet & desktop side) ── */

  const userAvatarButton = (
    <Button
      className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.06] p-0 hover:bg-white/[0.1]"
      size="icon"
      variant="ghost"
    >
      {userImage ? (
        <img
          alt={userName}
          className="h-full w-full object-cover"
          src={userImage}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-500/40 to-blue-600/40 font-semibold text-white text-xs">
          {userName?.[0] || <UserIcon className="h-3.5 w-3.5" />}
        </div>
      )}
    </Button>
  );

  const sidebarUserFooter = isLoggedIn ? (
    <div className="flex shrink-0 items-center gap-2 border-white/[0.06] border-t p-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{userAvatarButton}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="mb-2 w-56 rounded-2xl border border-white/[0.12] bg-popover p-1.5 shadow-2xl ring-1 ring-white/10"
          side="top"
        >
          <DropdownMenuLabel className="px-3 py-2.5">
            <p className="font-semibold text-white text-xs">{userName}</p>
            <p className="text-[10px] text-white/55">{userEmail}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-white/[0.06]" />
          <DropdownMenuItem
            className="cursor-pointer rounded-xl text-red-300 text-xs focus:bg-white/[0.06] focus:text-red-300"
            onClick={async () => {
              await authClient.signOut();
              window.location.href = "/";
            }}
          >
            <LogOutIcon className="mr-2 h-3.5 w-3.5" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        className="h-9 w-9 shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.03] text-white/45 hover:bg-white/[0.06] hover:text-white/70"
        onClick={() => router.push("/settings")}
        size="icon"
        title="Settings"
        variant="ghost"
      >
        <SettingsIcon className="h-4 w-4" />
      </Button>
    </div>
  ) : null;

  const panelContent = (
    <>
      {rightPanel === "event" && (
        <EventDetailPanel
          event={selectedEvent}
          googleCalendars={googleCalendarsForPanel}
          mode={eventPanelMode}
          onClose={closePanel}
          onEventCreated={() => {
            void refreshEvents().catch(() => {});
            closePanel();
          }}
          onEventDeleted={() => {
            void refreshEvents().catch(() => {});
            closePanel();
          }}
          onEventUpdated={() => {
            void refreshEvents().catch(() => {});
            closePanel();
          }}
          onOpenContext={openMeetingContext}
          sectionOrder={eventSectionOrder}
          selectedDate={selectedDate}
          userEmail={userEmail}
          userId={userId}
        />
      )}
      {rightPanel === "ai" && (
        <AiPanel
          onClose={closePanel}
          onEventMutated={refreshEvents}
          persona={persona}
          userId={userId}
        />
      )}
    </>
  );

  /* ─── Render ────────────────────────────────── */

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      {/* ── Mobile Sidebar Drawer ── */}
      <AnimatePresence>
        {isMobile && sidebarOpen && (
          <>
            <motion.div
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              animate={{ x: 0 }}
              className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col overflow-hidden bg-background"
              exit={{ x: "-100%" }}
              initial={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <span className="font-semibold text-sm text-white/80">
                  nozero
                </span>
                <Button
                  className="h-7 w-7 rounded-lg text-white/40 hover:bg-white/[0.06]"
                  onClick={() => setSidebarOpen(false)}
                  size="icon"
                  variant="ghost"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                  {sidebarInner}
                </div>
                {sidebarUserFooter}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Desktop Sidebar ── */}
      {activeTab !== "email" && activeTab !== "board" ? (
        <div className="hidden w-[260px] flex-shrink-0 flex-col overflow-hidden md:flex">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {sidebarInner}
          </div>
          {sidebarUserFooter}
        </div>
      ) : null}

      {/* ── Main area (calendar | context takeover | …) ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {centerView === "context" && contextEvent ? (
          <EventContextPanel
            event={contextEvent}
            navigation={contextNavigation}
            onBack={closeContextPanel}
            userEmail={userEmail}
          />
        ) : activeTab === "calendar" ? (
          <>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 md:px-5 md:py-3">
          <div className="flex items-center gap-1.5 md:gap-3">
            {/* Mobile hamburger */}
            <Button
              className="h-8 w-8 rounded-lg text-white/50 hover:bg-white/[0.06] md:hidden"
              onClick={() => setSidebarOpen(true)}
              size="icon"
              variant="ghost"
            >
              <MenuIcon className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-0.5">
              <Button
                className="h-7 w-7 rounded-lg border border-white/[0.06] bg-white/[0.03] text-white/50 hover:bg-white/[0.06]"
                onClick={handlePrevious}
                size="icon"
                variant="ghost"
              >
                <ChevronLeftIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                className="h-7 w-7 rounded-lg border border-white/[0.06] bg-white/[0.03] text-white/50 hover:bg-white/[0.06]"
                onClick={handleNext}
                size="icon"
                variant="ghost"
              >
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </Button>
            </div>

            <h2 className="font-bold text-sm tracking-tight md:text-base">
              {headerTitle}
            </h2>

            <Button
              className="hidden h-7 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 text-[11px] text-white/50 hover:bg-white/[0.06] md:inline-flex"
              onClick={() => setCurrentDate(new Date())}
              size="sm"
              variant="ghost"
            >
              Today
            </Button>

            {isLoggedIn && (
              <Button
                className={cn(
                  "hidden h-7 gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 text-[11px] text-white/50 hover:bg-white/[0.06] md:inline-flex",
                  syncStatus === "error" && "border-amber-500/20 text-amber-400/80",
                )}
                disabled={syncStatus === "syncing"}
                onClick={() => void runCalendarSync()}
                size="sm"
                title={syncSummary ?? "Sync all connected calendars"}
                variant="ghost"
              >
                {syncStatus === "syncing" ? (
                  <Loader2Icon className="h-3 w-3 animate-spin" />
                ) : syncStatus === "error" ? (
                  <AlertCircleIcon className="h-3 w-3" />
                ) : (
                  <RefreshCwIcon className="h-3 w-3" />
                )}
                {syncStatus === "syncing" ? "Syncing" : "Sync"}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1.5 md:gap-2.5">
            {/* Mobile Today button */}
            <Button
              className="h-7 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 text-[11px] text-white/50 hover:bg-white/[0.06] md:hidden"
              onClick={() => setCurrentDate(new Date())}
              size="sm"
              variant="ghost"
            >
              Today
            </Button>

            <Select
              onValueChange={(v) => setViewMode(v as ViewMode)}
              value={viewMode}
            >
              <SelectTrigger className="h-9 w-[4.5rem] rounded-lg border-white/[0.06] bg-white/[0.03] px-2.5 py-0 text-xs md:w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-white/[0.12] bg-popover shadow-2xl ring-1 ring-white/10">
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="year">Year</SelectItem>
              </SelectContent>
            </Select>

            {/* Search — desktop only */}
            <div className="relative hidden md:block">
              <SearchIcon className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
              <input
                className="h-9 w-40 rounded-lg border border-white/[0.06] bg-white/[0.03] py-0 pr-3 pl-8 text-white/70 text-xs leading-none outline-none placeholder:text-white/20 focus:border-white/[0.12]"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search events"
                ref={searchInputRef}
                value={searchQuery}
              />
            </div>

            {/* AI toggle — desktop only (mobile accesses via sidebar or FAB area) */}
            <Button
              className={cn(
                "hidden h-9 w-9 shrink-0 rounded-full border border-white/[0.06] text-white/40 hover:bg-white/[0.06] md:inline-flex",
                rightPanel === "ai" &&
                  "border-blue-500/20 bg-blue-500/10 text-blue-400"
              )}
              onClick={() =>
                rightPanel === "ai" ? closePanel() : openAiPanel()
              }
              size="icon"
              variant="ghost"
            >
              <SparklesIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="min-h-0 flex-1 overflow-hidden p-2 md:p-3">
          {renderCalendarView()}
        </div>
          </>
        ) : activeTab === "context" ? (
          <ContextView
            focus={contextFocus}
            navigation={contextNavigation}
            onFocusChange={setContextFocus}
            recentMeetings={recentContextMeetings}
            userEmail={userEmail}
          />
        ) : activeTab === "board" ? (
          <FlightdeckBoardView
            initialStream={boardStreamFilter}
            tabBar={appTabBar}
          />
        ) : activeTab === "email" ? (
          <EmailView
            initialThreadId={emailThreadId}
            mirrorVersion={emailMirrorVersion}
            onThreadIdChange={setEmailThreadId}
            persona={persona}
            sidebarFooter={sidebarUserFooter}
            tabBar={appTabBar}
            userEmail={userEmail}
            userId={userId}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
            <span className="text-sm text-white/30">Coming soon</span>
          </div>
        )}
      </div>

      {/* ── Right Panel ── */}
      <AnimatePresence mode="wait">
        {rightPanel !== "none" && centerView !== "context" &&
          (isMobile ? (
            /* Mobile: bottom sheet overlay */
            <Fragment key="mobile-panel">
              <motion.div
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-40 touch-none bg-black/50"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                onClick={closePanel}
              />
              <motion.div
                animate={{ y: 0 }}
                className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] min-h-0 flex-col overflow-hidden rounded-t-2xl border-white/[0.08] border-t bg-background"
                exit={{ y: "100%" }}
                initial={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 400, damping: 38 }}
              >
                {/* Drag handle */}
                <div className="flex shrink-0 justify-center py-2">
                  <div className="h-1 w-8 rounded-full bg-white/20" />
                </div>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  {panelContent}
                </div>
              </motion.div>
            </Fragment>
          ) : (
            /* Desktop: side panel */
            <motion.div
              animate={{ width: 360, opacity: 1 }}
              className="flex-shrink-0 overflow-hidden"
              exit={{ width: 0, opacity: 0 }}
              initial={{ width: 0, opacity: 0 }}
              key="desktop-panel"
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
            >
              <div className="h-full min-h-0 w-[360px]">{panelContent}</div>
            </motion.div>
          ))}
      </AnimatePresence>

      {/* ── Mobile FAB ── */}
      {isMobile && rightPanel === "none" && (
        <motion.button
          animate={{ scale: 1, opacity: 1 }}
          className="fixed right-5 bottom-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-black/40 shadow-lg active:scale-95"
          exit={{ scale: 0, opacity: 0 }}
          initial={{ scale: 0, opacity: 0 }}
          onClick={() => openCreatePanel(new Date())}
          type="button"
          whileTap={{ scale: 0.9 }}
        >
          <PlusIcon className="h-6 w-6 text-black" />
        </motion.button>
      )}
    </div>
  );
}
