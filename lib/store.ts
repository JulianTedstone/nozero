import { createAdminClient } from "@/lib/supabase/admin";
import type { CalendarCategory, CalendarEvent } from "@/types/calendar";

interface UserRecord {
  accessToken?: string;
  email?: string;
  expiresAt?: number;
  googleSyncToken?: string;
  googleWatchCalendarId?: string;
  googleWatchChannelId?: string;
  googleWatchExpiration?: number;
  googleWatchResourceId?: string;
  googleWatchToken?: string;
  image?: string;
  lastGoogleSync?: number;
  name?: string;
  preferences?: Record<string, unknown>;
  provider?: string;
  refreshToken?: string;
  userId: string;
}

type ProfileRow = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  provider: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  preferences: Record<string, unknown> | null;
  last_google_sync: string | null;
  google_sync_token: string | null;
  google_watch_calendar_id: string | null;
  google_watch_channel_id: string | null;
  google_watch_expiration: string | null;
  google_watch_resource_id: string | null;
  google_watch_token: string | null;
};

export const defaultCategories: CalendarCategory[] = [
  {
    id: "personal",
    name: "Personal",
    color: "#3b82f6",
    userId: "",
    visible: true,
  },
  { id: "work", name: "Work", color: "#10b981", userId: "", visible: true },
  { id: "family", name: "Family", color: "#8b5cf6", userId: "", visible: true },
];

function tsToMs(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function msToTs(value: number | undefined | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Date(value).toISOString();
}

function rowToUserRecord(row: ProfileRow): UserRecord {
  return {
    userId: row.id,
    email: row.email ?? undefined,
    name: row.name ?? undefined,
    image: row.image ?? undefined,
    provider: row.provider ?? undefined,
    accessToken: row.access_token ?? undefined,
    refreshToken: row.refresh_token ?? undefined,
    expiresAt: tsToMs(row.expires_at),
    preferences: (row.preferences as Record<string, unknown> | null) ?? {},
    lastGoogleSync: tsToMs(row.last_google_sync),
    googleSyncToken: row.google_sync_token ?? undefined,
    googleWatchCalendarId: row.google_watch_calendar_id ?? undefined,
    googleWatchChannelId: row.google_watch_channel_id ?? undefined,
    googleWatchExpiration: tsToMs(row.google_watch_expiration),
    googleWatchResourceId: row.google_watch_resource_id ?? undefined,
    googleWatchToken: row.google_watch_token ?? undefined,
  };
}

function withUserId(
  category: CalendarCategory,
  userId: string,
): CalendarCategory {
  return { ...category, userId };
}

export async function getUserRecord(
  userId: string,
): Promise<UserRecord | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToUserRecord(data as unknown as ProfileRow) : null;
}

export async function upsertUserRecord(user: UserRecord) {
  const supabase = createAdminClient();
  const patch: Record<string, unknown> = { id: user.userId };
  if (user.email !== undefined) patch.email = user.email;
  if (user.name !== undefined) patch.name = user.name;
  if (user.image !== undefined) patch.image = user.image;
  if (user.provider !== undefined) patch.provider = user.provider;
  if (user.accessToken !== undefined) patch.access_token = user.accessToken;
  if (user.refreshToken !== undefined) patch.refresh_token = user.refreshToken;
  if (user.expiresAt !== undefined) patch.expires_at = msToTs(user.expiresAt);
  if (user.preferences !== undefined) patch.preferences = user.preferences;
  if (user.lastGoogleSync !== undefined)
    patch.last_google_sync = msToTs(user.lastGoogleSync);
  if (user.googleSyncToken !== undefined)
    patch.google_sync_token = user.googleSyncToken;
  if (user.googleWatchCalendarId !== undefined)
    patch.google_watch_calendar_id = user.googleWatchCalendarId;
  if (user.googleWatchChannelId !== undefined)
    patch.google_watch_channel_id = user.googleWatchChannelId;
  if (user.googleWatchExpiration !== undefined)
    patch.google_watch_expiration = msToTs(user.googleWatchExpiration);
  if (user.googleWatchResourceId !== undefined)
    patch.google_watch_resource_id = user.googleWatchResourceId;
  if (user.googleWatchToken !== undefined)
    patch.google_watch_token = user.googleWatchToken;

  const { error } = await supabase
    .from("profiles")
    .upsert(patch as never, { onConflict: "id" });
  if (error) throw error;
}

export async function getUserPreferences(userId: string) {
  return (await getUserRecord(userId))?.preferences ?? {};
}

export async function getGoogleWatchRecord(
  googleWatchChannelId: string,
  googleWatchToken?: string | null,
): Promise<UserRecord | null> {
  const supabase = createAdminClient();
  let query = supabase
    .from("profiles")
    .select("*")
    .eq("google_watch_channel_id", googleWatchChannelId);
  if (googleWatchToken) {
    query = query.eq("google_watch_token", googleWatchToken);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? rowToUserRecord(data as unknown as ProfileRow) : null;
}

export async function saveUserPreferences(
  userId: string,
  preferences: Record<string, unknown>,
) {
  const existing = await getUserPreferences(userId);
  const merged: Record<string, unknown> = { ...existing, ...preferences };
  // Form saves omit OAuth fields — preserve them unless explicitly provided
  if (!("connectedTokens" in preferences)) {
    merged.connectedTokens = existing.connectedTokens;
  }
  if (!("connectedAccounts" in preferences)) {
    merged.connectedAccounts = existing.connectedAccounts;
  }
  if (!("connectedCalDav" in preferences)) {
    merged.connectedCalDav = existing.connectedCalDav;
  }
  if (!("calendarSubscriptions" in preferences)) {
    merged.calendarSubscriptions = existing.calendarSubscriptions;
  }
  if (!("calendarVisibility" in preferences)) {
    merged.calendarVisibility = existing.calendarVisibility;
  }
  if (!("calendarSidebarExpanded" in preferences)) {
    merged.calendarSidebarExpanded = existing.calendarSidebarExpanded;
  }
  if (!("calendarSyncRange" in preferences)) {
    merged.calendarSyncRange = existing.calendarSyncRange;
  }
  await upsertUserRecord({ userId, preferences: merged });
}

export async function listUserEventsInRange(
  userId: string,
  start: Date | string,
  end: Date | string,
): Promise<CalendarEvent[]> {
  const rangeStart =
    typeof start === "string" ? start : new Date(start).toISOString();
  const rangeEnd = typeof end === "string" ? end : new Date(end).toISOString();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("events")
    .select("data")
    .eq("user_id", userId)
    .lte("start_at", rangeEnd)
    .gte("end_at", rangeStart)
    .order("start_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => row.data as unknown as CalendarEvent);
}

export async function getUserTimezone(userId: string) {
  const preferences = await getUserPreferences(userId);
  return typeof preferences.timezone === "string"
    ? preferences.timezone
    : "UTC";
}

export async function listUserEvents(userId: string): Promise<CalendarEvent[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("events")
    .select("data, start_at")
    .eq("user_id", userId)
    .order("start_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => row.data as unknown as CalendarEvent);
}

export async function getUserEvent(
  userId: string,
  eventId: string,
): Promise<CalendarEvent | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("events")
    .select("data")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data ? (data.data as unknown as CalendarEvent) : null;
}

export async function upsertUserEvent(event: CalendarEvent) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("events").upsert(
    {
      user_id: event.userId,
      event_id: event.id,
      start_at: new Date(event.start).toISOString(),
      end_at: new Date(event.end).toISOString(),
      source: event.source ?? null,
      data: event as never,
    },
    { onConflict: "user_id,event_id" },
  );
  if (error) throw error;
}

export async function deleteUserEvent(userId: string, eventId: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("events")
    .delete()
    .eq("user_id", userId)
    .eq("event_id", eventId);
  if (error) throw error;
}

export async function listUserCategories(
  userId: string,
): Promise<CalendarCategory[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("categories")
    .select("data")
    .eq("user_id", userId);
  if (error) throw error;
  if ((data?.length ?? 0) === 0) {
    return defaultCategories.map((category) => withUserId(category, userId));
  }
  return (data ?? [])
    .map((row) => row.data as unknown as CalendarCategory)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function upsertUserCategory(category: CalendarCategory) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("categories").upsert(
    {
      user_id: category.userId,
      category_id: category.id,
      data: category as never,
    },
    { onConflict: "user_id,category_id" },
  );
  if (error) throw error;
}

export async function ensureDefaultCategories(userId: string) {
  const categories = await listUserCategories(userId);
  if (
    categories.length > 0 &&
    categories[0].userId === userId &&
    categories.some((item) => item.id === "personal")
  ) {
    return categories;
  }
  const seeded = defaultCategories.map((category) =>
    withUserId(category, userId),
  );
  await Promise.all(seeded.map((category) => upsertUserCategory(category)));
  return seeded;
}

export async function getGoogleAuth(userId: string) {
  const user = await getUserRecord(userId);
  if (!user) return null;
  return {
    provider: user.provider,
    accessToken: user.accessToken,
    refreshToken: user.refreshToken,
    expiresAt: user.expiresAt,
    lastGoogleSync: user.lastGoogleSync,
    googleSyncToken: user.googleSyncToken,
    googleWatchCalendarId: user.googleWatchCalendarId,
    googleWatchChannelId: user.googleWatchChannelId,
    googleWatchExpiration: user.googleWatchExpiration,
    googleWatchResourceId: user.googleWatchResourceId,
    googleWatchToken: user.googleWatchToken,
  };
}
