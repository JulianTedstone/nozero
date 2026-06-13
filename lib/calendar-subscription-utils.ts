export type SubscriptionCalendarView = {
  accountId: string;
  accountEmail: string;
  calendarId: string;
  name: string;
  color: string;
  primary?: boolean;
  key: string;
  visible: boolean;
  sourceType: "google" | "caldav";
};

export function eventMatchesVisibleSubscriptions(
  event: {
    source?: string;
    calendarId?: string;
    accountEmail?: string;
    userId?: string;
  },
  subscriptions: SubscriptionCalendarView[],
): boolean {
  if (!event.source || event.source === "local") return true;

  const visible = subscriptions.filter((s) => s.visible);
  if (visible.length === 0) return false;

  const calendarId = event.calendarId ?? "primary";
  const accountEmail = event.accountEmail?.toLowerCase();

  return visible.some((s) => {
    if (s.calendarId !== calendarId) return false;
    if (event.source && s.sourceType !== event.source) return false;
    if (accountEmail) {
      return s.accountEmail.toLowerCase() === accountEmail;
    }
    return true;
  });
}
