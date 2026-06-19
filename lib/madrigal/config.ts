import "server-only";

import { getRepoFile } from "@/lib/github-content";

const CONFIG_REPO = "juliantedstone/context-message-madrigal";

export interface MadrigalConfig {
  followUp: { cadenceDays: number[] };
  gate: { threshold: number };
  identity: {
    applyingEmail: string;
    calendarAccount: string;
    galleryOwner: string;
    galleryCode: string;
  };
  submission: {
    autoSubmit: boolean;
    workerOrder: string[];
    ackMonitorWindowHours: number;
  };
}

/** Safe defaults mirroring config/pipeline.yaml (the authoritative file lives in the repo). */
export const DEFAULT_CONFIG: MadrigalConfig = {
  identity: {
    applyingEmail: "julian@nopilot.co",
    calendarAccount: "julian.nopilot@gmail.com",
    galleryOwner: "julian@nopilot.co",
    galleryCode: "madrigal",
  },
  gate: { threshold: 70 },
  submission: {
    autoSubmit: false,
    workerOrder: ["ats_template", "generic_playwright", "novel_human"],
    ackMonitorWindowHours: 72,
  },
  followUp: { cadenceDays: [3, 7, 14] },
};

/**
 * Load the authoritative pipeline config from the madrigal context repo.
 *
 * STUB: fetches config/pipeline.yaml from GitHub; YAML parsing is TODO — nozero
 * has no YAML dependency yet. Options: add `yaml`, or commit a config/pipeline.json
 * alongside the yaml in the repo. Until then, callers get DEFAULT_CONFIG, and the
 * loader never blocks the pipeline if the repo/link is unreachable.
 */
export async function loadMadrigalConfig(): Promise<MadrigalConfig> {
  try {
    await getRepoFile(CONFIG_REPO, "config/pipeline.yaml"); // presence check
    // TODO: parse YAML and deep-merge over DEFAULT_CONFIG.
  } catch {
    // repo/link unreachable — fall back to defaults (never block the pipeline).
  }
  return DEFAULT_CONFIG;
}
