"use client";

import { format } from "date-fns";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  EyeIcon,
  ForwardIcon,
  InboxIcon,
  LayoutDashboardIcon,
  Loader2Icon,
  MailIcon,
  MailOpenIcon,
  PlusIcon,
  RefreshCwIcon,
  ReplyIcon,
  SearchIcon,
  SendIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CollapsibleSidebarSection } from "@/components/collapsible-sidebar-section";
import { ThreeColumnLayout } from "@/components/three-column-layout";
import { Button } from "@/components/ui/button";
import {
  readAllEmailThreads,
  readEmailAccounts,
  readEmailThreadDetail,
  readMirrorMeta,
  upsertEmailAccounts,
  upsertEmailThreadDetail,
  upsertEmailThreads,
} from "@/lib/local-mirror/db";
import { filterEmailThreads } from "@/lib/local-mirror/email-query";
import { hydrateEmailMirrorFromServer } from "@/lib/local-mirror/email-hydrate";
import { cn } from "@/lib/utils";
import type {
  EmailAccountView,
  EmailFilterTab,
  EmailMessage,
  EmailThreadContext,
  EmailThreadDetail,
  EmailThreadListItem,
} from "@/types/email";

const SEARCH_DEBOUNCE_MS = 300;

interface EmailViewProps {
  initialThreadId?: string | null;
  mirrorVersion?: number;
  onThreadIdChange?: (threadId: string | null) => void;
  persona?: "Bertrand" | "Pierre";
  userEmail?: string;
  userId?: string;
  tabBar?: ReactNode;
  sidebarFooter?: ReactNode;
}

const FILTER_TABS: Array<{
  id: EmailFilterTab;
  label: string;
  icon: typeof InboxIcon;
}> = [
  { id: "unread", label: "Unread", icon: MailOpenIcon },
  { id: "tracking", label: "Tracking", icon: EyeIcon },
  { id: "all", label: "All", icon: InboxIcon },
];

function formatThreadDate(value: string | null): string {
  if (!value) return "";
  try {
    return format(new Date(value), "d MMM");
  } catch {
    return "";
  }
}

function formatMessageDate(value: string | null): string {
  if (!value) return "";
  try {
    return format(new Date(value), "d MMM yyyy · HH:mm");
  } catch {
    return "";
  }
}

function friendlyAccountName(email: string): string {
  return email.split("@")[0] ?? email;
}

function ContextSection({
  title,
  defaultOpen = true,
  children,
  empty,
  isEmpty,
}: {
  title: string;
  defaultOpen?: boolean;
  children?: React.ReactNode;
  empty?: string;
  isEmpty?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <button
        className="flex w-full items-center justify-between border-white/[0.06] border-b px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <h3 className="font-semibold text-[10px] text-white/35 uppercase tracking-wider">
          {title}
        </h3>
        <ChevronDownIcon
          className={cn(
            "h-3 w-3 text-white/25 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="px-3 py-2.5 text-[11px] text-white/55">
          {isEmpty ? (
            <p className="text-white/25">{empty ?? "Nothing here yet."}</p>
          ) : (
            children
          )}
        </div>
      ) : null}
    </section>
  );
}

export function EmailView({
  userEmail,
  userId,
  initialThreadId = null,
  mirrorVersion = 0,
  onThreadIdChange,
  persona = "Bertrand",
  tabBar,
  sidebarFooter,
}: EmailViewProps) {
  const [accounts, setAccounts] = useState<EmailAccountView[]>([]);
  const [accountsExpanded, setAccountsExpanded] = useState(false);
  const [filter, setFilter] = useState<EmailFilterTab>("all");
  const [streamFilter, setStreamFilter] = useState<string | null>(null);
  const [boardStreams, setBoardStreams] = useState<string[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [threads, setThreads] = useState<EmailThreadListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(initialThreadId);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [detail, setDetail] = useState<EmailThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [context, setContext] = useState<EmailThreadContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [agentDraftLoading, setAgentDraftLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [originalMessage, setOriginalMessage] = useState<EmailMessage | null>(
    null,
  );
  const [newStreamName, setNewStreamName] = useState("");
  const [assigningStream, setAssigningStream] = useState(false);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLTextAreaElement>(null);
  const nextCursorRef = useRef<string | null>(null);
  const threadAccountRef = useRef<string | null>(null);

  const refreshLastSyncedAt = useCallback(async () => {
    if (!userId) return;
    const meta = await readMirrorMeta(userId, "email");
    if (meta?.lastSyncAt) {
      setLastSyncedAt(new Date(meta.lastSyncAt));
    }
  }, [userId]);

  const visibleAccountEmails = useMemo(() => {
    const visible = accounts
      .filter((a) => a.visible !== false)
      .map((a) => a.email.toLowerCase());
    return new Set(visible);
  }, [accounts]);

  const readLocalThreadPage = useCallback(
    async (opts?: { cursor?: string | null }) => {
      if (!userId) {
        return { threads: [] as EmailThreadListItem[], nextCursor: null };
      }
      const all = await readAllEmailThreads(userId);
      const visibleAccounts =
        visibleAccountEmails.size > 0
          ? visibleAccountEmails
          : new Set(all.map((t) => t.accountEmail.toLowerCase()));
      return filterEmailThreads({
        threads: all,
        filter,
        q: debouncedSearch,
        stream: streamFilter,
        visibleAccounts,
        limit: 20,
        cursor: opts?.cursor ?? null,
      });
    },
    [debouncedSearch, filter, streamFilter, userId, visibleAccountEmails],
  );

  const loadAccounts = useCallback(async () => {
    if (userId) {
      const cached = await readEmailAccounts(userId);
      if (cached?.length) {
        setAccounts(cached);
      }
    }

    if (!navigator.onLine) return;

    try {
      const res = await fetch("/api/email/accounts");
      if (!res.ok) return;
      const data = (await res.json()) as {
        accounts: EmailAccountView[];
        accountsExpanded?: boolean;
      };
      const next = data.accounts ?? [];
      setAccounts(next);
      if (typeof data.accountsExpanded === "boolean") {
        setAccountsExpanded(data.accountsExpanded);
      }
      if (userId && next.length > 0) {
        await upsertEmailAccounts(userId, next);
      }
    } catch {
      // Keep cached accounts when offline.
    }
  }, [userId]);

  const loadBoardStreams = useCallback(async () => {
    const res = await fetch("/api/flightdeck/board");
    if (res.ok) {
      const data = (await res.json()) as { streams?: string[] };
      setBoardStreams(data.streams ?? []);
    }
  }, []);

  const buildListUrl = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      params.set("filter", filter);
      params.set("limit", "20");
      params.set("sync", "false");
      if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
      if (streamFilter) params.set("stream", streamFilter);
      if (cursor) params.set("cursor", cursor);
      return `/api/email/threads?${params.toString()}`;
    },
    [debouncedSearch, filter, streamFilter],
  );

  const loadThreads = useCallback(
    async (opts?: {
      silent?: boolean;
      append?: boolean;
      cursor?: string;
      fetchNetwork?: boolean;
    }) => {
      if (!userId) return;

      const silent = opts?.silent ?? false;
      const append = opts?.append ?? false;
      const fetchNetwork = opts?.fetchNetwork !== false;

      if (append) {
        setLoadingMore(true);
      } else if (silent) {
        setListRefreshing(true);
      } else {
        setListLoading(true);
      }
      setListError(null);

      try {
        if (append) {
          const localPage = await readLocalThreadPage({
            cursor: opts?.cursor ?? nextCursorRef.current,
          });
          if (localPage.threads.length > 0) {
            setThreads((prev) => [...prev, ...localPage.threads]);
            setNextCursor(localPage.nextCursor);
          } else if (fetchNetwork && navigator.onLine) {
            const url = buildListUrl(opts?.cursor ?? nextCursorRef.current);
            const res = await fetch(url);
            if (!res.ok) throw new Error(`List failed (${res.status})`);
            const data = (await res.json()) as {
              threads: EmailThreadListItem[];
              nextCursor: string | null;
            };
            await upsertEmailThreads(userId, data.threads ?? []);
            setThreads((prev) => [...prev, ...(data.threads ?? [])]);
            setNextCursor(data.nextCursor ?? null);
          }
        } else {
          const localPage = await readLocalThreadPage();
          setThreads(localPage.threads);
          setNextCursor(localPage.nextCursor);
          if (localPage.threads.length > 0) {
            setListLoading(false);
          }

          if (fetchNetwork && navigator.onLine) {
            const url = buildListUrl(null);
            const res = await fetch(url);
            if (res.ok) {
              const data = (await res.json()) as {
                threads: EmailThreadListItem[];
                nextCursor: string | null;
                error?: string;
              };
              if (data.threads?.length) {
                await upsertEmailThreads(userId, data.threads);
              }
              const merged = await readLocalThreadPage();
              setThreads(merged.threads);
              setNextCursor(merged.nextCursor);
              if (data.error && merged.threads.length === 0) {
                setListError(data.error);
              }
            }
          }
        }
      } catch (err) {
        const localPage = await readLocalThreadPage(
          append ? { cursor: opts?.cursor ?? nextCursorRef.current } : undefined,
        );
        if (!append && localPage.threads.length === 0) {
          setListError(
            err instanceof Error ? err.message : "Failed to load mail",
          );
        }
      } finally {
        setListLoading(false);
        setListRefreshing(false);
        setLoadingMore(false);
      }
    },
    [buildListUrl, readLocalThreadPage, userId],
  );

  const loadThread = useCallback(
    async (threadId: string, accountEmail?: string | null) => {
      setDetailLoading(true);
      setDetailError(null);

      let hasCached = false;
      if (userId) {
        const cached = await readEmailThreadDetail(
          userId,
          threadId,
          accountEmail,
        );
        if (cached) {
          hasCached = true;
          setDetail(cached);
          setSelectedAccount(cached.thread.accountEmail);
        }
      }

      if (!navigator.onLine) {
        if (!hasCached) {
          setDetailError("Thread is not available offline yet.");
        }
        setDetailLoading(false);
        return;
      }

      try {
        const params = accountEmail
          ? `?accountEmail=${encodeURIComponent(accountEmail)}`
          : "";
        const res = await fetch(
          `/api/email/threads/${encodeURIComponent(threadId)}${params}`,
        );
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? `Thread load failed (${res.status})`);
        }
        const data = (await res.json()) as EmailThreadDetail;
        setDetail(data);
        setSelectedAccount((prev) =>
          prev === data.thread.accountEmail ? prev : data.thread.accountEmail,
        );
        threadAccountRef.current = data.thread.accountEmail;
        if (userId) {
          await upsertEmailThreadDetail(userId, data);
        }
        setThreads((prev) =>
          prev.map((t) =>
            t.id === threadId ? { ...t, unread: false } : t,
          ),
        );
      } catch (err) {
        if (!hasCached) {
          setDetail(null);
          setDetailError(
            err instanceof Error ? err.message : "Failed to load thread",
          );
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [userId],
  );

  const runEmailSync = useCallback(async () => {
    if (!(userId && navigator.onLine)) return;
    setListRefreshing(true);
    setSyncError(null);
    setListError(null);
    try {
      const res = await fetch("/api/email/sync", { method: "POST" });
      const data = (await res.json()) as {
        status?: string;
        message?: string;
        errors?: string[];
        synced?: number;
      };
      if (!res.ok) {
        throw new Error(data.message ?? `Sync failed (${res.status})`);
      }
      const errText =
        data.errors?.join("; ") ??
        (data.status === "error" ? data.message : undefined);
      if (errText && (data.synced ?? 0) === 0) {
        throw new Error(errText);
      }
      if (errText) {
        setSyncError(errText);
      }
      await hydrateEmailMirrorFromServer(userId);
      await refreshLastSyncedAt();
      await loadThreads({ silent: true, fetchNetwork: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Email sync failed";
      setSyncError(message);
      setListError(message);
    } finally {
      setListRefreshing(false);
    }
  }, [loadThreads, refreshLastSyncedAt, userId]);

  const loadContext = useCallback(
    async (thread: EmailThreadDetail, signal?: AbortSignal) => {
      setContextLoading(true);
      try {
        const last = thread.messages.at(-1);
        const res = await fetch("/api/email/context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: thread.thread.subject,
            participants: thread.thread.participants,
            bodyExcerpt: last?.body ?? thread.thread.snippet,
            threadIntent: thread.thread.threadIntent,
            streams: thread.thread.streams,
          }),
          signal,
        });
        if (res.ok && !signal?.aborted) {
          setContext((await res.json()) as EmailThreadContext);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        if (!signal?.aborted) setContextLoading(false);
      }
    },
    [],
  );

  const patchThread = useCallback(
    async (
      threadId: string,
      patch: Record<string, unknown>,
      accountEmail?: string,
    ) => {
      await fetch(`/api/email/threads/${encodeURIComponent(threadId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountEmail, ...patch }),
      });
    },
    [],
  );

  const toggleAccountVisibility = async (email: string, visible: boolean) => {
    setAccounts((prev) =>
      prev.map((a) =>
        a.email.toLowerCase() === email.toLowerCase() ? { ...a, visible } : a,
      ),
    );
    await fetch("/api/email/visibility", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, visible }),
    });
    loadThreads({ silent: true }).catch(() => undefined);
  };

  const persistAccountsExpanded = async (expanded: boolean) => {
    setAccountsExpanded(expanded);
    await fetch("/api/email/visibility", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountsExpanded: expanded }),
    });
  };

  const assignStream = async (stream: string, createIfMissing = false) => {
    if (!(selectedId && stream.trim())) return;
    setAssigningStream(true);
    try {
      const res = await fetch("/api/email/streams/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: selectedId,
          accountEmail: selectedAccount,
          stream: stream.trim(),
          createIfMissing,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { streams: string[] };
        setDetail((d) =>
          d
            ? {
                ...d,
                thread: { ...d.thread, streams: data.streams ?? d.thread.streams },
              }
            : d,
        );
        setNewStreamName("");
        await loadBoardStreams();
      }
    } finally {
      setAssigningStream(false);
    }
  };

  useEffect(() => {
    loadAccounts().catch(() => undefined);
    loadBoardStreams().catch(() => undefined);
    refreshLastSyncedAt().catch(() => undefined);
  }, [loadAccounts, loadBoardStreams, refreshLastSyncedAt]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(searchQuery),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  useEffect(() => {
    loadThreads({ fetchNetwork: navigator.onLine }).catch(() => undefined);
  }, [debouncedSearch, filter, loadThreads, streamFilter, userId]);

  useEffect(() => {
    if (mirrorVersion === 0) {
      return;
    }
    refreshLastSyncedAt().catch(() => undefined);
    setSyncError(null);
    loadThreads({ silent: true, fetchNetwork: false }).catch(() => undefined);
  }, [loadThreads, mirrorVersion, refreshLastSyncedAt]);

  useEffect(() => {
    if (!mobileContextOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileContextOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileContextOpen]);

  useEffect(() => {
    if (initialThreadId) setSelectedId(initialThreadId);
  }, [initialThreadId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setContext(null);
      return;
    }
    onThreadIdChange?.(selectedId);
    loadThread(
      selectedId,
      threadAccountRef.current ?? selectedAccount ?? undefined,
    ).catch(() => undefined);
  }, [selectedId, loadThread, onThreadIdChange]);

  useEffect(() => {
    if (!detail) return;
    const ac = new AbortController();
    setReplyBody("");
    setSendError(null);
    loadContext(detail, ac.signal).catch(() => undefined);
    return () => ac.abort();
  }, [detail?.thread.id, detail, loadContext]);

  const lastMessage = detail?.messages.at(-1);

  const replyRecipients = useMemo(() => {
    if (!(lastMessage && userEmail)) return [] as string[];
    const all = [lastMessage.from, ...lastMessage.to, ...lastMessage.cc].filter(
      Boolean,
    );
    return [...new Set(all)].filter(
      (e) => e.toLowerCase() !== userEmail.toLowerCase(),
    );
  }, [lastMessage, userEmail]);

  const accountColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts) {
      map.set(a.email.toLowerCase(), a.color);
    }
    return map;
  }, [accounts]);

  const sendReply = async () => {
    if (!(detail && replyBody.trim())) return;
    setSending(true);
    setSendError(null);
    try {
      const subject = detail.thread.subject.startsWith("Re:")
        ? detail.thread.subject
        : `Re: ${detail.thread.subject}`;
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: replyRecipients,
          subject,
          body: replyBody.trim(),
          threadId: detail.thread.id,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      setReplyBody("");
      await loadThread(detail.thread.id, detail.thread.accountEmail);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const focusCompose = () => {
    composeRef.current?.focus();
  };

  const requestAgentDraft = async () => {
    if (!detail) return;
    setAgentDraftLoading(true);
    setSendError(null);
    try {
      const res = await fetch("/api/email/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: detail.thread.subject,
          persona,
          messages: detail.messages.map((msg) => ({
            from: msg.from,
            body: msg.body,
            isMine: msg.isMine,
          })),
        }),
      });
      const data = (await res.json()) as { draft?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Could not generate draft");
      }
      setReplyBody(data.draft ?? "");
      composeRef.current?.focus();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Draft failed");
    } finally {
      setAgentDraftLoading(false);
    }
  };

  const startForwardDraft = () => {
    if (!detail) return;
    const last = detail.messages.at(-1);
    setReplyBody(
      `\n\n---------- Forwarded message ----------\nFrom: ${last?.from ?? ""}\nSubject: ${detail.thread.subject}\nDate: ${formatMessageDate(last?.date ?? null)}\n\n${last?.body ?? ""}`,
    );
    composeRef.current?.focus();
  };

  const handleListScroll = () => {
    const el = listRef.current;
    if (!el || loadingMore || !nextCursor) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
      loadThreads({ append: true, cursor: nextCursor }).catch(() => undefined);
    }
  };

  const handleArchive = async (
    e: React.MouseEvent,
    thread: EmailThreadListItem,
  ) => {
    e.stopPropagation();
    await patchThread(thread.id, { isArchived: true }, thread.accountEmail);
    setThreads((prev) => prev.filter((t) => t.id !== thread.id));
    if (selectedId === thread.id) {
      setSelectedId(null);
      setDetail(null);
    }
  };

  const handleToggleTracking = async (
    e: React.MouseEvent,
    thread: EmailThreadListItem,
  ) => {
    e.stopPropagation();
    const next = !thread.tracking;
    await patchThread(
      thread.id,
      { isTracking: next },
      thread.accountEmail,
    );
    setThreads((prev) =>
      prev.map((t) => (t.id === thread.id ? { ...t, tracking: next } : t)),
    );
  };

  const handleReplyFromList = (
    e: React.MouseEvent,
    thread: EmailThreadListItem,
  ) => {
    e.stopPropagation();
    setSelectedId(thread.id);
    threadAccountRef.current = thread.accountEmail;
    setSelectedAccount(thread.accountEmail);
  };

  const handleForwardFromList = (
    e: React.MouseEvent,
    thread: EmailThreadListItem,
  ) => {
    e.stopPropagation();
    setSelectedId(thread.id);
    threadAccountRef.current = thread.accountEmail;
    setSelectedAccount(thread.accountEmail);
    setReplyBody(
      `\n\n---------- Forwarded message ----------\n${thread.subject}\n`,
    );
  };

  const handleNewMessage = () => {
    setSelectedId(null);
    setSelectedAccount(null);
    setDetail(null);
    setReplyBody("");
    onThreadIdChange?.(null);
    window.requestAnimationFrame(() => composeRef.current?.focus());
  };

  const leftRailContent = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 space-y-4 p-4 pb-2">
              {tabBar}

              <Button
                className="h-9 w-full rounded-xl bg-white/95 font-medium text-black text-xs hover:bg-white"
                onClick={handleNewMessage}
                type="button"
              >
                <PlusIcon className="mr-1.5 h-3.5 w-3.5" />
                New Message
              </Button>

              {accounts.length > 0 ? (
                <CollapsibleSidebarSection
                  defaultOpen={accountsExpanded}
                  onOpenChange={(open) => {
                    void persistAccountsExpanded(open);
                  }}
                  title="Accounts"
                >
                  <div className="max-h-36 space-y-1.5 overflow-y-auto">
                    {accounts.map((account) => (
                      <div
                        className="flex items-center justify-between gap-2 py-0.5"
                        key={account.id}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <button
                            aria-label={
                              account.visible ? "Hide account" : "Show account"
                            }
                            className="h-3.5 w-3.5 flex-shrink-0 rounded transition-opacity"
                            onClick={() => {
                              toggleAccountVisibility(
                                account.email,
                                !account.visible,
                              ).catch(() => undefined);
                            }}
                            style={{
                              backgroundColor: account.color,
                              opacity: account.visible ? 1 : 0.25,
                            }}
                            type="button"
                          />
                          <span className="truncate text-[11px] text-white/50">
                            {account.label}
                            <span className="ml-1 text-white/25">
                              ({friendlyAccountName(account.email)})
                            </span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleSidebarSection>
              ) : null}

              <div className="flex items-center gap-1">
                <div className="flex flex-1 gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
                  {FILTER_TABS.map(({ id, label, icon: Icon }) => (
                    <button
                      className={cn(
                        "flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[9px] transition-colors",
                        filter === id
                          ? "bg-white/[0.08] text-white/75"
                          : "text-white/35 hover:text-white/50",
                      )}
                      key={id}
                      onClick={() => setFilter(id)}
                      title={label}
                      type="button"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  aria-label="Refresh mail"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/45 hover:bg-white/[0.06] hover:text-white/65 disabled:opacity-50"
                  disabled={listRefreshing}
                  onClick={() => {
                    void runEmailSync();
                  }}
                  title={
                    syncError ??
                    (listRefreshing
                      ? "Syncing…"
                      : lastSyncedAt
                        ? "Refresh mail"
                        : "Refresh mail")
                  }
                  type="button"
                >
                  <RefreshCwIcon
                    className={cn(
                      "h-3.5 w-3.5",
                      listRefreshing && "animate-spin",
                    )}
                  />
                </button>
              </div>

              <CollapsibleSidebarSection defaultOpen={false} title="Search">
                <div className="space-y-2">
                  <div className="relative">
                    <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 h-3 w-3 -translate-y-1/2 text-white/25" />
                    <input
                      aria-busy={searchQuery !== debouncedSearch}
                      className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] pr-8 pl-8 text-[11px] text-white/70 outline-none placeholder:text-white/25 focus:border-white/[0.14]"
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter mail…"
                      value={searchQuery}
                    />
                    {searchQuery ? (
                      <button
                        aria-label="Clear search"
                        className="absolute top-1/2 right-2 -translate-y-1/2 text-white/30 hover:text-white/55"
                        onClick={() => setSearchQuery("")}
                        type="button"
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>

                  {boardStreams.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {boardStreams.map((stream) => {
                        const active = streamFilter === stream;
                        return (
                          <button
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[9px] transition-colors",
                              active
                                ? "border-white/20 bg-white/10 text-white/75"
                                : "border-white/[0.06] text-white/35 hover:text-white/55",
                            )}
                            key={stream}
                            onClick={() =>
                              setStreamFilter(active ? null : stream)
                            }
                            type="button"
                          >
                            {stream}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </CollapsibleSidebarSection>
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto"
              onScroll={handleListScroll}
              ref={listRef}
            >
            {listLoading && threads.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-12 text-[11px] text-white/30">
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </div>
            ) : threads.length === 0 ? (
              listError || syncError ? (
                <div className="space-y-2 px-3 py-8 text-center text-[11px] text-amber-400/80">
                  <p>{listError ?? syncError}</p>
                  {(listError ?? syncError ?? "").includes("Gmail") ||
                  (listError ?? syncError ?? "").includes("gmail") ? (
                    <a
                      className="inline-block text-[10px] text-amber-300/90 underline underline-offset-2 hover:text-amber-200"
                      href="/settings"
                    >
                      Reconnect Google in Settings
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="px-3 py-8 text-center text-[11px] text-white/30">
                  No mail yet. Tap refresh to sync from Gmail or IMAP.
                </p>
              )
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {threads.map((thread) => {
                  const active = selectedId === thread.id;
                  return (
                    <li key={`${thread.id}-${thread.accountEmail}`}>
                      <div
                        className={cn(
                          "group w-full px-3 py-3 text-left transition-colors",
                          active
                            ? "bg-white/[0.06]"
                            : "hover:bg-white/[0.03]",
                          thread.unread && !active && "bg-white/[0.02]",
                        )}
                        onClick={() => {
                          threadAccountRef.current = thread.accountEmail;
                          setSelectedId(thread.id);
                          setSelectedAccount(thread.accountEmail);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            threadAccountRef.current = thread.accountEmail;
                            setSelectedId(thread.id);
                            setSelectedAccount(thread.accountEmail);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "truncate text-[11px]",
                                thread.unread
                                  ? "font-semibold text-white/85"
                                  : "text-white/50",
                              )}
                            >
                              {thread.sender}
                            </p>
                            <p
                              className={cn(
                                "mt-0.5 truncate text-[11px]",
                                thread.unread
                                  ? "font-medium text-white/75"
                                  : "text-white/45",
                              )}
                            >
                              {thread.subject}
                            </p>
                            {thread.aiSummary ? (
                              <p className="mt-1 line-clamp-2 text-[10px] text-white/30 leading-relaxed">
                                {thread.aiSummary}
                              </p>
                            ) : null}
                          </div>
                          <span className="shrink-0 text-[10px] text-white/25">
                            {formatThreadDate(thread.date)}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <button
                            className="rounded p-1 text-white/35 hover:bg-white/[0.06] hover:text-white/60"
                            onClick={(e) => handleArchive(e, thread)}
                            title="Archive"
                            type="button"
                          >
                            <ArchiveIcon className="h-3 w-3" />
                          </button>
                          <button
                            className="rounded p-1 text-white/35 hover:bg-white/[0.06] hover:text-white/60"
                            onClick={(e) => handleReplyFromList(e, thread)}
                            title="Reply"
                            type="button"
                          >
                            <ReplyIcon className="h-3 w-3" />
                          </button>
                          <button
                            className="rounded p-1 text-white/35 hover:bg-white/[0.06] hover:text-white/60"
                            onClick={(e) => handleForwardFromList(e, thread)}
                            title="Forward"
                            type="button"
                          >
                            <ForwardIcon className="h-3 w-3" />
                          </button>
                          <button
                            className={cn(
                              "rounded p-1 hover:bg-white/[0.06]",
                              thread.tracking
                                ? "text-sky-400/80"
                                : "text-white/35 hover:text-white/60",
                            )}
                            onClick={(e) => handleToggleTracking(e, thread)}
                            title="Track"
                            type="button"
                          >
                            <EyeIcon className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {loadingMore ? (
              <div className="flex justify-center py-3 text-[10px] text-white/30">
                <Loader2Icon className="h-3 w-3 animate-spin" />
              </div>
            ) : null}
            </div>
            {sidebarFooter}
          </div>
  );

  const centerColumnContent = (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
          {selectedId && detail && !detailLoading && !detailError ? (
            <div className="shrink-0 border-white/[0.06] border-b px-4 py-3 md:px-5">
              <div className="flex items-start gap-2">
                <button
                  aria-label="Back to inbox"
                  className="mt-0.5 shrink-0 rounded-md p-1 text-white/45 hover:bg-white/[0.06] hover:text-white/70 lg:hidden"
                  onClick={() => {
                    setSelectedId(null);
                    setMobileContextOpen(false);
                    onThreadIdChange?.(null);
                  }}
                  type="button"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-sm text-white/85">
                    {detail.thread.subject}
                  </h2>
                  <p className="mt-1 text-[10px] text-white/35">
                    {detail.thread.participants.join(" · ")}
                  </p>
                </div>
                <button
                  className="shrink-0 rounded-md border border-white/[0.08] px-2 py-1 text-[10px] text-white/50 hover:bg-white/[0.04] lg:hidden"
                  onClick={() => setMobileContextOpen(true)}
                  type="button"
                >
                  Context
                </button>
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {selectedId ? (
              detailLoading && !detail ? (
                <div className="flex h-full items-center justify-center gap-2 text-[11px] text-white/30">
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                  Loading thread…
                </div>
              ) : detailError ? (
                <div className="flex h-full items-center justify-center p-6 text-center text-[11px] text-amber-400/80">
                  {detailError}
                </div>
              ) : detail ? (
                <div className="space-y-3 p-4 md:p-5">
                  {detail.messages.map((msg) => {
                    const mine = msg.isMine;
                    const bubbleColor =
                      accountColorMap.get(
                        detail.thread.accountEmail.toLowerCase(),
                      ) ?? "#4285F4";

                    return (
                      <div
                        className={cn(
                          "flex",
                          mine ? "justify-end" : "justify-start",
                        )}
                        key={msg.id}
                      >
                        <div
                          className={cn(
                            "max-w-[min(100%,36rem)] rounded-2xl px-4 py-3",
                            mine
                              ? "rounded-br-md text-white"
                              : "rounded-bl-md border border-white/[0.06] bg-white/[0.03] text-white/70",
                          )}
                          style={
                            mine
                              ? {
                                  backgroundColor: `${bubbleColor}33`,
                                  borderColor: `${bubbleColor}55`,
                                  borderWidth: 1,
                                }
                              : undefined
                          }
                        >
                          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-medium text-[11px]">
                              {msg.from || "Unknown"}
                            </span>
                            <span className="text-[10px] text-white/35">
                              {formatMessageDate(msg.date)}
                            </span>
                          </div>

                          {msg.aiSummary ? (
                            <div className="mb-2 space-y-1 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2 text-[10px]">
                              {msg.aiSummary.previousContext ? (
                                <p>
                                  <span className="text-white/40">Context: </span>
                                  {msg.aiSummary.previousContext}
                                </p>
                              ) : null}
                              <p>
                                <span className="text-white/40">Summary: </span>
                                {msg.aiSummary.summary}
                              </p>
                              {msg.aiSummary.actions.length > 0 ? (
                                <ul className="list-inside list-disc text-white/55">
                                  {msg.aiSummary.actions.map((a) => (
                                    <li key={`${a.action}-${a.owner}`}>
                                      {a.action}
                                      {a.owner ? ` (${a.owner})` : ""}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                              {msg.aiSummary.suggestedResponse ? (
                                <button
                                  className="text-left text-white/50 italic hover:text-white/70"
                                  onClick={() =>
                                    setReplyBody(msg.aiSummary!.suggestedResponse!)
                                  }
                                  type="button"
                                >
                                  Suggested: {msg.aiSummary.suggestedResponse}
                                </button>
                              ) : null}
                            </div>
                          ) : null}

                          <div className="whitespace-pre-wrap text-[12px] leading-relaxed">
                            {msg.body || "(empty message)"}
                          </div>

                          {msg.bodyOriginal ? (
                            <button
                              className="mt-2 inline-flex items-center gap-1 text-[10px] text-white/35 hover:text-white/55"
                              onClick={() => setOriginalMessage(msg)}
                              type="button"
                            >
                              <MailIcon className="h-3 w-3" />
                              View original
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null
            ) : null}
          </div>

          <div className="mt-auto min-w-0 max-w-full shrink-0 border-white/[0.06] border-t px-4 py-3">
            {replyRecipients.length > 0 ? (
              <p className="mb-2 text-[10px] text-white/30">
                Reply to {replyRecipients.join(", ")}
              </p>
            ) : null}
            <div className="liquid-glass-input flex min-w-0 max-w-full flex-col gap-2 rounded-xl px-3 py-2.5">
              <textarea
                className="min-h-[7.5rem] w-full min-w-0 max-w-full resize-none bg-transparent text-[13px] text-white/80 outline-none placeholder:text-white/25 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!detail || sending || agentDraftLoading}
                onChange={(e) => setReplyBody(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    (e.metaKey || e.ctrlKey) &&
                    e.key === "Enter" &&
                    !sending &&
                    !agentDraftLoading &&
                    replyBody.trim() &&
                    detail
                  ) {
                    e.preventDefault();
                    sendReply().catch(() => undefined);
                  }
                }}
                placeholder={
                  detail ? "Write a reply… (⌘↵ to send)" : undefined
                }
                ref={composeRef}
                rows={5}
                value={replyBody}
              />
              <div className="flex items-center justify-between gap-2">
                {sendError ? (
                  <p className="min-w-0 truncate text-[10px] text-amber-400/80">
                    {sendError}
                  </p>
                ) : (
                  <span className="min-w-0 flex-1" />
                )}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    aria-label="Draft reply"
                    className="rounded-lg p-1.5 text-white/45 hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-30"
                    disabled={!detail}
                    onClick={focusCompose}
                    title="Draft reply"
                    type="button"
                  >
                    <ReplyIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    aria-label={`Ask ${persona} to draft a reply`}
                    className="rounded-lg p-1.5 text-white/45 hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-30"
                    disabled={!detail || agentDraftLoading}
                    onClick={() => {
                      void requestAgentDraft();
                    }}
                    title={`Ask ${persona} to draft`}
                    type="button"
                  >
                    {agentDraftLoading ? (
                      <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <SparklesIcon className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    aria-label="Forward"
                    className="rounded-lg p-1.5 text-white/45 hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-30"
                    disabled={!detail}
                    onClick={startForwardDraft}
                    title="Forward"
                    type="button"
                  >
                    <ForwardIcon className="h-3.5 w-3.5" />
                  </button>
                  <Button
                    className="h-7 w-7 rounded-lg bg-blue-500/80 text-white hover:bg-blue-500 disabled:opacity-30"
                    disabled={
                      sending ||
                      agentDraftLoading ||
                      !replyBody.trim() ||
                      !detail
                    }
                    onClick={() => {
                      sendReply().catch(() => undefined);
                    }}
                    size="icon"
                    title="Send"
                  >
                    {sending ? (
                      <Loader2Icon className="h-3 w-3 animate-spin" />
                    ) : (
                      <SendIcon className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
    </div>
  );

  const rightRailContent = (
    <>
          {contextLoading && !context ? (
            <div className="flex items-center gap-2 py-6 text-[10px] text-white/30">
              <Loader2Icon className="h-3 w-3 animate-spin" />
              Loading context…
            </div>
          ) : !detail ? null : (
            <div className="space-y-3">
              <ContextSection title="Thread purpose">
                <p className="text-white/60 leading-relaxed">
                  {detail.thread.threadIntent ??
                    context?.threadIntent ??
                    context?.summary.text ??
                    "No intent captured yet."}
                </p>
              </ContextSection>

              <ContextSection
                empty="No contacts resolved."
                isEmpty={(context?.people.length ?? 0) === 0}
                title="Participants"
              >
                <ul className="space-y-2">
                  {(context?.people ?? []).map((p) => (
                    <li key={p.email}>
                      <p className="font-medium text-white/70">
                        {p.name ?? p.email}
                      </p>
                      {p.company ? (
                        <p className="text-[10px] text-white/35">{p.company}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </ContextSection>

              <ContextSection
                empty="No companies linked."
                isEmpty={(context?.companies.length ?? 0) === 0}
                title="Companies"
              >
                <ul className="space-y-2">
                  {(context?.companies ?? []).map((c) => (
                    <li key={c.id ?? c.name}>
                      <p className="font-medium text-white/70">{c.name}</p>
                      {c.somaUrl ? (
                        <a
                          className="inline-flex items-center gap-1 text-[10px] text-white/40 hover:text-white/60"
                          href={c.somaUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open in Soma
                          <ExternalLinkIcon className="h-2.5 w-2.5" />
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </ContextSection>

              <ContextSection
                empty="No streams assigned."
                isEmpty={(detail.thread.streams.length ?? 0) === 0}
                title="Flightdeck streams"
              >
                <ul className="mb-2 space-y-1">
                  {detail.thread.streams.map((s) => (
                    <li
                      className="flex items-center gap-1.5 text-white/65"
                      key={s}
                    >
                      <LayoutDashboardIcon className="h-3 w-3 text-white/30" />
                      {s}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-1">
                  {boardStreams
                    .filter((s) => !detail.thread.streams.includes(s))
                    .slice(0, 8)
                    .map((stream) => (
                      <button
                        className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[9px] text-white/45 hover:bg-white/[0.04]"
                        disabled={assigningStream}
                        key={stream}
                        onClick={() => assignStream(stream)}
                        type="button"
                      >
                        + {stream}
                      </button>
                    ))}
                </div>
                <div className="mt-2 flex gap-1">
                  <input
                    className="h-7 min-w-0 flex-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 text-[10px] text-white/70 outline-none"
                    onChange={(e) => setNewStreamName(e.target.value)}
                    placeholder="New stream…"
                    value={newStreamName}
                  />
                  <button
                    className="flex h-7 items-center gap-0.5 rounded-md border border-white/[0.08] px-2 text-[10px] text-white/50 hover:bg-white/[0.04] disabled:opacity-50"
                    disabled={assigningStream || !newStreamName.trim()}
                    onClick={() => assignStream(newStreamName, true)}
                    type="button"
                  >
                    <PlusIcon className="h-3 w-3" />
                    Create
                  </button>
                </div>
              </ContextSection>

              <ContextSection
                empty={
                  context?.errors.flightdeck ??
                  "No Flightdeck tasks matched this thread."
                }
                isEmpty={(context?.tasks.length ?? 0) === 0}
                title="Related tasks"
              >
                <ul className="space-y-2">
                  {(context?.tasks ?? []).map((t) => (
                    <li key={t.id}>
                      <div className="flex items-start gap-1.5">
                        <LayoutDashboardIcon className="mt-0.5 h-3 w-3 shrink-0 text-white/30" />
                        <div className="min-w-0">
                          <p className="truncate text-white/65">{t.title}</p>
                          <p className="text-[10px] text-white/30">
                            {[t.status, t.stream].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </ContextSection>
            </div>
          )}
    </>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="hidden min-h-0 w-full min-w-0 flex-1 overflow-hidden lg:flex">
        <ThreeColumnLayout
          center={
            <main className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-white/[0.06]">
              {centerColumnContent}
            </main>
          }
          layoutId="email"
          left={leftRailContent}
          right={
            <div className="min-h-0 overflow-y-auto p-3 md:p-4">
              {rightRailContent}
            </div>
          }
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:hidden">
        {/* Left column — thread list */}
        <aside
          className={cn(
            "flex min-h-0 flex-col border-white/[0.06] border-b",
            selectedId && "hidden",
          )}
        >
          {leftRailContent}
        </aside>

        {/* Center — thread + compose */}
        <main
          className={cn(
            "flex min-h-0 min-w-0 flex-col border-white/[0.06] border-b",
            !selectedId && "hidden",
          )}
        >
          {centerColumnContent}
        </main>

        {/* Right context rail */}
        {mobileContextOpen ? (
          <button
            aria-label="Close context panel"
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setMobileContextOpen(false)}
            type="button"
          />
        ) : null}
        <aside
          className={cn(
            "min-h-0 flex-col overflow-y-auto p-3 md:p-4",
            mobileContextOpen
              ? "fixed inset-y-0 right-0 z-50 flex w-full max-w-sm border-white/[0.08] border-l bg-[#0a0a0a] shadow-2xl"
              : "hidden",
          )}
        >
          {mobileContextOpen ? (
            <div className="mb-3 flex items-center justify-between">
              <span className="font-semibold text-[11px] text-white/60 uppercase tracking-wider">
                Context
              </span>
              <button
                className="rounded p-1 text-white/40 hover:bg-white/[0.06]"
                onClick={() => setMobileContextOpen(false)}
                type="button"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          {rightRailContent}
        </aside>
      </div>

      {originalMessage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOriginalMessage(null);
          }}
          role="presentation"
        >
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/10 bg-[#0a0a0a] p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-sm text-white/85">
                Original message
              </h3>
              <button
                className="rounded p-1 text-white/40 hover:bg-white/[0.06] hover:text-white/70"
                onClick={() => setOriginalMessage(null)}
                type="button"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="whitespace-pre-wrap text-[12px] text-white/60 leading-relaxed">
              {originalMessage.bodyOriginal ?? originalMessage.body}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
