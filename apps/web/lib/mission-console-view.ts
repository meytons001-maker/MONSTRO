import type { MissionTransportEvent } from "@monstro/contracts";
import type { MissionDetail } from "./mission-detail";
import { deriveMissionFeed, type MissionFeedItem } from "./mission-feed";
import type { MissionHistoryItem } from "./mission-history";
import { deriveMissionOperationalView, type MissionOperationalView } from "./mission-operational-view";
import { deriveMissionPipelineView, type MissionPipelineItem } from "./mission-pipeline-view";
import type { MissionPhaseEvidence } from "./mission-phase-evidence";
import { deriveMissionPreviewView, type MissionPreviewView } from "./mission-preview-view";
import { replayMissionSnapshot, type MissionReplaySnapshot } from "./mission-replay-snapshot";
import { deriveMissionResumeView, type MissionResumeState } from "./mission-resume-view";
import { deriveMissionTraceSummary, type MissionTraceSummary } from "./mission-trace-summary";

export type MissionConsoleView = {
  operational: MissionOperationalView;
  pipeline: MissionPipelineItem[];
  preview: MissionPreviewView;
  resume: MissionResumeState;
  evidence: MissionPhaseEvidence[];
  feed: MissionFeedItem[];
  trace?: MissionTraceSummary;
  selectedMission?: MissionHistoryItem;
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
  const resumeSource = selectedResume ?? (selectedMission ? {
    resumable: selectedMission.resumable,
    restartPhase: selectedMission.restartPhase,
    reason: selectedMission.resumeReason,
  } : undefined);

  return {
    operational: deriveMissionOperationalView(snapshot.activePhase, snapshot.executionState),
    pipeline: deriveMissionPipelineView(snapshot.activePhase, snapshot.executionState),
    preview: deriveMissionPreviewView(snapshot.previewUrl),
    resume: deriveMissionResumeView(resumeSource),
    evidence: snapshot.evidence,
    feed: deriveMissionFeed(input.events),
    trace: deriveMissionTraceSummary(snapshot.progress),
    selectedMission,
  };
}
