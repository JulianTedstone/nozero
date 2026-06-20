"use client";

import { format } from "date-fns";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FilePlusIcon,
  InboxIcon,
  MessageSquareIcon,
  PackageIcon,
  SaveIcon,
} from "lucide-react";
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CollapsibleSidebarSection } from "@/components/collapsible-sidebar-section";
import {
  ConversationDetail,
  ConversationRelated,
} from "@/components/conversation-detail";
import {
  type EventContextNavigation,
  EventContextPanel,
} from "@/components/event-context-panel";
import { ThreeColumnLayout } from "@/components/three-column-layout";
import {
  githubRepoUrl,
  inferBindingsForEmail,
  reposForStream,
} from "@/lib/context-accounts";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types/calendar";
import type { ConnectedBundle } from "@/types/context-connected";
import type { ContextFocus } from "@/types/context-focus";
import type {
  IngestAction,
  IngestConversation,
  IngestGroups,
  IngestItemSummary,
  IngestSection,
} from "@/types/ingest";
import type { StreamBinding } from "@/types/streams";

type FileTreeNode =
  | { kind: "folder"; name: string; path: string; children: FileTreeNode[] }
  | { kind: "file"; name: string; path: string };

function buildFileTree(paths: string[]): FileTreeNode[] {
  const insert = (
    nodes: FileTreeNode[],
    parts: string[],
    fullPath: string,
    prefix: string,
  ) => {
    const [head, ...rest] = parts;
    if (!head) {
      return;
    }
    if (rest.length === 0) {
      nodes.push({ kind: "file", name: head, path: fullPath });
      return;
    }
    const folderPath = prefix ? `${prefix}/${head}` : head;
    let folder = nodes.find(
      (node): node is Extract<FileTreeNode, { kind: "folder" }> =>
        node.kind === "folder" && node.name === head,
    );
    if (!folder) {
      folder = { kind: "folder", name: head, path: folderPath, children: [] };
      nodes.push(folder);
    }
    insert(folder.children, rest, fullPath, folderPath);
  };

  const roots: FileTreeNode[] = [];
  for (const path of [...paths].sort()) {
    insert(roots, path.split("/"), path, "");
  }
  return roots;
}

function repoKeyFor(stream: string, fullName: string): string {
  return `${stream}::${fullName}`;
}

/**
 * useState that persists to localStorage. Loads after mount (not in the
 * initializer) so server and first client render match — no hydration mismatch.
 */
function usePersistedState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(initial);
  const ready = useRef(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) setState(JSON.parse(raw) as T);
    } catch {
      // ignore corrupt/blocked storage
    }
    ready.current = true;
  }, [key]);
  useEffect(() => {
    if (!ready.current) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // ignore quota/private-mode errors
    }
  }, [key, state]);
  return [state, setState];
}

function FileTreeList({
  activePath,
  depth,
  nodes,
  onSelectFile,
  onToggleFolder,
  openFolders,
}: {
  nodes: FileTreeNode[];
  depth: number;
  activePath: string | null;
  openFolders: Record<string, boolean>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === "folder") {
          const expanded = openFolders[node.path] ?? depth < 1;
          return (
            <div key={node.path}>
              <button
                className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-[10px] text-ink-muted hover:bg-surface-sunk"
                onClick={() => onToggleFolder(node.path)}
                style={{ paddingLeft: 8 + depth * 10 }}
                type="button"
              >
                {expanded ? (
                  <ChevronDownIcon className="h-3 w-3 shrink-0" />
                ) : (
                  <ChevronRightIcon className="h-3 w-3 shrink-0" />
                )}
                <span className="truncate">{node.name}</span>
              </button>
              {expanded ? (
                <FileTreeList
                  activePath={activePath}
                  depth={depth + 1}
                  nodes={node.children}
                  onSelectFile={onSelectFile}
                  onToggleFolder={onToggleFolder}
                  openFolders={openFolders}
                />
              ) : null}
            </div>
          );
        }
        return (
          <button
            className={cn(
              "block w-full truncate rounded px-2 py-1 text-left text-[10px]",
              activePath === node.path
                ? "bg-accent text-ink"
                : "text-ink-subtle hover:bg-surface-sunk"
            )}
            key={node.path}
            onClick={() => onSelectFile(node.path)}
            style={{ paddingLeft: 20 + depth * 10 }}
            type="button"
          >
            {node.name}
          </button>
        );
      })}
    </>
  );
}

interface ContextViewProps {
  focus: ContextFocus;
  navigation: EventContextNavigation;
  onFocusChange: (focus: ContextFocus) => void;
  recentMeetings?: CalendarEvent[];
  sidebarFooter?: ReactNode;
  tabBar?: ReactNode;
  userEmail?: string;
}

export function ContextView({
  focus,
  userEmail,
  recentMeetings = [],
  onFocusChange,
  navigation,
  sidebarFooter,
  tabBar,
}: ContextViewProps) {
  const bindings = userEmail ? inferBindingsForEmail(userEmail) : [];
  const bindingStreams = [...new Set(bindings.flatMap((b) => b.streams))];
  const [selectedStream, setSelectedStream] = useState<string | null>(
    bindingStreams[0] ?? null
  );
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [openStreams, setOpenStreams] = usePersistedState<
    Record<string, boolean>
  >("nozero:ctx:openStreams", {});
  const [openRepos, setOpenRepos] = usePersistedState<Record<string, boolean>>(
    "nozero:ctx:openRepos",
    {},
  );
  const [openFolders, setOpenFolders] = usePersistedState<
    Record<string, boolean>
  >("nozero:ctx:openFolders", {});
  const [workspace, setWorkspace] = useState<{
    streams: Record<
      string,
      {
        summary: string;
        files: Array<{ path: string; content: string; updatedAt: string }>;
        updatedAt: string;
      }
    >;
    updates: Array<{
      stream: string;
      path: string;
      action: string;
      at: string;
    }>;
  } | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [newFilePath, setNewFilePath] = useState("");
  const [editorValue, setEditorValue] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState<ConnectedBundle | null>(null);
  const [connectedLoading, setConnectedLoading] = useState(false);

  // Repo-backed file tree (real GitHub files), keyed by repo full name.
  const [repoTrees, setRepoTrees] = useState<Record<string, string[]>>({});
  const [treeLoading, setTreeLoading] = useState<Record<string, boolean>>({});
  const [treeError, setTreeError] = useState<Record<string, string | null>>({});
  const [fileSha, setFileSha] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  // Paths added in-session that don't exist in the repo yet (commit on save).
  const [newPaths, setNewPaths] = useState<Set<string>>(() => new Set());

  // Ingest inbox (Conversations / Messaging / Drops) — routed pipeline output.
  const [ingestGroups, setIngestGroups] = useState<IngestGroups | null>(null);
  const [ingestOpen, setIngestOpen] = usePersistedState<
    Record<IngestSection, boolean>
  >("nozero:ctx:ingestOpen", {
    conversations: true,
    messaging: false,
    drops: false,
  });
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [conversation, setConversation] = useState<IngestConversation | null>(
    null,
  );
  const [conversationLoading, setConversationLoading] = useState(false);
  const [routeBusy, setRouteBusy] = useState(false);
  const [streamBindings, setStreamBindings] = useState<StreamBinding[]>([]);
  const [contextRepos, setContextRepos] = useState<string[]>([]);
  const [routeStream, setRouteStream] = useState<string | null>(null);

  const loadRepoTree = useCallback(
    async (repoFullName: string, force = false) => {
      if (!force && repoTrees[repoFullName]) {
        return;
      }
      setTreeLoading((prev) => ({ ...prev, [repoFullName]: true }));
      setTreeError((prev) => ({ ...prev, [repoFullName]: null }));
      try {
        const res = await fetch(
          `/api/context/repo/tree?repo=${encodeURIComponent(repoFullName)}`,
        );
        const data = await res.json();
        if (res.ok) {
          setRepoTrees((prev) => ({
            ...prev,
            [repoFullName]: (data.paths as string[]) ?? [],
          }));
        } else {
          setTreeError((prev) => ({
            ...prev,
            [repoFullName]: data.error ?? "Could not load files",
          }));
        }
      } catch {
        setTreeError((prev) => ({
          ...prev,
          [repoFullName]: "Could not load files",
        }));
      } finally {
        setTreeLoading((prev) => ({ ...prev, [repoFullName]: false }));
      }
    },
    [repoTrees],
  );

  useEffect(() => {
    let active = true;
    fetch("/api/context/ingest")
      .then((r) => r.json())
      .then((d) => {
        if (active) setIngestGroups((d.groups as IngestGroups) ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/context/streams")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setStreamBindings((d.streams as StreamBinding[]) ?? []);
        setContextRepos((d.repos as string[]) ?? []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Default the stream to the one matching the proposed route; keep an explicit
  // pick. openConversation resets to null first, so a new conversation re-defaults.
  useEffect(() => {
    if (!conversation?.pending) {
      setRouteStream(null);
      return;
    }
    setRouteStream((prev) => {
      if (prev && streamBindings.some((s) => s.name === prev)) return prev;
      const match = streamBindings.find(
        (s) => `${s.repo}/${s.path}` === conversation.proposedRoute,
      );
      return match?.name ?? null;
    });
  }, [conversation, streamBindings]);

  const markIngestReadLocal = useCallback((id: string) => {
    setIngestGroups((prev) => {
      if (!prev) return prev;
      const mark = (items: IngestItemSummary[]) =>
        items.map((it) => (it.id === id ? { ...it, unread: false } : it));
      return {
        conversations: mark(prev.conversations),
        messaging: mark(prev.messaging),
        drops: mark(prev.drops),
      };
    });
  }, []);

  const openConversation = useCallback(
    async (item: IngestItemSummary) => {
      setSelectedConversationId(item.id);
      setActivePath(null);
      setConversation(null);
      setRouteStream(null);
      setConversationLoading(true);
      try {
        const res = await fetch(
          `/api/context/ingest?repo=${encodeURIComponent(item.repo)}&path=${encodeURIComponent(item.path)}`,
        );
        const d = await res.json();
        setConversation((d.conversation as IngestConversation) ?? null);
      } catch {
        setConversation(null);
      } finally {
        setConversationLoading(false);
      }
      if (item.unread) {
        markIngestReadLocal(item.id);
        fetch("/api/context/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id, read: true }),
        }).catch(() => undefined);
      }
    },
    [markIngestReadLocal],
  );

  const turnIntoTask = useCallback(
    async (action: IngestAction): Promise<boolean> => {
      const stream = routeStream ?? conversation?.defaultStream;
      if (!conversation || !stream) return false;
      try {
        const res = await fetch("/api/flightdeck/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: action.text,
            stream,
            owner: action.owner,
            body:
              `From conversation: ${conversation.title}\n` +
              (action.due ? `Due: ${action.due}\n` : "") +
              `Participants: ${conversation.participants
                .map((p) => p.name)
                .join(", ")}`,
          }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [conversation, routeStream],
  );

  const createStream = useCallback(
    async (binding: StreamBinding): Promise<boolean> => {
      try {
        const res = await fetch("/api/context/streams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(binding),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) return false;
        setStreamBindings((d.streams as StreamBinding[]) ?? []);
        setRouteStream(binding.name);
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const routeConversation = useCallback(async (): Promise<boolean> => {
    if (!conversation?.pending || !routeStream) return false;
    setRouteBusy(true);
    try {
      const res = await fetch("/api/context/ingest/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: conversation.path,
          stream: routeStream,
        }),
      });
      if (!res.ok) return false;
      // Filed out of staging — drop it from the inbox, return to the editor.
      setSelectedConversationId(null);
      setConversation(null);
      fetch("/api/context/ingest")
        .then((r) => r.json())
        .then((d) => setIngestGroups((d.groups as IngestGroups) ?? null))
        .catch(() => undefined);
      return true;
    } catch {
      return false;
    } finally {
      setRouteBusy(false);
    }
  }, [conversation, routeStream]);

  const streams = useMemo(() => {
    const fromWorkspace = Object.keys(workspace?.streams ?? {});
    return [...new Set([...bindingStreams, ...fromWorkspace])];
  }, [bindingStreams, workspace?.streams]);

  const selectedSummary = selectedStream
    ? (connected?.summary ??
      workspace?.streams[selectedStream]?.summary ??
      `Context for ${selectedStream}`)
    : "Select a stream to start.";

  const crm = connected?.sections?.crm ?? { participants: [], deals: [] };
  const tickets = connected?.sections?.tickets ?? [];
  const messages = connected?.sections?.messages ?? [];
  const connectedEvents = connected?.sections?.events ?? [];
  const streamEvents =
    connectedEvents.length > 0
      ? connectedEvents
      : recentMeetings.filter(
          (event) =>
            !selectedStream ||
            (event.flightdeckStream ?? "").toLowerCase() ===
              selectedStream.toLowerCase()
        );
  const workspaceUpdates = connected?.sections?.updates?.length
    ? connected.sections?.updates
    : (workspace?.updates ?? []).filter((update) =>
        selectedStream ? update.stream === selectedStream : true
      );

  useEffect(() => {
    if (!selectedStream && streams.length > 0) {
      setSelectedStream(streams[0]);
    }
  }, [selectedStream, streams]);

  useEffect(() => {
    if (!selectedStream) {
      return;
    }
    const streamRepos = reposForStream(selectedStream, bindings);
    if (
      streamRepos.length > 0 &&
      !streamRepos.some((repo) => repo.fullName === selectedRepo)
    ) {
      setSelectedRepo(streamRepos[0].fullName);
    }
  }, [bindings, selectedRepo, selectedStream]);

  useEffect(() => {
    fetch("/api/context/workspace")
      .then((res) => res.json())
      .then((data) => {
        setWorkspace(data.workspace ?? { streams: {}, updates: [] });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedStream) {
      setConnected(null);
      return;
    }
    const controller = new AbortController();
    setConnectedLoading(true);
    fetch("/api/context/connected", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        stream: selectedStream,
        path: activePath,
        repo: selectedRepo,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!controller.signal.aborted) {
          // Only store a well-formed bundle; an error or malformed response
          // (e.g. {error}) must not poison the section accessors.
          setConnected(
            data && typeof data === "object" && "sections" in data
              ? (data as ConnectedBundle)
              : null,
          );
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setConnected(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setConnectedLoading(false);
        }
      });
    return () => controller.abort();
  }, [activePath, selectedRepo, selectedStream]);

  useEffect(() => {
    if (selectedRepo) {
      void loadRepoTree(selectedRepo);
    }
  }, [selectedRepo, loadRepoTree]);

  useEffect(() => {
    if (!(activePath && selectedRepo)) {
      setEditorValue("");
      setFileSha(null);
      setDirty(false);
      return;
    }
    // A path added this session that isn't committed yet — start blank.
    if (newPaths.has(`${selectedRepo}::${activePath}`)) {
      return;
    }
    const controller = new AbortController();
    setFileLoading(true);
    setSaveError(null);
    fetch(
      `/api/context/repo/file?repo=${encodeURIComponent(selectedRepo)}&path=${encodeURIComponent(activePath)}`,
      { signal: controller.signal },
    )
      .then(async (res) => ({ ok: res.ok, data: await res.json() }))
      .then(({ ok, data }) => {
        if (controller.signal.aborted) {
          return;
        }
        if (ok) {
          setEditorValue(data.content ?? "");
          setFileSha(data.sha ?? null);
          setDirty(false);
        } else {
          setSaveError(data.error ?? "Could not load file");
          setEditorValue("");
          setFileSha(null);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) {
          setFileLoading(false);
        }
      });
    return () => controller.abort();
  }, [activePath, selectedRepo, newPaths]);

  const addFile = (path: string) => {
    const trimmedPath = path.trim();
    if (!(selectedRepo && trimmedPath)) {
      return;
    }
    const key = `${selectedRepo}::${trimmedPath}`;
    setNewPaths((prev) => new Set(prev).add(key));
    setRepoTrees((prev) => {
      const current = prev[selectedRepo] ?? [];
      if (current.includes(trimmedPath)) {
        return prev;
      }
      return {
        ...prev,
        [selectedRepo]: [...current, trimmedPath].sort((a, b) =>
          a.localeCompare(b),
        ),
      };
    });
    setActivePath(trimmedPath);
    setFileSha(null);
    setEditorValue("");
    setDirty(true);
    setSaveError(null);
    setNewFilePath("");
  };

  const saveFile = async () => {
    if (!(selectedRepo && activePath)) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/context/repo/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: selectedRepo,
          path: activePath,
          content: editorValue,
          sha: fileSha,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Save failed");
        return;
      }
      setFileSha(data.sha ?? null);
      setDirty(false);
      setNewPaths((prev) => {
        const next = new Set(prev);
        next.delete(`${selectedRepo}::${activePath}`);
        return next;
      });
    } finally {
      setSaving(false);
    }
  };

  if (focus.type === "meeting") {
    return (
      <EventContextPanel
        event={focus.event}
        navigation={navigation}
        onBack={() => onFocusChange({ type: "none" })}
        userEmail={userEmail}
      />
    );
  }

  const ingestSections: Array<{
    key: IngestSection;
    label: string;
    items: IngestItemSummary[];
    icon: typeof InboxIcon;
  }> = [
    {
      key: "conversations",
      label: "Conversations",
      items: ingestGroups?.conversations ?? [],
      icon: MessageSquareIcon,
    },
    {
      key: "messaging",
      label: "Messaging",
      items: ingestGroups?.messaging ?? [],
      icon: InboxIcon,
    },
    {
      key: "drops",
      label: "Drops",
      items: ingestGroups?.drops ?? [],
      icon: PackageIcon,
    },
  ];

  const streamsTree = (
    <>
      {tabBar ? (
        <div className="shrink-0 space-y-3 border-line border-b p-3">
          {tabBar}
        </div>
      ) : null}
      <div className="px-3 py-2">
        <h2 className="font-semibold text-[10px] text-ink-subtle uppercase tracking-wider">
          Streams
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {streams.map((stream) => {
          const selected = selectedStream === stream;
          const expanded = openStreams[stream] ?? selected;
          const streamRepos = reposForStream(stream, bindings);
          return (
            <div className="mb-1 rounded-lg" key={stream}>
              <button
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px]",
                  selected
                    ? "bg-accent text-ink"
                    : "text-ink-muted hover:bg-accent"
                )}
                onClick={() => {
                  setSelectedStream(stream);
                  setOpenStreams((prev) => ({
                    ...prev,
                    [stream]: !expanded,
                  }));
                }}
                type="button"
              >
                {expanded ? (
                  <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronRightIcon className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate">{stream}</span>
              </button>
              {expanded ? (
                <div className="mt-1 ml-3 space-y-1">
                  {streamRepos.map((repo) => {
                    const key = repoKeyFor(stream, repo.fullName);
                    const repoExpanded = openRepos[key] ?? selected;
                    const repoSelected =
                      selected && selectedRepo === repo.fullName;
                    const repoFileTree = buildFileTree(
                      repoTrees[repo.fullName] ?? [],
                    );
                    const isTreeLoading = treeLoading[repo.fullName];
                    const repoTreeError = treeError[repo.fullName];
                    return (
                      <div key={key}>
                        <button
                          className={cn(
                            "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[10px]",
                            repoSelected
                              ? "bg-accent text-ink"
                              : "text-ink-muted hover:bg-surface-sunk"
                          )}
                          onClick={() => {
                            setSelectedStream(stream);
                            setSelectedRepo(repo.fullName);
                            setOpenRepos((prev) => ({
                              ...prev,
                              [key]: !repoExpanded,
                            }));
                            void loadRepoTree(repo.fullName);
                          }}
                          type="button"
                        >
                          {repoExpanded ? (
                            <ChevronDownIcon className="h-3 w-3 shrink-0" />
                          ) : (
                            <ChevronRightIcon className="h-3 w-3 shrink-0" />
                          )}
                          <span className="truncate">{repo.name}</span>
                        </button>
                        {repoExpanded ? (
                          <div className="mt-0.5 ml-3 space-y-0.5">
                            {isTreeLoading && repoFileTree.length === 0 ? (
                              <p className="px-2 py-1 text-[10px] text-ink-subtle">
                                Loading files…
                              </p>
                            ) : repoTreeError ? (
                              <p className="px-2 py-1 text-[10px] text-destructive">
                                {repoTreeError}
                              </p>
                            ) : repoFileTree.length === 0 ? (
                              <p className="px-2 py-1 text-[10px] text-ink-subtle">
                                No files yet.
                              </p>
                            ) : null}
                            <FileTreeList
                              activePath={
                                selected && repoSelected ? activePath : null
                              }
                              depth={0}
                              nodes={repoFileTree}
                              onSelectFile={(path) => {
                                setSelectedStream(stream);
                                setSelectedRepo(repo.fullName);
                                setActivePath(path);
                                setSelectedConversationId(null);
                              }}
                              onToggleFolder={(path) =>
                                setOpenFolders((prev) => ({
                                  ...prev,
                                  [path]: !(prev[path] ?? true),
                                }))
                              }
                              openFolders={openFolders}
                            />
                            {selected && repoSelected ? (
                              <div className="flex items-center gap-1 px-1 pt-1">
                                <input
                                  className="h-6 min-w-0 flex-1 rounded border border-line bg-surface-sunk px-2 text-[10px] text-ink outline-none"
                                  onChange={(event) =>
                                    setNewFilePath(event.target.value)
                                  }
                                  placeholder="folder/file.md"
                                  value={newFilePath}
                                />
                                <button
                                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] text-ink-muted hover:bg-accent"
                                  onClick={() => {
                                    addFile(newFilePath);
                                  }}
                                  type="button"
                                >
                                  <FilePlusIcon className="h-3 w-3" />
                                  Add
                                </button>
                              </div>
                            ) : null}
                            <a
                              className="block truncate px-2 py-0.5 text-[9px] text-ink-subtle hover:text-ink-muted"
                              href={githubRepoUrl(repo.fullName)}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {repo.fullName}
                            </a>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
        <div className="mt-3 border-line border-t pt-2">
          <div className="flex items-center gap-1.5 px-2 pb-1">
            <InboxIcon className="h-3 w-3 text-ink-subtle" />
            <h2 className="font-semibold text-[10px] text-ink-subtle uppercase tracking-wider">
              Ingest
            </h2>
          </div>
          {ingestSections.map((section) => {
            const open = ingestOpen[section.key];
            const unread = section.items.filter((i) => i.unread).length;
            const SectionIcon = section.icon;
            return (
              <div className="mb-1" key={section.key}>
                <button
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] text-ink-muted hover:bg-accent"
                  onClick={() =>
                    setIngestOpen((prev) => ({
                      ...prev,
                      [section.key]: !prev[section.key],
                    }))
                  }
                  type="button"
                >
                  <span className="flex items-center gap-1.5">
                    {open ? (
                      <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <ChevronRightIcon className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <SectionIcon className="h-3 w-3 shrink-0 text-ink-subtle" />
                    {section.label}
                  </span>
                  {unread > 0 ? (
                    <span className="rounded-full bg-primary/15 px-1.5 font-medium text-[9px] text-primary">
                      {unread}
                    </span>
                  ) : section.items.length > 0 ? (
                    <span className="text-[9px] text-ink-subtle">
                      {section.items.length}
                    </span>
                  ) : null}
                </button>
                {open ? (
                  <div className="mt-1 ml-3 space-y-0.5">
                    {section.items.length === 0 ? (
                      <p className="px-2 py-1 text-[10px] text-ink-subtle">
                        Nothing yet.
                      </p>
                    ) : (
                      section.items.map((item) => {
                        const selected = selectedConversationId === item.id;
                        const clickable = item.section === "conversations";
                        return (
                          <button
                            className={cn(
                              "block w-full rounded px-2 py-1 text-left text-[10px]",
                              selected
                                ? "bg-accent text-ink"
                                : "text-ink-muted hover:bg-surface-sunk",
                              !clickable && "cursor-default",
                            )}
                            disabled={!clickable}
                            key={item.id}
                            onClick={() => {
                              if (clickable) openConversation(item);
                            }}
                            type="button"
                          >
                            <span className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 shrink-0 rounded-full",
                                  item.unread ? "bg-primary" : "bg-transparent",
                                )}
                              />
                              <span className="min-w-0 flex-1 truncate">
                                <span
                                  className={cn(
                                    item.unread && "font-medium text-ink",
                                  )}
                                >
                                  {item.title}
                                </span>
                              </span>
                              {item.pending && item.proposedSlug ? (
                                <span className="shrink-0 rounded bg-primary/15 px-1 font-medium text-[8px] text-primary uppercase">
                                  {item.proposedSlug}
                                </span>
                              ) : null}
                              {item.date ? (
                                <span className="shrink-0 text-[9px] text-ink-subtle">
                                  {item.date.slice(8, 10)}/{item.date.slice(5, 7)}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      {sidebarFooter ? (
        <div className="shrink-0 border-line border-t p-3">
          {sidebarFooter}
        </div>
      ) : null}
    </>
  );

  const editorPanel = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-line border-b px-3 py-2">
        <p className="min-w-0 truncate font-mono text-[11px] text-ink-muted">
          {activePath
            ? `${selectedRepo?.split("/")[1] ?? selectedStream ?? ""}/${activePath}${fileLoading ? " · loading…" : ""}`
            : "Select a file"}
        </p>
        <button
          className="inline-flex shrink-0 items-center gap-1 rounded border border-line px-2 py-1 text-[10px] text-ink-muted hover:bg-accent disabled:opacity-50"
          disabled={!(dirty && activePath && selectedRepo) || saving}
          onClick={() => {
            saveFile().catch(() => undefined);
          }}
          type="button"
        >
          <SaveIcon className="h-3 w-3" />
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <div className="relative min-h-0 flex-1 p-2">
        <textarea
          className="absolute inset-2 resize-none rounded-lg border border-line bg-black/25 p-3 font-mono text-[13px] text-ink leading-relaxed outline-none focus:border-line"
          onChange={(event) => {
            setEditorValue(event.target.value);
            setDirty(true);
          }}
          placeholder="Select a context file to edit…"
          value={editorValue}
        />
      </div>
      {saveError ? (
        <p className="shrink-0 px-3 pb-2 text-[10px] text-destructive">
          {saveError}
        </p>
      ) : null}
    </div>
  );

  const connectedRail = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 px-3 py-2">
        <h2 className="font-semibold text-[10px] text-ink-subtle uppercase tracking-wider">
          Connected
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <CollapsibleSidebarSection className="border-t-0 pt-0" title="Summary">
          <p className="text-[11px] text-ink-muted leading-relaxed">
            {connectedLoading ? "Loading…" : selectedSummary}
          </p>
        </CollapsibleSidebarSection>
        <CollapsibleSidebarSection title="Updates">
          <ul className="space-y-1">
            {workspaceUpdates
              .slice(0, 10)
              .map((update) => (
                <li
                  className="text-[10px] text-ink-muted"
                  key={`${update.stream}-${update.path}-${update.at}`}
                >
                  {update.action} · {update.path}
                </li>
              ))}
          </ul>
        </CollapsibleSidebarSection>
        <CollapsibleSidebarSection title="CRM">
          <div className="space-y-2">
            <ul className="space-y-1">
              {crm.participants.slice(0, 20).map((participant) => (
                <li
                  className="text-[10px] text-ink-muted"
                  key={participant.email}
                >
                  {participant.name ?? participant.email}
                  {participant.company ? ` · ${participant.company}` : ""}
                </li>
              ))}
            </ul>
            {crm.deals.length > 0 ? (
              <ul className="space-y-1">
                {crm.deals.slice(0, 10).map((deal) => (
                  <li className="text-[10px] text-ink-subtle" key={deal.name}>
                    {deal.name}
                    {deal.stage ? ` · ${deal.stage}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </CollapsibleSidebarSection>
        <CollapsibleSidebarSection title="Tickets">
          <ul className="space-y-1">
            {tickets.slice(0, 20).map((ticket) => (
              <li className="text-[10px] text-ink-muted" key={ticket.id}>
                {ticket.status ? `${ticket.status} · ` : ""}
                {ticket.title}
              </li>
            ))}
          </ul>
        </CollapsibleSidebarSection>
        <CollapsibleSidebarSection title="Messages">
          <ul className="space-y-1">
            {messages.slice(0, 20).map((message) => (
              <li className="text-[10px] text-ink-muted" key={message.id}>
                {message.sender} · {message.subject}
              </li>
            ))}
          </ul>
        </CollapsibleSidebarSection>
        {(connected?.sections?.slack.length ?? 0) > 0 ? (
          <CollapsibleSidebarSection title="Slack">
            <ul className="space-y-1">
              {(connected?.sections?.slack ?? []).slice(0, 12).map((item) => (
                <li className="text-[10px] text-ink-muted" key={item.id}>
                  {item.channelName ? `#${item.channelName} · ` : ""}
                  {item.text}
                </li>
              ))}
            </ul>
          </CollapsibleSidebarSection>
        ) : null}
        {(connected?.sections?.ctxHits.length ?? 0) > 0 ? (
          <CollapsibleSidebarSection title="Context">
            <ul className="space-y-1">
              {(connected?.sections?.ctxHits ?? []).slice(0, 10).map((hit) => (
                <li className="text-[10px] text-ink-muted" key={hit.id}>
                  {hit.title}
                </li>
              ))}
            </ul>
          </CollapsibleSidebarSection>
        ) : null}
        <CollapsibleSidebarSection title="Events">
          <ul className="space-y-1">
            {streamEvents.slice(0, 20).map((event) => (
              <li className="text-[10px] text-ink-muted" key={event.id}>
                <button
                  className="w-full text-left hover:text-ink"
                  onClick={() => onFocusChange({ type: "meeting", event })}
                  type="button"
                >
                  {event.title || "Untitled"}
                  {event.start
                    ? ` · ${format(new Date(event.start), "d MMM HH:mm")}`
                    : ""}
                </button>
              </li>
            ))}
          </ul>
        </CollapsibleSidebarSection>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col px-4 pt-3 pb-4 md:px-6 md:pt-4">
      <ThreeColumnLayout
        center={
          selectedConversationId ? (
            <ConversationDetail
              conversation={conversation}
              loading={conversationLoading}
              onCreateStream={createStream}
              onRoute={routeConversation}
              onSelectStream={setRouteStream}
              onTurnIntoTask={turnIntoTask}
              repos={contextRepos}
              routeBusy={routeBusy}
              selectedStream={routeStream}
              streams={streamBindings}
            />
          ) : (
            editorPanel
          )
        }
        className="min-h-0 flex-1"
        layoutId="context"
        left={
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {streamsTree}
          </div>
        }
        right={
          selectedConversationId ? (
            <ConversationRelated conversation={conversation} />
          ) : (
            connectedRail
          )
        }
      />
    </div>
  );
}
