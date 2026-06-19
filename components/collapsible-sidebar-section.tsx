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
    <section className={cn(className)}>
      <button
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-ink-muted hover:bg-accent"
        onClick={toggle}
        type="button"
      >
        {open ? (
          <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
        ) : (
          <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
        )}
        <span className="font-semibold text-[10px] text-ink-subtle uppercase tracking-wider">
          {title}
        </span>
      </button>
      {open ? <div className="px-2 pb-1.5">{children}</div> : null}
    </section>
  );
}
