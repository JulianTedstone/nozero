"use client";

import { LayersIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContextIconProps {
  className?: string;
}

/** Universal Context (Layers) icon — sidebar tab, HUD, panel headers. */
export function ContextIcon({ className }: ContextIconProps) {
  return <LayersIcon className={cn("h-4 w-4", className)} aria-hidden />;
}
