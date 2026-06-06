"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/browser";

type NozeroTable = "events" | "categories" | "invitations" | "profiles";

type Payload<Row extends { [key: string]: unknown }> =
  RealtimePostgresChangesPayload<Row>;

type Options<Row extends { [key: string]: unknown }> = {
  table: NozeroTable;
  /**
   * Postgres filter applied to the subscription server-side. Use Supabase's
   * `column=eq.value` syntax — e.g. `user_id=eq.<uuid>` or
   * `organizer_user_id=eq.<uuid>`. Skip for unfiltered (will receive all rows
   * the user can see under RLS).
   */
  filter?: string;
  /** Called for every INSERT / UPDATE / DELETE. */
  onChange: (payload: Payload<Row>) => void;
  /** Optional channel suffix to disambiguate parallel subscriptions. */
  channelKey?: string;
};

/**
 * Subscribe to postgres_changes on a nozero table. Auto-unsubscribes on
 * unmount. The callback is held in a ref so the subscription doesn't
 * tear down every render.
 *
 * Requires the table to be in `supabase_realtime` (already true for the
 * four nozero tables; see supabase/migrations/...).
 */
export function useRealtimeTable<Row extends { [key: string]: unknown }>({
  table,
  filter,
  onChange,
  channelKey = "default",
}: Options<Row>) {
  const callbackRef = useRef(onChange);
  callbackRef.current = onChange;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime:nozero.${table}:${channelKey}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "nozero",
          table,
          ...(filter ? { filter } : {}),
        },
        (payload) => callbackRef.current(payload as Payload<Row>),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, channelKey]);
}
