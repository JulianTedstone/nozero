import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ModernCalendarView } from "@/components/modern-calendar-view";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { getUserPreferences } from "@/lib/auth";
import { getAuthProviderForUser } from "@/lib/auth-provider";
import { getEvents } from "@/lib/calendar";
import { parseEventSectionOrder } from "@/lib/event-detail-layout";
import { repairUserAccounts } from "@/lib/repair-connected-accounts";
import type { CalendarEvent } from "@/types/calendar";

export default async function CalendarPage() {
  const user = await getCurrentAuthUser();

  // Auth guard: an unauthenticated visit must land on the login (root),
  // not render a blank calendar shell.
  if (!user?.id) {
    redirect("/");
  }

  await repairUserAccounts(user.id);

  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const events: CalendarEvent[] = await getEvents(
    user.id,
    startOfMonth,
    endOfMonth,
  );

  const preferences = await getUserPreferences(user.id);
  const eventSectionOrder = parseEventSectionOrder(
    preferences.eventSectionOrder,
  );

  const displayName =
    typeof preferences.displayName === "string" && preferences.displayName.trim()
      ? preferences.displayName.trim()
      : user.name;

  const authProvider = await getAuthProviderForUser(user.id);

  const persona =
    process.env.NEXT_PUBLIC_DEVICE_NAME === "europa" ? "Pierre" : "Bertrand";

  return (
    <div className="h-dvh overflow-hidden bg-background">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-sm text-ink-subtle">
            Loading…
          </div>
        }
      >
        <ModernCalendarView
          eventSectionOrder={eventSectionOrder}
          initialEvents={events}
          persona={persona}
          userEmail={user.email}
          userId={user.id}
          userImage={user.image ?? undefined}
          userName={displayName}
          userProvider={authProvider}
        />
      </Suspense>
    </div>
  );
}
