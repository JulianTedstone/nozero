"use client";

import { format } from "date-fns";
import {
  ArrowLeftIcon,
  CalendarIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  LayoutDashboardIcon,
  Loader2Icon,
  MailIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ContextIcon } from "@/components/context-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types/calendar";
import type { MeetingContextBundle } from "@/types/meeting-context";

export interface EventContextNavigation {
  onOpenCalendarEvent: (event: CalendarEvent) => void;
  onOpenEmail: (params?: { threadId?: string }) => void;
  onOpenBoard: (params?: { stream?: string }) => void;
}

interface EventContextPanelProps {
  event: CalendarEvent;
  userEmail?: string;
  onBack: () => void;
  navigation?: EventContextNavigation;
}

function CollapsibleSection({
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
        className="flex w-full items-center justify-between border-b border-white/[0.06] px-4 py-2.5 text-left"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
          {title}
        </h3>
        <ChevronDownIcon
          className={cn(
            "h-3.5 w-3.5 text-white/25 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="px-4 py-3 text-xs text-white/55">
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

export function EventContextPanel({
  event,
  userEmail,
  onBack,
  navigation,
}: EventContextPanelProps) {
  const [bundle, setBundle] = useState<MeetingContextBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [relatedTab, setRelatedTab] = useState<"deals" | "calendar">("deals");
  const [briefTab, setBriefTab] = useState<"summary" | "source">("summary");

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/context/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          title: event.title,
          start: event.start,
          end: event.end,
          attendees: event.attendees?.map((a) => a.email) ?? [],
          description: event.description,
          accountEmail: event.accountEmail ?? userEmail,
        }),
      });
      if (res.ok) {
        setBundle((await res.json()) as MeetingContextBundle);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [event, userEmail]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const schedule =
    event.start && format(new Date(event.start), "EEE d MMM · h:mm a");

  const streamLabel = bundle?.stream?.label ?? bundle?.streams[0];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="sticky top-0 z-10 flex shrink-0 items-start gap-3 border-b border-white/[0.06] bg-background/90 px-4 py-3 backdrop-blur-md md:px-6">
        <Button
          className="mt-0.5 h-8 w-8 shrink-0 rounded-lg text-white/45 hover:bg-white/[0.06]"
          onClick={onBack}
          size="icon"
          variant="ghost"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ContextIcon className="h-4 w-4 text-white/40" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-white/30">
              Context
            </span>
            {streamLabel ? (
              <button
                className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/50 hover:bg-white/[0.08]"
                onClick={() =>
                  navigation?.onOpenBoard({ stream: streamLabel })
                }
                type="button"
              >
                {streamLabel}
              </button>
            ) : null}
          </div>
          <h1 className="mt-1 truncate font-semibold text-sm text-white/90">
            {event.title || "Untitled meeting"}
          </h1>
          {schedule ? (
            <p className="text-[11px] text-white/40">{schedule}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {navigation ? (
            <Button
              className="h-8 gap-1.5 rounded-lg text-[11px] text-white/45"
              onClick={() => navigation.onOpenCalendarEvent(event)}
              size="sm"
              variant="ghost"
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              Calendar
            </Button>
          ) : null}
          <Button
            className="h-8 w-8 rounded-lg text-white/45"
            disabled={refreshing}
            onClick={() => void load()}
            size="icon"
            variant="ghost"
          >
            {refreshing ? (
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCwIcon className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 md:p-6">
        {loading && !bundle ? (
          <div className="flex items-center gap-2 text-xs text-white/35">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            Loading context…
          </div>
        ) : null}

        <CollapsibleSection title="Meeting brief">
          <div className="mb-3 flex gap-1">
            {(["summary", "source"] as const).map((tab) => (
              <button
                className={cn(
                  "rounded-md px-2.5 py-1 text-[10px]",
                  briefTab === tab
                    ? "bg-white/[0.08] text-white/70"
                    : "text-white/35 hover:text-white/50",
                )}
                key={tab}
                onClick={() => setBriefTab(tab)}
                type="button"
              >
                {tab === "summary" ? "Summary" : "Source"}
              </button>
            ))}
          </div>

          {briefTab === "summary" ? (
            <>
              {bundle?.summary.purpose ? (
                <p className="leading-relaxed whitespace-pre-wrap text-white/75">
                  {bundle.summary.purpose}
                </p>
              ) : (
                <p className="text-white/25">
                  {bundle?.errors.ctx ?? "No summary yet."}
                </p>
              )}

              {bundle && bundle.summary.actionPoints.length > 0 ? (
                <div className="mt-4">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/35">
                    Action points
                  </p>
                  <ul className="list-inside list-disc space-y-1 text-[11px] text-white/60">
                    {bundle.summary.actionPoints.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {bundle && bundle.summary.recommendations.length > 0 ? (
                <div className="mt-4">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/35">
                    Recommendations
                  </p>
                  <ul className="list-inside list-disc space-y-1 text-[11px] italic text-white/50">
                    {bundle.summary.recommendations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {bundle && bundle.summary.sources.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {bundle.summary.sources.map((s) => (
                    <span
                      className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/35"
                      key={s}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <>
              {bundle && bundle.transcripts.length > 0 ? (
                bundle.transcripts.map((t) => (
                  <div key={t.id}>
                    <p className="font-medium text-white/65">{t.title}</p>
                    <span className="text-[10px] text-white/30">
                      {t.confidence} confidence · {t.source}
                    </span>
                    {t.confidence === "low" ? (
                      <p className="mt-2 text-[11px] text-amber-400/80">
                        This transcript may not match this meeting — treat as
                        unverified.
                      </p>
                    ) : null}
                    <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-white/45">
                      {t.fullText ?? t.excerpt ?? "No transcript text."}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-white/25">
                  {bundle?.errors.krisp ??
                    "No linked transcript. Connect Krisp or check the meeting title and time."}
                </p>
              )}
            </>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          empty="No people on this meeting."
          isEmpty={!bundle?.people.length}
          title="People"
        >
          {bundle && bundle.people.length > 0 ? (
            <ul className="space-y-3">
              {bundle.people.map((p) => (
                <li
                  className="rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2"
                  key={p.email}
                >
                  <p className="font-medium text-white/75">
                    {p.name ?? p.email}
                  </p>
                  <p className="text-[10px] text-white/35">{p.email}</p>
                  {(p.role || p.company) && (
                    <p className="mt-1 text-[11px] text-white/45">
                      {[p.role, p.company].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </CollapsibleSection>

        <CollapsibleSection
          empty="No companies matched."
          isEmpty={!bundle?.companies.length}
          title="Companies"
        >
          {bundle && bundle.companies.length > 0 ? (
            <ul className="space-y-2">
              {bundle.companies.map((c) => (
                <li key={c.id ?? c.name}>
                  {c.somaUrl ? (
                    <a
                      className="text-white/65 hover:text-white/85"
                      href={c.somaUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {c.name}
                    </a>
                  ) : (
                    <span>{c.name}</span>
                  )}
                  {c.domain ? (
                    <span className="ml-2 text-[10px] text-white/30">
                      {c.domain}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </CollapsibleSection>

        <CollapsibleSection title="Related">
          <div className="mb-3 flex gap-1">
            {(["deals", "calendar"] as const).map((tab) => (
              <button
                className={cn(
                  "rounded-md px-2.5 py-1 text-[10px]",
                  relatedTab === tab
                    ? "bg-white/[0.08] text-white/70"
                    : "text-white/35 hover:text-white/50",
                )}
                key={tab}
                onClick={() => setRelatedTab(tab)}
                type="button"
              >
                {tab === "deals" ? "Deals" : "Calendar"}
              </button>
            ))}
          </div>
          {relatedTab === "deals" ? (
            bundle && bundle.related.deals.length > 0 ? (
              <ul className="space-y-2">
                {bundle.related.deals.map((d) => (
                  <li key={d.id ?? d.name}>
                    <span className="text-white/70">{d.name}</span>
                    {d.stage ? (
                      <span className="ml-2 text-[10px] text-white/30">
                        {d.stage}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-white/25">No related deals.</p>
            )
          ) : bundle && bundle.related.calendarEvents.length > 0 ? (
            <ul className="space-y-2">
              {bundle.related.calendarEvents.slice(0, 10).map((ev) => (
                <li key={ev.id}>
                  <button
                    className="text-left text-white/60 hover:text-white/80"
                    onClick={() => navigation?.onOpenCalendarEvent(ev)}
                    type="button"
                  >
                    {ev.title}
                    {ev.start ? (
                      <span className="ml-2 text-white/30">
                        {format(new Date(ev.start), "d MMM")}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-white/25">No overlapping calendar events.</p>
          )}
        </CollapsibleSection>

        <CollapsibleSection empty="No messages found." isEmpty={!bundle?.messages.length} title="Messages">
          {bundle && bundle.messages.length > 0 ? (
            <ul className="space-y-2">
              {bundle.messages.map((m) => (
                <li key={m.id ?? m.subject}>
                  {m.emailDeepLink && navigation ? (
                    <button
                      className="text-left text-white/65 hover:text-white/85"
                      onClick={() =>
                        navigation.onOpenEmail({
                          threadId: m.emailDeepLink?.split("threadId=")[1],
                        })
                      }
                      title="Open in Email"
                      type="button"
                    >
                      {m.subject}
                    </button>
                  ) : (
                    <span>{m.subject}</span>
                  )}
                  {m.date ? (
                    <span className="ml-2 text-[10px] text-white/30">
                      {format(new Date(m.date), "d MMM")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </CollapsibleSection>

        <CollapsibleSection title="Transcripts">
          {bundle && bundle.transcripts.length > 0 ? (
            <ul className="space-y-3">
              {bundle.transcripts.map((t) => (
                <li key={t.id}>
                  <p className="font-medium text-white/65">{t.title}</p>
                  <span className="text-[10px] text-white/30">
                    {t.confidence} confidence
                  </span>
                  {t.excerpt ? (
                    <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-white/45">
                      {t.excerpt}
                    </p>
                  ) : null}
                  <button
                    className="mt-2 text-[10px] text-white/40 underline-offset-2 hover:text-white/60 hover:underline"
                    onClick={() => setBriefTab("source")}
                    type="button"
                  >
                    View full transcript in Source
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-white/25">
              {bundle?.errors.krisp ?? "Connect Krisp in Settings for transcripts."}
            </p>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Actions">
          {bundle && bundle.actions.length > 0 ? (
            <ul className="space-y-2">
              {bundle.actions.map((a) => (
                <li className="flex items-start gap-2" key={a.id}>
                  <span
                    className={cn(
                      "mt-1 h-2 w-2 shrink-0 rounded-full",
                      a.completed ? "bg-white/20" : "bg-emerald-500/60",
                    )}
                  />
                  <span
                    className={cn(
                      a.completed && "text-white/30 line-through",
                    )}
                  >
                    {a.title}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-white/25">No Krisp action items.</p>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Tasks">
          {bundle && bundle.tasks.length > 0 ? (
            <ul className="space-y-2">
              {bundle.tasks.map((t) => (
                <li className="flex items-start gap-2" key={t.id}>
                  <LayoutDashboardIcon className="mt-0.5 h-3 w-3 shrink-0 text-white/25" />
                  <div className="min-w-0">
                    {t.url ? (
                      <a
                        className="text-white/65 hover:text-white/85"
                        href={t.url}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {t.title}
                      </a>
                    ) : (
                      <span>{t.title}</span>
                    )}
                    {t.stream ? (
                      <button
                        className="ml-2 text-[10px] text-white/35 hover:text-white/55"
                        onClick={() =>
                          navigation?.onOpenBoard({ stream: t.stream ?? undefined })
                        }
                        type="button"
                      >
                        {t.stream}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-white/25">
              {bundle?.errors.flightdeck ??
                bundle?.errors.tower ??
                "No Flightdeck tasks matched."}
            </p>
          )}
        </CollapsibleSection>

        {bundle && bundle.repos.length > 0 ? (
          <CollapsibleSection defaultOpen={false} title="Context repos">
            <div className="flex flex-wrap gap-2">
              {bundle.repos.map((repo) => (
                <a
                  className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/50 hover:bg-white/[0.06]"
                  href={`https://github.com/${repo}`}
                  key={repo}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {repo}
                  <ExternalLinkIcon className="h-2.5 w-2.5 opacity-50" />
                </a>
              ))}
            </div>
          </CollapsibleSection>
        ) : null}
      </div>
    </div>
  );
}

/** @deprecated Use EventContextPanel — alias for context tab drill-down */
export const MeetingContextDetail = EventContextPanel;
export type MeetingContextNavigation = EventContextNavigation;
