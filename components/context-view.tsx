"use client";

import { format } from "date-fns";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FilePlusIcon,
  SaveIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ContextIcon } from "@/components/context-icon";
import {
  type EventContextNavigation,
  EventContextPanel,
} from "@/components/event-context-panel";
import { githubRepoUrl, inferBindingsForEmail } from "@/lib/context-accounts";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types/calendar";
import type { ContextFocus } from "@/types/context-focus";

interface ContextViewProps {
  focus: ContextFocus;
  navigation: EventContextNavigation;
  onFocusChange: (focus: ContextFocus) => void;
  recentMeetings?: CalendarEvent[];
  userEmail?: string;
}

export function ContextView({
  focus,
  userEmail,
  recentMeetings = [],
  onFocusChange,
  navigation,
}: ContextViewProps) {
  const bindings = userEmail ? inferBindingsForEmail(userEmail) : [];
  const repos = bindings.flatMap((b) => b.repos);
  const bindingStreams = [...new Set(bindings.flatMap((b) => b.streams))];
  const [selectedStream, setSelectedStream] = useState<string | null>(
    bindingStreams[0] ?? null
  );
  const [openStreams, setOpenStreams] = useState<Record<string, boolean>>({});
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
  const [rightSections, setRightSections] = useState<Record<string, boolean>>({
    updates: true,
    crm: true,
    tickets: true,
    repo: true,
    messages: true,
    events: true,
  });
  const [tickets, setTickets] = useState<
    Array<{ ref?: string; title: string; status: string }>
  >([]);
  const [messages, setMessages] = useState<
    Array<{ id: string; subject: string; sender: string }>
  >([]);
  const [crm, setCrm] = useState<{
    participants: Array<{
      email: string;
      name: string | null;
      company: string | null;
    }>;
    deals: Array<{ name: string; stage: string | null }>;
  }>({ participants: [], deals: [] });

  const streams = useMemo(() => {
    const fromWorkspace = Object.keys(workspace?.streams ?? {});
    return [...new Set([...bindingStreams, ...fromWorkspace])];
  }, [bindingStreams, workspace?.streams]);

  const selectedFiles = useMemo(
    () =>
      selectedStream ? (workspace?.streams[selectedStream]?.files ?? []) : [],
    [selectedStream, workspace?.streams]
  );

  const selectedSummary = selectedStream
    ? (workspace?.streams[selectedStream]?.summary ??
      `Context for ${selectedStream}`)
    : "Select a stream to start.";

  useEffect(() => {
    if (!selectedStream && streams.length > 0) {
      setSelectedStream(streams[0]);
    }
  }, [selectedStream, streams]);

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
      return;
    }
    fetch("/api/flightdeck/board")
      .then((res) => res.json())
      .then((data) => {
        const rows =
          (data.items as Array<{
            stream?: string;
            ref?: string;
            title: string;
            status: string;
          }>) ?? [];
        setTickets(
          rows
            .filter(
              (item) =>
                (item.stream ?? "").toLowerCase() ===
                selectedStream.toLowerCase()
            )
            .slice(0, 20)
            .map((item) => ({
              ref: item.ref,
              title: item.title,
              status: item.status,
            }))
        );
      })
      .catch(() => setTickets([]));

    fetch(
      `/api/email/threads?filter=all&limit=20&sync=false&stream=${encodeURIComponent(selectedStream)}`
    )
      .then((res) => res.json())
      .then((data) => {
        const rows =
          (data.threads as Array<{
            id: string;
            subject: string;
            sender: string;
          }>) ?? [];
        setMessages(rows.slice(0, 20));
      })
      .catch(() => setMessages([]));

    fetch("/api/context/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: selectedStream, participants: [] }),
    })
      .then((res) => res.json())
      .then((data) => {
        setCrm({
          participants: data.participants ?? [],
          deals: data.deals ?? [],
        });
      })
      .catch(() => setCrm({ participants: [], deals: [] }));
  }, [selectedStream]);

  useEffect(() => {
    const file = selectedFiles.find((entry) => entry.path === activePath);
    if (file) {
      setEditorValue(file.content);
      setDirty(false);
      setSaveError(null);
    } else if (!activePath && selectedFiles[0]) {
      setActivePath(selectedFiles[0].path);
    } else if (!file && activePath) {
      setActivePath(null);
      setEditorValue("");
      setDirty(false);
    }
  }, [activePath, selectedFiles]);

  const addFile = async (path: string) => {
    if (!(selectedStream && path.trim())) {
      return;
    }
    const trimmedPath = path.trim();
    const res = await fetch("/api/context/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stream: selectedStream,
        path: trimmedPath,
        content: "",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSaveError(data.error ?? "Could not create file");
      return;
    }
    setWorkspace(data.workspace);
    setOpenStreams((prev) => ({ ...prev, [selectedStream]: true }));
    setActivePath(trimmedPath);
    setNewFilePath("");
  };

  const saveFile = async () => {
    if (!(selectedStream && activePath)) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/context/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stream: selectedStream,
          path: activePath,
          content: editorValue,
          summary: workspace?.streams[selectedStream]?.summary ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Save failed");
        return;
      }
      setWorkspace(data.workspace);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const section = (key: string, title: string, body: React.ReactNode) => (
    <section className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
      <button
        className="flex w-full items-center justify-between px-3 py-2 text-left"
        onClick={() =>
          setRightSections((prev) => ({ ...prev, [key]: !prev[key] }))
        }
        type="button"
      >
        <span className="font-semibold text-[10px] text-white/35 uppercase tracking-wider">
          {title}
        </span>
        {rightSections[key] ? (
          <ChevronDownIcon className="h-3.5 w-3.5 text-white/40" />
        ) : (
          <ChevronRightIcon className="h-3.5 w-3.5 text-white/40" />
        )}
      </button>
      {rightSections[key] ? <div className="px-3 pb-3">{body}</div> : null}
    </section>
  );

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 px-4 py-4 md:px-6">
        <div className="flex items-center gap-2">
          <ContextIcon className="text-white/45" />
          <h1 className="font-semibold text-sm text-white/85">Context</h1>
        </div>
      </header>
      <div className="min-h-0 flex-1 gap-3 px-4 pb-4 md:flex md:px-6">
        <aside className="flex min-h-0 w-full flex-col rounded-xl border border-white/[0.06] bg-white/[0.015] md:w-[22%]">
          <div className="px-3 py-2">
            <h2 className="font-semibold text-[10px] text-white/35 uppercase tracking-wider">
              Streams
            </h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {streams.map((stream) => {
              const selected = selectedStream === stream;
              const expanded = openStreams[stream] ?? selected;
              const files = workspace?.streams[stream]?.files ?? [];
              return (
                <div className="mb-1 rounded-lg" key={stream}>
                  <button
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px]",
                      selected
                        ? "bg-white/[0.08] text-white/80"
                        : "text-white/50 hover:bg-white/[0.05]"
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
                    <span className="truncate">{stream}</span>
                    {expanded ? (
                      <ChevronDownIcon className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRightIcon className="h-3.5 w-3.5" />
                    )}
                  </button>
                  {expanded ? (
                    <div className="mt-1 ml-2 space-y-1 border-white/[0.06] border-l pl-2">
                      {files.map((file) => (
                        <button
                          className={cn(
                            "block w-full truncate rounded px-2 py-1 text-left text-[10px]",
                            selected && activePath === file.path
                              ? "bg-white/[0.07] text-white/75"
                              : "text-white/40 hover:bg-white/[0.04]"
                          )}
                          key={file.path}
                          onClick={() => {
                            setSelectedStream(stream);
                            setActivePath(file.path);
                          }}
                          type="button"
                        >
                          {file.path}
                        </button>
                      ))}
                      {selected && selectedStream === stream ? (
                        <div className="flex items-center gap-1 px-1">
                          <input
                            className="h-6 min-w-0 flex-1 rounded border border-white/[0.08] bg-white/[0.03] px-2 text-[10px] text-white/70 outline-none"
                            onChange={(event) =>
                              setNewFilePath(event.target.value)
                            }
                            placeholder="folder/file.md"
                            value={newFilePath}
                          />
                          <button
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] text-white/45 hover:bg-white/[0.05]"
                            onClick={() => {
                              addFile(newFilePath).catch(() => undefined);
                            }}
                            type="button"
                          >
                            <FilePlusIcon className="h-3 w-3" />
                            Add
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </aside>

        <main className="mt-3 flex min-h-0 w-full flex-col rounded-xl border border-white/[0.06] bg-white/[0.015] md:mt-0 md:w-[50%]">
          <div className="flex items-center justify-between px-3 py-2">
            <p className="truncate text-[11px] text-white/50">
              {activePath ?? "Select a file"}
            </p>
            <button
              className="inline-flex items-center gap-1 rounded border border-white/[0.08] px-2 py-1 text-[10px] text-white/60 hover:bg-white/[0.05] disabled:opacity-50"
              disabled={!(dirty && activePath && selectedStream) || saving}
              onClick={() => {
                saveFile().catch(() => undefined);
              }}
              type="button"
            >
              <SaveIcon className="h-3 w-3" />
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          <div className="min-h-0 flex-1 px-3 pb-3">
            <textarea
              className="h-full w-full resize-none rounded-lg border border-white/[0.08] bg-black/20 p-3 font-mono text-[12px] text-white/75 outline-none"
              onChange={(event) => {
                setEditorValue(event.target.value);
                setDirty(true);
              }}
              placeholder="Select a context file to edit…"
              value={editorValue}
            />
            {saveError ? (
              <p className="mt-2 text-[10px] text-red-400/90">{saveError}</p>
            ) : null}
          </div>
        </main>

        <aside className="mt-3 flex min-h-0 w-full flex-col gap-2 overflow-y-auto rounded-xl border border-white/[0.06] bg-white/[0.015] p-2 md:mt-0 md:w-[28%]">
          {section(
            "summary",
            "Context summary",
            <p className="text-[11px] text-white/60 leading-relaxed">
              {selectedSummary}
            </p>
          )}
          {section(
            "updates",
            "Updates",
            <ul className="space-y-1">
              {(workspace?.updates ?? [])
                .filter((update) =>
                  selectedStream ? update.stream === selectedStream : true
                )
                .slice(0, 10)
                .map((update) => (
                  <li
                    className="text-[10px] text-white/45"
                    key={`${update.stream}-${update.path}-${update.at}`}
                  >
                    {update.action} · {update.path}
                  </li>
                ))}
            </ul>
          )}
          {section(
            "crm",
            "CRM",
            <div className="space-y-2">
              <ul className="space-y-1">
                {crm.participants.slice(0, 20).map((participant) => (
                  <li
                    className="text-[10px] text-white/50"
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
                    <li className="text-[10px] text-white/40" key={deal.name}>
                      {deal.name}
                      {deal.stage ? ` · ${deal.stage}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
          {section(
            "tickets",
            "Tickets",
            <ul className="space-y-1">
              {tickets.slice(0, 20).map((ticket) => (
                <li
                  className="text-[10px] text-white/50"
                  key={`${ticket.ref ?? "x"}-${ticket.title}`}
                >
                  {ticket.ref ? `#${ticket.ref} ` : ""}
                  {ticket.title}
                </li>
              ))}
            </ul>
          )}
          {section(
            "repo",
            "Repo actions",
            <ul className="space-y-1">
              {repos.slice(0, 8).map((repo) => (
                <li className="text-[10px] text-white/50" key={repo.fullName}>
                  <a
                    className="hover:text-white/70"
                    href={githubRepoUrl(repo.fullName)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {repo.fullName}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {section(
            "messages",
            "Messages",
            <ul className="space-y-1">
              {messages.slice(0, 20).map((message) => (
                <li className="text-[10px] text-white/50" key={message.id}>
                  {message.sender} · {message.subject}
                </li>
              ))}
            </ul>
          )}
          {section(
            "events",
            "Events",
            <ul className="space-y-1">
              {recentMeetings.slice(0, 20).map((event) => (
                <li className="text-[10px] text-white/50" key={event.id}>
                  <button
                    className="w-full text-left hover:text-white/75"
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
          )}
        </aside>
      </div>
    </div>
  );
}
