/** App-level Google OAuth for linking calendar/Gmail accounts (not Supabase Auth). */
export function isGoogleAccountLinkConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

export const GOOGLE_ACCOUNT_LINK_SETUP_HINT =
  "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the server environment (see README). This is separate from Google sign-in in the Supabase dashboard.";

export function describeGoogleOAuthError(code: string | undefined): string {
  switch (code) {
    case "google_not_configured":
      return GOOGLE_ACCOUNT_LINK_SETUP_HINT;
    case "token_exchange_failed":
      return "Google rejected the authorization code. Check client ID, secret, and redirect URI.";
    case "session_mismatch":
      return "OAuth session did not match your login. Sign in again and retry.";
    case "bad_state":
    case "invalid_state":
    case "bad_payload":
      return "OAuth state was invalid or expired. Try connecting again.";
    case "db_write_failed":
      return "Connected to Google but saving credentials failed.";
    case "missing_params":
      return "Google did not return the expected authorization response.";
    default:
      return code?.replaceAll("_", " ") ?? "Unknown error";
  }
}
