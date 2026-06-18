import { redirect } from "next/navigation";
import { ModernSettingsForm } from "@/components/modern-settings-form";
import { getUserPreferences } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth-server";
import { getConnectedAccounts } from "@/lib/connected-accounts";
import { isGoogleAccountLinkConfigured } from "@/lib/google-oauth-config";
import { getKrispTokens } from "@/lib/krisp-tokens";
import { repairUserAccounts } from "@/lib/repair-connected-accounts";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const VALID_SECTIONS = [
  "appearance",
  "time",
  "preferences",
  "accounts",
  "connections",
] as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; connected?: string; email?: string; oauth_error?: string; sync?: string; gmail_warning?: string; krisp_connected?: string; krisp_error?: string }>;
}) {
  const user = await getCurrentAuthUser();

  if (!user) {
    redirect("/auth/signin?callbackUrl=/settings");
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const authProvider =
    (authData.user?.app_metadata?.provider as string | undefined) ??
    authData.user?.identities?.[0]?.provider ??
    "email";

  const preferences = await getUserPreferences(user.id);
  await repairUserAccounts(user.id);
  const { section, connected, email, oauth_error, sync, gmail_warning, krisp_connected, krisp_error } = await searchParams;
  const krispTokens = await getKrispTokens(user.id);
  const validSection = VALID_SECTIONS.includes(
    section as (typeof VALID_SECTIONS)[number],
  )
    ? section
    : undefined;
  const connectedAccounts = await getConnectedAccounts(user.id);
  const displayName =
    typeof preferences.displayName === "string" && preferences.displayName.trim()
      ? preferences.displayName.trim()
      : user.name;

  return (
    <div className="min-h-dvh overflow-x-hidden bg-background">
      <ModernSettingsForm
        initialConnectedAccounts={connectedAccounts}
        initialPreferences={preferences}
        initialSection={
          validSection as
            | "appearance"
            | "time"
            | "preferences"
            | "accounts"
            | "connections"
            | undefined
        }
        connectedAccountId={connected}
        connectedEmail={email}
        oauthError={oauth_error}
        krispConnected={!!krispTokens}
        krispUpdatedAt={krispTokens?.updatedAt}
        krispJustConnected={krisp_connected === "1"}
        krispError={krisp_error}
        gmailWarning={gmail_warning === "1"}
        googleAccountLinkConfigured={isGoogleAccountLinkConfigured()}
        triggerSync={sync === "1"}
        userEmail={user.email}
        userId={user.id}
        userImage={user.image ?? ""}
        userName={displayName}
        userProvider={authProvider}
      />
    </div>
  );
}
