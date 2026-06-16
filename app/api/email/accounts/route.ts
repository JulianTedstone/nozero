import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import {
  getEmailAccountsExpanded,
  listEmailAccountViews,
} from "@/lib/email-preferences";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [accounts, accountsExpanded] = await Promise.all([
    listEmailAccountViews(user.id),
    getEmailAccountsExpanded(user.id),
  ]);
  return NextResponse.json({ accounts, accountsExpanded });
}
