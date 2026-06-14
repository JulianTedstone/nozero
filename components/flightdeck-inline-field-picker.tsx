"use client";

import { cn } from "@/lib/utils";

export function InlineFieldPicker({
  ariaLabel,
  className,
  disabled,
  emptyLabel = "—",
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  options: string[];
  value: string | null;
  emptyLabel?: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  className?: string;
}) {
  const label = value?.trim() || emptyLabel;
  const selectOptions = [
    ...new Set([
      ...options,
      ...(value && !options.includes(value) ? [value] : []),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  if (disabled) {
    return (
      <span className={cn("text-[10px] text-white/25", className)}>
        {label}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "group relative inline-flex min-h-[1.25rem] min-w-[3.5rem] max-w-full",
        className
      )}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <span className="pointer-events-none truncate text-[10px] text-white/25 transition-opacity group-hover:opacity-0">
        {label}
      </span>
      <select
        aria-label={ariaLabel}
        className="absolute inset-0 cursor-pointer rounded border border-white/[0.12] bg-[#141416] px-1 text-[10px] text-white/70 opacity-0 outline-none transition-opacity focus:opacity-100 group-hover:opacity-100"
        onChange={(event) => {
          if (event.target.value) {
            onChange(event.target.value);
          }
        }}
        value={value ?? ""}
      >
        {value ? null : (
          <option disabled value="">
            {emptyLabel}
          </option>
        )}
        {selectOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
