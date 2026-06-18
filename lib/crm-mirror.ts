import "server-only";

import { getLocalContacts } from "@/lib/local-contacts";
import {
  fetchContactByEmail,
  resolveCompaniesForPeople,
} from "@/lib/soma-client";
import {
  patchUserPreferences,
  readUserPreferences,
} from "@/lib/user-preferences";
import type { ContextCompany, ContextPerson } from "@/types/meeting-context";

/**
 * Local-first, fail-safe resolution against the twenty/aqua CRM link.
 *
 * Contract (do not weaken):
 *   1. Every lookup is served from the nozero mirror first (this cache + the
 *      user's local contacts). The mirror always answers, instantly.
 *   2. The aqua/Soma link is only ever a *best-effort refresh* layered on top —
 *      never a blocking, direct lookup. The underlying clients already time out
 *      (4s) and return null/[] on 401/timeout, so the link can never break or
 *      stall a nozero request.
 *   3. If the link is unavailable, the mirror keeps serving its last-known data
 *      (an outage never wipes resolved contacts), and the affected emails are
 *      recorded as pending. They are re-synced opportunistically on a later
 *      request once the link is live again — no data is lost, nothing is
 *      destructive on either side.
 */

const REFRESH_TTL_MS = 12 * 60 * 60 * 1000; // refresh cached entries older than 12h
const MAX_LIVE_PER_REQUEST = 12; // bound aqua calls per request
const MAX_PENDING = 50; // cap the deferred-resync backlog

interface ContactEntry {
  person: ContextPerson;
  at: string;
}
interface CompanyEntry {
  company: ContextCompany;
  at: string;
}
interface CrmMirror {
  contacts: Record<string, ContactEntry>;
  companies: Record<string, CompanyEntry>;
  link: { lastOkAt: string | null; lastFailAt: string | null; pending: string[] };
}

function coerceMirror(raw: unknown): CrmMirror {
  const m = (raw && typeof raw === "object" ? raw : {}) as Partial<CrmMirror>;
  return {
    contacts: m.contacts ?? {},
    companies: m.companies ?? {},
    link: {
      lastOkAt: m.link?.lastOkAt ?? null,
      lastFailAt: m.link?.lastFailAt ?? null,
      pending: Array.isArray(m.link?.pending) ? m.link.pending : [],
    },
  };
}

function placeholderPerson(email: string): ContextPerson {
  return {
    email,
    name: null,
    role: null,
    company: null,
    somaContactId: null,
    somaCompanyId: null,
    source: "attendee",
  };
}

function isFresh(at: string): boolean {
  const t = new Date(at).getTime();
  return Number.isFinite(t) && Date.now() - t < REFRESH_TTL_MS;
}

/**
 * Resolve the people + companies for a thread, mirror-first. Always returns a
 * full set aligned to `emails`; the aqua link only enriches when reachable.
 */
export async function resolveCrmContext(
  userId: string,
  emails: string[],
): Promise<{ people: ContextPerson[]; companies: ContextCompany[] }> {
  const [prefs, localContacts] = await Promise.all([
    readUserPreferences(userId),
    getLocalContacts(userId),
  ]);
  const mirror = coerceMirror((prefs as { crmMirror?: unknown }).crmMirror);
  const now = new Date().toISOString();

  const fromLocal = (email: string): ContextPerson | null => {
    const lc = localContacts[email];
    return lc
      ? {
          email,
          name: lc.name,
          role: lc.title,
          company: lc.company,
          somaContactId: null,
          somaCompanyId: null,
          source: "local",
        }
      : null;
  };

  // 1) LOCAL-FIRST — serve from the mirror, then the local store, then a
  //    placeholder. This array is what the caller gets even if aqua is down.
  const people: ContextPerson[] = emails.map(
    (email) =>
      mirror.contacts[email]?.person ?? fromLocal(email) ?? placeholderPerson(email),
  );

  // 2) Which emails warrant a best-effort aqua refresh (missing/stale/unresolved)?
  const needRefresh: string[] = [];
  emails.forEach((email, i) => {
    const entry = mirror.contacts[email];
    const resolved = people[i].source !== "attendee";
    if (!entry || !isFresh(entry.at) || (!resolved && !entry.person.somaContactId)) {
      needRefresh.push(email);
    }
  });
  // Fold in some of the deferred-resync backlog so the link recovers proactively.
  for (const email of mirror.link.pending) {
    if (needRefresh.length >= MAX_LIVE_PER_REQUEST) {
      break;
    }
    if (!needRefresh.includes(email)) {
      needRefresh.push(email);
    }
  }
  const refreshList = needRefresh.slice(0, MAX_LIVE_PER_REQUEST);
  let dirty = false;

  if (refreshList.length > 0) {
    dirty = true;
    // fetchContactByEmail is already graceful: null = link-down OR not-found.
    const results = await Promise.all(
      refreshList.map(async (email) => ({
        email,
        contact: await fetchContactByEmail(email),
      })),
    );
    // If any lookup resolved, the link is up — remaining nulls are genuine
    // not-founds. If none resolved, treat as a possible outage and defer.
    const linkUp = results.some((r) => r.contact);

    for (const { email, contact } of results) {
      if (contact) {
        mirror.contacts[email] = { person: contact, at: now };
        const idx = emails.indexOf(email);
        if (idx >= 0) {
          people[idx] = contact;
        }
        mirror.link.pending = mirror.link.pending.filter((e) => e !== email);
      } else if (linkUp) {
        // Link is up and this email isn't in the CRM — cache a placeholder so
        // we don't hammer it, and clear any deferred flag.
        if (!mirror.contacts[email]) {
          mirror.contacts[email] = { person: placeholderPerson(email), at: now };
        }
        mirror.link.pending = mirror.link.pending.filter((e) => e !== email);
      } else if (!mirror.link.pending.includes(email)) {
        // Possible outage — defer the sync until the link is live again.
        mirror.link.pending.push(email);
      }
    }

    if (linkUp) {
      mirror.link.lastOkAt = now;
    } else {
      mirror.link.lastFailAt = now;
    }
    mirror.link.pending = mirror.link.pending.slice(-MAX_PENDING);
  }

  // 3) Companies — mirror-first too, refreshed best-effort, kept on failure.
  const companyIds = [
    ...new Set(
      people
        .map((p) => p.somaCompanyId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  let companies: ContextCompany[] = companyIds
    .map((id) => mirror.companies[id]?.company)
    .filter((c): c is ContextCompany => Boolean(c));
  const companiesStale = companyIds.some(
    (id) => !mirror.companies[id] || !isFresh(mirror.companies[id].at),
  );
  if (companyIds.length > 0 && companiesStale) {
    const fresh = await resolveCompaniesForPeople(people); // graceful: [] on down
    if (fresh.length > 0) {
      for (const co of fresh) {
        if (co.id) {
          mirror.companies[co.id] = { company: co, at: now };
        }
      }
      companies = fresh;
      dirty = true;
    }
    // If the refresh came back empty (down or none), keep the mirror's companies.
  }

  // Only persist when something actually changed — a request served entirely
  // from fresh cache touches no aqua link and writes nothing.
  if (dirty) {
    await patchUserPreferences(userId, { crmMirror: mirror });
  }
  return { people, companies };
}
