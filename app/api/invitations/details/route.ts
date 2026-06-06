import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .schema("nozero")
      .rpc("invitation_by_token", { p_token: token });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const invitation = Array.isArray(data) ? data[0] : data;
    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      eventTitle: invitation.event_title,
      eventStart: invitation.event_start,
      eventEnd: invitation.event_end,
      eventLocation: invitation.event_location,
      organizerName: invitation.organizer_name,
      status: invitation.status,
    });
  } catch (error) {
    console.error("[invitations/details] Error:", error);
    return NextResponse.json(
      { error: "Failed to load invitation" },
      { status: 500 },
    );
  }
}
