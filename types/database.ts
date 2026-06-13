export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  nozero: {
    Tables: {
      categories: {
        Row: {
          category_id: string
          created_at: string
          data: Json
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          data: Json
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          data?: Json
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          data: Json
          end_at: string
          event_id: string
          id: string
          source: string | null
          start_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          end_at: string
          event_id: string
          id?: string
          source?: string | null
          start_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          end_at?: string
          event_id?: string
          id?: string
          source?: string | null
          start_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          created_at: string
          event_calendar_id: string | null
          event_end: string
          event_id: string
          event_location: string | null
          event_start: string
          event_title: string
          id: string
          invitee_email: string
          organizer_email: string
          organizer_name: string
          organizer_user_id: string
          responded_at: string | null
          status: string
          token: string
        }
        Insert: {
          created_at?: string
          event_calendar_id?: string | null
          event_end: string
          event_id: string
          event_location?: string | null
          event_start: string
          event_title: string
          id?: string
          invitee_email: string
          organizer_email: string
          organizer_name: string
          organizer_user_id: string
          responded_at?: string | null
          status: string
          token: string
        }
        Update: {
          created_at?: string
          event_calendar_id?: string | null
          event_end?: string
          event_id?: string
          event_location?: string | null
          event_start?: string
          event_title?: string
          id?: string
          invitee_email?: string
          organizer_email?: string
          organizer_name?: string
          organizer_user_id?: string
          responded_at?: string | null
          status?: string
          token?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          access_token: string | null
          created_at: string
          email: string | null
          expires_at: string | null
          google_sync_token: string | null
          google_watch_calendar_id: string | null
          google_watch_channel_id: string | null
          google_watch_expiration: string | null
          google_watch_resource_id: string | null
          google_watch_token: string | null
          id: string
          image: string | null
          last_google_sync: string | null
          name: string | null
          preferences: Json | null
          provider: string | null
          refresh_token: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string | null
          google_sync_token?: string | null
          google_watch_calendar_id?: string | null
          google_watch_channel_id?: string | null
          google_watch_expiration?: string | null
          google_watch_resource_id?: string | null
          google_watch_token?: string | null
          id: string
          image?: string | null
          last_google_sync?: string | null
          name?: string | null
          preferences?: Json | null
          provider?: string | null
          refresh_token?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string | null
          google_sync_token?: string | null
          google_watch_calendar_id?: string | null
          google_watch_channel_id?: string | null
          google_watch_expiration?: string | null
          google_watch_resource_id?: string | null
          google_watch_token?: string | null
          id?: string
          image?: string | null
          last_google_sync?: string | null
          name?: string | null
          preferences?: Json | null
          provider?: string | null
          refresh_token?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      account_codes: {
        Row: {
          account_email: string
          archived_at: string | null
          code: string
          created_at: string
          id: string
          label: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email: string
          archived_at?: string | null
          code: string
          created_at?: string
          id?: string
          label: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string
          archived_at?: string | null
          code?: string
          created_at?: string
          id?: string
          label?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_threads: {
        Row: {
          account_email: string
          ai_summary: string | null
          created_at: string
          external_id: string
          id: string
          is_archived: boolean
          is_tracking: boolean
          is_unread: boolean
          last_message_at: string | null
          message_count: number
          participants: Json
          sender_email: string | null
          streams: Json
          subject: string
          thread_intent: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email: string
          ai_summary?: string | null
          created_at?: string
          external_id: string
          id?: string
          is_archived?: boolean
          is_tracking?: boolean
          is_unread?: boolean
          last_message_at?: string | null
          message_count?: number
          participants?: Json
          sender_email?: string | null
          streams?: Json
          subject?: string
          thread_intent?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string
          ai_summary?: string | null
          created_at?: string
          external_id?: string
          id?: string
          is_archived?: boolean
          is_tracking?: boolean
          is_unread?: boolean
          last_message_at?: string | null
          message_count?: number
          participants?: Json
          sender_email?: string | null
          streams?: Json
          subject?: string
          thread_intent?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_messages: {
        Row: {
          account_email: string | null
          ai_summary: Json | null
          body_original: string | null
          body_plain: string
          cc_emails: Json
          created_at: string
          external_id: string
          from_email: string | null
          id: string
          sent_at: string | null
          subject: string | null
          thread_external_id: string
          to_emails: Json
          user_id: string
        }
        Insert: {
          account_email?: string | null
          ai_summary?: Json | null
          body_original?: string | null
          body_plain?: string
          cc_emails?: Json
          created_at?: string
          external_id: string
          from_email?: string | null
          id?: string
          sent_at?: string | null
          subject?: string | null
          thread_external_id: string
          to_emails?: Json
          user_id: string
        }
        Update: {
          account_email?: string | null
          ai_summary?: Json | null
          body_original?: string | null
          body_plain?: string
          cc_emails?: Json
          created_at?: string
          external_id?: string
          from_email?: string | null
          id?: string
          sent_at?: string | null
          subject?: string | null
          thread_external_id?: string
          to_emails?: Json
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      invitation_by_token: {
        Args: { p_token: string }
        Returns: {
          event_end: string
          event_id: string
          event_location: string
          event_start: string
          event_title: string
          invitee_email: string
          organizer_email: string
          organizer_name: string
          status: string
          token: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  nozero: {
    Enums: {},
  },
} as const

