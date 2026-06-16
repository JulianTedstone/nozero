"use client";

import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type CollapsibleSidebarSectionProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

export function CollapsibleSidebarSection({
  title,
  children,
  defaultOpen = false,
  onOpenChange,
  className,
}: CollapsibleSidebarSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      onOpenChange?.(next);
      return next;
    });
  };

  return (
    <section className={cn("border-white/[0.06] border-t pt-3", className)}>
      <button
        className="mb-2 flex w-full items-center gap-2 text-left"
        onClick={toggle}
        type="button"
      >
        <span className="h-px min-w-0 flex-1 bg-white/[0.08]" />
        <span className="shrink-0 font-medium text-[9px] text-white/35 uppercase tracking-wider">
          {title}
        </span>
        {open ? (
          <ChevronDownIcon className="h-3 w-3 shrink-0 text-white/30" />
        ) : (
          <ChevronRightIcon className="h-3 w-3 shrink-0 text-white/30" />
        )}
        <span className="h-px min-w-0 flex-1 bg-white/[0.08]" />
      </button>
      {open ? children : null}
    </section>
  );
}
