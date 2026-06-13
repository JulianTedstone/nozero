"use client";

import { format } from "date-fns";
import { CalendarIcon, ChevronRightIcon } from "lucide-react";
import {
  EventContextPanel,
  type EventContextNavigation,
} from "@/components/event-context-panel";
import { ContextIcon } from "@/components/context-icon";
import { inferBindingsForEmail, githubRepoUrl } from "@/lib/context-accounts";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types/calendar";
import type { ContextFocus } from "@/types/context-focus";

interface ContextViewProps {
  focus: ContextFocus;
  userEmail?: string;
  recentMeetings?: CalendarEvent[];
  onFocusChange: (focus: ContextFocus) => void;
  navigation: EventContextNavigation;
}

export function ContextView({
  focus,
  userEmail,
  recentMeetings = [],
  onFocusChange,
  navigation,
}: ContextViewProps) {
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

  const bindings = userEmail ? inferBindingsForEmail(userEmail) : [];
  const repos = bindings.flatMap((b) => b.repos);
  const streams = [...new Set(bindings.flatMap((b) => b.streams))];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-white/[0.06] px-4 py-4 md:px-6">
        <div className="flex items-center gap-2">
          <ContextIcon className="text-white/45" />
          <h1 className="font-semibold text-sm text-white/85">Context</h1>
        </div>
        <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-white/35">
          Work-stream intelligence across repos, calendar, email, and boards.
          Open a meeting from Calendar to zoom in here.
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 md:p-6">
        <section>
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">
            Linked repos
          </h2>
          {repos.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {repos.map((r) => (
                <a
                  className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/55 hover:bg-white/[0.06]"
                  href={githubRepoUrl(r.fullName)}
                  key={r.fullName}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {r.fullName}
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-white/25">
              No context repos for {userEmail ?? "this account"} yet. Add one in
              Settings.
            </p>
          )}
        </section>

        {streams.length > 0 ? (
          <section>
            <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">
              Flightdeck streams
            </h2>
            <div className="flex flex-wrap gap-2">
              {streams.map((s) => (
                <button
                  className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/50 hover:bg-white/[0.08]"
                  key={s}
                  onClick={() => navigation.onOpenBoard({ stream: s })}
                  type="button"
                >
                  {s}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">
            Recent meetings
          </h2>
          {recentMeetings.length > 0 ? (
            <ul className="space-y-1">
              {recentMeetings.slice(0, 12).map((ev) => (
                <li key={ev.id}>
                  <button
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5",
                      "text-left hover:border-white/[0.06] hover:bg-white/[0.03]",
                    )}
                    onClick={() =>
                      onFocusChange({ type: "meeting", event: ev })
                    }
                    type="button"
                  >
                    <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-white/25" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-white/70">
                        {ev.title || "Untitled"}
                      </p>
                      {ev.start ? (
                        <p className="text-[10px] text-white/30">
                          {format(new Date(ev.start), "EEE d MMM · h:mm a")}
                        </p>
                      ) : null}
                    </div>
                    <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-white/20" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-white/25">
              Calendar events with attendees appear here for quick context access.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
