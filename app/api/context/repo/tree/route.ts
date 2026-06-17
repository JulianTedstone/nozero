import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { getRepoTree } from "@/lib/github-content";

export async function GET(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const repo = searchParams.get("repo")?.trim();
  const ref = searchParams.get("ref")?.trim() || undefined;
  if (!repo) {
    return NextResponse.json({ error: "repo is required" }, { status: 400 });
  }

  try {
    const { paths, ref: branch } = await getRepoTree(repo, ref);
    return NextResponse.json({ paths, ref: branch });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Tree fetch failed" },
      { status: 502 },
    );
  }
}
