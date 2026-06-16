import "server-only";

import { getHydrationConfig } from "@/lib/hydration-client";
import {
  fetchHydrationContactByEmail,
  searchHydrationDeals,
} from "@/lib/hydration-client";
import {
  fetchContactByEmail,
  searchSomaDeals,
  somaBaseUrl,
} from "@/lib/soma-client";
import type { ContextDeal, ContextPerson } from "@/types/meeting-context";
import type { ConnectorContext, ConnectorResult } from "./types";

export async function connectCrm(
  ctx: ConnectorContext,
): Promise<
  ConnectorResult<{
    participants: ContextPerson[];
    deals: ContextDeal[];
  }>
> {
  const emails = ctx.participantEmails;
  const participants: ContextPerson[] = [];
  const deals: ContextDeal[] = [];
  const hydration = getHydrationConfig();

  if (hydration) {
    const people = await Promise.all(
      emails.map((email) => fetchHydrationContactByEmail(email)),
    );
    for (let i = 0; i < emails.length; i++) {
      const person = people[i];
      if (person) {
        participants.push(person);
      } else {
        participants.push({
          email: emails[i],
          name: null,
          role: null,
          company: null,
          somaContactId: null,
          somaCompanyId: null,
          source: "attendee",
        });
      }
    }

    const hydrationDeals = await searchHydrationDeals(ctx.query, 12);
    if (hydrationDeals.length > 0) {
      deals.push(...hydrationDeals);
    } else if (ctx.stream) {
      deals.push(...(await searchHydrationDeals(ctx.stream, 8)));
    }

    return {
      source: "crm",
      data: { participants, deals },
    };
  }

  if (!somaBaseUrl()) {
    return {
      source: "crm",
      data: {
        participants: emails.map((email) => ({
          email,
          name: null,
          role: null,
          company: null,
          somaContactId: null,
          somaCompanyId: null,
          source: "attendee" as const,
        })),
        deals: [],
      },
      error: "CRM not configured (set HYDRATION_API_URL or SOMA_API_URL)",
    };
  }

  const people = await Promise.all(
    emails.map((email) => fetchContactByEmail(email)),
  );
  for (let i = 0; i < emails.length; i++) {
    participants.push(
      people[i] ?? {
        email: emails[i],
        name: null,
        role: null,
        company: null,
        somaContactId: null,
        somaCompanyId: null,
        source: "attendee",
      },
    );
  }

  const somaDeals = await searchSomaDeals(ctx.query || ctx.stream, 12);
  deals.push(...somaDeals);

  return {
    source: "crm",
    data: { participants, deals },
  };
}
