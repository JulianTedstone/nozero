import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
};

function shapeUser(user: {
  id: string;
  email?: string | null;
  user_metadata: Record<string, unknown> | null;
}): AuthUser {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: user.id,
    email: user.email ?? "",
    name:
      (typeof meta.full_name === "string" && meta.full_name) ||
      (typeof meta.name === "string" && meta.name) ||
      (user.email ?? ""),
    image:
      (typeof meta.avatar_url === "string" && meta.avatar_url) ||
      (typeof meta.picture === "string" && meta.picture) ||
      null,
  };
}

export async function getCurrentAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return null;
  }
  return shapeUser(data.user);
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getCurrentAuthUser()) !== null;
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentAuthUser();
  if (!user) {
    redirect("/auth/signin");
  }
  return user;
}
