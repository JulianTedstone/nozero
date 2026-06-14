import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function capitalizeWord(value: string): string {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

/** e.g. julian.tedstone@coherence.digital → "Julian, Coherence" */
export function friendlyAccountName(
  email: string,
  label?: string | null,
): string {
  const trimmedLabel = label?.trim();
  if (trimmedLabel) return trimmedLabel;

  const trimmed = email.trim()
  const at = trimmed.indexOf("@")
  if (at <= 0) return trimmed

  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1).toLowerCase()
  const localParts = local.split(/[._-]+/).filter(Boolean)
  const person = capitalizeWord(localParts[0] ?? local)

  const domainParts = domain.split(".").filter(Boolean)
  if (domainParts.length === 0) return person

  const registrySecondLevel = new Set(["co", "com", "org", "net", "gov", "edu", "ac"])
  let orgPart = domainParts[domainParts.length - 2] ?? domainParts[0]
  if (
    domainParts.length >= 3 &&
    registrySecondLevel.has(domainParts[domainParts.length - 2] ?? "")
  ) {
    orgPart = domainParts[domainParts.length - 3] ?? orgPart
  }

  return `${person}, ${capitalizeWord(orgPart)}`
}

/** Parse #rgb / #rrggbb to rgba() for tinted event backgrounds. */
export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.trim().replace("#", "");
  if (normalized.length === 3) {
    const r = Number.parseInt(normalized[0] + normalized[0], 16);
    const g = Number.parseInt(normalized[1] + normalized[1], 16);
    const b = Number.parseInt(normalized[2] + normalized[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (normalized.length === 6) {
    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(59, 130, 246, ${alpha})`;
}
