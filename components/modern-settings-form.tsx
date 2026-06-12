"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeftIcon,
  ClockIcon,
  PaletteIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
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

/** Opaque menu surface (settings selects sit over glass cards; avoid see-through popovers). */
const settingsSelectContent =
  "rounded-xl border border-white/[0.14] !bg-[#101010] text-popover-foreground shadow-2xl ring-1 ring-white/12";
const settingsSelectTrigger =
  "h-10 w-full rounded-xl border-white/[0.1] bg-white/[0.07] px-3 text-xs hover:bg-white/[0.1] md:h-8 md:rounded-lg md:text-[11px]";
const settingsCard = "liquid-glass-subtle space-y-5 rounded-2xl p-4 md:p-5";
const settingsRow =
  "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between";

const formSchema = z.object({
  defaultView: z.enum(["month", "week", "day"]),
  showWeekends: z.boolean(),
  showWeekNumbers: z.boolean(),
  defaultDuration: z.enum(["30", "60", "90"]),
  timezone: z.string().default("UTC"),
});

interface ModernSettingsFormProps {
  initialPreferences: any;
  initialSection?: "appearance" | "time" | "accounts";
  connectedAccountId?: string;
  connectedEmail?: string;
  oauthError?: string;
  userEmail: string;
  userId: string;
  userImage: string;
  userName: string;
  userProvider: string;
}

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
  password?: string;
};

const ACCOUNT_COLORS = [
  "#4285F4",
  "#34A853",
  "#8B5CF6",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
];

export function ModernSettingsForm({
  initialPreferences,
  initialSection,
  connectedAccountId,
  connectedEmail,
  oauthError,
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

  const [accounts, setAccounts] = useState<Account[]>(() => {
    const primary: Account = {
      id: "primary-google",
      email: userEmail,
      type: "google",
      label: "Google Calendar & Gmail",
      connected: true,
      color: "#4285F4",
    };
    if (typeof window === "undefined") return [primary];

    // One-time migration from old keying schemes — only if fixed key is absent
    try {
      const alreadyMigrated = window.localStorage.getItem(ACCOUNTS_KEY);
      if (!alreadyMigrated) {
        const candidates = [
          userId ? `nozero:accounts:${userId}` : null,
          userEmail ? `nozero:accounts:${userEmail}` : null,
        ].filter(Boolean) as string[];
        for (const legacyKey of candidates) {
          const legacyStored = window.localStorage.getItem(legacyKey);
          if (legacyStored) {
            window.localStorage.setItem(ACCOUNTS_KEY, legacyStored);
            break;
          }
        }
      }
      // Always clean up legacy keys so they can't cause trouble later
      if (userId) window.localStorage.removeItem(`nozero:accounts:${userId}`);
      if (userEmail) window.localStorage.removeItem(`nozero:accounts:${userEmail}`);
    } catch {}

    try {
      const stored = window.localStorage.getItem(ACCOUNTS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Account[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Always sync primary email to the currently logged-in user
          const hasPrimary = parsed.some((a) => a.id === "primary-google");
          return hasPrimary
            ? parsed.map((a) => a.id === "primary-google" ? { ...a, email: userEmail, connected: true } : a)
            : [primary, ...parsed.filter((a) => a.id !== "primary-google")];
        }
      }
    } catch {}
    return [primary];
  });

  function persistAccounts(next: Account[]) {
    try { window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next)); } catch {}
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

    let current: Account[] = [];
    try {
      const stored = window.localStorage.getItem(ACCOUNTS_KEY);
      if (stored) current = JSON.parse(stored) as Account[];
    } catch {}
    if (current.length === 0) {
      current = [{ id: "primary-google", email: userEmail, type: "google", label: "Google Calendar & Gmail", connected: true, color: "#4285F4" }];
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

    persistAccounts(next);
    setAccounts(next);
    toast({ title: "Google account connected" });
    window.history.replaceState({}, "", "/settings?section=accounts");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedAccountId, oauthError]);

  const [editingId, setEditingId] = useState<string | null>(null);
  // For the add-account form
  const [newAccountType, setNewAccountType] = useState<AccountType | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Account>>({});

  const { theme, setTheme } = useTheme();

  // User profile edit state
  const [displayName, setDisplayName] = useState(userName);

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
        body: JSON.stringify({ userId, preferences: values }),
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
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft({});
    setNewAccountType(null);
  }

  function saveEdit() {
    const next = accounts.map((a) => a.id === editingId ? { ...a, ...editDraft } : a);
    setAccounts(next);
    persistAccounts(next);
    toast({ title: "Account updated" });
    cancelEdit();
  }

  function deleteAccount(id: string) {
    const next = accounts.filter((a) => a.id !== id);
    setAccounts(next);
    persistAccounts(next);
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
      label: draft.label || (newAccountType === "google" ? "Google Calendar & Gmail" : newAccountType === "caldav" ? "CalDAV" : "IMAP"),
      connected: false,
      color: draft.color || "#4285F4",
      serverUrl: draft.serverUrl || "",
      username: draft.username || "",
      password: draft.password || "",
    };
    const next = [...accounts, newAcc];
    setAccounts(next);
    persistAccounts(next);
    toast({ title: "Account added" });
    cancelEdit();
  }

  // Inline edit form for an account
  function renderEditForm(account?: Account) {
    const isNew = !account;
    const type = isNew ? newAccountType! : account!.type;
    const isPrimary = account?.id === "primary-google";

    return (
      <div className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
        {/* Label */}
        <div className="space-y-1">
          <label className="text-[10px] text-white/40">Label</label>
          <input
            className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 text-xs text-white/80 placeholder-white/25 outline-none focus:border-white/20"
            onChange={(e) => setEditDraft((d) => ({ ...d, label: e.target.value }))}
            placeholder="Account label"
            value={editDraft.label ?? account?.label ?? ""}
          />
        </div>

        {/* Color picker */}
        <div className="space-y-1">
          <label className="text-[10px] text-white/40">Color</label>
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
              <label className="text-[10px] text-white/40">Email</label>
              {isNew ? (
                <input
                  className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 text-xs text-white/80 placeholder-white/25 outline-none focus:border-white/20"
                  onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
                  placeholder="email@gmail.com"
                  value={editDraft.email ?? ""}
                />
              ) : (
                <p className="h-8 flex items-center px-3 rounded-lg border border-white/[0.05] bg-white/[0.03] text-xs text-white/40">
                  {account?.email}
                </p>
              )}
            </div>
            {isPrimary && (
              <p className="text-[10px] text-emerald-400/70">Connected via Google OAuth (primary login)</p>
            )}
          </div>
        )}

        {(type === "caldav" || type === "imap") && (
          <div className="space-y-2">
            {isNew && (
              <div className="space-y-1">
                <label className="text-[10px] text-white/40">Email</label>
                <input
                  className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 text-xs text-white/80 placeholder-white/25 outline-none focus:border-white/20"
                  onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
                  placeholder="email@domain.com"
                  value={editDraft.email ?? ""}
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[10px] text-white/40">Server URL</label>
              <input
                className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 text-xs text-white/80 placeholder-white/25 outline-none focus:border-white/20"
                onChange={(e) => setEditDraft((d) => ({ ...d, serverUrl: e.target.value }))}
                placeholder={type === "caldav" ? "https://caldav.example.com" : "imap.example.com"}
                value={editDraft.serverUrl ?? account?.serverUrl ?? ""}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-white/40">Username</label>
              <input
                className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 text-xs text-white/80 placeholder-white/25 outline-none focus:border-white/20"
                onChange={(e) => setEditDraft((d) => ({ ...d, username: e.target.value }))}
                placeholder="username"
                value={editDraft.username ?? account?.username ?? ""}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-white/40">Password</label>
              <input
                className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 text-xs text-white/80 placeholder-white/25 outline-none focus:border-white/20"
                onChange={(e) => setEditDraft((d) => ({ ...d, password: e.target.value }))}
                placeholder="••••••••"
                type="password"
                value={editDraft.password ?? account?.password ?? ""}
              />
            </div>
          </div>
        )}

        {/* Actions — Google new accounts: Connect is the only CTA */}
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
              <button type="button" onClick={cancelEdit} className="h-8 px-3 rounded-lg border border-white/[0.08] bg-white/[0.04] text-xs text-white/50 hover:bg-white/[0.08] transition-colors">
                Cancel
              </button>
            </>
          ) : isNew ? (
            <button
              type="button"
              onClick={addAccount}
              className="h-8 flex-1 rounded-lg bg-white/95 text-xs font-medium text-black hover:bg-white transition-colors"
            >
              Add Account
            </button>
          ) : (
            <button
              type="button"
              onClick={saveEdit}
              className="h-8 flex-1 rounded-lg bg-white/95 text-xs font-medium text-black hover:bg-white transition-colors"
            >
              Save
            </button>
          )}
          <button
            type="button"
            onClick={cancelEdit}
            className="h-8 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] text-xs text-white/50 hover:bg-white/[0.08] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col overflow-hidden md:h-screen md:flex-row">
      {/* Navigation Rail */}
      <div className="flex flex-shrink-0 flex-col border-white/[0.06] border-b md:w-[220px] md:border-r md:border-b-0">
        <div className="border-white/[0.06] border-b px-4 pt-5 pb-4 md:p-5">
          <Link
            className="flex items-center gap-2.5 text-white/50 transition-colors hover:text-white/80"
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
              <p className="mt-1 text-white/35 text-xs md:hidden">
                Personalize Zero for smaller screens and daily flow.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 md:hidden">
              <InitialsAvatar name={userName} image={userImage} size="sm" />
              <div className="min-w-0">
                <p className="max-w-[7rem] truncate font-medium text-[11px] text-white/80">
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
                  ? "liquid-glass-subtle text-white"
                  : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
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
        <div className="hidden border-white/[0.06] border-t p-3 md:block">
          <div className="flex items-center gap-2.5 rounded-xl px-3 py-2">
            <InitialsAvatar name={userName} image={userImage} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-white/80 text-xs">
                {userName}
              </p>
              <p className="truncate text-[10px] text-white/30">{userEmail}</p>
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
                    <p className="mt-1 text-sm text-white/40 md:text-xs">
                      Customize how your calendar looks
                    </p>
                  </div>

                  {/* Theme picker */}
                  <div className={settingsCard}>
                    <div className={settingsRow}>
                      <div>
                        <p className="font-medium text-sm text-white/70 md:text-xs">Theme</p>
                        <p className="text-white/30 text-xs md:text-[10px]">Choose light, dark, or follow your system</p>
                      </div>
                      <div className="flex gap-1.5 rounded-xl border border-border bg-muted/50 p-1">
                        {(["light", "dark", "system"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTheme(t)}
                            className={cn(
                              "rounded-lg px-3 py-1.5 text-[11px] font-medium capitalize transition-all",
                              theme === t
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
                            <FormLabel className="font-medium text-sm text-white/70 md:text-xs">
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

                    <div className="h-px bg-white/[0.04]" />

                    <FormField
                      control={form.control}
                      name="showWeekends"
                      render={({ field }) => (
                        <FormItem>
                          <div className={settingsRow}>
                            <div>
                              <FormLabel className="font-medium text-sm text-white/70 md:text-xs">
                                Show Weekends
                              </FormLabel>
                              <p className="text-white/30 text-xs md:text-[10px]">
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

                    <div className="h-px bg-white/[0.04]" />

                    <FormField
                      control={form.control}
                      name="showWeekNumbers"
                      render={({ field }) => (
                        <FormItem>
                          <div className={settingsRow}>
                            <div>
                              <FormLabel className="font-medium text-sm text-white/70 md:text-xs">
                                Week Numbers
                              </FormLabel>
                              <p className="text-white/30 text-xs md:text-[10px]">
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
                    className="h-11 w-full rounded-2xl bg-white font-medium text-black text-sm hover:bg-white/90 md:h-9 md:rounded-xl md:text-xs"
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
                    <p className="mt-1 text-sm text-white/40 md:text-xs">
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
                              <FormLabel className="font-medium text-sm text-white/70 md:text-xs">
                                Timezone
                              </FormLabel>
                              <p className="text-white/30 text-xs md:text-[10px]">
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

                    <div className="h-px bg-white/[0.04]" />

                    <FormField
                      control={form.control}
                      name="defaultDuration"
                      render={({ field }) => (
                        <FormItem>
                          <div className={settingsRow}>
                            <div>
                              <FormLabel className="font-medium text-sm text-white/70 md:text-xs">
                                Default Duration
                              </FormLabel>
                              <p className="text-white/30 text-xs md:text-[10px]">
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

                  <Button
                    className="h-11 w-full rounded-2xl bg-white font-medium text-black text-sm hover:bg-white/90 md:h-9 md:rounded-xl md:text-xs"
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
                <p className="mt-1 text-sm text-white/40 md:text-xs">
                  Your login account and connected email &amp; calendar accounts
                </p>
              </div>

              {/* Primary (login) account */}
              <div className="liquid-glass-subtle rounded-2xl p-4 md:p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <InitialsAvatar name={userName} image={userImage} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-xs text-white/80">{userName}</p>
                    <p className="truncate text-[10px] text-white/40">{userEmail}</p>
                  </div>
                  <span className="flex-shrink-0 rounded-lg bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
                    Primary
                  </span>
                </div>
                <div className="h-px bg-white/[0.04]" />
                <div className="space-y-1.5">
                  <label className="text-[10px] text-white/40 font-medium">Display Name</label>
                  <input
                    className="h-9 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white/80 placeholder-white/25 outline-none focus:border-white/20 md:text-xs"
                    onChange={(e) => setDisplayName(e.target.value)}
                    value={displayName}
                  />
                </div>
                <p className="text-[10px] text-white/25">
                  This is your nozero login account. Email is managed by Google OAuth and cannot be changed here.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => toast({ title: "Name updated" })}
                    className="h-8 flex-1 rounded-xl bg-white/95 text-xs font-medium text-black hover:bg-white transition-colors"
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

              {/* Additional accounts */}
              <div>
                <p className="mb-3 text-[10px] font-medium text-white/40 uppercase tracking-wide">Connected Accounts</p>
                <div className="space-y-3">
                  {accounts.filter((a) => a.id !== "primary-google").map((account) => (
                    <div key={account.id} className="liquid-glass-subtle rounded-2xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: account.color }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-xs text-white/80">{account.email || account.label}</p>
                          <p className="text-[10px] text-white/35">{account.label}</p>
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
                          ) : (
                            <span className="text-[10px] text-white/25">Not connected</span>
                          )}
                          <button
                            type="button"
                            onClick={() => editingId === account.id ? cancelEdit() : startEdit(account)}
                            className="ml-1 flex h-6 w-6 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
                          >
                            <PencilIcon className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteAccount(account.id)}
                            className="flex h-6 w-6 items-center justify-center rounded-lg text-white/20 transition-colors hover:bg-red-500/10 hover:text-red-400"
                          >
                            <TrashIcon className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      {editingId === account.id && renderEditForm(account)}
                    </div>
                  ))}

                  {/* Add account form */}
                  {editingId === "new" && newAccountType && (
                    <div className="liquid-glass-subtle rounded-2xl p-4">
                      <p className="font-medium text-xs text-white/70 mb-3">
                        New {newAccountType === "google" ? "Google" : newAccountType === "caldav" ? "CalDAV" : "IMAP"} Account
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
                      setEditDraft({});
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.08] py-3 text-xs text-white/30 transition-colors hover:border-white/20 hover:text-white/50"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    Add Account
                  </button>
                ) : !newAccountType ? (
                  <div className="liquid-glass-subtle rounded-2xl p-4 space-y-3">
                    <p className="text-xs text-white/50 font-medium">Select account type</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(["google", "caldav", "imap"] as AccountType[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            setNewAccountType(t);
                            setEditDraft({ type: t, color: "#4285F4", label: t === "google" ? "Google Calendar & Gmail" : t === "caldav" ? "CalDAV" : "IMAP" });
                          }}
                          className="rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 text-xs text-white/50 hover:bg-white/[0.08] hover:text-white/70 transition-colors capitalize"
                        >
                          {t === "google" ? "Google" : t.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="w-full text-[10px] text-white/25 hover:text-white/40 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
