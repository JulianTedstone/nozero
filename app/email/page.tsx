import { redirect } from "next/navigation";

export default async function EmailPage({
  searchParams,
}: {
  searchParams: Promise<{ threadId?: string }>;
}) {
  const params = await searchParams;
  const threadId = params.threadId?.trim();
  if (threadId) {
    redirect(`/calendar?threadId=${encodeURIComponent(threadId)}`);
  }
  redirect("/calendar");
}
