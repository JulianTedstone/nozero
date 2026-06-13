import {
  readUserPreferences,
  removeCalDavCredentialAtomic,
  setCalDavCredentialAtomic,
} from "@/lib/user-preferences";

export type CalDavCredentialRecord = {
  serverUrl: string;
  username: string;
  password: string;
  updatedAt: string;
};

export async function getCalDavCredentials(
  userId: string,
  email: string,
): Promise<CalDavCredentialRecord | null> {
  const prefs = await readUserPreferences(userId);
  const connectedCalDav = (prefs.connectedCalDav ?? {}) as Record<
    string,
    CalDavCredentialRecord
  >;
  return connectedCalDav[email] ?? null;
}

export async function listCalDavCredentials(userId: string): Promise<
  Array<{ email: string } & CalDavCredentialRecord>
> {
  const prefs = await readUserPreferences(userId);
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
  await setCalDavCredentialAtomic(userId, email, {
    ...creds,
    updatedAt: new Date().toISOString(),
  });
}

export async function removeCalDavCredentials(userId: string, email: string) {
  await removeCalDavCredentialAtomic(userId, email);
}
