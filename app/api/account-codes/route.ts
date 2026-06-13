import { NextResponse } from "next/server";
import {
  listAccountCodes,
  listAllAccountCodes,
  upsertAccountCode,
} from "@/lib/account-codes";
import { getCurrentAuthUser } from "@/lib/auth-server";

export async function GET(request: Request) {
  try {
    const user = await getCurrentAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountEmail = searchParams.get("accountEmail");
    const includeArchived = searchParams.get("includeArchived") === "true";

    const accountCodes = accountEmail
      ? await listAccountCodes(user.id, accountEmail, { includeArchived })
      : await listAllAccountCodes(user.id, { includeArchived });

    return NextResponse.json({ accountCodes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
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

    const accountCode = await upsertAccountCode(user.id, {
      accountEmail: body.accountEmail,
      code: body.code,
      label: body.label,
    });

    return NextResponse.json({ accountCode });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
