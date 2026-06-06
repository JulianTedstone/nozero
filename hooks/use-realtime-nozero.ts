"use client";

import type { Database } from "@/types/database";
import { useSession } from "@/components/session-provider";
import { useRealtimeTable } from "@/hooks/use-realtime-table";

type Tables = Database["nozero"]["Tables"];
type EventRow = Tables["events"]["Row"];
type CategoryRow = Tables["categories"]["Row"];
type InvitationRow = Tables["invitations"]["Row"];
type ProfileRow = Tables["profiles"]["Row"];

/**
 * The hooks below subscribe to row changes for the signed-in user only,
 * via the Realtime publication populated by Phase 2. When the user is
 * signed out, no channel is opened — `onChange` will never fire.
 */

export function useRealtimeUserEvents(onChange: (payload: unknown) => void) {
  const { user } = useSession();
  useRealtimeTable<EventRow>({
    table: "events",
    filter: user ? `user_id=eq.${user.id}` : undefined,
    onChange,
    channelKey: user?.id ?? "anon",
  });
}

export function useRealtimeUserCategories(
  onChange: (payload: unknown) => void,
) {
  const { user } = useSession();
  useRealtimeTable<CategoryRow>({
    table: "categories",
    filter: user ? `user_id=eq.${user.id}` : undefined,
    onChange,
    channelKey: user?.id ?? "anon",
  });
}

export function useRealtimeUserInvitations(
  onChange: (payload: unknown) => void,
) {
  const { user } = useSession();
  // Organizer-side: filter by organizer_user_id. Invitee-side reads use the
  // public-by-token RPC, no realtime subscription needed.
  useRealtimeTable<InvitationRow>({
    table: "invitations",
    filter: user ? `organizer_user_id=eq.${user.id}` : undefined,
    onChange,
    channelKey: user?.id ?? "anon",
  });
}

export function useRealtimeUserProfile(onChange: (payload: unknown) => void) {
  const { user } = useSession();
  useRealtimeTable<ProfileRow>({
    table: "profiles",
    filter: user ? `id=eq.${user.id}` : undefined,
    onChange,
    channelKey: user?.id ?? "anon",
  });
}
