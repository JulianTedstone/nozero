import { NextResponse } from "next/server";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { getRepoFile, putRepoFile } from "@/lib/github-content";

export async function GET(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const repo = searchParams.get("repo")?.trim();
  const path = searchParams.get("path")?.trim();
  const ref = searchParams.get("ref")?.trim() || undefined;
  if (!(repo && path)) {
    return NextResponse.json(
      { error: "repo and path are required" },
      { status: 400 },
    );
  }

  try {
    const { content, sha } = await getRepoFile(repo, path, ref);
    return NextResponse.json({ content, sha });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "File fetch failed" },
      { status: 502 },
    );
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    repo?: string;
    path?: string;
    content?: string;
    sha?: string | null;
    message?: string;
    ref?: string;
  };
  const repo = body.repo?.trim();
  const path = body.path?.trim();
  if (!(repo && path)) {
    return NextResponse.json(
      { error: "repo and path are required" },
      { status: 400 },
    );
  }
  if (path.includes("..")) {
    return NextResponse.json(
      { error: "path cannot include '..'" },
      { status: 400 },
    );
  }

  try {
    const { sha } = await putRepoFile({
      fullName: repo,
      path,
      content: body.content ?? "",
      sha: body.sha ?? null,
      message: body.message,
      ref: body.ref,
    });
    return NextResponse.json({ ok: true, sha });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Commit failed" },
      { status: 502 },
    );
  }
}
