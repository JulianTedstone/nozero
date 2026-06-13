import { NextResponse } from "next/server";
import { updateAccountCode } from "@/lib/account-codes";
import { getCurrentAuthUser } from "@/lib/auth-server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();

    if (body.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accountCode = await updateAccountCode(user.id, id, {
      label: body.label,
      archived: body.archived,
    });

    return NextResponse.json({ accountCode });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
