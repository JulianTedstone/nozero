"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "#4285F4",
  "#EA4335",
  "#34A853",
  "#FBBC05",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
];

export function nameToAvatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function getAvatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

type UserIdentityAvatarProps = {
  name: string;
  image?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

/** Shared profile avatar: image with fallback to deterministic color + initials. */
export function UserIdentityAvatar({
  name,
  image,
  size = "sm",
  className,
}: UserIdentityAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const dim =
    size === "lg" ? "h-10 w-10" : size === "md" ? "h-9 w-9" : "h-8 w-8";
  const round = size === "lg" ? "rounded-xl" : "rounded-full";
  const textSz =
    size === "lg" ? "text-sm" : size === "md" ? "text-xs" : "text-xs";
  const color = nameToAvatarColor(name || "U");
  const initials = getAvatarInitials(name || "?");

  if (image && !imgFailed) {
    return (
      <div
        className={cn(
          dim,
          "flex-shrink-0 overflow-hidden",
          round,
          "ring-2 ring-line",
          className,
        )}
      >
        <img
          alt={name}
          className="h-full w-full object-cover"
          src={image}
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        dim,
        "flex flex-shrink-0 items-center justify-center font-bold text-white ring-2 ring-line",
        round,
        textSz,
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  );
}
