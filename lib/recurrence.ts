import { format, getDate, getWeekOfMonth } from "date-fns";
import { RRule } from "rrule";
import type { RecurrenceRule } from "@/types/calendar";

export type RecurrencePreset =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "monthly_weekday"
  | "yearly"
  | "weekdays"
  | "custom";

export type RecurrenceEditScope = "this" | "following" | "all";

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

export function weekdayCodeFromDate(date: Date): string {
  return WEEKDAY_CODES[date.getDay()];
}

export function presetFromRecurrenceRule(
  rule: RecurrenceRule | undefined,
  start: Date,
): RecurrencePreset {
  if (!rule) return "none";

  const interval = rule.interval ?? 1;
  const byDay = rule.byDay ?? [];

  if (
    rule.frequency === "daily" &&
    interval === 1 &&
    byDay.length === 5 &&
    ["MO", "TU", "WE", "TH", "FR"].every((d) => byDay.includes(d))
  ) {
    return "weekdays";
  }

  if (rule.frequency === "daily" && interval === 1 && byDay.length === 0) {
    return "daily";
  }

  if (
    rule.frequency === "weekly" &&
    interval === 1 &&
    byDay.length === 1 &&
    byDay[0] === weekdayCodeFromDate(start)
  ) {
    return "weekly";
  }

  if (
    rule.frequency === "monthly" &&
    interval === 1 &&
    !rule.byDay?.length &&
    rule.byMonthDay?.length === 1 &&
    rule.byMonthDay[0] === getDate(start)
  ) {
    return "monthly";
  }

  if (
    rule.frequency === "monthly" &&
    interval === 1 &&
    rule.byDay?.length === 1 &&
    rule.bySetPos?.length === 1 &&
    rule.byDay[0] === weekdayCodeFromDate(start) &&
    rule.bySetPos[0] === getWeekOfMonth(start)
  ) {
    return "monthly_weekday";
  }

  if (
    rule.frequency === "yearly" &&
    interval === 1 &&
    !rule.byDay?.length &&
    !rule.byMonthDay?.length
  ) {
    return "yearly";
  }

  return "custom";
}

export function recurrenceRuleFromPreset(
  preset: RecurrencePreset,
  start: Date,
  custom?: RecurrenceRule | null,
): RecurrenceRule | undefined {
  if (preset === "none") return undefined;
  if (preset === "custom") return custom ?? undefined;

  switch (preset) {
    case "daily":
      return { frequency: "daily", interval: 1 };
    case "weekdays":
      return {
        frequency: "daily",
        interval: 1,
        byDay: ["MO", "TU", "WE", "TH", "FR"],
      };
    case "weekly":
      return {
        frequency: "weekly",
        interval: 1,
        byDay: [weekdayCodeFromDate(start)],
      };
    case "monthly":
      return {
        frequency: "monthly",
        interval: 1,
        byMonthDay: [getDate(start)],
      };
    case "monthly_weekday":
      return {
        frequency: "monthly",
        interval: 1,
        byDay: [weekdayCodeFromDate(start)],
        bySetPos: [getWeekOfMonth(start)],
      };
    case "yearly":
      return { frequency: "yearly", interval: 1 };
    default:
      return undefined;
  }
}

export function recurrenceLabel(
  rule: RecurrenceRule | undefined,
  start: Date,
): string {
  if (!rule) return "Does not repeat";

  const preset = presetFromRecurrenceRule(rule, start);
  const weekday = format(start, "EEEE");

  switch (preset) {
    case "daily":
      return rule.interval > 1
        ? `Every ${rule.interval} days`
        : "Daily";
    case "weekdays":
      return "Every weekday (Monday to Friday)";
    case "weekly":
      return rule.interval > 1
        ? `Every ${rule.interval} weeks on ${weekday}`
        : `Weekly on ${weekday}`;
    case "monthly":
      return rule.interval > 1
        ? `Every ${rule.interval} months on day ${getDate(start)}`
        : `Monthly on day ${getDate(start)}`;
    case "monthly_weekday": {
      const nth = getWeekOfMonth(start);
      const ordinals = ["", "first", "second", "third", "fourth", "fifth"];
      return rule.interval > 1
        ? `Every ${rule.interval} months on the ${ordinals[nth] ?? nth} ${weekday}`
        : `Monthly on the ${ordinals[nth] ?? nth} ${weekday}`;
    }
    case "yearly":
      return rule.interval > 1
        ? `Every ${rule.interval} years on ${format(start, "MMMM d")}`
        : `Annually on ${format(start, "MMMM d")}`;
    default:
      return describeCustomRecurrence(rule);
  }
}

function describeCustomRecurrence(rule: RecurrenceRule): string {
  const freq =
    rule.frequency.charAt(0).toUpperCase() + rule.frequency.slice(1);
  const every =
    rule.interval > 1 ? `Every ${rule.interval} ${rule.frequency}` : freq;
  const end = rule.count
    ? `, ${rule.count} times`
    : rule.until
      ? `, until ${format(new Date(rule.until), "MMM d, yyyy")}`
      : "";
  return `${every}${end}`;
}

export function parseGoogleRecurrence(
  recurrence: string[] | undefined,
): RecurrenceRule | undefined {
  const rruleLine = recurrence?.find((line) => line.startsWith("RRULE:"));
  if (!rruleLine) return undefined;

  const rruleBody = rruleLine.replace(/^RRULE:/, "");
  return parseRRuleString(rruleBody);
}

export function parseRRuleString(rruleBody: string): RecurrenceRule | undefined {
  let frequency: RecurrenceRule["frequency"] = "daily";
  if (rruleBody.includes("FREQ=WEEKLY")) frequency = "weekly";
  if (rruleBody.includes("FREQ=MONTHLY")) frequency = "monthly";
  if (rruleBody.includes("FREQ=YEARLY")) frequency = "yearly";

  const intervalMatch = rruleBody.match(/INTERVAL=(\d+)/);
  const interval = intervalMatch ? Number.parseInt(intervalMatch[1], 10) : 1;

  const countMatch = rruleBody.match(/COUNT=(\d+)/);
  const count = countMatch ? Number.parseInt(countMatch[1], 10) : undefined;

  const untilMatch = rruleBody.match(/UNTIL=([^;]+)/);
  const until = untilMatch
    ? new Date(
        untilMatch[1].replace(
          /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
          "$1-$2-$3T$4:$5:$6Z",
        ),
      ).toISOString()
    : undefined;

  const byDayMatch = rruleBody.match(/BYDAY=([^;]+)/);
  const byDay = byDayMatch ? byDayMatch[1].split(",") : undefined;

  const byMonthDayMatch = rruleBody.match(/BYMONTHDAY=([^;]+)/);
  const byMonthDay = byMonthDayMatch
    ? byMonthDayMatch[1].split(",").map(Number)
    : undefined;

  const byMonthMatch = rruleBody.match(/BYMONTH=([^;]+)/);
  const byMonth = byMonthMatch
    ? byMonthMatch[1].split(",").map(Number)
    : undefined;

  const bySetPosMatch = rruleBody.match(/BYSETPOS=([^;]+)/);
  const bySetPos = bySetPosMatch
    ? bySetPosMatch[1].split(",").map(Number)
    : undefined;

  return {
    frequency,
    interval,
    count,
    until,
    byDay,
    byMonthDay,
    byMonth,
    bySetPos,
  };
}

export function recurrenceRuleToRRuleOptions(
  rule: RecurrenceRule,
  eventStart: Date,
): RRule.Options {
  const options: RRule.Options = {
    freq: {
      daily: RRule.DAILY,
      weekly: RRule.WEEKLY,
      monthly: RRule.MONTHLY,
      yearly: RRule.YEARLY,
    }[rule.frequency],
    interval: rule.interval,
    dtstart: eventStart,
  };

  if (rule.count) options.count = rule.count;
  if (rule.until) options.until = new Date(rule.until);

  if (rule.byDay) {
    const dayMap: Record<string, typeof RRule.MO> = {
      MO: RRule.MO,
      TU: RRule.TU,
      WE: RRule.WE,
      TH: RRule.TH,
      FR: RRule.FR,
      SA: RRule.SA,
      SU: RRule.SU,
    };
    options.byweekday = rule.byDay.map((day) => dayMap[day]);
  }

  if (rule.byMonthDay) options.bymonthday = rule.byMonthDay;
  if (rule.byMonth) options.bymonth = rule.byMonth;
  if (rule.bySetPos) options.bysetpos = rule.bySetPos;

  return options;
}

/** Google Calendar API recurrence entry, e.g. RRULE:FREQ=WEEKLY;BYDAY=MO */
export function recurrenceRuleToGoogleRRule(
  rule: RecurrenceRule,
  eventStart: Date,
): string {
  const options = recurrenceRuleToRRuleOptions(rule, eventStart);
  const rrule = new RRule(options);
  return `RRULE:${rrule.toString().replace(/^RRULE:/, "")}`;
}

export function isRecurringEvent(event: {
  recurrence?: RecurrenceRule;
  isRecurring?: boolean;
  isRecurringInstance?: boolean;
  originalEventId?: string;
}): boolean {
  return Boolean(
    event.recurrence ||
      event.isRecurring ||
      event.isRecurringInstance ||
      event.originalEventId,
  );
}

export function masterEventId(event: {
  id: string;
  originalEventId?: string;
}): string {
  return event.originalEventId ?? event.id;
}
