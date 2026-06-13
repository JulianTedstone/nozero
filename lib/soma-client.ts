import "server-only";

const TIMEOUT_MS = 4000;

export type SomaContactSuggestion = {
  email: string;
  name: string | null;
  company: string | null;
  source: "soma" | "messages";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getSomaConfig() {
  const baseUrl = process.env.NOZERO_SOMA_ANANSI_URL?.replace(/\/$/, "");
  const apiKey = process.env.NOZERO_SOMA_ANANSI_SECRET_API_KEY;
  if (!baseUrl || !apiKey) {
    return null;
  }
  return { baseUrl, apiKey };
}

async function somaFetch(url: string, apiKey: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

function extractContactRecords(payload: unknown): Record<string, unknown>[] {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ["contacts", "results", "data", "items", "messages"]) {
    const nested = payload[key];
    if (Array.isArray(nested)) {
      return nested.filter(isRecord);
    }
  }

  if (typeof payload.email === "string") {
    return [payload];
  }

  return [];
}

export function normalizeSomaContact(
  raw: Record<string, unknown>,
): Omit<SomaContactSuggestion, "source"> | null {
  const emailCandidate = [raw.email, raw.primaryEmail, raw.emailAddress].find(
    (value) => typeof value === "string" && value.includes("@"),
  );

  if (typeof emailCandidate !== "string") {
    return null;
  }

  const firstName =
    typeof raw.firstName === "string" ? raw.firstName.trim() : "";
  const lastName = typeof raw.lastName === "string" ? raw.lastName.trim() : "";
  const combinedName = [firstName, lastName].filter(Boolean).join(" ");

  const nameCandidate = [
    raw.name,
    raw.fullName,
    raw.displayName,
    combinedName || null,
  ].find((value) => typeof value === "string" && value.trim());

  const companyCandidate = [
    raw.company,
    raw.companyName,
    raw.organization,
    raw.accountName,
  ].find((value) => typeof value === "string" && value.trim());

  return {
    email: emailCandidate.trim(),
    name: typeof nameCandidate === "string" ? nameCandidate.trim() : null,
    company:
      typeof companyCandidate === "string" ? companyCandidate.trim() : null,
  };
}

function matchesQuery(
  query: string,
  contact: Omit<SomaContactSuggestion, "source">,
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

function collectNestedContacts(
  payload: unknown,
  source: SomaContactSuggestion["source"],
): SomaContactSuggestion[] {
  const records = extractContactRecords(payload);
  const collected: SomaContactSuggestion[] = [];

  for (const record of records) {
    const normalized = normalizeSomaContact(record);
    if (normalized) {
      collected.push({ ...normalized, source });
      continue;
    }

    for (const key of ["from", "to", "participant", "contact", "sender"]) {
      const nested = record[key];
      if (Array.isArray(nested)) {
        for (const item of nested) {
          if (isRecord(item)) {
            const nestedContact = normalizeSomaContact(item);
            if (nestedContact) {
              collected.push({ ...nestedContact, source });
            }
          }
        }
      } else if (isRecord(nested)) {
        const nestedContact = normalizeSomaContact(nested);
        if (nestedContact) {
          collected.push({ ...nestedContact, source });
        }
      }
    }
  }

  return collected;
}

export async function searchSomaContactsByEmail(
  email: string,
): Promise<unknown | null> {
  const config = getSomaConfig();
  if (!config) {
    return null;
  }

  const encoded = encodeURIComponent(email);
  return somaFetch(
    `${config.baseUrl}/api/contacts/search?email=${encoded}`,
    config.apiKey,
  );
}

export async function searchSomaContacts(
  query: string,
  limit = 8,
): Promise<SomaContactSuggestion[]> {
  const config = getSomaConfig();
  if (!config) {
    return [];
  }

  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const encoded = encodeURIComponent(trimmed);
  const attempts: Array<{ source: SomaContactSuggestion["source"]; url: string }> =
    [];

  if (trimmed.includes("@")) {
    attempts.push({
      source: "soma",
      url: `${config.baseUrl}/api/contacts/search?email=${encoded}`,
    });
  }

  attempts.push(
    {
      source: "soma",
      url: `${config.baseUrl}/api/contacts/search?q=${encoded}`,
    },
    {
      source: "soma",
      url: `${config.baseUrl}/api/contacts/search?query=${encoded}`,
    },
    {
      source: "messages",
      url: `${config.baseUrl}/api/messages/search?q=${encoded}`,
    },
    {
      source: "messages",
      url: `${config.baseUrl}/api/conversations/search?q=${encoded}`,
    },
  );

  const responses = await Promise.all(
    attempts.map(async ({ url, source }) => ({
      source,
      payload: await somaFetch(url, config.apiKey),
    })),
  );

  const seen = new Set<string>();
  const results: SomaContactSuggestion[] = [];

  for (const { payload, source } of responses) {
    const contacts = collectNestedContacts(payload, source);
    for (const contact of contacts) {
      if (!matchesQuery(trimmed, contact)) {
        continue;
      }

      const key = contact.email.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      results.push(contact);
      if (results.length >= limit) {
        return results;
      }
    }
  }

  return results;
}
