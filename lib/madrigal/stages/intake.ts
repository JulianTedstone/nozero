import "server-only";

import {
  buildCompanyStub,
  buildRoleStub,
  companyDir,
  roleDir,
  upsertContextFile,
} from "@/lib/madrigal/context-writer";
import { setState, upsertIdMap } from "@/lib/madrigal/id-map";

export interface IntakeInput {
  applicationUrl: string;
  companySlug: string;
  jdUrl: string;
  roleSlug: string;
  roleUid: string;
  title: string;
}

/**
 * Intake: register the role in the id-map, write the initial context stubs
 * (company + role), and advance to `researching`. Idempotent on role_uid.
 *
 * Board sync (move the Flightdeck ticket to `researching`) is deferred — it runs
 * through the Tower gateway, wired in a later increment.
 */
export async function runIntake(
  input: IntakeInput
): Promise<{ roleUid: string }> {
  const rDir = roleDir(input.roleSlug, input.companySlug);
  const cDir = companyDir(input.companySlug);

  await upsertIdMap({
    roleUid: input.roleUid,
    title: input.title,
    companySlug: input.companySlug,
    contextPath: rDir,
    companyPath: cDir,
    meta: { applicationUrl: input.applicationUrl, jdUrl: input.jdUrl },
  });

  await upsertContextFile(
    `${cDir}/company.md`,
    buildCompanyStub(input.companySlug),
    `madrigal: intake company stub ${input.companySlug}`
  );
  await upsertContextFile(
    `${rDir}/role.md`,
    buildRoleStub({
      roleUid: input.roleUid,
      title: input.title,
      companySlug: input.companySlug,
      applicationUrl: input.applicationUrl,
      jdUrl: input.jdUrl,
    }),
    `madrigal: intake role ${input.roleUid}`
  );

  await setState(input.roleUid, "researching", "nozero", "to-do");
  return { roleUid: input.roleUid };
}
