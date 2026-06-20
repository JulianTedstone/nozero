import "server-only";

import { getRepoFile } from "@/lib/github-content";
import { hermesChat } from "@/lib/hermes-client";
import { loadMadrigalConfig } from "@/lib/madrigal/config";
import { upsertContextFile } from "@/lib/madrigal/context-writer";
import {
  ensureGallery,
  galleryConfigured,
  grantAccess,
} from "@/lib/madrigal/gallery-client";
import { getIdMap, setState, upsertIdMap } from "@/lib/madrigal/id-map";

const MADRIGAL_REPO = "juliantedstone/context-message-madrigal";

export type AdaptOutcome =
  | { published: boolean; status: "done" }
  | { status: "failed" }
  | { reason: string; status: "skipped" };

const COVER_INSTRUCTIONS =
  "You are writing a cover letter for Julian Tedstone, a senior product/technology leader. Using the role, employer research, and fit rationale provided, write a concise, specific, non-generic cover letter (250-350 words) in his voice: direct, warm, British English, no hype. Reference concrete signals from the research. Return markdown only — no preamble.";

const CV_INSTRUCTIONS =
  "You are tailoring Julian Tedstone's CV for a specific role. Using the role, employer research, and fit rationale, produce a tailored CV summary (3-4 sentences) plus 6-8 achievement bullets re-prioritised and reworded for THIS role (outcomes first, quantified where possible). Return markdown only — no preamble.";

async function loadContext(dir: string): Promise<string> {
  const parts: string[] = [];
  for (const file of ["role.md", "research.md", "score.md"]) {
    try {
      parts.push((await getRepoFile(MADRIGAL_REPO, `${dir}/${file}`)).content);
    } catch {
      // Missing input — proceed with what's available (degraded, never blocks).
    }
  }
  return parts.join("\n\n---\n\n");
}

function doc(roleUid: string, kind: string, body: string): string {
  return `---\nrole_uid: ${roleUid}\nkind: ${kind}\n---\n\n${body}\n`;
}

/**
 * Adapt stage — `applying` -> `adapting`. Generates the tailored cover letter +
 * CV content via hermes and writes them to the role's submission dir in the
 * context vault. If docket publishing is enabled (config.docket.publish, OFF by
 * default — dockets are personal, #94) and the gallery is configured, ensures
 * the `madrigal` gallery and grants the owner access.
 *
 * SEAM: rendering the markdown to a branded PDF docket is the design-studio
 * (Quarto+Typst) job — a Claude Code / CLI step, not an HTTP call. Until a
 * "studio runner" fronts it (as hermes fronts research), this stage produces the
 * CONTENT; the PDF render + asset upload land in a later increment.
 */
export async function runAdapt(roleUid: string): Promise<AdaptOutcome> {
  const row = await getIdMap(roleUid);
  if (!row) {
    return { reason: "unknown role", status: "skipped" };
  }
  const dir = row.contextPath ?? "";
  if (!dir) {
    return { reason: "no context path", status: "skipped" };
  }

  const context = await loadContext(dir);
  const coverLetter = await hermesChat({
    instructions: COVER_INSTRUCTIONS,
    message: context || "(no context available)",
  });
  const cvTailoring = await hermesChat({
    instructions: CV_INSTRUCTIONS,
    message: context || "(no context available)",
  });
  if (!(coverLetter && cvTailoring)) {
    return { reason: "hermes unavailable", status: "skipped" };
  }

  await upsertContextFile(
    `${dir}/submission/cover-letter.md`,
    doc(roleUid, "cover-letter", coverLetter),
    `madrigal: adapt cover letter ${roleUid}`
  );
  await upsertContextFile(
    `${dir}/submission/cv-tailoring.md`,
    doc(roleUid, "cv-tailoring", cvTailoring),
    `madrigal: adapt cv tailoring ${roleUid}`
  );

  const config = await loadMadrigalConfig();
  let published = false;
  if (config.docket.publish && galleryConfigured()) {
    const gallery = await ensureGallery({
      hostEmail: config.identity.galleryOwner,
      title: `${row.title ?? roleUid} — ${row.companySlug ?? ""}`.trim(),
    });
    if (gallery.ok && gallery.code) {
      await grantAccess({
        code: gallery.code,
        email: config.identity.galleryOwner,
      });
      await upsertIdMap({ docketGalleryCode: gallery.code, roleUid });
      published = true;
    }
  }

  await setState(roleUid, "adapting", "nozero", "applying", { published });
  return { published, status: "done" };
}
