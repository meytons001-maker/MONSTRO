import type { MissionTransportEvent } from "@monstro/contracts";
import { missionPipeline, type MissionExecutionState, type MissionPipelinePhase } from "./mission-console-view";
import { deriveMissionPhaseEvidence, type MissionPhaseEvidence } from "./mission-phase-evidence";

export type MissionReplaySnapshot = {
  taskId: string | null;
  eventCount: number;
  lastEvent: MissionTransportEvent | null;
  executionState: MissionExecutionState;
  activePhase?: MissionPipelinePhase;
  previewUrl?: string;
  progress?: NonNullable<MissionTransportEvent["data"]>["progress"];
  evidence: MissionPhaseEvidence[];
};

function executionState(lastEvent: MissionTransportEvent | undefined): MissionExecutionState {
  if (!lastEvent) return "idle";
  if (lastEvent.type === "mission.completed") return "completed";
  if (lastEvent.type === "mission.failed" || lastEvent.phase === "failed") return "failed";
  return "running";
}

export function replayMissionSnapshot(events: MissionTransportEvent[]): MissionReplaySnapshot {
  const lastEvent = events.at(-1);
  const activePhase = lastEvent && missionPipeline.includes(lastEvent.phase as MissionPipelinePhase)
    ? lastEvent.phase as MissionPipelinePhase
    : undefined;
  const previewUrl = [...events].reverse().find((event) => event.data?.previewUrl)?.data?.previewUrl;
  const progress = [...events].reverse().find((event) => event.type === "trace.updated" && event.data?.progress)?.data?.progress;

  return {
    taskId: lastEvent?.taskId ?? events[0]?.taskId ?? null,
    eventCount: events.length,
    lastEvent: lastEvent ?? null,
    executionState: executionState(lastEvent),
    activePhase,
    previewUrl,
    progress,
    evidence: deriveMissionPhaseEvidence(events),
  };
}
