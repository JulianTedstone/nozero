import { createAdminClient } from "@/lib/supabase/admin";

export async function readUserPreferences(
  userId: string,
): Promise<Record<string, unknown>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.preferences ?? {}) as Record<string, unknown>;
}

/** Top-level JSONB merge — does not clobber unrelated preference keys. */
export async function patchUserPreferences(
  userId: string,
  patch: Record<string, unknown>,
) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("patch_profile_preferences", {
    p_user_id: userId,
    p_patch: patch,
  });
  if (error) throw error;
}

export async function setCalDavCredentialAtomic(
  userId: string,
  email: string,
  creds: Record<string, unknown>,
) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("set_caldav_credential", {
    p_user_id: userId,
    p_email: email,
    p_creds: creds,
  });
  if (error) throw error;
}

export async function removeCalDavCredentialAtomic(
  userId: string,
  email: string,
) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("remove_caldav_credential", {
    p_user_id: userId,
    p_email: email,
  });
  if (error) throw error;
}
