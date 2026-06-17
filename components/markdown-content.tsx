"use client";

import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

export function MarkdownContent({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const text = children.trim();
  if (!text) {
    return null;
  }

  return (
    <Streamdown
      mode="static"
      className={cn(
        "max-w-none text-[11px] leading-relaxed",
        "[&_[data-streamdown='link']]:text-active",
        "[&_code]:rounded [&_code]:bg-accent [&_code]:px-1 [&_code]:text-ink",
        "[&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:font-semibold [&_h1]:text-[12px] [&_h1]:text-ink",
        "[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:font-semibold [&_h2]:text-[11px] [&_h2]:text-ink-muted",
        "[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:font-medium [&_h3]:text-[11px] [&_h3]:text-ink-muted",
        "[&_li]:text-ink-muted [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-4",
        "[&_p]:text-ink-muted [&_strong]:font-semibold [&_strong]:text-ink-muted",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4",
        className,
      )}
    >
      {text}
    </Streamdown>
  );
}
