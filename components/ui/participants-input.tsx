"use client";

import { CheckIcon, ClockIcon, Loader2Icon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface Participant {
  email: string;
  status?: "pending" | "accepted" | "declined" | "needs-action";
}

interface ContactSuggestion {
  company: string | null;
  email: string;
  name: string | null;
  source: "calendar" | "invites" | "messages" | "soma";
}

interface ParticipantsInputProps {
  className?: string;
  /** When true, adding participants is disabled. */
  disabled?: boolean;
  /** When false, existing chips cannot be removed (guest on someone else's meeting). */
  allowRemove?: boolean;
  icon?: React.ReactNode;
  inputClassName?: string;
  onChange: (value: Participant[]) => void;
  placeholder?: string;
  value: Participant[];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SOURCE_LABELS: Record<ContactSuggestion["source"], string> = {
  soma: "Soma",
  messages: "Messages",
  calendar: "Recent",
  invites: "Invited",
};

function normalizeEmails(rawValue: string) {
  return rawValue
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

const STATUS_STYLES: Record<
  string,
  { icon: React.ElementType; color: string }
> = {
  accepted: { icon: CheckIcon, color: "text-emerald-400" },
  pending: { icon: ClockIcon, color: "text-destructive" },
  declined: { icon: XIcon, color: "text-destructive" },
  "needs-action": { icon: ClockIcon, color: "text-ink-subtle" },
};

export function ParticipantsInput({
  className,
  disabled = false,
  allowRemove = true,
  icon,
  inputClassName,
  placeholder = "Add email and press Enter",
  value,
  onChange,
}: ParticipantsInputProps) {
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommitRef = useRef(false);

  const normalizedEmails = useMemo(
    () => new Set(value.map((p) => p.email.toLowerCase())),
    [value],
  );

  useEffect(() => {
    const query = draft.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/contacts/suggest?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setSuggestions([]);
          setOpen(false);
          return;
        }

        const data = (await response.json()) as {
          suggestions?: ContactSuggestion[];
        };

        const nextSuggestions = (data.suggestions ?? []).filter(
          (suggestion) =>
            !normalizedEmails.has(suggestion.email.toLowerCase()),
        );

        setSuggestions(nextSuggestions);
        setOpen(nextSuggestions.length > 0);
        setActiveIndex(-1);
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setOpen(false);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [draft, normalizedEmails]);

  const addParticipant = (email: string) => {
    if (
      !EMAIL_REGEX.test(email) ||
      normalizedEmails.has(email.toLowerCase())
    ) {
      return;
    }

    onChange([...value, { email, status: "pending" }]);
    setDraft("");
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  };

  const commitDraft = () => {
    const nextEmails = normalizeEmails(draft);
    if (nextEmails.length === 0) {
      setDraft("");
      return;
    }

    const nextValue = [...value];

    for (const email of nextEmails) {
      if (
        !EMAIL_REGEX.test(email) ||
        normalizedEmails.has(email.toLowerCase())
      ) {
        continue;
      }

      nextValue.push({ email, status: "pending" });
    }

    onChange(nextValue);
    setDraft("");
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  };

  const selectSuggestion = (suggestion: ContactSuggestion) => {
    skipBlurCommitRef.current = true;
    addParticipant(suggestion.email);
    inputRef.current?.focus();
  };

  const removeParticipant = (email: string) => {
    onChange(value.filter((p) => p.email !== email));
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "flex w-full gap-3 rounded-xl border border-line bg-surface-sunk px-3 py-2.5",
          className,
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {icon ? <div className="flex shrink-0 pt-0.5">{icon}</div> : null}

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {value.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {value.map((participant) => {
                const statusInfo =
                  STATUS_STYLES[participant.status || "pending"] ||
                  STATUS_STYLES.pending;
                const StatusIcon = statusInfo.icon;

                return (
                  <span
                    className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-accent px-2 py-1"
                    key={participant.email}
                  >
                    <StatusIcon
                      className={cn("h-3 w-3 shrink-0", statusInfo.color)}
                    />
                    <span className="min-w-0 truncate text-[11px] text-ink">
                      {participant.email}
                    </span>
                    {!disabled && allowRemove ? (
                      <button
                        className="shrink-0 rounded-full p-0.5 text-ink-subtle transition-colors hover:bg-accent hover:text-ink"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeParticipant(participant.email);
                        }}
                        type="button"
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    ) : null}
                  </span>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              autoComplete="off"
              className={cn(
                "w-full bg-transparent text-ink text-xs outline-none placeholder:text-ink-subtle",
                disabled && "cursor-not-allowed opacity-70",
                inputClassName,
              )}
              disabled={disabled}
              readOnly={disabled}
              onBlur={() => {
                window.setTimeout(() => {
                  setOpen(false);
                  if (!skipBlurCommitRef.current) {
                    commitDraft();
                  }
                  skipBlurCommitRef.current = false;
                }, 120);
              }}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => {
                if (suggestions.length > 0) {
                  setOpen(true);
                }
              }}
              onKeyDown={(event) => {
                if (open && suggestions.length > 0) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveIndex((current) =>
                      current >= suggestions.length - 1 ? 0 : current + 1,
                    );
                    return;
                  }

                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveIndex((current) =>
                      current <= 0 ? suggestions.length - 1 : current - 1,
                    );
                    return;
                  }

                  if (event.key === "Escape") {
                    event.preventDefault();
                    setOpen(false);
                    setActiveIndex(-1);
                    return;
                  }

                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (activeIndex >= 0 && suggestions[activeIndex]) {
                      selectSuggestion(suggestions[activeIndex]);
                    } else {
                      commitDraft();
                    }
                    return;
                  }
                }

                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  commitDraft();
                }

                if (
                  event.key === "Backspace" &&
                  draft.length === 0 &&
                  value.length > 0 &&
                  allowRemove
                ) {
                  event.preventDefault();
                  removeParticipant(value.at(-1)!.email);
                }
              }}
              placeholder={
                value.length === 0 ? placeholder : "Add another..."
              }
              ref={inputRef}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              value={draft}
            />

            {loading ? (
              <Loader2Icon className="h-3.5 w-3.5 shrink-0 animate-spin text-ink-subtle" />
            ) : null}
          </div>
        </div>
      </div>

      {open && suggestions.length > 0 ? (
        <ul
          className="absolute top-[calc(100%+6px)] z-50 max-h-52 w-full overflow-y-auto rounded-xl border border-line bg-[#141414] py-1 shadow-xl"
          role="listbox"
        >
          {suggestions.map((suggestion, index) => {
            const subtitle = [
              suggestion.email,
              suggestion.company,
              SOURCE_LABELS[suggestion.source],
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <li key={suggestion.email} role="option">
                <button
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-accent",
                    index === activeIndex && "bg-accent",
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectSuggestion(suggestion);
                  }}
                  type="button"
                >
                  <span className="truncate text-xs text-ink">
                    {suggestion.name || suggestion.email}
                  </span>
                  <span className="truncate text-[11px] text-ink-muted">
                    {suggestion.name ? subtitle : SOURCE_LABELS[suggestion.source]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
