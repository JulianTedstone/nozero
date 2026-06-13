import { NextResponse } from "next/server";
import { resolveAccountCodeAssignment } from "@/lib/account-codes";
import { getCurrentAuthUser } from "@/lib/auth-server";
import {
  syncDeletedEventToGoogle,
  syncUpdatedEventToGoogle,
} from "@/lib/calendar-google-sync-server";
import {
  deleteEvent,
  deleteRecurringEvent,
  getEvent,
  updateEvent,
  updateRecurringEvent,
} from "@/lib/calendar";
import type { RecurrenceEditScope } from "@/lib/recurrence";
import type { RecurrenceRule } from "@/types/calendar";

interface RouteContext {
  params: Promise<{
    eventId: string;
  }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentAuthUser();

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await context.params;
    const body = await request.json();

    if (body.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existingEvent = await getEvent(user.id, eventId);

    if (!existingEvent) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const scope = (body.recurrenceScope as RecurrenceEditScope | undefined) ?? "all";
    const codeFields = await resolveAccountCodeAssignment(
      user.id,
      body.accountCodeId as string | null | undefined,
    );

    const updates = {
      title: body.title,
      description: body.description,
      start: body.start,
      end: body.end,
      location: body.location,
      conferenceUrl: body.conferenceUrl,
      attendees: body.attendees,
      calendarId: body.calendarId,
      color: body.color,
      categoryId: body.category,
      categories: body.category ? [body.category] : undefined,
      allDay: body.allDay,
      recurrence: body.recurrence as RecurrenceRule | undefined,
      accountEmail: body.accountEmail,
      ...codeFields,
    };

    const isRecurringChange =
      existingEvent.recurrence ||
      existingEvent.isRecurringInstance ||
      existingEvent.originalEventId;

    const event = isRecurringChange
      ? await updateRecurringEvent(user.id, existingEvent, updates, scope)
      : await updateEvent(user.id, eventId, updates);

    const finalEvent = body.pushToGoogle
      ? await syncUpdatedEventToGoogle(user.id, existingEvent, event, scope)
      : event;

    return NextResponse.json({ event: finalEvent });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentAuthUser();

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await context.params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const pushToGoogle = searchParams.get("pushToGoogle") === "true";

    if (userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existingEvent = await getEvent(user.id, eventId);

    if (!existingEvent) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const scopeParam = searchParams.get("recurrenceScope") as
      | RecurrenceEditScope
      | null;
    const scope = scopeParam ?? "all";

    if (pushToGoogle) {
      await syncDeletedEventToGoogle(user.id, existingEvent, scope);
    }

    const isRecurring =
      existingEvent.recurrence ||
      existingEvent.isRecurringInstance ||
      existingEvent.originalEventId;

    if (isRecurring) {
      await deleteRecurringEvent(user.id, existingEvent, scope);
    } else {
      await deleteEvent(user.id, eventId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
