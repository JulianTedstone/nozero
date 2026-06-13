import "server-only";

import type { ContextTask } from "@/types/meeting-context";
import type { FlightdeckBoardItem } from "@/types/flightdeck-board";

export const FLIGHTDECK_STATUS_ORDER = [
  "Backlog",
  "Recurring",
  "To Do",
  "In Progress",
  "Review",
  "Blocked",
  "Complete",
] as const;

const DEFAULT_OWNER = "nopilot-co-studios";
const DEFAULT_PROJECT_NUMBER = 17;

function githubToken(): string | null {
  return process.env.GITHUB_TOKEN?.trim() || null;
}

function projectOwner(): string {
  return process.env.FLIGHTDECK_PROJECT_OWNER?.trim() || DEFAULT_OWNER;
}

function projectNumber(): number {
  const n = Number(process.env.FLIGHTDECK_PROJECT_NUMBER);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PROJECT_NUMBER;
}

interface GraphqlItem {
  id: string;
  fieldValues?: {
    nodes?: Array<{
      text?: string;
      name?: string;
      field?: { name?: string };
    }>;
  };
  content?: {
    title?: string;
    url?: string;
    body?: string;
    number?: number;
  };
}

async function flightdeckGraphql(
  query: string,
  variables: Record<string, unknown>,
): Promise<unknown | null> {
  const token = githubToken();
  if (!token) return null;

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { data?: unknown; errors?: unknown[] };
  if (data.errors?.length) return null;
  return data.data;
}

function fieldText(
  item: GraphqlItem,
  fieldName: string,
): string | null {
  const nodes = item.fieldValues?.nodes ?? [];
  for (const node of nodes) {
    const name = node.field?.name ?? node.name;
    if (name?.toLowerCase() === fieldName.toLowerCase()) {
      if (node.text) return node.text;
      if (node.name) return node.name;
    }
  }
  return null;
}

function graphqlItemToBoard(item: GraphqlItem): FlightdeckBoardItem {
  const issueNumber = item.content?.number;
  const ref = issueNumber != null ? String(issueNumber) : null;
  return {
    id: item.id,
    ref,
    title: item.content?.title ?? "Untitled",
    status: fieldText(item, "Status") ?? "Backlog",
    stream: fieldText(item, "Stream"),
    owner: fieldText(item, "Owner"),
    approval: fieldText(item, "Approval"),
    approver: fieldText(item, "Approver"),
    type: fieldText(item, "Type"),
    priority: fieldText(item, "Priority"),
    url: item.content?.url ?? null,
    body: item.content?.body ?? null,
  };
}

export async function listFlightdeckBoard(): Promise<{
  items: FlightdeckBoardItem[];
  error?: string;
}> {
  const token = githubToken();
  if (!token) {
    return { items: [], error: "GITHUB_TOKEN not configured" };
  }

  const owner = projectOwner();
  const number = projectNumber();
  const items: FlightdeckBoardItem[] = [];
  let cursor: string | null = null;
  let hasNext = true;

  const query = `
    query FlightdeckBoard($owner: String!, $number: Int!, $after: String) {
      organization(login: $owner) {
        projectV2(number: $number) {
          items(first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              fieldValues(first: 30) {
                nodes {
                  ... on ProjectV2ItemFieldTextValue {
                    text
                    field { ... on ProjectV2FieldCommon { name } }
                  }
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field { ... on ProjectV2FieldCommon { name } }
                  }
                }
              }
              content {
                ... on Issue {
                  title
                  url
                  body
                  number
                }
                ... on DraftIssue {
                  title
                  body
                }
              }
            }
          }
        }
      }
      user(login: $owner) {
        projectV2(number: $number) {
          items(first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              fieldValues(first: 30) {
                nodes {
                  ... on ProjectV2ItemFieldTextValue {
                    text
                    field { ... on ProjectV2FieldCommon { name } }
                  }
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field { ... on ProjectV2FieldCommon { name } }
                  }
                }
              }
              content {
                ... on Issue {
                  title
                  url
                  body
                  number
                }
                ... on DraftIssue {
                  title
                  body
                }
              }
            }
          }
        }
      }
    }
  `;

  while (hasNext) {
    const data = (await flightdeckGraphql(query, {
      owner,
      number,
      after: cursor,
    })) as {
      organization?: {
        projectV2?: {
          items?: {
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
            nodes?: GraphqlItem[];
          };
        };
      };
      user?: {
        projectV2?: {
          items?: {
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
            nodes?: GraphqlItem[];
          };
        };
      };
    } | null;

    if (!data) {
      return { items: [], error: "Flightdeck GraphQL failed" };
    }

    const page =
      data.organization?.projectV2?.items ??
      data.user?.projectV2?.items;
    const nodes = page?.nodes ?? [];
    for (const node of nodes) {
      items.push(graphqlItemToBoard(node));
    }

    hasNext = Boolean(page?.pageInfo?.hasNextPage);
    cursor = page?.pageInfo?.endCursor ?? null;
    if (!hasNext) break;
  }

  return { items };
}

function itemMatches(
  item: GraphqlItem,
  query: string,
  participantEmails: string[],
): boolean {
  const title = item.content?.title ?? "";
  const body = item.content?.body ?? "";
  const haystack = `${title}\n${body}`.toLowerCase();
  const q = query.trim().toLowerCase();

  if (q.length >= 3 && haystack.includes(q)) return true;

  return participantEmails.some((email) =>
    haystack.includes(email.toLowerCase()),
  );
}

export async function searchFlightdeckTasks(input: {
  query: string;
  streams?: string[];
  participantEmails?: string[];
  limit?: number;
}): Promise<{ tasks: ContextTask[]; error?: string }> {
  const token = githubToken();
  if (!token) {
    return { tasks: [], error: "GITHUB_TOKEN not configured" };
  }

  const owner = projectOwner();
  const number = projectNumber();
  const limit = input.limit ?? 20;
  const streamFilter = new Set(
    (input.streams ?? []).map((s) => s.toLowerCase()),
  );

  const query = `
    query FlightdeckItems($owner: String!, $number: Int!) {
      organization(login: $owner) {
        projectV2(number: $number) {
          items(first: 100) {
            nodes {
              id
              fieldValues(first: 30) {
                nodes {
                  ... on ProjectV2ItemFieldTextValue {
                    text
                    field { ... on ProjectV2FieldCommon { name } }
                  }
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field { ... on ProjectV2FieldCommon { name } }
                  }
                }
              }
              content {
                ... on Issue {
                  title
                  url
                  body
                  number
                }
                ... on DraftIssue {
                  title
                  body
                }
              }
            }
          }
        }
      }
      user(login: $owner) {
        projectV2(number: $number) {
          items(first: 100) {
            nodes {
              id
              fieldValues(first: 30) {
                nodes {
                  ... on ProjectV2ItemFieldTextValue {
                    text
                    field { ... on ProjectV2FieldCommon { name } }
                  }
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field { ... on ProjectV2FieldCommon { name } }
                  }
                }
              }
              content {
                ... on Issue {
                  title
                  url
                  body
                  number
                }
                ... on DraftIssue {
                  title
                  body
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = (await flightdeckGraphql(query, {
    owner,
    number,
  })) as {
    organization?: { projectV2?: { items?: { nodes?: GraphqlItem[] } } };
    user?: { projectV2?: { items?: { nodes?: GraphqlItem[] } } };
  } | null;

  if (!data) {
    return { tasks: [], error: "Flightdeck GraphQL failed" };
  }

  const nodes =
    data.organization?.projectV2?.items?.nodes ??
    data.user?.projectV2?.items?.nodes ??
    [];

  const emails = input.participantEmails ?? [];
  const tasks: ContextTask[] = [];

  for (const item of nodes) {
    if (!itemMatches(item, input.query, emails)) continue;

    const stream =
      fieldText(item, "Stream") ??
      fieldText(item, "stream") ??
      item.fieldValues?.nodes?.find((n) => n.field?.name === "Stream")?.name ??
      null;

    if (streamFilter.size > 0 && stream) {
      if (!streamFilter.has(stream.toLowerCase())) continue;
    }

    const status =
      fieldText(item, "Status") ??
      item.fieldValues?.nodes?.find((n) => n.field?.name === "Status")?.name ??
      null;

    const title = item.content?.title ?? "Untitled";
    const url = item.content?.url ?? null;

    tasks.push({
      id: item.id,
      title,
      status,
      stream,
      url,
      source: "flightdeck",
    });

    if (tasks.length >= limit) break;
  }

  return { tasks };
}
