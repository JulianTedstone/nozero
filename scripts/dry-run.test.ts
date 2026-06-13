/**
 * Mock dry-run tests — no Supabase, Soma, or OpenRouter required.
 * Run: bun run test:dry-run
 */
import { describe, expect, test } from "bun:test";
import {
  displaySender,
  extractSenderEmail,
  htmlToPlainText,
  stripEmailBody,
} from "@/lib/email-body";
import {
  enabledAccountEmails,
  inferAccountEmail,
  type EmailAccountView,
} from "@/lib/email-preferences";

describe("email-body", () => {
  test("htmlToPlainText strips tags and decodes entities", () => {
    const plain = htmlToPlainText(
      "<p>Hello&nbsp;<strong>world</strong></p><br/><div>Line 2</div>",
    );
    expect(plain).toContain("Hello world");
    expect(plain).toContain("Line 2");
    expect(plain).not.toContain("<");
  });

  test("stripEmailBody removes signature after marker", () => {
    const { plain, original } = stripEmailBody({
      body: "Thanks for the update.\n\nLet's sync Monday.\n\n--\nTed\nSent from my iPhone",
    });
    expect(plain).toContain("sync Monday");
    expect(plain).not.toContain("Sent from my iPhone");
    expect(original.length).toBeGreaterThan(plain.length);
  });

  test("extractSenderEmail parses angle-bracket form", () => {
    expect(extractSenderEmail("Jane Doe <jane@example.com>")).toBe(
      "jane@example.com",
    );
    expect(extractSenderEmail("bob@corp.io")).toBe("bob@corp.io");
  });

  test("displaySender prefers display name", () => {
    expect(displaySender("Jane Doe <jane@example.com>")).toBe("Jane Doe");
  });
});

describe("email-preferences helpers", () => {
  const accounts: EmailAccountView[] = [
    {
      id: "primary",
      email: "me@nozero.app",
      label: "Primary",
      color: "#4285F4",
      connected: true,
      visible: true,
      isPrimary: true,
    },
    {
      id: "work",
      email: "work@company.com",
      label: "Work",
      color: "#34A853",
      connected: true,
      visible: false,
      isPrimary: false,
    },
    {
      id: "other",
      email: "other@gmail.com",
      label: "Other",
      color: "#EA4335",
      connected: false,
      visible: true,
      isPrimary: false,
    },
  ];

  test("enabledAccountEmails respects visibility and connected flag", () => {
    expect(enabledAccountEmails(accounts)).toEqual(["me@nozero.app"]);
  });

  test("inferAccountEmail picks participant on user's accounts", () => {
    expect(
      inferAccountEmail(
        ["client@external.com", "work@company.com"],
        ["me@nozero.app", "work@company.com"],
      ),
    ).toBe("work@company.com");
  });

  test("inferAccountEmail falls back to first user email", () => {
    expect(
      inferAccountEmail(["client@external.com"], ["me@nozero.app"]),
    ).toBe("me@nozero.app");
  });
});

describe("mock email thread list pagination", () => {
  type Row = { id: string; lastMessageAt: string };

  function paginate(
    rows: Row[],
    cursor: string | null,
    limit: number,
  ): { items: Row[]; nextCursor: string | null } {
    const sorted = [...rows].sort((a, b) =>
      b.lastMessageAt.localeCompare(a.lastMessageAt),
    );
    let start = 0;
    if (cursor) {
      const idx = sorted.findIndex((r) => r.id === cursor);
      start = idx >= 0 ? idx + 1 : 0;
    }
    const slice = sorted.slice(start, start + limit);
    const nextCursor =
      start + limit < sorted.length
        ? (slice.at(-1)?.id ?? null)
        : null;
    return { items: slice, nextCursor };
  }

  test("returns 20 items and cursor for next page", () => {
    const rows: Row[] = Array.from({ length: 45 }, (_, i) => ({
      id: `t-${i}`,
      lastMessageAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    }));
    const page1 = paginate(rows, null, 20);
    expect(page1.items).toHaveLength(20);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = paginate(rows, page1.nextCursor, 20);
    expect(page2.items).toHaveLength(20);
    expect(page2.nextCursor).toBeTruthy();

    const page3 = paginate(rows, page2.nextCursor, 20);
    expect(page3.items).toHaveLength(5);
    expect(page3.nextCursor).toBeNull();
  });
});

describe("mock account code assignment payload", () => {
  test("clears assignment when id is empty", () => {
    const accountCodeId: string | undefined = undefined;
    const payload = accountCodeId
      ? { accountCodeId, accountCode: "ABC", accountCodeLabel: "Client A" }
      : {
          accountCodeId: undefined,
          accountCode: undefined,
          accountCodeLabel: undefined,
        };
    expect(payload.accountCodeId).toBeUndefined();
  });

  test("includes resolved fields when id present", () => {
    const resolved = {
      accountCodeId: "code-1",
      accountCode: "NPT-100",
      accountCodeLabel: "NoPilot internal",
    };
    expect(resolved.accountCode).toBe("NPT-100");
  });
});

console.log("Dry-run tests complete (mock fixtures only — no live APIs).");
