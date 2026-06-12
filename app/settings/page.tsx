import { redirect } from "next/navigation";
import { ModernSettingsForm } from "@/components/modern-settings-form";
import { getUserPreferences } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; connected?: string; email?: string; oauth_error?: string }>;
}) {
  const user = await getCurrentAuthUser();

  if (!user) {
    redirect("/auth/signin?callbackUrl=/settings");
  }

  const preferences = await getUserPreferences(user.id);
  const { section, connected, email, oauth_error } = await searchParams;
  const validSection = ["appearance", "time", "accounts"].includes(section ?? "") ? section : undefined;

  return (
    <div className="min-h-dvh overflow-x-hidden bg-background">
      <ModernSettingsForm
        initialPreferences={preferences}
        initialSection={validSection as "appearance" | "time" | "accounts" | undefined}
        connectedAccountId={connected}
        connectedEmail={email}
        oauthError={oauth_error}
        userEmail={user.email}
        userId={user.id}
        userImage={user.image ?? ""}
        userName={user.name}
        userProvider="google"
      />
    </div>
  );
}
