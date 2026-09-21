import type { MissionTransportEvent } from "@monstro/contracts";
import type { MissionDetail } from "./mission-detail";
import { formatMissionResumeAction } from "./mission-detail";
import { deriveMissionFeed, type MissionFeedItem } from "./mission-feed";
import type { MissionHistoryItem } from "./mission-history";
import type { MissionExecutionState, MissionPipelinePhase } from "./mission-pipeline";
import { deriveMissionPipelineView, type MissionPipelineItem } from "./mission-pipeline-view";
import type { MissionPhaseEvidence } from "./mission-phase-evidence";
import { replayMissionSnapshot, type MissionReplaySnapshot } from "./mission-replay-snapshot";
import { deriveMissionTraceSummary, type MissionTraceSummary } from "./mission-trace-summary";

export type { MissionExecutionState, MissionPipelinePhase } from "./mission-pipeline";

export type MissionConsoleView = {
  activePhase?: MissionPipelinePhase;
  executionState: MissionExecutionState;
  pipeline: MissionPipelineItem[];
  previewUrl?: string;
  evidence: MissionPhaseEvidence[];
  feed: MissionFeedItem[];
  trace?: MissionTraceSummary;
  selectedMission?: MissionHistoryItem;
  resumeLabel: string;
  resumeReason?: string;
  canResume: boolean;
};

function currentSnapshot(events: readonly MissionTransportEvent[], detail: MissionDetail | null): MissionReplaySnapshot {
  const latest = events.at(-1);
  const persisted = detail?.snapshot;
  if (persisted
    && persisted.eventCount === events.length
    && persisted.lastEvent?.id === latest?.id) return persisted;
  return replayMissionSnapshot(events);
}

export function deriveMissionConsoleView(input: {
  events: MissionTransportEvent[];
  history: MissionHistoryItem[];
  restoreId: string;
  missionDetail: MissionDetail | null;
}): MissionConsoleView {
  const snapshot = currentSnapshot(input.events, input.missionDetail);
  const selectedMission = input.history.find((mission) => mission.taskId === input.restoreId);
  const selectedResume = input.missionDetail?.taskId === input.restoreId ? input.missionDetail.effectiveResume : undefined;
  const resumeLabel = selectedResume ? formatMissionResumeAction(selectedResume) : selectedMission ? formatMissionResumeAction(selectedMission) : "READ ONLY";

  return {
    activePhase: snapshot.activePhase,
    executionState: snapshot.executionState,
    pipeline: deriveMissionPipelineView(snapshot.activePhase, snapshot.executionState),
    previewUrl: snapshot.previewUrl,
    evidence: snapshot.evidence,
    feed: deriveMissionFeed(input.events),
    trace: deriveMissionTraceSummary(snapshot.progress),
    selectedMission,
    resumeLabel,
    resumeReason: selectedResume?.reason ?? selectedMission?.resumeReason,
    canResume: selectedResume?.resumable ?? selectedMission?.resumable ?? false,
  };
}
