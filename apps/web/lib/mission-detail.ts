import type { MissionTransportEvent } from "@monstro/contracts";

export type MissionResumeView = {
  resumable: boolean;
  restartPhase: string | null;
  reason: string;
  degraded: boolean;
};

export type MissionDetail = {
  taskId: string;
  events: MissionTransportEvent[];
  effectiveResume: MissionResumeView;
};

export function toMissionResumeView(decision: MissionResumeView): MissionResumeView {
  return {
    resumable: decision.resumable,
    restartPhase: decision.restartPhase,
    reason: decision.reason,
    degraded: decision.degraded,
  };
}

export function parseMissionDetailPayload(payload: unknown): MissionDetail {
  if (!payload || typeof payload !== "object") throw new Error("Mission detail response is invalid");
  const candidate = payload as Partial<MissionDetail>;
  const resume = candidate.effectiveResume as Partial<MissionResumeView> | undefined;
  if (typeof candidate.taskId !== "string" || candidate.taskId.length === 0
    || !Array.isArray(candidate.events)
    || !resume
    || typeof resume.resumable !== "boolean"
    || (resume.restartPhase !== null && typeof resume.restartPhase !== "string")
    || typeof resume.reason !== "string"
    || typeof resume.degraded !== "boolean") {
    throw new Error("Mission detail response is invalid");
  }
  return candidate as MissionDetail;
}
