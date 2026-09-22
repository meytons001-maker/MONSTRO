import type { MissionTransportEvent } from "@monstro/contracts";
import type { MissionReplaySnapshot } from "./mission-replay-snapshot";

export type MissionResumeView = {
  resumable: boolean;
  restartPhase: string | null;
  reason: string;
  degraded: boolean;
};

export type MissionResumePresentation = Pick<MissionResumeView, "resumable" | "restartPhase"> & {
  degraded?: boolean;
};

export type MissionDetail = {
  taskId: string;
  events: MissionTransportEvent[];
  snapshot: MissionReplaySnapshot;
  effectiveResume: MissionResumeView;
};

export function toMissionResumeView(decision: MissionResumeView): MissionResumeView {
  return { resumable: decision.resumable, restartPhase: decision.restartPhase, reason: decision.reason, degraded: decision.degraded };
}

export function formatMissionResumeAction(resume: MissionResumePresentation | undefined): string {
  if (!resume?.resumable) return "READ ONLY";
  const restartPhase = resume.restartPhase?.toUpperCase();
  if (resume.degraded || resume.restartPhase === "inspect") return `REBUILD FROM ${restartPhase ?? "INSPECT"}`;
  return `RESUME ${restartPhase ?? "SAFE"}`;
}

function isMissionReplaySnapshot(value: unknown, taskId: string, eventCount: number): value is MissionReplaySnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<MissionReplaySnapshot>;
  return snapshot.taskId === taskId
    && snapshot.eventCount === eventCount
    && ["idle", "running", "completed", "failed"].includes(snapshot.executionState ?? "")
    && Array.isArray(snapshot.evidence);
}

export function parseMissionDetailPayload(payload: unknown): MissionDetail {
  if (!payload || typeof payload !== "object") throw new Error("Mission detail response is invalid");
  const candidate = payload as Partial<MissionDetail>;
  const resume = candidate.effectiveResume as Partial<MissionResumeView> | undefined;
  if (typeof candidate.taskId !== "string" || candidate.taskId.length === 0
    || !Array.isArray(candidate.events)
    || !isMissionReplaySnapshot(candidate.snapshot, candidate.taskId, candidate.events.length)
    || !resume
    || typeof resume.resumable !== "boolean"
    || (resume.restartPhase !== null && typeof resume.restartPhase !== "string")
    || typeof resume.reason !== "string"
    || typeof resume.degraded !== "boolean") throw new Error("Mission detail response is invalid");
  return candidate as MissionDetail;
}
