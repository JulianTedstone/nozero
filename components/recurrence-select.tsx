"use client";

import { format, getDate, getWeekOfMonth } from "date-fns";
import { RepeatIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-time-picker";
import {
  type RecurrencePreset,
  recurrenceRuleFromPreset,
  recurrenceLabel,
} from "@/lib/recurrence";
import type { RecurrenceRule } from "@/types/calendar";

interface RecurrenceSelectProps {
  startDate: string;
  value: RecurrencePreset;
  customRule: RecurrenceRule | null;
  onPresetChange: (preset: RecurrencePreset) => void;
  onCustomRuleChange: (rule: RecurrenceRule | null) => void;
  triggerClassName?: string;
  disabled?: boolean;
}

export function RecurrenceSelect({
  startDate,
  value,
  customRule,
  onPresetChange,
  onCustomRuleChange,
  triggerClassName,
  disabled = false,
}: RecurrenceSelectProps) {
  const start = startDate ? new Date(`${startDate}T12:00:00`) : new Date();
  const weekday = format(start, "EEEE");
  const monthDay = getDate(start);
  const weekOfMonth = getWeekOfMonth(start);
  const ordinals = ["", "first", "second", "third", "fourth", "fifth"];

  const activeRule = recurrenceRuleFromPreset(value, start, customRule);
  const displayLabel =
    value === "none"
      ? "Does not repeat"
      : recurrenceLabel(activeRule, start);

  return (
    <div className="space-y-2">
      <Select
        disabled={disabled}
        onValueChange={(next) => onPresetChange(next as RecurrencePreset)}
        value={value}
      >
        <SelectTrigger className={triggerClassName}>
          <div className="flex min-w-0 items-center gap-2">
            <RepeatIcon className="size-4 shrink-0 text-white/30" />
            <SelectValue placeholder="Does not repeat">{displayLabel}</SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Does not repeat</SelectItem>
          <SelectItem value="daily">Daily</SelectItem>
          <SelectItem value="weekdays">
            Every weekday (Monday to Friday)
          </SelectItem>
          <SelectItem value="weekly">Weekly on {weekday}</SelectItem>
          <SelectItem value="monthly">Monthly on day {monthDay}</SelectItem>
          <SelectItem value="monthly_weekday">
            Monthly on the {ordinals[weekOfMonth] ?? weekOfMonth} {weekday}
          </SelectItem>
          <SelectItem value="yearly">
            Annually on {format(start, "MMMM d")}
          </SelectItem>
          <SelectItem value="custom">Custom...</SelectItem>
        </SelectContent>
      </Select>

      {value === "custom" && (
        <div className="liquid-glass-input space-y-2 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-white/40 text-xs">Every</span>
            <Input
              className="h-8 w-16 border-white/10 bg-white/5 text-xs"
              min={1}
              onChange={(e) => {
                const interval = Math.max(
                  1,
                  Number.parseInt(e.target.value, 10) || 1,
                );
                onCustomRuleChange({
                  ...(customRule ?? { frequency: "weekly", interval: 1 }),
                  interval,
                });
              }}
              type="number"
              value={customRule?.interval ?? 1}
            />
            <Select
              onValueChange={(freq) => {
                onCustomRuleChange({
                  ...(customRule ?? { interval: 1 }),
                  frequency: freq as RecurrenceRule["frequency"],
                });
              }}
              value={customRule?.frequency ?? "weekly"}
            >
              <SelectTrigger className="h-8 flex-1 border-white/10 bg-white/5 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">day(s)</SelectItem>
                <SelectItem value="weekly">week(s)</SelectItem>
                <SelectItem value="monthly">month(s)</SelectItem>
                <SelectItem value="yearly">year(s)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              onValueChange={(endType) => {
                const base = customRule ?? { frequency: "weekly", interval: 1 };
                if (endType === "never") {
                  onCustomRuleChange({
                    ...base,
                    count: undefined,
                    until: undefined,
                  });
                } else if (endType === "count") {
                  onCustomRuleChange({
                    ...base,
                    until: undefined,
                    count: base.count ?? 10,
                  });
                } else {
                  onCustomRuleChange({
                    ...base,
                    count: undefined,
                    until: base.until ?? new Date().toISOString(),
                  });
                }
              }}
              value={
                customRule?.count
                  ? "count"
                  : customRule?.until
                    ? "until"
                    : "never"
              }
            >
              <SelectTrigger className="h-8 flex-1 border-white/10 bg-white/5 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Does not end</SelectItem>
                <SelectItem value="count">After</SelectItem>
                <SelectItem value="until">On date</SelectItem>
              </SelectContent>
            </Select>
            {customRule?.count !== undefined && (
              <>
                <Input
                  className="h-8 w-16 border-white/10 bg-white/5 text-xs"
                  min={1}
                  onChange={(e) => {
                    onCustomRuleChange({
                      ...(customRule ?? { frequency: "weekly", interval: 1 }),
                      count: Math.max(
                        1,
                        Number.parseInt(e.target.value, 10) || 1,
                      ),
                      until: undefined,
                    });
                  }}
                  type="number"
                  value={customRule.count}
                />
                <span className="text-white/40 text-xs">occurrences</span>
              </>
            )}
            {customRule?.until !== undefined && (
              <DatePicker
                onChange={(date) => {
                  onCustomRuleChange({
                    ...(customRule ?? { frequency: "weekly", interval: 1 }),
                    until: date
                      ? new Date(`${date}T23:59:59`).toISOString()
                      : undefined,
                    count: undefined,
                  });
                }}
                placeholder="End date"
                triggerClassName="h-8 flex-1 border-white/10 bg-white/5 text-xs"
                value={
                  customRule.until
                    ? format(new Date(customRule.until), "yyyy-MM-dd")
                    : ""
                }
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
