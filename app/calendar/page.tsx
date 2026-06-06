import { redirect } from "next/navigation";
import { ModernCalendarView } from "@/components/modern-calendar-view";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { getEvents } from "@/lib/calendar";
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

  return (
    <div className="h-dvh overflow-hidden bg-background">
      <ModernCalendarView
        initialEvents={events}
        userEmail={user.email}
        userId={user.id}
        userImage={user.image ?? undefined}
        userName={user.name}
        userProvider="google"
      />
    </div>
  );
}
