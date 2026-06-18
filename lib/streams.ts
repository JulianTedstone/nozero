import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { StreamBinding } from "@/types/streams";

export type { StreamBinding } from "@/types/streams";

/**
 * Streams — named routing destinations that bind a Flightdeck lane to a context
 * repo + subfolder. A stream is both where a conversation is filed (repo/path)
 * and the Flightdeck lane its tasks land in. Defaults mirror the rules.yaml
 * routes; user-created streams persist in profiles.preferences.streams so they
 * appear instantly (the deterministic routing rules stay in context-schema).
 */

export const CONTEXT_REPOS = [
  "context-message-nopilot",
  "context-message-coh",
  "context-message-360",
  "context-message-ted",
  "context-message-villanelle",
  "context-profiles",
];

const DEFAULT_STREAMS: StreamBinding[] = [
  { name: "npt-nopilot", repo: "context-message-nopilot", path: "conversations" },
  { name: "npt-coh", repo: "context-message-coh", path: "conversations" },
  { name: "npt-360", repo: "context-message-360", path: "strategy/conversations" },
  {
    name: "npt-pod",
    repo: "context-message-coh",
    path: "messaging/lead-generation/podcast/guests",
  },
  { name: "npt-ted", repo: "context-profiles", path: "ted/personal/conversations" },
];

function sanitizePath(path: string): string {
  return path
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== "." && s !== "..")
    .join("/");
}

function asBindingArray(raw: unknown): StreamBinding[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (b): b is Record<string, unknown> =>
        typeof b === "object" && b !== null && !Array.isArray(b),
    )
    .map((b) => ({
      name: String(b.name ?? "").trim(),
      repo: String(b.repo ?? "").trim(),
      path: sanitizePath(String(b.path ?? "")),
    }))
    .filter((b) => b.name && b.repo);
}

async function getUserStreams(userId: string): Promise<StreamBinding[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return [];
  const prefs = (data.preferences ?? {}) as Record<string, unknown>;
  return asBindingArray(prefs.streams);
}

/** Defaults + the user's saved streams (user wins on name collision). */
export async function listStreams(userId: string): Promise<StreamBinding[]> {
  const user = await getUserStreams(userId);
  const byName = new Map<string, StreamBinding>();
  for (const s of DEFAULT_STREAMS) byName.set(s.name, s);
  for (const s of user) byName.set(s.name, s);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveStream(
  userId: string,
  name: string,
): Promise<StreamBinding | null> {
  return (await listStreams(userId)).find((s) => s.name === name) ?? null;
}

export async function addStream(
  userId: string,
  binding: StreamBinding,
): Promise<StreamBinding[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();
  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  const existing = asBindingArray(prefs.streams).filter(
    (s) => s.name !== binding.name,
  );
  const clean: StreamBinding = {
    name: binding.name.trim(),
    repo: binding.repo.trim(),
    path: sanitizePath(binding.path) || "conversations",
  };
  const next = [...existing, clean];
  await admin
    .from("profiles")
    .update({ preferences: { ...prefs, streams: next } })
    .eq("id", userId);
  return listStreams(userId);
}
