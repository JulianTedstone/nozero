import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { syncWithGoogleCalendar } from "@/lib/calendar";
import { hasAnyCalendarLinked } from "@/lib/google-accounts-sync";
import { ensureGoogleCalendarWatch } from "@/lib/google-calendar";
import { getGoogleTokens } from "@/lib/google-tokens";
import { upsertUserRecord } from "@/lib/store";

function getWebhookBaseUrl(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");

  if (host) {
    const protocol =
      forwardedProto ||
      (host.includes("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https");

    return `${protocol}://${host}`;
  }

  return process.env.NEXT_PUBLIC_SITE_URL;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentAuthUser();

    if (!user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const pullOnly =
      request.nextUrl.searchParams.get("pullOnly") === "true" ||
      request.nextUrl.searchParams.get("mode") === "pull";

    const tokens = await getGoogleTokens(user.id);
    const hasLinked = await hasAnyCalendarLinked(user.id);

    if (!(tokens?.accessToken && tokens?.refreshToken) && !hasLinked) {
      return NextResponse.json(
        { message: "No calendar accounts connected", status: "error" },
        { status: 400 },
      );
    }

    let result;
    if (tokens?.accessToken && tokens?.refreshToken) {
      const expiresAt = tokens.accessTokenExpiresAt
        ? Math.floor(tokens.accessTokenExpiresAt / 1000)
        : 0;

      await upsertUserRecord({
        userId: user.id,
        provider: "google",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt,
      });

      result = await syncWithGoogleCalendar(user.id, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt,
      }, { pullOnly });
    } else {
      result = await syncWithGoogleCalendar(user.id, undefined, { pullOnly });
    }

    if (result.success && tokens?.accessToken && tokens?.refreshToken) {
      try {
        const expiresAt = tokens.accessTokenExpiresAt
          ? Math.floor(tokens.accessTokenExpiresAt / 1000)
          : 0;
        await ensureGoogleCalendarWatch({
          userId: user.id,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt,
          webhookBaseUrl: getWebhookBaseUrl(request),
        });
      } catch (watchError) {
        console.error("Failed to register Google watch channel:", watchError);
      }
    }

    if (result.success) {
      return NextResponse.json({
        message: result.message,
        status: "success",
        pulled: result.pulled ?? 0,
        deleted: result.deleted ?? 0,
        accounts: result.accounts ?? 0,
        errors: result.errors ?? [],
        pullOnly,
      });
    }
    return NextResponse.json(
      {
        message: result.message,
        status: "error",
        details: result.message,
        pulled: result.pulled ?? 0,
        deleted: result.deleted ?? 0,
        accounts: result.accounts ?? 0,
        errors: result.errors ?? [],
      },
      { status: 500 }
    );
  } catch (error: any) {
    console.error("Calendar sync error:", error);

    let errorMessage = "Something went wrong during synchronization";

    if (error.message) {
      if (error.message.includes("token")) {
        errorMessage =
          "Authentication error. Please sign out and sign in again.";
      } else if (error.message.includes("rate limit")) {
        errorMessage =
          "Google Calendar API rate limit exceeded. Please try again later.";
      } else if (error.message.includes("network")) {
        errorMessage =
          "Network error. Please check your connection and try again.";
      }
    }

    return NextResponse.json(
      {
        message: errorMessage,
        status: "error",
        details: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
