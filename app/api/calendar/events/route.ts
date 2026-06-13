import { NextResponse } from "next/server";
import { resolveAccountCodeAssignment } from "@/lib/account-codes";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { syncCreatedLocalEventToGoogle } from "@/lib/calendar-google-sync-server";
import { createEvent, getEvents } from "@/lib/calendar";
import type { RecurrenceRule } from "@/types/calendar";

export async function GET(request: Request) {
  try {
    const user = await getCurrentAuthUser();

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!(start && end)) {
      return NextResponse.json({ error: "Missing start/end" }, { status: 400 });
    }

    const events = await getEvents(user.id, start, end);
    return NextResponse.json({ events });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentAuthUser();

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (body.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const codeFields = await resolveAccountCodeAssignment(
      user.id,
      body.accountCodeId as string | undefined,
    );

    const event = await createEvent({
      userId: user.id,
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
      allDay: body.allDay ?? false,
      source: "local",
      recurrence: body.recurrence as RecurrenceRule | undefined,
      accountEmail: body.accountEmail,
      ...codeFields,
    });

    const finalEvent = body.pushToGoogle
      ? await syncCreatedLocalEventToGoogle(user.id, event)
      : event;

    return NextResponse.json({ event: finalEvent });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
