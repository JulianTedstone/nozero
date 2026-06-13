import { upsertEmailThreads, writeMirrorMeta } from "@/lib/local-mirror/db";
import type { EmailThreadListItem } from "@/types/email";

export async function hydrateEmailMirrorFromServer(
  userId: string,
  maxPages = 20
): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return;
  }

  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams();
    params.set("filter", "all");
    params.set("limit", "100");
    params.set("sync", "false");
    if (cursor) {
      params.set("cursor", cursor);
    }

    const res = await fetch(`/api/email/threads?${params.toString()}`);
    if (!res.ok) {
      break;
    }

    const data = (await res.json()) as {
      threads: EmailThreadListItem[];
      nextCursor: string | null;
    };
    if (data.threads?.length) {
      await upsertEmailThreads(userId, data.threads);
    }
    cursor = data.nextCursor ?? null;
    if (!cursor) {
      break;
    }
  }

  await writeMirrorMeta(userId, "email", {
    lastSyncAt: new Date().toISOString(),
  });
}
