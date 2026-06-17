"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { motion } from "framer-motion";
import {
  CalendarIcon,
  CircleUserIcon,
  ClockIcon,
  HashIcon,
  LayoutDashboardIcon,
  MapPinIcon,
  RepeatIcon,
  TextIcon,
  Trash2Icon,
  UsersIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { DatePicker, TimePicker } from "@/components/ui/date-time-picker";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  type Participant,
  ParticipantsInput,
} from "@/components/ui/participants-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { htmlToPlainText } from "@/lib/html-text";
import {
  type RecurrenceEditScope,
  type RecurrencePreset,
  presetFromRecurrenceRule,
  recurrenceLabel,
  recurrenceRuleFromPreset,
} from "@/lib/recurrence";
import { RecurrenceSelect } from "@/components/recurrence-select";
import { AccountCodeAssignSelect } from "@/components/account-code-assign-select";
import { FlightdeckStreamSelect } from "@/components/flightdeck-stream-select";
import { ContextIcon } from "@/components/context-icon";
import { EventDetailHud } from "@/components/event-detail-hud";
import { EventDetailSection } from "@/components/event-detail-section";
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
import {
  conferenceProviderLabel,
  conferenceJoinUrl,
  detectConferenceProvider,
  extractConferenceUrl,
} from "@/lib/conference-links";
import {
  DEFAULT_EVENT_SECTION_ORDER,
  type EventDetailSectionId,
  parseEventSectionOrder,
} from "@/lib/event-detail-layout";
import {
  isUserEventOrganizer,
  organizerDisplayName,
} from "@/lib/event-organizer";
import { resolveEventAccountEmail } from "@/lib/event-account";
import { getEventEditCapabilities } from "@/lib/event-permissions";
import { cn, friendlyAccountName } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { CalendarEvent, RecurrenceRule } from "@/types/calendar";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  participants: z
    .array(
      z.object({
        email: z.string(),
        status: z
          .enum(["pending", "accepted", "declined", "needs-action"])
          .optional(),
      })
    )
    .default([]),
  calendarId: z.string().optional(),
  location: z.string().optional(),
  conferenceUrl: z.string().optional(),
});

interface EventDetailPanelProps {
  event: CalendarEvent | null;
  googleCalendars: {
    accountEmail?: string;
    backgroundColor: string;
    id: string;
    primary: boolean;
    summary: string;
    visible: boolean;
  }[];
  mode: "create" | "edit" | "view";
  onClose: () => void;
  onEventCreated: () => void;
  onEventDeleted: () => void;
  onEventUpdated: () => void;
  onOpenContext?: (event: CalendarEvent) => void;
  selectedDate: Date | null;
  userId?: string;
  userEmail?: string;
  sectionOrder?: EventDetailSectionId[];
}

const spring = { type: "spring", stiffness: 300, damping: 30 };

const glassRow =
  "liquid-glass-input flex h-10 min-h-10 min-w-0 shrink-0 items-center gap-3 rounded-xl px-3";

type CalendarAccountOption = {
  email: string;
  label: string;
  type: "google" | "caldav";
};

export function EventDetailPanel({
  event,
  mode,
  googleCalendars,
  selectedDate,
  userId,
  userEmail,
  sectionOrder: sectionOrderProp,
  onClose,
  onEventCreated,
  onEventUpdated,
  onEventDeleted,
  onOpenContext,
}: EventDetailPanelProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const sectionOrder = parseEventSectionOrder(
    sectionOrderProp ?? DEFAULT_EVENT_SECTION_ORDER,
  );
  const [sectionOpen, setSectionOpen] = useState<
    Record<EventDetailSectionId, boolean>
  >({
    what: true,
    where: true,
    when: true,
    who: true,
  });

  const [recurrencePreset, setRecurrencePreset] =
    useState<RecurrencePreset>("none");
  const [customRecurrence, setCustomRecurrence] = useState<RecurrenceRule | null>(
    null,
  );
  const [accountCodeId, setAccountCodeId] = useState<string | undefined>(
    undefined,
  );
  const [flightdeckStream, setFlightdeckStream] = useState<string | undefined>(
    undefined,
  );
  const [eventAccountEmail, setEventAccountEmail] = useState("");
  const [calendarAccounts, setCalendarAccounts] = useState<
    CalendarAccountOption[]
  >([]);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [scopeDialogMode, setScopeDialogMode] = useState<"save" | "delete">(
    "save",
  );
  const pendingFormValuesRef = useRef<z.infer<typeof formSchema> | null>(null);
  const initialParticipantEmailsRef = useRef<string[]>([]);

  const isCreating = mode === "create";
  const isEditing = mode === "edit";
  const capabilities = getEventEditCapabilities(event, userEmail, { isCreating });
  const isOrganizer = capabilities.canEditOrganizerFields;
  const organizerFieldsLocked = !isOrganizer;
  const lockTooltip = organizerFieldsLocked
    ? `Organised by ${organizerDisplayName(event)} — only they can change time, title, and remove guests`
    : undefined;
  const isRecurringSeries =
    Boolean(event?.recurrence) ||
    Boolean(event?.isRecurringInstance) ||
    Boolean(event?.originalEventId);
  const defaultGoogleCalendarId =
    googleCalendars.find((calendar) => calendar.primary)?.id ??
    googleCalendars[0]?.id ??
    "";

  const defaultStartDate = selectedDate
    ? format(selectedDate, "yyyy-MM-dd")
    : "";
  const defaultStartTime = "09:00";
  const defaultEndTime = "10:00";

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      startDate: defaultStartDate,
      endDate: defaultStartDate,
      startTime: defaultStartTime,
      endTime: defaultEndTime,
      participants: [],
      calendarId: "",
      location: "",
      conferenceUrl: "",
    },
  });

  const watchedTitle = form.watch("title");
  const watchedParticipants = form.watch("participants");
  const watchedLocation = form.watch("location");
  const watchedStartDate = form.watch("startDate");
  const watchedStartTime = form.watch("startTime");
  const watchedEndDate = form.watch("endDate");
  const watchedEndTime = form.watch("endTime");
  const conferenceUrl = form.watch("conferenceUrl") ?? "";

  const hudStart =
    watchedStartDate && watchedStartTime
      ? `${watchedStartDate}T${watchedStartTime}`
      : event?.start;
  const hudEnd =
    watchedEndDate && watchedEndTime
      ? `${watchedEndDate}T${watchedEndTime}`
      : event?.end;

  const conferenceProvider = conferenceUrl
    ? detectConferenceProvider(conferenceUrl)
    : null;

  const lockedInputClass = organizerFieldsLocked
    ? "cursor-not-allowed opacity-70"
    : undefined;

  async function persistGuestInvites(participants: Participant[]) {
    if (
      isOrganizer ||
      !capabilities.canAddParticipants ||
      !event?.id ||
      !userId
    ) {
      return;
    }

    const initial = new Set(initialParticipantEmailsRef.current);
    const nextEmails = participants.map((p) => p.email.toLowerCase());

    for (const email of initial) {
      if (!nextEmails.includes(email)) {
        return;
      }
    }

    const added = nextEmails.filter((email) => !initial.has(email));
    if (added.length === 0) return;

    try {
      const response = await fetch(`/api/calendar/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          guestInviteOnly: true,
          pushToGoogle: true,
          attendees: participants.map((p) => ({
            email: p.email,
            status: p.status ?? "pending",
          })),
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to invite");
      }
      initialParticipantEmailsRef.current = nextEmails;
      toast({
        title: "Invite sent",
        description: `Added ${added.length} participant${added.length > 1 ? "s" : ""} to this meeting`,
      });
      onEventUpdated();
    } catch {
      toast({
        title: "Could not add participant",
        description: "Google may restrict guest invites on this meeting",
        variant: "destructive",
      });
    }
  }

  async function persistAccountChange(nextAccountEmail: string) {
    setEventAccountEmail(nextAccountEmail);

    const calendarId = primaryCalendarIdForAccount(nextAccountEmail);
    if (calendarId) {
      form.setValue("calendarId", calendarId, { shouldDirty: true });
    }

    if (!event?.id || !userId || isCreating) return;
    if (!isOrganizer) return;

    try {
      const response = await fetch(`/api/calendar/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          accountOnly: true,
          pushToGoogle: true,
          accountEmail: nextAccountEmail,
          calendarId,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to save account");
      }
      toast({
        title: "Calendar account updated",
        description: `This meeting is now on ${friendlyAccountName(nextAccountEmail)}`,
      });
      onEventUpdated();
    } catch {
      setEventAccountEmail(
        resolveEventAccountEmail({
          connectedAccountEmails: calendarAccounts.map((account) => account.email),
          event,
          googleCalendars,
          loginEmail: userEmail,
        }),
      );
      const revertCalendarId =
        event?.calendarId ||
        primaryCalendarIdForAccount(event?.accountEmail ?? "") ||
        form.getValues("calendarId");
      if (revertCalendarId) {
        form.setValue("calendarId", revertCalendarId, { shouldDirty: false });
      }
      toast({
        title: "Could not change account",
        description: "The calendar account was not updated",
        variant: "destructive",
      });
    }
  }

  async function saveUserMetadata(
    nextAccountCodeId: string | undefined,
    nextStream: string | undefined,
  ) {
    if (!capabilities.canEditUserMetadata || !event?.id || !userId) return;

    try {
      const response = await fetch(`/api/calendar/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          metadataOnly: true,
          accountCodeId: nextAccountCodeId ?? null,
          flightdeckStream: nextStream ?? null,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to save");
      }
    } catch {
      toast({
        title: "Could not save",
        description: "Project code and stream were not saved",
        variant: "destructive",
      });
    }
  }

  useEffect(() => {
    if (event && (mode === "edit" || mode === "view")) {
      const plainDescription = htmlToPlainText(event.description || "");
      const resolvedConferenceUrl =
        event.conferenceUrl ||
        extractConferenceUrl(plainDescription, event.description, event.location) ||
        "";

      form.reset({
        title: event.title || "",
        description: plainDescription,
        startDate: event.start
          ? format(new Date(event.start), "yyyy-MM-dd")
          : "",
        endDate: event.end ? format(new Date(event.end), "yyyy-MM-dd") : "",
        startTime: event.start ? format(new Date(event.start), "HH:mm") : "",
        endTime: event.end ? format(new Date(event.end), "HH:mm") : "",
        participants:
          event.attendees?.map((attendee) => ({
            email: attendee.email,
            status: (attendee.status ?? "pending") as Participant["status"],
          })) || [],
        calendarId: event.calendarId || defaultGoogleCalendarId,
        location: event.location || "",
        conferenceUrl: resolvedConferenceUrl,
      });
      const start = event.start ? new Date(event.start) : new Date();
      setRecurrencePreset(
        presetFromRecurrenceRule(event.recurrence, start),
      );
      setCustomRecurrence(
        event.recurrence &&
          presetFromRecurrenceRule(event.recurrence, start) === "custom"
          ? event.recurrence
          : null,
      );
      setAccountCodeId(event.accountCodeId);
      setFlightdeckStream(event.flightdeckStream);
      initialParticipantEmailsRef.current =
        event.attendees?.map((a) => a.email.toLowerCase()) ?? [];
      setSectionOpen({ what: true, where: false, when: false, who: false });
    } else if (mode === "create") {
      form.reset({
        title: "",
        description: "",
        startDate: defaultStartDate,
        endDate: defaultStartDate,
        startTime: defaultStartTime,
        endTime: defaultEndTime,
        participants: [],
        calendarId: "",
        location: "",
        conferenceUrl: "",
      });
      setRecurrencePreset("none");
      setCustomRecurrence(null);
      setAccountCodeId(undefined);
      setFlightdeckStream(undefined);
      setSectionOpen({ what: true, where: true, when: true, who: true });
    }
  }, [
    event,
    mode,
    form,
    defaultStartDate,
    defaultStartTime,
    defaultEndTime,
    defaultGoogleCalendarId,
  ]);

  useEffect(() => {
    if (
      !(isCreating && defaultGoogleCalendarId) ||
      form.getValues("calendarId")
    ) {
      return;
    }

    form.setValue("calendarId", defaultGoogleCalendarId, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [defaultGoogleCalendarId, form, isCreating]);

  const watchedCalendarId = form.watch("calendarId");
  const connectedAccountEmails = calendarAccounts.map((account) => account.email);
  const resolvedEventAccountEmail = resolveEventAccountEmail({
    connectedAccountEmails,
    event,
    googleCalendars,
    isCreating,
    loginEmail: userEmail,
  });
  const assignAccountEmail =
    eventAccountEmail ||
    googleCalendars.find(
      (calendar) =>
        calendar.id === (watchedCalendarId || defaultGoogleCalendarId),
    )?.accountEmail ||
    resolvedEventAccountEmail ||
    "";

  const meetJoinUrl = conferenceUrl
    ? conferenceJoinUrl(conferenceUrl, assignAccountEmail)
    : "";

  function primaryCalendarIdForAccount(email: string): string | undefined {
    const normalized = email.toLowerCase();
    return (
      googleCalendars.find(
        (calendar) =>
          calendar.accountEmail?.toLowerCase() === normalized && calendar.primary,
      )?.id ??
      googleCalendars.find(
        (calendar) => calendar.accountEmail?.toLowerCase() === normalized,
      )?.id
    );
  }

  useEffect(() => {
    if (!userId) {
      setCalendarAccounts([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/accounts");
        if (!response.ok) return;
        const data = (await response.json()) as {
          accounts?: Array<{
            email: string;
            label?: string;
            type: string;
            connected?: boolean;
          }>;
        };

        const options: CalendarAccountOption[] = [];
        const seen = new Set<string>();

        for (const account of data.accounts ?? []) {
          if (account.type !== "google" && account.type !== "caldav") continue;
          if (account.connected === false) continue;
          const email = account.email.trim();
          if (!email) continue;
          const key = email.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          options.push({
            email,
            label: account.label?.trim() || friendlyAccountName(email),
            type: account.type as "google" | "caldav",
          });
        }

        for (const calendar of googleCalendars) {
          const email = calendar.accountEmail?.trim();
          if (!email) continue;
          const key = email.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          options.push({
            email,
            label: friendlyAccountName(email),
            type: "google",
          });
        }

        if (!cancelled) {
          setCalendarAccounts(options);
        }
      } catch {
        if (!cancelled) {
          setCalendarAccounts([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [googleCalendars, userId]);

  useEffect(() => {
    const next = resolveEventAccountEmail({
      connectedAccountEmails: calendarAccounts.map((account) => account.email),
      event,
      googleCalendars,
      isCreating,
      loginEmail: userEmail,
    });
    setEventAccountEmail(next);
  }, [
    calendarAccounts,
    event,
    googleCalendars,
    isCreating,
    userEmail,
  ]);

  useEffect(() => {
    if (!isCreating || !eventAccountEmail) return;
    const calendarId = primaryCalendarIdForAccount(eventAccountEmail);
    if (!calendarId) return;
    form.setValue("calendarId", calendarId, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [eventAccountEmail, form, isCreating]);

  useEffect(() => {
    if (isCreating && titleRef.current) {
      const timer = setTimeout(() => titleRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isCreating]);

  async function saveEvent(
    values: z.infer<typeof formSchema>,
    recurrenceScope?: RecurrenceEditScope,
  ) {
    if (!userId) return;

    setIsLoading(true);
    try {
      const url = isCreating
        ? "/api/calendar/events"
        : `/api/calendar/events/${event?.id}`;
      const method = isCreating ? "POST" : "PATCH";

      const start = `${values.startDate}T${values.startTime}`;
      const end = `${values.endDate}T${values.endTime}`;
      const startDate = new Date(`${values.startDate}T12:00:00`);
      const recurrence = recurrenceRuleFromPreset(
        recurrencePreset,
        startDate,
        customRecurrence,
      );

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          title: values.title,
          description: values.description,
          start,
          end,
          location: values.location,
          conferenceUrl: values.conferenceUrl || undefined,
          calendarId: values.calendarId || undefined,
          attendees: values.participants.map((p) => ({
            email: p.email,
            status: p.status,
          })),
          pushToGoogle: true,
          recurrence,
          recurrenceScope,
          ...(isCreating ? { accountEmail: assignAccountEmail || undefined } : {}),
          accountCodeId: accountCodeId ?? null,
          flightdeckStream: flightdeckStream ?? null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save event");
      }

      const { event: savedEvent } = await response.json();
      const savedEventId = savedEvent?.id || event?.id;

      const newParticipants = values.participants.filter(
        (p) => p.status === "pending" || !p.status,
      );

      if (newParticipants.length > 0 && savedEventId) {
        try {
          await fetch("/api/invitations/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              eventId: savedEventId,
              eventTitle: values.title,
              eventStart: start,
              eventEnd: end,
              eventLocation: values.location,
              eventCalendarId: values.calendarId,
              invitees: newParticipants.map((p) => p.email),
            }),
          });
        } catch {
          console.error("Failed to send invitations");
        }
      }

      const invitedCount = newParticipants.length;
      const inviteNote =
        invitedCount > 0
          ? ` — ${invitedCount} invite${invitedCount > 1 ? "s" : ""} sent`
          : "";

      toast({
        title: isCreating ? "Event created" : "Event updated",
        description: `Your event has been ${isCreating ? "created" : "updated"}${inviteNote}`,
      });

      if (isCreating) {
        onEventCreated();
      } else {
        onEventUpdated();
      }
      onClose();
    } catch {
      toast({
        title: "Error",
        description: "Failed to save event",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!userId) {
      toast({
        title: "Sign in required",
        description: "Please sign in to manage events",
        variant: "destructive",
      });
      return;
    }

    if (!isOrganizer) {
      toast({
        title: "Organiser fields are read-only",
        description: `Only ${organizerDisplayName(event)} can change time, title, or remove guests. You can still set project code, stream, and add participants.`,
        variant: "destructive",
      });
      return;
    }

    const needsScope =
      !isCreating &&
      event &&
      (event.isRecurringInstance || event.originalEventId);

    if (needsScope) {
      pendingFormValuesRef.current = values;
      setScopeDialogMode("save");
      setScopeDialogOpen(true);
      return;
    }

    await saveEvent(values);
  }

  async function confirmScope(scope: RecurrenceEditScope) {
    setScopeDialogOpen(false);
    if (scopeDialogMode === "save" && pendingFormValuesRef.current) {
      await saveEvent(pendingFormValuesRef.current, scope);
      pendingFormValuesRef.current = null;
      return;
    }
    if (scopeDialogMode === "delete") {
      await performDelete(scope);
    }
  }

  async function performDelete(scope?: RecurrenceEditScope) {
    if (!(event && userId)) return;

    setIsLoading(true);
    try {
      const scopeQuery = scope ? `&recurrenceScope=${scope}` : "";
      const response = await fetch(
        `/api/calendar/events/${event.id}?userId=${userId}&pushToGoogle=true${scopeQuery}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error("Failed to delete");
      }

      toast({
        title: "Event deleted",
        description: "Your event has been deleted",
        action: scope === "this" ? (
          <ToastAction
            altText="Undo event deletion"
            onClick={() => {
              restoreDeletedEvent(event).catch(console.error);
            }}
          >
            Undo
          </ToastAction>
        ) : undefined,
      });
      onEventDeleted();
      onClose();
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete event",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete() {
    if (!(event && userId)) {
      return;
    }

    const needsScope =
      event.isRecurringInstance || event.originalEventId || event.recurrence;

    if (needsScope) {
      setScopeDialogMode("delete");
      setScopeDialogOpen(true);
      return;
    }

    await performDelete();
  }

  async function restoreDeletedEvent(deletedEvent: CalendarEvent) {
    if (!userId) {
      return;
    }

    try {
      const response = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          title: deletedEvent.title,
          description: deletedEvent.description,
          start: deletedEvent.start,
          end: deletedEvent.end,
          location: deletedEvent.location,
          color: deletedEvent.color,
          allDay: deletedEvent.allDay,
          calendarId: deletedEvent.calendarId,
          attendees: deletedEvent.attendees,
          pushToGoogle: true,
          accountEmail: deletedEvent.accountEmail,
          accountCodeId: deletedEvent.accountCodeId ?? null,
          flightdeckStream: deletedEvent.flightdeckStream ?? null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to restore");
      }

      toast({
        title: "Deletion undone",
        description: `"${deletedEvent.title}" has been restored`,
      });
      onEventCreated();
    } catch {
      toast({
        title: "Could not undo",
        description: "Failed to restore the deleted event",
        variant: "destructive",
      });
    }
  }

  function renderWhatSection() {
    return (
      <>
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className={glassRow}>
                  <TextIcon className="size-4 shrink-0 text-ink-subtle" />
                  <Input
                    className={`h-full min-h-0 flex-1 rounded-none border-0 bg-transparent px-0 font-medium text-sm text-ink placeholder:text-ink-subtle shadow-none focus-visible:ring-0 ${lockedInputClass ?? ""}`}
                    disabled={organizerFieldsLocked}
                    placeholder="Event title"
                    readOnly={organizerFieldsLocked}
                    {...field}
                    ref={(e) => {
                      field.ref(e);
                      (
                        titleRef as React.MutableRefObject<HTMLInputElement | null>
                      ).current = e;
                    }}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className="liquid-glass-input flex min-w-0 items-start gap-3 rounded-lg px-3 py-2.5">
                  <TextIcon className="mt-1 size-4 shrink-0 text-ink-subtle" />
                  <Textarea
                    className={`field-sizing-fixed min-h-[4.5rem] min-w-0 flex-1 resize-none rounded-none border-0 bg-transparent p-0 py-0.5 pl-0.5 text-ink text-xs leading-relaxed shadow-none placeholder:text-ink-subtle focus-visible:ring-0 ${lockedInputClass ?? ""}`}
                    disabled={organizerFieldsLocked}
                    placeholder="Add notes"
                    readOnly={organizerFieldsLocked}
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {event && onOpenContext ? (
          <Button
            className="h-9 w-full justify-center gap-2 rounded-xl border border-line bg-surface-sunk text-[11px] text-ink-muted hover:bg-accent hover:text-ink"
            onClick={() => onOpenContext(event)}
            type="button"
            variant="ghost"
          >
            <ContextIcon className="h-3.5 w-3.5" />
            Open full context
          </Button>
        ) : null}
      </>
    );
  }

  function renderWhoSection() {
    const accountOptions =
      calendarAccounts.length > 0
        ? calendarAccounts
        : eventAccountEmail
          ? [
              {
                email: eventAccountEmail,
                label: friendlyAccountName(eventAccountEmail),
                type: "google" as const,
              },
            ]
          : [];

    return (
      <>
        <FormField
          control={form.control}
          name="participants"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <ParticipantsInput
                  allowRemove={capabilities.canRemoveParticipants}
                  disabled={!capabilities.canAddParticipants}
                  icon={<UsersIcon className="size-4 text-ink-subtle" />}
                  onChange={(next) => {
                    field.onChange(next);
                    void persistGuestInvites(next);
                  }}
                  placeholder="Add participants by email"
                  value={field.value}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {userId && assignAccountEmail ? (
          <div className={glassRow}>
            <HashIcon className="size-4 shrink-0 text-ink-subtle" />
            <AccountCodeAssignSelect
              accountEmail={assignAccountEmail}
              disabled={!capabilities.canEditUserMetadata}
              onChange={(id) => {
                setAccountCodeId(id);
                void saveUserMetadata(id, flightdeckStream);
              }}
              userId={userId}
              value={accountCodeId}
            />
          </div>
        ) : null}

        {userId ? (
          <div className={glassRow}>
            <LayoutDashboardIcon className="size-4 shrink-0 text-ink-subtle" />
            <FlightdeckStreamSelect
              disabled={!capabilities.canEditUserMetadata}
              onChange={(stream) => {
                setFlightdeckStream(stream);
                void saveUserMetadata(accountCodeId, stream);
              }}
              value={flightdeckStream}
            />
          </div>
        ) : null}

        {accountOptions.length > 0 ? (
          <div className={glassRow}>
            <CircleUserIcon className="size-4 shrink-0 text-ink-subtle" />
            <Select
              disabled={!isOrganizer && !isCreating}
              onValueChange={(email) => {
                if (isCreating) {
                  setEventAccountEmail(email);
                  return;
                }
                void persistAccountChange(email);
              }}
              value={eventAccountEmail || accountOptions[0]?.email}
            >
              <SelectTrigger
                className={cn(
                  "!h-full min-h-0 min-w-0 flex-1 justify-between gap-2 rounded-none border-0 bg-transparent px-0 py-0 text-ink text-xs shadow-none focus:ring-0 [&_svg]:size-3.5 [&_svg]:text-ink-subtle",
                  !isOrganizer && !isCreating && "opacity-70",
                )}
              >
                <SelectValue placeholder="Calendar account" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-line shadow-2xl">
                {accountOptions.map((account) => (
                  <SelectItem key={account.email} value={account.email}>
                    {account.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </>
    );
  }

  function renderWhereSection() {
    return (
      <>
        <FormField
          control={form.control}
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className={glassRow}>
                  <MapPinIcon className="size-4 shrink-0 text-ink-subtle" />
                  <input
                    className={`min-h-0 min-w-0 flex-1 bg-transparent py-0 text-ink text-xs leading-normal outline-none placeholder:text-ink-subtle ${lockedInputClass ?? ""}`}
                    disabled={organizerFieldsLocked}
                    placeholder="Add location"
                    readOnly={organizerFieldsLocked}
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="conferenceUrl"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className={glassRow}>
                  <VideoIcon className="size-4 shrink-0 text-ink-subtle" />
                  {conferenceUrl ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <a
                        className="min-w-0 flex-1 truncate text-blue-400 text-xs hover:underline"
                        href={conferenceUrl}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {conferenceProvider
                          ? conferenceProviderLabel(conferenceProvider)
                          : conferenceUrl}
                      </a>
                      {!organizerFieldsLocked ? (
                        <button
                          className="shrink-0 text-ink-subtle hover:text-ink-muted"
                          onClick={() => field.onChange("")}
                          type="button"
                        >
                          <XIcon className="size-3" />
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <input
                        className={`min-h-0 min-w-0 flex-1 bg-transparent py-0 text-ink text-xs leading-normal outline-none placeholder:text-ink-subtle ${lockedInputClass ?? ""}`}
                        disabled={organizerFieldsLocked}
                        placeholder="Paste Meet / Teams / Zoom link"
                        readOnly={organizerFieldsLocked}
                        {...field}
                      />
                      {!organizerFieldsLocked ? (
                        <button
                          className="shrink-0 rounded-md bg-accent px-2 py-1 text-[10px] text-ink-muted hover:bg-accent hover:text-ink"
                          onClick={() => {
                            window.open("https://meet.google.com/new", "_blank");
                          }}
                          type="button"
                        >
                          New Meet
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </>
    );
  }

  function renderWhenSection() {
    return (
      <>
        <FormField
          control={form.control}
          name="startDate"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className={glassRow}>
                  <CalendarIcon className="size-4 shrink-0 text-ink-subtle" />
                  <DatePicker
                    disabled={organizerFieldsLocked}
                    onChange={(nextStartDate) => {
                      field.onChange(nextStartDate);
                      form.setValue("endDate", nextStartDate, {
                        shouldDirty: true,
                        shouldTouch: true,
                        shouldValidate: true,
                      });
                    }}
                    placeholder="Start date"
                    triggerClassName={`h-full min-h-0 flex-1 rounded-none border-0 bg-transparent px-0 text-xs shadow-none hover:bg-transparent focus-visible:ring-0 ${lockedInputClass ?? ""}`}
                    value={field.value}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="endDate"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className={glassRow}>
                  <CalendarIcon className="size-4 shrink-0 text-ink-subtle" />
                  <DatePicker
                    disabled={organizerFieldsLocked}
                    onChange={field.onChange}
                    placeholder="End date"
                    triggerClassName={`h-full min-h-0 flex-1 rounded-none border-0 bg-transparent px-0 text-xs shadow-none hover:bg-transparent focus-visible:ring-0 ${lockedInputClass ?? ""}`}
                    value={field.value}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className={glassRow}>
          <ClockIcon className="size-4 shrink-0 text-ink-subtle" />
          <FormField
            control={form.control}
            name="startTime"
            render={({ field }) => (
              <FormItem className="min-w-0 flex-1">
                <FormControl>
                  <TimePicker
                    disabled={organizerFieldsLocked}
                    onChange={field.onChange}
                    placeholder="Start"
                    triggerClassName={`h-full min-h-0 w-full rounded-none border-0 bg-transparent px-0 text-xs shadow-none hover:bg-transparent focus-visible:ring-0 ${lockedInputClass ?? ""}`}
                    value={field.value}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <span className="shrink-0 text-ink-subtle text-xs">–</span>
          <FormField
            control={form.control}
            name="endTime"
            render={({ field }) => (
              <FormItem className="min-w-0 flex-1">
                <FormControl>
                  <TimePicker
                    disabled={organizerFieldsLocked}
                    onChange={field.onChange}
                    placeholder="End"
                    triggerClassName={`h-full min-h-0 w-full rounded-none border-0 bg-transparent px-0 text-xs shadow-none hover:bg-transparent focus-visible:ring-0 ${lockedInputClass ?? ""}`}
                    value={field.value}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        {isEditing && isRecurringSeries && organizerFieldsLocked ? (
          <div className={glassRow}>
            <RepeatIcon className="size-4 shrink-0 text-ink-subtle" />
            <span className="text-xs text-ink-muted">
              {recurrencePreset !== "none"
                ? recurrenceLabel(
                    recurrenceRuleFromPreset(
                      recurrencePreset,
                      watchedStartDate
                        ? new Date(`${watchedStartDate}T12:00:00`)
                        : new Date(),
                      customRecurrence,
                    ),
                    watchedStartDate
                      ? new Date(`${watchedStartDate}T12:00:00`)
                      : new Date(),
                  )
                : "Part of a recurring series"}
            </span>
          </div>
        ) : (isCreating || isEditing) ? (
          <RecurrenceSelect
            customRule={customRecurrence}
            disabled={organizerFieldsLocked}
            onCustomRuleChange={setCustomRecurrence}
            onPresetChange={setRecurrencePreset}
            startDate={form.watch("startDate")}
            triggerClassName={`${glassRow} w-full border-0 bg-transparent shadow-none`}
            value={recurrencePreset}
          />
        ) : null}

      </>
    );
  }

  const sectionContent: Record<EventDetailSectionId, React.ReactNode> = {
    what: renderWhatSection(),
    where: renderWhereSection(),
    when: renderWhenSection(),
    who: renderWhoSection(),
  };

  const sectionLabels: Record<EventDetailSectionId, string> = {
    what: "What",
    where: "Where",
    when: "When",
    who: "Who",
  };

  const guestEditableSections: EventDetailSectionId[] = ["what", "who"];

  return (
    <TooltipProvider>
      <motion.div
        animate={{ x: 0, opacity: 1 }}
        className="flex h-full min-h-0 flex-col overflow-hidden"
        exit={{ x: 80, opacity: 0 }}
        initial={{ x: 80, opacity: 0 }}
        transition={spring}
      >
        <EventDetailHud
          accountEmail={assignAccountEmail || resolvedEventAccountEmail}
          conferenceUrl={meetJoinUrl || conferenceUrl}
          end={hudEnd}
          event={event}
          isCreating={isCreating}
          isOrganizer={isOrganizer}
          location={watchedLocation}
          onClose={onClose}
          onOpenContext={
            event && onOpenContext ? () => onOpenContext(event) : undefined
          }
          start={hudStart}
          title={watchedTitle || event?.title || ""}
        />

        <Form {...form}>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4">
              {sectionOrder.map((sectionId) => (
                <EventDetailSection
                  key={sectionId}
                  label={sectionLabels[sectionId]}
                  lockTooltip={
                    !guestEditableSections.includes(sectionId) &&
                    organizerFieldsLocked
                      ? lockTooltip
                      : undefined
                  }
                  locked={
                    !guestEditableSections.includes(sectionId) &&
                    organizerFieldsLocked
                  }
                  onOpenChange={(open) =>
                    setSectionOpen((prev) => ({ ...prev, [sectionId]: open }))
                  }
                  open={sectionOpen[sectionId]}
                >
                  {sectionContent[sectionId]}
                </EventDetailSection>
              ))}
            </div>

            <div className="border-t border-line px-5 py-3">
              <div className="flex items-center gap-2">
                {isEditing && isOrganizer ? (
                  <Button
                    className="h-8 rounded-lg border border-red-500/20 bg-red-500/10 px-3 text-destructive text-xs hover:bg-red-500/20"
                    disabled={isLoading}
                    onClick={handleDelete}
                    type="button"
                    variant="ghost"
                  >
                    <Trash2Icon className="mr-1.5 h-3 w-3" />
                    Delete
                  </Button>
                ) : null}
                <div className="ml-auto flex gap-2">
                  <Button
                    className="h-8 rounded-lg border border-line bg-surface-sunk px-4 text-xs hover:bg-accent"
                    disabled={isLoading}
                    onClick={onClose}
                    type="button"
                    variant="ghost"
                  >
                    {isOrganizer ? "Cancel" : "Close"}
                  </Button>
                  {isOrganizer ? (
                    <Button
                      className="h-8 rounded-lg bg-primary px-4 font-medium text-primary-foreground text-xs hover:bg-primary"
                      disabled={isLoading}
                      type="submit"
                    >
                      {isLoading ? "Saving..." : isCreating ? "Create" : "Save"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </form>
        </Form>

        <AlertDialog onOpenChange={setScopeDialogOpen} open={scopeDialogOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {scopeDialogMode === "save"
                ? "Edit recurring event"
                : "Delete recurring event"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {scopeDialogMode === "save"
                ? "Would you like to change only this event, this and following events, or all events in the series?"
                : "Would you like to delete only this event, this and following events, or all events in the series?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              className="w-full"
              onClick={() => confirmScope("this")}
            >
              This event
            </AlertDialogAction>
            <AlertDialogAction
              className="w-full"
              onClick={() => confirmScope("following")}
            >
              This and following events
            </AlertDialogAction>
            <AlertDialogAction
              className="w-full"
              onClick={() => confirmScope("all")}
            >
              All events
            </AlertDialogAction>
            <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
    </TooltipProvider>
  );
}
