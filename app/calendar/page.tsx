import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ModernCalendarView } from "@/components/modern-calendar-view";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { getUserPreferences } from "@/lib/auth";
import { getEvents } from "@/lib/calendar";
import { parseEventSectionOrder } from "@/lib/event-detail-layout";
import type { CalendarEvent } from "@/types/calendar";

export default async function CalendarPage() {
  const user = await getCurrentAuthUser();

  // Auth guard: an unauthenticated visit must land on the login (root),
  // not render a blank calendar shell.
  if (!user?.id) {
    redirect("/");
  }

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

  const persona =
    process.env.NEXT_PUBLIC_DEVICE_NAME === "europa" ? "Pierre" : "Bertrand";

  return (
    <div className="h-dvh overflow-hidden bg-background">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-sm text-white/30">
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
          userName={user.name}
          userProvider="google"
        />
      </Suspense>
    </div>
  );
}
