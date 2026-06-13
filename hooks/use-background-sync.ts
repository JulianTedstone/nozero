"use client";

import { useCallback, useEffect, useRef } from "react";
import { hydrateCalendarMirrorFromServer } from "@/lib/local-mirror/calendar-hydrate";
import { hydrateEmailMirrorFromServer } from "@/lib/local-mirror/email-hydrate";

const CALENDAR_SYNC_INTERVAL_MS = 2 * 60 * 1000;
const EMAIL_SYNC_INTERVAL_MS = 2 * 60 * 1000;
const MIN_SYNC_GAP_MS = 30 * 1000;

type BackgroundSyncOptions = {
  userId?: string;
  onCalendarSynced?: () => void | Promise<void>;
  onEmailSynced?: () => void | Promise<void>;
  enabled?: boolean;
};

export function useBackgroundSync({
  userId,
  onCalendarSynced,
  onEmailSynced,
  enabled = true,
}: BackgroundSyncOptions) {
  const calendarSyncing = useRef(false);
  const emailSyncing = useRef(false);
  const lastCalendarSync = useRef(0);
  const lastEmailSync = useRef(0);

  const syncCalendar = useCallback(async () => {
    if (!userId || calendarSyncing.current || !navigator.onLine) return;
    const now = Date.now();
    if (now - lastCalendarSync.current < MIN_SYNC_GAP_MS) return;

    calendarSyncing.current = true;
    lastCalendarSync.current = now;
    try {
      const res = await fetch("/api/calendar/sync?pullOnly=true", {
        method: "POST",
      });
      if (res.ok) {
        await hydrateCalendarMirrorFromServer(userId);
        await onCalendarSynced?.();
      }
    } catch {
      // Background sync is best-effort.
    } finally {
      calendarSyncing.current = false;
    }
  }, [onCalendarSynced, userId]);

  const syncEmail = useCallback(async () => {
    if (!userId || emailSyncing.current || !navigator.onLine) return;
    const now = Date.now();
    if (now - lastEmailSync.current < MIN_SYNC_GAP_MS) return;

    emailSyncing.current = true;
    lastEmailSync.current = now;
    try {
      const res = await fetch("/api/email/sync", { method: "POST" });
      if (res.ok) {
        await hydrateEmailMirrorFromServer(userId);
        await onEmailSynced?.();
      }
    } catch {
      // Background sync is best-effort.
    } finally {
      emailSyncing.current = false;
    }
  }, [onEmailSynced, userId]);

  useEffect(() => {
    if (!(enabled && userId)) return;

    const kickoff = window.setTimeout(() => {
      void syncCalendar();
      void syncEmail();
    }, 250);

    const calendarInterval = window.setInterval(
      () => void syncCalendar(),
      CALENDAR_SYNC_INTERVAL_MS,
    );
    const emailInterval = window.setInterval(
      () => void syncEmail(),
      EMAIL_SYNC_INTERVAL_MS,
    );

    const onOnline = () => {
      void syncCalendar();
      void syncEmail();
    };
    window.addEventListener("online", onOnline);

    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(calendarInterval);
      window.clearInterval(emailInterval);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, syncCalendar, syncEmail, userId]);

  return { syncCalendar, syncEmail };
}
