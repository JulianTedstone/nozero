import { NextResponse } from "next/server";
import { getEvent, updateEvent } from "@/lib/calendar";
import { syncUpdatedEventToGoogle } from "@/lib/calendar-google-sync-server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { token, action } = (await request.json()) as {
      action: "accept" | "decline";
      token: string;
    };

    if (!(token && ["accept", "decline"].includes(action))) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: invitation, error: lookupError } = await supabase
      .from("invitations")
      .select(
        "token,event_id,organizer_user_id,invitee_email,status",
      )
      .eq("token", token)
      .maybeSingle();
    if (lookupError) {
      return NextResponse.json(
        { error: lookupError.message },
        { status: 500 },
      );
    }
    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 },
      );
    }

    if (invitation.status !== "pending") {
      return NextResponse.json({
        status: invitation.status,
        message: `This invitation was already ${invitation.status}.`,
        alreadyResponded: true,
      });
    }

    const newStatus = action === "accept" ? "accepted" : "declined";

    const { error: updateError } = await supabase
      .from("invitations")
      .update({ status: newStatus, responded_at: new Date().toISOString() })
      .eq("token", token);
    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );
    }

    if (action === "accept") {
      const existingEvent = await getEvent(
        invitation.organizer_user_id,
        invitation.event_id,
      );

      if (existingEvent) {
        const currentAttendees = existingEvent.attendees || [];
        const alreadyExists = currentAttendees.some(
          (a) =>
            a.email.toLowerCase() === invitation.invitee_email.toLowerCase(),
        );

        const updatedAttendees = alreadyExists
          ? currentAttendees.map((a) =>
              a.email.toLowerCase() === invitation.invitee_email.toLowerCase()
                ? { ...a, status: "accepted" as const }
                : a,
            )
          : [
              ...currentAttendees,
              {
                email: invitation.invitee_email,
                status: "accepted" as const,
              },
            ];

        const updatedEvent = await updateEvent(
          invitation.organizer_user_id,
          invitation.event_id,
          { attendees: updatedAttendees },
        );

        await syncUpdatedEventToGoogle(
          invitation.organizer_user_id,
          existingEvent,
          updatedEvent,
        );
      }
    }

    return NextResponse.json({
      status: newStatus,
      message:
        action === "accept"
          ? "You've been added to the event!"
          : "You've declined the invitation.",
    });
  } catch (error) {
    console.error("[invitations/respond] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
