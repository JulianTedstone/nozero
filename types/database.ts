/**
 * Phase 1 placeholder. Replaced in Phase 2 by:
 *   bun run types:gen
 * which runs `supabase gen types typescript --schema nozero` against the
 * shared NOPILOT project and writes the real schema-derived types here.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  nozero: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
