import "server-only";

import { searchSomaContacts } from "@/lib/soma-client";
import { createAdminClient } from "@/lib/supabase/admin";

export type ContactSuggestion = {
  email: string;
  name: string | null;
  company: string | null;
  source: "soma" | "messages" | "calendar" | "invites";
};

function matchesQuery(
  query: string,
  contact: Pick<ContactSuggestion, "email" | "name">,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) {
    return false;
  }

  if (contact.email.toLowerCase().includes(needle)) {
    return true;
  }

  return contact.name?.toLowerCase().includes(needle) ?? false;
}

async function searchLocalContactHistory(
  userId: string,
  query: string,
  limit = 8,
): Promise<ContactSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const admin = createAdminClient();
  const seen = new Set<string>();
  const results: ContactSuggestion[] = [];

  const add = (
    email: string,
    name: string | null,
    source: ContactSuggestion["source"],
  ) => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail.includes("@")) {
      return;
    }

    const key = normalizedEmail.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    const candidate = { email: normalizedEmail, name };
    if (!matchesQuery(trimmed, candidate)) {
      return;
    }

    seen.add(key);
    results.push({
      email: normalizedEmail,
      name,
      company: null,
      source,
    });
  };

  const { data: invites } = await admin
    .from("invitations")
    .select("invitee_email")
    .eq("organizer_user_id", userId)
    .ilike("invitee_email", `%${trimmed}%`)
    .limit(20);

  for (const invite of invites ?? []) {
    add(invite.invitee_email, null, "invites");
    if (results.length >= limit) {
      return results;
    }
  }

  const { data: events } = await admin
    .from("events")
    .select("data")
    .eq("user_id", userId)
    .order("start_at", { ascending: false })
    .limit(150);

  for (const event of events ?? []) {
    const data = event.data as {
      attendees?: Array<{ email?: string; name?: string }>;
    } | null;

    for (const attendee of data?.attendees ?? []) {
      if (!attendee.email) {
        continue;
      }

      add(attendee.email, attendee.name?.trim() || null, "calendar");
      if (results.length >= limit) {
        return results;
      }
    }
  }

  return results.slice(0, limit);
}

export async function suggestContacts(
  userId: string,
  query: string,
  limit = 10,
): Promise<ContactSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const [somaResults, localResults] = await Promise.all([
    searchSomaContacts(trimmed, limit),
    searchLocalContactHistory(userId, trimmed, limit),
  ]);

  const seen = new Set<string>();
  const merged: ContactSuggestion[] = [];

  for (const batch of [somaResults, localResults]) {
    for (const contact of batch) {
      const key = contact.email.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push(contact);
      if (merged.length >= limit) {
        return merged;
      }
    }
  }

  return merged;
}
