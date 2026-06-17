"use client";

import { ChevronDownIcon, LockIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface EventDetailSectionProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  label: string;
  locked?: boolean;
  lockTooltip?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function EventDetailSection({
  label,
  children,
  defaultOpen = true,
  open,
  onOpenChange,
  locked = false,
  lockTooltip,
}: EventDetailSectionProps) {
  return (
    <Collapsible
      className="overflow-hidden rounded-xl border border-line bg-surface-sunk"
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      open={open}
    >
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-sunk",
        )}
        type="button"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          {label}
        </span>
        {locked && lockTooltip ? (
          <Tooltip>
            <TooltipTrigger
              className="inline-flex"
              onClick={(event) => event.stopPropagation()}
              render={
                <span className="inline-flex">
                  <LockIcon className="size-3 text-ink-subtle" />
                </span>
              }
            />
            <TooltipContent>{lockTooltip}</TooltipContent>
          </Tooltip>
        ) : null}
        <ChevronDownIcon className="ml-auto size-3.5 text-ink-subtle transition-transform in-data-[panel-open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 border-t border-line px-3 py-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
