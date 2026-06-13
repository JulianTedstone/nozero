import { createAdminClient } from "@/lib/supabase/admin";

export type CalDavCredentialRecord = {
  serverUrl: string;
  username: string;
  password: string;
  updatedAt: string;
};

async function readPreferences(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.preferences ?? {}) as Record<string, unknown>;
}

async function writePreferences(
  userId: string,
  prefs: Record<string, unknown>,
) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ preferences: prefs })
    .eq("id", userId);
  if (error) throw error;
}

export async function getCalDavCredentials(
  userId: string,
  email: string,
): Promise<CalDavCredentialRecord | null> {
  const prefs = await readPreferences(userId);
  const connectedCalDav = (prefs.connectedCalDav ?? {}) as Record<
    string,
    CalDavCredentialRecord
  >;
  return connectedCalDav[email] ?? null;
}

export async function listCalDavCredentials(userId: string): Promise<
  Array<{ email: string } & CalDavCredentialRecord>
> {
  const prefs = await readPreferences(userId);
  const connectedCalDav = (prefs.connectedCalDav ?? {}) as Record<
    string,
    CalDavCredentialRecord
  >;
  return Object.entries(connectedCalDav).map(([email, creds]) => ({
    email,
    ...creds,
  }));
}

export async function setCalDavCredentials(
  userId: string,
  email: string,
  creds: Omit<CalDavCredentialRecord, "updatedAt">,
) {
  const prefs = await readPreferences(userId);
  const connectedCalDav = (prefs.connectedCalDav ?? {}) as Record<
    string,
    CalDavCredentialRecord
  >;
  connectedCalDav[email] = {
    ...creds,
    updatedAt: new Date().toISOString(),
  };
  await writePreferences(userId, { ...prefs, connectedCalDav });
}

export async function removeCalDavCredentials(userId: string, email: string) {
  const prefs = await readPreferences(userId);
  const connectedCalDav = {
    ...(prefs.connectedCalDav as Record<string, CalDavCredentialRecord> | undefined),
  };
  delete connectedCalDav[email];
  await writePreferences(userId, { ...prefs, connectedCalDav });
}
