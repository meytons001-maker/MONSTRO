import { join } from "node:path";
import { FileMissionJournalStore, MissionJournal, planMissionResume } from "@monstro/core";
import { resolveEffectiveMissionResume } from "./mission-resume-decision";
import { replayMissionSnapshot } from "./mission-replay-snapshot";

const DEFAULT_DIRECTORY = join(process.cwd(), ".monstro", "missions");

export function createMissionJournalStore() {
  return new FileMissionJournalStore({
    directory: process.env.MONSTRO_MISSION_JOURNAL_DIR?.trim() || DEFAULT_DIRECTORY,
  });
}

export async function loadPersistedMission(taskId: string) {
  const store = createMissionJournalStore();
  const journal = await MissionJournal.replay(taskId, store);
  const events = journal.snapshot();
  const snapshot = replayMissionSnapshot(events);
  const resume = planMissionResume(events);
  return {
    taskId,
    events,
    snapshot,
    progress: snapshot.progress,
    resume: {
      resumable: resume.resumable,
      restartPhase: resume.restartPhase ?? null,
      reason: resume.reason,
      task: resume.task ?? null,
    },
    lastEvent: snapshot.lastEvent,
  };
}

export async function listPersistedMissions() {
  const store = createMissionJournalStore();
  const taskIds = await store.listTaskIds();
  const missions = await Promise.all(taskIds.map(async (taskId) => {
    const mission = await loadPersistedMission(taskId);
    const firstEvent = mission.events[0] ?? null;
    const resume = await resolveEffectiveMissionResume(mission.resume);

    return {
      taskId,
      phase: mission.snapshot.activePhase ?? firstEvent?.phase ?? null,
      status: mission.lastEvent?.type ?? null,
      executionState: mission.snapshot.executionState,
      updatedAt: mission.lastEvent?.timestamp ?? firstEvent?.timestamp ?? null,
      eventCount: mission.snapshot.eventCount,
      progress: mission.snapshot.progress,
      resumable: resume.resumable,
      restartPhase: resume.restartPhase,
      resumeReason: resume.reason,
    };
  }));

  return missions.sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
}
