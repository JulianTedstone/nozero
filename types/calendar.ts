export interface CalendarEvent {
  allDay?: boolean;
  attendees?: {
    email: string;
    name?: string;
    status?: "accepted" | "declined" | "tentative" | "needs-action";
  }[];
  calendarId?: string;
  categories?: string[];
  color?: string;
  description?: string;
  end: string;
  exceptionDate?: string;
  exceptions?: {
    date: string;
    status: "cancelled" | "modified";
    modifiedEvent?: Omit<
      CalendarEvent,
      "id" | "userId" | "recurrence" | "exceptions"
    >;
  }[];
  id: string;
  isRecurring?: boolean;
  isRecurringInstance?: boolean;
  isShared?: boolean;
  location?: string;
  originalEventId?: string;
  recurrence?: RecurrenceRule;
  reminders?: { minutes: number; method: "email" | "popup" }[];
  sharedBy?: string;
  sharedWith?: string[];
  source?: "google" | "local" | "microsoft" | "caldav";
  /** Google account email this event was synced from (multi-account). */
  accountEmail?: string;
  /** Time-sheet account code assignment (optional). */
  accountCodeId?: string;
  accountCode?: string;
  accountCodeLabel?: string;
  /** Video conference join URL (Meet, Teams, Zoom, etc.). */
  conferenceUrl?: string;
  /** Event organiser email from the source calendar. */
  organizerEmail?: string;
  /** Event organiser display name from the source calendar. */
  organizerName?: string;
  sourceId?: string;
  start: string;
  timezone?: string;
  title: string;
  userId: string;
}

export interface RecurrenceRule {
  byDay?: string[];
  byMonth?: number[];
  byMonthDay?: number[];
  bySetPos?: number[];
  count?: number;
  exceptions?: string[];
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  until?: string;
  weekStart?: string;
}

export interface CalendarCategory {
  color: string;
  id: string;
  name: string;
  userId: string;
  visible: boolean;
}
