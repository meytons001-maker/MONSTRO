import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { MonstroTask } from "@monstro/contracts";

export interface MissionWorkspaceReadiness {
  ready: boolean;
  reason: string;
}

const REQUIRED_RUN_ARTIFACTS = ["preview.mjs"] as const;

function isInside(parent: string, child: string) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

export async function checkMissionWorkspaceForRun(task: MonstroTask): Promise<MissionWorkspaceReadiness> {
  const workspace = resolve(task.context.rootDir, task.context.projectId);
  let realWorkspace: string;
  try {
    realWorkspace = await realpath(workspace);
  } catch {
    return { ready: false, reason: `Workspace is unavailable for mission ${task.id}.` };
  }

  for (const artifact of REQUIRED_RUN_ARTIFACTS) {
    const expected = resolve(workspace, artifact);
    let realArtifact: string;
    try {
      const stats = await lstat(expected);
      if (!stats.isFile()) return { ready: false, reason: `Required run artifact ${artifact} is not a regular file.` };
      realArtifact = await realpath(expected);
    } catch {
      return { ready: false, reason: `Required run artifact ${artifact} is missing.` };
    }
    if (!isInside(realWorkspace, realArtifact)) {
      return { ready: false, reason: `Required run artifact ${artifact} resolves outside the mission workspace.` };
    }
  }

  return { ready: true, reason: "Required run artifacts are present inside the mission workspace." };
}
