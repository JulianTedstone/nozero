import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** Supabase Auth sign-in method (email, google, …) — not mail/calendar identity. */
export async function getAuthProviderForUser(
  userId: string,
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return "email";

  const appProvider = data.user.app_metadata?.provider;
  if (typeof appProvider === "string" && appProvider) return appProvider;

  const identityProvider = data.user.identities?.[0]?.provider;
  if (typeof identityProvider === "string" && identityProvider) {
    return identityProvider;
  }

  return "email";
}

export async function isGoogleSignInUser(userId: string): Promise<boolean> {
  return (await getAuthProviderForUser(userId)) === "google";
}
