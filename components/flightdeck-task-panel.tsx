"use client";

import { format, parseISO } from "date-fns";
import { ChevronLeftIcon, ExternalLinkIcon, Loader2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FlightdeckFieldOptions } from "@/lib/flightdeck-field-options";
import { cn } from "@/lib/utils";
import type {
  FlightdeckBoardItem,
  FlightdeckBoardVerb,
} from "@/types/flightdeck-board";
import type { FlightdeckComment } from "@/types/flightdeck-comments";

function ownerMention(owner: string | null): string {
  const name = owner?.trim();
  return name ? `@${name}` : "";
}

function formatCommentTime(value: string): string {
  try {
    return format(parseISO(value), "d MMM · HH:mm");
  } catch {
    return value;
  }
}

function DetailSelect({
  disabled,
  id,
  label,
  onChange,
  options,
  value,
}: {
  id: string;
  label: string;
  options: string[];
  value: string | null;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  const merged = [
    ...new Set([
      ...options,
      ...(value && !options.includes(value) ? [value] : []),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-white/30" htmlFor={id}>
        {label}
      </Label>
      <select
        className="flex h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-white/80 outline-none disabled:opacity-50"
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value ?? ""}
      >
        <option value="">—</option>
        {merged.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function actionsForStatus(status: string): FlightdeckBoardVerb[] {
  switch (status) {
    case "Backlog":
      return ["claim"];
    case "To Do":
      return ["start", "block"];
    case "In Progress":
      return ["submit_for_review", "block"];
    case "Review":
      return ["approve", "request_changes"];
    case "Blocked":
      return ["unblock"];
    default:
      return [];
  }
}

export function FlightdeckTaskPanel({
  actionBusy,
  actionError,
  actionsEnabled,
  commentsEnabled,
  fieldOptions,
  item,
  onClose,
  onFieldsChange,
  onRunAction,
  owners,
}: {
  item: FlightdeckBoardItem;
  fieldOptions: FlightdeckFieldOptions;
  owners: string[];
  actionsEnabled: boolean;
  commentsEnabled: boolean;
  actionBusy: boolean;
  actionError: string | null;
  onClose: () => void;
  onFieldsChange: (
    item: FlightdeckBoardItem,
    fields: Record<string, string>
  ) => Promise<void>;
  onRunAction: (verb: FlightdeckBoardVerb) => Promise<void>;
}) {
  const [comments, setComments] = useState<FlightdeckComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [tagOwner, setTagOwner] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const itemRef = item.ref ?? item.id;
  const fieldsDisabled = !actionsEnabled || actionBusy;
  const ownerOptions = owners.length ? owners : fieldOptions.owners;

  const loadComments = useCallback(async () => {
    if (!commentsEnabled) {
      return;
    }
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const params = new URLSearchParams({ item: itemRef });
      if (item.url) {
        params.set("issueUrl", item.url);
      }
      const res = await fetch(`/api/flightdeck/thread?${params.toString()}`);
      const data = (await res.json()) as {
        comments?: FlightdeckComment[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load comments");
      }
      setComments(data.comments ?? []);
    } catch (error) {
      setCommentsError(
        error instanceof Error ? error.message : "Failed to load comments"
      );
    } finally {
      setCommentsLoading(false);
    }
  }, [commentsEnabled, item.url, itemRef]);

  useEffect(() => {
    setCommentDraft("");
    setTagOwner(false);
    loadComments().catch(() => undefined);
  }, [loadComments]);

  const mention = useMemo(() => ownerMention(item.owner), [item.owner]);

  useEffect(() => {
    setCommentDraft((prev) => {
      if (tagOwner && mention) {
        if (prev.startsWith(`${mention} `) || prev === mention) {
          return prev;
        }
        const stripped = prev.replace(/^@\S+\s*/, "").trimStart();
        return stripped ? `${mention} ${stripped}` : `${mention} `;
      }
      if (!tagOwner && mention && prev.startsWith(`${mention} `)) {
        return prev.slice(mention.length + 1);
      }
      if (!tagOwner && prev === mention) {
        return "";
      }
      return prev;
    });
  }, [tagOwner, mention]);

  const patchField = (fields: Record<string, string>) => {
    onFieldsChange(item, fields).catch(() => undefined);
  };

  const postComment = async () => {
    const body = commentDraft.trim();
    if (!body) {
      return;
    }
    setCommentBusy(true);
    setCommentsError(null);
    try {
      const res = await fetch("/api/flightdeck/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: itemRef,
          issueUrl: item.url ?? undefined,
          body,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Comment failed");
      }
      setCommentDraft(tagOwner && mention ? `${mention} ` : "");
      await loadComments();
    } catch (error) {
      setCommentsError(
        error instanceof Error ? error.message : "Comment failed"
      );
    } finally {
      setCommentBusy(false);
    }
  };

  return (
    <aside
      className={cn(
        "absolute top-0 right-0 z-20 flex h-full w-full flex-col border-white/[0.08] border-l bg-[#0d0d0f]/95 backdrop-blur-md",
        expanded ? "md:w-[50vw] md:max-w-[50vw]" : "md:w-[24rem] md:max-w-md"
      )}
    >
      <div className="flex items-start justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] text-white/30">
            #{item.ref ?? "draft"} · {item.status}
          </p>
          <h3 className="mt-1 text-sm text-white/85 leading-snug">
            {item.title}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="rounded-lg p-1 text-white/35 hover:bg-white/[0.06] hover:text-white/60"
            onClick={() => setExpanded((prev) => !prev)}
            title={expanded ? "Shrink panel" : "Expand panel"}
            type="button"
          >
            <ChevronLeftIcon
              className={cn(
                "h-4 w-4 transition-transform",
                expanded && "rotate-180"
              )}
            />
          </button>
          <button
            className="rounded-lg p-1 text-white/35 hover:bg-white/[0.06] hover:text-white/60"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {item.body ? (
          <p className="whitespace-pre-wrap text-[11px] text-white/45 leading-relaxed">
            {item.body}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <DetailSelect
            disabled={fieldsDisabled}
            id="fd-owner"
            label="Owner"
            onChange={(owner) => patchField({ Owner: owner })}
            options={ownerOptions}
            value={item.owner}
          />
          <DetailSelect
            disabled={fieldsDisabled}
            id="fd-approver"
            label="Approver"
            onChange={(approver) => patchField({ Approver: approver })}
            options={fieldOptions.approvers}
            value={item.approver}
          />
          <DetailSelect
            disabled={fieldsDisabled}
            id="fd-approval"
            label="Approval"
            onChange={(approval) => patchField({ Approval: approval })}
            options={fieldOptions.approvals}
            value={item.approval}
          />
          <DetailSelect
            disabled={fieldsDisabled}
            id="fd-stream"
            label="Stream"
            onChange={(stream) => patchField({ Stream: stream })}
            options={fieldOptions.streams}
            value={item.stream}
          />
          <DetailSelect
            disabled={fieldsDisabled}
            id="fd-priority"
            label="Priority"
            onChange={(priority) => patchField({ Priority: priority })}
            options={fieldOptions.priorities}
            value={item.priority}
          />
          <div className="space-y-1">
            <Label className="text-[10px] text-white/30">Next Action</Label>
            <DatePicker
              disabled={fieldsDisabled}
              key={`${itemRef}-next-action`}
              onChange={(date) => patchField({ "Next Action": date })}
              triggerClassName="h-8 w-full justify-start border-white/[0.08] bg-white/[0.03] px-2 text-[11px]"
              value={item.nextAction ?? undefined}
            />
          </div>
          <div className="space-y-1">
            <Label
              className="text-[10px] text-white/30"
              htmlFor="fd-recurrence"
            >
              Recurrence
            </Label>
            <Input
              className="h-8 border-white/[0.08] bg-white/[0.03] text-[11px] text-white/80"
              defaultValue={item.recurrence ?? ""}
              disabled={fieldsDisabled}
              id="fd-recurrence"
              key={`${itemRef}-recurrence`}
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (next !== (item.recurrence ?? "")) {
                  patchField({ Recurrence: next });
                }
              }}
              placeholder="e.g. weekly Monday"
            />
          </div>
          <div className="space-y-1">
            <Label
              className="text-[10px] text-white/30"
              htmlFor="fd-project-link"
            >
              Project Link
            </Label>
            <Input
              className="h-8 border-white/[0.08] bg-white/[0.03] text-[11px] text-white/80"
              defaultValue={item.projectLink ?? ""}
              disabled={fieldsDisabled}
              id="fd-project-link"
              key={`${itemRef}-project-link`}
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (next !== (item.projectLink ?? "")) {
                  patchField({ "Project Link": next });
                }
              }}
              placeholder="https://…"
            />
          </div>
        </div>

        <div className="space-y-2 pt-3">
          <p className="text-[10px] text-white/30 uppercase tracking-wider">
            Comments
          </p>
          {commentsLoading ? (
            <div className="flex items-center gap-2 text-[11px] text-white/35">
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
              Loading thread…
            </div>
          ) : null}
          {commentsError ? (
            <p className="text-[10px] text-red-400/90">{commentsError}</p>
          ) : null}
          {!commentsLoading && comments.length === 0 ? (
            <p className="text-[11px] text-white/30">No comments yet.</p>
          ) : null}
          <ul className="space-y-2">
            {comments.map((comment, index) => (
              <li
                className={cn(
                  "flex",
                  index % 2 === 0 ? "justify-start" : "justify-end"
                )}
                key={`${comment.createdAt}-${comment.author}-${index}`}
              >
                <div
                  className={cn(
                    "max-w-[92%] rounded-2xl px-3 py-2",
                    index % 2 === 0
                      ? "rounded-bl-md bg-white/[0.06] text-white/75"
                      : "rounded-br-md bg-sky-500/15 text-white/80"
                  )}
                >
                  <p className="text-[10px] text-white/40">
                    {comment.author} · {formatCommentTime(comment.createdAt)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed">
                    {comment.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {commentsEnabled ? (
            <div className="space-y-2 pt-1">
              <textarea
                className="min-h-[4.5rem] w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] text-white/80 outline-none placeholder:text-white/25"
                disabled={commentBusy}
                onChange={(event) => setCommentDraft(event.target.value)}
                placeholder="Add a comment…"
                value={commentDraft}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  className="flex cursor-pointer items-center gap-2 text-[11px] text-white/50"
                  htmlFor="fd-tag-owner"
                >
                  <Checkbox
                    checked={tagOwner}
                    disabled={!item.owner || commentBusy}
                    id="fd-tag-owner"
                    onCheckedChange={(checked) => setTagOwner(checked === true)}
                  />
                  Tag Owner
                </label>
                <Button
                  className="h-7 bg-white/90 text-[10px] text-black hover:bg-white"
                  disabled={commentBusy || !commentDraft.trim()}
                  onClick={() => postComment().catch(() => undefined)}
                  size="sm"
                  type="button"
                >
                  {commentBusy ? (
                    <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Post comment"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-white/30">
              Comments require GITHUB_TOKEN on the server.
            </p>
          )}
        </div>
      </div>

      <div className="shrink-0 space-y-2 border-white/[0.06] border-t px-4 py-3">
        {actionError ? (
          <p className="text-[10px] text-red-400/90">{actionError}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {actionsForStatus(item.status).map((verb) => (
            <Button
              className="h-7 border-white/[0.08] bg-white/[0.04] text-[10px] text-white/65 capitalize"
              disabled={actionBusy || !actionsEnabled}
              key={verb}
              onClick={() => onRunAction(verb).catch(() => undefined)}
              size="sm"
              variant="outline"
            >
              {verb.replaceAll("_", " ")}
            </Button>
          ))}
        </div>
        {item.url ? (
          <a
            className="inline-flex items-center gap-1 text-[10px] text-white/45 hover:text-white/70"
            href={item.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open on GitHub
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
        ) : null}
      </div>
    </aside>
  );
}
