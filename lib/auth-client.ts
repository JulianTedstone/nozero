"use client";

import { createClient } from "@/lib/supabase/browser";

export { createClient as createAuthBrowserClient };

/**
 * Minimal compat shim for components that still call `authClient.signOut()`.
 * Mirrors the Better Auth client surface to avoid a wider component diff.
 */
export const authClient = {
  signOut: async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      window.location.href = "/auth/signin";
    }
  },
};
