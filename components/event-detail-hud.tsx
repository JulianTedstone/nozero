"use client";

import {
  differenceInDays,
  differenceInMinutes,
  format,
  isPast,
  isToday,
  isTomorrow,
  isYesterday,
} from "date-fns";
import { MapPinIcon, VideoIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ContextIcon } from "@/components/context-icon";
import { Button } from "@/components/ui/button";
import {
  conferenceProviderLabel,
  detectConferenceProvider,
} from "@/lib/conference-links";
import { organizerDisplayName } from "@/lib/event-organizer";
import type { CalendarEvent } from "@/types/calendar";

interface EventDetailHudProps {
  accountEmail?: string;
  conferenceUrl?: string;
  isOrganizer: boolean;
  location?: string;
  onClose: () => void;
  onOpenContext?: () => void;
  start?: string;
  end?: string;
  title: string;
  event?: CalendarEvent | null;
  isCreating?: boolean;
}

function friendlySchedule(start?: string, end?: string): string {
  if (!start) return "";
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;

  let dayLabel: string;
  if (isToday(startDate)) dayLabel = "Today";
  else if (isTomorrow(startDate)) dayLabel = "Tomorrow";
  else if (isYesterday(startDate)) dayLabel = "Yesterday";
  else dayLabel = format(startDate, "EEE d MMM");

  const startTime = format(startDate, "h:mm a");
  if (!endDate) return `${dayLabel}, ${startTime}`;

  const sameDay =
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getDate() === endDate.getDate();

  const endTime = format(endDate, "h:mm a");
  return sameDay
    ? `${dayLabel}, ${startTime} – ${endTime}`
    : `${dayLabel} ${startTime} – ${format(endDate, "EEE d MMM")} ${endTime}`;
}

function countdownLabel(start?: string): string | null {
  if (!start) return null;
  const startDate = new Date(start);
  const now = new Date();

  if (isPast(startDate)) {
    return "Started";
  }

  const minutes = differenceInMinutes(startDate, now);
  if (minutes < 60) {
    return minutes <= 1 ? "Starts now" : `In ${minutes} min`;
  }

  const days = differenceInDays(startDate, now);
  if (days >= 1) {
    const hours = Math.floor((minutes % (24 * 60)) / 60);
    if (days === 1 && hours === 0) return "Tomorrow";
    if (hours > 0) return `In ${days}d ${hours}h`;
    return `In ${days} day${days === 1 ? "" : "s"}`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `In ${hours}h ${mins}m` : `In ${hours}h`;
}

export function EventDetailHud({
  accountEmail,
  title,
  start,
  end,
  location,
  conferenceUrl,
  isOrganizer,
  event,
  isCreating = false,
  onClose,
  onOpenContext,
}: EventDetailHudProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const schedule = useMemo(() => friendlySchedule(start, end), [start, end]);
  const countdown = useMemo(() => countdownLabel(start), [start, tick]);

  const organiserLabel = isCreating
    ? "Your meeting"
    : isOrganizer
      ? "Your meeting"
      : `${organizerDisplayName(event)}'s meeting`;

  const provider = conferenceUrl
    ? detectConferenceProvider(conferenceUrl)
    : null;

  const mapsUrl = location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
    : null;

  return (
    <div className="border-b border-line px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="truncate font-semibold text-base text-ink">
            {title.trim() || (isCreating ? "New event" : "Untitled event")}
          </h3>

          <p className="text-[11px] text-ink-muted">{organiserLabel}</p>

          {schedule ? (
            <p className="text-xs text-ink-muted">{schedule}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {mapsUrl ? (
              <a
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-sunk px-2 py-1 text-[11px] text-ink-muted transition-colors hover:bg-accent hover:text-ink"
                href={mapsUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                <MapPinIcon className="size-3" />
                <span className="max-w-[12rem] truncate">
                  {location?.trim()}
                </span>
              </a>
            ) : null}

            {conferenceUrl && provider ? (
              <a
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-sunk px-2 py-1 text-[11px] text-blue-300/90 transition-colors hover:bg-accent"
                href={conferenceUrl}
                rel="noopener noreferrer"
                target="_blank"
                title={
                  accountEmail
                    ? `Join with ${accountEmail}`
                    : "Join video call"
                }
              >
                <VideoIcon className="size-3" />
                {conferenceProviderLabel(provider)}
              </a>
            ) : null}
          </div>

          {countdown ? (
            <p className="text-[11px] font-medium text-destructive">
              {countdown}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {onOpenContext && !isCreating ? (
            <Button
              className="h-7 gap-1.5 rounded-lg px-2 text-[11px] text-ink-muted hover:bg-accent hover:text-ink"
              onClick={onOpenContext}
              size="sm"
              title="Open in Context"
              variant="ghost"
            >
              <ContextIcon className="h-3.5 w-3.5" />
              Context
            </Button>
          ) : null}
          <Button
            className="h-7 w-7 shrink-0 rounded-lg text-ink-subtle hover:bg-accent hover:text-ink"
            onClick={onClose}
            size="icon"
            variant="ghost"
          >
            <XIcon className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
