import "server-only";

import {
  patchUserPreferences,
  readUserPreferences,
} from "@/lib/user-preferences";

/**
 * Contacts the user has added via the email panel's "Quick New Contact" dialog.
 *
 * The Soma/Hydration CRM clients are read-only in nozero, so new contacts are
 * stored here (profiles.preferences.contacts, keyed by lower-cased email) and
 * merged into participant resolution — a locally-added person then resolves as
 * "exists" with name/title/company. Reconcile to the CRM later if/when a write
 * path is wired.
 */

export interface LocalContact {
  email: string;
  name: string | null;
  name2: string | null;
  title: string | null;
  company: string | null;
  updatedAt: string;
}

type LocalContactMap = Record<string, LocalContact>;

function coerce(raw: unknown): LocalContactMap {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  return raw as LocalContactMap;
}

export async function getLocalContacts(userId: string): Promise<LocalContactMap> {
  const prefs = await readUserPreferences(userId);
  return coerce(prefs.contacts);
}

export async function getLocalContact(
  userId: string,
  email: string,
): Promise<LocalContact | null> {
  const contacts = await getLocalContacts(userId);
  return contacts[email.trim().toLowerCase()] ?? null;
}

export async function saveLocalContact(
  userId: string,
  input: {
    email: string;
    name?: string | null;
    name2?: string | null;
    title?: string | null;
    company?: string | null;
  },
): Promise<LocalContact> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) {
    throw new Error("A valid email is required");
  }
  const contacts = await getLocalContacts(userId);
  const next: LocalContact = {
    email,
    name: input.name?.trim() || null,
    name2: input.name2?.trim() || null,
    title: input.title?.trim() || null,
    company: input.company?.trim() || null,
    updatedAt: new Date().toISOString(),
  };
  contacts[email] = next;
  await patchUserPreferences(userId, { contacts });
  return next;
}
