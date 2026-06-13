"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  PaletteIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { authClient } from "@/lib/auth-client";
import {
  DEFAULT_EVENT_SECTION_ORDER,
  EVENT_SECTION_LABELS,
  type EventDetailSectionId,
  moveSection,
  parseEventSectionOrder,
} from "@/lib/event-detail-layout";
import { inferBindingsForEmail, githubRepoUrl } from "@/lib/context-accounts";
import { AccountCodesSettings } from "@/components/account-codes-settings";
import { cn } from "@/lib/utils";

// Palette of distinct hues — derived deterministically from the name
const AVATAR_COLORS = ["#4285F4","#EA4335","#34A853","#FBBC05","#8B5CF6","#EC4899","#14B8A6","#F97316"];
function nameToColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function InitialsAvatar({ name, image, size }: { name: string; image?: string; size: "sm" | "lg" }) {
  const [imgFailed, setImgFailed] = useState(false);
  const dim = size === "lg" ? "h-10 w-10" : "h-8 w-8";
  const round = size === "lg" ? "rounded-xl" : "rounded-full";
  const textSz = size === "lg" ? "text-sm" : "text-xs";
  const color = nameToColor(name || "U");
  const initials = getInitials(name || "?");
  if (image && !imgFailed) {
    return (
      <div className={`${dim} flex-shrink-0 overflow-hidden ${round} ring-2 ring-white/[0.08]`}>
        <img
          alt={name}
          className="h-full w-full object-cover"
          src={image}
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }
  return (
    <div
      className={`${dim} flex-shrink-0 ${round} flex items-center justify-center font-bold ${textSz} text-white ring-2 ring-white/[0.08]`}
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  );
}

/** Theme-aware settings surfaces (light + dark). */
const settingsSelectContent =
  "rounded-xl border border-border bg-popover text-popover-foreground shadow-lg";
const settingsSelectTrigger =
  "h-10 w-full rounded-xl border-border bg-muted/60 px-3 text-xs text-foreground hover:bg-muted md:h-8 md:rounded-lg md:text-[11px]";
const settingsCard = "liquid-glass-subtle space-y-5 rounded-2xl p-4 md:p-5";
const settingsRow =
  "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between";
const settingsFieldLabel = "font-medium text-sm text-foreground/90 md:text-xs";
const settingsFieldHint = "text-xs text-muted-foreground md:text-[10px]";
const settingsInput =
  "h-8 w-full rounded-lg border border-border bg-muted/50 px-3 text-xs text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-ring focus:ring-1 focus:ring-ring/30";
const settingsDivider = "h-px bg-border";
const settingsSecondaryBtn =
  "rounded-lg border border-border bg-muted/40 text-xs text-muted-foreground hover:bg-muted/70 transition-colors";
const settingsPrimarySubmit =
  "h-11 w-full rounded-2xl bg-primary font-medium text-primary-foreground text-sm hover:bg-primary/90 md:h-9 md:rounded-xl md:text-xs";

const formSchema = z.object({
  defaultView: z.enum(["month", "week", "day"]),
  showWeekends: z.boolean(),
  showWeekNumbers: z.boolean(),
  defaultDuration: z.enum(["30", "60", "90"]),
  timezone: z.string().default("UTC"),
});

type SettingsSection = "appearance" | "time" | "accounts";

const NAV_ITEMS: {
  id: SettingsSection;
  label: string;
  icon: React.ElementType;
}[] = [
  { id: "appearance", label: "Appearance", icon: PaletteIcon },
  { id: "time", label: "Time & Events", icon: ClockIcon },
  { id: "accounts", label: "Accounts", icon: UsersIcon },
];

type AccountType = "google" | "caldav" | "imap";

type Account = {
  id: string;
  email: string;
  type: AccountType;
  label: string;
  connected: boolean;
  color: string;
  serverUrl?: string;
  username?: string;
  /** Transient UI only — never persisted to localStorage or server metadata. */
  password?: string;
  /** CalDAV password exists server-side in preferences.connectedCalDav. */
  hasStoredCredentials?: boolean;
};

interface ModernSettingsFormProps {
  initialPreferences: any;
  initialConnectedAccounts?: Account[];
  initialSection?: "appearance" | "time" | "accounts";
  connectedAccountId?: string;
  connectedEmail?: string;
  oauthError?: string;
  triggerSync?: boolean;
  userEmail: string;
  userId: string;
  userImage: string;
  userName: string;
  userProvider: string;
}

const ACCOUNT_COLORS = [
  "#4285F4",
  "#34A853",
  "#8B5CF6",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
];

const ICLOUD_CALDAV_SERVER = "https://caldav.icloud.com";

type AccountPickerOption = "google" | "icloud" | "caldav" | "imap";

const ACCOUNT_PICKER_OPTIONS: {
  id: AccountPickerOption;
  label: string;
}[] = [
  { id: "google", label: "Google" },
  { id: "icloud", label: "iCloud" },
  { id: "caldav", label: "CalDAV" },
  { id: "imap", label: "IMAP" },
];

function isICloudCalDav(account?: Partial<Account>): boolean {
  const url = (account?.serverUrl ?? "").trim().replace(/\/$/, "");
  return url === ICLOUD_CALDAV_SERVER;
}

function newAccountTypeLabel(
  type: AccountType,
  icloud: boolean,
): string {
  if (type === "google") return "Google";
  if (icloud) return "iCloud";
  if (type === "caldav") return "CalDAV";
  return "IMAP";
}

type CalendarOption = {
  calendarId: string;
  name: string;
  color: string;
  primary?: boolean;
};

function AccountCalendarSubscriptions({
  accountId,
  connected,
}: {
  accountId: string;
  connected: boolean;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState<CalendarOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!connected) return;
    setLoading(true);
    fetch(`/api/accounts/${encodeURIComponent(accountId)}/calendars`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setAvailable(data.available ?? []);
        const subs: CalendarOption[] =
          data.subscribed?.length > 0
            ? data.subscribed
            : (data.defaultSubscribed ?? []);
        setSelected(new Set(subs.map((s) => s.calendarId)));
      })
      .catch(() => {
        toast({
          title: "Could not load calendars",
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, [accountId, connected, toast]);

  if (!connected) return null;

  const filtered = filter.trim()
    ? available.filter((c) =>
        c.name.toLowerCase().includes(filter.trim().toLowerCase()),
      )
    : available;

  async function saveSubscriptions() {
    setSaving(true);
    const subscribed = available
      .filter((c) => selected.has(c.calendarId))
      .map((c) => ({
        calendarId: c.calendarId,
        name: c.name,
        color: c.color,
        primary: c.primary,
      }));
    try {
      const res = await fetch(
        `/api/accounts/${encodeURIComponent(accountId)}/calendars`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscribed }),
        },
      );
      if (!res.ok) throw new Error("Save failed");
      toast({
        title: "Calendar subscriptions saved",
        description: `${subscribed.length} calendar(s) will sync and appear in the sidebar.`,
      });
    } catch {
      toast({ title: "Failed to save subscriptions", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] font-medium text-muted-foreground">
          Subscribed calendars
        </label>
        <span className="text-[9px] text-muted-foreground/80">
          {selected.size} selected
        </span>
      </div>
      <p className="text-[9px] leading-relaxed text-muted-foreground">
        Choose which calendars to sync and show. Org or shared calendars are
        opt-in — only your primary calendar is selected by default.
      </p>
      {available.length > 8 && (
        <input
          className="h-7 w-full rounded-md border border-border bg-muted/40 px-2 text-[10px] text-foreground/90 placeholder:text-muted-foreground/70 outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter calendars…"
          value={filter}
        />
      )}
      {loading ? (
        <p className="text-[10px] text-muted-foreground">Loading calendars…</p>
      ) : filtered.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">No calendars found.</p>
      ) : (
        <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
          {filtered.map((cal) => {
            const checked = selected.has(cal.calendarId);
            return (
              <label
                key={cal.calendarId}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/40"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(cal.calendarId)) {
                        next.delete(cal.calendarId);
                      } else {
                        next.add(cal.calendarId);
                      }
                      return next;
                    });
                  }}
                  className="rounded border-border"
                />
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: cal.color }}
                />
                <span className="truncate text-[10px] text-foreground/80">
                  {cal.name}
                  {cal.primary ? (
                    <span className="ml-1 text-muted-foreground/80">(Primary)</span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      )}
      <button
        type="button"
        disabled={saving || loading || selected.size === 0}
        onClick={() => void saveSubscriptions()}
        className="h-7 w-full rounded-lg bg-muted/60 text-[10px] font-medium text-foreground hover:bg-muted/80 disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save calendar subscriptions"}
      </button>
    </div>
  );
}

function buildAccountList(
  userEmail: string,
  serverAccounts?: Account[],
): Account[] {
  const primary = primaryGoogleAccount(userEmail);
  const additional = (serverAccounts ?? []).filter(
    (a) => a.id !== "primary-google",
  );
  return additional.length > 0 ? [primary, ...additional] : [primary];
}

function primaryGoogleAccount(userEmail: string): Account {
  return {
    id: "primary-google",
    email: userEmail,
    type: "google",
    label: "Google Calendar & Gmail",
    connected: true,
    color: "#4285F4",
  };
}

/** Merge account lists from server, API, and localStorage — later sources win on conflict. */
function mergeAccountLists(
  userEmail: string,
  ...sources: (Account[] | undefined)[]
): Account[] {
  const primary = primaryGoogleAccount(userEmail);
  const byId = new Map<string, Account>();
  for (const source of sources) {
    if (!source?.length) continue;
    for (const account of source) {
      if (account.id === "primary-google") continue;
      const prev = byId.get(account.id);
      const { password: _dropPassword, ...rest } = account;
      byId.set(account.id, prev ? { ...prev, ...rest, password: undefined } : { ...rest, password: undefined });
    }
  }
  const additional = [...byId.values()];
  return additional.length > 0 ? [primary, ...additional] : [primary];
}

function migrateLegacyAccountStorage(
  accountsKey: string,
  userId: string,
  userEmail: string,
): void {
  if (typeof window === "undefined") return;
  try {
    if (!window.localStorage.getItem(accountsKey)) {
      const legacyKeys = [
        userId ? `nozero:accounts:${userId}` : null,
        userEmail ? `nozero:accounts:${userEmail}` : null,
      ].filter(Boolean) as string[];
      for (const legacyKey of legacyKeys) {
        const legacyStored = window.localStorage.getItem(legacyKey);
        if (legacyStored) {
          window.localStorage.setItem(accountsKey, legacyStored);
          break;
        }
      }
    }
    if (userId) window.localStorage.removeItem(`nozero:accounts:${userId}`);
    if (userEmail) window.localStorage.removeItem(`nozero:accounts:${userEmail}`);
  } catch {}
}

function stripPasswordsForStorage(accounts: Account[]): Account[] {
  return accounts.map(({ password: _password, ...rest }) => rest);
}

function readAccountsFromLocalStorage(accountsKey: string): Account[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(accountsKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as Account[];
    return Array.isArray(parsed) ? stripPasswordsForStorage(parsed) : [];
  } catch {
    return [];
  }
}

function accountsMetadataFingerprint(accounts: Account[]): string {
  return accounts
    .filter((a) => a.id !== "primary-google")
    .map(
      (a) =>
        `${a.id}:${a.email}:${a.type}:${a.label}:${a.color}:${a.serverUrl ?? ""}:${a.username ?? ""}`,
    )
    .sort()
    .join("|");
}

function accountsFingerprint(accounts: Account[]): string {
  return accounts
    .filter((a) => a.id !== "primary-google")
    .map((a) => `${a.id}:${a.email}:${a.connected}:${a.type}`)
    .sort()
    .join("|");
}

function ContextBindingsHint({ accountEmail }: { accountEmail: string }) {
  const bindings = inferBindingsForEmail(accountEmail);
  if (bindings.length === 0) {
    return (
      <p className="mt-2 border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
        No context repo mapped for this account. Add context (GitHub) — coming
        soon.
      </p>
    );
  }
  return (
    <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
      <p className="text-[10px] font-medium text-muted-foreground">Context repos</p>
      {bindings.map((b) => (
        <div className="text-[10px] text-muted-foreground/90" key={b.id}>
          <a
            className="text-foreground/80 hover:underline"
            href={githubRepoUrl(b.repos[0]?.fullName ?? "")}
            rel="noopener noreferrer"
            target="_blank"
          >
            {b.repos[0]?.fullName}
          </a>
          {b.streams.length > 0 ? (
            <span className="text-muted-foreground/70">
              {" "}
              → {b.streams.join(", ")}
            </span>
          ) : null}
          {b.source === "rule" && !b.confirmed ? (
            <span className="ml-1 text-muted-foreground/50">(inferred)</span>
          ) : null}
        </div>
      ))}
      <button
        className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground/80 hover:underline"
        type="button"
      >
        Add context…
      </button>
    </div>
  );
}

export function ModernSettingsForm({
  initialPreferences,
  initialConnectedAccounts,
  initialSection,
  connectedAccountId,
  connectedEmail,
  oauthError,
  triggerSync,
  userId,
  userEmail,
  userName,
  userImage,
  userProvider,
}: ModernSettingsFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [activeSection, setActiveSection] =
    useState<SettingsSection>(initialSection ?? "appearance");

  // Fixed key — no user/email scoping. The user may log in via different Google
  // accounts; scoping by email means a different login wipes all added accounts.
  // localStorage is already per-origin so no scoping is needed.
  const ACCOUNTS_KEY = "nozero:connected-accounts";

  const [accounts, setAccounts] = useState<Account[]>(() =>
    buildAccountList(userEmail, initialConnectedAccounts),
  );

  async function persistAccounts(next: Account[]) {
    const stripped = stripPasswordsForStorage(next);
    try {
      window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(stripped));
    } catch {}
    const payload = stripped
      .filter((a) => a.id !== "primary-google")
      .map(({ hasStoredCredentials: _hasStoredCredentials, ...rest }) => rest);
    try {
      await fetch("/api/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounts: payload }),
      });
    } catch (error) {
      console.error("Failed to persist accounts:", error);
    }
  }

  async function reconnectStoredCalDavAccounts(accountList: Account[]) {
    const targets = accountList.filter(
      (a) =>
        a.type === "caldav" &&
        a.hasStoredCredentials &&
        a.email &&
        a.serverUrl &&
        a.username,
    );
    if (targets.length === 0) return;

    let anyConnected = false;
    for (const account of targets) {
      try {
        const res = await fetch("/api/accounts/caldav/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: account.id,
            email: account.email,
            serverUrl: account.serverUrl,
            username: account.username,
            label: account.label,
            color: account.color,
          }),
        });
        if (res.ok) anyConnected = true;
      } catch {
        // Best-effort reconnect on load
      }
    }

    if (anyConnected) {
      try {
        await fetch("/api/calendar/sync", { method: "POST" });
      } catch {}
      try {
        await fetch("/api/email/sync", { method: "POST" });
      } catch {}
    }
  }

  async function triggerCalendarSync() {
    try {
      const res = await fetch("/api/calendar/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({
          title: "Calendar synced",
          description: typeof data.message === "string" ? data.message : undefined,
        });
      } else {
        toast({
          title: "Sync failed",
          description: data.message ?? "Could not sync Google Calendar",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Sync failed",
        description: "Could not reach the sync endpoint",
        variant: "destructive",
      });
    }
  }

  // After returning from Google OAuth, mark the account as connected and clean URL.
  // Read directly from localStorage (not React state) to avoid stale-closure/Strict-Mode issues.
  useEffect(() => {
    if (oauthError) {
      toast({ title: "Google connection failed", description: oauthError, variant: "destructive" });
      window.history.replaceState({}, "", "/settings?section=accounts");
      return;
    }
    if (!connectedAccountId) return;
    const email = connectedEmail ?? "";

    let current = readAccountsFromLocalStorage(ACCOUNTS_KEY);
    if (current.length === 0) {
      current = [primaryGoogleAccount(userEmail)];
    }

    const byId = connectedAccountId !== "new" ? current.find((a) => a.id === connectedAccountId) : undefined;
    const byEmail = email ? current.find((a) => a.email === email && a.id !== "primary-google") : undefined;
    const target = byId ?? byEmail;

    let next: Account[];
    if (target) {
      next = current.map((a) => a.id === target.id ? { ...a, connected: true, email: email || a.email } : a);
    } else {
      next = [...current, { id: `acct-${Date.now()}`, email, type: "google" as AccountType, label: "Google Calendar & Gmail", connected: true, color: "#4285F4" }];
    }

    next = mergeAccountLists(userEmail, initialConnectedAccounts, next);

    persistAccounts(next);
    setAccounts(next);
    toast({ title: "Google account connected" });
    window.history.replaceState({}, "", "/settings?section=accounts");
    if (triggerSync) {
      void triggerCalendarSync();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedAccountId, oauthError, triggerSync]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isConnectingCalDav, setIsConnectingCalDav] = useState(false);
  // For the add-account form
  const [newAccountType, setNewAccountType] = useState<AccountType | null>(null);
  const [calDavPreset, setCalDavPreset] = useState<"icloud" | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Account>>({});

  const { theme, setTheme } = useTheme();
  const [themeMounted, setThemeMounted] = useState(false);

  useEffect(() => {
    setThemeMounted(true);
  }, []);

  const didReconnectRef = useRef(false);

  // Hydrate accounts from localStorage + API (server props alone miss client-only data).
  useEffect(() => {
    if (connectedAccountId || oauthError) return;

    let cancelled = false;

    async function hydrateAccounts() {
      migrateLegacyAccountStorage(ACCOUNTS_KEY, userId, userEmail);
      const fromStorage = readAccountsFromLocalStorage(ACCOUNTS_KEY);

      let fromApi: Account[] = [];
      try {
        const res = await fetch("/api/accounts");
        if (res.ok) {
          const data = (await res.json()) as { accounts?: Account[] };
          fromApi = Array.isArray(data.accounts) ? data.accounts : [];
        }
      } catch {
        // Fall back to SSR props + localStorage
      }

      const merged = mergeAccountLists(
        userEmail,
        initialConnectedAccounts,
        fromStorage,
        fromApi,
      );

      if (cancelled) return;

      setAccounts((prev) => {
        const prevFp = accountsFingerprint(prev);
        const mergedFp = accountsFingerprint(merged);
        if (prevFp === mergedFp) return prev;
        return merged;
      });

      const serverBase = fromApi.length ? fromApi : initialConnectedAccounts;
      const serverFp = accountsMetadataFingerprint(
        buildAccountList(userEmail, serverBase),
      );
      const mergedMetaFp = accountsMetadataFingerprint(merged);
      if (mergedMetaFp !== serverFp) {
        void persistAccounts(merged);
      }

      if (!didReconnectRef.current) {
        didReconnectRef.current = true;
        void reconnectStoredCalDavAccounts(merged);
      }
    }

    void hydrateAccounts();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail, userId]);

  // User profile edit state
  const [displayName, setDisplayName] = useState(userName);
  const [eventSectionOrder, setEventSectionOrder] = useState<
    EventDetailSectionId[]
  >(() => parseEventSectionOrder(initialPreferences.eventSectionOrder));

  const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      defaultView: initialPreferences.defaultView || "month",
      showWeekends: initialPreferences.showWeekends !== false,
      showWeekNumbers: initialPreferences.showWeekNumbers,
      defaultDuration: initialPreferences.defaultDuration || "60",
      timezone: initialPreferences.timezone || detectedTimezone,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!userId) {
      toast({
        title: "Error",
        description: "You must be logged in",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          preferences: { ...values, eventSectionOrder },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save preferences");
      }
      toast({
        title: "Settings saved",
        description: "Your preferences have been updated",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to save preferences",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  // ── Accounts helpers ──────────────────────────────────────────
  function startEdit(account: Account) {
    setEditingId(account.id);
    setEditDraft({ ...account });
    setNewAccountType(null);
    setCalDavPreset(isICloudCalDav(account) ? "icloud" : null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft({});
    setNewAccountType(null);
    setCalDavPreset(null);
  }

  function selectNewAccountType(option: AccountPickerOption) {
    if (option === "icloud") {
      setNewAccountType("caldav");
      setCalDavPreset("icloud");
      setEditDraft({
        type: "caldav",
        color: "#0071E3",
        label: "iCloud Calendar",
        serverUrl: ICLOUD_CALDAV_SERVER,
      });
      return;
    }
    if (option === "caldav") {
      setNewAccountType("caldav");
      setCalDavPreset(null);
      setEditDraft({ type: "caldav", color: "#8B5CF6", label: "CalDAV" });
      return;
    }
    setCalDavPreset(null);
    setNewAccountType(option);
    setEditDraft({
      type: option,
      color: "#4285F4",
      label: option === "google" ? "Google Calendar & Gmail" : "IMAP",
    });
  }

  async function saveEdit() {
    const account = accounts.find((a) => a.id === editingId);
    if (!account) return;

    const merged: Account = {
      ...account,
      ...editDraft,
      password: "",
    };

    const passwordInput = editDraft.password?.trim() ?? "";
    const credsChanged =
      account.type === "caldav" &&
      account.connected &&
      (Boolean(passwordInput) ||
        (editDraft.serverUrl !== undefined &&
          editDraft.serverUrl !== account.serverUrl) ||
        (editDraft.username !== undefined &&
          editDraft.username !== account.username) ||
        (editDraft.email !== undefined && editDraft.email !== account.email));

    if (credsChanged) {
      setIsConnectingCalDav(true);
      try {
        const res = await fetch("/api/accounts/caldav/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: account.id,
            email: merged.email,
            serverUrl: merged.serverUrl ?? "",
            username: merged.username ?? "",
            ...(passwordInput ? { password: passwordInput } : {}),
            label: merged.label,
            color: merged.color,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Failed to update CalDAV",
          );
        }
        merged.connected = true;
      } catch (error) {
        toast({
          title: "CalDAV update failed",
          description:
            error instanceof Error ? error.message : "Could not update credentials",
          variant: "destructive",
        });
        return;
      } finally {
        setIsConnectingCalDav(false);
      }
    }

    const next = accounts.map((a) => (a.id === editingId ? merged : a));
    setAccounts(next);
    await persistAccounts(next);
    toast({ title: "Account updated" });
    cancelEdit();
  }

  async function deleteAccount(id: string) {
    const target = accounts.find((a) => a.id === id);
    const next = accounts.filter((a) => a.id !== id);
    setAccounts(next);
    void persistAccounts(next);
    if (id !== "primary-google") {
      try {
        await fetch(
          `/api/accounts?accountId=${encodeURIComponent(id)}&email=${encodeURIComponent(target?.email ?? "")}`,
          { method: "DELETE" },
        );
      } catch (error) {
        console.error("Failed to remove account tokens:", error);
      }
    }
    toast({ title: "Account removed" });
    if (editingId === id) cancelEdit();
  }

  function addAccount() {
    if (!newAccountType) return;
    const draft = editDraft as Partial<Account>;
    const newAcc: Account = {
      id: `acct-${Date.now()}`,
      email: draft.email || "",
      type: newAccountType,
      label: draft.label || (newAccountType === "google" ? "Google Calendar & Gmail" : newAccountType === "caldav" ? (calDavPreset === "icloud" ? "iCloud Calendar" : "CalDAV") : "IMAP"),
      connected: false,
      color: draft.color || "#4285F4",
      serverUrl: draft.serverUrl || "",
      username: draft.username || "",
      password: draft.password || "",
    };
    const next = [...accounts, newAcc];
    setAccounts(next);
    void persistAccounts(next);
    toast({ title: "Account added" });
    cancelEdit();
  }

  async function connectCalDavAccount(account: Account) {
    const isICloud =
      calDavPreset === "icloud" ||
      isICloudCalDav(account) ||
      isICloudCalDav(editDraft);
    const serverUrl =
      editDraft.serverUrl ??
      account.serverUrl ??
      (isICloud ? ICLOUD_CALDAV_SERVER : "");
    const username = editDraft.username ?? account.username ?? "";
    const passwordInput = (editDraft.password ?? account.password ?? "").trim();
    const canReuseStoredPassword =
      !passwordInput &&
      (account.hasStoredCredentials === true || account.connected);

    if (!serverUrl || !username || (!passwordInput && !canReuseStoredPassword)) {
      toast({
        title: "Missing CalDAV details",
        description: account.connected
          ? "Server URL and username are required."
          : "Server URL, username, and password are required.",
        variant: "destructive",
      });
      return;
    }

    setIsConnectingCalDav(true);
    try {
      const res = await fetch("/api/accounts/caldav/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: account.id,
          email: editDraft.email ?? account.email,
          serverUrl,
          username,
          ...(passwordInput ? { password: passwordInput } : {}),
          label: editDraft.label ?? account.label,
          color: editDraft.color ?? account.color,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "CalDAV connection failed",
        );
      }

      const connectedAccount: Account = {
        ...account,
        ...editDraft,
        connected: true,
        serverUrl,
        username,
        password: "",
      };

      let nextAccounts: Account[] = [];
      setAccounts((prev) => {
        nextAccounts = prev.some((a) => a.id === account.id)
          ? prev.map((a) => (a.id === account.id ? connectedAccount : a))
          : [...prev, connectedAccount];
        return nextAccounts;
      });
      await persistAccounts(nextAccounts);
      const connectedICloud = isICloudCalDav({
        serverUrl,
        label: editDraft.label ?? account.label,
      });
      toast({
        title: connectedICloud ? "iCloud connected" : "CalDAV connected",
        description: `Found ${data.calendarCount ?? 0} calendar(s). Syncing events…`,
      });
      cancelEdit();
      await triggerCalendarSync();
    } catch (error) {
      toast({
        title: "CalDAV connection failed",
        description:
          error instanceof Error ? error.message : "Could not connect to server",
        variant: "destructive",
      });
    } finally {
      setIsConnectingCalDav(false);
    }
  }

  // Inline edit form for an account
  function renderEditForm(account?: Account) {
    const isNew = !account;
    const type = isNew ? newAccountType! : account!.type;
    const isPrimary = account?.id === "primary-google";
    const isICloud =
      calDavPreset === "icloud" ||
      isICloudCalDav(isNew ? editDraft : { ...account, ...editDraft });
    const connectAccent = isICloud
      ? "bg-sky-600 hover:bg-sky-700"
      : "bg-violet-500 hover:bg-violet-600";

    return (
      <div className="mt-3 space-y-3 border-t border-border pt-3">
        {/* Label */}
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">Label</label>
          <input
            className="h-8 w-full rounded-lg border border-border bg-muted/50 px-3 text-xs text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
            onChange={(e) => setEditDraft((d) => ({ ...d, label: e.target.value }))}
            placeholder="Account label"
            value={editDraft.label ?? account?.label ?? ""}
          />
        </div>

        {/* Color picker */}
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">Color</label>
          <div className="flex gap-2">
            {ACCOUNT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setEditDraft((d) => ({ ...d, color: c }))}
                className={cn(
                  "h-5 w-5 rounded-full transition-all",
                  (editDraft.color ?? account?.color) === c
                    ? "ring-2 ring-white/60 ring-offset-1 ring-offset-black/40"
                    : ""
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Type-specific fields */}
        {type === "google" && (
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Email</label>
              {isNew ? (
                <input
                  className="h-8 w-full rounded-lg border border-border bg-muted/50 px-3 text-xs text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
                  onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
                  placeholder="email@gmail.com"
                  value={editDraft.email ?? ""}
                />
              ) : (
                <p className="h-8 flex items-center px-3 rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground">
                  {account?.email}
                </p>
              )}
            </div>
            {isPrimary && (
              <p className="text-[10px] text-emerald-400/70">Connected via Google OAuth (primary login)</p>
            )}
            {!isNew && account?.connected && (
              <AccountCalendarSubscriptions
                accountId={account.id}
                connected={account.connected}
              />
            )}
          </div>
        )}

        {(type === "caldav" || type === "imap") && (
          <div className="space-y-2">
            {isICloud && type === "caldav" && (
              <div className="space-y-1.5 rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-[10px] text-muted-foreground">
                <p className="font-medium text-foreground/90">
                  Use an Apple app-specific password
                </p>
                <p>
                  Your normal Apple ID password will not work. Create one at{" "}
                  <a
                    className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                    href="https://appleid.apple.com/account/manage"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    appleid.apple.com
                  </a>{" "}
                  under Sign-In and Security → App-Specific Passwords.
                </p>
              </div>
            )}
            {isNew && (
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Email</label>
                <input
                  className="h-8 w-full rounded-lg border border-border bg-muted/50 px-3 text-xs text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
                  onChange={(e) => {
                    const email = e.target.value;
                    setEditDraft((d) => ({
                      ...d,
                      email,
                      ...(isICloud ? { username: email } : {}),
                    }));
                  }}
                  placeholder={isICloud ? "you@icloud.com" : "email@domain.com"}
                  value={editDraft.email ?? ""}
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Server URL</label>
              {isICloud && type === "caldav" ? (
                <p className="flex h-8 items-center rounded-lg border border-border bg-muted/30 px-3 text-xs text-muted-foreground">
                  {ICLOUD_CALDAV_SERVER}
                </p>
              ) : (
                <input
                  className="h-8 w-full rounded-lg border border-border bg-muted/50 px-3 text-xs text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
                  onChange={(e) => setEditDraft((d) => ({ ...d, serverUrl: e.target.value }))}
                  placeholder={type === "caldav" ? "https://caldav.example.com" : "imap.example.com"}
                  value={editDraft.serverUrl ?? account?.serverUrl ?? ""}
                />
              )}
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Username</label>
              <input
                className="h-8 w-full rounded-lg border border-border bg-muted/50 px-3 text-xs text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
                onChange={(e) => setEditDraft((d) => ({ ...d, username: e.target.value }))}
                placeholder={isICloud ? "Apple ID email" : "username"}
                value={editDraft.username ?? account?.username ?? ""}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">
                {isICloud && type === "caldav" ? "App-specific password" : "Password"}
              </label>
              <input
                className={settingsInput}
                onChange={(e) => setEditDraft((d) => ({ ...d, password: e.target.value }))}
                placeholder={
                  !isNew && account?.connected
                    ? "Leave blank to keep current password"
                    : isICloud && type === "caldav"
                      ? "xxxx-xxxx-xxxx-xxxx"
                      : "••••••••"
                }
                type="password"
                value={editDraft.password ?? ""}
                autoComplete="new-password"
              />
            </div>
            {!isNew && type === "caldav" && account?.connected && (
              <AccountCalendarSubscriptions
                accountId={account.id}
                connected={account.connected}
              />
            )}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          {isNew && type === "google" ? (
            <>
              <a
                href={`/api/auth/google/connect?email=${encodeURIComponent(editDraft.email ?? "")}&accountId=new`}
                className="flex flex-1 items-center justify-center gap-1.5 h-8 rounded-lg bg-[#4285F4] text-xs font-medium text-white hover:bg-[#3b78e0] transition-colors"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Connect with Google
              </a>
              <button type="button" onClick={cancelEdit} className="h-8 px-3 rounded-lg border border-border bg-muted/40 text-xs text-muted-foreground hover:bg-muted/60 transition-colors">
                Cancel
              </button>
            </>
          ) : isNew && type === "caldav" ? (
            <>
              <button
                type="button"
                disabled={isConnectingCalDav}
                onClick={async () => {
                  const email = editDraft.email?.trim();
                  if (!email) {
                    toast({
                      title: "Email required",
                      description: "Enter the email address for this CalDAV account.",
                      variant: "destructive",
                    });
                    return;
                  }
                  const newAcct: Account = {
                    id: `acct-${Date.now()}`,
                    email,
                    type: "caldav",
                    label: editDraft.label || (isICloud ? "iCloud Calendar" : "CalDAV"),
                    connected: false,
                    color: editDraft.color ?? (isICloud ? "#0071E3" : "#8B5CF6"),
                    serverUrl: editDraft.serverUrl ?? (isICloud ? ICLOUD_CALDAV_SERVER : undefined),
                    username: editDraft.username ?? (isICloud ? email : undefined),
                    password: editDraft.password ?? "",
                  };
                  let staged: Account[] = [];
                  setAccounts((prev) => {
                    staged = [...prev, newAcct];
                    return staged;
                  });
                  void persistAccounts(staged);
                  await connectCalDavAccount(newAcct);
                }}
                className={cn(
                  "h-8 flex-1 rounded-lg text-xs font-medium text-white transition-colors disabled:opacity-50",
                  connectAccent,
                )}
              >
                {isConnectingCalDav ? "Connecting…" : "Test & Connect"}
              </button>
              <button type="button" onClick={cancelEdit} className="h-8 px-3 rounded-lg border border-border bg-muted/40 text-xs text-muted-foreground hover:bg-muted/60 transition-colors">
                Cancel
              </button>
            </>
          ) : isNew ? (
            <button
              type="button"
              onClick={addAccount}
              className="h-8 flex-1 rounded-lg bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Add Account
            </button>
          ) : type === "caldav" ? (
            <>
              <button
                type="button"
                disabled={isConnectingCalDav}
                onClick={() => connectCalDavAccount(account!)}
                className={cn(
                  "h-8 flex-1 rounded-lg text-xs font-medium text-white transition-colors disabled:opacity-50",
                  connectAccent,
                )}
              >
                {isConnectingCalDav ? "Connecting…" : account?.connected ? "Reconnect" : "Test & Connect"}
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="h-8 px-3 rounded-lg border border-border bg-muted/40 text-xs text-muted-foreground hover:bg-muted/60 transition-colors"
              >
                Save
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={saveEdit}
              className="h-8 flex-1 rounded-lg bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Save
            </button>
          )}
          {!isNew || (type !== "google" && type !== "caldav") ? (
            <button
              type="button"
              onClick={cancelEdit}
              className="h-8 flex-1 rounded-lg border border-border bg-muted/40 text-xs text-muted-foreground hover:bg-muted/60 transition-colors"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col overflow-hidden md:h-screen md:flex-row">
      {/* Navigation Rail */}
      <div className="flex flex-shrink-0 flex-col border-border border-b md:w-[220px] md:border-r md:border-b-0">
        <div className="border-border border-b px-4 pt-5 pb-4 md:p-5">
          <Link
            className="flex items-center gap-2.5 text-muted-foreground transition-colors hover:text-foreground"
            href="/calendar"
          >
            <ArrowLeftIcon className="h-4 w-4 md:h-3.5 md:w-3.5" />
            <span className="font-medium text-xs">Back to Calendar</span>
          </Link>
          <div className="mt-4 flex items-start justify-between gap-3 md:block">
            <div>
              <h1 className="font-bold text-xl tracking-tight md:text-lg">
                Settings
              </h1>
              <p className="mt-1 text-muted-foreground text-xs md:hidden">
                Personalize Zero for smaller screens and daily flow.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-border bg-muted/40 px-2.5 py-1.5 md:hidden">
              <InitialsAvatar name={userName} image={userImage} size="sm" />
              <div className="min-w-0">
                <p className="max-w-[7rem] truncate font-medium text-[11px] text-foreground">
                  {userName}
                </p>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto px-4 py-3 md:flex-1 md:flex-col md:space-y-0.5 md:overflow-visible md:p-3">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              className={cn(
                "flex flex-shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-left font-medium text-xs transition-all md:w-full",
                activeSection === id
                  ? "liquid-glass-subtle text-foreground"
                  : "text-muted-foreground hover:bg-muted/30 hover:text-foreground/80"
              )}
              key={id}
              onClick={() => setActiveSection(id)}
              type="button"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </nav>

        {/* User Card */}
        <div className="hidden border-border border-t p-3 md:block">
          <div className="flex items-center gap-2.5 rounded-xl px-3 py-2">
            <InitialsAvatar name={userName} image={userImage} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground text-xs">
                {userName}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">{userEmail}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-6 md:px-8 md:py-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              {/* Appearance Section */}
              {activeSection === "appearance" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-bold text-lg md:text-base">
                      Appearance
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground md:text-xs">
                      Customize how your calendar looks
                    </p>
                  </div>

                  {/* Theme picker */}
                  <div className={settingsCard}>
                    <div className={settingsRow}>
                      <div>
                        <p className="font-medium text-sm text-foreground/90 md:text-xs">Theme</p>
                        <p className="text-muted-foreground text-xs md:text-[10px]">Choose light, dark, or follow your system</p>
                      </div>
                      <div className="flex gap-1.5 rounded-xl border border-border bg-muted/50 p-1">
                        {(["light", "dark", "system"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTheme(t)}
                            className={cn(
                              "rounded-lg px-3 py-1.5 text-[11px] font-medium capitalize transition-all",
                              themeMounted && theme === t
                                ? "bg-foreground text-background shadow-sm"
                                : "text-foreground/40 hover:text-foreground/60"
                            )}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className={settingsCard}>
                    <FormField
                      control={form.control}
                      name="defaultView"
                      render={({ field }) => (
                        <FormItem>
                          <div className={settingsRow}>
                            <FormLabel className="font-medium text-sm text-foreground/90 md:text-xs">
                              Default View
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger
                                  className={cn(
                                    settingsSelectTrigger,
                                    "sm:w-36 md:w-32"
                                  )}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent
                                className={cn(
                                  settingsSelectContent,
                                  "max-h-[280px]"
                                )}
                              >
                                <SelectItem value="month">Month</SelectItem>
                                <SelectItem value="week">Week</SelectItem>
                                <SelectItem value="day">Day</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className={settingsDivider} />

                    <FormField
                      control={form.control}
                      name="showWeekends"
                      render={({ field }) => (
                        <FormItem>
                          <div className={settingsRow}>
                            <div>
                              <FormLabel className="font-medium text-sm text-foreground/90 md:text-xs">
                                Show Weekends
                              </FormLabel>
                              <p className="text-muted-foreground text-xs md:text-[10px]">
                                Display Saturday and Sunday
                              </p>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </div>
                        </FormItem>
                      )}
                    />

                    <div className={settingsDivider} />

                    <FormField
                      control={form.control}
                      name="showWeekNumbers"
                      render={({ field }) => (
                        <FormItem>
                          <div className={settingsRow}>
                            <div>
                              <FormLabel className="font-medium text-sm text-foreground/90 md:text-xs">
                                Week Numbers
                              </FormLabel>
                              <p className="text-muted-foreground text-xs md:text-[10px]">
                                Show week number in calendar
                              </p>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button
                    className={settingsPrimarySubmit}
                    disabled={isLoading}
                    type="submit"
                  >
                    {isLoading ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              )}

              {/* Time & Events Section */}
              {activeSection === "time" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-bold text-lg md:text-base">
                      Time & Events
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground md:text-xs">
                      Configure time and event defaults
                    </p>
                  </div>

                  <div className={settingsCard}>
                    <FormField
                      control={form.control}
                      name="timezone"
                      render={({ field }) => (
                        <FormItem>
                          <div className={settingsRow}>
                            <div>
                              <FormLabel className="font-medium text-sm text-foreground/90 md:text-xs">
                                Timezone
                              </FormLabel>
                              <p className="text-muted-foreground text-xs md:text-[10px]">
                                Detected: {detectedTimezone}
                              </p>
                            </div>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger
                                  className={cn(
                                    settingsSelectTrigger,
                                    "sm:w-64 md:w-48"
                                  )}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent
                                className={cn(
                                  settingsSelectContent,
                                  "max-h-[55dvh] min-w-[var(--anchor-width)] sm:max-w-none"
                                )}
                              >
                                {Intl.supportedValuesOf("timeZone").map(
                                  (tz) => (
                                    <SelectItem key={tz} value={tz}>
                                      {tz.replace(/_/g, " ")}
                                    </SelectItem>
                                  )
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className={settingsDivider} />

                    <FormField
                      control={form.control}
                      name="defaultDuration"
                      render={({ field }) => (
                        <FormItem>
                          <div className={settingsRow}>
                            <div>
                              <FormLabel className="font-medium text-sm text-foreground/90 md:text-xs">
                                Default Duration
                              </FormLabel>
                              <p className="text-muted-foreground text-xs md:text-[10px]">
                                For newly created events
                              </p>
                            </div>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger
                                  className={cn(
                                    settingsSelectTrigger,
                                    "sm:w-36 md:w-32"
                                  )}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent
                                className={cn(
                                  settingsSelectContent,
                                  "max-h-[280px]"
                                )}
                              >
                                <SelectItem value="30">30 min</SelectItem>
                                <SelectItem value="60">1 hour</SelectItem>
                                <SelectItem value="90">1.5 hours</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className={settingsCard}>
                    <div className="space-y-3">
                      <div>
                        <p className="font-medium text-sm text-foreground/90 md:text-xs">
                          Event panel section order
                        </p>
                        <p className="text-muted-foreground text-xs md:text-[10px]">
                          Reorder What, Where, and When for all calendars
                        </p>
                      </div>
                      <ul className="space-y-2">
                        {eventSectionOrder.map((sectionId, index) => (
                          <li
                            className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2"
                            key={sectionId}
                          >
                            <span className="text-xs text-foreground/90">
                              {EVENT_SECTION_LABELS[sectionId]}
                            </span>
                            <div className="flex items-center gap-1">
                              <Button
                                aria-label={`Move ${EVENT_SECTION_LABELS[sectionId]} up`}
                                className="h-7 w-7"
                                disabled={index === 0}
                                onClick={() =>
                                  setEventSectionOrder((current) =>
                                    moveSection(current, sectionId, "up"),
                                  )
                                }
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <ChevronUpIcon className="h-4 w-4" />
                              </Button>
                              <Button
                                aria-label={`Move ${EVENT_SECTION_LABELS[sectionId]} down`}
                                className="h-7 w-7"
                                disabled={
                                  index === eventSectionOrder.length - 1
                                }
                                onClick={() =>
                                  setEventSectionOrder((current) =>
                                    moveSection(current, sectionId, "down"),
                                  )
                                }
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <ChevronDownIcon className="h-4 w-4" />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <Button
                        className="h-8 text-xs"
                        onClick={() =>
                          setEventSectionOrder([
                            ...DEFAULT_EVENT_SECTION_ORDER,
                          ])
                        }
                        type="button"
                        variant="outline"
                      >
                        Reset to default
                      </Button>
                    </div>
                  </div>

                  <Button
                    className={settingsPrimarySubmit}
                    disabled={isLoading}
                    type="submit"
                  >
                    {isLoading ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              )}
            </form>
          </Form>

          {/* Accounts Section (CRUD) */}
          {activeSection === "accounts" && (
            <div className="space-y-6">
              <div>
                <h2 className="font-bold text-lg md:text-base">Accounts</h2>
                <p className="mt-1 text-sm text-muted-foreground md:text-xs">
                  Your login account and connected email &amp; calendar accounts
                </p>
              </div>

              {/* Primary (login) account */}
              <div className="liquid-glass-subtle rounded-2xl p-4 md:p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <InitialsAvatar name={userName} image={userImage} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-xs text-foreground">{userName}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{userEmail}</p>
                  </div>
                  <span className="flex-shrink-0 rounded-lg bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
                    Primary
                  </span>
                </div>
                <div className="h-px bg-muted/40" />
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground font-medium">Display Name</label>
                  <input
                    className="h-9 w-full rounded-xl border border-border bg-muted/50 px-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-ring focus:ring-1 focus:ring-ring/30 md:text-xs"
                    onChange={(e) => setDisplayName(e.target.value)}
                    value={displayName}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/80">
                  This is your nozero login account. Email is managed by Google OAuth and cannot be changed here.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => toast({ title: "Name updated" })}
                    className="h-8 flex-1 rounded-xl bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={async () => { await authClient.signOut(); window.location.href = "/"; }}
                    className="h-8 flex-1 rounded-xl border border-red-500/20 bg-red-500/10 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </div>

              <div className="liquid-glass-subtle rounded-2xl p-4">
                <p className="mb-1 font-medium text-xs text-foreground">Krisp</p>
                <p className="mb-3 text-[10px] leading-relaxed text-muted-foreground">
                  Connect Krisp for meeting transcripts and action items in Context.
                </p>
                <a
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-[11px] text-foreground/80 hover:bg-white/[0.1] transition-colors"
                  href="/api/accounts/krisp/connect"
                >
                  Connect Krisp
                </a>
              </div>

              {/* Additional accounts */}
              <div>
                <p className="mb-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Connected Accounts</p>
                <div className="space-y-3">
                  {accounts.filter((a) => a.id !== "primary-google").map((account) => (
                    <div key={account.id} className="liquid-glass-subtle rounded-2xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: account.color }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-xs text-foreground">{account.email || account.label}</p>
                          <p className="text-[10px] text-muted-foreground">{account.label}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {account.connected ? (
                            <span className="flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 inline-block" />
                              Connected
                            </span>
                          ) : account.type === "google" ? (
                            <a
                              href={`/api/auth/google/connect?email=${encodeURIComponent(account.email)}&accountId=${encodeURIComponent(account.id)}`}
                              className="flex items-center gap-1 rounded-lg bg-[#4285F4]/15 px-2 py-0.5 text-[10px] text-[#4285F4] hover:bg-[#4285F4]/25 transition-colors"
                            >
                              Connect
                            </a>
                          ) : account.type === "caldav" ? (
                            <button
                              type="button"
                              onClick={() => startEdit(account)}
                              className="flex items-center gap-1 rounded-lg bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300 hover:bg-violet-500/25 transition-colors"
                            >
                              Connect
                            </button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/80">Not connected</span>
                          )}
                          <button
                            type="button"
                            onClick={() => editingId === account.id ? cancelEdit() : startEdit(account)}
                            className="ml-1 flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground/80"
                          >
                            <PencilIcon className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteAccount(account.id)}
                            className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-red-500/10 hover:text-red-400"
                          >
                            <TrashIcon className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      {editingId === account.id && renderEditForm(account)}
                      {account.connected ? (
                        <ContextBindingsHint accountEmail={account.email} />
                      ) : null}
                    </div>
                  ))}

                  {/* Add account form */}
                  {editingId === "new" && newAccountType && (
                    <div className="liquid-glass-subtle rounded-2xl p-4">
                      <p className="font-medium text-xs text-foreground/90 mb-3">
                        New {newAccountTypeLabel(newAccountType, calDavPreset === "icloud")} Account
                      </p>
                      {renderEditForm()}
                    </div>
                  )}

                  {/* Add account button / type selector */}
                {editingId !== "new" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId("new");
                      setNewAccountType(null);
                      setCalDavPreset(null);
                      setEditDraft({});
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground/80"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    Add Account
                  </button>
                ) : !newAccountType ? (
                  <div className="liquid-glass-subtle rounded-2xl p-4 space-y-3">
                    <p className="text-xs text-muted-foreground font-medium">Select account type</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {ACCOUNT_PICKER_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => selectNewAccountType(option.id)}
                          className="rounded-xl border border-border bg-muted/40 py-2.5 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground/90 transition-colors"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="w-full text-[10px] text-muted-foreground/80 hover:text-muted-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
                </div>
              </div>

              <AccountCodesSettings
                connectedAccounts={accounts
                  .filter((a) => a.connected && a.email)
                  .map((a) => ({ email: a.email, label: a.label }))}
                userEmail={userEmail}
                userId={userId}
              />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
