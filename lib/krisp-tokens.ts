import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export interface KrispTokenRecord {
  accessToken: string;
  refreshToken: string | null;
  tokenExpiry: string | null;
  scope: string | null;
  updatedAt: string;
}

export async function getKrispTokens(
  userId: string,
): Promise<KrispTokenRecord | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const prefs = (data.preferences ?? {}) as Record<string, unknown>;
  const raw = prefs.krispTokens;
  if (!raw || typeof raw !== "object") return null;

  const t = raw as Record<string, unknown>;
  if (typeof t.accessToken !== "string") return null;

  return {
    accessToken: t.accessToken,
    refreshToken:
      typeof t.refreshToken === "string" ? t.refreshToken : null,
    tokenExpiry:
      typeof t.tokenExpiry === "string" ? t.tokenExpiry : null,
    scope: typeof t.scope === "string" ? t.scope : null,
    updatedAt:
      typeof t.updatedAt === "string"
        ? t.updatedAt
        : new Date().toISOString(),
  };
}

export async function saveKrispTokens(
  userId: string,
  tokens: KrispTokenRecord,
): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  await admin
    .from("profiles")
    .update({
      preferences: {
        ...prefs,
        krispTokens: tokens,
      },
    })
    .eq("id", userId);
}

export async function clearKrispTokens(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  const { krispTokens: _drop, ...rest } = prefs;
  await admin.from("profiles").update({ preferences: rest }).eq("id", userId);
}
