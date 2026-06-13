import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CalendarEvent } from "@/types/calendar";
import type {
  EmailAccountView,
  EmailThreadDetail,
  EmailThreadListItem,
} from "@/types/email";

const DB_NAME = "nozero-local-mirror";
const DB_VERSION = 1;

export type MirrorMeta = {
  lastSyncAt: string | null;
  lastLocalReadAt?: string | null;
};

type NozeroMirrorDb = DBSchema & {
  calendar_events: {
    key: string;
    value: CalendarEvent;
    indexes: { by_user: string };
  };
  calendar_meta: {
    key: string;
    value: MirrorMeta;
  };
  email_threads: {
    key: string;
    value: EmailThreadListItem;
    indexes: { by_user: string };
  };
  email_thread_details: {
    key: string;
    value: EmailThreadDetail;
  };
  email_accounts: {
    key: string;
    value: EmailAccountView[];
  };
  email_meta: {
    key: string;
    value: MirrorMeta;
  };
};

let dbPromise: Promise<IDBPDatabase<NozeroMirrorDb>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<NozeroMirrorDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const calendarEvents = db.createObjectStore("calendar_events");
        calendarEvents.createIndex("by_user", "userId");

        db.createObjectStore("calendar_meta");

        const emailThreads = db.createObjectStore("email_threads");
        emailThreads.createIndex("by_user", "accountEmail");

        db.createObjectStore("email_thread_details");
        db.createObjectStore("email_accounts");
        db.createObjectStore("email_meta");
      },
    });
  }
  return dbPromise;
}

export function calendarEventKey(userId: string, eventId: string) {
  return `${userId}::${eventId}`;
}

export function emailThreadStoreKey(
  userId: string,
  accountEmail: string,
  threadId: string,
) {
  return `${userId}::${accountEmail.toLowerCase()}::${threadId}`;
}

export function emailDetailKey(
  userId: string,
  accountEmail: string,
  threadId: string,
) {
  return `${userId}::${accountEmail.toLowerCase()}::${threadId}`;
}

export function metaKey(userId: string, domain: "calendar" | "email") {
  return `${userId}::${domain}`;
}

export async function readMirrorMeta(
  userId: string,
  domain: "calendar" | "email",
): Promise<MirrorMeta | null> {
  const db = await getDb();
  const store = domain === "calendar" ? "calendar_meta" : "email_meta";
  return (await db.get(store, metaKey(userId, domain))) ?? null;
}

export async function writeMirrorMeta(
  userId: string,
  domain: "calendar" | "email",
  meta: MirrorMeta,
): Promise<void> {
  const db = await getDb();
  const store = domain === "calendar" ? "calendar_meta" : "email_meta";
  await db.put(store, meta, metaKey(userId, domain));
}

export async function upsertCalendarEvents(
  userId: string,
  events: CalendarEvent[],
): Promise<void> {
  if (events.length === 0) return;
  const db = await getDb();
  const tx = db.transaction("calendar_events", "readwrite");
  await Promise.all(
    events.map((event) => {
      const normalized = { ...event, userId: event.userId || userId };
      return tx.store.put(normalized, calendarEventKey(userId, normalized.id));
    }),
  );
  await tx.done;
}

export async function readCalendarEventsInRange(
  userId: string,
  start: Date,
  end: Date,
): Promise<CalendarEvent[]> {
  const db = await getDb();
  const rangeStart = start.toISOString();
  const rangeEnd = end.toISOString();
  const all = await db.getAllFromIndex("calendar_events", "by_user", userId);
  return all.filter((event) => {
    const eventStart = event.start;
    const eventEnd = event.end ?? event.start;
    return eventStart <= rangeEnd && eventEnd >= rangeStart;
  });
}

export async function upsertEmailThreads(
  userId: string,
  threads: EmailThreadListItem[],
): Promise<void> {
  if (threads.length === 0) return;
  const db = await getDb();
  const tx = db.transaction("email_threads", "readwrite");
  for (const thread of threads) {
    await tx.store.put(
      thread,
      emailThreadStoreKey(userId, thread.accountEmail, thread.id),
    );
  }
  await tx.done;
}

export async function readAllEmailThreads(
  userId: string,
): Promise<EmailThreadListItem[]> {
  const db = await getDb();
  const keys = await db.getAllKeys("email_threads");
  const prefix = `${userId}::`;
  const rows: EmailThreadListItem[] = [];
  for (const key of keys) {
    if (!String(key).startsWith(prefix)) continue;
    const row = await db.get("email_threads", key);
    if (row) rows.push(row);
  }
  return rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

export async function upsertEmailThreadDetail(
  userId: string,
  detail: EmailThreadDetail,
): Promise<void> {
  const db = await getDb();
  const key = emailDetailKey(
    userId,
    detail.thread.accountEmail,
    detail.thread.id,
  );
  await db.put("email_thread_details", detail, key);
}

export async function readEmailThreadDetail(
  userId: string,
  threadId: string,
  accountEmail?: string | null,
): Promise<EmailThreadDetail | null> {
  const db = await getDb();
  if (accountEmail) {
    return (
      (await db.get(
        "email_thread_details",
        emailDetailKey(userId, accountEmail, threadId),
      )) ?? null
    );
  }
  const keys = await db.getAllKeys("email_thread_details");
  const suffix = `::${threadId}`;
  for (const key of keys) {
    if (String(key).endsWith(suffix) && String(key).startsWith(`${userId}::`)) {
      return (await db.get("email_thread_details", key)) ?? null;
    }
  }
  return null;
}

export async function upsertEmailAccounts(
  userId: string,
  accounts: EmailAccountView[],
): Promise<void> {
  const db = await getDb();
  await db.put("email_accounts", accounts, userId);
}

export async function readEmailAccounts(
  userId: string,
): Promise<EmailAccountView[] | null> {
  const db = await getDb();
  return (await db.get("email_accounts", userId)) ?? null;
}
