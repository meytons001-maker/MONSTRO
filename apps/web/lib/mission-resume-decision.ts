import type { MonstroTask } from "@monstro/contracts";
import { checkMissionWorkspaceForRun } from "./mission-workspace";

export interface MissionResumeCandidate {
  resumable: boolean;
  restartPhase: string | null;
  reason: string;
  task: MonstroTask | null;
}

export interface EffectiveMissionResumeDecision extends MissionResumeCandidate {
  degraded: boolean;
}

export async function resolveEffectiveMissionResume(candidate: MissionResumeCandidate): Promise<EffectiveMissionResumeDecision> {
  if (!candidate.resumable || !candidate.task || candidate.restartPhase !== "run") {
    return { ...candidate, degraded: false };
  }

  const workspace = await checkMissionWorkspaceForRun(candidate.task);
  if (workspace.ready) return { ...candidate, degraded: false };

  return {
    ...candidate,
    restartPhase: "inspect",
    reason: `Workspace cannot continue from run; rebuilding conservatively from inspect. ${workspace.reason}`,
    degraded: true,
  };
}
