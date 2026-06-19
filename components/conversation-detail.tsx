"use client";

import { format } from "date-fns";
import {
  ArrowRightIcon,
  Building2Icon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  Loader2Icon,
  PencilIcon,
  Trash2Icon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { CollapsibleSidebarSection } from "@/components/collapsible-sidebar-section";
import { StreamRouter } from "@/components/stream-router";
import { cn } from "@/lib/utils";
import type { IngestAction, IngestConversation } from "@/types/ingest";
import type { StreamBinding } from "@/types/streams";

function fmtDate(date: string | null): string {
  if (!date) return "";
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? date : format(d, "EEE d MMM yyyy");
}

function channelLabel(channel: string): string {
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

/** Render `**bold**` spans as actual bold, not literal markup. */
function renderInlineBold(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    return m ? (
      <strong className="font-medium text-ink" key={`b-${i}`}>
        {m[1]}
      </strong>
    ) : (
      <span key={`t-${i}`}>{part}</span>
    );
  });
}

/** Parse a Krisp transcript into speaker turns and render them cleanly. */
function TranscriptView({ text }: { text: string }) {
  type Turn = { speaker: string | null; time: string | null; body: string[] };
  const turns: Turn[] = [];
  let cur: Turn | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const speaker = line.match(/^\*\*(.+?)\*\*$/);
    if (speaker) {
      if (cur) turns.push(cur);
      const [name, ...rest] = speaker[1].split("|");
      cur = { speaker: name.trim(), time: rest.join("|").trim() || null, body: [] };
    } else if (line) {
      if (!cur) cur = { speaker: null, time: null, body: [] };
      cur.body.push(line);
    }
  }
  if (cur) turns.push(cur);

  return (
    <div className="space-y-3.5 rounded-xl border border-line bg-black/15 p-4">
      {turns.map((turn, i) => (
        <div key={`turn-${i}`}>
          {turn.speaker ? (
            <p className="mb-1 flex items-baseline gap-2">
              <span className="font-semibold text-[11px] text-ink">
                {turn.speaker}
              </span>
              {turn.time ? (
                <span className="font-mono text-[9px] text-ink-subtle">
                  {turn.time}
                </span>
              ) : null}
            </p>
          ) : null}
          <div className="space-y-1.5 text-[12px] text-ink-muted leading-relaxed">
            {turn.body.map((para, j) => (
              <p key={`p-${i}-${j}`}>{renderInlineBold(para)}</p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ParticipantCard({ participant }: { participant: IngestConversation["participants"][number] }) {
  const [open, setOpen] = useState(false);
  const subtitle = [participant.jobTitle, participant.company]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="rounded-xl border border-line bg-surface-sunk/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-[12px] text-ink">
            {participant.name}
          </p>
          {subtitle ? (
            <p className="truncate text-[10px] text-ink-subtle">{subtitle}</p>
          ) : null}
        </div>
        <button
          aria-label="Contact details"
          className="shrink-0 rounded-md p-1 text-ink-subtle hover:bg-accent hover:text-ink"
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          <UserIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {open ? (
        <div className="mt-2 space-y-1 border-line border-t pt-2 text-[10px] text-ink-muted">
          {participant.email ? (
            <a
              className="block truncate hover:text-ink"
              href={`mailto:${participant.email}`}
            >
              {participant.email}
            </a>
          ) : (
            <p className="text-ink-subtle">No email on record</p>
          )}
          {participant.company ? (
            <p className="flex items-center gap-1 text-ink-subtle">
              <Building2Icon className="h-3 w-3" />
              {participant.company}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ActionRow({
  action,
  onChange,
  onDelete,
  onTask,
  taskDisabled = false,
}: {
  action: IngestAction;
  onChange: (next: IngestAction) => void;
  onDelete: () => void;
  onTask: () => Promise<boolean>;
  taskDisabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(action);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (editing) {
    return (
      <tr className="border-line border-b">
        <td className="px-2 py-1.5" colSpan={2}>
          <input
            className="mb-1 w-full rounded border border-line bg-surface-sunk px-2 py-1 text-[11px] text-ink outline-none"
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            placeholder="Action"
            value={draft.text}
          />
          <div className="flex gap-1">
            <input
              className="min-w-0 flex-1 rounded border border-line bg-surface-sunk px-2 py-1 text-[10px] text-ink outline-none"
              onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
              placeholder="Owner"
              value={draft.owner ?? ""}
            />
            <input
              className="min-w-0 flex-1 rounded border border-line bg-surface-sunk px-2 py-1 text-[10px] text-ink outline-none"
              onChange={(e) => setDraft({ ...draft, due: e.target.value })}
              placeholder="Due"
              value={draft.due ?? ""}
            />
          </div>
        </td>
        <td className="px-2 py-1.5 text-right align-top">
          <div className="inline-flex gap-1">
            <button
              aria-label="Save"
              className="rounded p-1 text-emerald-500 hover:bg-accent"
              onClick={() => {
                onChange(draft);
                setEditing(false);
              }}
              type="button"
            >
              <CheckIcon className="h-3.5 w-3.5" />
            </button>
            <button
              aria-label="Cancel"
              className="rounded p-1 text-ink-subtle hover:bg-accent"
              onClick={() => {
                setDraft(action);
                setEditing(false);
              }}
              type="button"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-line border-b last:border-b-0">
      <td className="px-2 py-1.5 align-top text-[11px] text-ink">
        {action.text}
        {action.due ? (
          <span className="ml-1 text-[9px] text-ink-subtle">· due {action.due}</span>
        ) : null}
      </td>
      <td className="px-2 py-1.5 align-top text-[10px] text-ink-subtle">
        {action.owner ?? "—"}
      </td>
      <td className="px-2 py-1.5 text-right align-top">
        <div className="inline-flex items-center gap-0.5">
          <button
            aria-label="Turn into task"
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px]",
              done
                ? "text-emerald-500"
                : "text-ink-muted hover:bg-accent hover:text-ink",
            )}
            disabled={busy || done || taskDisabled}
            onClick={async () => {
              setBusy(true);
              const ok = await onTask();
              setBusy(false);
              if (ok) setDone(true);
            }}
            title={
              taskDisabled
                ? "Select a stream first"
                : "Create a Flightdeck task"
            }
            type="button"
          >
            {busy ? (
              <Loader2Icon className="h-3 w-3 animate-spin" />
            ) : done ? (
              <CheckIcon className="h-3 w-3" />
            ) : (
              <ArrowRightIcon className="h-3 w-3" />
            )}
            Task
          </button>
          <button
            aria-label="Edit action"
            className="rounded p-1 text-ink-subtle hover:bg-accent hover:text-ink"
            onClick={() => setEditing(true)}
            type="button"
          >
            <PencilIcon className="h-3 w-3" />
          </button>
          <button
            aria-label="Delete action"
            className="rounded p-1 text-ink-subtle hover:bg-accent hover:text-destructive"
            onClick={onDelete}
            type="button"
          >
            <Trash2Icon className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export function ConversationDetail({
  conversation,
  loading,
  onTurnIntoTask,
  streams,
  repos,
  selectedStream,
  onSelectStream,
  onCreateStream,
  onRoute,
  routeBusy = false,
}: {
  conversation: IngestConversation | null;
  loading: boolean;
  onTurnIntoTask: (action: IngestAction) => Promise<boolean>;
  streams: StreamBinding[];
  repos: string[];
  selectedStream: string | null;
  onSelectStream: (name: string | null) => void;
  onCreateStream: (binding: StreamBinding) => Promise<boolean>;
  onRoute?: () => Promise<boolean>;
  routeBusy?: boolean;
}) {
  const [actions, setActions] = useState<IngestAction[]>(
    conversation?.actions ?? [],
  );

  // Reset the local (editable) action list whenever a different conversation opens.
  useEffect(() => {
    setActions(conversation?.actions ?? []);
  }, [conversation?.id, conversation?.actions]);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-[11px] text-ink-subtle">
        <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> Loading conversation…
      </div>
    );
  }
  if (!conversation) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-[11px] text-ink-subtle">
        Select a conversation.
      </div>
    );
  }

  const meta = [
    fmtDate(conversation.date),
    conversation.time,
    conversation.durationMinutes ? `${conversation.durationMinutes} min` : null,
  ].filter(Boolean);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-line border-b px-4 py-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-[9px] text-ink-muted uppercase tracking-wider">
            {channelLabel(conversation.channel)}
          </span>
          {conversation.company ? (
            <span className="text-[10px] text-ink-subtle">
              {conversation.company}
            </span>
          ) : null}
        </div>
        <h1 className="title-serif text-[17px] text-ink">{conversation.title}</h1>
        {meta.length > 0 ? (
          <div className="mt-1 flex items-center gap-3 text-[10px] text-ink-subtle">
            {conversation.date ? (
              <span className="inline-flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                {meta[0]}
              </span>
            ) : null}
            {conversation.time || conversation.durationMinutes ? (
              <span className="inline-flex items-center gap-1">
                <ClockIcon className="h-3 w-3" />
                {[conversation.time, conversation.durationMinutes ? `${conversation.durationMinutes} min` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            ) : null}
          </div>
        ) : null}
      </header>

      {conversation.pending && onRoute ? (
        <StreamRouter
          onChange={onSelectStream}
          onCreate={onCreateStream}
          onRoute={onRoute}
          repos={repos}
          routeBusy={routeBusy}
          streams={streams}
          value={selectedStream}
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {conversation.participants.length > 0 ? (
          <section className="mb-4">
            <h2 className="mb-2 font-semibold text-[10px] text-ink-subtle uppercase tracking-wider">
              Participants
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {conversation.participants.map((p) => (
                <ParticipantCard key={`${p.name}-${p.email ?? ""}`} participant={p} />
              ))}
            </div>
          </section>
        ) : null}

        {conversation.summary ? (
          <section className="mb-4">
            <h2 className="mb-2 font-semibold text-[10px] text-ink-subtle uppercase tracking-wider">
              Summary
            </h2>
            <div className="space-y-2 text-[12px] text-ink-muted leading-relaxed">
              {conversation.summary
                .split("\n")
                .map((para) => para.trim())
                .filter(Boolean)
                .map((para, i) => (
                  <p key={`${i}-${para.slice(0, 16)}`}>{para}</p>
                ))}
            </div>
          </section>
        ) : null}

        <section className="mb-4">
          <h2 className="mb-2 font-semibold text-[10px] text-ink-subtle uppercase tracking-wider">
            Actions
          </h2>
          {actions.length > 0 && conversation.pending && !selectedStream ? (
            <p className="mb-2 text-[10px] text-ink-subtle">
              Select a stream above to enable “→ Task”.
            </p>
          ) : null}
          {actions.length === 0 ? (
            <p className="text-[11px] text-ink-subtle">No actions captured.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full table-fixed">
                <tbody>
                  {actions.map((action, i) => (
                    <ActionRow
                      action={action}
                      key={`${action.text}-${i}`}
                      onChange={(next) =>
                        setActions((prev) =>
                          prev.map((a, j) => (j === i ? next : a)),
                        )
                      }
                      onDelete={() =>
                        setActions((prev) => prev.filter((_, j) => j !== i))
                      }
                      onTask={() => onTurnIntoTask(action)}
                      taskDisabled={conversation.pending && !selectedStream}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-[10px] text-ink-subtle uppercase tracking-wider">
            Transcript
          </h2>
          {conversation.transcript ? (
            <TranscriptView text={conversation.transcript} />
          ) : (
            <p className="text-[11px] text-ink-subtle">No transcript.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export function ConversationRelated({
  conversation,
}: {
  conversation: IngestConversation | null;
}) {
  const companies = conversation
    ? [...new Set(conversation.participants.map((p) => p.company).filter(Boolean))]
    : [];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 px-3 py-2">
        <h2 className="font-semibold text-[10px] text-ink-subtle uppercase tracking-wider">
          Related
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <CollapsibleSidebarSection className="border-t-0 pt-0" defaultOpen title="Streams">
          {conversation && conversation.streams.length > 0 ? (
            <ul className="space-y-1">
              {conversation.streams.map((s) => (
                <li className="text-[10px] text-ink-muted" key={s}>
                  {s}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[10px] text-ink-subtle">No linked streams.</p>
          )}
        </CollapsibleSidebarSection>

        <CollapsibleSidebarSection defaultOpen title="CRM opportunities">
          {conversation && conversation.deals.length > 0 ? (
            <ul className="space-y-1">
              {conversation.deals.map((d) => (
                <li className="text-[10px] text-ink-muted" key={d.name}>
                  {d.name}
                  {d.stage ? ` · ${d.stage}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[10px] text-ink-subtle">No linked opportunities.</p>
          )}
        </CollapsibleSidebarSection>

        <CollapsibleSidebarSection title="Companies">
          {companies.length > 0 ? (
            <ul className="space-y-1">
              {companies.map((c) => (
                <li className="text-[10px] text-ink-muted" key={c}>
                  {c}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[10px] text-ink-subtle">No companies.</p>
          )}
        </CollapsibleSidebarSection>

        <CollapsibleSidebarSection title="Participants">
          {conversation && conversation.participants.length > 0 ? (
            <ul className="space-y-1">
              {conversation.participants.map((p) => (
                <li className="text-[10px] text-ink-muted" key={`${p.name}-${p.email ?? ""}`}>
                  {p.name}
                  {p.company ? ` · ${p.company}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[10px] text-ink-subtle">No participants.</p>
          )}
        </CollapsibleSidebarSection>
      </div>
    </div>
  );
}
