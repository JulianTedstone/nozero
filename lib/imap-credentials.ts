import {
  readUserPreferences,
  removeImapCredentialAtomic,
  setImapCredentialAtomic,
} from "@/lib/user-preferences";

export type ImapCredentialRecord = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  updatedAt: string;
};

export async function getImapCredentials(
  userId: string,
  email: string,
): Promise<ImapCredentialRecord | null> {
  const prefs = await readUserPreferences(userId);
  const connectedImap = (prefs.connectedImap ?? {}) as Record<
    string,
    ImapCredentialRecord
  >;
  return connectedImap[email] ?? null;
}

export async function listImapCredentials(userId: string): Promise<
  Array<{ email: string } & ImapCredentialRecord>
> {
  const prefs = await readUserPreferences(userId);
  const connectedImap = (prefs.connectedImap ?? {}) as Record<
    string,
    ImapCredentialRecord
  >;
  return Object.entries(connectedImap).map(([email, creds]) => ({
    email,
    ...creds,
  }));
}

export async function setImapCredentials(
  userId: string,
  email: string,
  creds: Omit<ImapCredentialRecord, "updatedAt">,
) {
  await setImapCredentialAtomic(userId, email, {
    ...creds,
    updatedAt: new Date().toISOString(),
  });
}

export async function removeImapCredentials(userId: string, email: string) {
  await removeImapCredentialAtomic(userId, email);
}

export function normalizeImapHost(serverUrl: string): {
  host: string;
  port: number;
  secure: boolean;
} {
  const trimmed = serverUrl.trim();
  if (!trimmed) {
    return { host: "", port: 993, secure: true };
  }

  try {
    const withScheme = trimmed.includes("://") ? trimmed : `imaps://${trimmed}`;
    const url = new URL(withScheme);
    const secure = url.protocol !== "imap:";
    const port = url.port
      ? Number(url.port)
      : secure
        ? 993
        : 143;
    return { host: url.hostname, port, secure };
  } catch {
    const host = trimmed.replace(/^imaps?:\/\//i, "").split("/")[0] ?? trimmed;
    return { host, port: 993, secure: true };
  }
}
