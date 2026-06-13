import type { EmailFilterTab, EmailThreadListItem } from "@/types/email";

export function filterEmailThreads(input: {
  threads: EmailThreadListItem[];
  filter: EmailFilterTab;
  q?: string;
  stream?: string | null;
  visibleAccounts: Set<string>;
  limit?: number;
  cursor?: string | null;
}): { threads: EmailThreadListItem[]; nextCursor: string | null } {
  const limit = input.limit ?? 20;
  let rows = input.threads.filter((t) =>
    input.visibleAccounts.has(t.accountEmail.toLowerCase()),
  );

  if (input.filter === "unread") {
    rows = rows.filter((t) => t.unread);
  } else if (input.filter === "tracking") {
    rows = rows.filter((t) => t.tracking);
  }

  rows = rows.filter((t) => !t.archived);

  if (input.stream) {
    const stream = input.stream.toLowerCase();
    rows = rows.filter((t) =>
      t.streams.some((s) => s.toLowerCase() === stream),
    );
  }

  if (input.q?.trim()) {
    const q = input.q.trim().toLowerCase();
    rows = rows.filter(
      (t) =>
        t.subject.toLowerCase().includes(q) ||
        t.sender.toLowerCase().includes(q) ||
        (t.aiSummary ?? "").toLowerCase().includes(q) ||
        (t.snippet ?? "").toLowerCase().includes(q),
    );
  }

  rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  let startIndex = 0;
  if (input.cursor) {
    const idx = rows.findIndex((t) => t.id === input.cursor);
    startIndex = idx >= 0 ? idx + 1 : 0;
  }

  const slice = rows.slice(startIndex, startIndex + limit + 1);
  const hasMore = slice.length > limit;
  const page = hasMore ? slice.slice(0, limit) : slice;
  const nextCursor = hasMore ? (page.at(-1)?.id ?? null) : null;

  return { threads: page, nextCursor };
}
