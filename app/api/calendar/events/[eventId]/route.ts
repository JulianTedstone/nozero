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
import { isUserEventOrganizer } from "@/lib/event-organizer";
import { getEventEditCapabilities } from "@/lib/event-permissions";
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

    const organizer = isUserEventOrganizer(existingEvent, user.email);
    const capabilities = getEventEditCapabilities(existingEvent, user.email);

    if (body.metadataOnly === true) {
      if (!capabilities.canEditUserMetadata) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const codeFields = await resolveAccountCodeAssignment(
        user.id,
        body.accountCodeId as string | null | undefined,
      );

      const event = await updateEvent(user.id, eventId, {
        ...codeFields,
        flightdeckStream:
          body.flightdeckStream === null
            ? undefined
            : (body.flightdeckStream as string | undefined),
      });

      return NextResponse.json({ event });
    }

    if (body.accountOnly === true) {
      if (!organizer) {
        return NextResponse.json(
          { error: "Only the organiser can change the calendar account" },
          { status: 403 },
        );
      }

      const accountEmail =
        typeof body.accountEmail === "string" ? body.accountEmail.trim() : "";
      if (!accountEmail) {
        return NextResponse.json(
          { error: "accountEmail is required" },
          { status: 400 },
        );
      }

      const event = await updateEvent(user.id, eventId, {
        accountEmail,
        calendarId:
          typeof body.calendarId === "string" ? body.calendarId : undefined,
      });

      const finalEvent = body.pushToGoogle
        ? await syncUpdatedEventToGoogle(user.id, existingEvent, event)
        : event;

      return NextResponse.json({ event: finalEvent });
    }

    if (body.guestInviteOnly === true) {
      if (!capabilities.canAddParticipants) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const incoming = body.attendees as
        | Array<{ email: string; status?: string }>
        | undefined;
      if (!Array.isArray(incoming)) {
        return NextResponse.json({ error: "Invalid attendees" }, { status: 400 });
      }

      const existingEmails = new Set(
        (existingEvent.attendees ?? []).map((a) => a.email.toLowerCase()),
      );
      const incomingEmails = incoming.map((a) => a.email.toLowerCase());

      for (const email of existingEmails) {
        if (!incomingEmails.includes(email)) {
          return NextResponse.json(
            { error: "Guests cannot remove participants" },
            { status: 403 },
          );
        }
      }

      const event = await updateEvent(user.id, eventId, {
        attendees: incoming.map((a) => ({
          email: a.email,
          status: (a.status ?? "pending") as "pending" | "accepted" | "declined",
        })),
      });

      const finalEvent = body.pushToGoogle
        ? await syncUpdatedEventToGoogle(user.id, existingEvent, event)
        : event;

      return NextResponse.json({ event: finalEvent });
    }

    if (!organizer) {
      return NextResponse.json(
        { error: "Only the organiser can edit this meeting" },
        { status: 403 },
      );
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
      ...codeFields,
      flightdeckStream:
        body.flightdeckStream === null
          ? undefined
          : (body.flightdeckStream as string | undefined),
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
