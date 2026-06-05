import { getUserRecord } from "@/lib/store";

export type GoogleTokens = {
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: number | null;
  refreshTokenExpiresAt: number | null;
  idToken: string | null;
  scope: string | null;
  scopes: string[];
};

/**
 * Read the Google provider tokens captured at sign-in time from nozero.profiles.
 * Replaces the prior Convex auth mutation `getGoogleAccessToken`.
 */
export async function getGoogleTokens(userId: string): Promise<GoogleTokens> {
  const user = await getUserRecord(userId);
  return {
    accessToken: user?.accessToken ?? null,
    refreshToken: user?.refreshToken ?? null,
    accessTokenExpiresAt: user?.expiresAt ?? null,
    refreshTokenExpiresAt: null,
    idToken: null,
    scope: null,
    scopes: [],
  };
}
